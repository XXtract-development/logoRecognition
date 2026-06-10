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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Tag, Typography, Spin, Empty, Drawer, message } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  LeftOutlined,
  RightOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  acceptReviewItem,
  rejectReviewItem,
  reopenReviewItem,
  fetchReviewItemCropBlob,
  type ArtworkReviewItem,
} from '@/services/artworkReviewService';

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
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const cache = useRef<Record<string, string>>({});

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
                    {it.t3777Code}
                  </Text>
                )}
              </div>
              <Text style={{ fontSize: 10, color: label === 'ECHT' ? '#5a8a00' : '#D64545', fontWeight: 700 }}>
                {label}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text strong style={{ color: '#1E293B', fontSize: 16 }}>
            {cur!.t3777Code}
          </Text>
          <Tag color={confidenceColor(cur!.confidence)} style={{ marginRight: 0 }}>
            {typeof cur!.confidence === 'number' ? `${Math.round(cur!.confidence * 100)}%` : '—'}
          </Tag>
        </div>
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
      <Text type="secondary" style={{ fontSize: 11, textAlign: 'center', display: 'block', marginTop: 8 }}>
        {decision
          ? t('review.changeHint', { defaultValue: 'Tik de gekozen knop nogmaals om ongedaan te maken' })
          : t('review.swipeHint', { defaultValue: 'swipe → Accepteer · ← Wijs af · ‹ › navigeren' })}
      </Text>
      {overviewDrawer}
    </div>
  );
};

export default React.memo(MobileReviewDeck);
