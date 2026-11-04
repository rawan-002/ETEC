/** Technical support requests. The shapes mirror what a future /api/support backend would return. */

export type TicketCategory = "login" | "upload" | "ui" | "other";
export type TicketStatus = "new" | "in_progress" | "resolved";

/** Only the file's description is kept; the file content never leaves the browser tab. */
export interface AttachmentMeta {
  name: string;
  size: number;
  type: string;
}

export interface TicketMessage {
  id: string;
  author: "user" | "team" | "system";
  authorName: string;
  body: string;
  at: string;
  attachment: AttachmentMeta | null;
}

export interface Ticket {
  id: string;
  number: number;
  ownerId: number;
  ownerName: string;
  ownerRole: string;
  category: TicketCategory;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
  userSeenAt: string;
  teamSeenAt: string | null;
  /** Sample data shipped with the prototype. */
  demo?: boolean;
}

export interface SupportActor {
  id: number;
  name: string;
  roleAr: string;
}

export interface NewTicketInput {
  category: TicketCategory;
  body: string;
  attachment: AttachmentMeta | null;
}

/** The operations the UI needs. A backend implementation only has to provide the same methods. */
export interface SupportService {
  listMine(actor: SupportActor): Promise<Ticket[]>;
  listAll(): Promise<Ticket[]>;
  create(actor: SupportActor, input: NewTicketInput): Promise<Ticket>;
  reply(ticketId: string, actor: SupportActor, side: "user" | "team", body: string, attachment: AttachmentMeta | null): Promise<Ticket>;
  setStatus(ticketId: string, actor: SupportActor, status: TicketStatus): Promise<Ticket>;
  markSeen(ticketId: string, side: "user" | "team"): Promise<void>;
  /** Called whenever tickets change (here: in this tab or another tab). Returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void;
}

export const CATEGORY_AR: Record<TicketCategory, string> = {
  login: "تسجيل الدخول",
  upload: "رفع الملفات",
  ui: "مشكلة في الواجهة",
  other: "أخرى",
};

export const STATUS_AR: Record<TicketStatus, { label: string; cls: string }> = {
  new: { label: "جديد", cls: "bg-sky-50 text-royal" },
  in_progress: { label: "قيد المعالجة", cls: "bg-amber-50 text-amber-800" },
  resolved: { label: "تم الحل", cls: "bg-leaf-50 text-leaf" },
};

export const MAX_BODY = 2000;
export const MAX_ATTACHMENT_MB = 10;

/** A team or system message the requester has not opened yet. */
export function unreadForUser(t: Ticket): boolean {
  return t.messages.some((m) => m.author !== "user" && m.at > t.userSeenAt);
}

/** A new ticket, or a requester message the team has not opened yet. */
export function unreadForTeam(t: Ticket): boolean {
  return t.status === "new" || t.messages.some((m) => m.author === "user" && (!t.teamSeenAt || m.at > t.teamSeenAt));
}
