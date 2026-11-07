import { useCallback, useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { API, request } from './api';

function newEventId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Advanced exam proctoring for the student side.
 *
 * - Opens the proctoring session against the submission (server-authoritative).
 * - Reports monitored events (tab switch, page exit, fullscreen, clipboard,
 *   screenshot keys) with client event IDs so retries never double-count.
 * - Listens on SignalR for teacher decisions: warnings, pause for review,
 *   resume, force-submit and terminate.
 * - When the exam requires a camera, captures periodic snapshots after the
 *   student explicitly consented, and records denial/disconnection honestly.
 *
 * Browser honesty: a web page cannot detect OS-level screenshots, external
 * cameras, or screen recording. Only detectable events are recorded.
 */
export function useProctoring({ token, submissionId, examId, cameraConsent = false, active = true, onResumed, onEndedByTeacher }) {
  const [enabled, setEnabled] = useState(false);
  const [settings, setSettings] = useState(null);
  const [ready, setReady] = useState(false);
  const [pausedForReview, setPausedForReview] = useState(false);
  const [warning, setWarning] = useState(null);
  const [ended, setEnded] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [proctoringStatus, setProctoringStatus] = useState('InProgress');
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));

  const connectionRef = useRef(null);
  const streamRef = useRef(null);
  const snapshotTimerRef = useRef(0);
  const warningTimerRef = useRef(0);
  const startedRef = useRef(false);
  const settingsRef = useRef(null);
  const lastSentRef = useRef({});
  const onResumedRef = useRef(onResumed);
  const onEndedRef = useRef(onEndedByTeacher);
  onResumedRef.current = onResumed;
  onEndedRef.current = onEndedByTeacher;

  const showWarning = useCallback((message) => {
    window.clearTimeout(warningTimerRef.current);
    setWarning({ message, at: Date.now() });
    warningTimerRef.current = window.setTimeout(() => setWarning(null), 6000);
  }, []);

  const sendEvent = useCallback((type, extra = {}) => {
    const settingsNow = settingsRef.current;
    if (!settingsNow) return Promise.resolve();
    const monitored =
      (type === 'tab-switch' && settingsNow.monitorTabSwitch) ||
      (type === 'page-exit' && settingsNow.monitorPageExit) ||
      (type === 'fullscreen-exit' || type === 'fullscreen-enter') ||
      (type === 'copy' && settingsNow.monitorCopy) ||
      (type === 'paste' && settingsNow.monitorPaste) ||
      (type === 'cut' && settingsNow.monitorCut) ||
      type === 'screenshot-attempt' ||
      type.startsWith('camera-') ||
      type === 'face-missing' ||
      type === 'multiple-faces';
    if (!monitored) return Promise.resolve();
    const now = Date.now();
    if (now - (lastSentRef.current[type] || 0) < 1000) return Promise.resolve();
    lastSentRef.current[type] = now;
    const body = JSON.stringify({ type, clientEventId: newEventId(), occurredAtUtc: new Date().toISOString(), ...extra });
    // Page exits must survive navigation; keepalive lets the request outlive the page.
    const isPageExit = type === 'page-exit';
    if (isPageExit && typeof navigator !== 'undefined' && typeof window !== 'undefined') {
      fetch(`${API}/api/submissions/${submissionId}/proctoring/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body,
        keepalive: true,
      }).catch(() => { /* best-effort */ });
      return Promise.resolve();
    }
    return request(`/api/submissions/${submissionId}/proctoring/events`, {
      token,
      method: 'POST',
      body,
    }).then((result) => {
      if (result?.warning) showWarning(result.warning);
      if (result?.paused) setPausedForReview(true);
      if (result?.proctoringStatus) setProctoringStatus(result.proctoringStatus);
      if (result?.forceSubmitted) setEnded({ type: 'forceSubmit', message: 'تم تسليم محاولتك تلقائياً وفق سياسة الامتحان.' });
    }).catch(() => { /* telemetry must never break the exam */ });
  }, [token, submissionId, showWarning]);

  const stopCamera = useCallback(() => {
    window.clearInterval(snapshotTimerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async (intervalSeconds) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraFailed(true);
      sendEvent('camera-denied', { description: 'المتصفح لا يدعم الوصول للكاميرا.' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360, facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      setCameraActive(true);
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play().catch(() => { /* some browsers need a gesture first */ });
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 360;
      const context = canvas.getContext('2d');
      const track = stream.getVideoTracks()[0];
      track.addEventListener('ended', () => {
        setCameraActive(false);
        sendEvent('camera-disconnected');
      });
      const capture = () => {
        if (!streamRef.current || !context) return;
        try {
          context.drawImage(video, 0, 0, 480, 360);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          request(`/api/submissions/${submissionId}/proctoring/snapshots`, {
            token,
            method: 'POST',
            body: JSON.stringify({ imageDataBase64: dataUrl, clientEventId: newEventId(), capturedAtUtc: new Date().toISOString() }),
          }).catch(() => { /* snapshots are best-effort */ });
        } catch { /* frame not ready yet */ }
      };
      capture();
      snapshotTimerRef.current = window.setInterval(capture, Math.max(10, intervalSeconds || 60) * 1000);
    } catch {
      setCameraFailed(true);
      sendEvent('camera-denied');
    }
  }, [token, submissionId, sendEvent]);

  const start = useCallback(async () => {
    if (startedRef.current || !active) return;
    startedRef.current = true;
    try {
      const result = await request(`/api/submissions/${submissionId}/proctoring/start`, {
        token,
        method: 'POST',
        body: JSON.stringify({ cameraConsent }),
      });
      const s = result.settings;
      const normalized = {
        monitorTabSwitch: s.monitorTabSwitch,
        monitorPageExit: s.monitorPageExit,
        requireFullscreen: s.requireFullscreen,
        monitorCopy: s.monitorCopy,
        preventCopy: s.preventCopy,
        monitorPaste: s.monitorPaste,
        preventPaste: s.preventPaste,
        monitorCut: s.monitorCut,
        enableCamera: s.enableCamera,
        snapshotIntervalSeconds: s.snapshotIntervalSeconds,
        maxAllowedExits: s.maxAllowedExits,
        exitAction: s.exitAction,
        fullscreenExitAction: s.fullscreenExitAction,
        warnOnFirstExit: s.warnOnFirstExit,
        warnOnRepeatedExit: s.warnOnRepeatedExit,
      };
      settingsRef.current = normalized;
      setSettings(normalized);
      setEnabled(true);
      if (result.proctoringStatus === 'PausedForTeacherReview') setPausedForReview(true);

      const connection = new signalR.HubConnectionBuilder()
        .withUrl(`${API}/hubs/proctoring?attemptId=${submissionId}&access_token=${encodeURIComponent(token)}`, { withCredentials: false })
        .withAutomaticReconnect()
        .build();
      connection.on('warning', (payload) => showWarning(payload?.message || 'تنبيه من المدرس.'));
      connection.on('paused', (payload) => {
        setPausedForReview(true);
        setProctoringStatus('PausedForTeacherReview');
        showWarning(payload?.reason || 'المحاولة متوقفة بانتظار قرار المدرس.');
      });
      connection.on('resumed', () => {
        setPausedForReview(false);
        setProctoringStatus('InProgress');
        onResumedRef.current?.();
      });
      connection.on('forceSubmit', (payload) => setEnded({ type: 'forceSubmit', message: payload?.message || 'تم تسليم محاولتك.' }));
      connection.on('terminated', (payload) => setEnded({ type: 'terminated', message: payload?.message || 'تم إنهاء محاولتك من قبل المدرس.' }));
      await connection.start().catch(() => { /* polling still covers decisions */ });
      connectionRef.current = connection;

      if (normalized.enableCamera && cameraConsent) await startCamera(normalized.snapshotIntervalSeconds);
    } catch {
      // Proctoring disabled for this exam, or a transient failure: the exam stays
      // fully usable and the server still enforces its own rules on every request.
      setEnabled(false);
    } finally {
      setReady(true);
    }
  }, [active, token, submissionId, cameraConsent, showWarning, startCamera]);

  // Fullscreen policy: entering fullscreen when required, reporting exits.
  const enterFullscreen = useCallback(() => {
    const root = document.documentElement;
    if (root.requestFullscreen) root.requestFullscreen().catch(() => { /* user gesture required */ });
  }, []);

  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    let disposed = false;
    start();

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') sendEvent('tab-switch');
    };
    const onPageHide = () => sendEvent('page-exit');
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      if (!settingsRef.current?.requireFullscreen) return;
      if (document.fullscreenElement) sendEvent('fullscreen-enter');
      else sendEvent('fullscreen-exit');
    };
    const onCopy = () => sendEvent('copy');
    const onCut = () => sendEvent('cut');
    const onPaste = () => sendEvent('paste');
    const onKeyDown = (event) => {
      const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
      const mod = event.ctrlKey || event.metaKey;
      if (key === 'printscreen') sendEvent('screenshot-attempt', { metadata: JSON.stringify({ key: 'PrintScreen' }) });
      else if (mod && ['c', 'x', 'v'].includes(key)) {
        // The lockdown hook already prevents the action; here we record which
        // shortcut was attempted so the teacher sees the exact key combination.
        sendEvent(key === 'v' ? 'paste' : key === 'x' ? 'cut' : 'copy', {
          metadata: JSON.stringify({ shortcut: (event.ctrlKey ? 'Ctrl+' : 'Meta+') + key.toUpperCase() }),
        });
      } else if (mod && ['p', 's'].includes(key)) {
        sendEvent('screenshot-attempt', { metadata: JSON.stringify({ shortcut: (event.ctrlKey ? 'Ctrl+' : 'Meta+') + key.toUpperCase() }) });
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKeyDown);
      stopCamera();
      if (connectionRef.current) connectionRef.current.stop().catch(() => { /* ignore */ });
    };
  }, [active, start, sendEvent, stopCamera]);

  useEffect(() => {
    if (ended) {
      stopCamera();
      onEndedRef.current?.(ended);
    }
  }, [ended, stopCamera]);

  return {
    enabled,
    ready,
    settings,
    pausedForReview,
    warning,
    ended,
    cameraActive,
    cameraFailed,
    proctoringStatus,
    isFullscreen,
    enterFullscreen,
    stopCamera,
  };
}
