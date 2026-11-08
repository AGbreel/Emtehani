export const PAYMENT_METHODS = [
  { value: 'InstaPay', label: 'إنستا باي' },
  { value: 'VodafoneCash', label: 'فودافون كاش' },
  { value: 'BankTransfer', label: 'تحويل بنكي' },
  { value: 'Cash', label: 'نقدي (تسليم للإدارة)' },
  { value: 'Online', label: 'أونلاين' },
];

export const METHOD_LABELS = Object.fromEntries(PAYMENT_METHODS.map((item) => [item.value, item.label]));

export function methodLabel(code) {
  return METHOD_LABELS[code] || code || '';
}
