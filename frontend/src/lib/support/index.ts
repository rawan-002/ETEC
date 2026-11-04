"use client";

import { useCallback, useEffect, useState } from "react";
import type { Me } from "@/lib/types";
import { mockSupportService } from "./mockService";
import type { SupportActor, SupportService, Ticket } from "./types";

export type {
  AttachmentMeta, NewTicketInput, SupportActor, SupportService, Ticket, TicketCategory, TicketMessage, TicketStatus,
} from "./types";
export { CATEGORY_AR, MAX_ATTACHMENT_MB, MAX_BODY, STATUS_AR, unreadForTeam, unreadForUser } from "./types";

/** Swap this for an API-backed implementation when the backend exists; the UI only uses SupportService. */
export const support: SupportService = mockSupportService;

/** The prototype keeps requests in this browser only; the UI says so wherever requests are shown. */
export const SUPPORT_IS_DEMO = true;

export function actorFrom(me: Me): SupportActor {
  return { id: me.id, name: me.name, roleAr: me.role_ar };
}

/** The signed-in member's own requests ("mine") or every request ("all", team page). */
export function useTickets(scope: "mine" | "all", me: Me | null) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);

  const reload = useCallback(async () => {
    if (!me) return;
    setTickets(scope === "all" ? await support.listAll() : await support.listMine(actorFrom(me)));
  }, [scope, me]);

  useEffect(() => {
    reload();
    return support.subscribe(reload);
  }, [reload]);

  return { tickets, reload };
}
