---
dimensie: K1 — VLM via OpenRouter vindt én benoemt
ronde: r1-1
geraadpleegd: 2026-10-18
tool-aanroepen: 15
bronnen-gelezen: 9
---

# D1 · K1 — visueel taalmodel vindt en benoemt keurmerken

## Claims

Vorm: `claim | bron-URL | uitgever | publicatiedatum | geraadpleegd | zekerheid | klasse`

### Tarieven (OpenRouter, uitgelezen via de modellen-API op 2026-10-18 11:51 UTC; USD per miljoen tokens invoer / uitvoer)

- Claude Sonnet 5.5: $2 / $10 (batch $1 / $5), 1M context, beeld als invoer | https://openrouter.ai/api/v1/models | OpenRouter | model toegevoegd 2026-09-28 | geraadpleegd 2026-10-18 | hoog | pricing
- Claude Opus 5.5: $4 / $20 (batch $2 / $10); Opus 5: $5 / $25 | https://openrouter.ai/api/v1/models | OpenRouter | 2026-09-22 resp. 2026-07-24 | geraadpleegd 2026-10-18 | hoog | pricing
- Claude Haiku 5.5: $0,10 / $0,50, beeld als invoer | https://openrouter.ai/api/v1/models | OpenRouter | 2026-10-07 | geraadpleegd 2026-10-18 | hoog | pricing
- Gemini Pro: nieuwste op OpenRouter is `gemini-3.1-pro-preview`, $2 / $12; Gemini 2.5 Pro $1,25 / $10. Een niet-preview Gemini 3.x Pro staat er níet | https://openrouter.ai/api/v1/models | OpenRouter | 2026-02-19 / 2025-06-17 | geraadpleegd 2026-10-18 | hoog | pricing/version
- Gemini Flash: nieuwste `gemini-3.8-flash` $0,825 / $4,125 (batch $0,375 / $1,875); 3.5-flash-lite $0,30 / $2,50; 2.5 Flash $0,30 / $2,50 | https://openrouter.ai/api/v1/models | OpenRouter | 2026-09-02 | geraadpleegd 2026-10-18 | hoog | pricing
- GPT-klasse: GPT-5.6 in drie varianten — `sol` $4 / $20, `terra` $2 / $12, `luna` $0,20 / $1,20; GPT-5.5 $5 / $30; GPT-5.4-mini $0,75 / $4,50 | https://openrouter.ai/api/v1/models | OpenRouter | 2026-07-09 | geraadpleegd 2026-10-18 | hoog | pricing
- Qwen-VL: Qwen2.5-VL-72B $0,80 / $1,00 (128k); Qwen3-VL-235B-A22B $0,21 / $1,90; Qwen3-VL-8B $0,25 / $0,75. Nieuwere Qwen3.5–3.8-modellen nemen ook beeld aan (bv. qwen3.8-max-0902 $2 / $6, qwen3.8-flash $0,15 / $0,47) | https://openrouter.ai/api/v1/models | OpenRouter | 2025-02 t/m 2026-09 | geraadpleegd 2026-10-18 | hoog | pricing/version

### Hoe beelden getokeniseerd worden (officiële regels)

- Claude: 28×28-pixelvlakjes, kosten `⌈breedte/28⌉ × ⌈hoogte/28⌉`. Claude 4.7 en nieuwer: max lange zijde 2576 px / 4784 beeldtokens; oudere: 1568 px / 1568. Een beeld van 1500×1000 = 54×36 = **1944 tokens**, niet verkleind | https://platform.claude.com/docs/en/build-with-claude/vision | Anthropic | ongedateerd, gelezen 2026-10-18 | hoog | pricing
- Claude: max 8000×8000 px per beeld; bij meer dan 20 beelden per verzoek geldt een strengere grens (advies: ≤2000 px per zijde); max 600 beelden per verzoek | idem | Anthropic | idem | geraadpleegd 2026-10-18 | hoog | performance
- Gemini 3 (en "Gemini 4"): vaste plafonds per beeld via `media_resolution`: low 280, medium 560, high 1120 (= standaard), ultra_high 2240 tokens | https://ai.google.dev/gemini-api/docs/media-resolution | Google | bijgewerkt 2026-10-13 | geraadpleegd 2026-10-18 | hoog | pricing
- Gemini (oudere regel, o.a. 2.5): 258 tokens bij beide zijden ≤384 px, anders tegels van 768×768 à 258 tokens; 1500×1000 → 6 tegels = **1548 tokens** (eigen berekening met de rekenregel van de pagina) | https://ai.google.dev/gemini-api/docs/image-understanding | Google | bijgewerkt 2026-09-23 | geraadpleegd 2026-10-18 | middel | pricing
- OpenAI GPT-5.2 t/m 5.6: vlakjes van 32×32 px × factor 1,2; bij `high` max 2500 vlakjes (GPT-5.6: binnen 2048×2048), bij `original` (GPT-5.5/5.6, standaard via `auto`) tot 10.000 vlakjes / zijde 6000 px of groter. 1500×1000 = 47×32 = 1504 vlakjes → **1805 tokens** | https://developers.openai.com/api/docs/guides/images-vision | OpenAI | ongedateerd | geraadpleegd 2026-10-18 | hoog | pricing
- Qwen3-VL: één beeldtoken per 32×32 px (vlakje 16 px, 2×2 samengevoegd); Qwen2.5-VL: 28×28 px (vlakje 14 px). 1500×1000 → Qwen3-VL ~**1457**, Qwen2.5-VL ~**1944** tokens (eigen berekening) | https://github.com/QwenLM/Qwen3-VL | Alibaba Qwen | README, gelezen 2026-10-18 | middel | pricing

