/**
 * BackupService Tests
 * Story: FE-001.0.2
 * Coverage Target: 100%
 */

import '../../../migration.disabled/setupTests';
import { BackupService, Backup, BackupManifest, RestoreResult } from '../../../migration.disabled/backup/BackupService';
import * as CryptoJS from 'crypto-js';

// Mock crypto-js with more realistic behavior
jest.mock('crypto-js', () => {
  const mockToString = jest.fn(() => 'random_key_32_bytes');
  const mockWordArray = {
    toString: mockToString
  };

  const mockCrypto = {
    AES: {
      encrypt: jest.fn((data: string, key: any, options: any) => ({
        toString: () => 'encrypted_' + data.substring(0, 20)
      })),
      decrypt: jest.fn((data: string, key: any, options: any) => ({
        toString: jest.fn(() => {
          if (data.startsWith('encrypted_') || data.includes('salt:iv:')) {
            return '{"localStorage":{"test":"data"},"sessionStorage":{"session":"data"},"indexedDB":{"databases":{}},"userData":{},"appState":{}}';
          }
          throw new Error('Invalid encrypted data');
        })
      }))
    },
    SHA256: jest.fn((data: string) => ({ toString: () => 'checksum_' + data.length })),
    PBKDF2: jest.fn((password: string, salt: any) => 'derived_key'),
    lib: {
      WordArray: {
        random: jest.fn((size: number) => mockWordArray)
      }
    },
    mode: { CBC: {} },
    pad: { Pkcs7: {} },
    enc: {
      Utf8: {}
    }
  };

  return {
    __esModule: true,
    default: mockCrypto,
    ...mockCrypto
  };
});

