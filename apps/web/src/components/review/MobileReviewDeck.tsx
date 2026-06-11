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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Tag, Typography, Spin, Empty, Drawer, Input, message } from 'antd';
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
  fetchReviewItemCropBlob,
  fetchDeclaredMarks,
  type ArtworkReviewItem,
} from '@/services/artworkReviewService';
import { KEURMERK_CODES } from '@/data/keurmerk-codes';
import { isBeneluxCode } from '@/data/benelux-codes';
import { EXTRA_SPOOR_CODES, spoorLabelForCode, fieldTypeForCode } from '@/data/spoor-codes';

/** Small flag tag marking a Benelux-relevant keurmerk. */
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
}

function confidenceColor(c: number | null): string {
  if (typeof c !== 'number') return '#94A3B8';
  if (c >= 0.85) return '#B7D945';
  if (c >= 0.7) return '#54949E';
  return '#D64545';
}

const MobileReviewDeck: React.FC<MobileReviewDeckProps> = ({ items, canMutate }) => {
  const { t } = useTranslation();
  const [queue] = useState<ArtworkReviewItem[]>(items);
  const [idx, setIdx] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, Label>>({});
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [cropLoading, setCropLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(0);
  const [overview, setOverview] = useState(false);
  // Code correction: when a crop is a real keurmerk but a DIFFERENT one than
  // predicted, the picker assigns the right code and accepts under it.
  const [assignedCode, setAssignedCode] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState('');
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const cache = useRef<Record<string, string>>({});
  // Story 12.7 — declared GS1 marks of the current GTIN as a label-prior.
  // `has` = a real declaration exists (reason 'ok'); without it we show nothing
  // (graceful fallback). Cached per GTIN (queue repeats GTINs heavily).
  const [declared, setDeclared] = useState<{ codes: Set<string>; has: boolean }>({
    codes: new Set(),
    has: false,
  });
  const declaredCache = useRef<Record<string, { codes: string[]; has: boolean }>>({});

  // The FULL code universe across ALL recognised GS1 sporen — 884 T3777 +
  // Nutri-Score (keurmerk-codes.ts) PLUS DietTypeCode (incl. LACTOSE_FREE), GHS
  // and consumer-usage codes (spoor-codes.ts) — plus any code present in the
  // queue, so any crop can be coupled to the correct code regardless of spoor.
  const codes = useMemo(
    () =>
      Array.from(
        new Set([...KEURMERK_CODES, ...EXTRA_SPOOR_CODES, ...queue.map((q) => q.t3777Code)])
      ).sort(),
    [queue]
  );

  const cur: ArtworkReviewItem | undefined = queue[idx];

  const loadCrop = useCallback((id: string) => {
    if (cache.current[id]) {
      setCropUrl(cache.current[id]);
      setCropLoading(false);
      return;
    }
    setCropLoading(true);
    setCropUrl(null);
    let active = true;
    fetchReviewItemCropBlob(id)
      .then((url) => {
        if (url) cache.current[id] = url;
        if (active) {
          setCropUrl(url);
          setCropLoading(false);
        }
      })
      .catch(() => active && setCropLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
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
      const codes = res.marks.map((m) => m.code);
      declaredCache.current[gtin] = { codes, has };
      if (active) setDeclared({ codes: new Set(codes), has });
    });
    return () => {
      active = false;
    };
  }, [cur?.gtin]);

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
        if (!prev) goto(idx + 1);
        else setDrag(0);
      } catch {
        message.error(t('review.actionError', { defaultValue: 'Actie mislukt — probeer opnieuw' }));
      } finally {
        setBusy(false);
      }
    },
    [cur, busy, canMutate, decisions, idx, goto, t]
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
      setBusy(true);
      try {
        if (prev) await reopenReviewItem(cur.id);
        await acceptReviewItem(cur.id, code);
        setDecisions((d) => ({ ...d, [cur.id]: 'ECHT' }));
        setAssignedCode((a) => ({ ...a, [cur.id]: code }));
        setPicker(false);
        setSearch('');
        message.success(
          t('review.relabeled', { defaultValue: 'Gekoppeld aan {{code}}', code })
        );
        if (!prev) goto(idx + 1);
        else setDrag(0);
      } catch {
        message.error(t('review.actionError', { defaultValue: 'Actie mislukt — probeer opnieuw' }));
      } finally {
        setBusy(false);
      }
    },
    [cur, busy, canMutate, decisions, idx, goto, t]
  );

  const onTouchStart = (e: React.TouchEvent) => {
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
                    alt={it.t3777Code}
                    style={{ maxWidth: '100%', maxHeight: 84, objectFit: 'contain' }}
                  />
                ) : (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {assignedCode[it.id] ?? it.t3777Code}
                  </Text>
                )}
              </div>
              <Text
                style={{ fontSize: 9, color: '#64748b', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {assignedCode[it.id] ?? it.t3777Code}
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
      </div>
    );
  }

  const decision = decisions[cur!.id];
  const shownCode = assignedCode[cur!.id] ?? cur!.t3777Code;
  const relabeled = Boolean(assignedCode[cur!.id]);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {idx + 1} / {queue.length} &nbsp;·&nbsp;
          <span style={{ color: '#5a8a00', fontWeight: 700 }}>{echt}</span> ✓ &nbsp;
          <span style={{ color: '#D64545' }}>{vals}</span> ✗
        </Text>
        {OverviewBtn}
      </div>

      <div
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
            {shownCode}
            {isBeneluxCode(shownCode) && <BeneluxTag />}
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
        {/* Story 12.7 — label-prior: only shown when the GTIN has a declaration. */}
        {declared.has && (
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
        <div
          style={{
            width: '100%',
            height: '48vh',
            maxHeight: 440,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          {cropLoading ? (
            <Spin />
          ) : cropUrl ? (
            <img
              data-testid="deck-crop"
              src={cropUrl}
              alt={`${cur!.t3777Code} crop`}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
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
          {t('review.accept', { defaultValue: 'Accepteer' })}
        </Button>
        <Button
          icon={<RightOutlined />}
          onClick={() => goto(idx + 1)}
          data-testid="deck-next"
          style={{ height: 56, flex: '0 0 48px' }}
          aria-label={t('review.next', { defaultValue: 'Volgende' })}
        />
      </div>
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
                justifyContent: 'flex-start',
                fontWeight: c === cur!.t3777Code ? 700 : 500,
                borderColor: c === shownCode ? '#7BA428' : '#E2E8F0',
              }}
            >
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
    </div>
  );
};

export default React.memo(MobileReviewDeck);
