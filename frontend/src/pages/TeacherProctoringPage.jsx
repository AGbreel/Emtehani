import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock3,
  Eye,
  Gavel,
  LoaderCircle,
  MessageSquareWarning,
  StickyNote,
  Play,
  Send,
  ShieldAlert,
  ShieldCheck,
  Square,
  UserRound,
  Video,
} from 'lucide-react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LiveDot,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatusChip,
  Textarea,
  cn,
} from '../components/ui';
import { API, request } from '../lib/api';
import { formatDate, formatNumber, formatTimer } from '../lib/format';

const filters = [
  ['all', 'الكل'],
  ['Normal', 'سليم'],
  ['Warning', 'تنبيهات'],
  ['NeedsApproval', 'بانتظار موافقتك'],
  ['RepeatedViolations', 'مخالفات متكررة'],
];

const violationLabels = {
  TabSwitch: 'تبديل تبويب/نافذة',
  PageExit: 'محاولة مغادرة الصفحة',
  FullscreenExit: 'خروج من ملء الشاشة',
  Copy: 'محاولة نسخ',
  Paste: 'محاولة لصق',
  Cut: 'محاولة قص',
  Screenshot: 'محاولة تصوير',
  CameraDenied: 'رفض الكاميرا',
  CameraDisconnected: 'انقطاع الكاميرا',
  FaceMissing: 'لا يظهر وجه (مؤشر مراجعة)',
  MultipleFaces: 'أكثر من وجه (مؤشر مراجعة)',
};

const severityTone = { Low: 'primary', Medium: 'warning', High: 'danger' };

const defaultSettings = {
  isEnabled: false,
  monitorTabSwitch: true,
  monitorPageExit: true,
  requireFullscreen: false,
  monitorCopy: true,
  preventCopy: true,
  monitorPaste: false,
  preventPaste: false,
  monitorCut: true,
  enableCamera: false,
  snapshotIntervalSeconds: 60,
  maxAllowedExits: 3,
  exitAction: 'Warn',
  fullscreenExitAction: 'Warn',
  pauseTimerOnTeacherReview: true,
  warnOnFirstExit: true,
  warnOnRepeatedExit: true,
};

function actionLabel(action) {
  return {
    AllowContinue: 'سماح بالاستكمال',
    Resume: 'استئناف',
    Warn: 'تنبيه',
    Note: 'ملاحظة',
    ForceSubmit: 'تسليم قسري',
    Terminate: 'إنهاء المحاولة',
  }[action] || action;
}

