import React, { useState, useEffect } from 'react';
import { Slider, InputNumber, Space, Typography } from 'antd';
import { PercentageOutlined } from '@ant-design/icons';
import './ConfidenceSlider.css';

const { Text, Title } = Typography;

interface ConfidenceSliderProps {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
  debounceDelay?: number;
}

export const ConfidenceSlider: React.FC<ConfidenceSliderProps> = ({
  min,
  max,
  onChange,
  debounceDelay = 300
}) => {
  const [localValues, setLocalValues] = useState<[number, number]>([min * 100, max * 100]);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalValues([min * 100, max * 100]);
  }, [min, max]);

  const handleSliderChange = (values: number[]) => {
    setLocalValues(values as [number, number]);

    // Debounce the onChange callback
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      onChange(values[0] / 100, values[1] / 100);
    }, debounceDelay);

    setDebounceTimer(timer);
  };

  const handleMinChange = (value: number | null) => {
    if (value === null) return;
    const newValues: [number, number] = [value, localValues[1]];
    setLocalValues(newValues);
    handleSliderChange(newValues);
  };

  const handleMaxChange = (value: number | null) => {
    if (value === null) return;
    const newValues: [number, number] = [localValues[0], value];
    setLocalValues(newValues);
    handleSliderChange(newValues);
  };

  const marks = {
    0: '0%',
    25: '25%',
    50: '50%',
    75: '75%',
    100: '100%'
  };

  return (
    <div className="confidence-slider-container">
      <div className="slider-header">
        <Text strong>
          <PercentageOutlined /> Confidence Range
        </Text>
        <Text type="secondary" className="slider-description">
          Filter detections by confidence score
        </Text>
      </div>

      <div className="slider-controls">
        <Slider
          range
          min={0}
          max={100}
          value={localValues}
          onChange={handleSliderChange}
          marks={marks}
          tooltip={{
            formatter: (value) => `${value}%`
          }}
        />

        <Space className="slider-inputs">
          <div className="input-group">
            <Text type="secondary">Min:</Text>
            <InputNumber
              min={0}
              max={localValues[1]}
              value={localValues[0]}
              onChange={handleMinChange}
              formatter={(value) => `${value}%`}
              parser={(value) => value?.replace('%', '') as unknown as number}
              size="small"
            />
          </div>

          <div className="input-group">
            <Text type="secondary">Max:</Text>
            <InputNumber
              min={localValues[0]}
              max={100}
              value={localValues[1]}
              onChange={handleMaxChange}
              formatter={(value) => `${value}%`}
              parser={(value) => value?.replace('%', '') as unknown as number}
              size="small"
            />
          </div>
        </Space>
      </div>
    </div>
  );
};