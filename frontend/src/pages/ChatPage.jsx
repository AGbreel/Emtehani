import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Check,
  CheckCheck,
  GraduationCap,
  ImagePlus,
  LoaderCircle,
  Lock,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Paperclip,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, EmptyState, IconButton, LiveDot, Modal, Skeleton, cn } from '../components/ui';
import { assetUrl, request } from '../lib/api';

const timeFormatter = new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' });
const dateFormatter = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long' });
const weekdayFormatter = new Intl.DateTimeFormat('ar-EG', { weekday: 'long' });
const shortDateTimeFormatter = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const auditLabels = {
  'mode.changed': 'تغيير وضع المحادثة',
  'message.deleted': 'حذف رسالة',
  'message.pinned': 'تثبيت رسالة',
  'message.unpinned': 'إلغاء تثبيت رسالة',
  'message.approved': 'اعتماد رسالة',
  'message.rejected': 'رفض رسالة',
  'member.muted': 'كتم عضو',
  'member.unmuted': 'رفع كتم عضو',
};

function formatShortDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : shortDateTimeFormatter.format(date);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, now)) return 'اليوم';
  if (isSameDay(date, yesterday)) return 'أمس';
  return dateFormatter.format(date);
}

function inboxTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (isSameDay(date, now)) return timeFormatter.format(date);
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);
  if (date >= weekAgo) return weekdayFormatter.format(date);
  return dateFormatter.format(date);
}

function typeMeta(type) {
  if (type === 'AdminGroup') return { label: 'مجموعة المدرسين', icon: GraduationCap, tone: 'emerald' };
  if (type === 'TeacherGroup') return { label: 'شات جماعي', icon: Users, tone: 'primary' };
  if (type === 'AdminDirect') return { label: 'الإدارة', icon: ShieldCheck, tone: 'emerald' };
  return { label: 'محادثة مباشرة', icon: MessageCircle, tone: 'blue' };
}

