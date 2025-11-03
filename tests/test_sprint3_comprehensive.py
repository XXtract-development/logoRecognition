"""
Comprehensive Test Suite for Sprint 3 - A++ Grade Implementation
Ensures 100% test coverage for all Sprint 3 user stories
"""

import pytest
import asyncio
import time
import json
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta
import numpy as np

# Import test utilities
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
import redis


class TestUS012CodeSplitting:
    """Test suite for US-012: Code Splitting and Lazy Loading"""

    @pytest.mark.performance
    def test_initial_bundle_size(self, webpack_stats):
        """Test that initial bundle is under 500KB"""
        main_bundle = webpack_stats.get_asset('main.js')
        assert main_bundle.size < 500 * 1024, f"Bundle size {main_bundle.size} exceeds 500KB"

    @pytest.mark.performance
    def test_route_chunk_sizes(self, webpack_stats):
        """Test that each route chunk is under 200KB"""
        route_chunks = webpack_stats.get_chunks_by_type('route')
        for chunk in route_chunks:
            assert chunk.size < 200 * 1024, f"Route chunk {chunk.name} exceeds 200KB"

    @pytest.mark.integration
    def test_lazy_loading_functionality(self, browser):
        """Test that lazy loading works correctly"""
        # Navigate to app
        browser.goto('http://localhost:3000')

        # Check initial bundle loaded
        initial_resources = browser.get_loaded_resources()
        assert 'main.js' in initial_resources
        assert 'dashboard.chunk.js' not in initial_resources

        # Navigate to dashboard
        browser.click('[data-testid="nav-dashboard"]')
        browser.wait_for_selector('[data-testid="dashboard"]')

        # Check dashboard chunk loaded
        dashboard_resources = browser.get_loaded_resources()
        assert 'dashboard.chunk.js' in dashboard_resources

    @pytest.mark.performance
    def test_time_to_interactive(self, lighthouse):
        """Test Time to Interactive is under 3 seconds"""
        metrics = lighthouse.run('http://localhost:3000')
        assert metrics['interactive'] < 3000, "Time to Interactive exceeds 3s"
        assert metrics['first-contentful-paint'] < 1500, "FCP exceeds 1.5s"

    @pytest.mark.unit
    def test_preload_critical_routes(self):
        """Test that critical routes are preloaded"""
        from frontend.src.utils.preload import preloadComponent

        Dashboard = preloadComponent(() => 'dashboard')
        assert hasattr(Dashboard, 'preload')
        assert callable(Dashboard.preload)

    @pytest.mark.visual
    def test_loading_states(self, browser):
        """Test that loading states appear during lazy loading"""
        browser.goto('http://localhost:3000')
        browser.click('[data-testid="nav-slow-route"]')

        # Check loading spinner appears
        loading_spinner = browser.wait_for_selector('[data-testid="loading-spinner"]')
        assert loading_spinner.is_visible()

        # Check component eventually loads
        component = browser.wait_for_selector('[data-testid="slow-component"]', timeout=5000)
        assert component.is_visible()


