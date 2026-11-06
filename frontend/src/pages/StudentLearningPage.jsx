import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, CalendarDays, CheckCircle2, ClipboardList, Clock3, ExternalLink, GraduationCap,
  MapPin, MessageCircle, QrCode, RefreshCw, Send, UserRound, Video, XCircle,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader,
  Segmented, Skeleton, StatCard, Textarea, cn,
} from '../components/ui';
import { request } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';

const tabs = [
  { value: 'groups', label: 'مجموعاتي' },
  { value: 'schedule', label: 'جدولي' },
  { value: 'attendance', label: 'حضوري' },
  { value: 'homework', label: 'الواجبات' },
];

const attendanceLabels = { Present: 'حاضر', Absent: 'غائب', Late: 'متأخر', Excused: 'بعذر' };
const attendanceTones = { Present: 'success', Absent: 'danger', Late: 'warning', Excused: 'neutral' };
const sessionLabels = { Scheduled: 'مجدولة', Waiting: 'بانتظار البدء', InProgress: 'جارية', Live: 'مباشر', Completed: 'منتهية', Cancelled: 'ملغاة' };
const deliveryLabels = { Online: 'أونلاين', Offline: 'حضوري', Hybrid: 'مدمج' };

function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export default function StudentLearningPage({ token, onOpenChat }) {
  const [tab, setTab] = useState('groups');
  const [groups, setGroups] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [attendance, setAttendance] = useState({ totals: {}, items: [] });
  const [homework, setHomework] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [sessionFilter, setSessionFilter] = useState('upcoming');
  const [submitTarget, setSubmitTarget] = useState(null);
  const [answer, setAnswer] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [modalError, setModalError] = useState('');

  const flash = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3400);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [groupData, sessionData, attendanceData, homeworkData] = await Promise.all([
        request('/api/teaching/my/groups', { token }),
        request(`/api/teaching/my/sessions?from=${isoDaysFromNow(-14)}&to=${isoDaysFromNow(60)}`, { token }),
        request('/api/teaching/my/attendance', { token }),
        request('/api/teaching/my/homework', { token }),
      ]);
      setGroups(groupData?.items || []);
      setSessions(sessionData?.items || []);
      const rawTotals = attendanceData?.totals || {};
      setAttendance({
        totals: {
          Present: rawTotals.present || 0, Late: rawTotals.late || 0,
          Absent: rawTotals.absent || 0, Excused: rawTotals.excused || 0,
        },
        items: attendanceData?.items || [],
      });
      setHomework(homeworkData?.items || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return sessions.filter((item) => new Date(item.endsAtUtc || item.startsAtUtc).getTime() >= now && item.status !== 'Cancelled');
  }, [sessions]);
  const past = useMemo(() => {
    const now = Date.now();
    return sessions.filter((item) => new Date(item.endsAtUtc || item.startsAtUtc).getTime() < now || item.status === 'Cancelled').reverse();
  }, [sessions]);
  const shownSessions = sessionFilter === 'upcoming' ? upcoming : past;

  const pendingHomework = homework.filter((item) => !item.submission || item.submission.status === 'Submitted' || item.submission.status === 'Late');
  const totals = attendance.totals || {};
  const attendanceRate = useMemo(() => {
    const total = (totals.Present || 0) + (totals.Late || 0) + (totals.Absent || 0) + (totals.Excused || 0);
    if (!total) return 0;
    return Math.round(((totals.Present || 0) + (totals.Late || 0)) / total * 100);
  }, [totals]);

  async function submitHomework() {
    setModalError('');
    if (!answer.trim() && !attachmentUrl.trim()) return setModalError('اكتب إجابتك أو أضف رابط مرفق.');
    setBusy('homework');
    try {
      await request(`/api/teaching/homework/${submitTarget.id}/submit`, {
        token, method: 'POST',
        body: JSON.stringify({ answerText: answer || null, attachmentUrl: attachmentUrl || null }),
      });
      setSubmitTarget(null);
      setAnswer('');
      setAttachmentUrl('');
      flash('تم تسليم الواجب وإشعار المعلم.');
      await load();
    } catch (err) { setModalError(err.message); } finally { setBusy(''); }
  }

  async function redeemQr() {
    setModalError('');
    if (!qrToken.trim()) return setModalError('الصق رمز الحضور.');
    setBusy('qr');
    try {
      const result = await request('/api/teaching/attendance/qr', {
        token, method: 'POST', body: JSON.stringify({ token: qrToken.trim() }),
      });
      setQrOpen(false);
      setQrToken('');
      flash(`تم تسجيل حضورك (${attendanceLabels[result?.status] || result?.status}) — ${result?.sessionTitle || ''}`);
      await load();
    } catch (err) { setModalError(err.message); } finally { setBusy(''); }
  }

  function openHomework(item) {
    setSubmitTarget(item);
    setAnswer(item.submission?.answerText || '');
    setAttachmentUrl('');
    setModalError('');
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="تعلّمي"
        title="مجموعاتي وحصصي"
        description="تابع جدول حصصك، سجّل حضورك، وسلّم واجباتك — كل شيء في مكان واحد."
        action={<div className="flex flex-wrap gap-2">
          <Button variant="soft" size="sm" icon={QrCode} onClick={() => { setQrOpen(true); setModalError(''); }}>تسجيل حضور QR</Button>
          <Button variant="soft" size="sm" icon={RefreshCw} onClick={load} loading={loading}>تحديث</Button>
        </div>}
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BookOpen} label="مجموعاتي" value={formatNumber(groups.length)} note="مجموعات نشطة" tone="primary" />
        <StatCard icon={CalendarDays} label="حصص قادمة" value={formatNumber(upcoming.length)} note={upcoming[0] ? formatDate(upcoming[0].startsAtUtc) : 'لا توجد قادمة'} tone="blue" />
        <StatCard icon={CheckCircle2} label="نسبة الحضور" value={`${formatNumber(attendanceRate)}%`} note={`${formatNumber(totals.Present || 0)} حاضر · ${formatNumber(totals.Absent || 0)} غائب`} tone={attendanceRate >= 75 ? 'emerald' : 'warning'} />
        <StatCard icon={ClipboardList} label="واجبات معلقة" value={formatNumber(pendingHomework.length)} note={`${formatNumber(homework.length)} واجب إجمالاً`} tone={pendingHomework.length ? 'warning' : 'emerald'} />
      </div>

      <Card className="p-2">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((item) => (
            <button key={item.value} type="button" onClick={() => setTab(item.value)}
              className={cn('shrink-0 rounded-[10px] px-3.5 py-2 text-[12.5px] font-bold transition', tab === item.value ? 'bg-primary text-white shadow-sm' : 'text-muted hover:bg-surface-soft hover:text-ink')}>
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      {loading ? <Card className="p-4"><Skeleton className="h-40 w-full" /></Card> : null}

      {!loading && tab === 'groups' ? (
        groups.length === 0 ? <Card><EmptyState icon={BookOpen} title="لا توجد مجموعات" description="اطلب الانضمام لمعلم من صفحة المعلمين لتظهر مجموعاتك." /></Card> : (
          <div className="grid gap-3 md:grid-cols-2">
            {groups.map((group) => (
              <Card key={group.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Badge tone="neutral">{deliveryLabels[group.deliveryMode] || group.deliveryMode}</Badge>
                    <h3 className="mt-1.5 font-display text-[15px] font-semibold text-ink">{group.name}</h3>
                    <p className="mt-0.5 text-[11.5px] text-muted">{group.subject || '—'}{group.grade ? ` · ${group.grade}` : ''}</p>
                  </div>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><GraduationCap size={18} /></span>
                </div>
                <div className="mt-3 grid gap-1.5 text-[11.5px] text-muted">
                  <p className="flex items-center gap-1.5"><UserRound size={12} />{group.teacherName || 'المعلم'}</p>
                  {group.nextSessionAtUtc ? <p className="flex items-center gap-1.5 text-primary"><Clock3 size={12} />الحصة القادمة: {formatDate(group.nextSessionAtUtc)}</p> : <p className="flex items-center gap-1.5"><XCircle size={12} />لا توجد حصة قادمة</p>}
                  {group.deliveryMode !== 'Online' && group.location ? <p className="flex items-center gap-1.5"><MapPin size={12} />{group.location}</p> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {group.onlineLink ? <a href={group.onlineLink} target="_blank" rel="noreferrer"><Button size="xs" variant="soft" icon={Video}>دخول الحصة</Button></a> : null}
                  {group.chatConversationId && onOpenChat ? <Button size="xs" variant="soft" icon={MessageCircle} onClick={() => onOpenChat(group.chatConversationId)}>محادثة المجموعة</Button> : null}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : null}

      {!loading && tab === 'schedule' ? (
        <div className="grid gap-4">
          <Segmented options={[{ value: 'upcoming', label: 'القادمة' }, { value: 'past', label: 'السابقة' }]} value={sessionFilter} onChange={setSessionFilter} ariaLabel="فلتر الحصص" />
          {shownSessions.length === 0 ? <Card><EmptyState icon={CalendarDays} title="لا توجد حصص" description="ستظهر هنا الحصص المجدولة من معلمك." /></Card> : (
            <div className="grid gap-2">
              {shownSessions.map((session) => (
                <Card key={session.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={session.status === 'Live' || session.status === 'InProgress' ? 'success' : session.status === 'Cancelled' ? 'danger' : 'neutral'}>
                          {sessionLabels[session.displayStatus || session.status] || session.status}
                        </Badge>
                        <Badge tone="neutral">{deliveryLabels[session.deliveryMode] || session.deliveryMode}</Badge>
                        {session.myAttendance ? <Badge tone={attendanceTones[session.myAttendance] || 'neutral'}>{attendanceLabels[session.myAttendance] || session.myAttendance}</Badge> : null}
                      </div>
                      <h3 className="mt-1.5 text-[13.5px] font-bold text-ink">{session.title || session.groupName}</h3>
                      <p className="mt-0.5 text-[11.5px] text-muted">{session.groupName} · {formatDate(session.startsAtUtc)}</p>
                      {session.location ? <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted"><MapPin size={11} />{session.location}</p> : null}
                    </div>
                    {session.deliveryMode !== 'Offline' && session.onlineLink && session.status !== 'Cancelled' ? (
                      <a href={session.onlineLink} target="_blank" rel="noreferrer"><Button size="sm" icon={ExternalLink}>دخول</Button></a>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {!loading && tab === 'attendance' ? (
        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-4">
            {['Present', 'Late', 'Absent', 'Excused'].map((status) => (
              <Card key={status} className="flex items-center justify-between p-3">
                <span className="text-[11.5px] font-bold text-muted">{attendanceLabels[status]}</span>
                <span className={cn('text-[16px] font-extrabold', status === 'Present' ? 'text-emerald' : status === 'Absent' ? 'text-danger' : status === 'Late' ? 'text-warning' : 'text-ink')}>{formatNumber(totals[status] || 0)}</span>
              </Card>
            ))}
          </div>
          {attendance.items.length === 0 ? <Card><EmptyState icon={CheckCircle2} title="لا يوجد سجل حضور" description="سيظهر سجلك بعد أول حصة." /></Card> : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-start text-[12px]">
                <thead className="bg-surface-soft text-[11px] font-extrabold text-muted">
                  <tr>
                    <th className="px-4 py-3 text-start">الحصة</th>
                    <th className="px-4 py-3 text-start">المجموعة</th>
                    <th className="px-4 py-3 text-start">التاريخ</th>
                    <th className="px-4 py-3 text-start">الحالة</th>
                    <th className="px-4 py-3 text-start">ملاحظة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {attendance.items.map((row, index) => (
                    <tr key={`${row.sessionId}-${index}`}>
                      <td className="px-4 py-2.5 font-bold text-ink">{row.sessionTitle || 'حصة'}</td>
                      <td className="px-4 py-2.5 text-muted">{row.groupName || '—'}</td>
                      <td className="px-4 py-2.5 text-muted">{formatDate(row.startsAtUtc)}</td>
                      <td className="px-4 py-2.5"><Badge tone={attendanceTones[row.status] || 'neutral'}>{attendanceLabels[row.status] || row.status}</Badge></td>
                      <td className="px-4 py-2.5 text-muted">{row.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      ) : null}

      {!loading && tab === 'homework' ? (
        homework.length === 0 ? <Card><EmptyState icon={ClipboardList} title="لا توجد واجبات" description="ستظهر واجبات مجموعاتك وكورساتك هنا." /></Card> : (
          <div className="grid gap-3 md:grid-cols-2">
            {homework.map((item) => {
              const submission = item.submission;
              const reviewed = submission?.status === 'Reviewed';
              return (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-[13.5px] font-bold text-ink">{item.title}</h3>
                      <p className="mt-1 line-clamp-3 text-[11.5px] leading-6 text-muted">{item.prompt || '—'}</p>
                    </div>
                    {reviewed ? <Badge tone="success">مصحح</Badge> : submission ? <Badge tone="info">مُسلّم</Badge> : item.isOverdue ? <Badge tone="danger">متأخر</Badge> : <Badge tone="warning">مطلوب</Badge>}
                  </div>
                  <p className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-muted">
                    <span className="inline-flex items-center gap-1"><Clock3 size={11} />{item.dueAtUtc ? `التسليم ${formatDate(item.dueAtUtc)}` : 'بدون موعد'}</span>
                    <span>{formatNumber(item.maxPoints)} درجة</span>
                  </p>
                  {reviewed ? (
                    <div className="mt-3 rounded-xl border border-emerald/20 bg-emerald-soft/60 p-3 text-[11.5px]">
                      <p className="font-extrabold text-emerald">درجتك: {formatNumber(submission.grade)} / {formatNumber(item.maxPoints)}</p>
                      {submission.feedback ? <p className="mt-1 leading-6 text-ink/80">{submission.feedback}</p> : null}
                    </div>
                  ) : null}
                  {!reviewed && item.canStillSubmit !== false ? (
                    <div className="mt-3"><Button size="xs" icon={Send} onClick={() => openHomework(item)}>{submission ? 'تعديل التسليم' : 'تسليم الواجب'}</Button></div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )
      ) : null}

      {submitTarget ? (
        <Modal open onClose={() => setSubmitTarget(null)} icon={ClipboardList} title={`تسليم: ${submitTarget.title}`} description="يمكنك تعديل الإجابة حتى يتم تصحيحها."
          footer={<><Button variant="ghost" onClick={() => setSubmitTarget(null)}>إلغاء</Button><Button loading={busy === 'homework'} onClick={submitHomework}>تسليم</Button></>}>
          <div className="grid gap-4">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <Field label="إجابتك"><Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} className="min-h-32" maxLength={8000} /></Field>
            <Field label="رابط مرفق (اختياري)" hint="ارفع الملف على مساحة تخزين آمنة وضع الرابط هنا."><Input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} dir="ltr" placeholder="https://..." /></Field>
          </div>
        </Modal>
      ) : null}

      {qrOpen ? (
        <Modal open onClose={() => setQrOpen(false)} icon={QrCode} title="تسجيل الحضور" description="الصق رمز الحضور الذي يظهر في الحصة."
          footer={<><Button variant="ghost" onClick={() => setQrOpen(false)}>إلغاء</Button><Button loading={busy === 'qr'} onClick={redeemQr}>تسجيل</Button></>}>
          <div className="grid gap-3">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <Field label="رمز الحضور"><Input value={qrToken} onChange={(e) => setQrToken(e.target.value)} dir="ltr" placeholder="QR token" /></Field>
            <Alert tone="info">يُقبل الرمز أثناء الحصة فقط وينتهي تلقائياً بعد دقائق.</Alert>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
