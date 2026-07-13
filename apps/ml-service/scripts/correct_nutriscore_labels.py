"""Story 12.9 — NutriScore-labelcorrectie: fout-gelabelde referentie-crops.

Achtergrond (Friso's visuele labelcontrole, 2026-07-12,
``_bmad-output/implementation-artifacts/nutriscore-labelverdict-friso-2026-07-12.md``):
van de 42 NUTRISCORE_A-E reference_logos-crops zijn er 18 fout gelabeld voor hun
geregistreerde letter (de marker-heuristiek en het menselijk oog weken op meerdere
plekken af — beide kanten op; het menselijk verdict is grondwaarheid, want
Nutri-Score is een vaste 5-kleurenschaal). Eén crop (A13) staat onder de verkeerde
letter geregistreerd (A) maar is een E-crop — die wordt herlabeld i.p.v.
gedeactiveerd.

Dit is een DATA-FIX (GEEN feature): alleen bestaande ``reference_logos``-records
worden gemuteerd (deactiveren / herlabelen). Geen model-, gate-, harvest- of
vliegwiel-code-pad wordt aangeraakt. De ``reference_embeddings``-koppeling is per
``reference_logo_id`` (``schema.prisma:308-310``) → deactiveren/herlabelen laten de
embedding intact (geen re-embed nodig; A13's bestaande beeld-embedding is een
correcte E-embedding).

Scope (letterlijk uit het verdict-bestand, NIET afleiden — hard in dit script):
  - 18x deactiveren (``active=false``): A1,A2,A3 · B1,B2,B6,B7,B8,B10 ·
    C1,C2,C4,C5,C6 · D2 · E1,E4,E10.
  - 1x herlabelen A13 (``cf18877a-...``): ``t3777_code`` NUTRISCORE_A ->
    NUTRISCORE_E, met ``field_type``/``gs1_field`` consistent gezet
    (``NutritionalScore``/``nutritionalScore`` — patroon
    ``apps/api/src/services/t3777-declarations.ts``).
  - ONGEMOEID: de "marker was fout, plaatje klopt"-crops (A4-A7, B3, B4, D1, E2)
    en de synthetische zaden (A8/B5/C3/D3/E3) — die staan NIET in de actieset
    (``OK_IDS``/``SEED_IDS`` hieronder, alleen voor documentatie/tests; het
    script raakt ze sowieso nooit aan omdat ze niet in ``DEACTIVATE_IDS`` of
    ``RELABEL_ID`` voorkomen).

Idempotent (AC5): elke write leest eerst de huidige waarde (``FOR UPDATE``-lock,
patroon Story 19.13 ``restore_recyclable_refs.py``) — is een ref al gecorrigeerd,
dan wordt de write overgeslagen (geen dubbele actie/fout, tweede ``--apply`` =
zelfde eindstand).

Gold-set-consistentie (Dev Notes / Task 3): een afgekeurde of herlabelde crop kan
een ``gold_set_records``-rij als ECHT bevestigen onder de FOUTE code. De gold-set
is append-only/immutable (AD-13, ``apps/api/.../gold-set.ts``); de enige
toegestane correctie is de **self-tombstone** (patroon ``withdrawGoldSetRecord``:
``UPDATE gold_set_records SET replaced_by_id = id WHERE id = $1 AND
replaced_by_id IS NULL``) — trekt de foute bevestiging in zonder de rij te
overschrijven of te verwijderen. Dit script fabriceert GEEN nieuwe
"menselijke beslissing"-gold-record (dat vergt een echte reviewbron,
``HUMAN_GOLD_SET_SOURCES``) — het trekt uitsluitend de nu-foute bevestiging in.

Dry-run vs ``--verify`` (bewuste tweedeling — code review 2026-07-13): DRY-RUN
(zonder ``--apply``) is een **statische plan-preview** — puur uit de hardcoded
constanten hierboven, ZONDER enige DB-call (geen connectiepool nodig, kan nooit
falen op connectiviteit, structureel niets te muteren). ``--verify`` is de
**live read-only meting** (Task 1 vóór-check + Task 5 ná-check uit de story) en
bevraagt wél de DB. Dit wijkt bewust af van ``restore_recyclable_refs.py``
(waar dry-run zelf de levende dode-refs opzoekt) omdat dat script maar één
homogene query nodig had; hier zijn dat 19 losse id-lookups + een aparte
per-letter-telling, en de scheiding houdt de dry-run-preview 100% DB-vrij en
dus 100% veilig als eerste stap.

Gebruik::

    python -m scripts.correct_nutriscore_labels              # DRY-RUN (geen writes, geen DB)
    python -m scripts.correct_nutriscore_labels --apply       # voer de writes uit
    python -m scripts.correct_nutriscore_labels --verify       # read-only: genuine
                                                                 # tellingen per letter
                                                                 # (vóór EN ná --apply
                                                                 # bruikbaar; sluit elkaar
                                                                 # uit met --apply)

ACC-schrijf alleen met expliciete toestemming Friso, per geval (permission-gate,
zie de story). Raakt uitsluitend deze 19 ids; nooit een andere code/categorie.
"""

