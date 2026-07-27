/**
 * MobileReviewDeck (Story 12.6)
 *
 * Phone-first, one-card-at-a-time review of the artwork queue. The crop fills
 * the screen (loaded as an authenticated blob so it always renders). Swipe
 * right = accept (ECHT), left = reject (VALS), or use the large buttons.
 *
 * Navigation + correction:
 *   - ‹ / › step back and forth through the queue (decisions are remembered).
 *   - On an already-decided card, tapping the OTHER choice changes it (the
 *     previous accept is reopened server-side first, deactivating its training
 *     data); tapping the SAME choice undoes it (back to undecided).
 *   - "Overzicht" shows everything decided this session with thumbnails; tap one
 *     to jump back to it.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Tag, Typography, Spin, Empty, Drawer, Input, message, Modal } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  LeftOutlined,
  RightOutlined,
  UnorderedListOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  acceptReviewItem,
  rejectReviewItem,
  reopenReviewItem,
  annotateReviewItem,
  fetchReviewItemCropBlob,
  fetchReviewItemArtworkBlob,
  fetchReviewItemSourceBlob,
  fetchDeclaredMarks,
  fetchNominationEnabled,
  type ArtworkReviewItem,
  type ReviewRejectReason,
  type ReviewItemSource,
} from '@/services/artworkReviewService';
import { canonicalDeclaredCode } from '@/services/declaredMarks';
import ImageStage from './ImageStage';
import { KEURMERK_CODES } from '@/data/keurmerk-codes';
import { isBeneluxCode } from '@/data/benelux-codes';
import { isLetterlessNutriscore } from '@/data/nutriscore';
import { EXTRA_SPOOR_CODES, spoorLabelForCode, fieldTypeForCode } from '@/data/spoor-codes';

/** Small flag tag marking a Benelux-relevant keurmerk. */
/**
 * Story 20.12 — beeldhoogte in het review-deck.
 *
 * Was `64vh` (de ImageStage-default). Bij een wachtrij van honderden kandidaten
 * dwong dat tot inzoomen per item om te zien óf het kader om het juiste logo zit —
 * precies het oordeel dat de reviewer moet vellen.
 *
 * Bewust `calc(100vh - …)` en géén vh-breuk: de ruimte die de koptekst en de
 * knoppen "Wijs af"/"Accepteer" nodig hebben is een VAST aantal pixels, geen
 * percentage. Met `80vh` zou het beeld op een laag scherm de knoppen wegduwen en
 * op een hoog scherm juist ruimte laten liggen. Deze vorm reserveert altijd
 * evenveel chrome en schaalt de rest mee. De knoppen blijven zo zonder scrollen
 * bereikbaar, ook op ~900px hoog (AC2).
 */
const DECK_MAX_IMAGE_HEIGHT = 'calc(100vh - 260px)';

/**
 * Story 20.14 — marge onder de kaart zodat de rand niet tegen de vensterrand plakt.
 * Dit is de ENIGE vaste maat in de fill-stand; de rest wordt gemeten. Story 20.12
 * strandde juist op vaste maten (`maxHeight: 440` knipte het beeld af).
 */
const FILL_BOTTOM_GAP = 16;
/** Ondergrens: bij een heel lage viewport liever scrollen dan een onbruikbaar beeld. */
const FILL_MIN_CARD_HEIGHT = 320;

const BeneluxTag: React.FC<{ small?: boolean }> = ({ small }) => (
  <Tag
    color="#2F5A7A"
    style={{ marginLeft: 6, marginRight: 0, fontSize: small ? 10 : 11, lineHeight: '16px', padding: '0 6px' }}
  >
    🇧🇪🇳🇱 Benelux
  </Tag>
);

const { Text } = Typography;
type Label = 'ECHT' | 'VALS';

interface MobileReviewDeckProps {
  items: ArtworkReviewItem[];
  canMutate: boolean;
  /**
   * Story 20.14 — laat de kaart de resterende schermhoogte vullen (desktop).
   * Uit (default) = het oude mobiele gedrag: wrapper 48vh / maxHeight 440.
   * Bewust een expliciete prop en NIET `isCoarsePointer()`: dat zegt iets over
   * het aanwijsapparaat, niet over de schermgrootte (touchscreen-laptops).
   */
  fillViewport?: boolean;
}

function confidenceColor(c: number | null): string {
  if (typeof c !== 'number') return '#94A3B8';
  if (c >= 0.85) return '#B7D945';
  if (c >= 0.7) return '#54949E';
  return '#D64545';
}

/**
 * Reference-logo thumbnail for the keurmerk picker — so the reviewer recognises
 * a code by its logo, not just its name. Collapses to a blank placeholder (keeps
 * row alignment) when a code has no reference image.
 */
const RefThumb: React.FC<{ code: string }> = ({ code }) => {
  const [err, setErr] = useState(false);
  if (err) {
    return <span style={{ width: 32, height: 32, flex: '0 0 32px', marginRight: 8 }} />;
  }
  return (
    <img
      src={`/api/v1/reference-logos/code/${encodeURIComponent(code)}/image`}
      onError={() => setErr(true)}
      alt=""
      style={{ width: 32, height: 32, objectFit: 'contain', flex: '0 0 32px', marginRight: 8 }}
    />
  );
};

// Story 20.3 — aanraakapparaat-detectie voor touch-passende bedieningshints.
// Defensief: jsdom/oudere browsers hebben geen matchMedia.
function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

