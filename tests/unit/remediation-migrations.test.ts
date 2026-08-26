import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const answerTagsSql = readFileSync(new URL("../../supabase/migrations/0018_enforce_answer_safe_tags.sql", import.meta.url), "utf8");
const editorialSql = readFileSync(new URL("../../supabase/migrations/0015_content_provenance_and_editorial_status.sql", import.meta.url), "utf8");
const abuseSql = readFileSync(new URL("../../supabase/migrations/0016_access_request_abuse_controls.sql", import.meta.url), "utf8");
const accessCompatibilitySql = readFileSync(new URL("../../supabase/migrations/0017_restore_private_content_access.sql", import.meta.url), "utf8");
const paidContentGateSql = readFileSync(new URL("../../supabase/migrations/0019_enforce_paid_content_approval.sql", import.meta.url), "utf8");

describe("website remediation migration contracts", () => {
  it("removes normalized correct-answer text on backfill and every relevant write", () => {
    expect(answerTagsSql).toContain("new.options ->> new.answer_index");
    expect(answerTagsSql).toContain("new.tags := array_remove(new.tags, v_answer_tag)");
    expect(answerTagsSql).toMatch(/update of tags, subject_id, topic_id, source_subject, source_topic, stem, options, answer_index/);
    expect(answerTagsSql).toMatch(/update questions[\s\S]*?array_remove\([\s\S]*?options ->> answer_index/);
  });

  it("tracks rights and editorial state while keeping private access compatible until backfill", () => {
    expect(editorialSql).toContain("distribution_rights_status");
    expect(editorialSql).toContain("editorial_status");
    expect(editorialSql).toContain("last_reviewed_at");
    expect(editorialSql).toContain("reviewer_role");
    expect(accessCompatibilitySql).toContain("source <> 'user' or created_by = auth.uid()");
    expect(accessCompatibilitySql).not.toContain("distribution_rights_status in");
  });

  it("fails closed for public counts and paid bank distribution", () => {
    expect(paidContentGateSql).toContain("not (select paid_content_approval_required())");
    expect(paidContentGateSql).toMatch(/distribution_rights_status in \('original', 'licensed'\)[\s\S]*?editorial_status = 'reviewed'/);
    expect(paidContentGateSql).toMatch(/get_approved_public_subject_counts\(\)[\s\S]*?distribution_rights_status in \('original', 'licensed'\)[\s\S]*?editorial_status = 'reviewed'/);
    expect(paidContentGateSql).toContain("select * from get_approved_public_subject_counts()");
    expect(paidContentGateSql).toContain("source = 'user' and created_by = auth.uid()");
    expect(paidContentGateSql).toMatch(/qbank images readable by entitled users[\s\S]*?distribution_rights_status in \('original', 'licensed'\)/);
    expect(paidContentGateSql).toContain("qi.storage_path = storage.objects.name");
    expect(paidContentGateSql).toContain("qi.distribution_rights_status not in ('original', 'licensed')");
    for (const field of ["content_author", "license_or_permission", "permission_evidence_uri", "transformation_history", "provenance_reviewed_at", "provenance_reviewer_role"]) {
      expect(paidContentGateSql).toContain(field);
    }
  });

  it("bounds access requests without granting public inserts", () => {
    expect(abuseSql).toContain("access_requests_normalized_email_key");
    expect(abuseSql).toContain("access_requests_fingerprint_window_key");
    expect(abuseSql).toContain('drop policy if exists "anyone can request access"');
    expect(abuseSql).toContain("revoke insert on table access_requests from anon, authenticated");
  });
});
