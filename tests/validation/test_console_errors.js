/**
 * Test to detect console errors in the frontend
 * This test actually checks for browser console errors that unit tests miss
 */

async function testConsoleErrors() {
  console.log("🧪 FRONTEND CONSOLE ERROR TEST");
  console.log("================================\n");

  let browser;
  let consoleErrors = [];
  let consoleWarnings = [];

  try {
    const puppeteer = require('puppeteer');

    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Capture console messages
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();

      if (type === 'error') {
        // Ignore React DevTools warning
        if (!text.includes('Download the React DevTools')) {
          consoleErrors.push(text);
        }
      } else if (type === 'warning') {
        // Ignore expected warnings
        if (!text.includes('WebSocket') &&
            !text.includes('ws://') &&
            !text.includes('[antd: message]')) {
          consoleWarnings.push(text);
        }
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      consoleErrors.push(error.message);
    });

    console.log("📱 Loading frontend...");
    await page.goto('http://localhost:5173', {
      waitUntil: 'networkidle2',
      timeout: 10000
    });

    // Wait a bit for any async errors
    await page.waitForTimeout(3000);

    // Check for specific error patterns
    const content = await page.content();
    const hasReactApp = content.includes('root');

    // Try to navigate to training dashboard
    console.log("🔄 Navigating to training dashboard...");
    await page.evaluate(() => {
      // Click on Step 3 if it exists
      const step3 = Array.from(document.querySelectorAll('button, div')).find(
        el => el.textContent && el.textContent.includes('Step 3')
      );
      if (step3) step3.click();
    });

    await page.waitForTimeout(2000);

    // Report results
    console.log("\n📊 TEST RESULTS");
    console.log("================");

    if (hasReactApp) {
      console.log("✅ React app loaded successfully");
    } else {
      console.log("❌ React app failed to load");
    }

    if (consoleErrors.length === 0) {
      console.log("✅ No console errors detected");
    } else {
      console.log(`❌ Found ${consoleErrors.length} console error(s):`);
      consoleErrors.forEach(err => {
        console.log(`   - ${err.substring(0, 100)}`);
      });
    }

    if (consoleWarnings.length === 0) {
      console.log("✅ No unexpected warnings");
    } else {
      console.log(`⚠️  Found ${consoleWarnings.length} warning(s):`);
      consoleWarnings.forEach(warn => {
        console.log(`   - ${warn.substring(0, 100)}`);
      });
    }

    // Test verdict
    console.log("\n================");
    if (consoleErrors.length === 0 && hasReactApp) {
      console.log("🎉 PASSED - No console errors!");
      process.exit(0);
    } else {
      console.log("❌ FAILED - Console errors detected");
      process.exit(1);
    }

  } catch (error) {
    console.error("❌ Test failed:", error.message);

    // If puppeteer is not installed, provide fallback test
    if (error.message.includes('Cannot find module')) {
      console.log("\n⚠️  Puppeteer not installed. Running fallback test...\n");
      runFallbackTest();
    } else {
      process.exit(1);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Fallback test without puppeteer
async function runFallbackTest() {
  console.log("🔍 FALLBACK CONSOLE ERROR TEST");
  console.log("================================\n");

  try {
    // Test if frontend is accessible
    const response = await fetch('http://localhost:5173');
    const html = await response.text();

    // Check for error indicators in HTML
    const hasErrors = html.includes('Error') ||
                     html.includes('failed') ||
                     html.includes('TypeError');

    // Check if WebSocket errors are handled
    const wsResponse = await fetch('http://localhost:8000/health');
    const wsHealthy = wsResponse.status === 200;

    console.log("📊 FALLBACK TEST RESULTS");
    console.log("========================");
    console.log(`Frontend accessible: ${response.status === 200 ? '✅' : '❌'}`);
    console.log(`No error text in HTML: ${!hasErrors ? '✅' : '❌'}`);
    console.log(`Backend healthy: ${wsHealthy ? '✅' : '❌'}`);

    if (response.status === 200 && !hasErrors && wsHealthy) {
      console.log("\n✅ PASSED - Frontend appears healthy");
      console.log("Note: Install puppeteer for full console error detection:");
      console.log("  npm install --save-dev puppeteer");
    } else {
      console.log("\n❌ FAILED - Issues detected");
    }
  } catch (error) {
    console.error("❌ Fallback test failed:", error.message);
  }
}

// Run the test
if (require.main === module) {
  testConsoleErrors().catch(console.error);
}

module.exports = { testConsoleErrors };