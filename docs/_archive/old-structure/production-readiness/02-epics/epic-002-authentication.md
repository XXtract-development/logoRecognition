# EPIC-002: Authentication & Authorization
**Sprint:** 1 (Week 1)
**Priority:** P1 - CRITICAL
**Story Points:** 13
**Status:** 🔴 Not Started

---

## 📊 Epic Overview

The authentication system is implemented in the backend but completely disconnected from the frontend. Users cannot log in, routes are not protected, and there's no session management. This epic establishes the complete auth flow required for production.

## 🎯 Epic Goals

1. **Connect frontend to backend auth** - Complete login/logout flow
2. **Protect sensitive routes** - Implement route guards
3. **Session management** - JWT with refresh tokens
4. **Role-based access** - Admin/User/Viewer roles

## 🚨 Current Issues

### Critical Problems
- **Frontend has no login page or flow**
- **JWT implementation exists but unused**
- **No protected routes in React app**
- **No token storage mechanism**
- **No refresh token implementation**
- **No session management in Redis**

### Impact
- 🔴 **Security:** All routes publicly accessible
- 🔴 **Functionality:** No user segregation
- 🔴 **Compliance:** No audit trail
- 🔴 **UX:** No personalized experience

---

## 📋 User Stories

### STORY-005: Frontend Login Flow
**Points:** 5
**As a** User
**I want to** log in to the application
**So that** I can access my personal workspace

#### UI Implementation
```jsx
// frontend/src/pages/Login.jsx
import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const Login = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important for cookies
        body: JSON.stringify(values)
      });

      if (response.ok) {
        const data = await response.json();
        login(data.user);
        message.success('Login successful!');
        navigate('/dashboard');
      } else {
        message.error('Invalid credentials');
      }
    } catch (error) {
      message.error('Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Login" style={{ maxWidth: 400, margin: '100px auto' }}>
      <Form onFinish={onFinish} layout="vertical">
        <Form.Item
          name="email"
          rules={[
            { required: true, message: 'Please enter your email' },
            { type: 'email', message: 'Invalid email format' }
          ]}
        >
          <Input placeholder="Email" size="large" />
        </Form.Item>

        <Form.Item
          name="password"
          rules={[
            { required: true, message: 'Please enter your password' },
            { min: 8, message: 'Password must be at least 8 characters' }
          ]}
        >
          <Input.Password placeholder="Password" size="large" />
        </Form.Item>

        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          loading={loading}
        >
          Login
        </Button>
      </Form>
    </Card>
  );
};
```

#### Backend JWT Implementation
```python
# backend/app/routers/auth.py
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@router.post("/login")
async def login(
    credentials: LoginSchema,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    # Verify user credentials
    user = await authenticate_user(db, credentials.email, credentials.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Create tokens
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role}
    )
    refresh_token = create_refresh_token(
        data={"sub": str(user.id)}
    )

    # Store refresh token in Redis
    await redis.setex(
        f"refresh_token:{user.id}",
        timedelta(days=7),
        refresh_token
    )

    # Set httpOnly cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=1800  # 30 minutes
    )

    return {
        "user": UserResponse.from_orm(user),
        "token_type": "bearer"
    }
```

#### Acceptance Criteria
- [ ] Login page with email/password fields
- [ ] Form validation (email format, password strength)
- [ ] JWT token stored securely (httpOnly cookie)
- [ ] Redirect to dashboard after login
- [ ] Error messages for invalid credentials
- [ ] Loading state during authentication

#### Files to Create/Modify
- `frontend/src/pages/Login.jsx` (create)
- `frontend/src/pages/Register.jsx` (create)
- `frontend/src/hooks/useAuth.js` (create)
- `frontend/src/context/AuthContext.js` (create)
- `backend/app/routers/auth.py`
- `frontend/src/router/AppRouter.js`

---

### STORY-006: Protected Route Guards
**Points:** 3
**As a** System Administrator
**I want to** protect sensitive routes
**So that** only authenticated users can access them

#### Route Protection Implementation
```jsx
// frontend/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Spin } from 'antd';

const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    // Save the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

// frontend/src/router/AppRouter.js
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/" element={
    <ProtectedRoute>
      <HomePage />
    </ProtectedRoute>
  } />
  <Route path="/admin" element={
    <ProtectedRoute requiredRole="admin">
      <AdminPanel />
    </ProtectedRoute>
  } />
</Routes>
```

#### Axios Interceptor
```javascript
// frontend/src/services/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true // Send cookies
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Token is in httpOnly cookie, sent automatically
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired, try refresh
      const refreshed = await refreshToken();
      if (refreshed) {
        // Retry original request
        return api(error.config);
      } else {
        // Refresh failed, redirect to login
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
```

#### Acceptance Criteria
- [ ] Auth guard HOC implemented
- [ ] Redirect to login if not authenticated
- [ ] Token validation on each request
- [ ] 401 handling with auto-redirect
- [ ] Remember requested URL for post-login redirect
- [ ] Role-based route protection

#### Files to Create/Modify
- `frontend/src/components/ProtectedRoute.jsx` (create)
- `frontend/src/components/RoleGuard.jsx` (create)
- `frontend/src/services/api.js` (create)
- `frontend/src/router/AppRouter.js`
- `frontend/src/hooks/useAuth.js`

---