const MobileReviewDeck: React.FC<MobileReviewDeckProps> = ({ items, canMutate, fillViewport }) => {
  const { t } = useTranslation();
  const [queue] = useState<ArtworkReviewItem[]>(items);
  const [idx, setIdx] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, Label>>({});
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [cropIsArtwork, setCropIsArtwork] = useState(false);
  const [cropLoading, setCropLoading] = useState(false);
  // For candidates we show the full pack with the proposed region boxed (verify
  // the RIGHT logo at a glance); fall back to the bare crop if that fails to load.
  const [markedError, setMarkedError] = useState(false);
  // Reference image ("this is what {code} looks like"); hidden if none exists.
  const [refError, setRefError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(0);
  const [overview, setOverview] = useState(false);
  // Story 20.14 — de kaart vult de ruimte tot onder aan het venster. We MÉTEN
  // waar de kaart begint in plaats van de opmaak erboven te schatten: elke
  // geschatte aftrekking veroudert zodra er een regel bijkomt (zo ontstond de
  // 440 die het beeld afknipte).
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!fillViewport) {
      setCardHeight(null);
      return;
    }
    const measure = () => {
      const el = cardRef.current;
      if (!el) return;
      // rect.top is VENSTER-relatief; `window.innerHeight` ook. Niet corrigeren
      // met scrollY — dat mengt document- en venstercoördinaten en levert bij een
      // gescrollde pagina een te kleine kaart op.
      const avail = window.innerHeight - el.getBoundingClientRect().top - FILL_BOTTOM_GAP;
      setCardHeight(Math.max(FILL_MIN_CARD_HEIGHT, Math.round(avail)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [fillViewport]);
  // Story 14.1 — reviewstation reason-choice at reject, ONLY when the flywheel
  // main flag is on (runtime-switchable via server). Default false = legacy.
  const [flywheelOn, setFlywheelOn] = useState(false);
  // Holds the item id awaiting a reject-reason choice (null = modal closed).
  const [rejectReasonFor, setRejectReasonFor] = useState<string | null>(null);
  // Code correction: when a crop is a real keurmerk but a DIFFERENT one than
  // predicted, the picker assigns the right code and accepts under it.
  const [assignedCode, setAssignedCode] = useState<Record<string, string>>({});
  // Story 20.4 — code die is KLAARGEZET (picker-keuze terwijl een onbevestigd
  // kader klaarstaat) maar nog niet ingediend; pas de hoofdknop dient hem in.
  const [stagedCode, setStagedCode] = useState<Record<string, string>>({});
  // Story 20.5 — versie per item, opgehoogd na een succesvolle annotate. Gebruikt
  // om (a) de gecachete crop-blob te invalideren en (b) de /marked-URL te
  // cache-busten, zodat revisit de OPGESLAGEN correctie toont i.p.v. de auto-crop.
  const [editedVersion, setEditedVersion] = useState<Record<string, number>>({});
  // applyDecision staat vóór relabel in declaratievolgorde; via een ref kan de
  // accept-zonder-kader-maar-met-klaargezette-code-tak het relabel-indienpad
  // aanroepen zonder herordening van de bestaande callbacks.
  const relabelRef = useRef<((code: string) => Promise<void>) | null>(null);
  // Story 12.14 — remembers a drawn-but-not-yet-code-combined kader per item, so
  // that whichever order the reviewer works in (kader→code or code→kader), the
  // SECOND action can combine with the first via annotateReviewItem(id, rel,
  // code) instead of losing one half to the auto-crop / bestaande code.
  const [pendingRel, setPendingRel] = useState<
    Record<string, { x: number; y: number; width: number; height: number }>
  >({});
  // Story 12.17 — a box drawn in ImageStage lives inside that component until the
  // reviewer confirms it. Mirror its presence so the primary Accept button
  // confirms THAT drawn box (→ annotate) instead of silently registering the
  // auto-crop, which previously discarded the drawn box on item advance and could
  // register a false-positive auto-crop as a live reference.
  const [hasDraftBox, setHasDraftBox] = useState(false);
  const [confirmBoxToken, setConfirmBoxToken] = useState(0);
  const onDraftChange = useCallback((h: boolean) => setHasDraftBox(h), []);
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState('');
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const cache = useRef<Record<string, string>>({});
  // Remembers which cached media URLs are the full-artwork fallback (no crop)
  // rather than a real detected crop, so the hint renders on cache hits too.
  const artworkCache = useRef<Record<string, boolean>>({});
  // Story 12.7 — declared GS1 marks of the current GTIN as a label-prior.
  // `has` = a real declaration exists (reason 'ok'); without it we show nothing
  // (graceful fallback). Cached per GTIN (queue repeats GTINs heavily).
  const [declared, setDeclared] = useState<{ codes: Set<string>; has: boolean }>({
    codes: new Set(),
    has: false,
  });
  const declaredCache = useRef<Record<string, { codes: string[]; has: boolean }>>({});
  // "Bekijk in context": show the full source artwork with the bbox highlighted,
  // so partial/tight crops (cut exactly on the proposed box) stay interpretable.
  const [context, setContext] = useState(false);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [srcLoading, setSrcLoading] = useState(false);
  // Story 12.19 — the context fragment's mapping back to the full artwork
  // ([left,top,rw,rh,W,H] in artwork pixels), so a box drawn ON the context view
  // converts to full-artwork fractions. Null = the view is the whole artwork.
  const [srcWindow, setSrcWindow] = useState<number[] | null>(null);
  const srcCache = useRef<Record<string, ReviewItemSource>>({});

  // The FULL code universe across ALL recognised GS1 sporen — 884 T3777 +
  // Nutri-Score (keurmerk-codes.ts) PLUS DietTypeCode (incl. LACTOSE_FREE), GHS
  // and consumer-usage codes (spoor-codes.ts) — plus any code present in the
  // queue, so any crop can be coupled to the correct code regardless of spoor.
  const codes = useMemo(
    () =>
      Array.from(
        new Set([...KEURMERK_CODES, ...EXTRA_SPOOR_CODES, ...queue.map((q) => q.t3777Code)])
      )
        // Story 12.20 — the letter-independent placeholder is not a selectable
        // keurmerk; keep it out of the relabel picker so it is never offered or
        // pinned (the reviewer picks a real NUTRISCORE_<letter> instead).
        .filter((c) => !isLetterlessNutriscore(c))
        .sort(),
    [queue]
  );

  const cur: ArtworkReviewItem | undefined = queue[idx];

  // Story 12.20 — display label for a code: the letter-independent Nutri-Score
  // placeholder ('NUTRISCORE') reads as a broken code, so show a "pick the letter"
  // label everywhere it surfaces (main card + overview). Real codes unchanged.
  const labelForCode = useCallback(
    (code: string) =>
      isLetterlessNutriscore(code)
        ? t('review.nutriscorePickLetter', { defaultValue: 'Nutri-Score — kies de letter' })
        : code,
    [t]
  );

  // Story 20.5 — invalidatie na een correctie: revoke + wis de blob-cache en
  // hoog de item-versie op (bust van de /marked-URL). loadCrop haalt daardoor bij
  // terugkeer de nieuwe crop op en het pack toont het bijgewerkte kader.
  const bumpEdited = useCallback((id: string) => {
    if (cache.current[id]) {
      try {
        URL.revokeObjectURL(cache.current[id]);
      } catch {
        /* no-op */
      }
      delete cache.current[id];
    }
    delete artworkCache.current[id];
    setMarkedError(false);
    setEditedVersion((v) => ({ ...v, [id]: (v[id] ?? 0) + 1 }));
  }, []);

  const loadCrop = useCallback((id: string) => {
    if (cache.current[id]) {
      setCropUrl(cache.current[id]);
      setCropIsArtwork(!!artworkCache.current[id]);
      setCropLoading(false);
      return;
    }
    setCropLoading(true);
    setCropUrl(null);
    setCropIsArtwork(false);
    let active = true;
    // Detected crop first; if the item has none ("declared but not found"),
    // fall back to the full artwork by GTIN so the reviewer can hunt for the
    // declared keurmerk instead of seeing an empty "Crop niet beschikbaar".
    fetchReviewItemCropBlob(id)
      .then((url) => (url ? { url, isArtwork: false } : fetchReviewItemArtworkBlob(id).then((a) => (a ? { url: a, isArtwork: true } : null))))
      .then((res) => {
        if (res) {
          cache.current[id] = res.url;
          artworkCache.current[id] = res.isArtwork;
        }
        if (active) {
          setCropUrl(res?.url ?? null);
          setCropIsArtwork(res?.isArtwork ?? false);
          setCropLoading(false);
        }
      })
      .catch(() => active && setCropLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setMarkedError(false);
    setRefError(false);
    if (cur) loadCrop(cur.id);
  }, [cur, loadCrop]);

  // Load the GTIN's declared marks (label-prior). Per-GTIN cached; fail-safe.
  useEffect(() => {
    const gtin = cur?.gtin;
    if (!gtin) {
      setDeclared({ codes: new Set(), has: false });
      return;
    }
    const cached = declaredCache.current[gtin];
    if (cached) {
      setDeclared({ codes: new Set(cached.codes), has: cached.has });
      return;
    }
    let active = true;
    fetchDeclaredMarks(gtin).then((res) => {
      const has = res.reason === 'ok' && res.marks.length > 0;
      // Story 12.18 — canonicalise so Nutri-Score letters (bare 'D') match the
      // review item's full code ('NUTRISCORE_D'); otherwise the prior always reads
      // as "niet gedeclareerd" for Nutri-Score.
      const codes = res.marks.map(canonicalDeclaredCode);
      declaredCache.current[gtin] = { codes, has };
      if (active) setDeclared({ codes: new Set(codes), has });
    });
    return () => {
      active = false;
    };
  }, [cur?.gtin]);

  // Load the source artwork (for the context overlay) only when context view is
  // on. Cached per item; the bbox overlay is computed from the loaded natural
  // size so it lines up regardless of display scale.
  useEffect(() => {
    if (!context || !cur) {
      setSrcUrl(null);
      setSrcWindow(null);
      return;
    }
    const id = cur.id;
    const cached = srcCache.current[id];
    if (cached) {
      setSrcUrl(cached.url);
      setSrcWindow(cached.window);
      return;
    }
    setSrcLoading(true);
    setSrcUrl(null);
    setSrcWindow(null);
    let active = true;
    fetchReviewItemSourceBlob(id)
      .then((src) => {
        if (src) srcCache.current[id] = src;
        if (active) {
          setSrcUrl(src?.url ?? null);
          setSrcWindow(src?.window ?? null);
          setSrcLoading(false);
        }
      })
      .catch(() => active && setSrcLoading(false));
    return () => {
      active = false;
    };
  }, [context, cur?.id]);

  // Revoke cached source object URLs on unmount.
  useEffect(
    () => () => {
      Object.values(srcCache.current).forEach((s) => URL.revokeObjectURL(s.url));
    },
    []
  );

  // Revoke all cached object URLs on unmount.
  useEffect(
    () => () => {
      Object.values(cache.current).forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  const goto = useCallback(
    (i: number) => {
      setDrag(0);
      setIdx(Math.max(0, Math.min(queue.length, i)));
    },
    [queue.length]
  );

  // Story 14.1 — read the flywheel main flag once so the reject reason-choice
  // only shows when it is on. Fail-safe: any error → stays false (legacy).
  useEffect(() => {
    let alive = true;
    void fetchNominationEnabled().then((on) => {
      if (alive) setFlywheelOn(on);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Commit a reject with an explicit reason (Story 14.1). Kept separate so both
  // the reason-choice modal and the (flag-off) legacy path funnel through the
  // same decision/queue bookkeeping.
  const commitReject = useCallback(
    async (reason?: ReviewRejectReason) => {
      if (!cur) return;
      const prev = decisions[cur.id];
      setBusy(true);
      try {
        if (prev) {
          // Changing a previous decision → reopen first (clears training data).
          await reopenReviewItem(cur.id);
        }
        await rejectReviewItem(cur.id, reason);
        setDecisions((d) => ({ ...d, [cur.id]: 'VALS' }));
        // Story 12.14 fix — a reject via the reason modal finalises the item
        // WITHOUT going through the combine paths (relabel/applyAnnotation), so
        // any code/kader that was pending for this item is now abandoned. Clear
        // both to prevent a later relabel/kader action from silently reattaching
        // a stale box or code the reviewer never confirmed together (see review
        // finding: reject after a drawn kader must not resurrect that kader).
        setAssignedCode((a) => {
          if (!(cur.id in a)) return a;
          const next = { ...a };
          delete next[cur.id];
          return next;
        });
        setStagedCode((s0) => {
          if (!(cur.id in s0)) return s0;
          const next = { ...s0 };
          delete next[cur.id];
          return next;
        });
        setPendingRel((p) => {
          if (!(cur.id in p)) return p;
          const next = { ...p };
          delete next[cur.id];
          return next;
        });
        setRejectReasonFor(null);
        if (!prev) goto(idx + 1);
        else setDrag(0);
      } catch {
        message.error(t('review.actionError', { defaultValue: 'Actie mislukt — probeer opnieuw' }));
      } finally {
        setBusy(false);
      }
    },
    [cur, decisions, idx, goto, t]
  );

  const applyDecision = useCallback(
    async (label: Label) => {
      if (!cur || busy) return;
      if (!canMutate) {
        message.info(
          t('review.adminOnly', { defaultValue: 'Alleen een beheerder kan reviewitems beoordelen' })
        );
        return;
      }
      const prev = decisions[cur.id];

      // Story 14.1 — a fresh reject with the flag on asks WHY: "geen keurmerk"
      // (→ gold-set VALS + hard-negative) vs "onjuiste locatie/verkeerde code"
      // (→ no registers). Re-rejecting the same item is an undo → skip the modal.
      if (label === 'VALS' && flywheelOn && prev !== 'VALS') {
        setRejectReasonFor(cur.id);
        return;
      }

      // Story 12.17 — a reviewer-drawn (but not yet confirmed) correction box must
      // win over the auto-crop for ANY accept entry point — button, swipe AND the
      // "A" keyboard shortcut all funnel through here. Route to the stage's own
      // confirm (→ applyAnnotation registers the DRAWN crop) and stop, so an
      // accept can never silently register the auto-crop while a box is drawn.
      // Story 20.5 (review-6) — een getekend kader op een letterloze Nutri-Score
      // placeholder mag NOOIT onder de niet-bestaande 'NUTRISCORE'-code landen;
      // de knop zegt "kies de letter", dus stuur naar de picker i.p.v. indienen.
      const effCode = stagedCode[cur.id] ?? assignedCode[cur.id] ?? cur.t3777Code;
      if (label === 'ECHT' && hasDraftBox && isLetterlessNutriscore(effCode)) {
        setSearch('');
        setPicker(true);
        message.info(
          t('review.pickLetterFirst', {
            defaultValue: 'Kies eerst de Nutri-Score-letter voor dit kader',
          })
        );
        return;
      }
      if (label === 'ECHT' && hasDraftBox) {
        setConfirmBoxToken((n) => n + 1);
        return;
      }
      // Story 20.4 — the box was cleared but a staged code remains: accepting
      // must honor that code (relabel submit path) instead of silently
      // registering under the predicted code. Review-M1: NIET wanneer de kaart
      // al op ECHT staat — dan betekent nogmaals drukken "ongedaan maken" en
      // moet de undo-tak hieronder gewoon zijn werk doen.
      if (label === 'ECHT' && stagedCode[cur.id] && prev !== 'ECHT') {
        void relabelRef.current?.(stagedCode[cur.id]);
        return;
      }

      setBusy(true);
      try {
        if (prev === label) {
          // Same choice again → undo (back to undecided).
          await reopenReviewItem(cur.id);
          setDecisions((d) => {
            const next = { ...d };
            delete next[cur.id];
            return next;
          });
          setAssignedCode((a) => {
            const next = { ...a };
            delete next[cur.id];
            return next;
          });
          setStagedCode((s0) => {
            const next = { ...s0 };
            delete next[cur.id];
            return next;
          });
          setPendingRel((p) => {
            const next = { ...p };
            delete next[cur.id];
            return next;
          });
          message.success(t('review.undone', { defaultValue: 'Ongedaan gemaakt' }));
          setDrag(0);
          return;
        }
        if (prev) {
          // Changing a previous decision → reopen first (clears training data).
          await reopenReviewItem(cur.id);
        }
        if (label === 'ECHT') await acceptReviewItem(cur.id);
        else await rejectReviewItem(cur.id);
        setDecisions((d) => ({ ...d, [cur.id]: label }));
        // Story 12.14 fix — a plain accept/reject via this button finalises the
        // item WITHOUT going through the combine paths (relabel/applyAnnotation),
        // so any code/kader still pending for this item is now abandoned. Clear
        // both — otherwise a LATER relabel or kader draw on this same item would
        // silently reattach a stale box or code from before this decision-switch
        // (e.g. draw kader → reject → relabel would wrongly reuse the abandoned
        // kader; relabel → reject → draw a new kader would wrongly reuse the
        // abandoned code). The undo branch above already clears both for the
        // same-choice-again case.
        setAssignedCode((a) => {
          if (!(cur.id in a)) return a;
          const next = { ...a };
          delete next[cur.id];
          return next;
        });
        setStagedCode((s0) => {
          if (!(cur.id in s0)) return s0;
          const next = { ...s0 };
          delete next[cur.id];
          return next;
        });
        setPendingRel((p) => {
          if (!(cur.id in p)) return p;
          const next = { ...p };
          delete next[cur.id];
          return next;
        });
        if (!prev) goto(idx + 1);
        else setDrag(0);
      } catch {
        message.error(t('review.actionError', { defaultValue: 'Actie mislukt — probeer opnieuw' }));
      } finally {
        setBusy(false);
      }
    },
    [cur, busy, canMutate, decisions, idx, goto, t, flywheelOn, hasDraftBox, stagedCode, assignedCode]
  );

  const applyAnnotation = useCallback(
    async (rel: { x: number; y: number; width: number; height: number }) => {
      if (!cur || busy) return;
      setBusy(true);
      // Story 12.14 — if a code was already chosen for this item (code-then-kader
      // order), combine the drawn kader with that code in one annotate call so
      // the registered reference is the drawn crop UNDER the chosen code, not
      // the bestaande/predicted code.
      // Story 20.4 — a staged (not yet submitted) code wins over an earlier
      // applied one; on success it is promoted to assignedCode.
      const code = stagedCode[cur.id] ?? assignedCode[cur.id];
      try {
        // Keep the "no code" call at its existing arity (2 args) — some tests /
        // API mocks assert exact call shape, and a plain kader-only annotate
        // must remain byte-identical to today (AC3).
        if (code) await annotateReviewItem(cur.id, rel, code);
        else await annotateReviewItem(cur.id, rel);
        setPendingRel((p) => {
          const next = { ...p };
          if (code) delete next[cur.id];
          // No code yet — remember the kader so a SUBSEQUENT code pick
          // (relabel, kader-then-code order) can combine with it.
          else next[cur.id] = rel;
          return next;
        });
        setDecisions((d) => ({ ...d, [cur.id]: 'ECHT' }));
        bumpEdited(cur.id);
        if (code) {
          setAssignedCode((a) => ({ ...a, [cur.id]: code }));
          setStagedCode((s0) => {
            if (!(cur.id in s0)) return s0;
            const next = { ...s0 };
            delete next[cur.id];
            return next;
          });
        }
        message.success(
          code
            ? t('review.annotatedWithCode', {
                defaultValue: 'Keurmerk gemarkeerd op je kader en gekoppeld aan {{code}}',
                code,
              })
            : t('review.annotated', {
                defaultValue: 'Keurmerk gemarkeerd en als trainingsdata geregistreerd',
              })
        );
        goto(idx + 1);
      } catch {
        message.error(t('review.actionError', { defaultValue: 'Actie mislukt — probeer opnieuw' }));
      } finally {
        setBusy(false);
      }
    },
    [cur, busy, idx, goto, t, assignedCode, stagedCode, bumpEdited]
  );

  // Story 12.19 — a box drawn on the "bekijk in context" fragment is in FRAGMENT
  // fractions; convert to full-artwork fractions via the fragment window
  // ([left,top,rw,rh,W,H] in artwork pixels) before annotating. No window (the
  // view is the whole artwork) → the rel is already full-artwork fractions.
  const applyContextAnnotation = useCallback(
    (rel: { x: number; y: number; width: number; height: number }) => {
      const w = srcWindow;
      if (!w || w.length < 6 || !(w[4] > 0) || !(w[5] > 0)) {
        void applyAnnotation(rel);
        return;
      }
      const [left, top, rw, rh, W, H] = w;
      void applyAnnotation({
        x: (left + rel.x * rw) / W,
        y: (top + rel.y * rh) / H,
        width: (rel.width * rw) / W,
        height: (rel.height * rh) / H,
      });
    },
    [srcWindow, applyAnnotation]
  );

  // Accept the crop under a corrected keurmerk code (different from predicted).
  const relabel = useCallback(
    async (code: string) => {
      if (!cur || busy) return;
      if (!canMutate) {
        message.info(
          t('review.adminOnly', { defaultValue: 'Alleen een beheerder kan reviewitems beoordelen' })
        );
        return;
      }
      const prev = decisions[cur.id];
      // Story 20.4 — while an UNCONFIRMED drawn box exists, a picker choice only
      // STAGES the code: nothing is submitted until the (retitled) main accept
      // button confirms box + code together. Submitting here would register the
      // AUTO-crop and advance — exactly the premature-approve Friso reported.
      if (hasDraftBox) {
        setStagedCode((a) => ({ ...a, [cur.id]: code }));
        setPicker(false);
        setSearch('');
        message.success(
          t('review.codeStaged', {
            defaultValue: '{{code}} klaargezet — bevestig met de goedkeurknop',
            code,
          })
        );
        return;
      }
      // Story 12.14 — a kader drawn earlier for this item (kader-then-code
      // order) is remembered in pendingRel; combine it with the chosen code via
      // annotate instead of accepting under the (auto-crop) accept-endpoint.
      const rel = pendingRel[cur.id];
      setBusy(true);
      try {
        if (prev) await reopenReviewItem(cur.id);
        if (rel) {
          await annotateReviewItem(cur.id, rel, code);
          bumpEdited(cur.id);
          setPendingRel((p) => {
            const next = { ...p };
            delete next[cur.id];
            return next;
          });
        } else {
          await acceptReviewItem(cur.id, code);
        }
        setDecisions((d) => ({ ...d, [cur.id]: 'ECHT' }));
        setAssignedCode((a) => ({ ...a, [cur.id]: code }));
        setStagedCode((s0) => {
          if (!(cur.id in s0)) return s0;
          const next = { ...s0 };
          delete next[cur.id];
          return next;
        });
        setPicker(false);
        setSearch('');
        message.success(
          rel
            ? t('review.annotatedWithCode', {
                defaultValue: 'Keurmerk gemarkeerd op je kader en gekoppeld aan {{code}}',
                code,
              })
            : t('review.relabeled', { defaultValue: 'Gekoppeld aan {{code}}', code })
        );
        if (!prev) goto(idx + 1);
        else setDrag(0);
      } catch {
        message.error(t('review.actionError', { defaultValue: 'Actie mislukt — probeer opnieuw' }));
      } finally {
        setBusy(false);
      }
    },
    [cur, busy, canMutate, decisions, pendingRel, hasDraftBox, idx, goto, t, bumpEdited]
  );
  relabelRef.current = relabel;

  // Keyboard shortcuts — fast desktop review with minimal clicks. Ignored while
  // typing in the relabel search; Esc closes the picker / draw mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const typing =
        !!tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable);
      if (picker) {
        if (e.key === 'Escape') setPicker(false);
        return; // the picker owns the keyboard while open
      }
      if (typing || !cur || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'a':
        case 'A':
          e.preventDefault();
          applyDecision('ECHT');
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          applyDecision('VALS');
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          setPicker(true);
          break;
        case 'u':
        case 'U':
          if (decisions[cur.id]) {
            e.preventDefault();
            applyDecision(decisions[cur.id]); // same choice again = undo
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goto(idx - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          goto(idx + 1);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cur, idx, picker, canMutate, decisions, applyDecision, goto]);

  const onTouchStart = (e: React.TouchEvent) => {
    // Story 20.3 — een gebaar dat in een teken-/zoom-zone (ImageStage) start is
    // een KADER- of zoombeweging, geen kaart-swipe: volledig negeren, anders
    // veegt een horizontaal getekend kader de kaart weg als beslissing.
    // Review-H1: óók ontwapenen bij multi-touch — e.touches[0] is de EERSTE
    // vinger; een tweede vinger buiten de stage zou de swipe anders
    // her-bewapenen op de coördinaten van de tekenende vinger.
    // Review-M2: drag altijd terugzetten, anders blijft de kaart scheef staan
    // (met accept-tint) na een halverwege genegeerd gebaar.
    if (
      e.touches.length !== 1 ||
      (e.target as HTMLElement | null)?.closest?.('[data-image-stage]')
    ) {
      touchStart.current = null;
      setDrag(0);
      return;
    }
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStart.current) setDrag(e.touches[0].clientX - touchStart.current.x);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) applyDecision(dx > 0 ? 'ECHT' : 'VALS');
    else setDrag(0);
  };

  const echt = Object.values(decisions).filter((d) => d === 'ECHT').length;
  const vals = Object.values(decisions).filter((d) => d === 'VALS').length;
  const decidedList = queue
    .map((it, i) => ({ it, i, label: decisions[it.id] }))
    .filter((x) => x.label);

  const OverviewBtn = (
    <Button
      icon={<UnorderedListOutlined />}
      size="small"
      onClick={() => setOverview(true)}
      data-testid="deck-overview-open"
    >
      {t('review.overview', { defaultValue: 'Overzicht' })} ({decidedList.length})
    </Button>
  );

  const overviewDrawer = (
    <Drawer
      title={t('review.overviewTitle', { defaultValue: 'Wat je hebt gedaan' })}
      placement="bottom"
      height="70%"
      open={overview}
      onClose={() => setOverview(false)}
      data-testid="deck-overview"
    >
      {decidedList.length === 0 ? (
        <Empty description={t('review.overviewEmpty', { defaultValue: 'Nog niets beoordeeld' })} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {decidedList.map(({ it, i, label }) => (
            <div
              key={it.id}
              onClick={() => {
                setOverview(false);
                goto(i);
              }}
              style={{
                border: `2px solid ${label === 'ECHT' ? '#B7D945' : '#D64545'}`,
                borderRadius: 8,
                padding: 4,
                textAlign: 'center',
                cursor: 'pointer',
                background: '#fff',
              }}
            >
              <div style={{ height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {cache.current[it.id] ? (
                  <img
                    src={cache.current[it.id]}
                    alt={labelForCode(assignedCode[it.id] ?? it.t3777Code)}
                    style={{ maxWidth: '100%', maxHeight: 84, objectFit: 'contain' }}
                  />
                ) : (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {labelForCode(assignedCode[it.id] ?? it.t3777Code)}
                  </Text>
                )}
              </div>
              <Text
                style={{ fontSize: 9, color: '#64748b', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {labelForCode(assignedCode[it.id] ?? it.t3777Code)}
              </Text>
              <Text style={{ fontSize: 10, color: label === 'ECHT' ? '#5a8a00' : '#D64545', fontWeight: 700 }}>
                {label}
                {assignedCode[it.id] ? ` · ${t('review.corrected', { defaultValue: '(gecorrigeerd)' })}` : ''}
              </Text>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );

  // Story 14.1 — reason-choice at reject (only reachable when the flywheel flag
  // is on; applyDecision gates the open). "geen keurmerk" feeds the gold-set as
  // VALS and blocks the image forever; "onjuiste locatie/verkeerde code" only
  // rejects (the image is fine, just mis-assigned).
  const rejectReasonModal = (
    <Modal
      title={t('review.rejectReasonTitle', { defaultValue: 'Waarom afwijzen?' })}
      open={rejectReasonFor !== null}
      onCancel={() => setRejectReasonFor(null)}
      footer={null}
      data-testid="reject-reason-modal"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Button
          block
          danger
          disabled={busy}
          data-testid="reject-reason-geen-keurmerk"
          onClick={() => void commitReject('geen-keurmerk')}
        >
          {t('review.rejectReasonGeenKeurmerk', { defaultValue: 'Geen keurmerk' })}
        </Button>
        <Button
          block
          disabled={busy}
          data-testid="reject-reason-onjuiste-locatie"
          onClick={() => void commitReject('onjuiste-locatie-verkeerde-code')}
        >
          {t('review.rejectReasonOnjuisteLocatie', {
            defaultValue: 'Onjuiste locatie / verkeerde code',
          })}
        </Button>
      </div>
    </Modal>
  );

  if (idx >= queue.length) {
    return (
      <div data-testid="review-deck-done">
        <Empty
          description={t('review.deckDone', {
            defaultValue: `Klaar — ${echt} geaccepteerd, ${vals} afgewezen`,
          })}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
          <Button icon={<LeftOutlined />} onClick={() => goto(idx - 1)}>
            {t('review.back', { defaultValue: 'Terug' })}
          </Button>
          {OverviewBtn}
        </div>
        {overviewDrawer}
        {rejectReasonModal}
      </div>
    );
  }

  const decision = decisions[cur!.id];
  const shownCode = assignedCode[cur!.id] ?? cur!.t3777Code;
  const relabeled = Boolean(assignedCode[cur!.id]);
  // Story 12.20 — the letter-independent Nutri-Score placeholder ('NUTRISCORE',
  // shape-harvest 12.12) is not a real code; show a clear "pick the letter" label
  // + hint instead of the raw code so a reviewer knows to assign A–E. Only the
  // DISPLAY changes; `shownCode` (used for refs/relabel/logic) is untouched. Once
  // the reviewer relabels to a real NUTRISCORE_<letter>, this no longer applies.
  const letterless = !relabeled && isLetterlessNutriscore(shownCode);
  const codeLabel = labelForCode(shownCode);
  // Candidate (has a detected crop) with a usable bbox → show the proposed region
  // boxed on the full pack so the reviewer verifies the RIGHT logo before accepting.
  const bb = cur!.bbox as { x?: number; y?: number; width?: number; height?: number } | undefined;
  const hasBbox =
    !!bb &&
    [bb.x, bb.y, bb.width, bb.height].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    (bb.width as number) > 0 &&
    (bb.height as number) > 0;
  const markedSrc =
    cur!.cropPath && hasBbox && !markedError
      ? `/api/v1/artwork/review-items/${cur!.id}/marked${
          editedVersion[cur!.id] ? `?v=${editedVersion[cur!.id]}` : ''
        }`
      : null;
  // Reference image of the (possibly relabeled) code — "this is what to look for".
  // Story 20.8 — de URL blijft altijd staan (het endpoint valt terug op een
  // GS1-gids-voorbeeld als er geen echte referentie is); pas als óók dat 404't
  // (`refError`) tonen we een placeholder i.p.v. de rij te verbergen.
  const refSrc = `/api/v1/reference-logos/code/${encodeURIComponent(shownCode)}/image`;
  // Searchable pick list over the FULL code universe: filter by query, pin the
  // predicted code on top, cap the rendered count so 889 codes stay fast.
  const pickQuery = search.trim().toLowerCase();
  const pickFiltered = pickQuery ? codes.filter((c) => c.toLowerCase().includes(pickQuery)) : codes;
  const pickPred = cur!.t3777Code;
  const pickList = [
    ...(pickFiltered.includes(pickPred) ? [pickPred] : []),
    // Declared-on-pack codes first (Story 12.7 prior), then Benelux-relevant —
    // stable sort keeps alphabetical within each group.
    ...pickFiltered
      .filter((c) => c !== pickPred)
      .sort(
        (a, b) =>
          Number(declared.codes.has(b)) - Number(declared.codes.has(a)) ||
          Number(isBeneluxCode(b)) - Number(isBeneluxCode(a))
      ),
  ].slice(0, 80);
  const tint = drag > 40 ? '#B7D945' : drag < -40 ? '#D64545' : decision === 'ECHT' ? '#B7D945' : decision === 'VALS' ? '#D64545' : '#E2E8F0';

  return (
    <div data-testid="mobile-review-deck">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {idx + 1} / {queue.length} &nbsp;·&nbsp;
          <span style={{ color: '#5a8a00', fontWeight: 700 }}>{echt}</span> ✓ &nbsp;
          <span style={{ color: '#D64545' }}>{vals}</span> ✗
        </Text>
        {OverviewBtn}
      </div>
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
        <span data-testid="deck-shortcuts-hint">
          {isCoarsePointer()
            ? t('review.shortcutsTouch', {
                defaultValue:
                  'Veeg = goedkeuren/afwijzen · sleep op de afbeelding = kader tekenen · dubbeltik = zoom',
              })
            : t('review.shortcuts', {
                defaultValue:
                  'Sneltoetsen: A goedkeuren · R afwijzen · L ander keurmerk · ←/→ navigeren · sleep = kader tekenen · dubbelklik = zoom (dan slepen = verschuiven)',
              })}
        </span>
      </Text>

      <div
        ref={cardRef}
        data-testid="deck-swipe-card"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          border: `4px solid ${tint}`,
          borderRadius: 16,
          background: '#fff',
          padding: 12,
          transform: `translateX(${drag * 0.4}px) rotate(${drag * 0.02}deg)`,
          transition: touchStart.current ? 'none' : 'transform .15s, border-color .15s',
          boxShadow: '0 6px 24px #0002',
          touchAction: 'pan-y',
          position: 'relative',
          // Story 20.14 — kolom met gemeten hoogte: de kop- en knoprijen houden hun
          // eigen hoogte, het beeldvenster (flex: 1) krijgt exact wat overblijft.
          // Daardoor blijven de knoppen per definitie in beeld (AC4).
          ...(cardHeight
            ? { display: 'flex', flexDirection: 'column' as const, height: cardHeight }
            : {}),
        }}
      >
        {decision && (
          <Tag
            color={decision === 'ECHT' ? '#B7D945' : '#D64545'}
            style={{ position: 'absolute', top: 16, right: 16, zIndex: 2, fontWeight: 700, color: decision === 'ECHT' ? '#1E293B' : '#fff' }}
          >
            {decision}
          </Tag>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
          <Text strong style={{ color: relabeled ? '#2F5A7A' : '#1E293B', fontSize: 16 }}>
            {codeLabel}
            {!letterless && isBeneluxCode(shownCode) && <BeneluxTag />}
            {relabeled && (
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>
                {t('review.corrected', { defaultValue: '(gecorrigeerd)' })}
              </Text>
            )}
          </Text>
          <Tag color={confidenceColor(cur!.confidence)} style={{ marginRight: 0 }}>
            {typeof cur!.confidence === 'number' ? `${Math.round(cur!.confidence * 100)}%` : '—'}
          </Tag>
        </div>
        {/* Story 12.20 — the shape harvest found a Nutri-Score logo but not its
            letter; tell the reviewer to assign the grade (or reject if it's an
            already-covered letter) instead of leaving the raw placeholder. */}
        {letterless && (
          <div
            data-testid="deck-letterless-hint"
            style={{
              marginBottom: 8,
              padding: '6px 10px',
              background: '#FEF6E7',
              border: '1px solid #E8A33D',
              borderRadius: 6,
              fontSize: 12,
              color: '#1E293B',
            }}
          >
            {t('review.nutriscoreLetterlessHint', {
              defaultValue:
                'Nutri-Score-vorm herkend, maar de letter is nog niet bepaald. Kies de juiste letter (A–E) via "Ander keurmerk koppelen" — of wijs af als die letter al gedekt is.',
            })}
          </div>
        )}
        {/* Reference image of the keurmerk to look for — so the reviewer never
            has to guess what {code} looks like. Story 20.8: ALTIJD getoond voor
            een echte code (endpoint valt terug op een GS1-gids-voorbeeld); alleen
            als óók dat 404't tonen we een placeholder i.p.v. de rij te verbergen.
            Letterloze Nutri-Score-placeholder heeft geen zinvol voorbeeld. */}
        {!letterless && (
          <div
            data-testid="deck-reference-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              padding: 6,
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 6,
            }}
          >
            {refError ? (
              <>
                <div
                  data-testid="deck-reference-placeholder"
                  style={{
                    height: 44,
                    width: 44,
                    flex: '0 0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px dashed #94A3B8',
                    borderRadius: 6,
                    color: '#94A3B8',
                    fontSize: 20,
                  }}
                >
                  ?
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('review.noReferenceImage', {
                    defaultValue: 'Geen voorbeeld beschikbaar — zoek op de naam hierboven',
                  })}
                </Text>
              </>
            ) : (
              <>
                <img
                  data-testid="deck-reference"
                  src={refSrc}
                  onError={() => setRefError(true)}
                  alt={`${shownCode} referentie`}
                  style={{ height: 44, width: 44, objectFit: 'contain', flex: '0 0 auto' }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('review.lookForThis', { defaultValue: 'Zoek dit keurmerk op de verpakking' })}
                </Text>
              </>
            )}
          </div>
        )}
        {/* Story 12.7 — label-prior: only shown when the GTIN has a declaration.
            Story 12.20 — suppressed for the letterless placeholder: `declared.codes`
            holds NUTRISCORE_<letter>, never the bare 'NUTRISCORE', so it would
            always read "niet gedeclareerd" — a misleading signal next to the
            "pick the letter" hint. */}
        {declared.has && !letterless && (
          <div style={{ marginBottom: 8 }} data-testid="deck-prior">
            {declared.codes.has(shownCode) ? (
              <Tag color="#B7D945" style={{ color: '#1E293B' }}>
                {t('review.priorDeclared', { defaultValue: '✓ gedeclareerd op verpakking' })}
              </Tag>
            ) : (
              <Tag color="#E8A33D" style={{ color: '#1E293B' }}>
                {t('review.priorNotDeclared', { defaultValue: '⚠ niet gedeclareerd op deze GTIN' })}
              </Tag>
            )}
          </div>
        )}
        {/* "Bekijk in context": only when the item carries a usable bbox. */}
        {cur!.bbox && typeof cur!.bbox.width === 'number' && (cur!.bbox.width ?? 0) > 0 && (
          <div style={{ textAlign: 'right', marginBottom: 6 }}>
            <Button
              size="small"
              type={context ? 'primary' : 'default'}
              onClick={() => setContext((v) => !v)}
              data-testid="deck-context-toggle"
            >
              {context
                ? t('review.showCrop', { defaultValue: 'Toon uitsnede' })
                : t('review.showContext', { defaultValue: '🔍 Bekijk in context' })}
            </Button>
          </div>
        )}
        <div
          data-testid="deck-stage-frame"
          style={{
            width: '100%',
            // Story 20.14 — in de fill-stand géén vaste hoogte: `flex: 1` pakt de
            // restruimte van de kaart, `minHeight: 0` is nodig omdat een flex-item
            // anders niet kleiner wordt dan zijn inhoud en de knoppen wegduwt.
            // Mobiel (cardHeight === null) blijft exact op 48vh / 440 (AC6).
            ...(cardHeight
              ? { flex: 1, minHeight: 0 }
              : { height: '48vh', maxHeight: 440 }),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          {context ? (
            srcLoading ? (
              <Spin />
            ) : srcUrl ? (
              // Story 12.19 — the server returns a downscaled context fragment
              // with the proposed box drawn (red). Render it in a drawable stage
              // so the reviewer can box the logo directly here; a box drawn on the
              // fragment is converted back to full-artwork fractions before
              // annotating (applyContextAnnotation via the X-Context-Window map).
              <ImageStage
                data-testid="deck-context"
                maxHeight={cardHeight ? '100%' : DECK_MAX_IMAGE_HEIGHT}
                hideConfirm
                src={srcUrl}
                alt={`${cur!.t3777Code} context`}
                canDraw={canMutate}
                busy={busy}
                resetKey={`ctx:${cur!.id}`}
                onConfirmBox={applyContextAnnotation}
                onDraftChange={onDraftChange}
                confirmToken={confirmBoxToken}
                hint={
                  <Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
                    {isCoarsePointer()
                      ? t('review.contextDrawHintTouch', {
                          defaultValue:
                            'Rood kader = voorgestelde plek. Sleep met je vinger een kader om het keurmerk te markeren · dubbeltik = zoom.',
                        })
                      : t('review.contextDrawHint', {
                          defaultValue:
                            'Rood kader = voorgestelde plek. Sleep hier een kader om het keurmerk te markeren · dubbelklik = zoom.',
                        })}
                  </Text>
                }
              />
            ) : (
              <Text type="secondary">
                {t('review.sourceError', { defaultValue: 'Bronafbeelding niet beschikbaar' })}
              </Text>
            )
          ) : cropLoading && !markedSrc ? (
            <Spin />
          ) : markedSrc || cropUrl ? (
            <ImageStage
              data-testid="deck-stage"
              maxHeight={cardHeight ? '100%' : DECK_MAX_IMAGE_HEIGHT}
              hideConfirm
              src={(markedSrc ?? cropUrl) as string}
              alt={cur!.t3777Code}
              canDraw={canMutate && (!!markedSrc || cropIsArtwork)}
              busy={busy}
              resetKey={cur!.id}
              onConfirmBox={applyAnnotation}
              onDraftChange={onDraftChange}
              confirmToken={confirmBoxToken}
              hint={
                markedSrc ? (
                  <Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
                    {t('review.markedHint', {
                      defaultValue:
                        'Rood kader = voorgestelde plek. Sleep een nieuw kader om te corrigeren · dubbelklik = zoom.',
                    })}
                  </Text>
                ) : cropIsArtwork ? (
                  <Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
                    {t('review.artworkFallback', {
                      defaultValue:
                        'Niet gedetecteerd — sleep een kader om het keurmerk · dubbelklik = zoom.',
                    })}
                  </Text>
                ) : null
              }
            />
          ) : (
            <Text type="secondary">{t('review.cropError', { defaultValue: 'Crop niet beschikbaar' })}</Text>
          )}
        </div>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          GTIN {cur!.gtin}
        </Text>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'stretch' }}>
        <Button
          icon={<LeftOutlined />}
          disabled={idx === 0}
          onClick={() => goto(idx - 1)}
          data-testid="deck-back"
          style={{ height: 56, flex: '0 0 48px' }}
          aria-label={t('review.back', { defaultValue: 'Terug' })}
        />
        <Button
          danger={decision !== 'VALS'}
          type={decision === 'VALS' ? 'primary' : 'default'}
          size="large"
          block
          icon={<CloseOutlined />}
          loading={busy}
          disabled={!canMutate}
          onClick={() => applyDecision('VALS')}
          data-testid="deck-reject"
          style={{ height: 56, fontSize: 16, fontWeight: 600, ...(decision === 'VALS' ? { background: '#D64545', borderColor: '#D64545' } : {}) }}
        >
          {t('review.reject', { defaultValue: 'Wijs af' })}
        </Button>
        <Button
          type="primary"
          size="large"
          block
          icon={<CheckOutlined />}
          loading={busy}
          disabled={!canMutate}
          // Story 12.17 — a single accept path (applyDecision) decides button vs
          // swipe vs keyboard uniformly: while an unconfirmed drawn box exists it
          // confirms THAT box (→ annotate) instead of the auto-crop. The label
          // switches so it is unambiguous which crop is saved.
          onClick={() => applyDecision('ECHT')}
          data-testid="deck-accept"
          style={{
            height: 56,
            fontSize: 16,
            fontWeight: 700,
            background: canMutate ? (decision === 'ECHT' ? '#5a8a00' : '#7BA428') : undefined,
            borderColor: canMutate ? (decision === 'ECHT' ? '#5a8a00' : '#7BA428') : undefined,
          }}
        >
          {hasDraftBox
            ? cur && stagedCode[cur.id]
              ? t('review.acceptDrawnBoxAs', {
                  defaultValue: 'Bevestig kader als {{code}}',
                  code: stagedCode[cur.id],
                })
              : letterless
                ? t('review.acceptDrawnBoxPickLetter', {
                    defaultValue: 'Bevestig kader — kies de letter',
                  })
                : // Story 20.5 — toon de code die wordt opgeslagen (de voorspelde/
                  // effectieve code), zodat niets stilzwijgend onder een verkeerd
                  // keurmerk belandt; de picker ernaast wijzigt hem.
                  t('review.acceptDrawnBoxAs', {
                    defaultValue: 'Bevestig kader als {{code}}',
                    code: shownCode,
                  })
            : cur && stagedCode[cur.id]
              ? t('review.acceptAs', {
                  defaultValue: 'Accepteer als {{code}}',
                  code: stagedCode[cur.id],
                })
              : t('review.accept', { defaultValue: 'Accepteer' })}
        </Button>
        <Button
          icon={<RightOutlined />}
          onClick={() => goto(idx + 1)}
          data-testid="deck-next"
          style={{ height: 56, flex: '0 0 48px' }}
          aria-label={t('review.next', { defaultValue: 'Volgende' })}
        />
      </div>

      {/* Marking is now direct: drag a box on the image above (no button). */}
      <Button
        block
        icon={<TagsOutlined />}
        onClick={() => {
          setSearch('');
          setPicker(true);
        }}
        disabled={!canMutate}
        data-testid="deck-relabel-open"
        style={{ marginTop: 8, height: 44, color: '#2F5A7A', borderColor: '#54949E' }}
      >
        {t('review.relabel', { defaultValue: 'Ander keurmerk koppelen' })}
      </Button>

      <Text type="secondary" style={{ fontSize: 11, textAlign: 'center', display: 'block', marginTop: 8 }}>
        {decision
          ? t('review.changeHint', { defaultValue: 'Tik de gekozen knop nogmaals om ongedaan te maken' })
          : t('review.swipeHint', { defaultValue: 'swipe → Accepteer · ← Wijs af · ‹ › navigeren' })}
      </Text>

      <Drawer
        title={t('review.relabelTitle', { defaultValue: 'Koppel het juiste keurmerk' })}
        placement="bottom"
        height="72%"
        open={picker}
        onClose={() => setPicker(false)}
        data-testid="deck-relabel"
      >
        <Input.Search
          allowClear
          autoFocus
          placeholder={t('review.relabelSearch', { defaultValue: 'Zoek keurmerk…' })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          {pickQuery
            ? t('review.relabelCount', { defaultValue: '{{n}} resultaten', n: pickFiltered.length })
            : t('review.relabelTotal', { defaultValue: '{{n}} keurmerken — typ om te zoeken', n: codes.length })}
        </Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pickList.map((c) => (
            <Button
              key={c}
              block
              size="large"
              loading={busy}
              onClick={() => relabel(c)}
              data-testid="deck-relabel-option"
              style={{
                height: 52,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                fontWeight: c === cur!.t3777Code ? 700 : 500,
                borderColor: c === shownCode ? '#7BA428' : '#E2E8F0',
              }}
            >
              <RefThumb code={c} />
              {c}
              <Tag
                color={fieldTypeForCode(c) === 'PackagingMarkedLabelAccreditationCode' ? 'default' : '#54949E'}
                style={{ marginLeft: 8, fontSize: 10, lineHeight: '16px', padding: '0 6px' }}
              >
                {spoorLabelForCode(c)}
              </Tag>
              {declared.codes.has(c) && (
                <Tag color="#B7D945" style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px', padding: '0 6px', color: '#1E293B' }}>
                  {t('review.declared', { defaultValue: 'gedeclareerd' })}
                </Tag>
              )}
              {isBeneluxCode(c) && <BeneluxTag small />}
              {c === cur!.t3777Code && (
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                  {t('review.predicted', { defaultValue: '(voorspeld)' })}
                </Text>
              )}
            </Button>
          ))}
          {pickFiltered.length > pickList.length && (
            <Text type="secondary" style={{ fontSize: 11, textAlign: 'center' }}>
              {t('review.relabelMore', {
                defaultValue: '…{{n}} meer — verfijn je zoekopdracht',
                n: pickFiltered.length - pickList.length,
              })}
            </Text>
          )}
        </div>
      </Drawer>

      {overviewDrawer}
      {rejectReasonModal}
    </div>
  );
};

export default React.memo(MobileReviewDeck);
