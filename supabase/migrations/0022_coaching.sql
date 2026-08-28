-- Coaching: prepaid 1:1 sessions with tutors who have already passed the exam.
-- Idempotent; safe to re-run.
--
-- Objects:
--   coaching_services      catalogue of bookable session types (price, duration, Payment Link)
--   coaching_exams         exams a tutor can coach
--   coaching_tutors        roster (user_id hidden from clients via coaching_public_tutors)
--   coaching_availability  bookable slots per tutor
--   coaching_bookings      one booking per slot; pending holds expire after 20 minutes
--   coaching_open_slots    view of future, unbooked slots for active tutors
--   create_coaching_booking(...)   authenticated RPC: hold a slot (status 'pending')
--   cancel_my_coaching_booking(..) authenticated RPC: cancel own pending booking
-- Payment is confirmed by the Stripe webhook (service role) which sets status 'paid'.

-- ---------- catalogue ----------
create table if not exists coaching_services (
  id                  text primary key,
  name                text not null,
  description         text not null default '',
  duration_minutes    int  not null check (duration_minutes between 15 and 240),
  price_cents         int  not null check (price_cents >= 0),
  currency            text not null default 'cad',
  stripe_payment_link text,
  active              boolean not null default true,
  sort                int  not null default 0,
  check (stripe_payment_link is null or stripe_payment_link ~ '^https://buy\.stripe\.com/')
);

insert into coaching_services (id, name, description, duration_minutes, price_cents, sort) values
  ('consult30', 'Exam consultation', 'A focused 30-minute call to map out your study plan, timeline, and the resources that actually matter for your exam.', 30, 4900, 1),
  ('tutor60', '1:1 tutoring', 'A full hour working through the topics you find hardest with someone who has already passed the exam.', 60, 8900, 2),
  ('strategy45', 'Tips & strategy session', '45 minutes on exam-day tactics: pacing, question dissection, guessing strategy, and what to do the week before.', 45, 6900, 3)
on conflict (id) do nothing;

create table if not exists coaching_exams (
  id   text primary key,
  name text not null,
  sort int  not null default 0
);

insert into coaching_exams (id, name, sort) values
  ('mccqe1', 'MCCQE Part I', 1),
  ('usmle1', 'USMLE Step 1', 2),
  ('usmle2', 'USMLE Step 2 CK', 3)
on conflict (id) do nothing;

-- ---------- tutors ----------
create table if not exists coaching_tutors (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  headline     text not null default '' check (char_length(headline) <= 160),
  bio          text not null default '' check (char_length(bio) <= 2000),
  exams        text[] not null default '{}',
  timezone     text not null default 'America/Toronto',
  active       boolean not null default true,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);

insert into coaching_tutors (id, display_name, headline, bio, exams, active, sort) values
  ('a0000000-0000-4000-8000-000000000001', 'Tutor 1', 'Passed MCCQE Part I — profile coming soon', '', '{mccqe1}', false, 1),
  ('a0000000-0000-4000-8000-000000000002', 'Tutor 2', 'Passed USMLE Step 1 — profile coming soon', '', '{usmle1,usmle2}', false, 2),
  ('a0000000-0000-4000-8000-000000000003', 'Tutor 3', 'Passed MCCQE Part I and USMLE Step 2 CK — profile coming soon', '', '{mccqe1,usmle2}', false, 3)
on conflict (id) do nothing;

create or replace view coaching_public_tutors with (security_invoker = true) as
  select id, display_name, headline, bio, exams, timezone, sort
  from coaching_tutors
  where active;

-- ---------- availability ----------
create table if not exists coaching_availability (
  id         uuid primary key default gen_random_uuid(),
  tutor_id   uuid not null references coaching_tutors(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tutor_id, starts_at),
  check (ends_at > starts_at)
);
create index if not exists coaching_availability_tutor_starts_idx on coaching_availability(tutor_id, starts_at);

