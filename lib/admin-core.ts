/** Pure helpers for the admin panel gate; safe to unit test without server-only imports. */
export const USER_ROLES = ["customer", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const ROLE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  customer: ["Use the question bank when billing access is active"],
  admin: ["Open the admin panel", "Use the question bank without a subscription", "Manage users and access", "Manage billing and discounts", "Review question content"],
};

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

export function userRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "customer";
}

export function roleFromAppMetadata(metadata: unknown): UserRole {
  if (!metadata || typeof metadata !== "object") return "customer";
  return userRole((metadata as { role?: unknown }).role);
}

export function permissionsForRole(role: UserRole) {
  return ROLE_PERMISSIONS[role];
}
