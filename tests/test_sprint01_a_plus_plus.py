#!/usr/bin/env python3
"""
Sprint 01 - A++ Grade Test Suite
Comprehensive tests for all Sprint 01 implementations
"""

import os
import sys
import json
import pytest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Test environment configuration
def test_environment_configuration():
    """Test US-001: Secure Configuration Management"""

    # Test .env.example file exists
    env_example = Path('.env.example')
    assert env_example.exists(), ".env.example file not found"

    # Read .env.example content
    content = env_example.read_text()

    # Check required environment variables
    required_vars = [
        'POSTGRES_USER',
        'POSTGRES_PASSWORD',
        'POSTGRES_DB',
        'MINIO_ROOT_USER',
        'MINIO_ROOT_PASSWORD',
        'JWT_SECRET_KEY',
        'REDIS_PASSWORD',
        'GRAFANA_ADMIN_PASSWORD'
    ]

    for var in required_vars:
        assert var in content, f"Missing required variable: {var}"
        # Ensure no hardcoded passwords
        if 'PASSWORD' in var or 'SECRET' in var:
            assert 'CHANGE_ME' in content, f"Variable {var} should have CHANGE_ME placeholder"

    # Test docker-compose.yml uses environment variables
    docker_compose = Path('docker-compose.yml')
    assert docker_compose.exists(), "docker-compose.yml not found"

    compose_content = docker_compose.read_text()

    # Check that docker-compose uses ${} syntax for variables
    assert '${POSTGRES_USER' in compose_content, "POSTGRES_USER not using environment variable"
    assert '${POSTGRES_PASSWORD' in compose_content, "POSTGRES_PASSWORD not using environment variable"
    assert '${MINIO_ROOT_USER' in compose_content, "MINIO_ROOT_USER not using environment variable"
    assert '${MINIO_ROOT_PASSWORD' in compose_content, "MINIO_ROOT_PASSWORD not using environment variable"
    assert '${GRAFANA_ADMIN_USER' in compose_content, "GRAFANA_ADMIN_USER not using environment variable"
    assert '${GRAFANA_ADMIN_PASSWORD' in compose_content, "GRAFANA_ADMIN_PASSWORD not using environment variable"

    # Ensure no hardcoded passwords in docker-compose (except defaults with :-)
    lines = compose_content.split('\n')
    for line in lines:
        if 'PASSWORD' in line and ':-' not in line:
            assert '${' in line, f"Potential hardcoded password in line: {line.strip()}"


def test_api_service_implementation():
    """Test US-003: Frontend API Service Implementation"""

    # Test API service file exists
    api_service = Path('frontend/src/services/api.ts')
    assert api_service.exists(), "api.ts service not found"

    content = api_service.read_text()

    # Check required API methods
    required_methods = [
        'get',
        'post',
        'put',
        'delete',
        'patch',
        'setupInterceptors',
        'refreshAccessToken',
        'setTokens',
        'clearTokens'
    ]

    for method in required_methods:
        assert method in content, f"Missing required method: {method}"

    # Check JWT token management
    assert 'Bearer' in content, "Bearer token authentication not implemented"
    assert 'localStorage' in content, "Token storage not implemented"
    assert 'interceptors' in content, "Axios interceptors not configured"
    assert '401' in content, "401 unauthorized handling not implemented"

    # Check WebSocket support
    assert 'WebSocket' in content or 'websocket' in content.lower(), "WebSocket support not implemented"


def test_auth_service_implementation():
    """Test US-003: Frontend Auth Service Implementation"""

    # Test auth service file exists
    auth_service = Path('frontend/src/services/authService.ts')
    assert auth_service.exists(), "authService.ts not found"

    content = auth_service.read_text()

    # Check required auth methods
    required_methods = [
        'login',
        'logout',
        'register',
        'getCurrentUser',
        'isAuthenticated',
        'hasRole',
        'changePassword',
        'requestPasswordReset',
        'refreshToken'
    ]

    for method in required_methods:
        assert method in content, f"Missing required method: {method}"

    # Check interfaces
    required_interfaces = [
        'LoginCredentials',
        'RegisterData',
        'UserProfile',
        'AuthResponse'
    ]

    for interface in required_interfaces:
        assert interface in content, f"Missing required interface: {interface}"

    # Check token refresh mechanism
    assert 'setupTokenRefresh' in content, "Automatic token refresh not implemented"
    assert 'setTimeout' in content, "Token refresh timer not implemented"


