import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FileText,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  PageHeader,
  StatusChip,
  TableSkeleton,
  cn,
} from '../components/ui';
import { request } from '../lib/api';
import { downloadBlob, formatDate, formatDuration, formatNumber } from '../lib/format';

const tabs = [
  { value: 'All', label: 'الكل' },
  { value: 'Draft', label: 'مسودات' },
  { value: 'Scheduled', label: 'مجدولة' },
  { value: 'Waiting', label: 'بانتظار البدء' },
  { value: 'Active', label: 'نشطة' },
  { value: 'Paused', label: 'متوقفة' },
  { value: 'Finished', label: 'منتهية' },
];

export default function ExamsPage({ token, onOpenExam, onCreate }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => { setPage(1); }, [debounced, status]);

  const load = useCallback(async (background = false) => {
    const current = ++seq.current;
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (debounced) params.set('search', debounced);
      if (status !== 'All') params.set('status', status);
      const result = await request(`/api/exams?${params}`, { token });
      if (current !== seq.current) return;
      setItems(result.items || []);
      setTotal(result.total || 0);
      setError('');
    } catch (err) {
      if (current === seq.current) setError(err.message);
    } finally {
      if (current === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token, page, pageSize, debounced, status]);

  useEffect(() => { load(); }, [load]);

  async function togglePublish(exam) {
    setBusyId(exam.id);
    setError('');
    setNotice('');
    try {
      const result = await request(`/api/exams/${exam.id}/publish`, { token, method: 'PUT' });
      setItems((current) => current.map((item) => item.id === exam.id ? { ...item, isPublished: result.isPublished, status: result.status } : item));
      setNotice(result.isPublished ? 'تم نشر الامتحان. سيظهر للطلاب المؤهلين في مرحلته وصفه، وافتح الجلسة في وقتها.' : 'تم إلغاء نشر الامتحان وإعادته للمسودات.');
      load(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  async function exportExam(exam) {
    setBusyId(exam.id);
    setError('');
    try {
      const blob = await request(`/api/exams/${exam.id}/export`, { token });
      downloadBlob(blob, `${exam.title.replace(/[\\/:*?"<>|]/g, '-')}-results.csv`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <PageHeader
        eyebrow="إدارة المحتوى"
        title="الامتحانات"
        description="أنشئ الامتحانات وأدر النشر والجلسات. الجلسات لا تفتح تلقائياً، ويظهر الامتحان للطلاب المسجلين المطابقين لمرحلته وصفه."
        action={
          <>
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>
            <Button size="sm" icon={Plus} onClick={onCreate}>امتحان جديد</Button>
          </>
        }
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <Card className="overflow-hidden">
        <div className="border-b border-line p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث باسم الامتحان..."
                className="h-11 w-full rounded-[11px] border border-line bg-surface-soft pr-9 pl-3 text-[13px] text-ink outline-none transition placeholder:text-subtle focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary-soft"
              />
            </div>
            <div className="flex items-center gap-2 text-[11.5px] text-muted">
              <Filter size={13} />
              <span>{formatNumber(total)} امتحان</span>
              {status !== 'All' ? <Badge tone="primary">{tabs.find((tab) => tab.value === status)?.label}</Badge> : null}
            </div>
          </div>

          <div className="ui-scrollbar-hidden mt-3 flex gap-1 overflow-x-auto pb-0.5">
            {tabs.map((tab) => (
              <button key={tab.value} type="button" onClick={() => setStatus(tab.value)} className={cn('min-h-9 shrink-0 rounded-[9px] px-3 py-1.5 text-[11.5px] font-bold transition', status === tab.value ? 'bg-primary text-white' : 'bg-surface-soft text-muted hover:text-ink')}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? <TableSkeleton rows={6} /> : items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={debounced || status !== 'All' ? 'لا توجد نتائج مطابقة' : 'ابدأ أول امتحان لك'}
            description={debounced || status !== 'All' ? 'جرّب تغيير كلمة البحث أو الفلتر لعرض امتحانات أخرى.' : 'أنشئ امتحاناً، أضف الأسئلة، ثم انشره وافتح الجلسة.'}
            action={debounced || status !== 'All' ? <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setStatus('All'); }}>مسح الفلاتر</Button> : <Button size="sm" icon={FilePlus2} onClick={onCreate}>إنشاء امتحان</Button>}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-right">
                <thead>
                  <tr className="border-b border-line bg-surface-soft/60 text-[11px] font-extrabold text-muted">
                    <th className="px-3 py-3">الامتحان</th>
                    <th className="px-3 py-3">الحالة</th>
                    <th className="px-3 py-3">الأسئلة</th>
                    <th className="px-3 py-3">الطلاب</th>
                    <th className="px-3 py-3">المدة</th>
                    <th className="px-5 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((exam) => (
                    <tr key={exam.id} className="border-b border-line/70 transition last:border-0 hover:bg-surface-soft/50">
                      <td className="px-5 py-3.5">
                        <button type="button" onClick={() => onOpenExam(exam)} className="text-right">
                          <p className="max-w-[250px] truncate text-[13px] font-bold text-ink transition hover:text-primary">{exam.title}</p>
                          <p className="mt-0.5 text-[10.5px] text-subtle">{formatDate(exam.createdAtUtc)}</p>
                        </button>
                      </td>
                      <td className="px-3 py-3.5"><StatusChip status={exam.status} /></td>
                      <td className="px-3 py-3.5 text-[12px] text-muted">{formatNumber(exam.questionCount)}</td>
                      <td className="px-3 py-3.5">
                        <span className="inline-flex items-center gap-1 text-[12px] text-muted"><Users size={12} />{formatNumber(exam.participantCount)}</span>
                      </td>
                      <td className="px-3 py-3.5 text-[11.5px] text-muted">{formatDuration(exam.durationMinutes)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton label="إدارة الامتحان" onClick={() => onOpenExam(exam)}><Eye size={14} /></IconButton>
                          <IconButton label="تصدير النتائج" onClick={() => exportExam(exam)} disabled={busyId === exam.id}><Download size={14} /></IconButton>
                          <Button
                            variant={exam.isPublished ? 'secondary' : 'soft'}
                            size="xs"
                            loading={busyId === exam.id}
                            icon={exam.isPublished ? EyeOff : Eye}
                            onClick={() => togglePublish(exam)}
                            disabled={exam.status === 'Active' || exam.status === 'Paused'}
                          >
                            {exam.isPublished ? 'إلغاء النشر' : 'نشر'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 p-3 md:hidden">
              {items.map((exam) => (
                <div key={exam.id} className="rounded-[14px] border border-line bg-surface-soft/50 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => onOpenExam(exam)} className="min-w-0 flex-1 text-right">
                      <p className="truncate text-[13px] font-bold text-ink">{exam.title}</p>
                      <p className="mt-1 text-[10.5px] text-subtle">{formatDate(exam.createdAtUtc)}</p>
                    </button>
                    <StatusChip status={exam.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1"><Users size={12} />{formatNumber(exam.participantCount)} طالب</span>
                    <span>·</span>
                    <span>{formatNumber(exam.questionCount)} سؤال</span>
                    <span>·</span>
                    <span>{formatDuration(exam.durationMinutes)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                    <span className="text-[10.5px] text-subtle">{exam.isPublished ? 'منشور · بانتظار فتح الجلسة' : 'لم ينشر بعد'}</span>
                    <div className="flex gap-1.5">
                      <Button size="xs" variant="secondary" icon={eyeIcon(exam)} onClick={() => togglePublish(exam)} loading={busyId === exam.id} disabled={exam.status === 'Active' || exam.status === 'Paused'}>
                        {exam.isPublished ? 'إلغاء' : 'نشر'}
                      </Button>
                      <Button size="xs" variant="ghost" iconEnd={ArrowLeft} onClick={() => onOpenExam(exam)}>إدارة</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && totalPages > 1 ? (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-line px-4 py-3 sm:flex-row">
            <p className="text-[11.5px] text-muted">صفحة {formatNumber(page)} من {formatNumber(totalPages)}</p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="xs" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>السابق</Button>
              <Button variant="secondary" size="xs" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>التالي</Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function eyeIcon(exam) {
  return exam.isPublished ? EyeOff : Eye;
}
