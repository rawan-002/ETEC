export type Role = "dean" | "head" | "faculty" | "team";
export type ComponentKey = "spec" | "theory" | "practical" | "assessment";
export type ComponentStatus = "present" | "missing" | "review" | "na";

export interface Me {
  id: number;
  name: string;
  role: Role;
  role_ar: string;
  department: string | null;
  program: string | null;
  term: string | null;
  needs_course_selection: boolean;
}

export interface Teacher { assignment_id: number; user_id: number; name: string; is_coordinator: boolean }

export interface ComponentState {
  component: ComponentKey;
  label: string;
  status: ComponentStatus;
  documents: number;
  note: string;
}

export interface Course {
  id: number;
  program: string;
  code: string;
  plan_code: string | null;
  spec_code: string | null;
  title: string;
  level: number | null;
  kind: string;
  group: string | null;
  credit_hours: number | null;
  practical: "yes" | "no" | "unknown";
  percent?: number;
  components?: ComponentState[];
  teachers?: Teacher[];
  is_coordinator?: boolean;
}

export interface Doc {
  id: number;
  filename: string;
  archive_path: string | null;
  component: ComponentKey | "other" | null;
  component_label: string;
  status: "processing" | "classified" | "needs_review" | "error" | "duplicate" | "excluded";
  confidence: number | null;
  reason: string | null;
  error: string | null;
  size: number;
  uploaded_at: string;
  uploader: string;
  classified_by: string | null;
  course_id: number;
  course: string;
}

export interface CourseDetail extends Course {
  documents: Doc[];
  findings: { kind: string; message: string }[];
  can_upload: boolean;
  can_set_practical: boolean;
}

export interface ProgramSummary {
  program: string;
  percent: number;
  courses_total: number;
  courses_offered: number;
  courses_complete: number;
  courses_unassigned: number;
  missing_components: number;
  review_components: number;
  distribution_approved: boolean;
  courses: Course[];
}
