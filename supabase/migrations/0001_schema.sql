-- VaultSpace migration 0001: core schema
-- Run in the Supabase SQL editor (or `supabase db push`). Order: 0001 -> 0002 -> 0003.
-- Assumes the standard Supabase `auth` schema and the roles anon / authenticated / service_role exist.

------------------------------------------------------------------------------
-- Generic helpers
------------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

------------------------------------------------------------------------------
-- profiles: one row per auth user. Holds role, quota and preferences.
-- `role` and `quota_bytes` are NOT writable by end users (see 0003 grants).
------------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  display_name    text not null default '' check (char_length(display_name) <= 80),
  role            text not null default 'user' check (role in ('user', 'admin')),
  quota_bytes     bigint not null default 1073741824 check (quota_bytes >= 0),
  theme           text not null default 'system' check (theme in ('system', 'light', 'dark')),
  notify_storage  boolean not null default true,
  notify_security boolean not null default true,
  notify_sharing  boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index profiles_email_lower_idx on public.profiles (lower(email));
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------------
-- encryption_metadata: the user's WRAPPED vault keys. Never raw keys.
-- The server cannot unwrap these: it never sees the vault passphrase or recovery key.
------------------------------------------------------------------------------
create table public.encryption_metadata (
  user_id                     uuid primary key references public.profiles (id) on delete cascade,
  kdf                         text not null default 'argon2id' check (kdf in ('argon2id')),
  kdf_params                  jsonb not null,
  salt                        text not null check (char_length(salt) between 16 and 128),
  wrapped_master_key_pass     text not null check (char_length(wrapped_master_key_pass) between 40 and 512),
  wrapped_master_key_recovery text not null check (char_length(wrapped_master_key_recovery) between 40 and 512),
  format_version              int not null default 1,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create trigger encryption_metadata_set_updated_at before update on public.encryption_metadata
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------------
-- folders: hierarchy. Names are encrypted client-side (name_enc).
------------------------------------------------------------------------------
create table public.folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  parent_id  uuid references public.folders (id) on delete cascade,
  name_enc   text not null check (char_length(name_enc) between 1 and 1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index folders_user_parent_idx on public.folders (user_id, parent_id);
create trigger folders_set_updated_at before update on public.folders
  for each row execute function public.set_updated_at();

-- Parent must belong to the same user and the tree must stay acyclic.
create or replace function public.folders_validate()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.parent_id is not null then
    if not exists (select 1 from public.folders where id = new.parent_id and user_id = new.user_id) then
      raise exception 'PARENT_FOLDER_NOT_FOUND' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' then
      if exists (
        with recursive ancestors as (
          select id, parent_id from public.folders where id = new.parent_id
          union all
          select f.id, f.parent_id from public.folders f join ancestors a on f.id = a.parent_id
        )
        select 1 from ancestors where id = new.id
      ) then
        raise exception 'FOLDER_CYCLE' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger folders_validate_trg before insert or update of parent_id on public.folders
  for each row execute function public.folders_validate();

------------------------------------------------------------------------------
-- files: logical file. Content lives in file_versions (one row per R2 object).
-- name_enc is encrypted client-side; the server never sees file names.
------------------------------------------------------------------------------
create table public.files (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  folder_id       uuid references public.folders (id) on delete cascade,
  name_enc        text not null check (char_length(name_enc) between 1 and 2048),
  mime_category   text not null check (mime_category in
                    ('image', 'video', 'document', 'spreadsheet', 'presentation', 'text', 'archive')),
  mime_type       text not null check (char_length(mime_type) between 3 and 127),
  size_bytes      bigint not null default 0 check (size_bytes >= 0),
  current_version int not null default 0 check (current_version >= 0),
  status          text not null default 'pending' check (status in ('pending', 'active')),
  -- Keyed hash (HMAC) of the plaintext, computed in the browser. Used only for duplicate
  -- detection within one user's library; it is not comparable across users.
  content_hmac    text check (content_hmac is null or char_length(content_hmac) between 16 and 128),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index files_user_folder_idx on public.files (user_id, folder_id) where status = 'active';
create index files_user_created_idx on public.files (user_id, created_at desc);
create index files_user_hmac_idx on public.files (user_id, content_hmac) where content_hmac is not null;
create trigger files_set_updated_at before update on public.files
  for each row execute function public.set_updated_at();

create or replace function public.files_validate()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.folder_id is not null then
    if not exists (select 1 from public.folders where id = new.folder_id and user_id = new.user_id) then
      raise exception 'FOLDER_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger files_validate_trg before insert or update of folder_id on public.files
  for each row execute function public.files_validate();

------------------------------------------------------------------------------
-- file_versions: one encrypted R2 object per version. Every retained version counts
-- toward the user's quota (size_bytes is the CIPHERTEXT size).
------------------------------------------------------------------------------
create table public.file_versions (
  id               uuid primary key default gen_random_uuid(),
  file_id          uuid not null references public.files (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  version          int not null check (version >= 1),
  r2_key           text not null unique check (char_length(r2_key) <= 300),
  size_bytes       bigint not null check (size_bytes > 0),
  -- Per-file AES key wrapped with the user's master-derived key. Safe to store.
  wrapped_file_key text not null check (char_length(wrapped_file_key) between 40 and 512),
  content_hmac     text check (content_hmac is null or char_length(content_hmac) between 16 and 128),
  status           text not null default 'pending' check (status in ('pending', 'active')),
  created_at       timestamptz not null default now(),
  unique (file_id, version)
);
create index file_versions_user_idx on public.file_versions (user_id, status, created_at);
create index file_versions_pending_idx on public.file_versions (created_at) where status = 'pending';

------------------------------------------------------------------------------
-- shares: link shares. Only a SHA-256 hash of the token is stored.
-- The share key lives solely in the URL fragment and is never stored or sent to the server.
------------------------------------------------------------------------------
create table public.shares (
  id               uuid primary key default gen_random_uuid(),
  file_id          uuid not null references public.files (id) on delete cascade,
  version_id       uuid not null references public.file_versions (id) on delete cascade,
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  token_hash       text not null unique check (char_length(token_hash) = 64),
  expires_at       timestamptz not null,
  can_download     boolean not null default true,
  pw_salt          text,
  pw_gate_hash     text check (pw_gate_hash is null or char_length(pw_gate_hash) = 64),
  -- File key wrapped under a key derived from (fragment share key [+ password]).
  wrapped_file_key text not null check (char_length(wrapped_file_key) between 40 and 512),
  -- File name encrypted under the same share-derived key.
  name_enc         text not null check (char_length(name_enc) between 1 and 2048),
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes > 0),
  revoked_at       timestamptz,
  access_count     int not null default 0,
  last_accessed_at timestamptz,
  created_at       timestamptz not null default now(),
  check ((pw_salt is null) = (pw_gate_hash is null)),
  check (expires_at > created_at)
);
create index shares_owner_idx on public.shares (owner_id, created_at desc);
create index shares_file_idx on public.shares (file_id);

------------------------------------------------------------------------------
-- user_sessions: informational list for the Security Center (Supabase Auth owns real sessions).
------------------------------------------------------------------------------
create table public.user_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  auth_session_id uuid not null,
  device_label    text not null default 'Unknown device' check (char_length(device_label) <= 120),
  user_agent      text check (user_agent is null or char_length(user_agent) <= 400),
  ip_hash         text,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  revoked_at      timestamptz,
  unique (user_id, auth_session_id)
);
create index user_sessions_user_idx on public.user_sessions (user_id, last_seen_at desc);

------------------------------------------------------------------------------
-- activity_logs: audit trail (never stores passwords, keys or file contents).
------------------------------------------------------------------------------
create table public.activity_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  action      text not null check (char_length(action) between 1 and 64),
  target_type text check (target_type is null or char_length(target_type) <= 32),
  target_id   uuid,
  meta        jsonb not null default '{}'::jsonb,
  ip_hash     text,
  created_at  timestamptz not null default now()
);
create index activity_logs_user_idx on public.activity_logs (user_id, created_at desc);
create index activity_logs_action_idx on public.activity_logs (action, created_at desc);

------------------------------------------------------------------------------
-- security_events: security-relevant events. user_id is kept NULL-able so admins retain
-- the event after an account is deleted.
------------------------------------------------------------------------------
create table public.security_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  type       text not null check (char_length(type) between 1 and 64),
  severity   text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  meta       jsonb not null default '{}'::jsonb,
  ip_hash    text,
  created_at timestamptz not null default now()
);
create index security_events_created_idx on public.security_events (created_at desc);
create index security_events_user_idx on public.security_events (user_id, created_at desc);

