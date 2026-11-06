import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Bell,
  BellRing,
  CheckCheck,
  CreditCard,
  FileText,
  LoaderCircle,
  MessageCircle,
  Sparkles,
  UserRound,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { request } from '../lib/api';
import { playNotificationChime, primeNotificationSound, unlockNotificationSoundOnGesture } from '../lib/notificationSound';
import { cn } from './ui';

const SOUND_KEY = 'emtehani-notifications-sound';
const POLL_MS = 18000;
const relativeFormatter = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
const shortDateFormatter = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' });

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  if (absolute < 45) return 'الآن';
  if (absolute < 3600) return relativeFormatter.format(Math.round(seconds / 60), 'minute');
  if (absolute < 86400) return relativeFormatter.format(Math.round(seconds / 3600), 'hour');
  if (absolute < 604800) return relativeFormatter.format(Math.round(seconds / 86400), 'day');
  return shortDateFormatter.format(date);
}

const typeMeta = {
  Message: { icon: MessageCircle, iconClass: 'bg-primary-soft text-primary', ring: 'border-primary/20' },
  LinkRequest: { icon: UserRound, iconClass: 'bg-warning-soft text-warning', ring: 'border-warning/20' },
  LinkAccepted: { icon: CheckCheck, iconClass: 'bg-emerald-soft text-emerald', ring: 'border-emerald/20' },
  Exam: { icon: FileText, iconClass: 'bg-blue-soft text-blue', ring: 'border-blue/20' },
  Subscription: { icon: CreditCard, iconClass: 'bg-primary-soft text-primary', ring: 'border-primary/20' },
  Welcome: { icon: Sparkles, iconClass: 'bg-primary-soft text-primary', ring: 'border-primary/20' },
  System: { icon: BellRing, iconClass: 'bg-surface-soft text-muted', ring: 'border-line' },
};

function metaFor(type) {
  return typeMeta[type] || typeMeta.System;
}

