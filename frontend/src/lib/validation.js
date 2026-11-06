/**
 * Shared display-name validation for student accounts.
 *
 * The backend remains authoritative; these helpers only give immediate feedback.
 * Existing accounts are never rewritten automatically, but any new registration
 * or profile edit must provide a real four-part name.
 */

export function normalizeDisplayName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

export function nameParts(value) {
  const normalized = normalizeDisplayName(value);
  return normalized ? normalized.split(' ') : [];
}

export function studentFullNameError(value) {
  if (normalizeDisplayName(value).replace(/[^\p{L}]/gu, '').length === 0) return 'أدخل اسماً صحيحاً يحتوي على حروف.';
  const parts = nameParts(value);
  if (parts.length < 4) return 'اكتب اسم الطالب رباعياً (أربعة أسماء على الأقل).';
  if (parts.length > 8) return 'اسم الطالب طويل جداً. اكتب الاسم الرباعي فقط.';
  if (new Set(parts).size < 3) return 'أدخل اسماً حقيقياً يتكون من أسماء مختلفة، وليس اسماً مكرراً أو وهمياً.';
  for (const part of parts) {
    if (part.length < 2) return 'كل جزء من الاسم يجب أن يحتوي على حرفين على الأقل.';
    if (/\d/.test(part)) return 'لا يمكن أن يحتوي الاسم على أرقام.';
    if (!/^[\p{L}\p{M}'-]+$/u.test(part)) return 'استخدم حروفاً عربية أو إنجليزية فقط في الاسم.';
  }
  return '';
}

export function isValidStudentName(value) {
  return studentFullNameError(value) === '';
}

export function parentNameError(value, { required = false } = {}) {
  const normalized = normalizeDisplayName(value);
  if (!normalized) return required ? 'أدخل اسم ولي الأمر.' : '';
  if (normalized.length < 3 || normalized.length > 200) return 'أدخل اسم ولي الأمر بين 3 و200 حرف.';
  if (/\d/.test(normalized)) return 'اسم ولي الأمر لا يمكن أن يحتوي على أرقام.';
  if (!/^[\p{L}\p{M}\s'-]+$/u.test(normalized)) return 'استخدم حروفاً عربية أو إنجليزية فقط في اسم ولي الأمر.';
  return '';
}

export function phoneDigits(value) {
  return String(value ?? '').replace(/[\s-]/g, '');
}

export function isValidPhone(value) {
  return /^\+?\d{7,15}$/.test(phoneDigits(value));
}
