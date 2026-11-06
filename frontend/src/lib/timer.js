/**
 * Exam countdown helpers.
 *
 * The remaining time is always derived from the server-provided deadline. The browser
 * clock only supplies elapsed monotonic-ish wall time between renders, and the offset is
 * re-synchronised from every server response. This prevents a duplicated interval or a
 * slow render from making the timer jump or drift.
 */

export function serverClockOffset(serverUtc, receivedAtMs = Date.now()) {
  if (!serverUtc) return 0;
  const serverMs = new Date(serverUtc).getTime();
  if (Number.isNaN(serverMs)) return 0;
  return serverMs - receivedAtMs;
}

export function serverNow(offsetMs, clientNowMs = Date.now()) {
  return clientNowMs + (Number(offsetMs) || 0);
}

export function remainingSecondsFromDeadline(deadlineUtc, offsetMs, clientNowMs = Date.now()) {
  if (!deadlineUtc) return null;
  const deadlineMs = new Date(deadlineUtc).getTime();
  if (Number.isNaN(deadlineMs)) return null;
  return Math.max(0, Math.ceil((deadlineMs - serverNow(offsetMs, clientNowMs)) / 1000));
}
