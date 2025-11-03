/**
 * Loading States and Skeleton Components
 * US-012: Code Splitting & Lazy Loading - Loading components
 * US-023: Frontend Polish & Responsiveness - Skeleton screens
 */

import React from 'react';
import { Spin, Skeleton, Card, Row, Col, Progress } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import './LoadingStates.css';

// Custom loading spinner
const customSpinner = <LoadingOutlined style={{ fontSize: 24, color: '#1890ff' }} spin />;

/**
 * Enhanced Loading Spinner with customization options
 */
export const LoadingSpinner = ({
  size = 'large',
  tip = 'Loading...',
  spinning = true,
  style = {},
  children = null
}) => (
  <div className="loading-spinner-container" style={style}>
    <Spin
      size={size}
      tip={tip}
      spinning={spinning}
      indicator={customSpinner}
    >
      {children}
    </Spin>
  </div>
);

/**
 * Page-level loading skeleton
 */
export const PageSkeleton = ({ rows = 4, showAvatar = true, showTitle = true }) => (
  <div className="page-skeleton">
    <Card>
      {showTitle && (
        <Skeleton.Input
          style={{ width: 300, height: 32, marginBottom: 24 }}
          active
        />
      )}
      <Skeleton
        avatar={showAvatar ? { size: 'large' } : false}
        paragraph={{ rows }}
        active
      />
    </Card>
  </div>
);

/**
 * Navigation skeleton for side menu
 */
export const NavigationSkeleton = ({ items = 6 }) => (
  <div className="navigation-skeleton">
    {Array.from({ length: items }, (_, index) => (
      <div key={index} className="nav-item-skeleton">
        <Skeleton.Avatar size="small" />
        <Skeleton.Input style={{ width: 120, height: 20, marginLeft: 12 }} active />
      </div>
    ))}
  </div>
);

/**
 * Upload page skeleton
 */
export const UploadSkeleton = () => (
  <div className="upload-skeleton">
    <Card title={<Skeleton.Input style={{ width: 200 }} active />}>
      <div className="upload-area-skeleton">
        <Skeleton.Avatar size={64} shape="square" />
        <Skeleton
          paragraph={{ rows: 2, width: ['60%', '40%'] }}
          title={false}
          active
        />
      </div>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        {Array.from({ length: 4 }, (_, index) => (
          <Col span={6} key={index}>
            <Card size="small">
              <Skeleton.Avatar size="large" shape="square" />
              <Skeleton
                paragraph={{ rows: 1 }}
                title={{ width: '60%' }}
                active
              />
            </Card>
          </Col>
        ))}
      </Row>
    </Card>
  </div>
);

/**
 * Annotation page skeleton
 */
export const AnnotationSkeleton = () => (
  <div className="annotation-skeleton">
    <Row gutter={[16, 16]}>
      {/* Canvas area skeleton */}
      <Col span={16}>
        <Card title={<Skeleton.Input style={{ width: 150 }} active />}>
          <div className="canvas-skeleton">
            <Skeleton.Avatar size={400} shape="square" />
          </div>
        </Card>
      </Col>

      {/* Tools panel skeleton */}
      <Col span={8}>
        <Card title={<Skeleton.Input style={{ width: 120 }} active />}>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="tool-item-skeleton">
              <Skeleton.Button size="small" />
              <Skeleton.Input style={{ width: 100, marginLeft: 8 }} active />
            </div>
          ))}
        </Card>

        {/* Annotation list skeleton */}
        <Card
          title={<Skeleton.Input style={{ width: 140 }} active />}
          style={{ marginTop: 16 }}
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="annotation-item-skeleton">
              <Skeleton.Avatar size="small" />
              <div className="annotation-content-skeleton">
                <Skeleton.Input style={{ width: 80 }} active />
                <Skeleton.Input style={{ width: 60, marginTop: 4 }} active />
              </div>
            </div>
          ))}
        </Card>
      </Col>
    </Row>
  </div>
);

/**
 * Training dashboard skeleton
 */
export const TrainingSkeleton = () => (
  <div className="training-skeleton">
    {/* Stats cards skeleton */}
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      {Array.from({ length: 4 }, (_, index) => (
        <Col span={6} key={index}>
          <Card>
            <div className="stat-card-skeleton">
              <Skeleton.Avatar size="large" />
              <div className="stat-content-skeleton">
                <Skeleton.Input style={{ width: 60 }} active />
                <Skeleton.Input style={{ width: 80, marginTop: 8 }} active />
              </div>
            </div>
          </Card>
        </Col>
      ))}
    </Row>

    {/* Training progress skeleton */}
    <Card title={<Skeleton.Input style={{ width: 180 }} active />}>
      <div className="progress-skeleton">
        <Skeleton.Input style={{ width: '100%', height: 8 }} active />
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={12}>
            <Skeleton paragraph={{ rows: 3 }} active />
          </Col>
          <Col span={12}>
            <Skeleton.Avatar size={200} shape="square" />
          </Col>
        </Row>
      </div>
    </Card>
  </div>
);

/**
 * Card skeleton for card layouts
 */
