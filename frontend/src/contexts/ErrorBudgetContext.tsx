/**
 * Error Budget Context Provider
 * Manages application-wide error budget and degradation policies
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ErrorBudgetState {
  remainingBudget: number;
  currentErrorRate: number;
  budgetExhausted: boolean;
  degradationLevel: 'none' | 'partial' | 'emergency';
  recommendations: string[];
}

interface ErrorBudgetContextValue {
  state: ErrorBudgetState;
  recordError: (severity: 'low' | 'medium' | 'high' | 'critical') => void;
  resetBudget: () => void;
  getStatus: () => ErrorBudgetState;
}

const ErrorBudgetContext = createContext<ErrorBudgetContextValue | undefined>(undefined);

const DEFAULT_ERROR_BUDGET = 100;
const ERROR_WEIGHTS = {
  low: 1,
  medium: 3,
  high: 5,
  critical: 10,
};

interface Props {
  children: ReactNode;
  maxBudget?: number;
  timeWindow?: number; // in milliseconds
}

export const ErrorBudgetProvider: React.FC<Props> = ({
  children,
  maxBudget = DEFAULT_ERROR_BUDGET,
  timeWindow = 24 * 60 * 60 * 1000 // 24 hours
}) => {
  const [errors, setErrors] = useState<Array<{ severity: string; timestamp: number }>>([]);
  const [state, setState] = useState<ErrorBudgetState>({
    remainingBudget: maxBudget,
    currentErrorRate: 0,
    budgetExhausted: false,
    degradationLevel: 'none',
    recommendations: [],
  });

  // Clean up old errors outside the time window
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - timeWindow;
      setErrors(prev => prev.filter(e => e.timestamp > cutoff));
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [timeWindow]);

  // Recalculate budget when errors change
  useEffect(() => {
    const cutoff = Date.now() - timeWindow;
    const recentErrors = errors.filter(e => e.timestamp > cutoff);

    const totalWeight = recentErrors.reduce((sum, error) => {
      return sum + (ERROR_WEIGHTS[error.severity as keyof typeof ERROR_WEIGHTS] || 1);
    }, 0);

    const remainingBudget = Math.max(0, maxBudget - totalWeight);
    const currentErrorRate = (totalWeight / maxBudget) * 100;
    const budgetExhausted = remainingBudget === 0;

    // Determine degradation level
    let degradationLevel: 'none' | 'partial' | 'emergency' = 'none';
    if (currentErrorRate >= 90) {
      degradationLevel = 'emergency';
    } else if (currentErrorRate >= 70) {
      degradationLevel = 'partial';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (currentErrorRate > 50) {
      recommendations.push('Monitor error trends closely');
    }
    if (currentErrorRate > 70) {
      recommendations.push('Consider disabling non-critical features');
      recommendations.push('Alert engineering team');
    }
    if (currentErrorRate > 90) {
      recommendations.push('Activate emergency protocols');
      recommendations.push('Enable safe mode');
    }

    setState({
      remainingBudget,
      currentErrorRate,
      budgetExhausted,
      degradationLevel,
      recommendations,
    });
  }, [errors, maxBudget, timeWindow]);

  const recordError = (severity: 'low' | 'medium' | 'high' | 'critical') => {
    setErrors(prev => [...prev, { severity, timestamp: Date.now() }]);
  };

  const resetBudget = () => {
    setErrors([]);
  };

  const getStatus = () => state;

  const value: ErrorBudgetContextValue = {
    state,
    recordError,
    resetBudget,
    getStatus,
  };

  return (
    <ErrorBudgetContext.Provider value={value}>
      {children}
    </ErrorBudgetContext.Provider>
  );
};

export const useErrorBudget = () => {
  const context = useContext(ErrorBudgetContext);
  if (context === undefined) {
    throw new Error('useErrorBudget must be used within an ErrorBudgetProvider');
  }
  return context;
};