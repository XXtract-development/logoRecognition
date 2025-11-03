"""
Comprehensive tests for Secure Authentication
"""

import pytest
import jwt
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch, MagicMock
from fastapi import HTTPException
from sqlalchemy.orm import Session

# Mock database before importing
with patch('app.database.get_db'):
    from app.auth_secure import (
        SecureAuthService,
        TokenPayload,
        UserSession,
        get_current_user,
        get_current_active_user,
        require_roles,
        require_permissions,
        rate_limit,
        SECRET_KEY,
        ALGORITHM
    )


@pytest.fixture
def auth_service():
    """Create auth service instance"""
    return SecureAuthService()


@pytest.fixture
def mock_db():
    """Mock database session"""
    return MagicMock(spec=Session)


@pytest.fixture
def sample_user():
    """Sample user data"""
    return {
        "id": "user123",
        "username": "testuser",
        "email": "test@example.com",
        "hashed_password": "$2b$12$test_hash",
        "is_active": True,
        "roles": ["user", "admin"],
        "permissions": ["read", "write", "delete"]
    }


class TestSecureAuthService:
    """Test SecureAuthService class"""

    def test_initialization(self, auth_service):
        """Test service initialization"""
        assert auth_service is not None
        assert auth_service.revoked_tokens == set()
        assert auth_service.active_sessions == {}
        assert auth_service.login_attempts == {}

    def test_sanitize_input(self, auth_service):
        """Test input sanitization"""
        # Normal input
        clean = auth_service.sanitize_input("normal_text")
        assert clean == "normal_text"

        # HTML tags
        clean = auth_service.sanitize_input("<script>alert('xss')</script>")
        assert "<script>" not in clean
        assert "alert" in clean  # Content preserved but tags removed

        # SQL injection attempt
        clean = auth_service.sanitize_input("'; DROP TABLE users; --")
        assert "DROP TABLE" not in clean

        # Length limit
        long_input = "a" * 300
        clean = auth_service.sanitize_input(long_input, max_length=255)
        assert len(clean) == 255

    def test_validate_email(self, auth_service):
        """Test email validation"""
        # Valid emails
        assert auth_service.validate_email("user@example.com") == True
        assert auth_service.validate_email("test.user+tag@sub.domain.com") == True

        # Invalid emails
        assert auth_service.validate_email("invalid") == False
        assert auth_service.validate_email("@example.com") == False
        assert auth_service.validate_email("user@") == False
        assert auth_service.validate_email("") == False
        assert auth_service.validate_email("a" * 255 + "@example.com") == False

    def test_validate_username(self, auth_service):
        """Test username validation"""
        # Valid usernames
        assert auth_service.validate_username("user123") == True
        assert auth_service.validate_username("test_user") == True
        assert auth_service.validate_username("user-name") == True

        # Invalid usernames
        assert auth_service.validate_username("ab") == False  # Too short
        assert auth_service.validate_username("a" * 21) == False  # Too long
        assert auth_service.validate_username("user@123") == False  # Invalid char
        assert auth_service.validate_username("") == False

    def test_validate_password(self, auth_service):
        """Test password validation"""
        # Valid password
        assert auth_service.validate_password("Password123!") == True
        assert auth_service.validate_password("Str0ng@Pass") == True

        # Invalid passwords
        assert auth_service.validate_password("weak") == False  # Too short
        assert auth_service.validate_password("password123") == False  # No uppercase
        assert auth_service.validate_password("PASSWORD123") == False  # No lowercase
        assert auth_service.validate_password("Password") == False  # No digit
        assert auth_service.validate_password("Password123") == False  # No special char
        assert auth_service.validate_password("") == False

    def test_hash_and_verify_password(self, auth_service):
        """Test password hashing and verification"""
        password = "SecurePassword123!"

        # Hash password
        hashed = auth_service.hash_password(password)
        assert hashed != password
        assert len(hashed) > 0

        # Verify correct password
        assert auth_service.verify_password(password, hashed) == True

        # Verify incorrect password
        assert auth_service.verify_password("WrongPassword", hashed) == False

    def test_login_attempts_tracking(self, auth_service):
        """Test login attempt tracking and lockout"""
        identifier = "testuser"

        # Initially allowed
        assert auth_service.check_login_attempts(identifier) == True

        # Record failed attempts
        for i in range(5):
            auth_service.record_failed_login(identifier)

        # Should be locked out after 5 attempts
        assert auth_service.check_login_attempts(identifier) == False

        # Reset attempts
        auth_service.reset_login_attempts(identifier)
        assert auth_service.check_login_attempts(identifier) == True

    def test_create_access_token(self, auth_service):
        """Test access token creation"""
        user_id = "user123"
        username = "testuser"
        roles = ["user", "admin"]
        permissions = ["read", "write"]

        token = auth_service.create_access_token(user_id, username, roles, permissions)

        assert token is not None
        assert isinstance(token, str)

        # Decode and verify
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == user_id
        assert payload["username"] == username
        assert payload["type"] == "access"
        assert payload["roles"] == roles
        assert payload["permissions"] == permissions

    def test_create_refresh_token(self, auth_service):
        """Test refresh token creation"""
        user_id = "user123"

        token = auth_service.create_refresh_token(user_id)

        assert token is not None
        assert isinstance(token, str)

        # Decode and verify
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == user_id
        assert payload["type"] == "refresh"

    def test_verify_token_valid(self, auth_service):
        """Test valid token verification"""
        user_id = "user123"
        username = "testuser"

        token = auth_service.create_access_token(user_id, username)
        token_payload = auth_service.verify_token(token, "access")

        assert token_payload is not None
        assert token_payload.sub == user_id
        assert token_payload.type == "access"

    def test_verify_token_invalid_type(self, auth_service):
        """Test token verification with wrong type"""
        token = auth_service.create_refresh_token("user123")
        token_payload = auth_service.verify_token(token, "access")

        assert token_payload is None  # Wrong type

    def test_verify_token_expired(self, auth_service):
        """Test expired token verification"""
        # Create expired token
        now = datetime.now(timezone.utc)
        expire = now - timedelta(minutes=1)

        payload = {
            "sub": "user123",
            "exp": expire,
            "iat": now,
            "jti": "test_jti",
            "type": "access"
        }

        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        token_payload = auth_service.verify_token(token)

        assert token_payload is None  # Expired

    def test_verify_token_revoked(self, auth_service):
        """Test revoked token verification"""
        token = auth_service.create_access_token("user123", "testuser")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # Revoke token
        auth_service.revoke_token(payload["jti"])

        # Try to verify revoked token
        token_payload = auth_service.verify_token(token)

        assert token_payload is None  # Revoked

    def test_revoke_token(self, auth_service):
        """Test token revocation"""
        jti = "test_jti_123"

        auth_service.revoke_token(jti)

        assert jti in auth_service.revoked_tokens

    def test_create_session(self, auth_service):
        """Test session creation"""
        session_id = auth_service.create_session(
            user_id="user123",
            username="testuser",
            email="test@example.com",
            roles=["user"],
            permissions=["read"]
        )

        assert session_id is not None
        assert session_id in auth_service.active_sessions

        session = auth_service.active_sessions[session_id]
        assert session.user_id == "user123"
        assert session.username == "testuser"
        assert session.email == "test@example.com"

    def test_get_session(self, auth_service):
        """Test session retrieval"""
        session_id = auth_service.create_session(
            user_id="user123",
            username="testuser",
            email="test@example.com"
        )

        session = auth_service.get_session(session_id)

        assert session is not None
        assert session.user_id == "user123"

        # Non-existent session
        assert auth_service.get_session("invalid_id") is None

    def test_invalidate_session(self, auth_service):
        """Test session invalidation"""
        session_id = auth_service.create_session(
            user_id="user123",
            username="testuser",
            email="test@example.com"
        )

        auth_service.invalidate_session(session_id)

        assert session_id not in auth_service.active_sessions

    @patch('app.auth_secure.text')
    def test_get_user_by_id(self, mock_text, auth_service, mock_db, sample_user):
        """Test getting user by ID"""
        # Mock database result
        mock_result = MagicMock()
        mock_result.id = sample_user["id"]
        mock_result.username = sample_user["username"]
        mock_result.email = sample_user["email"]
        mock_result.hashed_password = sample_user["hashed_password"]
        mock_result.is_active = sample_user["is_active"]
        mock_result.roles = sample_user["roles"]
        mock_result.created_at = datetime.now()

        mock_db.execute.return_value.fetchone.return_value = mock_result

        user = auth_service.get_user_by_id(mock_db, "user123")

        assert user is not None
        assert user["id"] == sample_user["id"]
        assert user["username"] == sample_user["username"]

    @patch('app.auth_secure.text')
    def test_authenticate_user_success(self, mock_text, auth_service, mock_db, sample_user):
        """Test successful authentication"""
        # Mock database result
        mock_result = MagicMock()
        mock_result.id = sample_user["id"]
        mock_result.username = sample_user["username"]
        mock_result.email = sample_user["email"]
        mock_result.hashed_password = auth_service.hash_password("Password123!")
        mock_result.is_active = True
        mock_result.roles = sample_user["roles"]

        mock_db.execute.return_value.fetchone.return_value = mock_result

        # Mock password verification
        with patch.object(auth_service, 'verify_password', return_value=True):
            user = auth_service.authenticate_user(mock_db, "testuser", "Password123!")

            assert user is not None
            assert user["id"] == sample_user["id"]

    @patch('app.auth_secure.text')
    def test_authenticate_user_failure(self, mock_text, auth_service, mock_db):
        """Test failed authentication"""
        # User not found
        mock_db.execute.return_value.fetchone.return_value = None

        user = auth_service.authenticate_user(mock_db, "nonexistent", "password")

        assert user is None

    @patch('app.auth_secure.text')
    def test_authenticate_user_lockout(self, mock_text, auth_service, mock_db):
        """Test authentication with lockout"""
        # Record max failed attempts
        for i in range(5):
            auth_service.record_failed_login("testuser")

        # Should raise exception due to lockout
        with pytest.raises(HTTPException) as exc_info:
            auth_service.authenticate_user(mock_db, "testuser", "password")

        assert exc_info.value.status_code == 429
        assert "Too many failed login attempts" in exc_info.value.detail


