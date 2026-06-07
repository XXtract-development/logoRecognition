# Besluit-memo: toegang tot de 39k etiket-artworkbestanden (bulk-detectie)

Datum: 2026-06-07 · Opsteller: Mary (BA) · Beslisser: Friso (PO)

## Feiten

| Feit | Waarde | Bron |
|---|---|---|
| Corpus | ~39.000 bestanden / 12.498 GTIN's (PACKAGING_ARTWORK) | PRD-addendum / xxtractdbmedia.media |
| Fysieke locatie | PROD-NAS; mediaserver-endpoint is het enige toegangspad | architectuur/handover |
| ACC-NAS-dekking | Fractie (fase B: 802/802 downloads 404 op willekeurige GTIN's; werkende set = 6 GTIN's) | fase-b-bevindingen |
| Prod-mediaserver vanaf ACC-app | **HTTP 503** (media.xxtract.com; media.stage werkt maar bevat deze data niet) | test 2026-06-07 |
| Corpus-omvang in GB | Nader te bepalen (query op media-DB); ruwe schatting 50–200 GB | open |
| Verwerkingstijd ná toegang | ~27 uur detectie bij DETECTION_CONCURRENCY=4 (gemeten ~5–10 s/beeld) | 8-3O/8-3P-metingen |

## Opties

### A — NAS-sync prod → ACC (AANBEVOLEN)
Eenmalige (+ evt. periodieke) rsync van de PACKAGING_ARTWORK-boom naar de ACC-NAS/Storage Box; de bestaande ACC-mediaserver serveert ze daarna gewoon — **pipeline ongewijzigd**.
- ✅ Geen ACC→prod-runtime-koppeling, geen prod-load, geen 503-mysterie
- ✅ Sync loopt op de achtergrond terwijl wij CI-bouwstraat/classify doen
- ⚠️ Beheeractie op NAS-niveau (buiten de repo); schijfruimte ACC checken (50–200 GB); versheid = sync-moment

### B — ACC-app importeert via prod-mediaserver (env-switch)
`MEDIASERVER_DOMAIN=https://media.xxtract.com` + throttled import-runs; NFR7-cache maakt het eenmalig per bestand.
- ✅ Geen infra-verplaatsing; altijd verse data
- ❌ Geblokkeerd tot de 503 verklaard/opgelost is (down? allowlist? proxy?)
- ⚠️ Productie-load tijdens de bulk (39k downloads — throttling verplicht); governance-vraag (ACC trekt aan prod)

### C — Bulk in de prod-omgeving draaien
logoRecognition (of alleen de detectieketen) deployen naast prod.
- ❌ Zwaarste optie; nieuwe omgeving, secrets, governance — niet nodig zolang het doel trainingsdata is

## Aanbeveling

**Optie A**, met twee voorbereidende acties die nu al kunnen: (1) omvang-query op de media-DB (GB-totaal) + vrije ruimte ACC-Storage-Box checken, (2) de 503 van de prod-mediaserver los hiervan laten verklaren door beheer — als die triviaal blijkt, blijft B een goedkoop alternatief voor versheid later.

**Prerequisites vóór de bulk (los van toegang):** classify-kwaliteit (mislabel-punt) · provenance-index (migratiebesluit) · per-klasse drempels uitbreiden o.b.v. labelrondes.
