import { PreservedState } from '../components/ErrorBoundary/EnterpriseErrorBoundary';

interface PreservationOptions {
  includeFormData?: boolean;
  includeScrollPosition?: boolean;
  includeTemporaryData?: boolean;
  includeUserPreferences?: boolean;
}

interface SessionData {
  sessionId: string;
  userId?: string;
  startTime: number;
  lastActivity: number;
  featureFlags?: Record<string, boolean>;
}

export class UserStatePreservation {
  private readonly STORAGE_KEY_PREFIX = 'user_state_';
  private readonly SESSION_KEY = 'session_data';
  private readonly MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB max
  private sessionData: SessionData;

  constructor() {
    this.sessionData = this.initializeSession();
    this.setupAutoSave();
  }

  private initializeSession(): SessionData {
    try {
      const stored = sessionStorage.getItem(this.SESSION_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        data.lastActivity = Date.now();
        return data;
      }
    } catch (error) {
      console.error('Failed to restore session data:', error);
    }

    return {
      sessionId: this.generateSessionId(),
      startTime: Date.now(),
      lastActivity: Date.now(),
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupAutoSave() {
    // Auto-save form data on input
    document.addEventListener('input', this.handleFormInput.bind(this), true);

    // Save scroll position on scroll
    let scrollTimeout: NodeJS.Timeout;
    document.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        this.saveScrollPosition();
      }, 100);
    }, true);

    // Save session data periodically
    setInterval(() => {
      this.persistSessionData();
    }, 10000); // Every 10 seconds
  }

  private handleFormInput(event: Event) {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

    if (!target || !target.form) return;

    const formId = this.getFormId(target.form);
    const fieldName = target.name || target.id;

    if (!formId || !fieldName) return;

    this.saveFormField(formId, fieldName, target.value);
  }

  private getFormId(form: HTMLFormElement): string {
    return form.id || form.name || `form_${Array.from(document.forms).indexOf(form)}`;
  }

  private saveFormField(formId: string, fieldName: string, value: string) {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}form_${formId}`;
      const existing = this.getStoredData(key) || {};
      existing[fieldName] = value;

      this.setStoredData(key, existing);
    } catch (error) {
      console.error('Failed to save form field:', error);
    }
  }

  private saveScrollPosition() {
    try {
      const position = {
        x: window.scrollX,
        y: window.scrollY,
        path: window.location.pathname,
      };

      this.setStoredData(`${this.STORAGE_KEY_PREFIX}scroll`, position);
    } catch (error) {
      console.error('Failed to save scroll position:', error);
    }
  }

  async preserveCurrentState(options: PreservationOptions = {}): Promise<PreservedState> {
    const state: PreservedState = {
      formData: {},
      scrollPosition: 0,
      routeParams: {},
      userPreferences: {},
      temporaryData: {},
      timestamp: Date.now(),
    };

    // Preserve form data
    if (options.includeFormData !== false) {
      state.formData = await this.collectFormData();
    }

    // Preserve scroll position
    if (options.includeScrollPosition !== false) {
      state.scrollPosition = window.scrollY;
    }

    // Preserve route params
    const params = new URLSearchParams(window.location.search);
    params.forEach((value, key) => {
      state.routeParams[key] = value;
    });

    // Preserve user preferences
    if (options.includeUserPreferences !== false) {
      state.userPreferences = await this.collectUserPreferences();
    }

    // Preserve temporary data
    if (options.includeTemporaryData !== false) {
      state.temporaryData = await this.collectTemporaryData();
    }

    // Store the preserved state
    this.storePreservedState(state);

    return state;
  }

  private async collectFormData(): Promise<Record<string, any>> {
    const formData: Record<string, any> = {};

    // Collect data from all forms on the page
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      const formId = this.getFormId(form);
      const data: Record<string, any> = {};

      // Collect all form fields
      const elements = form.elements;
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i] as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

        if (element.name || element.id) {
          const fieldName = element.name || element.id;

          if (element.type === 'checkbox') {
            data[fieldName] = (element as HTMLInputElement).checked;
          } else if (element.type === 'radio') {
            if ((element as HTMLInputElement).checked) {
              data[fieldName] = element.value;
            }
          } else {
            data[fieldName] = element.value;
          }
        }
      }

      if (Object.keys(data).length > 0) {
        formData[formId] = data;
      }
    });

    // Also collect any auto-saved form data
    const keys = this.getAllStorageKeys();
    keys.forEach(key => {
      if (key.startsWith(`${this.STORAGE_KEY_PREFIX}form_`)) {
        const formId = key.replace(`${this.STORAGE_KEY_PREFIX}form_`, '');
        const savedData = this.getStoredData(key);
        if (savedData) {
          formData[formId] = { ...formData[formId], ...savedData };
        }
      }
    });

    return formData;
  }

  private async collectUserPreferences(): Promise<Record<string, any>> {
    const preferences: Record<string, any> = {};

    // Collect from localStorage
    try {
      const themePreference = localStorage.getItem('theme');
      if (themePreference) preferences.theme = themePreference;

      const languagePreference = localStorage.getItem('language');
      if (languagePreference) preferences.language = languagePreference;

      const accessibilitySettings = localStorage.getItem('accessibility');
      if (accessibilitySettings) {
        preferences.accessibility = JSON.parse(accessibilitySettings);
      }
    } catch (error) {
      console.error('Failed to collect user preferences:', error);
    }

    return preferences;
  }

  private async collectTemporaryData(): Promise<Record<string, any>> {
    const temporaryData: Record<string, any> = {};

    // Collect any temporary data stored with specific prefix
    const keys = this.getAllStorageKeys();
    keys.forEach(key => {
      if (key.startsWith(`${this.STORAGE_KEY_PREFIX}temp_`)) {
        const dataKey = key.replace(`${this.STORAGE_KEY_PREFIX}temp_`, '');
        temporaryData[dataKey] = this.getStoredData(key);
      }
    });

    return temporaryData;
  }

  private storePreservedState(state: PreservedState) {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}preserved_${Date.now()}`;
      this.setStoredData(key, state);

      // Clean up old preserved states (keep only last 5)
      this.cleanupOldPreservedStates();
    } catch (error) {
      console.error('Failed to store preserved state:', error);
    }
  }

  private cleanupOldPreservedStates() {
    const keys = this.getAllStorageKeys();
    const preservedKeys = keys
      .filter(key => key.startsWith(`${this.STORAGE_KEY_PREFIX}preserved_`))
      .sort();

    // Keep only the 5 most recent
    if (preservedKeys.length > 5) {
      const toRemove = preservedKeys.slice(0, preservedKeys.length - 5);
      toRemove.forEach(key => {
        try {
          sessionStorage.removeItem(key);
        } catch (error) {
          console.error('Failed to remove old preserved state:', error);
        }
      });
    }
  }

  async restoreState(state: PreservedState): Promise<void> {
    try {
      // Restore form data
      if (state.formData && Object.keys(state.formData).length > 0) {
        await this.restoreFormData(state.formData);
      }

      // Restore scroll position
      if (state.scrollPosition > 0) {
        window.scrollTo(0, state.scrollPosition);
      }

      // Restore route params if on same path
      if (state.routeParams && Object.keys(state.routeParams).length > 0) {
        const currentPath = window.location.pathname;
        const params = new URLSearchParams(window.location.search);

        Object.entries(state.routeParams).forEach(([key, value]) => {
          if (!params.has(key)) {
            params.set(key, value);
          }
        });

        const newUrl = `${currentPath}?${params.toString()}`;
        window.history.replaceState({}, '', newUrl);
      }

      // Restore user preferences
      if (state.userPreferences && Object.keys(state.userPreferences).length > 0) {
        await this.restoreUserPreferences(state.userPreferences);
      }

      // Restore temporary data
      if (state.temporaryData && Object.keys(state.temporaryData).length > 0) {
        await this.restoreTemporaryData(state.temporaryData);
      }
    } catch (error) {
      console.error('Failed to restore state:', error);
    }
  }

  private async restoreFormData(formData: Record<string, any>) {
    Object.entries(formData).forEach(([formId, data]) => {
      // Try to find the form
      let form = document.getElementById(formId) as HTMLFormElement;

      if (!form) {
        form = document.querySelector(`form[name="${formId}"]`) as HTMLFormElement;
      }

      if (form && data && typeof data === 'object') {
        Object.entries(data).forEach(([fieldName, value]) => {
          const field = form.elements.namedItem(fieldName) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

          if (field) {
            if (field.type === 'checkbox') {
              (field as HTMLInputElement).checked = value as boolean;
            } else if (field.type === 'radio') {
              const radios = form.querySelectorAll(`input[name="${fieldName}"]`) as NodeListOf<HTMLInputElement>;
              radios.forEach(radio => {
                radio.checked = radio.value === value;
              });
            } else {
              field.value = value as string;
            }

            // Trigger change event to update any dependent logic
            field.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }

      // Also save to storage for future recovery
      this.saveFormField(formId, 'restored', JSON.stringify(data));
    });
  }

  private async restoreUserPreferences(preferences: Record<string, any>) {
    Object.entries(preferences).forEach(([key, value]) => {
      try {
        if (typeof value === 'object') {
          localStorage.setItem(key, JSON.stringify(value));
        } else {
          localStorage.setItem(key, value as string);
        }
      } catch (error) {
        console.error(`Failed to restore preference ${key}:`, error);
      }
    });
  }

  private async restoreTemporaryData(temporaryData: Record<string, any>) {
    Object.entries(temporaryData).forEach(([key, value]) => {
      const storageKey = `${this.STORAGE_KEY_PREFIX}temp_${key}`;
      this.setStoredData(storageKey, value);
    });
  }

  getSessionId(): string {
    return this.sessionData.sessionId;
  }

  async getUserId(): Promise<string | undefined> {
    // Try to get user ID from various sources
    try {
      // Check session data
      if (this.sessionData.userId) {
        return this.sessionData.userId;
      }

      // Check localStorage
      const storedUserId = localStorage.getItem('userId');
      if (storedUserId) {
        this.sessionData.userId = storedUserId;
        return storedUserId;
      }

      // Check cookies
      const userIdCookie = document.cookie
        .split('; ')
        .find(row => row.startsWith('userId='));

      if (userIdCookie) {
        const userId = userIdCookie.split('=')[1];
        this.sessionData.userId = userId;
        return userId;
      }
    } catch (error) {
      console.error('Failed to get user ID:', error);
    }

    return undefined;
  }

  async getFeatureFlags(): Promise<Record<string, boolean>> {
    if (this.sessionData.featureFlags) {
      return this.sessionData.featureFlags;
    }

    try {
      const stored = localStorage.getItem('featureFlags');
      if (stored) {
        this.sessionData.featureFlags = JSON.parse(stored);
        return this.sessionData.featureFlags;
      }
    } catch (error) {
      console.error('Failed to get feature flags:', error);
    }

    return {};
  }

  private persistSessionData() {
    try {
      this.sessionData.lastActivity = Date.now();
      sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(this.sessionData));
    } catch (error) {
      console.error('Failed to persist session data:', error);
    }
  }

  private getStoredData(key: string): any {
    try {
      const data = sessionStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return sessionStorage.getItem(key);
    }
  }

  private setStoredData(key: string, value: any) {
    try {
      const serialized = JSON.stringify(value);

      // Check storage size limit
      if (serialized.length > this.MAX_STORAGE_SIZE) {
        console.warn('Data too large to store, truncating...');
        return;
      }

      sessionStorage.setItem(key, serialized);
    } catch (error) {
      console.error('Failed to store data:', error);

      // If quota exceeded, try to clean up old data
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        this.cleanupOldData();
        // Try once more
        try {
          sessionStorage.setItem(key, JSON.stringify(value));
        } catch {
          // Give up if still failing
        }
      }
    }
  }

  private getAllStorageKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(this.STORAGE_KEY_PREFIX)) {
        keys.push(key);
      }
    }
    return keys;
  }

  private cleanupOldData() {
    const keys = this.getAllStorageKeys();

    // Remove oldest data first
    const sortedKeys = keys.sort();
    const toRemove = Math.floor(sortedKeys.length * 0.3); // Remove 30% of oldest data

    for (let i = 0; i < toRemove; i++) {
      try {
        sessionStorage.removeItem(sortedKeys[i]);
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  clearAllPreservedState() {
    const keys = this.getAllStorageKeys();
    keys.forEach(key => {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // Ignore errors
      }
    });
  }
}