import argparse
import asyncio
import sys

# --------------------------------------------------------------------------- #
# De exacte scope — letterlijk overgenomen uit
# nutriscore-labelverdict-friso-2026-07-12.md. NIET afleiden, NIET wijzigen
# zonder een nieuw verdict.
# --------------------------------------------------------------------------- #

#: 18 ids — fout gelabeld voor hun geregistreerde letter -> active=false.
DEACTIVATE_IDS = {
    "A1": "c232a696-bf9a-4b66-84c9-c107faf028b8",
    "A2": "f132dc5c-eee5-4123-aff1-45d40f234f81",
    "A3": "ccb85dbf-8731-4d1e-a204-83a37c0816cb",
    "B1": "e4f1865a-3a30-4b91-9bc0-f81f35aaac9c",
    "B2": "07d1272f-9802-4ae4-ac0f-718aa91e193d",
    "B6": "3c1bcabb-74be-4d8b-a715-d49c97dbae37",
    "B7": "758d29be-58a4-4b98-b75a-c4e1be88ebe3",
    "B8": "77de4770-19ff-4507-ab27-90f573bfc757",
    "B10": "b557b321-73f6-4489-a049-1ed56be3ecfe",
    "C1": "1eb5a753-4f66-4683-a0b1-b75e8f91c952",
    "C2": "bd69e189-854e-450e-a79d-f5d96fbfc5f1",
    "C4": "ceb74937-879d-452f-b37a-e8b4b42be283",
    "C5": "2e155ab8-0544-4466-a547-df2c25a386a5",
    "C6": "4003ea2d-83bc-46d6-b501-504edca8d14b",
    "D2": "f94cb8ab-add7-4997-a2f0-c220f6f7f911",
    "E1": "bfe138fa-0427-4b59-8bed-d46615afa212",
    "E4": "05ad5bfc-b1c5-4780-bfea-992db3b8b426",
    "E10": "ce29c06f-50de-44e5-809f-ef8d4f1e885f",
}
if len(DEACTIVATE_IDS) != 18:  # geen `assert`: die wordt onder `-O` stilzwijgend gestript
    raise ValueError(
        f"scope moet exact 18 deactiveer-ids bevatten, kreeg {len(DEACTIVATE_IDS)}"
    )

#: A13 — mis-gefiled als NUTRISCORE_A, is een E-crop -> herlabelen (blijft active=true).
RELABEL_ID = "cf18877a-5c8d-4331-b98d-49a464243347"
RELABEL_OLD_CODE = "NUTRISCORE_A"
RELABEL_NEW_CODE = "NUTRISCORE_E"
RELABEL_FIELD_TYPE = "NutritionalScore"
RELABEL_GS1_FIELD = "nutritionalScore"

#: "marker was fout, plaatje klopt" — Friso bevestigde dat de registratie klopt.
#: ONGEMOEID. Alleen voor documentatie/tests (geen enkele actie leest dit dict).
OK_IDS = {
    "A4": "21b29118-322c-4df2-895d-730b93dfc84f",
    "A5": "336dc88d-818f-4c97-bfcc-a3c32fe4fec1",
    "A6": "37b86632-61de-4833-a1d8-c1c5f9b6a985",
    "A7": "d7bb6643-6e0d-4dbc-9300-d719473d1ad8",
    "B3": "8d90b6af-546e-42d9-8f9a-79d17a96f613",
    "B4": "d6232e76-24b3-4f78-b3f1-151cb7c9e0c3",
    "D1": "be490465-c784-4cd2-8655-d1091a1aca67",
    "E2": "fbe7d377-3cfb-41b7-b4b8-d3a3f50f87cf",
}

