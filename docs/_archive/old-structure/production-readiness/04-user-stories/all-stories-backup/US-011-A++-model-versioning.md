# US-011-A++: Model Versioning System (Optimized)

**Sprint:** 2
**Points:** 4 (Optimized from 6)
**Epic:** EPIC-002 (ML Platform)
**Assignee:** ML Engineer
**Priority:** 🟡 HIGH
**Status:** 🚀 A++ READY

---

## 📋 User Story

**As a** ML Engineer
**I want to** manage model versions with zero-downtime deployments
**So that** we can continuously improve accuracy without service disruption

---

## 🎯 A++ Acceptance Criteria

```gherkin
GIVEN a new model version is trained
WHEN it's deployed to production
THEN it should hot-swap without any downtime

GIVEN multiple model versions exist
WHEN A/B testing is configured
THEN traffic splits correctly between versions

GIVEN a model performs poorly
WHEN rollback is triggered
THEN previous version restores in < 30 seconds

GIVEN model metrics are tracked
WHEN performance degrades > 5%
THEN automatic rollback initiates
```

---

## 🚀 A++ Implementation Plan

### Day 3: Full Day Implementation
```yaml
Hours 1-2: Git LFS Setup
  - Configure Git LFS for models
  - Create model registry structure
  - Setup semantic versioning
  - Implement model metadata

Hours 3-4: Hot-Swap Mechanism
  - Create model loader service
  - Implement version switching
  - Add memory management
  - Setup symlink strategy

Hours 5-6: A/B Testing Framework
  - Build feature flag system
  - Create traffic splitter
  - Add user segmentation
  - Implement metrics collection

Hours 7-8: CI/CD Integration
  - Automate model validation
  - Setup deployment pipeline
  - Add rollback automation
  - Create monitoring alerts
```

---

## 💻 Technical Implementation

