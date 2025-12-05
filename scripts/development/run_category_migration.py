#!/usr/bin/env python3
"""
Direct database migration script for adding color and description fields to categories table.
Can be run without Alembic if needed.
"""

import os
import sys
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

def get_db_config():
    """Get database configuration from environment or defaults"""
    return {
        'host': os.getenv('DB_HOST', 'localhost'),
        'port': os.getenv('DB_PORT', '5432'),
        'database': os.getenv('DB_NAME', 'logorecognition'),
        'user': os.getenv('DB_USER', 'postgres'),
        'password': os.getenv('DB_PASSWORD', 'postgres')
    }

def check_columns_exist(cursor):
    """Check if color and description columns already exist"""
    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'categories'
        AND column_name IN ('color', 'description')
    """)
    existing_columns = [row[0] for row in cursor.fetchall()]
    return 'color' in existing_columns, 'description' in existing_columns

def run_migration():
    """Run the migration to add color and description fields"""
    config = get_db_config()

    print(f"Connecting to database: {config['database']} at {config['host']}:{config['port']}")

    try:
        # Connect to database
        conn = psycopg2.connect(**config)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        # Check if table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_name = 'categories'
            )
        """)
        table_exists = cursor.fetchone()[0]

        if not table_exists:
            print("Categories table does not exist. Creating table...")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS categories (
                    id SERIAL PRIMARY KEY,
                    categorie VARCHAR(100) NOT NULL,
                    categorie_naam VARCHAR(255),
                    code VARCHAR(50) NOT NULL,
                    code_naam VARCHAR(255),
                    definitie VARCHAR(255),
                    color VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
                    description VARCHAR(500),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE UNIQUE INDEX IF NOT EXISTS uq_category_code
                ON categories (categorie, code);

                CREATE INDEX IF NOT EXISTS idx_categorie ON categories (categorie);
                CREATE INDEX IF NOT EXISTS idx_code ON categories (code);
            """)
            print("✅ Categories table created successfully with all fields!")
            return

        # Check which columns already exist
        color_exists, description_exists = check_columns_exist(cursor)

        # Add color column if it doesn't exist
        if not color_exists:
            print("Adding 'color' column...")
            cursor.execute("""
                ALTER TABLE categories
                ADD COLUMN color VARCHAR(7) NOT NULL DEFAULT '#3B82F6'
            """)
            print("✅ Color column added successfully")

            # Update existing rows with different colors
            cursor.execute("""
                UPDATE categories
                SET color = CASE
                    WHEN id % 12 = 0 THEN '#3B82F6'
                    WHEN id % 12 = 1 THEN '#EF4444'
                    WHEN id % 12 = 2 THEN '#10B981'
                    WHEN id % 12 = 3 THEN '#F59E0B'
                    WHEN id % 12 = 4 THEN '#8B5CF6'
                    WHEN id % 12 = 5 THEN '#EC4899'
                    WHEN id % 12 = 6 THEN '#14B8A6'
                    WHEN id % 12 = 7 THEN '#F97316'
                    WHEN id % 12 = 8 THEN '#06B6D4'
                    WHEN id % 12 = 9 THEN '#84CC16'
                    WHEN id % 12 = 10 THEN '#A855F7'
                    ELSE '#F43F5E'
                END
                WHERE color = '#3B82F6'
            """)
            print("✅ Existing categories updated with varied colors")
        else:
            print("ℹ️  Column 'color' already exists")

        # Add description column if it doesn't exist
        if not description_exists:
            print("Adding 'description' column...")
            cursor.execute("""
                ALTER TABLE categories
                ADD COLUMN description VARCHAR(500)
            """)
            print("✅ Description column added successfully")
        else:
            print("ℹ️  Column 'description' already exists")

        # Verify the columns were added
        cursor.execute("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'categories'
            AND column_name IN ('color', 'description')
            ORDER BY column_name
        """)

        print("\n📊 Column verification:")
        for row in cursor.fetchall():
            print(f"  - {row[0]}: {row[1]} (nullable: {row[2]}, default: {row[3]})")

        # Get sample data
        cursor.execute("""
            SELECT id, categorie, code, color, description
            FROM categories
            LIMIT 5
        """)

        rows = cursor.fetchall()
        if rows:
            print("\n📋 Sample data from categories table:")
            for row in rows:
                print(f"  ID: {row[0]}, Category: {row[1]}, Code: {row[2]}, Color: {row[3]}, Description: {row[4]}")

        cursor.close()
        conn.close()

        print("\n✅ Migration completed successfully!")
        return True

    except psycopg2.OperationalError as e:
        print(f"\n❌ Database connection failed: {e}")
        print("\nPlease ensure:")
        print("1. PostgreSQL is running")
        print("2. Database 'logorecognition' exists")
        print("3. Credentials are correct")
        print("\nYou can set environment variables:")
        print("  DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD")
        return False

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        return False

def create_database_if_not_exists():
    """Create the database if it doesn't exist"""
    config = get_db_config()

    try:
        # Connect to postgres database first
        conn = psycopg2.connect(
            host=config['host'],
            port=config['port'],
            database='postgres',
            user=config['user'],
            password=config['password']
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        # Check if database exists
        cursor.execute("""
            SELECT 1 FROM pg_database WHERE datname = %s
        """, (config['database'],))

        exists = cursor.fetchone()

        if not exists:
            print(f"Creating database '{config['database']}'...")
            cursor.execute(f"CREATE DATABASE {config['database']}")
            print(f"✅ Database '{config['database']}' created successfully!")

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        print(f"Could not check/create database: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("CATEGORY TABLE MIGRATION SCRIPT")
    print("=" * 60)
    print("\nThis script will add 'color' and 'description' fields")
    print("to the categories table in the database.\n")

    # First ensure database exists
    if create_database_if_not_exists():
        # Then run the migration
        success = run_migration()
        sys.exit(0 if success else 1)
    else:
        print("\n❌ Could not ensure database exists")
        sys.exit(1)