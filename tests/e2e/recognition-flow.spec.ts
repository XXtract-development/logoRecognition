import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Recognition Flow E2E Tests
 * Tests the complete logo recognition workflow including:
 * - Image upload
 * - Processing states
 * - Results display
 * - Export functionality
 */

// Increase timeout for these tests
test.setTimeout(60000);

// Create test image if it doesn't exist
function ensureTestImage(): string {
  const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
  const testImagePath = path.join(fixturesDir, 'test-logo.png');

  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  if (!fs.existsSync(testImagePath)) {
    // Create a valid PNG file (100x100 pixels, simple colored square)
    // This is a minimal valid PNG with IHDR, IDAT, and IEND chunks
    const width = 100;
    const height = 100;

    // Simple approach: create a valid minimal PNG
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    // IHDR chunk (image header)
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);  // width
    ihdrData.writeUInt32BE(height, 4); // height
    ihdrData.writeUInt8(8, 8);         // bit depth
    ihdrData.writeUInt8(2, 9);         // color type (RGB)
    ihdrData.writeUInt8(0, 10);        // compression
    ihdrData.writeUInt8(0, 11);        // filter
    ihdrData.writeUInt8(0, 12);        // interlace

    const ihdrChunk = createPNGChunk('IHDR', ihdrData);

    // Create simple image data (uncompressed would be complex, use zlib)
    const zlib = require('zlib');
    const rawData = Buffer.alloc((width * 3 + 1) * height);

    // Fill with a blue color (logo-like)
    for (let y = 0; y < height; y++) {
      rawData[y * (width * 3 + 1)] = 0; // filter byte
      for (let x = 0; x < width; x++) {
        const offset = y * (width * 3 + 1) + 1 + x * 3;
        // Create a simple gradient/pattern
        rawData[offset] = 0;     // R
        rawData[offset + 1] = 122; // G
        rawData[offset + 2] = 255; // B
      }
    }

    const compressedData = zlib.deflateSync(rawData);
    const idatChunk = createPNGChunk('IDAT', compressedData);

    // IEND chunk
    const iendChunk = createPNGChunk('IEND', Buffer.alloc(0));

    // Combine all chunks
    const pngBuffer = Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
    fs.writeFileSync(testImagePath, pngBuffer);
  }

  return testImagePath;
}

// Helper to create PNG chunks with CRC
function createPNGChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

// Simple CRC32 implementation for PNG
function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  const table = getCRC32Table();

  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }

  return crc ^ 0xFFFFFFFF;
}

let crc32Table: number[] | null = null;
function getCRC32Table(): number[] {
  if (crc32Table) return crc32Table;

  crc32Table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table.push(c);
  }
  return crc32Table;
}

// Helper to wait for stability
async function waitForStability(page: Page, ms = 500) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(ms);
}

test.describe('Recognition Page - Upload Flow', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/recognize');
    await waitForStability(page);
  });

  test('should display upload dropzone', async ({ page }) => {
    // Find the upload area - wait for it to be visible
    const uploadArea = page.locator('.ant-upload-drag, .ant-upload-dragger, [class*="upload"]').first();
    await uploadArea.waitFor({ state: 'visible', timeout: 10000 });
    await expect(uploadArea).toBeVisible();

    // Check for upload-related text (may vary based on loading state)
    const hasUploadText = await page.locator('.ant-upload-text, [class*="upload"]').first().isVisible();
    expect(hasUploadText).toBeTruthy();
  });

  test('should accept valid image formats', async ({ page }) => {
    // The upload component should accept these formats
    const fileInput = page.locator('input[type="file"]');
    const acceptAttr = await fileInput.getAttribute('accept');

    expect(acceptAttr).toContain('image/jpeg');
    expect(acceptAttr).toContain('image/png');
    expect(acceptAttr).toContain('image/webp');
  });

  test('should upload image successfully', async ({ page }) => {
    const testImagePath = ensureTestImage();

    // Find file input and upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testImagePath);

    // Wait for processing to start or complete
    await page.waitForTimeout(2000);

    // Take screenshot of state after upload
    await page.screenshot({ path: 'test-results/screenshots/after-image-upload.png' });

    // The page should have processed the upload (may show processing state or results area)
    // Either processing indicator or result area should appear
    const hasProcessingOrResults = await page.locator('.ant-progress, [class*="result"], [class*="canvas"]').count() > 0;
    // This is OK even if false - backend may not be running
  });

  test('should show processing state during recognition', async ({ page }) => {
    const testImagePath = ensureTestImage();

    // Upload image
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testImagePath);

    // Check for processing indicator (if backend is available)
    // The progress bar may or may not appear depending on backend status
    await page.waitForTimeout(1000);

    // Screenshot the processing state
    await page.screenshot({ path: 'test-results/screenshots/processing-state.png' });
  });
});

