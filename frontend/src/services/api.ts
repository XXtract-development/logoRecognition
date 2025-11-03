/**
 * API Service - Central API client with authentication handling
 * Manages all HTTP requests to backend with JWT token management
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';

// Configuration from environment
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api';
const WS_BASE_URL = process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:8000/ws';

/**
 * Interface for authentication tokens
 * @interface AuthTokens
 * @property {string} access - JWT access token for API authentication
 * @property {string} refresh - JWT refresh token for token renewal
 */
interface AuthTokens {
  access: string;
  refresh: string;
}

/**
 * Interface for API error responses
 * @interface ApiError
 * @property {string} message - Human-readable error message
 * @property {string} code - Error code for programmatic handling
 * @property {number} status - HTTP status code
 * @property {any} details - Additional error details
 */
interface ApiError {
  message: string;
  code: string;
  status: number;
  details?: any;
}

/**
 * Main API client class with automatic token management
 * @class ApiClient
 * @description Handles all HTTP requests with JWT authentication,
 * automatic token refresh, and comprehensive error handling
 */
class ApiClient {
  private axiosInstance: AxiosInstance;
  private refreshTokenPromise: Promise<void> | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Sets up request and response interceptors for authentication
   * @private
   * @returns {void}
   */
  private setupInterceptors(): void {
    // Request interceptor to add auth token
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const token = this.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle token refresh
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          if (!this.refreshTokenPromise) {
            this.refreshTokenPromise = this.refreshAccessToken();
          }

          try {
            await this.refreshTokenPromise;
            this.refreshTokenPromise = null;
            return this.axiosInstance(originalRequest);
          } catch (refreshError) {
            this.refreshTokenPromise = null;
            this.clearTokens();
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(this.formatError(error));
      }
    );
  }

  /**
   * Retrieves the access token from localStorage
   * @private
   * @returns {string | null} The access token or null if not found
   */
  private getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }

  /**
   * Retrieves the refresh token from localStorage
   * @private
   * @returns {string | null} The refresh token or null if not found
   */
  private getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
  }

  /**
   * Stores authentication tokens in localStorage
   * @param {AuthTokens} tokens - The authentication tokens to store
   * @returns {void}
   */
  public setTokens(tokens: AuthTokens): void {
    localStorage.setItem('access_token', tokens.access);
    localStorage.setItem('refresh_token', tokens.refresh);
  }

  /**
   * Clears all authentication tokens from localStorage
   * @returns {void}
   */
  public clearTokens(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  /**
   * Refreshes the access token using the refresh token
   * @private
   * @returns {Promise<void>} Promise that resolves when token is refreshed
   * @throws {Error} When refresh token is invalid or missing
   */
  private async refreshAccessToken(): Promise<void> {
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        refresh_token: refreshToken,
      });

      this.setTokens({
        access: response.data.access_token,
        refresh: response.data.refresh_token || refreshToken,
      });
    } catch (error) {
      this.clearTokens();
      throw error;
    }
  }

  /**
   * Formats API errors into a consistent structure
   * @private
   * @param {AxiosError} error - The axios error to format
   * @returns {ApiError} Formatted error object
   */
  private formatError(error: AxiosError): ApiError {
    if (error.response) {
      return {
        message: (error.response.data as any)?.detail || 'An error occurred',
        code: (error.response.data as any)?.code || 'API_ERROR',
        status: error.response.status,
        details: error.response.data,
      };
    }

    if (error.request) {
      return {
        message: 'No response from server',
        code: 'NETWORK_ERROR',
        status: 0,
        details: error.request,
      };
    }

    return {
      message: error.message || 'An unknown error occurred',
      code: 'CLIENT_ERROR',
      status: 0,
      details: error,
    };
  }

  /**
   * Performs a GET request
   * @template T
   * @param {string} url - The endpoint URL
   * @param {AxiosRequestConfig} config - Optional axios configuration
   * @returns {Promise<T>} Promise resolving to the response data
   */
  public async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.get<T>(url, config);
    return response.data;
  }

  /**
   * Performs a POST request
   * @template T
   * @param {string} url - The endpoint URL
   * @param {any} data - Request body data
   * @param {AxiosRequestConfig} config - Optional axios configuration
   * @returns {Promise<T>} Promise resolving to the response data
   */
  public async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.post<T>(url, data, config);
    return response.data;
  }

  /**
   * Performs a PUT request
   * @template T
   * @param {string} url - The endpoint URL
   * @param {any} data - Request body data
   * @param {AxiosRequestConfig} config - Optional axios configuration
   * @returns {Promise<T>} Promise resolving to the response data
   */
  public async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.put<T>(url, data, config);
    return response.data;
  }

  /**
   * Performs a PATCH request
   * @template T
   * @param {string} url - The endpoint URL
   * @param {any} data - Request body data
   * @param {AxiosRequestConfig} config - Optional axios configuration
   * @returns {Promise<T>} Promise resolving to the response data
   */
  public async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.patch<T>(url, data, config);
    return response.data;
  }

  /**
   * Performs a DELETE request
   * @template T
   * @param {string} url - The endpoint URL
   * @param {AxiosRequestConfig} config - Optional axios configuration
   * @returns {Promise<T>} Promise resolving to the response data
   */
  public async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.delete<T>(url, config);
    return response.data;
  }

  /**
   * Uploads a file with multipart/form-data
   * @param {string} url - The endpoint URL
   * @param {FormData} formData - Form data containing the file
   * @param {Function} onProgress - Progress callback function
   * @returns {Promise<any>} Promise resolving to the response data
   */
  public async uploadFile(
    url: string,
    formData: FormData,
    onProgress?: (progressEvent: any) => void
  ): Promise<any> {
    return this.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: onProgress,
    });
  }

  /**
   * Creates a WebSocket connection with authentication
   * @param {string} path - The WebSocket endpoint path
   * @returns {WebSocket} Configured WebSocket instance
   */
  public createWebSocket(path: string): WebSocket {
    const token = this.getAccessToken();
    const wsUrl = `${WS_BASE_URL}${path}${token ? `?token=${token}` : ''}`;
    return new WebSocket(wsUrl);
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export types
export type { AuthTokens, ApiError };