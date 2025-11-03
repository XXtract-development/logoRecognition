import React from 'react';
import { Button, Tooltip, Space } from 'antd';
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
  ExpandOutlined,
  CompressOutlined
} from '@ant-design/icons';
import './ZoomControls.css';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFitToScreen?: () => void;
  minZoom?: number;
  maxZoom?: number;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  onFitToScreen,
  minZoom = 0.5,
  maxZoom = 5
}) => {
  const zoomPercentage = Math.round(zoom * 100);
  const canZoomIn = zoom < maxZoom;
  const canZoomOut = zoom > minZoom;

  return (
    <div className="zoom-controls">
      <Space.Compact direction="vertical" size="small">
        <Tooltip title="Zoom In (Ctrl+Plus)" placement="left">
          <Button
            id="zoom-in-btn"
            icon={<ZoomInOutlined />}
            onClick={onZoomIn}
            disabled={!canZoomIn}
            size="small"
            aria-label="Zoom in"
          />
        </Tooltip>

        <div className="zoom-level" role="status" aria-live="polite" aria-label={`Zoom level ${zoomPercentage} percent`}>
          {zoomPercentage}%
        </div>

        <Tooltip title="Zoom Out (Ctrl+Minus)" placement="left">
          <Button
            id="zoom-out-btn"
            icon={<ZoomOutOutlined />}
            onClick={onZoomOut}
            disabled={!canZoomOut}
            size="small"
            aria-label="Zoom out"
          />
        </Tooltip>

        <Tooltip title="Reset View (Ctrl+R)" placement="left">
          <Button
            id="reset-view-btn"
            icon={<ExpandOutlined />}
            onClick={onReset}
            size="small"
            aria-label="Reset view"
          />
        </Tooltip>

        {onFitToScreen && (
          <Tooltip title="Fit to Screen" placement="left">
            <Button
              icon={<FullscreenOutlined />}
              onClick={onFitToScreen}
              size="small"
            />
          </Tooltip>
        )}
      </Space.Compact>
    </div>
  );
};