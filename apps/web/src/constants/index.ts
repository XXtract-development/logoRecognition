/**
 * Application Constants
 */

export const APP_CONFIG = {
  name: 'Logo Recognition',
  version: '1.0.0',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8000'),
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL ?? (import.meta.env.PROD ? '' : 'ws://localhost:8000'),
  uploadChunkSize: 1024 * 1024, // 1MB chunks
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxConcurrentUploads: 3,
  requestTimeout: 30000, // 30 seconds
  wsReconnectDelay: 3000,
  wsMaxReconnectAttempts: 5,
} as const;

export const SUPPORTED_IMAGE_FORMATS = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
] as const;

export const CONFIDENCE_THRESHOLDS = {
  LOW: 0.5,
  MEDIUM: 0.7,
  HIGH: 0.9,
} as const;

export const ANIMATION_DURATION = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
} as const;

export const LOCAL_STORAGE_KEYS = {
  THEME: 'logo-recognition:theme',
  LANGUAGE: 'logo-recognition:language',
  RECENT_UPLOADS: 'logo-recognition:recent-uploads',
  FILTERS: 'logo-recognition:filters',
} as const;

export const ROUTES = {
  HOME: '/',
  RECOGNITION: '/recognition',
  HISTORY: '/history',
  SETTINGS: '/settings',
  ABOUT: '/about',
} as const;

export const ERROR_MESSAGES = {
  UPLOAD_FAILED: 'Failed to upload image',
  RECOGNITION_FAILED: 'Failed to recognize logos',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  FILE_TOO_LARGE: 'File size exceeds maximum allowed size',
  INVALID_FILE_TYPE: 'Invalid file type. Please upload an image.',
  WEBSOCKET_ERROR: 'Real-time connection error',
} as const;