/**
 * Story 20.15 — meetbare opmaaktest voor het beoordeelscherm.
 *
 * Deze test MEET de gerenderde afmetingen in een echte browser. Dat is precies wat de
 * bestaande vitest-suites niet kunnen: jsdom en happy-dom doen geen layout, dus daar geeft
 * `getBoundingClientRect()` nul terug. Twee stories (20.12 en 20.14) zijn afgetekend terwijl
 * het scherm stuk was, omdat de tests alleen konden zien DAT een waarde werd doorgegeven.
 *
 * DE VASTGELEGDE GETALLEN ZIJN EEN NULMETING VAN DE KAPOTTE STAND — GEEN GOEDKEURING.
 * Story 20.16 repareert de opmaak en vervangt ze door de gerepareerde waarden. Elke
 * nulmeting-bewering draagt daarom een melding die vertelt wat te doen als hij rood wordt.
 *
 * Elke meting gaat ook naar `test-results/review-deck-metingen/<naam>.json` — één bestand per
 * meting, want bij parallelle workers overschrijven ze anders elkaar (bevinding M3,
 * review-20-15-code: met 3 workers bleef er 1 van de 5 metingen over).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { stubReviewDeck, measureDeckStable } from "./helpers/review-deck";

/** De twee vensterhoogtes uit de acceptatiecriteria van 20.16. */
const VIEWPORTS = [
  { naam: "laptop", width: 1440, height: 1000 },
  { naam: "klein", width: 1440, height: 700 },
] as const;

const UITVOERMAP = resolve(
  process.cwd(),
  "test-results",
  "review-deck-metingen",
);

function bewaar(naam: string, meting: unknown) {
  mkdirSync(UITVOERMAP, { recursive: true });
  writeFileSync(
    resolve(UITVOERMAP, `${naam}.json`),
    JSON.stringify(meting, null, 2),
  );
}

/** Opent het beoordeelscherm met stubs en wacht tot het beeld écht geladen is. */
async function openDeck(
  page: Page,
  vp: { width: number; height: number },
  opts: {
    image?: { width: number; height: number };
    authDelayMs?: number;
  } = {},
) {
  const { image = { width: 1600, height: 1200 }, authDelayMs = 0 } = opts;
  await page.setViewportSize(vp);
  await stubReviewDeck(page, { image, authDelayMs });
  await page.goto("/artwork-review");
  await expect(page.getByTestId("deck-swipe-card")).toBeVisible();
  await expect(page.locator('[data-testid="deck-stage"] img')).toBeVisible();
  // Zonder deze wachtvoorwaarde meet je een <img> met hoogte 0 en lijkt alles te passen.
  await page.waitForFunction(() => {
    const img = document.querySelector(
      '[data-testid="deck-stage"] img',
    ) as HTMLImageElement | null;
    return !!img && img.complete && img.naturalWidth > 0;
  });
}