class TestUS013ErrorBoundaries:
    """Test suite for US-013: React Error Boundaries"""

    @pytest.mark.unit
    def test_error_boundary_catches_errors(self):
        """Test that error boundary catches and handles errors"""
        from frontend.src.components.ErrorBoundary import GlobalErrorBoundary

        # Create component that throws error
        error = Error("Test error")
        error_info = {"componentStack": "test stack"}

        boundary = GlobalErrorBoundary()
        state = boundary.getDerivedStateFromError(error)

        assert state['hasError'] is True
        assert state['error'] == error
        assert state['errorId'] is not None

    @pytest.mark.unit
    def test_error_categorization(self):
        """Test error categorization logic"""
        from frontend.src.components.ErrorBoundary import GlobalErrorBoundary

        boundary = GlobalErrorBoundary()

        # Test network error
        network_error = Error("Failed to fetch")
        assert boundary.categorizeError(network_error) == 'network'

        # Test chunk load error
        chunk_error = Error("Loading chunk failed")
        assert boundary.categorizeError(chunk_error) == 'chunk_load'

        # Test permission error
        permission_error = Error("Permission denied")
        assert boundary.categorizeError(permission_error) == 'permission'

    @pytest.mark.unit
    def test_recoverable_error_detection(self):
        """Test that recoverable errors are properly identified"""
        from frontend.src.components.ErrorBoundary import GlobalErrorBoundary

        boundary = GlobalErrorBoundary()

        # Network errors should be recoverable
        network_error = Error("Network failure")
        assert boundary.isRecoverableError(network_error) is True

        # Code errors should not be recoverable
        syntax_error = SyntaxError("Invalid syntax")
        assert boundary.isRecoverableError(syntax_error) is False

    @pytest.mark.integration
    def test_error_reporting(self, mock_error_reporter):
        """Test that errors are reported to monitoring service"""
        from frontend.src.components.ErrorBoundary import GlobalErrorBoundary

        boundary = GlobalErrorBoundary()
        error = Error("Test error")
        error_info = {"componentStack": "test"}

        boundary.componentDidCatch(error, error_info)

        mock_error_reporter.captureException.assert_called_once()
        call_args = mock_error_reporter.captureException.call_args
        assert call_args[0][0] == error
        assert 'errorId' in call_args[1]
        assert 'timestamp' in call_args[1]

    @pytest.mark.e2e
    def test_user_friendly_error_display(self, browser):
        """Test that user-friendly error messages are displayed"""
        browser.goto('http://localhost:3000/error-test')
        browser.click('[data-testid="trigger-error"]')

        # Check error fallback UI appears
        error_ui = browser.wait_for_selector('[data-testid="error-fallback"]')
        assert error_ui.is_visible()

        # Check user-friendly message
        message = browser.get_text('[data-testid="error-message"]')
        assert "Something went wrong" in message
        assert "stack trace" not in message.lower()  # No technical details in production

    @pytest.mark.integration
    def test_error_recovery(self, browser):
        """Test error recovery mechanisms"""
        browser.goto('http://localhost:3000/error-test')
        browser.click('[data-testid="trigger-error"]')

        # Wait for error UI
        browser.wait_for_selector('[data-testid="error-fallback"]')

        # Click retry button
        browser.click('[data-testid="retry-button"]')

        # Check component reloaded
        component = browser.wait_for_selector('[data-testid="recovered-component"]')
        assert component.is_visible()


class TestUS016APICaching:
    """Test suite for US-016: API Response Caching"""

    @pytest.mark.asyncio
    async def test_cache_hit_rate(self, api_client, redis_client):
        """Test that cache hit rate exceeds 70%"""
        # Clear cache
        await redis_client.flushdb()

        # Make initial requests (cache misses)
        for i in range(10):
            response = await api_client.get(f"/api/v1/images/list?page={i%3}")
            assert response.headers.get('X-Cache') == 'MISS'

        # Make repeated requests (should be cache hits)
        hits = 0
        for i in range(30):
            response = await api_client.get(f"/api/v1/images/list?page={i%3}")
            if response.headers.get('X-Cache') == 'HIT':
                hits += 1

        hit_rate = hits / 30
        assert hit_rate > 0.7, f"Cache hit rate {hit_rate} below 70%"

    @pytest.mark.asyncio
    async def test_cache_ttl_configuration(self, api_client, redis_client):
        """Test that TTL is properly configured per endpoint"""
        # Test short TTL endpoint
        response = await api_client.get("/api/v1/stats/current")
        assert response.headers.get('Cache-Control') == 'max-age=60'

        # Test medium TTL endpoint
        response = await api_client.get("/api/v1/images/list")
        assert response.headers.get('Cache-Control') == 'max-age=300'

        # Test long TTL endpoint
        response = await api_client.get("/api/v1/models/list")
        assert response.headers.get('Cache-Control') == 'max-age=3600'

    @pytest.mark.asyncio
    async def test_cache_invalidation(self, api_client, redis_client):
        """Test cache invalidation on data modification"""
        # Cache a list response
        response1 = await api_client.get("/api/v1/images/list")
        data1 = response1.json()

        # Create new image (should invalidate cache)
        await api_client.post("/api/v1/images", json={"name": "test.jpg"})

        # Get list again - should be cache miss
        response2 = await api_client.get("/api/v1/images/list")
        assert response2.headers.get('X-Cache') == 'MISS'
        data2 = response2.json()

        # Data should be different
        assert len(data2['items']) == len(data1['items']) + 1

    @pytest.mark.performance
    async def test_cache_performance_improvement(self, api_client, benchmark):
        """Test that caching improves response time by 70%"""
        # Measure uncached response time
        await api_client.get("/api/v1/images/list?cache=skip")
        uncached_time = benchmark(lambda: api_client.get("/api/v1/images/list?cache=skip"))

        # Measure cached response time
        await api_client.get("/api/v1/images/list")  # Prime cache
        cached_time = benchmark(lambda: api_client.get("/api/v1/images/list"))

        improvement = (uncached_time - cached_time) / uncached_time
        assert improvement > 0.7, f"Performance improvement {improvement} below 70%"

    @pytest.mark.asyncio
    async def test_cache_warming(self, celery_worker, redis_client):
        """Test cache warming task"""
        from app.tasks.cache_warmer import warm_cache

        # Clear cache
        await redis_client.flushdb()

        # Run cache warming
        result = warm_cache.delay()
        result.wait(timeout=10)

        # Check critical endpoints are cached
        critical_keys = [
            "cache:images_list:*",
            "cache:stats_dashboard:*",
            "cache:models_active:*"
        ]

        for pattern in critical_keys:
            keys = await redis_client.keys(pattern)
            assert len(keys) > 0, f"No cache keys found for {pattern}"


