import React from 'react';
import { UploadedFile } from './ImageUpload';
import './UploadHistory.css';

interface UploadHistoryProps {
  uploads: UploadedFile[];
}

export const UploadHistory: React.FC<UploadHistoryProps> = ({ uploads }) => {
  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'uploading':
        return '⏳';
      default:
        return '•';
    }
  };

  const getStatusClass = (status: UploadedFile['status']) => {
    return `upload-status upload-status-${status}`;
  };

  const formatTimestamp = (date: Date) => {
    return new Date(date).toLocaleTimeString();
  };

  return (
    <div className="upload-history">
      <h3>Recent Uploads (Session)</h3>

      <div className="upload-history-list">
        {uploads.map(upload => (
          <div key={upload.id} className="upload-history-item">
            {upload.preview && (
              <img
                src={upload.preview}
                alt={upload.file.name}
                className="upload-history-thumbnail"
              />
            )}

            <div className="upload-history-details">
              <div className="upload-history-name">{upload.file.name}</div>
              <div className="upload-history-time">{formatTimestamp(upload.timestamp)}</div>
              {upload.error && (
                <div className="upload-history-error">{upload.error}</div>
              )}
            </div>

            <div className={getStatusClass(upload.status)}>
              <span className="status-icon">{getStatusIcon(upload.status)}</span>
              <span className="status-text">{upload.status}</span>
            </div>

            {upload.status === 'uploading' && (
              <div className="upload-history-progress">
                <div
                  className="upload-history-progress-bar"
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};