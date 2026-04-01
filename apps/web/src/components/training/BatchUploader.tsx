/**
 * Batch Uploader Component
 * Epic 2.1 & 2.2: Single and batch image upload with progress tracking
 */
import React, { useCallback, useState } from 'react';
import { Upload, Button, Progress, List, Tag, message, Space, Typography } from 'antd';
import {
  InboxOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
// UploadFile type used internally by antd Upload component
import { useTranslation } from 'react-i18next';
import { useTrainingStore } from '@/stores/trainingStore';
import { uploadImage } from '@/services/trainingService';

const { Dragger } = Upload;
const { Text, Title } = Typography;

interface BatchUploaderProps {
  onComplete?: () => void;
  maxFiles?: number;
  maxSize?: number; // in bytes
}

interface UploadItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export const BatchUploader: React.FC<BatchUploaderProps> = ({
  onComplete,
  maxFiles = 50,
  maxSize = 10 * 1024 * 1024, // 10MB
}) => {
  const { t } = useTranslation();
  const { addImage, setUploading, setUploadProgress } = useTrainingStore();

  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploadingLocal] = useState(false);

  // Validate file
  const validateFile = useCallback(
    (file: File): string | null => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        return t('upload.invalidFormat', 'Invalid file format. Only JPG, PNG, WEBP allowed.');
      }
      if (file.size > maxSize) {
        return t('upload.tooLarge', `File too large. Maximum size is ${maxSize / 1024 / 1024}MB.`);
      }
      return null;
    },
    [maxSize, t]
  );

  // Handle file selection
  const handleBeforeUpload = useCallback(
    (file: File, fileList: File[]) => {
      // Check max files
      if (uploadItems.length + fileList.length > maxFiles) {
        message.warning(t('upload.maxFilesExceeded', `Maximum ${maxFiles} files allowed.`));
        return false;
      }

      // Validate file
      const error = validateFile(file);
      if (error) {
        message.error(error);
        return false;
      }

      // Add to upload queue
      const newItem: UploadItem = {
        id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: 'pending',
        progress: 0,
      };

      setUploadItems((prev) => [...prev, newItem]);
      return false; // Prevent default upload
    },
    [uploadItems.length, maxFiles, validateFile, t]
  );

  // Remove item from queue
  const handleRemove = useCallback((id: string) => {
    setUploadItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Upload all files
  const handleUploadAll = useCallback(async () => {
    const pendingItems = uploadItems.filter((item) => item.status === 'pending');
    if (pendingItems.length === 0) {
      message.warning(t('upload.noFilesToUpload', 'No files to upload'));
      return;
    }

    setIsUploadingLocal(true);
    setUploading(true);

    let completed = 0;
    let failed = 0;

    // Upload with concurrency limit of 3
    const concurrencyLimit = 3;
    const chunks: UploadItem[][] = [];
    for (let i = 0; i < pendingItems.length; i += concurrencyLimit) {
      chunks.push(pendingItems.slice(i, i + concurrencyLimit));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (item) => {
          // Update status to uploading
          setUploadItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading' as const, progress: 10 } : i))
          );

          try {
            // Simulate progress
            const progressInterval = setInterval(() => {
              setUploadItems((prev) =>
                prev.map((i) =>
                  i.id === item.id && i.progress < 90
                    ? { ...i, progress: i.progress + 10 }
                    : i
                )
              );
            }, 200);

            // Upload
            const image = await uploadImage(item.file);

            clearInterval(progressInterval);

            // Add to store
            addImage(image);

            // Update status to success
            setUploadItems((prev) =>
              prev.map((i) =>
                i.id === item.id ? { ...i, status: 'success' as const, progress: 100 } : i
              )
            );

            completed++;
          } catch (error) {
            // Update status to error
            setUploadItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? { ...i, status: 'error' as const, error: 'Upload failed', progress: 0 }
                  : i
              )
            );
            failed++;
          }

          // Update overall progress
          setUploadProgress({
            total: pendingItems.length,
            completed,
            failed,
            current: item.file.name,
          });
        })
      );
    }

    setIsUploadingLocal(false);
    setUploading(false);
    setUploadProgress(null);

    if (failed === 0) {
      message.success(
        t('upload.allSuccess', `Successfully uploaded ${completed} image(s)`)
      );
      setUploadItems([]);
      onComplete?.();
    } else {
      message.warning(
        t('upload.partialSuccess', `Uploaded ${completed} image(s), ${failed} failed`)
      );
    }
  }, [uploadItems, addImage, setUploading, setUploadProgress, onComplete, t]);

  // Clear all
  const handleClearAll = useCallback(() => {
    setUploadItems([]);
  }, []);

  // Retry failed uploads
  const handleRetryFailed = useCallback(() => {
    setUploadItems((prev) =>
      prev.map((item) =>
        item.status === 'error' ? { ...item, status: 'pending' as const, progress: 0, error: undefined } : item
      )
    );
  }, []);

  // Get status icon
  const getStatusIcon = (status: UploadItem['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'error':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'uploading':
        return <LoadingOutlined style={{ color: '#1890ff' }} />;
      default:
        return null;
    }
  };

  // Calculate totals
  const totals = {
    pending: uploadItems.filter((i) => i.status === 'pending').length,
    uploading: uploadItems.filter((i) => i.status === 'uploading').length,
    success: uploadItems.filter((i) => i.status === 'success').length,
    error: uploadItems.filter((i) => i.status === 'error').length,
  };

  return (
    <div className="batch-uploader">
      {/* Drop Zone */}
      <Dragger
        multiple
        showUploadList={false}
        beforeUpload={handleBeforeUpload}
        accept="image/jpeg,image/png,image/webp"
        disabled={isUploading}
        className="mb-4"
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">
          {t('upload.dragDropText', 'Click or drag files to upload')}
        </p>
        <p className="ant-upload-hint">
          {t('upload.supportInfo', 'Support for JPG, PNG, WEBP. Max 10MB per file, up to 50 files.')}
        </p>
      </Dragger>

      {/* Upload Queue */}
      {uploadItems.length > 0 && (
        <div className="upload-queue">
          {/* Queue Header */}
          <div className="flex justify-between items-center mb-3">
            <div>
              <Title level={5} className="mb-0">
                {t('upload.uploadQueue', 'Upload Queue')} ({uploadItems.length})
              </Title>
              <Space className="mt-1">
                {totals.pending > 0 && <Tag>{totals.pending} {t('upload.pending', 'pending')}</Tag>}
                {totals.uploading > 0 && <Tag color="blue">{totals.uploading} {t('upload.uploading', 'uploading')}</Tag>}
                {totals.success > 0 && <Tag color="green">{totals.success} {t('upload.completed', 'completed')}</Tag>}
                {totals.error > 0 && <Tag color="red">{totals.error} {t('upload.failed', 'failed')}</Tag>}
              </Space>
            </div>
            <Space>
              {totals.error > 0 && (
                <Button size="small" onClick={handleRetryFailed}>
                  {t('upload.retryFailed', 'Retry Failed')}
                </Button>
              )}
              <Button size="small" onClick={handleClearAll} disabled={isUploading}>
                {t('upload.clearAll', 'Clear All')}
              </Button>
              <Button
                type="primary"
                icon={<CloudUploadOutlined />}
                onClick={handleUploadAll}
                loading={isUploading}
                disabled={totals.pending === 0}
              >
                {isUploading
                  ? t('upload.uploading', 'Uploading...')
                  : t('upload.uploadAll', `Upload All (${totals.pending})`)}
              </Button>
            </Space>
          </div>

          {/* Queue List */}
          <List
            className="max-h-96 overflow-y-auto border rounded"
            dataSource={uploadItems}
            renderItem={(item) => (
              <List.Item
                className={`px-3 ${item.status === 'error' ? 'bg-red-50' : ''}`}
                actions={[
                  item.status === 'pending' && (
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemove(item.id)}
                      danger
                    />
                  ),
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  avatar={getStatusIcon(item.status)}
                  title={
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-xs">{item.file.name}</span>
                      <Text type="secondary" className="text-xs">
                        ({(item.file.size / 1024).toFixed(1)} KB)
                      </Text>
                    </div>
                  }
                  description={
                    item.status === 'uploading' ? (
                      <Progress percent={item.progress} size="small" />
                    ) : item.status === 'error' ? (
                      <Text type="danger">{item.error}</Text>
                    ) : null
                  }
                />
              </List.Item>
            )}
          />
        </div>
      )}

      {/* Empty State */}
      {uploadItems.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          <Text type="secondary">
            {t('upload.dragFilesHere', 'Drag and drop images here to start uploading')}
          </Text>
        </div>
      )}
    </div>
  );
};

BatchUploader.displayName = 'BatchUploader';
