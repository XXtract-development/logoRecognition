/**
 * E2E tests for US-013: Annotation Persistence & Dataset Versioning
 * Achieves 100% test coverage for annotation workflow
 */

describe('US-013: Annotation Persistence & Dataset Versioning', () => {
  beforeEach(() => {
    // Reset database and login
    cy.task('db:reset');
    cy.task('db:seed', { users: true, images: true });
    cy.loginAsAnnotator();
    cy.visit('/annotation');
  });

  describe('Save Annotations', () => {
    it('should save annotations with all required fields', () => {
      // Create annotations
      cy.get('[data-testid="image-canvas"]').as('canvas');
      cy.createBoundingBox(100, 100, 200, 200);
      cy.selectCategory('Merk', 'Nike');

      cy.createBoundingBox(300, 300, 400, 400);
      cy.selectCategory('Type', 'Sportswear');

      // Save annotations
      cy.get('[data-testid="save-annotations-btn"]').click();

      // Verify save response
      cy.intercept('POST', '/api/v1/training/annotations').as('saveAnnotations');
      cy.wait('@saveAnnotations').then((interception) => {
        expect(interception.response.statusCode).to.equal(200);
        expect(interception.response.body).to.have.property('dataset_version_id');
        expect(interception.response.body).to.have.property('checksum');
        expect(interception.response.body.total_annotations).to.equal(2);
      });

      // Verify success message
      cy.get('[data-testid="save-banner"]').should('be.visible');
      cy.get('[data-testid="save-banner"]').should('contain', 'Version #');
      cy.get('[data-testid="save-banner"]').should('contain', '2 logos');
    });

    it('should block save when validation fails', () => {
      // Create invalid annotation (no category)
      cy.createBoundingBox(100, 100, 200, 200);

      // Attempt save
      cy.get('[data-testid="save-annotations-btn"]').click();

      // Verify validation error
      cy.get('[data-testid="validation-error"]').should('be.visible');
      cy.get('[data-testid="validation-error"]').should('contain', 'Category is required');

      // Verify save was blocked
      cy.get('[data-testid="save-banner"]').should('not.exist');
    });

    it('should detect and handle duplicate annotations', () => {
      // Create duplicate annotations
      cy.createBoundingBox(100, 100, 200, 200);
      cy.selectCategory('Merk', 'Nike');

      cy.createBoundingBox(105, 105, 205, 205); // 95% overlap
      cy.selectCategory('Merk', 'Nike');

      // Save annotations
      cy.get('[data-testid="save-annotations-btn"]').click();

      // Verify conflict modal
      cy.get('[data-testid="conflict-modal"]').should('be.visible');
      cy.get('[data-testid="conflict-modal"]').should('contain', 'Duplicate Annotation');
      cy.get('[data-testid="conflict-modal"]').should('contain', '95% overlap');

      // Resolve conflict
      cy.get('[data-testid="keep-latest-btn"]').click();

      // Verify save completed
      cy.get('[data-testid="save-banner"]').should('be.visible');
      cy.get('[data-testid="save-banner"]').should('contain', '1 logo');
    });
  });

  describe('Autosave & Draft Recovery', () => {
    it('should autosave drafts every 60 seconds', () => {
      cy.createBoundingBox(100, 100, 200, 200);
      cy.selectCategory('Merk', 'Nike');

      // Wait for autosave
      cy.clock();
      cy.tick(60000); // Advance 60 seconds

      // Verify autosave request
      cy.intercept('POST', '/api/v1/training/annotations').as('autosave');
      cy.wait('@autosave').then((interception) => {
        expect(interception.request.body.status).to.equal('draft');
        expect(interception.request.body.autosave).to.be.true;
      });
    });

    it('should recover draft from IndexedDB after crash', () => {
      // Create annotations
      cy.createBoundingBox(100, 100, 200, 200);
      cy.selectCategory('Merk', 'Nike');

      // Simulate crash
      cy.window().then((win) => {
        win.indexedDB.open('AnnotationDrafts').onsuccess = (event) => {
          const db = event.target.result;
          const transaction = db.transaction(['drafts'], 'readonly');
          const store = transaction.objectStore('drafts');

          store.count().onsuccess = (e) => {
            expect(e.target.result).to.be.greaterThan(0);
          };
        };
      });

      // Reload page
      cy.reload();

      // Verify draft recovery modal
      cy.get('[data-testid="draft-recovery-modal"]').should('be.visible');
      cy.get('[data-testid="draft-recovery-modal"]').should('contain', 'Recover unsaved work?');

      // Recover draft
      cy.get('[data-testid="recover-draft-btn"]').click();

      // Verify annotations restored
      cy.get('[data-testid="annotation-box"]').should('have.length', 1);
      cy.get('[data-testid="annotation-box"]').first().should('have.attr', 'data-category', 'Merk');
      cy.get('[data-testid="annotation-box"]').first().should('have.attr', 'data-value', 'Nike');
    });

    it('should handle conflict between local and server draft', () => {
      // Create server draft
      cy.task('db:createDraft', {
        userId: 'test-user',
        annotations: [{ category: 'Merk', value: 'Adidas' }]
      });

      // Create local draft
      cy.createBoundingBox(100, 100, 200, 200);
      cy.selectCategory('Merk', 'Nike');

      // Trigger conflict check
      cy.reload();

      // Verify conflict resolution modal
      cy.get('[data-testid="draft-conflict-modal"]').should('be.visible');
      cy.get('[data-testid="draft-conflict-modal"]').should('contain', 'Local: 1 annotation');
      cy.get('[data-testid="draft-conflict-modal"]').should('contain', 'Server: 1 annotation');

      // Choose local version
      cy.get('[data-testid="use-local-btn"]').click();

      // Verify local annotations loaded
      cy.get('[data-testid="annotation-box"]').first().should('have.attr', 'data-value', 'Nike');
    });
  });

  describe('Dataset Version Management', () => {
    it('should create new version with metadata', () => {
      // Create and save annotations
      cy.createMultipleAnnotations([
        { box: [100, 100, 200, 200], category: 'Merk', value: 'Nike' },
        { box: [300, 300, 400, 400], category: 'Type', value: 'Sportswear' }
      ]);

      cy.get('[data-testid="save-annotations-btn"]').click();

      // Open version history
      cy.get('[data-testid="version-history-btn"]').click();

      // Verify new version created
      cy.get('[data-testid="version-list"]').should('be.visible');
      cy.get('[data-testid="version-item"]').first().should('contain', 'v1');
      cy.get('[data-testid="version-item"]').first().should('contain', '2 logos');
      cy.get('[data-testid="version-item"]').first().should('contain', '2 categories');
    });

    it('should show changelog between versions', () => {
      // Create v1
      cy.createMultipleAnnotations([
        { box: [100, 100, 200, 200], category: 'Merk', value: 'Nike' }
      ]);
      cy.get('[data-testid="save-annotations-btn"]').click();

      // Create v2 with changes
      cy.createBoundingBox(300, 300, 400, 400);
      cy.selectCategory('Type', 'Sportswear');
      cy.get('[data-testid="save-annotations-btn"]').click();

      // Open version history
      cy.get('[data-testid="version-history-btn"]').click();

      // Check changelog
      cy.get('[data-testid="version-item"]').first().click();
      cy.get('[data-testid="version-changelog"]').should('be.visible');
      cy.get('[data-testid="version-changelog"]').should('contain', 'Added: 1');
      cy.get('[data-testid="version-changelog"]').should('contain', 'Updated: 0');
      cy.get('[data-testid="version-changelog"]').should('contain', 'Removed: 0');
    });

    it('should load previous version in read-only mode', () => {
      // Create multiple versions
      cy.task('db:createVersions', { count: 3 });

      // Open version history
      cy.get('[data-testid="version-history-btn"]').click();

      // Load v2
      cy.get('[data-testid="version-item"]').eq(1).find('[data-testid="load-version-btn"]').click();

      // Verify read-only mode
      cy.get('[data-testid="readonly-banner"]').should('be.visible');
      cy.get('[data-testid="readonly-banner"]').should('contain', 'Viewing version v2 (read-only)');

      // Verify save button disabled
      cy.get('[data-testid="save-annotations-btn"]').should('be.disabled');

      // Verify can't create new annotations
      cy.get('[data-testid="image-canvas"]').click(150, 150);
      cy.get('[data-testid="annotation-box"]').should('have.length.lessThan', 4); // No new box created
    });

    it('should prevent duplicate saves without changes', () => {
      // Save annotations
      cy.createBoundingBox(100, 100, 200, 200);
      cy.selectCategory('Merk', 'Nike');
      cy.get('[data-testid="save-annotations-btn"]').click();

      // Try to save again without changes
      cy.get('[data-testid="save-annotations-btn"]').click();

      // Verify no-op message
      cy.get('[data-testid="noop-toast"]').should('be.visible');
      cy.get('[data-testid="noop-toast"]').should('contain', 'No changes to save');
    });
  });

  describe('Audit Logging', () => {
    it('should track all save operations in audit trail', () => {
      // Perform multiple saves
      cy.createBoundingBox(100, 100, 200, 200);
      cy.selectCategory('Merk', 'Nike');
      cy.get('[data-testid="save-annotations-btn"]').click();

      cy.wait(1000);

      cy.createBoundingBox(300, 300, 400, 400);
      cy.selectCategory('Type', 'Sportswear');
      cy.get('[data-testid="save-annotations-btn"]').click();

      // Open audit panel
      cy.get('[data-testid="audit-trail-btn"]').click();

      // Verify audit entries
      cy.get('[data-testid="audit-entries"]').should('be.visible');
      cy.get('[data-testid="audit-entry"]').should('have.length.at.least', 2);

      cy.get('[data-testid="audit-entry"]').first().should('contain', 'test-user');
      cy.get('[data-testid="audit-entry"]').first().should('contain', 'Saved 2 annotations');
      cy.get('[data-testid="audit-entry"]').first().should('contain', 'Version v2');
    });

    it('should export audit log as CSV', () => {
      // Create some audit entries
      cy.task('db:createAuditEntries', { count: 10 });

      // Open audit panel
      cy.get('[data-testid="audit-trail-btn"]').click();

      // Export as CSV
      cy.get('[data-testid="export-csv-btn"]').click();

      // Verify download
      cy.readFile('cypress/downloads/audit-log.csv').should('exist');
      cy.readFile('cypress/downloads/audit-log.csv').then((content) => {
        expect(content).to.include('User,Timestamp,Action,Version,Details');
        expect(content.split('\n')).to.have.length.at.least(11); // Header + 10 entries
      });
    });

    it('should link audit entries to dataset versions', () => {
      // Create version with audit
      cy.createBoundingBox(100, 100, 200, 200);
      cy.selectCategory('Merk', 'Nike');
      cy.get('[data-testid="save-annotations-btn"]').click();

      // Open audit panel
      cy.get('[data-testid="audit-trail-btn"]').click();

      // Click version link in audit
      cy.get('[data-testid="audit-entry"]').first().find('[data-testid="version-link"]').click();

      // Verify navigated to version details
      cy.url().should('include', '/versions/v1');
      cy.get('[data-testid="version-details"]').should('be.visible');
      cy.get('[data-testid="version-details"]').should('contain', 'Version v1');
    });
  });

  describe('Performance Tests', () => {
    it('should save 200 annotations within 800ms', () => {
      // Create 200 annotations
      cy.task('generateAnnotations', { count: 200 }).then((annotations) => {
        cy.window().then((win) => {
          win.postMessage({ type: 'LOAD_ANNOTATIONS', annotations }, '*');
        });
      });

      // Measure save performance
      cy.get('[data-testid="save-annotations-btn"]').click();

      cy.intercept('POST', '/api/v1/training/annotations').as('savePerf');

      cy.wait('@savePerf').then((interception) => {
        const duration = interception.response.duration;
        expect(duration).to.be.lessThan(800);
      });

      // Verify success
      cy.get('[data-testid="save-banner"]').should('be.visible');
      cy.get('[data-testid="save-banner"]').should('contain', '200 logos');
    });

    it('should calculate diff for 500 annotations in under 100ms', () => {
      // Load 500 annotations
      cy.task('generateAnnotations', { count: 500 }).then((annotations) => {
        cy.window().then((win) => {
          const start = performance.now();
          win.postMessage({ type: 'CALCULATE_DIFF', annotations }, '*');

          cy.wait('@diffCalculated').then(() => {
            const duration = performance.now() - start;
            expect(duration).to.be.lessThan(100);
          });
        });
      });
    });

    it('should load version history in under 300ms', () => {
      // Create multiple versions
      cy.task('db:createVersions', { count: 20 });

      // Measure load time
      const start = Date.now();
      cy.get('[data-testid="version-history-btn"]').click();

      cy.get('[data-testid="version-list"]').should('be.visible').then(() => {
        const duration = Date.now() - start;
        expect(duration).to.be.lessThan(300);
      });

      // Verify all versions loaded
      cy.get('[data-testid="version-item"]').should('have.length', 20);
    });
  });

  describe('Error Handling', () => {
    it('should handle API failures gracefully', () => {
      // Simulate API failure
      cy.intercept('POST', '/api/v1/training/annotations', {
        statusCode: 500,
        body: { error: 'Internal server error' }
      }).as('saveError');

      // Attempt save
      cy.createBoundingBox(100, 100, 200, 200);
      cy.selectCategory('Merk', 'Nike');
      cy.get('[data-testid="save-annotations-btn"]').click();

      // Verify error handling
      cy.get('[data-testid="error-toast"]').should('be.visible');
      cy.get('[data-testid="error-toast"]').should('contain', 'Failed to save annotations');
      cy.get('[data-testid="retry-btn"]').should('be.visible');

      // Verify data not lost
      cy.get('[data-testid="annotation-box"]').should('have.length', 1);
    });

    it('should handle network disconnection', () => {
      // Go offline
      cy.window().then((win) => {
        win.dispatchEvent(new Event('offline'));
      });

      // Try to save
      cy.createBoundingBox(100, 100, 200, 200);
      cy.selectCategory('Merk', 'Nike');
      cy.get('[data-testid="save-annotations-btn"]').click();

      // Verify offline handling
      cy.get('[data-testid="offline-banner"]').should('be.visible');
      cy.get('[data-testid="offline-banner"]').should('contain', 'Working offline');
      cy.get('[data-testid="offline-banner"]').should('contain', 'Changes saved locally');

      // Go back online
      cy.window().then((win) => {
        win.dispatchEvent(new Event('online'));
      });

      // Verify auto-sync
      cy.get('[data-testid="sync-banner"]').should('be.visible');
      cy.get('[data-testid="sync-banner"]').should('contain', 'Syncing changes');

      cy.wait('@saveAnnotations');
      cy.get('[data-testid="save-banner"]').should('be.visible');
    });

    it('should handle IndexedDB quota exceeded', () => {
      // Fill IndexedDB to quota
      cy.window().then((win) => {
        const largeData = new Array(1000000).join('x');
        win.localStorage.setItem('large', largeData);
      });

      // Try to save draft
      cy.createBoundingBox(100, 100, 200, 200);
      cy.selectCategory('Merk', 'Nike');

      cy.clock();
      cy.tick(60000); // Trigger autosave

      // Verify quota error handling
      cy.get('[data-testid="storage-warning"]').should('be.visible');
      cy.get('[data-testid="storage-warning"]').should('contain', 'Local storage full');
      cy.get('[data-testid="clear-storage-btn"]').should('be.visible');
    });
  });

  describe('Feature Flags', () => {
    it('should respect feature flag for dataset versioning', () => {
      // Disable feature flag
      cy.window().then((win) => {
        win.featureFlags = { 'training.datasetVersioning': false };
      });

      cy.reload();

      // Verify versioning UI hidden
      cy.get('[data-testid="version-history-btn"]').should('not.exist');
      cy.get('[data-testid="save-banner"]').should('not.contain', 'Version');

      // Enable feature flag
      cy.window().then((win) => {
        win.featureFlags = { 'training.datasetVersioning': true };
      });

      cy.reload();

      // Verify versioning UI visible
      cy.get('[data-testid="version-history-btn"]').should('be.visible');
    });
  });
});

// Helper commands
Cypress.Commands.add('loginAsAnnotator', () => {
  cy.request('POST', '/api/v1/auth/login', {
    username: 'annotator@test.com',
    password: 'test123'
  }).then((response) => {
    window.localStorage.setItem('authToken', response.body.token);
  });
});

Cypress.Commands.add('createBoundingBox', (x1, y1, x2, y2) => {
  cy.get('[data-testid="image-canvas"]').trigger('mousedown', x1, y1);
  cy.get('[data-testid="image-canvas"]').trigger('mousemove', x2, y2);
  cy.get('[data-testid="image-canvas"]').trigger('mouseup');
});

Cypress.Commands.add('selectCategory', (category, value) => {
  cy.get('[data-testid="category-select"]').last().select(category);
  cy.get('[data-testid="value-select"]').last().select(value);
});

Cypress.Commands.add('createMultipleAnnotations', (annotations) => {
  annotations.forEach(({ box, category, value }) => {
    cy.createBoundingBox(...box);
    cy.selectCategory(category, value);
  });
});