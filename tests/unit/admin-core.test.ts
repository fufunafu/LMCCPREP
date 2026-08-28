import { describe, expect, it } from "vitest";
import { adminEmailList, isAdminEmail } from "@/lib/admin-core";

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