#: Synthetische zaden (geen review-confirmed crop). ONGEMOEID. Documentatie/tests.
SEED_IDS = {
    "A8": "7bdeb9b8-2209-4b04-8657-781680992c81",
    "B5": "8c90082c-a77f-4687-8759-7e82595435e9",
    "C3": "4e80085e-d37f-4d41-9ad6-12c659e02ec5",
    "D3": "11733a34-dec3-4cc5-906c-1190d2da634d",
    "E3": "07b17cd0-2e1a-4487-bbfa-4cb23182e991",
}


def build_action_plan() -> dict:
    """Zuivere selectie-/actielogica (AC6) — geen DB nodig, alleen de hardcoded
    scope hierboven. Retourneert de te-corrigeren ids; ok/zaad-ids staan hier
    NOOIT in (ze zitten niet in de bron-dicts van de actieset)."""
    return {
        "deactivate": dict(DEACTIVATE_IDS),
        "relabel": {
            "id": RELABEL_ID,
            "old_code": RELABEL_OLD_CODE,
            "new_code": RELABEL_NEW_CODE,
            "field_type": RELABEL_FIELD_TYPE,
            "gs1_field": RELABEL_GS1_FIELD,
        },
    }


async def _deactivate_ref(conn, ref_id: str):
    """Deactiveer één ref, idempotent (AC1/AC5).

    Retourneert ``(outcome, row)`` met outcome in
    ``{"deactivated", "skip-already", "skip-missing"}``. ``row`` is de
    (vóór-write) rij — nodig voor de gold-set-reconciliatie van de caller — of
    ``None`` bij ``skip-missing``. ``active IS NULL`` (kolom is ``NOT NULL
    DEFAULT true`` in het schema, dus onverwacht) wordt EXPLICIET als
    ``skip-already`` behandeld i.p.v. impliciet via een falsy-check — zodat een
    toekomstige schema-wijziging deze aanname niet stilzwijgend verkeerd maakt.
    """
    row = await conn.fetchrow(
        "SELECT active, t3777_code, storage_path FROM reference_logos "
        "WHERE id = $1 FOR UPDATE",
        ref_id,
    )
    if row is None:
        return "skip-missing", None
    if row["active"] is not True:  # False of (onverwacht) None -> al niet actief
        return "skip-already", row
    await conn.execute("UPDATE reference_logos SET active = false WHERE id = $1", ref_id)
    return "deactivated", row


async def _relabel_ref(
    conn, ref_id: str, old_code: str, new_code: str, field_type: str, gs1_field: str
):
    """Herlabel één ref van ``old_code`` naar ``new_code``, idempotent (AC2/AC5).

    Retourneert ``(outcome, row)`` met outcome in
    ``{"relabeled", "skip-already", "skip-missing", "skip-unexpected-code",
    "skip-conflict"}``. ``row`` is de vóór-write rij (voor de gold-set-
    reconciliatie tegen de OUDE code).

    Validatie (code-review 2026-07-13 — was ontbrekend): schrijft ALLEEN als de
    huidige code exact ``old_code`` is. Is de code noch ``old_code`` noch
    ``new_code`` (gedreven, handmatig gewijzigd, of een eerdere onvolledige
    run), dan is blind overschrijven onveilig — de ref wordt dan overgeslagen
    als ``skip-unexpected-code`` i.p.v. gegokt.

    Conflict-guard: ``reference_logos`` heeft ``@@unique([t3777Code,
    variantLabel])`` (``schema.prisma``). Bestaat er al een ANDERE rij met
    ``(new_code, variant_label)`` gelijk aan die van deze ref, dan zou de
    UPDATE op een unique-violation stuklopen — dat wordt hier vooraf
    gedetecteerd en als ``skip-conflict`` teruggegeven (geen halve state, geen
    onafgehandelde DB-exceptie).
    """
    row = await conn.fetchrow(
        "SELECT t3777_code, variant_label, storage_path FROM reference_logos "
        "WHERE id = $1 FOR UPDATE",
        ref_id,
    )
    if row is None:
        return "skip-missing", None
    if row["t3777_code"] == new_code:
        return "skip-already", row
    if row["t3777_code"] != old_code:
        return "skip-unexpected-code", row

    conflict = await conn.fetchval(
        "SELECT 1 FROM reference_logos WHERE t3777_code = $1 AND variant_label = $2 "
        "AND id != $3",
        new_code,
        row["variant_label"],
        ref_id,
    )
    if conflict:
        return "skip-conflict", row

    await conn.execute(
        "UPDATE reference_logos SET t3777_code = $2, field_type = $3, gs1_field = $4 "
        "WHERE id = $1",
        ref_id,
        new_code,
        field_type,
        gs1_field,
    )
    return "relabeled", row