class TestDependencies:
    """Test FastAPI dependencies"""

    @pytest.mark.asyncio
    @patch('app.auth_secure.auth_service')
    async def test_get_current_user(self, mock_auth_service, mock_db, sample_user):
        """Test getting current user"""
        # Mock credentials
        mock_credentials = MagicMock()
        mock_credentials.credentials = "test_token"

        # Mock token verification
        mock_token_payload = TokenPayload(
            sub=sample_user["id"],
            exp=datetime.now(timezone.utc) + timedelta(hours=1),
            iat=datetime.now(timezone.utc),
            jti="test_jti",
            type="access",
            roles=sample_user["roles"],
            permissions=sample_user["permissions"]
        )

        mock_auth_service.verify_token.return_value = mock_token_payload
        mock_auth_service.get_user_by_id.return_value = sample_user

        user = await get_current_user(mock_credentials, mock_db)

        assert user == sample_user

    @pytest.mark.asyncio
    @patch('app.auth_secure.auth_service')
    async def test_get_current_user_invalid_token(self, mock_auth_service, mock_db):
        """Test getting current user with invalid token"""
        mock_credentials = MagicMock()
        mock_credentials.credentials = "invalid_token"

        mock_auth_service.verify_token.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(mock_credentials, mock_db)

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_get_current_active_user(self, sample_user):
        """Test getting active user"""
        user = await get_current_active_user(sample_user)
        assert user == sample_user

        # Inactive user
        inactive_user = sample_user.copy()
        inactive_user["is_active"] = False

        with pytest.raises(HTTPException) as exc_info:
            await get_current_active_user(inactive_user)

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_require_roles(self, sample_user):
        """Test role requirement"""
        role_checker = require_roles(["admin"])

        # User has admin role
        user = await role_checker(sample_user)
        assert user == sample_user

        # User lacks required role
        user_no_admin = sample_user.copy()
        user_no_admin["roles"] = ["user"]

        with pytest.raises(HTTPException) as exc_info:
            await role_checker(user_no_admin)

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_require_permissions(self, sample_user):
        """Test permission requirement"""
        permission_checker = require_permissions(["read", "write"])

        # User has permissions
        user = await permission_checker(sample_user)
        assert user == sample_user

        # User lacks permissions
        user_no_perms = sample_user.copy()
        user_no_perms["permissions"] = ["read"]

        with pytest.raises(HTTPException) as exc_info:
            await permission_checker(user_no_perms)

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_rate_limit(self, sample_user):
        """Test rate limiting"""
        rate_limiter = rate_limit(max_requests=2, window_seconds=60)

        # First two requests should pass
        await rate_limiter(sample_user)
        await rate_limiter(sample_user)

        # Third request should be rate limited
        with pytest.raises(HTTPException) as exc_info:
            await rate_limiter(sample_user)

        assert exc_info.value.status_code == 429
        assert "Rate limit exceeded" in exc_info.value.detail