export default function ChatPage({ token, user }) {
  const reduce = useReducedMotion();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const [activeId, setActiveId] = useState(null);
  const [mobileThread, setMobileThread] = useState(false);
  const [messages, setMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');
  const [peerReadAtUtc, setPeerReadAtUtc] = useState(null);
  const [thread, setThread] = useState(null);
  const [control, setControl] = useState(null);
  const [pinned, setPinned] = useState([]);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [pending, setPending] = useState([]);
  const [audit, setAudit] = useState([]);
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [governanceTab, setGovernanceTab] = useState('mode');
  const [governanceBusy, setGovernanceBusy] = useState('');
  const [governanceError, setGovernanceError] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState('');
  const [uploading, setUploading] = useState(false);

  const [contactsOpen, setContactsOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState('');
  const [startingId, setStartingId] = useState(null);

  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const activeIdRef = useRef(null);
  const lastSentRef = useRef(null);
  const stickToBottomRef = useRef(true);

  const notifyUnread = () => {
    try { window.dispatchEvent(new Event('emtehani:chat-updated')); } catch { /* ignore */ }
  };

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: reduce ? 'auto' : behavior });
  }, [reduce]);

  const loadConversations = useCallback(async ({ background = false } = {}) => {
    if (!background) setLoading(true);
    try {
      const result = await request('/api/chat/conversations', { token });
      const items = result?.items ?? [];
      setConversations(items);
      setActiveId((current) => (current && items.some((item) => item.id === current) ? current : current || items[0]?.id || null));
      setError('');
    } catch (err) {
      if (!background) setError(err.message || 'تعذر تحميل المحادثات.');
    } finally {
      if (!background) setLoading(false);
    }
  }, [token]);

  const loadMessages = useCallback(async (conversationId, { after = null, quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setThreadLoading(true);
    try {
      const suffix = after ? `?after=${encodeURIComponent(after)}` : '';
      const result = await request(`/api/chat/conversations/${conversationId}/messages${suffix}`, { token });
      if (activeIdRef.current !== conversationId) return;
      const items = result?.items ?? [];
      if (after) {
        setMessages((previous) => {
          const seen = new Set(previous.map((message) => message.id));
          const fresh = items.filter((message) => !seen.has(message.id));
          return fresh.length ? [...previous, ...fresh] : previous;
        });
      } else {
        setMessages(items);
      }
      setPeerReadAtUtc(result?.peerReadAtUtc ?? null);
      setThread(result?.conversation ?? null);
      setThreadError('');
      if (items.length) {
        lastSentRef.current = items[items.length - 1].sentAtUtc;
        setConversations((previous) => previous.map((item) => (item.id === conversationId ? { ...item, unreadCount: 0 } : item)));
        notifyUnread();
      }
    } catch (err) {
      if (!quiet) setThreadError(err.message || 'تعذر تحميل الرسائل.');
    } finally {
      if (!quiet) setThreadLoading(false);
    }
  }, [token]);

  const openConversation = useCallback((conversationId) => {
    setActiveId(conversationId);
    activeIdRef.current = conversationId;
    lastSentRef.current = null;
    setMessages([]);
    setPeerReadAtUtc(null);
    setThread(null);
    setControl(null);
    setPinned([]);
    setPending([]);
    setAudit([]);
    setPinnedOpen(false);
    setGovernanceOpen(false);
    setChatSearch('');
    setSearchResults([]);
    setThreadError('');
    setMobileThread(true);
    stickToBottomRef.current = true;
    setShowJump(false);
  }, []);

  const startDirect = useCallback(async (targetId) => {
    if (!targetId) return;
    setStartingId(targetId);
    setContactsError('');
    try {
      const result = await request('/api/chat/direct', { method: 'POST', token, body: JSON.stringify({ userId: targetId }) });
      const conversationId = result?.conversation?.id;
      if (conversationId) {
        setContactsOpen(false);
        await loadConversations({ background: true });
        openConversation(conversationId);
      }
    } catch (err) {
      setContactsError(err.message || 'تعذر بدء المحادثة.');
    } finally {
      setStartingId(null);
    }
  }, [token, loadConversations, openConversation]);

  const loadGovernance = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      const [ctrl, pinnedResult] = await Promise.all([
        request(`/api/chat/conversations/${conversationId}/control`, { token }),
        request(`/api/chat/conversations/${conversationId}/pinned`, { token }).catch(() => ({ items: [] })),
      ]);
      if (activeIdRef.current !== conversationId) return;
      setControl(ctrl);
      setPinned(pinnedResult?.items ?? []);
      if (ctrl?.canManage) {
        const pendingResult = await request(`/api/chat/conversations/${conversationId}/pending`, { token }).catch(() => ({ items: [] }));
        if (activeIdRef.current === conversationId) setPending(pendingResult?.items ?? []);
      } else {
        setPending([]);
      }
    } catch {
      if (activeIdRef.current === conversationId) setControl(null);
    }
  }, [token]);

  useEffect(() => {
    if (activeId) loadGovernance(activeId);
  }, [activeId, loadGovernance]);

  const runGovernance = async (key, task) => {
    setGovernanceBusy(key);
    setGovernanceError('');
    try {
      await task();
    } catch (err) {
      setGovernanceError(err.message || 'تعذر تنفيذ الإجراء.');
    } finally {
      setGovernanceBusy('');
    }
  };

  const changeMode = (mode) => runGovernance(`mode-${mode}`, async () => {
    const result = await request(`/api/chat/conversations/${activeId}/mode`, {
      token,
      method: 'PUT',
      body: JSON.stringify({ mode }),
    });
    const nextMode = result?.chatMode || mode;
    setControl((previous) => (previous ? { ...previous, chatMode: nextMode } : previous));
    setThread((previous) => (previous ? { ...previous, chatMode: nextMode } : previous));
    setConversations((previous) => previous.map((item) => (item.id === activeId ? { ...item, chatMode: nextMode } : item)));
  });

  const moderateMessage = (messageId, action) => runGovernance(`${action}-${messageId}`, async () => {
    await request(`/api/chat/conversations/${activeId}/messages/${messageId}/${action}`, { token, method: 'POST' });
    setPending((previous) => previous.filter((item) => item.id !== messageId));
    await loadMessages(activeId, { quiet: true });
    loadConversations({ background: true });
  });

  const togglePin = (message) => runGovernance(`pin-${message.id}`, async () => {
    await request(`/api/chat/conversations/${activeId}/messages/${message.id}/pin`, { token, method: 'POST' });
    setMessages((previous) => previous.map((item) => (item.id === message.id ? { ...item, isPinned: !item.isPinned } : item)));
    const pinnedResult = await request(`/api/chat/conversations/${activeId}/pinned`, { token }).catch(() => ({ items: [] }));
    setPinned(pinnedResult?.items ?? []);
  });

  const deleteMessage = (message) => {
    if (!window.confirm('حذف هذه الرسالة للجميع؟')) return;
    runGovernance(`delete-${message.id}`, async () => {
      await request(`/api/chat/conversations/${activeId}/messages/${message.id}/delete`, { token, method: 'POST' });
      setMessages((previous) => previous.filter((item) => item.id !== message.id));
    });
  };

  const muteMember = (memberId, muted) => runGovernance(`mute-${memberId}`, async () => {
    await request(`/api/chat/conversations/${activeId}/members/${memberId}/mute`, {
      token,
      method: 'POST',
      body: JSON.stringify({ muted, minutes: null, reason: muted ? 'كتم من إدارة المحادثة' : null }),
    });
    await loadGovernance(activeId);
  });

  const loadAudit = async () => {
    if (!activeId) return;
    setGovernanceBusy('audit');
    setGovernanceError('');
    try {
      const result = await request(`/api/chat/conversations/${activeId}/audit`, { token });
      setAudit(result?.items ?? []);
    } catch (err) {
      setGovernanceError(err.message || 'تعذر تحميل سجل المحادثة.');
    } finally {
      setGovernanceBusy('');
    }
  };

  const searchChat = async () => {
    const term = chatSearch.trim();
    if (term.length < 2 || !activeId) return;
    setSearching(true);
    setGovernanceError('');
    try {
      const result = await request(`/api/chat/conversations/${activeId}/search?q=${encodeURIComponent(term)}`, { token });
      setSearchResults(result?.items ?? []);
    } catch (err) {
      setGovernanceError(err.message || 'تعذر البحث داخل المحادثة.');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const openGovernance = (tab = 'mode') => {
    setGovernanceTab(tab);
    setGovernanceOpen(true);
    setGovernanceError('');
    if (tab === 'audit' && audit.length === 0) loadAudit();
  };

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    const timer = setInterval(() => loadConversations({ background: true }), 12000);
    return () => clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    activeIdRef.current = activeId;
    if (activeId) loadMessages(activeId);
  }, [activeId, loadMessages]);

  useEffect(() => {
    if (!activeId) return undefined;
    const timer = setInterval(() => loadMessages(activeId, { after: lastSentRef.current, quiet: true }), 4000);
    return () => clearInterval(timer);
  }, [activeId, loadMessages]);

  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom();
  }, [messages, threadLoading, scrollToBottom]);

  useEffect(() => {
    let target = '';
    let conversationId = '';
    try {
      target = sessionStorage.getItem('emtehani-chat-target') || '';
      conversationId = sessionStorage.getItem('emtehani-chat-conversation') || '';
      if (target) sessionStorage.removeItem('emtehani-chat-target');
      if (conversationId) sessionStorage.removeItem('emtehani-chat-conversation');
    } catch { /* ignore */ }
    if (target) startDirect(target);
    else if (conversationId) openConversation(conversationId);
  }, [startDirect, openConversation]);

  useEffect(() => {
    const onOpen = (event) => {
      const conversationId = event?.detail?.conversationId;
      if (!conversationId) return;
      stickToBottomRef.current = true;
      openConversation(conversationId);
    };
    window.addEventListener('emtehani:open-conversation', onOpen);
    return () => window.removeEventListener('emtehani:open-conversation', onOpen);
  }, [openConversation]);

  const openContacts = async () => {
    setContactsOpen(true);
    setContactsLoading(true);
    setContactsError('');
    try {
      const result = await request('/api/chat/contacts', { token });
      setContacts(result?.items ?? []);
    } catch (err) {
      setContactsError(err.message || 'تعذر تحميل قائمة جهات الاتصال.');
    } finally {
      setContactsLoading(false);
    }
  };

  const uploadImage = async (file) => {
    if (!file || uploading) return;
    if (file.size > 4 * 1024 * 1024) {
      setThreadError('حجم الصورة يجب ألا يتجاوز 4 ميجابايت.');
      return;
    }
    setUploading(true);
    setThreadError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await request('/api/uploads/image', { token, method: 'POST', body: form, timeoutMs: 60000 });
      setAttachment(result.url);
    } catch (err) {
      setThreadError(err.message || 'تعذر رفع الصورة.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const sendMessage = async () => {
    const body = text.trim();
    if ((!body && !attachment) || !activeId || sending) return;
    const attached = attachment;
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      senderId: user?.userId,
      senderName: user?.fullName || 'أنا',
      body,
      attachmentUrl: attached || null,
      sentAtUtc: new Date().toISOString(),
      pending: true,
    };
    setMessages((previous) => [...previous, optimistic]);
    setText('');
    setAttachment('');
    setSending(true);
    stickToBottomRef.current = true;
    setThreadError('');
    try {
      const result = await request(`/api/chat/conversations/${activeId}/messages`, {
        method: 'POST',
        token,
        body: JSON.stringify({ body, attachmentUrl: attached || null }),
      });
      setMessages((previous) => previous.map((message) => (message.id === tempId ? (result?.message || message) : message)));
      lastSentRef.current = result?.message?.sentAtUtc || lastSentRef.current;
      loadConversations({ background: true });
      notifyUnread();
    } catch (err) {
      setMessages((previous) => previous.filter((message) => message.id !== tempId));
      setText(body);
      setAttachment(attached);
      setThreadError(err.message || 'تعذر إرسال الرسالة.');
    } finally {
      setSending(false);
    }
  };

  const onComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottomRef.current = distance < 140;
    setShowJump(distance > 180);
  };

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeId) || null,
    [conversations, activeId],
  );
  const totalUnread = useMemo(() => conversations.reduce((sum, item) => sum + (item.unreadCount || 0), 0), [conversations]);
  const filteredConversations = useMemo(() => {
    const term = query.trim();
    if (!term) return conversations;
    return conversations.filter((item) => item.title?.includes(term) || item.lastMessagePreview?.includes(term));
  }, [conversations, query]);
  const activeMeta = typeMeta(activeConversation?.type);
  const ActiveIcon = activeMeta.icon;
  const canSend = Boolean(text.trim() || attachment) && !sending && Boolean(activeId) && thread?.canPost !== false;
  const currentMode = control?.chatMode || thread?.chatMode || activeConversation?.chatMode || '';
  const modeLabels = {
    TeacherOnly: 'المدرس فقط',
    AdminOnly: 'الإدارة فقط',
    Everyone: 'الجميع',
    Moderated: 'بموافقة المدرس',
    Announcement: 'إعلانات فقط',
  };
  const lockedReason = thread?.isMuted
    ? 'تم كتمك في هذه المحادثة. تواصل مع المدرس لرفع الكتم.'
    : currentMode === 'TeacherOnly'
      ? 'المحادثة مغلقة حالياً — المدرس فقط يمكنه الإرسال.'
      : currentMode === 'AdminOnly'
        ? 'المحادثة مغلقة حالياً — الإدارة فقط يمكنها الإرسال.'
        : currentMode === 'Announcement'
          ? 'هذه المحادثة في وضع الإعلانات — الإدارة فقط ترسل.'
          : 'الإرسال مغلق حالياً من قِبل إدارة المحادثة.';

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-stretch">
        <Card className={cn('flex h-[calc(100dvh-200px)] min-h-[320px] flex-col overflow-hidden lg:h-[calc(100dvh-210px)] lg:min-h-[430px]', mobileThread && 'hidden lg:flex')}>
          <div className="relative overflow-hidden border-b border-line bg-gradient-to-l from-primary-soft/90 via-surface to-surface px-3.5 py-3.5">
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute -right-7 -top-10 size-28 rounded-full bg-primary/15 blur-2xl"
              animate={reduce ? undefined : { scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="relative flex items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-[0.14em] text-primary"><Sparkles size={11} /> صندوق الوارد</p>
                <h2 className="mt-1 flex items-center gap-2 font-display text-[1.05rem] font-semibold tracking-[-0.02em] text-ink">
                  المحادثات
                  {totalUnread > 0 ? (
                    <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {totalUnread > 99 ? '99+' : totalUnread}
                    </motion.span>
                  ) : null}
                </h2>
              </div>
              <Button size="xs" icon={Plus} onClick={openContacts}>محادثة</Button>
            </div>
            <div className="relative mt-3">
              <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث في المحادثات..."
                aria-label="ابحث في المحادثات"
                className="h-10 w-full rounded-[11px] border border-line bg-surface/80 pe-3 ps-9 text-[12.5px] text-ink outline-none backdrop-blur transition placeholder:text-subtle focus:border-primary focus:ring-4 focus:ring-primary-soft"
              />
            </div>
          </div>

          <div className="ui-scrollbar-thin flex-1 overflow-y-auto overscroll-contain p-2">
            {loading ? (
              <div className="grid gap-2 p-1">
                {[0, 1, 2, 3, 4].map((index) => <Skeleton key={index} className="h-[68px] w-full" />)}
              </div>
            ) : filteredConversations.length === 0 ? (
              <EmptyState
                icon={MessagesSquare}
                title={conversations.length === 0 ? 'لا توجد محادثات بعد' : 'لا نتائج مطابقة'}
                description={conversations.length === 0 ? 'ابدأ محادثة مع طالب أو مع إدارة المنصة.' : 'جرّب كلمة بحث أخرى.'}
                action={conversations.length === 0 ? <Button size="sm" icon={Plus} onClick={openContacts}>بدء محادثة</Button> : null}
              />
            ) : (
              <div className="ui-stagger grid gap-1.5">
                {filteredConversations.map((conversation) => {
                  const meta = typeMeta(conversation.type);
                  const Icon = meta.icon;
                  const isActive = conversation.id === activeId;
                  return (
                    <motion.button
                      key={conversation.id}
                      type="button"
                      layout
                      onClick={() => openConversation(conversation.id)}
                      className={cn(
                        'group relative flex w-full items-center gap-3 rounded-[13px] border px-2.5 py-2.5 text-right transition',
                        isActive ? 'border-primary/30 bg-primary-soft/80 shadow-sm' : 'border-transparent hover:border-line hover:bg-surface-soft',
                      )}
                      whileHover={reduce ? undefined : { x: -2 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <span className={cn(
                        'grid size-10 shrink-0 place-items-center rounded-[13px] border',
                        conversation.type === 'AdminGroup' ? 'border-emerald/25 bg-emerald text-white shadow-sm'
                          : conversation.type === 'TeacherGroup' ? 'border-primary/15 bg-primary-soft text-primary'
                            : conversation.type === 'AdminDirect' ? 'border-emerald/20 bg-emerald-soft text-emerald'
                              : 'border-blue/20 bg-blue-soft text-blue',
                      )}>
                        <Icon size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn('truncate text-[12.5px] font-bold', isActive ? 'text-primary' : 'text-ink')}>{conversation.title}</p>
                          <span className="shrink-0 text-[9.5px] font-semibold text-subtle">{inboxTime(conversation.lastMessageAtUtc)}</span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <p className="truncate text-[11px] leading-5 text-muted">{conversation.lastMessagePreview || conversation.subtitle}</p>
                          {conversation.unreadCount > 0 ? (
                            <motion.span
                              initial={reduce ? false : { scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="grid min-w-[18px] shrink-0 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[9.5px] font-bold text-white shadow-sm"
                            >
                              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                            </motion.span>
                          ) : null}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <Card className={cn('relative flex h-[calc(100dvh-200px)] min-h-[320px] flex-col overflow-hidden lg:h-[calc(100dvh-210px)] lg:min-h-[430px]', !mobileThread && 'hidden lg:flex')}>
          <AnimatePresence mode="wait">
            {activeConversation ? (
              <motion.div
                key={activeConversation.id}
                initial={reduce ? false : { opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? {} : { opacity: 0, x: -10 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="flex h-full min-h-0 flex-col"
              >
                <div className="relative overflow-hidden border-b border-line bg-gradient-to-l from-primary-soft/70 via-surface to-surface px-3 py-3 sm:px-4">
                  <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-10 -top-14 size-32 rounded-full bg-primary/10 blur-3xl"
                    animate={reduce ? undefined : { scale: [1, 1.2, 1] }}
                    transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <div className="relative flex items-center gap-2.5">
                    <IconButton label="رجوع إلى المحادثات" onClick={() => setMobileThread(false)} className="lg:hidden"><ArrowRight size={17} /></IconButton>
                    <span className={cn(
                      'grid size-11 shrink-0 place-items-center rounded-[14px] border shadow-sm',
                      activeConversation.type === 'AdminGroup' ? 'border-emerald/25 bg-emerald text-white'
                        : activeConversation.type === 'TeacherGroup' ? 'border-primary/15 bg-primary text-white'
                          : activeConversation.type === 'AdminDirect' ? 'border-emerald/20 bg-emerald-soft text-emerald'
                            : 'border-blue/20 bg-blue-soft text-blue',
                    )}>
                      <ActiveIcon size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-display text-[14.5px] font-semibold text-ink">{activeConversation.title}</h3>
                        <Badge tone={activeMeta.tone} className="hidden px-2 py-0.5 text-[9.5px] sm:inline-flex">{activeMeta.label}</Badge>
                        {currentMode ? (
                          <Badge tone={currentMode === 'Everyone' ? 'emerald' : currentMode === 'Moderated' ? 'warning' : 'neutral'} className="hidden px-2 py-0.5 text-[9.5px] md:inline-flex">
                            {modeLabels[currentMode] || currentMode}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted">
                        <LiveDot label="متصل" className="text-[10px]" />
                        <span className="hidden sm:inline">·</span>
                        <span className="hidden truncate sm:inline">{activeConversation.subtitle}</span>
                      </p>
                    </div>
                    {pinned.length ? (
                      <IconButton label="الرسائل المثبتة" onClick={() => setPinnedOpen((value) => !value)}>
                        <Pin size={15} className={pinnedOpen ? 'fill-current text-primary' : ''} />
                      </IconButton>
                    ) : null}
                    {control?.canManage ? (
                      <IconButton label="إدارة المحادثة" onClick={() => openGovernance('mode')}><Settings2 size={15} /></IconButton>
                    ) : null}
                    <IconButton label="تحديث الرسائل" onClick={() => loadMessages(activeConversation.id, { quiet: false })}><RefreshCw size={15} className={cn(threadLoading && 'animate-spin')} /></IconButton>
                  </div>
                </div>

                <div ref={scrollRef} onScroll={onScroll} className="ui-scrollbar-thin relative flex-1 space-y-1 overflow-y-auto overscroll-contain bg-surface-soft/35 px-2.5 py-4 sm:px-4">
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(16,185,129,0.06),transparent_35%),radial-gradient(circle_at_85%_80%,rgba(59,130,246,0.05),transparent_30%)]" />
                  {pinnedOpen && pinned.length > 0 ? (
                    <div className="relative z-10 mb-3 rounded-[13px] border border-primary/25 bg-surface/95 p-2.5 shadow-sm backdrop-blur">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-[11px] font-bold text-primary"><Pin size={11} /> الرسائل المثبتة ({pinned.length})</p>
                        <IconButton label="إخفاء المثبتة" onClick={() => setPinnedOpen(false)}><X size={12} /></IconButton>
                      </div>
                      <div className="ui-scrollbar-thin grid max-h-36 gap-1.5 overflow-y-auto">
                        {pinned.map((item) => (
                          <div key={item.id} className="rounded-[10px] border border-line bg-surface-soft px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[10.5px] font-bold text-ink">{item.senderName || 'مستخدم'}</p>
                              <span className="shrink-0 text-[9px] text-subtle">{inboxTime(item.sentAtUtc)}</span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-muted">{item.body || '📷 صورة'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {threadError ? <div className="relative z-10 mb-2"><Alert tone="danger" onClose={() => setThreadError('')}>{threadError}</Alert></div> : null}
                  {threadLoading ? (
                    <div className="relative z-10 grid gap-3 py-2">
                      {[0, 1, 2, 3].map((index) => (
                        <div key={index} className={cn('flex', index % 2 ? 'justify-end' : 'justify-start')}>
                          <Skeleton className={cn('h-14 rounded-[16px]', index % 2 ? 'w-2/5' : 'w-1/2')} />
                        </div>
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="relative z-10 grid h-full place-items-center">
                      <EmptyState icon={MessageCircle} title="ابدأ المحادثة" description="اكتب أول رسالة وخلّي التواصل يبدأ." />
                    </div>
                  ) : (
                    <div className="relative z-10">
                      {messages.map((message, index) => {
                        const mine = message.senderId === user?.userId;
                        const previous = messages[index - 1];
                        const showDay = !previous || dayLabel(previous.sentAtUtc) !== dayLabel(message.sentAtUtc);
                        const showIdentity = !mine && activeConversation.isGroup && (!previous || previous.senderId !== message.senderId);
                        const read = Boolean(peerReadAtUtc && mine && new Date(peerReadAtUtc) >= new Date(message.sentAtUtc));
                        return (
                          <div key={message.id}>
                            {showDay ? (
                              <div className="my-4 flex items-center gap-3 first:mt-0">
                                <span className="h-px flex-1 bg-line" />
                                <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[9.5px] font-bold text-subtle">{dayLabel(message.sentAtUtc)}</span>
                                <span className="h-px flex-1 bg-line" />
                              </div>
                            ) : null}
                            <motion.div
                              layout={!reduce}
                              initial={reduce ? false : { opacity: 0, y: 8, scale: 0.985 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                              className={cn('group/msg mb-2 flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}
                            >
                              {!mine && (showIdentity || !activeConversation.isGroup) ? (
                                <Avatar name={message.senderName} size="sm" className="mb-4 size-7 text-[10px]" />
                              ) : null}
                              {!mine && activeConversation.isGroup && !showIdentity ? <span className="mb-4 size-7 shrink-0" /> : null}
                              <div className={cn('max-w-[82%] sm:max-w-[72%]', mine ? 'items-end' : 'items-start')}>
                                <div className={cn(
                                  'relative rounded-[16px] px-3 py-2 text-[13px] leading-6 shadow-sm',
                                  mine
                                    ? 'rounded-ee-[5px] bg-primary text-white'
                                    : 'rounded-es-[5px] border border-line bg-surface text-ink',
                                )}>
                                  {control?.canManage && !message.pending ? (
                                    <div className="absolute -top-2.5 left-1 z-10 flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5 opacity-100 shadow-sm transition sm:opacity-0 sm:group-hover/msg:opacity-100 sm:focus-within:opacity-100">
                                      <button type="button" onClick={() => togglePin(message)} title={message.isPinned ? 'إلغاء التثبيت' : 'تثبيت الرسالة'} aria-label={message.isPinned ? 'إلغاء التثبيت' : 'تثبيت الرسالة'} className={cn('grid size-6 place-items-center rounded-full transition hover:bg-surface-soft', message.isPinned ? 'text-primary' : 'text-muted')}>
                                        <Pin size={11} className={message.isPinned ? 'fill-current' : ''} />
                                      </button>
                                      <button type="button" onClick={() => deleteMessage(message)} title="حذف الرسالة" aria-label="حذف الرسالة" className="grid size-6 place-items-center rounded-full text-muted transition hover:bg-danger-soft hover:text-danger">
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  ) : null}
                                  {showIdentity ? <p className="mb-1 text-[10.5px] font-extrabold text-primary">{message.senderName}</p> : null}
                                  {message.attachmentUrl ? (
                                    <a href={assetUrl(message.attachmentUrl)} target="_blank" rel="noreferrer" className="mb-1.5 block overflow-hidden rounded-[12px] border border-white/25">
                                      <img src={assetUrl(message.attachmentUrl)} alt="مرفق" loading="lazy" className="max-h-64 w-full object-cover transition duration-500 hover:scale-[1.03]" />
                                    </a>
                                  ) : null}
                                  {message.body ? <p className="whitespace-pre-wrap break-words">{message.body}</p> : null}
                                  <span className={cn('mt-1 flex items-center justify-end gap-1 text-[9.5px] tabular-nums', mine ? 'text-white/70' : 'text-subtle')}>
                                    {message.approvalPending ? (
                                      <span className={cn('rounded-full px-1.5 py-0.5 text-[8.5px] font-bold', mine ? 'bg-white/20 text-white' : 'bg-warning-soft text-warning')}>بانتظار الموافقة</span>
                                    ) : null}
                                    {timeFormatter.format(new Date(message.sentAtUtc))}
                                    {message.pending ? <LoaderCircle size={10} className="animate-spin" /> : mine && !activeConversation.isGroup ? (read ? <CheckCheck size={12} /> : <Check size={12} />) : null}
                                  </span>
                                </div>
                              </div>
                            </motion.div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <AnimatePresence>
                    {showJump ? (
                      <motion.button
                        type="button"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        onClick={() => { stickToBottomRef.current = true; setShowJump(false); scrollToBottom(); }}
                        className="sticky bottom-2 z-20 mx-auto flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[10.5px] font-bold text-primary shadow-card"
                      >
                        أحدث الرسائل
                      </motion.button>
                    ) : null}
                  </AnimatePresence>
                </div>

                <div className="border-t border-line bg-surface p-2.5 sm:p-3">
                  {thread && thread.canPost === false ? (
                    <div className="mb-2 flex items-start gap-2 rounded-[11px] border border-warning/30 bg-warning-soft p-2.5 text-[11px] font-bold leading-5 text-warning">
                      <Lock size={13} className="mt-0.5 shrink-0" />
                      <span>{lockedReason}</span>
                    </div>
                  ) : null}
                  {attachment ? (
                    <div className="mb-2 flex items-center gap-2 rounded-[12px] border border-line bg-surface-soft p-2">
                      <img src={assetUrl(attachment)} alt="معاينة المرفق" className="size-12 rounded-[9px] object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-ink">صورة جاهزة للإرسال</p>
                        <p className="text-[10px] text-muted">اضغط إرسال لإضافتها للمحادثة.</p>
                      </div>
                      <IconButton label="إزالة الصورة" onClick={() => setAttachment('')}><X size={14} /></IconButton>
                    </div>
                  ) : null}
                  <div className="flex items-end gap-1.5 sm:gap-2">
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => uploadImage(event.target.files?.[0])} />
                    <IconButton label="إرفاق صورة" onClick={() => fileRef.current?.click()} disabled={uploading || thread?.canPost === false} className="mb-0.5">
                      {uploading ? <LoaderCircle size={16} className="animate-spin" /> : <Paperclip size={16} />}
                    </IconButton>
                    <textarea
                      rows={1}
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      onKeyDown={onComposerKeyDown}
                      placeholder={thread?.canPost === false ? 'الإرسال مغلق حالياً...' : 'اكتب رسالتك هنا...'}
                      aria-label="نص الرسالة"
                      disabled={thread?.canPost === false}
                      className="max-h-32 min-h-11 flex-1 resize-none rounded-[12px] border border-line bg-surface-soft px-3.5 py-2.5 text-[13px] leading-6 text-ink outline-none transition placeholder:text-subtle focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <Button icon={Send} onClick={sendMessage} loading={sending} disabled={!canSend} className="min-w-[84px]">إرسال</Button>
                  </div>
                  <p className="mt-1.5 hidden items-center gap-1.5 px-1 text-[9.5px] text-subtle sm:flex"><ImagePlus size={11} /> يمكنك إرفاق صورة حتى 4 ميجابايت · Enter للإرسال</p>
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid h-full place-items-center">
                <EmptyState
                  icon={MessagesSquare}
                  title="اختر محادثة"
                  description="اختر محادثة من القائمة أو ابدأ محادثة جديدة مع طالب أو مع إدارة المنصة."
                  action={<Button size="sm" icon={Plus} onClick={openContacts}>محادثة جديدة</Button>}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>

      <Modal
        open={governanceOpen}
        onClose={() => setGovernanceOpen(false)}
        title="إدارة المحادثة"
        description="الأوضاع، اعتماد الرسائل، الكتم، البحث وسجل التغييرات — كلها مُنفَّذة من الخادم."
        icon={Settings2}
        size="lg"
      >
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {[
            ['mode', 'الوضع', Megaphone],
            ['pending', `الاعتماد${pending.length ? ` (${pending.length})` : ''}`, ShieldCheck],
            ['members', 'الكتم', UserX],
            ['search', 'بحث', Search],
            ['audit', 'السجل', RefreshCw],
          ].map(([key, label, TabIcon]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setGovernanceTab(key); if (key === 'audit' && audit.length === 0) loadAudit(); }}
              className={cn(
                'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[11px] font-bold transition',
                governanceTab === key ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-muted hover:text-ink',
              )}
            >
              <TabIcon size={12} />{label}
            </button>
          ))}
        </div>

        {governanceError ? <Alert tone="danger" className="mb-3" onClose={() => setGovernanceError('')}>{governanceError}</Alert> : null}

        {governanceTab === 'mode' ? (
          <div className="grid gap-2 pb-2">
            <p className="text-[11px] leading-5 text-muted">اختر من يستطيع الإرسال في هذه المحادثة. التغيير يُطبَّق فوراً ويرسل إشعاراً للأعضاء.</p>
            {(control?.allowedModes || []).length === 0 ? (
              <p className="rounded-[10px] bg-surface-soft p-3 text-[11px] text-muted">هذه المحادثة الفردية لا تدعم أوضاع الإرسال؛ الإرسال متاح للطرفين.</p>
            ) : (
              control.allowedModes.map((mode) => {
                const active = currentMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => changeMode(mode)}
                    disabled={active || Boolean(governanceBusy)}
                    className={cn(
                      'flex min-h-11 items-center justify-between gap-2 rounded-[12px] border px-3 text-right text-[12px] font-bold transition',
                      active ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-ink hover:border-primary/40',
                    )}
                  >
                    <span>{modeLabels[mode] || mode}</span>
                    {governanceBusy === `mode-${mode}` ? <LoaderCircle size={14} className="animate-spin" /> : active ? <Badge tone="emerald">مفعّل</Badge> : null}
                  </button>
                );
              })
            )}
          </div>
        ) : null}

        {governanceTab === 'pending' ? (
          <div className="grid gap-2 pb-2">
            {pending.length === 0 ? (
              <p className="rounded-[10px] bg-surface-soft p-3 text-[11px] text-muted">لا توجد رسائل بانتظار الاعتماد حالياً.</p>
            ) : pending.map((item) => (
              <div key={item.id} className="rounded-[12px] border border-line bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[11.5px] font-bold text-ink">{item.senderName || 'مستخدم'}</p>
                  <span className="shrink-0 text-[9.5px] text-subtle">{inboxTime(item.sentAtUtc)}</span>
                </div>
                {item.attachmentUrl ? <img src={assetUrl(item.attachmentUrl)} alt="مرفق" className="mt-1.5 max-h-40 w-full rounded-[10px] object-cover" /> : null}
                {item.body ? <p className="mt-1 line-clamp-3 text-[11.5px] leading-5 text-muted">{item.body}</p> : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="xs" icon={Check} loading={governanceBusy === `approve-${item.id}`} onClick={() => moderateMessage(item.id, 'approve')}>اعتماد</Button>
                  <Button size="xs" variant="secondary" icon={X} loading={governanceBusy === `reject-${item.id}`} onClick={() => moderateMessage(item.id, 'reject')}>رفض</Button>
                  <Button size="xs" variant="ghost" icon={UserX} loading={governanceBusy === `mute-${item.senderId}`} onClick={() => muteMember(item.senderId, true)}>كتم المرسل</Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {governanceTab === 'members' ? (
          <div className="grid gap-2 pb-2">
            <p className="text-[11px] leading-5 text-muted">الأعضاء المكتمون لا يمكنهم الإرسال حتى يتم رفع الكتم. يمكنك كتم المرسل من تبويب الاعتماد.</p>
            {(control?.mutedMembers || []).length === 0 ? (
              <p className="rounded-[10px] bg-surface-soft p-3 text-[11px] text-muted">لا يوجد أعضاء مكتمون حالياً.</p>
            ) : control.mutedMembers.map((member) => (
              <div key={member.userId} className="flex items-center justify-between gap-2 rounded-[12px] border border-line bg-surface p-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar name={member.name} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-[11.5px] font-bold text-ink">{member.name || 'عضو'}</p>
                    <p className="text-[9.5px] text-subtle">{member.mutedUntilUtc ? `حتى ${formatShortDate(member.mutedUntilUtc)}` : 'بدون نهاية'}</p>
                  </div>
                </div>
                <Button size="xs" variant="secondary" loading={governanceBusy === `mute-${member.userId}`} onClick={() => muteMember(member.userId, false)}>رفع الكتم</Button>
              </div>
            ))}
          </div>
        ) : null}

        {governanceTab === 'search' ? (
          <div className="grid gap-2 pb-2">
            <div className="flex gap-2">
              <input
                value={chatSearch}
                onChange={(event) => setChatSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') searchChat(); }}
                placeholder="ابحث داخل رسائل المحادثة (حرفان على الأقل)"
                className="h-10 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3 text-[11.5px] text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary-soft"
              />
              <Button size="sm" icon={Search} loading={searching} disabled={chatSearch.trim().length < 2} onClick={searchChat}>بحث</Button>
            </div>
            {searchResults.length === 0 ? (
              <p className="rounded-[10px] bg-surface-soft p-3 text-[11px] text-muted">لا نتائج بعد. اكتب كلمة ثم اضغط بحث.</p>
            ) : searchResults.map((item) => (
              <div key={item.id} className="rounded-[10px] border border-line bg-surface p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] font-bold text-ink">{item.senderName || 'مستخدم'} {item.isPinned ? <Pin size={10} className="inline text-primary" /> : null}</p>
                  <span className="shrink-0 text-[9px] text-subtle">{inboxTime(item.sentAtUtc)}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-5 text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        ) : null}

        {governanceTab === 'audit' ? (
          <div className="grid gap-1.5 pb-2">
            {governanceBusy === 'audit' ? (
              <div className="grid gap-1.5">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-10 w-full" />)}</div>
            ) : audit.length === 0 ? (
              <p className="rounded-[10px] bg-surface-soft p-3 text-[11px] text-muted">لا توجد عمليات مسجلة بعد.</p>
            ) : audit.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2 rounded-[10px] border border-line bg-surface p-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-ink">{auditLabels[item.action] || item.action}</p>
                  <p className="mt-0.5 text-[9.5px] text-subtle">{item.actorName} · {item.details || '—'}</p>
                </div>
                <span className="shrink-0 text-[9px] text-subtle">{inboxTime(item.createdAtUtc)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={contactsOpen}
        onClose={() => setContactsOpen(false)}
        title="محادثة جديدة"
        description="اختر طالباً أو مدرساً أو إدارة المنصة لبدء محادثة مباشرة."
        icon={MessagesSquare}
        size="md"
      >
        {contactsError ? <Alert tone="danger" className="mb-3" onClose={() => setContactsError('')}>{contactsError}</Alert> : null}
        {contactsLoading ? (
          <div className="grid gap-2 pb-3">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
        ) : contacts.length === 0 ? (
          <EmptyState icon={UserRound} title="لا توجد جهات اتصال" description="ستظهر هنا حسابات الطلاب والمدرسين المتاحة للمحادثة." />
        ) : (
          <div className="ui-stagger grid gap-2 pb-3">
            {contacts.map((contact) => {
              const Icon = contact.role === 'Admin' ? ShieldCheck : contact.role === 'Teacher' ? UserRound : Users;
              return (
                <motion.button
                  key={contact.userId}
                  type="button"
                  whileHover={reduce ? undefined : { x: -2 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => startDirect(contact.userId)}
                  disabled={startingId === contact.userId}
                  className="flex w-full items-center gap-3 rounded-[13px] border border-line bg-surface p-3 text-right transition hover:border-primary/30 hover:bg-primary-soft/40 disabled:opacity-60"
                >
                  <Avatar name={contact.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-ink">{contact.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted">
                      <Icon size={11} />
                      {contact.roleLabel}
                      {contact.grade ? <span className="truncate">· {contact.grade}</span> : null}
                    </p>
                  </div>
                  {startingId === contact.userId ? <LoaderCircle size={16} className="animate-spin text-primary" /> : <MessageCircle size={16} className="text-subtle" />}
                </motion.button>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
