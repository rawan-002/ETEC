import { BrainCircuit, Code2, Network, ServerCog, type LucideIcon } from "lucide-react";

/**
 * The college's departments, in one place. To open a department for sign-in, set `active: true`
 * (its program must also exist in the backend). Nothing else on the home page needs to change.
 */
export interface Department {
  code: "CS" | "IS" | "IT" | "SE";
  nameAr: string;
  nameEn: string;
  descAr: string;
  icon: LucideIcon;
  active: boolean;
}

export const DEPARTMENTS: Department[] = [
  { code: "CS", nameAr: "علوم الحاسب", nameEn: "Computer Science", descAr: "الخوارزميات والبرمجة والأنظمة الذكية", icon: BrainCircuit, active: true },
  { code: "IS", nameAr: "نظم المعلومات", nameEn: "Information Systems", descAr: "نظم الأعمال وقواعد البيانات وتحليل البيانات", icon: Network, active: false },
  { code: "IT", nameAr: "تقنية المعلومات", nameEn: "Information Technology", descAr: "البنية التحتية والشبكات والأمن السيبراني", icon: ServerCog, active: false },
  { code: "SE", nameAr: "هندسة البرمجيات", nameEn: "Software Engineering", descAr: "تصميم البرمجيات وتطويرها وضمان جودتها", icon: Code2, active: false },
];

export const COLLEGE_AR = "كلية الحاسبات وتقنية المعلومات";
export const PLATFORM_AR = "منصة الجودة الأكاديمية الذكية";

export const departmentByCode = (code: string | null | undefined) => DEPARTMENTS.find((d) => d.code === code) ?? null;

/** The department chosen on the home page, remembered for the sign-in page (interface only, not a permission). */
const KEY = "aq.department";
export function rememberDepartment(code: string) {
  try { window.sessionStorage.setItem(KEY, code); } catch { /* blocked storage */ }
}
export function chosenDepartment(): string | null {
  try { return window.sessionStorage.getItem(KEY); } catch { return null; }
}
