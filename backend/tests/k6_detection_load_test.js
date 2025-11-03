/**
 * K6 Load Test for Detection API - A++ Grade
 * Target: <100ms single image, <200ms batch processing
 * 100 concurrent users, <1% error rate
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const detectionLatency = new Trend('detection_latency');
const batchLatency = new Trend('batch_latency');
const cacheHitRate = new Counter('cache_hits');
const errorRate = new Counter('errors');

// Test configuration
export let options = {
    scenarios: {
        // Scenario 1: Single image detection ramp-up
        single_detection: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 25 },   // Ramp up to 25 users
                { duration: '1m', target: 50 },    // Ramp up to 50 users
                { duration: '2m', target: 50 },    // Stay at 50 users
                { duration: '30s', target: 100 },  // Spike to 100 users
                { duration: '1m', target: 100 },   // Stay at 100 users
                { duration: '30s', target: 0 },    // Ramp down
            ],
            exec: 'singleDetection',
        },
        // Scenario 2: Batch detection steady load
        batch_detection: {
            executor: 'constant-vus',
            vus: 10,
            duration: '3m',
            startTime: '30s', // Start after single detection ramps up
            exec: 'batchDetection',
        },
        // Scenario 3: Cache effectiveness test
        cache_test: {
            executor: 'constant-arrival-rate',
            rate: 20,
            timeUnit: '1s',
            duration: '2m',
            preAllocatedVUs: 10,
            startTime: '1m',
            exec: 'cacheTest',
        }
    },
    thresholds: {
        // Performance requirements
        'http_req_duration{scenario:single_detection}': ['p(95)<100'],  // 95% under 100ms
        'http_req_duration{scenario:batch_detection}': ['p(95)<200'],    // 95% under 200ms per image
        'http_req_failed': ['rate<0.01'],                               // Error rate < 1%
        'detection_latency': ['p(95)<100', 'p(99)<150'],               // Detection specific latency
        'batch_latency': ['p(95)<200', 'p(99)<300'],                   // Batch specific latency
    },
};

// Base URL configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// Test image (1x1 red pixel PNG)
const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Convert base64 to binary
function base64ToBinary(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// Generate random test image
function generateTestImage(width = 100, height = 100) {
    // Create a simple BMP image
    const fileSize = 54 + width * height * 3;
    const bytes = new Uint8Array(fileSize);

    // BMP Header
    bytes[0] = 0x42; bytes[1] = 0x4D; // 'BM'
    // File size
    bytes[2] = fileSize & 0xff;
    bytes[3] = (fileSize >> 8) & 0xff;
    bytes[4] = (fileSize >> 16) & 0xff;
    bytes[5] = (fileSize >> 24) & 0xff;
    // Data offset
    bytes[10] = 54;
    // Info header size
    bytes[14] = 40;
    // Width
    bytes[18] = width & 0xff;
    bytes[19] = (width >> 8) & 0xff;
    // Height
    bytes[22] = height & 0xff;
    bytes[23] = (height >> 8) & 0xff;
    // Planes
    bytes[26] = 1;
    // Bits per pixel
    bytes[28] = 24;

    // Random pixel data
    for (let i = 54; i < fileSize; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
    }

    return bytes;
}

// Scenario 1: Single image detection
export function singleDetection() {
    const image = generateTestImage(640, 480);

    const params = {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    };

    const formData = {
        file: http.file(image, 'test_image.bmp', 'image/bmp'),
        confidence_threshold: '0.5',
    };

    const startTime = Date.now();
    const response = http.post(`${BASE_URL}/api/v1/detection/detect`, formData, params);
    const latency = Date.now() - startTime;

    // Record metrics
    detectionLatency.add(latency);

    // Check response
    const success = check(response, {
        'status is 200': (r) => r.status === 200,
        'has detections': (r) => {
            const body = JSON.parse(r.body);
            return body.detections !== undefined;
        },
        'latency < 100ms': () => latency < 100,
        'from cache': (r) => {
            const body = JSON.parse(r.body);
            if (body.from_cache) {
                cacheHitRate.add(1);
            }
            return true;
        },
    });

    if (!success) {
        errorRate.add(1);
    }

    sleep(Math.random() * 2); // Random delay between 0-2 seconds
}

// Scenario 2: Batch detection
export function batchDetection() {
    const batchSize = 5;
    const formData = {};

    // Create multiple images
    for (let i = 0; i < batchSize; i++) {
        const image = generateTestImage(320, 240);
        formData[`files`] = http.file(image, `image_${i}.bmp`, 'image/bmp');
    }

    formData['confidence_threshold'] = '0.5';
    formData['parallel'] = 'true';

    const startTime = Date.now();
    const response = http.post(`${BASE_URL}/api/v1/detection/detect/batch`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    const latency = Date.now() - startTime;
    const latencyPerImage = latency / batchSize;

    // Record metrics
    batchLatency.add(latencyPerImage);

    // Check response
    const success = check(response, {
        'batch status is 200': (r) => r.status === 200,
        'all images processed': (r) => {
            const body = JSON.parse(r.body);
            return body.successful === batchSize;
        },
        'latency per image < 200ms': () => latencyPerImage < 200,
        'no failures': (r) => {
            const body = JSON.parse(r.body);
            return body.failed === 0;
        },
    });

    if (!success) {
        errorRate.add(1);
    }

    sleep(Math.random() * 3); // Random delay between 0-3 seconds
}

// Scenario 3: Cache effectiveness test
export function cacheTest() {
    // Use the same image to test caching
    const staticImage = base64ToBinary(testImageBase64);

    const formData = {
        file: http.file(staticImage, 'static_test.png', 'image/png'),
        confidence_threshold: '0.5',
    };

    // First request (should miss cache)
    const response1 = http.post(`${BASE_URL}/api/v1/detection/detect`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });

    check(response1, {
        'first request successful': (r) => r.status === 200,
        'first request not cached': (r) => {
            const body = JSON.parse(r.body);
            return !body.from_cache;
        },
    });

    // Second request (should hit cache)
    const response2 = http.post(`${BASE_URL}/api/v1/detection/detect`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });

    check(response2, {
        'second request successful': (r) => r.status === 200,
        'second request cached': (r) => {
            const body = JSON.parse(r.body);
            if (body.from_cache) {
                cacheHitRate.add(1);
            }
            return body.from_cache;
        },
        'cached response faster': (r) => {
            const body = JSON.parse(r.body);
            return body.processing_time_ms < 10; // Should be very fast if cached
        },
    });

    sleep(1);
}

// Health check (run before main scenarios)
export function setup() {
    const response = http.get(`${BASE_URL}/api/v1/detection/health`);

    if (!check(response, {
        'health check successful': (r) => r.status === 200,
        'model loaded': (r) => {
            const body = JSON.parse(r.body);
            return body.model_loaded === true;
        },
    })) {
        throw new Error('Health check failed - service not ready');
    }

    // Warmup the model
    const warmupResponse = http.post(`${BASE_URL}/api/v1/detection/warmup?iterations=3`);
    check(warmupResponse, {
        'warmup successful': (r) => r.status === 200,
    });

    return { startTime: Date.now() };
}

// Cleanup
export function teardown(data) {
    // Get final stats
    const statsResponse = http.get(`${BASE_URL}/api/v1/detection/stats`);

    if (statsResponse.status === 200) {
        const stats = JSON.parse(statsResponse.body);
        console.log('Final Statistics:');
        console.log(`- Total Detections: ${stats.total_detections}`);
        console.log(`- Error Rate: ${stats.error_rate * 100}%`);
        console.log(`- Avg Detections/min: ${stats.avg_detections_per_minute}`);
    }

    const duration = (Date.now() - data.startTime) / 1000;
    console.log(`\nTest completed in ${duration} seconds`);
}

// Custom summary
export function handleSummary(data) {
    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
        'summary.json': JSON.stringify(data),
        'summary.html': htmlReport(data),
    };
}

function textSummary(data, options) {
    // Generate text summary
    let summary = '\n=== Detection API Load Test Results ===\n\n';

    // Check thresholds
    const thresholdsPassed = Object.values(data.metrics)
        .filter(m => m.thresholds)
        .every(m => Object.values(m.thresholds).every(t => t.ok));

    summary += thresholdsPassed ?
        '✅ All performance thresholds PASSED\n\n' :
        '❌ Some performance thresholds FAILED\n\n';

    // Key metrics
    if (data.metrics.detection_latency) {
        summary += `Single Detection Latency:\n`;
        summary += `  p95: ${data.metrics.detection_latency.p(95)}ms\n`;
        summary += `  p99: ${data.metrics.detection_latency.p(99)}ms\n\n`;
    }

    if (data.metrics.batch_latency) {
        summary += `Batch Detection Latency (per image):\n`;
        summary += `  p95: ${data.metrics.batch_latency.p(95)}ms\n`;
        summary += `  p99: ${data.metrics.batch_latency.p(99)}ms\n\n`;
    }

    summary += `Error Rate: ${(data.metrics.http_req_failed.rate * 100).toFixed(2)}%\n`;
    summary += `Total Requests: ${data.metrics.http_reqs.count}\n`;

    return summary;
}

function htmlReport(data) {
    // Generate HTML report
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Detection API Load Test Report</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .passed { color: green; }
            .failed { color: red; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
        </style>
    </head>
    <body>
        <h1>Detection API Load Test Report</h1>
        <h2>Performance Metrics</h2>
        <table>
            <tr>
                <th>Metric</th>
                <th>Value</th>
                <th>Target</th>
                <th>Status</th>
            </tr>
            <!-- Add metric rows here -->
        </table>
    </body>
    </html>
    `;
}