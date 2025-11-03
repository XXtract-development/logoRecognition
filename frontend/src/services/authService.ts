/**
 * Authentication Service - Manages user authentication and authorization
 * @module services/authService
 * @description Handles login, logout, registration, and token management with backend API
 */

import { apiClient } from './api';

/**
 * User authentication credentials interface
 * @interface LoginCredentials
 * @property {string} email - User's email address
 * @property {string} password - User's password
 */
interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * User registration data interface
 * @interface RegisterData
 * @property {string} email - User's email address
 * @property {string} password - User's password
 * @property {string} name - User's full name
 * @property {string} organization - User's organization (optional)
 */
interface RegisterData {
  email: string;
  password: string;
  name: string;
  organization?: string;
}

/**
 * User profile interface
 * @interface UserProfile
 * @property {string} id - Unique user identifier
 * @property {string} email - User's email address
 * @property {string} name - User's full name
 * @property {string} organization - User's organization
 * @property {string[]} roles - User's roles (e.g., 'admin', 'user')
 * @property {Date} createdAt - Account creation timestamp
 * @property {Date} lastLogin - Last login timestamp
 */
interface UserProfile {
  id: string;
  email: string;
  name: string;
  organization?: string;
  roles: string[];
  createdAt: Date;
  lastLogin?: Date;
}

/**
 * Authentication response interface
 * @interface AuthResponse
 * @property {string} access_token - JWT access token
 * @property {string} refresh_token - JWT refresh token
 * @property {string} token_type - Token type (e.g., 'Bearer')
 * @property {number} expires_in - Token expiration time in seconds
 * @property {UserProfile} user - Authenticated user profile
 */
interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

/**
 * Authentication Service Class
 * @class AuthService
 * @description Manages all authentication-related operations
 */
class AuthService {
  private currentUser: UserProfile | null = null;
  private tokenRefreshTimeout: NodeJS.Timeout | null = null;

  constructor() {
    // Check for existing session on initialization
    this.checkExistingSession();
  }