test.describe("beoordeelscherm — gemeten opmaak", () => {
  for (const vp of VIEWPORTS) {
    test(`NULMETING ${vp.naam} (${vp.width}x${vp.height}) — kapotte stand`, async ({
      page,
    }) => {
      await openDeck(page, vp);
      const m = await measureDeckStable(page);
      bewaar(vp.naam, m);
      test.info().annotations.push({
        type: `meting-${vp.naam}`,
        description: JSON.stringify(m),
      });

      // Alles wat we meten moet ook echt gemeten zijn; -1 betekent "element niet gevonden".
      expect(m.stageFrameHeight, "beeldvenster gevonden").toBeGreaterThan(0);
      expect(m.imageHeight, "beeld gevonden").toBeGreaterThan(0);
      expect(m.acceptBottom, "Accepteer-knop gevonden").toBeGreaterThan(0);
      expect(m.relabelBottom, "relabel-knop gevonden").toBeGreaterThan(0);
      expect(m.viewportHeight, "vensterhoogte klopt").toBe(vp.height);

      // NULMETING 1 — het beeld wordt afgekapt: het rendert hoger dan zijn kader.
      // Oorzaak: `maxHeight: '100%'` tegen een ouder zonder bepaalde hoogte
      // (ImageStage.tsx:255) — bevinding H2 van review-20-14-code.
      expect(
        m.imageHeight,
        `NULMETING (${vp.naam}): het beeld rendert hoger dan zijn kader en wordt dus ` +
          `afgekapt. Wordt dit rood, dan past het beeld — dat is de winst van 20.16 AC6; ` +
          `vervang deze nulmeting.`,
      ).toBeGreaterThan(m.stageFrameHeight);

      // NULMETING 2 — bediening onder de vouw. Let op: de LAAGSTE bediening, niet alleen
      // Accepteer; daaronder staan nog de relabel-knop en de swipe-hint.
      expect(
        m.allControlsVisible,
        `NULMETING (${vp.naam}): niet alle bediening staat in beeld (laagste onderkant ` +
          `${m.lowestControlBottom} bij vensterhoogte ${vp.height}). Wordt dit rood, dan ` +
          `is de opmaak gerepareerd — controleer of dat 20.16 AC1/AC2 is en vervang deze ` +
          `nulmeting.`,
      ).toBe(false);
    });
  }

  test("NULMETING kleine bron — het beeld benut de ruimte niet", async ({
    page,
  }) => {
    // Het <img> heeft alleen maxWidth/maxHeight en schaalt daardoor nooit óp
    // (ImageStage.tsx:288-303), en de server verkleint alleen (withoutEnlargement).
    await openDeck(
      page,
      { width: 1440, height: 1000 },
      { image: { width: 240, height: 180 } },
    );
    const m = await measureDeckStable(page);
    bewaar("kleine-bron", m);

    expect(m.imageHeight, "het beeld rendert op zijn bronhoogte").toBe(180);
    expect(
      m.stageFrameHeight - m.imageHeight,
      "NULMETING: er blijft ruimte onbenut onder een kleine bron. Wordt dit klein, dan " +
        "vult het beeld de ruimte — dat is de winst van 20.16 AC5; vervang deze nulmeting.",
    ).toBeGreaterThan(100);
  });

  test("NULMETING wedloop — een trage rolcheck kost blijvend hoogte", async ({
    page,
  }) => {
    // Reproduceert bevinding H3 van review-20-15-code DETERMINISTISCH: zolang `/auth/me`
    // loopt staat de melding over beheerdersrechten boven het deck. Meet de kaart op dat
    // moment, dan houdt hij die hoogte permanent af — er wordt alleen bij `resize` hermeten.
    await openDeck(page, { width: 1440, height: 700 }, { authDelayMs: 1500 });

    // Meten TERWIJL de rolcheck nog loopt: de melding staat er dan nog en drukt het deck omlaag.
    const bijMontage = await measureDeckStable(page, {
      forceerHermeting: false,
    });

    // Wachten tot de rolcheck klaar is. De relabel-knop is `disabled={!canMutate}`
    // (MobileReviewDeck.tsx:1378), dus zodra hij bedienbaar wordt is de beheerdersrol binnen
    // en is de melding boven het deck verdwenen.
    await expect(page.getByTestId("deck-relabel-open")).toBeEnabled({
      timeout: 10000,
    });

    // Pas nu een hermeting afdwingen: het verschil is de hoogte die de kaart nooit terugpakt.
    const naHermeting = await measureDeckStable(page, {
      forceerHermeting: true,
    });
    bewaar("wedloop", { bijMontage, naHermeting });

    expect(
      naHermeting.stageFrameHeight - bijMontage.stageFrameHeight,
      "NULMETING: met een trage rolcheck meet de kaart zich te klein en corrigeert dat " +
        "nooit; alleen een afgedwongen hermeting geeft de ruimte terug. Wordt dit rood " +
        "(verschil 0), dan hermeet het scherm zelf — dat is de winst van 20.16 AC7; " +
        "vervang deze nulmeting.",
    ).toBeGreaterThan(0);
  });
});
