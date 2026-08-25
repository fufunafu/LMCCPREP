import "server-only";

import { cookies } from "next/headers";
import { DEMO_COOKIE, DEMO_COOKIE_VALUE } from "@/lib/demo-auth";

export async function isDemoSession() {
  return (await cookies()).get(DEMO_COOKIE)?.value === DEMO_COOKIE_VALUE;
}