### STORY-007: Refresh Token Mechanism
**Points:** 5
**As a** User
**I want to** stay logged in seamlessly
**So that** I don't have to re-login frequently

#### Refresh Token Implementation
```python
# backend/app/routers/auth.py
@router.post("/refresh")
async def refresh_token(
    request: Request,
    response: Response,
    redis: Redis = Depends(get_redis)
):
    # Get refresh token from cookie
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    try:
        # Verify refresh token
        payload = jwt.decode(
            refresh_token,
            settings.REFRESH_SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        user_id = payload.get("sub")

        # Check if token exists in Redis
        stored_token = await redis.get(f"refresh_token:{user_id}")
        if not stored_token or stored_token != refresh_token:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        # Rotate refresh token
        new_access_token = create_access_token(
            data={"sub": user_id, "role": payload.get("role")}
        )
        new_refresh_token = create_refresh_token(
            data={"sub": user_id}
        )

        # Update Redis with new refresh token
        await redis.setex(
            f"refresh_token:{user_id}",
            timedelta(days=7),
            new_refresh_token
        )

        # Delete old refresh token
        await redis.delete(f"refresh_token_old:{user_id}")

        # Set new cookies
        response.set_cookie(
            key="access_token",
            value=new_access_token,
            httponly=True,
            secure=True,
            max_age=1800
        )
        response.set_cookie(
            key="refresh_token",
            value=new_refresh_token,
            httponly=True,
            secure=True,
            max_age=604800  # 7 days
        )

        return {"status": "refreshed"}

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

#### Frontend Auto-Refresh
```javascript
// frontend/src/services/authService.js
class AuthService {
  constructor() {
    this.refreshTimer = null;
    this.refreshThreshold = 5 * 60 * 1000; // 5 minutes before expiry
  }

  startRefreshTimer() {
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Schedule refresh 5 minutes before token expires
    const refreshIn = 25 * 60 * 1000; // 25 minutes (token valid for 30)

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refreshToken();
        this.startRefreshTimer(); // Reschedule
      } catch (error) {
        console.error('Token refresh failed:', error);
        this.logout();
      }
    }, refreshIn);
  }

  async refreshToken() {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Refresh failed');
    }

    return true;
  }

  logout() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    // Clear auth context and redirect
    window.location.href = '/login';
  }
}
```

#### Acceptance Criteria
- [ ] Refresh token endpoint implemented
- [ ] Auto-refresh before token expiry
- [ ] Silent refresh in background
- [ ] Logout on refresh failure
- [ ] Secure refresh token storage
- [ ] Token rotation on each refresh

#### Files to Create/Modify
- `backend/app/routers/auth.py`
- `backend/app/utils/jwt.py` (create)
- `frontend/src/services/authService.js` (create)
- `frontend/src/context/AuthContext.js`
- `backend/app/dependencies.py`

---

## 🔧 Technical Requirements

### JWT Configuration
```python
# backend/app/config/auth.py
JWT_CONFIG = {
    'ACCESS_TOKEN_EXPIRE_MINUTES': 30,
    'REFRESH_TOKEN_EXPIRE_DAYS': 7,
    'ALGORITHM': 'RS256',  # Use RS256 for production
    'ISSUER': 'logo-recognition-api',
    'AUDIENCE': 'logo-recognition-app'
}

# Use RSA keys for production
PRIVATE_KEY = load_private_key('keys/private.pem')
PUBLIC_KEY = load_public_key('keys/public.pem')
```

### Session Management
```yaml
Redis Configuration:
  session_prefix: "session:"
  refresh_prefix: "refresh_token:"
  session_ttl: 1800  # 30 minutes
  refresh_ttl: 604800  # 7 days
  max_sessions_per_user: 5
```

### Security Requirements
- Passwords hashed with bcrypt (cost factor 12)
- JWT signed with RS256 (RSA keys)
- Tokens transmitted only via httpOnly cookies
- CSRF protection enabled
- Rate limiting on auth endpoints (5 attempts/minute)

---

## 📈 Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Login Success Rate | 0% | >95% | Successful logins/attempts |
| Token Refresh Rate | 0% | >90% | Successful refreshes |
| Session Duration | 0 | 30 min | Average session length |
| Protected Routes | 0 | 100% | Routes with guards |
| Auth Response Time | N/A | <200ms | p99 latency |

---

## 🔗 Dependencies

### Prerequisites
- EPIC-001 completed (database connectivity)
- Redis configured for session storage
- RSA key pair generated for JWT

### Blocking
- Blocks all user-specific functionality
- Required for audit logging
- Prerequisite for RBAC implementation

---

## ✅ Definition of Done

- [ ] All story acceptance criteria met
- [ ] Login/logout flow working end-to-end
- [ ] All routes protected appropriately
- [ ] Refresh token rotation working
- [ ] Session management in Redis
- [ ] Rate limiting on auth endpoints
- [ ] Security scan passing (no auth vulnerabilities)
- [ ] Integration tests for auth flow
- [ ] Documentation updated
- [ ] Deployed to staging

---

## 📚 References

- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Authentication Cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [React Router Auth Example](https://reactrouter.com/en/main/start/examples#auth)
- Current PRD: `docs/prd_v2.md#authentication-system`
- Backend Auth: `backend/app/routers/auth.py`

---

**Epic Owner:** Full Stack Team
**Sprint:** 1 (Week 1)
**Last Updated:** 2024-09-19