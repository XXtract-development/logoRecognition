# US-007A: Deploy ONNX Model Files

**Sprint:** 1
**Points:** 8
**Epic:** EPIC-002 (Core Detection Platform)
**Assignee:** ML Engineer
**Priority:** 🔴 CRITICAL
**Status:** ❌ NOT STARTED (0% Complete)

---

## 📋 User Story

**As an** ML Engineer
**I want to** deploy trained ONNX models to production
**So that** the detection service can perform actual logo recognition

---

## 📝 Background & Context

The ML infrastructure code is in place (`ml_model.py`) but uses mock implementations. We need to deploy actual ONNX model files and connect them to the inference engine. The system should support GPU acceleration where available with CPU fallback.

### Current State:
- ✅ Model infrastructure code exists
- ✅ Model registry implemented
- ❌ No actual ONNX model files
- ❌ Mock inference only
- ❌ No real detection happening

---

## ✅ Acceptance Criteria

```gherkin
GIVEN the application needs to detect logos
WHEN it starts up
THEN it should load the ONNX model successfully

GIVEN a new model version is available
WHEN it's deployed
THEN it should support A/B testing and rollback

GIVEN GPU is available
WHEN model loads
THEN it should use GPU acceleration

GIVEN GPU is not available
WHEN model loads
THEN it should fallback to CPU gracefully
```

---

## 📋 Task Checklist

### 1. Model Preparation
- [ ] Obtain/train EfficientDet-D4 model
- [ ] Convert to ONNX format
- [ ] Validate ONNX model
- [ ] Create model metadata file
- [ ] Generate model hash for integrity

### 2. Model Storage Setup
- [ ] Create /models directory structure
- [ ] Setup versioning folders
- [ ] Upload model files
- [ ] Create labels.txt file
- [ ] Add inference config

### 3. Model Loader Implementation
- [ ] Remove mock from ModelServer
- [ ] Implement real ONNX loading
- [ ] Add model verification
- [ ] Setup GPU detection
- [ ] Implement CPU fallback

### 4. Model Warmup
- [ ] Create warmup dataset
- [ ] Implement warmup logic
- [ ] Measure warmup time
- [ ] Optimize warmup process
- [ ] Add warmup metrics

### 5. Version Management
- [ ] Setup semantic versioning
- [ ] Implement version comparison
- [ ] Create rollback mechanism
- [ ] Add version metadata
- [ ] Test version switching

### 6. A/B Testing Setup
- [ ] Configure traffic splitting
- [ ] Implement request routing
- [ ] Add metrics collection
- [ ] Create comparison dashboard
- [ ] Test A/B functionality

### 7. Performance Optimization
- [ ] Enable TensorRT if available
- [ ] Configure batch optimization
- [ ] Setup model caching
- [ ] Implement dynamic batching
- [ ] Profile inference speed

### 8. Testing & Validation
- [ ] Test model loading
- [ ] Validate predictions
- [ ] Test GPU/CPU switching
- [ ] Load test inference
- [ ] Test rollback scenario

---

## 💻 Technical Implementation

### Model Directory Structure
```
/models/
├── production/
│   ├── efficientdet_d4_v1.0.0.onnx
│   ├── model_metadata.json
│   └── labels.txt
├── staging/
│   └── efficientdet_d4_v1.1.0.onnx
├── archive/
│   └── efficientdet_d4_v0.9.0.onnx
└── configs/
    ├── inference_config.yaml
    └── preprocessing_config.yaml
```

