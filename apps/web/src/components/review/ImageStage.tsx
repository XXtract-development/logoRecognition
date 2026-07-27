import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface Rel {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ImageStageProps {
  src: string;
  alt?: string;
  /** Allow drawing a box (admin + a full artwork to map onto). */
  canDraw?: boolean;
  busy?: boolean;
  hint?: React.ReactNode;
  /** Called with the box as fractions (0..1) of the artwork. */
  onConfirmBox?: (rel: Rel) => void;
  /** Story 12.17 — fires true when a usable (unconfirmed) box is drawn and false
   *  when it is cleared, so the host can route its own primary "accept" action to
   *  confirm the drawn box instead of silently registering the auto-crop. */
  onDraftChange?: (hasDraft: boolean) => void;
  /** Story 12.17 — increment to confirm the currently-drawn box from outside
   *  (e.g. the host's Accept button). Re-runs `confirm`, so the rel is recomputed
   *  live and zoom/pan stay correct. No-op when no box is drawn. */
  confirmToken?: number;
  /** Changing this resets zoom/pan/box (use the item id). */
  resetKey?: string | number;
  /** Story 20.4 — hide the internal "Bevestig kader" button so the HOST's
   *  primary action is the only way to submit a drawn box (the host confirms
   *  via `confirmToken`). Default false: other consumers keep the button. */
  hideConfirm?: boolean;
  /**
   * Story 20.12 — maximale beeldhoogte (CSS-waarde). Default `64vh`: dat is de
   * historische waarde, zodat ANDERE gebruikers van deze component ongemoeid
   * blijven. Het review-deck geeft een ruimere waarde mee zodat een reviewer het
   * keurmerk in één oogopslag ziet i.p.v. per item te moeten inzoomen.
   */
  maxHeight?: string;
  'data-testid'?: string;
}

const ZOOM = 2.6;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Interactive image stage for the review station:
 *  - double-click toggles zoom in/out centred on the click point;
 *  - drag draws a selection box directly on the image — at ANY zoom level, so
 *    you can zoom in on a small mark and box it precisely (no "mark" button);
 *  - hold Space and drag to pan the (zoomed) image;
 *  - a drawn box carries an × (top-right) to remove it, plus a confirm button.
 * The box is tracked in container pixels (correct overlay) and converted to
 * artwork fractions via the live transformed image rect (correct while zoomed).
 */
const ImageStage: React.FC<ImageStageProps> = ({
  src,
  alt,
  canDraw,
  busy,
  hint,
  onConfirmBox,
  onDraftChange,
  confirmToken,
  resetKey,
  hideConfirm,
  maxHeight = '64vh',
  'data-testid': testId,
}) => {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [box, setBox] = useState<Box | null>(null);
  const [space, setSpace] = useState(false);
  const mode = useRef<'idle' | 'pan' | 'draw'>('idle');
  const start = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setBox(null);
  }, [resetKey, src]);

  // Space = temporary pan ("hand") tool while held. Prevent the page from
  // scrolling on Space while the station is mounted.
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpace(true);
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false);
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

  const wrapPos = useCallback((e: React.PointerEvent) => {
    const w = wrapRef.current;
    if (!w) return null;
    const r = w.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const down = useCallback(
    (e: React.PointerEvent) => {
      if (busy) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
      // Pan when holding Space (or when drawing isn't allowed); otherwise draw.
      if (space || !canDraw) {
        mode.current = 'pan';
        start.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        return;
      }
      const p = wrapPos(e);
      if (!p) return;
      mode.current = 'draw';
      start.current = { x: p.x, y: p.y, px: 0, py: 0 };
      setBox({ x: p.x, y: p.y, w: 0, h: 0 });
    },
    [busy, space, canDraw, pan, wrapPos]
  );

  const move = useCallback(
    (e: React.PointerEvent) => {
      if (mode.current === 'idle' || !start.current) return;
      e.preventDefault();
      if (mode.current === 'pan') {
        setPan({
          x: start.current.px + (e.clientX - start.current.x),
          y: start.current.py + (e.clientY - start.current.y),
        });
      } else {
        const p = wrapPos(e);
        if (!p) return;
        const s = start.current;
        setBox({
          x: Math.min(s.x, p.x),
          y: Math.min(s.y, p.y),
          w: Math.abs(p.x - s.x),
          h: Math.abs(p.y - s.y),
        });
      }
    },
    [wrapPos]
  );

  const up = useCallback(() => {
    if (mode.current === 'draw' && box && (box.w < 6 || box.h < 6)) setBox(null);
    mode.current = 'idle';
    start.current = null;
  }, [box]);

  const dbl = useCallback(
    (e: React.MouseEvent) => {
      setBox(null);
      if (scale > 1) {
        setScale(1);
        setPan({ x: 0, y: 0 });
        return;
      }
      const img = imgRef.current;
      if (!img) {
        setScale(ZOOM);
        return;
      }
      const r = img.getBoundingClientRect();
      const cx = e.clientX - (r.left + r.width / 2);
      const cy = e.clientY - (r.top + r.height / 2);
      setScale(ZOOM);
      setPan({ x: -cx * (ZOOM - 1), y: -cy * (ZOOM - 1) });
    },
    [scale]
  );

  // Box (container px) → artwork fractions via the live (transformed) image rect,
  // so a box drawn while zoomed maps to the right spot on the original artwork.
  const confirm = useCallback(() => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap || !box || !onConfirmBox) return;
    const ir = img.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    const left = wr.left + box.x;
    const top = wr.top + box.y;
    const x0 = clamp01((left - ir.left) / ir.width);
    const y0 = clamp01((top - ir.top) / ir.height);
    const x1 = clamp01((left + box.w - ir.left) / ir.width);
    const y1 = clamp01((top + box.h - ir.top) / ir.height);
    const rel = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    if (rel.width < 0.005 || rel.height < 0.005) return;
    onConfirmBox(rel);
  }, [box, onConfirmBox]);

  // Story 12.17 — mirror whether a usable drawn box exists so the host can adapt
  // its primary action. A sub-threshold box counts as "no draft" (matches the
  // `up`/`confirm` min-size guards) so a stray click never arms the host button.
  useEffect(() => {
    onDraftChange?.(!!box && box.w >= 6 && box.h >= 6);
  }, [box, onDraftChange]);

  // Story 12.17 — if the stage unmounts mid-draw (host toggles "Bekijk in
  // context", or navigates to a crop-less item that renders no stage), clear the
  // host's draft flag so its Accept never gets stuck routing to a confirm that
  // has no mounted stage to handle it. Runs on unmount only (onDraftChange is a
  // stable useCallback in the host).
  useEffect(() => {
    return () => onDraftChange?.(false);
  }, [onDraftChange]);

  // Story 12.17 — confirm the current box when the host bumps `confirmToken`
  // (its Accept pressed while a draft box exists). `confirm` is read through a ref
  // so this fires ONLY on token change, never when `box` mutates during drawing.
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  const firstConfirmToken = useRef(true);
  useEffect(() => {
    if (firstConfirmToken.current) {
      firstConfirmToken.current = false;
      return;
    }
    confirmRef.current();
  }, [confirmToken]);

  const cursor = space ? 'grab' : canDraw ? 'crosshair' : 'zoom-in';

  return (
    <div
      // Story 20.3 (review-L3): de marker ook op de buitencontainer, zodat de
      // hint-tekst en de bevestig-knop ONDER de afbeelding binnen de
      // uitgesloten zone vallen (een tap haalt de swipe-drempel toch nooit).
      data-image-stage=""
      style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}
    >
      <div
        ref={wrapRef}
        data-testid={testId}
        // Story 20.3 — stabiele zone-marker: touch-gebaren die hier starten zijn
        // teken-/zoom-gebaren en mogen NOOIT als kaart-swipe (ECHT/VALS) van de
        // review-deck geïnterpreteerd worden (de deck sluit deze zone uit).
        data-image-stage=""
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDoubleClick={dbl}
        title={
          space
            ? t('review.panHint', { defaultValue: 'Sleep om te verschuiven' })
            : canDraw
              ? t('review.drawHint', {
                  defaultValue: 'Sleep om een kader te tekenen · dubbelklik = zoom · spatie + sleep = verschuiven',
                })
              : t('review.zoomDblHint', { defaultValue: 'Dubbelklik om in/uit te zoomen' })
        }
        style={{
          position: 'relative',
          overflow: 'hidden',
          maxWidth: '100%',
          maxHeight,
          borderRadius: 6,
          touchAction: 'none',
          cursor,
        }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          style={{
            display: 'block',
            maxWidth: '100%',
            maxHeight,
            objectFit: 'contain',
            userSelect: 'none',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: mode.current === 'pan' ? 'none' : 'transform .15s ease',
          }}
        />
        {box && (
          <div
            style={{
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              border: '2px solid #D64545',
              background: 'rgba(214,69,69,0.15)',
              boxShadow: '0 0 0 1px #ffffff',
              pointerEvents: 'none',
            }}
          >
            <Button
              size="small"
              danger
              type="primary"
              shape="circle"
              icon={<CloseOutlined />}
              data-testid="stage-box-clear"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setBox(null);
              }}
              style={{
                position: 'absolute',
                top: -12,
                right: -12,
                width: 24,
                height: 24,
                minWidth: 24,
                padding: 0,
                pointerEvents: 'auto',
              }}
            />
          </div>
        )}
      </div>
      {hint}
      {box && onConfirmBox && !hideConfirm && (
        <Button
          type="primary"
          loading={busy}
          onClick={confirm}
          data-testid="stage-confirm"
          style={{ background: '#B7D945', borderColor: '#B7D945', color: '#1E293B' }}
        >
          {t('review.annotateConfirm', { defaultValue: 'Bevestig kader' })}
        </Button>
      )}
    </div>
  );
};

export default ImageStage;
