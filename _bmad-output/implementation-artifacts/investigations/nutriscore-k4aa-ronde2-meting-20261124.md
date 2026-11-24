---
title: Nutri-Score K4-aa D/E ronde 2 — deelset-meting op ACC
datum: 2026-11-24
omgeving: ACC, acc@46e5810 (PR #37), LOGO_SCAN_ROUTE=k4aa tijdelijk
spec: _bmad-output/specs/spec-nutriscore-k4aa-de/SPEC.md
status: afgerond, ACC teruggezet, volledige 352 NIET gedraaid (drempel niet gehaald)
ruwe-uitslag: nutriscore-k4aa-ronde2-deelset-rapport-20261124.md
---

# Uitkomst

Drie van de vijf letters halen de eis op de deelset: A, D en E. B en C niet. B krijgt veel valse meldingen (18 van 29), C wordt in ruim de helft van de gevallen als B gemeld of gemist. De volledige 352 is niet gedraaid (spec CAP-5b: A, B en C moeten elk ≥70% gevonden en ≤15% vals zijn). Dit was de tweede ronde, dus we stoppen hier (stopregel uit de opdracht).

# Deelset (119 etiketten, 111 antwoorden, 8 zonder antwoord, modelVersion `acc-20261006/k4aa`)

| Letter | Gevonden | Vals | Ronde 1 (zelfde deelset) | Eis |
|---|---|---|---|---|
| A | 85% (11/13) | 0% (0/11) | 31% / 0% | gehaald |
| B | 100% (11/11) | 62% (18/29) | 20% / 50% | **niet** (vals) |
| C | 53% (8/15) | 33% (4/12) | 33% / 0% | **niet** (gevonden en vals) |
| D | 91% (29/32) | 9% (3/32) | 84% / 7% | gehaald |
| E | 91% (20/22) | 0% (0/20) | 14% / 0% | gehaald |

Verwarring (waarheid → gemeld): A: A 11, B 3. B: B 11, C 1. C: **B 10**, C 8. D: D 29, C 3, B 4. E: E 20, D 3, B 1.
Zonder antwoord: 7× HTTP 400 bij versturen, 1× verwerking mislukt (zelfde 8 etiketten hebben geen invloed op de teller; noemer = etiketten mét antwoord).
Origineel (41) en herschaald (78) apart: A 67% (4/6) en 100% (7/7); B 100% en 100%; C n.v.t. (0 originele C-etiketten) en 53% (8/15); D 100% (3/3) en 90% (26/29); E 100% (9/9) en 85% (11/13). Details in het ruwe rapport.

# Wat de ronde deed

- VERIFIED: de letterpoort was de hoofdoorzaak van het verlies bij A, D en E: A 31% → 85%, E 14% → 91%, D 84% → 91% na de familiepoort en stemmen (CAP-2, CAP-2b).
- VERIFIED: B is de "afvoerput": 18 van 29 B-meldingen zijn fout (10× een C-etiket, 4× D, 3× A, 1× E).
- INFERENCE: Gemini leest de gemarkeerde letter bij B/C regelmatig fout, en de stemmen (meeste overlappende meldingen) versterken dan de verkeerde letter in plaats van die te corrigeren. De SigLIP-poort kan dit niet verhelpen: die ziet alleen de familie (offline bewezen in het oorzaakrapport). Niet bewezen: of het aan de prompt, de venstergrootte of de referenties ligt.
- UNVERIFIED: zuiverheid van de NUTRISCORE_*-referenties op ACC (CAP-3 vervallen); GTIN-overlap referenties/352 (CAP-5c) niet gemeten. Commando om de overlap te meten: vergelijk `SELECT DISTINCT gtin FROM <referentietabel>` met de GTIN's in `truth-*.json`.
- Voorbehoud uit het script: scores gebruiken de ruwe `detections` (niet de `items` met `uitkomststand`); trainingsoverlap niet gemeten, scores kunnen te gunstig zijn; deelset is klein (A n=13, B n=11).

# Opties (aan de beslisser)

1. **Aparte letterlezer op de uitgesneden balk** (aanbevolen): na de familiepoort de crop van de Nutri-Score-balk nog één keer aan Gemini voorleggen met alleen de vraag "welke letter is groot/gemarkeerd", en stemmen over die uitkomst. Raakt B/C direct; kost één extra aanroep per gevonden balk.
2. **A, D, E nu laten werken, B en C alleen als "controle nodig" tonen** (blijft zo: Nutri-Score is `uncertain`/`requires_review`). Geen werk, maar B/C-eis blijft open.
3. **Referenties voor B en C onderzoeken en opschonen** (ACC-schrijfactie, alleen via genummerd manifest aan Friso). Pas zinvol na een meting van hun zuiverheid.

# ACC teruggezet

- LOGO_SCAN_ROUTE (gewoon en preview, uuid uo000kcgosgs8g04owsw8wc8 en a8wc8cskogo80go8o0w0cwk) en LOGO_PIPELINE_KEYS_EXTRA (gewoon en preview, l0o0c480kwg048c0kwokksog en docwok4cww0kk8ww000840c4) verwijderd; Coolify opnieuw uitgelezen: geen van de vier staat er nog.
- Redeploy pko08swsogskog040g4kk4kg, klaar 20:45:38, commit 46e5810.
- VERIFIED: `/health` 200; testsleutel op `/api/v1/pipeline/logo-scans` → 401 (zonder sleutel ook 401).
- UNVERIFIED: modelVersion zonder `/k4aa` (geen geldige sleutel meer om te scannen). Bevestigen met een gewone productiesleutel: `curl -H "x-api-key: <sleutel>" -F file=@<beeld> https://logo-detection.acc.xxtract.com/api/v1/pipeline/logo-scans` en de modelVersion in het antwoord lezen. Route is uit omdat de variabele weg is.
- Niet aangeraakt (opdracht): n8n-credential MSD1Anilm4mpTywX, flow AxwHAa2jGL9SkvNb, Keychain-item LOGO_PIPELINE_KEYS_EXTRA/acc.
