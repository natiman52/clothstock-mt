import { getToken, clearAuth } from '../utils/token';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

/**
 * Custom Error class for API response errors with status and field-level error details.
 */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Base fetch client with authentication header injection and JSON error parsing.
 */
export async function apiClient(endpoint, options = {}) {
  const { body, headers = {}, ...customConfig } = options;

  const token = getToken();

  const defaultHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (token) {
    defaultHeaders['Authorization'] = `Token ${token}`;
  }

  // Automatically attach active store scope to every API request via X-Store-ID header
  try {
    const activeStore = localStorage.getItem('clothstock_active_store');
    if (activeStore && activeStore !== 'all') {
      defaultHeaders['X-Store-ID'] = activeStore;
    }
  } catch {
    // ignore localStorage unavailability
  }

  const config = {
    method: body ? 'POST' : 'GET',
    headers: {
      ...defaultHeaders,
      ...headers,
    },
    ...customConfig,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  let response;
  try {
    response = await fetch(url, config);
  } catch (networkError) {
    throw new ApiError(
      'Network error. Please check your connection or server status.',
      0,
      { detail: networkError.message }
    );
  }

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    // If token is invalid or expired (401), clear local storage
    if (response.status === 401 && token) {
      clearAuth();
    }

    // Extract best human-readable error message
    let errorMessage = `Request failed with status ${response.status}`;
    if (data && typeof data === 'object') {
      if (data.detail) {
        errorMessage = data.detail;
      } else if (data.non_field_errors) {
        errorMessage = Array.isArray(data.non_field_errors)
          ? data.non_field_errors.join(' ')
          : data.non_field_errors;
      } else {
        const firstKey = Object.keys(data)[0];
        if (firstKey) {
          const val = data[firstKey];
          errorMessage = `${firstKey}: ${Array.isArray(val) ? val.join(' ') : val}`;
        }
      }
    }

    throw new ApiError(errorMessage, response.status, data);
  }

  return data;
}

apiClient.get = (endpoint, options) => apiClient(endpoint, { ...options, method: 'GET' });
apiClient.post = (endpoint, body, options) => apiClient(endpoint, { ...options, method: 'POST', body });
apiClient.put = (endpoint, body, options) => apiClient(endpoint, { ...options, method: 'PUT', body });
apiClient.patch = (endpoint, body, options) => apiClient(endpoint, { ...options, method: 'PATCH', body });
apiClient.delete = (endpoint, options) => apiClient(endpoint, { ...options, method: 'DELETE' });

export default apiClient;
