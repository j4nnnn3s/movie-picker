import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE, verifySession } from "@/lib/auth";

export default function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const authenticated = verifySession(request.cookies.get(AUTH_COOKIE)?.value);
  const isLogin = path === "/login" || path === "/api/login";

  if (isLogin) {
    if (authenticated && path === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }
  if (authenticated) return NextResponse.next();
  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", path);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest).*)"],
};
