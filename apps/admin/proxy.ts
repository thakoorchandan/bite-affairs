import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { tokenCookieOptions } from "@/lib/auth/cookies";

/**
 * Optimistic gate for the whole admin app: anyone without an ADMIN session is sent to /login.
 * This is only a UX shortcut: every page, Server Action and API route re-verifies the user
 * against the database (requireAdminPage / requireAdmin).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET, ...tokenCookieOptions("admin") });
  const isAdmin = token?.role === "ADMIN";

  // /login is always reachable. A cookie alone proves nothing (the database may no longer have that
  // user, e.g. after a dev restart), so redirecting signed-in admins away from here is decided by the
  // login page after it verifies the user; doing it here would loop with requireAdminPage().
  if (pathname === "/login") return NextResponse.next();
  if (!isAdmin && pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?callbackUrl=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Static files (public/ images, icons) must stay reachable for the signed-out login page.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|reference/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml)$).*)"],
};
