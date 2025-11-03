"""
Security Tests for Enterprise Authentication
US-034: Enterprise Authentication & Authorization
"""
import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
import json
import secrets
import jwt as pyjwt
import pyotp

from app.auth_enterprise import (
    EnterpriseAuthSystem,
    UserRole,
    UserTier,
    Permission,
    TokenData,
    UserModel,
    RBAC_PERMISSIONS,
    RATE_LIMITS
)


@pytest.fixture
async def auth_system():
    """Create auth system instance with mocked Redis"""
    auth = EnterpriseAuthSystem()
    auth.redis_client = AsyncMock()
    auth.redis_client.get = AsyncMock(return_value=None)
    auth.redis_client.set = AsyncMock(return_value=True)
    auth.redis_client.setex = AsyncMock(return_value=True)
    auth.redis_client.delete = AsyncMock(return_value=True)
    auth.redis_client.exists = AsyncMock(return_value=False)
    auth.redis_client.incr = AsyncMock(return_value=1)
    auth.redis_client.expire = AsyncMock(return_value=True)
    auth.redis_client.hset = AsyncMock(return_value=True)
    auth.redis_client.hget = AsyncMock(return_value=None)
    auth.redis_client.hgetall = AsyncMock(return_value={})
    auth.redis_client.sadd = AsyncMock(return_value=1)
    auth.redis_client.srem = AsyncMock(return_value=1)
    auth.redis_client.smembers = AsyncMock(return_value=set())
    auth.redis_client.lpush = AsyncMock(return_value=1)
    auth.redis_client.ltrim = AsyncMock(return_value=True)
    auth.redis_client.lrange = AsyncMock(return_value=[])
    auth.redis_client.keys = AsyncMock(return_value=[])
    return auth


@pytest.fixture
def sample_user():
    """Create sample user for testing"""
    return UserModel(
        user_id="test_user_123",
        username="testuser",
        email="test@example.com",
        full_name="Test User",
        role=UserRole.USER,
        tier=UserTier.BASIC,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        password_changed_at=datetime.utcnow()
    )


class TestJWTTokenValidation:
    """Test JWT token validation and security"""

    @pytest.mark.asyncio
    async def test_jwt_token_creation_rs256(self, auth_system):
        """Test JWT creation with RS256 algorithm"""
        user_data = {
            "sub": "testuser",
            "user_id": "test123",
            "role": UserRole.ADMIN.value,
            "tier": UserTier.ENTERPRISE.value
        }

        token = await auth_system.create_access_token(user_data)

        # Verify token structure
        assert token is not None
        assert len(token.split('.')) == 3  # JWT has 3 parts

        # Decode and verify
        decoded = pyjwt.decode(
            token,
            auth_system.public_key,
            algorithms=["RS256"]
        )

        assert decoded["sub"] == "testuser"
        assert decoded["user_id"] == "test123"
        assert decoded["role"] == UserRole.ADMIN.value
        assert decoded["tier"] == UserTier.ENTERPRISE.value
        assert "exp" in decoded
        assert "iat" in decoded
        assert "jti" in decoded

    @pytest.mark.asyncio
    async def test_jwt_token_expiration(self, auth_system):
        """Test token expiration handling"""
        user_data = {
            "sub": "testuser",
            "user_id": "test123"
        }

        # Create token with very short expiration
        token = await auth_system.create_access_token(
            user_data,
            expires_delta=timedelta(seconds=-1)  # Already expired
        )

        # Should raise exception when verifying expired token
        with pytest.raises(Exception):
            pyjwt.decode(
                token,
                auth_system.public_key,
                algorithms=["RS256"]
            )

    @pytest.mark.asyncio
    async def test_refresh_token_rotation(self, auth_system):
        """Test refresh token rotation mechanism"""
        # Create initial refresh token
        refresh_token = await auth_system.create_refresh_token(
            user_id="test123",
            username="testuser",
            device_id="device123"
        )

        # Mock Redis responses for rotation
        auth_system.redis_client.get = AsyncMock(return_value=json.dumps({
            "user_id": "test123",
            "username": "testuser",
            "family_id": "family123",
            "used": False,
            "created_at": datetime.utcnow().isoformat()
        }))

        # Rotate token
        new_access, new_refresh = await auth_system.rotate_refresh_token(refresh_token)

        assert new_access is not None
        assert new_refresh is not None
        assert new_refresh != refresh_token

    @pytest.mark.asyncio
    async def test_token_revocation(self, auth_system):
        """Test token revocation mechanism"""
        jti = "test_jti_123"

        # Mock token exists
        auth_system.redis_client.get = AsyncMock(return_value=json.dumps({
            "user_id": "test123",
            "status": "active"
        }))

        # Revoke token
        await auth_system.revoke_token(jti, "access")

        # Verify setex was called to mark as revoked
        auth_system.redis_client.setex.assert_called()

    @pytest.mark.asyncio
    async def test_token_tampering_detection(self, auth_system):
        """Test detection of tampered JWT tokens"""
        user_data = {
            "sub": "testuser",
            "user_id": "test123"
        }

        token = await auth_system.create_access_token(user_data)

        # Tamper with token
        parts = token.split('.')
        # Modify payload
        tampered_token = parts[0] + ".tampered." + parts[2]

        # Should fail verification
        with pytest.raises(Exception):
            pyjwt.decode(
                tampered_token,
                auth_system.public_key,
                algorithms=["RS256"]
            )