------------------------------------------------------------------------------
-- storage_usage: per-user accounting (ciphertext bytes).
-- reserved_bytes = uploads in flight; used_bytes = completed uploads.
------------------------------------------------------------------------------
create table public.storage_usage (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  used_bytes     bigint not null default 0 check (used_bytes >= 0),
  reserved_bytes bigint not null default 0 check (reserved_bytes >= 0),
  file_count     int not null default 0 check (file_count >= 0),
  updated_at     timestamptz not null default now()
);

------------------------------------------------------------------------------
-- app_capacity: single-row global budget. Protects against exceeding the R2 free tier.
------------------------------------------------------------------------------
create table public.app_capacity (
  id             smallint primary key default 1 check (id = 1),
  max_bytes      bigint not null default 8589934592 check (max_bytes >= 0),   -- 8 GiB
  max_file_bytes bigint not null default 104857600 check (max_file_bytes > 0), -- 100 MiB
  used_bytes     bigint not null default 0 check (used_bytes >= 0),
  reserved_bytes bigint not null default 0 check (reserved_bytes >= 0),
  updated_at     timestamptz not null default now()
);
insert into public.app_capacity (id) values (1);

------------------------------------------------------------------------------
-- New auth user -> profile + usage row.
------------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80)
  );
  insert into public.storage_usage (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
