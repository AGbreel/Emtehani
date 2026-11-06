import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidPhone,
  isValidStudentName,
  nameParts,
  normalizeDisplayName,
  parentNameError,
  phoneDigits,
  studentFullNameError,
} from '../src/lib/validation.js';

test('normalizeDisplayName collapses repeated whitespace without changing letters', () => {
  assert.equal(normalizeDisplayName('  سارة   أحمد  محمد علي  '), 'سارة أحمد محمد علي');
  assert.equal(normalizeDisplayName(null), '');
});

test('nameParts counts real whitespace-separated segments', () => {
  assert.equal(nameParts('سارة أحمد محمد علي').length, 4);
  assert.equal(nameParts('سارة  أحمد').length, 2);
});

test('a student name must contain at least four parts', () => {
  assert.match(studentFullNameError('سارة أحمد علي'), /رباع/);
  assert.equal(studentFullNameError('سارة أحمد محمد علي'), '');
  assert.equal(isValidStudentName('سارة أحمد محمد علي'), true);
});

test('student names reject digits, short parts, punctuation-only input, and repeated placeholders', () => {
  assert.match(studentFullNameError('سارة أحمد محمد 1234'), /أرقام/);
  assert.match(studentFullNameError('سارة أحمد محمد ع'), /حرفين/);
  assert.match(studentFullNameError('!!! ---'), /حروف/);
  assert.match(studentFullNameError('طالب طالب طالب طالب'), /مكرر/);
});

test('guardian names are optional on legacy edits but validated when supplied', () => {
  assert.equal(parentNameError(''), '');
  assert.equal(parentNameError('أحمد محمد علي حسن'), '');
  assert.match(parentNameError('12345'), /أرقام/);
  assert.match(parentNameError('!!!'), /حروف/);
  assert.match(parentNameError('', { required: true }), /أدخل/);
});

test('Arabic diacritics inside a name part remain valid', () => {
  assert.equal(studentFullNameError('سارة أحمد محمّد علي'), '');
});

test('phone helpers normalise separators and validate ranges', () => {
  assert.equal(phoneDigits('0100 123-4567'), '01001234567');
  assert.equal(isValidPhone('+201001234567'), true);
  assert.equal(isValidPhone('123'), false);
});
