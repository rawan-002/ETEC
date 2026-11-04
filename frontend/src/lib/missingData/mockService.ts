/**
 * Prototype implementation of MissingDataService on localStorage. No request reaches the server,
 * no document or decision is changed, attachments are kept as name/size/type only, and the stored
 * data is never trusted for access: what a user may do is computed from the signed-in role.
 */
import { canAddNote, canEdit, canEscalate, canForward, canReview, canSee, nextUp, reviewerRole, templateById, validate } from "./templates";
import type { AttachmentMeta, FieldValue, MdViewer, MissingDataRequest, MissingDataService, NewRequestInput } from "./types";
import { MAX_TEXT, ROLE_AR, STATUS_AR } from "./types";

const KEY = "aq.missing-data.demo.v1";
const EVENT = "aq-missing-data-change";

interface Stored {
  version: 1;
  nextNumber: number;
  requests: MissingDataRequest[];
  /** Keys of the samples already added to this browser. */
  seeded?: string[];
}

const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function isStored(v: unknown): v is Stored {
  return !!v && typeof v === "object" && (v as Stored).version === 1 && Array.isArray((v as Stored).requests);
}

function load(): Stored {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isStored(parsed)) return parsed;
    }
  } catch {
    // Unreadable or blocked storage: start empty.
  }
  return { version: 1, nextNumber: 1, requests: [] };
}

function save(data: Stored) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: the change lives until the page reloads.
  }
  window.dispatchEvent(new Event(EVENT));
}

function cleanNote(note: string, required: boolean): string | null {
  const text = note.trim();
  if (!text) {
    if (required) throw new Error("اكتب ملاحظة توضح السبب");
    return null;
  }
  if (text.length > MAX_TEXT) throw new Error(`الملاحظة أطول من ${MAX_TEXT} حرف`);
  return text;
}

/** Load, check, change, log and save one request. */
function act(id: string, viewer: MdViewer, allowed: (r: MissingDataRequest) => boolean, change: (r: MissingDataRequest) => string, note: string | null = null) {
  const data = load();
  const r = data.requests.find((x) => x.id === id);
  if (!r || !canSee(r, viewer)) throw new Error("الطلب غير موجود");
  if (!allowed(r)) throw new Error("هذا الإجراء غير متاح لك في حالة الطلب الحالية");
  const action = change(r);
  const now = iso();
  r.history.push({ id: uid(), at: now, actorName: viewer.name, action, note });
  r.updatedAt = now;
  r.seenBy[String(viewer.id)] = now;
  r.participants = [...new Set([...(r.participants ?? []), viewer.id])];
  save(data);
  return r;
}

function cleanValues(values: Record<string, FieldValue>): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === "string") {
      if (v.length > MAX_TEXT) throw new Error(`النص أطول من ${MAX_TEXT} حرف`);
      out[k] = v;
    } else if (v && typeof v === "object") {
      out[k] = { name: v.name, size: v.size, type: v.type }; // never the file content
    } else out[k] = null;
  }
  return out;
}

const metaOnly = (list: AttachmentMeta[]) => list.slice(0, 10).map(({ name, size, type }) => ({ name, size, type }));

function build(data: Stored, input: NewRequestInput, createdBy: string, source: MissingDataRequest["source"], at: string): MissingDataRequest {
  const t = templateById(input.templateId);
  return {
    id: uid(), number: data.nextNumber++, program: input.program, course: input.course, templateId: t.id,
    issueTitle: t.title, issueDetail: input.note.trim() || t.issue, document: input.document, questionId: input.questionId,
    assignee: input.assignee, createdBy, status: "new", escalated: false, dueDate: input.dueDate, values: {}, evidence: [],
    reviewNote: null, createdAt: at, updatedAt: at, seenBy: {}, source,
    coordinator: input.coordinator ?? null, participants: input.assignee.id > 0 ? [input.assignee.id] : [],
    history: [{ id: uid(), at, actorName: createdBy, action: `أنشأ الطلب وأسنده إلى ${input.assignee.name}`, note: null }],
  };
}

const newestFirst = (a: MissingDataRequest, b: MissingDataRequest) => b.updatedAt.localeCompare(a.updatedAt);

