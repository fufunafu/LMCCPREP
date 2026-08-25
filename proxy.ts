import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { DEMO_COOKIE, DEMO_COOKIE_VALUE } from "@/lib/demo-auth";

const PUBLIC_PATHS = ["/", "/login", "/forgot-password", "/manifest.webmanifest", "/icon", "/icon.svg", "/apple-icon.png", "/og.png", "/sw.js", "/offline.html", "/api/stripe/webhook", "/terms", "/privacy", "/refund-policy", "/support"];
const PUBLIC_ASSET = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|webmanifest)$/;

/** Refreshes the Supabase session cookie and gates app routes behind sign-in. */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDemo = request.cookies.get(DEMO_COOKIE)?.value === DEMO_COOKIE_VALUE;
  if (isDemo) {
    if (pathname === "/login" || pathname === "/forgot-password" || pathname.startsWith("/auth/")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const isPublic = PUBLIC_PATHS.includes(pathname) || PUBLIC_ASSET.test(pathname) || pathname.startsWith("/_next") || pathname.startsWith("/api/public") || pathname.startsWith("/auth/");

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    const hadAuthCookie = request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
    if (error && hadAuthCookie) url.searchParams.set("error", "Your session has expired. Sign in again to continue.");
    return NextResponse.redirect(url);
  }
  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