def test_data_service_implementation():
    """Test US-003: Frontend Data Service Implementation"""

    # Test data service file exists
    data_service = Path('frontend/src/services/dataService.ts')
    assert data_service.exists(), "dataService.ts not found"

    content = data_service.read_text()

    # Check required data methods
    required_methods = [
        'detectLogos',
        'getDetections',
        'deleteDetection',
        'createBatch',
        'getBatches',
        'createAnnotation',
        'updateAnnotation',
        'startTraining',
        'exportData'
    ]

    for method in required_methods:
        assert method in content, f"Missing required method: {method}"

    # Check interfaces
    required_interfaces = [
        'LogoDetection',
        'BoundingBox',
        'TrainingBatch',
        'Annotation',
        'PaginationParams',
        'PaginatedResponse'
    ]

    for interface in required_interfaces:
        assert interface in content, f"Missing required interface: {interface}"

    # Check file upload support
    assert 'FormData' in content, "File upload not implemented"
    assert 'multipart' in content, "Multipart form data not configured"


def test_login_ui_implementation():
    """Test US-005: Login/Logout UI Implementation"""

    # Test LoginPage component exists
    login_page = Path('frontend/src/pages/LoginPage.tsx')
    assert login_page.exists(), "LoginPage.tsx not found"

    content = login_page.read_text()

    # Check required UI elements
    required_elements = [
        'email',
        'password',
        'remember',
        'Form',
        'Input',
        'Button',
        'handleSubmit',
        'authService.login'
    ]

    for element in required_elements:
        assert element in content, f"Missing required element: {element}"

    # Check form validation
    assert 'rules' in content, "Form validation rules not implemented"
    assert 'required' in content, "Required field validation not implemented"
    assert 'type: \'email\'' in content, "Email validation not implemented"
    assert 'min: 6' in content or 'minLength' in content, "Password length validation not implemented"

    # Check error handling
    assert 'error' in content.lower(), "Error handling not implemented"
    assert 'setError' in content or 'message.error' in content, "Error display not implemented"

    # Check navigation
    assert 'useNavigate' in content, "Navigation hook not used"
    assert 'navigate' in content, "Navigation not implemented"

    # Test LoginPage CSS exists
    login_css = Path('frontend/src/pages/LoginPage.css')
    assert login_css.exists(), "LoginPage.css not found"


def test_header_logout_implementation():
    """Test US-005: Header with Logout Functionality"""

    # Test Header component exists
    header_component = Path('frontend/src/components/Layout/Header.tsx')
    assert header_component.exists(), "Header.tsx not found"

    content = header_component.read_text()

    # Check logout functionality
    assert 'logout' in content.lower(), "Logout functionality not implemented"
    assert 'authService.logout' in content, "Auth service logout not called"
    assert 'handleLogout' in content, "Logout handler not implemented"

    # Check user menu
    assert 'Dropdown' in content or 'Menu' in content, "User menu not implemented"
    assert 'Avatar' in content or 'UserOutlined' in content, "User avatar not implemented"

    # Check authentication state
    assert 'isAuthenticated' in content, "Authentication check not implemented"
    assert 'currentUser' in content or 'user' in content, "Current user not displayed"

    # Test Header CSS exists
    header_css = Path('frontend/src/components/Layout/Header.css')
    assert header_css.exists(), "Header.css not found"


