import React from 'react';
import { Card } from 'antd';

const TestPage: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <h1>Test Page Works!</h1>
        <p>This is a simple test page to verify routing.</p>
      </Card>
    </div>
  );
};

export default TestPage;
