/**
 * ArtworkReviewPage (Epic 8, Story 8.5 — AC3)
 *
 * The artwork review queue: open review items produced by the T3777 crosscheck
 * (auto-accept handles the matches; only discrepancies land here). Each item
 * shows its proposed label, confidence, detection method, discrepancy reason
 * and — on view — the crop preview plus full provenance (source file + bbox).
 *
 * ADMIN users can accept (→ training-data registration) or reject items, plus
 * run a catch-up pass over previously-accepted items. Non-admins see a
 * read-only queue (actions disabled; the backend is the real guard).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Typography,
  Space,
  Empty,
  Spin,
  Alert,
  Button,
  Tag,
  Card,
  message,
  Segmented,
} from 'antd';
import { ReloadOutlined, SyncOutlined, LoginOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  fetchReviewQueue,
  fetchUncertainPredictions,
  processAcceptedReviewItems,
  type ArtworkReviewItem,
  type UncertainPrediction,
} from '@/services/artworkReviewService';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { isBeneluxCode } from '@/data/benelux-codes';
import MobileReviewDeck from '@/components/review/MobileReviewDeck';

const { Title, Paragraph } = Typography;

const ArtworkReviewPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useCurrentUser();
  // Tighter padding and full-width header actions on phones; desktop unchanged.
  const isMobile = useMediaQuery('(max-width: 768px)');
  // Focus filter: default to the 12.6 keurmerk acceptance candidates so the queue
  // is immediately usable, instead of the thousands of bulk-run items.
  const [filter, setFilter] = useState<'km' | 'all'>('km');
  const [items, setItems] = useState<ArtworkReviewItem[]>([]);
  const [uncertain, setUncertain] = useState<UncertainPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Distinguishes a session/auth failure (401) from a generic load error so we
  // can show a "log in" prompt instead of a raw error + retry that loops.
  const [authError, setAuthError] = useState(false);
  const [catchUpBusy, setCatchUpBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAuthError(false);
    try {
      // Both review sources are fetched together. The artwork queue is the
      // primary actionable source; the uncertainty queue is shown read-only
      // alongside it (Story 8.5 Task 2 — one page, two source-labeled sections).
      // The uncertainty fetch is best-effort: it must not break the page.
      const [artwork, uncertainItems] = await Promise.all([
        fetchReviewQueue(filter === 'km' ? { q: '12.6' } : undefined),
        fetchUncertainPredictions().catch(() => [] as UncertainPrediction[]),
      ]);
      // Automatic queue focus: Benelux-scope keurmerken first, then the rest;
      // within each group keep the API's confidence-desc order.
      const beneluxFirst = [...artwork].sort(
        (a, b) =>
          Number(isBeneluxCode(b.t3777Code)) - Number(isBeneluxCode(a.t3777Code)) ||
          (b.confidence ?? 0) - (a.confidence ?? 0)
      );
      setItems(beneluxFirst);
      setUncertain(uncertainItems);
    } catch (err) {
      // A 401 means the session expired / the user is not logged in: show a
      // dedicated login prompt rather than a generic error with a retry loop.
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setAuthError(true);
      } else {
        setError(
          t('review.loadError', { defaultValue: 'Ophalen van de reviewqueue mislukt' })
        );
      }
    } finally {
      setLoading(false);
    }
  }, [t, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCatchUp = useCallback(async () => {
    setCatchUpBusy(true);
    try {
      const result = await processAcceptedReviewItems();
      message.success(
        t('review.catchUpDone', {
          defaultValue: '{{registered}} geregistreerd, {{skipped}} overgeslagen',
          registered: result.registered,
          skipped: result.skipped,
        })
      );
    } catch {
      message.error(
        t('review.actionError', { defaultValue: 'Actie mislukt — probeer opnieuw' })
      );
    } finally {
      setCatchUpBusy(false);
    }
  }, [t]);

  return (
    <div
      data-testid="artwork-review-page"
      style={{ padding: isMobile ? 12 : 24, color: '#1E293B' }}
    >
      <Space
        align="start"
        style={{
          justifyContent: 'space-between',
          width: '100%',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <Title
            level={2}
            style={{ color: '#2F5A7A', marginBottom: 4, fontSize: isMobile ? 22 : undefined }}
          >
            {t('review.title', { defaultValue: 'Artwork-review' })}
          </Title>
          <Paragraph type="secondary" style={{ maxWidth: 640 }}>
            {t('review.description', {
              defaultValue:
                'Beoordeel keurmerk-detecties die niet automatisch konden worden bevestigd. Per item zie je de herkomst (bronbestand en coördinaten) en de reden van de discrepantie.',
            })}
          </Paragraph>
        </div>
        <Space wrap>
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as 'km' | 'all')}
            data-testid="review-filter"
            options={[
              { label: t('review.filterKeurmerk', { defaultValue: 'Keurmerk-kandidaten' }), value: 'km' },
              { label: t('review.filterAll', { defaultValue: 'Alle items' }), value: 'all' },
            ]}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={load}
            data-testid="review-refresh"
          >
            {t('review.refresh', { defaultValue: 'Vernieuw' })}
          </Button>
          {isAdmin && (
            <Button
              icon={<SyncOutlined />}
              loading={catchUpBusy}
              onClick={handleCatchUp}
              data-testid="review-catchup"
            >
              {t('review.catchUp', { defaultValue: 'Verwerk geaccepteerde' })}
            </Button>
          )}
        </Space>
      </Space>

      {!isAdmin && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('review.readOnly', {
            defaultValue: 'Je bekijkt de reviewqueue. Beoordelen vereist beheerdersrechten.',
          })}
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : authError ? (
        <Alert
          type="warning"
          showIcon
          data-testid="review-auth-error"
          message={t('review.authRequired', {
            defaultValue: 'Je bent niet (meer) ingelogd',
          })}
          description={t('review.authRequiredBody', {
            defaultValue: 'Log opnieuw in om de reviewqueue te bekijken.',
          })}
          action={
            <Button
              type="primary"
              icon={<LoginOutlined />}
              data-testid="review-login"
              onClick={() => navigate('/login')}
              style={{ background: '#2F5A7A', borderColor: '#2F5A7A' }}
            >
              {t('auth.login', { defaultValue: 'Inloggen' })}
            </Button>
          }
        />
      ) : error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          data-testid="review-error"
          action={
            <Button size="small" onClick={load}>
              {t('review.retry', { defaultValue: 'Opnieuw' })}
            </Button>
          }
        />
      ) : items.length === 0 && uncertain.length === 0 ? (
        <Empty
          data-testid="review-empty"
          description={t('review.empty', {
            defaultValue: 'Geen openstaande reviewitems',
          })}
        />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* Source 1 — artwork crosscheck review items (actionable). */}
          <div data-testid="review-section-artwork">
            <Space align="center" style={{ marginBottom: 8 }}>
              <Tag color="#2F5A7A">
                {t('review.sourceArtwork', { defaultValue: 'Artwork' })}
              </Tag>
              <Typography.Text type="secondary">
                {items.length}{' '}
                {t('review.openItems', { defaultValue: 'openstaande items' })}
              </Typography.Text>
            </Space>
            {items.length === 0 ? (
              <Empty
                description={t('review.noArtworkItems', {
                  defaultValue: 'Geen openstaande artwork-reviewitems',
                })}
              />
            ) : (
              // Focused review station — one item at a time, full-focus, keyboard
              // shortcuts + auto-advance. Same component on desktop and mobile;
              // centred and capped on desktop so it reads as a workstation.
              <div style={{ maxWidth: isMobile ? '100%' : 880, margin: '0 auto' }}>
                <MobileReviewDeck
                  key={`deck-${filter}-${items[0]?.id ?? 'none'}`}
                  items={items}
                  canMutate={isAdmin}
                />
              </div>
            )}
          </div>

          {/* Source 2 — uncertain recognition predictions (read-only). */}
          {uncertain.length > 0 && (
            <div data-testid="review-section-feedback">
              <Space align="center" style={{ marginBottom: 8 }}>
                <Tag color="#54949E">
                  {t('review.sourceFeedback', { defaultValue: 'Feedback' })}
                </Tag>
                <Typography.Text type="secondary">
                  {uncertain.length}{' '}
                  {t('review.uncertainItems', { defaultValue: 'onzekere voorspellingen' })}
                </Typography.Text>
              </Space>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {uncertain.map((u) => (
                  <Card
                    key={u.resultId}
                    size="small"
                    data-testid="uncertain-item"
                    style={{ borderColor: '#E2E8F0' }}
                  >
                    <Space wrap align="center">
                      <Typography.Text strong style={{ color: '#1E293B' }}>
                        {u.logo?.name ?? u.prediction.value ?? u.prediction.category}
                      </Typography.Text>
                      <Tag color="#54949E">
                        {t('review.confidence', { defaultValue: 'Confidence' })}:{' '}
                        {Math.round((u.prediction.confidence ?? 0) * 100)}%
                      </Tag>
                    </Space>
                  </Card>
                ))}
              </Space>
            </div>
          )}
        </Space>
      )}
    </div>
  );
};

export default React.memo(ArtworkReviewPage);