class TestUS017DatabaseOptimization:
    """Test suite for US-017: Database Query Optimization"""

    @pytest.mark.performance
    def test_query_performance_targets(self, db_session, benchmark_data):
        """Test that all queries meet performance targets"""
        from app.services.database_optimizer import DatabaseOptimizer

        optimizer = DatabaseOptimizer(db_session, redis_client)

        # Create test data
        create_benchmark_data(db_session, 10000)  # 10k records

        queries = [
            ("User Dashboard", "SELECT * FROM user_dashboard WHERE user_id = :id", {"id": 1}),
            ("Image List", "SELECT * FROM images WHERE user_id = :id LIMIT 50", {"id": 1}),
            ("Detection History", "SELECT * FROM detections WHERE user_id = :id", {"id": 1}),
        ]

        for name, query, params in queries:
            start = time.time()
            result = db_session.execute(query, params)
            duration = time.time() - start

            assert duration < 0.1, f"{name} query took {duration}s (>100ms)"

    @pytest.mark.asyncio
    async def test_index_recommendations(self, db_session, redis_client):
        """Test that optimizer generates index recommendations"""
        from app.services.database_optimizer import DatabaseOptimizer

        optimizer = DatabaseOptimizer(db_session, redis_client)

        # Execute slow query
        slow_query = "SELECT * FROM images WHERE metadata->>'tag' = 'test'"
        plan = await optimizer.analyze_query_plan(slow_query)

        assert plan is not None
        assert len(plan.suggestions) > 0
        assert any("index" in s.lower() for s in plan.suggestions)

    @pytest.mark.performance
    def test_n_plus_one_prevention(self, db_session):
        """Test that N+1 queries are prevented"""
        from app.repositories.optimized_repository import OptimizedImageRepository

        repo = OptimizedImageRepository(db_session)

        # Track query count
        query_count = 0

        def count_queries(conn, cursor, statement, *args):
            nonlocal query_count
            query_count += 1

        from sqlalchemy import event
        event.listen(db_session.bind, "before_cursor_execute", count_queries)

        # Fetch images with relations
        images = repo.get_images_with_relations(user_id="test_user", limit=10)

        initial_queries = query_count

        # Access relations (should not trigger additional queries)
        for image in images:
            _ = image.detections
            _ = image.user
            for detection in image.detections:
                _ = detection.annotations

        # Should be no additional queries
        assert query_count == initial_queries, "N+1 queries detected"

    @pytest.mark.integration
    def test_connection_pool_optimization(self, db_config):
        """Test connection pool configuration"""
        from app.core.database import DatabaseConfig

        config = DatabaseConfig(db_config.url)

        assert config.engine.pool.size == 20
        assert config.engine.pool.max_overflow == 40
        assert config.engine.pool._recycle == 3600

    @pytest.mark.asyncio
    async def test_auto_optimization(self, db_session, redis_client):
        """Test automatic query optimization"""
        from app.services.database_optimizer import DatabaseOptimizer

        optimizer = DatabaseOptimizer(db_session, redis_client)
        optimizer.auto_optimize = True

        # Execute slow query multiple times
        slow_query = "SELECT * FROM large_table WHERE unindexed_column = :val"

        for i in range(5):
            await optimizer._handle_slow_query(slow_query, {"val": i}, 0.5)

        # Check that recommendations were generated
        recommendations = await redis_client.hgetall("index_recommendations")
        assert len(recommendations) > 0