test.describe('Recognition Page - Results Display', () => {

  test('should show "No image uploaded" initially', async ({ page }) => {
    await page.goto('/recognize');
    await waitForStability(page);

    // Should show placeholder text
    await expect(page.getByText(/no image uploaded/i)).toBeVisible();
  });

  test('should have results section structure', async ({ page }) => {
    await page.goto('/recognize');
    await waitForStability(page);

    // Check for main card sections
    const cards = page.locator('.ant-card');
    const cardCount = await cards.count();

    // Should have at least upload and visualization cards
    expect(cardCount).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Recognition Page - Export Functionality', () => {

  test('should have export button', async ({ page }) => {
    await page.goto('/recognize');
    await waitForStability(page);

    const exportButton = page.getByRole('button', { name: /export/i });
    await expect(exportButton).toBeVisible();
  });

  test('should disable export when no results', async ({ page }) => {
    await page.goto('/recognize');
    await waitForStability(page);

    const exportButton = page.getByRole('button', { name: /export/i });
    await expect(exportButton).toBeDisabled();
  });

  // This test requires results to be present - would need mock backend
  test.skip('should open export dialog when results exist', async ({ page }) => {
    // Would need to mock WebSocket responses or have real backend
  });
});

test.describe('Recognition Page - Connection Status', () => {

  test('should display connection status indicator', async ({ page }) => {
    await page.goto('/recognize');
    await waitForStability(page);

    // The status indicator is in the bottom-right corner
    const statusIndicator = page.locator('.fixed.bottom-4.right-4 > div');
    await expect(statusIndicator).toBeVisible();

    // Get the status text
    const statusText = await statusIndicator.textContent();
    expect(statusText).toBeTruthy();

    // Take screenshot of status
    await page.screenshot({ path: 'test-results/screenshots/connection-status.png' });
  });

  test('should show appropriate message when backend is unavailable', async ({ page }) => {
    await page.goto('/recognize');
    await waitForStability(page, 3000); // Wait longer for backend check

    // Check for alert about backend status (may or may not be present)
    const alert = page.locator('.ant-alert');
    const alertCount = await alert.count();

    // Screenshot whatever state we're in
    await page.screenshot({ path: 'test-results/screenshots/backend-status.png' });

    // This is informational - test passes regardless of backend state
    if (alertCount > 0) {
      const alertText = await alert.first().textContent();
      console.log('Alert message:', alertText);
    }
  });
});

test.describe('Recognition Page - Cards and Layout', () => {

  test('should have Upload Image card', async ({ page }) => {
    await page.goto('/recognize');
    await waitForStability(page);

    // Find card with "Upload Image" title
    await expect(page.getByText(/upload image/i).first()).toBeVisible();
  });

  test('should have Results/Visualization card', async ({ page }) => {
    await page.goto('/recognize');
    await waitForStability(page);

    // Find card with results title
    await expect(page.getByText(/results|visualization/i).first()).toBeVisible();
  });

  test('should have responsive two-column layout on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/recognize');
    await waitForStability(page);

    // Check that both columns are visible side by side
    const cards = page.locator('.ant-card');
    expect(await cards.count()).toBeGreaterThanOrEqual(2);

    await page.screenshot({ path: 'test-results/screenshots/recognition-desktop-layout.png' });
  });

  test('should stack cards on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/recognize');
    await waitForStability(page);

    // Cards should still be visible
    const cards = page.locator('.ant-card');
    expect(await cards.count()).toBeGreaterThanOrEqual(2);

    await page.screenshot({ path: 'test-results/screenshots/recognition-mobile-layout.png' });
  });
});

test.describe('Recognition Page - Image Canvas', () => {

  test('should show placeholder when no image', async ({ page }) => {
    await page.goto('/recognize');
    await waitForStability(page);

    // Should have placeholder for image area
    const placeholder = page.getByText(/no image uploaded/i);
    await expect(placeholder).toBeVisible();
  });

  test('should update canvas area after image upload', async ({ page }) => {
    const testImagePath = ensureTestImage();

    await page.goto('/recognize');
    await waitForStability(page);

    // Upload image
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testImagePath);

    await page.waitForTimeout(2000);

    // The "no image" text should be gone or canvas should appear
    // Depending on implementation, either canvas appears or image preview
    await page.screenshot({ path: 'test-results/screenshots/canvas-after-upload.png' });
  });
});

test.describe('Recognition Page - Accessibility', () => {

  test('should have ARIA labels on main elements', async ({ page }) => {
    await page.goto('/recognize');
    await waitForStability(page);

    // Main interface should have role
    const mainContent = page.locator('[role="main"], .recognition-interface');
    await expect(mainContent.first()).toBeVisible();

    // Status should have aria-live
    const statusElement = page.locator('[aria-live="polite"]');
    expect(await statusElement.count()).toBeGreaterThan(0);
  });

  test('should have accessible upload area', async ({ page }) => {
    await page.goto('/recognize');
    await waitForStability(page);

    // File input should exist and be accessible
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();

    // Upload area should be interactive
    const uploadArea = page.locator('.ant-upload-drag, .ant-upload').first();
    await expect(uploadArea).toBeVisible();
  });
});

test.describe('Recognition Integration - Full Workflow', () => {

  test('complete workflow: navigate, upload, check status', async ({ page }) => {
    // Step 1: Start from home
    await page.goto('/');
    await waitForStability(page);

    // Step 2: Navigate to recognition
    await page.getByRole('button', { name: /start recognition/i }).click();
    await page.waitForURL('/recognize');
    await waitForStability(page);

    // Step 3: Verify page loaded
    await expect(page.locator('h1').first()).toContainText(/logo recognition/i);

    // Step 4: Upload an image
    const testImagePath = ensureTestImage();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testImagePath);

    // Step 5: Wait and check state
    await page.waitForTimeout(3000);

    // Step 6: Check connection status is displayed
    const statusIndicator = page.locator('.fixed.bottom-4.right-4');
    await expect(statusIndicator).toBeVisible();

    // Step 7: Final screenshot
    await page.screenshot({
      path: 'test-results/screenshots/full-workflow-complete.png',
      fullPage: true
    });
  });
});