export const mockMissingDataService: MissingDataService = {
  async list(viewer) {
    return load().requests.filter((r) => canSee(r, viewer)).sort(newestFirst);
  },

  async create(viewer, input) {
    if (viewer.role !== "head" || viewer.program !== input.program) throw new Error("ينشئ الطلبات رئيس القسم المختص");
    cleanNote(input.note, false);
    const data = load();
    const r = build(data, input, viewer.name, "manual", iso());
    data.requests.push(r);
    save(data);
    return r;
  },

  async saveDraft(id, viewer, values, evidence) {
    return act(id, viewer, (r) => canEdit(r, viewer), (r) => {
      r.values = cleanValues(values);
      r.evidence = metaOnly(evidence);
      r.status = "in_progress";
      return "حفظ مسودة";
    });
  },

  async submit(id, viewer, values, evidence) {
    return act(id, viewer, (r) => canEdit(r, viewer), (r) => {
      const clean = cleanValues(values);
      const errors = validate(templateById(r.templateId), clean);
      if (Object.keys(errors).length) throw new Error(errors._form ?? "أكمل الحقول الإلزامية وتأكد من صيغتها قبل الإرسال");
      r.values = clean;
      r.evidence = metaOnly(evidence);
      const reviewer = reviewerRole(r);
      if (!reviewer) {
        r.status = "completed";
        return "اعتمد البيانات (لا توجد مراجعة أعلى)";
      }
      r.status = "submitted";
      return `أرسل البيانات إلى ${ROLE_AR[reviewer]} للمراجعة`;
    });
  },

  async forward(id, viewer, note) {
    const text = cleanNote(note, false);
    return act(id, viewer, (r) => canForward(r, viewer), (r) => {
      const to = nextUp(r)!;
      r.assignee = to;
      r.escalated = false;
      r.status = "new"; // new for the person receiving it; anything already entered is kept
      if (to.id > 0) r.participants = [...new Set([...(r.participants ?? []), to.id])];
      return `حوّل الطلب إلى مسؤول أعلى: ${to.name}${to.role === "coordinator" ? ` (${ROLE_AR.coordinator})` : ""}`;
    }, text);
  },

  async accept(id, viewer, note) {
    const text = cleanNote(note, false);
    return act(id, viewer, (r) => canReview(r, viewer), (r) => {
      r.status = "completed";
      r.reviewNote = text;
      return `قبل البيانات — «${STATUS_AR.completed.label}»`;
    }, text);
  },

  async sendBack(id, viewer, note) {
    const text = cleanNote(note, true);
    return act(id, viewer, (r) => canReview(r, viewer), (r) => {
      r.status = "needs_revision";
      r.reviewNote = text;
      return "أعاد الطلب للاستكمال";
    }, text);
  },

  async escalate(id, viewer, note) {
    const text = cleanNote(note, false);
    return act(id, viewer, (r) => canEscalate(r, viewer), (r) => {
      r.escalated = true;
      return "صعّد الطلب إلى العميد";
    }, text);
  },

  async addNote(id, viewer, note) {
    const text = cleanNote(note, true);
    return act(id, viewer, () => canAddNote(viewer), () => "أضاف ملاحظة فنية", text);
  },

  async markSeen(id, viewer) {
    const data = load();
    const r = data.requests.find((x) => x.id === id);
    if (!r) return;
    r.seenBy[String(viewer.id)] = iso();
    save(data);
  },

  async seedSamples(samples) {
    const data = load();
    // Browsers seeded before keys existed already hold the first sample set (one per form type).
    const seeded = data.seeded ?? data.requests.filter((r) => r.source === "demo").map((r) => `v1:${r.templateId}`);
    const fresh = samples.filter((s) => !seeded.includes(s.key));
    if (!fresh.length) return;
    const hour = 3600_000;
    fresh.forEach((s, i) => {
      const r = build(data, s, "بيانات تجريبية", "demo", iso((fresh.length - i) * 5 * hour));
      if (s.submitted) {
        const at = iso((fresh.length - i) * 5 * hour - hour);
        r.values = cleanValues(s.submitted.values);
        r.status = "submitted";
        r.updatedAt = at;
        r.history.push({ id: uid(), at, actorName: s.submitted.byName, action: "أرسل البيانات لرئيس القسم للمراجعة", note: null });
      }
      data.requests.push(r);
      seeded.push(s.key);
    });
    data.seeded = seeded;
    save(data);
  },

  async reset() {
    try { window.localStorage.removeItem(KEY); } catch { /* blocked storage */ }
    window.dispatchEvent(new Event(EVENT));
  },

  subscribe(onChange) {
    const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === null) onChange(); };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  },
};
