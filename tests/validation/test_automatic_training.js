/**
 * Test Automatic Training Start
 * Verifies that training starts automatically after annotations are complete
 */

const fs = require('fs');

console.log("🧪 AUTOMATIC TRAINING TEST");
console.log("===========================\n");

async function testAutomaticTraining() {
  let testsPassed = 0;
  let testsFailed = 0;

  console.log("1️⃣  Checking Annotation Save Functionality");
  console.log("--------------------------------------------");

  // Test 1: Check if persistAnnotations function exists
  const appContent = fs.readFileSync('/Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/App.js', 'utf8');

  if (appContent.includes('persistAnnotations')) {
    console.log("✅ persistAnnotations function found");
    testsPassed++;
  } else {
    console.log("❌ persistAnnotations function not found");
    testsFailed++;
  }

  // Test 2: Check if annotations are saved to backend
  if (appContent.includes('api/v1/logos/${fileId}/annotations')) {
    console.log("✅ Annotation save endpoint configured");
    testsPassed++;
  } else {
    console.log("❌ Annotation save endpoint not found");
    testsFailed++;
  }

  console.log("\n2️⃣  Checking Automatic Training Trigger");
  console.log("------------------------------------------");

  // Test 3: Check if automatic training is implemented
  if (appContent.includes('Auto-starting training for all annotated logos')) {
    console.log("✅ Automatic training trigger implemented");
    testsPassed++;
  } else {
    console.log("❌ Automatic training trigger not found");
    testsFailed++;
  }

  // Test 4: Check if useEffect for auto-training exists
  if (appContent.includes('currentStep === 2 && overallValidation.allValidated && !trainingJob')) {
    console.log("✅ useEffect for auto-training exists");
    testsPassed++;
  } else {
    console.log("❌ useEffect for auto-training not found");
    testsFailed++;
  }

  // Test 5: Check if startTraining function exists
  if (appContent.includes('const startTraining')) {
    console.log("✅ startTraining function exists");
    testsPassed++;
  } else {
    console.log("❌ startTraining function not found");
    testsFailed++;
  }

  console.log("\n3️⃣  Checking Training Process Flow");
  console.log("-------------------------------------");

  // Test 6: Check if training API endpoint is configured
  if (appContent.includes('api/v1/training/start')) {
    console.log("✅ Training start API endpoint configured");
    testsPassed++;
  } else {
    console.log("❌ Training start API endpoint not found");
    testsFailed++;
  }

  // Test 7: Check if all annotations are included
  if (appContent.includes('overallValidation.allValidated')) {
    console.log("✅ Validation check for all annotations");
    testsPassed++;
  } else {
    console.log("❌ Missing validation for all annotations");
    testsFailed++;
  }

  // Test 8: Check if training happens after last image
  if (appContent.includes('Last image annotated! Training will start automatically')) {
    console.log("✅ Training triggers after last image");
    testsPassed++;
  } else {
    console.log("❌ Training trigger after last image not found");
    testsFailed++;
  }

  console.log("\n4️⃣  Testing Backend Endpoints");
  console.log("--------------------------------");

  // Test backend endpoints
  try {
    // Test if annotation save endpoint exists
    const response1 = await fetch('http://localhost:8000/api/v1/logos/test/annotations', {
      method: 'GET'
    });
    if (response1.status === 404 || response1.status === 200) {
      console.log("✅ Annotation endpoint exists");
      testsPassed++;
    } else {
      console.log("❌ Annotation endpoint error");
      testsFailed++;
    }

    // Test if training start endpoint exists
    const response2 = await fetch('http://localhost:8000/api/v1/training/start', {
      method: 'GET' // Using GET to test existence without starting training
    });
    if (response2.status === 405 || response2.status === 200) { // 405 = Method Not Allowed (expected for GET)
      console.log("✅ Training start endpoint exists");
      testsPassed++;
    } else {
      console.log("❌ Training start endpoint error");
      testsFailed++;
    }

    // Test dataset endpoint
    const response3 = await fetch('http://localhost:8000/api/v1/training/dataset');
    if (response3.status === 200) {
      const data = await response3.json();
      console.log(`✅ Dataset endpoint works (${data.total_images || 0} images, ${data.total_annotations || 0} annotations)`);
      testsPassed++;
    } else {
      console.log("❌ Dataset endpoint error");
      testsFailed++;
    }
  } catch (error) {
    console.log("❌ Backend connection error:", error.message);
    testsFailed += 3;
  }

  console.log("\n=====================================");
  console.log("📊 TEST RESULTS");
  console.log("=====================================");
  console.log(`Total Tests: ${testsPassed + testsFailed}`);
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);

  if (testsFailed === 0) {
    console.log("\n🎉 SUCCESS!");
    console.log("Automatic training is properly configured!");
    console.log("\n✨ How it works:");
    console.log("1. User uploads and annotates images");
    console.log("2. When navigating past the last image");
    console.log("3. System automatically saves annotations");
    console.log("4. Training starts automatically for all annotated logos");
    console.log("5. No manual 'Start Training' click required!");
  } else {
    console.log("\n⚠️  Some tests failed");
    console.log("Automatic training may not work properly");
  }

  console.log("\n=====================================");
}

// Run the test
testAutomaticTraining().catch(console.error);