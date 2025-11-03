# 🚀 IMMEDIATE ACTION PLANS - Week 1 Sprint

**Created:** 2024-01-19
**Sprint:** 1 (Current)
**Focus:** Security, Frontend, Models, CI/CD

---

## 🔒 ACTION PLAN 1: Security Remediation

### Current State
- ❌ 15+ hardcoded passwords in docker-compose.yml
- ❌ PostgreSQL password: "postgres123" exposed
- ❌ MinIO credentials: "minioadmin" exposed
- ❌ Grafana password: "admin" exposed
- ✅ Backend auth_secure.py implemented

### Immediate Actions (Day 1)

#### Step 1: Create Environment Configuration
```bash
# Create .env.example
cat > .env.example << 'EOF'
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<secure-password>
POSTGRES_DB=logo_recognition
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}

# MinIO
MINIO_ROOT_USER=<secure-user>
MINIO_ROOT_PASSWORD=<secure-password>
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=${MINIO_ROOT_USER}
MINIO_SECRET_KEY=${MINIO_ROOT_PASSWORD}

# Redis
REDIS_PASSWORD=<secure-password>
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0

# JWT
JWT_SECRET_KEY=<generate-with-openssl-rand-base64-32>
JWT_ALGORITHM=HS256
JWT_EXPIRATION_MINUTES=30

# Monitoring
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=<secure-password>

# API
API_BASE_URL=http://backend:8000
FRONTEND_URL=http://localhost:3000
EOF
```

#### Step 2: Update docker-compose.yml
```yaml
# Replace all hardcoded values with environment variables
services:
  postgres:
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}

  minio:
    environment:
      - MINIO_ROOT_USER=${MINIO_ROOT_USER}
      - MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}

  backend:
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
      - REDIS_URL=${REDIS_URL}
```

#### Step 3: Implement Secrets Validation
```python
# backend/app/core/config.py
import os
from typing import Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    database_url: str

    # Security
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 30

    # Storage
    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str

    # Redis
    redis_url: str

    class Config:
        env_file = ".env"

    def validate_secrets(self):
        """Validate no default passwords are used"""
        forbidden = ["postgres123", "minioadmin", "admin", "password"]
        for key, value in self.dict().items():
            if any(f in str(value).lower() for f in forbidden):
                raise ValueError(f"Insecure default value detected for {key}")

settings = Settings()
settings.validate_secrets()
```

---

## 🎨 ACTION PLAN 2: Frontend Implementation

### Current State
- ❌ No Login UI
- ❌ Using sessionStorage instead of API
- ❌ No core components
- ✅ React/TypeScript setup ready

### Day 2: Login UI Implementation

#### Step 1: Create Login Component
```typescript
// frontend/src/pages/LoginPage.tsx
import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      await login(values.email, values.password);
      message.success('Login successful!');
      navigate('/dashboard');
    } catch (error) {
      message.error('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <Card title="Logo Recognition Login" className="login-card">
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please input your email!' },
              { type: 'email', message: 'Invalid email format!' }
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="Email" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Log in
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};
```

#### Step 2: Create API Service Layer
```typescript
// frontend/src/services/api.ts
import axios, { AxiosInstance } from 'axios';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1',
      timeout: 10000,
    });

    // Request interceptor for auth
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          await this.refreshToken();
          return this.client(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    const { access_token, refresh_token } = response.data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    return response.data;
  }

  async refreshToken() {
    const refresh_token = localStorage.getItem('refresh_token');
    const response = await this.client.post('/auth/refresh', { refresh_token });
    localStorage.setItem('access_token', response.data.access_token);
  }

  // Image APIs
  async uploadImage(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.client.post('/images/upload', formData);
  }

  async getImages(page = 1, limit = 20) {
    return this.client.get('/images/list', { params: { page, limit } });
  }

  // Detection APIs
  async detectLogos(imageId: string) {
    return this.client.post('/detection/detect', { image_id: imageId });
  }
}

export default new ApiService();
```

#### Step 3: Remove SessionStorage Usage
```typescript
// frontend/src/stores/imageStore.ts
import { create } from 'zustand';
import apiService from '../services/api';

interface ImageStore {
  images: any[];
  loading: boolean;
  fetchImages: () => Promise<void>;
  uploadImage: (file: File) => Promise<void>;
}

export const useImageStore = create<ImageStore>((set) => ({
  images: [],
  loading: false,

  fetchImages: async () => {
    set({ loading: true });
    try {
      const response = await apiService.getImages();
      set({ images: response.data.items });
    } catch (error) {
      console.error('Failed to fetch images:', error);
    } finally {
      set({ loading: false });
    }
  },

  uploadImage: async (file: File) => {
    try {
      const response = await apiService.uploadImage(file);
      // Refresh images list
      await useImageStore.getState().fetchImages();
    } catch (error) {
      console.error('Failed to upload image:', error);
      throw error;
    }
  }
}));
```

---

## 🤖 ACTION PLAN 3: ONNX Model Deployment

### Current State
- ✅ Detection pipeline code ready (A++ grade)
- ✅ GPU support implemented
- ❌ No actual ONNX model files
- ❌ Mock detection only

### Day 3: Deploy Real Models

#### Step 1: Prepare ONNX Models
```bash
# Download pre-trained model or convert from PyTorch
mkdir -p models/logo_detection

# Option 1: Download pre-trained ONNX model
wget https://example.com/logo_detection_model.onnx -O models/logo_detection/model.onnx

# Option 2: Convert PyTorch model to ONNX
python scripts/convert_to_onnx.py \
  --input models/pytorch/model.pth \
  --output models/logo_detection/model.onnx \
  --input-size 640 \
  --opset 11
```

