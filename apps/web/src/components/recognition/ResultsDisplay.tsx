import React from 'react';
import { List, Tag, Typography, Progress } from 'antd';
import { useTranslation } from 'react-i18next';
import type { RecognitionResult } from '@/types/recognition';

const { Text } = Typography;

interface ResultsDisplayProps {
  results: RecognitionResult[];
  onResultSelect: (result: RecognitionResult) => void;
  selectedResult: RecognitionResult | null;
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  results,
  onResultSelect,
  selectedResult,
}) => {
  const { t } = useTranslation();

  if (results.length === 0) {
    return (
      <div className="text-center py-8">
        <Text type="secondary">{t('recognition.noResults')}</Text>
      </div>
    );
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'green';
    if (confidence >= 0.5) return 'orange';
    return 'red';
  };

  return (
    <List
      className="results-list"
      dataSource={results}
      renderItem={(result) => (
        <List.Item
          className={`result-item ${selectedResult?.id === result.id ? 'selected' : ''}`}
          onClick={() => onResultSelect(result)}
          style={{ cursor: 'pointer' }}
        >
          <List.Item.Meta
            title={
              <div className="flex items-center gap-2">
                <Text strong>{result.logoName}</Text>
                <Tag color={getConfidenceColor(result.confidence)}>
                  {(result.confidence * 100).toFixed(1)}%
                </Tag>
              </div>
            }
            description={
              <div>
                <Progress
                  percent={Math.round(result.confidence * 100)}
                  size="small"
                  strokeColor={getConfidenceColor(result.confidence)}
                  showInfo={false}
                />
                {result.category && (
                  <Text type="secondary" className="text-sm">
                    {t('results.category')}: {result.category}
                  </Text>
                )}
              </div>
            }
          />
        </List.Item>
      )}
    />
  );
};

ResultsDisplay.displayName = 'ResultsDisplay';
