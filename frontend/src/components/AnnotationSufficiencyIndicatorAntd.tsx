import React, { useState, useEffect } from 'react';
import {
  Card,
  Progress,
  Typography,
  Space,
  Tag,
  Alert,
  Button,
  Row,
  Col,
  Statistic,
  Divider,
  List,
  Spin,
} from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  RocketOutlined,
  ReloadOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

interface SufficiencyAnalysis {
  category: string;
  value: string;
  summary: {
    is_sufficient: boolean;
    current_confidence: number;
    target_confidence: number;
    confidence_level: string;
    estimated_accuracy_range: {
      min: number;
      max: number;
    };
  };
  metrics: {
    total_annotations: number;
    unique_images: number;
    avg_annotations_per_image: number;
    annotation_diversity_score: number;
    temporal_distribution: number;
    annotator_agreement_score: number;
    augmentation_factor: number;
  };
  quality_factors: Record<string, number>;
  requirements: {
    required_additional_annotations: number;
    recommendations: string[];
  };
  visual_indicator: {
    percentage: number;
    color: string;
    status: string;
    icon: string;
    progress_bar: {
      value: number;
      max: number;
      segments: Array<{
        threshold: number;
        label: string;
      }>;
    };
  };
}

interface AnnotationSufficiencyIndicatorProps {
  category: string;
  value: string;
  onTrainingReady?: (isReady: boolean) => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
  sessionId?: string;
}