class TestMFAEnforcement:
    """Test Multi-Factor Authentication"""

    @pytest.mark.asyncio
    async def test_mfa_setup(self, auth_system):
        """Test MFA setup process"""
        user_id = "test123"
        username = "testuser"

        result = await auth_system.setup_mfa(user_id, username)

        assert "secret" in result
        assert "provisioning_uri" in result
        assert "backup_codes" in result
        assert len(result["backup_codes"]) == 10

        # Verify secret is valid base32
        secret = result["secret"]
        assert len(secret) == 32
        pyotp.TOTP(secret)  # Should not raise

    @pytest.mark.asyncio
    async def test_mfa_totp_verification(self, auth_system):
        """Test TOTP code verification"""
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        valid_code = totp.now()

        # Mock Redis response
        auth_system.redis_client.hgetall = AsyncMock(return_value={
            "secret": secret,
            "enabled": "true"
        })

        # Test valid code
        is_valid = await auth_system.verify_mfa("test123", valid_code)
        assert is_valid is True

        # Test invalid code
        is_valid = await auth_system.verify_mfa("test123", "000000")
        assert is_valid is False

    @pytest.mark.asyncio
    async def test_mfa_backup_codes(self, auth_system):
        """Test backup code verification"""
        user_id = "test123"
        backup_code = "testcode123"
        code_hash = auth_system._hash = lambda x: "hash123"

        # Mock backup code exists
        auth_system.redis_client.srem = AsyncMock(return_value=1)

        # Verify backup code
        is_valid = await auth_system._verify_backup_code(user_id, backup_code)
        assert is_valid is True

        # Verify code was removed (single use)
        auth_system.redis_client.srem.assert_called_once()

    @pytest.mark.asyncio
    async def test_mfa_enable_disable(self, auth_system):
        """Test enabling and disabling MFA"""
        user_id = "test123"
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        valid_code = totp.now()

        # Mock MFA data
        auth_system.redis_client.hgetall = AsyncMock(return_value={
            "secret": secret,
            "enabled": "false"
        })

        # Enable MFA
        success = await auth_system.enable_mfa(user_id, valid_code)
        assert success is True

        # Verify enabled flag was set
        auth_system.redis_client.hset.assert_called()


