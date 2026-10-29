import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, LoaderCircle, LogOut, Sparkles } from 'lucide-react';
import DeveloperPage from './DeveloperPage.jsx';
import AppShell from './components/AppShell';
import { Button, Logo } from './components/ui';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentDashboard from './pages/StudentDashboard';
import ExamsPage from './pages/ExamsPage';
import ExamForm from './pages/ExamForm';
import TeacherExamDetail from './pages/TeacherExamDetail';
import ResultsPage from './pages/ResultsPage';
import EssaysPage from './pages/EssaysPage';
import TeacherRequestsPage from './pages/TeacherRequestsPage';
import TeacherStudentsPage from './pages/TeacherStudentsPage';
import TeachersPage from './pages/TeachersPage';
import AuditPage from './pages/AuditPage';
import AvailableExamsPage from './pages/AvailableExamsPage';
import LobbyPage from './pages/LobbyPage';
import ExamRoomPage from './pages/ExamRoomPage';
import ReviewDetailPage from './pages/ReviewDetailPage';
import EssayReviewPage from './pages/EssayReviewPage';
import { clearAuth, getStoredAuth, request, storeAuth } from './lib/api';

const teacherTitles = {
  dashboard: 'مركز التحكم',
  exams: 'الامتحانات',
  create: 'إنشاء امتحان',
  'exam-detail': 'إدارة الجلسة',
  results: 'النتائج والتحليلات',
  essays: 'مراجعة المقالات',
  requests: 'طلبات الطلاب',
  students: 'إدارة الطلاب',
  audit: 'سجل النشاط',
};

const studentTitles = {
  dashboard: 'نظرة عامة',
  available: 'الامتحانات المتاحة',
  results: 'نتائجي',
  teachers: 'المدرسون',
};

const activePages = {
  'exam-detail': 'exams',
  review: 'results',
  'essay-review': 'essays',
};

