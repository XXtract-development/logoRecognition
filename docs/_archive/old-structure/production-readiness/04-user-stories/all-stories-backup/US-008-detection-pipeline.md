# US-008: Implement Real Detection Pipeline

**Sprint:** 2
**Points:** 8
**Epic:** EPIC-002 (Core Detection Platform)
**Assignee:** Backend ML Engineer
**Priority:** 🔴 CRITICAL
**Status:** ❌ NOT STARTED (0% Complete)

---

## 📋 User Story

**As a** Backend Developer
**I want to** implement the complete detection pipeline from image to results
**So that** users can detect logos in their images with high accuracy

---

## 📝 Background & Context

With ONNX models deployed (US-007A), we need to replace the mock inference with real detection. This includes preprocessing, inference, postprocessing, and result formatting. The pipeline must handle various image formats and maintain performance targets.

---

## ✅ Acceptance Criteria

```gherkin
GIVEN an image is uploaded for detection
WHEN the detection pipeline processes it
THEN it should return bounding boxes with confidence scores

GIVEN multiple logos in one image
WHEN detection runs
THEN all logos should be detected with proper bounding boxes

GIVEN a batch of images
WHEN batch processing is requested
THEN all images should be processed efficiently

GIVEN detection completes
WHEN results are returned
THEN response time should be < 500ms for single image
```

---

## 📋 Task Checklist

### Implementation Tasks
- [ ] Remove mock inference code
- [ ] Implement image preprocessor
- [ ] Create real ONNX inference
- [ ] Implement postprocessing
- [ ] Add NMS (Non-Maximum Suppression)
- [ ] Setup confidence thresholding
- [ ] Create batch inference pipeline
- [ ] Add detection caching
- [ ] Implement API endpoints
- [ ] Add performance monitoring
- [ ] Create result formatter
- [ ] Test with various image formats

---

## 💻 Technical Implementation

See full implementation in Epic documentation.

---

**Status:** Not Started
**Blocked by:** US-007A (Model Deployment)