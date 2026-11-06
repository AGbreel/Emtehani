export const EDUCATION_STAGES = ['ابتدائي', 'إعدادي', 'ثانوي', 'البكالوريا'];

export const GRADES_BY_STAGE = {
  'ابتدائي': [
    'الصف الأول الابتدائي',
    'الصف الثاني الابتدائي',
    'الصف الثالث الابتدائي',
    'الصف الرابع الابتدائي',
    'الصف الخامس الابتدائي',
    'الصف السادس الابتدائي',
  ],
  'إعدادي': [
    'الصف الأول الإعدادي',
    'الصف الثاني الإعدادي',
    'الصف الثالث الإعدادي',
  ],
  'ثانوي': [
    'الصف الأول الثانوي',
    'الصف الثاني الثانوي',
    'الصف الثالث الثانوي',
  ],
  'البكالوريا': [
    'أولى بكالوريا',
    'تانية بكالوريا',
  ],
};

export const SUBJECT_SUGGESTIONS = [
  'رياضيات',
  'لغة عربية',
  'لغة إنجليزية',
  'لغة فرنسية',
  'علوم',
  'فيزياء',
  'كيمياء',
  'أحياء',
  'علوم متكاملة',
  'تاريخ',
  'جغرافيا',
  'فلسفة ومنطق',
  'علم نفس واجتماع',
  'دراسات اجتماعية',
  'اقتصاد وإحصاء',
  'حاسب آلي',
  'تربية دينية',
  'تربية فنية',
];

export function gradesForStage(stage) {
  return GRADES_BY_STAGE[stage] || [];
}

export function currentAcademicYear() {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}/${start + 1}`;
}

export function academicYearOptions(selected) {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const options = [start - 1, start, start + 1, start + 2].map((year) => `${year}/${year + 1}`);
  if (selected && !options.includes(selected)) options.unshift(selected);
  return options;
}

export function isValidEducation(stage, grade) {
  return EDUCATION_STAGES.includes(stage) && gradesForStage(stage).includes(grade);
}
