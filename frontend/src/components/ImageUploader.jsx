import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ImagePlus, Link2, LoaderCircle, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { request, assetUrl } from '../lib/api';
import { cn } from './ui';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_MB = 4;

export default function ImageUploader({
  token,
  value = '',
  onChange,
  label = 'الصورة',
  hint,
  aspect = 'square',
  className = '',
  disabled = false,
  allowLink = true,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState(value.startsWith('http') ? value : '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (value.startsWith('http')) setLinkValue(value);
  }, [value]);

  async function upload(file) {
    if (!file) return;
    setError('');
    if (!ACCEPTED.includes(file.type)) {
      setError('اختر صورة PNG أو JPG أو WebP.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`حجم الصورة يجب ألا يزيد عن ${MAX_MB} ميجابايت.`);
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await request('/api/uploads/image', { token, method: 'POST', body: form, timeoutMs: 60000 });
      onChange?.(result?.url || '');
    } catch (err) {
      setError(err.message || 'تعذر رفع الصورة. حاول مرة أخرى.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    if (disabled || busy) return;
    upload(event.dataTransfer?.files?.[0]);
  }

  function clear() {
    setError('');
    onChange?.('');
  }

  function applyLink() {
    const next = linkValue.trim();
    if (next && !/^https:\/\//i.test(next)) {
      setError('الرابط يجب أن يبدأ بـ https:// أو استخدم رفع صورة من الجهاز.');
      return;
    }
    setError('');
    onChange?.(next);
    setLinkOpen(false);
  }

  const previewClass = aspect === 'cover' ? 'aspect-[16/6] w-full' : 'aspect-square w-24';

  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-ink">{label}</span>
        {value ? (
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || busy} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[10.5px] font-bold text-muted transition hover:text-primary disabled:opacity-50">
              <RefreshCw size={11} />تغيير
            </button>
            <button type="button" onClick={clear} disabled={disabled || busy} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[10.5px] font-bold text-muted transition hover:border-danger/40 hover:text-danger disabled:opacity-50">
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
          'relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-[14px] border border-dashed bg-surface-soft/70 p-3 text-center transition',
          dragging ? 'border-primary bg-primary-soft ring-4 ring-primary-soft' : 'border-line-strong',
          aspect === 'cover' ? 'min-h-28' : 'min-h-32',
          disabled && 'opacity-60',
        )}
      >
        {value ? (
          <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} className={cn('overflow-hidden rounded-[12px] border border-line bg-surface', previewClass)}>
            <img src={assetUrl(value)} alt="" className="size-full object-cover" />
          </motion.div>
        ) : (
          <span className="grid size-11 place-items-center rounded-[13px] bg-primary-soft text-primary">
            <ImagePlus size={20} />
          </span>
        )}

        <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-[11.5px] font-bold text-white shadow-[0_12px_24px_-16px_var(--app-primary)] transition hover:bg-primary-strong disabled:opacity-60">
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <UploadCloud size={13} />}
          {busy ? 'جارٍ الرفع...' : value ? 'رفع صورة جديدة' : 'ارفع صورة من جهازك'}
        </button>
        <p className="text-[10px] leading-5 text-subtle">اسحب الصورة وأفلتها هنا · PNG أو JPG أو WebP · حتى {MAX_MB} ميجابايت</p>

        {busy ? <motion.span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.4, repeat: Infinity }} style={{ originX: 0 }} /> : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(event) => upload(event.target.files?.[0])}
        aria-label={label}
      />

      {allowLink ? (
        <div>
          <button type="button" onClick={() => setLinkOpen((open) => !open)} className="inline-flex items-center gap-1 text-[10.5px] font-bold text-muted transition hover:text-primary">
            <Link2 size={11} />استخدام رابط صورة جاهز بدلاً من الرفع
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
