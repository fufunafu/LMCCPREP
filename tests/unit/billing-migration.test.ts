import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reconciliationSql = readFileSync(new URL("../../supabase/migrations/0010_billing_reconciliation.sql", import.meta.url), "utf8");
const sql = [
  readFileSync(new URL("../../supabase/migrations/0009_billing.sql", import.meta.url), "utf8"),
  reconciliationSql,
].join("\n");

describe("billing migration security contract", () => {
  it("keeps enforcement disabled during rollout", () => {
    expect(sql).toContain("billing_required  boolean not null default false");
    expect(sql).toContain("values (true, false, 3)");
  });

  it.each([
    "billing_settings",
    "billing_customers",
    "billing_subscriptions",
    "billing_access_grants",
    "stripe_webhook_events",
  ])("enables RLS on %s", (table) => {
    expect(sql).toContain(`alter table ${table} enable row level security;`);
  });

  it("allows browser clients to read only their own billing summary", () => {
    expect(sql).toContain("using (user_id = auth.uid());");
    expect(sql).not.toMatch(/billing_(?:customers|subscriptions|access_grants) for (?:insert|update|delete) to authenticated/);
  });

  it("restricts authoritative synchronization to the service role", () => {
    expect(sql).toContain("revoke all on function sync_billing_subscription");
    expect(sql).toContain("to service_role;");
  });

  it("fails closed for incomplete subscription periods and protects paid content", () => {
    expect(sql).toContain("and s.access_until > now()");
    for (const table of ["subjects", "topics", "questions", "recalls", "qbank_question_images"]) {
      expect(sql).toMatch(new RegExp(`create policy \\"[^\\"]+\\" on ${table}[\\s\\S]*?has_billing_access\\(\\)`));
    }
  });

  it("prevents older events and repeated past-due updates from extending access", () => {
    expect(sql).toContain("excluded.latest_event_created_at > billing_subscriptions.latest_event_created_at");
    expect(sql).toContain("then least(billing_subscriptions.access_until, excluded.access_until)");
    expect(sql).toContain("billing_subscriptions.payment_failed_at is not null");
    expect(sql).toMatch(/p_payment_event = 'failed'[\s\S]*?billing_subscriptions\.payment_failed_at is not null[\s\S]*?then least\(billing_subscriptions\.access_until, excluded\.access_until\)/);
    expect(sql).toContain("p_payment_event = 'paid' then null");
    expect(sql).toContain("billing_subscriptions.latest_payment_event = 'paid'");
    expect(sql).toContain("latest_event_created_at = excluded.latest_event_created_at");
    expect(reconciliationSql).not.toContain("case when p_is_reconciliation then to_timestamp(0)");
    expect(sql).toContain("where p_is_reconciliation");
  });

  it("lets authoritative reconciliation repair a stale active payment failure", () => {
    expect(sql).toContain("p_is_reconciliation and excluded.status in ('active', 'trialing')");
    expect(sql).toMatch(/p_is_reconciliation and excluded\.status in \('active', 'trialing'\) then null/);
  });

  it("claims webhook events atomically and recovers abandoned processing", () => {
    expect(sql).toContain("create or replace function claim_stripe_webhook_event");
    expect(sql).toContain("on conflict (stripe_event_id) do nothing");
    expect(sql).toContain("for update;");
    expect(sql).toContain("now() - interval '5 minutes'");
    expect(sql).toContain("grant execute on function claim_stripe_webhook_event(text, text, timestamptz) to service_role");
  });
});