class TestRBACPermissionMatrix:
    """Test Role-Based Access Control"""

    def test_admin_permissions(self):
        """Test admin has all permissions"""
        admin_perms = RBAC_PERMISSIONS[UserRole.ADMIN]

        # Admin should have all critical permissions
        assert Permission.USERS_CREATE in admin_perms
        assert Permission.USERS_DELETE in admin_perms
        assert Permission.API_KEYS_DELETE in admin_perms
        assert Permission.BATCH_DELETE in admin_perms

    def test_power_user_permissions(self):
        """Test power user permissions"""
        power_perms = RBAC_PERMISSIONS[UserRole.POWER_USER]

        # Power user should have elevated but not admin permissions
        assert Permission.RECOGNITION_CREATE in power_perms
        assert Permission.BATCH_CREATE in power_perms
        assert Permission.API_KEYS_ROTATE_OWN in power_perms

        # Should NOT have admin permissions
        assert Permission.USERS_DELETE not in power_perms
        assert Permission.API_KEYS_DELETE not in power_perms

    def test_user_permissions(self):
        """Test standard user permissions"""
        user_perms = RBAC_PERMISSIONS[UserRole.USER]

        # Users should have basic permissions
        assert Permission.RECOGNITION_CREATE in user_perms
        assert Permission.RECOGNITION_READ in user_perms
        assert Permission.USERS_READ_SELF in user_perms

        # Should NOT have elevated permissions
        assert Permission.USERS_CREATE not in user_perms
        assert Permission.API_KEYS_CREATE not in user_perms

    def test_readonly_permissions(self):
        """Test readonly user permissions"""
        readonly_perms = RBAC_PERMISSIONS[UserRole.READONLY]

        # Readonly should only have read permissions
        assert Permission.RECOGNITION_READ in readonly_perms
        assert Permission.BATCH_READ in readonly_perms

        # Should NOT have any write permissions
        assert Permission.RECOGNITION_CREATE not in readonly_perms
        assert Permission.BATCH_CREATE not in readonly_perms

    @pytest.mark.asyncio
    async def test_permission_enforcement(self, auth_system):
        """Test permission enforcement"""
        # Test admin can access admin resource
        can_access = await auth_system.check_permission(
            UserRole.ADMIN,
            Permission.USERS_DELETE
        )
        assert can_access is True

        # Test user cannot access admin resource
        can_access = await auth_system.check_permission(
            UserRole.USER,
            Permission.USERS_DELETE
        )
        assert can_access is False

    @pytest.mark.asyncio
    async def test_rbac_resource_enforcement(self, auth_system):
        """Test RBAC enforcement for resources"""
        # Test valid permission
        allowed = await auth_system.enforce_rbac(
            UserRole.ADMIN,
            "users",
            "delete"
        )
        assert allowed is True

        # Test invalid permission
        allowed = await auth_system.enforce_rbac(
            UserRole.USER,
            "users",
            "delete"
        )
        assert allowed is False


class TestRateLimitingEnforcement:
    """Test rate limiting implementation"""

    @pytest.mark.asyncio
    async def test_token_bucket_algorithm(self, auth_system):
        """Test token bucket rate limiting"""
        from app.auth_enterprise import TokenBucket

        # Create bucket with 10 tokens, refill 1/sec
        bucket = TokenBucket(capacity=10, refill_rate=1.0)

        # Should allow initial requests
        assert await bucket.consume(5) is True
        assert bucket.tokens == 5

        # Should allow more up to capacity
        assert await bucket.consume(5) is True
        assert bucket.tokens == 0

        # Should deny when empty
        assert await bucket.consume(1) is False

        # Wait time should be positive
        wait_time = await bucket.get_wait_time(1)
        assert wait_time > 0

    @pytest.mark.asyncio
    async def test_tier_based_rate_limits(self, auth_system):
        """Test different rate limits per tier"""
        # Test FREE tier limits
        free_limits = RATE_LIMITS[UserTier.FREE]
        assert free_limits["requests_per_minute"] == 10
        assert free_limits["batch_size_max"] == 10

        # Test BASIC tier limits
        basic_limits = RATE_LIMITS[UserTier.BASIC]
        assert basic_limits["requests_per_minute"] == 100
        assert basic_limits["batch_size_max"] == 100

        # Test ENTERPRISE tier limits
        enterprise_limits = RATE_LIMITS[UserTier.ENTERPRISE]
        assert enterprise_limits["requests_per_minute"] == 1000
        assert enterprise_limits["batch_size_max"] == 1000

    @pytest.mark.asyncio
    async def test_rate_limit_enforcement(self, auth_system):
        """Test rate limit enforcement"""
        user_id = "test123"

        # Test within limits
        allowed, info = await auth_system.check_rate_limit(
            user_id,
            UserTier.FREE,
            tokens=1
        )
        assert allowed is True
        assert info["exceeded"] is False

        # Test exceeding limits
        # Consume all tokens first
        for _ in range(10):
            await auth_system.check_rate_limit(user_id, UserTier.FREE)

        # Next request should be denied
        allowed, info = await auth_system.check_rate_limit(
            user_id,
            UserTier.FREE,
            tokens=1
        )
        assert allowed is False
        assert info["exceeded"] is True
        assert "retry_after" in info

    @pytest.mark.asyncio
    async def test_concurrent_request_limits(self, auth_system):
        """Test concurrent request limiting"""
        limits = RATE_LIMITS[UserTier.FREE]
        assert limits["concurrent_requests"] == 2

        limits = RATE_LIMITS[UserTier.ENTERPRISE]
        assert limits["concurrent_requests"] == 100


