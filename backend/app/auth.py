"""
Authentication with Zero Trust
STORY-011: Authentication with Zero Trust
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import redis.asyncio as redis
import secrets
import hashlib
import logging
from pydantic import BaseModel, EmailStr
import json

logger = logging.getLogger(__name__)

# Configuration
SECRET_KEY = secrets.token_urlsafe(32)
ALGORITHM = "RS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7
MAX_LOGIN_ATTEMPTS = 5
PASSWORD_MIN_LENGTH = 12

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


class TokenData(BaseModel):
    """Token data model"""
    username: Optional[str] = None
    jti: Optional[str] = None
    type: str = "access"


class User(BaseModel):
    """User model"""
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    disabled: bool = False
    created_at: datetime
    mfa_enabled: bool = False
    api_keys: List[str] = []


class UserInDB(User):
    """User in database with password"""
    hashed_password: str
    password_history: List[str] = []
    failed_attempts: int = 0
    locked_until: Optional[datetime] = None


class AuthManager:
    """Zero-trust authentication manager"""

    def __init__(self):
        self.redis_client = None
        self.private_key = None
        self.public_key = None
        self._generate_keys()

    def _generate_keys(self):
        """Generate RSA key pair for JWT signing"""
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.backends import default_backend

        # Generate private key
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )

        # Extract private and public keys
        self.private_key = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        ).decode('utf-8')

        self.public_key = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode('utf-8')

    async def ensure_redis(self):
        """Ensure Redis connection"""
        if not self.redis_client:
            self.redis_client = await redis.from_url("redis://localhost:6379")

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash"""
        return pwd_context.verify(plain_password, hashed_password)

    def get_password_hash(self, password: str) -> str:
        """Hash password using bcrypt"""
        return pwd_context.hash(password)

    def validate_password_strength(self, password: str) -> tuple[bool, str]:
        """Validate password meets requirements"""
        if len(password) < PASSWORD_MIN_LENGTH:
            return False, f"Password must be at least {PASSWORD_MIN_LENGTH} characters"

        has_upper = any(c.isupper() for c in password)
        has_lower = any(c.islower() for c in password)
        has_digit = any(c.isdigit() for c in password)
        has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password)

        if not all([has_upper, has_lower, has_digit, has_special]):
            return False, "Password must contain uppercase, lowercase, digit, and special character"

        return True, "Password is strong"

    async def create_access_token(
        self,
        data: dict,
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """Create JWT access token with RS256"""
        to_encode = data.copy()

        # Set expiration
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

        # Add claims
        jti = secrets.token_urlsafe(32)
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "jti": jti,
            "type": "access"
        })

        # Store JTI in Redis for revocation tracking
        await self.ensure_redis()
        await self.redis_client.setex(
            f"token:jti:{jti}",
            ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "valid"
        )

        # Create token
        encoded_jwt = jwt.encode(to_encode, self.private_key, algorithm=ALGORITHM)
        return encoded_jwt

    async def create_refresh_token(self, username: str) -> str:
        """Create refresh token with rotation"""
        jti = secrets.token_urlsafe(32)
        data = {
            "sub": username,
            "jti": jti,
            "type": "refresh",
            "exp": datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
            "iat": datetime.utcnow()
        }

        # Store in Redis with rotation tracking
        await self.ensure_redis()
        await self.redis_client.setex(
            f"refresh:token:{jti}",
            REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
            json.dumps({"username": username, "used": False})
        )

        encoded_jwt = jwt.encode(data, self.private_key, algorithm=ALGORITHM)
        return encoded_jwt

    async def rotate_refresh_token(self, old_token: str) -> tuple[str, str]:
        """Rotate refresh token on use"""
        try:
            # Decode old token
            payload = jwt.decode(old_token, self.public_key, algorithms=[ALGORITHM])
            old_jti = payload.get("jti")

            # Check if token was already used
            await self.ensure_redis()
            token_data = await self.redis_client.get(f"refresh:token:{old_jti}")

            if not token_data:
                raise HTTPException(status_code=401, detail="Invalid refresh token")

            token_info = json.loads(token_data)
            if token_info["used"]:
                # Token reuse detected - potential security breach
                await self.handle_token_reuse(token_info["username"])
                raise HTTPException(status_code=401, detail="Token reuse detected")

            # Mark old token as used
            token_info["used"] = True
            await self.redis_client.setex(
                f"refresh:token:{old_jti}",
                3600,  # Keep for 1 hour for detection
                json.dumps(token_info)
            )

            # Create new tokens
            username = payload.get("sub")
            access_token = await self.create_access_token({"sub": username})
            refresh_token = await self.create_refresh_token(username)

            return access_token, refresh_token

        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")

    async def handle_token_reuse(self, username: str):
        """Handle potential token reuse attack"""
        logger.warning(f"Token reuse detected for user {username}")

        # Revoke all tokens for user
        await self.ensure_redis()
        pattern = f"*:token:*{username}*"
        keys = await self.redis_client.keys(pattern)
        for key in keys:
            await self.redis_client.delete(key)

        # Log security event
        await self.log_security_event(
            "token_reuse",
            {"username": username, "action": "all_tokens_revoked"}
        )

    async def verify_token(self, token: str) -> TokenData:
        """Verify JWT token"""
        try:
            payload = jwt.decode(token, self.public_key, algorithms=[ALGORITHM])
            username: str = payload.get("sub")
            jti: str = payload.get("jti")
            token_type: str = payload.get("type", "access")

            if username is None or jti is None:
                raise HTTPException(status_code=401, detail="Invalid token")

            # Check if token is revoked
            await self.ensure_redis()
            token_status = await self.redis_client.get(f"token:jti:{jti}")
            if token_status != b"valid":
                raise HTTPException(status_code=401, detail="Token revoked")

            return TokenData(username=username, jti=jti, type=token_type)

        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")

    async def check_account_lockout(self, username: str) -> bool:
        """Check if account is locked"""
        await self.ensure_redis()
        lockout_key = f"lockout:{username}"
        lockout_data = await self.redis_client.get(lockout_key)

        if lockout_data:
            lockout_until = datetime.fromisoformat(lockout_data.decode())
            if datetime.utcnow() < lockout_until:
                return True
            else:
                await self.redis_client.delete(lockout_key)

        return False

    async def record_failed_attempt(self, username: str):
        """Record failed login attempt"""
        await self.ensure_redis()
        attempts_key = f"failed_attempts:{username}"

        # Increment counter
        attempts = await self.redis_client.incr(attempts_key)
        await self.redis_client.expire(attempts_key, 3600)  # Reset after 1 hour

        # Lock account after max attempts
        if attempts >= MAX_LOGIN_ATTEMPTS:
            lockout_until = datetime.utcnow() + timedelta(minutes=30)
            lockout_key = f"lockout:{username}"
            await self.redis_client.setex(
                lockout_key,
                1800,  # 30 minutes
                lockout_until.isoformat()
            )

            await self.log_security_event(
                "account_locked",
                {"username": username, "attempts": attempts}
            )

    async def reset_failed_attempts(self, username: str):
        """Reset failed login attempts on successful login"""
        await self.ensure_redis()
        attempts_key = f"failed_attempts:{username}"
        await self.redis_client.delete(attempts_key)

    async def create_api_key(self, username: str, name: str) -> str:
        """Create API key for user"""
        api_key = f"sk_{secrets.token_urlsafe(32)}"
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        await self.ensure_redis()
        await self.redis_client.hset(
            f"api_keys:{username}",
            key_hash,
            json.dumps({
                "name": name,
                "created_at": datetime.utcnow().isoformat(),
                "last_used": None
            })
        )

        return api_key

    async def verify_api_key(self, api_key: str) -> Optional[str]:
        """Verify API key and return username"""
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        await self.ensure_redis()
        # Search for key in all users
        pattern = "api_keys:*"
        keys = await self.redis_client.keys(pattern)

        for key in keys:
            if await self.redis_client.hexists(key, key_hash):
                username = key.decode().split(":")[1]

                # Update last used
                key_data = await self.redis_client.hget(key, key_hash)
                key_info = json.loads(key_data)
                key_info["last_used"] = datetime.utcnow().isoformat()
                await self.redis_client.hset(key, key_hash, json.dumps(key_info))

                return username

        return None

    async def setup_mfa(self, username: str) -> str:
        """Setup MFA for user"""
        import pyotp

        # Generate secret
        secret = pyotp.random_base32()

        # Store in Redis
        await self.ensure_redis()
        await self.redis_client.hset(
            f"user:{username}",
            "mfa_secret",
            secret
        )

        # Generate provisioning URI
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            name=username,
            issuer_name="Logo Recognition"
        )

        return provisioning_uri

    async def verify_mfa(self, username: str, token: str) -> bool:
        """Verify MFA token"""
        import pyotp

        await self.ensure_redis()
        secret = await self.redis_client.hget(f"user:{username}", "mfa_secret")

        if not secret:
            return False

        totp = pyotp.TOTP(secret.decode())
        return totp.verify(token, valid_window=1)

    async def log_security_event(self, event_type: str, details: Dict[str, Any]):
        """Log security event for audit"""
        await self.ensure_redis()
        event = {
            "type": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "details": details
        }

        # Store in Redis list
        await self.redis_client.lpush(
            "security:audit_log",
            json.dumps(event)
        )

        # Keep last 10000 events
        await self.redis_client.ltrim("security:audit_log", 0, 9999)

        logger.info(f"Security event: {event_type}", extra=details)

    async def check_password_history(self, username: str, new_password_hash: str) -> bool:
        """Check if password was used recently"""
        await self.ensure_redis()
        history_key = f"password_history:{username}"

        # Get password history
        history = await self.redis_client.lrange(history_key, 0, 4)  # Last 5 passwords

        for old_hash in history:
            if old_hash.decode() == new_password_hash:
                return False

        # Add to history
        await self.redis_client.lpush(history_key, new_password_hash)
        await self.redis_client.ltrim(history_key, 0, 4)

        return True


# Global auth manager instance
auth_manager = AuthManager()


async def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    """
    Get current authenticated user from JWT token.

    Args:
        token: JWT access token from Authorization header

    Returns:
        User information dictionary

    Raises:
        HTTPException: If token is invalid or user not found
    """
    token_data = await auth_manager.verify_token(token)

    # In production, would fetch user from database
    # For now, return user info from token
    user = {
        "user_id": token_data.username,
        "username": token_data.username,
        "is_admin": False,  # Would check from database
        "email": f"{token_data.username}@example.com"
    }

    return user