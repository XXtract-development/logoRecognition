/**
 * Testopzet voor het beoordeelscherm (Story 20.15).
 *
 * WAAROM DEZE HELPER BESTAAT
 * De opmaak van het beoordeelscherm is twee keer op rij afgetekend terwijl hij stuk was
 * (stories 20.12 en 20.14). Oorzaak: alle tests draaien in jsdom/happy-dom, en die doen géén
 * layout — `getBoundingClientRect()` geeft er nul terug. Een test kon dus alleen vaststellen
 * DAT een waarde werd doorgegeven, niet welke hoogte het beeld kreeg. De code-review van 20.12
 * heeft dat empirisch aangetoond: met de héle gedragswijziging teruggedraaid bleven alle 63
 * tests groen.
 *
 * WAT DEZE OPZET DOET
 * De echte applicatie in een echte browser, met alle netwerkantwoorden onderschept. Geen
 * backend, geen database, geen inlog. Daardoor is dit een gewone test die bij elke wijziging
 * meedraait — in tegenstelling tot `reference-library.spec.ts`, dat volledig geskipt staat
 * omdat het een draaiende stack plus geseede data nodig heeft.
 *
 * WAT DEZE OPZET NIET DOET
 * De gegevens zijn verzonnen. Een fout die alleen bij echte data optreedt — een extreem smal
 * artwork, een ontbrekend kader, een trage afbeelding — valt hier buiten. De lay-outmotor en de
 * componenten zijn wél echt; dat is precies het gat dat jsdom liet vallen.
 */
import { deflateSync } from "node:zlib";
import type { Page, Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// PNG-generator: geen bestanden in de repository, geen extra afhankelijkheid
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

/**
 * Een effen PNG van exact `width × height`. De afmeting is het hele punt: 20.16 moet kunnen
 * aantonen dat een KLEINE bron de ruimte benut en een GROTE bron niet wordt afgekapt, en dat
 * zijn twee verschillende stubs.
 */
export function makePng(
  width: number,
  height: number,
  rgb: [number, number, number] = [47, 90, 122],
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bitdiepte
  ihdr[9] = 2; // kleurtype 2 = RGB
  // [10..12] = compressie 0, filter 0, interlace 0

  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0; // filtertype 0
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 3;
      // Diagonale streep in een contrastkleur: zo is aan een schermafbeelding te zien
      // of het beeld is afgekapt of alleen verkleind.
      const streep =
        Math.abs(x - y) < Math.max(2, Math.min(width, height) * 0.02);
      raw[p] = streep ? 214 : rgb[0];
      raw[p + 1] = streep ? 69 : rgb[1];
      raw[p + 2] = streep ? 69 : rgb[2];
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

export interface ReviewDeckStubOptions {
  /** Aantal kaarten in de wachtrij (standaard 3, zodat navigatie meetbaar is). */
  itemCount?: number;
  /** Afmeting van het gemarkeerde artwork dat het deck toont. */
  image?: { width: number; height: number };
  /** Afmeting van het voorbeeldlogo naast "Zoek dit keurmerk op de verpakking". */
  referenceImage?: { width: number; height: number };
  /** Keurmerkcode op de kaarten. */
  code?: string;
  /**
   * Vertraging op `/auth/me` in milliseconden. Maakt de wedloop uit bevinding H3
   * (review-20-15-code) REPRODUCEERBAAR: zolang de rolcheck loopt staat de melding
   * "Reviewing requires admin rights" boven het deck, en de kaart meet zijn hoogte
   * mét die melding erin. Verdwijnt hij daarna, dan blijft de kaart te klein.
   */
  authDelayMs?: number;
}

/**
 * De dev-server draait op 5173 terwijl de api-basis in dev op :8000 staat
 * (`apps/web/src/constants/index.ts:8`), dus élke aanroep is cross-origin.
 *
 * Belangrijk: de herkomst moet LETTERLIJK teruggegeven worden, niet als `*`. De client stuurt
 * cookies mee (`withCredentials`), en dan weigert de browser een wildcard — dat kost hier een
 * ronde debuggen: alle stubs werkten, maar het scherm bleef leeg met
 * "blocked by CORS policy" in de console.
 */
function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] ?? "http://localhost:5173";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    vary: "Origin",
  };
}

function jsonRoute(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    headers: { "content-type": "application/json", ...corsHeaders(route) },
    body: JSON.stringify(body),
  });
}

