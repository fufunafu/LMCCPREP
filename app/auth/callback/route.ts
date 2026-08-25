import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { configuredSiteOrigin, safeReturnPath } from "@/lib/urls";

/** Auth callback for invite / magic-link / recovery emails (PKCE code exchange). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "invite" | "magiclink" | "recovery" | "email" | null;
  const next = safeReturnPath(searchParams.get("next"), type === "invite" || type === "recovery" ? "/auth/set-password" : "/dashboard");
  const siteOrigin = configuredSiteOrigin() ?? origin;

  const supabase = await createClient();
  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  // No code/token_hash: Supabase sent tokens in the URL fragment (implicit flow). The fragment survives the
  // redirect, so hand off to the client page that can read it.
  if (!code && !tokenHash) return NextResponse.redirect(`${siteOrigin}/auth/finish?next=${encodeURIComponent(next)}`);
  if (!ok) return NextResponse.redirect(`${siteOrigin}/login?error=${encodeURIComponent("That link is invalid or has expired.")}`);
  return NextResponse.redirect(`${siteOrigin}${next}`);
}
