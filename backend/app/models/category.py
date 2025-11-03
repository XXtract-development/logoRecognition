"""
Category Model

SQLAlchemy model for categories with unique constraint on (categorie, code).
"""

from sqlalchemy import Column, Integer, String, DateTime, Index, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Category(Base):
    """
    Category model for classification and organization.

    Attributes:
        id: Primary key
        categorie: Category identifier (required, max 100 chars)
        categorie_naam: Full category name (optional, max 2000 chars)
        code: Category code (required, max 100 chars, supports special chars: +, -, (), .)
        code_naam: Full code name (optional, max 2000 chars)
        definitie: Category definition (optional, max 2000 chars)
        created_at: Timestamp of creation
        updated_at: Timestamp of last update

    Constraints:
        - Unique constraint on (categorie, code) combination
        - Indexes on categorie and code for query performance
    """

    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    categorie = Column(String(100), nullable=False)
    categorie_naam = Column(String(2000), nullable=True)  # Increased for detailed names
    code = Column(String(100), nullable=False)  # Increased to support longer logo codes
    code_naam = Column(String(2000), nullable=True)  # Increased for detailed names
    definitie = Column(String(2000), nullable=True)  # Increased to support longer definitions

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # CRITICAL: Unique constraint for duplicate detection during import
    __table_args__ = (
        UniqueConstraint('categorie', 'code', name='uq_category_code'),
        Index('idx_categorie', 'categorie'),
        Index('idx_code', 'code'),
        Index('idx_category_code', 'categorie', 'code'),  # Composite index for lookups
    )

    def __repr__(self) -> str:
        return f"<Category(id={self.id}, categorie='{self.categorie}', code='{self.code}')>"