/**
 * API Usage Examples - Logo Recognition API
 *
 * Deze file bevat praktische voorbeelden voor het gebruik van de
 * Logo Recognition API in Docker.
 */

// ===== BASIC USAGE =====

/**
 * Example 1: Health Check
 */
async function checkHealth() {
  try {
    const response = await fetch('http://localhost:8000/health');
    const data = await response.json();

    console.log('API Health:', data);
    // Output: { status: 'ok', timestamp: '2025-11-03T20:30:00.000Z' }

    return data.status === 'ok';
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

/**
 * Example 2: Health Check met Error Handling
 */
async function healthCheckWithRetry(maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('http://localhost:8000/health', {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ API is healthy (attempt ${i + 1}/${maxRetries})`);
      return data;

    } catch (error) {
      console.error(`❌ Attempt ${i + 1}/${maxRetries} failed:`, error.message);

      if (i < maxRetries - 1) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  throw new Error('API health check failed after all retries');
}

// ===== CONFIGURATION =====

/**
 * API Configuration Object
 */
const API_CONFIG = {
  // Docker container (from host)
  baseURL: 'http://localhost:8000',

  // From another container (use service name)
  containerURL: 'http://api:8000',

  // Headers
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },

  // Timeouts
  timeout: 30000, // 30 seconds
};

/**
 * API Client Class
 */
class LogoRecognitionAPI {
  constructor(config = API_CONFIG) {
    this.baseURL = config.baseURL;
    this.headers = config.headers;
    this.timeout = config.timeout;
  }

  /**
   * Generic request method
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.headers,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      throw error;
    }
  }

  /**
   * Health check
   */
  async health() {
    return this.request('/health');
  }

  /**
   * Logo Recognition (placeholder - implement based on your API)
   */
  async recognizeLogo(imageData) {
    return this.request('/api/v1/recognition', {
      method: 'POST',
      body: JSON.stringify({ image: imageData }),
    });
  }

  /**
   * Get Recognition Result (placeholder)
   */
  async getRecognitionResult(id) {
    return this.request(`/api/v1/recognition/${id}`);
  }
}

// ===== USAGE EXAMPLES =====

/**
 * Example 3: Using API Client
 */
async function exampleAPIClient() {
  const api = new LogoRecognitionAPI();

  try {
    // Check health
    const health = await api.health();
    console.log('API Status:', health);

    // Recognize logo (example)
    // const result = await api.recognizeLogo(imageBase64);
    // console.log('Recognition Result:', result);

  } catch (error) {
    console.error('API Error:', error.message);
  }
}

/**
 * Example 4: React Hook
 */
function useLogoRecognitionAPI() {
  const [api] = React.useState(() => new LogoRecognitionAPI());
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const checkHealth = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.health();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const recognizeLogo = async (imageData) => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.recognizeLogo(imageData);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    api,
    loading,
    error,
    checkHealth,
    recognizeLogo,
  };
}

/**
 * Example 5: React Component
 */
function APIStatusComponent() {
  const { loading, error, checkHealth } = useLogoRecognitionAPI();
  const [status, setStatus] = React.useState(null);

  React.useEffect(() => {
    checkHealth()
      .then(setStatus)
      .catch(console.error);
  }, []);

  if (loading) return <div>Checking API...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!status) return <div>No data</div>;

  return (
    <div>
      <h2>API Status</h2>
      <p>Status: {status.status}</p>
      <p>Timestamp: {new Date(status.timestamp).toLocaleString()}</p>
    </div>
  );
}

/**
 * Example 6: Zustand Store
 */
const useAPIStore = create((set, get) => ({
  status: null,
  loading: false,
  error: null,

  checkHealth: async () => {
    set({ loading: true, error: null });

    try {
      const api = new LogoRecognitionAPI();
      const status = await api.health();
      set({ status, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },
}));

/**
 * Example 7: TanStack Query
 */
function useAPIHealth() {
  return useQuery({
    queryKey: ['api-health'],
    queryFn: async () => {
      const api = new LogoRecognitionAPI();
      return api.health();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: 3,
  });
}

// ===== TESTING HELPERS =====

/**
 * Example 8: Wait for API to be Ready
 */
async function waitForAPI(maxAttempts = 10, interval = 1000) {
  const api = new LogoRecognitionAPI();

  for (let i = 0; i < maxAttempts; i++) {
    try {
      await api.health();
      console.log(`✅ API ready after ${i + 1} attempts`);
      return true;
    } catch (error) {
      console.log(`⏳ Waiting for API (attempt ${i + 1}/${maxAttempts})...`);
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  throw new Error('API not ready after maximum attempts');
}

/**
 * Example 9: Test Suite Setup
 */
async function setupTests() {
  console.log('Setting up tests...');

  // Wait for API to be ready
  await waitForAPI();

  // Additional setup
  console.log('✅ Test setup complete');
}

// ===== EXPORTS =====

// For Node.js / CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LogoRecognitionAPI,
    API_CONFIG,
    checkHealth,
    healthCheckWithRetry,
    waitForAPI,
    setupTests,
  };
}

// For ES Modules
export {
  LogoRecognitionAPI,
  API_CONFIG,
  checkHealth,
  healthCheckWithRetry,
  waitForAPI,
  setupTests,
};

// ===== USAGE IN YOUR PROJECT =====

/*
// Import in React component:
import { LogoRecognitionAPI } from './examples/api-usage.js';

// Create instance
const api = new LogoRecognitionAPI({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
});

// Use in component
async function MyComponent() {
  const health = await api.health();
  return <div>Status: {health.status}</div>;
}

// Or use with React Query:
import { useAPIHealth } from './examples/api-usage.js';

function MyComponent() {
  const { data, isLoading, error } = useAPIHealth();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>Status: {data.status}</div>;
}
*/