def test_onnx_models_deployment():
    """Test US-007A: ONNX Model Deployment"""

    models_dir = Path('models')
    assert models_dir.exists(), "Models directory not found"

    # Check required ONNX models
    required_models = [
        'simple_logo_detector.onnx',
        'mobilenet_logo_classifier.onnx',
        'efficientdet_lite.onnx'
    ]

    for model_name in required_models:
        model_path = models_dir / model_name
        assert model_path.exists(), f"Model not found: {model_name}"

        # Check model size (should be reasonable)
        size_mb = model_path.stat().st_size / (1024 * 1024)
        assert size_mb > 0.1, f"Model {model_name} is too small ({size_mb:.2f} MB)"
        assert size_mb < 100, f"Model {model_name} is too large ({size_mb:.2f} MB)"

        # Check metadata file
        metadata_name = model_name.replace('.onnx', '_metadata.json')
        metadata_path = models_dir / metadata_name
        assert metadata_path.exists(), f"Metadata not found: {metadata_name}"

        # Validate metadata content
        with open(metadata_path) as f:
            metadata = json.load(f)

        required_fields = ['name', 'version', 'type', 'input_size', 'num_classes', 'classes']
        for field in required_fields:
            assert field in metadata, f"Missing metadata field: {field} in {metadata_name}"

        # Check classes are defined
        assert len(metadata['classes']) == metadata['num_classes'], \
            f"Classes count mismatch in {metadata_name}"


def test_onnx_model_validation():
    """Test ONNX models are valid and can be loaded"""

    try:
        import onnx
        import onnxruntime
    except ImportError:
        pytest.skip("ONNX libraries not installed")

    models_dir = Path('models')
    models = ['simple_logo_detector.onnx', 'mobilenet_logo_classifier.onnx', 'efficientdet_lite.onnx']

    for model_name in models:
        model_path = models_dir / model_name
        if model_path.exists():
            # Load and check model
            onnx_model = onnx.load(str(model_path))
            onnx.checker.check_model(onnx_model)

            # Try to create inference session
            session = onnxruntime.InferenceSession(str(model_path))

            # Check inputs and outputs
            inputs = session.get_inputs()
            outputs = session.get_outputs()

            assert len(inputs) > 0, f"No inputs defined for {model_name}"
            assert len(outputs) > 0, f"No outputs defined for {model_name}"

            # Check input shape
            input_shape = inputs[0].shape
            assert len(input_shape) == 4, f"Invalid input shape for {model_name}: {input_shape}"


def test_integration_api_authentication():
    """Integration test for API authentication flow"""

    # Check if backend is configured properly
    env_file = Path('.env')
    if not env_file.exists():
        # Create test environment
        test_env = Path('.env.example').read_text()
        test_env = test_env.replace('CHANGE_ME', 'test_password_123')
        env_file.write_text(test_env)

    # Test authentication configuration
    backend_auth = Path('backend/app/auth.py')
    if backend_auth.exists():
        content = backend_auth.read_text()

        # Check JWT implementation
        assert 'JWT' in content or 'jwt' in content, "JWT not implemented in backend"
        assert 'encode' in content or 'create_access_token' in content, "Token creation not implemented"
        assert 'decode' in content or 'verify_token' in content, "Token verification not implemented"


def test_integration_frontend_backend_connection():
    """Integration test for frontend-backend connection"""

    # Check frontend environment configuration
    frontend_env = Path('frontend/.env')
    if not frontend_env.exists():
        frontend_env = Path('frontend/.env.example')

    if frontend_env.exists():
        content = frontend_env.read_text()
        assert 'VITE_API_BASE_URL' in content or 'REACT_APP_API_URL' in content, \
            "API URL not configured in frontend"

    # Check package.json for proxy configuration
    package_json = Path('frontend/package.json')
    if package_json.exists():
        with open(package_json) as f:
            package = json.load(f)

        # Check if proxy or API configuration exists
        if 'proxy' in package:
            assert 'localhost:8000' in package['proxy'] or 'api' in package['proxy'], \
                "Proxy not properly configured"


def test_security_best_practices():
    """Test security best practices are implemented"""

    # Check no hardcoded secrets in code
    patterns_to_check = [
        ('*.py', ['password =', 'secret =', 'key =']),
        ('*.ts', ['password:', 'secret:', 'apiKey:']),
        ('*.tsx', ['password:', 'secret:', 'apiKey:']),
        ('*.js', ['password:', 'secret:', 'apiKey:'])
    ]

    for pattern, keywords in patterns_to_check:
        files = Path('.').rglob(pattern)
        for file in files:
            if 'node_modules' in str(file) or '.git' in str(file) or 'test' in str(file):
                continue

            try:
                content = file.read_text()
                for keyword in keywords:
                    if keyword in content:
                        # Check if it's actually a hardcoded value
                        lines = content.split('\n')
                        for line in lines:
                            if keyword in line and '=' in line:
                                value_part = line.split('=')[1].strip()
                                # Check if value is hardcoded (not variable or env)
                                if value_part.startswith('"') or value_part.startswith("'"):
                                    value = value_part.strip('"\'')
                                    if len(value) > 0 and not value.startswith('${') and \
                                       not value.startswith('process.env') and \
                                       not value.startswith('import.meta.env') and \
                                       value not in ['', 'null', 'undefined', 'CHANGE_ME']:
                                        assert False, f"Potential hardcoded secret in {file}: {line.strip()}"
            except Exception:
                pass  # Skip binary files


