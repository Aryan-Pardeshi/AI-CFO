import { fetchAuthSession } from 'aws-amplify/auth';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || code || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function baseUrl() {
  const base = import.meta.env.VITE_API_BASE_URL || '';
  return base.replace(/\/$/, '');
}

function isMockOrQaSession() {
  if (!import.meta.env.DEV) return false;
  if (import.meta.env.VITE_USE_MOCKS === 'true') return true;
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('aicfo_local_qa_user')) {
      return true;
    }
  } catch {}
  return false;
}

async function accessToken() {
  if (isMockOrQaSession()) {
    const { mockIdToken } = await import('../mocks/auth-mock.js');
    return mockIdToken();
  }
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if (!token) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Not signed in');
  }
  return token;
}

export async function authenticatedRequest(path, { method = 'GET', body, signal } = {}) {
  const token = await accessToken();
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiError(
      res.status,
      err.code || (res.status === 404 ? 'NOT_FOUND' : 'INTERNAL'),
      err.message || `Request failed (${res.status})`,
      err.details,
    );
  }
  return data;
}

export function getMe() {
  return authenticatedRequest('/me', { method: 'GET' });
}

export function updateProfile(payload) {
  return authenticatedRequest('/me/profile', { method: 'PUT', body: payload });
}

export function listHoldings() {
  return authenticatedRequest('/holdings', { method: 'GET' });
}

export function createHolding(payload) {
  return authenticatedRequest('/holdings', { method: 'POST', body: payload });
}

export function updateHolding(id, payload) {
  return authenticatedRequest(`/holdings/${id}`, { method: 'PUT', body: payload });
}

export function deleteHolding(id) {
  return authenticatedRequest(`/holdings/${id}`, { method: 'DELETE' });
}

export function listLoans() {
  return authenticatedRequest('/loans', { method: 'GET' });
}

export function createLoan(payload) {
  return authenticatedRequest('/loans', { method: 'POST', body: payload });
}

export function updateLoan(id, payload) {
  return authenticatedRequest(`/loans/${id}`, { method: 'PUT', body: payload });
}

export function deleteLoan(id) {
  return authenticatedRequest(`/loans/${id}`, { method: 'DELETE' });
}

export function listGoals() {
  return authenticatedRequest('/goals', { method: 'GET' });
}

export function createGoal(payload) {
  return authenticatedRequest('/goals', { method: 'POST', body: payload });
}

export function updateGoal(id, payload) {
  return authenticatedRequest(`/goals/${id}`, { method: 'PUT', body: payload });
}

export function deleteGoal(id) {
  return authenticatedRequest(`/goals/${id}`, { method: 'DELETE' });
}

export function createStatementJob(payload) {
  return authenticatedRequest('/statements', { method: 'POST', body: payload ?? {} });
}