export default function NotificationCenter({ token, onNavigate }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [flash, setFlash] = useState(false);
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
  });
  const panelRef = useRef(null);
  const newestRef = useRef(0);
  const initialisedRef = useRef(false);
  const soundRef = useRef(soundOn);
  const flashTimerRef = useRef(null);

  useEffect(() => { soundRef.current = soundOn; }, [soundOn]);

  useEffect(() => {
    if (soundOn) primeNotificationSound();
  }, [soundOn]);

  useEffect(() => unlockNotificationSoundOnGesture(), []);

  const load = useCallback(async ({ silent = true } = {}) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const data = await request('/api/notifications?take=30', { token });
      const list = Array.isArray(data?.items) ? data.items : [];
      setItems(list);
      setUnread(Number(data?.unread) || 0);
      const newest = list.length ? new Date(list[0].createdAtUtc).getTime() || 0 : 0;
      if (!initialisedRef.current) {
        initialisedRef.current = true;
        newestRef.current = newest;
      } else if (newest > newestRef.current) {
        newestRef.current = newest;
        if (soundRef.current) playNotificationChime();
        setFlash(true);
        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => setFlash(false), 1100);
        window.dispatchEvent(new Event('emtehani:chat-updated'));
      }
    } catch {
      // Notifications are non-critical; keep the last known state on transient errors.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(), POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const onUpdated = () => load();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('emtehani:chat-updated', onUpdated);
    return () => {
      window.clearInterval(timer);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('emtehani:chat-updated', onUpdated);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    load({ silent: false });
    const onPointerDown = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, load]);

  const toggleSound = () => {
    setSoundOn((value) => {
      const next = !value;
      try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch { /* ignore */ }
      if (next) playNotificationChime();
      return next;
    });
  };

  const markIdsRead = useCallback(async (ids) => {
    const clean = ids.filter(Boolean);
    if (!clean.length) return;
    setItems((previous) => previous.map((item) => (
      clean.includes(item.id) && !item.readAtUtc ? { ...item, readAtUtc: new Date().toISOString() } : item
    )));
    setUnread((value) => Math.max(0, value - clean.length));
    try {
      await request('/api/notifications/read', {
        method: 'POST',
        token,
        body: JSON.stringify({ ids: clean }),
      });
      window.dispatchEvent(new Event('emtehani:chat-updated'));
    } catch {
      load();
    }
  }, [token, load]);

  const markAll = async () => {
    if (!unread || marking) return;
    setMarking(true);
    const previous = items;
    setItems((current) => current.map((item) => (item.readAtUtc ? item : { ...item, readAtUtc: new Date().toISOString() })));
    setUnread(0);
    try {
      await request('/api/notifications/read', { method: 'POST', token, body: JSON.stringify({ all: true }) });
      window.dispatchEvent(new Event('emtehani:chat-updated'));
    } catch {
      setItems(previous);
      load();
    } finally {
      setMarking(false);
    }
  };

  const openItem = async (item) => {
    if (!item.readAtUtc) markIdsRead([item.id]);
    setOpen(false);
    if (item.conversationId) {
      try { sessionStorage.setItem('emtehani-chat-conversation', item.conversationId); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('emtehani:open-conversation', { detail: { conversationId: item.conversationId } }));
      onNavigate?.('chat');
      return;
    }
    if (item.page) onNavigate?.(item.page);
  };

  return (
    <div className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread > 0 ? `الإشعارات، ${unread} غير مقروء` : 'الإشعارات'}
        aria-expanded={open}
        className={cn(
          'relative grid size-10 place-items-center rounded-[10px] border bg-surface text-muted transition hover:text-ink',
          open ? 'border-primary/40 text-primary shadow-sm' : 'border-line',
          unread > 0 && !open && 'border-danger/25 text-ink',
        )}
      >
        <motion.span
          animate={flash && !reduce ? { rotate: [0, -14, 11, -7, 4, 0], scale: [1, 1.16, 1] } : { rotate: 0, scale: 1 }}
          transition={{ duration: 0.75, ease: 'easeOut' }}
          className="grid place-items-center"
        >
          {unread > 0 ? <BellRing size={17} /> : <Bell size={17} />}
        </motion.span>
        {unread > 0 ? (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute -right-1.5 -top-1.5 size-4 rounded-full bg-danger/40 motion-safe:animate-ping" />
            <motion.span
              key={unread}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 24 }}
              className="ui-number absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[9.5px] font-extrabold leading-[18px] text-white shadow-sm"
            >
              {unread > 99 ? '99+' : unread}
            </motion.span>
          </>
        ) : null}
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panelRef}
            initial={reduce ? false : { opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-3 top-[72px] z-[80] overflow-hidden rounded-[18px] border border-line bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:left-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[384px]"
            role="dialog"
            aria-label="مركز الإشعارات"
          >
            <div className="relative flex items-center justify-between gap-3 border-b border-line bg-gradient-to-l from-primary-soft/70 via-surface to-surface px-4 py-3">
              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.16em] text-primary">
                  <Sparkles size={11} /> مركز الإشعارات
                </p>
                <p className="mt-0.5 text-[12px] font-bold text-ink">
                  {unread > 0 ? `لديك ${unread} إشعار غير مقروء` : 'كل الإشعارات مقروءة'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleSound}
                  aria-label={soundOn ? 'كتم صوت الإشعارات' : 'تشغيل صوت الإشعارات'}
                  title={soundOn ? 'الصوت مفعّل' : 'الصوت مكتوم'}
                  className={cn('grid size-8 place-items-center rounded-lg border transition', soundOn ? 'border-primary/25 bg-primary-soft text-primary' : 'border-line bg-surface text-subtle hover:text-ink')}
                >
                  {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
                </button>
                <button
                  type="button"
                  onClick={markAll}
                  disabled={!unread || marking}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2 text-[10px] font-bold text-muted transition hover:text-ink disabled:opacity-45"
                >
                  {marking ? <LoaderCircle size={12} className="animate-spin" /> : <CheckCheck size={12} />}
                  قراءة الكل
                </button>
              </div>
            </div>

            <div className="ui-scrollbar-thin max-h-[min(62dvh,440px)] overflow-y-auto overscroll-contain p-2">
              {loading && items.length === 0 ? (
                <div className="grid gap-2 p-1">
                  {[0, 1, 2].map((index) => <div key={index} className="h-16 animate-pulse rounded-[13px] bg-surface-soft" />)}
                </div>
              ) : items.length === 0 ? (
                <div className="grid place-items-center px-5 py-10 text-center">
                  <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary"><Bell size={20} /></span>
                  <p className="mt-3 text-[12.5px] font-bold text-ink">لا توجد إشعارات بعد</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted">ستظهر هنا الرسائل وطلبات الارتباط والامتحانات الجديدة.</p>
                </div>
              ) : (
                <div className="ui-stagger grid gap-1">
                  {items.map((item) => {
                    const meta = metaFor(item.type);
                    const Icon = meta.icon;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        layout={!reduce}
                        onClick={() => openItem(item)}
                        whileHover={reduce ? undefined : { x: -2 }}
                        whileTap={{ scale: 0.99 }}
                        className={cn(
                          'group flex w-full items-start gap-2.5 rounded-[13px] border p-2.5 text-right transition',
                          item.readAtUtc
                            ? 'border-transparent hover:border-line hover:bg-surface-soft/70'
                            : 'border-primary/15 bg-primary-soft/35 hover:bg-primary-soft/60',
                        )}
                      >
                        <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] border', meta.iconClass, meta.ring)}>
                          <Icon size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className={cn('truncate text-[11.5px] font-extrabold', item.readAtUtc ? 'text-ink' : 'text-primary')}>{item.title}</span>
                            <span className="shrink-0 text-[9px] font-semibold text-subtle">{relativeTime(item.createdAtUtc)}</span>
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-5 text-muted">{item.body}</span>
                        </span>
                        {!item.readAtUtc ? <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" /> : null}
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line bg-surface-soft/50 px-4 py-2 text-[9.5px] text-subtle">
              <span>يتم تحديث الإشعارات تلقائياً</span>
              <span className={cn('inline-flex items-center gap-1 font-bold', soundOn ? 'text-emerald' : 'text-subtle')}>
                <span className={cn('size-1.5 rounded-full', soundOn ? 'bg-emerald motion-safe:animate-pulse' : 'bg-subtle')} />
                {soundOn ? 'الصوت مفعّل' : 'الصوت مكتوم'}
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
