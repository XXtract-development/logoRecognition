"""Create all database tables from SQLAlchemy models."""
import os
import sys

# Set DATABASE_URL environment variable
os.environ['DATABASE_URL'] = 'postgresql://postgres:test_password_123_IN_PRODUCTION@localhost:5432/logo_recognition'

# Import Base from models (same one models use!)
from app.models.base import Base

# Import engine from database
from app.database import engine

# Import all SQLAlchemy models to register them with Base.metadata
from app.models.category import Category
from app.models.training import TrainingJob, ModelRegistry
from app.models.notification import NotificationLog, NotificationPreferences

# Verify all models are imported
print("Imported models:")
print(f"  Category: {Category}")
print(f"  TrainingJob: {TrainingJob}")
print(f"  ModelRegistry: {ModelRegistry}")
print(f"  NotificationLog: {NotificationLog}")
print(f"  NotificationPreferences: {NotificationPreferences}")

def create_all_tables():
    """Create all tables defined in models."""
    print("Creating all database tables...")
    print(f"Using database: {os.environ.get('DATABASE_URL')}")

    # Import all models to ensure they're registered with Base
    print("\nRegistered models:")
    for table_name, table in Base.metadata.tables.items():
        print(f"  - {table_name}")

    # Create all tables
    Base.metadata.create_all(bind=engine)
    print("\n✅ All tables created successfully!")

    # Verify tables were created
    from sqlalchemy import inspect
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"\nVerified tables in database:")
    for table in sorted(tables):
        print(f"  - {table}")

if __name__ == "__main__":
    create_all_tables()
