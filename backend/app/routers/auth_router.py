"""
Authentication Router for Enterprise System
US-034: Enterprise Authentication & Authorization
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
import secrets
import qrcode
import io
import base64

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Form, Query
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field, validator
import pyotp

from ..auth_enterprise import (
    enterprise_auth,
    get_current_user,
    require_permission,
    check_rate_limit,
    TokenData,
    UserModel,
    UserRole,
    UserTier,
    Permission
)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


# Request/Response Models
class RegisterRequest(BaseModel):
    """User registration request"""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=12)
    full_name: Optional[str] = None

    @validator('username')
    def validate_username(cls, v):
        if not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError('Username must be alphanumeric with optional _ or -')
        return v.lower()


class LoginRequest(BaseModel):
    """Login request with optional MFA"""
    username: str
    password: str
    mfa_code: Optional[str] = None
    device_id: Optional[str] = None


class TokenResponse(BaseModel):
    """Token response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: Dict[str, Any]


class RefreshTokenRequest(BaseModel):
    """Refresh token request"""
    refresh_token: str


class MFASetupResponse(BaseModel):
    """MFA setup response"""
    secret: str
    qr_code: str  # Base64 encoded QR code image
    backup_codes: List[str]


class MFAEnableRequest(BaseModel):
    """MFA enable request"""
    totp_code: str


class MFAVerifyRequest(BaseModel):
    """MFA verification request"""
    code: str
    is_backup: bool = False


