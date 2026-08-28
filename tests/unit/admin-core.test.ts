import { describe, expect, it } from "vitest";
import { adminEmailList, isAdminEmail, permissionsForRole, roleFromAppMetadata, userRole } from "@/lib/admin-core";

describe("admin allowlist", () => {
  it("parses a comma-separated, case-insensitive list", () => {
    expect(adminEmailList(" A@x.ca, b@y.ca ,,")).toEqual(["a@x.ca", "b@y.ca"]);
    expect(isAdminEmail("a@X.ca", "A@x.ca")).toBe(true);
    expect(isAdminEmail("c@x.ca", "a@x.ca,b@y.ca")).toBe(false);
  });

  it("denies when the list or email is missing", () => {
    expect(isAdminEmail("a@x.ca", undefined)).toBe(false);
    expect(isAdminEmail(undefined, "a@x.ca")).toBe(false);
    expect(isAdminEmail("", "")).toBe(false);
  });
});

describe("account roles", () => {
  it("defaults missing and unrecognised roles to customer", () => {
    expect(userRole(undefined)).toBe("customer");
    expect(userRole("editor")).toBe("customer");
    expect(roleFromAppMetadata(undefined)).toBe("customer");
    expect(roleFromAppMetadata({})).toBe("customer");
  });

  it("recognises secure admin metadata and exposes its permissions", () => {
    expect(roleFromAppMetadata({ role: "admin" })).toBe("admin");
    expect(permissionsForRole("admin")).toContain("Manage billing and discounts");
    expect(permissionsForRole("admin")).toContain("Use the question bank without a subscription");
    expect(permissionsForRole("customer")).toEqual(["Use the question bank when billing access is active"]);
  });
});
