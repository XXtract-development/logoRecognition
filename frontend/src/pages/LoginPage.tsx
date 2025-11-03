/**
 * Login Page Component
 * @module pages/LoginPage
 * @description User authentication page with email/password login
 */

import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Form, Input, Button, Card, Alert, Checkbox, Divider, message } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined, LoadingOutlined } from '@ant-design/icons';
import { authService, LoginCredentials } from '../services/authService';
import './LoginPage.css';

/**
 * Login form values interface
 * @interface LoginFormValues
 * @property {string} email - User email address
 * @property {string} password - User password
 * @property {boolean} remember - Whether to remember the user
 */
interface LoginFormValues {
  email: string;
  password: string;
  remember: boolean;
}

/**
 * Login Page Component
 * @component
 * @description Provides user authentication interface with form validation
 * @returns {JSX.Element} Login page component
 */
const LoginPage: React.FC = () => {
  const [form] = Form.useForm<LoginFormValues>();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get redirect path from location state or default to dashboard
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  /**
   * Handles form submission and authentication
   * @param {LoginFormValues} values - Form values
   * @returns {Promise<void>}
   */
  const handleSubmit = async (values: LoginFormValues): Promise<void> => {
    setError(null);
    setLoading(true);

    try {
      // Authenticate user
      const credentials: LoginCredentials = {
        email: values.email,
        password: values.password,
      };

      const user = await authService.login(credentials);

      // Store remember preference
      if (values.remember) {
        localStorage.setItem('remember_email', values.email);
      } else {
        localStorage.removeItem('remember_email');
      }

      // Show success message
      message.success(`Welcome back, ${user.name}!`);

      // Redirect to original destination or dashboard
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('Login failed:', err);
      setError(err.message || 'Invalid email or password. Please try again.');
      message.error('Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles demo login for testing
   * @returns {void}
   */
  const handleDemoLogin = (): void => {
    form.setFieldsValue({
      email: 'demo@logorecognition.com',
      password: 'demo123456',
      remember: false,
    });
    form.submit();
  };

  // Check for remembered email
  React.useEffect(() => {
    const rememberedEmail = localStorage.getItem('remember_email');
    if (rememberedEmail) {
      form.setFieldValue('email', rememberedEmail);
      form.setFieldValue('remember', true);
    }
  }, [form]);

  return (
    <div className="login-page">
      <div className="login-container">
        <Card className="login-card" bordered={false}>
          <div className="login-header">
            <img
              src="/logo.png"
              alt="Logo Recognition"
              className="login-logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <h1 className="login-title">Logo Recognition System</h1>
            <p className="login-subtitle">Sign in to your account</p>
          </div>

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              closable
              onClose={() => setError(null)}
              className="login-error"
            />
          )}

          <Form
            form={form}
            name="login"
            onFinish={handleSubmit}
            autoComplete="off"
            layout="vertical"
            requiredMark={false}
            initialValues={{ remember: false }}
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
                prefix={<UserOutlined />}
                placeholder="Enter your email"
                size="large"
                autoComplete="email"
                disabled={loading}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[
                { required: true, message: 'Please enter your password' },
                { min: 6, message: 'Password must be at least 6 characters' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Enter your password"
                size="large"
                autoComplete="current-password"
                disabled={loading}
              />
            </Form.Item>

            <Form.Item>
              <div className="login-options">
                <Form.Item name="remember" valuePropName="checked" noStyle>
                  <Checkbox disabled={loading}>Remember me</Checkbox>
                </Form.Item>
                <Link to="/forgot-password" className="login-forgot">
                  Forgot password?
                </Link>
              </div>
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                loading={loading}
                icon={loading ? <LoadingOutlined /> : <LoginOutlined />}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </Form.Item>

            <Divider>Or</Divider>

            <Form.Item>
              <Button
                type="default"
                size="large"
                block
                onClick={handleDemoLogin}
                disabled={loading}
              >
                Try Demo Account
              </Button>
            </Form.Item>

            <div className="login-footer">
              <span>Don't have an account? </span>
              <Link to="/register">Sign up now</Link>
            </div>
          </Form>

          <div className="login-features">
            <Divider />
            <p className="features-title">Features:</p>
            <ul className="features-list">
              <li>✓ AI-powered logo detection</li>
              <li>✓ Real-time processing</li>
              <li>✓ Batch annotation tools</li>
              <li>✓ Model training pipeline</li>
              <li>✓ Export & reporting</li>
            </ul>
          </div>
        </Card>

        <div className="login-copyright">
          <p>© 2024 Logo Recognition System. All rights reserved.</p>
          <p>
            <Link to="/privacy">Privacy Policy</Link> • <Link to="/terms">Terms of Service</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;