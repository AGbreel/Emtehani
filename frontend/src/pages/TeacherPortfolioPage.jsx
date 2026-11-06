import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, LoaderCircle, UserRound } from 'lucide-react';
import { Alert, Button, Card, Logo } from '../components/ui';
import AnimatedBackground from '../components/AnimatedBackground';
import TeacherPortfolioView from '../components/TeacherPortfolioView';
import { request } from '../lib/api';

export default function TeacherPortfolioPage({ slug, onBack }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    request(`/api/public/teachers/${encodeURIComponent(slug)}`)
      .then((data) => { if (active) { setProfile(data); setError(''); } })
      .catch((err) => { if (active) setError(err.message || 'الصفحة التعريفية غير متاحة.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (profile?.professionalName) document.title = `${profile.professionalName} · امتحاني`;
    return () => { document.title = 'امتحاني · منصة امتحانات عربية'; };
  }, [profile]);

  return (
    <div className="relative isolate min-h-dvh bg-canvas">
      <AnimatedBackground variant="landing" grid={false} />
      <header className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <button type="button" onClick={onBack} className="rounded-lg"><Logo /></button>
        <Button variant="ghost" size="sm" icon={ArrowRight} onClick={onBack}>العودة</Button>
      </header>
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto max-w-4xl px-4 pb-16 sm:px-6"
      >
        {loading ? (
          <Card className="grid min-h-64 place-items-center p-8"><LoaderCircle size={22} className="animate-spin text-primary" /></Card>
        ) : error ? (
          <Card className="p-8">
            <Alert tone="danger">{error}</Alert>
          </Card>
        ) : profile ? (
          <TeacherPortfolioView profile={profile} />
        ) : (
          <Card className="p-8 text-center text-[12px] text-muted"><UserRound size={20} className="mx-auto mb-2" />الصفحة غير متاحة.</Card>
        )}
      </motion.main>
    </div>
  );
}
