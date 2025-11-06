/**
 * Enhanced API Client with Security and Error Handling
 *
 * This module provides a robust API client for communicating with CGI backend scripts
 * with built-in:
 * - Authentication token management
 * - Request timeout handling
 * - Retry logic with exponential backoff
 * - Type-safe responses
 * - Comprehensive error handling
 * - Request deduplication
 * - Rate limiting
 */

export interface APIClientConfig {
  timeout?: number; // Request timeout in milliseconds
  retries?: number; // Number of retry attempts
  retryDelay?: number; // Initial retry delay in milliseconds
  requiresAuth?: boolean; // Whether request requires authentication
  dedupeKey?: string; // Key for request deduplication
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

export interface APIResponse<T = unknown> {
  data?: T;
  error?: string;
  status: 'success' | 'error';
  timestamp?: string;
}

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class AuthenticationError extends APIError {
  constructor(message = 'Authentication required') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends APIError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

// In-flight request tracking for deduplication
const inflightRequests = new Map<string, Promise<Response>>();

// Rate limiting tracking
const rateLimitTracking = new Map<string, number[]>();

/**
 * Check rate limit for a given key
 */
function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const requests = rateLimitTracking.get(key) || [];

  // Remove old requests outside the window
  const recentRequests = requests.filter((timestamp) => now - timestamp < windowMs);

  if (recentRequests.length >= maxRequests) {
    return false;
  }

  // Add current request
  recentRequests.push(now);
  rateLimitTracking.set(key, recentRequests);

  return true;
}

/**
 * Get authentication token from localStorage
 */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('authToken');
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number, baseDelay: number): number {
  return baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
}

/**
 * Enhanced fetch with retry logic and timeout
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: APIClientConfig
): Promise<Response> {
  const { retries = 2, retryDelay = 1000, timeout = 30000 } = config;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Don't retry on 4xx errors (client errors)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry on 5xx errors (server errors)
      if (response.status >= 500 && attempt < retries) {
        const delay = getBackoffDelay(attempt, retryDelay);
        console.warn(
          `Request failed with status ${response.status}, retrying in ${delay}ms... (attempt ${attempt + 1}/${retries})`
        );
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on abort errors (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new APIError('Request timeout', 408, error);
      }

      // Retry on network errors
      if (attempt < retries) {
        const delay = getBackoffDelay(attempt, retryDelay);
        console.warn(
          `Request failed: ${lastError.message}, retrying in ${delay}ms... (attempt ${attempt + 1}/${retries})`
        );
        await sleep(delay);
        continue;
      }
    }
  }

  throw new APIError(
    `Request failed after ${retries + 1} attempts: ${lastError?.message}`,
    0,
    lastError
  );
}

/**
 * Main API client function
 */
export async function apiClient<T = unknown>(
  url: string,
  options: RequestInit = {},
  config: APIClientConfig = {}
): Promise<APIResponse<T>> {
  const {
    requiresAuth = true,
    dedupeKey,
    rateLimit,
  } = config;

  try {
    // Check authentication
    if (requiresAuth) {
      const token = getAuthToken();
      if (!token) {
        throw new AuthenticationError('No authentication token found');
      }

      // Add auth token to headers
      options.headers = {
        ...options.headers,
        Authorization: token,
      };
    }

    // Check rate limit
    if (rateLimit) {
      const rateLimitKey = `${url}:${rateLimit.maxRequests}:${rateLimit.windowMs}`;
      if (!checkRateLimit(rateLimitKey, rateLimit.maxRequests, rateLimit.windowMs)) {
        throw new RateLimitError(`Rate limit exceeded for ${url}`);
      }
    }

    // Request deduplication
    let responsePromise: Promise<Response>;

    if (dedupeKey && inflightRequests.has(dedupeKey)) {
      console.log(`Deduplicating request: ${dedupeKey}`);
      responsePromise = inflightRequests.get(dedupeKey)!;
    } else {
      responsePromise = fetchWithRetry(url, options, config);

      if (dedupeKey) {
        inflightRequests.set(dedupeKey, responsePromise);

        // Clean up after request completes
        responsePromise.finally(() => {
          inflightRequests.delete(dedupeKey);
        });
      }
    }

    const response = await responsePromise;

    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      // Clear invalid token
      if (typeof window !== 'undefined') {
        localStorage.removeItem('authToken');
      }
      throw new AuthenticationError('Authentication failed');
    }

    // Parse JSON response
    const contentType = response.headers.get('content-type');
    let data: unknown;

    if (contentType?.includes('application/json')) {
      try {
        data = await response.json();
      } catch (error) {
        throw new APIError('Failed to parse JSON response', response.status, error);
      }
    } else {
      const text = await response.text();
      data = { response: text };
    }

    // Check for error status in response data
    if (typeof data === 'object' && data !== null) {
      const dataObj = data as Record<string, unknown>;

      if (dataObj.status === 'error' || dataObj.state === 'failed') {
        return {
          status: 'error',
          error: (dataObj.error || dataObj.message || 'Unknown error') as string,
          timestamp: new Date().toISOString(),
        };
      }
    }

    // Success response
    return {
      status: 'success',
      data: data as T,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    // Handle known errors
    if (error instanceof APIError) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }

    // Handle unknown errors
    console.error('API Client Error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'An unknown error occurred',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Specialized clients for common operations
 */

export const cgiClient = {
  /**
   * Execute AT command
   */
  async executeATCommand(
    command: string,
    timeout = 30
  ): Promise<APIResponse<{ response: string; command: string; status: string }>> {
    return apiClient(
      `/cgi-bin/quecmanager/at_cmd/at_queue_client.sh?command=${encodeURIComponent(command)}&timeout=${timeout}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
      {
        timeout: (timeout + 5) * 1000,
        retries: 1,
        requiresAuth: true,
        dedupeKey: `at-command:${command}`,
      }
    );
  },

  /**
   * Fetch data set
   */
  async fetchDataSet<T = unknown>(setNumber: number): Promise<APIResponse<T>> {
    return apiClient(
      `/cgi-bin/quecmanager/at_cmd/fetch_data.sh?set=${setNumber}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
      {
        timeout: 30000,
        retries: 2,
        requiresAuth: true,
        dedupeKey: `fetch-data:${setNumber}`,
        rateLimit: {
          maxRequests: 10,
          windowMs: 5000, // 10 requests per 5 seconds
        },
      }
    );
  },

  /**
   * Authenticate user
   */
  async authenticate(password: string): Promise<APIResponse<{ token: string; state: string }>> {
    return apiClient(
      '/cgi-bin/quecmanager/auth.sh',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `password=${encodeURIComponent(password)}`,
      },
      {
        timeout: 10000,
        retries: 0,
        requiresAuth: false,
        rateLimit: {
          maxRequests: 5,
          windowMs: 60000, // 5 attempts per minute
        },
      }
    );
  },

  /**
   * Logout user
   */
  async logout(): Promise<APIResponse<{ state: string; message: string }>> {
    const token = getAuthToken();
    if (!token) {
      return {
        status: 'error',
        error: 'No authentication token found',
      };
    }

    return apiClient(
      '/cgi-bin/quecmanager/auth-token.sh?action=removeToken',
      {
        method: 'GET',
        headers: {
          Authorization: token,
        },
      },
      {
        timeout: 5000,
        retries: 1,
        requiresAuth: false,
      }
    );
  },
};

/**
 * Export for backward compatibility with existing code
 */
export default apiClient;
