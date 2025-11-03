# Epic: Real-time Processing

**Epic ID:** EPIC-06
**Priority:** High
**Sprint:** 13-16
**Status:** 📋 Future

## Overview

The Real-time Processing epic enables live logo recognition through webcam and IP camera integration, supporting production line monitoring with 15-20 FPS processing capabilities. This system provides immediate feedback for quality control and production validation.

## Key Features

### 1. IP Camera Integration (RC-007) ✅ Production
- RTSP/ONVIF protocol support
- Multiple camera management
- H.264/H.265 codec support
- PTZ control capabilities
- Network bandwidth optimization
- Automatic reconnection handling

### 2. Webcam Support ✅ Production
- Browser WebRTC integration
- USB webcam detection
- Resolution selection (480p-4K)
- Frame rate configuration
- Local processing option
- Privacy mode toggle

### 3. Real-time Recognition Pipeline
- 15-20 FPS processing target
- Frame buffering strategy
- Skip-frame intelligence
- GPU acceleration
- Parallel processing streams
- Latency <100ms

### 4. Live Result Overlay
- Bounding box visualization
- Confidence score display
- Category/value labels
- Color-coded status (pass/fail)
- Historical trail display
- Statistics overlay

### 5. Production Line Monitoring
- Multi-camera dashboard
- Zone-based detection
- Throughput counting
- Alert triggering
- Shift statistics
- Quality metrics tracking

### 6. Stream Management
- Adaptive quality adjustment
- Network failure handling
- Recording capabilities
- Stream multiplexing
- Edge processing support
- Cloud processing fallback

## User Stories

### Story 18: IP Camera Setup
**As a** Production Manager
**I want to** connect industrial cameras
**So that** I can monitor production lines

**Acceptance Criteria:**
- [ ] RTSP URL configuration
- [ ] Multiple cameras supported (up to 16)
- [ ] Auto-discovery of ONVIF cameras
- [ ] Camera health monitoring
- [ ] Automatic reconnection
- [ ] Configuration persistence

### Story 19: Live Recognition
**As an** Operator (Mike)
**I want** real-time logo detection
**So that** I can immediately see issues

**Acceptance Criteria:**
- [ ] 15+ FPS processing
- [ ] <100ms latency
- [ ] Visual overlay on video
- [ ] Pass/fail indicators
- [ ] Audio alerts optional
- [ ] Full-screen mode

### Story 20: Production Dashboard
**As a** Quality Manager
**I want** multi-camera monitoring
**So that** I can oversee entire production

**Acceptance Criteria:**
- [ ] Grid view (2x2, 3x3, 4x4)
- [ ] Individual camera zoom
- [ ] Statistics per camera
- [ ] Alert notifications
- [ ] Recording triggers
- [ ] Export capabilities

### Story 21: Mobile Monitoring
**As a** Floor Supervisor
**I want** mobile access to cameras
**So that** I can monitor while moving

**Acceptance Criteria:**
- [ ] Responsive mobile interface
- [ ] Low-bandwidth mode
- [ ] Camera switching
- [ ] Alert notifications
- [ ] Snapshot capability
- [ ] Works on tablets

## Technical Architecture

### Stream Processing Pipeline
```
Camera → Capture → Decode → Preprocess → Detect → Overlay → Display
         RTSP      H.264     Resize      ONNX     Canvas    WebRTC
         30fps     30fps     15fps       15fps    15fps     15fps
```

### Camera Configuration
```yaml
cameras:
  - id: cam-01
    name: "Production Line A"
    type: "ip_camera"
    protocol: "rtsp"
    url: "rtsp://192.168.1.100:554/stream1"
    credentials:
      username: "admin"
      password: "${CAMERA_PASSWORD}"
    settings:
      resolution: "1920x1080"
      fps: 30
      codec: "h264"
      detection_zones:
        - name: "Entry"
          coordinates: [[100,100], [500,100], [500,400], [100,400]]
        - name: "Exit"
          coordinates: [[600,100], [1000,100], [1000,400], [600,400]]

  - id: cam-02
    name: "Quality Station B"
    type: "webcam"
    device: "/dev/video0"
    settings:
      resolution: "1280x720"
      fps: 30
```

