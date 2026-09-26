-- Removing a practice setup must never delete its answer history.
-- Keep the session as a private history link because attempts.session_id uses
-- ON DELETE CASCADE. Clients hide removed sessions and retain this marker so
-- an older offline copy cannot make a removed setup reappear.
alter table public.sessions add column if not exists deleted_at timestamptz;
create index if not exists sessions_active_user_idx
  on public.sessions(user_id, created_at desc) where deleted_at is null;
comment on column public.sessions.deleted_at is
  'Removed practice setup. Keep linked attempts, notes, flags, and learning progress.';