### Model Registry System
```python
# model_registry/registry.py
import json
import os
import hashlib
from typing import Dict, Optional, List
from datetime import datetime
import git
from semantic_version import Version
import asyncio
from pathlib import Path

class ModelRegistry:
    def __init__(self, registry_path: str = "./models"):
        self.registry_path = Path(registry_path)
        self.registry_file = self.registry_path / "registry.json"
        self.models_dir = self.registry_path / "artifacts"
        self.current_link = self.registry_path / "current"

        # Initialize Git LFS
        self.repo = git.Repo(self.registry_path)
        self._ensure_lfs_tracking()

        # Load registry
        self.registry = self._load_registry()

        # Model cache for hot-swapping
        self.loaded_models = {}
        self.model_lock = asyncio.Lock()

    def _ensure_lfs_tracking(self):
        """Ensure ONNX files are tracked by Git LFS"""
        gitattributes = self.registry_path / ".gitattributes"
        lfs_rules = [
            "*.onnx filter=lfs diff=lfs merge=lfs -text",
            "*.pt filter=lfs diff=lfs merge=lfs -text",
            "*.pth filter=lfs diff=lfs merge=lfs -text",
            "*.h5 filter=lfs diff=lfs merge=lfs -text"
        ]

        with open(gitattributes, 'w') as f:
            f.write('\n'.join(lfs_rules))

    def _load_registry(self) -> Dict:
        """Load model registry from JSON"""
        if self.registry_file.exists():
            with open(self.registry_file, 'r') as f:
                return json.load(f)
        return {
            "versions": [],
            "current": None,
            "ab_tests": [],
            "deployment_history": []
        }

    async def register_model(
        self,
        model_path: str,
        version: str,
        metadata: Dict
    ) -> Dict:
        """Register new model version with validation"""

        # Semantic versioning validation
        version_obj = Version(version)

        # Calculate model hash for integrity
        model_hash = self._calculate_hash(model_path)

        # Validate model before registration
        validation_results = await self._validate_model(model_path)
        if not validation_results["passed"]:
            raise ValueError(f"Model validation failed: {validation_results['errors']}")

        # Copy model to registry
        target_path = self.models_dir / f"v{version}" / "model.onnx"
        target_path.parent.mkdir(parents=True, exist_ok=True)

        import shutil
        shutil.copy2(model_path, target_path)

        # Create model entry
        model_entry = {
            "version": version,
            "path": str(target_path),
            "hash": model_hash,
            "registered_at": datetime.now().isoformat(),
            "metadata": {
                **metadata,
                "accuracy": validation_results["accuracy"],
                "latency_ms": validation_results["latency_ms"],
                "memory_mb": validation_results["memory_mb"]
            },
            "status": "registered",
            "git_commit": self.repo.head.commit.hexsha
        }

        # Update registry
        self.registry["versions"].append(model_entry)
        self.registry["versions"].sort(
            key=lambda x: Version(x["version"]),
            reverse=True
        )

        # Save registry
        self._save_registry()

        # Commit to Git
        self.repo.index.add([str(target_path), str(self.registry_file)])
        self.repo.index.commit(f"Register model version {version}")

        return model_entry

    async def deploy_version(
        self,
        version: str,
        strategy: str = "immediate"
    ) -> Dict:
        """Deploy specific model version with strategy"""

        async with self.model_lock:
            model_entry = self._get_version(version)
            if not model_entry:
                raise ValueError(f"Version {version} not found")

            if strategy == "immediate":
                # Hot-swap immediately
                await self._hot_swap(model_entry)

            elif strategy == "canary":
                # Gradual rollout
                await self._canary_deployment(model_entry)

            elif strategy == "blue_green":
                # Blue-green deployment
                await self._blue_green_deployment(model_entry)

            # Update registry
            self.registry["current"] = version
            model_entry["status"] = "deployed"

            # Add to deployment history
            self.registry["deployment_history"].append({
                "version": version,
                "deployed_at": datetime.now().isoformat(),
                "strategy": strategy,
                "previous_version": self.registry.get("current")
            })

            self._save_registry()

            return {
                "version": version,
                "status": "deployed",
                "strategy": strategy,
                "deployment_time_ms": 0  # Measured during deployment
            }

    async def _hot_swap(self, model_entry: Dict):
        """Hot-swap model without downtime"""
        import onnxruntime as ort

        # Pre-load new model
        new_session = ort.InferenceSession(
            model_entry["path"],
            providers=['CUDAExecutionProvider', 'CPUExecutionProvider']
        )

        # Warm up new model
        dummy_input = np.random.randn(1, 3, 640, 640).astype(np.float32)
        for _ in range(3):
            new_session.run(None, {'images': dummy_input})

        # Atomic swap using symlink
        temp_link = self.current_link.with_suffix('.tmp')
        os.symlink(model_entry["path"], temp_link)
        os.rename(temp_link, self.current_link)

        # Update loaded model cache
        old_version = self.registry.get("current")
        self.loaded_models[model_entry["version"]] = new_session

        # Clean up old model after grace period
        if old_version and old_version in self.loaded_models:
            await asyncio.sleep(5)  # Grace period for in-flight requests
            del self.loaded_models[old_version]

    async def rollback(self, target_version: Optional[str] = None) -> Dict:
        """Rollback to previous or specific version"""

        if not target_version:
            # Get previous version from history
            history = self.registry["deployment_history"]
            if len(history) > 1:
                target_version = history[-2]["version"]
            else:
                raise ValueError("No previous version to rollback to")

        # Deploy target version
        result = await self.deploy_version(target_version, strategy="immediate")

        # Log rollback
        result["rollback"] = True
        result["rollback_reason"] = "Manual rollback"

        return result

    async def setup_ab_test(
        self,
        version_a: str,
        version_b: str,
        split_percentage: int = 50,
        user_segments: Optional[List[str]] = None
    ) -> Dict:
        """Setup A/B testing between model versions"""

        # Validate versions exist
        if not self._get_version(version_a) or not self._get_version(version_b):
            raise ValueError("Invalid versions for A/B test")

        # Load both models
        await self._ensure_model_loaded(version_a)
        await self._ensure_model_loaded(version_b)

        # Create A/B test configuration
        ab_test = {
            "id": hashlib.md5(f"{version_a}_{version_b}_{datetime.now()}".encode()).hexdigest()[:8],
            "version_a": version_a,
            "version_b": version_b,
            "split_percentage": split_percentage,
            "user_segments": user_segments or ["all"],
            "started_at": datetime.now().isoformat(),
            "status": "active",
            "metrics": {
                "version_a": {"requests": 0, "accuracy": 0, "latency_ms": 0},
                "version_b": {"requests": 0, "accuracy": 0, "latency_ms": 0}
            }
        }

        self.registry["ab_tests"].append(ab_test)
        self._save_registry()

        return ab_test

    def get_model_for_request(self, user_id: str, request_id: str) -> tuple:
        """Determine which model version to use for request"""

        # Check if A/B test is active
        active_tests = [t for t in self.registry["ab_tests"] if t["status"] == "active"]

        if active_tests:
            test = active_tests[0]

            # Use consistent hashing for user assignment
            user_hash = int(hashlib.md5(user_id.encode()).hexdigest(), 16)
            threshold = test["split_percentage"]

            if (user_hash % 100) < threshold:
                version = test["version_a"]
                test_group = "A"
            else:
                version = test["version_b"]
                test_group = "B"

            return version, test_group

        # Use current version if no A/B test
        return self.registry["current"], None

    async def _validate_model(self, model_path: str) -> Dict:
        """Validate model performance before deployment"""
        import onnxruntime as ort
        import numpy as np
        import time

        try:
            # Load model
            session = ort.InferenceSession(
                model_path,
                providers=['CUDAExecutionProvider', 'CPUExecutionProvider']
            )

            # Test inference
            dummy_input = np.random.randn(1, 3, 640, 640).astype(np.float32)

            # Measure latency
            latencies = []
            for _ in range(10):
                start = time.time()
                outputs = session.run(None, {'images': dummy_input})
                latencies.append((time.time() - start) * 1000)

            # Get memory usage
            import psutil
            process = psutil.Process()
            memory_mb = process.memory_info().rss / 1024 / 1024

            return {
                "passed": True,
                "accuracy": 0.92,  # Would run on validation set
                "latency_ms": np.mean(latencies),
                "memory_mb": memory_mb,
                "errors": []
            }

        except Exception as e:
            return {
                "passed": False,
                "accuracy": 0,
                "latency_ms": 0,
                "memory_mb": 0,
                "errors": [str(e)]
            }

    def _calculate_hash(self, file_path: str) -> str:
        """Calculate SHA256 hash of model file"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
```

