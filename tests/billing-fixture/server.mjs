import { createServer } from "node:http";
import { generateKeyPairSync, sign } from "node:crypto";

const port = Number(process.env.BILLING_FIXTURE_PORT ?? 54329);
const userId = "00000000-0000-4000-8000-000000000101";
const sessionId = "00000000-0000-4000-8000-000000000201";
const keyId = "billing-fixture-key";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = {
  ...publicKey.export({ format: "jwk" }),
  alg: "RS256",
  kid: keyId,
  key_ops: ["verify"],
  use: "sig",
};

let billingState = "unsubscribed";

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: keyId, typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    aal: "aal1",
    aud: "authenticated",
    email: "billing-fixture@lmccprep.test",
    exp: now + 3_600,
    iat: now - 5,
    iss: `http://127.0.0.1:${port}/auth/v1`,
    role: "authenticated",
    sub: userId,
  }));
  const content = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(content), privateKey).toString("base64url");
  return `${content}.${signature}`;
}

function sessionCookie() {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: accessToken(),
    expires_at: now + 3_600,
    expires_in: 3_600,
    refresh_token: "billing-fixture-refresh-token",
    token_type: "bearer",
    user: {
      aud: "authenticated",
      email: "billing-fixture@lmccprep.test",
      id: userId,
      role: "authenticated",
    },
  };
  return `base64-${base64Url(JSON.stringify(session))}`;
}

function json(response, status, data, headers = {}) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,prefer",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    ...headers,
  });
  if (response.req.method !== "HEAD") response.end(JSON.stringify(data));
  else response.end();
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function entitled() {
  return ["active", "canceled_active", "past_due", "rollback_disabled"].includes(billingState);
}

function customerRows() {
  return ["unsubscribed", "rollback_disabled"].includes(billingState) ? [] : [{ stripe_customer_id: "cus_fixture" }];
}

function subscriptionRows() {
  const common = {
    stripe_customer_id: "cus_fixture",
    stripe_price_id: "price_monthly",
    stripe_subscription_id: "sub_fixture",
    trial_end: null,
  };
  if (billingState === "active") return [{
    ...common,
    access_until: "2030-09-25T12:00:00.000Z",
    cancel_at_period_end: false,
    current_period_end: "2030-09-25T12:00:00.000Z",
    payment_failed_at: null,
    status: "active",
  }];
  if (billingState === "canceled_active") return [{
    ...common,
    access_until: "2030-09-25T12:00:00.000Z",
    cancel_at_period_end: true,
    current_period_end: "2030-09-25T12:00:00.000Z",
    payment_failed_at: null,
    status: "canceled",
  }];
  if (billingState === "past_due") return [{
    ...common,
    access_until: "2030-09-01T12:00:00.000Z",
    cancel_at_period_end: false,
    current_period_end: "2030-09-25T12:00:00.000Z",
    payment_failed_at: "2030-08-29T12:00:00.000Z",
    status: "past_due",
  }];
  if (billingState === "expired") return [{
    ...common,
    access_until: "2020-09-25T12:00:00.000Z",
    cancel_at_period_end: false,
    current_period_end: "2020-09-25T12:00:00.000Z",
    payment_failed_at: null,
    status: "canceled",
  }];
  return [];
}

const subject = { id: "medicine", name: "Medicine", question_count: 1 };
const topic = { id: "medicine/fixture", name: "Fixture topic", question_count: 1, subject_id: "medicine" };
const question = {
  answer_index: 0,
  explanation: ["Fixture explanation."],
  figure_url: null,
  options: ["Correct answer", "Distractor"],
  qid: 101,
  stem: "Which fixture answer is correct?",
  subject_id: "medicine",
  topic_id: "medicine/fixture",
};
const profile = {
  daily_reminder: true,
  display_name: "Billing Fixture",
  explanation_auto_scroll: false,
  medical_school: null,
  show_shortcuts: true,
  target_exam_date: null,
};

function rowsForTable(table, request) {
  switch (table) {
    case "billing_access_grants": return [];
    case "billing_customers": return customerRows();
    case "billing_subscriptions": return subscriptionRows();
    case "daily_activity": return [];
    case "flags": return [];
    case "notes": return [];
    case "attempts": return [];
    case "profiles": return [profile];
    case "qbank_question_images": return [];
    case "questions": return [question];
    case "sessions":
      return request.url.includes("id=eq.") ? [{
        created_at: "2030-08-25T12:00:00.000Z",
        current_index: 0,
        finished_at: null,
        id: sessionId,
        mode: "tutor",
        question_ids: [101],
        seconds_per_question: null,
      }] : [];
    case "subject_counts": return [subject];
    case "subject_stats": return [];
    case "topic_counts": return [topic];
    case "topic_stats": return [];
    case "user_question_status": return [];
    default: return [];
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (request.method === "OPTIONS") return json(response, 204, null);
  if (url.pathname === "/health") return json(response, 200, { ok: true });
  if (url.pathname === "/__fixture/session") {
    return json(response, 200, { cookieName: "sb-127-auth-token", cookieValue: sessionCookie() });
  }
  if (url.pathname === "/__fixture/state" && request.method === "POST") {
    const body = await requestBody(request);
    const allowed = ["unsubscribed", "active", "canceled_active", "expired", "past_due", "rollback_disabled"];
    if (!allowed.includes(body?.state)) return json(response, 400, { error: "Unknown fixture state" });
    billingState = body.state;
    return json(response, 200, { state: billingState });
  }
  if (url.pathname === "/auth/v1/.well-known/jwks.json") return json(response, 200, { keys: [publicJwk] });
  if (url.pathname === "/auth/v1/user") {
    return json(response, 200, { aud: "authenticated", email: "billing-fixture@lmccprep.test", id: userId, role: "authenticated" });
  }
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const rpc = url.pathname.slice("/rest/v1/rpc/".length);
    if (rpc === "has_billing_access") return json(response, 200, entitled());
    if (rpc === "pick_questions") return json(response, 200, entitled() ? [101] : []);
    if (rpc === "get_public_subject_counts") return json(response, 200, [subject]);
    return json(response, 200, null);
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const table = url.pathname.slice("/rest/v1/".length);
    if (table === "sessions" && request.method === "POST") {
      await requestBody(request);
      const row = { id: sessionId };
      return json(response, 201, request.headers.accept?.includes("object+json") ? row : [row]);
    }
    if (request.method === "HEAD" && table === "questions") {
      return json(response, 200, null, { "Content-Range": "0-0/1" });
    }
    return json(response, 200, rowsForTable(table, request), { "Content-Range": "0-0/1" });
  }
  return json(response, 404, { error: "Fixture route not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Billing fixture listening on http://127.0.0.1:${port}`);
});

for (const signalName of ["SIGINT", "SIGTERM"]) {
  process.on(signalName, () => server.close(() => process.exit(0)));
}
