# Fase B data-heropbouw — bevindingen 2026-06-05/06

**Uitgevoerd met kortlevend ADMIN-token ("Data Rebuild, akkoord Friso"), ACC-only.**

## Opgeleverd
- **B1 ✅** Referentiebibliotheek: 5 officiële keurmerken (EU_ORGANIC_FARMING, GREEN_DOT, EUROPEAN_V_LABEL_VEGAN, FOREST_STEWARDSHIP_COUNCIL_MIX, RAINFOREST_ALLIANCE) geüpload met Wikimedia-bronvermelding; embeddings 5/5 gebouwd
- **B2 ✅** Importrun `640b662f`: 12 artworks geïmporteerd (0 gefaald), incl. PDF→page-rasterization (8.2 werkt live)
- **Detectieketen end-to-end bewezen** (composiet-validatie): localize → classify → crosscheck → review-queue; queue gevuld met 9 gecureerde reviewitems voor handmatige acceptatie (B4–B7)

## Onderweg gevonden + gefixt (gecommit op acc)
1. MinIO-buckets ontbraken na storage-reset → 4 buckets aangemaakt (runtime-actie)
2. `MINIO_ENDPOINT` semantiek-conflict Node (host) vs Python (host:poort) → poort-fallback in storage.py (`b456c91`)
3. `transformers` ongepind → 4.57 brak torch 2.1 (`register_pytree_node`) → gepind 4.38.2 (`d62e4ad`)
4. Mediaserver `mediaId` is int, schema verwacht string → genormaliseerd op client-grens (`d578d33`)
5. sshd `MaxStartups`-verzadiging op Vanilla (bots + Coolify-bursts) → 60:30:200 (host-config, akkoord Friso)

## Open bevindingen (remediatie/kalibratie nodig — Epic 8-nazorg)
1. **🔴 8.3 single-scale matching:** `match_templates` claimt multi-scale (docstring) maar matcht alleen op originele templategrootte; het localize-endpoint schaalt templates niet → met realistische referentiegroottes (512px+) wordt op 512px-tegels ÁLLES geskipt ("Template larger than tile"). Productie-detectie vond daardoor 0 keurmerken. Workaround in ketenscript: caller levert geschaalde template-varianten.
2. **🟠 Score-kalibratie:** TM_SQDIFF-normalisatie (`1 − min/max`) discrimineert zwak; met multi-scale templates en `min_score=0.8` → 1446 false positives op 13 afbeeldingen. Echte multi-scale + score-herijking (bijv. SQDIFF_NORMED of NCC met variance-guards) + per-schaal drempels nodig.
3. **🟡 API-inconsistentie:** localize `image_path` = bestandssysteem-pad (cv2.imread), classify `storage_path` = MinIO-key. Verwarrend contract; localize zou ook MinIO moeten lezen.
4. **🟡 Detectie-orkestratie ontbreekt server-side:** import→rasterize is automatisch, maar localize→classify→crosscheck vereist een externe driver (nu een ad-hoc script). Kandidaat voor een pipeline-stap of Epic 11-agent.
5. **ℹ️ ACC-NAS dekt een fractie van de media-DB:** GTIN-selectie voor imports moet op fysiek aanwezige bestanden filteren (eerste run: 802/802 download-404's). De 'failed'-administratie + herstartbaarheid (8.1) werkte daarbij zoals ontworpen.
6. **ℹ️ Natuurlijke detectie-opbrengst onbekend:** door (1)+(2) is nog niet vast te stellen of de 6 testproducten echte keurmerken dragen; na de multi-scale-fix opnieuw draaien.

## Reviewdata voor acceptatie (B4–B7)
Review-queue bevat 9 items over 3 GTIN's (00008500002456, 05060925294569, 05060503504929) — composieten met 2 geplakte referentielogo's per artwork, reden "niet gedeclareerd" (geen GS1-declaratie meegegeven). Crops, labels, confidence en herkomst aanwezig.
