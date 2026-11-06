import { authUserFromResponse, REFRESH_STORAGE_KEY, SESSION_STORAGE_KEY, storeSession } from './session';

export const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
export { authUserFromResponse, formatSessionRemaining, getSessionState, storeSession, SESSION_STORAGE_KEY } from './session';

export function assetUrl(value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/uploads/')) return `${API}${value}`;
  return value;
}

const errorMessages = {
  400: 'البيانات المدخلة غير صحيحة. راجع الحقول وحاول مرة أخرى.',
  401: 'انتهت صلاحية الجلسة أو بيانات الدخول غير صحيحة. سجّل الدخول مرة أخرى.',
  403: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
  404: 'لم نعثر على العنصر المطلوب أو لم يعد متاحاً.',
  409: 'لا يمكن تنفيذ الإجراء في الحالة الحالية. حدّث الصفحة ثم حاول مرة أخرى.',
  429: 'طلبات كثيرة خلال وقت قصير. انتظر قليلاً ثم حاول مجدداً.',
  500: 'حدث خطأ داخلي. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع الدعم.',
};

const DEFAULT_RETRY_COUNT = 2;
const BASE_RETRY_DELAY_MS = 500;
let refreshInFlight = null;

function isSafeToRetry(method, status) {
  // Only retry GET requests or idempotent operations on transient errors.
  const safeMethods = ['GET', 'HEAD'];
  const transientStatuses = [408, 429, 500, 502, 503, 504];
  return safeMethods.includes(method.toUpperCase()) && transientStatuses.includes(status);
}

function jitter(delay) {
  return Math.max(10, delay * (0.5 + Math.random()));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notifySessionExpired() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('emtehani:session-expired'));
  }
}

function getRefreshToken() {
  try { return localStorage.getItem(REFRESH_STORAGE_KEY) || ''; } catch { return ''; }
}

function isRefreshablePath(path) {
  return !['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout']
    .some((prefix) => path.startsWith(prefix));
}

export async function refreshAccessToken() {
  if (typeof window === 'undefined') return '';
  const refreshToken = getRefreshToken();
  if (!refreshToken) return '';
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return '';
      const data = await res.json();
      if (!data?.token) return '';
      const user = authUserFromResponse(data);
      storeAuth(data.token, user, data.refreshToken || refreshToken);
      storeSession(data.sessionExpiresAtUtc, data.serverUtc);
      return data.token;
    } catch {
      return '';
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function networkErrorMessage() {
  return 'تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.';
}

async function requestOnce(path, { token, timeoutMs = 25000, retryCount = DEFAULT_RETRY_COUNT, skipSessionExpiry = false, ...opts } = {}) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const method = (opts.method || 'GET').toUpperCase();
  const callerSignal = opts.signal;
  let lastError;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    // A fresh controller per attempt keeps timeouts and cancellation scoped to that request.
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', abortFromCaller, { once: true });
    }
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    };

    let res;
    try {
      res = await fetch(API + path, { ...opts, headers, signal: controller.signal });
    } catch (err) {
      cleanup();
      if (callerSignal?.aborted) throw new Error('تم إلغاء الطلب.');
      if (timedOut) throw new Error('انتهت مهلة الاتصال بالخادم. تحقق من الإنترنت ثم حاول مرة أخرى.');
      if (attempt < retryCount && isSafeToRetry(method, 0)) {
        await sleep(jitter(BASE_RETRY_DELAY_MS * Math.pow(2, attempt)));
        lastError = err;
        continue;
      }
      lastError = err;
      throw new Error(networkErrorMessage());
    }
    cleanup();

    if (!res.ok) {
      if (res.status === 401 && token && !skipSessionExpiry) notifySessionExpired();
      // Retry only safe methods on transient errors.
      if (attempt < retryCount && isSafeToRetry(method, res.status)) {
        await sleep(jitter(BASE_RETRY_DELAY_MS * Math.pow(2, attempt)));
        continue;
      }
      let message = errorMessages[res.status] || 'تعذر إكمال العملية. حاول مرة أخرى.';
      let code;
      try {
        const payload = await res.json();
        if (typeof payload.code === 'string') code = payload.code;
        if (typeof payload.message === 'string' && payload.message.trim()) message = payload.message;
        else if (typeof payload.title === 'string' && payload.title.trim()) message = payload.title;
      } catch {
        // Keep the status-based message.
      }
      const error = new Error(message);
      error.status = res.status;
      error.code = code;
      throw error;
    }

    if (res.headers.get('content-type')?.includes('text/csv')) return res.blob();
    if (res.status === 204) return null;
    return res.json();
  }

  throw lastError instanceof Error ? lastError : new Error(networkErrorMessage());
}

export async function request(path, options = {}) {
  const stored = getStoredAuth();
  // A refreshed token can be newer than the one held in React state. Prefer it so a
  // component does not keep retrying with the expired token after a refresh.
  const effectiveToken = options.token && stored.token && options.token !== stored.token
    ? stored.token
    : (options.token || '');
  const refreshable = Boolean(effectiveToken) && isRefreshablePath(path);
  try {
    return await requestOnce(path, { ...options, token: effectiveToken, skipSessionExpiry: refreshable });
  } catch (err) {
    if (err?.status === 401 && refreshable) {
      const nextToken = await refreshAccessToken();
      if (nextToken) {
        try {
          return await requestOnce(path, { ...options, token: nextToken, skipSessionExpiry: true });
        } catch (retryError) {
          if (retryError?.status === 401) notifySessionExpired();
          throw retryError;
        }
      }
      notifySessionExpired();
    }
    throw err;
  }
}

export function getStoredAuth() {
  try {
    const token = localStorage.getItem('emtehani-token') || '';
    const user = JSON.parse(localStorage.getItem('emtehani-user') || 'null');
    return { token, user };
  } catch {
    return { token: '', user: null };
  }
}

export function storeAuth(token, user, refreshToken) {
  localStorage.setItem('emtehani-token', token);
  localStorage.setItem('emtehani-user', JSON.stringify(user));
  if (refreshToken) localStorage.setItem(REFRESH_STORAGE_KEY, refreshToken);
}

export function clearAuth() {
  localStorage.removeItem('emtehani-token');
  localStorage.removeItem('emtehani-user');
  localStorage.removeItem(REFRESH_STORAGE_KEY);
  localStorage.removeItem(SESSION_STORAGE_KEY);
}