### Begrenzingsvakjes (grounding)

- Gemini geeft vakjes als `box_2d` = [ymin, xmin, ymax, xmax] genormaliseerd naar 0–1000; ook segmentatiemaskers; voor betere resultaten "thinking" op minimaal | https://ai.google.dev/gemini-api/docs/image-understanding | Google | 2026-09-23 | geraadpleegd 2026-10-18 | hoog | performance
- Claude geeft absolute pixelcoördinaten ten opzichte van het (eventueel verkleinde) beeld; Anthropic noemt de lokalisatie zelf "approximate" en raadt verificatie aan | https://platform.claude.com/docs/en/build-with-claude/vision | Anthropic | ongedateerd | geraadpleegd 2026-10-18 | hoog | performance
- OpenAI: het model "struggles with tasks requiring precise spatial localization"; tellen is bij benadering | https://developers.openai.com/api/docs/guides/images-vision | OpenAI | ongedateerd | geraadpleegd 2026-10-18 | hoog | performance
- Qwen2.5-VL gebruikt absolute pixelcoördinaten van het invoerbeeld; Qwen3-VL-kookboek noemt relatieve coördinaten | https://arxiv.org/html/2502.13923 ; https://github.com/QwenLM/Qwen3-VL | Alibaba Qwen | 2025-02-20 / 2025 | geraadpleegd 2026-10-18 | middel | performance
- Qwen2.5-VL-72B: RefCOCO val 92,7, RefCOCOg 89,9, ODinW-13 43,1 mAP (Gemini 1.5 Pro: 73,2 / 75,2 / 36,7) — **ouder dan 3 maanden**, oude Gemini | https://arxiv.org/html/2502.13923 | Qwen-team (arXiv) | 2025-02 | geraadpleegd 2026-10-18 | hoog | performance
- RF100-VL (100 detectiesets): Qwen2.5-VL en GroundingDINO halen <2% zero-shot op lastige medische sets; Gemini 2.5 Pro scoort 2,4% hoger dan 2.5 Flash — **ouder** | https://arxiv.org/abs/2505.20612 | Roboflow e.a. (NeurIPS 2025) | v4 2025-10-22 | geraadpleegd 2026-10-18 | hoog | performance
- Roboflow-webinar aug 2026 op RF20-VL-FSOD: volgorde GPT-6 Astra > Gemini 3.8 Flash > Qwen3.8-Max > Claude Fable 5.1; voorbeelden in de prompt helpen sterke modellen, maar bij Qwen en Claude soms juist slechter; VLM's geven geen betrouwbare zekerheidsscore per vakje. Geen getallen in de tekst | https://roboflow.com/blog/vision-language-model-benchmarks | Roboflow (blog) | 2026-08-04 | geraadpleegd 2026-10-18 | middel | performance/landschap

### Logo's herkennen en fijn onderscheid

- Logo-VGR: kiezen uit drie kandidaat-merken + "geen van deze": GPT-4.1 67,9% / Gemini 2.5 Pro 67,4% / Qwen2.5-VL-32B 72,3% op bekende merken — **ouder** | https://arxiv.org/html/2509.25811v1 | arXiv-preprint | 2025-09-30 | geraadpleegd 2026-10-18 | middel | performance
- Zelfde paper: zero-shot Qwen2.5-VL haalt AP50 0,061 op logo-lokalisatie (OpenBrand); na finetuning 0,63–0,78 | idem | idem | 2025-09-30 | geraadpleegd 2026-10-18 | middel | performance
- MMT-Bench logo-subtaak: 88–96% voor 2024-modellen — classificatie, geen detectie; **verouderd** | https://arxiv.org/pdf/2404.16006 | arXiv | 2024-04 | geraadpleegd 2026-10-18 (alleen zoekresultaat) | laag | performance

### Valkuilen

- Nauwkeurigheid daalt causaal naarmate het gevraagde detail kleiner is in het beeld; het model "kijkt wel op de goede plek" maar ziet het detail niet scherp; uitsnijden (ViCrop) helpt zonder training — **ouder** (ICLR 2025) | https://arxiv.org/pdf/2502.17422 | Zhang e.a., ICLR 2025 | 2025-02 | geraadpleegd 2026-10-18 | middel | performance
- Claude: kan hallucineren of fouten maken bij beelden onder 200 px, gedraaide of lage kwaliteit; tellen van veel kleine objecten onnauwkeurig | https://platform.claude.com/docs/en/build-with-claude/vision | Anthropic | ongedateerd | geraadpleegd 2026-10-18 | hoog | performance
- Bij verkleinen kloppen coördinaten alleen ten opzichte van het verkleinde beeld; zelf terugschalen nodig (Claude, Gemini 0–1000) | Claude- en Gemini-docs hierboven | — | — | geraadpleegd 2026-10-18 | hoog | performance

