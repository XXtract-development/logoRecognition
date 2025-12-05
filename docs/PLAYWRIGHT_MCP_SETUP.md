# Playwright MCP Setup & Integration

**Datum:** 3 November 2024
**Status:** ✅ GEÏNSTALLEERD EN WERKEND

---

## 🎯 WAT IS PLAYWRIGHT MCP?

Playwright MCP (Model Context Protocol) is een geavanceerde browser automation server die:
- **AI-gestuurde testing** mogelijk maakt via Claude Code
- **Intelligent browser automation** biedt met context awareness
- **Cross-browser testing** ondersteunt (Chromium, Firefox, WebKit)
- **Visual regression testing** en screenshots automation mogelijk maakt

### Voordelen van MCP vs Standaard Playwright
- ✅ **AI Integration**: Claude Code kan direct met de browser communiceren
- ✅ **Context Bewustzijn**: MCP begrijpt de applicatie state
- ✅ **Slimmere Selectors**: AI-gegenereerde element selectie
- ✅ **Auto-healing Tests**: Tests passen zich aan bij UI wijzigingen

---

## ✅ INSTALLATIE STATUS

### 1. MCP Server ✅
```bash
# Installed via Claude Code
claude mcp add playwright-mcp npx @executeautomation/playwright-mcp-server

# Status: Connected
playwright-mcp: npx @executeautomation/playwright-mcp-server - ✓ Connected
```

### 2. Playwright Dependencies ✅
```bash
# Installed in workspace root
pnpm add -D @playwright/test playwright -w

# Browsers installed
npx playwright install
```

### 3. Project Configuration ✅
```
playwright.config.ts       # Root configuration
tests/e2e/example.spec.ts  # Example test suite
test-results/              # Test output directory
```

---

## 📁 PROJECT STRUCTURE

```
logoRecognition/
├── playwright.config.ts           # ✅ Playwright configuration
├── tests/
│   └── e2e/
│       ├── example.spec.ts        # ✅ Example test suite
│       └── (future tests here)
├── test-results/
│   ├── screenshots/               # ✅ Test screenshots
│   ├── results.json              # Test results (JSON)
│   ├── junit.xml                 # JUnit format
│   └── html/                     # HTML report
└── docs/
    └── PLAYWRIGHT_MCP_SETUP.md   # This document
```

---

## 🧪 TEST SUITES

### Example Test Suite (`tests/e2e/example.spec.ts`)

**Test Categories:**

1. **Basic Functionality** (5 tests)
   - Homepage loading
   - HTML structure validation
   - Responsive design testing
   - JavaScript error detection
   - PWA service worker check

2. **API Integration** (2 tests)
   - Health endpoint connectivity
   - CORS configuration verification

3. **Performance** (2 tests)
   - Page load time measurement
   - Basic performance metrics

**Total:** 9 comprehensive E2E tests

---

## 🚀 RUNNING TESTS

### Quick Commands

```bash
# Run all tests
npx playwright test

# Run with UI mode (recommended for development)
npx playwright test --ui

# Run specific test file
npx playwright test tests/e2e/example.spec.ts

# Run specific test by name
npx playwright test -g "should load homepage"

# Run in headed mode (show browser)
npx playwright test --headed

# Run only Chromium tests
npx playwright test --project=chromium

# Generate HTML report
npx playwright show-report
```

### Development Workflow

```bash
# Terminal 1: Start apps
cd apps/web && pnpm run dev    # Frontend on :3000
cd apps/api && pnpm run dev    # API on :8000

# Terminal 2: Run tests in UI mode
npx playwright test --ui

# Or run tests in watch mode
npx playwright test --watch
```

---

## 🎨 PLAYWRIGHT MCP CAPABILITIES

### Via Claude Code

Nu dat MCP is geïnstalleerd, kan je **via Claude Code** vragen:

**Examples:**
- "Test de homepage met Playwright MCP"
- "Maak een screenshot van de login pagina"
- "Vind alle klikbare elementen op de pagina"
- "Test of de formulier validatie werkt"
- "Controleer de responsive design op mobile"

Claude Code gebruikt dan de Playwright MCP server om:
1. Browser te starten
2. Naar de pagina te navigeren
3. Elementen te inspecteren
4. Acties uit te voeren
5. Assertions te maken
6. Screenshots/video's te maken

---

## 📊 TEST CONFIGURATION

### `playwright.config.ts` Features

```typescript
// Auto-start dev server voor tests
webServer: {
  command: 'cd apps/web && pnpm run dev',
  url: 'http://localhost:3000',
  reuseExistingServer: true
}

// Multiple browser support
projects: [
  'chromium',    // Desktop Chrome
  'firefox',     // Desktop Firefox
  'webkit',      // Desktop Safari
  'Mobile Chrome', // Pixel 5
  'Mobile Safari'  // iPhone 12
]

// Comprehensive reporting
reporter: [
  'html',        // Visual HTML report
  'json',        // JSON output
  'junit',       // CI/CD integration
  'list'         // Console output
]

// Smart retry & failure handling
retries: 2,              // Retry failed tests
screenshot: 'only-on-failure',
video: 'retain-on-failure',
trace: 'on-first-retry'
```

