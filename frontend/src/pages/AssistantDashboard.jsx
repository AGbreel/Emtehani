import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  BookOpenCheck, CalendarClock, ClipboardCheck, MessageCircle, RefreshCw, ShieldCheck, Users,
} from 'lucide-react';
import { Alert, Badge, Button, Card, PageHeader, Skeleton, StatCard } from '../components/ui';
import { request } from '../lib/api';
import { formatNumber, greeting } from '../lib/format';

const quickLinks = [
  { key: 'groups', label: 'المجموعات والحصص', icon: CalendarClock, tone: 'primary' },
  { key: 'courses', label: 'الكورسات والمحتوى', icon: BookOpenCheck, tone: 'blue' },
  { key: 'reports', label: 'التقارير', icon: ClipboardCheck, tone: 'emerald' },
  { key: 'chat', label: 'المحادثات', icon: MessageCircle, tone: 'warning' },
];

export default function AssistantDashboard({ token, user, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const result = await request('/api/teaching/overview', { token });
      setData(result);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const counts = data?.counts || {};
  const permissions = data?.permissions || [];
  const isOwner = data?.isOwner;

  return (
    <div>
      <PageHeader
        eyebrow="مساحة المساعد"
        title={`${greeting()}، ${user?.fullName?.split(' ')[0] || 'أستاذنا'}.`}
        description={isOwner ? 'كل الصلاحيات متاحة لحسابك.' : 'هذه الصفحة تعرض فقط ما تم منحه لك من صلاحيات ومجموعات.'}
        action={<Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}

      <div className="ui-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="الطلاب" value={formatNumber(counts.students)} note="المتاحون ضمن صلاحياتك" loading={loading} />
        <StatCard icon={CalendarClock} label="حصص اليوم" value={formatNumber(counts.sessionsToday)} note="مجدولة اليوم" tone="primary" loading={loading} />
        <StatCard icon={BookOpenCheck} label="المجموعات" value={formatNumber(counts.groups)} note="مجموعات نشطة" tone="emerald" loading={loading} />
        <StatCard icon={ClipboardCheck} label="واجبات للتصحيح" value={formatNumber(counts.pendingHomework)} note={`${formatNumber(counts.homework)} واجب منشور`} tone="warning" loading={loading} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-4 sm:p-5">
          <h2 className="text-[14px] font-bold text-ink">روابط سريعة</h2>
          <p className="mt-0.5 text-[11px] text-muted">افتح القسم الذي تعمل عليه الآن.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {quickLinks.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.button
                  key={item.key}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onNavigate?.(item.key)}
                  className="flex min-h-16 items-center gap-3 rounded-[14px] border border-line bg-surface-soft p-3 text-right transition hover:border-primary/40 hover:bg-surface"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-primary-soft text-primary"><Icon size={18} /></span>
                  <span className="flex-1 text-[12.5px] font-bold text-ink">{item.label}</span>
                </motion.button>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-primary" />
            <h2 className="text-[13.5px] font-bold text-ink">صلاحياتك</h2>
          </div>
          <p className="mt-0.5 text-[10.5px] text-muted">تُدار من قِبل المدرس، ويطبّقها الخادم على كل طلب.</p>
          {loading ? (
            <div className="mt-3 grid gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-7 w-full rounded-lg" />)}</div>
          ) : permissions.length === 0 ? (
            <p className="mt-3 rounded-[10px] bg-surface-soft p-3 text-[11px] text-muted">لم تُمنح لك صلاحيات بعد. تواصل مع المدرس المسؤول.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {permissions.map((permission) => (
                <Badge key={permission} tone="neutral">{permission}</Badge>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
