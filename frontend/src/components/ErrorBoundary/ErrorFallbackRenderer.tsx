import React, { useState, useEffect } from 'react';
import { ErrorInfo } from 'react';
import { ErrorClassification } from './EnterpriseErrorBoundary';
import './ErrorFallbackRenderer.css';

interface Props {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  classification: ErrorClassification | null;
  level: string;
  isEmergencyMode: boolean;
  onRetry: () => void;
  onReport: (feedback: any) => void;
}

const ErrorFallbackRenderer: React.FC<Props> = ({
  error,
  errorInfo,
  errorId,
  classification,
  level,
  isEmergencyMode,
  onRetry,
  onReport,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState({
    message: '',
    sentiment: 'confused' as 'frustrated' | 'confused' | 'understanding' | 'satisfied',
    wouldRecommend: false,
    contactMe: false,
    email: '',
    additionalContext: '',
  });
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [animationClass, setAnimationClass] = useState('error-fallback-enter');

  useEffect(() => {
    // Add animation class
    setTimeout(() => {
      setAnimationClass('error-fallback-enter-active');
    }, 10);

    // Log error details for debugging
    if (process.env.NODE_ENV === 'development') {
      console.group(`Error Fallback - ${errorId}`);
      console.error('Error:', error);
      console.log('Classification:', classification);
      console.log('Level:', level);
      console.log('Emergency Mode:', isEmergencyMode);
      console.groupEnd();
    }
  }, [errorId, error, classification, level, isEmergencyMode]);

  const getErrorIcon = () => {
    if (isEmergencyMode) return '🚨';

    switch (classification?.severity) {
      case 'critical':
        return '💥';
      case 'high':
        return '🔥';
      case 'medium':
        return '⚠️';
      case 'low':
        return 'ℹ️';
      default:
        return '❌';
    }
  };

  const getErrorMessage = () => {
    if (isEmergencyMode) {
      return 'System is currently in emergency mode';
    }

    switch (classification?.category) {
      case 'network':
        return 'Connection issue detected';
      case 'user':
        return 'Authentication or permission issue';
      case 'system':
        return 'System error occurred';
      case 'external':
        return 'External service issue';
      case 'logic':
        return 'Application error detected';
      default:
        return 'Something went wrong';
    }
  };

  const getErrorDescription = () => {
    if (isEmergencyMode) {
      return 'We\'re experiencing critical issues. Our team has been notified and is working on a fix. Some features may be temporarily unavailable.';
    }

    const descriptions: Record<string, string> = {
      network: 'We\'re having trouble connecting to our servers. Please check your internet connection and try again.',
      user: 'There seems to be an issue with your account or permissions. Please try logging in again.',
      system: 'Our system encountered an unexpected error. This has been reported to our technical team.',
      external: 'One of our partner services is currently unavailable. Please try again in a few moments.',
      logic: 'The application encountered an unexpected situation. We\'re working on fixing this.',
    };

    return descriptions[classification?.category || ''] || 'An unexpected error occurred. We apologize for the inconvenience.';
  };

  const getSuggestedActions = (): string[] => {
    const actions: string[] = [];

    if (classification?.recoverable) {
      actions.push('Try again');
    }

    switch (classification?.category) {
      case 'network':
        actions.push('Check your internet connection');
        actions.push('Refresh the page');
        break;
      case 'user':
        actions.push('Sign out and sign back in');
        actions.push('Check your permissions');
        break;
      case 'system':
        actions.push('Clear your browser cache');
        actions.push('Try a different browser');
        break;
      case 'external':
        actions.push('Wait a few minutes');
        actions.push('Try alternative features');
        break;
    }

    actions.push('Contact support if the issue persists');

    return actions;
  };

  const handleRetry = () => {
    setAnimationClass('error-fallback-exit');
    setTimeout(() => {
      onRetry();
    }, 300);
  };

  const handleSubmitFeedback = () => {
    onReport(feedback);
    setFeedbackSubmitted(true);
    setTimeout(() => {
      setShowFeedback(false);
      setFeedbackSubmitted(false);
    }, 3000);
  };

  const renderEmergencyMode = () => (
    <div className="emergency-mode-container">
      <div className="emergency-header">
        <span className="emergency-icon">🚨</span>
        <h1>Emergency Mode Active</h1>
      </div>
      <p className="emergency-description">
        Critical system issues detected. Limited functionality available.
      </p>
      <div className="emergency-features">
        <h3>Available Features:</h3>
        <ul>
          <li>✅ View existing data (read-only)</li>
          <li>✅ Download your information</li>
          <li>✅ Contact support</li>
          <li>❌ Create or edit content</li>
          <li>❌ Upload files</li>
          <li>❌ Process transactions</li>
        </ul>
      </div>
      <div className="emergency-actions">
        <button onClick={() => window.location.href = '/'} className="btn-secondary">
          Go to Home
        </button>
        <button onClick={() => setShowFeedback(true)} className="btn-primary">
          Report Issue
        </button>
      </div>
    </div>
  );

  const renderNormalError = () => (
    <div className="error-content">
      <div className="error-header">
        <span className="error-icon">{getErrorIcon()}</span>
        <h1>{getErrorMessage()}</h1>
      </div>

      <p className="error-description">{getErrorDescription()}</p>

      <div className="suggested-actions">
        <h3>What you can try:</h3>
        <ul>
          {getSuggestedActions().map((action, index) => (
            <li key={index}>{action}</li>
          ))}
        </ul>
      </div>

      <div className="error-actions">
        {classification?.recoverable && (
          <button onClick={handleRetry} className="btn-primary">
            Try Again
          </button>
        )}
        <button onClick={() => window.location.href = '/'} className="btn-secondary">
          Go to Home
        </button>
        <button onClick={() => setShowDetails(!showDetails)} className="btn-link">
          {showDetails ? 'Hide' : 'Show'} Details
        </button>
      </div>

      {showDetails && (
        <div className="error-details">
          <h3>Error Details</h3>
          <div className="detail-grid">
            <div className="detail-item">
              <strong>Error ID:</strong>
              <code>{errorId}</code>
            </div>
            {classification && (
              <>
                <div className="detail-item">
                  <strong>Category:</strong>
                  <span className={`badge badge-${classification.category}`}>
                    {classification.category}
                  </span>
                </div>
                <div className="detail-item">
                  <strong>Severity:</strong>
                  <span className={`badge badge-${classification.severity}`}>
                    {classification.severity}
                  </span>
                </div>
                <div className="detail-item">
                  <strong>Recoverable:</strong>
                  <span>{classification.recoverable ? 'Yes' : 'No'}</span>
                </div>
              </>
            )}
            <div className="detail-item">
              <strong>Component Level:</strong>
              <span>{level}</span>
            </div>
            <div className="detail-item">
              <strong>Timestamp:</strong>
              <span>{new Date().toLocaleString()}</span>
            </div>
          </div>

          {process.env.NODE_ENV === 'development' && error && (
            <div className="error-stack">
              <h4>Stack Trace:</h4>
              <pre>{error.stack}</pre>
            </div>
          )}
        </div>
      )}

      <div className="error-footer">
        <button onClick={() => setShowFeedback(!showFeedback)} className="btn-feedback">
          {showFeedback ? '✕ Close Feedback' : '💬 Send Feedback'}
        </button>
      </div>

      {showFeedback && !feedbackSubmitted && (
        <div className="feedback-form">
          <h3>Help us improve</h3>
          <div className="form-group">
            <label>How are you feeling?</label>
            <div className="sentiment-options">
              {(['frustrated', 'confused', 'understanding', 'satisfied'] as const).map(sentiment => (
                <button
                  key={sentiment}
                  className={`sentiment-btn ${feedback.sentiment === sentiment ? 'active' : ''}`}
                  onClick={() => setFeedback({ ...feedback, sentiment })}
                >
                  {sentiment === 'frustrated' && '😤'}
                  {sentiment === 'confused' && '😕'}
                  {sentiment === 'understanding' && '🤔'}
                  {sentiment === 'satisfied' && '😊'}
                  <span>{sentiment}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="feedback-message">What happened?</label>
            <textarea
              id="feedback-message"
              value={feedback.message}
              onChange={(e) => setFeedback({ ...feedback, message: e.target.value })}
              placeholder="Describe what you were trying to do..."
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="additional-context">Additional context (optional)</label>
            <textarea
              id="additional-context"
              value={feedback.additionalContext}
              onChange={(e) => setFeedback({ ...feedback, additionalContext: e.target.value })}
              placeholder="Any other details that might help..."
              rows={2}
            />
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={feedback.contactMe}
                onChange={(e) => setFeedback({ ...feedback, contactMe: e.target.checked })}
              />
              Contact me about this issue
            </label>
          </div>

          {feedback.contactMe && (
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={feedback.email}
                onChange={(e) => setFeedback({ ...feedback, email: e.target.value })}
                placeholder="your@email.com"
              />
            </div>
          )}

          <button onClick={handleSubmitFeedback} className="btn-primary">
            Submit Feedback
          </button>
        </div>
      )}

      {feedbackSubmitted && (
        <div className="feedback-success">
          <span>✅</span>
          <p>Thank you for your feedback! We'll use it to improve our service.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className={`error-fallback-container ${animationClass} ${isEmergencyMode ? 'emergency' : ''}`}>
      <div className="error-fallback-content">
        {isEmergencyMode ? renderEmergencyMode() : renderNormalError()}
      </div>
    </div>
  );
};

export default ErrorFallbackRenderer;