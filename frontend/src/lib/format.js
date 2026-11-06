export const CAIRO_TIME_ZONE = 'Africa/Cairo';

const dateFormatter = new Intl.DateTimeFormat('ar-EG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  calendar: 'gregory',
  numberingSystem: 'latn',
  timeZone: CAIRO_TIME_ZONE,
});

const shortDateFormatter = new Intl.DateTimeFormat('ar-EG', {
  day: '2-digit',
  month: 'short',
  calendar: 'gregory',
  numberingSystem: 'latn',
  timeZone: CAIRO_TIME_ZONE,
});

const cairoPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CAIRO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function cairoParts(date) {
  return Object.fromEntries(
    cairoPartsFormatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

function cairoOffsetMs(date) {
  const parts = cairoParts(date);
  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((wallClockAsUtc - date.getTime()) / 60000) * 60000;
}

/**
 * Converts a `datetime-local` value (wall clock in Africa/Cairo) to a UTC ISO string.
 * This deliberately ignores the browser timezone so a teacher in Egypt always sees and
 * saves 09:00 Cairo even while travelling or when the device clock uses another zone.
 */
export function cairoInputToUtcIso(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const [, year, month, day, hour, minute] = match.map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAtGuess = cairoOffsetMs(new Date(wallClockAsUtc));
  let timestamp = wallClockAsUtc - offsetAtGuess;
  const offsetAtResult = cairoOffsetMs(new Date(timestamp));
  if (offsetAtResult !== offsetAtGuess) timestamp = wallClockAsUtc - offsetAtResult;
  return new Date(timestamp).toISOString();
}

export function toCairoInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = cairoParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatCairoDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = cairoParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

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