---

## 🔧 MCP INTEGRATION BENEFITS

### 1. AI-Powered Element Selection
```typescript
// Traditional Playwright
await page.locator('#submit-button').click();

// Via MCP (AI understands context)
// Claude: "Click the submit button"
// MCP finds it even if ID changes
```

### 2. Intelligent Waiting
```typescript
// MCP automatically waits for:
- Network idle
- DOM mutations
- JavaScript execution
- CSS animations
```

### 3. Auto-Healing Tests
```typescript
// If element selector breaks, MCP can:
- Find similar elements
- Suggest fixes
- Update tests automatically
```

### 4. Visual Testing
```typescript
// MCP can compare screenshots
- Detect visual regressions
- Highlight differences
- Generate reports
```

---

## 📈 EXPECTED TEST RESULTS

### Baseline Expectations

| Test Category | Expected Result |
|--------------|-----------------|
| **Homepage Load** | ✅ < 3s load time |
| **Console Errors** | ✅ 0 critical errors |
| **Responsive** | ✅ All viewports work |
| **API Health** | ✅ 200 OK response |
| **Performance** | ✅ DOM ready < 2s |
| **PWA** | ✅ Service worker active |

### Current Status
```bash
# Run this to check:
npx playwright test --reporter=list
```

---

## 🎯 NEXT STEPS

### 1. Expand Test Coverage
```bash
tests/e2e/
├── example.spec.ts        # ✅ Basic tests
├── logo-upload.spec.ts    # 📝 TODO: Upload functionality
├── recognition.spec.ts    # 📝 TODO: Logo recognition
├── training.spec.ts       # 📝 TODO: Model training
└── admin.spec.ts          # 📝 TODO: Admin features
```

### 2. Visual Regression Testing
```typescript
// Add to tests
await expect(page).toHaveScreenshot('homepage.png');
```

### 3. CI/CD Integration
```yaml
# .github/workflows/playwright.yml
- name: Run Playwright tests
  run: npx playwright test
- name: Upload test results
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
```

### 4. Performance Monitoring
```typescript
// Add Lighthouse integration
import { playAudit } from 'playwright-lighthouse';
```

---

## 🐛 TROUBLESHOOTING

### Common Issues

**Issue: "Browser not found"**
```bash
# Solution:
npx playwright install
```

**Issue: "Connection refused to localhost:3000"**
```bash
# Solution: Start dev server
cd apps/web && pnpm run dev
```

**Issue: "Tests timing out"**
```typescript
// Solution: Increase timeout in playwright.config.ts
use: {
  actionTimeout: 30000, // 30 seconds
}
```

**Issue: "MCP server not connected"**
```bash
# Solution: Restart Claude Code or run:
claude mcp list
claude mcp restart playwright-mcp
```

---

## 📚 RESOURCES

### Documentation
- [Playwright Docs](https://playwright.dev/)
- [Playwright MCP](https://github.com/executeautomation/playwright-mcp-server)
- [Best Practices](https://playwright.dev/docs/best-practices)

### Example Commands
```bash
# Debug tests
npx playwright test --debug

# Generate code
npx playwright codegen http://localhost:3000

# Show test trace
npx playwright show-trace trace.zip

# Update snapshots
npx playwright test --update-snapshots
```

---

## ✅ INSTALLATION CHECKLIST

- ✅ Playwright MCP server installed
- ✅ Playwright dependencies installed
- ✅ Browser binaries installed
- ✅ Configuration file created
- ✅ Example tests created
- ✅ Test directory structure setup
- ✅ MCP server verified connected
- ✅ Documentation created

---

## 🎉 SUMMARY

**Playwright MCP is now fully integrated with the Logo Recognition project!**

### What You Can Do Now:
1. ✅ Run E2E tests across multiple browsers
2. ✅ Use AI-powered test automation via Claude Code
3. ✅ Generate screenshots and videos automatically
4. ✅ Test responsive design on multiple devices
5. ✅ Validate API integration
6. ✅ Monitor performance metrics

### Run Your First Test:
```bash
npx playwright test --ui
```

This opens the **Playwright Test UI** where you can:
- See all tests
- Run tests interactively
- Debug failures
- View screenshots
- Inspect traces

---

**Status:** ✅ READY FOR TESTING
**Next Step:** Run `npx playwright test --ui` to start testing!

**Gemaakt door:** Mary (Business Analyst)
**Datum:** 3 November 2024
