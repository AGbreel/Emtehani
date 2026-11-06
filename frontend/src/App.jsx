import React, { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, LoaderCircle, LogOut, Sparkles } from 'lucide-react';
import AppShell from './components/AppShell';
import SessionCountdown from './components/SessionCountdown';
import { Button, Logo } from './components/ui';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
const DeveloperPage = lazy(() => import('./DeveloperPage.jsx'));
const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
const ExamsPage = lazy(() => import('./pages/ExamsPage'));
const ExamForm = lazy(() => import('./pages/ExamForm'));
const TeacherExamDetail = lazy(() => import('./pages/TeacherExamDetail'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));
const EssaysPage = lazy(() => import('./pages/EssaysPage'));
const TeacherRequestsPage = lazy(() => import('./pages/TeacherRequestsPage'));
const TeacherStudentsPage = lazy(() => import('./pages/TeacherStudentsPage'));
const TeachersPage = lazy(() => import('./pages/TeachersPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const AvailableExamsPage = lazy(() => import('./pages/AvailableExamsPage'));
const LobbyPage = lazy(() => import('./pages/LobbyPage'));
const ExamRoomPage = lazy(() => import('./pages/ExamRoomPage'));
const ReviewDetailPage = lazy(() => import('./pages/ReviewDetailPage'));
const EssayReviewPage = lazy(() => import('./pages/EssayReviewPage'));
const StudentProfilePage = lazy(() => import('./pages/StudentProfilePage'));
const TeacherProfilePage = lazy(() => import('./pages/TeacherProfilePage'));
const TeacherPortfolioPage = lazy(() => import('./pages/TeacherPortfolioPage'));
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const TeachingCoursesPage = lazy(() => import('./pages/TeachingCoursesPage'));
const TeachingGroupsPage = lazy(() => import('./pages/TeachingGroupsPage'));
const TeachingFinancePage = lazy(() => import('./pages/TeachingFinancePage'));
const TeachingAssistantsPage = lazy(() => import('./pages/TeachingAssistantsPage'));
const TeachingReportsPage = lazy(() => import('./pages/TeachingReportsPage'));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'));
const StudentLearningPage = lazy(() => import('./pages/StudentLearningPage'));
const StudentFinancePage = lazy(() => import('./pages/StudentFinancePage'));
const MyCoursesPage = lazy(() => import('./pages/MyCoursesPage'));
const AssistantDashboard = lazy(() => import('./pages/AssistantDashboard'));
const AdminPlansPage = lazy(() => import('./pages/AdminPlansPage'));
const AdminReportsPage = lazy(() => import('./pages/AdminReportsPage'));
import { authUserFromResponse, clearAuth, getStoredAuth, request, storeAuth, storeSession } from './lib/api';
import { installWebMcpTools } from './lib/webmcp';

const teacherTitles = {
  dashboard: 'مركز التحكم',
  exams: 'الامتحانات',
  create: 'إنشاء امتحان',
  'exam-detail': 'إدارة الجلسة',
  results: 'النتائج والتحليلات',
  essays: 'مراجعة المقالات',
  requests: 'طلبات الطلاب',
  students: 'إدارة الطلاب',
  courses: 'الكورسات والمحتوى',
  groups: 'المجموعات والحصص',
  finance: 'المالية',
  assistants: 'المساعدون',
  announcements: 'الإعلانات',
  reports: 'التقارير',
  'teacher-profile': 'صفحتي التعريفية',
  subscription: 'الاشتراك',
  audit: 'سجل النشاط',
  chat: 'المحادثات',
  review: 'مراجعة المحاولة',
  'essay-review': 'تصحيح المحاولة',
};

const studentTitles = {
  dashboard: 'نظرة عامة',
  learning: 'تعلّمي',
  courses: 'كورساتي',
  available: 'الامتحانات المتاحة',
  results: 'نتائجي',
  teachers: 'المدرسون',
  profile: 'ملفي الأكاديمي',
  'my-finance': 'مدفوعاتي',
  announcements: 'الإعلانات',
  chat: 'المحادثات',
  review: 'مراجعة المحاولة',
};

const adminTitles = {
  dashboard: 'لوحة الإدارة',
  admin: 'لوحة الإدارة',
  'admin-teachers': 'المدرسون والاشتراكات',
  plans: 'خطط الاشتراك',
  'admin-reports': 'التقارير والإحصاءات',
  announcements: 'إعلانات المنصة',
  chat: 'المحادثات',
};

const assistantTitles = {
  dashboard: 'مركز المساعد',
  groups: 'المجموعات والحصص',
  courses: 'الكورسات والمحتوى',
  reports: 'التقارير',
  announcements: 'الإعلانات',
  chat: 'المحادثات',
};

const activePages = {
  'exam-detail': 'exams',
  review: 'results',
  'essay-review': 'essays',
};

const restorablePages = {
  Teacher: new Set(['dashboard', 'exams', 'results', 'essays', 'requests', 'students', 'courses', 'groups', 'finance', 'assistants', 'announcements', 'reports', 'teacher-profile', 'subscription', 'audit', 'chat']),
  Student: new Set(['dashboard', 'learning', 'courses', 'available', 'results', 'teachers', 'profile', 'my-finance', 'announcements', 'chat']),
  Admin: new Set(['dashboard', 'admin', 'admin-teachers', 'plans', 'admin-reports', 'announcements', 'chat']),
  Assistant: new Set(['dashboard', 'courses', 'groups', 'reports', 'announcements', 'chat']),
};

const pageHashes = {
  dashboard: '/dashboard',
  exams: '/exams',
  results: '/results',
  essays: '/essays',
  requests: '/requests',
  students: '/students',
  courses: '/courses',
  groups: '/groups',
  finance: '/finance',
  assistants: '/assistants',
  announcements: '/announcements',
  reports: '/reports',
  learning: '/learning',
  'my-finance': '/my-finance',
  plans: '/plans',
  'admin-reports': '/admin-reports',
  'teacher-profile': '/teacher-profile',
  subscription: '/subscription',
  audit: '/audit',
  available: '/available',
  teachers: '/teachers',
  profile: '/profile',
  chat: '/chat',
};

function pageFromHashFor(user) {
  try {
    const path = window.location.hash.replace(/^#/, '');
    const entry = Object.entries(pageHashes).find(([, value]) => value === path);
    return entry && restorablePages[user?.role]?.has(entry[0]) ? entry[0] : '';
  } catch {
    return '';
  }
}

function storedPageFor(user) {
  try {
    const page = sessionStorage.getItem('emtehani-page');
    return page && restorablePages[user?.role]?.has(page) ? page : '';
  } catch {
    return '';
  }
}

function PageFallback() {
  return (
    <div className="grid min-h-[38vh] place-items-center">
      <div className="flex flex-col items-center text-center">
        <LoaderCircle size={20} className="animate-spin text-primary" />
        <p className="mt-2 text-[11px] text-muted">جارٍ التحميل...</p>
      </div>
    </div>
  );
}

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

function isInviteUrl() {
  try { return new URLSearchParams(window.location.search).has('invite'); } catch { return false; }
}

export function teacherSlugFromPath() {
  try {
    const match = window.location.pathname.match(/^\/t\/([a-z0-9-]{3,64})\/?$/i);
    return match ? match[1].toLowerCase() : '';
  } catch { return ''; }
}

export default function App() {
  const stored = getStoredAuth();
  const [token, setToken] = useState(stored.token);
  const [user, setUser] = useState(stored.user);
  const [booting, setBooting] = useState(Boolean(stored.token));
  const [theme, setTheme] = useState(initialTheme);
  const [page, setPage] = useState(() => isPortfolioUrl() ? 'portfolio' : isInviteUrl() ? 'auth' : 'landing');
  const [teacherSlug, setTeacherSlug] = useState(() => teacherSlugFromPath());
  const [authMode, setAuthMode] = useState(() => isInviteUrl() ? 'register' : 'login');
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

  // Progressive enhancement: register public, read-only site tools only when
  // the browser exposes WebMCP. Unsupported browsers and private data are
  // unaffected; backend authorization remains authoritative.
  useEffect(() => installWebMcpTools(), []);

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
      setAuthNotice('انتهت صلاحية الجلسة. سجّل الدخول مرة أخرى للمتابعة؛ إجاباتك المحفوظة لن تُفقد وسيُستأنف الامتحان تلقائياً.');
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
        const nextUser = { ...stored.user, ...authUserFromResponse(me), ...me };
        const latest = getStoredAuth();
        setUser(nextUser);
        setToken(latest.token || stored.token);
        storeAuth(latest.token || stored.token, nextUser);
        storeSession(me.sessionExpiresAtUtc, me.serverUtc);
        setPage((current) => {
          if (current === 'portfolio') return current;
          if (nextUser.role === 'Teacher' && !nextUser.subscriptionStatus) return 'subscription';
          return pageFromHashFor(nextUser) || storedPageFor(nextUser) || 'dashboard';
        });
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
      setTeacherSlug(teacherSlugFromPath());
      if (isPortfolioUrl()) {
        setPage('portfolio');
        return;
      }
      const hashPage = pageFromHashFor(user);
      setPage(hashPage || (user ? 'dashboard' : 'landing'));
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [user]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [page]);

  useEffect(() => {
    if (!user) return;
    try {
      if (restorablePages[user.role]?.has(page)) sessionStorage.setItem('emtehani-page', page);
    } catch { /* storage may be unavailable in private mode */ }
  }, [page, user]);

  useEffect(() => {
    if (!user || teacherSlug) return;
    const path = pageHashes[page];
    if (!path) return;
    const nextHash = `#${path}`;
    if (window.location.hash !== nextHash) window.history.pushState({ page }, '', nextHash);
  }, [page, user, teacherSlug]);

  useEffect(() => {
    const titles = user?.role === 'Admin' ? adminTitles : user?.role === 'Teacher' ? teacherTitles : user?.role === 'Assistant' ? assistantTitles : studentTitles;
    const currentTitle = titles[page] || 'امتحاني';
    document.title = page === 'portfolio'
      ? 'Ahmed Gbreel · Full Stack Developer'
      : user
        ? `${currentTitle} · امتحاني`
        : 'امتحاني · منصة امتحانات عربية';
  }, [page, user]);

  async function authenticate(mode, payload) {
    const data = await request(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
      method: 'POST',
      body: JSON.stringify(mode === 'login' ? { email: payload.email, password: payload.password } : payload),
    });
    if (mode === 'register') {
      // The account is created by the register call (which deliberately does not return a
      // session). When the account is already active, sign in immediately so a teacher can
      // choose the Free package right away. If e-mail verification is required, fall back
      // to the normal "check your inbox" flow.
      if (payload.role === 'Teacher') {
        try {
          const login = await request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: payload.email.trim(), password: payload.password }),
          });
          const nextUser = authUserFromResponse(login);
          storeAuth(login.token, nextUser, login.refreshToken);
          storeSession(login.sessionExpiresAtUtc, login.serverUtc);
          setToken(login.token);
          setUser(nextUser);
          setAuthNotice('');
          setAuthMode('login');
          setPage('subscription');
          return { registered: true, autoLoggedIn: true, message: data.message, studentCode: data.studentCode };
        } catch {
          // Verification is required or auto-login is unavailable; keep the notice path.
        }
      }
      return { registered: true, message: data.message, studentCode: data.studentCode };
    }
    const nextUser = authUserFromResponse(data);
    storeAuth(data.token, nextUser, data.refreshToken);
    storeSession(data.sessionExpiresAtUtc, data.serverUtc);
    setToken(data.token);
    setUser(nextUser);
    setAuthNotice('');
    setPage(nextUser.role === 'Teacher' && !nextUser.subscriptionStatus ? 'subscription' : 'dashboard');
    setAuthMode('login');
    return { registered: false };
  }

  function logout() {
    try {
      const refreshToken = localStorage.getItem('emtehani-refresh-token');
      if (refreshToken) request('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => {});
    } catch { /* best-effort revocation */ }
    clearAuth();
    try { sessionStorage.removeItem('emtehani-page'); } catch { /* ignore */ }
    try { window.history.replaceState(null, '', '/'); } catch { /* ignore */ }
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
    if (user?.role === 'Teacher' && !user?.subscriptionStatus && next !== 'subscription' && next !== 'portfolio') {
      setPage('subscription');
      return;
    }
    if (['admin', 'admin-teachers', 'plans', 'admin-reports'].includes(next) && user?.role !== 'Admin') { setPage('dashboard'); return; }
    if (['finance', 'assistants', 'students', 'subscription', 'essays', 'requests', 'teacher-profile'].includes(next) && user?.role !== 'Teacher') { setPage('dashboard'); return; }
    if (['learning', 'my-finance', 'available', 'profile'].includes(next) && user?.role !== 'Student') { setPage('dashboard'); return; }
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

  function updateSubscription(result) {
    setUser((current) => {
      const next = {
        ...current,
        subscriptionStatus: result?.status || 'Confirmed',
        subscriptionPlan: result?.planCode || current?.subscriptionPlan || 'free',
      };
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

  if (teacherSlug) {
    return (
      <Suspense fallback={<PageFallback />}>
        <TeacherPortfolioPage
          slug={teacherSlug}
          onBack={() => {
            try { window.history.pushState(null, '', '/'); } catch { /* ignore */ }
            setTeacherSlug('');
            setPage(user ? 'dashboard' : 'landing');
          }}
        />
      </Suspense>
    );
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
    return <Suspense fallback={<PageFallback />}><DeveloperPage theme={theme} onThemeChange={setTheme} onBack={closePortfolio} /></Suspense>;
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
    return <Suspense fallback={<PageFallback />}><ExamRoomPage token={token} user={user} paper={paper} onSubmitted={submittedExam} /></Suspense>;
  }

  if (page === 'lobby' && joined) {
    return (
      <div className="min-h-dvh bg-canvas">
        <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <div className="hidden sm:block"><SessionCountdown compact /></div>
            <span className="hidden text-[11px] text-muted sm:inline">{user.fullName}</span>
            <Button variant="ghost" size="xs" icon={LogOut} onClick={logout}>خروج</Button>
          </div>
        </header>
        <div className="px-4 pb-12 sm:px-6">
          <Suspense fallback={<PageFallback />}>
            <LobbyPage token={token} joined={joined} onStarted={startedExam} onResults={(id) => openReview(id, 'results')} onExit={exitLobby} />
          </Suspense>
        </div>
      </div>
    );
  }

  const isTeacher = user.role === 'Teacher';
  const isAdmin = user.role === 'Admin';
  const isAssistant = user.role === 'Assistant';
  const isStudent = user.role === 'Student';
  const teacherPending = isTeacher && !user.subscriptionStatus;
  const effectivePage = teacherPending ? 'subscription' : page;
  const titlesForRole = isAdmin ? adminTitles : isTeacher ? teacherTitles : isAssistant ? assistantTitles : studentTitles;
  const title = titlesForRole[effectivePage] || 'امتحاني';
  const activePage = activePages[effectivePage] || effectivePage;

  let content;
  if (teacherPending) {
    content = <SubscriptionPage token={token} onConfirmed={updateSubscription} />;
  } else if (page === 'chat') {
    content = <ChatPage token={token} user={user} />;
  } else if (isAdmin && page === 'plans') {
    content = <AdminPlansPage token={token} />;
  } else if (isAdmin && page === 'admin-reports') {
    content = <AdminReportsPage token={token} />;
  } else if (page === 'announcements') {
    content = <AnnouncementsPage token={token} role={isAdmin ? 'Admin' : isStudent ? 'Student' : 'Teacher'} />;
  } else if (isAdmin) {
    content = <AdminDashboard token={token} onNavigate={navigate} />;
  } else if (page === 'dashboard') {
    content = isAssistant
      ? <AssistantDashboard token={token} user={user} onNavigate={navigate} />
      : isTeacher
        ? <TeacherDashboard token={token} user={user} onNavigate={navigate} onCreate={() => setPage('create')} onOpenExam={openExam} />
        : <StudentDashboard token={token} user={user} onBrowse={() => setPage('available')} onEnter={joinedExam} onViewResults={() => setPage('results')} onOpenReview={(id) => openReview(id, 'dashboard')} onProfileUpdated={updateEducation} />;
  } else if (page === 'courses') {
    content = isStudent
      ? <MyCoursesPage token={token} />
      : <TeachingCoursesPage token={token} />;
  } else if (page === 'groups' && (isTeacher || isAssistant)) {
    content = <TeachingGroupsPage token={token} onOpenChat={() => setPage('chat')} />;
  } else if (page === 'learning' && isStudent) {
    content = <StudentLearningPage token={token} onOpenChat={() => setPage('chat')} />;
  } else if (page === 'my-finance' && isStudent) {
    content = <StudentFinancePage token={token} />;
  } else if (page === 'finance' && isTeacher) {
    content = <TeachingFinancePage token={token} />;
  } else if (page === 'assistants' && isTeacher) {
    content = <TeachingAssistantsPage token={token} />;
  } else if (page === 'reports' && (isTeacher || isAssistant)) {
    content = <TeachingReportsPage token={token} />;
  } else if (page === 'available' && isStudent) {
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
  } else if (page === 'teacher-profile' && isTeacher) {
    content = <TeacherProfilePage token={token} />;
  } else if (page === 'teachers' && isStudent) {
    content = <TeachersPage token={token} />;
  } else if (page === 'profile' && isStudent) {
    content = <StudentProfilePage token={token} onProfileUpdated={updateEducation} />;
  } else if (page === 'subscription' && isTeacher) {
    content = <SubscriptionPage token={token} onConfirmed={updateSubscription} />;
  } else if (page === 'audit') {
    content = <AuditPage token={token} />;
  } else if (page === 'review' && reviewId) {
    content = <ReviewDetailPage token={token} user={user} submissionId={reviewId} onBack={() => setPage(reviewBack)} onOpenEssayReview={openEssayReview} />;
  } else if (page === 'essay-review' && reviewId) {
    content = <EssayReviewPage token={token} submissionId={reviewId} onBack={() => setPage('essays')} />;
  } else {
    content = isAssistant
      ? <AssistantDashboard token={token} user={user} onNavigate={navigate} />
      : isTeacher
        ? <TeacherDashboard token={token} user={user} onNavigate={navigate} onCreate={() => setPage('create')} onOpenExam={openExam} />
        : <StudentDashboard token={token} user={user} onBrowse={() => setPage('available')} onEnter={joinedExam} onViewResults={() => setPage('results')} onOpenReview={(id) => openReview(id, 'dashboard')} onProfileUpdated={updateEducation} />;
  }

  return (
    <AppShell user={user} token={token} page={effectivePage} activePage={activePage} title={title} onNavigate={navigate} onLogout={logout} theme={theme} onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}>
      <AnimatePresence mode="wait">
        <motion.div key={effectivePage} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <Suspense fallback={<PageFallback />}>{content}</Suspense>
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
