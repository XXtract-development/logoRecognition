#!/usr/bin/env python3
"""Test the category endpoint to find the error"""

import sys
sys.path.insert(0, '/Users/frisovanweelden/Documents/projects/logoRecognition/backend')

import os
os.environ['DATABASE_URL'] = 'postgresql://postgres:postgres@localhost:5432/logorecognition'

try:
    from app.database import get_session
    from app.services.category_service import CategoryService

    print("✓ Imports successful")

    # Test database connection
    db = next(get_session())
    print("✓ Database connection successful")

    # Test service
    service = CategoryService()
    print("✓ Service initialization successful")

    # Test get_categories_with_counts - this is the async method that fails
    import asyncio

    async def test_get_categories():
        try:
            categories, total, filtered = await service.get_categories_with_counts(
                db=db,
                search=None,
                skip=0,
                limit=20,
                sort_by="categorie",
                sort_order="asc"
            )
            print(f"✓ get_categories_with_counts successful: {total} categories found")
            return categories
        except Exception as e:
            print(f"✗ Error in get_categories_with_counts: {e}")
            import traceback
            traceback.print_exc()
            return None

    categories = asyncio.run(test_get_categories())

    if categories:
        print(f"\n✅ All tests passed! Found {len(categories)} categories")
    else:
        print(f"\n❌ Tests failed")

except Exception as e:
    print(f"\n❌ Error: {e}")
    import traceback
    traceback.print_exc()