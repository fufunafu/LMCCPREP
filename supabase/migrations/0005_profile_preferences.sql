alter table profiles
  add column if not exists medical_school text,
  add column if not exists target_exam_date date,
  add column if not exists daily_reminder boolean not null default true,
  add column if not exists show_shortcuts boolean not null default true,
  add column if not exists explanation_auto_scroll boolean not null default false;

create or replace function reset_my_progress()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from flags where user_id = auth.uid();
  delete from notes where user_id = auth.uid();
  delete from attempts where user_id = auth.uid();
  delete from sessions where user_id = auth.uid();
end;
$$;

revoke all on function reset_my_progress() from public;
grant execute on function reset_my_progress() to authenticated;