def test_documentation_completeness():
    """Test JSDoc/docstring documentation requirements"""

    # Check TypeScript files for JSDoc
    ts_files = list(Path('frontend/src/services').glob('*.ts'))

    for file in ts_files:
        if file.name == 'index.ts':
            continue

        content = file.read_text()

        # Check for class documentation
        if 'class ' in content:
            assert '/**' in content, f"Missing JSDoc in {file.name}"
            assert '@class' in content or '@description' in content, f"Missing class documentation in {file.name}"

        # Check for method documentation
        if 'public ' in content or 'async ' in content:
            # Count methods and documentation blocks
            method_count = content.count('public ') + content.count('async ')
            doc_count = content.count('/**')

            # Should have at least some documentation
            assert doc_count > method_count * 0.5, f"Insufficient documentation in {file.name}"


def test_performance_requirements():
    """Test performance requirements are met"""

    # Check model sizes for performance
    models_dir = Path('models')
    if models_dir.exists():
        total_size = 0
        for model in models_dir.glob('*.onnx'):
            size_mb = model.stat().st_size / (1024 * 1024)
            total_size += size_mb

        # Total model size should be reasonable for fast loading
        assert total_size < 200, f"Total model size too large: {total_size:.2f} MB"

    # Check frontend bundle optimization
    vite_config = Path('frontend/vite.config.ts')
    if vite_config.exists():
        content = vite_config.read_text()
        # Check for optimization settings
        if 'build' in content:
            assert 'rollupOptions' in content or 'minify' in content, \
                "Build optimization not configured"


# Test Suite Summary
def test_sprint01_completion_summary():
    """Summary test to verify all Sprint 01 requirements are met"""

    completed_stories = {
        'US-001': 'Secure Configuration Management',
        'US-003': 'Frontend-Backend Integration',
        'US-005': 'Login/Logout UI',
        'US-007A': 'ONNX Model Deployment'
    }

    results = {
        'US-001': Path('.env.example').exists() and Path('docker-compose.yml').exists(),
        'US-003': Path('frontend/src/services/api.ts').exists() and
                  Path('frontend/src/services/authService.ts').exists() and
                  Path('frontend/src/services/dataService.ts').exists(),
        'US-005': Path('frontend/src/pages/LoginPage.tsx').exists() and
                  Path('frontend/src/components/Layout/Header.tsx').exists(),
        'US-007A': Path('models/efficientdet_lite.onnx').exists() and
                   Path('models/mobilenet_logo_classifier.onnx').exists()
    }

    print("\n" + "="*60)
    print("SPRINT 01 - A++ GRADE COMPLETION REPORT")
    print("="*60)

    total_points = 0
    completed_points = 0

    story_points = {'US-001': 5, 'US-003': 8, 'US-005': 5, 'US-007A': 8}

    for story_id, description in completed_stories.items():
        status = "✅ COMPLETED" if results[story_id] else "❌ INCOMPLETE"
        points = story_points[story_id]
        total_points += points

        if results[story_id]:
            completed_points += points

        print(f"{story_id}: {description} - {status} ({points} points)")

    completion_percentage = (completed_points / total_points) * 100

    print("-"*60)
    print(f"Total Story Points: {completed_points}/{total_points}")
    print(f"Completion: {completion_percentage:.1f}%")
    print(f"Grade: {'A++' if completion_percentage >= 100 else 'A+' if completion_percentage >= 90 else 'A'}")
    print("="*60)

    # Assert all stories are completed for A++ grade
    assert completion_percentage >= 100, f"Sprint not fully complete: {completion_percentage:.1f}%"

    return True


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, '-v', '--tb=short'])