async def _reconcile_gold_set(conn, t3777_code, storage_path) -> int:
    """Trek gold_set_records-bevestigingen in die deze crop nog als ECHT onder de
    (nu foute) ``t3777_code`` bevestigen — self-tombstone, patroon
    ``withdrawGoldSetRecord`` (``apps/api/src/services/flywheel/gold-set.ts``).

    Alleen actieve (``replaced_by_id IS NULL``) ECHT-records met een exacte
    ``crop_path``-match op deze ref's ``storage_path`` worden ingetrokken — een
    VALS-record confirmeert al dat de crop niet genuine is (blijft ongemoeid),
    en een andere crop_path hoort niet bij deze ref. Retourneert het aantal
    ingetrokken records (0 als er geen match is, incl. lege/``None``
    ``storage_path``/``t3777_code``).
    """
    if not storage_path or not t3777_code:
        return 0
    rows = await conn.fetch(
        "SELECT id FROM gold_set_records "
        "WHERE t3777_code = $1 AND crop_path = $2 "
        "AND replaced_by_id IS NULL AND label = 'ECHT'",
        t3777_code,
        storage_path,
    )
    retracted = 0
    for r in rows:
        await conn.execute(
            "UPDATE gold_set_records SET replaced_by_id = id "
            "WHERE id = $1 AND replaced_by_id IS NULL",
            r["id"],
        )
        retracted += 1
    return retracted


async def run(apply: bool) -> int:
    """Voer de correctie uit (of preview 'm). DRY-RUN (``apply=False``) doet
    GEEN enkele DB-call — de plan-preview komt uitsluitend uit de hardcoded
    constanten hierboven, dus er is structureel niets te muteren (AC5)."""
    plan = build_action_plan()

    if not apply:
        print(
            f"DRY-RUN — {len(plan['deactivate'])} refs deactiveren, "
            "1 herlabelen (A13). Geen writes."
        )
        for label, ref_id in sorted(plan["deactivate"].items()):
            print(f"  zou deactiveren: {label} ({ref_id})")
        r = plan["relabel"]
        print(
            f"  zou herlabelen: A13 ({r['id']}) {r['old_code']} -> {r['new_code']} "
            f"(field_type={r['field_type']}, gs1_field={r['gs1_field']})"
        )
        print("Dry-run: geen writes. Draai met --apply om te muteren.")
        return 0

    from app.services.database import db_service

    counts: dict = {}
    gold_retracted = 0
    errors = []  # (label, ref_id, exception) — één kapotte ref breekt de run niet af

    async with db_service.get_connection() as conn:
        for label, ref_id in plan["deactivate"].items():
            try:
                async with conn.transaction():
                    outcome, row = await _deactivate_ref(conn, ref_id)
                    counts[outcome] = counts.get(outcome, 0) + 1
                    if outcome == "deactivated" and row is not None:
                        gold_retracted += await _reconcile_gold_set(
                            conn, row["t3777_code"], row["storage_path"]
                        )
            except Exception as exc:  # noqa: BLE001 — één kapotte ref mag de rest niet blokkeren
                counts["skip-error"] = counts.get("skip-error", 0) + 1
                errors.append((label, ref_id, str(exc)[:120]))
                print(f"  FOUT bij {label} ({ref_id}): {str(exc)[:120]}", file=sys.stderr)

        r = plan["relabel"]
        try:
            async with conn.transaction():
                outcome, row = await _relabel_ref(
                    conn, r["id"], r["old_code"], r["new_code"], r["field_type"], r["gs1_field"]
                )
                counts[outcome] = counts.get(outcome, 0) + 1
                if outcome == "relabeled" and row is not None:
                    gold_retracted += await _reconcile_gold_set(
                        conn, row["t3777_code"], row["storage_path"]
                    )
        except Exception as exc:  # noqa: BLE001
            counts["skip-error"] = counts.get("skip-error", 0) + 1
            errors.append(("A13-relabel", r["id"], str(exc)[:120]))
            print(f"  FOUT bij A13-relabel ({r['id']}): {str(exc)[:120]}", file=sys.stderr)

    total_refs = len(plan["deactivate"]) + 1
    print(
        f"Klaar — gedeactiveerd: {counts.get('deactivated', 0)}, "
        f"al-inactief: {counts.get('skip-already', 0)}, "
        f"niet-gevonden: {counts.get('skip-missing', 0)}, "
        f"onverwachte-code: {counts.get('skip-unexpected-code', 0)}, "
        f"conflict: {counts.get('skip-conflict', 0)}, "
        f"herlabeld: {counts.get('relabeled', 0)}, "
        f"fouten: {counts.get('skip-error', 0)}, "
        f"gold-set ingetrokken: {gold_retracted}."
    )
    # Structureel niets gelukt (bv. verkeerde DB/omgeving: alle 19 ids
    # niet-gevonden) mag NOOIT als succes gemeld worden aan een geautomatiseerde
    # aanroeper — onderscheid dat van een legitieme volledige no-op (waar
    # skip-already domineert, want dan is de correctie al eerder toegepast).
    if counts.get("skip-missing", 0) == total_refs:
        print("Alle ids niet gevonden — verkeerde omgeving/DB? Geen writes uitgevoerd.", file=sys.stderr)
        return 1
    if errors:
        return 1
    return 0


async def verify() -> int:
    """Read-only vóór-/na-verificatie (AC4, Task 1 + Task 5): genuine actieve
    tellingen per letter, exclusief de synthetische zaden (de 5 bekende
    ``SEED_IDS``). Doet GEEN writes.

    Verwacht VÓÓR correctie: A=12, B=9, C=5, D=2, E=9 (alle 18 nog active=true,
    A13 nog onder NUTRISCORE_A).

    Verwacht NÁ correctie: A=8, B=3, C=0, D=1, **E=7**. Let op: het
    verdict-bestand (nutriscore-labelverdict-friso-2026-07-12.md) noemt in de
    per-letter-tabel "E genuine over: 6" — dat cijfer is de E-telling VÓÓR de
    A13-instroom (A13 stond in die tabelrij nog onder A). Ná de relabel komt
    A13 er non-seed bij, dus de daadwerkelijke actieve E-telling is 9 (vóór)
    - 3 (E1,E4,E10 gedeactiveerd) + 1 (A13 relabeled naar E) = **7**, exact
    zoals AC4's eigen parenthetische toelichting zegt ("na A13→E is E 7
    echt-actief incl. de herlabel"). Dit script rapporteert dus 7 als het
    correcte eindgetal — niet de brontabel-6, die alleen A13-vóór-de-relabel
    weergeeft.
    """
    from app.services.database import db_service

    seed_ids = list(SEED_IDS.values())
    async with db_service.get_connection() as conn:
        print("NutriScore genuine actieve tellingen per letter (excl. synthetisch zaad):")
        for letter in "ABCDE":
            code = f"NUTRISCORE_{letter}"
            row = await conn.fetchrow(
                "SELECT count(*) AS n FROM reference_logos "
                "WHERE t3777_code = $1 AND active = true AND id != ALL($2::uuid[])",
                code,
                seed_ids,
            )
            print(f"  {letter}: {row['n']}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Corrigeer fout-gelabelde NutriScore-referentie-crops (Story 12.9)."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Voer de writes uit (zonder deze vlag: dry-run, geen writes).",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Read-only: toon genuine actieve tellingen per letter i.p.v. corrigeren.",
    )
    args = parser.parse_args()
    if args.verify and args.apply:
        parser.error("--apply en --verify sluiten elkaar uit — draai ze na elkaar.")
    if args.verify:
        return asyncio.run(verify())
    return asyncio.run(run(args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
