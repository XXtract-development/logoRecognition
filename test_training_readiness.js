/**
 * Test script to verify Training Readiness Overview is displayed
 */

console.log("🔍 Testing Training Readiness Overview...\n");

// Test the API endpoints
async function testAPI() {
  try {
    // Test readiness endpoint
    const readinessResponse = await fetch('http://localhost:8000/api/training/readiness');
    const readinessData = await readinessResponse.json();

    console.log("✅ Training Readiness API Response:");
    console.log(JSON.stringify(readinessData, null, 2));

    // Test categories endpoint
    const categoriesResponse = await fetch('http://localhost:8000/api/categories');
    const categoriesData = await categoriesResponse.json();

    console.log("\n✅ Categories API Response:");
    console.log(JSON.stringify(categoriesData, null, 2));

    // Test dataset endpoint
    const datasetResponse = await fetch('http://localhost:8000/api/v1/training/dataset');
    const datasetData = await datasetResponse.json();

    console.log("\n✅ Dataset API Response:");
    console.log(JSON.stringify(datasetData, null, 2));

    console.log("\n🎯 Summary:");
    console.log(`- Training Ready: ${readinessData.ready ? '✅ Yes' : '❌ No'}`);
    console.log(`- Total Images: ${readinessData.total_images}`);
    console.log(`- Total Annotations: ${readinessData.total_annotations}`);
    console.log(`- Categories Available: ${categoriesData.length}`);

    if (readinessData.ready) {
      console.log("\n✨ The Training Readiness Overview should display:");
      console.log("- A green status indicator showing 'Ready for Training'");
      console.log("- Statistics showing images and annotations count");
      console.log("- Category breakdown if available");
      console.log("- Training button should be enabled");
    } else {
      console.log("\n⚠️ Training is not ready. The overview should show:");
      console.log("- What's missing (images or annotations)");
      console.log("- Progress indicators");
      console.log("- Training button should be disabled");
    }

  } catch (error) {
    console.error("❌ Error testing API:", error);
  }
}

// Run the test
testAPI();