  /**
   * Checks for existing authentication session on app load
   * @private
   * @returns {Promise<void>}
   */
  private async checkExistingSession(): Promise<void> {
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        // Verify token with backend
        const user = await this.getCurrentUser();
        if (user) {
          this.currentUser = user;
          this.setupTokenRefresh();
        }
      } catch (error) {
        // Invalid token, clear storage
        this.logout();
      }
    }
  }

  /**
   * Authenticates user with email and password
   * @param {LoginCredentials} credentials - User login credentials
   * @returns {Promise<UserProfile>} Authenticated user profile
   * @throws {Error} When authentication fails
   * @example
   * const user = await authService.login({ email: 'user@example.com', password: 'password123' });
   */
  public async login(credentials: LoginCredentials): Promise<UserProfile> {
    try {
      // Create form data for OAuth2 password flow
      const formData = new URLSearchParams();
      formData.append('username', credentials.email);
      formData.append('password', credentials.password);
      formData.append('grant_type', 'password');

      const response = await apiClient.post<AuthResponse>('/auth/login', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      // Store tokens
      apiClient.setTokens({
        access: response.access_token,
        refresh: response.refresh_token,
      });

      // Store user profile
      this.currentUser = response.user;
      localStorage.setItem('user_profile', JSON.stringify(response.user));

      // Setup automatic token refresh
      this.setupTokenRefresh(response.expires_in);

      return response.user;
    } catch (error: any) {
      console.error('Login failed:', error);
      throw new Error(error.message || 'Authentication failed. Please check your credentials.');
    }
  }

  /**
   * Registers a new user account
   * @param {RegisterData} data - User registration data
   * @returns {Promise<UserProfile>} Created user profile
   * @throws {Error} When registration fails
   * @example
   * const user = await authService.register({
   *   email: 'user@example.com',
   *   password: 'password123',
   *   name: 'John Doe',
   *   organization: 'Acme Corp'
   * });
   */
  public async register(data: RegisterData): Promise<UserProfile> {
    try {
      const response = await apiClient.post<AuthResponse>('/auth/register', data);

      // Automatically log in after successful registration
      apiClient.setTokens({
        access: response.access_token,
        refresh: response.refresh_token,
      });

      this.currentUser = response.user;
      localStorage.setItem('user_profile', JSON.stringify(response.user));
      this.setupTokenRefresh(response.expires_in);

      return response.user;
    } catch (error: any) {
      console.error('Registration failed:', error);
      throw new Error(error.message || 'Registration failed. Please try again.');
    }
  }

  /**
   * Logs out the current user
   * @returns {Promise<void>}
   * @example
   * await authService.logout();
   */
  public async logout(): Promise<void> {
    try {
      // Notify backend about logout
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      // Clear local state regardless of API call result
      this.clearSession();
    }
  }

  /**
   * Gets the current authenticated user profile
   * @returns {Promise<UserProfile | null>} Current user profile or null
   * @example
   * const user = await authService.getCurrentUser();
   */
  public async getCurrentUser(): Promise<UserProfile | null> {
    if (this.currentUser) {
      return this.currentUser;
    }

    try {
      const user = await apiClient.get<UserProfile>('/auth/me');
      this.currentUser = user;
      localStorage.setItem('user_profile', JSON.stringify(user));
      return user;
    } catch (error) {
      console.error('Failed to fetch current user:', error);
      return null;
    }
  }

  /**
   * Checks if user is authenticated
   * @returns {boolean} True if user is authenticated
   * @example
   * if (authService.isAuthenticated()) {
   *   // User is logged in
   * }
   */
  public isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token') && !!this.currentUser;
  }

  /**
   * Gets the cached user profile without API call
   * @returns {UserProfile | null} Cached user profile or null
   * @example
   * const cachedUser = authService.getCachedUser();
   */
  public getCachedUser(): UserProfile | null {
    if (this.currentUser) {
      return this.currentUser;
    }

    const storedUser = localStorage.getItem('user_profile');
    if (storedUser) {
      try {
        this.currentUser = JSON.parse(storedUser);
        return this.currentUser;
      } catch (error) {
        console.error('Failed to parse stored user profile:', error);
      }
    }

    return null;
  }

  /**
   * Checks if user has a specific role
   * @param {string} role - Role to check for
   * @returns {boolean} True if user has the specified role
   * @example
   * if (authService.hasRole('admin')) {
   *   // Show admin features
   * }
   */
  public hasRole(role: string): boolean {
    return this.currentUser?.roles.includes(role) || false;
  }

  /**
   * Updates user password
   * @param {string} currentPassword - Current password for verification
   * @param {string} newPassword - New password to set
   * @returns {Promise<void>}
   * @throws {Error} When password update fails
   * @example
   * await authService.changePassword('oldpass123', 'newpass456');
   */
  public async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  }

  /**
   * Requests password reset email
   * @param {string} email - Email address to send reset link
   * @returns {Promise<void>}
   * @example
   * await authService.requestPasswordReset('user@example.com');
   */
  public async requestPasswordReset(email: string): Promise<void> {
    await apiClient.post('/auth/forgot-password', { email });
  }

  /**
   * Resets password using reset token
   * @param {string} token - Password reset token from email
   * @param {string} newPassword - New password to set
   * @returns {Promise<void>}
   * @example
   * await authService.resetPassword('reset-token-123', 'newpassword456');
   */
  public async resetPassword(token: string, newPassword: string): Promise<void> {
    await apiClient.post('/auth/reset-password', {
      token,
      new_password: newPassword,
    });
  }

  /**
   * Sets up automatic token refresh before expiration
   * @private
   * @param {number} expiresIn - Token expiration time in seconds
   */
  private setupTokenRefresh(expiresIn: number = 1800): void {
    // Clear existing timeout
    if (this.tokenRefreshTimeout) {
      clearTimeout(this.tokenRefreshTimeout);
    }

    // Set new timeout (refresh 1 minute before expiration)
    const refreshTime = (expiresIn - 60) * 1000;
    this.tokenRefreshTimeout = setTimeout(() => {
      this.refreshToken();
    }, refreshTime);
  }

  /**
   * Refreshes the authentication token
   * @private
   * @returns {Promise<void>}
   */
  private async refreshToken(): Promise<void> {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await apiClient.post<AuthResponse>('/auth/refresh', {
        refresh_token: refreshToken,
      });

      apiClient.setTokens({
        access: response.access_token,
        refresh: response.refresh_token,
      });

      this.setupTokenRefresh(response.expires_in);
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.logout();
    }
  }

  /**
   * Clears the current session data
   * @private
   */
  private clearSession(): void {
    this.currentUser = null;
    apiClient.clearTokens();
    localStorage.removeItem('user_profile');

    if (this.tokenRefreshTimeout) {
      clearTimeout(this.tokenRefreshTimeout);
      this.tokenRefreshTimeout = null;
    }
  }
}

// Export singleton instance
export const authService = new AuthService();

// Export types
export type { LoginCredentials, RegisterData, UserProfile, AuthResponse };