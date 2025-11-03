import React from 'react';
import { ResultsDashboard as Dashboard } from './ResultsDashboard';
import { ResultsDashboardErrorBoundary } from './ErrorBoundary';
import type { ResultsDashboardProps } from './ResultsDashboard';

// Wrap the dashboard with error boundary by default
const ResultsDashboard: React.FC<ResultsDashboardProps> = (props) => {
  return (
    <ResultsDashboardErrorBoundary>
      <Dashboard {...props} />
    </ResultsDashboardErrorBoundary>
  );
};

export { ResultsDashboard as default };
export type { ResultsDashboardProps, Detection } from './ResultsDashboard';