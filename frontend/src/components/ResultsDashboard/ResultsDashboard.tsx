import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Layout, Row, Col, Card, Spin, Alert, message } from 'antd';
import { Canvas } from './ImageCanvas/Canvas';
import { BoundingBoxLayer } from './ImageCanvas/BoundingBoxLayer';
import { ZoomControls } from './ImageCanvas/ZoomControls';
import { ResultsGrid } from './ResultsList/ResultsGrid';
import { ConfidenceSlider } from './FilterPanel/ConfidenceSlider';
import { CategoryFilter } from './FilterPanel/CategoryFilter';
import ExportPanel from './ExportPanel/ExportPanel';
import { StatsOverview } from './Analytics/StatsOverview';
import { useFilters } from './hooks/useFilters';
import { useCanvas } from './hooks/useCanvas';
import { useExport } from './hooks/useExport';
import { useWebSocket } from './hooks/useWebSocket';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useResultCache } from './hooks/useResultCache';
import './ResultsDashboard.css';

const { Content, Sider } = Layout;

export interface Detection {
  id: string;
  brand: string;
  category?: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes?: Record<string, any>;
  timestamp?: string;
}

export interface ResultsDashboardProps {
  detectionId: string;
  uploadId: string;
  imageUrl?: string;
}

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
  detectionId,
  uploadId,
  imageUrl
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [imageMetadata, setImageMetadata] = useState<{
    width: number;
    height: number;
    url: string;
  } | null>(null);
  const [selectedDetections, setSelectedDetections] = useState<string[]>([]);
  const [hoveredDetection, setHoveredDetection] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'grouped'>('grid');

  // Custom hooks
  const { filteredDetections, filters, updateFilters } = useFilters(detections);
  const { canvasRef, zoom, pan, setZoom, setPan, resetView } = useCanvas();
  const { exportData, exportStatus } = useExport();

  // WebSocket for real-time updates
  const { messages } = useWebSocket(`/detection/results/stream/${detectionId}`);

  // Result caching
  const { getCachedResults, cacheResults, restoreFromPersistentCache } = useResultCache(
    detectionId,
    uploadId
  );

  // Keyboard navigation
  const { focusedIndex, setFocus, resetFocus } = useKeyboardNavigation({
    itemCount: filteredDetections.length,
    onEnter: (index) => {
      const detection = filteredDetections[index];
      if (detection) {
        handleDetectionClick(detection.id, false);
      }
    },
    onSpace: (index) => {
      const detection = filteredDetections[index];
      if (detection) {
        handleDetectionClick(detection.id, true);
      }
    },
    onEscape: () => {
      setSelectedDetections([]);
      resetFocus();
    },
    enabled: !loading && !error
  });

  // Load detection results with caching
  useEffect(() => {
    const fetchResults = async () => {
      try {
        setLoading(true);

        // Check cache first
        const cached = getCachedResults() || restoreFromPersistentCache();
        if (cached) {
          setDetections(cached.detections);
          setImageMetadata(cached.imageMetadata);
          setLoading(false);
          return;
        }

        // Fetch from API if not cached
        const response = await fetch(`/api/v1/detection/results/${detectionId}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch results: ${response.statusText}`);
        }

        const data = await response.json();

        const detectionData = data.detections || [];
        const metaData = {
          url: data.imageUrl || imageUrl || '',
          width: data.imageMetadata?.width || 1920,
          height: data.imageMetadata?.height || 1080
        };

        setDetections(detectionData);
        setImageMetadata(metaData);

        // Cache the results
        cacheResults(detectionData, metaData);

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load results');
        setLoading(false);
      }
    };

    if (detectionId) {
      fetchResults();
    }
  }, [detectionId, uploadId, imageUrl, getCachedResults, cacheResults, restoreFromPersistentCache]);

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];

      if (lastMessage.type === 'partial_result' && lastMessage.detection) {
        setDetections(prev => {
          const exists = prev.find(d => d.id === lastMessage.detection.id);
          if (!exists) {
            return [...prev, lastMessage.detection];
          }
          return prev.map(d =>
            d.id === lastMessage.detection.id ? lastMessage.detection : d
          );
        });
      }
    }
  }, [messages]);

  // Handle detection selection
  const handleDetectionClick = useCallback((detectionId: string, multiSelect: boolean = false) => {
    if (multiSelect) {
      setSelectedDetections(prev =>
        prev.includes(detectionId)
          ? prev.filter(id => id !== detectionId)
          : [...prev, detectionId]
      );
    } else {
      setSelectedDetections([detectionId]);
      // Focus on the selected detection
      const detection = detections.find(d => d.id === detectionId);
      if (detection && canvasRef.current) {
        // Center and zoom to detection
        const box = detection.boundingBox;
        setPan({
          x: -(box.x + box.width / 2 - canvasRef.current.width / 2),
          y: -(box.y + box.height / 2 - canvasRef.current.height / 2)
        });
        setZoom(2);
      }
    }
  }, [detections, canvasRef, setPan, setZoom]);

  // Handle export
  const handleExport = useCallback(async (format: 'json' | 'csv' | 'pdf' | 'xlsx') => {
    try {
      await exportData({
        detectionId,
        detections: filteredDetections,
        format,
        filters,
        imageMetadata
      });
      message.success(`Export to ${format.toUpperCase()} completed`);
    } catch (err) {
      message.error('Export failed. Please try again.');
    }
  }, [detectionId, filteredDetections, filters, imageMetadata, exportData]);

  // Calculate statistics
  const statistics = useMemo(() => {
    const brands = [...new Set(filteredDetections.map(d => d.brand))];
    const avgConfidence = filteredDetections.length > 0
      ? filteredDetections.reduce((sum, d) => sum + d.confidence, 0) / filteredDetections.length
      : 0;

    return {
      totalDetections: filteredDetections.length,
      uniqueBrands: brands.length,
      averageConfidence: avgConfidence,
      brandDistribution: brands.map(brand => ({
        brand,
        count: filteredDetections.filter(d => d.brand === brand).length
      }))
    };
  }, [filteredDetections]);

  if (loading) {
    return (
      <div className="results-dashboard-loading" role="status" aria-live="polite">
        <Spin size="large" tip="Loading detection results..." />
        <span className="sr-only">Loading detection results...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="results-dashboard-error" role="alert">
        <Alert
          message="Error Loading Results"
          description={error}
          type="error"
          showIcon
        />
      </div>
    );
  }

  return (
    <Layout className="results-dashboard" role="main" aria-label="Logo Detection Results Dashboard">
      <Content className="dashboard-content">
        <Row gutter={[16, 16]}>
          {/* Statistics Overview */}
          <Col xs={24}>
            <StatsOverview statistics={statistics} />
          </Col>

          {/* Main Canvas and Controls */}
          <Col xs={24} lg={16}>
            <Card className="canvas-card">
              <div className="canvas-container">
                {imageMetadata && (
                  <>
                    <Canvas
                      ref={canvasRef}
                      imageUrl={imageMetadata.url}
                      width={imageMetadata.width}
                      height={imageMetadata.height}
                      zoom={zoom}
                      pan={pan}
                    />
                    <BoundingBoxLayer
                      detections={filteredDetections}
                      selectedIds={selectedDetections}
                      hoveredId={hoveredDetection}
                      zoom={zoom}
                      pan={pan}
                      onDetectionClick={handleDetectionClick}
                      onDetectionHover={setHoveredDetection}
                    />
                    <ZoomControls
                      zoom={zoom}
                      onZoomIn={() => setZoom(Math.min(zoom * 1.2, 5))}
                      onZoomOut={() => setZoom(Math.max(zoom / 1.2, 0.5))}
                      onReset={resetView}
                    />
                  </>
                )}
              </div>
            </Card>
          </Col>

          {/* Results List */}
          <Col xs={24} lg={8}>
            <Card className="results-list-card" title="Detected Logos">
              <ResultsGrid
                detections={filteredDetections}
                selectedIds={selectedDetections}
                viewMode={viewMode}
                onDetectionClick={handleDetectionClick}
                onViewModeChange={setViewMode}
              />
            </Card>
          </Col>

          {/* Filters */}
          <Col xs={24} md={12} lg={8}>
            <Card title="Filters">
              <ConfidenceSlider
                min={filters.confidence.min}
                max={filters.confidence.max}
                onChange={(min, max) => updateFilters({ confidence: { min, max } })}
              />
              <CategoryFilter
                selectedCategories={filters.categories}
                availableCategories={[...new Set(detections.map(d => d.category).filter(Boolean) as string[])]}
                onChange={(categories) => updateFilters({ categories })}
              />
            </Card>
          </Col>

          {/* Export */}
          <Col xs={24} md={12} lg={8}>
            <ExportPanel
              onExport={handleExport}
              exportStatus={exportStatus}
              detectionsCount={filteredDetections.length}
            />
          </Col>
        </Row>
      </Content>
    </Layout>
  );
};

export default ResultsDashboard;