-- Tutor self-service portal. Idempotent; safe to re-run.
--
-- A tutor is a coaching_tutors row whose user_id points at the signed-in
-- user. Tutors manage their own availability (RLS on coaching_availability),
-- read their own bookings incl. the learner's email (coaching_tutor_bookings),
-- and update meeting links / completion state and their public profile
-- through SECURITY DEFINER RPCs. Admin (service role) paths are unchanged.

-- ---------- who am I ----------
create or replace function coaching_my_tutor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from coaching_tutors where user_id = auth.uid() limit 1;
$$;
revoke all on function coaching_my_tutor_id() from public, anon;
grant execute on function coaching_my_tutor_id() to authenticated, service_role;

-- ---------- availability: tutors manage their own rows ----------
grant insert, delete on coaching_availability to authenticated;

drop policy if exists "coaching availability tutor insert" on coaching_availability;
create policy "coaching availability tutor insert" on coaching_availability
  for insert to authenticated
  with check (
    tutor_id = coaching_my_tutor_id()
    and starts_at > now()
    and ends_at - starts_at between interval '15 minutes' and interval '4 hours'
  );

drop policy if exists "coaching availability tutor delete" on coaching_availability;
create policy "coaching availability tutor delete" on coaching_availability
  for delete to authenticated
  using (tutor_id = coaching_my_tutor_id());

-- A slot with a paid/completed booking can never be deleted from a client;
-- pending holds on it are cancelled so the learner sees a clear state.
create or replace function coaching_availability_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from coaching_bookings where slot_id = old.id and status in ('paid', 'completed')) then
    raise exception 'slot_has_paid_booking';
  end if;
  update coaching_bookings set status = 'cancelled' where slot_id = old.id and status = 'pending';
  return old;
end
$$;

drop trigger if exists coaching_availability_guard_delete on coaching_availability;
create trigger coaching_availability_guard_delete
  before delete on coaching_availability
  for each row execute function coaching_availability_guard_delete();

-- ---------- bookings: tutors read their own ----------
drop policy if exists "coaching bookings tutor read" on coaching_bookings;
create policy "coaching bookings tutor read" on coaching_bookings
  for select to authenticated using (tutor_id = coaching_my_tutor_id());

-- Owner-privileged view (not security_invoker) so the learner email can be
-- read from auth.users; the WHERE clause pins rows to the caller's tutor.
create or replace view coaching_tutor_bookings as
  select b.id, b.slot_id, b.tutor_id, b.service_id, b.exam_id, b.user_id, b.notes, b.status, b.hold_expires_at,
         b.amount_cents, b.currency, b.paid_at, b.meeting_url, b.created_at,
         a.starts_at, a.ends_at,
         s.name as service_name, e.name as exam_name,
         u.email as learner_email
  from coaching_bookings b
  join coaching_availability a on a.id = b.slot_id
  join coaching_services s on s.id = b.service_id
  join coaching_exams e on e.id = b.exam_id
  left join auth.users u on u.id = b.user_id
  where b.tutor_id = coaching_my_tutor_id();
revoke all on coaching_tutor_bookings from public, anon;
grant select on coaching_tutor_bookings to authenticated, service_role;

create or replace function tutor_set_booking(p_booking_id uuid, p_meeting_url text default null, p_status text default null)
returns coaching_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tutor uuid := coaching_my_tutor_id();
  v_row coaching_bookings;
begin
  if v_tutor is null then raise exception 'not_a_tutor'; end if;
  select * into v_row from coaching_bookings where id = p_booking_id and tutor_id = v_tutor for update;
  if not found then raise exception 'booking_unknown'; end if;
  if v_row.status <> 'paid' then raise exception 'booking_not_paid'; end if;
  if p_meeting_url is not null then
    if p_meeting_url = '' then
      v_row.meeting_url := null;
    elsif p_meeting_url !~ '^https://[^[:space:]]+$' or char_length(p_meeting_url) > 500 then
      raise exception 'meeting_url_invalid';
    else
      v_row.meeting_url := p_meeting_url;
    end if;
  end if;
  if p_status is not null then
    if p_status not in ('completed', 'cancelled') then raise exception 'status_invalid'; end if;
    v_row.status := p_status;
  end if;
  update coaching_bookings set meeting_url = v_row.meeting_url, status = v_row.status where id = v_row.id returning * into v_row;
  return v_row;
end
$$;
revoke all on function tutor_set_booking(uuid, text, text) from public, anon;
grant execute on function tutor_set_booking(uuid, text, text) to authenticated, service_role;

-- ---------- profile ----------
create or replace function tutor_update_profile(p_headline text, p_bio text, p_timezone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tutor uuid := coaching_my_tutor_id();
begin
  if v_tutor is null then raise exception 'not_a_tutor'; end if;
  if char_length(coalesce(p_headline, '')) > 160 then raise exception 'headline_too_long'; end if;
  if char_length(coalesce(p_bio, '')) > 2000 then raise exception 'bio_too_long'; end if;
  if p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'timezone_invalid';
  end if;
  update coaching_tutors
    set headline = coalesce(p_headline, ''), bio = coalesce(p_bio, ''), timezone = p_timezone
    where id = v_tutor;
end
$$;
revoke all on function tutor_update_profile(text, text, text) from public, anon;
grant execute on function tutor_update_profile(text, text, text) to authenticated, service_role;

-- Tutors may read their own row (incl. inactive) so the portal can render
-- before an admin publishes them. user_id stays ungranted at column level.
drop policy if exists "coaching tutors self readable" on coaching_tutors;
create policy "coaching tutors self readable" on coaching_tutors
  for select to authenticated using (id = coaching_my_tutor_id());