### Real-time Architecture
```python
class StreamProcessor:
    def __init__(self, camera_config):
        self.capture = cv2.VideoCapture(camera_config.url)
        self.model = ONNXRuntime.load("logo_model.onnx")
        self.buffer = FrameBuffer(size=5)
        self.fps_target = 15

    async def process_stream(self):
        while True:
            frame = await self.capture_frame()

            # Skip frames to maintain FPS
            if self.should_process_frame():
                # Run detection
                detections = await self.detect_logos(frame)

                # Send via WebSocket
                await self.broadcast_results({
                    'camera_id': self.camera_id,
                    'timestamp': time.now(),
                    'detections': detections,
                    'frame_number': self.frame_count
                })

            # Always display with overlay
            await self.render_frame(frame, detections)
```

### WebSocket Protocol
```javascript
// Client-side WebSocket
const ws = new WebSocket('wss://api.logo-recognition.com/stream');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'detection') {
        updateOverlay(data.detections);
        updateStatistics(data.stats);
    }

    if (data.type === 'alert') {
        showAlert(data.message);
        playSound(data.severity);
    }
};

// Send commands
ws.send(JSON.stringify({
    type: 'command',
    camera: 'cam-01',
    action: 'start_recording'
}));
```

## Performance Requirements

| Metric | Target | Minimum |
|--------|--------|---------|
| Frame Rate | 20 FPS | 15 FPS |
| Latency | <50ms | <100ms |
| Cameras per Server | 16 | 8 |
| Network Bandwidth | 10 Mbps/camera | 5 Mbps/camera |
| CPU Usage | <60% | <80% |
| GPU Usage | <70% | <90% |
| Memory per Stream | 500MB | 1GB |

## Infrastructure Requirements

### Hardware
- **GPU Server**: NVIDIA T4 or better
- **CPU**: 16 cores minimum
- **RAM**: 32GB minimum
- **Network**: 1Gbps connection
- **Storage**: 1TB SSD for buffering

### Software
- **NVIDIA Driver**: 535.x
- **CUDA**: 12.4
- **TensorRT**: 10.x (optional)
- **FFmpeg**: 6.x
- **OpenCV**: 4.9
- **GStreamer**: 1.24

## Edge Computing Support

### Edge Device Deployment
- NVIDIA Jetson support
- Intel NUC compatibility
- Raspberry Pi 5 (limited)
- Local model storage
- Offline operation mode
- Cloud sync when available

## Security Considerations

### Camera Security
- Encrypted RTSP streams
- VPN tunnel support
- Camera authentication
- Network isolation
- Access control lists
- Audit logging

### Privacy Protection
- Face blurring option
- GDPR compliance mode
- Data retention policies
- Encryption at rest
- Secure stream tunneling

## Monitoring & Analytics

### Real-time Metrics
- FPS per camera
- Detection count/minute
- Confidence distribution
- Network latency
- Dropped frames
- Error rates

### Production Analytics
- Logos detected per shift
- Quality pass/fail ratio
- Throughput trends
- Alert frequency
- Downtime tracking
- Performance degradation

## Dependencies
- Camera network infrastructure
- GPU-enabled servers
- WebRTC browser support
- Network bandwidth availability
- Edge device procurement
- Camera mounting/positioning

## Success Metrics
- Processing rate: 15+ FPS achieved
- Latency: <100ms end-to-end
- Uptime: 99.5% per camera
- Detection accuracy: 99% maintained
- User satisfaction: >4/5 for operators
- ROI: 20% quality improvement

## Risks & Mitigations
- **Network instability** → Local buffering & retry
- **Camera failures** → Redundant cameras & alerts
- **Processing bottlenecks** → Dynamic frame skipping
- **Browser compatibility** → Fallback to MJPEG
- **Bandwidth limitations** → Adaptive quality

## Implementation Phases

### Phase 1: Basic Streaming (Week 13)
- Single camera support
- Basic WebRTC streaming
- Simple overlay

### Phase 2: Multi-camera (Week 14)
- Multiple camera management
- Grid view dashboard
- Recording capabilities

### Phase 3: Production Features (Week 15)
- Zone-based detection
- Alert system
- Statistics tracking

### Phase 4: Optimization (Week 16)
- GPU acceleration
- Edge deployment
- Performance tuning

## Definition of Done
- [ ] IP camera integration working
- [ ] Webcam support functional
- [ ] 15+ FPS processing achieved
- [ ] Multi-camera dashboard complete
- [ ] Alert system operational
- [ ] Mobile interface responsive
- [ ] Edge deployment tested
- [ ] Security measures implemented
- [ ] Documentation complete
- [ ] Operator training delivered

## Related Documents
- [Recognition System Epic](./epic-02-recognition-system.md)
- [Technical Architecture](./7-technical-architecture.md)
- [Performance Requirements](./6-non-functional-requirements.md)
- [Infrastructure Epic](./epic-05-infrastructure-deployment.md)