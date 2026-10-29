import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FilePlus2,
  GripVertical,
  Info,
  ListChecks,
  ListOrdered,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  TextCursorInput,
  ToggleLeft,
  Trash2,
  X,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
  cn,
} from '../components/ui';
import { request } from '../lib/api';
import { formatDuration, formatNumber } from '../lib/format';
import { EDUCATION_STAGES, gradesForStage } from '../lib/education';

const questionTypes = [
  { value: 'MultipleChoice', label: 'اختيار من متعدد', short: 'اختيار', icon: ListChecks, note: 'خيارات وإجابة واحدة صحيحة' },
  { value: 'TrueFalse', label: 'صواب أو خطأ', short: 'صح / خطأ', icon: ToggleLeft, note: 'إجابة ثنائية سريعة' },
  { value: 'FillBlank', label: 'أكمل الفراغ', short: 'فراغ', icon: TextCursorInput, note: 'إجابة نصية قصيرة' },
  { value: 'ShortAnswer', label: 'إجابة قصيرة', short: 'قصيرة', icon: AlignRight, note: 'مطابقة نصية دقيقة' },
  { value: 'Matching', label: 'مطابقة', short: 'مطابقة', icon: ListOrdered, note: 'أزواج من عمودين' },
  { value: 'Essay', label: 'مقالي', short: 'مقالي', icon: FilePlus2, note: 'تصحيح يدوي من المدرس' },
];

let nextId = 1;
const makeId = () => `q-${nextId++}`;

function createQuestion(type = 'MultipleChoice') {
  const base = { id: makeId(), type, text: '', points: 1 };
  if (type === 'MultipleChoice') return { ...base, options: ['', '', ''], correctAnswer: '' };
  if (type === 'TrueFalse') return { ...base, options: [], correctAnswer: 'صح' };
  if (type === 'Matching') return { ...base, pairs: [{ id: makeId(), left: '', right: '' }, { id: makeId(), left: '', right: '' }], correctAnswer: '' };
  return { ...base, options: [], correctAnswer: '' };
}

function typeMeta(type) {
  return questionTypes.find((item) => item.value === type) || questionTypes[0];
}

