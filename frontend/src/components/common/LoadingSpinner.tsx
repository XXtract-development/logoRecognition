/**
 * Loading Spinner Component
 * Accessible loading indicator with multiple sizes and variants
 */

import React from 'react';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
  variant?: 'default' | 'overlay' | 'inline';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  message,
  variant = 'default',
  className = '',
}) => {
  const spinnerClasses = `loading-spinner loading-spinner--${size} loading-spinner--${variant} ${className}`;

  return (
    <div className={spinnerClasses} role="status" aria-live="polite">
      <div className="loading-spinner__container">
        <div className="loading-spinner__circle" aria-hidden="true">
          <svg viewBox="0 0 50 50">
            <circle
              className="loading-spinner__path"
              cx="25"
              cy="25"
              r="20"
              fill="none"
              strokeWidth="3"
            />
          </svg>
        </div>
        {message && (
          <span className="loading-spinner__message">{message}</span>
        )}
        <span className="sr-only">
          {message || 'Loading...'}
        </span>
      </div>
    </div>
  );
};

export default LoadingSpinner;