export default function TeacherProctoringPage({ token, exam, onBack }) {
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [detail, setDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const itemsRef = useRef([]);

  const load = useCallback(async (background = false) => {
    if (!exam?.id) return;
    if (!background) setLoading(true);
    try {
      const result = await request(`/api/exams/${exam.id}/proctoring/live`, { token });
      itemsRef.current = result.items || [];
      setItems(result.items || []);
      if (result.settings) {
        setSettings({ ...defaultSettings, ...result.settings });
        setSettingsLoaded(true);
      } else {
        setSettingsLoaded(true);
      }
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, exam?.id]);

  useEffect(() => { load(); }, [load]);

  // SignalR live updates with a polling fallback (the 6s poll above reconciles
  // anything missed during a reconnect).
  useEffect(() => {
    if (!exam?.id || !token) return undefined;
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API}/hubs/proctoring?examId=${exam.id}&access_token=${encodeURIComponent(token)}`, { withCredentials: false })
      .withAutomaticReconnect()
      .build();
    connection.on('attemptUpdate', (payload) => {
      if (!payload?.submissionId) return;
      itemsRef.current = itemsRef.current.map((item) => (
        item.submissionId === payload.submissionId
          ? {
              ...item,
              proctoringStatus: payload.proctoringStatus ?? item.proctoringStatus,
              status: payload.status ?? item.status,
              exitCount: payload.exitCount ?? item.exitCount,
              unreviewedViolations: payload.violationType
                ? (item.unreviewedViolations || 0) + 1
                : item.unreviewedViolations,
              lastViolationAtUtc: payload.occurredAtUtc || item.lastViolationAtUtc,
              session: payload.totalCopyAttempts !== undefined && item.session
                ? {
                  ...item.session,
                  totalCopyAttempts: payload.totalCopyAttempts,
                  totalPasteAttempts: payload.totalPasteAttempts,
                  totalCutAttempts: payload.totalCutAttempts,
                  totalFullscreenExits: payload.totalFullscreenExits,
                  totalCameraEvents: payload.totalCameraEvents,
                  totalTabSwitches: payload.totalTabSwitches ?? item.session.totalTabSwitches,
                  totalPageExits: payload.totalPageExits ?? item.session.totalPageExits,
                }
                : item.session,
            }
          : item
      ));
      setItems([...itemsRef.current]);
    });
    connection.onreconnected(() => setConnected(true));
    connection.onclose(() => setConnected(false));
    connection.start()
      .then(() => setConnected(true))
      .catch(() => setConnected(false));
    return () => { connection.stop().catch(() => { /* ignore */ }); };
  }, [token, exam?.id]);

  useEffect(() => {
    const poll = window.setInterval(() => load(true), 6000);
    return () => window.clearInterval(poll);
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => item.state === filter);
  }, [items, filter]);

  const needsApprovalCount = items.filter((item) => item.state === 'NeedsApproval').length;

  async function saveSettings() {
    setBusy('settings');
    setError('');
    try {
      const result = await request(`/api/exams/${exam.id}/proctoring-settings`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          ...settings,
          snapshotIntervalSeconds: Number(settings.snapshotIntervalSeconds) || 60,
          maxAllowedExits: Number(settings.maxAllowedExits) || 0,
        }),
      });
      setSettings({ ...defaultSettings, ...result.settings });
      setSettingsOpen(false);
      setNotice('تم حفظ إعدادات المراقبة.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function openDetail(item) {
    setDetail(item);
    setDetailData(null);
    setReason('');
    try {
      const result = await request(`/api/submissions/${item.submissionId}/proctoring`, { token });
      setDetailData(result);
      // Refresh the grid counters (review states may have changed).
      load(true);
    } catch (err) {
      setError(err.message);
      setDetail(null);
    }
  }

  async function runAction(action) {
    if (!detail) return;
    setBusy(action);
    setError('');
    try {
      const result = await request(`/api/submissions/${detail.submissionId}/proctoring/teacher-action`, {
        token,
        method: 'POST',
        body: JSON.stringify({ action, reason: reason.trim() || null }),
      });
      setNotice(result.message || 'تم تنفيذ الإجراء.');
      setConfirm(null);
      setReason('');
      await openDetail(detail);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  function patchSettings(values) {
    setSettings((current) => ({ ...current, ...values }));
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-5 inline-flex min-h-9 items-center gap-1.5 text-[12px] font-bold text-muted transition hover:text-primary"><ArrowLeft size={14} className="rotate-180" />العودة إلى إدارة الامتحان</button>

      <PageHeader
        eyebrow="مراقبة مباشرة"
        title="مراقبة الطلاب أثناء الامتحان"
        description={`${exam.title} · تحديث مباشر للمخالفات وحالات الطلاب`}
        action={
          <>
            {connected ? <span className="hidden items-center gap-1.5 sm:inline-flex"><LiveDot label="بث مباشر" /></span> : <Badge tone="warning">وضع التحديث التلقائي</Badge>}
            <Button variant="secondary" size="sm" icon={ShieldCheck} onClick={() => setSettingsOpen(true)}>إعدادات المراقبة</Button>
          </>
        }
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      {!settings.isEnabled && settingsLoaded ? (
        <Alert tone="info" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>المراقبة غير مفعّلة لهذا الامتحان. فعّلها من «إعدادات المراقبة» لتبدأ تسجيل المخالفات ومتابعة الطلاب لحظة بلحظة.</span>
            <Button size="xs" variant="secondary" onClick={() => setSettingsOpen(true)}>التفعيل</Button>
          </div>
        </Alert>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map(([key, label]) => {
          const count = key === 'all' ? items.length : items.filter((item) => item.state === key).length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-bold transition',
                filter === key ? 'border-primary bg-primary text-white' : 'border-line bg-surface text-muted hover:border-primary/40 hover:text-primary'
              )}
            >
              {label}
              <span className={cn('rounded-full px-1.5 text-[10px]', filter === key ? 'bg-white/20' : 'bg-surface-soft')}>{formatNumber(count)}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid gap-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : !filtered.length ? (
        <Card className="p-6"><EmptyState icon={ShieldCheck} title="لا توجد محاولات مطابقة" description="ستظهر هنا محاولات الطلاب فور بدء الامتحان، مع عدادات المخالفات وحالة كل طالب." /></Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((item) => (
            <Card key={item.submissionId} className={cn('p-4 transition', item.state === 'NeedsApproval' ? 'ring-1 ring-danger/40' : item.state === 'RepeatedViolations' ? 'ring-1 ring-warning/40' : '')}>
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={item.studentName} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-bold text-ink">{item.studentName}</p>
                    <StateChip state={item.state} />
                    {item.cameraOn ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-soft px-2 py-0.5 text-[9.5px] font-bold text-emerald"><Camera size={10} />كاميرا</span> : item.session?.cameraConsentAtUtc ? <span className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2 py-0.5 text-[9.5px] font-bold text-muted"><CameraOff size={10} />بدون كاميرا</span> : null}
                  </div>
                  <p className="mt-0.5 text-[11px] text-subtle">
                    المحاولة {formatNumber(item.attemptNumber)} · بدأت {formatDate(item.startedAtUtc)}
                    {item.status !== 'InProgress' ? ` · ${item.proctoringStatus === 'ForceSubmitted' ? 'تسليم قسري' : item.proctoringStatus === 'Terminated' ? 'منتهية' : 'مكتملة'}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Counter icon={Eye} value={item.exitCount} label="خروج" danger={item.exitCount > item.maxAllowedExits} />
                  <Counter icon={Video} value={item.session?.totalFullscreenExits || 0} label="ملء الشاشة" danger={false} />
                  <Counter icon={MessageSquareWarning} value={item.unreviewedViolations} label="غير مراجع" danger={item.unreviewedViolations > 0} />
                </div>
                <Button variant="secondary" size="sm" onClick={() => openDetail(item)}>التفاصيل</Button>
              </div>
              {item.state === 'NeedsApproval' ? (
                <div className="mt-3 rounded-[11px] border border-danger/20 bg-danger-soft px-3 py-2 text-[11.5px] font-bold text-danger">
                  المحاولة متوقفة بانتظار قرارك — المؤقت متوقف للطالب حتى تسمح بالاستكمال أو تُسلّمها قسراً.
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {/* ------------------------- settings modal ------------------------- */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="إعدادات المراقبة ومنع الغش" description="تُحفظ الإعدادات فوراً وتطبق على المحاولات الجديدة." icon={ShieldCheck} size="lg">
        <div className="grid gap-3">
          <Checkbox label="تفعيل المراقبة لهذا الامتحان" checked={settings.isEnabled} onChange={(event) => patchSettings({ isEnabled: event.target.checked })} />
          <div className="grid gap-2 rounded-[12px] border border-line bg-surface-soft p-3">
            <p className="text-[12px] font-bold text-ink">مغادرة الصفحة</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <Checkbox label="رصد تبديل التبويبات" checked={settings.monitorTabSwitch} onChange={(event) => patchSettings({ monitorTabSwitch: event.target.checked })} />
              <Checkbox label="رصد محاولة مغادرة الصفحة" checked={settings.monitorPageExit} onChange={(event) => patchSettings({ monitorPageExit: event.target.checked })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الحد الأقصى للخروج" id="p-max-exits">
                <Input id="p-max-exits" type="number" min="0" max="50" value={settings.maxAllowedExits} onChange={(event) => patchSettings({ maxAllowedExits: event.target.value })} />
              </Field>
              <Field label="عند تجاوز الحد" id="p-exit-action">
                <Select id="p-exit-action" value={settings.exitAction} onChange={(event) => patchSettings({ exitAction: event.target.value })}>
                  <option value="Allow">تسجيل فقط</option>
                  <option value="Warn">تنبيه الطالب</option>
                  <option value="RequireApproval">إيقاف وانتظار موافقتك</option>
                  <option value="AutoSubmit">تسليم تلقائي</option>
                </Select>
              </Field>
            </div>
          </div>
          <div className="grid gap-2 rounded-[12px] border border-line bg-surface-soft p-3">
            <p className="text-[12px] font-bold text-ink">ملء الشاشة</p>
            <Checkbox label="اشتراط ملء الشاشة" checked={settings.requireFullscreen} onChange={(event) => patchSettings({ requireFullscreen: event.target.checked })} />
            {settings.requireFullscreen ? (
              <Field label="عند الخروج من ملء الشاشة" id="p-fs-action">
                <Select id="p-fs-action" value={settings.fullscreenExitAction} onChange={(event) => patchSettings({ fullscreenExitAction: event.target.value })}>
                  <option value="Allow">تسجيل فقط</option>
                  <option value="Warn">تنبيه الطالب</option>
                  <option value="RequireApproval">إيقاف وانتظار موافقتك</option>
                  <option value="AutoSubmit">تسليم تلقائي</option>
                </Select>
              </Field>
            ) : null}
          </div>
          <div className="grid gap-2 rounded-[12px] border border-line bg-surface-soft p-3">
            <p className="text-[12px] font-bold text-ink">النسخ واللصق</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <Checkbox label="مراقبة النسخ" checked={settings.monitorCopy} onChange={(event) => patchSettings({ monitorCopy: event.target.checked })} />
              <Checkbox label="منع النسخ" checked={settings.preventCopy} onChange={(event) => patchSettings({ preventCopy: event.target.checked })} />
              <Checkbox label="مراقبة اللصق" checked={settings.monitorPaste} onChange={(event) => patchSettings({ monitorPaste: event.target.checked })} />
              <Checkbox label="منع اللصق" checked={settings.preventPaste} onChange={(event) => patchSettings({ preventPaste: event.target.checked })} />
              <Checkbox label="مراقبة القص" checked={settings.monitorCut} onChange={(event) => patchSettings({ monitorCut: event.target.checked })} />
            </div>
          </div>
          <div className="grid gap-2 rounded-[12px] border border-line bg-surface-soft p-3">
            <p className="text-[12px] font-bold text-ink">الكاميرا (بموافقة الطالب)</p>
            <Checkbox label="لقطات دورية بعد موافقة الطالب" checked={settings.enableCamera} onChange={(event) => patchSettings({ enableCamera: event.target.checked })} />
            {settings.enableCamera ? (
              <Field label="الفاصل (ثواني)" id="p-interval">
                <Input id="p-interval" type="number" min="10" max="600" value={settings.snapshotIntervalSeconds} onChange={(event) => patchSettings({ snapshotIntervalSeconds: event.target.value })} />
              </Field>
            ) : null}
          </div>
          <Checkbox label="إيقاف المؤقت أثناء انتظار قرارك" checked={settings.pauseTimerOnTeacherReview} onChange={(event) => patchSettings({ pauseTimerOnTeacherReview: event.target.checked })} />
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <Checkbox label="تنبيه عند أول خروج" checked={settings.warnOnFirstExit} onChange={(event) => patchSettings({ warnOnFirstExit: event.target.checked })} />
            <Checkbox label="تنبيه عند التكرار" checked={settings.warnOnRepeatedExit} onChange={(event) => patchSettings({ warnOnRepeatedExit: event.target.checked })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(false)}>إلغاء</Button>
            <Button size="sm" icon={CheckCircle2} loading={busy === 'settings'} onClick={saveSettings}>حفظ الإعدادات</Button>
          </div>
        </div>
      </Modal>

      {/* ------------------------- detail drawer ------------------------- */}
      <Modal open={Boolean(detail)} onClose={() => { setDetail(null); setDetailData(null); }} title={detail ? `مراقبة ${detail.studentName}` : ''} description="الجدول الزمني للمخالفات ولقطات الكاميرا وقراراتك السابقة." icon={UserRound} size="lg">
        {!detailData ? (
          <div className="grid place-items-center gap-2 py-8 text-muted"><LoaderCircle size={22} className="animate-spin" /><span className="text-[12px]">جارٍ تحميل التفاصيل...</span></div>
        ) : (
          <DetailContent
            token={token}
            item={detail}
            data={detailData}
            reason={reason}
            setReason={setReason}
            busy={busy}
            onConfirm={setConfirm}
          />
        )}
      </Modal>

      {/* ------------------------- action confirmation ------------------------- */}
      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title}
        description={confirm?.description}
        icon={confirm?.danger ? ShieldAlert : ShieldCheck}
        tone={confirm?.danger ? 'danger' : 'primary'}
        footer={(
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>تراجع</Button>
            <Button size="sm" variant={confirm?.danger ? 'danger' : 'primary'} icon={confirm?.icon} loading={busy === confirm?.action} onClick={() => runAction(confirm.action)}>تأكيد</Button>
          </div>
        )}
      >
        <Field label="سبب القرار (يظهر في سجل المحاولة)" id="action-reason">
          <Textarea id="action-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="مثال: خرج الطالب 4 مرات رغم التنبيه..." className="min-h-20" maxLength={500} />
        </Field>
      </Modal>
    </div>
  );
}

function StateChip({ state }) {
  const map = {
    Normal: ['سليم', 'emerald'],
    Warning: ['تنبيهات', 'warning'],
    NeedsApproval: ['بانتظار موافقتك', 'danger'],
    RepeatedViolations: ['مخالفات متكررة', 'danger'],
  };
  const [label, tone] = map[state] || [state, 'primary'];
  return <Badge tone={tone}>{label}</Badge>;
}

function Counter({ icon: Icon, value, label, danger }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold', danger ? 'border-danger/25 bg-danger-soft text-danger' : 'border-line bg-surface-soft text-muted')}>
      <Icon size={11} />
      <span className="ui-number">{formatNumber(value || 0)}</span>
      {label}
    </span>
  );
}

function DetailContent({ token, item, data, reason, setReason, busy, onConfirm }) {
  const [images, setImages] = useState({});

  useEffect(() => {
    // Snapshot files live in private storage; fetch them with the auth token and
    // render from object URLs so the browser never exposes them as static assets.
    let cancelled = false;
    const urls = {};
    (async () => {
      for (const snapshot of data.snapshots || []) {
        try {
          const response = await fetch(`${API}/api/submissions/${item.submissionId}/proctoring/snapshots/${snapshot.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok) continue;
          const blob = await response.blob();
          if (!cancelled) urls[snapshot.id] = URL.createObjectURL(blob);
        } catch { /* leave placeholder */ }
      }
      if (!cancelled) setImages(urls);
    })();
    return () => {
      cancelled = true;
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [token, item.submissionId, data.snapshots]);

  const counts = data.session || {};
  const isPaused = data.proctoringStatus === 'PausedForTeacherReview';
  const inProgress = data.submissionStatus === 'InProgress';

  return (
    <div className="grid max-h-[65vh] gap-4 overflow-y-auto pe-1">
      <div className="flex flex-wrap items-center gap-2">
        <StateChip state={item.state} />
        <StatusChip status={data.submissionStatus} />
        {data.isPaused || isPaused ? <Badge tone="warning">المؤقت متوقف</Badge> : null}
        <span className="text-[11px] text-subtle">زمن التوقف المسترد: {formatTimer(data.pausedSeconds || 0)}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ['خروج من الصفحة', (counts.totalTabSwitches || 0) + (counts.totalPageExits || 0)],
          ['ملء الشاشة', counts.totalFullscreenExits || 0],
          ['نسخ / لصق / قص', `${counts.totalCopyAttempts || 0} / ${counts.totalPasteAttempts || 0} / ${counts.totalCutAttempts || 0}`],
          ['محاولات التصوير', counts.totalCameraEvents || 0],
          ['لقطات الكاميرا', (data.snapshots || []).length],
          ['إجمالي المخالفات', (data.violations || []).length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[11px] border border-line bg-surface-soft p-2.5 text-center">
            <p className="text-[9.5px] font-bold text-muted">{label}</p>
            <p className="ui-number mt-1 text-[14px] font-bold text-ink">{value}</p>
          </div>
        ))}
      </div>

      {inProgress ? (
        <div className="grid gap-2 rounded-[12px] border border-line bg-surface-soft p-3">
          <p className="text-[12px] font-bold text-ink">إجراءات</p>
          {isPaused ? (
            <div className="flex flex-wrap gap-2">
              <ActionButton icon={Play} label="السماح بالاستكمال" busy={busy} action="AllowContinue" onConfirm={onConfirm} confirm={{ title: 'السماح باستكمال المحاولة', description: 'سيُستأنف مؤقت الطالب ويُضاف زمن الانتظار إلى مدته. ستُعلَّم المخالفات كمراجعَة بقرارك.', action: 'AllowContinue', icon: Play }} />
              <ActionButton icon={Send} label="تسليم قسري" busy={busy} action="ForceSubmit" danger onConfirm={onConfirm} confirm={{ title: 'تسليم المحاولة قسراً', description: 'ستُصحَّح إجابات الطالب الحالية وتُغلق المحاولة فوراً. لا يمكن التراجع.', action: 'ForceSubmit', icon: Send, danger: true }} />
              <ActionButton icon={Square} label="إنهاء المحاولة" busy={busy} action="Terminate" danger onConfirm={onConfirm} confirm={{ title: 'إنهاء المحاولة', description: 'تُغلق المحاولة دون احتساب درجة، وتبقى إجابات الطالب محفوظة للمراجعة. لا يمكن التراجع.', action: 'Terminate', icon: Square, danger: true }} />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <ActionButton icon={MessageSquareWarning} label="تنبيه الطالب" busy={busy} action="Warn" onConfirm={onConfirm} confirm={{ title: 'تنبيه الطالب', description: 'سيظهر تنبيه فوري على شاشة الطالب يطلب منه التركيز وعدم تكرار المخالفات.', action: 'Warn', icon: MessageSquareWarning }} />
              <ActionButton icon={StickyNote} label="إضافة ملاحظة" busy={busy} action="Note" onConfirm={onConfirm} confirm={{ title: 'إضافة ملاحظة', description: 'ملاحظة داخلية تُسجَّل في سجل المحاولة دون إشعار الطالب.', action: 'Note', icon: StickyNote }} />
              <ActionButton icon={Send} label="تسليم قسري" busy={busy} action="ForceSubmit" danger onConfirm={onConfirm} confirm={{ title: 'تسليم المحاولة قسراً', description: 'ستُصحَّح إجابات الطالب الحالية وتُغلق المحاولة فوراً. لا يمكن التراجع.', action: 'ForceSubmit', icon: Send, danger: true }} />
              <ActionButton icon={Square} label="إنهاء المحاولة" busy={busy} action="Terminate" danger onConfirm={onConfirm} confirm={{ title: 'إنهاء المحاولة', description: 'تُغلق المحاولة دون احتساب درجة، وتبقى إجابات الطالب محفوظة للمراجعة. لا يمكن التراجع.', action: 'Terminate', icon: Square, danger: true }} />
            </div>
          )}
        </div>
      ) : null}

      <div className="grid gap-2">
        <p className="text-[12px] font-bold text-ink">الجدول الزمني للمخالفات</p>
        {!data.violations?.length ? (
          <p className="rounded-[11px] border border-line bg-surface-soft p-3 text-[11.5px] text-subtle">لا توجد مخالفات مسجلة في هذه المحاولة.</p>
        ) : (
          <div className="grid gap-1.5">
            {data.violations.map((violation) => (
              <div key={violation.id} className={cn('flex items-start gap-2.5 rounded-[11px] border p-2.5', violation.isReviewed ? 'border-line bg-surface-soft opacity-75' : 'border-warning/25 bg-warning-soft/50')}>
                <Badge tone={severityTone[violation.severity] || 'primary'}>{violationLabels[violation.violationType] || violation.violationType}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] leading-5 text-ink">{violation.description}</p>
                  <p className="mt-0.5 text-[10px] text-subtle">
                    {formatDate(violation.occurredAtUtc)}
                    {violation.teacherNotes ? ` · قرار المدرس: ${violation.teacherNotes}` : ''}
                  </p>
                </div>
                {violation.isReviewed ? <CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald" /> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {(data.snapshots || []).length ? (
        <div className="grid gap-2">
          <p className="text-[12px] font-bold text-ink">لقطات الكاميرا</p>
          <div className="grid grid-cols-3 gap-2">
            {data.snapshots.map((snapshot) => (
              <figure key={snapshot.id} className="overflow-hidden rounded-[11px] border border-line bg-surface-soft">
                {images[snapshot.id]
                  ? <img src={images[snapshot.id]} alt={`لقطة ${formatDate(snapshot.capturedAtUtc)}`} className="aspect-[4/3] w-full object-cover" />
                  : <div className="grid aspect-[4/3] w-full place-items-center text-subtle"><Camera size={16} /></div>}
                <figcaption className="p-1.5 text-[9px] text-subtle">{formatDate(snapshot.capturedAtUtc)}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : null}

      {(data.actions || []).length ? (
        <div className="grid gap-1.5">
          <p className="text-[12px] font-bold text-ink">قراراتك السابقة</p>
          {data.actions.map((action) => (
            <div key={action.id} className="flex items-start justify-between gap-2 rounded-[11px] border border-line bg-surface-soft p-2.5">
              <div>
                <p className="text-[11.5px] font-bold text-ink">{actionLabel(action.actionType)}</p>
                {action.reason ? <p className="mt-0.5 text-[10.5px] text-muted">{action.reason}</p> : null}
              </div>
              <span className="text-[10px] text-subtle">{formatDate(action.createdAtUtc)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({ icon, label, action, danger, busy, onConfirm, confirm }) {
  return (
    <Button
      variant={danger ? 'danger' : 'secondary'}
      size="xs"
      icon={icon}
      loading={busy === action}
      onClick={() => onConfirm(confirm)}
    >
      {label}
    </Button>
  );
}
