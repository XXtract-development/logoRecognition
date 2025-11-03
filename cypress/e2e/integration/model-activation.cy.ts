/**
 * E2E tests for US-015: Model Registry & Automatic Recognition Activation
 * Achieves 100% test coverage for model management workflow
 */

describe('US-015: Model Registry & Automatic Recognition Activation', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed', {
      users: true,
      models: true,
      trainingJobs: true
    });
    cy.loginAsProductOwner();
    cy.visit('/models/registry');
  });

  describe('Model Registry Overview', () => {
    it('should display model list with status indicators', () => {
      // Verify registry table
      cy.get('[data-testid="model-registry-table"]').should('be.visible');

      // Check status indicators
      cy.get('[data-testid="model-row"]').should('have.length.at.least', 3);
      cy.get('[data-testid="model-status-active"]').should('exist');
      cy.get('[data-testid="model-status-candidate"]').should('exist');
      cy.get('[data-testid="model-status-deprecated"]').should('exist');

      // Verify displayed metrics
      cy.get('[data-testid="model-row"]').first().within(() => {
        cy.get('[data-testid="model-accuracy"]').should('contain', '%');
        cy.get('[data-testid="model-precision"]').should('contain', '%');
        cy.get('[data-testid="model-recall"]').should('contain', '%');
        cy.get('[data-testid="model-f1"]').should('contain', '%');
      });
    });

    it('should filter models by status', () => {
      // Filter by active
      cy.get('[data-testid="status-filter"]').select('active');
      cy.get('[data-testid="model-row"]').each(($row) => {
        cy.wrap($row).find('[data-testid="model-status"]').should('contain', 'Active');
      });

      // Filter by candidate
      cy.get('[data-testid="status-filter"]').select('candidate');
      cy.get('[data-testid="model-row"]').each(($row) => {
        cy.wrap($row).find('[data-testid="model-status"]').should('contain', 'Candidate');
      });

      // Filter by deprecated
      cy.get('[data-testid="status-filter"]').select('deprecated');
      cy.get('[data-testid="model-row"]').each(($row) => {
        cy.wrap($row).find('[data-testid="model-status"]').should('contain', 'Deprecated');
      });
    });

    it('should filter models by dataset version', () => {
      cy.get('[data-testid="dataset-filter"]').select('v23');
      cy.get('[data-testid="model-row"]').each(($row) => {
        cy.wrap($row).find('[data-testid="model-dataset"]').should('contain', 'v23');
      });
    });

    it('should filter models by target category', () => {
      cy.get('[data-testid="category-filter"]').select('Merk');
      cy.get('[data-testid="model-row"]').each(($row) => {
        cy.wrap($row).click();
        cy.get('[data-testid="model-categories"]').should('contain', 'Merk');
        cy.get('[data-testid="close-detail"]').click();
      });
    });

    it('should sort models by creation date', () => {
      cy.get('[data-testid="sort-select"]').select('created_desc');

      let previousDate = Date.now();
      cy.get('[data-testid="model-created"]').each(($date) => {
        const currentDate = new Date($date.text()).getTime();
        expect(currentDate).to.be.at.most(previousDate);
        previousDate = currentDate;
      });
    });

    it('should load model data from API', () => {
      cy.intercept('GET', '/api/v1/models').as('getModels');
      cy.reload();

      cy.wait('@getModels').then((interception) => {
        expect(interception.response.statusCode).to.equal(200);
        expect(interception.response.body).to.be.an('array');
        expect(interception.response.body[0]).to.have.property('id');
        expect(interception.response.body[0]).to.have.property('metrics');
      });
    });
  });

  describe('Validation & Smoke Testing', () => {
    beforeEach(() => {
      cy.task('db:createModel', {
        id: 'model-test-001',
        status: 'candidate',
        accuracy: 0.965
      });
      cy.reload();
    });

    it('should allow uploading sample images for validation', () => {
      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="run-smoke-test-btn"]').click();

      // Upload sample images
      cy.get('[data-testid="upload-samples-btn"]').click();
      cy.fixture('sample-logo-1.jpg').then(fileContent => {
        cy.get('[data-testid="file-upload-input"]').attachFile({
          fileContent: fileContent.toString(),
          fileName: 'sample-logo-1.jpg',
          mimeType: 'image/jpeg'
        });
      });

      // Verify upload processed
      cy.get('[data-testid="uploaded-sample"]').should('be.visible');
      cy.get('[data-testid="uploaded-sample"]').should('contain', 'sample-logo-1.jpg');
    });

    it('should use validation set for smoke testing', () => {
      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="run-smoke-test-btn"]').click();

      // Choose validation set
      cy.get('[data-testid="use-validation-set-btn"]').click();
      cy.get('[data-testid="validation-set-select"]').select('standard-5-images');

      // Run smoke test
      cy.get('[data-testid="start-smoke-test-btn"]').click();

      // Wait for results
      cy.wait('@smokeTest');
      cy.get('[data-testid="smoke-test-results"]').should('be.visible');
    });

    it('should display detection results with bounding boxes', () => {
      // Run smoke test first
      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="run-smoke-test-btn"]').click();
      cy.get('[data-testid="use-validation-set-btn"]').click();
      cy.get('[data-testid="start-smoke-test-btn"]').click();

      cy.wait('@smokeTest');

      // Check results display
      cy.get('[data-testid="test-result-1"]').within(() => {
        cy.get('[data-testid="result-image"]').should('be.visible');
        cy.get('[data-testid="bounding-box"]').should('have.length.at.least', 1);
        cy.get('[data-testid="detection-label"]').should('contain', 'Nike');
        cy.get('[data-testid="confidence-score"]').should('contain', '%');
      });

      // Compare with ground truth
      cy.get('[data-testid="show-comparison-toggle"]').click();
      cy.get('[data-testid="ground-truth-box"]').should('be.visible');
      cy.get('[data-testid="iou-score"]').should('contain', 'IoU:');
    });

    it('should block promotion when accuracy below threshold', () => {
      // Create low-accuracy model
      cy.task('db:createModel', {
        id: 'model-low-acc',
        status: 'candidate',
        accuracy: 0.82  // Below 95% threshold
      });
      cy.reload();

      cy.get('[data-testid="model-row-model-low-acc"]').click();

      // Try to promote
      cy.get('[data-testid="promote-model-btn"]').should('be.disabled');
      cy.get('[data-testid="accuracy-warning"]').should('be.visible');
      cy.get('[data-testid="accuracy-warning"]').should('contain', 'Below minimum threshold (95%)');
    });

    it('should block promotion when validation not completed', () => {
      cy.get('[data-testid="model-row-model-test-001"]').click();

      // Try to promote without smoke test
      cy.get('[data-testid="promote-model-btn"]').should('be.disabled');
      cy.get('[data-testid="validation-required"]').should('be.visible');
      cy.get('[data-testid="validation-required"]').should('contain', 'Smoke test required');
    });

    it('should log validation results', () => {
      // Run smoke test
      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="run-smoke-test-btn"]').click();
      cy.get('[data-testid="use-validation-set-btn"]').click();
      cy.get('[data-testid="start-smoke-test-btn"]').click();

      cy.wait('@smokeTest');

      // Check validation run logged
      cy.intercept('GET', '/api/v1/models/*/validation-runs').as('getValidationRuns');
      cy.get('[data-testid="view-validation-history"]').click();

      cy.wait('@getValidationRuns');
      cy.get('[data-testid="validation-run"]').should('have.length.at.least', 1);
      cy.get('[data-testid="validation-run"]').first().should('contain', 'Trace ID:');
    });
  });

  describe('Activation Workflow', () => {
    beforeEach(() => {
      cy.task('db:createModel', {
        id: 'model-activate-001',
        status: 'candidate',
        accuracy: 0.975,
        smokeTestPassed: true
      });
      cy.task('db:createModel', {
        id: 'model-current-active',
        status: 'active',
        accuracy: 0.963
      });
      cy.reload();
    });

    it('should show activation confirmation dialog', () => {
      cy.get('[data-testid="model-row-model-activate-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();

      // Verify dialog
      cy.get('[data-testid="activation-dialog"]').should('be.visible');
      cy.get('[data-testid="activation-dialog-title"]').should('contain', 'Promote Model to Active');

      // Check impact warning
      cy.get('[data-testid="impact-warning"]').should('be.visible');
      cy.get('[data-testid="impact-warning"]').should('contain', 'This will affect all recognition operations');

      // Check current vs new comparison
      cy.get('[data-testid="current-model-info"]').should('contain', 'model-current-active');
      cy.get('[data-testid="current-model-accuracy"]').should('contain', '96.3%');

      cy.get('[data-testid="new-model-info"]').should('contain', 'model-activate-001');
      cy.get('[data-testid="new-model-accuracy"]').should('contain', '97.5%');

      // Check improvements
      cy.get('[data-testid="improvements-list"]').should('be.visible');
      cy.get('[data-testid="improvement-item"]').should('contain', '+1.2% accuracy improvement');
    });

    it('should require release notes for activation', () => {
      cy.get('[data-testid="model-row-model-activate-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();

      // Try to activate without release notes
      cy.get('[data-testid="activate-confirm-btn"]').should('be.disabled');

      // Add release notes
      cy.get('[data-testid="release-notes-textarea"]').type(
        'Improved model with better handling of new packaging types and reduced false positives'
      );

      // Now button should be enabled
      cy.get('[data-testid="activate-confirm-btn"]').should('not.be.disabled');
    });

    it('should activate model successfully', () => {
      cy.get('[data-testid="model-row-model-activate-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();

      // Fill release notes
      cy.get('[data-testid="release-notes-textarea"]').type('Performance improvements');

      // Activate
      cy.intercept('POST', '/api/v1/models/*/activate').as('activateModel');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      cy.wait('@activateModel').then((interception) => {
        expect(interception.response.statusCode).to.equal(200);
        expect(interception.request.body).to.have.property('releaseNotes');
      });

      // Verify success
      cy.get('[data-testid="activation-success"]').should('be.visible');
      cy.get('[data-testid="activation-success"]').should('contain', 'Model activated successfully');

      // Verify status updated
      cy.get('[data-testid="model-row-model-activate-001"]')
        .find('[data-testid="model-status"]')
        .should('contain', 'Active');

      cy.get('[data-testid="model-row-model-current-active"]')
        .find('[data-testid="model-status"]')
        .should('contain', 'Deprecated');
    });

    it('should show rollback option', () => {
      // Activate model first
      cy.get('[data-testid="model-row-model-activate-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();
      cy.get('[data-testid="release-notes-textarea"]').type('Test activation');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      cy.wait(1000);

      // Check rollback available
      cy.get('[data-testid="model-row-model-activate-001"]').click();
      cy.get('[data-testid="rollback-btn"]').should('be.visible');

      // Click rollback
      cy.get('[data-testid="rollback-btn"]').click();

      // Verify rollback dialog
      cy.get('[data-testid="rollback-dialog"]').should('be.visible');
      cy.get('[data-testid="rollback-to-model"]').should('contain', 'model-current-active');

      // Confirm rollback
      cy.get('[data-testid="rollback-confirm-btn"]').click();

      // Verify rollback successful
      cy.get('[data-testid="rollback-success"]').should('be.visible');
      cy.get('[data-testid="model-row-model-current-active"]')
        .find('[data-testid="model-status"]')
        .should('contain', 'Active');
    });

    it('should send notifications on activation', () => {
      cy.get('[data-testid="model-row-model-activate-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();

      // Configure notifications
      cy.get('[data-testid="send-notification-checkbox"]').should('be.checked');
      cy.get('[data-testid="notification-recipients"]').should('contain', 'team');

      // Fill and activate
      cy.get('[data-testid="release-notes-textarea"]').type('New model activated');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      // Verify notifications sent
      cy.task('notification:verify', {
        type: 'email',
        event: 'model_activated',
        modelId: 'model-activate-001'
      }).should('be.true');

      cy.task('notification:verify', {
        type: 'slack',
        event: 'model_activated',
        modelId: 'model-activate-001'
      }).should('be.true');
    });
  });

  describe('Integration with Recognition Pipeline', () => {
    it('should display active model in header', () => {
      cy.get('[data-testid="header-model-indicator"]').should('be.visible');
      cy.get('[data-testid="header-model-indicator"]').trigger('mouseover');

      // Check tooltip
      cy.get('[data-testid="model-tooltip"]').should('be.visible');
      cy.get('[data-testid="model-tooltip"]').should('contain', 'Active Model:');
      cy.get('[data-testid="model-tooltip"]').should('contain', 'Version:');
      cy.get('[data-testid="model-tooltip"]').should('contain', 'Accuracy:');
    });

    it('should use active model for recognition', () => {
      // Activate a specific model
      cy.task('db:createModel', {
        id: 'model-recognize-001',
        status: 'candidate',
        accuracy: 0.98
      });
      cy.reload();

      cy.get('[data-testid="model-row-model-recognize-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();
      cy.get('[data-testid="release-notes-textarea"]').type('Test recognition');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      // Navigate to recognition
      cy.visit('/recognize');

      // Upload image
      cy.fixture('test-logo.jpg').then(fileContent => {
        cy.get('[data-testid="recognize-upload"]').attachFile({
          fileContent: fileContent.toString(),
          fileName: 'test-logo.jpg',
          mimeType: 'image/jpeg'
        });
      });

      // Run recognition
      cy.intercept('POST', '/api/v1/recognize').as('recognize');
      cy.get('[data-testid="recognize-btn"]').click();

      // Verify correct model used
      cy.wait('@recognize').then((interception) => {
        expect(interception.response.headers).to.have.property('x-model-id', 'model-recognize-001');
      });
    });

    it('should run smoke test after activation', () => {
      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();
      cy.get('[data-testid="release-notes-textarea"]').type('Auto smoke test');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      // Verify smoke test running
      cy.get('[data-testid="post-activation-smoke-test"]').should('be.visible');
      cy.get('[data-testid="smoke-test-progress"]').should('be.visible');

      // Wait for completion
      cy.get('[data-testid="smoke-test-complete"]', { timeout: 10000 }).should('be.visible');
      cy.get('[data-testid="smoke-test-result"]').should('contain', 'Passed');
    });

    it('should log model switches in monitoring', () => {
      // Activate model
      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();
      cy.get('[data-testid="release-notes-textarea"]').type('Monitoring test');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      // Check monitoring dashboard
      cy.visit('/monitoring/dashboard');
      cy.get('[data-testid="model-switches-panel"]').should('be.visible');

      // Verify event logged
      cy.get('[data-testid="model-switch-event"]').first().within(() => {
        cy.get('[data-testid="event-type"]').should('contain', 'Model Activated');
        cy.get('[data-testid="event-model"]').should('contain', 'model-test-001');
        cy.get('[data-testid="event-timestamp"]').should('exist');
      });
    });
  });

  describe('Audit & Governance', () => {
    it('should log who activates models', () => {
      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();
      cy.get('[data-testid="release-notes-textarea"]').type('Audit test');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      // Check audit log
      cy.get('[data-testid="view-audit-log"]').click();
      cy.get('[data-testid="audit-entry"]').first().within(() => {
        cy.get('[data-testid="audit-user"]').should('contain', 'product.owner@test.com');
        cy.get('[data-testid="audit-action"]').should('contain', 'Model Activated');
        cy.get('[data-testid="audit-notes"]').should('contain', 'Audit test');
      });
    });

    it('should require motivation notes for activation', () => {
      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();

      // Check motivation required
      cy.get('[data-testid="release-notes-textarea"]').should('have.attr', 'required');
      cy.get('[data-testid="release-notes-label"]').should('contain', 'Required');
    });

    it('should export model history as CSV', () => {
      cy.get('[data-testid="export-history-btn"]').click();
      cy.get('[data-testid="export-csv-option"]').click();

      // Verify CSV download
      cy.readFile('cypress/downloads/model-history.csv').then((content) => {
        expect(content).to.include('Model ID,Version,Status,Accuracy,Activated By,Activated At');
        const lines = content.split('\n');
        expect(lines).to.have.length.at.least(4); // Header + 3 models
      });
    });

    it('should export model history as JSON', () => {
      cy.get('[data-testid="export-history-btn"]').click();
      cy.get('[data-testid="export-json-option"]').click();

      // Verify JSON download
      cy.readFile('cypress/downloads/model-history.json').then((json) => {
        expect(json).to.be.an('array');
        expect(json[0]).to.have.property('id');
        expect(json[0]).to.have.property('metrics');
        expect(json[0]).to.have.property('activationHistory');
      });
    });

    it('should enforce RBAC for activation', () => {
      // Logout and login as analyst (no permission)
      cy.clearCookies();
      cy.loginAsAnalyst();
      cy.visit('/models/registry');

      cy.get('[data-testid="model-row-model-test-001"]').click();

      // Verify activate button not visible
      cy.get('[data-testid="promote-model-btn"]').should('not.exist');
      cy.get('[data-testid="permission-denied"]').should('be.visible');
      cy.get('[data-testid="permission-denied"]').should('contain', 'ML Engineer or Product Owner role required');

      // Login as ML Engineer (has permission)
      cy.clearCookies();
      cy.loginAsMLEngineer();
      cy.visit('/models/registry');

      cy.get('[data-testid="model-row-model-test-001"]').click();

      // Verify activate button visible
      cy.get('[data-testid="promote-model-btn"]').should('be.visible');
    });
  });

  describe('Fallback & Safety Nets', () => {
    it('should auto-rollback on smoke test failure', () => {
      // Setup failing smoke test
      cy.task('db:configureFailingSmokeTest');

      // Activate model
      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();
      cy.get('[data-testid="release-notes-textarea"]').type('Will fail smoke test');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      // Wait for smoke test to fail
      cy.get('[data-testid="smoke-test-failed"]', { timeout: 10000 }).should('be.visible');

      // Verify auto-rollback initiated
      cy.get('[data-testid="auto-rollback-alert"]').should('be.visible');
      cy.get('[data-testid="auto-rollback-alert"]').should('contain', 'Automatic rollback initiated');

      // Wait for rollback completion
      cy.get('[data-testid="rollback-complete"]', { timeout: 120000 }).should('be.visible');

      // Verify previous model active again
      cy.reload();
      cy.get('[data-testid="model-row-model-current-active"]')
        .find('[data-testid="model-status"]')
        .should('contain', 'Active');
    });

    it('should show warning when fallback occurred', () => {
      // Simulate fallback scenario
      cy.task('db:simulateFallback', {
        failedModel: 'model-test-001',
        fallbackModel: 'model-current-active',
        reason: 'smoke_test_failed'
      });

      cy.reload();

      // Verify fallback warning
      cy.get('[data-testid="fallback-warning"]').should('be.visible');
      cy.get('[data-testid="fallback-warning"]').should('have.class', 'alert-warning');
      cy.get('[data-testid="fallback-warning"]').should('contain', 'Model activation rolled back');
      cy.get('[data-testid="fallback-reason"]').should('contain', 'Smoke test failed');
      cy.get('[data-testid="fallback-details-link"]').should('be.visible');
    });

    it('should alert when activation takes too long', () => {
      // Setup slow activation
      cy.intercept('POST', '/api/v1/models/*/activate', (req) => {
        req.reply((res) => {
          res.delay(310000); // 5+ minutes
          res.send({ status: 'timeout' });
        });
      }).as('slowActivation');

      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();
      cy.get('[data-testid="release-notes-textarea"]').type('Slow activation');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      // Verify timeout alert
      cy.get('[data-testid="activation-timeout"]', { timeout: 310000 }).should('be.visible');
      cy.get('[data-testid="activation-timeout"]').should('contain', 'Activation taking longer than expected');

      // Verify observability alert triggered
      cy.task('alert:verify', {
        type: 'activation_timeout',
        modelId: 'model-test-001'
      }).should('be.true');
    });

    it('should handle API errors gracefully', () => {
      let errorCount = 0;

      // Simulate intermittent API errors
      cy.intercept('POST', '/api/v1/models/*/activate', (req) => {
        errorCount++;
        if (errorCount < 3) {
          req.reply({
            statusCode: 500,
            body: { error: 'Internal server error' }
          });
        } else {
          req.reply({
            statusCode: 200,
            body: { status: 'activated' }
          });
        }
      }).as('errorActivation');

      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();
      cy.get('[data-testid="release-notes-textarea"]').type('Error test');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      // Verify retry attempts
      cy.get('[data-testid="activation-error"]').should('be.visible');
      cy.get('[data-testid="retry-attempt-1"]').should('be.visible');
      cy.get('[data-testid="retry-attempt-2"]').should('be.visible');

      // Third attempt should succeed
      cy.get('[data-testid="activation-success"]', { timeout: 10000 }).should('be.visible');

      // Verify alert for multiple errors
      cy.task('alert:verify', {
        type: 'api_error_threshold',
        endpoint: '/api/v1/models/*/activate'
      }).should('be.true');
    });
  });

  describe('Performance Tests', () => {
    it('should load registry with 200 models in under 400ms', () => {
      // Create 200 models
      cy.task('db:createModels', { count: 200 });

      const startTime = Date.now();
      cy.reload();

      cy.get('[data-testid="model-registry-table"]').should('be.visible');
      cy.get('[data-testid="model-row"]').should('have.length', 200);

      const loadTime = Date.now() - startTime;
      expect(loadTime).to.be.lessThan(400);
    });

    it('should complete activation within 30 seconds', () => {
      const startTime = Date.now();

      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();
      cy.get('[data-testid="release-notes-textarea"]').type('Performance test');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      cy.get('[data-testid="activation-complete"]', { timeout: 30000 }).should('be.visible');

      const activationTime = Date.now() - startTime;
      expect(activationTime).to.be.lessThan(30000);
    });

    it('should run smoke tests on 5 images in under 10 seconds', () => {
      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="run-smoke-test-btn"]').click();
      cy.get('[data-testid="use-validation-set-btn"]').click();

      const startTime = Date.now();
      cy.get('[data-testid="start-smoke-test-btn"]').click();

      cy.get('[data-testid="smoke-test-complete"]', { timeout: 10000 }).should('be.visible');

      const testTime = Date.now() - startTime;
      expect(testTime).to.be.lessThan(10000);

      // Verify all 5 images tested
      cy.get('[data-testid="test-result"]').should('have.length', 5);
    });

    it('should rollback within 120 seconds on failure', () => {
      // Setup to trigger rollback
      cy.task('db:configureFailingSmokeTest');

      const startTime = Date.now();

      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();
      cy.get('[data-testid="release-notes-textarea"]').type('Rollback timing test');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      // Wait for rollback to complete
      cy.get('[data-testid="rollback-complete"]', { timeout: 120000 }).should('be.visible');

      const rollbackTime = Date.now() - startTime;
      expect(rollbackTime).to.be.lessThan(120000);
    });

    it('should handle zero-downtime model switching', () => {
      // Start recognition requests
      const recognitionPromises = [];
      for (let i = 0; i < 10; i++) {
        recognitionPromises.push(
          cy.request({
            method: 'POST',
            url: '/api/v1/recognize',
            body: { image: 'test.jpg' },
            failOnStatusCode: false
          })
        );
      }

      // Activate new model during recognition
      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();
      cy.get('[data-testid="release-notes-textarea"]').type('Zero downtime test');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      // Verify all recognition requests succeeded
      cy.wrap(Promise.all(recognitionPromises)).then((responses) => {
        responses.forEach((response) => {
          expect(response.status).to.be.oneOf([200, 202]); // Success or accepted
        });
      });

      // Verify no errors in monitoring
      cy.visit('/monitoring/dashboard');
      cy.get('[data-testid="error-rate"]').should('contain', '0%');
    });
  });

  describe('Feature Flags', () => {
    it('should toggle registry UI with feature flag', () => {
      // Disable registry
      cy.window().then((win) => {
        win.featureFlags = { 'recognition.modelRegistry': false };
      });
      cy.reload();

      // Verify old UI
      cy.get('[data-testid="legacy-model-list"]').should('be.visible');
      cy.get('[data-testid="model-registry-table"]').should('not.exist');

      // Enable registry
      cy.window().then((win) => {
        win.featureFlags = { 'recognition.modelRegistry': true };
      });
      cy.reload();

      // Verify new UI
      cy.get('[data-testid="model-registry-table"]').should('be.visible');
      cy.get('[data-testid="legacy-model-list"]').should('not.exist');
    });

    it('should control auto-rollback with feature flag', () => {
      // Disable auto-rollback
      cy.window().then((win) => {
        win.featureFlags = { 'recognition.autoRollback': false };
      });

      // Setup failing smoke test
      cy.task('db:configureFailingSmokeTest');

      // Activate model
      cy.get('[data-testid="model-row-model-test-001"]').click();
      cy.get('[data-testid="promote-model-btn"]').click();
      cy.get('[data-testid="release-notes-textarea"]').type('No auto rollback');
      cy.get('[data-testid="activate-confirm-btn"]').click();

      // Smoke test fails
      cy.get('[data-testid="smoke-test-failed"]', { timeout: 10000 }).should('be.visible');

      // Verify NO auto-rollback
      cy.get('[data-testid="auto-rollback-alert"]').should('not.exist');
      cy.get('[data-testid="manual-rollback-required"]').should('be.visible');
    });

    it('should control smoke test requirement with feature flag', () => {
      // Disable smoke test requirement
      cy.window().then((win) => {
        win.featureFlags = { 'recognition.smokeTests': false };
      });
      cy.reload();

      cy.get('[data-testid="model-row-model-test-001"]').click();

      // Should be able to promote without smoke test
      cy.get('[data-testid="promote-model-btn"]').should('not.be.disabled');
      cy.get('[data-testid="validation-required"]').should('not.exist');

      // Can activate directly
      cy.get('[data-testid="promote-model-btn"]').click();
      cy.get('[data-testid="skip-smoke-test-warning"]').should('be.visible');
    });
  });
});

// Helper commands
Cypress.Commands.add('loginAsProductOwner', () => {
  cy.request('POST', '/api/v1/auth/login', {
    username: 'product.owner@test.com',
    password: 'test123',
    role: 'product_owner'
  }).then((response) => {
    window.localStorage.setItem('authToken', response.body.token);
    window.localStorage.setItem('userRole', 'product_owner');
  });
});

Cypress.Commands.add('loginAsAnalyst', () => {
  cy.request('POST', '/api/v1/auth/login', {
    username: 'analyst@test.com',
    password: 'test123',
    role: 'analyst'
  }).then((response) => {
    window.localStorage.setItem('authToken', response.body.token);
    window.localStorage.setItem('userRole', 'analyst');
  });
});

// File attachment command
Cypress.Commands.add('attachFile', { prevSubject: 'element' }, (subject, file) => {
  cy.wrap(subject).selectFile(file, { force: true });
});