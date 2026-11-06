import { useEffect, useRef, useState } from 'react';
import { request } from './api';

const editableSelector = 'input, textarea, select, [contenteditable="true"]';

function isEditable(target) {
  const element = target instanceof Element ? target : null;
  return Boolean(element?.closest(editableSelector));
}

/**
 * Best-effort exam lockdown for the browser. OS-level screen capture cannot be
 * blocked from a web page, so this hook blocks every in-page path (copy, paste,
 * print, save, display capture, devtools shortcuts), blanks the paper while the
 * window is unfocused, and records violations for the teacher's report.
 */
export function useExamLockdown({ token, submissionId, active = true, onViolation }) {
  const [shielded, setShielded] = useState(false);
  const shieldTimer = useRef(0);
  const violationRef = useRef(onViolation);
  violationRef.current = onViolation;

  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    let disposed = false;
    const lastRecorded = { copy: 0, screenshot: 0 };

    document.body.classList.add('exam-lockdown');

    function record(type) {
      const now = Date.now();
      if (now - lastRecorded[type] < 1200) return;
      lastRecorded[type] = now;
      request(`/api/submissions/${submissionId}/events`, {
        token,
        method: 'POST',
        body: JSON.stringify({ type }),
      }).catch(() => { /* best-effort telemetry */ });
    }

    function notify() {
      if (!disposed) violationRef.current?.();
    }

    function hideContent(duration = 1800) {
      if (disposed) return;
      setShielded(true);
      window.clearTimeout(shieldTimer.current);
      shieldTimer.current = window.setTimeout(() => setShielded(false), duration);
    }

    function flagScreenshot() {
      record('screenshot');
      notify();
      hideContent();
    }

    function flagCopy() {
      record('copy');
      notify();
    }

    function onCopy(event) {
      // Copy is blocked even inside answer fields: the whole paper is protected.
      event.preventDefault();
      flagCopy();
    }

    function onCut(event) {
      event.preventDefault();
      flagCopy();
    }

    function onPaste(event) {
      event.preventDefault();
      flagCopy();
    }

    function onContextMenu(event) {
      event.preventDefault();
    }

    function onDragStart(event) {
      event.preventDefault();
    }

    function onBeforePrint() {
      flagScreenshot();
    }

    function onKeyDown(event) {
      const key = event.key;
      const lower = typeof key === 'string' ? key.toLowerCase() : '';
      const mod = event.ctrlKey || event.metaKey;
      const editable = isEditable(event.target);

      if (key === 'PrintScreen' || key === 'Snapshot' || key === 'PrtScn') {
        event.preventDefault();
        flagScreenshot();
        return;
      }

      if (key === 'F12' || (mod && event.shiftKey && ['i', 'j', 'c', 'k'].includes(lower))) {
        event.preventDefault();
        notify();
        return;
      }

      if (mod && (lower === 'p' || lower === 's')) {
        event.preventDefault();
        flagScreenshot();
        return;
      }

      if (mod && lower === 'u') {
        event.preventDefault();
        notify();
        return;
      }

      if ((mod && (lower === 'c' || lower === 'x' || lower === 'v')) || ((event.ctrlKey || event.shiftKey) && key === 'Insert')) {
        event.preventDefault();
        flagCopy();
        return;
      }

      if (mod && lower === 'a' && !editable) {
        event.preventDefault();
      }
    }

    function onSelectStart(event) {
      if (!isEditable(event.target)) event.preventDefault();
    }

    function onBlur() {
      // Screenshot and recording tools steal focus before capturing. Blank the
      // paper so the captured frame contains no question content.
      if (document.visibilityState === 'visible' && !disposed) setShielded(true);
    }

    function onFocus() {
      window.clearTimeout(shieldTimer.current);
      if (!disposed) setShielded(false);
    }

    let originalGetDisplayMedia;
    const mediaDevices = navigator.mediaDevices;
    if (mediaDevices && typeof mediaDevices.getDisplayMedia === 'function') {
      originalGetDisplayMedia = mediaDevices.getDisplayMedia;
      try {
        mediaDevices.getDisplayMedia = () => Promise.reject(
          new DOMException('Screen capture is blocked during the exam.', 'NotAllowedError'),
        );
      } catch { /* read-only in some browsers */ }
    }

    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('selectstart', onSelectStart);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    return () => {
      disposed = true;
      window.clearTimeout(shieldTimer.current);
      document.body.classList.remove('exam-lockdown');
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('dragstart', onDragStart);
      document.removeEventListener('selectstart', onSelectStart);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      if (mediaDevices && originalGetDisplayMedia) {
        try { mediaDevices.getDisplayMedia = originalGetDisplayMedia; } catch { /* ignore */ }
      }
    };
  }, [active, token, submissionId]);

  return { shielded };
}