class TestSessionManagement:
    """Test session management and validation"""

    @pytest.mark.asyncio
    async def test_session_creation(self, auth_system):
        """Test session creation with tokens"""
        user_data = {
            "sub": "testuser",
            "user_id": "test123",
            "role": UserRole.USER.value,
            "tier": UserTier.BASIC.value
        }

        token = await auth_system.create_access_token(user_data)

        # Decode to check session_id
        decoded = pyjwt.decode(
            token,
            auth_system.public_key,
            algorithms=["RS256"]
        )

        assert "session_id" in decoded
        assert decoded["session_id"] is not None

    @pytest.mark.asyncio
    async def test_session_invalidation(self, auth_system):
        """Test session invalidation"""
        session_id = "test_session_123"

        await auth_system.invalidate_session(session_id)

        # Verify delete was called
        auth_system.redis_client.delete.assert_called_with(f"session:{session_id}")

    @pytest.mark.asyncio
    async def test_session_idle_timeout(self, auth_system):
        """Test session idle timeout handling"""
        session_id = "test_session_123"

        await auth_system._update_session_activity(session_id)

        # Verify expire was called with correct timeout
        auth_system.redis_client.expire.assert_called_with(
            f"session:{session_id}",
            1800  # 30 minutes
        )


class TestPasswordPolicy:
    """Test password policy enforcement"""

    def test_password_strength_validation(self, auth_system):
        """Test password strength requirements"""
        # Test weak password
        is_valid, errors = auth_system.validate_password_strength("password")
        assert is_valid is False
        assert len(errors) > 0

        # Test password too short
        is_valid, errors = auth_system.validate_password_strength("Pass1!")
        assert is_valid is False
        assert any("12 characters" in e for e in errors)

        # Test missing uppercase
        is_valid, errors = auth_system.validate_password_strength("password123!@#")
        assert is_valid is False
        assert any("uppercase" in e for e in errors)

        # Test missing special character
        is_valid, errors = auth_system.validate_password_strength("Password12345")
        assert is_valid is False
        assert any("special" in e for e in errors)

        # Test strong password
        is_valid, errors = auth_system.validate_password_strength("MyStr0ng!Pass#2024")
        assert is_valid is True
        assert len(errors) == 0

        # Test common patterns
        is_valid, errors = auth_system.validate_password_strength("Password123!@#")
        assert is_valid is False
        assert any("common patterns" in e for e in errors)

    def test_password_hashing_argon2(self, auth_system):
        """Test Argon2id password hashing"""
        password = "MySecurePassword123!"

        # Hash password
        hash1 = auth_system.hash_password(password)
        hash2 = auth_system.hash_password(password)

        # Hashes should be different (due to salt)
        assert hash1 != hash2

        # Both should verify correctly
        assert auth_system.verify_password(password, hash1) is True
        assert auth_system.verify_password(password, hash2) is True

        # Wrong password should fail
        assert auth_system.verify_password("WrongPassword", hash1) is False

    @pytest.mark.asyncio
    async def test_password_history(self, auth_system):
        """Test password history checking"""
        user_id = "test123"
        new_password = "NewPassword123!"

        # Mock password history
        old_hashes = [
            auth_system.hash_password("OldPassword1!"),
            auth_system.hash_password("OldPassword2!"),
            auth_system.hash_password("OldPassword3!")
        ]
        auth_system.redis_client.lrange = AsyncMock(return_value=old_hashes)

        # New password should be allowed
        is_allowed = await auth_system.check_password_history(user_id, new_password)
        assert is_allowed is True

        # Reusing old password should be denied
        is_allowed = await auth_system.check_password_history(user_id, "OldPassword1!")
        assert is_allowed is False

    @pytest.mark.asyncio
    async def test_password_history_update(self, auth_system):
        """Test password history update"""
        user_id = "test123"
        new_hash = "new_password_hash"

        await auth_system.update_password_history(user_id, new_hash)

        # Verify lpush was called
        auth_system.redis_client.lpush.assert_called_with(
            f"user:{user_id}:password_history",
            new_hash
        )

        # Verify ltrim was called to maintain size
        auth_system.redis_client.ltrim.assert_called_with(
            f"user:{user_id}:password_history",
            0,
            4  # Keep 5 passwords
        )


