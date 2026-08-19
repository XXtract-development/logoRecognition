import { test, expect } from '@playwright/test';

/**
 * Console Error Detection Tests
 *
 * Deze tests starten de browser en monitoren de F12 console op errors.
 * Handig voor het detecteren van runtime JavaScript errors, failed requests, etc.
 */

test.describe('Console Error Detection', () => {

  test('app should load without console errors', async ({ page }) => {
    // Verzamel alle console messages
    const consoleMessages: { type: string; text: string; location: string }[] = [];
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];

    // Monitor console messages
    page.on('console', msg => {
      const entry = {
        type: msg.type(),
        text: msg.text(),
        location: msg.location().url || 'unknown'
      };
      consoleMessages.push(entry);

      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Monitor page errors (uncaught exceptions)
    const pageErrors: Error[] = [];
    page.on('pageerror', error => {
      pageErrors.push(error);
    });

    // Monitor failed network requests
    page.on('requestfailed', request => {
      networkErrors.push(`${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Navigate to app
    await page.goto('/');

    // Wait for app to fully load
    await page.waitForLoadState('networkidle');

    // Extra wait for async operations
    await page.waitForTimeout(3000);

    // Log all console output for debugging
    console.log('\n📋 Console Output Summary:');
    console.log(`   Total messages: ${consoleMessages.length}`);
    console.log(`   Errors: ${consoleErrors.length}`);
    console.log(`   Network failures: ${networkErrors.length}`);
    console.log(`   Page errors: ${pageErrors.length}`);

    if (consoleErrors.length > 0) {
      console.log('\n❌ Console Errors:');
      consoleErrors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
    }

    if (networkErrors.length > 0) {
      console.log('\n🌐 Network Errors:');
      networkErrors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
    }

    if (pageErrors.length > 0) {
      console.log('\n💥 Page Errors (Uncaught Exceptions):');
      pageErrors.forEach((err, i) => console.log(`   ${i + 1}. ${err.message}`));
    }

    // Filter out known/expected errors
    const criticalConsoleErrors = consoleErrors.filter(err =>
      !err.includes('Download the React DevTools') &&
      !err.includes('favicon.ico') &&
      !err.includes('manifest.json')
    );

    // Filter network errors (ignore expected API failures during dev)
    const criticalNetworkErrors = networkErrors.filter(err =>
      !err.includes('/api/') && // API calls might fail without backend
      !err.includes('favicon.ico') &&
      !err.includes('manifest.json')
    );

    // Assertions
    expect(pageErrors, 'Should have no uncaught JavaScript exceptions').toHaveLength(0);
    expect(criticalConsoleErrors, 'Should have no critical console errors').toHaveLength(0);

    // Network errors are warnings, not failures (APIs might not be fully configured)
    if (criticalNetworkErrors.length > 0) {
      console.log('\n⚠️  Warning: Some network requests failed (non-critical)');
    }
  });

  test('app should render main content', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that root element exists and has content
    const root = page.locator('#root');
    await expect(root).toBeAttached();

    // Check that something rendered inside root
    const rootContent = await root.innerHTML();
    expect(rootContent.length).toBeGreaterThan(0);

    // Take screenshot for visual verification
    await page.screenshot({
      path: 'test-results/screenshots/app-loaded.png',
      fullPage: true
    });

    console.log('✅ App rendered successfully');
    console.log(`   Root content length: ${rootContent.length} characters`);
  });

  test('app should have correct page title', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const title = await page.title();
    console.log(`📄 Page title: "${title}"`);

    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('app should respond to user interaction without errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', error => {
      errors.push(`PageError: ${error.message}`);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Try clicking on interactive elements (if any exist)
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    if (buttonCount > 0) {
      console.log(`🖱️  Found ${buttonCount} button(s), testing first one...`);
      try {
        await buttons.first().click({ timeout: 2000 });
        await page.waitForTimeout(1000);
      } catch {
        console.log('   Button click skipped (might be disabled or hidden)');
      }
    }

    // Try clicking on links (if any exist)
    const links = page.locator('a[href]');
    const linkCount = await links.count();
    console.log(`🔗 Found ${linkCount} link(s)`);

    // Filter critical errors
    const criticalErrors = errors.filter(err =>
      !err.includes('Download the React DevTools') &&
      !err.includes('Failed to load resource')
    );

    expect(criticalErrors, 'Should have no errors during interaction').toHaveLength(0);
  });

  test('detailed console monitoring', async ({ page }) => {
    // This test provides detailed console output for debugging
    const logs: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const info: string[] = [];

    page.on('console', msg => {
      const text = msg.text();
      switch (msg.type()) {
        case 'log':
          logs.push(text);
          break;
        case 'warning':
          warnings.push(text);
          break;
        case 'error':
          errors.push(text);
          break;
        case 'info':
          info.push(text);
          break;
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('\n📊 Detailed Console Report:');
    console.log('═'.repeat(50));

    console.log(`\n📝 Logs (${logs.length}):`);
    logs.slice(0, 10).forEach(l => console.log(`   • ${l.substring(0, 100)}`));
    if (logs.length > 10) console.log(`   ... and ${logs.length - 10} more`);

    console.log(`\n⚠️  Warnings (${warnings.length}):`);
    warnings.slice(0, 5).forEach(w => console.log(`   • ${w.substring(0, 100)}`));
    if (warnings.length > 5) console.log(`   ... and ${warnings.length - 5} more`);

    console.log(`\n❌ Errors (${errors.length}):`);
    errors.forEach(e => console.log(`   • ${e.substring(0, 150)}`));

    console.log(`\nℹ️  Info (${info.length}):`);
    info.slice(0, 5).forEach(i => console.log(`   • ${i.substring(0, 100)}`));

    console.log('\n' + '═'.repeat(50));

    // Only fail on critical JS errors, not network errors
    const jsErrors = errors.filter(e =>
      !e.includes('Failed to load resource') &&
      !e.includes('net::ERR_') &&
      !e.includes('Download the React DevTools')
    );

    expect(jsErrors, 'Should have no JavaScript errors').toHaveLength(0);
  });
});
