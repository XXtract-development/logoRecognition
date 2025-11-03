import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, Row, Col, message, Spin, Progress, Typography, Space, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from 'react-error-boundary';
import { useIntersectionObserver } from 'react-intersection-observer';
import { HelmetProvider, Helmet } from 'react-helmet-async';

import { ImageUploader } from './ImageUploader';
import { ResultsDisplay } from './ResultsDisplay';
import { BoundingBoxCanvas } from './BoundingBoxCanvas';
import { ExportDialog } from './ExportDialog';
import { useWebSocket } from '@hooks/useWebSocket';
import { useRecognitionStore } from '@stores/recognitionStore';
import { useThemeStore } from '@stores/themeStore';
import type { RecognitionResult, UploadedImage } from '@types/recognition';
import { performanceMonitor } from '@utils/performance';
import { ErrorFallback } from '@components/common/ErrorFallback';

const { Title, Text } = Typography;

/**
 * Main recognition interface component
 * Implements WCAG 2.1 AA compliance and performance optimizations
 */
export const RecognitionInterface: React.FC = React.memo(() => {
  const { t } = useTranslation('recognition');
  const { ref: viewportRef, inView } = useIntersectionObserver({
    threshold: 0.1,
    triggerOnce: false,
  });

  // Store hooks
  const {
    currentImage,
    results,
    isProcessing,
    progress,
    setCurrentImage,
    setResults,
    setProcessing,
    setProgress,
    clearResults,
  } = useRecognitionStore();

  const { theme } = useThemeStore();

  // Local state
  const [exportDialogVisible, setExportDialogVisible] = useState(false);
  const [selectedResult, setSelectedResult] = useState<RecognitionResult | null>(null);

  // WebSocket connection
  const { sendMessage, isConnected, lastMessage } = useWebSocket({
    url: process.env.VITE_WS_URL || 'ws://localhost:8000/ws',
    reconnectAttempts: 5,
    reconnectInterval: 3000,
    onMessage: handleWebSocketMessage,
    onError: handleWebSocketError,
  });

  /**
   * Handle WebSocket messages
   */
  function handleWebSocketMessage(data: any): void {
    performanceMonitor.mark('ws-message-received');

    try {
      if (data.type === 'recognition_progress') {
        setProgress(data.progress);
      } else if (data.type === 'recognition_complete') {
        setResults(data.results);
        setProcessing(false);
        message.success(t('recognition.complete'));
        performanceMonitor.measure('recognition-complete', 'recognition-start', 'ws-message-received');
      } else if (data.type === 'recognition_error') {
        message.error(t('recognition.error', { error: data.error }));
        setProcessing(false);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      message.error(t('recognition.processingError'));
    }
  }

  /**
   * Handle WebSocket errors
   */
  function handleWebSocketError(error: Event): void {
    console.error('WebSocket error:', error);
    message.warning(t('connection.lost'));
  }

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

        // Send image for recognition via WebSocket
        if (isConnected) {
          sendMessage({
            type: 'recognize',
            imageId: image.id,
            imageData: image.dataUrl,
            options: {
              detectMultiple: true,
              minConfidence: 0.5,
              maxResults: 10,
            },
          });
        } else {
          throw new Error('WebSocket not connected');
        }
      } catch (error) {
        console.error('Upload error:', error);
        message.error(t('upload.failed'));
        setProcessing(false);
      }
    },
    [isConnected, sendMessage, setCurrentImage, setProcessing, setProgress, clearResults, t]
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
      message.warning(t('export.noResults'));
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

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => window.location.reload()}>
      <HelmetProvider>
        <Helmet>
          <title>{t('page.title')} - Logo Recognition System</title>
          <meta name="description" content={t('page.description')} />
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        </Helmet>
      </HelmetProvider>

      <div
        ref={viewportRef}
        className={`recognition-interface min-h-screen p-4 ${theme === 'dark' ? 'dark bg-neutral-900' : 'bg-neutral-50'}`}
        role="main"
        aria-label={t('aria.mainInterface')}
      >
        <Space direction="vertical" size="large" className="w-full max-w-7xl mx-auto">
          {/* Header */}
          <Card className="shadow-sm">
            <Title level={1} className="text-2xl mb-2">
              {t('title')}
            </Title>
            <Text type="secondary">{t('description')}</Text>
          </Card>

          {/* Main Content */}
          <Row gutter={[16, 16]}>
            {/* Upload Section */}
            <Col xs={24} lg={12}>
              <Card
                title={t('upload.title')}
                className="h-full shadow-sm"
                loading={!inView}
                extra={
                  <Button
                    onClick={handleExportRequest}
                    disabled={results.length === 0}
                    aria-label={t('aria.exportResults')}
                  >
                    {t('export.button')}
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
                    <Text className="text-center mt-2">{t('processing')}</Text>
                  </div>
                )}
              </Card>
            </Col>

            {/* Visualization Section */}
            <Col xs={24} lg={12}>
              <Card
                title={t('visualization.title')}
                className="h-full shadow-sm"
                loading={!inView}
              >
                {currentImage ? (
                  <BoundingBoxCanvas {...canvasProps} />
                ) : (
                  <div className="flex items-center justify-center h-96 bg-neutral-100 dark:bg-neutral-800 rounded">
                    <Text type="secondary">{t('visualization.noImage')}</Text>
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          {/* Results Section */}
          {results.length > 0 && (
            <Card
              title={t('results.title')}
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
            <div className={`px-3 py-1 rounded-full text-sm ${
              isConnected
                ? 'bg-success text-white'
                : 'bg-error text-white animate-pulse'
            }`}>
              {isConnected ? t('connection.connected') : t('connection.disconnected')}
            </div>
          </div>
        </Space>
      </div>
    </ErrorBoundary>
  );
});

RecognitionInterface.displayName = 'RecognitionInterface';