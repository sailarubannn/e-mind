export type StudentAcademicProfile = {
  educationLevel: string | null;
  grade: number | null;
  stream: string | null;
};

export type AcademicContent = {
  educationLevel: string;
  grade: number | null;
  stream: string | null;
};

export type AcademicLevel = "GRADE" | "O_LEVEL" | "A_LEVEL";

export function academicLevel(value: string | null | undefined): AcademicLevel | null {
  if (!value) return null;
  const normalized = value.trim().toLocaleLowerCase().replace(/[–—]/g, "-");
  if (normalized === "grade 6-11" || normalized === "grade") return "GRADE";
  if (normalized === "gce ordinary level (o/l)" || normalized === "o_level" || normalized === "o level") return "O_LEVEL";
  if (normalized === "gce advanced level (a/l)" || normalized === "a_level" || normalized === "a level") return "A_LEVEL";
  return null;
}

export function gradeRange(level: AcademicLevel) {
  if (level === "GRADE") return { min: 6, max: 11 };
  if (level === "O_LEVEL") return { min: 10, max: 11 };
  return { min: 12, max: 13 };
}

export function gradesForEducationLevel(value: string | null | undefined) {
  const level = academicLevel(value);
  if (!level) return [];
  const range = gradeRange(level);
  return Array.from({ length: range.max - range.min + 1 }, (_, index) => range.min + index);
}

export function isAcademicProfileComplete(profile: StudentAcademicProfile) {
  const level = academicLevel(profile.educationLevel);
  if (!level || !profile.grade) return false;
  const range = gradeRange(level);
  return profile.grade >= range.min && profile.grade <= range.max
    && (level !== "A_LEVEL" || Boolean(profile.stream?.trim()));
}

export function matchesAcademicAudience(profile: StudentAcademicProfile, content: AcademicContent) {
  const level = academicLevel(profile.educationLevel);
  const contentLevel = academicLevel(content.educationLevel);
  if (!level || !contentLevel || !isAcademicProfileComplete(profile) || content.grade !== profile.grade) return false;

  const matchesLevel = contentLevel === level
    || (level === "O_LEVEL" && profile.grade === 11 && contentLevel === "GRADE");
  if (!matchesLevel) return false;
  if (level === "A_LEVEL") {
    return Boolean(profile.stream?.trim() && content.stream?.trim())
      && profile.stream!.trim().toLocaleLowerCase() === content.stream!.trim().toLocaleLowerCase();
  }
  return true;
}

export function isValidAcademicAudience(level: AcademicLevel, grade: number, stream?: string | null) {
  const range = gradeRange(level);
  return Number.isInteger(grade) && grade >= range.min && grade <= range.max
    && (level !== "A_LEVEL" || Boolean(stream?.trim()));
}
