import React from 'react';
import { Select, Tag, Typography, Space } from 'antd';
import { TagsOutlined } from '@ant-design/icons';
import './CategoryFilter.css';

const { Text } = Typography;
const { Option } = Select;

interface CategoryFilterProps {
  selectedCategories: string[];
  availableCategories: string[];
  onChange: (categories: string[]) => void;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  selectedCategories,
  availableCategories,
  onChange
}) => {
  const handleChange = (values: string[]) => {
    onChange(values);
  };

  const tagRender = (props: any) => {
    const { label, closable, onClose } = props;
    return (
      <Tag
        color="blue"
        closable={closable}
        onClose={onClose}
        style={{ marginRight: 3 }}
      >
        {label}
      </Tag>
    );
  };

  return (
    <div className="category-filter-container">
      <div className="filter-header">
        <Text strong>
          <TagsOutlined /> Categories
        </Text>
        <Text type="secondary" className="filter-description">
          Filter by logo categories
        </Text>
      </div>

      <Select
        mode="multiple"
        placeholder="Select categories to filter"
        value={selectedCategories}
        onChange={handleChange}
        tagRender={tagRender}
        className="category-select"
        allowClear
        showSearch
        filterOption={(input, option) =>
          (option?.children as unknown as string).toLowerCase().includes(input.toLowerCase())
        }
      >
        {availableCategories.map((category) => (
          <Option key={category} value={category}>
            {category}
          </Option>
        ))}
      </Select>

      {selectedCategories.length > 0 && (
        <div className="selected-count">
          <Space>
            <Text type="secondary">Selected:</Text>
            <Tag color="blue">{selectedCategories.length} categories</Tag>
          </Space>
        </div>
      )}
    </div>
  );
};