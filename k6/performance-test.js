import { check, group, sleep } from 'k6';
import http from 'k6/http';
import { Trend, Rate, Counter, Gauge } from 'k6/metrics';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';

// Custom metrics for A++ quality monitoring
const apiLatency = new Trend('api_latency');
const errorRate = new Rate('errors');
const successfulDetections = new Counter('successful_detections');
const detectionAccuracy = new Gauge('detection_accuracy');
const throughput = new Counter('requests_per_second');

// A++ Performance thresholds
export let options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp to 200 users
    { duration: '5m', target: 200 }, // Stay at 200 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<200', 'p(99)<500'],  // 95% under 200ms, 99% under 500ms
    'http_req_failed': ['rate<0.01'],                  // Error rate under 1%
    'api_latency': ['p(95)<150', 'p(99)<300'],        // API latency targets
    'errors': ['rate<0.01'],                          // Custom error rate
    'http_req_waiting': ['p(95)<100'],                // Time to first byte
    'iterations': ['rate>1'],                         // At least 1 iteration per second
  },
  // A++ Extended options
  setupTimeout: '60s',
  teardownTimeout: '60s',
  maxRedirects: 4,
  userAgent: 'K6-A++TestSuite/1.0',
  insecureSkipTLSVerify: false,
  tlsVersion: {
    min: 'tls1.2',
    max: 'tls1.3',
  },
  tags: {
    testType: 'performance',
    environment: 'test',
    suite: 'A++',
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8000';
const TEST_IMAGE_PATH = './test-assets/test-logo.jpg';

// Setup function - prepare test data
export function setup() {
  console.log('🚀 A++ Performance Test Suite Starting...');
  console.log(`📍 Target URL: ${BASE_URL}`);

  // Health check
  const healthCheck = http.get(`${BASE_URL}/health`);
  check(healthCheck, {
    'API is healthy': (r) => r.status === 200,
  });

  if (healthCheck.status !== 200) {
    throw new Error('API health check failed!');
  }

  return {
    startTime: Date.now(),
    testData: generateTestData(),
  };
}

// Main test scenarios
export default function(data) {
  // Scenario 1: Logo Detection Performance
  group('Logo Detection API', () => {
    const fd = new FormData();
    const testImage = open(TEST_IMAGE_PATH, 'b');
    fd.append('file', http.file(testImage, 'test-logo.jpg', 'image/jpeg'));

    const params = {
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + fd.boundary,
      },
      timeout: '10s',
      tags: { name: 'detect_logo' },
    };

    const startTime = Date.now();
    const response = http.post(`${BASE_URL}/api/detect`, fd.body(), params);
    const duration = Date.now() - startTime;

    // Record custom metrics
    apiLatency.add(duration);
    errorRate.add(response.status !== 200);
    throughput.add(1);

    // Comprehensive checks
    const checks = check(response, {
      'status is 200': (r) => r.status === 200,
      'response has body': (r) => r.body && r.body.length > 0,
      'content type is JSON': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('application/json'),
      'response time < 200ms': (r) => r.timings.duration < 200,
      'no server errors': (r) => r.status < 500,
    });

    if (response.status === 200) {
      try {
        const body = JSON.parse(response.body);

        check(body, {
          'has detections array': (b) => Array.isArray(b.detections),
          'has processing time': (b) => b.processingTime !== undefined,
          'has model version': (b) => b.modelVersion !== undefined,
          'detection confidence > 0.7': (b) => {
            if (b.detections && b.detections.length > 0) {
              return b.detections.every(d => d.confidence > 0.7);
            }
            return true;
          },
        });

        if (body.detections && body.detections.length > 0) {
          successfulDetections.add(1);
          detectionAccuracy.add(body.detections[0].confidence);
        }
      } catch (e) {
        console.error('Failed to parse response:', e);
        errorRate.add(1);
      }
    }
  });

  // Scenario 2: Batch Processing Performance
  group('Batch Processing', () => {
    const batchSize = 5;
    const requests = [];

    for (let i = 0; i < batchSize; i++) {
      const fd = new FormData();
      const testImage = open(TEST_IMAGE_PATH, 'b');
      fd.append('file', http.file(testImage, `test-${i}.jpg`, 'image/jpeg'));

      requests.push([
        'POST',
        `${BASE_URL}/api/detect`,
        fd.body(),
        {
          headers: {
            'Content-Type': 'multipart/form-data; boundary=' + fd.boundary,
          },
          tags: { name: 'batch_detect' },
        },
      ]);
    }

    const responses = http.batch(requests);

    check(responses, {
      'all requests successful': (res) => res.every(r => r.status === 200),
      'batch processing time < 1s': (res) => {
        const totalTime = res.reduce((acc, r) => acc + r.timings.duration, 0);
        return totalTime < 1000;
      },
    });
  });

  // Scenario 3: API Endpoints Health
  group('API Health Checks', () => {
    const endpoints = [
      { url: '/health', expectedStatus: 200 },
      { url: '/api/models', expectedStatus: 200 },
      { url: '/api/stats', expectedStatus: 200 },
      { url: '/metrics', expectedStatus: 200 },
    ];

    endpoints.forEach(endpoint => {
      const response = http.get(`${BASE_URL}${endpoint.url}`, {
        tags: { name: `health_${endpoint.url}` },
      });

      check(response, {
        [`${endpoint.url} is healthy`]: (r) => r.status === endpoint.expectedStatus,
        [`${endpoint.url} responds quickly`]: (r) => r.timings.duration < 50,
      });
    });
  });

  // Scenario 4: Concurrent Users Simulation
  group('Concurrent Load', () => {
    const concurrentRequests = 10;
    const requests = [];

    for (let i = 0; i < concurrentRequests; i++) {
      requests.push(['GET', `${BASE_URL}/health`]);
    }

    const responses = http.batch(requests);

    check(responses, {
      'handles concurrent load': (res) => res.every(r => r.status === 200),
      'consistent response times': (res) => {
        const times = res.map(r => r.timings.duration);
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const variance = times.every(t => Math.abs(t - avg) < avg * 0.5);
        return variance;
      },
    });
  });

  sleep(1); // Think time between iterations
}

