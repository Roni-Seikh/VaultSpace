-- VaultSpace migration 0003: Row Level Security and table privileges.
--
-- Model:
--   * Browser/API clients using a user JWT ("authenticated") can READ only their own rows and
--     WRITE only a few harmless columns. Quota-affecting tables are read-only for them.
--   * All quota/storage mutations go through the service-role-only functions in 0002.
--   * Anonymous users have no access to any table.

-- Start from zero privileges (Supabase grants broad defaults on the public schema).
revoke all on table
  public.profiles, public.encryption_metadata, public.folders, public.files, public.file_versions,
  public.shares, public.user_sessions, public.activity_logs, public.security_events,
  public.storage_usage, public.app_capacity
from anon, authenticated;

alter table public.profiles            enable row level security;
alter table public.encryption_metadata enable row level security;
alter table public.folders             enable row level security;
alter table public.files               enable row level security;
alter table public.file_versions       enable row level security;
alter table public.shares              enable row level security;
alter table public.user_sessions       enable row level security;
alter table public.activity_logs       enable row level security;
alter table public.security_events     enable row level security;
alter table public.storage_usage       enable row level security;
alter table public.app_capacity        enable row level security;

------------------------------------------------------------------------------
-- profiles: read own; update ONLY display_name / theme / notification flags.
-- (role and quota_bytes are intentionally absent from the column grant.)
------------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, theme, notify_storage, notify_security, notify_sharing)
  on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

------------------------------------------------------------------------------
-- encryption_metadata: wrapped keys only; the owner may read, create and update.
------------------------------------------------------------------------------
grant select, insert, update on public.encryption_metadata to authenticated;

create policy enc_select_own on public.encryption_metadata
  for select to authenticated using (user_id = (select auth.uid()));
create policy enc_insert_own on public.encryption_metadata
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy enc_update_own on public.encryption_metadata
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

------------------------------------------------------------------------------
-- folders: read, create, rename/move. Deleting goes through delete_folder() (frees R2 + quota).
------------------------------------------------------------------------------
grant select, insert on public.folders to authenticated;
grant update (name_enc, parent_id) on public.folders to authenticated;

create policy folders_select_own on public.folders
  for select to authenticated using (user_id = (select auth.uid()));
create policy folders_insert_own on public.folders
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy folders_update_own on public.folders
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

------------------------------------------------------------------------------
-- files: read; rename/move only. Creation and deletion go through the service-role functions.
------------------------------------------------------------------------------
grant select on public.files to authenticated;
grant update (name_enc, folder_id) on public.files to authenticated;

create policy files_select_own on public.files
  for select to authenticated using (user_id = (select auth.uid()));
create policy files_update_own on public.files
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

------------------------------------------------------------------------------
-- Read-only (for the owner) tables.
------------------------------------------------------------------------------
grant select on public.file_versions   to authenticated;
grant select on public.shares          to authenticated;
grant select on public.user_sessions   to authenticated;
grant select on public.activity_logs   to authenticated;
grant select on public.security_events to authenticated;
grant select on public.storage_usage   to authenticated;
grant select on public.app_capacity    to authenticated;

create policy versions_select_own on public.file_versions
  for select to authenticated using (user_id = (select auth.uid()));
create policy shares_select_own on public.shares
  for select to authenticated using (owner_id = (select auth.uid()));
create policy sessions_select_own on public.user_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy activity_select_own on public.activity_logs
  for select to authenticated using (user_id = (select auth.uid()));
create policy security_events_select_own on public.security_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy usage_select_own on public.storage_usage
  for select to authenticated using (user_id = (select auth.uid()));
-- Global capacity is not sensitive and lets the UI explain a "service is full" state.
create policy capacity_select_all on public.app_capacity
  for select to authenticated using (true);

------------------------------------------------------------------------------
-- service_role keeps full access (it also bypasses RLS in Supabase).
------------------------------------------------------------------------------
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