### Model Metadata (model_metadata.json)
```json
{
  "model_name": "efficientdet_d4",
  "version": "1.0.0",
  "framework": "onnx",
  "created_at": "2024-01-19T10:00:00Z",
  "metrics": {
    "mAP": 0.956,
    "inference_time_gpu": 45,
    "inference_time_cpu": 450,
    "model_size_mb": 225
  },
  "input_spec": {
    "shape": [1, 3, 640, 640],
    "dtype": "float32",
    "preprocessing": "imagenet_normalization"
  },
  "output_spec": {
    "boxes": [1, -1, 4],
    "scores": [1, -1],
    "classes": [1, -1]
  },
  "labels": ["nike", "adidas", "apple", "google", "microsoft", "coca-cola", "pepsi", "mcdonalds", "starbucks", "amazon"],
  "confidence_threshold": 0.5,
  "nms_threshold": 0.4
}
```

### Real Model Loader (Python)
```python
# backend/app/services/ml/model_loader.py
import onnxruntime as ort
import numpy as np
import json

class ModelLoader:
    def __init__(self, model_path: str, use_gpu: bool = True):
        self.model_path = model_path
        self.metadata = self._load_metadata()
        self.session = None
        self._initialize_model(use_gpu)

    def _initialize_model(self, use_gpu: bool):
        """Initialize ONNX Runtime session"""
        providers = []

        if use_gpu and self._check_gpu_available():
            providers.extend([
                ('CUDAExecutionProvider', {
                    'device_id': 0,
                    'arena_extend_strategy': 'kNextPowerOfTwo',
                    'gpu_mem_limit': 2 * 1024 * 1024 * 1024,
                }),
                ('TensorrtExecutionProvider', {
                    'device_id': 0,
                    'trt_max_workspace_size': 2147483648,
                })
            ])

        providers.append('CPUExecutionProvider')

        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self.session = ort.InferenceSession(
            self.model_path,
            sess_options,
            providers=providers
        )

        self._warmup_model()

    def predict(self, image: np.ndarray) -> dict:
        """Run inference on image"""
        # Preprocess
        input_tensor = self._preprocess(image)

        # Run inference
        outputs = self.session.run(None, {
            self.session.get_inputs()[0].name: input_tensor
        })

        # Postprocess
        return self._postprocess(outputs)
```

---

## 🔗 Dependencies

- ONNX Runtime must be installed
- GPU drivers if using GPU
- Model training completed or pre-trained model available
- Storage infrastructure ready

---

## ⚠️ Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Model too large | High | Use quantization, model pruning |
| GPU not available | Medium | Ensure CPU fallback works well |
| Model performance poor | Critical | Have multiple model versions ready |
| Inference too slow | High | Implement caching, batching |

---

## 📊 Progress Tracking

### Current Status: 0% Complete

- ❌ No ONNX model files
- ❌ Mock implementation in use
- ❌ No GPU support tested
- ❌ No warmup implemented
- ❌ No A/B testing setup

### Estimated Timeline:
- Day 1-2: Obtain and prepare models
- Day 3: Deploy model files
- Day 4-5: Implement real loader
- Day 6: GPU/CPU testing
- Day 7: A/B testing setup
- Day 8: Performance optimization

---

## 🧪 Test Scenarios

1. **Model Loading Test**
   - Load model on startup
   - Should complete < 10 seconds

2. **GPU Fallback Test**
   - Disable GPU
   - Should automatically use CPU

3. **Inference Speed Test**
   - Single image < 500ms
   - Batch of 10 < 2 seconds

4. **Version Switch Test**
   - Deploy new version
   - Switch without downtime

---

## 📚 References

- [ONNX Runtime Documentation](https://onnxruntime.ai/)
- [EfficientDet Paper](https://arxiv.org/abs/1911.09070)
- [TensorRT Optimization Guide](https://developer.nvidia.com/tensorrt)
- Model Zoo for pre-trained models

---

## ✅ Definition of Done

- [ ] ONNX model files deployed
- [ ] Model loading successfully
- [ ] Real inference working
- [ ] GPU acceleration tested
- [ ] CPU fallback tested
- [ ] A/B testing configured
- [ ] Performance benchmarked
- [ ] Documentation updated
- [ ] Code reviewed
- [ ] Deployed to staging

---

**Last Updated:** 2024-01-19
**Next Review:** Sprint 1 Day 3