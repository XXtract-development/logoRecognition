#!/usr/bin/env python3
"""Test the API endpoints with the new category fields"""

import requests
import json

BASE_URL = "http://localhost:8000"

def test_api():
    """Test the category API with new fields"""
    print("🧪 Testing Category API with new fields")
    print("=" * 50)

    # Test 1: Create a category with color and description
    print("\n1️⃣ Creating new category with color and description...")
    new_category = {
        "categorie": "API_TEST",
        "code": "API001",
        "categorie_naam": "API Test Category",
        "code_naam": "API Test Code",
        "definitie": "Test definition for API",
        "color": "#FF6B6B",
        "description": "This is a test category created via API to verify the new fields work correctly"
    }

    try:
        response = requests.post(f"{BASE_URL}/api/v1/categories/", json=new_category)
        if response.status_code == 200:
            created = response.json()
            print(f"   ✓ Category created successfully!")
            print(f"     ID: {created.get('id')}")
            print(f"     Color: {created.get('color')}")
            print(f"     Description: {created.get('description')}")
            category_id = created.get('id')
        else:
            print(f"   ✗ Failed to create category: {response.status_code}")
            print(f"     Response: {response.text}")
            return False

        # Test 2: Get categories with search
        print("\n2️⃣ Testing search functionality...")
        response = requests.get(f"{BASE_URL}/api/v1/categories/?search=API_TEST")
        if response.status_code == 200:
            data = response.json()
            print(f"   ✓ Search successful! Found {data.get('total', 0)} categories")
            if data.get('items'):
                item = data['items'][0]
                print(f"     Annotation count: {item.get('annotation_count', 0)}")
        else:
            print(f"   ✗ Search failed: {response.status_code}")

        # Test 3: Update category
        print("\n3️⃣ Updating category color and description...")
        update_data = {
            "color": "#00D9FF",
            "description": "Updated description via API test"
        }
        response = requests.put(f"{BASE_URL}/api/v1/categories/{category_id}", json=update_data)
        if response.status_code == 200:
            updated = response.json()
            print(f"   ✓ Category updated successfully!")
            print(f"     New color: {updated.get('color')}")
            print(f"     New description: {updated.get('description')}")
        else:
            print(f"   ✗ Update failed: {response.status_code}")

        # Test 4: Get paginated results
        print("\n4️⃣ Testing pagination...")
        response = requests.get(f"{BASE_URL}/api/v1/categories/?limit=5&skip=0&sort_by=code&sort_order=asc")
        if response.status_code == 200:
            data = response.json()
            print(f"   ✓ Pagination works! Returned {len(data.get('items', []))} items")
            print(f"     Total count: {data.get('total', 0)}")
            print(f"     Pages: {data.get('pages', 0)}")
        else:
            print(f"   ✗ Pagination failed: {response.status_code}")

        # Test 5: Delete test category
        print("\n5️⃣ Cleaning up test data...")
        response = requests.delete(f"{BASE_URL}/api/v1/categories/{category_id}")
        if response.status_code == 200:
            print(f"   ✓ Test category deleted successfully!")
        else:
            print(f"   ✗ Delete failed: {response.status_code}")

        print("\n✅ All API tests completed successfully!")
        return True

    except requests.exceptions.ConnectionError:
        print("\n❌ Cannot connect to API. Make sure the backend server is running:")
        print("   cd backend && uvicorn app.main:app --reload")
        return False
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    test_api()