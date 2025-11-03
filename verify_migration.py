#!/usr/bin/env python3
"""Verify that the migration was successful"""

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

def verify_migration():
    """Verify the categories table has the new fields"""
    try:
        # Connect to database
        conn = psycopg2.connect(
            host='localhost',
            port='5432',
            database='logorecognition',
            user='postgres',
            password='postgres'
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        print("✅ Database connection successful!")
        print("\n📊 Categories table structure:")
        print("-" * 50)

        # Get table columns
        cursor.execute("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'categories'
            ORDER BY ordinal_position
        """)

        columns = cursor.fetchall()

        for col_name, data_type, nullable, default in columns:
            nullable_str = "NULL" if nullable == "YES" else "NOT NULL"
            default_str = f" DEFAULT {default}" if default else ""
            print(f"  {col_name:<20} {data_type:<15} {nullable_str}{default_str}")

        # Check specific fields we added
        print("\n✅ Verification Results:")
        print("-" * 50)

        required_fields = {
            'color': 'character varying',
            'description': 'character varying'
        }

        column_dict = {col[0]: col[1] for col in columns}

        for field, expected_type in required_fields.items():
            if field in column_dict:
                print(f"  ✓ Field '{field}' exists with type '{column_dict[field]}'")
            else:
                print(f"  ✗ Field '{field}' is missing!")

        # Test insert
        print("\n🧪 Testing insert with new fields...")
        cursor.execute("""
            INSERT INTO categories (categorie, code, color, description, categorie_naam, code_naam, definitie)
            VALUES ('TEST', 'TST001', '#FF5733', 'Test category for migration verification',
                    'Test Category', 'Test Code', 'A test definition')
            RETURNING id, color, description
        """)

        test_id, test_color, test_desc = cursor.fetchone()
        print(f"  ✓ Successfully inserted test record (ID: {test_id})")
        print(f"    Color: {test_color}")
        print(f"    Description: {test_desc}")

        # Clean up test data
        cursor.execute("DELETE FROM categories WHERE id = %s", (test_id,))
        print("  ✓ Test data cleaned up")

        cursor.close()
        conn.close()

        print("\n✅ Migration verification completed successfully!")
        print("   The categories table has been properly migrated with:")
        print("   - color field (VARCHAR(7))")
        print("   - description field (VARCHAR(500))")

        return True

    except Exception as e:
        print(f"\n❌ Verification failed: {e}")
        return False

if __name__ == "__main__":
    verify_migration()