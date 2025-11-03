/**
 * E2E Tests for Category List Improvements (US-040)
 *
 * End-to-end tests for the enhanced category management features including
 * modal editing, filtering, and improved column layout.
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('Category List Improvements', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    await page.goto(`${BASE_URL}/categories`);
    // Wait for the page to load
    await page.waitForSelector('[data-testid="categories-table"]', { timeout: 10000 });
  });

  test.describe('Filter Functionality', () => {
    test('should display search bar above category list', async () => {
      const searchInput = page.locator('[data-testid="category-search"]');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute('placeholder', /zoek categorieën/i);
    });

    test('should filter categories in real-time while typing', async () => {
      const searchInput = page.locator('[data-testid="category-search"]');
      const table = page.locator('[data-testid="categories-table"]');

      // Get initial row count
      const initialRows = await table.locator('tbody tr').count();

      // Type in search
      await searchInput.fill('logo');
      await page.waitForTimeout(500); // Wait for debounce

      // Verify filtered results
      const filteredRows = await table.locator('tbody tr').count();
      expect(filteredRows).toBeLessThanOrEqual(initialRows);

      // Verify all visible rows contain 'logo'
      const visibleRows = await table.locator('tbody tr').all();
      for (const row of visibleRows) {
        const text = await row.textContent();
        expect(text?.toLowerCase()).toContain('logo');
      }
    });

    test('should show clear filter button when filter is active', async () => {
      const searchInput = page.locator('[data-testid="category-search"]');
      const clearButton = page.locator('[data-testid="clear-filter-btn"]');

      // Initially hidden
      await expect(clearButton).not.toBeVisible();

      // Type in search
      await searchInput.fill('test');

      // Clear button should appear
      await expect(clearButton).toBeVisible();

      // Click clear
      await clearButton.click();

      // Search should be cleared
      await expect(searchInput).toHaveValue('');
      await expect(clearButton).not.toBeVisible();
    });

    test('should display filtered count vs total count', async () => {
      const searchInput = page.locator('[data-testid="category-search"]');
      const countDisplay = page.locator('[data-testid="filter-count"]');

      // Initial state shows total
      const initialText = await countDisplay.textContent();
      expect(initialText).toMatch(/totaal \d+ categorieën/i);

      // Apply filter
      await searchInput.fill('logo');
      await page.waitForTimeout(500);

      // Should show filtered count
      const filteredText = await countDisplay.textContent();
      expect(filteredText).toMatch(/toont \d+ van \d+ categorieën/i);
    });
  });

  test.describe('Modal Dialog for Editing', () => {
    test('should open modal when clicking on category', async () => {
      const firstRow = page.locator('tbody tr').first();
      const editButton = firstRow.locator('[data-testid="edit-btn"]');

      await editButton.click();

      // Modal should be visible
      const modal = page.locator('.ant-modal');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('Categorie Bewerken');
    });

    test('should show all category fields in modal', async () => {
      const firstRow = page.locator('tbody tr').first();
      const editButton = firstRow.locator('[data-testid="edit-btn"]');

      await editButton.click();

      const modal = page.locator('.ant-modal');

      // Check all fields are present
      await expect(modal.locator('input[name="categorie"]')).toBeVisible();
      await expect(modal.locator('input[name="code"]')).toBeVisible();
      await expect(modal.locator('[data-testid="color-picker"]')).toBeVisible();
      await expect(modal.locator('textarea[name="description"]')).toBeVisible();
    });

    test('should validate required fields before saving', async () => {
      const addButton = page.locator('[data-testid="add-category-btn"]');
      await addButton.click();

      const modal = page.locator('.ant-modal');
      const saveButton = modal.locator('[data-testid="save-btn"]');

      // Try to save without filling required fields
      await saveButton.click();

      // Should show validation errors
      await expect(modal).toContainText('Categorie is verplicht');
      await expect(modal).toContainText('Code is verplicht');
    });

    test('should save changes and update list', async () => {
      const firstRow = page.locator('tbody tr').first();
      const editButton = firstRow.locator('[data-testid="edit-btn"]');

      // Get original text
      const originalName = await firstRow.locator('td:nth-child(3)').textContent();

      await editButton.click();

      const modal = page.locator('.ant-modal');
      const nameInput = modal.locator('input[name="categorie"]');

      // Update name
      await nameInput.clear();
      await nameInput.fill('Updated Category');

      // Save
      await modal.locator('[data-testid="save-btn"]').click();

      // Modal should close
      await expect(modal).not.toBeVisible();

      // List should be updated
      await expect(firstRow.locator('td:nth-child(3)')).toContainText('Updated Category');
    });
  });

  test.describe('Modal for New Category', () => {
    test('should open modal with empty fields for new category', async () => {
      const addButton = page.locator('[data-testid="add-category-btn"]');
      await addButton.click();

      const modal = page.locator('.ant-modal');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('Nieuwe Categorie');

      // Fields should be empty
      const nameInput = modal.locator('input[name="categorie"]');
      await expect(nameInput).toHaveValue('');
    });

    test('should suggest default color for new category', async () => {
      const addButton = page.locator('[data-testid="add-category-btn"]');
      await addButton.click();

      const modal = page.locator('.ant-modal');
      const colorInput = modal.locator('input[name="color"]');

      // Should have a default color (not black or white)
      const colorValue = await colorInput.inputValue();
      expect(colorValue).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(colorValue).not.toBe('#000000');
      expect(colorValue).not.toBe('#FFFFFF');
    });

    test('should add new category and show in list', async () => {
      const addButton = page.locator('[data-testid="add-category-btn"]');
      await addButton.click();

      const modal = page.locator('.ant-modal');

      // Fill form
      await modal.locator('input[name="categorie"]').fill('New Test Category');
      await modal.locator('input[name="code"]').fill('TEST_NEW_001');

      // Save
      await modal.locator('[data-testid="save-btn"]').click();

      // Modal should close
      await expect(modal).not.toBeVisible();

      // New category should appear in list
      await expect(page.locator('tbody')).toContainText('New Test Category');
    });
  });

  test.describe('Column Layout Changes', () => {
    test('should display color column with visual block', async () => {
      const colorCells = page.locator('[data-testid="color-cell"]');
      const firstColorCell = colorCells.first();

      await expect(firstColorCell).toBeVisible();

      // Check for color block
      const colorBlock = firstColorCell.locator('div');
      const style = await colorBlock.getAttribute('style');
      expect(style).toContain('background-color');
    });

    test('should NOT display definition column', async () => {
      const headers = page.locator('thead th');
      const headerTexts = await headers.allTextContents();

      // Definition column should not exist
      expect(headerTexts).not.toContain('Definitie');
    });

    test('should display annotation count column', async () => {
      const headers = page.locator('thead th');
      const headerTexts = await headers.allTextContents();

      // Should have annotation count column
      expect(headerTexts).toContain('Annotations');

      // Check for count badges
      const countCells = page.locator('[data-testid="annotation-count"]');
      const firstCount = countCells.first();
      await expect(firstCount).toBeVisible();

      // Should show a number (including 0)
      const countText = await firstCount.textContent();
      expect(countText).toMatch(/\d+/);
    });

    test('should have correct column order', async () => {
      const headers = page.locator('thead th');
      const headerTexts = await headers.allTextContents();

      // Remove empty strings and normalize
      const cleanHeaders = headerTexts.filter(h => h.trim()).map(h => h.trim());

      // Expected order (checkbox, color, name, annotations, actions)
      expect(cleanHeaders[0]).toMatch(/kleur/i);
      expect(cleanHeaders[1]).toMatch(/categorie/i);
      expect(cleanHeaders[2]).toMatch(/annotations/i);
      expect(cleanHeaders[cleanHeaders.length - 1]).toMatch(/acties/i);
    });
  });

  test.describe('Sorting Functionality', () => {
    test('should sort by category name', async () => {
      const nameHeader = page.locator('thead th:has-text("Categorie")');

      // Click to sort ascending
      await nameHeader.click();
      await page.waitForTimeout(500);

      // Get first and last category names
      const rows = page.locator('tbody tr');
      const firstCategory = await rows.first().locator('td:nth-child(3)').textContent();
      const lastCategory = await rows.last().locator('td:nth-child(3)').textContent();

      // First should be alphabetically before last
      if (firstCategory && lastCategory) {
        expect(firstCategory.localeCompare(lastCategory)).toBeLessThanOrEqual(0);
      }
    });

    test('should sort by annotation count', async () => {
      const countHeader = page.locator('thead th:has-text("Annotations")');

      // Click to sort descending (most annotations first)
      await countHeader.click();
      await countHeader.click(); // Second click for descending
      await page.waitForTimeout(500);

      // Get annotation counts
      const countCells = page.locator('[data-testid="annotation-count"]');
      const counts = await countCells.allTextContents();
      const numbers = counts.map(c => parseInt(c) || 0);

      // Should be in descending order
      for (let i = 1; i < numbers.length; i++) {
        expect(numbers[i]).toBeLessThanOrEqual(numbers[i - 1]);
      }
    });
  });

  test.describe('Color Picker Integration', () => {
    test('should show color picker in modal', async () => {
      const firstRow = page.locator('tbody tr').first();
      const editButton = firstRow.locator('[data-testid="edit-btn"]');

      await editButton.click();

      const modal = page.locator('.ant-modal');
      const colorPicker = modal.locator('[data-testid="color-picker"]');

      await expect(colorPicker).toBeVisible();
    });

    test('should update color and reflect in list', async () => {
      const firstRow = page.locator('tbody tr').first();
      const editButton = firstRow.locator('[data-testid="edit-btn"]');

      await editButton.click();

      const modal = page.locator('.ant-modal');
      const colorInput = modal.locator('input[name="color"]');

      // Update color
      await colorInput.clear();
      await colorInput.fill('#FF5733');

      // Save
      await modal.locator('[data-testid="save-btn"]').click();

      // Wait for modal to close
      await expect(modal).not.toBeVisible();

      // Color should be updated in list
      const colorCell = firstRow.locator('[data-testid="color-cell"] div');
      const style = await colorCell.getAttribute('style');
      expect(style).toContain('#FF5733');
    });
  });

  test.describe('Performance', () => {
    test('should filter within 100ms for client-side filtering', async () => {
      const searchInput = page.locator('[data-testid="category-search"]');

      const startTime = Date.now();
      await searchInput.fill('test');

      // Wait for results to update
      await page.waitForSelector('[data-testid="filter-count"]:has-text("Toont")', {
        timeout: 100
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100);
    });

    test('should open modal within 50ms', async () => {
      const addButton = page.locator('[data-testid="add-category-btn"]');

      const startTime = Date.now();
      await addButton.click();

      // Wait for modal
      await page.waitForSelector('.ant-modal', { timeout: 50 });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(50);
    });
  });

  test.describe('Accessibility', () => {
    test('should support keyboard navigation in modal', async () => {
      const addButton = page.locator('[data-testid="add-category-btn"]');
      await addButton.click();

      const modal = page.locator('.ant-modal');

      // Tab through fields
      await page.keyboard.press('Tab');
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(['INPUT', 'TEXTAREA']).toContain(focusedElement);
    });

    test('should close modal with ESC key', async () => {
      const addButton = page.locator('[data-testid="add-category-btn"]');
      await addButton.click();

      const modal = page.locator('.ant-modal');
      await expect(modal).toBeVisible();

      // Press ESC
      await page.keyboard.press('Escape');

      // Modal should close
      await expect(modal).not.toBeVisible();
    });

    test('should have proper ARIA labels', async () => {
      // Check search input
      const searchInput = page.locator('[data-testid="category-search"]');
      await expect(searchInput).toHaveAttribute('aria-label', /search|zoek/i);

      // Check table
      const table = page.locator('[data-testid="categories-table"]');
      await expect(table).toHaveAttribute('role', 'table');
    });
  });
});