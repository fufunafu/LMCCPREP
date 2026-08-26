import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
if (!url || !anonKey || !serviceKey || !siteUrl) throw new Error("Supabase and site verification configuration is incomplete.");

const client = (key) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const admin = client(serviceKey);
const createdUsers = [];
const createdQuestions = [];

function expectNoRows(result, label) {
  assert.equal(result.error, null, `${label} returned an unexpected database error`);
  assert.deepEqual(result.data, [], `${label} exposed another user's row`);
}

function normalizeTag(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[*_`]+/g, "").replace(/\s+/g, " ");
}

async function verifyApprovedPublicCounts() {
  const publicClient = client(anonKey);
  const { data: publicCounts, error } = await publicClient.rpc("get_approved_public_subject_counts");
  if (error) throw new Error("Could not read approved public subject counts.");
  assert.equal(publicCounts?.length, 5, "The public catalog did not return all five disclosed disciplines");

  for (const subject of publicCounts) {
    const { count, error: countError } = await admin
      .from("questions")
      .select("qid", { count: "exact", head: true })
      .eq("subject_id", subject.id)
      .neq("source", "user")
      .in("distribution_rights_status", ["original", "licensed"])
      .eq("editorial_status", "reviewed");
    if (countError) throw new Error("Could not calculate the approved public corpus.");
    assert.equal(subject.question_count, count ?? 0, `${subject.name} public count included unapproved content`);
  }
  return publicCounts;
}

async function verifyPublishedPublicCounts(publicCounts) {
  let origin;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    throw new Error("The configured public site URL is invalid.");
  }
  const response = await fetch(`${origin}/?catalog-verification=${randomUUID()}`, {
    headers: { "cache-control": "no-cache" },
    redirect: "error",
  });
  assert.ok(response.ok, `The published catalog returned HTTP ${response.status}`);
  const html = await response.text();
  const published = new Map();
  for (const match of html.matchAll(/data-subject-id="([^"]+)"[^>]*data-question-count="(\d+)"/g)) {
    assert.ok(!published.has(match[1]), `The published catalog repeated subject ${match[1]}`);
    published.set(match[1], Number(match[2]));
  }
  assert.equal(published.size, publicCounts.length, "The published catalog did not expose every approved discipline count");
  for (const subject of publicCounts) {
    assert.equal(published.get(subject.id), subject.question_count, `${subject.name} published count does not match the approved production aggregate`);
  }
}

async function verifyAnswerSafeTags() {
  let offset = 0;
  let checked = 0;
  let triggerCandidate = null;

  for (;;) {
    const { data, error } = await admin
      .from("questions")
      .select("qid,answer_index,options,tags")
      .order("qid")
      .range(offset, offset + 999);
    if (error) throw new Error("Could not read question tags for verification.");
    if (!data?.length) break;

    for (const row of data) {
      const answerTag = normalizeTag(row.options?.[row.answer_index]);
      assert.ok(!row.tags?.includes(answerTag), `Question ${row.qid} exposes its correct answer in tags`);
      if (!triggerCandidate && answerTag) triggerCandidate = { ...row, answerTag };
    }
    checked += data.length;
    if (data.length < 1000) break;
    offset += data.length;
  }

  assert.ok(checked > 0, "No questions were available for answer-tag verification");
  assert.ok(triggerCandidate, "No question had a usable answer-tag trigger candidate");
  const attemptedTags = [...(triggerCandidate.tags ?? []), triggerCandidate.answerTag];
  const { data: updated, error: updateError } = await admin
    .from("questions")
    .update({ tags: attemptedTags })
    .eq("qid", triggerCandidate.qid)
    .select("tags")
    .single();
  if (updateError || !updated) throw new Error("Could not exercise the answer-tag trigger.");
  assert.ok(!updated.tags?.includes(triggerCandidate.answerTag), "The answer-tag trigger retained a correct answer");
  return checked;
}

async function createTestUser(label) {
  const password = `${randomBytes(18).toString("base64url")}Aa1!`;
  const email = `authorization-${label}-${randomUUID()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create temporary ${label} user.`);
  createdUsers.push(data.user.id);
  const userClient = client(anonKey);
  const signedIn = await userClient.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`Could not authenticate temporary ${label} user.`);
  return { id: data.user.id, client: userClient };
}

try {
  const publicCounts = await verifyApprovedPublicCounts();
  await verifyPublishedPublicCounts(publicCounts);
  const checkedTags = await verifyAnswerSafeTags();
  const { data: question, error: questionError } = await admin.from("questions").select("qid,answer_index,subject_id,topic_id").limit(1).single();
  if (questionError || !question) throw new Error("No bank question is available for authorization verification.");
  const userA = await createTestUser("a");
  const userB = await createTestUser("b");

  const temporaryQid = 2_000_000_000 - randomInt(1, 1_000_000);
  const insertedQuestion = await admin.from("questions").insert({
    qid: temporaryQid,
    subject_id: question.subject_id,
    topic_id: question.topic_id,
    stem: `Authorization and answer-tag verification ${randomUUID()}`,
    options: ["LeakAnswer", "Distractor"],
    answer_index: 0,
    explanation: ["Temporary verification record."],
    source: "user",
    created_by: userA.id,
    tags: ["leakanswer", "safe search tag"],
  }).select("qid,tags").single();
  if (insertedQuestion.error || !insertedQuestion.data) throw new Error("Temporary answer-tag record could not be created.");
  createdQuestions.push(temporaryQid);
  assert.ok(!insertedQuestion.data.tags.includes("leakanswer"), "Correct-answer text survived the insert trigger");
  const updatedQuestion = await admin.from("questions").update({ options: ["ReplacementAnswer", "Distractor"], tags: ["replacementanswer", "safe search tag"] }).eq("qid", temporaryQid).select("tags").single();
  if (updatedQuestion.error || !updatedQuestion.data) throw new Error("Temporary answer-tag record could not be updated.");
  assert.ok(!updatedQuestion.data.tags.includes("replacementanswer"), "Correct-answer text survived the update trigger");

  const anonymous = client(anonKey);
  const anonymousPrivate = await anonymous.from("sessions").select("id").limit(1);
  expectNoRows(anonymousPrivate, "Anonymous session read");
  assert.ok((await anonymous.rpc("next_user_question_qid")).error, "Anonymous role executed a private sequence function");
  assert.ok((await userA.client.rpc("next_user_question_qid")).error, "Authenticated role executed a service-only sequence function");

  const { data: session, error: sessionError } = await userA.client.from("sessions").insert({
    user_id: userA.id,
    mode: "tutor",
    question_ids: [question.qid],
    filters: { verification: true },
  }).select("id").single();
  if (sessionError || !session) throw new Error("Temporary owner session could not be created.");

  const attempt = await userA.client.from("attempts").insert({
    user_id: userA.id,
    session_id: session.id,
    qid: question.qid,
    chosen_index: question.answer_index,
    correct: true,
    time_ms: 1,
  });
  if (attempt.error) throw new Error("Temporary owner attempt could not be created.");
  if ((await userA.client.from("flags").insert({ user_id: userA.id, qid: question.qid })).error) throw new Error("Temporary owner flag could not be created.");
  if ((await userA.client.from("notes").insert({ user_id: userA.id, qid: question.qid, body: "authorization verification" })).error) throw new Error("Temporary owner note could not be created.");
  if ((await admin.from("billing_access_grants").upsert({ user_id: userA.id, reason: "authorization-verification" })).error) throw new Error("Temporary billing grant could not be created.");

  const ownerRows = await userA.client.from("sessions").select("id").eq("id", session.id);
  assert.equal(ownerRows.data?.length, 1, "Owner could not read their own session");
  expectNoRows(await userB.client.from("sessions").select("id").eq("id", session.id), "Cross-user session read");
  expectNoRows(await userB.client.from("sessions").update({ current_index: 1 }).eq("id", session.id).select("id"), "Cross-user session update");
  expectNoRows(await userB.client.from("sessions").delete().eq("id", session.id).select("id"), "Cross-user session delete");
  expectNoRows(await userB.client.from("attempts").select("id").eq("session_id", session.id), "Cross-user attempt read");
  expectNoRows(await userB.client.from("flags").select("qid").eq("qid", question.qid), "Cross-user flag read");
  expectNoRows(await userB.client.from("notes").select("qid").eq("qid", question.qid), "Cross-user note read");
  expectNoRows(await userB.client.from("billing_access_grants").select("user_id").eq("user_id", userA.id), "Cross-user billing-grant read");
  assert.ok((await userB.client.from("notes").insert({ user_id: userA.id, qid: question.qid, body: "must fail" })).error, "Cross-user note insert unexpectedly succeeded");
  assert.ok((await userB.client.from("attempts").insert({ user_id: userB.id, session_id: session.id, qid: question.qid, chosen_index: question.answer_index, correct: true, time_ms: 1 })).error, "Attempt against another user's session unexpectedly succeeded");

  console.log(`Authorization verification passed: approved and published public counts, ${checkedTags} answer-safe tag rows, anonymous access, cross-user isolation, RPC restrictions, and billing isolation are enforced.`);
} finally {
  for (const qid of createdQuestions) await admin.from("questions").delete().eq("qid", qid);
  for (const userId of createdUsers) await admin.auth.admin.deleteUser(userId);
}
