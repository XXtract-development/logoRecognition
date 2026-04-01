import React from 'react';
import { Button, Result } from 'antd';
import { FallbackProps } from 'react-error-boundary';

export const ErrorFallback: React.FC<FallbackProps> = ({ error, resetErrorBoundary }) => {
  return (
    <Result
      status="error"
      title="Something went wrong"
      subTitle={error?.message || 'An unexpected error occurred'}
      extra={[
        <Button type="primary" key="retry" onClick={resetErrorBoundary}>
          Try Again
        </Button>,
        <Button key="reload" onClick={() => window.location.reload()}>
          Reload Page
        </Button>,
      ]}
    />
  );
};

ErrorFallback.displayName = 'ErrorFallback';
