import { NextResponse, type NextRequest } from "next/server";

/** Visitors without a session see the home page at "/"; signed-in users keep their dashboard there.
 *  The session itself is still verified by the backend on every API call. */
export function middleware(req: NextRequest) {
  if (!req.cookies.has("aq_session")) return NextResponse.rewrite(new URL("/home", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
