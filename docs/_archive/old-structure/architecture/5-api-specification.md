# 5. API Specification

## 5.1 REST API Specification

```yaml
openapi: 3.0.0
info:
  title: Logo Recognition API
  version: 1.0.0
  description: API for logo training and recognition
servers:
  - url: https://api.logo-recognition.com/v1
    description: Production server
  - url: http://localhost:8000/api/v1
    description: Development server

paths:
  /auth/login:
    post:
      summary: User login
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email:
                  type: string
                password:
                  type: string
      responses:
        200:
          description: Successful login
          content:
            application/json:
              schema:
                type: object
                properties:
                  access_token:
                    type: string
                  refresh_token:
                    type: string
                  user:
                    $ref: '#/components/schemas/User'

  /training/upload:
    post:
      summary: Upload images for training
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                files:
                  type: array
                  items:
                    type: string
                    format: binary
                batch_name:
                  type: string
      responses:
        200:
          description: Upload successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  batch_id:
                    type: string
                  files:
                    type: array

  /training/annotate:
    post:
      summary: Annotate logos in image
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                file_id:
                  type: string
                annotations:
                  type: array
                  items:
                    $ref: '#/components/schemas/Annotation'

  /training/smart-detect:
    post:
      summary: Smart click detection for logo boundaries
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                file_id:
                  type: string
                click_x:
                  type: integer
                click_y:
                  type: integer
      responses:
        200:
          description: Boundary detected
          content:
            application/json:
              schema:
                type: object
                properties:
                  detected_boundary:
                    $ref: '#/components/schemas/BoundingBox'
                  confidence:
                    type: number

  /recognize/image:
    post:
      summary: Recognize logos in image
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                image:
                  type: string
                  format: base64
                confidence_threshold:
                  type: number
                  default: 0.99
      responses:
        200:
          description: Recognition complete
          content:
            application/json:
              schema:
                type: object
                properties:
                  request_id:
                    type: string
                  detections:
                    type: array
                    items:
                      $ref: '#/components/schemas/Detection'
                  processing_time_ms:
                    type: integer

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        email:
          type: string
        role:
          type: string
          enum: [admin, user, viewer]

    BoundingBox:
      type: object
      properties:
        x:
          type: integer
        y:
          type: integer
        width:
          type: integer
        height:
          type: integer

    Detection:
      type: object
      properties:
        category:
          type: string
        value:
          type: string
        confidence:
          type: number
        bbox:
          $ref: '#/components/schemas/BoundingBox'

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

## 5.2 WebSocket Events

```typescript
// Client -> Server Events
interface ClientEvents {
  'subscribe_training': {
    jobId: string;
  };
  'subscribe_recognition': {
    sessionId: string;
  };
}

// Server -> Client Events
interface ServerEvents {
  'training_progress': {
    jobId: string;
    progress: number;
    currentEpoch: number;
    totalEpochs: number;
    currentAccuracy: number;
  };
  'training_complete': {
    jobId: string;
    modelId: string;
    finalAccuracy: number;
    trainingTimeSeconds: number;
  };
  'recognition_result': {
    sessionId: string;
    requestId: string;
    detections: Detection[];
  };
}
```

---