// Teardown function - cleanup and report
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;

  console.log('📊 A++ Performance Test Suite Complete');
  console.log(`⏱️ Total Duration: ${duration} seconds`);
  console.log('✅ Results saved to K6 Cloud (if configured)');

  // Final validation check
  const finalHealth = http.get(`${BASE_URL}/health`);
  check(finalHealth, {
    'API still healthy after load test': (r) => r.status === 200,
  });
}

// Helper function to generate test data
function generateTestData() {
  return {
    timestamp: Date.now(),
    sessionId: Math.random().toString(36).substring(7),
    testImages: [
      'nike-logo.jpg',
      'adidas-logo.jpg',
      'apple-logo.jpg',
      'mixed-logos.jpg',
      'no-logo.jpg',
    ],
  };
}

// Custom function for advanced scenarios
export function advancedScenarios() {
  group('Memory Leak Detection', () => {
    for (let i = 0; i < 100; i++) {
      const response = http.get(`${BASE_URL}/api/stats`);

      if (i > 0 && i % 20 === 0) {
        check(response, {
          'no memory leak detected': (r) => {
            try {
              const stats = JSON.parse(r.body);
              return stats.memoryUsage < 500 * 1024 * 1024; // Less than 500MB
            } catch {
              return false;
            }
          },
        });
      }
    }
  });

  group('Error Recovery', () => {
    // Send malformed request
    const badResponse = http.post(`${BASE_URL}/api/detect`, 'invalid data', {
      headers: { 'Content-Type': 'application/json' },
    });

    check(badResponse, {
      'handles errors gracefully': (r) => r.status === 400 || r.status === 422,
      'returns error message': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.error !== undefined;
        } catch {
          return false;
        }
      },
    });

    // Verify system recovers
    sleep(1);
    const recoveryCheck = http.get(`${BASE_URL}/health`);
    check(recoveryCheck, {
      'system recovers from errors': (r) => r.status === 200,
    });
  });
}