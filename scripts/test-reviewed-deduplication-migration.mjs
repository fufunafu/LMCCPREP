#!/usr/bin/env node

import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const migrationPath = resolve(projectDirectory, "supabase/migrations/0021_remove_reviewed_duplicate_questions.sql");
const migrationSql = readFileSync(migrationPath, "utf8");
const mappingBlock = migrationSql.match(
  /insert into reviewed_duplicate_question_map \(remove_qid, keep_qid\) values([\s\S]*?);/u,
);
if (!mappingBlock) throw new Error("Could not parse the reviewed duplicate mapping.");

const mappings = [...mappingBlock[1].matchAll(/\((\d+), (\d+)\)/gu)]
  .map((match) => ({ removeQid: Number(match[1]), keepQid: Number(match[2]) }));
if (mappings.length !== 936) throw new Error(`Expected 936 mappings, found ${mappings.length}.`);

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

const initdb = executable("initdb");
const pgCtl = executable("pg_ctl");
const psql = executable("psql");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "lmcc-dedup-migration-"));
const dataDirectory = join(temporaryDirectory, "data");
const socketDirectory = join(temporaryDirectory, "socket");
const logPath = join(temporaryDirectory, "postgres.log");
const port = String(41000 + (process.pid % 10000));
mkdirSync(socketDirectory);
let started = false;

function command(commandPath, args, input, allowFailure = false) {
  const result = spawnSync(commandPath, args, {
    encoding: "utf8",
    input,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${commandPath} failed:\n${result.stdout}${result.stderr}`);
  }
  return result;
}

const psqlArguments = ["-X", "-qAt", "-h", socketDirectory, "-p", port, "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
const sql = (source, allowFailure = false) => command(psql, psqlArguments, source, allowFailure);
const query = (source) => sql(source).stdout.trim();

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

try {
  command(initdb, ["-D", dataDirectory, "--no-locale", "--encoding=UTF8", "--auth=trust"]);
  command(pgCtl, [
    "-D", dataDirectory,
    "-l", logPath,
    "-o", `-k ${socketDirectory} -p ${port} -c listen_addresses=''`,
    "-w",
    "start",
  ]);
  started = true;

  sql(`
    create table questions (qid int primary key);
    create table sessions (
      id int primary key,
      question_ids int[] not null,
      current_index int not null
    );
    create table attempts (
      id int generated always as identity primary key,
      qid int not null references questions(qid)
    );
    create table flags (
      user_id text not null,
      qid int not null references questions(qid),
      created_at timestamptz not null,
      primary key (user_id, qid)
    );
    create table notes (
      user_id text not null,
      qid int not null references questions(qid),
      body text not null,
      updated_at timestamptz not null,
      primary key (user_id, qid)
    );
    create table question_edits (
      id int generated always as identity primary key,
      qid int not null references questions(qid)
    );
    create table qbank_question_categories (
      qid int not null references questions(qid) on delete cascade,
      category_id text not null,
      primary key (qid, category_id)
    );
    create table qbank_question_topics (
      qid int primary key references questions(qid) on delete cascade,
      topic_id text not null
    );
    create table qbank_question_images (
      qid int not null references questions(qid) on delete cascade,
      image_index int not null,
      name text not null,
      mime_type text not null,
      byte_length int not null,
      sha256 text not null,
      storage_path text not null,
      source_path text,
      primary key (qid, image_index)
    );
  `);

  const questionQids = [...new Set(mappings.flatMap(({ removeQid, keepQid }) => [removeQid, keepQid]))];
  sql(`insert into questions (qid) values ${questionQids.map((qid) => `(${qid})`).join(",")};`);
  const initialQuestionCount = questionQids.length;

  sql(`
    insert into attempts (qid) values (765);
    insert into question_edits (qid) values (765);
    insert into flags (user_id, qid, created_at) values
      ('user-a', 765, '2026-01-01T00:00:00Z'),
      ('user-a', 17053, '2025-12-01T00:00:00Z'),
      ('user-a', 13697, '2026-02-01T00:00:00Z');
    insert into notes (user_id, qid, body, updated_at) values
      ('user-a', 765, 'newer duplicate note', '2026-03-01T00:00:00Z'),
      ('user-a', 17053, 'newest duplicate note', '2026-04-01T00:00:00Z'),
      ('user-a', 13697, 'older survivor note', '2026-02-01T00:00:00Z');
    insert into sessions (id, question_ids, current_index) values
      (1, array[13697, 765, 33], 1),
      (2, array[19, 33, 765], 2);
    insert into qbank_question_categories (qid, category_id) values
      (765, 'category-a'),
      (13697, 'category-b');
    insert into qbank_question_topics (qid, topic_id) values (19, 'topic-a');
    insert into qbank_question_images
      (qid, image_index, name, mime_type, byte_length, sha256, storage_path, source_path)
    values
      (17109, 0, 'approved.png', 'image/png', 10, 'approved-sha', 'approved.png', 'source/approved.png'),
      (19, 0, 'unapproved.png', 'image/png', 10, 'unapproved-sha', 'unapproved.png', 'source/unapproved.png');
  `);

  const rejected = sql(migrationSql, true);
  if (rejected.status === 0 || !rejected.stderr.includes("lacks explicit deletion approval")) {
    throw new Error(`The migration did not reject unapproved image deletion:\n${rejected.stdout}${rejected.stderr}`);
  }
  assertEqual(query("select count(*) from questions;"), String(initialQuestionCount), "failed preflight atomicity");

  sql("delete from qbank_question_images where qid = 19;");
  sql(migrationSql);

  assertEqual(query("select count(*) from questions;"), String(initialQuestionCount - 936), "question count");
  assertEqual(query(`
    select count(*)
    from questions q
    join (values ${mappings.map(({ removeQid }) => `(${removeQid})`).join(",")}) removed(qid)
      on removed.qid = q.qid;
  `), "0", "removed questions");
  assertEqual(query("select string_agg(qid::text, ',' order by id) from attempts;"), "13697", "attempt migration");
  assertEqual(query("select string_agg(qid::text, ',' order by id) from question_edits;"), "13697", "edit report migration");
  assertEqual(query("select qid || ':' || to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') from flags where user_id = 'user-a';"), "13697:2025-12-01", "flag merge");
  assertEqual(query("select qid || ':' || body from notes where user_id = 'user-a';"), "13697:newest duplicate note", "note merge");
  assertEqual(query("select string_agg(id || ':' || question_ids::text || ':' || current_index, '|' order by id) from sessions;"), "1:{13697,33}:0|2:{33,13697}:1", "session migration");
  assertEqual(query("select string_agg(category_id, ',' order by category_id) from qbank_question_categories where qid = 13697;"), "category-a,category-b", "category merge");
  assertEqual(query("select topic_id from qbank_question_topics where qid = 33;"), "topic-a", "topic migration");
  assertEqual(query("select count(*) from qbank_question_images where qid = 17109;"), "0", "approved image metadata deletion");

  console.log(JSON.stringify({
    migration: migrationPath,
    mappings: mappings.length,
    initial_questions: initialQuestionCount,
    final_questions: initialQuestionCount - 936,
    preserved_dependencies: true,
    unapproved_image_guard: true,
  }, null, 2));
} finally {
  if (started) command(pgCtl, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], undefined, true);
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
