"use client";

/**
 * Prototype implementation of SupportService on localStorage.
 * Nothing is sent to a server, attachments are stored as name/size/type only,
 * and the data is not trusted for anything: access to the team page is decided by the
 * signed-in role from /api/auth/me, never by what is stored here.
 */
import type { AttachmentMeta, NewTicketInput, SupportService, Ticket, TicketMessage, TicketStatus } from "./types";
import { MAX_BODY, STATUS_AR } from "./types";

const KEY = "aq.support.demo.v1";
const EVENT = "aq-support-change";

interface Stored {
  version: 1;
  nextNumber: number;
  tickets: Ticket[];
}

const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function message(author: TicketMessage["author"], authorName: string, body: string, at = iso(), attachment: AttachmentMeta | null = null): TicketMessage {
  return { id: uid(), author, authorName, body, at, attachment };
}

/** One resolved sample request so the team page is not empty on first use. */
function seed(): Stored {
  const hour = 3600_000;
  return {
    version: 1,
    nextNumber: 2,
    tickets: [{
      id: uid(),
      number: 1,
      ownerId: 0,
      ownerName: "د. طامي الوجيه",
      ownerRole: "عضو هيئة تدريس",
      category: "upload",
      status: "resolved",
      createdAt: iso(26 * hour),
      updatedAt: iso(20 * hour),
      demo: true,
      userSeenAt: iso(20 * hour),
      teamSeenAt: iso(20 * hour),
      messages: [
        message("user", "د. طامي الوجيه", "رفعت ملف ZIP لمقرر Introduction to Computing ولم تظهر بعض الملفات في المكوّن العملي.", iso(26 * hour),
          { name: "lab-folder.zip", size: 2_400_000, type: "application/zip" }),
        message("team", "فريق المشروع", "شكرًا د. طامي. الملفات التي أسماؤها تبدأ بـ ~$ ملفات مؤقتة من Office وتُتجاهل تلقائيًا. أعد حفظ الملفات وارفعها مجددًا.", iso(24 * hour)),
        message("system", "النظام", `غيّر فريق المشروع حالة الطلب إلى «${STATUS_AR.resolved.label}»`, iso(20 * hour)),
      ],
    }],
  };
}

function isStored(v: unknown): v is Stored {
  return !!v && typeof v === "object" && (v as Stored).version === 1 && Array.isArray((v as Stored).tickets);
}

function load(): Stored {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isStored(parsed)) return parsed;
    }
  } catch {
    // Unreadable or blocked storage: start again from the sample data.
  }
  const fresh = seed();
  save(fresh, false);
  return fresh;
}

function save(data: Stored, notify = true) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked (e.g. private mode): the change lives until the page reloads.
  }
  if (notify) window.dispatchEvent(new Event(EVENT));
}

function update(ticketId: string, change: (t: Ticket) => void): Ticket {
  const data = load();
  const t = data.tickets.find((x) => x.id === ticketId);
  if (!t) throw new Error("الطلب غير موجود");
  change(t);
  save(data);
  return t;
}

function cleanBody(body: string): string {
  const text = body.trim();
  if (!text) throw new Error("اكتب نص الرسالة");
  if (text.length > MAX_BODY) throw new Error(`النص أطول من ${MAX_BODY} حرف`);
  return text;
}

const newestFirst = (a: Ticket, b: Ticket) => b.updatedAt.localeCompare(a.updatedAt);

export const mockSupportService: SupportService = {
  async listMine(actor) {
    // The sample ticket belongs to the demo persona, matched by name since it has no real user id.
    return load().tickets.filter((t) => t.ownerId === actor.id || (t.demo && t.ownerName === actor.name)).sort(newestFirst);
  },

  async listAll() {
    return load().tickets.sort(newestFirst);
  },

  async create(actor, input: NewTicketInput) {
    const body = cleanBody(input.body);
    const data = load();
    const now = iso();
    const ticket: Ticket = {
      id: uid(), number: data.nextNumber++, ownerId: actor.id, ownerName: actor.name, ownerRole: actor.roleAr,
      category: input.category, status: "new", createdAt: now, updatedAt: now, userSeenAt: now, teamSeenAt: null,
      messages: [message("user", actor.name, body, now, input.attachment)],
    };
    data.tickets.push(ticket);
    save(data);
    return ticket;
  },

  async reply(ticketId, actor, side, body, attachment) {
    const text = cleanBody(body);
    return update(ticketId, (t) => {
      const now = iso();
      t.messages.push(message(side, side === "team" ? `فريق المشروع · ${actor.name}` : actor.name, text, now, attachment));
      if (side === "team") {
        t.teamSeenAt = now;
        if (t.status === "new") t.status = "in_progress";
      } else {
        t.userSeenAt = now;
        if (t.status === "resolved") {
          t.status = "in_progress";
          t.messages.push(message("system", "النظام", "أُعيد فتح الطلب بعد رد جديد من صاحبه", now));
        }
      }
      t.updatedAt = now;
    });
  },

  async setStatus(ticketId, actor, status: TicketStatus) {
    return update(ticketId, (t) => {
      if (t.status === status) return;
      const now = iso();
      t.status = status;
      t.messages.push(message("system", "النظام", `غيّر ${actor.name} حالة الطلب إلى «${STATUS_AR[status].label}»`, now));
      t.teamSeenAt = now;
      t.updatedAt = now;
    });
  },

  async markSeen(ticketId, side) {
    const data = load();
    const t = data.tickets.find((x) => x.id === ticketId);
    if (!t) return;
    const now = iso();
    if (side === "user") t.userSeenAt = now;
    else t.teamSeenAt = now;
    save(data);
  },

  subscribe(onChange) {
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) onChange(); };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  },
};
