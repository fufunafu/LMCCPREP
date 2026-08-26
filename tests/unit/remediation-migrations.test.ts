import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const answerTagsSql = readFileSync(new URL("../../supabase/migrations/0018_enforce_answer_safe_tags.sql", import.meta.url), "utf8");
const editorialSql = readFileSync(new URL("../../supabase/migrations/0015_content_provenance_and_editorial_status.sql", import.meta.url), "utf8");
const abuseSql = readFileSync(new URL("../../supabase/migrations/0016_access_request_abuse_controls.sql", import.meta.url), "utf8");
const accessCompatibilitySql = readFileSync(new URL("../../supabase/migrations/0017_restore_private_content_access.sql", import.meta.url), "utf8");

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

  it("bounds access requests without granting public inserts", () => {
    expect(abuseSql).toContain("access_requests_normalized_email_key");
    expect(abuseSql).toContain("access_requests_fingerprint_window_key");
    expect(abuseSql).toContain('drop policy if exists "anyone can request access"');
    expect(abuseSql).toContain("revoke insert on table access_requests from anon, authenticated");
  });
});