class TestAccountLockout:
    """Test account lockout mechanisms"""

    @pytest.mark.asyncio
    async def test_failed_login_tracking(self, auth_system):
        """Test tracking of failed login attempts"""
        username = "testuser"
        ip_address = "192.168.1.1"

        # Record multiple failed attempts
        for i in range(1, 4):
            auth_system.redis_client.incr = AsyncMock(return_value=i)
            await auth_system.record_failed_login(username, ip_address)

        # Verify counter was incremented
        auth_system.redis_client.incr.assert_called()

    @pytest.mark.asyncio
    async def test_account_lockout_after_max_attempts(self, auth_system):
        """Test account lockout after max failed attempts"""
        username = "testuser"

        # Simulate max attempts reached
        auth_system.redis_client.incr = AsyncMock(return_value=5)

        await auth_system.record_failed_login(username)

        # Verify account was locked
        auth_system.redis_client.setex.assert_called()
        call_args = auth_system.redis_client.setex.call_args[0]
        assert f"lockout:{username}" in call_args[0]
        assert call_args[1] == 1800  # 30 minutes

    @pytest.mark.asyncio
    async def test_lockout_check(self, auth_system):
        """Test checking if account is locked"""
        username = "testuser"

        # Test locked account
        lockout_data = json.dumps({
            "locked_until": (datetime.utcnow() + timedelta(minutes=10)).isoformat(),
            "attempts": 5
        })
        auth_system.redis_client.get = AsyncMock(return_value=lockout_data)

        is_locked = await auth_system.check_account_lockout(username)
        assert is_locked is True

        # Test expired lockout
        lockout_data = json.dumps({
            "locked_until": (datetime.utcnow() - timedelta(minutes=10)).isoformat(),
            "attempts": 5
        })
        auth_system.redis_client.get = AsyncMock(return_value=lockout_data)

        is_locked = await auth_system.check_account_lockout(username)
        assert is_locked is False

    @pytest.mark.asyncio
    async def test_reset_failed_attempts(self, auth_system):
        """Test resetting failed attempts after successful login"""
        username = "testuser"

        await auth_system.reset_failed_attempts(username)

        # Verify counter was deleted
        auth_system.redis_client.delete.assert_called_with(
            f"failed_attempts:{username}"
        )


class TestAPIKeyManagement:
    """Test API key lifecycle and management"""

    @pytest.mark.asyncio
    async def test_api_key_creation(self, auth_system):
        """Test API key creation with permissions"""
        user_id = "test123"
        permissions = [Permission.RECOGNITION_CREATE, Permission.RECOGNITION_READ]

        api_key = await auth_system.create_api_key(
            user_id=user_id,
            name="Test API Key",
            permissions=permissions,
            expires_in_days=30
        )

        # Verify key format
        assert api_key.startswith("sk_live_")
        assert len(api_key) > 40

        # Verify key was stored
        auth_system.redis_client.set.assert_called()

    @pytest.mark.asyncio
    async def test_api_key_rotation(self, auth_system):
        """Test API key rotation"""
        old_key = "sk_live_old_key_123"

        # Mock existing key
        auth_system.redis_client.get = AsyncMock(return_value=json.dumps({
            "user_id": "test123",
            "name": "Test Key",
            "permissions": ["recognition:read"],
            "created_at": datetime.utcnow().isoformat()
        }))

        new_key = await auth_system.rotate_api_key(old_key)

        # Verify new key was created
        assert new_key != old_key
        assert new_key.startswith("sk_")

        # Verify old key was marked as rotated
        auth_system.redis_client.setex.assert_called()

    @pytest.mark.asyncio
    async def test_api_key_verification(self, auth_system):
        """Test API key verification"""
        api_key = "sk_live_test_key_123"

        # Mock key exists and is valid
        auth_system.redis_client.get = AsyncMock(return_value=json.dumps({
            "user_id": "test123",
            "permissions": ["recognition:read"],
            "created_at": datetime.utcnow().isoformat(),
            "rotated": False
        }))

        result = await auth_system.verify_api_key(api_key)

        assert result is not None
        assert result["user_id"] == "test123"
        assert "last_used" in result

        # Test rotated key rejection
        auth_system.redis_client.get = AsyncMock(return_value=json.dumps({
            "user_id": "test123",
            "rotated": True
        }))

        result = await auth_system.verify_api_key(api_key)
        assert result is None

    @pytest.mark.asyncio
    async def test_api_key_expiration(self, auth_system):
        """Test API key expiration handling"""
        user_id = "test123"

        # Create key with expiration
        api_key = await auth_system.create_api_key(
            user_id=user_id,
            name="Expiring Key",
            permissions=[Permission.RECOGNITION_READ],
            expires_in_days=7
        )

        # Verify expire was set
        auth_system.redis_client.expire.assert_called()