function QuestionEditor({ question, index, total, onChange, onRemove, onMove }) {
  const meta = typeMeta(question.type);
  const TypeIcon = meta.icon;

  function patch(values) {
    onChange({ ...question, ...values });
  }

  function changeType(type) {
    const fresh = createQuestion(type);
    onChange({ ...fresh, id: question.id, text: question.text, points: question.points });
  }

  function updateOption(optionIndex, value) {
    const options = [...(question.options || [])];
    const previous = options[optionIndex];
    options[optionIndex] = value;
    patch({
      options,
      correctAnswer: question.correctAnswer === previous ? value : question.correctAnswer,
    });
  }

  function removeOption(optionIndex) {
    if ((question.options?.length || 0) <= 2) return;
    const options = question.options.filter((_, i) => i !== optionIndex);
    patch({ options, correctAnswer: options.includes(question.correctAnswer) ? question.correctAnswer : '' });
  }

  function updatePair(pairId, field, value) {
    patch({ pairs: question.pairs.map((pair) => pair.id === pairId ? { ...pair, [field]: value } : pair) });
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className="rounded-card border border-line bg-surface shadow-soft">
      <div className="flex items-start gap-3 border-b border-line px-3.5 py-3 sm:px-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary-soft text-primary"><TypeIcon size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-extrabold text-primary">السؤال {formatNumber(index + 1)}</span>
            <Badge tone="neutral">{meta.label}</Badge>
          </div>
          <p className="mt-1 text-[10.5px] text-subtle">{meta.note}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label="تحريك لأعلى" onClick={() => onMove(-1)} disabled={index === 0} className="size-8"><ArrowUp size={13} /></IconButton>
          <IconButton label="تحريك لأسفل" onClick={() => onMove(1)} disabled={index === total - 1} className="size-8"><ArrowDown size={13} /></IconButton>
          <IconButton label="حذف السؤال" onClick={onRemove} disabled={total <= 1} className="size-8 hover:border-danger/30 hover:bg-danger-soft hover:text-danger"><Trash2 size={13} /></IconButton>
        </div>
      </div>

      <div className="grid gap-3.5 p-3.5 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_150px_100px]">
          <Field label="نص السؤال" id={`${question.id}-text`}>
            <Textarea id={`${question.id}-text`} value={question.text} onChange={(event) => patch({ text: event.target.value })} placeholder="اكتب السؤال هنا بوضوح..." className="min-h-20 text-[14px]" />
          </Field>
          <Field label="نوع السؤال" id={`${question.id}-type`}>
            <Select id={`${question.id}-type`} value={question.type} onChange={(event) => changeType(event.target.value)} className="text-[13px]">
              {questionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </Select>
          </Field>
          <Field label="الدرجة" id={`${question.id}-points`}>
            <Input id={`${question.id}-points`} type="number" min="0.5" step="0.5" value={question.points} onChange={(event) => patch({ points: Number(event.target.value) })} className="text-center" />
          </Field>
        </div>

        {question.type === 'MultipleChoice' ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12.5px] font-bold text-ink">الخيارات <span className="font-normal text-subtle">(اختر الإجابة الصحيحة)</span></p>
              <button type="button" onClick={() => patch({ options: [...question.options, ''] })} disabled={question.options.length >= 6} className="min-h-8 text-[11.5px] font-bold text-primary disabled:opacity-40">+ إضافة خيار</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {question.options.map((option, optionIndex) => (
                <div key={optionIndex} className={cn('flex items-center gap-2 rounded-[11px] border px-2.5 py-2 transition', question.correctAnswer === option && option ? 'border-emerald/40 bg-emerald-soft/40' : 'border-line bg-surface-soft')}>
                  <button
                    type="button"
                    onClick={() => option.trim() && patch({ correctAnswer: option })}
                    aria-label={`تحديد الخيار ${optionIndex + 1} كإجابة صحيحة`}
                    className={cn('grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-bold transition', question.correctAnswer === option && option ? 'border-emerald bg-emerald text-white' : 'border-line-strong bg-surface text-muted')}
                  >
                    {question.correctAnswer === option && option ? <Check size={11} /> : optionIndex + 1}
                  </button>
                  <input
                    value={option}
                    onChange={(event) => updateOption(optionIndex, event.target.value)}
                    placeholder={`الخيار ${optionIndex + 1}`}
                    className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-subtle"
                  />
                  <button type="button" onClick={() => removeOption(optionIndex)} disabled={question.options.length <= 2} className="grid size-8 shrink-0 place-items-center text-subtle transition hover:text-danger disabled:opacity-25" aria-label="حذف الخيار"><X size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {question.type === 'TrueFalse' ? (
          <div>
            <p className="mb-2 text-[12.5px] font-bold text-ink">الإجابة الصحيحة</p>
            <div className="grid grid-cols-2 gap-2">
              {['صح', 'خطأ'].map((value) => (
                <button key={value} type="button" onClick={() => patch({ correctAnswer: value })} className={cn('flex min-h-12 items-center justify-center gap-2 rounded-[11px] border px-3 py-2.5 text-[13px] font-bold transition', question.correctAnswer === value ? value === 'صح' ? 'border-emerald bg-emerald-soft text-emerald' : 'border-danger bg-danger-soft text-danger' : 'border-line bg-surface-soft text-muted hover:border-line-strong')}>
                  <span className={cn('grid size-4 place-items-center rounded-full border', question.correctAnswer === value ? 'border-current bg-current text-white' : 'border-line-strong')}>{question.correctAnswer === value ? <Check size={9} /> : null}</span>
                  {value}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {question.type === 'ShortAnswer' || question.type === 'FillBlank' ? (
          <Field label={question.type === 'FillBlank' ? 'الإجابة الصحيحة للفراغ' : 'الإجابة النصية المقبولة'} id={`${question.id}-answer`} hint="تُقارن الإجابة بعد تجاهل المسافات الإضافية وعلامات التشكيل. يمكنك إضافة بدائل بفاصل |">
            <Input id={`${question.id}-answer`} value={question.correctAnswer} onChange={(event) => patch({ correctAnswer: event.target.value })} placeholder={question.type === 'FillBlank' ? 'مثال: 12' : 'مثال: عاصمة المملكة|الرياض'} />
          </Field>
        ) : null}

        {question.type === 'Essay' ? (
          <div className="flex items-center gap-2 rounded-[11px] border border-warning/20 bg-warning-soft px-3 py-2.5 text-[12px] leading-6 text-warning">
            <Info size={14} className="shrink-0" />
            الأسئلة المقالية لا تُصحح تلقائياً. ستظهر في قائمة المراجعة اليدوية بعد تسليم الطالب.
          </div>
        ) : null}

        {question.type === 'Matching' ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12.5px] font-bold text-ink">أزواج المطابقة <span className="font-normal text-subtle">(كل عنصر يقابل الإجابة المجاورة)</span></p>
              <button type="button" onClick={() => patch({ pairs: [...question.pairs, { id: makeId(), left: '', right: '' }] })} disabled={question.pairs.length >= 8} className="min-h-8 text-[11.5px] font-bold text-primary disabled:opacity-40">+ إضافة زوج</button>
            </div>
            <div className="grid gap-2">
              <div className="grid grid-cols-[1fr_1fr_36px] gap-2 px-1 text-[10.5px] font-bold text-subtle"><span>العنصر</span><span>ما يقابله</span><span /></div>
              {question.pairs.map((pair, pairIndex) => (
                <div key={pair.id} className="grid grid-cols-[1fr_1fr_36px] items-center gap-2">
                  <input value={pair.left} onChange={(event) => updatePair(pair.id, 'left', event.target.value)} placeholder={`العنصر ${pairIndex + 1}`} className="h-10 rounded-[9px] border border-line bg-surface-soft px-2.5 text-[13px] outline-none focus:border-primary focus:bg-surface" />
                  <input value={pair.right} onChange={(event) => updatePair(pair.id, 'right', event.target.value)} placeholder="الزوج المقابل" className="h-10 rounded-[9px] border border-line bg-surface-soft px-2.5 text-[13px] outline-none focus:border-primary focus:bg-surface" />
                  <button type="button" onClick={() => patch({ pairs: question.pairs.filter((item) => item.id !== pair.id) })} disabled={question.pairs.length <= 2} className="grid size-9 place-items-center rounded-lg text-subtle hover:bg-danger-soft hover:text-danger disabled:opacity-25" aria-label="حذف الزوج"><X size={14} /></button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-subtle">في اختبار الطالب، ستُعرض الإجابات بترتيب مختلف ليختار لكل عنصر ما يقابله.</p>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

export default function ExamForm({ token, onBack, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stage, setStage] = useState('');
  const [grade, setGrade] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [allowResume, setAllowResume] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [questions, setQuestions] = useState([createQuestion('MultipleChoice')]);
  const [typePicker, setTypePicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  const totalPoints = useMemo(() => questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0), [questions]);

  function addQuestion(type) {
    setQuestions((current) => [...current, createQuestion(type)]);
    setTypePicker(false);
  }

  function updateQuestion(index, next) {
    setQuestions((current) => current.map((question, i) => i === index ? next : question));
  }

  function removeQuestion(index) {
    setQuestions((current) => current.filter((_, i) => i !== index));
  }

  function moveQuestion(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function payloadFor(question) {
    if (question.type === 'MultipleChoice') {
      return { text: question.text.trim(), type: question.type, options: question.options.map((option) => option.trim()).filter(Boolean), correctAnswer: question.correctAnswer.trim(), points: Number(question.points) };
    }
    if (question.type === 'TrueFalse') {
      return { text: question.text.trim(), type: question.type, options: ['صح', 'خطأ'], correctAnswer: question.correctAnswer, points: Number(question.points) };
    }
    if (question.type === 'Matching') {
      return { text: question.text.trim(), type: question.type, options: question.pairs.map((pair) => `${pair.left.trim()}||${pair.right.trim()}`), correctAnswer: '', points: Number(question.points) };
    }
    return { text: question.text.trim(), type: question.type, options: [], correctAnswer: question.type === 'Essay' ? null : question.correctAnswer.trim(), points: Number(question.points) };
  }

  function validate() {
    if (title.trim().length < 3) return 'اكتب عنواناً واضحاً للامتحان (3 أحرف على الأقل).';
    if (!stage || !gradesForStage(stage).includes(grade)) return 'اختر المرحلة التعليمية والصف الدراسي المناسبين للامتحان.';
    if (!questions.length) return 'أضف سؤالاً واحداً على الأقل.';
    if (!Number.isFinite(Number(durationMinutes)) || Number(durationMinutes) < 1 || Number(durationMinutes) > 300) return 'مدة الامتحان يجب أن تكون بين دقيقة و300 دقيقة.';
    if (availableFrom && availableUntil && new Date(availableUntil) <= new Date(availableFrom)) return 'نهاية فترة الإتاحة يجب أن تكون بعد بدايتها.';
    for (let index = 0; index < questions.length; index++) {
      const question = questions[index];
      if (!question.text.trim()) return `السؤال ${index + 1}: اكتب نص السؤال.`;
      if (!Number(question.points) || Number(question.points) <= 0) return `السؤال ${index + 1}: الدرجة يجب أن تكون أكبر من صفر.`;
      if (question.type === 'MultipleChoice') {
        const options = question.options.map((option) => option.trim()).filter(Boolean);
        if (options.length < 2) return `السؤال ${index + 1}: أضف خيارين على الأقل.`;
        if (!options.includes(question.correctAnswer.trim())) return `السؤال ${index + 1}: اختر الإجابة الصحيحة من الخيارات.`;
      }
      if (question.type === 'TrueFalse' && !['صح', 'خطأ'].includes(question.correctAnswer)) return `السؤال ${index + 1}: اختر الإجابة الصحيحة.`;
      if ((question.type === 'ShortAnswer' || question.type === 'FillBlank') && !question.correctAnswer.trim()) return `السؤال ${index + 1}: اكتب الإجابة الصحيحة.`;
      if (question.type === 'Matching' && question.pairs.some((pair) => !pair.left.trim() || !pair.right.trim())) return `السؤال ${index + 1}: أكمل جميع أزواج المطابقة.`;
    }
    return '';
  }

  async function submit(event) {
    event.preventDefault();
    const validation = validate();
    if (validation) {
      setError(validation);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setError('');
    setBusy(true);
    try {
      const result = await request('/api/exams', {
        token,
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          durationMinutes: Number(durationMinutes),
          maxAttempts: Number(maxAttempts),
          allowResumeAfterFocusLoss: allowResume,
          scheduledAtUtc: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          availableFromUtc: availableFrom ? new Date(availableFrom).toISOString() : null,
          availableUntilUtc: availableUntil ? new Date(availableUntil).toISOString() : null,
          stage,
          grade,
          questions: questions.map(payloadFor),
        }),
      });
      setCreated(result);
    } catch (err) {
      setError(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-5 inline-flex min-h-10 items-center gap-1.5 text-[12px] font-bold text-muted transition hover:text-primary"><ArrowLeft size={14} className="rotate-180" />العودة إلى الامتحانات</button>
      <PageHeader eyebrow="بناء جديد" title="أنشئ امتحاناً" description="أضف التفاصيل والأسئلة. بعد الحفظ انشر الامتحان ثم افتح الجلسة — يراه ويبدأه مباشرة الطلاب المسجلون لديك في المرحلة والصف المطابقين." />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}

      <form onSubmit={submit} className="grid gap-4 xl:grid-cols-[1fr_310px]">
        <div className="grid content-start gap-4">
          <Card className="p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-[11px] bg-primary-soft text-primary"><FilePlus2 size={17} /></span>
              <div><h2 className="font-display text-[15px] font-semibold text-ink">تفاصيل الامتحان</h2><p className="mt-0.5 text-[11.5px] text-muted">ستظهر هذه المعلومات للطالب في غرفة الانتظار.</p></div>
            </div>
            <div className="grid gap-3.5">
              <Field label="عنوان الامتحان" id="exam-title">
                <Input id="exam-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثال: اختبار الرياضيات · الوحدة الثالثة" maxLength={120} />
              </Field>
              <Field label="وصف مختصر" id="exam-description" hint="اختياري، لكنه يساعد الطالب على التأكد من الامتحان الصحيح.">
                <Textarea id="exam-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="ما الذي يغطيه هذا الامتحان؟" maxLength={500} className="min-h-20" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="المرحلة التعليمية" id="exam-stage" hint="يرى الامتحان طلاب هذه المرحلة فقط.">
                  <Select id="exam-stage" value={stage} onChange={(event) => { setStage(event.target.value); setGrade(''); }}>
                    <option value="">اختر المرحلة</option>
                    {EDUCATION_STAGES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </Field>
                <Field label="الصف الدراسي" id="exam-grade" hint="يجب أن يطابق صف الطالب المسجل لديك.">
                  <Select id="exam-grade" value={grade} onChange={(event) => setGrade(event.target.value)} disabled={!stage}>
                    <option value="">{stage ? 'اختر الصف' : 'اختر المرحلة أولاً'}</option>
                    {gradesForStage(stage).map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="المدة بالدقائق" id="exam-duration">
                  <Input id="exam-duration" type="number" min="1" max="300" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} />
                </Field>
                <Field label="عدد المحاولات" id="exam-attempts">
                  <Select id="exam-attempts" value={maxAttempts} onChange={(event) => setMaxAttempts(Number(event.target.value))}>
                    {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} {value === 1 ? 'محاولة' : 'محاولات'}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="موعد الجلسة" id="exam-schedule" hint="اختياري. يمكنك تركه فارغاً وفتح الجلسة يدوياً في أي وقت.">
                <Input id="exam-schedule" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} min={new Date().toISOString().slice(0, 16)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="فترة الإتاحة من" id="exam-available-from" hint="اختياري. لا يمكن للطالب بدء المحاولة قبل هذا الوقت.">
                  <Input id="exam-available-from" type="datetime-local" value={availableFrom} onChange={(event) => setAvailableFrom(event.target.value)} />
                </Field>
                <Field label="فترة الإتاحة إلى" id="exam-available-until" hint="تنتهي المحاولة عند هذا الوقت حتى لو بقي من المدة.">
                  <Input id="exam-available-until" type="datetime-local" value={availableUntil} onChange={(event) => setAvailableUntil(event.target.value)} />
                </Field>
              </div>
              <Checkbox label="السماح للطالب باستكمال المحاولة إذا غادر الصفحة أو انقطع اتصاله. عند الإيقاف، يُحتسب خروج الطالب ضمن سجل المحاولة." checked={allowResume} onChange={(event) => setAllowResume(event.target.checked)} />
            </div>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-[16px] font-semibold text-ink">الأسئلة</h2>
              <p className="mt-1 text-[12px] text-muted">{formatNumber(questions.length)} سؤال · {formatNumber(totalPoints)} درجة</p>
            </div>
            <Badge tone="primary">{formatDuration(durationMinutes || 0)}</Badge>
          </div>

          <AnimatePresence initial={false}>
            {questions.map((question, index) => (
              <QuestionEditor
                key={question.id}
                question={question}
                index={index}
                total={questions.length}
                onChange={(next) => updateQuestion(index, next)}
                onRemove={() => removeQuestion(index)}
                onMove={(direction) => moveQuestion(index, direction)}
              />
            ))}
          </AnimatePresence>

          <button type="button" onClick={() => setTypePicker(true)} className="flex min-h-14 items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-surface/50 py-4 text-[13px] font-bold text-muted transition hover:border-primary/40 hover:bg-primary-soft/40 hover:text-primary">
            <Plus size={16} /> إضافة سؤال جديد
          </button>
        </div>

        <aside className="grid content-start gap-3 xl:sticky xl:top-[90px]">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-[14px] font-semibold text-ink">ملخص الامتحان</h3><Sparkles size={15} className="text-primary" /></div>
            <dl className="grid gap-2">
              {[
                ['العنوان', title || 'بدون عنوان'],
                ['المرحلة', stage || 'غير محددة'],
                ['الصف', grade || 'غير محدد'],
                ['الأسئلة', `${formatNumber(questions.length)} سؤال`],
                ['الدرجة الكلية', `${formatNumber(totalPoints)} درجة`],
                ['المدة', formatDuration(durationMinutes || 0)],
                ['المحاولات', `${formatNumber(maxAttempts)} محاولة`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                  <dt className="text-[11.5px] text-muted">{label}</dt>
                  <dd className="max-w-[160px] truncate text-left text-[12px] font-bold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 rounded-[11px] bg-surface-soft p-3 text-[11px] leading-5 text-muted">
              <span className="mb-1 flex items-center gap-1 font-bold text-ink"><Info size={12} className="text-primary" />بعد الحفظ</span>
              سيُحفظ الامتحان كمسودة. انشره ثم افتح الجلسة من صفحة الإدارة، وسيظهر تلقائياً للطلاب المؤهلين في المرحلة والصف المختارين.
            </div>
            <Button type="submit" loading={busy} icon={Save} className="mt-3 w-full">حفظ الامتحان</Button>
          </Card>

          <Card className="p-4">
            <h3 className="text-[12.5px] font-bold text-ink">نصائح سريعة</h3>
            <ul className="mt-2 grid gap-2 text-[11.5px] leading-5 text-muted">
              <li className="flex gap-1.5"><CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald" />اجعل عنوان الامتحان واضحاً ومحدداً.</li>
              <li className="flex gap-1.5"><CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald" />وزّع الدرجات بما يعكس أهمية كل سؤال.</li>
              <li className="flex gap-1.5"><CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald" />راجع الأسئلة المقالية يدوياً بعد التسليم.</li>
            </ul>
          </Card>
        </aside>
      </form>

      <Modal
        open={typePicker}
        onClose={() => setTypePicker(false)}
        title="اختر نوع السؤال"
        description="يمكنك تغيير النوع لاحقاً من داخل بطاقة السؤال."
        icon={ListChecks}
        size="lg"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {questionTypes.map((type) => (
            <button key={type.value} type="button" onClick={() => addQuestion(type.value)} className="flex items-start gap-3 rounded-[13px] border border-line bg-surface-soft p-3.5 text-right transition hover:border-primary/40 hover:bg-primary-soft/40">
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface text-primary shadow-sm"><type.icon size={17} /></span>
              <span><strong className="block text-[13px] text-ink">{type.label}</strong><span className="mt-0.5 block text-[10.5px] leading-5 text-muted">{type.note}</span></span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={Boolean(created)}
        onClose={() => onCreated(created)}
        title="تم حفظ الامتحان"
        description="الامتحان محفوظ كمسودة. انشره ثم افتح الجلسة، وسيظهر تلقائياً للطلاب المسجلين لديك في المرحلة والصف المختارين."
        icon={CheckCircle2}
        tone="success"
        footer={<Button size="sm" iconEnd={ArrowLeft} onClick={() => onCreated(created)}>إدارة الامتحان</Button>}
      >
        <div className="rounded-[13px] border border-line bg-surface-soft p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-bold text-muted">الخطوة التالية</span>
            <span className="text-[11px] text-primary">انشر ثم افتح الجلسة</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
            <span className="text-[11.5px] font-bold text-muted">الطلاب</span>
            <span className="text-[11px] text-primary">المطابقون للمرحلة والصف</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
