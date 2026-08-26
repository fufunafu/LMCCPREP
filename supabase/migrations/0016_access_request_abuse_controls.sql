-- Access requests are accepted only by the server action using the service role.
-- Duplicate email submissions and repeated requests from one network address are bounded.

alter table access_requests
  add column if not exists request_fingerprint text,
  add column if not exists request_window timestamptz;

create unique index if not exists access_requests_normalized_email_key
  on access_requests(lower(trim(email)))
  where request_window is not null;

create unique index if not exists access_requests_fingerprint_window_key
  on access_requests(request_fingerprint, request_window)
  where request_fingerprint is not null and request_window is not null;

drop policy if exists "anyone can request access" on access_requests;

revoke insert on table access_requests from anon, authenticated;
