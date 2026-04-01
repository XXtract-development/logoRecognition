import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, Row, Col, message, Progress, Typography, Space, Button, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from 'react-error-boundary';
import { useInView } from 'react-intersection-observer';
import { HelmetProvider, Helmet } from 'react-helmet-async';
import { CloudServerOutlined, DisconnectOutlined } from '@ant-design/icons';

import { ImageUploader } from './ImageUploader';
import { ResultsDisplay } from './ResultsDisplay';
import { BoundingBoxCanvas } from './BoundingBoxCanvas';
import { ExportDialog } from './ExportDialog';
import { useWebSocket } from '@hooks/useWebSocket';
import { useRecognitionStore } from '@stores/recognitionStore';
import { useThemeStore } from '@stores/themeStore';
import { useBackendStatus } from '@/contexts/BackendStatusContext';
import type { RecognitionResult, UploadedImage } from '@/types/recognition';
import { WebSocketEvent } from '@/types/websocket.types';
import { performanceMonitor } from '@utils/performance';
import { ErrorFallback } from '@components/common/ErrorFallback';

const { Title, Text } = Typography;

/**
 * Main recognition interface component
 * Implements WCAG 2.1 AA compliance and performance optimizations
 */
export const RecognitionInterface: React.FC = React.memo(() => {
  const { t } = useTranslation('recognition');
  const { ref: viewportRef, inView } = useInView({
    threshold: 0.1,
    triggerOnce: false,
  });

  // Backend status from context
  const {
    isChecking: backendChecking,
    isApiHealthy,
    isWebSocketHealthy,
  } = useBackendStatus();

  // Store hooks
  const {
    currentImage,
    results,
    isProcessing,
    progress,
    setCurrentImage,
    setProcessing,
    setProgress,
    clearResults,
  } = useRecognitionStore();

  const { theme } = useThemeStore();

  // Local state
  const [exportDialogVisible, setExportDialogVisible] = useState(false);
  const [selectedResult, setSelectedResult] = useState<RecognitionResult | null>(null);

  // WebSocket connection - only auto-connect when backend is healthy
  const {
    send,
    isConnected,
    connect: connectWebSocket,
  } = useWebSocket({
    autoConnect: false, // We'll manually connect when backend is ready
    reconnect: true,
  });

  // Connect WebSocket only when WebSocket endpoint is available (not just API)
  useEffect(() => {
    if (isWebSocketHealthy && !isConnected) {
      connectWebSocket();
    }
  }, [isWebSocketHealthy, isConnected, connectWebSocket]);

  /**
   * Handle image upload
   */
  const handleImageUpload = useCallback(
    async (image: UploadedImage) => {
      performanceMonitor.mark('recognition-start');

      try {
        setCurrentImage(image);
        setProcessing(true);
        setProgress(0);
        clearResults();

        // Check if backend is available before trying to send
        if (!isApiHealthy) {
          message.warning(t('connection.backendUnavailable') || 'Backend services are not available');
          setProcessing(false);
          return;
        }
        if (!isWebSocketHealthy) {
          message.warning(t('connection.websocketUnavailable') || 'Real-time recognition is not available');
          setProcessing(false);
          return;
        }

        // Send image for recognition via WebSocket
        if (isConnected) {
          send(WebSocketEvent.RECOGNIZE, {
            imageId: image.id,
            imageData: image.dataUrl,
            options: {
              detectMultiple: true,
              minConfidence: 0.5,
              maxResults: 10,
            },
          });
        } else {
          // Try to connect first
          const connected = await connectWebSocket();
          if (connected) {
            send(WebSocketEvent.RECOGNIZE, {
              imageId: image.id,
              imageData: image.dataUrl,
              options: {
                detectMultiple: true,
                minConfidence: 0.5,
                maxResults: 10,
              },
            });
          } else {
            throw new Error('Could not connect to backend');
          }
        }
      } catch (error) {
        console.error('Upload error:', error);
        message.error(t('upload.failed') || 'Upload failed');
        setProcessing(false);
      }
    },
    [isConnected, isApiHealthy, isWebSocketHealthy, send, connectWebSocket, setCurrentImage, setProcessing, setProgress, clearResults, t]
  );

  /**
   * Handle result selection
   */
  const handleResultSelect = useCallback((result: RecognitionResult) => {
    setSelectedResult(result);
  }, []);

  /**
   * Handle export request
   */
  const handleExportRequest = useCallback(() => {
    if (results.length === 0) {
      message.warning(t('export.noResults') || 'No results to export');
      return;
    }
    setExportDialogVisible(true);
  }, [results, t]);

  /**
   * Memoized canvas props for performance
   */
  const canvasProps = useMemo(
    () => ({
      image: currentImage,
      results,
      selectedResult,
      onResultSelect: handleResultSelect,
    }),
    [currentImage, results, selectedResult, handleResultSelect]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      performanceMonitor.clearMarks();
      performanceMonitor.clearMeasures();
    };
  }, []);

  // Connection status display
  const connectionStatus = useMemo(() => {
    if (backendChecking) {
      return { text: 'Checking...', color: '#1890ff', icon: <CloudServerOutlined spin /> };
    }
    if (!isApiHealthy) {
      return { text: 'Backend Offline', color: '#ff4d4f', icon: <DisconnectOutlined /> };
    }
    if (!isWebSocketHealthy) {
      return { text: 'API Online', color: '#faad14', icon: <CloudServerOutlined /> };
    }
    if (isConnected) {
      return { text: 'Connected', color: '#52c41a', icon: <CloudServerOutlined /> };
    }
    return { text: 'Connecting...', color: '#faad14', icon: <CloudServerOutlined /> };
  }, [backendChecking, isApiHealthy, isWebSocketHealthy, isConnected]);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => window.location.reload()}>
      <HelmetProvider>
        <Helmet>
          <title>{t('page.title') || 'Recognition'} - Logo Recognition System</title>
          <meta name="description" content={t('page.description') || 'Logo recognition interface'} />
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        </Helmet>
      </HelmetProvider>

      <div
        ref={viewportRef}
        className={`recognition-interface min-h-screen p-4 ${theme === 'dark' ? 'dark bg-neutral-900' : 'bg-neutral-50'}`}
        role="main"
        aria-label={t('aria.mainInterface') || 'Recognition interface'}
      >
        <Space direction="vertical" size="large" className="w-full max-w-7xl mx-auto">
          {/* Backend unavailable warning */}
          {!isApiHealthy && !backendChecking && (
            <Alert
              message="Backend Unavailable"
              description="The backend API is not running. Recognition features will be unavailable until the backend is started."
              type="error"
              showIcon
              closable
            />
          )}
          {/* WebSocket unavailable info - less severe since API works */}
          {isApiHealthy && !isWebSocketHealthy && !backendChecking && (
            <Alert
              message="Real-time Updates Unavailable"
              description="The backend API is running but real-time recognition via WebSocket is not available. Some features may be limited."
              type="info"
              showIcon
              closable
            />
          )}

          {/* Header */}
          <Card className="shadow-sm">
            <Title level={1} className="text-2xl mb-2">
              {t('title') || 'Logo Recognition'}
            </Title>
            <Text type="secondary">{t('description') || 'Upload an image to detect and recognize logos'}</Text>
          </Card>

          {/* Main Content */}
          <Row gutter={[16, 16]}>
            {/* Upload Section */}
            <Col xs={24} lg={12}>
              <Card
                title={t('upload.title') || 'Upload Image'}
                className="h-full shadow-sm"
                loading={!inView}
                extra={
                  <Button
                    onClick={handleExportRequest}
                    disabled={results.length === 0}
                    aria-label={t('aria.exportResults') || 'Export results'}
                  >
                    {t('export.button') || 'Export'}
                  </Button>
                }
              >
                <ImageUploader
                  onUpload={handleImageUpload}
                  disabled={isProcessing}
                  maxSize={10 * 1024 * 1024} // 10MB
                  acceptedFormats={['image/jpeg', 'image/png', 'image/webp']}
                />

                {/* Progress indicator */}
                {isProcessing && (
                  <div className="mt-4" role="status" aria-live="polite">
                    <Progress
                      percent={progress}
                      status="active"
                      strokeColor={{
                        '0%': '#108ee9',
                        '100%': '#87d068',
                      }}
                    />
                    <Text className="text-center mt-2">{t('processing') || 'Processing...'}</Text>
                  </div>
                )}
              </Card>
            </Col>

            {/* Visualization Section */}
            <Col xs={24} lg={12}>
              <Card
                title={t('visualization.title') || 'Results'}
                className="h-full shadow-sm"
                loading={!inView}
              >
                {currentImage ? (
                  <BoundingBoxCanvas {...canvasProps} />
                ) : (
                  <div className="flex items-center justify-center h-96 bg-neutral-100 dark:bg-neutral-800 rounded">
                    <Text type="secondary">{t('visualization.noImage') || 'No image uploaded'}</Text>
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          {/* Results Section */}
          {results.length > 0 && (
            <Card
              title={t('results.title') || 'Detection Results'}
              className="shadow-sm"
              loading={!inView}
            >
              <ResultsDisplay
                results={results}
                onResultSelect={handleResultSelect}
                selectedResult={selectedResult}
              />
            </Card>
          )}

          {/* Export Dialog */}
          <ExportDialog
            visible={exportDialogVisible}
            results={results}
            image={currentImage}
            onClose={() => setExportDialogVisible(false)}
          />

          {/* Connection Status */}
          <div
            className="fixed bottom-4 right-4 z-50"
            role="status"
            aria-live="polite"
          >
            <div
              className="px-3 py-1 rounded-full text-sm flex items-center gap-2"
              style={{
                backgroundColor: connectionStatus.color,
                color: 'white',
              }}
            >
              {connectionStatus.icon}
              {connectionStatus.text}
            </div>
          </div>
        </Space>
      </div>
    </ErrorBoundary>
  );
});

RecognitionInterface.displayName = 'RecognitionInterface';
