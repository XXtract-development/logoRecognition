/**
 * K6 Load Test for MinIO Storage with CDN
 * A++ Performance Testing - 1000 concurrent users
 *
 * Performance Targets:
 * - Upload Latency: < 100ms (p95)
 * - Download Latency (CDN): < 50ms (p95)
 * - Throughput: > 1000 req/sec
 * - Error Rate: < 0.1%
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';
import { randomBytes } from 'k6/experimental/webcrypto';

// Custom metrics for A++ monitoring
const uploadLatency = new Trend('upload_latency');
const downloadLatency = new Trend('download_latency');
const cdnLatency = new Trend('cdn_latency');
const presignedUrlLatency = new Trend('presigned_url_latency');
const errorRate = new Rate('errors');
const cacheHitRate = new Rate('cache_hits');
const uploadThroughput = new Counter('upload_bytes');
const downloadThroughput = new Counter('download_bytes');

// A++ Performance configuration
export let options = {
    scenarios: {
        // Scenario 1: Gradual ramp-up to test system stability
        warmup: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '1m', target: 100 },   // Warm up to 100 users
                { duration: '2m', target: 100 },   // Stay at 100 users
                { duration: '1m', target: 0 },     // Ramp down
            ],
            gracefulRampDown: '30s',
            startTime: '0s',
        },
        // Scenario 2: Sustained load test
        sustained_load: {
            executor: 'constant-vus',
            vus: 500,
            duration: '5m',
            startTime: '5m',
        },
        // Scenario 3: Spike test to 1000 concurrent users
        spike_test: {
            executor: 'ramping-vus',
            startVUs: 500,
            stages: [
                { duration: '30s', target: 1000 },  // Spike to 1000 users
                { duration: '2m', target: 1000 },   // Stay at 1000 users
                { duration: '30s', target: 500 },   // Back to 500
            ],
            gracefulRampDown: '30s',
            startTime: '11m',
        },
        // Scenario 4: Stress test for breaking point
        stress_test: {
            executor: 'ramping-arrival-rate',
            startRate: 50,
            timeUnit: '1s',
            preAllocatedVUs: 100,
            maxVUs: 2000,
            stages: [
                { duration: '2m', target: 500 },    // Ramp to 500 req/s
                { duration: '3m', target: 1000 },   // Ramp to 1000 req/s
                { duration: '2m', target: 1500 },   // Push to 1500 req/s
                { duration: '1m', target: 0 },      // Ramp down
            ],
            startTime: '15m',
        }
    },
    thresholds: {
        // A++ Performance requirements
        'upload_latency': ['p(95)<100'],           // 95% under 100ms
        'download_latency': ['p(95)<50'],          // 95% under 50ms for direct
        'cdn_latency': ['p(95)<50'],               // 95% under 50ms for CDN
        'presigned_url_latency': ['p(95)<100'],    // 95% under 100ms
        'http_req_duration': ['p(95)<200'],        // Overall request duration
        'http_req_failed': ['rate<0.001'],         // Error rate < 0.1%
        'errors': ['rate<0.001'],                  // Custom error rate < 0.1%
        'cache_hits': ['rate>0.9'],                // Cache hit rate > 90%
    },
};

// Test configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const CDN_URL = __ENV.CDN_URL || 'https://cdn.logorecognition.com';
const MINIO_URL = __ENV.MINIO_URL || 'http://localhost:9000';

// Test data generators
function generateImageData(sizeKB) {
    // Generate random binary data simulating an image
    const bytes = new Uint8Array(sizeKB * 1024);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
}

function generateFileName() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `test_image_${timestamp}_${random}.jpg`;
}

// Main test scenario
export default function () {
    const fileName = generateFileName();
    let uploadedUrl = '';

    // Group 1: Upload Tests
    group('Upload Operations', () => {
        // Test 1: Small file upload (< 5MB)
        group('Small File Upload', () => {
            const smallFile = generateImageData(500); // 500KB
            const fd = new FormData();
            fd.append('file', http.file(smallFile, fileName, 'image/jpeg'));

            const uploadStart = new Date();
            const uploadResponse = http.post(
                `${BASE_URL}/api/v1/storage/upload`,
                fd.body(),
                {
                    headers: {
                        'Content-Type': `multipart/form-data; boundary=${fd.boundary}`,
                        'Authorization': `Bearer ${__ENV.AUTH_TOKEN || 'test-token'}`,
                    },
                    timeout: '10s',
                    tags: { name: 'small_upload' },
                }
            );
            const uploadDuration = new Date() - uploadStart;

            check(uploadResponse, {
                'upload status is 200': (r) => r.status === 200,
                'upload returns URL': (r) => r.json('url') !== undefined,
                'upload returns hash': (r) => r.json('hash') !== undefined,
                'upload under 100ms': () => uploadDuration < 100,
            });

            if (uploadResponse.status === 200) {
                uploadedUrl = uploadResponse.json('url');
                uploadLatency.add(uploadDuration);
                uploadThroughput.add(smallFile.length);
            } else {
                errorRate.add(1);
            }
        });

        // Test 2: Large file multipart upload (> 5MB)
        if (__VU % 10 === 0) { // Only 10% of VUs do large uploads
            group('Large File Multipart Upload', () => {
                const largeFile = generateImageData(10240); // 10MB
                const fd = new FormData();
                fd.append('file', http.file(largeFile, `large_${fileName}`, 'image/jpeg'));

                const uploadStart = new Date();
                const uploadResponse = http.post(
                    `${BASE_URL}/api/v1/storage/upload/multipart`,
                    fd.body(),
                    {
                        headers: {
                            'Content-Type': `multipart/form-data; boundary=${fd.boundary}`,
                            'Authorization': `Bearer ${__ENV.AUTH_TOKEN || 'test-token'}`,
                        },
                        timeout: '30s',
                        tags: { name: 'large_upload' },
                    }
                );
                const uploadDuration = new Date() - uploadStart;

                check(uploadResponse, {
                    'multipart upload successful': (r) => r.status === 200,
                    'multipart returns URL': (r) => r.json('url') !== undefined,
                });

                if (uploadResponse.status === 200) {
                    uploadLatency.add(uploadDuration);
                    uploadThroughput.add(largeFile.length);
                } else {
                    errorRate.add(1);
                }
            });
        }
    });

    // Group 2: Download Tests via CDN
    if (uploadedUrl) {
        group('CDN Download Operations', () => {
            // Test CDN download
            const cdnStart = new Date();
            const cdnResponse = http.get(uploadedUrl, {
                timeout: '10s',
                tags: { name: 'cdn_download' },
            });
            const cdnDuration = new Date() - cdnStart;

            check(cdnResponse, {
                'cdn status is 200': (r) => r.status === 200,
                'cdn response < 50ms': () => cdnDuration < 50,
                'cdn cache hit': (r) => r.headers['X-Cache'] === 'Hit from cloudfront',
                'cdn compression enabled': (r) => r.headers['Content-Encoding'] !== undefined,
            });

            if (cdnResponse.status === 200) {
                cdnLatency.add(cdnDuration);
                downloadThroughput.add(cdnResponse.body.length);

                // Check if it was a cache hit
                if (cdnResponse.headers['X-Cache'] === 'Hit from cloudfront') {
                    cacheHitRate.add(1);
                } else {
                    cacheHitRate.add(0);
                }
            } else {
                errorRate.add(1);
            }
        });
    }

    // Group 3: Presigned URL Tests
    group('Presigned URL Operations', () => {
        const presignedStart = new Date();
        const presignedResponse = http.post(
            `${BASE_URL}/api/v1/storage/presigned-url`,
            JSON.stringify({
                file_key: fileName,
                expiration: 3600,
            }),
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${__ENV.AUTH_TOKEN || 'test-token'}`,
                },
                timeout: '5s',
                tags: { name: 'presigned_url' },
            }
        );
        const presignedDuration = new Date() - presignedStart;

        check(presignedResponse, {
            'presigned URL generated': (r) => r.status === 200,
            'presigned URL valid': (r) => r.json('url') && r.json('url').includes('X-Amz-'),
            'presigned generation < 100ms': () => presignedDuration < 100,
        });

        if (presignedResponse.status === 200) {
            presignedUrlLatency.add(presignedDuration);

            // Test downloading via presigned URL
            const presignedUrl = presignedResponse.json('url');
            const downloadStart = new Date();
            const downloadResponse = http.get(presignedUrl, {
                timeout: '10s',
                tags: { name: 'presigned_download' },
            });
            const downloadDuration = new Date() - downloadStart;

            check(downloadResponse, {
                'presigned download successful': (r) => r.status === 200,
                'presigned download < 100ms': () => downloadDuration < 100,
            });

            if (downloadResponse.status === 200) {
                downloadLatency.add(downloadDuration);
                downloadThroughput.add(downloadResponse.body.length);
            }
        } else {
            errorRate.add(1);
        }
    });

    // Group 4: List Files Operation
    if (__VU % 5 === 0) { // Only 20% of VUs do list operations
        group('List Files Operations', () => {
            const listStart = new Date();
            const listResponse = http.get(
                `${BASE_URL}/api/v1/storage/list?prefix=test_image_&limit=100`,
                {
                    headers: {
                        'Authorization': `Bearer ${__ENV.AUTH_TOKEN || 'test-token'}`,
                    },
                    timeout: '5s',
                    tags: { name: 'list_files' },
                }
            );
            const listDuration = new Date() - listStart;

            check(listResponse, {
                'list files successful': (r) => r.status === 200,
                'list returns array': (r) => Array.isArray(r.json('files')),
                'list operation < 200ms': () => listDuration < 200,
            });

            if (listResponse.status !== 200) {
                errorRate.add(1);
            }
        });
    }

    // Simulate realistic user behavior
    sleep(Math.random() * 2); // Random sleep between 0-2 seconds
}

// Handle test summary
export function handleSummary(data) {
    console.log('Test Summary:');
    console.log(`- Upload Latency (p95): ${data.metrics.upload_latency.values['p(95)']}ms`);
    console.log(`- CDN Latency (p95): ${data.metrics.cdn_latency.values['p(95)']}ms`);
    console.log(`- Cache Hit Rate: ${(data.metrics.cache_hits.values.rate * 100).toFixed(2)}%`);
    console.log(`- Error Rate: ${(data.metrics.errors.values.rate * 100).toFixed(4)}%`);
    console.log(`- Total Upload Throughput: ${(data.metrics.upload_bytes.values.count / 1024 / 1024).toFixed(2)}MB`);
    console.log(`- Total Download Throughput: ${(data.metrics.download_bytes.values.count / 1024 / 1024).toFixed(2)}MB`);

    // Return summary for CI/CD integration
    return {
        'stdout': JSON.stringify(data, null, 2),
        '/tmp/k6-summary.json': JSON.stringify(data, null, 2),
    };
}