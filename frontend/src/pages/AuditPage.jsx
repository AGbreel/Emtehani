import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  ListFilter,
  MousePointerClick,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  cn,
} from '../components/ui';
import { request } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';

const actionMeta = {
  'exam.created': { label: 'إنشاء امتحان', icon: FileText, tone: 'primary' },
  'exam.published': { label: 'نشر امتحان', icon: Radio, tone: 'blue' },
  'exam.unpublished': { label: 'إلغاء نشر', icon: XCircle, tone: 'warning' },
  'exam.opened': { label: 'فتح جلسة', icon: Radio, tone: 'emerald' },
  'exam.paused': { label: 'إيقاف مؤقت', icon: MousePointerClick, tone: 'warning' },
  'exam.resumed': { label: 'استئناف جلسة', icon: Activity, tone: 'emerald' },
  'exam.closed': { label: 'إنهاء جلسة', icon: CheckCircle2, tone: 'neutral' },
  'submission.started': { label: 'بدء محاولة', icon: UserCheck, tone: 'blue' },
  'submission.submitted': { label: 'تسليم محاولة', icon: CheckCircle2, tone: 'emerald' },
  'essay.graded': { label: 'تصحيح مقالي', icon: ClipboardCheck, tone: 'warning' },
  'results.exported': { label: 'تصدير نتائج', icon: Download, tone: 'neutral' },
  'submission.extra-attempt-granted': { label: 'منح محاولة إضافية', icon: RefreshCw, tone: 'warning' },
};

function metaFor(action) {
  if (actionMeta[action]) return actionMeta[action];
  if (action?.startsWith('exam.event.')) return { label: 'حدث مراقبة', icon: ShieldCheck, tone: 'warning' };
  return { label: action || 'نشاط', icon: Activity, tone: 'neutral' };
}

const tones = {
  primary: 'bg-primary-soft text-primary',
  blue: 'bg-blue-soft text-blue',
  emerald: 'bg-emerald-soft text-emerald',
  warning: 'bg-warning-soft text-warning',
  neutral: 'bg-surface-soft text-muted',
};

export default function AuditPage({ token }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const result = await request(`/api/audit?page=${page}&pageSize=${pageSize}`, { token });
      setItems(result.items || []);
      setTotal(result.total || 0);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((item) => {
    if (!search.trim()) return true;
    const needle = search.trim();
    const meta = metaFor(item.action);
    return meta.label.includes(needle) || item.action?.includes(needle) || item.details?.includes(needle) || item.entityType?.includes(needle);
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <PageHeader
        eyebrow="تتبع العمليات"
        title="سجل النشاط"
        description="سجل زمني لكل إجراء مهم: النشر، فتح الجلسات، التسليمات، والتصحيح."
        action={<Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Activity} label="إجمالي الأحداث" value={formatNumber(total)} note="في سجل حسابك" loading={loading} />
        <StatCard icon={Radio} label="جلسات مفتوحة" value={formatNumber(items.filter((item) => item.action === 'exam.opened').length)} note="ضمن الصفحة الحالية" tone="emerald" loading={loading} />
        <StatCard icon={CheckCircle2} label="تسليمات" value={formatNumber(items.filter((item) => item.action === 'submission.submitted').length)} note="ضمن الصفحة الحالية" tone="blue" loading={loading} />
        <StatCard icon={ClipboardCheck} label="تصحيحات" value={formatNumber(items.filter((item) => item.action === 'essay.graded').length)} note="ضمن الصفحة الحالية" tone="warning" loading={loading} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-display text-[15px] font-semibold text-ink">الأحداث</h2><p className="mt-1 text-[11.5px] text-muted">مرتبة من الأحدث إلى الأقدم.</p></div>
          <div className="relative w-full sm:max-w-[260px]">
            <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث في السجل..." className="h-10 w-full rounded-[9px] border border-line bg-surface-soft pr-8 pl-3 text-[12.5px] outline-none focus:border-primary focus:bg-surface" />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={ListFilter} title={search ? 'لا توجد أحداث مطابقة' : 'السجل فارغ حتى الآن'} description={search ? 'جرّب كلمة بحث أخرى.' : 'ستظهر هنا العمليات التي تنفذها داخل المنصة.'} action={search ? <Button variant="secondary" size="sm" onClick={() => setSearch('')}>مسح البحث</Button> : null} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[780px] text-right">
                <thead><tr className="border-b border-line bg-surface-soft/60 text-[11px] font-extrabold text-muted"><th className="px-5 py-3">الحدث</th><th className="px-3 py-3">النوع</th><th className="px-3 py-3">التفاصيل</th><th className="px-5 py-3">الوقت</th></tr></thead>
                <tbody>
                  {filtered.map((item) => {
                    const meta = metaFor(item.action);
                    const Icon = meta.icon;
                    return (
                      <tr key={item.id} className="border-b border-line/70 last:border-0 hover:bg-surface-soft/50">
                        <td className="px-5 py-3.5"><div className="flex items-center gap-2.5"><span className={cn('grid size-8 place-items-center rounded-[9px]', tones[meta.tone])}><Icon size={14} /></span><div><p className="text-[12.5px] font-bold text-ink">{meta.label}</p><p className="ui-ltr text-[10px] text-subtle">{item.action}</p></div></div></td>
                        <td className="px-3 py-3.5"><Badge tone="neutral">{item.entityType || '—'}</Badge></td>
                        <td className="max-w-[220px] px-3 py-3.5"><p className="truncate text-[11px] text-muted" title={item.details || ''}>{item.details || '—'}</p></td>
                        <td className="px-5 py-3.5 text-[11px] text-muted">{formatDate(item.atUtc)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 p-3 md:hidden">
              {filtered.map((item) => {
                const meta = metaFor(item.action);
                const Icon = meta.icon;
                return (
                  <div key={item.id} className="flex items-start gap-2.5 rounded-[12px] border border-line bg-surface-soft/50 p-3">
                    <span className={cn('grid size-8 shrink-0 place-items-center rounded-[9px]', tones[meta.tone])}><Icon size={14} /></span>
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-1"><p className="text-[12.5px] font-bold text-ink">{meta.label}</p><Badge tone="neutral">{item.entityType || '—'}</Badge></div><p className="mt-1 truncate text-[10px] text-subtle" dir="ltr">{item.action}</p>{item.details ? <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">{item.details}</p> : null}<p className="mt-1 text-[10.5px] text-muted">{formatDate(item.atUtc)}</p></div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!loading && totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-line px-4 py-3">
            <p className="text-[11px] text-muted">صفحة {formatNumber(page)} من {formatNumber(totalPages)}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="xs" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>السابق</Button>
              <Button variant="secondary" size="xs" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>التالي</Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
