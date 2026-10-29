export const EDUCATION_STAGES = ["ابتدائي", "إعدادي", "ثانوي", "بكالوريا"];

export const GRADES_BY_STAGE = {
  ابتدائي: [
    "الصف الأول الابتدائي",
    "الصف الثاني الابتدائي",
    "الصف الثالث الابتدائي",
    "الصف الرابع الابتدائي",
    "الصف الخامس الابتدائي",
    "الصف السادس الابتدائي",
  ],
  إعدادي: [
    "الصف الأول الإعدادي",
    "الصف الثاني الإعدادي",
    "الصف الثالث الإعدادي",
  ],
  ثانوي: ["الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي"],
  بكالوريا: ["السنة الأولى بكالوريا", "السنة الثانية بكالوريا"],
};

export function gradesForStage(stage) {
  return GRADES_BY_STAGE[stage] || [];
}

export function isValidEducation(stage, grade) {
  return (
    EDUCATION_STAGES.includes(stage) && gradesForStage(stage).includes(grade)
  );
}
