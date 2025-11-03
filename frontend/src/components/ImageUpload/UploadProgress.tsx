import React, { useEffect, useState } from 'react';
import './UploadProgress.css';

interface UploadProgressProps {
  progress: number;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({ progress }) => {
  const [estimatedTime, setEstimatedTime] = useState<string>('Calculating...');
  const [startTime] = useState(Date.now());

  useEffect(() => {
    if (progress > 0 && progress < 100) {
      const elapsed = Date.now() - startTime;
      const rate = progress / elapsed;
      const remaining = (100 - progress) / rate;

      if (remaining < 1000) {
        setEstimatedTime('Less than 1 second');
      } else if (remaining < 60000) {
        setEstimatedTime(`${Math.ceil(remaining / 1000)} seconds`);
      } else {
        setEstimatedTime(`${Math.ceil(remaining / 60000)} minutes`);
      }
    } else if (progress === 100) {
      setEstimatedTime('Complete');
    }
  }, [progress, startTime]);

  return (
    <div className="upload-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-header">
        <span className="progress-label">Uploading...</span>
        <span className="progress-percentage">{progress.toFixed(0)}%</span>
      </div>

      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${progress}%` }}
          aria-hidden="true"
        />
      </div>

      <div className="progress-footer">
        <span className="estimated-time">
          {progress < 100 ? `Estimated time: ${estimatedTime}` : 'Upload complete'}
        </span>
      </div>
    </div>
  );
};