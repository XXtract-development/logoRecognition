/**
 * MobileReviewDeck (Story 12.6)
 *
 * A phone-first, one-card-at-a-time review experience for the artwork queue:
 * the crop fills the screen, swipe right = accept (ECHT), left = reject (VALS),
 * or use the large thumb buttons. Auto-advances. The crop is loaded as an
 * authenticated blob (cookie auth via apiClient) so it always renders.
 *
 * Owns its own cursor over a snapshot of the items and calls accept/reject
 * directly, so it is decoupled from the list's optimistic-removal state.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Tag, Typography, Spin, Empty, message } from 'antd';
import { CheckOutlined, CloseOutlined, StepForwardOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  acceptReviewItem,
  rejectReviewItem,
  fetchReviewItemCropBlob,
  type ArtworkReviewItem,
} from '@/services/artworkReviewService';

const { Text } = Typography;

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
  // Snapshot the queue once; the deck drives its own cursor.
  const [queue] = useState<ArtworkReviewItem[]>(items);
  const [idx, setIdx] = useState(0);
  const [echt, setEcht] = useState(0);
  const [vals, setVals] = useState(0);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [cropLoading, setCropLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const urlRef = useRef<string | null>(null);

  const cur = queue[idx];

  // Load the current crop as a blob (revoking the previous object URL).
  useEffect(() => {
    if (!cur) return;
    let active = true;
    setCropLoading(true);
    setCropUrl(null);
    fetchReviewItemCropBlob(cur.id)
      .then((url) => {
        if (!active) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setCropUrl(url);
        setCropLoading(false);
      })
      .catch(() => active && setCropLoading(false));
    return () => {
      active = false;
    };
  }, [cur]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const advance = useCallback(() => {
    setDrag(0);
    setIdx((i) => i + 1);
  }, []);

  const decide = useCallback(
    async (label: 'ECHT' | 'VALS') => {
      if (!cur || busy) return;
      if (!canMutate) {
        message.info(
          t('review.adminOnly', {
            defaultValue: 'Alleen een beheerder kan reviewitems beoordelen',
          })
        );
        return;
      }
      setBusy(true);
      try {
        if (label === 'ECHT') {
          await acceptReviewItem(cur.id);
          setEcht((n) => n + 1);
        } else {
          await rejectReviewItem(cur.id);
          setVals((n) => n + 1);
        }
        advance();
      } catch {
        message.error(t('review.actionError', { defaultValue: 'Actie mislukt — probeer opnieuw' }));
      } finally {
        setBusy(false);
      }
    },
    [cur, busy, canMutate, advance, t]
  );

  // Swipe handling: right = ECHT, left = VALS, up = skip.
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    setDrag(e.touches[0].clientX - touchStart.current.x);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) {
      decide(dx > 0 ? 'ECHT' : 'VALS');
    } else if (dy < -70 && Math.abs(dy) > Math.abs(dx)) {
      advance();
    } else {
      setDrag(0);
    }
  };

  if (idx >= queue.length) {
    return (
      <Empty
        data-testid="review-deck-done"
        description={t('review.deckDone', {
          defaultValue: `Klaar — ${echt} geaccepteerd, ${vals} afgewezen`,
        })}
      />
    );
  }

  const tint = drag > 40 ? '#B7D945' : drag < -40 ? '#D64545' : '#E2E8F0';

  return (
    <div data-testid="mobile-review-deck">
      {/* Progress */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          fontSize: 13,
        }}
      >
        <Text type="secondary">
          {idx + 1} / {queue.length}
        </Text>
        <Text type="secondary">
          <span style={{ color: '#5a8a00', fontWeight: 700 }}>{echt}</span>{' '}
          {t('review.accept', { defaultValue: 'Accepteer' })} ·{' '}
          <span style={{ color: '#D64545' }}>{vals}</span>{' '}
          {t('review.reject', { defaultValue: 'Wijs af' })}
        </Text>
      </div>

      {/* Card */}
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
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <Text strong style={{ color: '#1E293B', fontSize: 16 }}>
            {cur.t3777Code}
          </Text>
          <Tag color={confidenceColor(cur.confidence)} style={{ marginRight: 0 }}>
            {typeof cur.confidence === 'number' ? `${Math.round(cur.confidence * 100)}%` : '—'}
          </Tag>
        </div>
        <div
          style={{
            width: '100%',
            height: '52vh',
            maxHeight: 460,
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
              alt={`${cur.t3777Code} crop`}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          ) : (
            <Text type="secondary">{t('review.cropError', { defaultValue: 'Crop niet beschikbaar' })}</Text>
          )}
        </div>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          GTIN {cur.gtin}
        </Text>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button
          danger
          size="large"
          block
          icon={<CloseOutlined />}
          loading={busy}
          disabled={!canMutate}
          onClick={() => decide('VALS')}
          data-testid="deck-reject"
          style={{ height: 56, fontSize: 16, fontWeight: 600 }}
        >
          {t('review.reject', { defaultValue: 'Wijs af' })}
        </Button>
        <Button
          size="large"
          icon={<StepForwardOutlined />}
          onClick={advance}
          data-testid="deck-skip"
          style={{ height: 56, flex: '0 0 64px' }}
          aria-label={t('review.skip', { defaultValue: 'Sla over' })}
        />
        <Button
          type="primary"
          size="large"
          block
          icon={<CheckOutlined />}
          loading={busy}
          disabled={!canMutate}
          onClick={() => decide('ECHT')}
          data-testid="deck-accept"
          style={{
            height: 56,
            fontSize: 16,
            fontWeight: 700,
            background: canMutate ? '#7BA428' : undefined,
            borderColor: canMutate ? '#7BA428' : undefined,
          }}
        >
          {t('review.accept', { defaultValue: 'Accepteer' })}
        </Button>
      </div>
      <Text
        type="secondary"
        style={{ fontSize: 11, textAlign: 'center', display: 'block', marginTop: 8 }}
      >
        {t('review.swipeHint', { defaultValue: 'swipe → Accepteer · ← Wijs af · ↑ Sla over' })}
      </Text>
    </div>
  );
};

export default React.memo(MobileReviewDeck);
