/**
 * LoginPage - Authentication against xxtract-portal credentials
 * Simple email/password form with JWT cookie-based auth
 */
import React, { useState } from 'react';
import { Card, Form, Input, Button, Alert, Typography } from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import apiClient from '@/services/apiClient';

const { Title, Text } = Typography;

interface LoginFormValues {
  email: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/auth/login', {
        email: values.email,
        password: values.password,
      });

      if (response.data.success) {
        navigate('/training');
      } else {
        setError(response.data.error || 'Login failed');
      }
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { error?: string } } }).response?.data?.error
      ) {
        setError(
          (err as { response: { data: { error: string } } }).response.data.error
        );
      } else {
        setError('Unable to connect to the server. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #2F5A7A 0%, #54949E 100%)',
        padding: 24,
      }}
    >
      <Card
        style={{
          width: 400,
          maxWidth: '100%',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2} style={{ color: '#2F5A7A', marginBottom: 8 }}>
            Logo Recognition
          </Title>
          <Text type="secondary">
            Sign in with your XXtract account
          </Text>
        </div>

        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: 24 }}
          />
        )}

        <Form
          name="login"
          layout="vertical"
          onFinish={onFinish}
          autoComplete="on"
          size="large"
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: '#54949E' }} />}
              placeholder="name@company.com"
              autoComplete="email"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: 'Please enter your password' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#54949E' }} />}
              placeholder="Password"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                background: '#2F5A7A',
                borderColor: '#2F5A7A',
                height: 44,
                borderRadius: 8,
                fontWeight: 600,
              }}
            >
              Sign in
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default LoginPage;
