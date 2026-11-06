export const REFRESH_STORAGE_KEY = 'emtehani-refresh-token';
export const SESSION_STORAGE_KEY = 'emtehani-session';

/**
 * The session expiry is fixed server-side. We keep the server clock offset alongside it
 * so every authenticated screen can render the same 24-hour countdown without trusting
 * the device clock.
 */
export function storeSession(expiresAtUtc, serverUtc) {
  if (!expiresAtUtc) return;
  try {
    const serverMs = serverUtc ? new Date(serverUtc).getTime() : Date.now();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      expiresAtUtc: new Date(expiresAtUtc).toISOString(),
      offsetMs: Number.isFinite(serverMs) ? serverMs - Date.now() : 0,
    }));
  } catch { /* storage can be unavailable */ }
}

export function getSessionState(nowMs = Date.now()) {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const expiresAtMs = new Date(parsed.expiresAtUtc).getTime();
    if (!Number.isFinite(expiresAtMs)) return null;
    const offsetMs = Number(parsed.offsetMs) || 0;
    return { expiresAtMs, offsetMs, remainingMs: expiresAtMs - (nowMs + offsetMs) };
  } catch {
    return null;
  }
}

export function formatSessionRemaining(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function authUserFromResponse(data) {
  return {
    userId: data.userId || data.id || '',
    fullName: data.fullName,
    email: data.email,
    role: data.role,
    studentCode: data.studentCode || '',
    stage: data.stage || '',
    grade: data.grade || '',
    sessionExpiresAtUtc: data.sessionExpiresAtUtc || null,
    subscriptionStatus: data.subscriptionStatus || null,
    subscriptionPlan: data.subscriptionPlan || null,
  };
}
