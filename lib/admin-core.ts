/** Pure helpers for the admin panel gate; safe to unit test without server-only imports. */
export function adminEmailList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined, allowlist: string | undefined) {
  if (!email) return false;
  return adminEmailList(allowlist).includes(email.trim().toLowerCase());
}
