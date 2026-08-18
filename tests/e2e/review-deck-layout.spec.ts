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
    test(`opmaak ${vp.naam} (${vp.width}x${vp.height}) — alles in beeld, beeld past`, async ({
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

      // 20.16 AC6 — het beeld past binnen zijn kader; niets wordt weggesneden.
      // Vóór 20.16: 1019 px beeld in een kader van 490 (venster 1000) resp. 190 (700).
      expect(
        m.imageHeight,
        `(${vp.naam}) het beeld moet binnen het beeldvenster passen; groter betekent dat ` +
          `overflow: hidden het afsnijdt`,
      ).toBeLessThanOrEqual(m.stageFrameHeight);

      // 20.16 AC2 — ALLE bediening in beeld bij vensterhoogte 1000, dus ook de relabel-knop.
      // Vóór 20.16: laagste bediening op 1129. Bij 700 geldt deze eis BEWUST NIET: daar wint
      // een bruikbaar beeld (ondergrens 400) van alles-in-beeld, en scrollt de pagina (AC5).
      // Dat is de ruil die Friso op 2026-08-17 heeft gekozen.
      if (vp.height >= 1000) {
        expect(
          m.allControlsVisible,
          `(${vp.naam}) alle bediening moet binnen het venster vallen; laagste onderkant ` +
            `${m.lowestControlBottom} bij vensterhoogte ${vp.height}`,
        ).toBe(true);
      } else {
        // De pagina moet dan wél echt kunnen scrollen, anders is de bediening onbereikbaar.
        const scrollbaar = await page.evaluate(
          () => document.documentElement.scrollHeight > window.innerHeight,
        );
        expect(
          scrollbaar,
          `(${vp.naam}) valt de bediening buiten beeld, dan MOET de pagina scrollen`,
        ).toBe(true);
      }

      // 20.16 AC4 — het beeldvenster houdt zijn ondergrens.
      expect(
        m.stageFrameHeight,
        `(${vp.naam}) het beeldvenster mag niet onder de ondergrens van 400 px zakken`,
      ).toBeGreaterThanOrEqual(400);

      // 20.16 AC1 — de compacte bedieningsbalk: onder de kaart hangt nog hooguit 70 px.
      // Vóór 20.16 was dat 145 px (knoprij + relabel-knop op een eigen regel + veeg-hint).
      expect(
        m.controlsBelowCard,
        `(${vp.naam}) onder de kaart mag hooguit 70 px bediening hangen`,
      ).toBeLessThanOrEqual(70);

      // 20.16 AC3 — de bediening zit IN de gemeten kolom, niet als zusje ernaast.
      const bedieningInKolom = await page.evaluate(() => {
        const kolom = document.querySelector('[data-testid="deck-column"]');
        const accept = document.querySelector('[data-testid="deck-accept"]');
        const relabel = document.querySelector('[data-testid="deck-relabel-open"]');
        return (
          !!kolom && !!accept && !!relabel && kolom.contains(accept) && kolom.contains(relabel)
        );
      });
      expect(
        bedieningInKolom,
        `(${vp.naam}) de beslis- en relabel-knop moeten afstammelingen van de gemeten kolom zijn`,
      ).toBe(true);

      // 20.16 AC5 — de kaart loopt niet over: de vaste hoogte van 20.14 duwde inhoud
      // buiten de kaartrand bij een lage viewport.
      expect(
        m.contentWithinCard,
        `(${vp.naam}) de kaartinhoud moet binnen de kaartrand blijven`,
      ).toBe(true);
    });
  }

  test("NULMETING (voor 20.17) — een kleine bron laat ruimte onbenut", async ({
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

    // 20.16 (code-review H2) — de tekenzone mag niet groter zijn dan het beeld. Was hij dat
    // wel, dan levert een sleep die in de grijze band begint een stil bijgeknipt kader op.
    expect(
      m.drawZoneHeight,
      `de tekenzone (${m.drawZoneHeight} px) moet het beeld (${m.imageHeight} px) omsluiten, ` +
        `niet het hele beeldvenster (${m.stageFrameHeight} px)`,
    ).toBeLessThanOrEqual(m.imageHeight + 2);
    // NULMETING VOOR 20.17, niet voor 20.16. Client-side opschalen is bewust GESCHRAPT:
    // het zou de terugrekening van een getekend kader breken (scheve kaders in de database,
    // review-20-16 H3). De winst moet van de serverkant komen — story 20.17.
    expect(
      m.stageFrameHeight - m.imageHeight,
      "NULMETING (20.17): een kleine bron laat ruimte onbenut. Wordt dit klein, dan levert " +
        "de server een groter fragment — dat is de winst van 20.17; vervang deze nulmeting.",
    ).toBeGreaterThan(100);
  });

  test("wedloop — het scherm hermeet zichzelf na een trage rolcheck", async ({
    page,
  }) => {
    // Reproduceert bevinding H3 van review-20-15-code DETERMINISTISCH: zolang `/auth/me`
    // loopt staat de melding over beheerdersrechten boven het deck. Meet de kaart op dat
    // moment, dan houdt hij die hoogte permanent af — er wordt alleen bij `resize` hermeten.
    await openDeck(page, { width: 1440, height: 700 }, { authDelayMs: 1500 });

    // Meten TERWIJL de rolcheck nog loopt. Dit getal is informatief: op dat moment staat de
    // melding over beheerdersrechten er nog en is een kleinere kolom juist CORRECT.
    const tijdensLaden = await measureDeckStable(page, {
      forceerHermeting: false,
    });

    // Wachten tot de rolcheck klaar is. De relabel-knop is `disabled={!canMutate}`, dus zodra
    // hij bedienbaar wordt is de beheerdersrol binnen en is de melding verdwenen.
    await expect(page.getByTestId("deck-relabel-open")).toBeEnabled({
      timeout: 10000,
    });

    // DIT is de eigenlijke vraag: corrigeert het scherm zichzelf, zónder duwtje?
    const naLaden = await measureDeckStable(page, { forceerHermeting: false });
    // ...en wat zou een afgedwongen hermeting nog opleveren? Niets, als het goed is.
    const naDuwtje = await measureDeckStable(page, { forceerHermeting: true });
    bewaar("wedloop", { tijdensLaden, naLaden, naDuwtje });

    // 20.16 AC8 — het scherm hermeet zichzelf zodra de melding boven het deck verdwijnt.
    // Vóór 20.16 was er alleen een meting bij montage plus een listener op `resize`: de
    // kolom bleef 58 px te klein en pakte die nooit terug. De vergelijking hieronder is
    // bewust NIET "tijdens laden" tegenover "erna" — dat verschil hoort er te zijn — maar
    // "vanzelf" tegenover "met een duwtje".
    expect(
      naDuwtje.stageFrameHeight - naLaden.stageFrameHeight,
      `een afgedwongen hermeting mag niets meer opleveren; vanzelf ` +
        `${naLaden.stageFrameHeight} px tegen ${naDuwtje.stageFrameHeight} px na een duwtje`,
    ).toBe(0);
  });
});