function initialTheme() {
  try {
    const query = new URLSearchParams(window.location.search).get('theme');
    if (query === 'dark' || query === 'light') return query;
  } catch { /* ignore */ }
  const saved = localStorage.getItem('emtehani-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function isPortfolioUrl() {
  try { return new URLSearchParams(window.location.search).has('portfolio'); } catch { return false; }
}

export default function App() {
  const stored = getStoredAuth();
  const [token, setToken] = useState(stored.token);
  const [user, setUser] = useState(stored.user);
  const [booting, setBooting] = useState(Boolean(stored.token));
  const [theme, setTheme] = useState(initialTheme);
  const [page, setPage] = useState(() => isPortfolioUrl() ? 'portfolio' : 'landing');
  const [authMode, setAuthMode] = useState('login');
  const [selectedExam, setSelectedExam] = useState(null);
  const [joined, setJoined] = useState(null);
  const [paper, setPaper] = useState(null);
  const [reviewId, setReviewId] = useState('');
  const [reviewBack, setReviewBack] = useState('results');
  const [authNotice, setAuthNotice] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('emtehani-theme', theme);
  }, [theme]);

  useEffect(() => {
    function onSessionExpired() {
      clearAuth();
      setToken('');
      setUser(null);
      setSelectedExam(null);
      setJoined(null);
      setPaper(null);
      setReviewId('');
      setAuthMode('login');
      setAuthNotice('انتهت صلاحية الجلسة. سجّل الدخول مرة أخرى للمتابعة.');
      setPage((current) => current === 'portfolio' ? current : 'auth');
    }
    window.addEventListener('emtehani:session-expired', onSessionExpired);
    return () => window.removeEventListener('emtehani:session-expired', onSessionExpired);
  }, []);

  useEffect(() => {
    if (!stored.token) return;
    let active = true;
    request('/api/auth/me', { token: stored.token })
      .then((me) => {
        if (!active) return;
        const nextUser = { ...stored.user, ...me };
        setUser(nextUser);
        storeAuth(stored.token, nextUser);
        setPage((current) => current === 'portfolio' ? current : 'dashboard');
      })
      .catch((err) => {
        if (!active) return;
        clearAuth();
        setToken('');
        setUser(null);
        if (err?.status === 401) {
          setAuthMode('login');
          setAuthNotice('انتهت صلاحية الجلسة. سجّل الدخول مرة أخرى للمتابعة.');
          setPage((current) => current === 'portfolio' ? current : 'auth');
        } else {
          setPage((current) => current === 'portfolio' ? current : 'landing');
        }
      })
      .finally(() => { if (active) setBooting(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function onPopState() {
      if (isPortfolioUrl()) setPage('portfolio');
      else setPage((current) => current === 'portfolio' ? (user ? 'dashboard' : 'landing') : current);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [user]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [page]);

  useEffect(() => {
    document.title = page === 'portfolio'
      ? 'Ahmed Gbreel · Full Stack Developer'
      : user
        ? `${user.role === 'Teacher' ? 'مركز التحكم' : 'مساحة الطالب'} · امتحاني`
        : 'امتحاني · منصة امتحانات عربية';
  }, [page, user]);

  async function authenticate(mode, payload) {
    const data = await request(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
      method: 'POST',
      body: JSON.stringify(mode === 'login' ? { email: payload.email, password: payload.password } : payload),
    });
    if (mode === 'register') {
      return { registered: true, message: data.message, studentCode: data.studentCode };
    }
    const nextUser = { fullName: data.fullName, email: data.email, role: data.role, studentCode: data.studentCode || '', stage: data.stage || '', grade: data.grade || '' };
    storeAuth(data.token, nextUser);
    setToken(data.token);
    setUser(nextUser);
    setAuthNotice('');
    setPage('dashboard');
    setAuthMode('login');
    return { registered: false };
  }

  function logout() {
    clearAuth();
    setToken('');
    setUser(null);
    setSelectedExam(null);
    setJoined(null);
    setPaper(null);
    setReviewId('');
    setAuthNotice('');
    setPage('landing');
    setAuthMode('login');
  }

  function openPortfolio() {
    setPage('portfolio');
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('portfolio', '1');
      window.history.pushState(null, '', url);
    } catch { /* ignore */ }
  }

  function closePortfolio() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('portfolio');
      window.history.pushState(null, '', url);
    } catch { /* ignore */ }
    setPage(page === 'portfolio' ? (user ? 'dashboard' : 'landing') : page);
  }

  function navigate(next) {
    if (next === 'portfolio') { openPortfolio(); return; }
    if (next === 'exam-detail' && !selectedExam) { setPage('exams'); return; }
    if (next === 'lobby' && !joined) { setPage('dashboard'); return; }
    if (next === 'take' && !paper) { setPage('dashboard'); return; }
    setPage(next);
  }

  function updateEducation(profile) {
    setUser((current) => {
      const next = { ...current, ...profile };
      storeAuth(token, next);
      return next;
    });
  }

  function openExam(exam) {
    setSelectedExam(exam);
    setPage('exam-detail');
  }

  function openResults(exam) {
    if (exam) setSelectedExam(exam);
    setPage('results');
  }

  function openReview(submissionId, back = 'results') {
    setReviewId(submissionId);
    setReviewBack(back);
    setPage('review');
  }

  function openEssayReview(submissionId) {
    setReviewId(submissionId);
    setPage('essay-review');
  }

  function joinedExam(result) {
    if (result.examStatus === 'Finished' || result.participantStatus === 'Submitted') {
      if (result.submissionId) {
        openReview(result.submissionId, 'results');
        return;
      }
    }
    setJoined(result);
    setPage('lobby');
  }

  function startedExam(nextPaper) {
    setPaper(nextPaper);
    setPage('take');
  }

  function submittedExam(result) {
    setPaper(null);
    setJoined(null);
    openReview(result.id, 'results');
  }

  function exitLobby() {
    setJoined(null);
    setPage('dashboard');
  }

  if (booting) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas px-4">
        <div className="flex flex-col items-center text-center">
          <Logo />
          <LoaderCircle size={20} className="mt-6 animate-spin text-primary" />
          <p className="mt-2 text-[11px] text-muted">جارٍ تجهيز مساحتك...</p>
        </div>
      </div>
    );
  }

  if (page === 'portfolio') {
    return <DeveloperPage theme={theme} onThemeChange={setTheme} onBack={closePortfolio} />;
  }

  if (!user || !token) {
    if (page === 'auth') {
      return (
        <AuthPage
          initialMode={authMode}
          onAuth={authenticate}
          onBack={() => { setAuthNotice(''); setPage('landing'); }}
          onOpenPortfolio={openPortfolio}
          theme={theme}
          onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}
          notice={authNotice}
          noticeTone="warning"
          clearNotice={() => setAuthNotice('')}
        />
      );
    }
    return (
      <LandingPage
        onLogin={() => { setAuthMode('login'); setPage('auth'); }}
        onRegister={() => { setAuthMode('register'); setPage('auth'); }}
        theme={theme}
        onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}
        onOpenPortfolio={openPortfolio}
      />
    );
  }

  if (page === 'take' && paper) {
    return <ExamRoomPage token={token} paper={paper} onSubmitted={submittedExam} />;
  }

  if (page === 'lobby' && joined) {
    return (
      <div className="min-h-dvh bg-canvas">
        <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-muted sm:inline">{user.fullName}</span>
            <Button variant="ghost" size="xs" icon={LogOut} onClick={logout}>خروج</Button>
          </div>
        </header>
        <div className="px-4 pb-12 sm:px-6">
          <LobbyPage token={token} joined={joined} onStarted={startedExam} onResults={(id) => openReview(id, 'results')} onExit={exitLobby} />
        </div>
      </div>
    );
  }

  const isTeacher = user.role === 'Teacher';
  const title = (isTeacher ? teacherTitles : studentTitles)[page] || 'امتحاني';
  const activePage = activePages[page] || page;

  let content;
  if (page === 'dashboard') {
    content = isTeacher
      ? <TeacherDashboard token={token} user={user} onNavigate={navigate} onCreate={() => setPage('create')} onOpenExam={openExam} />
      : <StudentDashboard token={token} user={user} onBrowse={() => setPage('available')} onEnter={joinedExam} onViewResults={() => setPage('results')} onOpenReview={(id) => openReview(id, 'dashboard')} onProfileUpdated={updateEducation} />;
  } else if (page === 'available' && !isTeacher) {
    content = <AvailableExamsPage token={token} onEnter={joinedExam} />;
  } else if (page === 'exams') {
    content = <ExamsPage token={token} onOpenExam={openExam} onCreate={() => setPage('create')} />;
  } else if (page === 'create') {
    content = <ExamForm token={token} onBack={() => setPage('exams')} onCreated={(exam) => { openExam(exam); }} />;
  } else if (page === 'exam-detail' && selectedExam) {
    content = <TeacherExamDetail token={token} exam={selectedExam} onBack={() => setPage('exams')} onOpenResults={openResults} />;
  } else if (page === 'results') {
    content = <ResultsPage token={token} user={user} selectedExam={selectedExam} onOpenReview={(id) => openReview(id, 'results')} onOpenExam={openExam} />;
  } else if (page === 'essays') {
    content = <EssaysPage token={token} onOpenEssayReview={openEssayReview} onOpenResults={openResults} />;
  } else if (page === 'requests' && isTeacher) {
    content = <TeacherRequestsPage token={token} />;
  } else if (page === 'students' && isTeacher) {
    content = <TeacherStudentsPage token={token} />;
  } else if (page === 'teachers' && !isTeacher) {
    content = <TeachersPage token={token} />;
  } else if (page === 'audit') {
    content = <AuditPage token={token} />;
  } else if (page === 'review' && reviewId) {
    content = <ReviewDetailPage token={token} user={user} submissionId={reviewId} onBack={() => setPage(reviewBack)} onOpenEssayReview={openEssayReview} />;
  } else if (page === 'essay-review' && reviewId) {
    content = <EssayReviewPage token={token} submissionId={reviewId} onBack={() => setPage('essays')} />;
  } else {
    content = isTeacher
      ? <TeacherDashboard token={token} user={user} onNavigate={navigate} onCreate={() => setPage('create')} onOpenExam={openExam} />
      : <StudentDashboard token={token} user={user} onBrowse={() => setPage('available')} onEnter={joinedExam} onViewResults={() => setPage('results')} onOpenReview={(id) => openReview(id, 'dashboard')} onProfileUpdated={updateEducation} />;
  }

  return (
    <AppShell user={user} page={page} activePage={activePage} title={title} onNavigate={navigate} onLogout={logout} theme={theme} onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}>
      <AnimatePresence mode="wait">
        <motion.div key={page} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {content}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
