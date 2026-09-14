#!/usr/bin/env node
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function executable(name) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep searching PATH.
    }
  }
  throw new Error(`${name} is required for the migration integration test.`);
}

const pgliteModule = process.env.EXAM_TEST_PGLITE_MODULE;
const initdb = pgliteModule ? undefined : executable("initdb");
const pgCtl = pgliteModule ? undefined : executable("pg_ctl");
const psql = pgliteModule ? undefined : executable("psql");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "lmcc-exam-access-"));
const dataDirectory = join(temporaryDirectory, "data");
const socketDirectory = join(temporaryDirectory, "socket");
const logPath = join(temporaryDirectory, "postgres.log");
const port = String(41000 + (process.pid % 10000));
mkdirSync(socketDirectory);
let started = false;
let database;

function command(commandPath, args, input, allowFailure = false) {
  const result = spawnSync(commandPath, args, {
    encoding: "utf8",
    input,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${commandPath} failed (status ${result.status}, signal ${result.signal}, error ${result.error}):\n${result.stdout}${result.stderr}`);
  }
  return result;
}

const psqlArguments = ["-X", "-qAt", "-h", socketDirectory, "-p", port, "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
async function sql(source, allowFailure = false) {
  if (!database) return command(psql, psqlArguments, source, allowFailure);
  // Match psql's fresh session for each assertion when using in-memory PostgreSQL.
  await database.exec("reset role; reset request.jwt.claim.role; reset request.jwt.claim.sub;");
  try {
    const results = await database.exec(source);
    const rows = results.at(-1)?.rows ?? [];
    return { status: 0, stdout: rows.map((row) => Object.values(row).map((value) => typeof value === "boolean" ? value ? "t" : "f" : value ?? "").join("|")).join("\n") };
  } catch (error) {
    if (!allowFailure) throw error;
    return { status: 1, stderr: error.message };
  }
}
const query = async (source) => (await sql(source)).stdout.trim();

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

try {
  if (pgliteModule) {
    const { PGlite } = await import(pgliteModule);
    database = new PGlite();
  } else {
    command(initdb, ["-D", dataDirectory, "--no-locale", "--encoding=UTF8", "--auth=trust"]);
    command(pgCtl, ["-D", dataDirectory, "-l", logPath, "-o", `-k ${socketDirectory} -p ${port} -c listen_addresses=''`, "-w", "start"]);
    started = true;
  }
  await sql(`
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
    grant usage on schema public, auth, storage to authenticated, service_role;
    create table exams (id text primary key);
    insert into exams values ('mccqe'), ('usmle');
    create table profiles (id uuid primary key, display_name text, exam_id text default 'mccqe' references exams, target_exam_date date);
    create table subjects (id text primary key, exam_id text references exams);
    create table topics (id text primary key, subject_id text references subjects);
    create table questions (qid int primary key, subject_id text references subjects);
    create table attempts (qid int references questions);
    create table qbank_question_images (qid int references questions, storage_path text);
    create table qbank_question_categories (qid int references questions);
    create table qbank_question_topics (qid int references questions);
    create table recalls (id int primary key);
    create table storage.objects (id int primary key, bucket_id text, name text);
    create table billing_subscriptions (
      stripe_subscription_id text primary key, user_id uuid, stripe_customer_id text, stripe_price_id text,
      status text, current_period_end timestamptz, access_until timestamptz, cancel_at_period_end boolean,
      trial_end timestamptz, payment_failed_at timestamptz, latest_payment_event text,
      latest_event_created_at timestamptz, updated_at timestamptz
    );
    create table billing_access_grants (user_id uuid, expires_at timestamptz);
    create table billing_settings (id boolean primary key, billing_required boolean);
    insert into billing_settings values (true, true);
    insert into profiles values ('00000000-0000-4000-8000-000000000001', 'Learner', 'mccqe', '2099-01-01');
    insert into subjects values ('medicine', 'mccqe'), ('usmle-cardio', 'usmle');
    insert into topics values ('medicine-topic', 'medicine'), ('usmle-topic', 'usmle-cardio');
    insert into questions values (1, 'medicine'), (2, 'usmle-cardio');
    insert into attempts values (1), (2);
    insert into qbank_question_images values (1, 'mccqe.png'), (2, 'usmle.png');
    insert into qbank_question_categories values (1), (2);
    insert into qbank_question_topics values (1), (2);
    insert into storage.objects values (1, 'qbank-images', 'mccqe.png'), (2, 'qbank-images', 'usmle.png');
    insert into recalls values (1);
    grant select, insert, update, delete on all tables in schema public, storage to authenticated;
    alter table profiles enable row level security;
    create policy own_profile on profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
  `);
  const billingSql = readFileSync(resolve(projectDirectory, "supabase/migrations/0009_billing.sql"), "utf8");
  await sql(billingSql.slice(billingSql.indexOf("create or replace function has_billing_access()"), billingSql.indexOf("create or replace function sync_billing_subscription(")));
  const syncSql = readFileSync(resolve(projectDirectory, "supabase/migrations/0010_billing_reconciliation.sql"), "utf8");
  await sql(syncSql.slice(0, syncSql.indexOf("-- Atomically record")));
  for (const table of ["subjects", "topics", "questions", "attempts", "qbank_question_images", "qbank_question_categories", "qbank_question_topics", "recalls", "storage.objects"]) {
    await sql(`alter table ${table} enable row level security; create policy entitled on ${table} for all to authenticated using (has_billing_access()) with check (has_billing_access());`);
  }
  for (const migration of ["0029_exam_date_planning.sql", "0030_subscription_exam_access.sql"]) {
    await sql(readFileSync(resolve(projectDirectory, "supabase/migrations", migration), "utf8"));
  }
  const learner = `set role authenticated; set request.jwt.claim.role = 'authenticated'; set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';`;
  const asLearner = async (statement) => await query(`${learner} ${statement}`);
  const sync = async (exam, event, status = "active", accessUntil = "2099-01-01") => await query(`
    set role service_role; set request.jwt.claim.role = 'service_role';
    select sync_billing_subscription('sub_test', '00000000-0000-4000-8000-000000000001', 'cus_test', 'price_${exam}', '${status}', '2099-01-01', '${accessUntil}', false, null, '${event}', null, false, '${exam}');
  `);
  assertEqual(await query("select exam_date_precision from profiles"), "exact", "existing date backfilled");
  assertEqual(await sync("mccqe", "2026-09-14"), "t", "initial subscription sync");
  assertEqual(await asLearner("select current_exam_id()"), "mccqe", "MCCQE assignment");
  assertEqual(await asLearner("select string_agg(qid::text, ',') from questions"), "1", "MCCQE content isolation");
  assertEqual(await asLearner("select string_agg(name, ',') from storage.objects"), "mccqe.png", "MCCQE image isolation");
  assertEqual(await sync("usmle", "2026-09-15"), "t", "USMLE subscription sync");
  assertEqual(await asLearner("select current_exam_id()"), "usmle", "USMLE assignment");
  assertEqual(await query("select exam_id from profiles"), "usmle", "native profile follows subscription");
  assertEqual(await asLearner("select string_agg(qid::text, ',') from questions"), "2", "USMLE content isolation");
  assertEqual(await asLearner("select string_agg(qid::text, ',') from attempts"), "2", "activity and question status isolation");
  assertEqual(await asLearner("select string_agg(id, ',') from subjects"), "usmle-cardio", "subject isolation");
  assertEqual(await asLearner("select string_agg(id, ',') from topics"), "usmle-topic", "topic isolation");
  assertEqual(await asLearner("select string_agg(name, ',') from storage.objects"), "usmle.png", "USMLE image isolation");
  assertEqual(await asLearner("select count(*) from recalls"), "0", "legacy recalls isolation");
  assertEqual(await sync("mccqe", "2026-09-14"), "f", "stale webhook ignored");
  assertEqual(await asLearner("select current_exam_id()"), "usmle", "stale event cannot change exam");
  const changedExam = await sql(`${learner} update profiles set exam_id = 'mccqe';`, true);
  if (changedExam.status === 0) throw new Error("Learner changed their assigned exam");
  const forgedSync = await sql(`${learner} select sync_billing_subscription('sub_test', auth.uid(), 'cus_test', 'price_mccqe', 'active', now(), now(), false, null, now(), null, false, 'mccqe');`, true);
  if (forgedSync.status === 0) throw new Error("Learner invoked the subscription sync function");
  await asLearner("insert into profiles(id, display_name) values (auth.uid(), 'Upserted') on conflict (id) do update set display_name = excluded.display_name;");
  assertEqual(await query("select display_name || ':' || exam_id from profiles"), "Upserted:usmle", "profile upsert keeps the subscription exam");
  await asLearner("delete from profiles; update profiles set display_name = 'Updated', exam_date_precision = 'unknown', target_exam_date = null;");
  assertEqual(await query("select display_name || ':' || exam_date_precision from profiles"), "Updated:unknown", "normal profile edits persist and direct deletion is blocked");
  assertEqual(await sync("usmle", "2026-09-16", "past_due"), "t", "grace period sync");
  assertEqual(await asLearner("select count(*) from questions"), "1", "grace period keeps assigned exam");
  assertEqual(await sync("usmle", "2026-09-17", "canceled", "2000-01-01"), "t", "expired subscription sync");
  assertEqual(await asLearner("select count(*) from questions"), "0", "expired subscription has no content");
  await sql("insert into billing_access_grants values ('00000000-0000-4000-8000-000000000001', null)");
  assertEqual(await asLearner("select string_agg(qid::text, ',') from questions"), "2", "private grant retains assigned bank");
  console.log("Exam access migration checks passed: subscription isolation, images, stale events, profile protection, date persistence, grace, expiration, and grants.");
} finally {
  if (database) await database.close();
  if (started) command(pgCtl, ["-D", dataDirectory, "-m", "immediate", "-w", "stop"], undefined, true);
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
