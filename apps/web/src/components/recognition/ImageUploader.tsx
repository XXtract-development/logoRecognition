import React, { useCallback, useState } from 'react';
import { Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { UploadedImage } from '@/types/recognition';

const { Dragger } = Upload;

interface ImageUploaderProps {
  onUpload: (image: UploadedImage) => void;
  disabled?: boolean;
  maxSize?: number;
  acceptedFormats?: string[];
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onUpload,
  disabled = false,
  maxSize = 10 * 1024 * 1024,
  acceptedFormats = ['image/jpeg', 'image/png', 'image/webp'],
}) => {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!acceptedFormats.includes(file.type)) {
        message.error(t('upload.invalidFormat'));
        return false;
      }

      if (file.size > maxSize) {
        message.error(t('upload.tooLarge'));
        return false;
      }

      setUploading(true);

      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          const image: UploadedImage = {
            id: `img-${Date.now()}`,
            file,
            dataUrl,
            name: file.name,
            size: file.size,
            type: file.type,
            uploadedAt: new Date(),
          };
          onUpload(image);
          setUploading(false);
        };
        reader.onerror = () => {
          message.error(t('upload.readError'));
          setUploading(false);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('Upload error:', error);
        message.error(t('upload.failed'));
        setUploading(false);
      }

      return false;
    },
    [acceptedFormats, maxSize, onUpload, t]
  );

  return (
    <Dragger
      name="image"
      multiple={false}
      showUploadList={false}
      beforeUpload={handleUpload}
      disabled={disabled || uploading}
      accept={acceptedFormats.join(',')}
      className="upload-dropzone"
    >
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">{t('recognition.dragDrop')}</p>
      <p className="ant-upload-hint">
        {t('upload.supportedFormats', { formats: 'JPEG, PNG, WebP' })}
      </p>
    </Dragger>
  );
};

ImageUploader.displayName = 'ImageUploader';