#### Step 2: Create Model Configuration
```yaml
# models/logo_detection/config.yaml
model:
  name: logo_detection_v1
  version: "1.0.0"
  framework: onnx
  runtime: onnxruntime

input:
  shape: [1, 3, 640, 640]
  type: float32
  preprocessing:
    resize: [640, 640]
    normalize: [[0.485, 0.456, 0.406], [0.229, 0.224, 0.225]]

output:
  format: "detection"
  classes: 50
  confidence_threshold: 0.5
  nms_threshold: 0.45

performance:
  batch_size: 32
  use_gpu: true
  warmup_runs: 3
```

#### Step 3: Update Detection Service
```python
# backend/app/services/detection/model_loader.py
import onnxruntime as ort
import yaml
import numpy as np
from pathlib import Path

class ModelLoader:
    def __init__(self, model_path: str = "models/logo_detection"):
        self.model_path = Path(model_path)
        self.config = self._load_config()
        self.session = self._load_model()

    def _load_config(self):
        with open(self.model_path / "config.yaml") as f:
            return yaml.safe_load(f)

    def _load_model(self):
        providers = ['CUDAExecutionProvider'] if self.config['performance']['use_gpu'] else ['CPUExecutionProvider']
        return ort.InferenceSession(
            str(self.model_path / "model.onnx"),
            providers=providers
        )

    def predict(self, image: np.ndarray):
        # Preprocess
        processed = self._preprocess(image)

        # Run inference
        outputs = self.session.run(None, {
            self.session.get_inputs()[0].name: processed
        })

        # Postprocess
        return self._postprocess(outputs)
```

---

## 🔧 ACTION PLAN 4: CI/CD Pipeline Implementation

### Current State
- ❌ No GitHub Actions workflows
- ❌ Manual deployment only
- ✅ Docker setup ready
- ✅ Tests ready to run

### Day 4: Setup CI/CD

#### Step 1: Create GitHub Actions Workflow
```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install -r backend/requirements.txt
          pip install pytest pytest-cov

      - name: Run tests
        run: |
          cd backend
          pytest --cov=app --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./backend/coverage.xml

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run security scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'

  build:
    needs: [test, security]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Login to DockerHub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push Backend
        uses: docker/build-push-action@v4
        with:
          context: ./backend
          push: true
          tags: |
            ${{ secrets.DOCKER_USERNAME }}/logo-backend:latest
            ${{ secrets.DOCKER_USERNAME }}/logo-backend:${{ github.sha }}

      - name: Build and push Frontend
        uses: docker/build-push-action@v4
        with:
          context: ./frontend
          push: true
          tags: |
            ${{ secrets.DOCKER_USERNAME }}/logo-frontend:latest
            ${{ secrets.DOCKER_USERNAME }}/logo-frontend:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - name: Deploy to Kubernetes
        run: |
          echo "Deploy to production cluster"
          # kubectl apply -f k8s/
```

#### Step 2: Create Deployment Script
```bash
#!/bin/bash
# scripts/deploy.sh

set -e

ENVIRONMENT=${1:-staging}
VERSION=${2:-latest}

echo "🚀 Deploying version $VERSION to $ENVIRONMENT"

# Load environment config
source .env.$ENVIRONMENT

# Update Kubernetes manifests
kubectl set image deployment/backend backend=$DOCKER_USERNAME/logo-backend:$VERSION
kubectl set image deployment/frontend frontend=$DOCKER_USERNAME/logo-frontend:$VERSION

# Wait for rollout
kubectl rollout status deployment/backend
kubectl rollout status deployment/frontend

# Run migrations
kubectl exec -it deploy/backend -- python manage.py migrate

# Health check
curl -f http://$APP_URL/api/health || exit 1

echo "✅ Deployment complete!"
```

---

## 📋 DAILY CHECKLIST - Sprint 1

### Monday
- [ ] Remove all hardcoded passwords
- [ ] Create .env files
- [ ] Update docker-compose.yml
- [ ] Start Login UI component
- [ ] Team standup 09:00

### Tuesday
- [ ] Complete Login UI
- [ ] Implement API service layer
- [ ] Remove sessionStorage usage
- [ ] Create Dashboard layout
- [ ] Security review 14:00

### Wednesday
- [ ] Download/prepare ONNX models
- [ ] Deploy models to /models
- [ ] Test real inference
- [ ] Validate detection accuracy
- [ ] ML demo 16:00

### Thursday
- [ ] Setup GitHub Actions
- [ ] Create CI/CD pipeline
- [ ] Run security scans
- [ ] Fix integration bugs
- [ ] Code review 15:00

### Friday
- [ ] Sprint demo preparation
- [ ] Final testing
- [ ] Documentation update
- [ ] Sprint demo 14:00
- [ ] Retrospective 16:00

---

## 🎯 SUCCESS CRITERIA - End of Week 1

### Must Have (Sprint Commitment)
- ✅ Zero hardcoded passwords
- ✅ Working login flow
- ✅ Real ONNX model deployed
- ✅ Basic CI/CD pipeline
- ✅ Frontend connected to backend

### Should Have
- ✅ Dashboard layout complete
- ✅ Image upload working
- ✅ Security scan passing
- ✅ 60% test coverage

### Could Have
- Detection results display
- Performance optimization
- Advanced monitoring

---

**Next Review:** Friday 14:00
**Stakeholders:** Product Owner, Tech Lead, Security Team