-- ---------- bookings ----------
create table if not exists coaching_bookings (
  id                         uuid primary key default gen_random_uuid(),
  slot_id                    uuid not null references coaching_availability(id) on delete restrict,
  tutor_id                   uuid not null references coaching_tutors(id),
  service_id                 text not null references coaching_services(id),
  exam_id                    text not null references coaching_exams(id),
  user_id                    uuid not null references auth.users(id) on delete cascade,
  notes                      text check (notes is null or char_length(notes) <= 2000),
  status                     text not null default 'pending'
                             check (status in ('pending', 'paid', 'cancelled', 'expired', 'completed')),
  hold_expires_at            timestamptz,
  amount_cents               int not null check (amount_cents >= 0),
  currency                   text not null default 'cad',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text,
  paid_at                    timestamptz,
  meeting_url                text check (meeting_url is null or meeting_url ~ '^https://'),
  admin_note                 text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create unique index if not exists coaching_bookings_live_slot_key
  on coaching_bookings(slot_id) where status in ('pending', 'paid');
create index if not exists coaching_bookings_user_idx on coaching_bookings(user_id, created_at desc);
create index if not exists coaching_bookings_tutor_idx on coaching_bookings(tutor_id, created_at desc);
create index if not exists coaching_bookings_status_hold_idx on coaching_bookings(status, hold_expires_at);

create or replace function coaching_bookings_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists coaching_bookings_touch_updated_at on coaching_bookings;
create trigger coaching_bookings_touch_updated_at
  before update on coaching_bookings
  for each row execute function coaching_bookings_touch_updated_at();

-- ---------- open slots ----------
create or replace function coaching_slot_is_open(p_slot_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select not exists (
    select 1 from coaching_bookings b
    where b.slot_id = p_slot_id
      and (b.status = 'paid' or (b.status = 'pending' and b.hold_expires_at > now()))
  );
$$;

create or replace view coaching_open_slots with (security_invoker = true) as
  select a.id, a.tutor_id, a.starts_at, a.ends_at, t.exams as tutor_exams
  from coaching_availability a
  join coaching_tutors t on t.id = a.tutor_id
  where t.active
    and a.starts_at > now()
    and coaching_slot_is_open(a.id);

-- ---------- RPCs ----------
create or replace function create_coaching_booking(
  p_slot_id uuid,
  p_service_id text,
  p_exam_id text,
  p_notes text default null
)
returns coaching_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_service coaching_services%rowtype;
  v_slot coaching_availability%rowtype;
  v_tutor coaching_tutors%rowtype;
  v_booking coaching_bookings%rowtype;
begin
  if v_user is null then
    raise exception 'not_signed_in';
  end if;

  select * into v_service from coaching_services where id = p_service_id and active;
  if not found then
    raise exception 'service_unavailable';
  end if;

  if not exists (select 1 from coaching_exams where id = p_exam_id) then
    raise exception 'exam_unknown';
  end if;

  if p_notes is not null and char_length(p_notes) > 2000 then
    raise exception 'notes_too_long';
  end if;

  -- Lock the slot row so concurrent holds serialise.
  select * into v_slot from coaching_availability where id = p_slot_id for update;
  if not found or v_slot.starts_at <= now() then
    raise exception 'slot_unavailable';
  end if;

  select * into v_tutor from coaching_tutors where id = v_slot.tutor_id and active;
  if not found or not (p_exam_id = any (v_tutor.exams)) then
    raise exception 'tutor_unavailable';
  end if;

  update coaching_bookings
    set status = 'expired'
    where slot_id = p_slot_id and status = 'pending' and hold_expires_at < now();

  if not coaching_slot_is_open(p_slot_id) then
    raise exception 'slot_taken';
  end if;

  insert into coaching_bookings (slot_id, tutor_id, service_id, exam_id, user_id, notes, status, hold_expires_at, amount_cents, currency)
  values (p_slot_id, v_slot.tutor_id, v_service.id, p_exam_id, v_user, nullif(btrim(p_notes), ''), 'pending', now() + interval '20 minutes', v_service.price_cents, v_service.currency)
  returning * into v_booking;

  return v_booking;
exception
  when unique_violation then
    raise exception 'slot_taken';
end
$$;

revoke all on function create_coaching_booking(uuid, text, text, text) from public, anon;
grant execute on function create_coaching_booking(uuid, text, text, text) to authenticated, service_role;

create or replace function cancel_my_coaching_booking(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  update coaching_bookings
    set status = 'cancelled'
    where id = p_booking_id and user_id = auth.uid() and status = 'pending';
  get diagnostics v_count = row_count;
  return v_count > 0;
end
$$;

revoke all on function cancel_my_coaching_booking(uuid) from public, anon;
grant execute on function cancel_my_coaching_booking(uuid) to authenticated, service_role;

revoke all on function coaching_slot_is_open(uuid) from public;
grant execute on function coaching_slot_is_open(uuid) to anon, authenticated, service_role;

-- ---------- RLS ----------
alter table coaching_services enable row level security;
alter table coaching_exams enable row level security;
alter table coaching_tutors enable row level security;
alter table coaching_availability enable row level security;
alter table coaching_bookings enable row level security;

drop policy if exists "coaching services readable" on coaching_services;
create policy "coaching services readable" on coaching_services
  for select to anon, authenticated using (active);

drop policy if exists "coaching exams readable" on coaching_exams;
create policy "coaching exams readable" on coaching_exams
  for select to anon, authenticated using (true);

-- Tutors: user_id is never granted to clients. coaching_public_tutors is a
-- security_invoker view, so column-level grants on the table gate it.
drop policy if exists "coaching tutors readable" on coaching_tutors;
create policy "coaching tutors readable" on coaching_tutors
  for select to anon, authenticated using (active);
revoke all on table coaching_tutors from anon, authenticated;
grant select (id, display_name, headline, bio, exams, timezone, sort, active) on coaching_tutors to anon, authenticated;
grant select on coaching_public_tutors to anon, authenticated;

-- Availability exposes only times; open-ness is computed in the view.
drop policy if exists "coaching availability readable" on coaching_availability;
create policy "coaching availability readable" on coaching_availability
  for select to anon, authenticated using (true);
grant select on coaching_open_slots to anon, authenticated;

drop policy if exists "coaching bookings own" on coaching_bookings;
create policy "coaching bookings own" on coaching_bookings
  for select to authenticated using (user_id = auth.uid());
-- No insert/update/delete policies: RPCs above and the service role are the only writers.