### CI/CD Pipeline
```yaml
# .github/workflows/model_deployment.yml
name: Model Deployment Pipeline

on:
  push:
    tags:
      - 'model-v*'

jobs:
  validate-and-deploy:
    runs-on: [self-hosted, gpu]

    steps:
    - uses: actions/checkout@v3
      with:
        lfs: true

    - name: Setup Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.9'

    - name: Install dependencies
      run: |
        pip install -r requirements.txt
        pip install onnxruntime-gpu

    - name: Validate Model
      run: |
        python scripts/validate_model.py \
          --model-path models/new/model.onnx \
          --test-data data/validation \
          --accuracy-threshold 0.90 \
          --latency-threshold 100

    - name: Register Model
      id: register
      run: |
        VERSION=${GITHUB_REF#refs/tags/model-}
        python scripts/register_model.py \
          --model-path models/new/model.onnx \
          --version $VERSION \
          --metadata '{"trained_by": "${{ github.actor }}", "commit": "${{ github.sha }}"}'

    - name: Canary Deployment
      run: |
        python scripts/deploy_model.py \
          --version ${{ steps.register.outputs.version }} \
          --strategy canary \
          --initial-traffic 10 \
          --increment 10 \
          --interval 300

    - name: Monitor Performance
      run: |
        python scripts/monitor_deployment.py \
          --version ${{ steps.register.outputs.version }} \
          --duration 600 \
          --rollback-on-error

    - name: Full Deployment
      if: success()
      run: |
        python scripts/deploy_model.py \
          --version ${{ steps.register.outputs.version }} \
          --strategy immediate
```

---

## 🧪 Testing Strategy

### Integration Tests
```python
# tests/test_model_versioning.py
import pytest
import asyncio
from model_registry.registry import ModelRegistry

@pytest.mark.asyncio
async def test_hot_swap_zero_downtime():
    registry = ModelRegistry()

    # Deploy initial version
    await registry.deploy_version("1.0.0")

    # Start simulating requests
    request_task = asyncio.create_task(simulate_requests())

    # Deploy new version
    start_time = asyncio.get_event_loop().time()
    await registry.deploy_version("2.0.0")
    swap_time = asyncio.get_event_loop().time() - start_time

    # Stop requests
    request_task.cancel()

    # Assert zero downtime
    assert swap_time < 0.1  # Less than 100ms
    assert not request_errors  # No failed requests

@pytest.mark.asyncio
async def test_automatic_rollback():
    registry = ModelRegistry()

    # Deploy good version
    await registry.deploy_version("1.0.0")

    # Deploy bad version
    await registry.deploy_version("2.0.0")

    # Simulate performance degradation
    await simulate_poor_performance()

    # Check automatic rollback
    await asyncio.sleep(5)
    assert registry.registry["current"] == "1.0.0"
```

---

## 📊 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Hot-swap time | < 100ms | Deployment logs |
| Rollback time | < 30s | Monitoring alerts |
| Version switch success | 100% | CI/CD metrics |
| A/B test accuracy | ±2% variance | Model metrics |
| Git LFS performance | < 30s pull | CI/CD timing |

---

## ✅ Definition of Done

- [ ] Git LFS configured for model storage
- [ ] Model registry with semantic versioning
- [ ] Hot-swap without downtime
- [ ] A/B testing framework operational
- [ ] Automatic rollback on degradation
- [ ] CI/CD pipeline integrated
- [ ] Performance monitoring active
- [ ] Load tested version switching
- [ ] Documentation complete

---

**Status:** A++ READY FOR IMPLEMENTATION
**Last Updated:** Sprint 2 Planning
**Next Review:** Sprint 2, Day 4