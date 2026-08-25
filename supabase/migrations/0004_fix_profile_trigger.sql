-- auth admin runs the trigger with a search_path that excludes public
alter function handle_new_user() set search_path = public;
grant usage on schema public to supabase_auth_admin;
grant insert on public.profiles to supabase_auth_admin;
