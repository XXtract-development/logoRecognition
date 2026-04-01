/**
 * WebSocket Types
 * Type definitions for real-time communication
 */

// Types used in WebSocket message payloads

export enum WebSocketEvent {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
  RECONNECT = 'reconnect',
  UPLOAD_PROGRESS = 'upload:progress',
  RECOGNIZE = 'recognize',
  RECOGNITION_START = 'recognition:start',
  RECOGNITION_PROGRESS = 'recognition:progress',
  RECOGNITION_COMPLETE = 'recognition:complete',
  RECOGNITION_ERROR = 'recognition:error',
}

export interface WebSocketMessage<T = unknown> {
  event: WebSocketEvent;
  data: T;
  timestamp: string;
  id?: string;
}

export interface RecognitionProgressData {
  jobId: string;
  progress: number;
  stage: RecognitionStage;
  message?: string;
}

export enum RecognitionStage {
  QUEUED = 'queued',
  PREPROCESSING = 'preprocessing',
  DETECTING = 'detecting',
  POSTPROCESSING = 'postprocessing',
  COMPLETE = 'complete',
}

export interface WebSocketConfig {
  url: string;
  reconnect: boolean;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  timeout: number;
}

export type WebSocketEventHandler<T = unknown> = (data: T) => void;

export interface WebSocketStore {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  reconnectAttempts: number;
  lastMessage: WebSocketMessage | null;
}