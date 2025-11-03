#!/usr/bin/env python
"""
Comprehensive Test Runner
Runs all integration tests and reports results
"""

import subprocess
import sys
import json
from pathlib import Path
from typing import Dict, List

# Test suites to run
TEST_SUITES = [
    {
        "name": "Database Tests",
        "path": "tests/test_database.py",
        "critical": True
    },
    {
        "name": "Image Upload Tests",
        "path": "tests/test_image_upload.py",
        "critical": True
    },
    {
        "name": "Annotation Service Tests",
        "path": "tests/test_annotation_service.py",
        "critical": True
    },
    {
        "name": "Detection API Tests",
        "path": "tests/test_detection_api.py",
        "critical": True
    },
    {
        "name": "Training Pipeline Tests",
        "path": "tests/test_training_pipeline.py",
        "critical": True
    },
    {
        "name": "Batch Upload Tests",
        "path": "tests/test_batch_upload.py",
        "critical": False
    },
    {
        "name": "Storage Tests",
        "path": "tests/test_storage.py",
        "critical": False
    },
    {
        "name": "ML Model Tests",
        "path": "tests/test_ml_model.py",
        "critical": False
    },
    {
        "name": "Auth Tests",
        "path": "tests/test_auth_comprehensive.py",
        "critical": False
    },
]


def run_test_suite(test_path: str) -> Dict:
    """Run a single test suite and return results"""
    print(f"\n{'='*80}")
    print(f"Running: {test_path}")
    print(f"{'='*80}\n")

    cmd = [
        "python", "-m", "pytest",
        test_path,
        "-v",
        "--tb=short",
        "--no-cov",  # Disable coverage for speed
        "-p", "no:warnings",
        "--maxfail=5"  # Stop after 5 failures
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=Path(__file__).parent
    )

    # Parse output for pass/fail counts
    output = result.stdout + result.stderr
    passed = output.count(" PASSED")
    failed = output.count(" FAILED")
    errors = output.count(" ERROR")
    skipped = output.count(" SKIPPED")

    return {
        "path": test_path,
        "passed": passed,
        "failed": failed,
        "errors": errors,
        "skipped": skipped,
        "returncode": result.returncode,
        "output": output
    }


def print_summary(results: List[Dict]):
    """Print test summary"""
    print(f"\n\n{'='*80}")
    print("TEST SUMMARY")
    print(f"{'='*80}\n")

    total_passed = 0
    total_failed = 0
    total_errors = 0
    total_skipped = 0

    for i, (suite, result) in enumerate(zip(TEST_SUITES, results), 1):
        status = "✅ PASS" if result["returncode"] == 0 else "❌ FAIL"
        critical = "🔴 CRITICAL" if suite["critical"] else "⚪ NON-CRITICAL"

        print(f"{i}. {suite['name']:<40} {status} {critical}")
        print(f"   Passed: {result['passed']}, Failed: {result['failed']}, "
              f"Errors: {result['errors']}, Skipped: {result['skipped']}")

        total_passed += result["passed"]
        total_failed += result["failed"]
        total_errors += result["errors"]
        total_skipped += result["skipped"]

    print(f"\n{'='*80}")
    print(f"OVERALL RESULTS")
    print(f"{'='*80}")
    print(f"Total Passed:  {total_passed}")
    print(f"Total Failed:  {total_failed}")
    print(f"Total Errors:  {total_errors}")
    print(f"Total Skipped: {total_skipped}")
    print(f"{'='*80}\n")

    # Calculate pass rate
    total_tests = total_passed + total_failed + total_errors
    if total_tests > 0:
        pass_rate = (total_passed / total_tests) * 100
        print(f"Pass Rate: {pass_rate:.1f}%")

        if pass_rate == 100:
            print("🎉 ALL TESTS PASSED! 100% SUCCESS!")
            return 0
        elif pass_rate >= 90:
            print("✅ Excellent! >= 90% pass rate")
            return 0
        elif pass_rate >= 80:
            print("⚠️  Good, but needs improvement (80-90%)")
            return 1
        else:
            print("❌ CRITICAL: Pass rate below 80%")
            return 1
    else:
        print("❌ NO TESTS EXECUTED")
        return 1


def main():
    """Main test runner"""
    print("="*80)
    print("COMPREHENSIVE INTEGRATION TEST SUITE")
    print("="*80)
    print(f"Running {len(TEST_SUITES)} test suites...")

    results = []

    for suite in TEST_SUITES:
        test_path = suite["path"]

        # Check if test file exists
        if not Path(test_path).exists():
            print(f"\n⚠️  Skipping {suite['name']}: File not found")
            results.append({
                "path": test_path,
                "passed": 0,
                "failed": 0,
                "errors": 1,
                "skipped": 0,
                "returncode": 1,
                "output": "Test file not found"
            })
            continue

        result = run_test_suite(test_path)
        results.append(result)

        # If critical test fails, note it but continue
        if suite["critical"] and result["returncode"] != 0:
            print(f"\n⚠️  CRITICAL TEST FAILED: {suite['name']}")

    # Print summary
    exit_code = print_summary(results)

    # Save detailed results
    results_file = Path("test_results.json")
    with open(results_file, "w") as f:
        json.dump({
            "suites": TEST_SUITES,
            "results": results
        }, f, indent=2)

    print(f"\nDetailed results saved to: {results_file}")

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
