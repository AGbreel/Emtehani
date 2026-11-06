import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { FileText, Film, Link2, LoaderCircle, Music, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { API, assetUrl, getStoredAuth, refreshAccessToken } from '../lib/api';
import { cn } from './ui';

const KINDS = {
  Video: {
    accept: 'video/mp4,video/webm,video/quicktime,video/x-m4v',
    icon: Film,
    title: 'فيديو الدرس',
    hint: 'MP4 أو WebM أو MOV — يُفضّل 720p لتقليل الحجم.',
    allowed: '.mp4,.m4v,.webm,.mov',
  },
  Audio: {
    accept: 'audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav',
    icon: Music,
    title: 'ملف صوتي',
    hint: 'MP3 أو M4A أو WAV أو OGG.',
    allowed: '.mp3,.m4a,.aac,.ogg,.wav',
  },
  Pdf: {
    accept: 'application/pdf,.pdf',
    icon: FileText,
    title: 'ملف PDF',
    hint: 'ملفات PDF فقط.',
    allowed: '.pdf',
  },
  Document: {
    accept: 'application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.rtf',
    icon: FileText,
    title: 'مستند',
    hint: 'PDF أو Word أو PowerPoint أو Excel أو نص.',
    allowed: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.rtf',
  },
};

function postMedia(form, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/api/uploads/media`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = 20 * 60 * 1000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      let payload = {};
      try { payload = JSON.parse(xhr.responseText || '{}'); } catch { payload = {}; }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(payload);
        return;
      }
      const error = new Error(payload.message || (xhr.status === 413
        ? 'حجم الملف أكبر من الحد المسموح على الخادم.'
        : 'تعذر رفع الملف. حاول مرة أخرى.'));
      error.status = xhr.status;
      reject(error);
    };
    xhr.onerror = () => reject(new Error('تعذر الاتصال بالخادم أثناء الرفع. تحقق من الإنترنت ثم حاول مرة أخرى.'));
    xhr.ontimeout = () => reject(new Error('انتهت مهلة الرفع. جرّب ملفاً أصغر أو اتصالاً أسرع.'));
    xhr.send(form);
  });
}

function fileLabel(value) {
  if (!value) return '';
  const clean = value.split('?')[0];
  const name = clean.split('/').pop() || '';
  try { return decodeURIComponent(name); } catch { return name; }
}

export default function MediaUploader({
  token,
  value = '',
  onChange,
  kind = 'Video',
  label,
  hint,
  disabled = false,
  allowLink = true,
  maxMb = 200,
  className = '',
}) {
  const config = KINDS[kind] || KINDS.Video;
  const Icon = config.icon;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState(/^https?:\/\//i.test(value) ? value : '');
  const inputRef = useRef(null);

  function choose() {
    if (disabled || busy) return;
    inputRef.current?.click();
  }

  async function upload(file) {
    if (!file || disabled || busy) return;
    setError('');
    if (file.size > maxMb * 1024 * 1024) {
      setError(`حجم الملف يجب ألا يزيد عن ${maxMb} ميجابايت.`);
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', kind);
      let authToken = getStoredAuth().token || token;
      let result;
      try {
        result = await postMedia(form, authToken, setProgress);
      } catch (err) {
        if (err.status !== 401) throw err;
        const next = await refreshAccessToken();
        if (!next) throw err;
        result = await postMedia(form, next, setProgress);
      }
      onChange?.(result?.url || '');
    } catch (err) {
      setError(err.message || 'تعذر رفع الملف. حاول مرة أخرى.');
    } finally {
      setBusy(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    upload(event.dataTransfer?.files?.[0]);
  }

  function applyLink() {
    const next = linkValue.trim();
    if (next && !/^https?:\/\//i.test(next)) {
      setError('الرابط يجب أن يبدأ بـ http:// أو https:// أو ارفع الملف من جهازك.');
      return;
    }
    setError('');
    onChange?.(next);
    setLinkOpen(false);
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-ink">{label || config.title}</span>
        {value ? (
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={choose} disabled={disabled || busy} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[10.5px] font-bold text-muted transition hover:text-primary disabled:opacity-50">
              <RefreshCw size={11} />تغيير
            </button>
            <button type="button" onClick={() => { setError(''); onChange?.(''); }} disabled={disabled || busy} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[10.5px] font-bold text-muted transition hover:border-danger/40 hover:text-danger disabled:opacity-50">
              <Trash2 size={11} />إزالة
            </button>
          </div>
        ) : null}
      </div>

      <div
        onDragOver={(event) => { event.preventDefault(); if (!disabled && !busy) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative overflow-hidden rounded-[14px] border border-dashed bg-surface-soft/70 p-3 transition',
          dragging ? 'border-primary bg-primary-soft ring-4 ring-primary-soft' : 'border-line-strong',
          disabled && 'opacity-60',
        )}
      >
        {value ? (
          <div className="grid gap-2">
            {kind === 'Video' ? (
              <video src={assetUrl(value)} controls preload="metadata" className="max-h-44 w-full rounded-[10px] bg-black" />
            ) : kind === 'Audio' ? (
              <audio src={assetUrl(value)} controls className="w-full" />
            ) : (
              <a href={assetUrl(value)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[11.5px] font-bold text-primary">
                <Icon size={15} className="shrink-0" />
                <span className="truncate" dir="ltr">{fileLabel(value)}</span>
              </a>
            )}
            <p className="truncate text-[10px] text-subtle" dir="ltr">{fileLabel(value)}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="grid size-11 place-items-center rounded-[13px] bg-primary-soft text-primary">
              <Icon size={20} />
            </span>
            <button type="button" onClick={choose} disabled={disabled || busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-[11.5px] font-bold text-white shadow-[0_12px_24px_-16px_var(--app-primary)] transition hover:bg-primary-strong disabled:opacity-60">
              {busy ? <LoaderCircle size={13} className="animate-spin" /> : <UploadCloud size={13} />}
              {busy ? `جارٍ الرفع ${progress}%` : 'ارفع الملف من جهازك'}
            </button>
            <p className="text-[10px] leading-5 text-subtle">اسحب الملف وأفلته هنا · {config.hint} · حتى {maxMb} ميجابايت</p>
          </div>
        )}

        {busy ? (
          <div className="absolute inset-x-0 bottom-0">
            <motion.span className="block h-1 bg-primary" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut' }} />
          </div>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={config.accept}
        className="hidden"
        onChange={(event) => upload(event.target.files?.[0])}
        aria-label={label || config.title}
      />

      {allowLink ? (
        <div>
          <button type="button" onClick={() => setLinkOpen((open) => !open)} className="inline-flex items-center gap-1 text-[10.5px] font-bold text-muted transition hover:text-primary">
            <Link2 size={11} />لدي رابط جاهز (YouTube / Drive / أي رابط مباشر)
          </button>
          {linkOpen ? (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                dir="ltr"
                value={linkValue}
                onChange={(event) => setLinkValue(event.target.value)}
                placeholder="https://..."
                className="h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-left text-[11.5px] text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary-soft"
              />
              <button type="button" onClick={applyLink} className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-line bg-surface px-3 text-[11.5px] font-bold text-ink transition hover:border-primary/40 hover:text-primary">تثبيت</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-[11px] font-bold text-danger">{error}</p> : hint ? <p className="text-[11px] leading-5 text-muted">{hint}</p> : null}
    </div>
  );
}
