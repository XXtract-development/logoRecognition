import React from 'react';
import { Row, Col, Card, Statistic, Progress, Typography } from 'antd';
import {
  TrophyOutlined,
  TagsOutlined,
  PercentageOutlined,
  PieChartOutlined
} from '@ant-design/icons';
import './StatsOverview.css';

const { Text } = Typography;

interface StatsOverviewProps {
  statistics: {
    totalDetections: number;
    uniqueBrands: number;
    averageConfidence: number;
    brandDistribution: Array<{ brand: string; count: number }>;
  };
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ statistics }) => {
  const { totalDetections, uniqueBrands, averageConfidence, brandDistribution } = statistics;

  // Get top 3 brands
  const topBrands = brandDistribution
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return '#52c41a';
    if (confidence >= 0.7) return '#faad14';
    return '#f5222d';
  };

  return (
    <div className="stats-overview">
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card className="stat-card">
            <Statistic
              title="Total Detections"
              value={totalDetections}
              prefix={<TagsOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card className="stat-card">
            <Statistic
              title="Unique Brands"
              value={uniqueBrands}
              prefix={<TrophyOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card className="stat-card">
            <div className="confidence-stat">
              <Text type="secondary" className="stat-title">
                Average Confidence
              </Text>
              <Progress
                type="circle"
                percent={Math.round(averageConfidence * 100)}
                strokeColor={getConfidenceColor(averageConfidence)}
                width={60}
                format={(percent) => `${percent}%`}
              />
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card className="stat-card">
            <div className="top-brands">
              <Text type="secondary" className="stat-title">
                <PieChartOutlined /> Top Brands
              </Text>
              {topBrands.length > 0 ? (
                <div className="brand-list">
                  {topBrands.map((brand, index) => (
                    <div key={brand.brand} className="brand-item">
                      <Text className="brand-rank">#{index + 1}</Text>
                      <Text ellipsis className="brand-name">
                        {brand.brand}
                      </Text>
                      <Text type="secondary" className="brand-count">
                        {brand.count}
                      </Text>
                    </div>
                  ))}
                </div>
              ) : (
                <Text type="secondary" className="no-data">No data</Text>
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};