class TestAuditLogging:
    """Test audit logging for security events"""

    @pytest.mark.asyncio
    async def test_security_event_logging(self, auth_system):
        """Test logging of security events"""
        await auth_system.log_security_event(
            event_type="login_successful",
            user_id="test123",
            username="testuser",
            ip_address="192.168.1.1",
            result="success",
            metadata={"device": "mobile"}
        )

        # Verify event was stored
        auth_system.redis_client.lpush.assert_called()
        call_args = auth_system.redis_client.lpush.call_args[0]
        assert "audit:security_log" in call_args[0]

    @pytest.mark.asyncio
    async def test_critical_event_alerts(self, auth_system):
        """Test critical security event alerts"""
        with patch('logging.Logger.critical') as mock_critical:
            await auth_system.log_security_event(
                event_type="token_reuse_detected",
                user_id="test123",
                result="failure"
            )

            # Verify critical alert was triggered
            mock_critical.assert_called()

    @pytest.mark.asyncio
    async def test_audit_log_retrieval(self, auth_system):
        """Test retrieving audit logs with filters"""
        # Mock log entries
        log_entries = [
            json.dumps({
                "timestamp": datetime.utcnow().isoformat(),
                "event_type": "login_successful",
                "user_id": "test123",
                "result": "success"
            }),
            json.dumps({
                "timestamp": datetime.utcnow().isoformat(),
                "event_type": "login_failed",
                "user_id": "test456",
                "result": "failure"
            })
        ]
        auth_system.redis_client.lrange = AsyncMock(return_value=log_entries)

        # Get all logs
        logs = await auth_system.get_audit_logs(limit=100)
        assert len(logs) == 2

        # Test filtering by event type
        logs = await auth_system.get_audit_logs(
            event_types=["login_successful"],
            limit=100
        )
        # Filtering happens in the method
        assert logs is not None

    @pytest.mark.asyncio
    async def test_audit_log_rotation(self, auth_system):
        """Test audit log size management"""
        await auth_system.log_security_event(
            event_type="test_event",
            user_id="test123",
            result="success"
        )

        # Verify ltrim was called to limit size
        auth_system.redis_client.ltrim.assert_called_with(
            "audit:security_log",
            0,
            99999  # Keep last 100000 events
        )


class TestOAuth2Integration:
    """Test OAuth 2.0 / OpenID Connect integration"""

    @pytest.mark.asyncio
    async def test_oauth_flow_initiation(self, auth_system):
        """Test OAuth flow initiation"""
        await auth_system.initialize()

        auth_url = await auth_system.initiate_oauth_flow(
            provider="google",
            redirect_uri="https://example.com/callback",
            state="test_state_123"
        )

        assert "accounts.google.com" in auth_url
        assert "client_id=" in auth_url
        assert "state=test_state_123" in auth_url

    @pytest.mark.asyncio
    async def test_oauth_callback_handling(self, auth_system):
        """Test OAuth callback processing"""
        await auth_system.initialize()

        # Mock state validation
        auth_system.redis_client.get = AsyncMock(return_value=json.dumps({
            "provider": "google",
            "redirect_uri": "https://example.com/callback"
        }))

        result = await auth_system.handle_oauth_callback(
            provider="google",
            code="test_auth_code",
            state="test_state_123"
        )

        assert "access_token" in result
        assert "refresh_token" in result

    @pytest.mark.asyncio
    async def test_oauth_state_validation(self, auth_system):
        """Test OAuth state parameter validation"""
        await auth_system.initialize()

        # Test with invalid state
        auth_system.redis_client.get = AsyncMock(return_value=None)

        with pytest.raises(Exception):
            await auth_system.handle_oauth_callback(
                provider="google",
                code="test_code",
                state="invalid_state"
            )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--cov=app.auth_enterprise", "--cov-report=term-missing"])