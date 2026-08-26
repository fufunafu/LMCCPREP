import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * POST /api/capture saves one question that is currently displayed on a qbank page.
 * into your private study DB (as a user-authored question). Driven by the browser
 * helper in tools/capture-qbank.js: you page through questions yourself and press a
 * key to send whatever is on screen. No decryption, no bulk crawling.
 *
 * Auth: shared secret in the `x-capture-token` header (CAPTURE_TOKEN env).
 * Runs with the service-role key so it works cross-origin from the qbank tab.
 */

const SUBJECT_MAP: Record<string, string> = {
  "internal medicine": "medicine",
  medicine: "medicine",
  "obstetrics/gynecology": "obgyn",
  "obstetrics & gynecology": "obgyn",
  obstetrics: "obgyn",
  gynecology: "obgyn",
  pediatrics: "pediatrics",
  psychiatry: "psychiatry",
  surgery: "surgery",
  // Population Health / PHELO -> pmch
  "population health/ethical, legal, and organizational aspects of medicine (phelo)": "pmch",
  "population health": "pmch",
  phelo: "pmch",
};

const MAX_CAPTURE_BYTES = 128 * 1024;

function captureEnabled() {
  return process.env.CAPTURE_ENABLED === "true";
}

function disabledResponse(headers: Record<string, string>) {
  return NextResponse.json({ error: "not found" }, { status: 404, headers: { ...headers, "Cache-Control": "no-store" } });
}

function mapSubject(category: string): string | null {
  const key = (category || "").trim().toLowerCase();
  if (SUBJECT_MAP[key]) return SUBJECT_MAP[key];
  for (const [needle, id] of Object.entries(SUBJECT_MAP)) {
    if (key.includes(needle)) return id;
  }
  return null;
}

/** Only the qbank site (apex or any subdomain, https only) may call this endpoint from a browser. */
function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin) return null;
    const host = url.hostname.toLowerCase();
    return host === "qbank.md" || host.endsWith(".qbank.md") ? origin : null;
  } catch {
    return null;
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = allowedOrigin(origin);
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": allowed } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-capture-token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function tokenMatches(expected: string, provided: string | null) {
  if (!provided) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function OPTIONS(request: NextRequest) {
  const headers = corsHeaders(request.headers.get("origin"));
  if (!captureEnabled()) return disabledResponse(headers);
  return new NextResponse(null, { status: 204, headers: { ...headers, "Cache-Control": "no-store" } });
}

let cachedOwnerId: string | null = null;
async function resolveOwnerId(admin: SupabaseClient): Promise<string | null> {
  if (cachedOwnerId) return cachedOwnerId;
  const email = (process.env.CAPTURE_OWNER_EMAIL || "").toLowerCase();
  if (!email) return null;
  // The user base is invite-only, so the first page is enough.
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = data?.users?.find((u) => (u.email || "").toLowerCase() === email);
  cachedOwnerId = user?.id ?? null;
  return cachedOwnerId;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);
  if (!captureEnabled()) return disabledResponse(headers);

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CAPTURE_BYTES) {
    return NextResponse.json({ error: "request too large" }, { status: 413, headers });
  }

  const token = process.env.CAPTURE_TOKEN;
  if (!token || !tokenMatches(token, request.headers.get("x-capture-token"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "server not configured" }, { status: 500, headers });
  }

  let body: {
    extId?: string | number;
    category?: string;
    topic?: string;
    stem?: string;
    options?: string[];
    answerIndex?: number;
    explanation?: string[];
  };
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_CAPTURE_BYTES) {
      return NextResponse.json({ error: "request too large" }, { status: 413, headers });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers });
  }

  const stem = (body.stem || "").trim();
  const options = Array.isArray(body.options) ? body.options.map((o) => String(o).trim()).filter(Boolean) : [];
  const answerIndex = Number(body.answerIndex);
  const explanation = Array.isArray(body.explanation)
    ? body.explanation.map((p) => String(p).trim()).filter(Boolean)
    : [];
  const subjectId = mapSubject(body.category || "");
  const topicName = (body.topic || "Uncategorized").trim() || "Uncategorized";
  const extId = body.extId != null ? String(body.extId) : null;

  // Refuse to write half-captured questions to the database.
  if (!stem) return NextResponse.json({ error: "missing stem" }, { status: 400, headers });
  if (options.length < 2 || options.length > 6)
    return NextResponse.json({ error: `bad option count (${options.length})` }, { status: 400, headers });
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length)
    return NextResponse.json({ error: "answer not identified; reveal the answer key first" }, { status: 400, headers });
  if (!subjectId)
    return NextResponse.json({ error: `unmapped category: ${body.category}` }, { status: 400, headers });

  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false } });
  const reviewTag = extId ? `qbankmd:${extId}` : null;

  // Dedup: same source question already captured?
  if (reviewTag) {
    const { data: existing } = await admin
      .from("questions")
      .select("qid")
      .eq("review_note", reviewTag)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ qid: existing.qid, deduped: true }, { status: 200, headers });
    }
  }

  const ownerId = await resolveOwnerId(admin);

  // Topic id mirrors add_user_question(): subject/slug(topic)
  const topicId = `${subjectId}/${topicName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const { error: topicError } = await admin.from("topics").upsert({ id: topicId, subject_id: subjectId, name: topicName }, { onConflict: "id" });
  if (topicError) {
    console.error("capture: topic upsert failed", topicError.code);
    return NextResponse.json({ error: "insert failed" }, { status: 500, headers });
  }

  // Next user qid (>= 1,000,000), allocated atomically by a service-role-only function.
  const { data: nextQid, error: qidError } = await admin.rpc("next_user_question_qid");
  const qid = Number(nextQid);
  if (qidError || !Number.isInteger(qid) || qid < 1_000_000) {
    console.error("capture: qid allocation failed", qidError?.code ?? "invalid result");
    return NextResponse.json({ error: "insert failed" }, { status: 500, headers });
  }

  const { error } = await admin.from("questions").insert({
    qid,
    subject_id: subjectId,
    topic_id: topicId,
    stem,
    options,
    answer_index: answerIndex,
    explanation,
    source: "user",
    created_by: ownerId,
    needs_review: true,
    review_note: reviewTag,
  });
  if (error) {
    // 23505: unique_violation (normalized-stem index) — the same question is already in the bank.
    if (error.code === "23505") return NextResponse.json({ duplicate: true }, { status: 409, headers });
    console.error("capture: insert failed", error.code);
    return NextResponse.json({ error: "insert failed" }, { status: 500, headers });
  }

  return NextResponse.json({ qid, deduped: false }, { status: 200, headers });
}
