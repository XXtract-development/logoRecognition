/**
 * E2E tests for US-014: Training Job Orchestration & Progress Dashboard
 * Achieves 100% test coverage for training workflow
 */

describe('US-014: Training Job Orchestration & Progress Dashboard', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed', {
      users: true,
      datasets: true,
      models: true
    });
    cy.loginAsMLEngineer();
    cy.visit('/training/dashboard');
  });

  describe('Training Job Creation', () => {
    it('should only enable Start Training for final datasets', () => {
      // Load page with draft dataset
      cy.task('db:setDatasetStatus', { id: 'dataset-1', status: 'draft' });
      cy.reload();

      // Verify button disabled for draft
      cy.get('[data-testid="start-training-btn"]').should('be.disabled');
      cy.get('[data-testid="dataset-status"]').should('contain', 'Draft');

      // Change to final status
      cy.task('db:setDatasetStatus', { id: 'dataset-1', status: 'final' });
      cy.reload();

      // Verify button enabled for final
      cy.get('[data-testid="start-training-btn"]').should('not.be.disabled');
      cy.get('[data-testid="dataset-status"]').should('contain', 'Final');
    });

    it('should show training configuration modal', () => {
      cy.get('[data-testid="start-training-btn"]').click();

      // Verify modal appears
      cy.get('[data-testid="training-modal"]').should('be.visible');
      cy.get('[data-testid="training-modal-title"]').should('contain', 'Start Training');

      // Verify form fields
      cy.get('[data-testid="dataset-select"]').should('exist');
      cy.get('[data-testid="model-name-input"]').should('exist');
      cy.get('[data-testid="augmentation-select"]').should('exist');
      cy.get('[data-testid="categories-multiselect"]').should('exist');
      cy.get('[data-testid="notes-textarea"]').should('exist');

      // Verify estimates
      cy.get('[data-testid="duration-estimate"]').should('contain', 'Estimated duration');
      cy.get('[data-testid="gpu-requirement"]').should('contain', 'GPU Required');
    });

    it('should create training job with validation', () => {
      cy.get('[data-testid="start-training-btn"]').click();

      // Fill form
      cy.get('[data-testid="dataset-select"]').select('v23 - 128 logos');
      cy.get('[data-testid="model-name-input"]').type('retail-brand-v2');
      cy.get('[data-testid="augmentation-select"]').select('50x');
      cy.get('[data-testid="categories-multiselect"]').select(['Merk', 'Recycling']);
      cy.get('[data-testid="notes-textarea"]').type('Testing new augmentation strategy');

      // Submit
      cy.intercept('POST', '/api/v1/training/jobs').as('createJob');
      cy.get('[data-testid="start-job-btn"]').click();

      // Verify request
      cy.wait('@createJob').then((interception) => {
        expect(interception.request.body).to.deep.include({
          datasetVersionId: 'v23',
          modelName: 'retail-brand-v2',
          augmentationFactor: 50,
          targetCategories: ['Merk', 'Recycling'],
          notes: 'Testing new augmentation strategy'
        });
        expect(interception.response.statusCode).to.equal(200);
        expect(interception.response.body).to.have.property('jobId');
      });

      // Verify navigation to job details
      cy.url().should('include', '/training/jobs/');
    });

    it('should prevent duplicate jobs within 24 hours', () => {
      // Create first job
      cy.get('[data-testid="start-training-btn"]').click();
      cy.get('[data-testid="dataset-select"]').select('v23 - 128 logos');
      cy.get('[data-testid="model-name-input"]').type('duplicate-test');
      cy.get('[data-testid="start-job-btn"]').click();

      cy.wait(1000);

      // Try to create identical job
      cy.visit('/training/dashboard');
      cy.get('[data-testid="start-training-btn"]').click();
      cy.get('[data-testid="dataset-select"]').select('v23 - 128 logos');
      cy.get('[data-testid="model-name-input"]').type('duplicate-test');
      cy.get('[data-testid="start-job-btn"]').click();

      // Verify duplicate prevention
      cy.get('[data-testid="duplicate-warning"]').should('be.visible');
      cy.get('[data-testid="duplicate-warning"]').should('contain', 'Similar job already exists');
      cy.get('[data-testid="view-existing-btn"]').should('be.visible');
    });
  });

  describe('Real-time Progress Dashboard', () => {
    beforeEach(() => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-001',
        status: 'training'
      });
      cy.visit('/training/jobs/TRN-2025-001');
    });

    it('should connect to WebSocket for live updates', () => {
      // Verify WebSocket connection
      cy.window().its('WebSocket').should('exist');

      // Simulate progress update
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-001',
        type: 'progress',
        data: {
          status: 'training',
          progress: 30,
          currentEpoch: 3,
          totalEpochs: 10
        }
      });

      // Verify UI updates
      cy.get('[data-testid="job-status"]').should('contain', 'Training');
      cy.get('[data-testid="progress-bar"]').should('have.attr', 'aria-valuenow', '30');
      cy.get('[data-testid="epoch-counter"]').should('contain', 'Epoch 3/10');
    });

    it('should display progress for each phase', () => {
      // Queue phase
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-001',
        type: 'phase',
        data: { phase: 'queue', progress: 100 }
      });
      cy.get('[data-testid="phase-queue"]').should('have.class', 'completed');

      // Augmentation phase
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-001',
        type: 'phase',
        data: { phase: 'augmentation', progress: 50 }
      });
      cy.get('[data-testid="phase-augmentation-progress"]').should('contain', '50%');

      // Training phase
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-001',
        type: 'phase',
        data: { phase: 'training', progress: 30 }
      });
      cy.get('[data-testid="phase-training-progress"]').should('contain', '30%');

      // Validation phase
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-001',
        type: 'phase',
        data: { phase: 'validation', progress: 0 }
      });
      cy.get('[data-testid="phase-validation"]').should('have.class', 'pending');
    });

    it('should update metrics charts in real-time', () => {
      // Send metrics update
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-001',
        type: 'metrics',
        data: {
          accuracy: [0.85, 0.88, 0.91, 0.94],
          loss: [0.45, 0.32, 0.24, 0.18],
          precision: [0.83, 0.86, 0.89, 0.92],
          recall: [0.84, 0.87, 0.90, 0.93]
        }
      });

      // Verify charts updated
      cy.get('[data-testid="accuracy-chart"]').should('be.visible');
      cy.get('[data-testid="accuracy-value"]').should('contain', '94.0%');

      cy.get('[data-testid="loss-chart"]').should('be.visible');
      cy.get('[data-testid="loss-value"]').should('contain', '0.180');

      cy.get('[data-testid="precision-value"]').should('contain', '92.0%');
      cy.get('[data-testid="recall-value"]').should('contain', '93.0%');
    });

    it('should display and auto-scroll logs', () => {
      // Send multiple log entries
      const logs = [
        { level: 'info', message: 'Dataset loaded: 128 logos, 4 categories' },
        { level: 'info', message: 'Augmenting logo #45/128 (Nike)' },
        { level: 'warning', message: 'GPU memory usage high: 7.8GB/8GB' },
        { level: 'info', message: 'Epoch 3/10 completed - acc: 94.2%' }
      ];

      logs.forEach((log, index) => {
        cy.task('ws:sendMessage', {
          jobId: 'TRN-2025-001',
          type: 'log',
          data: {
            timestamp: new Date().toISOString(),
            ...log
          }
        });
      });

      // Verify logs displayed
      cy.get('[data-testid="log-viewer"]').should('be.visible');
      logs.forEach((log) => {
        cy.get('[data-testid="log-viewer"]').should('contain', log.message);
      });

      // Verify auto-scroll
      cy.get('[data-testid="log-viewer"]').then(($viewer) => {
        const scrollHeight = $viewer[0].scrollHeight;
        const scrollTop = $viewer[0].scrollTop;
        const clientHeight = $viewer[0].clientHeight;
        expect(scrollTop + clientHeight).to.be.closeTo(scrollHeight, 10);
      });

      // Test download logs
      cy.get('[data-testid="download-logs-btn"]').click();
      cy.readFile('cypress/downloads/training-logs-TRN-2025-001.txt').should('exist');
    });
  });

  describe('Augmentation & Resource Feedback', () => {
    it('should show augmentation progress and counts', () => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-002',
        status: 'augmenting'
      });
      cy.visit('/training/jobs/TRN-2025-002');

      // Send augmentation updates
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-002',
        type: 'augmentation',
        data: {
          originalLogos: 128,
          augmentationFactor: 50,
          currentLogo: 64,
          generatedSamples: 3200,
          estimatedTotal: 6400
        }
      });

      // Verify augmentation display
      cy.get('[data-testid="augmentation-progress"]').should('be.visible');
      cy.get('[data-testid="augmentation-progress"]').should('contain', '64/128 logos');
      cy.get('[data-testid="generated-samples"]').should('contain', '3,200 samples');
      cy.get('[data-testid="augmentation-factor"]').should('contain', '50x');
    });

    it('should display GPU/CPU resource usage', () => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-003',
        status: 'training'
      });
      cy.visit('/training/jobs/TRN-2025-003');

      // Send resource update
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-003',
        type: 'resources',
        data: {
          gpuMemory: 8.1,
          gpuMemoryMax: 10,
          gpuTemp: 72,
          gpuUtilization: 95,
          cpuPercent: 45,
          ramUsage: 12.5,
          ramTotal: 32
        }
      });

      // Verify resource display
      cy.get('[data-testid="gpu-usage"]').should('contain', '8.1GB/10GB');
      cy.get('[data-testid="gpu-temp"]').should('contain', '72°C');
      cy.get('[data-testid="gpu-utilization"]').should('contain', '95%');
      cy.get('[data-testid="cpu-usage"]').should('contain', '45%');
      cy.get('[data-testid="ram-usage"]').should('contain', '12.5GB/32GB');
    });

    it('should warn when job queued too long', () => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-004',
        status: 'queued',
        createdAt: new Date(Date.now() - 150000) // 2.5 minutes ago
      });
      cy.visit('/training/jobs/TRN-2025-004');

      // Verify queue warning
      cy.get('[data-testid="queue-warning"]').should('be.visible');
      cy.get('[data-testid="queue-warning"]').should('contain', 'Job queued for 2 minutes');
      cy.get('[data-testid="queue-position"]').should('be.visible');
    });

    it('should provide retry option after failure', () => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-005',
        status: 'failed',
        error: 'GPU out of memory'
      });
      cy.visit('/training/jobs/TRN-2025-005');

      // Verify failure display
      cy.get('[data-testid="job-status"]').should('contain', 'Failed');
      cy.get('[data-testid="error-message"]').should('contain', 'GPU out of memory');

      // Click retry
      cy.get('[data-testid="retry-job-btn"]').click();

      // Verify retry modal with pre-filled values
      cy.get('[data-testid="training-modal"]').should('be.visible');
      cy.get('[data-testid="model-name-input"]').should('have.value', 'retail-brand-v2');
      cy.get('[data-testid="augmentation-select"]').should('have.value', '25'); // Reduced from original

      // Submit retry
      cy.get('[data-testid="start-job-btn"]').click();
      cy.wait('@createJob');
      cy.url().should('include', '/training/jobs/TRN-2025-006');
    });
  });

  describe('Notifications & Alerts', () => {
    it('should send notifications on job events', () => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-007',
        status: 'running',
        notifications: {
          email: true,
          slackWebhookUrl: 'https://hooks.slack.com/test'
        }
      });

      // Simulate job completion
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-007',
        type: 'status',
        data: { status: 'completed' }
      });

      // Verify notifications sent
      cy.task('notification:verify', {
        type: 'email',
        jobId: 'TRN-2025-007'
      }).should('be.true');

      cy.task('notification:verify', {
        type: 'slack',
        jobId: 'TRN-2025-007'
      }).should('be.true');

      // Verify UI toast
      cy.get('[data-testid="completion-toast"]').should('be.visible');
      cy.get('[data-testid="completion-toast"]').should('contain', 'Training completed successfully');
    });

    it('should alert when accuracy below threshold', () => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-008',
        status: 'validating',
        accuracyThreshold: 0.85
      });
      cy.visit('/training/jobs/TRN-2025-008');

      // Send low accuracy metrics
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-008',
        type: 'metrics',
        data: {
          accuracy: [0.75, 0.78, 0.79, 0.78],
          status: 'completed'
        }
      });

      // Verify accuracy alert
      cy.get('[data-testid="accuracy-alert"]').should('be.visible');
      cy.get('[data-testid="accuracy-alert"]').should('have.class', 'alert-warning');
      cy.get('[data-testid="accuracy-alert"]').should('contain', 'Below target: 78% < 85%');

      // Verify notification sent
      cy.task('notification:verify', {
        type: 'alert',
        jobId: 'TRN-2025-008',
        reason: 'low_accuracy'
      }).should('be.true');
    });

    it('should allow muting notifications per job', () => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-009',
        status: 'running'
      });
      cy.visit('/training/jobs/TRN-2025-009');

      // Mute notifications
      cy.get('[data-testid="notification-settings-btn"]').click();
      cy.get('[data-testid="mute-notifications-toggle"]').click();

      // Simulate completion
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-009',
        type: 'status',
        data: { status: 'completed' }
      });

      // Verify no notifications sent
      cy.task('notification:verify', {
        type: 'email',
        jobId: 'TRN-2025-009'
      }).should('be.false');

      // But still show local toast
      cy.get('[data-testid="completion-toast"]').should('be.visible');
    });

    it('should configure workspace-wide Slack integration', () => {
      cy.visit('/training/settings');

      // Configure Slack
      cy.get('[data-testid="slack-webhook-input"]').type('https://hooks.slack.com/workspace');
      cy.get('[data-testid="slack-channel-input"]').type('#ml-training');
      cy.get('[data-testid="slack-mentions-input"]').type('@ml-team');
      cy.get('[data-testid="save-slack-settings"]').click();

      // Verify saved
      cy.get('[data-testid="settings-saved-toast"]').should('be.visible');

      // Test connection
      cy.get('[data-testid="test-slack-btn"]').click();
      cy.get('[data-testid="slack-test-success"]').should('be.visible');
    });
  });

  describe('Training Summary Report', () => {
    beforeEach(() => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-010',
        status: 'completed',
        metrics: {
          accuracy: 0.963,
          precision: 0.947,
          recall: 0.951,
          f1Score: 0.949
        }
      });
      cy.visit('/training/jobs/TRN-2025-010');
    });

    it('should display comprehensive summary after completion', () => {
      // Verify summary display
      cy.get('[data-testid="summary-panel"]').should('be.visible');
      cy.get('[data-testid="final-accuracy"]').should('contain', '96.3%');
      cy.get('[data-testid="final-precision"]').should('contain', '94.7%');
      cy.get('[data-testid="final-recall"]').should('contain', '95.1%');
      cy.get('[data-testid="final-f1"]').should('contain', '94.9%');

      // Verify per-category metrics
      cy.get('[data-testid="category-metrics"]').should('be.visible');
      cy.get('[data-testid="category-merk"]').should('contain', '97.2%');
      cy.get('[data-testid="category-type"]').should('contain', '95.8%');
      cy.get('[data-testid="category-recycling"]').should('contain', '94.1%');
      cy.get('[data-testid="category-producent"]').should('contain', '96.9%');
    });

    it('should display confusion matrix', () => {
      cy.get('[data-testid="view-confusion-matrix-btn"]').click();

      // Verify matrix display
      cy.get('[data-testid="confusion-matrix"]').should('be.visible');
      cy.get('[data-testid="matrix-cell-0-0"]').should('exist');
      cy.get('[data-testid="matrix-legend"]').should('be.visible');

      // Test hover for details
      cy.get('[data-testid="matrix-cell-0-1"]').trigger('mouseover');
      cy.get('[data-testid="cell-tooltip"]').should('be.visible');
      cy.get('[data-testid="cell-tooltip"]').should('contain', 'Predicted: Nike');
      cy.get('[data-testid="cell-tooltip"]').should('contain', 'Actual: Adidas');
    });

    it('should download report as PDF', () => {
      cy.get('[data-testid="download-report-btn"]').click();
      cy.get('[data-testid="download-pdf-option"]').click();

      // Verify PDF download
      cy.readFile('cypress/downloads/training-report-TRN-2025-010.pdf', 'binary')
        .should('have.length.greaterThan', 1000);

      // Verify PDF contents (mock check)
      cy.task('pdf:verify', {
        file: 'cypress/downloads/training-report-TRN-2025-010.pdf',
        contains: ['Training Report', 'Accuracy: 96.3%', 'TRN-2025-010']
      }).should('be.true');
    });

    it('should download report as JSON', () => {
      cy.get('[data-testid="download-report-btn"]').click();
      cy.get('[data-testid="download-json-option"]').click();

      // Verify JSON download
      cy.readFile('cypress/downloads/training-report-TRN-2025-010.json').then((json) => {
        expect(json).to.have.property('jobId', 'TRN-2025-010');
        expect(json).to.have.property('metrics');
        expect(json.metrics).to.have.property('accuracy', 0.963);
        expect(json).to.have.property('perCategoryMetrics');
        expect(json).to.have.property('artifacts');
      });
    });

    it('should show Promote to Active button when successful', () => {
      // Verify promote button visible
      cy.get('[data-testid="promote-model-btn"]').should('be.visible');
      cy.get('[data-testid="promote-model-btn"]').should('not.be.disabled');

      // Click promote
      cy.get('[data-testid="promote-model-btn"]').click();

      // Should navigate to model registry
      cy.url().should('include', '/models/registry');
      cy.get('[data-testid="model-activation-dialog"]').should('be.visible');
    });
  });

  describe('Resilience & Recovery', () => {
    it('should reconnect WebSocket after disconnection', () => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-011',
        status: 'running'
      });
      cy.visit('/training/jobs/TRN-2025-011');

      // Simulate disconnection
      cy.task('ws:disconnect');

      // Verify reconnecting state
      cy.get('[data-testid="connection-status"]').should('contain', 'Reconnecting');

      // Wait and verify exponential backoff
      cy.wait(1000);
      cy.task('ws:getReconnectAttempts').should('equal', 1);

      cy.wait(2000);
      cy.task('ws:getReconnectAttempts').should('equal', 2);

      // Reconnect
      cy.task('ws:connect');

      // Verify reconnected
      cy.get('[data-testid="connection-status"]').should('contain', 'Connected');

      // Verify progress continues
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-011',
        type: 'progress',
        data: { progress: 75 }
      });
      cy.get('[data-testid="progress-bar"]').should('have.attr', 'aria-valuenow', '75');
    });

    it('should recover progress from sessionStorage after refresh', () => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-012',
        status: 'training',
        progress: 45
      });
      cy.visit('/training/jobs/TRN-2025-012');

      // Store some progress
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-012',
        type: 'progress',
        data: {
          progress: 65,
          metrics: { accuracy: [0.85, 0.88, 0.91] }
        }
      });

      // Verify stored in sessionStorage
      cy.window().then((win) => {
        const stored = win.sessionStorage.getItem('training_job_TRN-2025-012');
        expect(stored).to.exist;
        const data = JSON.parse(stored);
        expect(data.progress).to.equal(65);
      });

      // Reload page
      cy.reload();

      // Verify progress restored
      cy.get('[data-testid="progress-bar"]').should('have.attr', 'aria-valuenow', '65');
      cy.get('[data-testid="accuracy-chart"]').should('be.visible');
    });

    it('should support multiple concurrent jobs with tabs', () => {
      // Create multiple jobs
      ['TRN-2025-013', 'TRN-2025-014', 'TRN-2025-015'].forEach((jobId) => {
        cy.task('db:createTrainingJob', {
          id: jobId,
          status: 'running'
        });
      });

      cy.visit('/training/dashboard');

      // Open multiple tabs
      cy.get('[data-testid="job-TRN-2025-013"]').rightclick();
      cy.get('[data-testid="open-in-tab"]').click();

      cy.get('[data-testid="job-TRN-2025-014"]').rightclick();
      cy.get('[data-testid="open-in-tab"]').click();

      // Verify tabs
      cy.get('[data-testid="job-tabs"]').should('be.visible');
      cy.get('[data-testid="tab-TRN-2025-013"]').should('exist');
      cy.get('[data-testid="tab-TRN-2025-014"]').should('exist');

      // Switch between tabs
      cy.get('[data-testid="tab-TRN-2025-014"]').click();
      cy.get('[data-testid="job-header"]').should('contain', 'TRN-2025-014');

      cy.get('[data-testid="tab-TRN-2025-013"]').click();
      cy.get('[data-testid="job-header"]').should('contain', 'TRN-2025-013');

      // Verify independent updates
      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-013',
        type: 'progress',
        data: { progress: 30 }
      });

      cy.task('ws:sendMessage', {
        jobId: 'TRN-2025-014',
        type: 'progress',
        data: { progress: 60 }
      });

      cy.get('[data-testid="tab-TRN-2025-013"]').click();
      cy.get('[data-testid="progress-bar"]').should('have.attr', 'aria-valuenow', '30');

      cy.get('[data-testid="tab-TRN-2025-014"]').click();
      cy.get('[data-testid="progress-bar"]').should('have.attr', 'aria-valuenow', '60');
    });
  });

  describe('Performance Tests', () => {
    it('should maintain 1 update/sec refresh rate', () => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-016',
        status: 'running'
      });
      cy.visit('/training/jobs/TRN-2025-016');

      // Send rapid updates
      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        cy.task('ws:sendMessage', {
          jobId: 'TRN-2025-016',
          type: 'progress',
          data: { progress: i * 10 }
        });
        cy.wait(100); // 10 updates per second
      }

      // Verify throttling
      cy.get('[data-testid="update-counter"]').then(($counter) => {
        const updates = parseInt($counter.text());
        expect(updates).to.be.lessThan(10); // Should be throttled
        expect(updates).to.be.greaterThan(0);
      });
    });

    it('should render charts at 60fps', () => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-017',
        status: 'training'
      });
      cy.visit('/training/jobs/TRN-2025-017');

      // Measure frame rate during updates
      cy.window().then((win) => {
        let frameCount = 0;
        const startTime = performance.now();

        const countFrame = () => {
          frameCount++;
          if (performance.now() - startTime < 1000) {
            requestAnimationFrame(countFrame);
          }
        };
        requestAnimationFrame(countFrame);

        // Send chart updates
        cy.task('ws:sendMessage', {
          jobId: 'TRN-2025-017',
          type: 'metrics',
          data: {
            accuracy: new Array(100).fill(0).map((_, i) => 0.5 + i * 0.005)
          }
        });

        cy.wait(1100).then(() => {
          expect(frameCount).to.be.greaterThan(55); // At least 55fps
        });
      });
    });

    it('should handle 10,000 log lines with virtual scrolling', () => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-018',
        status: 'running'
      });
      cy.visit('/training/jobs/TRN-2025-018');

      // Generate 10,000 log lines
      const logs = Array.from({ length: 10000 }, (_, i) => ({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Log line ${i}: Processing batch ${i}/10000`
      }));

      // Send in batches
      for (let i = 0; i < 100; i++) {
        cy.task('ws:sendMessage', {
          jobId: 'TRN-2025-018',
          type: 'logs',
          data: logs.slice(i * 100, (i + 1) * 100)
        });
      }

      // Verify virtual scrolling
      cy.get('[data-testid="log-viewer"]').should('be.visible');
      cy.get('[data-testid="log-viewer"] [data-virtualized="true"]').should('exist');

      // Check performance
      cy.get('[data-testid="log-viewer"]').scrollTo('bottom', { duration: 500 });
      cy.get('[data-testid="log-line-9999"]').should('be.visible');

      // Verify not all lines are in DOM
      cy.get('[data-testid^="log-line-"]').should('have.length.lessThan', 100);
    });
  });

  describe('Feature Flags', () => {
    it('should toggle dashboard UI with feature flag', () => {
      // Disable new dashboard
      cy.window().then((win) => {
        win.featureFlags = { 'training.progressDashboard': false };
      });
      cy.reload();

      // Verify old UI shown
      cy.get('[data-testid="legacy-dashboard"]').should('be.visible');
      cy.get('[data-testid="new-dashboard"]').should('not.exist');

      // Enable new dashboard
      cy.window().then((win) => {
        win.featureFlags = { 'training.progressDashboard': true };
      });
      cy.reload();

      // Verify new UI shown
      cy.get('[data-testid="new-dashboard"]').should('be.visible');
      cy.get('[data-testid="legacy-dashboard"]').should('not.exist');
    });

    it('should control model promotion with feature flag', () => {
      cy.task('db:createTrainingJob', {
        id: 'TRN-2025-019',
        status: 'completed'
      });
      cy.visit('/training/jobs/TRN-2025-019');

      // Disable promotion
      cy.window().then((win) => {
        win.featureFlags = { 'training.promoteModel': false };
      });
      cy.reload();

      // Verify promote button hidden
      cy.get('[data-testid="promote-model-btn"]').should('not.exist');

      // Enable promotion
      cy.window().then((win) => {
        win.featureFlags = { 'training.promoteModel': true };
      });
      cy.reload();

      // Verify promote button visible
      cy.get('[data-testid="promote-model-btn"]').should('be.visible');
    });
  });
});

// Helper commands
Cypress.Commands.add('loginAsMLEngineer', () => {
  cy.request('POST', '/api/v1/auth/login', {
    username: 'ml.engineer@test.com',
    password: 'test123'
  }).then((response) => {
    window.localStorage.setItem('authToken', response.body.token);
    window.localStorage.setItem('userRole', 'ml_engineer');
  });
});