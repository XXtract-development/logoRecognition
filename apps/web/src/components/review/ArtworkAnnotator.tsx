import React, { useCallback, useRef, useState } from 'react';
import { Button, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ArtworkAnnotatorProps {
  /** Full-artwork image URL to draw on (cookie-auth, same-origin streaming URL). */
  imageUrl: string;
  /** Called with the box as fractions (0..1) of the rendered image. */
  onConfirm: (rel: { x: number; y: number; width: number; height: number }) => void;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * Draw-a-box annotator: the reviewer drags a rectangle around the keurmerk on
 * the full packaging. The box is captured as fractions of the rendered image so
 * the backend can map it onto the original-resolution artwork — turning a missed
 * detection into a verified, located training crop. Works with mouse and touch.
 */
const ArtworkAnnotator: React.FC<ArtworkAnnotatorProps> = ({ imageUrl, onConfirm, onCancel, busy }) => {
  const { t } = useTranslation();
  const imgRef = useRef<HTMLImageElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [drawing, setDrawing] = useState(false);

  const localPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const pt = 'touches' in e ? e.touches[0] ?? null : (e as React.MouseEvent);
    if (!pt) return null;
    return {
      x: Math.max(0, Math.min(pt.clientX - r.left, r.width)),
      y: Math.max(0, Math.min(pt.clientY - r.top, r.height)),
      W: r.width,
      H: r.height,
    };
  }, []);

  const down = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const p = localPos(e);
      if (!p) return;
      startRef.current = { x: p.x, y: p.y };
      setBox({ x: p.x, y: p.y, w: 0, h: 0 });
      setDrawing(true);
    },
    [localPos]
  );

  const move = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!drawing) return;
      const p = localPos(e);
      const s = startRef.current;
      if (!p || !s) return;
      e.preventDefault();
      setBox({
        x: Math.min(s.x, p.x),
        y: Math.min(s.y, p.y),
        w: Math.abs(p.x - s.x),
        h: Math.abs(p.y - s.y),
      });
    },
    [drawing, localPos]
  );

  const up = useCallback(() => setDrawing(false), []);

  const confirm = useCallback(() => {
    const img = imgRef.current;
    if (!img || !box) return;
    const r = img.getBoundingClientRect();
    const rel = {
      x: box.x / r.width,
      y: box.y / r.height,
      width: box.w / r.width,
      height: box.h / r.height,
    };
    if (rel.width < 0.005 || rel.height < 0.005) return; // ignore stray taps
    onConfirm(rel);
  }, [box, onConfirm]);

  const tooSmall = !box || box.w < 6 || box.h < 6;

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Text type="secondary">
        {t('review.annotateHint', {
          defaultValue: 'Sleep een kader om het keurmerk op de verpakking.',
        })}
      </Text>
      <div
        style={{
          position: 'relative',
          display: 'inline-block',
          maxWidth: '100%',
          touchAction: 'none',
          cursor: 'crosshair',
          lineHeight: 0,
        }}
        onMouseDown={down}
        onMouseMove={move}
        onMouseUp={up}
        onMouseLeave={up}
        onTouchStart={down}
        onTouchMove={move}
        onTouchEnd={up}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="artwork"
          draggable={false}
          style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', userSelect: 'none' }}
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
          />
        )}
      </div>
      <Space wrap>
        <Button
          type="primary"
          disabled={tooSmall || busy}
          loading={busy}
          onClick={confirm}
          style={{ background: '#B7D945', borderColor: '#B7D945', color: '#1E293B' }}
        >
          {t('review.annotateConfirm', { defaultValue: 'Bevestig kader' })}
        </Button>
        <Button onClick={() => setBox(null)} disabled={busy}>
          {t('review.annotateRedraw', { defaultValue: 'Opnieuw tekenen' })}
        </Button>
        <Button onClick={onCancel} disabled={busy}>
          {t('common.cancel', { defaultValue: 'Annuleer' })}
        </Button>
      </Space>
    </Space>
  );
};

export default ArtworkAnnotator;
