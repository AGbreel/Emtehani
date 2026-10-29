export const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');

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

function networkErrorMessage() {
  return 'تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.';
}

export async function request(path, { token, timeoutMs = 25000, retryCount = DEFAULT_RETRY_COUNT, ...opts } = {}) {
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
      if (res.status === 401 && token) notifySessionExpired();
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

export function getStoredAuth() {
  try {
    const token = localStorage.getItem('emtehani-token') || '';
    const user = JSON.parse(localStorage.getItem('emtehani-user') || 'null');
    return { token, user };
  } catch {
    return { token: '', user: null };
  }
}

export function storeAuth(token, user) {
  localStorage.setItem('emtehani-token', token);
  localStorage.setItem('emtehani-user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('emtehani-token');
  localStorage.removeItem('emtehani-user');
}