describe('BackupService', () => {
  let service: BackupService;
  let mockLocalStorage: Record<string, string>;
  let mockSessionStorage: Record<string, string>;
  let mockIndexedDB: any;
  let originalConsole: Console;
  let originalNavigator: any;

  beforeEach(() => {
    originalConsole = window.console;
    originalNavigator = window.navigator;

    // Mock console
    window.console = {
      ...originalConsole,
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    // Mock navigator.storage
    Object.defineProperty(window.navigator, 'storage', {
      value: {
        estimate: jest.fn(() => Promise.resolve({
          usage: 100 * 1024 * 1024, // 100MB used
          quota: 1024 * 1024 * 1024, // 1GB quota
        })),
      },
      writable: true,
    });

    // Mock crypto.subtle
    Object.defineProperty(window, 'crypto', {
      value: {
        subtle: {},
        getRandomValues: jest.fn(),
      },
      writable: true,
    });

    service = new BackupService();

    // Mock localStorage
    mockLocalStorage = {
      'user_preferences': JSON.stringify({ theme: 'dark' }),
      'nav-collapsed': 'true',
      'theme_settings': JSON.stringify({ color: 'blue' })
    };

    const localStorageMock = {
      getItem: jest.fn((key: string) => mockLocalStorage[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        mockLocalStorage[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete mockLocalStorage[key];
      }),
      clear: jest.fn(() => {
        mockLocalStorage = {};
      }),
      length: Object.keys(mockLocalStorage).length,
      key: jest.fn((index: number) => Object.keys(mockLocalStorage)[index] || null)
    };

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    });

    // Mock sessionStorage
    mockSessionStorage = {
      'current_project': 'project123',
      'upload_progress': '75'
    };

    const sessionStorageMock = {
      getItem: jest.fn((key: string) => mockSessionStorage[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        mockSessionStorage[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete mockSessionStorage[key];
      }),
      clear: jest.fn(() => {
        mockSessionStorage = {};
      }),
      length: Object.keys(mockSessionStorage).length,
      key: jest.fn((index: number) => Object.keys(mockSessionStorage)[index] || null)
    };

    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStorageMock,
      writable: true
    });

    // Mock IndexedDB
    mockIndexedDB = {
      databases: jest.fn(() => Promise.resolve([
        { name: 'ImageCache', version: 1 },
        { name: 'AnnotationStore', version: 1 }
      ])),
      open: jest.fn((dbName: string) => ({
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: {
          version: 1,
          objectStoreNames: ['store1', 'store2'],
          transaction: jest.fn(() => ({
            objectStore: jest.fn(() => ({
              getAll: jest.fn(() => ({
                onsuccess: null as any,
                onerror: null as any,
                result: [{ id: 1, data: 'test' }]
              })),
              add: jest.fn(() => ({
                onsuccess: null as any,
                onerror: null as any
              })),
              keyPath: 'id',
              autoIncrement: true,
              indexNames: ['index1'],
              index: jest.fn(() => ({
                name: 'index1',
                keyPath: 'field',
                unique: false,
                multiEntry: false
              }))
            })),
            oncomplete: null as any,
            onerror: null as any
          })),
          close: jest.fn()
        }
      })),
      deleteDatabase: jest.fn(() => ({
        onsuccess: null as any,
        onerror: null as any
      }))
    };

    Object.defineProperty(window, 'indexedDB', {
      value: mockIndexedDB,
      writable: true
    });

    // Mock navigator
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 Chrome/91.0',
      writable: true
    });

    Object.defineProperty(window.navigator, 'platform', {
      value: 'MacIntel',
      writable: true
    });

    Object.defineProperty(window.navigator, 'language', {
      value: 'en-US',
      writable: true
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    window.console = originalConsole;
    Object.defineProperty(window.navigator, 'storage', {
      value: undefined,
      writable: true,
    });
  });

  describe('createComprehensiveBackup', () => {
    it('should create a complete backup with all components', async () => {
      // Setup IndexedDB mock to resolve immediately
      mockIndexedDB.open = jest.fn(() => {
        const request: any = {
          onsuccess: null,
          onerror: null,
          result: {
            version: 1,
            objectStoreNames: [],
            close: jest.fn()
          }
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      });

      const backup = await service.createComprehensiveBackup();

      expect(backup).toBeDefined();
      expect(backup.manifest).toBeDefined();
      expect(backup.data).toBeDefined();
      expect(backup.manifest.checksum).toBeDefined();
    });

    it('should include manifest with correct structure', async () => {
      mockIndexedDB.open = jest.fn(() => {
        const request: any = {
          onsuccess: null,
          onerror: null,
          result: {
            version: 1,
            objectStoreNames: [],
            close: jest.fn()
          }
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      });

      const backup = await service.createComprehensiveBackup();

      expect(backup.manifest.version).toBe('1.0.0');
      expect(backup.manifest.timestamp).toBeGreaterThan(0);
      expect(backup.manifest.components.localStorage).toBe(true);
      expect(backup.manifest.components.indexedDB).toBe(true);
      expect(backup.manifest.components.sessionStorage).toBe(true);
      expect(backup.manifest.components.userData).toBe(true);
      expect(backup.manifest.encryption.algorithm).toBe('AES-256');
      expect(backup.manifest.encryption.keyDerivation).toBe('PBKDF2');
    });

    it('should encrypt backup data', async () => {
      mockIndexedDB.open = jest.fn(() => {
        const request: any = {
          onsuccess: null,
          onerror: null,
          result: {
            version: 1,
            objectStoreNames: [],
            close: jest.fn()
          }
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      });

      const backup = await service.createComprehensiveBackup();

      expect(backup.data).toContain('encrypted_');
      expect(CryptoJS.AES.encrypt).toHaveBeenCalled();
    });

    it('should backup localStorage items', async () => {
      mockIndexedDB.open = jest.fn(() => {
        const request: any = {
          onsuccess: null,
          onerror: null,
          result: {
            version: 1,
            objectStoreNames: [],
            close: jest.fn()
          }
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      });

      await service.createComprehensiveBackup();

      expect(window.localStorage.getItem).toHaveBeenCalledWith('user_preferences');
      expect(window.localStorage.getItem).toHaveBeenCalledWith('nav-collapsed');
      expect(window.localStorage.getItem).toHaveBeenCalledWith('theme_settings');
    });

    it('should backup sessionStorage items', async () => {
      mockIndexedDB.open = jest.fn(() => {
        const request: any = {
          onsuccess: null,
          onerror: null,
          result: {
            version: 1,
            objectStoreNames: [],
            close: jest.fn()
          }
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      });

      await service.createComprehensiveBackup();

      expect(window.sessionStorage.getItem).toHaveBeenCalledWith('current_project');
      expect(window.sessionStorage.getItem).toHaveBeenCalledWith('upload_progress');
    });

    it('should generate checksum for backup', async () => {
      mockIndexedDB.open = jest.fn(() => {
        const request: any = {
          onsuccess: null,
          onerror: null,
          result: {
            version: 1,
            objectStoreNames: [],
            close: jest.fn()
          }
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      });

      const backup = await service.createComprehensiveBackup();

      expect(CryptoJS.SHA256).toHaveBeenCalled();
      expect(backup.manifest.checksum).toContain('checksum_');
    });
  });

  describe('restoreFromBackup', () => {
    let mockBackup: Backup;

    beforeEach(() => {
      mockBackup = {
        manifest: {
          version: '1.0.0',
          timestamp: Date.now(),
          checksum: 'checksum_test',
          components: {
            localStorage: true,
            indexedDB: true,
            sessionStorage: true,
            userData: true
          },
          encryption: {
            algorithm: 'AES-256',
            keyDerivation: 'PBKDF2'
          },
          environment: 'test',
          browserInfo: {
            userAgent: 'Mozilla/5.0 Chrome/91.0',
            platform: 'MacIntel',
            language: 'en-US'
          }
        },
        data: 'encrypted_{"localStorage":{"test":"data"},"sessionStorage":{"session":"data"},"indexedDB":{"databases":{}},"userData":{},"appState":{}}'
      };

      // Mock checksum verification
      (CryptoJS.SHA256 as jest.Mock).mockReturnValue({
        toString: () => 'checksum_test'
      });

      // Mock decryption
      (CryptoJS.AES.decrypt as jest.Mock).mockReturnValue({
        toString: () => '{"localStorage":{"test":"data"},"sessionStorage":{"session":"data"},"indexedDB":{"databases":{}},"userData":{},"appState":{}}'
      });
    });

    it('should verify checksum before restore', async () => {
      const result = await service.restoreFromBackup(mockBackup);

      expect(CryptoJS.SHA256).toHaveBeenCalled();
    });

    it('should fail restore if checksum is invalid', async () => {
      (CryptoJS.SHA256 as jest.Mock).mockReturnValueOnce({
        toString: () => 'invalid_checksum'
      }).mockReturnValueOnce({
        toString: () => 'invalid_checksum'
      });

      const result = await service.restoreFromBackup(mockBackup);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Backup integrity check failed - checksum mismatch');
    });

    it('should decrypt backup data', async () => {
      await service.restoreFromBackup(mockBackup);

      expect(CryptoJS.AES.decrypt).toHaveBeenCalledWith(mockBackup.data, expect.any(String));
    });

    it('should restore localStorage items', async () => {
      const result = await service.restoreFromBackup(mockBackup);

      expect(window.localStorage.setItem).toHaveBeenCalledWith('test', '"data"');
      expect(result.restoredItems).toBeGreaterThan(0);
    });

    it('should restore sessionStorage items', async () => {
      const result = await service.restoreFromBackup(mockBackup);

      expect(window.sessionStorage.setItem).toHaveBeenCalledWith('session', '"data"');
      expect(result.restoredItems).toBeGreaterThan(0);
    });

    it('should create restore point before restoration', async () => {
      await service.restoreFromBackup(mockBackup);

      expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
        '__restore_point__',
        expect.stringContaining('timestamp')
      );
    });

    it('should return success result on successful restore', async () => {
      const result = await service.restoreFromBackup(mockBackup);

      expect(result.success).toBe(true);
      expect(result.restoredItems).toBeGreaterThan(0);
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should check browser compatibility', async () => {
      // Different browser
      mockBackup.manifest.browserInfo.userAgent = 'Mozilla/5.0 Firefox/89.0';

      const result = await service.restoreFromBackup(mockBackup);

      expect(result.warnings).toContain('Restoring backup from different browser - some features may not work correctly');
    });
  });

  describe('downloadBackup', () => {
    it('should create downloadable file', async () => {
      const createElementSpy = jest.spyOn(document, 'createElement');
      const appendChildSpy = jest.spyOn(document.body, 'appendChild');
      const removeChildSpy = jest.spyOn(document.body, 'removeChild');

      const mockBackup: Backup = {
        manifest: {
          version: '1.0.0',
          timestamp: Date.now(),
          checksum: 'test',
          components: {
            localStorage: true,
            indexedDB: true,
            sessionStorage: true,
            userData: true
          },
          encryption: {
            algorithm: 'AES-256',
            keyDerivation: 'PBKDF2'
          },
          environment: 'test',
          browserInfo: {
            userAgent: 'test',
            platform: 'test',
            language: 'test'
          }
        },
        data: 'encrypted_data'
      };

      // Mock URL methods
      const mockURL = {
        createObjectURL: jest.fn(() => 'blob:test'),
        revokeObjectURL: jest.fn()
      };
      Object.defineProperty(window, 'URL', {
        value: mockURL,
        writable: true
      });

      await service.downloadBackup(mockBackup);

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
      expect(mockURL.createObjectURL).toHaveBeenCalled();
      expect(mockURL.revokeObjectURL).toHaveBeenCalled();
    });
  });

  describe('uploadBackupFile', () => {
    it('should parse valid backup file', async () => {
      const validBackup = {
        manifest: {
          version: '1.0.0',
          timestamp: Date.now(),
          checksum: 'test'
        },
        data: 'encrypted_data'
      };

      const file = new File([JSON.stringify(validBackup)], 'backup.json', {
        type: 'application/json'
      });

      const result = await service.uploadBackupFile(file);

      expect(result).toEqual(validBackup);
    });

    it('should reject invalid backup file', async () => {
      const file = new File(['invalid json'], 'backup.json', {
        type: 'application/json'
      });

      await expect(service.uploadBackupFile(file)).rejects.toThrow('Invalid backup file format');
    });
  });

  describe('Concurrent Operations', () => {
    it('should prevent concurrent backups', async () => {
      // Mock slow backup
      const originalBackup = service.createComprehensiveBackup.bind(service);
      let firstCallResolve: any;
      let callCount = 0;

      jest.spyOn(service as any, 'backupLocalStorage').mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return new Promise(resolve => {
            firstCallResolve = resolve;
            setTimeout(() => resolve({}), 100);
          });
        }
        return Promise.resolve({});
      });

      const firstBackup = service.createComprehensiveBackup();

      // Try concurrent backup
      await expect(service.createComprehensiveBackup()).rejects.toThrow('Backup already in progress');

      await firstBackup;
    });

    it('should prevent concurrent restores', async () => {
      const mockBackup: Backup = {
        manifest: {
          version: '1.0.0',
          timestamp: Date.now(),
          checksum: 'checksum_test',
          components: {
            localStorage: true,
            indexedDB: true,
            sessionStorage: true,
            userData: true
          },
          encryption: {
            algorithm: 'AES-256',
            keyDerivation: 'PBKDF2'
          },
          environment: 'test',
          browserInfo: {
            userAgent: 'Mozilla/5.0 Chrome/91.0',
            platform: 'MacIntel',
            language: 'en-US'
          }
        },
        data: 'salt:iv:encrypted_data'
      };

      // Mock checksum verification
      (CryptoJS.SHA256 as jest.Mock).mockReturnValue({
        toString: () => 'checksum_test'
      });

      // Mock decryption to return valid data
      (CryptoJS.AES.decrypt as jest.Mock).mockReturnValue({
        toString: () => '{"localStorage":{},"sessionStorage":{},"indexedDB":{"databases":{}},"userData":{},"appState":{}}'
      });

      // Start first restore
      const firstRestore = service.restoreFromBackup(mockBackup);

      // Try concurrent restore
      await expect(service.restoreFromBackup(mockBackup)).rejects.toThrow('Restore already in progress');

      await firstRestore;
    });
  });

  describe('Storage Space Validation', () => {
    it('should check storage space before backup', async () => {
      // Mock low storage
      (navigator.storage.estimate as jest.Mock).mockResolvedValue({
        usage: 950 * 1024 * 1024, // 950MB used
        quota: 1024 * 1024 * 1024, // 1GB quota
      });

      await expect(service.createComprehensiveBackup()).rejects.toThrow('Insufficient storage space');
    });

    it('should handle storage estimate errors gracefully', async () => {
      (navigator.storage.estimate as jest.Mock).mockRejectedValue(new Error('Storage API error'));

      // Should continue despite error
      await expect(service.createComprehensiveBackup()).resolves.toBeDefined();
    });
  });

  describe('Compression', () => {
    it('should compress large backups', async () => {
      // Create large data
      const largeData = 'x'.repeat(2 * 1024 * 1024); // 2MB
      mockLocalStorage['large_data'] = largeData;

      const backup = await service.createComprehensiveBackup();
      expect(backup.manifest.compression).toBe('gzip');
    });

    it('should handle compression errors gracefully', async () => {
      // Mock btoa to throw
      const originalBtoa = global.btoa;
      global.btoa = jest.fn(() => {
        throw new Error('Compression error');
      });

      const backup = await service.createComprehensiveBackup();
      expect(backup).toBeDefined();

      global.btoa = originalBtoa;
    });
  });

  describe('Backup Validation', () => {
    it('should validate backup structure before restore', async () => {
      const invalidBackups = [
        null,
        undefined,
        {},
        { manifest: null, data: 'test' },
        { manifest: {}, data: null },
        { manifest: { checksum: null }, data: 'test' },
      ];

      for (const invalidBackup of invalidBackups) {
        const result = await service.restoreFromBackup(invalidBackup as any);
        expect(result.success).toBe(false);
        expect(result.errors?.length).toBeGreaterThan(0);
      }
    });

    it('should validate decrypted data structure', async () => {
      const mockBackup: Backup = {
        manifest: {
          version: '1.0.0',
          timestamp: Date.now(),
          checksum: 'checksum_test',
          components: {
            localStorage: true,
            indexedDB: true,
            sessionStorage: true,
            userData: true
          },
          encryption: {
            algorithm: 'AES-256',
            keyDerivation: 'PBKDF2'
          },
          environment: 'test',
          browserInfo: {
            userAgent: 'test',
            platform: 'test',
            language: 'test'
          }
        },
        data: 'salt:iv:encrypted_invalid'
      };

      // Mock checksum to pass
      (CryptoJS.SHA256 as jest.Mock).mockReturnValue({
        toString: () => 'checksum_test'
      });

      // Mock decryption to return invalid structure
      (CryptoJS.AES.decrypt as jest.Mock).mockReturnValue({
        toString: () => '{"invalid":"structure"}'
      });

      const result = await service.restoreFromBackup(mockBackup);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid backup data: missing localStorage');
    });
  });

  describe('Error Recovery', () => {
    it('should handle IndexedDB errors during backup', async () => {
      mockIndexedDB.open = jest.fn(() => {
        const request: any = {
          onsuccess: null,
          onerror: null
        };
        setTimeout(() => request.onerror?.(new Error('IndexedDB error')), 0);
        return request;
      });

      const backup = await service.createComprehensiveBackup();
      expect(backup).toBeDefined();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('IndexedDB'));
    });

    it('should rollback on restore failure', async () => {
      const mockBackup: Backup = {
        manifest: {
          version: '1.0.0',
          timestamp: Date.now(),
          checksum: 'checksum_test',
          components: {
            localStorage: true,
            indexedDB: true,
            sessionStorage: true,
            userData: true
          },
          encryption: {
            algorithm: 'AES-256',
            keyDerivation: 'PBKDF2'
          },
          environment: 'test',
          browserInfo: {
            userAgent: 'test',
            platform: 'test',
            language: 'test'
          }
        },
        data: 'salt:iv:encrypted_data'
      };

      // Mock checksum to pass
      (CryptoJS.SHA256 as jest.Mock).mockReturnValue({
        toString: () => 'checksum_test'
      });

      // Mock localStorage.setItem to throw
      window.localStorage.setItem = jest.fn(() => {
        throw new Error('Storage error');
      });

      // Mock sessionStorage to have restore point
      mockSessionStorage['__restore_point__'] = JSON.stringify({
        timestamp: Date.now(),
        localStorage: { original: 'data' },
        sessionStorage: { original: 'session' }
      });

      const result = await service.restoreFromBackup(mockBackup);
      expect(result.warnings).toContain('Rolled back to restore point due to error');
    });
  });

  describe('Environment Detection', () => {
    it('should detect development environment', () => {
      Object.defineProperty(window.location, 'hostname', {
        value: 'localhost',
        writable: true
      });

      const backup = service.createComprehensiveBackup();
      expect((service as any).getEnvironment()).toBe('development');
    });

    it('should detect staging environment', () => {
      Object.defineProperty(window.location, 'hostname', {
        value: 'staging.example.com',
        writable: true
      });

      expect((service as any).getEnvironment()).toBe('staging');
    });

    it('should detect production environment', () => {
      Object.defineProperty(window.location, 'hostname', {
        value: 'app.example.com',
        writable: true
      });

      expect((service as any).getEnvironment()).toBe('production');
    });
  });

  describe('Security', () => {
    it('should generate secure encryption key if not provided', () => {
      delete process.env.REACT_APP_BACKUP_KEY;
      const newService = new BackupService();
      expect((newService as any).ENCRYPTION_KEY).toBeDefined();
      expect((newService as any).ENCRYPTION_KEY.length).toBeGreaterThanOrEqual(16);
    });

    it('should use environment key if provided', () => {
      process.env.REACT_APP_BACKUP_KEY = 'test-key-with-sufficient-length-for-encryption';
      const newService = new BackupService();
      expect((newService as any).ENCRYPTION_KEY).toBe('test-key-with-sufficient-length-for-encryption');
    });

    it('should handle encryption errors', async () => {
      (CryptoJS.AES.encrypt as jest.Mock).mockImplementation(() => {
        throw new Error('Encryption failed');
      });

      await expect(service.createComprehensiveBackup()).rejects.toThrow('Encryption failed');
    });

    it('should handle decryption errors', async () => {
      const mockBackup: Backup = {
        manifest: {
          version: '1.0.0',
          timestamp: Date.now(),
          checksum: 'checksum_test',
          components: {
            localStorage: true,
            indexedDB: true,
            sessionStorage: true,
            userData: true
          },
          encryption: {
            algorithm: 'AES-256',
            keyDerivation: 'PBKDF2'
          },
          environment: 'test',
          browserInfo: {
            userAgent: 'test',
            platform: 'test',
            language: 'test'
          }
        },
        data: 'invalid:format'
      };

      const result = await service.restoreFromBackup(mockBackup);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid encrypted data format');
    });
  });

  describe('Point-in-Time Recovery', () => {
    it('should create point-in-time backup', async () => {
      const timestamp = Date.now() - 3600000; // 1 hour ago
      const backup = await service.createPointInTimeBackup(timestamp);
      expect(backup.manifest.timestamp).toBe(timestamp);
    });
  });

  describe('listAvailableBackups', () => {
    it('should return list of backups from localStorage', async () => {
      const backupHistory = [
        { timestamp: Date.now() - 3600000, size: 1024, checksum: 'check1' },
        { timestamp: Date.now() - 1800000, size: 2048, checksum: 'check2' }
      ];

      mockLocalStorage['backup_history'] = JSON.stringify(backupHistory);

      const list = await service.listAvailableBackups();

      expect(list).toEqual(backupHistory);
    });

    it('should return empty array if no backups exist', async () => {
      delete mockLocalStorage['backup_history'];

      const list = await service.listAvailableBackups();

      expect(list).toEqual([]);
    });
  });
});