## Rekentabel — kosten per etiket

Aanname: 6 aanroepen per etiket, elk 1 beeld van 1500×1000 px + 1.000 tokens prompttekst + 400 uitvoertokens. Geen batchkorting, geen redeneertokens, geen referentieplaatjes.

| Model | Tarief in / uit ($/M) | Beeldtokens | Invoer totaal | Uitvoer totaal | $/etiket | $/1.000 etiketten |
|---|---|---|---|---|---|---|
| Claude Sonnet 5.5 | 2 / 10 | 1944 | 17.664 | 2.400 | 0,0593 | 59,33 |
| Claude Opus 5.5 | 4 / 20 | 1944 | 17.664 | 2.400 | 0,1187 | 118,66 |
| Claude Haiku 5.5 | 0,10 / 0,50 | 1944 | 17.664 | 2.400 | 0,0030 | 2,97 |
| Gemini 3.1 Pro preview (high) | 2 / 12 | 1120 | 12.720 | 2.400 | 0,0542 | 54,24 |
| Gemini 3.8 Flash (high) | 0,825 / 4,125 | 1120 | 12.720 | 2.400 | 0,0204 | 20,39 |
| Gemini 3.8 Flash (ultra_high) | 0,825 / 4,125 | 2240 | 19.440 | 2.400 | 0,0259 | 25,94 |
| Gemini 2.5 Pro (tegels) | 1,25 / 10 | 1548 | 15.288 | 2.400 | 0,0431 | 43,11 |
| GPT-5.6 sol | 4 / 20 | 1805 | 16.830 | 2.400 | 0,1153 | 115,32 |
| GPT-5.6 terra | 2 / 12 | 1805 | 16.830 | 2.400 | 0,0625 | 62,46 |
| GPT-5.6 luna | 0,20 / 1,20 | 1805 | 16.830 | 2.400 | 0,0062 | 6,25 |
| Qwen2.5-VL-72B | 0,80 / 1,00 | 1944 | 17.664 | 2.400 | 0,0165 | 16,53 |
| Qwen3-VL-235B-A22B | 0,21 / 1,90 | 1457 | 14.742 | 2.400 | 0,0077 | 7,66 |

> [!warning] Aannames in de tabel
> - AANNAME: factor 1,2 geldt voor alle drie GPT-5.6-varianten (docs noemen alleen "GPT-5.6").
> - AANNAME: OpenRouter rekent beeldtokens tegen het gewone invoertarief (veld `image` is bij Claude/GPT/Qwen leeg; bij Gemini gelijk aan invoertarief).
> - AANNAME: 15 referentieplaatjes per aanroep vallen erbuiten; bij ~200×200 px kost elk ~64 Claude-tokens (~1.000 extra per aanroep), bij Gemini 3 tot 280–1120 per plaatje afhankelijk van `media_resolution`.
> - Redeneertokens ("thinking") tellen als uitvoer en kunnen 400 ruim overschrijden.

## Leads

1. Roboflow-webinar (tijdstip 14:22) met de echte RF20-VL-getallen voor GPT-6 Astra, Gemini 3.8 Flash, Qwen3.8-Max, Claude — enige actuele vergelijking.
2. Anthropic-pagina "vision-coordinates" (verkleinen, opvulling, foutmelding bij te groot beeld) lezen vóór een proef met Claude-vakjes.
3. Qwen3-VL technisch rapport (arXiv, 2025-11-27) voor RefCOCO/ODinW en kleine-objectcijfers.
4. Gemini 3.x Pro: alleen preview op OpenRouter; nagaan of er een stabiele versie direct bij Google is.
5. Eigen meting nodig: geen enkele bron meet keurmerken van 50–300 px op 3000–40000 px lange artwork, noch fijn onderscheid tussen bijna-gelijke logo's.

## Gezocht maar niet gevonden

- Getallen van actuele modellen (2026) op objectdetectie: niet gevonden in tekst; alleen rangorde (Roboflow-blog).
- Objectdetectiecijfers van Claude (officieel of benchmark): niet gevonden; alleen "approximate" in de docs.
- Metingen van wisselvalligheid tussen herhaalde runs bij VLM-detectie: niet gevonden.
- Onderzoek naar referentieplaatjes in de prompt voor logo's (visual in-context learning): niet gevonden, buiten de Roboflow-opmerking over 1- en 10-shot.
- Logo-specifieke benchmark met fijn onderscheid tussen varianten (zoals Nutri-Score A/B/C): niet gevonden.
- Standaard `max_pixels` van Qwen via OpenRouter-aanbieders: niet gevonden.
