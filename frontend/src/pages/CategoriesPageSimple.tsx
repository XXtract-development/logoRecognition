import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const CategoriesPageSimple: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <Title level={2}>Categories Page - Simple Version</Title>
        <p>This is a simplified version to test routing.</p>
        <p>If you see this, the route works!</p>
      </Card>
    </div>
  );
};

export default CategoriesPageSimple;
