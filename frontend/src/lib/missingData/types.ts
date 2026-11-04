/** Missing academic data requests. Shapes mirror what a future /api/missing-data backend would return. */
import type { AttachmentMeta } from "@/lib/support/types";

export type { AttachmentMeta };

export type RequestStatus = "new" | "in_progress" | "submitted" | "needs_revision" | "completed";
/** Who fills the form: course content goes to a teacher, specification data to the coordinator, plan-level
 *  data to the head of department. A request can also be forwarded up to the dean. */
export type ResponsibleRole = "teacher" | "coordinator" | "head" | "dean";
export type FieldType = "text" | "textarea" | "number" | "select" | "date" | "file";
export type FieldValue = string | AttachmentMeta | null;

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  help?: string;
  options?: string[];
  min?: number;
  max?: number;
  /** Regular expression the text must match, with the message shown when it does not. */
  pattern?: string;
  patternHint?: string;
}

export interface FormTemplate {
  id: string;
  title: string;
  role: ResponsibleRole;
  issue: string;
  fields: FormField[];
  /** Extra cross-field check (e.g. weights must total 100). Returns an error message or null. */
  check?: (values: Record<string, FieldValue>) => string | null;
}

export interface HistoryEntry {
  id: string;
  at: string;
  actorName: string;
  action: string;
  note: string | null;
}

export interface MissingDataRequest {
  id: string;
  number: number;
  program: string;
  course: { id: number; code: string; title: string };
  templateId: string;
  issueTitle: string;
  issueDetail: string;
  /** A real document of the course, when the request was created from one. */
  document: { id: number; name: string } | null;
  /** A real question in the decision center, when linked. */
  questionId: number | null;
  assignee: { id: number; name: string; role: ResponsibleRole };
  createdBy: string;
  status: RequestStatus;
  escalated: boolean;
  dueDate: string | null;
  values: Record<string, FieldValue>;
  evidence: AttachmentMeta[];
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  history: HistoryEntry[];
  /** userId -> when that user last opened the request; drives the in-app update notices. */
  seenBy: Record<string, string>;
  /** "demo" = sample shipped with the prototype; never presented as an analysis result. */
  source: "demo" | "manual";
  /** The course coordinator when the request was opened: a teacher forwards to them. */
  coordinator?: { id: number; name: string } | null;
  /** Everyone the request was assigned to, so they keep following it after forwarding it up. */
  participants?: number[];
}

/** The signed-in user as the prototype needs them. Role decisions come from /api/auth/me. */
export interface MdViewer {
  id: number;
  name: string;
  role: "dean" | "head" | "faculty" | "team";
  program: string | null;
}

export interface NewRequestInput {
  course: MissingDataRequest["course"];
  program: string;
  templateId: string;
  assignee: MissingDataRequest["assignee"];
  document: MissingDataRequest["document"];
  questionId: number | null;
  dueDate: string | null;
  note: string;
  coordinator?: { id: number; name: string } | null;
}

/** A shipped sample. `key` lets new samples be added to a browser that already has older ones;
 *  `submitted` puts the sample straight into the reviewer's queue with these answers. */
export interface SampleInput extends NewRequestInput {
  key: string;
  submitted?: { values: Record<string, FieldValue>; byName: string };
}

/** The operations the UI needs; an API-backed implementation provides the same methods. */
export interface MissingDataService {
  list(viewer: MdViewer): Promise<MissingDataRequest[]>;
  create(viewer: MdViewer, input: NewRequestInput): Promise<MissingDataRequest>;
  saveDraft(id: string, viewer: MdViewer, values: Record<string, FieldValue>, evidence: AttachmentMeta[]): Promise<MissingDataRequest>;
  submit(id: string, viewer: MdViewer, values: Record<string, FieldValue>, evidence: AttachmentMeta[]): Promise<MissingDataRequest>;
  accept(id: string, viewer: MdViewer, note: string): Promise<MissingDataRequest>;
  sendBack(id: string, viewer: MdViewer, note: string): Promise<MissingDataRequest>;
  escalate(id: string, viewer: MdViewer, note: string): Promise<MissingDataRequest>;
  /** The person filling the form hands it to the next level: teacher → coordinator → head → dean. */
  forward(id: string, viewer: MdViewer, note: string): Promise<MissingDataRequest>;
  addNote(id: string, viewer: MdViewer, note: string): Promise<MissingDataRequest>;
  markSeen(id: string, viewer: MdViewer): Promise<void>;
  seedSamples(samples: SampleInput[]): Promise<void>;
  reset(): Promise<void>;
  subscribe(onChange: () => void): () => void;
}

export const STATUS_AR: Record<RequestStatus, { label: string; cls: string }> = {
  new: { label: "جديد", cls: "bg-sky-50 text-royal" },
  in_progress: { label: "قيد الاستكمال", cls: "bg-amber-50 text-amber-800" },
  submitted: { label: "تم الإرسال", cls: "bg-royal-50 text-royal" },
  needs_revision: { label: "يحتاج مراجعة", cls: "bg-red-50 text-red-700" },
  completed: { label: "مكتمل", cls: "bg-leaf-50 text-leaf" },
};

export const ROLE_AR: Record<ResponsibleRole, string> = {
  teacher: "أستاذ المقرر", coordinator: "منسق المقرر", head: "رئيس القسم", dean: "عميد الكلية",
};

export const MAX_TEXT = 2000;
