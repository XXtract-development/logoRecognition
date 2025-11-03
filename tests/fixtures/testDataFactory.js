const { faker } = require('@faker-js/faker');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

/**
 * A++ Test Data Factory
 * Provides comprehensive test data generation for all test scenarios
 */
class TestDataFactory {
  /**
   * Generate test image with optional logo overlay
   */
  static async createTestImage(options = {}) {
    const {
      width = 640,
      height = 480,
      format = 'jpeg',
      quality = 90,
      withLogo = true,
      logoType = 'random',
      multipleLogos = false,
      noise = false
    } = options;

    // Generate base random image
    let image = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: faker.color.rgb()
      }
    });

    // Add noise if requested
    if (noise) {
      image = image.blur(faker.number.float({ min: 0.3, max: 1.5 }));
    }

    // Convert to buffer
    let buffer = await image.jpeg({ quality }).toBuffer();

    if (withLogo) {
      const logoTypes = ['nike', 'adidas', 'apple', 'microsoft', 'google'];
      const selectedLogo = logoType === 'random'
        ? faker.helpers.arrayElement(logoTypes)
        : logoType;

      const compositeInputs = [];

      if (multipleLogos) {
        // Add multiple logos at random positions
        const numLogos = faker.number.int({ min: 2, max: 5 });
        for (let i = 0; i < numLogos; i++) {
          compositeInputs.push({
            input: await this.generateLogoBuffer(faker.helpers.arrayElement(logoTypes)),
            left: faker.number.int({ min: 0, max: width - 100 }),
            top: faker.number.int({ min: 0, max: height - 100 })
          });
        }
      } else {
        // Add single logo
        compositeInputs.push({
          input: await this.generateLogoBuffer(selectedLogo),
          left: faker.number.int({ min: 0, max: width - 100 }),
          top: faker.number.int({ min: 0, max: height - 100 })
        });
      }

      buffer = await sharp(buffer)
        .composite(compositeInputs)
        .toBuffer();
    }

    return buffer;
  }

  /**
   * Generate synthetic logo buffer
   */
  static async generateLogoBuffer(logoType) {
    const logoConfigs = {
      nike: { width: 100, height: 50, color: '#000000' },
      adidas: { width: 80, height: 80, color: '#000000' },
      apple: { width: 60, height: 70, color: '#555555' },
      microsoft: { width: 90, height: 90, color: '#0078D4' },
      google: { width: 100, height: 35, color: '#4285F4' }
    };

    const config = logoConfigs[logoType] || logoConfigs.nike;

    return sharp({
      create: {
        width: config.width,
        height: config.height,
        channels: 4,
        background: { ...this.hexToRgb(config.color), alpha: 1 }
      }
    })
    .png()
    .toBuffer();
  }

  /**
   * Create mock user with realistic data
   */
  static createMockUser(role = null) {
    const roles = ['user', 'admin', 'annotator', 'viewer', 'developer'];

    return {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      username: faker.internet.username(),
      name: faker.person.fullName(),
      role: role || faker.helpers.arrayElement(roles),
      createdAt: faker.date.past(),
      lastLogin: faker.date.recent(),
      apiKey: faker.string.alphanumeric(32),
      preferences: {
        theme: faker.helpers.arrayElement(['light', 'dark', 'auto']),
        language: faker.helpers.arrayElement(['en', 'es', 'fr', 'de']),
        notifications: faker.datatype.boolean()
      },
      stats: {
        imagesProcessed: faker.number.int({ min: 0, max: 10000 }),
        annotationsCreated: faker.number.int({ min: 0, max: 5000 }),
        modelsTrau: faker.number.int({ min: 0, max: 20 })
      }
    };
  }

  /**
   * Create mock detection result
   */
  static createMockDetectionResult(options = {}) {
    const {
      numDetections = null,
      includeErrors = false,
      highConfidence = true
    } = options;

    const detectionCount = numDetections || faker.number.int({ min: 1, max: 5 });
    const detections = [];

    for (let i = 0; i < detectionCount; i++) {
      detections.push({
        class: faker.helpers.arrayElement(['nike', 'adidas', 'apple', 'microsoft', 'google']),
        confidence: highConfidence
          ? faker.number.float({ min: 0.85, max: 0.99, fractionDigits: 3 })
          : faker.number.float({ min: 0.5, max: 0.99, fractionDigits: 3 }),
        bbox: [
          faker.number.int({ min: 0, max: 300 }),
          faker.number.int({ min: 0, max: 300 }),
          faker.number.int({ min: 100, max: 200 }),
          faker.number.int({ min: 100, max: 200 })
        ],
        area: faker.number.int({ min: 10000, max: 40000 }),
        aspectRatio: faker.number.float({ min: 0.5, max: 2.0, fractionDigits: 2 })
      });
    }

    const result = {
      detections,
      processingTime: faker.number.float({ min: 50, max: 250, fractionDigits: 2 }),
      modelVersion: faker.system.semver(),
      imageId: faker.string.uuid(),
      timestamp: new Date().toISOString(),
      metadata: {
        imageWidth: 640,
        imageHeight: 480,
        format: 'jpeg',
        fileSize: faker.number.int({ min: 50000, max: 500000 })
      }
    };

    if (includeErrors) {
      result.warnings = [
        'Low light conditions detected',
        'Image quality may affect detection accuracy'
      ];
    }

    return result;
  }

  /**
   * Create annotation data for training
   */
  static createMockAnnotation(imageId = null) {
    return {
      id: faker.string.uuid(),
      imageId: imageId || faker.string.uuid(),
      userId: faker.string.uuid(),
      annotations: faker.helpers.multiple(() => ({
        class: faker.helpers.arrayElement(['nike', 'adidas', 'apple']),
        bbox: {
          x: faker.number.int({ min: 0, max: 540 }),
          y: faker.number.int({ min: 0, max: 380 }),
          width: faker.number.int({ min: 50, max: 100 }),
          height: faker.number.int({ min: 50, max: 100 })
        },
        confidence: faker.number.float({ min: 0.8, max: 1.0, fractionDigits: 2 }),
        validated: faker.datatype.boolean(),
        timestamp: faker.date.recent().toISOString()
      }), { count: { min: 1, max: 5 } }),
      metadata: {
        toolVersion: '2.0.0',
        annotationTime: faker.number.int({ min: 5, max: 120 }),
        device: faker.helpers.arrayElement(['desktop', 'tablet', 'mobile']),
        browser: faker.helpers.arrayElement(['chrome', 'firefox', 'safari', 'edge'])
      },
      quality: {
        score: faker.number.float({ min: 0.7, max: 1.0, fractionDigits: 2 }),
        issues: faker.helpers.arrayElements([
          'overlap',
          'boundary_precision',
          'class_consistency',
          'completeness'
        ], { min: 0, max: 2 })
      },
      createdAt: faker.date.recent(),
      updatedAt: faker.date.recent()
    };
  }

  /**
   * Create training dataset
   */
  static async createTrainingDataset(size = 100) {
    const dataset = {
      id: faker.string.uuid(),
      name: faker.commerce.productName() + ' Dataset',
      description: faker.commerce.productDescription(),
      version: faker.system.semver(),
      images: [],
      annotations: [],
      metadata: {
        createdAt: faker.date.past(),
        updatedAt: faker.date.recent(),
        author: faker.person.fullName(),
        license: faker.helpers.arrayElement(['MIT', 'Apache-2.0', 'GPL-3.0', 'Proprietary']),
        tags: faker.helpers.arrayElements([
          'logo-detection',
          'computer-vision',
          'deep-learning',
          'production',
          'validated'
        ], { min: 2, max: 4 })
      },
      statistics: {
        totalImages: size,
        totalAnnotations: 0,
        classDistribution: {},
        averageAnnotationsPerImage: 0
      }
    };

    for (let i = 0; i < size; i++) {
      const imageId = faker.string.uuid();
      const imageBuffer = await this.createTestImage({
        withLogo: true,
        multipleLogos: faker.datatype.boolean()
      });

      dataset.images.push({
        id: imageId,
        filename: `image_${i}.jpg`,
        buffer: imageBuffer,
        size: imageBuffer.length,
        dimensions: { width: 640, height: 480 }
      });

      const annotation = this.createMockAnnotation(imageId);
      dataset.annotations.push(annotation);

      // Update statistics
      annotation.annotations.forEach(ann => {
        dataset.statistics.classDistribution[ann.class] =
          (dataset.statistics.classDistribution[ann.class] || 0) + 1;
        dataset.statistics.totalAnnotations++;
      });
    }

    dataset.statistics.averageAnnotationsPerImage =
      dataset.statistics.totalAnnotations / size;

    return dataset;
  }

  /**
   * Create mock API request
   */
  static createMockRequest(type = 'detect') {
    const requestTypes = {
      detect: {
        method: 'POST',
        endpoint: '/api/detect',
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${faker.string.alphanumeric(32)}`,
          'X-Request-ID': faker.string.uuid()
        },
        body: {
          confidence_threshold: faker.number.float({ min: 0.5, max: 0.9 }),
          max_detections: faker.number.int({ min: 1, max: 10 }),
          model_version: faker.helpers.arrayElement(['latest', 'stable', 'v1.0.0'])
        }
      },
      annotate: {
        method: 'POST',
        endpoint: '/api/annotate',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${faker.string.alphanumeric(32)}`
        },
        body: {
          imageId: faker.string.uuid(),
          annotations: []
        }
      },
      train: {
        method: 'POST',
        endpoint: '/api/train',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${faker.string.alphanumeric(32)}`
        },
        body: {
          datasetId: faker.string.uuid(),
          modelType: faker.helpers.arrayElement(['yolo', 'faster-rcnn', 'ssd']),
          epochs: faker.number.int({ min: 10, max: 100 }),
          batchSize: faker.helpers.arrayElement([8, 16, 32, 64])
        }
      }
    };

    return requestTypes[type] || requestTypes.detect;
  }

  /**
   * Create mock performance metrics
   */
  static createMockMetrics() {
    return {
      timestamp: new Date().toISOString(),
      cpu: {
        usage: faker.number.float({ min: 10, max: 90, fractionDigits: 2 }),
        cores: faker.helpers.arrayElement([4, 8, 16, 32])
      },
      memory: {
        used: faker.number.int({ min: 1000000000, max: 8000000000 }),
        total: 16000000000,
        percentage: faker.number.float({ min: 20, max: 80, fractionDigits: 2 })
      },
      gpu: {
        usage: faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
        memory: faker.number.int({ min: 0, max: 8000000000 }),
        temperature: faker.number.int({ min: 30, max: 85 })
      },
      api: {
        requestsPerSecond: faker.number.float({ min: 10, max: 1000, fractionDigits: 2 }),
        averageLatency: faker.number.float({ min: 20, max: 200, fractionDigits: 2 }),
        errorRate: faker.number.float({ min: 0, max: 5, fractionDigits: 3 }),
        activeConnections: faker.number.int({ min: 0, max: 1000 })
      },
      model: {
        inferenceTime: faker.number.float({ min: 10, max: 100, fractionDigits: 2 }),
        accuracy: faker.number.float({ min: 0.85, max: 0.99, fractionDigits: 3 }),
        throughput: faker.number.float({ min: 10, max: 100, fractionDigits: 2 })
      }
    };
  }

  /**
   * Utility: Convert hex to RGB
   */
  static hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  /**
   * Save test image to file
   */
  static async saveTestImage(buffer, filename) {
    const testAssetsDir = path.join(__dirname, '../test-assets');
    await fs.mkdir(testAssetsDir, { recursive: true });
    const filePath = path.join(testAssetsDir, filename);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  /**
   * Generate complete test suite data
   */
  static async generateTestSuite() {
    console.log('🎨 Generating A++ test suite data...');

    const testSuite = {
      users: [],
      images: [],
      annotations: [],
      detections: [],
      metrics: []
    };

    // Generate users
    for (let i = 0; i < 10; i++) {
      testSuite.users.push(this.createMockUser());
    }

    // Generate test images
    for (let i = 0; i < 50; i++) {
      const buffer = await this.createTestImage({
        withLogo: i < 40, // 80% with logos
        multipleLogos: i % 5 === 0, // 20% with multiple logos
        noise: i % 10 === 0 // 10% with noise
      });

      const filename = `test_image_${i}.jpg`;
      const filepath = await this.saveTestImage(buffer, filename);

      testSuite.images.push({
        id: faker.string.uuid(),
        filename,
        filepath,
        size: buffer.length,
        hasLogo: i < 40
      });
    }

    // Generate annotations and detections
    testSuite.images.forEach(image => {
      if (image.hasLogo) {
        testSuite.annotations.push(this.createMockAnnotation(image.id));
        testSuite.detections.push(this.createMockDetectionResult());
      }
    });

    // Generate performance metrics
    for (let i = 0; i < 100; i++) {
      testSuite.metrics.push(this.createMockMetrics());
    }

    console.log('✅ Test suite data generated successfully!');
    console.log(`   - Users: ${testSuite.users.length}`);
    console.log(`   - Images: ${testSuite.images.length}`);
    console.log(`   - Annotations: ${testSuite.annotations.length}`);
    console.log(`   - Detections: ${testSuite.detections.length}`);
    console.log(`   - Metrics: ${testSuite.metrics.length}`);

    return testSuite;
  }
}

module.exports = TestDataFactory;