const AnnotationSufficiencyIndicatorAntd: React.FC<AnnotationSufficiencyIndicatorProps> = ({
  category,
  value,
  onTrainingReady,
  autoRefresh = true,
  refreshInterval = 30000,
  sessionId = `session-${Date.now()}`,
}) => {
  const [analysis, setAnalysis] = useState<SufficiencyAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetAccuracy, setTargetAccuracy] = useState(95);

  // Fetch sufficiency analysis
  const fetchAnalysis = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/annotation-metrics/sufficiency/${category}/${value}?` +
        `target_accuracy=${targetAccuracy}&enable_augmentation=true`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch analysis');
      }

      const data = await response.json();
      setAnalysis(data.analysis);

      if (onTrainingReady) {
        onTrainingReady(data.analysis.summary.is_sufficient);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchAnalysis();
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [category, value, targetAccuracy]);

  const getStatusIcon = (level: string) => {
    switch (level) {
      case 'excellent':
      case 'very_high':
        return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 24 }} />;
      case 'high':
        return <CheckCircleOutlined style={{ color: '#1890ff', fontSize: 24 }} />;
      case 'moderate':
        return <WarningOutlined style={{ color: '#faad14', fontSize: 24 }} />;
      case 'low':
        return <WarningOutlined style={{ color: '#ff4d4f', fontSize: 24 }} />;
      default:
        return <CloseCircleOutlined style={{ color: '#cf1322', fontSize: 24 }} />;
    }
  };

  const getProgressStatus = (confidence: number) => {
    if (confidence >= 95) return 'success';
    if (confidence >= 70) return 'normal';
    if (confidence >= 50) return 'active';
    return 'exception';
  };

  const getRecommendationIcon = (text: string) => {
    if (text.startsWith('✅')) return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    if (text.startsWith('🔴')) return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
    if (text.startsWith('🟡')) return <WarningOutlined style={{ color: '#faad14' }} />;
    if (text.startsWith('🟢')) return <InfoCircleOutlined style={{ color: '#52c41a' }} />;
    if (text.startsWith('💡')) return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
    return <InfoCircleOutlined />;
  };

  if (loading) {
    return (
      <Card style={{ marginBottom: 20 }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16 }}>Loading sufficiency analysis...</Paragraph>
        </div>
      </Card>
    );
  }

  if (error || !analysis) {
    return (
      <Alert
        message="Error"
        description={error || 'Failed to load analysis'}
        type="error"
        showIcon
        style={{ marginBottom: 20 }}
      />
    );
  }

  const confidence = Math.round(analysis.summary.current_confidence);
  const isReady = analysis.summary.is_sufficient;

  return (
    <Card
      title={
        <Space>
          <RocketOutlined />
          <span>Training Readiness - {value}</span>
          {isReady && <Tag color="success">Ready</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={fetchAnalysis}
          >
            Refresh
          </Button>
        </Space>
      }
      style={{ marginBottom: 20 }}
    >
      {/* Main Progress Indicator */}
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={8}>
          <div style={{ textAlign: 'center' }}>
            <Progress
              type="circle"
              percent={confidence}
              status={getProgressStatus(confidence)}
              format={(percent) => (
                <div>
                  <div style={{ fontSize: 28, fontWeight: 'bold' }}>{percent}%</div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>Confidence</div>
                </div>
              )}
              strokeWidth={10}
              width={150}
            />
            <div style={{ marginTop: 16 }}>
              {getStatusIcon(analysis.visual_indicator.status)}
              <Text strong style={{ display: 'block', marginTop: 8 }}>
                {analysis.visual_indicator.status.replace(/_/g, ' ').toUpperCase()}
              </Text>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={16}>
          {/* Key Metrics */}
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={8}>
              <Statistic
                title="Annotations"
                value={analysis.metrics.total_annotations}
                suffix={analysis.requirements.required_additional_annotations > 0 ?
                  `(+${analysis.requirements.required_additional_annotations})` : '✓'}
              />
            </Col>
            <Col xs={12} sm={8}>
              <Statistic
                title="Images"
                value={analysis.metrics.unique_images}
              />
            </Col>
            <Col xs={12} sm={8}>
              <Statistic
                title="Accuracy Range"
                value={`${analysis.summary.estimated_accuracy_range.min}-${analysis.summary.estimated_accuracy_range.max}%`}
              />
            </Col>
          </Row>

          <Divider />

          {/* Quality Factors */}
          <Title level={5}>Quality Factors</Title>
          <Space direction="vertical" style={{ width: '100%' }}>
            {Object.entries(analysis.quality_factors).slice(0, 3).map(([key, value]) => {
              const percentage = Math.round(value * 100);
              let status: 'success' | 'normal' | 'exception' | 'active' = 'normal';
              if (percentage >= 80) status = 'success';
              else if (percentage >= 60) status = 'normal';
              else if (percentage >= 40) status = 'active';
              else status = 'exception';

              return (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Text>
                    <Text strong>{percentage}%</Text>
                  </div>
                  <Progress
                    percent={percentage}
                    status={status}
                    size="small"
                    showInfo={false}
                  />
                </div>
              );
            })}
          </Space>
        </Col>
      </Row>

      <Divider />

      {/* Recommendations */}
      {!isReady && analysis.requirements.recommendations.length > 0 && (
        <>
          <Alert
            message="Actions Needed"
            description={
              <List
                size="small"
                dataSource={analysis.requirements.recommendations.slice(0, 3)}
                renderItem={(rec) => {
                  const cleanRec = rec.replace(/^[🔴🟡🟢💡✅]\s*/, '');
                  return (
                    <List.Item>
                      <Space>
                        {getRecommendationIcon(rec)}
                        <Text>{cleanRec}</Text>
                      </Space>
                    </List.Item>
                  );
                }}
              />
            }
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        </>
      )}

      {/* Success Message */}
      {isReady && (
        <Alert
          message="Ready for Training!"
          description={`This logo has sufficient annotations for ${targetAccuracy}% target accuracy. You can now start training.`}
          type="success"
          showIcon
          action={
            <Button type="primary" size="small" icon={<RocketOutlined />}>
              Start Training
            </Button>
          }
        />
      )}

      {/* Target Accuracy Toggle */}
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <Space>
          <Text>Target Accuracy:</Text>
          <Button.Group>
            <Button
              type={targetAccuracy === 95 ? 'primary' : 'default'}
              onClick={() => setTargetAccuracy(95)}
            >
              95%
            </Button>
            <Button
              type={targetAccuracy === 99 ? 'primary' : 'default'}
              onClick={() => setTargetAccuracy(99)}
            >
              99%
            </Button>
          </Button.Group>
        </Space>
      </div>
    </Card>
  );
};

export default AnnotationSufficiencyIndicatorAntd;