class PasswordResetRequest(BaseModel):
    """Password reset request"""
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Password reset confirmation"""
    token: str
    new_password: str = Field(..., min_length=12)


class PasswordChangeRequest(BaseModel):
    """Password change request"""
    current_password: str
    new_password: str = Field(..., min_length=12)


class APIKeyCreateRequest(BaseModel):
    """API key creation request"""
    name: str = Field(..., min_length=3, max_length=100)
    permissions: List[Permission] = Field(default_factory=list)
    expires_in_days: Optional[int] = Field(None, ge=1, le=365)


class APIKeyResponse(BaseModel):
    """API key response"""
    api_key: str
    name: str
    permissions: List[str]
    expires_at: Optional[datetime]


# Initialize auth system on startup
@router.on_event("startup")
async def startup_event():
    """Initialize authentication system"""
    await enterprise_auth.initialize()


# Registration & Login Endpoints
@router.post("/register", response_model=Dict[str, str])
async def register(
    request: RegisterRequest,
    req: Request
):
    """
    Register new user account with enterprise security
    """
    # Validate password strength
    is_valid, errors = enterprise_auth.validate_password_strength(request.password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Password does not meet requirements", "errors": errors}
        )

    # Check if username/email already exists
    user_key = f"user:username:{request.username}"
    if await enterprise_auth.redis_client.exists(user_key):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists"
        )

    email_key = f"user:email:{request.email}"
    if await enterprise_auth.redis_client.exists(email_key):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )

    # Hash password
    password_hash = enterprise_auth.hash_password(request.password)

    # Create user
    user_id = secrets.token_urlsafe(16)
    user = UserModel(
        user_id=user_id,
        username=request.username,
        email=request.email,
        full_name=request.full_name,
        role=UserRole.USER,  # Default role
        tier=UserTier.FREE,  # Default tier
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        password_changed_at=datetime.utcnow()
    )

    # Store user in Redis (in production, use proper database)
    user_data = user.dict()
    user_data["password_hash"] = password_hash

    await enterprise_auth.redis_client.set(
        user_key,
        user.json()
    )
    await enterprise_auth.redis_client.set(
        email_key,
        user_id
    )
    await enterprise_auth.redis_client.hset(
        f"user:{user_id}",
        mapping={
            "data": user.json(),
            "password_hash": password_hash
        }
    )

    # Log registration event
    await enterprise_auth.log_security_event(
        event_type="user_registered",
        user_id=user_id,
        username=request.username,
        ip_address=req.client.host,
        user_agent=req.headers.get("user-agent"),
        result="success"
    )

    # Send verification email (mock)
    verification_token = secrets.token_urlsafe(32)
    await enterprise_auth.redis_client.setex(
        f"verification:{verification_token}",
        86400,  # 24 hours
        user_id
    )

    return {
        "message": "Registration successful. Please check your email for verification.",
        "user_id": user_id
    }


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    mfa_code: Optional[str] = Form(None),
    device_id: Optional[str] = Form(None),
    req: Request = None
):
    """
    Login with username/password and optional MFA
    """
    username = form_data.username.lower()

    # Check account lockout
    if await enterprise_auth.check_account_lockout(username):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account is temporarily locked due to multiple failed attempts"
        )

    # Get user
    user_key = f"user:username:{username}"
    user_json = await enterprise_auth.redis_client.get(user_key)

    if not user_json:
        await enterprise_auth.record_failed_login(username, req.client.host)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    user = UserModel.parse_raw(user_json)

    # Get password hash
    user_data = await enterprise_auth.redis_client.hgetall(f"user:{user.user_id}")
    password_hash = user_data.get("password_hash")

    # Verify password
    if not enterprise_auth.verify_password(form_data.password, password_hash):
        await enterprise_auth.record_failed_login(username, req.client.host)

        await enterprise_auth.log_security_event(
            event_type="login_failed",
            username=username,
            ip_address=req.client.host,
            user_agent=req.headers.get("user-agent"),
            result="failure",
            failure_reason="invalid_password"
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    # Check MFA if enabled
    if user.mfa_enabled:
        if not mfa_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="MFA code required"
            )

        if not await enterprise_auth.verify_mfa(user.user_id, mfa_code):
            await enterprise_auth.record_failed_login(username, req.client.host)

            await enterprise_auth.log_security_event(
                event_type="mfa_failed",
                user_id=user.user_id,
                username=username,
                ip_address=req.client.host,
                result="failure"
            )

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid MFA code"
            )

    # Reset failed attempts
    await enterprise_auth.reset_failed_attempts(username)

    # Create tokens
    token_data = {
        "sub": username,
        "user_id": user.user_id,
        "role": user.role.value,
        "tier": user.tier.value
    }

    access_token = await enterprise_auth.create_access_token(token_data, req)
    refresh_token = await enterprise_auth.create_refresh_token(
        user.user_id,
        username,
        device_id
    )

    # Update last login
    user.last_login = datetime.utcnow()
    await enterprise_auth.redis_client.hset(
        f"user:{user.user_id}",
        "data",
        user.json()
    )

    # Log successful login
    await enterprise_auth.log_security_event(
        event_type="login_successful",
        user_id=user.user_id,
        username=username,
        ip_address=req.client.host,
        user_agent=req.headers.get("user-agent"),
        result="success",
        metadata={"device_id": device_id}
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=3600,
        user={
            "user_id": user.user_id,
            "username": user.username,
            "email": user.email,
            "role": user.role.value,
            "tier": user.tier.value,
            "mfa_enabled": user.mfa_enabled
        }
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    req: Request
):
    """
    Refresh access token using refresh token
    """
    try:
        # Rotate refresh token
        access_token, new_refresh_token = await enterprise_auth.rotate_refresh_token(
            request.refresh_token,
            req
        )

        # Decode to get user info
        import jwt
        payload = jwt.decode(
            access_token,
            enterprise_auth.public_key,
            algorithms=["RS256"]
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token,
            expires_in=3600,
            user={
                "user_id": payload.get("user_id"),
                "username": payload.get("sub"),
                "role": payload.get("role"),
                "tier": payload.get("tier")
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )


@router.post("/logout")
async def logout(
    user: TokenData = Depends(get_current_user),
    req: Request = None
):
    """
    Logout and revoke tokens
    """
    # Revoke access token
    await enterprise_auth.revoke_token(user.jti, "access")

    # Invalidate session
    if user.session_id:
        await enterprise_auth.invalidate_session(user.session_id)

    # Log logout
    await enterprise_auth.log_security_event(
        event_type="logout",
        user_id=user.user_id,
        username=user.username,
        ip_address=req.client.host if req else None,
        result="success"
    )

    return {"message": "Logout successful"}


# MFA Endpoints
@router.post("/mfa/setup", response_model=MFASetupResponse)
async def setup_mfa(
    user: TokenData = Depends(get_current_user)
):
    """
    Setup MFA for user account
    """
    # Setup MFA
    mfa_data = await enterprise_auth.setup_mfa(user.user_id, user.username)

    # Generate QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(mfa_data["provisioning_uri"])
    qr.make(fit=True)

    # Create QR code image
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    qr_code_base64 = base64.b64encode(buffer.getvalue()).decode()

    await enterprise_auth.log_security_event(
        event_type="mfa_setup_initiated",
        user_id=user.user_id,
        username=user.username,
        result="success"
    )

    return MFASetupResponse(
        secret=mfa_data["secret"],
        qr_code=f"data:image/png;base64,{qr_code_base64}",
        backup_codes=mfa_data["backup_codes"]
    )


@router.post("/mfa/enable")
async def enable_mfa(
    request: MFAEnableRequest,
    user: TokenData = Depends(get_current_user)
):
    """
    Enable MFA after verifying TOTP code
    """
    # Enable MFA
    success = await enterprise_auth.enable_mfa(user.user_id, request.totp_code)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid TOTP code"
        )

    # Update user model
    user_data = await enterprise_auth.redis_client.hget(f"user:{user.user_id}", "data")
    user_model = UserModel.parse_raw(user_data)
    user_model.mfa_enabled = True
    user_model.updated_at = datetime.utcnow()

    await enterprise_auth.redis_client.hset(
        f"user:{user.user_id}",
        "data",
        user_model.json()
    )

    await enterprise_auth.log_security_event(
        event_type="mfa_enabled",
        user_id=user.user_id,
        username=user.username,
        result="success"
    )

    return {"message": "MFA enabled successfully"}


@router.post("/mfa/verify")
async def verify_mfa(
    request: MFAVerifyRequest,
    user: TokenData = Depends(get_current_user)
):
    """
    Verify MFA code (TOTP or backup)
    """
    success = await enterprise_auth.verify_mfa(
        user.user_id,
        request.code,
        request.is_backup
    )

    if not success:
        await enterprise_auth.log_security_event(
            event_type="mfa_verification_failed",
            user_id=user.user_id,
            username=user.username,
            result="failure",
            metadata={"is_backup": request.is_backup}
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid MFA code"
        )

    await enterprise_auth.log_security_event(
        event_type="mfa_verification_successful",
        user_id=user.user_id,
        username=user.username,
        result="success",
        metadata={"is_backup": request.is_backup}
    )

    return {"message": "MFA verification successful"}


@router.post("/mfa/disable")
async def disable_mfa(
    password: str = Form(...),
    user: TokenData = Depends(get_current_user)
):
    """
    Disable MFA (requires password confirmation)
    """
    # Verify password
    user_data = await enterprise_auth.redis_client.hgetall(f"user:{user.user_id}")
    password_hash = user_data.get("password_hash")

    if not enterprise_auth.verify_password(password, password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )

    # Disable MFA
    mfa_key = f"user:{user.user_id}:mfa"
    await enterprise_auth.redis_client.hset(mfa_key, "enabled", "false")

    # Update user model
    user_model = UserModel.parse_raw(user_data["data"])
    user_model.mfa_enabled = False
    user_model.updated_at = datetime.utcnow()

    await enterprise_auth.redis_client.hset(
        f"user:{user.user_id}",
        "data",
        user_model.json()
    )

    await enterprise_auth.log_security_event(
        event_type="mfa_disabled",
        user_id=user.user_id,
        username=user.username,
        result="success"
    )

    return {"message": "MFA disabled successfully"}


# Password Management
@router.post("/password/reset")
async def request_password_reset(
    request: PasswordResetRequest,
    req: Request
):
    """
    Request password reset email
    """
    # Check if email exists
    email_key = f"user:email:{request.email}"
    user_id = await enterprise_auth.redis_client.get(email_key)

    if user_id:
        # Generate reset token
        reset_token = secrets.token_urlsafe(32)
        reset_key = f"password_reset:{reset_token}"

        await enterprise_auth.redis_client.setex(
            reset_key,
            3600,  # 1 hour expiry
            user_id
        )

        # Log event
        await enterprise_auth.log_security_event(
            event_type="password_reset_requested",
            user_id=user_id,
            ip_address=req.client.host,
            result="success"
        )

        # Send email (mock)
        reset_link = f"https://example.com/reset-password?token={reset_token}"
        print(f"Password reset link: {reset_link}")

    return {
        "message": "If the email exists, a password reset link has been sent"
    }


@router.post("/password/reset/confirm")
async def confirm_password_reset(
    request: PasswordResetConfirm,
    req: Request
):
    """
    Confirm password reset with token
    """
    # Verify reset token
    reset_key = f"password_reset:{request.token}"
    user_id = await enterprise_auth.redis_client.get(reset_key)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    # Validate new password
    is_valid, errors = enterprise_auth.validate_password_strength(request.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Password does not meet requirements", "errors": errors}
        )

    # Check password history
    if not await enterprise_auth.check_password_history(user_id, request.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password was used recently. Please choose a different password."
        )

    # Update password
    new_hash = enterprise_auth.hash_password(request.new_password)
    await enterprise_auth.redis_client.hset(
        f"user:{user_id}",
        "password_hash",
        new_hash
    )

    # Update password history
    await enterprise_auth.update_password_history(user_id, new_hash)

    # Delete reset token
    await enterprise_auth.redis_client.delete(reset_key)

    # Revoke all existing tokens
    pattern = f"token:*:{user_id}*"
    keys = await enterprise_auth.redis_client.keys(pattern)
    for key in keys:
        await enterprise_auth.redis_client.delete(key)

    await enterprise_auth.log_security_event(
        event_type="password_reset_completed",
        user_id=user_id,
        ip_address=req.client.host,
        result="success"
    )

    return {"message": "Password reset successful. Please login with your new password."}


@router.post("/password/change")
async def change_password(
    request: PasswordChangeRequest,
    user: TokenData = Depends(get_current_user)
):
    """
    Change password for authenticated user
    """
    # Verify current password
    user_data = await enterprise_auth.redis_client.hgetall(f"user:{user.user_id}")
    current_hash = user_data.get("password_hash")

    if not enterprise_auth.verify_password(request.current_password, current_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )

    # Validate new password
    is_valid, errors = enterprise_auth.validate_password_strength(request.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Password does not meet requirements", "errors": errors}
        )

    # Check password history
    if not await enterprise_auth.check_password_history(user.user_id, request.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password was used recently. Please choose a different password."
        )

    # Update password
    new_hash = enterprise_auth.hash_password(request.new_password)
    await enterprise_auth.redis_client.hset(
        f"user:{user.user_id}",
        "password_hash",
        new_hash
    )

    # Update password history
    await enterprise_auth.update_password_history(user.user_id, new_hash)

    # Update user model
    user_model = UserModel.parse_raw(user_data["data"])
    user_model.password_changed_at = datetime.utcnow()
    user_model.updated_at = datetime.utcnow()

    await enterprise_auth.redis_client.hset(
        f"user:{user.user_id}",
        "data",
        user_model.json()
    )

    await enterprise_auth.log_security_event(
        event_type="password_changed",
        user_id=user.user_id,
        username=user.username,
        result="success"
    )

    return {"message": "Password changed successfully"}


# API Key Management
@router.post("/keys", response_model=APIKeyResponse)
async def create_api_key(
    request: APIKeyCreateRequest,
    user: TokenData = Depends(get_current_user)
):
    """
    Create new API key
    """
    # Check permissions
    if Permission.API_KEYS_CREATE not in user.permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to create API keys"
        )

    # Create API key
    api_key = await enterprise_auth.create_api_key(
        user_id=user.user_id,
        name=request.name,
        permissions=request.permissions or user.permissions,
        expires_in_days=request.expires_in_days
    )

    expires_at = None
    if request.expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=request.expires_in_days)

    return APIKeyResponse(
        api_key=api_key,
        name=request.name,
        permissions=[p.value for p in request.permissions],
        expires_at=expires_at
    )


@router.get("/keys", response_model=List[Dict[str, Any]])
async def list_api_keys(
    user: TokenData = Depends(get_current_user)
):
    """
    List user's API keys
    """
    # Get user's API keys
    user_keys_key = f"user:{user.user_id}:api_keys"
    key_hashes = await enterprise_auth.redis_client.smembers(user_keys_key)

    keys = []
    for key_hash in key_hashes:
        api_key_key = f"api_key:{key_hash}"
        key_data = await enterprise_auth.redis_client.get(api_key_key)

        if key_data:
            key_info = eval(key_data)  # Use json.loads in production
            keys.append({
                "name": key_info["name"],
                "created_at": key_info["created_at"],
                "expires_at": key_info.get("expires_at"),
                "last_used": key_info.get("last_used"),
                "usage_count": key_info.get("usage_count", 0),
                "permissions": key_info.get("permissions", []),
                "key_id": key_hash[:8]  # Show partial hash as ID
            })

    return keys


@router.post("/keys/{key_id}/rotate")
async def rotate_api_key(
    key_id: str,
    user: TokenData = Depends(get_current_user)
):
    """
    Rotate API key
    """
    # Find full key hash from partial ID
    user_keys_key = f"user:{user.user_id}:api_keys"
    key_hashes = await enterprise_auth.redis_client.smembers(user_keys_key)

    full_hash = None
    for hash in key_hashes:
        if hash.startswith(key_id):
            full_hash = hash
            break

    if not full_hash:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )

    # Rotate key (simplified - need actual old key)
    # In production, store encrypted keys or use key management service
    new_key = await enterprise_auth.create_api_key(
        user_id=user.user_id,
        name=f"Rotated_{key_id}",
        permissions=user.permissions,
        expires_in_days=30
    )

    await enterprise_auth.log_security_event(
        event_type="api_key_rotated",
        user_id=user.user_id,
        username=user.username,
        result="success",
        metadata={"key_id": key_id}
    )

    return {
        "message": "API key rotated successfully",
        "new_key": new_key,
        "expires_in_days": 30
    }


@router.delete("/keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    user: TokenData = Depends(get_current_user)
):
    """
    Revoke API key
    """
    # Find and delete key
    user_keys_key = f"user:{user.user_id}:api_keys"
    key_hashes = await enterprise_auth.redis_client.smembers(user_keys_key)

    for hash in key_hashes:
        if hash.startswith(key_id):
            # Remove from user's keys
            await enterprise_auth.redis_client.srem(user_keys_key, hash)

            # Delete key data
            api_key_key = f"api_key:{hash}"
            await enterprise_auth.redis_client.delete(api_key_key)

            await enterprise_auth.log_security_event(
                event_type="api_key_revoked",
                user_id=user.user_id,
                username=user.username,
                result="success",
                metadata={"key_id": key_id}
            )

            return {"message": "API key revoked successfully"}

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="API key not found"
    )


# OAuth 2.0 Endpoints
@router.get("/oauth/authorize")
async def oauth_authorize(
    provider: str = Query(...),
    redirect_uri: str = Query(...)
):
    """
    Initiate OAuth 2.0 authorization flow
    """
    state = secrets.token_urlsafe(32)

    try:
        auth_url = await enterprise_auth.initiate_oauth_flow(
            provider,
            redirect_uri,
            state
        )

        return RedirectResponse(url=auth_url)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/oauth/callback")
async def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    provider: str = Query(...),
    req: Request = None
):
    """
    Handle OAuth 2.0 callback
    """
    try:
        # Handle OAuth callback
        oauth_data = await enterprise_auth.handle_oauth_callback(
            provider,
            code,
            state
        )

        # In production, would fetch user info from provider
        # and create/update user account

        # For now, return tokens
        return {
            "message": "OAuth authentication successful",
            "oauth_tokens": oauth_data
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# Session Management
@router.get("/sessions")
async def list_sessions(
    user: TokenData = Depends(get_current_user)
):
    """
    List active sessions for user
    """
    # Get active sessions
    pattern = f"session:*{user.user_id}*"
    session_keys = await enterprise_auth.redis_client.keys(pattern)

    sessions = []
    for key in session_keys:
        session_data = await enterprise_auth.redis_client.get(key)
        if session_data:
            sessions.append(eval(session_data))  # Use json.loads in production

    return sessions


@router.delete("/sessions/{session_id}")
async def invalidate_session(
    session_id: str,
    user: TokenData = Depends(get_current_user)
):
    """
    Invalidate specific session
    """
    await enterprise_auth.invalidate_session(session_id)

    await enterprise_auth.log_security_event(
        event_type="session_invalidated",
        user_id=user.user_id,
        username=user.username,
        result="success",
        metadata={"session_id": session_id}
    )

    return {"message": "Session invalidated successfully"}


# Audit Logs
@router.get("/audit/logs")
async def get_audit_logs(
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    event_types: Optional[List[str]] = Query(None),
    limit: int = Query(100, le=1000),
    user: TokenData = Depends(get_current_user)
):
    """
    Get audit logs (admin only)
    """
    # Check admin permission
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    logs = await enterprise_auth.get_audit_logs(
        start_time=start_time,
        end_time=end_time,
        event_types=event_types,
        user_id=None if user.role == UserRole.ADMIN else user.user_id,
        limit=limit
    )

    return [log.dict() for log in logs]


# Health Check
@router.get("/health")
async def health_check():
    """
    Check authentication service health
    """
    try:
        # Check Redis connection
        await enterprise_auth.redis_client.ping()

        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "service": "authentication"
        }

    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )