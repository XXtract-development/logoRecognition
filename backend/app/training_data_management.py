"""
Training Data Management Service
Story: STORY-028
"""

import os
import json
import hashlib
from typing import List, Dict, Optional
from dataclasses import dataclass
from datetime import datetime
import boto3
from sqlalchemy import create_engine, Column, String, DateTime, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()

class TrainingDataset(Base):
    __tablename__ = 'training_datasets'

    id = Column(String, primary_key=True)
    tenant_id = Column(String, nullable=False)
    project_id = Column(String, nullable=False)
    version = Column(String, nullable=False)
    category = Column(String)
    metadata = Column(String)  # JSON
    created_at = Column(DateTime, default=datetime.utcnow)
    size_bytes = Column(Integer)
    file_count = Column(Integer)

class TrainingDataManager:
    """Manage training data with hierarchical organization"""

    def __init__(self):
        self.s3_client = boto3.client('s3')
        self.bucket = os.getenv('S3_BUCKET', 'training-data')
        self.engine = create_engine(os.getenv('DATABASE_URL'))
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

    def organize_dataset(self, tenant: str, project: str, version: str, files: List) -> str:
        """Organize dataset hierarchically"""
        dataset_id = hashlib.md5(f"{tenant}{project}{version}{datetime.now()}".encode()).hexdigest()

        # S3 prefix structure
        prefix = f"{tenant}/{project}/{version}/"

        # Upload files
        for file in files:
            category = self._categorize_file(file)
            key = f"{prefix}{category}/{file.name}"

            # Content-addressable storage
            file_hash = self._compute_hash(file)

            # Check for duplicates
            if not self._exists(file_hash):
                self.s3_client.upload_fileobj(file, self.bucket, key)

        # Store metadata
        session = self.Session()
        dataset = TrainingDataset(
            id=dataset_id,
            tenant_id=tenant,
            project_id=project,
            version=version,
            metadata=json.dumps({"files": len(files)}),
            file_count=len(files)
        )
        session.add(dataset)
        session.commit()

        return dataset_id

    def _categorize_file(self, file) -> str:
        """Categorize file based on content"""
        # Simplified categorization
        return "general"

    def _compute_hash(self, file) -> str:
        """Compute content hash for deduplication"""
        hasher = hashlib.sha256()
        for chunk in iter(lambda: file.read(4096), b""):
            hasher.update(chunk)
        file.seek(0)
        return hasher.hexdigest()

    def _exists(self, file_hash: str) -> bool:
        """Check if file already exists"""
        try:
            self.s3_client.head_object(Bucket=self.bucket, Key=f"content/{file_hash}")
            return True
        except:
            return False