/**
 * Zet alle antwoorden klaar die het beoordeelscherm nodig heeft om een kaart te tonen.
 * Aanroepen VÓÓR `page.goto`.
 */
export async function stubReviewDeck(
  page: Page,
  opts: ReviewDeckStubOptions = {},
): Promise<void> {
  const {
    itemCount = 3,
    image = { width: 1600, height: 1200 },
    referenceImage = { width: 200, height: 200 },
    code = "EU_ORGANIC_FARMING",
    authDelayMs = 0,
  } = opts;

  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: `stub-item-${i + 1}`,
    gtin: `080000000000${i + 1}`.slice(-13),
    t3777Code: code,
    // cropPath + een bruikbare bbox zijn de voorwaarde waaronder het deck het
    // gemarkeerde artwork toont (MobileReviewDeck: `markedSrc`).
    cropPath: `artwork-crops/stub/${i + 1}.png`,
    bbox: { x: 120, y: 200, width: 300, height: 220 },
    confidence: 0.82,
    method: "embedding",
    reason: "declared-not-found",
    sourceFile: `stub-artwork-${i + 1}.pdf`,
    status: "open",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  }));

  // LET OP — REGISTRATIEVOLGORDE IS OMGEKEERD AAN UITVOERINGSVOLGORDE.
  // Playwright draait de onderscheppers in omgekeerde registratievolgorde: de LAATST
  // geregistreerde komt als EERSTE aan de beurt en kan met `fallback()` doorgeven aan de
  // vorige. Daarom staat het vangnet hier bovenaan (het draait dus als laatste) en de
  // preflight-afhandeling helemaal onderaan (die draait als eerste).
  // Zet je het vangnet onderaan, dan vangt hij álles af en meet de test een leeg scherm.

  // Vangnet: elke niet-genoemde api-aanroep krijgt een leeg antwoord in plaats van een
  // netwerkfout, zodat een nieuw endpoint de meting niet stilzwijgend omlegt.
  await page.route("**/api/v1/**", (route) => jsonRoute(route, {}));

  // De antwoordvormen hieronder zijn NIET verzonnen maar afgelezen uit de service-laag:
  //   useCurrentUser        -> response.data.success + response.data.user (useCurrentUser.ts:32-38)
  //   fetchReviewQueue      -> response.data.data     (artworkReviewService.ts:56-57)
  //   fetchUncertain...     -> response.data.data     (artworkReviewService.ts:295-296)
  //   fetchDeclaredMarks    -> response.data.marks    (artworkReviewService.ts:166-171)
  // Wijkt de server ooit af, dan meet deze test iets dat niet meer bestaat — daarom staan de
  // bronregels erbij.
  await page.route("**/api/v1/auth/me*", async (route) => {
    if (authDelayMs > 0) await new Promise((r) => setTimeout(r, authDelayMs));
    return jsonRoute(route, {
      success: true,
      user: { id: "stub-admin", email: "stub@xxtract.com", role: "ADMIN" },
    });
  });

  await page.route("**/api/v1/artwork/review-queue*", (route) =>
    jsonRoute(route, { data: items }),
  );

  await page.route("**/api/v1/feedback/uncertain*", (route) =>
    jsonRoute(route, { data: [] }),
  );

  await page.route("**/api/v1/artwork/declared-marks/**", (route) =>
    // `reason` MOET 'ok' zijn: MobileReviewDeck.tsx:331 laat de declaratie-tag alleen
    // renderen bij die waarde. Met een andere waarde valt de tag stil weg en meet de
    // nulmeting 32 px te veel ruimte (bevinding H2, review-20-15-code).
    jsonRoute(route, { gtin: items[0].gtin, marks: [code], reason: "ok" }),
  );

  const markedPng = makePng(image.width, image.height);
  await page.route("**/api/v1/artwork/review-items/*/marked*", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "image/png", ...corsHeaders(route) },
      body: markedPng,
    }),
  );

  const refPng = makePng(
    referenceImage.width,
    referenceImage.height,
    [183, 217, 69],
  );
  await page.route("**/api/v1/reference-logos/code/*/image*", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "image/png", ...corsHeaders(route) },
      body: refPng,
    }),
  );

  // Als LAATSTE geregistreerd, dus als EERSTE uitgevoerd: preflight afvangen en al het
  // andere doorgeven aan de stubs hierboven. De dev-server draait op 5173 terwijl de
  // api-basis in dev op :8000 staat, dus de aanroepen zijn cross-origin.
  await page.route("**/api/v1/**", async (route) => {
    if (route.request().method() !== "OPTIONS") return route.fallback();
    await route.fulfill({
      status: 204,
      headers: {
        ...corsHeaders(route),
        "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
        "access-control-allow-headers": "*",
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Meten
// ---------------------------------------------------------------------------

export interface DeckMeasurement {
  viewportHeight: number;
  /** Hoogte van het beeldvenster — de grootheid die 20.16 moet vergroten. */
  stageFrameHeight: number;
  /** Gerenderde hoogte van het beeld zelf; kleiner dan het venster = ongebruikte ruimte. */
  imageHeight: number;
  /** Gerenderde breedte van het beeld. */
  imageWidth: number;
  /** Onderkant van de "Accepteer"-knop; groter dan de vensterhoogte = onder de vouw. */
  acceptBottom: number;
  /** Onderkant van "Ander keurmerk koppelen" — staat ONDER Accepteer. */
  relabelBottom: number;
  /** Onderkant van de laagste bediening incl. relabel-knop en swipe-hint. */
  lowestControlBottom: number;
  /** Onderkant van de kaart. */
  cardBottom: number;
  /** Staat de Accepteer-knop binnen het venster? */
  acceptVisible: boolean;
  /** Staat ALLE bediening binnen het venster? Dit is de eis van 20.16 AC1/AC2. */
  allControlsVisible: boolean;
  /** Blijft de kaartinhoud binnen de kaartrand? False = de kaart loopt over (20.16 AC5). */
  contentWithinCard: boolean;
  /** Hoogte van de zone waarin je een kader kunt slepen. Moet gelijk zijn aan het beeld. */
  drawZoneHeight: number;
  /** Afstand tussen de onderkant van de kaart en de laagste bediening (20.16 AC1: <= 70). */
  controlsBelowCard: number;
}

/**
 * Meet net zo lang tot twee opeenvolgende metingen gelijk zijn.
 *
 * GESCHIEDENIS, want die verklaart de vorm. Vóór story 20.16 mat de kaart zijn hoogte één keer
 * bij het monteren en daarna alleen nog bij een `resize`. Kwam de wachtrij ná dat moment binnen,
 * dan bleef de kolom te klein en pakte hij dat nooit terug. Deze functie vuurde toen standaard
 * zelf een `resize` af om de meting reproduceerbaar te maken — en poetste daarmee precies het
 * gebrek weg dat ze moest aantonen (400 gemeten waar de app op 368 stond).
 *
 * Sinds 20.16 hermeet het scherm zichzelf en staat `forceerHermeting` standaard UIT. Alleen de
 * wedloop-test zet hem nog bewust aan, om te tonen dat een duwtje niets meer oplevert.
 */
export async function measureDeckStable(
  page: Page,
  opts: { rondes?: number; wachtMs?: number; forceerHermeting?: boolean } = {},
): Promise<DeckMeasurement & { stabielNa: number }> {
  const { rondes = 20, wachtMs = 100, forceerHermeting = false } = opts;

  // Zonder deze duw meet je een WEDLOOP, geen scherm. De kaart meet zijn hoogte één keer bij
  // het monteren en daarna alleen nog bij een `resize` (MobileReviewDeck.tsx:158-168).
  //
  // OORZAAK, GECORRIGEERD (bevinding H3, review-20-15-code): mijn eerste verklaring — de
  // uitlegalinea — was FOUT; die kan nooit naast een kaart staan (ArtworkReviewPage.tsx:148).
  // De werkelijke bron is de rolcheck `/auth/me`: zolang die loopt staat de melding dat
  // beoordelen beheerdersrechten vraagt bóven het deck. Meet de kaart op dat moment, dan
  // houdt hij die ~58 px permanent aan zichzelf af. Gemeten gevolg bij vensterhoogte 700:
  // 222 px in de ene run en 164 px in de volgende. Zie de optie `authDelayMs` om het
  // reproduceerbaar op te roepen.
  // STANDAARD UIT sinds de code-review van 20.16 (H1). Hij stond aan, en dat POETSTE het
  // gebrek weg dat deze opzet moest aantonen: bij vensterhoogte 700 mat de test 400 px terwijl
  // de app zelf op 368 px eindigde. Een meetlat die het onderwerp aanraakt, meet niet meer.
  // Alleen de wedloop-test zet hem nog bewust aan, om het verschil zichtbaar te maken.
  if (forceerHermeting) {
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(50);
  }

  let vorige: DeckMeasurement | null = null;
  for (let i = 1; i <= rondes; i++) {
    const huidige = await measureDeck(page);
    if (vorige && JSON.stringify(vorige) === JSON.stringify(huidige)) {
      return { ...huidige, stabielNa: i };
    }
    vorige = huidige;
    await page.waitForTimeout(wachtMs);
  }
  throw new Error(
    `De opmaak is na ${rondes} rondes nog niet stabiel — laatste meting: ${JSON.stringify(vorige)}`,
  );
}

/** Leest de werkelijke afmetingen uit de lay-out. Geen aannames, geen doorgifte. */
export async function measureDeck(page: Page): Promise<DeckMeasurement> {
  return page.evaluate(() => {
    const rect = (sel: string) =>
      document.querySelector(sel)?.getBoundingClientRect();
    const frame = rect('[data-testid="deck-stage-frame"]');
    const img = document.querySelector(
      '[data-testid="deck-stage"] img',
    ) as HTMLImageElement | null;
    const imgRect = img?.getBoundingClientRect();
    const accept = rect('[data-testid="deck-accept"]');
    const relabel = rect('[data-testid="deck-relabel-open"]');
    const cardEl = document.querySelector('[data-testid="deck-swipe-card"]');
    const card = cardEl?.getBoundingClientRect();
    // De ONDERKANT VAN HET HELE DECK, niet die van de Accepteer-knop. Onder Accepteer
    // staan namelijk nog de knop "Ander keurmerk koppelen" (MobileReviewDeck.tsx:1371) en
    // de swipe-hint (:1385). Meet je alleen Accepteer, dan kan een reparatie "de knoppen
    // staan in beeld" claimen terwijl er ~76 px bediening onder de vouw hangt — precies de
    // soort halve waarheid waarvoor deze testopzet bestaat (bevinding H1, review-20-15-code).
    const deckRoot = cardEl?.parentElement ?? null;
    const deck = deckRoot?.getBoundingClientRect();
    const vh = window.innerHeight;
    // De onderkant van de KOLOM volstaat niet meer: die heeft sinds 20.16 een vaste hoogte,
    // dus iets dat eronder terugkomt (de veeg-hint bijvoorbeeld) zou de meting niet raken en
    // de test onterecht groen laten. Daarom de laagste onderkant over álle afstammelingen.
    const alleOnderkanten = deckRoot
      ? Array.from(deckRoot.querySelectorAll('*'))
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.height > 0 || r.width > 0)
          .map((r) => r.bottom)
      : [];
    const laagste = Math.max(
      accept?.bottom ?? -1,
      relabel?.bottom ?? -1,
      deck?.bottom ?? -1,
      ...alleOnderkanten,
    );
    return {
      viewportHeight: vh,
      stageFrameHeight: Math.round(frame?.height ?? -1),
      imageHeight: Math.round(imgRect?.height ?? -1),
      imageWidth: Math.round(imgRect?.width ?? -1),
      acceptBottom: Math.round(accept?.bottom ?? -1),
      relabelBottom: Math.round(relabel?.bottom ?? -1),
      lowestControlBottom: Math.round(laagste),
      cardBottom: Math.round(card?.bottom ?? -1),
      acceptVisible: (accept?.bottom ?? Infinity) <= vh,
      allControlsVisible: laagste > 0 && laagste <= vh,
      // 1 px speling voor afrondingen in de lay-outmotor.
      contentWithinCard: !!frame && !!card && frame.bottom <= card.bottom + 1,
      controlsBelowCard: card ? Math.round(laagste - card.bottom) : -1,
      // De tekenzone is de laag met de pointer-handlers (`deck-stage`). Is die hoger dan het
      // beeld, dan kun je slepen in een grijze band en wordt het kader stil bijgeknipt.
      drawZoneHeight: Math.round(
        (document.querySelector('[data-testid="deck-stage"]') as HTMLElement | null)
          ?.getBoundingClientRect().height ?? -1,
      ),
    };
  });
}
