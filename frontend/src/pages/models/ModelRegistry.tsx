// Model Registry Page (US-015)
import React from 'react';
import { Layout, Typography, Space, Badge } from 'antd';
import { DatabaseOutlined, CheckCircleOutlined } from '@ant-design/icons';
import ModelRegistryTable from '../../components/models/ModelRegistryTable';
import useModelRegistryStore from '../../store/modelRegistryStore';

const { Content, Header } = Layout;
const { Title, Text } = Typography;

const ModelRegistry: React.FC = () => {
  const { getActiveModel } = useModelRegistryStore();
  const activeModel = getActiveModel();

  return (
    <Layout>
      <Header style={{ background: '#fff', padding: '16px 24px' }}>
        <Space direction="vertical">
          <Title level={3} style={{ margin: 0 }}>
            <DatabaseOutlined /> Model Registry
          </Title>
          {activeModel && (
            <Space>
              <Badge status="success" />
              <Text type="secondary">
                Active Model: {activeModel.name} v{activeModel.version}
              </Text>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <Text type="secondary">
                Accuracy: {(activeModel.metrics.accuracy * 100).toFixed(1)}%
              </Text>
            </Space>
          )}
        </Space>
      </Header>

      <Content style={{ padding: '24px' }}>
        <ModelRegistryTable />
      </Content>
    </Layout>
  );
};

export default ModelRegistry;