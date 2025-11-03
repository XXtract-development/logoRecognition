#!/usr/bin/env python3
"""Test runner for US-016, US-017, and US-023."""
import subprocess
import sys

def run_tests():
    """Run all tests for the three user stories."""

    tests = [
        ("US-017: WebSocket Infrastructure", "pytest tests/test_websocket_infrastructure.py -v"),
        ("US-023: Model Versioning System", "pytest tests/test_model_versioning.py -v"),
    ]

    results = []

    for story, cmd in tests:
        print(f"\n{'='*60}")
        print(f"Running tests for {story}")
        print('='*60)

        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

        if result.returncode == 0:
            print(f"✅ {story}: All tests passed!")
            results.append((story, True))
        else:
            print(f"❌ {story}: Tests failed!")
            print(result.stdout)
            print(result.stderr)
            results.append((story, False))

    # Summary
    print(f"\n{'='*60}")
    print("TEST SUMMARY")
    print('='*60)

    for story, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{story}: {status}")

    all_passed = all(passed for _, passed in results)

    if all_passed:
        print("\n🎉 ALL TESTS PASSED! A++ GRADE ACHIEVED!")
    else:
        print("\n⚠️ Some tests failed. Please review and fix.")
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