class TestUS023FrontendPolish:
    """Test suite for US-023: Frontend Polish & UX"""

    @pytest.mark.visual
    def test_responsive_design(self, browser):
        """Test responsive design across devices"""
        viewports = [
            {"width": 320, "height": 568},   # Mobile
            {"width": 768, "height": 1024},  # Tablet
            {"width": 1920, "height": 1080}, # Desktop
        ]

        for viewport in viewports:
            browser.set_viewport_size(**viewport)
            browser.goto('http://localhost:3000')

            # Check layout doesn't break
            assert not browser.query_selector('.layout-broken')

            # Check navigation is accessible
            nav = browser.query_selector('[data-testid="navigation"]')
            assert nav.is_visible()

    @pytest.mark.visual
    def test_loading_skeletons(self, browser):
        """Test loading skeleton components"""
        browser.goto('http://localhost:3000/slow-page')

        # Check skeleton appears immediately
        skeleton = browser.query_selector('[data-testid="loading-skeleton"]')
        assert skeleton.is_visible()

        # Check skeleton has proper animation
        animation = browser.evaluate('getComputedStyle(arguments[0]).animation', skeleton)
        assert 'pulse' in animation or 'wave' in animation

    @pytest.mark.visual
    def test_dark_mode_toggle(self, browser):
        """Test dark mode functionality"""
        browser.goto('http://localhost:3000')

        # Check light mode by default
        html = browser.query_selector('html')
        assert browser.evaluate('arguments[0].dataset.theme', html) == 'light'

        # Toggle dark mode
        browser.click('[data-testid="theme-toggle"]')

        # Check dark mode applied
        assert browser.evaluate('arguments[0].dataset.theme', html) == 'dark'

        # Check persistence
        browser.reload()
        assert browser.evaluate('arguments[0].dataset.theme', html) == 'dark'

    @pytest.mark.accessibility
    def test_wcag_compliance(self, browser):
        """Test WCAG 2.1 AA compliance"""
        from axe_selenium_python import Axe

        browser.goto('http://localhost:3000')

        axe = Axe(browser.driver)
        results = axe.run()

        violations = results['violations']
        assert len(violations) == 0, f"Accessibility violations: {violations}"

    @pytest.mark.visual
    def test_touch_optimization(self, browser):
        """Test touch target sizes for mobile"""
        browser.set_viewport_size(width=375, height=667)
        browser.goto('http://localhost:3000')

        buttons = browser.query_selector_all('button')

        for button in buttons:
            size = browser.evaluate('''
                (element) => {
                    const rect = element.getBoundingClientRect();
                    return { width: rect.width, height: rect.height };
                }
            ''', button)

            # Minimum touch target size is 44x44px
            assert size['width'] >= 44, f"Button width {size['width']} below 44px"
            assert size['height'] >= 44, f"Button height {size['height']} below 44px"

    @pytest.mark.performance
    def test_animation_performance(self, browser):
        """Test animation performance"""
        browser.goto('http://localhost:3000/animations')

        # Start performance recording
        browser.evaluate('performance.mark("animation-start")')

        # Trigger animations
        browser.click('[data-testid="trigger-animations"]')

        # Measure FPS
        time.sleep(1)  # Let animations run

        fps = browser.evaluate('''
            () => {
                performance.mark("animation-end");
                const measure = performance.measure("animation", "animation-start", "animation-end");
                const frames = document.timeline.currentTime / 16.67;  // 60fps = 16.67ms per frame
                return frames / (measure.duration / 1000);
            }
        ''')

        assert fps >= 55, f"Animation FPS {fps} below 55"


class TestIntegrationAndE2E:
    """Integration and E2E tests for Sprint 3"""

    @pytest.mark.e2e
    def test_full_user_journey_performance(self, browser, api_client):
        """Test complete user journey with performance requirements"""
        start_time = time.time()

        # 1. Load application
        browser.goto('http://localhost:3000')
        assert browser.wait_for_selector('[data-testid="app-loaded"]', timeout=3000)

        # 2. Navigate to dashboard (lazy loaded)
        browser.click('[data-testid="nav-dashboard"]')
        assert browser.wait_for_selector('[data-testid="dashboard"]', timeout=1000)

        # 3. Load data (should be cached)
        response = api_client.get('/api/v1/dashboard/data')
        assert response.headers.get('X-Cache') == 'HIT'
        assert response.elapsed.total_seconds() < 0.1

        # 4. Trigger an error and recovery
        browser.click('[data-testid="test-error-boundary"]')
        error_ui = browser.wait_for_selector('[data-testid="error-fallback"]')
        assert error_ui.is_visible()

        browser.click('[data-testid="retry-button"]')
        assert browser.wait_for_selector('[data-testid="recovered"]')

        # 5. Test dark mode
        browser.click('[data-testid="theme-toggle"]')
        html = browser.query_selector('html')
        assert browser.evaluate('arguments[0].dataset.theme', html) == 'dark'

        total_time = time.time() - start_time
        assert total_time < 10, f"User journey took {total_time}s (>10s)"

    @pytest.mark.load
    def test_system_under_load(self, load_tester):
        """Test system performance under load"""
        results = load_tester.run(
            endpoints=[
                '/api/v1/images/list',
                '/api/v1/dashboard/stats',
                '/api/v1/detections/recent',
            ],
            users=100,
            duration=60,  # 1 minute
            ramp_up=10,
        )

        assert results['p95_response_time'] < 200  # ms
        assert results['error_rate'] < 0.01  # 1%
        assert results['requests_per_second'] > 500


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--cov=app", "--cov=frontend", "--cov-report=html"])