export const CardSkeleton = ({ showActions = true }) => (
  <div className="card-skeleton">
    <Card
      title={<Skeleton.Input style={{ width: 200 }} active />}
      actions={showActions ? [
        <Skeleton.Button active />,
        <Skeleton.Button active />,
        <Skeleton.Button active />
      ] : undefined}
    >
      <Skeleton.Image style={{ width: '100%', height: 200 }} />
      <Skeleton
        paragraph={{ rows: 3 }}
        active
        style={{ marginTop: 16 }}
      />
    </Card>
  </div>
);

/**
 * Table skeleton for data tables
 */
export const TableSkeleton = ({ columns = 4, rows = 5 }) => (
  <div className="table-skeleton">
    {/* Table header skeleton */}
    <div className="table-header-skeleton">
      {Array.from({ length: columns }, (_, index) => (
        <Skeleton.Input
          key={index}
          style={{ width: `${100 / columns}%`, height: 32 }}
          active
        />
      ))}
    </div>

    {/* Table rows skeleton */}
    {Array.from({ length: rows }, (_, rowIndex) => (
      <div key={rowIndex} className="table-row-skeleton">
        {Array.from({ length: columns }, (_, colIndex) => (
          <div key={colIndex} className="table-cell-skeleton">
            {colIndex === 0 ? (
              <Skeleton.Avatar size="small" />
            ) : (
              <Skeleton.Input style={{ width: '80%' }} active />
            )}
          </div>
        ))}
      </div>
    ))}
  </div>
);

/**
 * Chart skeleton for analytics
 */
export const ChartSkeleton = ({ height = 300 }) => (
  <div className="chart-skeleton" style={{ height }}>
    <Card title={<Skeleton.Input style={{ width: 150 }} active />}>
      <div className="chart-content-skeleton">
        <Skeleton.Avatar
          size={height - 100}
          shape="square"
          style={{ width: '100%' }}
        />
      </div>
    </Card>
  </div>
);

/**
 * Image gallery skeleton
 */
export const GallerySkeleton = ({ items = 8 }) => (
  <div className="gallery-skeleton">
    <Row gutter={[16, 16]}>
      {Array.from({ length: items }, (_, index) => (
        <Col span={6} key={index}>
          <Card size="small">
            <Skeleton.Avatar size="large" shape="square" style={{ width: '100%' }} />
            <Skeleton
              paragraph={{ rows: 1 }}
              title={{ width: '70%' }}
              active
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  </div>
);

/**
 * Form skeleton
 */
export const FormSkeleton = ({ fields = 5 }) => (
  <div className="form-skeleton">
    <Card title={<Skeleton.Input style={{ width: 200 }} active />}>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="form-field-skeleton">
          <Skeleton.Input style={{ width: 120, height: 20, marginBottom: 8 }} active />
          <Skeleton.Input style={{ width: '100%', height: 32 }} active />
        </div>
      ))}

      <div className="form-actions-skeleton">
        <Skeleton.Button size="large" />
        <Skeleton.Button size="large" style={{ marginLeft: 16 }} />
      </div>
    </Card>
  </div>
);

/**
 * Progressive loading with steps
 */
export const ProgressiveLoader = ({
  steps = ['Loading...', 'Processing...', 'Almost done...'],
  currentStep = 0,
  progress = 0
}) => (
  <div className="progressive-loader">
    <Card>
      <div className="progressive-content">
        <LoadingSpinner size="large" tip={steps[currentStep]} />
        <Progress
          percent={progress}
          status="active"
          strokeColor={{
            '0%': '#108ee9',
            '100%': '#87d068',
          }}
          style={{ marginTop: 24 }}
        />

        <div className="step-indicators">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`step-indicator ${index <= currentStep ? 'active' : ''}`}
            >
              <div className="step-number">{index + 1}</div>
              <div className="step-label">{step}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  </div>
);

/**
 * Lazy loading wrapper with fade-in animation
 */
export const LazyLoadWrapper = ({
  loading = false,
  skeleton = <PageSkeleton />,
  children,
  fadeIn = true
}) => {
  if (loading) {
    return skeleton;
  }

  return (
    <div className={`lazy-load-content ${fadeIn ? 'fade-in' : ''}`}>
      {children}
    </div>
  );
};

/**
 * Network-aware loading component
 */
export const NetworkAwareLoader = ({
  loading = false,
  children,
  fastSkeleton = <Skeleton active />,
  slowSkeleton = <PageSkeleton />
}) => {
  const [connectionType, setConnectionType] = React.useState('fast');

  React.useEffect(() => {
    if ('connection' in navigator) {
      const connection = navigator.connection;
      const type = connection.effectiveType;
      setConnectionType(['slow-2g', '2g'].includes(type) ? 'slow' : 'fast');
    }
  }, []);

  if (loading) {
    return connectionType === 'slow' ? slowSkeleton : fastSkeleton;
  }

  return children;
};

export default {
  LoadingSpinner,
  PageSkeleton,
  NavigationSkeleton,
  UploadSkeleton,
  AnnotationSkeleton,
  TrainingSkeleton,
  CardSkeleton,
  TableSkeleton,
  ChartSkeleton,
  GallerySkeleton,
  FormSkeleton,
  ProgressiveLoader,
  LazyLoadWrapper,
  NetworkAwareLoader,
};