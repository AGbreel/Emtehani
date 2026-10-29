const dateFormatter = new Intl.DateTimeFormat('ar-SA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  calendar: 'gregory',
  numberingSystem: 'latn',
});

const shortDateFormatter = new Intl.DateTimeFormat('ar-SA', {
  day: '2-digit',
  month: 'short',
  calendar: 'gregory',
  numberingSystem: 'latn',
});

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatShortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return shortDateFormatter.format(date);
}

export function formatNumber(value, fallback = '0') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return new Intl.NumberFormat('ar-SA', { numberingSystem: 'latn' }).format(Number(value));
}

export function formatTimer(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function formatDuration(minutes) {
  const safe = Math.max(0, Math.floor(Number(minutes) || 0));
  if (safe < 60) return `${formatNumber(safe)} دقيقة`;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest ? `${formatNumber(hours)} س ${formatNumber(rest)} د` : `${formatNumber(hours)} ساعة`;
}

export function scoreText(score, maxScore) {
  const hasScore = score !== null && score !== undefined;
  return `\u2066${hasScore ? formatNumber(score) : '—'} / ${formatNumber(maxScore)}\u2069`;
}

export function percent(score, maxScore) {
  if (!maxScore || score === null || score === undefined) return 0;
  return Math.round((Number(score) / Number(maxScore)) * 100);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'صباح الخير';
  if (hour < 17) return 'مساء الخير';
  return 'مساء النور';
}

export function isFuture(value) {
  if (!value) return false;
  return new Date(value).getTime() > Date.now();
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
}
