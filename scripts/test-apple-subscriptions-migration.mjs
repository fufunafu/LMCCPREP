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
    create role anon;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, service_role;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
    create table exams (id text primary key);
    insert into exams values ('mccqe'), ('usmle');
    create table profiles (id uuid primary key references auth.users on delete cascade, exam_id text);
    insert into profiles select id, 'mccqe' from auth.users;
    create table billing_settings (id boolean primary key, billing_required boolean);
    insert into billing_settings values (true,true);
    create table billing_access_grants (user_id uuid, expires_at timestamptz);
    create table billing_subscriptions (stripe_subscription_id text, user_id uuid, exam_id text, status text, access_until timestamptz, latest_event_created_at timestamptz);
  `);
  await sql(readFileSync(join(projectDirectory, "supabase/migrations/0031_apple_subscriptions.sql"), "utf8"));
  await sql(readFileSync(join(projectDirectory, "supabase/migrations/0032_billing_access_snapshot.sql"), "utf8"));
  const u1 = "00000000-0000-4000-8000-000000000001";
  const u2 = "00000000-0000-4000-8000-000000000002";
  const access = (uid) => `set request.jwt.claim.sub='${uid}'; set role authenticated; select has_billing_access(), current_exam_id();`;
  const save = ({uid=u1, env="Production", original="original", transaction="first", exam="usmle", end="2099-01-01", signed="2026-09-17", purchase="2026-09-01", revoked=false}={}) => `set role service_role; select sync_apple_subscription('${env}','${original}','${transaction}','${uid}','ca.lmccprep.app.${exam}.monthly','${exam}','2099-01-01','${end}','${signed}','${purchase}',${revoked},true);`;
  assertEqual(await query(access(u1)), "f|mccqe", "No purchase grants no access");
  await sql(save());
  assertEqual(await query(access(u1)), "t|usmle", "Apple subscription grants the purchased exam");
  assertEqual(await query(access(u2)), "f|mccqe", "Purchase never grants another account access");
  assertEqual(await query(save()), "f", "Duplicate delivery is idempotent");
  assertEqual((await sql(save({uid:u2}), true)).status, 1, "Cross-account reassignment denied");
  assertEqual((await sql(`set role authenticated; select sync_apple_subscription('Production','hack','hack','${u2}','ca.lmccprep.app.mccqe.monthly','mccqe',now(),now(),now(),now(),false,true);`, true)).status, 1, "Client cannot grant itself access");
  assertEqual((await sql("set role authenticated; select * from apple_subscription_transactions;", true)).status, 1, "Client cannot read purchase ledger");
  assertEqual(await query(`set request.jwt.claim.sub='${u1}'; set role authenticated; select (billing_access_snapshot()->>'valid_until')::timestamptz <= now() + interval '72 hours';`), "t", "Offline authorization is bounded");
  await sql(save({end:"1970-01-01",signed:"2026-09-18",revoked:true}));
  assertEqual(await query(access(u1)), "f|usmle", "Refund removes access");
  await sql(save());
  assertEqual(await query(access(u1)), "f|usmle", "Old receipt cannot restore refunded access");
  await sql(save({transaction:"renewal",purchase:"2026-10-01",signed:"2026-10-01"}));
  assertEqual(await query(access(u1)), "t|usmle", "New paid renewal grants access");
  await sql(save({end:"1970-01-01",signed:"2026-10-02",revoked:true}));
  assertEqual(await query(access(u1)), "t|usmle", "Late refund of old period preserves new renewal");
  await sql(save({transaction:"renewal",purchase:"2026-10-01",signed:"2026-10-03",end:"1970-01-01"}));
  assertEqual(await query(access(u1)), "f|usmle", "Expiration removes access");
  await sql(save({env:"Sandbox",original:"sandbox",transaction:"sandbox",exam:"mccqe"}));
  assertEqual(await query(access(u1)), "t|mccqe", "Sandbox review purchase grants scoped access");
  await sql(save({transaction:"renewal",purchase:"2026-10-01",signed:"2026-10-04"}));
  assertEqual(await query(access(u1)), "t|usmle", "Production takes precedence over Sandbox");
  await sql(`insert into billing_subscriptions values ('stripe','${u1}','mccqe','active','2099-01-01',now());`);
  assertEqual(await query(access(u1)), "t|mccqe", "Existing Stripe access remains intact");
  await sql(`delete from billing_subscriptions; delete from auth.users where id='${u1}';`);
  assertEqual(await query("select count(*) from apple_subscription_accounts where user_id is not null;"), "0", "Account deletion clears ownership identity");
  assertEqual((await sql(save({uid:u2}),true)).status, 1, "Deleted account purchase cannot be reassigned");
  console.log("Apple subscription migration checks passed: ownership, RLS, replay, refund, renewal, expiry, Sandbox, Stripe and deletion.");
} finally {
  if (database) await database.close();
  if (started) command(pgCtl, ["-D", dataDirectory, "-m", "immediate", "-w", "stop"], undefined, true);
  rmSync(temporaryDirectory, {recursive:true,force:true});
}
