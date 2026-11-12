-- VaultSpace migration 0002: quota-enforcing functions (executable by service_role ONLY).
--
-- Why service_role only?  The browser (anon key + user JWT) must never be able to call these
-- directly. The Next.js API authenticates the user, then calls them with an explicit p_user_id,
-- and every query inside filters on that id.
--
-- Lock order (always): app_capacity row first, then the user's storage_usage row.
-- A single consistent order prevents deadlocks; the capacity lock also serialises global-cap checks.

------------------------------------------------------------------------------
-- Internal helper: release usage (not granted to anyone).
------------------------------------------------------------------------------
create or replace function public._release_usage(
  p_user_id uuid, p_used bigint, p_reserved bigint, p_files int
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.storage_usage
     set used_bytes     = greatest(used_bytes - p_used, 0),
         reserved_bytes = greatest(reserved_bytes - p_reserved, 0),
         file_count     = greatest(file_count - p_files, 0),
         updated_at     = now()
   where user_id = p_user_id;
  update public.app_capacity
     set used_bytes     = greatest(used_bytes - p_used, 0),
         reserved_bytes = greatest(reserved_bytes - p_reserved, 0),
         updated_at     = now()
   where id = 1;
end;
$$;

------------------------------------------------------------------------------
-- begin_upload: reserve quota and create pending rows. New file when p_file_id is null,
-- otherwise a new version of an existing active file.
------------------------------------------------------------------------------
create or replace function public.begin_upload(
  p_user_id      uuid,
  p_file_id      uuid,
  p_folder_id    uuid,
  p_name_enc     text,
  p_category     text,
  p_mime         text,
  p_size         bigint,
  p_wrapped_key  text,
  p_content_hmac text
) returns table (out_file_id uuid, out_version_id uuid, out_version int, out_r2_key text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cap        public.app_capacity%rowtype;
  v_quota      bigint;
  v_used       bigint;
  v_reserved   bigint;
  v_file_id    uuid;
  v_version    int;
  v_version_id uuid := gen_random_uuid();
  v_key        text;
  v_file_cat   text;
begin
  select * into v_cap from public.app_capacity where id = 1 for update;

  if p_size is null or p_size < 1 then
    raise exception 'INVALID_SIZE' using errcode = 'P0001';
  end if;
  if p_size > v_cap.max_file_bytes then
    raise exception 'FILE_TOO_LARGE' using errcode = 'P0001';
  end if;

  select used_bytes, reserved_bytes into v_used, v_reserved
    from public.storage_usage where user_id = p_user_id for update;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;
  select quota_bytes into v_quota from public.profiles where id = p_user_id;

  if v_used + v_reserved + p_size > v_quota then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  if v_cap.used_bytes + v_cap.reserved_bytes + p_size > v_cap.max_bytes then
    raise exception 'GLOBAL_CAP_REACHED' using errcode = 'P0001';
  end if;

  if p_file_id is null then
    if p_folder_id is not null
       and not exists (select 1 from public.folders where id = p_folder_id and user_id = p_user_id) then
      raise exception 'FOLDER_NOT_FOUND' using errcode = 'P0001';
    end if;
    insert into public.files (user_id, folder_id, name_enc, mime_category, mime_type, status)
    values (p_user_id, p_folder_id, p_name_enc, p_category, p_mime, 'pending')
    returning id into v_file_id;
    v_version := 1;
  else
    select id, mime_category into v_file_id, v_file_cat
      from public.files where id = p_file_id and user_id = p_user_id and status = 'active' for update;
    if v_file_id is null then
      raise exception 'FILE_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_file_cat <> p_category then
      raise exception 'TYPE_MISMATCH' using errcode = 'P0001';
    end if;
    select coalesce(max(version), 0) + 1 into v_version
      from public.file_versions where file_id = v_file_id;
  end if;

  v_key := 'u/' || p_user_id::text || '/' || v_file_id::text || '/v' || v_version::text
           || '-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.file_versions (id, file_id, user_id, version, r2_key, size_bytes,
                                    wrapped_file_key, content_hmac, status)
  values (v_version_id, v_file_id, p_user_id, v_version, v_key, p_size,
          p_wrapped_key, p_content_hmac, 'pending');

  update public.storage_usage
     set reserved_bytes = reserved_bytes + p_size, updated_at = now()
   where user_id = p_user_id;
  update public.app_capacity
     set reserved_bytes = reserved_bytes + p_size, updated_at = now()
   where id = 1;

  return query select v_file_id, v_version_id, v_version, v_key;
end;
$$;

------------------------------------------------------------------------------
-- complete_upload: called after the server verified the R2 object (HEAD) has the reserved size.
------------------------------------------------------------------------------
create or replace function public.complete_upload(
  p_user_id uuid, p_version_id uuid, p_actual_size bigint
) returns table (out_file_id uuid, out_version int)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ver        public.file_versions%rowtype;
  v_file_status text;
begin
  perform 1 from public.app_capacity where id = 1 for update;
  perform 1 from public.storage_usage where user_id = p_user_id for update;

  select * into v_ver from public.file_versions
   where id = p_version_id and user_id = p_user_id and status = 'pending' for update;
  if not found then
    raise exception 'UPLOAD_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_actual_size is distinct from v_ver.size_bytes then
    raise exception 'SIZE_MISMATCH' using errcode = 'P0001';
  end if;

  select status into v_file_status from public.files where id = v_ver.file_id for update;

  update public.file_versions set status = 'active' where id = v_ver.id;
  update public.files
     set status = 'active', current_version = v_ver.version, size_bytes = v_ver.size_bytes,
         content_hmac = v_ver.content_hmac
   where id = v_ver.file_id;

  update public.storage_usage
     set used_bytes     = used_bytes + v_ver.size_bytes,
         reserved_bytes = greatest(reserved_bytes - v_ver.size_bytes, 0),
         file_count     = file_count + (case when v_file_status = 'pending' then 1 else 0 end),
         updated_at     = now()
   where user_id = p_user_id;
  update public.app_capacity
     set used_bytes     = used_bytes + v_ver.size_bytes,
         reserved_bytes = greatest(reserved_bytes - v_ver.size_bytes, 0),
         updated_at     = now()
   where id = 1;

  return query select v_ver.file_id, v_ver.version;
end;
$$;

------------------------------------------------------------------------------
-- cancel_upload: abandon a pending upload; returns the R2 key to delete (best effort).
------------------------------------------------------------------------------
create or replace function public.cancel_upload(p_user_id uuid, p_version_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ver public.file_versions%rowtype;
begin
  perform 1 from public.app_capacity where id = 1 for update;
  perform 1 from public.storage_usage where user_id = p_user_id for update;

  select * into v_ver from public.file_versions
   where id = p_version_id and user_id = p_user_id and status = 'pending' for update;
  if not found then
    return null;
  end if;

  delete from public.file_versions where id = v_ver.id;
  -- A brand-new file with no other versions disappears with its pending upload.
  delete from public.files f
   where f.id = v_ver.file_id and f.user_id = p_user_id and f.status = 'pending'
     and not exists (select 1 from public.file_versions where file_id = f.id);

  perform public._release_usage(p_user_id, 0, v_ver.size_bytes, 0);
  return v_ver.r2_key;
end;
$$;

------------------------------------------------------------------------------
-- delete_file: removes the file and all versions; returns R2 keys to delete.
------------------------------------------------------------------------------
create or replace function public.delete_file(p_user_id uuid, p_file_id uuid)
returns text[] language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status text;
  v_keys   text[];
  v_used   bigint;
  v_res    bigint;
begin
  perform 1 from public.app_capacity where id = 1 for update;
  perform 1 from public.storage_usage where user_id = p_user_id for update;

  select status into v_status from public.files where id = p_file_id and user_id = p_user_id;
  if not found then
    raise exception 'FILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(r2_key), '{}'::text[]),
         coalesce(sum(size_bytes) filter (where status = 'active'), 0),
         coalesce(sum(size_bytes) filter (where status = 'pending'), 0)
    into v_keys, v_used, v_res
    from public.file_versions where file_id = p_file_id and user_id = p_user_id;

  delete from public.files where id = p_file_id and user_id = p_user_id;
  perform public._release_usage(p_user_id, v_used, v_res, case when v_status = 'active' then 1 else 0 end);
  return v_keys;
end;
$$;

------------------------------------------------------------------------------
-- delete_version / restore_version
------------------------------------------------------------------------------
create or replace function public.delete_version(p_user_id uuid, p_file_id uuid, p_version int)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ver     public.file_versions%rowtype;
  v_current int;
begin
  perform 1 from public.app_capacity where id = 1 for update;
  perform 1 from public.storage_usage where user_id = p_user_id for update;

  select current_version into v_current from public.files where id = p_file_id and user_id = p_user_id;
  if not found then
    raise exception 'FILE_NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into v_ver from public.file_versions
   where file_id = p_file_id and user_id = p_user_id and version = p_version and status = 'active';
  if not found then
    raise exception 'VERSION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_ver.version = v_current then
    raise exception 'CANNOT_DELETE_CURRENT' using errcode = 'P0001';
  end if;

  delete from public.file_versions where id = v_ver.id;
  perform public._release_usage(p_user_id, v_ver.size_bytes, 0, 0);
  return v_ver.r2_key;
end;
$$;

create or replace function public.restore_version(p_user_id uuid, p_file_id uuid, p_version int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ver public.file_versions%rowtype;
begin
  select * into v_ver from public.file_versions
   where file_id = p_file_id and user_id = p_user_id and version = p_version and status = 'active';
  if not found then
    raise exception 'VERSION_NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.files
     set current_version = v_ver.version, size_bytes = v_ver.size_bytes, content_hmac = v_ver.content_hmac
   where id = p_file_id and user_id = p_user_id;
end;
$$;

------------------------------------------------------------------------------
-- delete_folder: removes a folder subtree; returns R2 keys of every file version inside.
------------------------------------------------------------------------------
create or replace function public.delete_folder(p_user_id uuid, p_folder_id uuid)
returns text[] language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_keys  text[];
  v_used  bigint;
  v_res   bigint;
  v_files int;
begin
  perform 1 from public.app_capacity where id = 1 for update;
  perform 1 from public.storage_usage where user_id = p_user_id for update;

  if not exists (select 1 from public.folders where id = p_folder_id and user_id = p_user_id) then
    raise exception 'FOLDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  with recursive tree as (
    select id from public.folders where id = p_folder_id and user_id = p_user_id
    union all
    select f.id from public.folders f join tree t on f.parent_id = t.id where f.user_id = p_user_id
  )
  select coalesce(array_agg(fv.r2_key), '{}'::text[]),
         coalesce(sum(fv.size_bytes) filter (where fv.status = 'active'), 0),
         coalesce(sum(fv.size_bytes) filter (where fv.status = 'pending'), 0),
         count(distinct fl.id) filter (where fl.status = 'active')
    into v_keys, v_used, v_res, v_files
    from public.files fl
    join public.file_versions fv on fv.file_id = fl.id
   where fl.user_id = p_user_id and fl.folder_id in (select id from tree);

  delete from public.folders where id = p_folder_id and user_id = p_user_id;
  perform public._release_usage(p_user_id, v_used, v_res, v_files);
  return v_keys;
end;
$$;

------------------------------------------------------------------------------
-- Shares
------------------------------------------------------------------------------
create or replace function public.create_share(
  p_user_id          uuid,
  p_file_id          uuid,
  p_token_hash       text,
  p_expires_at       timestamptz,
  p_can_download     boolean,
  p_pw_salt          text,
  p_pw_gate_hash     text,
  p_wrapped_file_key text,
  p_name_enc         text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_file public.files%rowtype;
  v_ver  public.file_versions%rowtype;
  v_id   uuid;
begin
  if p_expires_at <= now() or p_expires_at > now() + interval '365 days' then
    raise exception 'INVALID_EXPIRY' using errcode = 'P0001';
  end if;
  select * into v_file from public.files
   where id = p_file_id and user_id = p_user_id and status = 'active';
  if not found then
    raise exception 'FILE_NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into v_ver from public.file_versions
   where file_id = v_file.id and version = v_file.current_version and status = 'active';
  if not found then
    raise exception 'VERSION_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.shares (file_id, version_id, owner_id, token_hash, expires_at, can_download,
                             pw_salt, pw_gate_hash, wrapped_file_key, name_enc, mime_type, size_bytes)
  values (v_file.id, v_ver.id, p_user_id, p_token_hash, p_expires_at, p_can_download,
          p_pw_salt, p_pw_gate_hash, p_wrapped_file_key, p_name_enc, v_file.mime_type, v_ver.size_bytes)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.revoke_share(p_user_id uuid, p_share_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.shares set revoked_at = now()
   where id = p_share_id and owner_id = p_user_id and revoked_at is null;
  return found;
end;
$$;

create or replace function public.record_share_access(p_share_id uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.shares
     set access_count = access_count + 1, last_accessed_at = now()
   where id = p_share_id;
$$;

------------------------------------------------------------------------------
-- Maintenance
------------------------------------------------------------------------------
-- Abandon pending uploads older than p_older_than; returns R2 keys to delete.
create or replace function public.cleanup_stale_uploads(p_older_than interval default interval '1 hour')
returns table (out_r2_key text) language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
begin
  perform 1 from public.app_capacity where id = 1 for update;
  for r in
    select * from public.file_versions
     where status = 'pending' and created_at < now() - p_older_than
     order by user_id
     for update
  loop
    perform 1 from public.storage_usage where user_id = r.user_id for update;
    delete from public.file_versions where id = r.id;
    delete from public.files f
     where f.id = r.file_id and f.status = 'pending'
       and not exists (select 1 from public.file_versions where file_id = f.id);
    perform public._release_usage(r.user_id, 0, r.size_bytes, 0);
    out_r2_key := r.r2_key;
    return next;
  end loop;
end;
$$;

-- Recompute counters from source-of-truth rows (use if drift is ever suspected).
create or replace function public.recompute_usage(p_user_id uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.app_capacity where id = 1 for update;
  update public.storage_usage su
     set used_bytes     = coalesce((select sum(size_bytes) from public.file_versions
                                     where user_id = su.user_id and status = 'active'), 0),
         reserved_bytes = coalesce((select sum(size_bytes) from public.file_versions
                                     where user_id = su.user_id and status = 'pending'), 0),
         file_count     = (select count(*) from public.files where user_id = su.user_id and status = 'active'),
         updated_at     = now()
   where p_user_id is null or su.user_id = p_user_id;
  update public.app_capacity
     set used_bytes     = coalesce((select sum(used_bytes) from public.storage_usage), 0),
         reserved_bytes = coalesce((select sum(reserved_bytes) from public.storage_usage), 0),
         updated_at     = now()
   where id = 1;
end;
$$;

create or replace function public.prune_old_logs(p_keep_days int default 90)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.activity_logs where created_at < now() - make_interval(days => p_keep_days);
  delete from public.security_events where created_at < now() - make_interval(days => p_keep_days);
end;
$$;

-- Account deletion step 1: delete all rows that point at R2 objects, return keys, fix counters.
-- (Step 2, deleting the auth user, cascades the remaining rows.)
create or replace function public.purge_user_storage(p_user_id uuid)
returns text[] language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_keys text[];
  v_used bigint;
  v_res  bigint;
begin
  perform 1 from public.app_capacity where id = 1 for update;
  perform 1 from public.storage_usage where user_id = p_user_id for update;

  select coalesce(array_agg(r2_key), '{}'::text[]),
         coalesce(sum(size_bytes) filter (where status = 'active'), 0),
         coalesce(sum(size_bytes) filter (where status = 'pending'), 0)
    into v_keys, v_used, v_res
    from public.file_versions where user_id = p_user_id;

  delete from public.folders where user_id = p_user_id;
  delete from public.files where user_id = p_user_id;
  perform public._release_usage(p_user_id, v_used, v_res, 0);
  update public.storage_usage set file_count = 0 where user_id = p_user_id;
  return v_keys;
end;
$$;

-- Aggregates for the admin dashboard (the API checks role = 'admin' first).
create or replace function public.admin_overview()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cap public.app_capacity%rowtype;
begin
  select * into v_cap from public.app_capacity where id = 1;
  return jsonb_build_object(
    'users',            (select count(*) from public.profiles),
    'admins',           (select count(*) from public.profiles where role = 'admin'),
    'files',            (select count(*) from public.files where status = 'active'),
    'active_shares',    (select count(*) from public.shares where revoked_at is null and expires_at > now()),
    'capacity',         jsonb_build_object(
                          'max_bytes', v_cap.max_bytes, 'used_bytes', v_cap.used_bytes,
                          'reserved_bytes', v_cap.reserved_bytes, 'max_file_bytes', v_cap.max_file_bytes),
    'signups_by_day',   coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d)
                          from (select date_trunc('day', created_at)::date as d, count(*) as c
                                  from public.profiles where created_at > now() - interval '14 days'
                                 group by 1) s), '[]'::jsonb),
    'uploads_by_day',   coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d)
                          from (select date_trunc('day', created_at)::date as d, count(*) as c
                                  from public.file_versions
                                 where status = 'active' and created_at > now() - interval '14 days'
                                 group by 1) s), '[]'::jsonb)
  );
end;
$$;

------------------------------------------------------------------------------
-- Execution privileges: service_role only.
------------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  for fn in
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('_release_usage','begin_upload','complete_upload','cancel_upload','delete_file',
                         'delete_version','restore_version','delete_folder','create_share','revoke_share',
                         'cleanup_stale_uploads','recompute_usage','prune_old_logs','purge_user_storage',
                         'admin_overview','record_share_access','handle_new_user','folders_validate','files_validate')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end $$;

grant execute on function public.begin_upload(uuid, uuid, uuid, text, text, text, bigint, text, text) to service_role;
grant execute on function public.complete_upload(uuid, uuid, bigint) to service_role;
grant execute on function public.cancel_upload(uuid, uuid) to service_role;
grant execute on function public.delete_file(uuid, uuid) to service_role;
grant execute on function public.delete_version(uuid, uuid, int) to service_role;
grant execute on function public.restore_version(uuid, uuid, int) to service_role;
grant execute on function public.delete_folder(uuid, uuid) to service_role;
grant execute on function public.create_share(uuid, uuid, text, timestamptz, boolean, text, text, text, text) to service_role;
grant execute on function public.revoke_share(uuid, uuid) to service_role;
grant execute on function public.cleanup_stale_uploads(interval) to service_role;
grant execute on function public.recompute_usage(uuid) to service_role;
grant execute on function public.prune_old_logs(int) to service_role;
grant execute on function public.purge_user_storage(uuid) to service_role;
grant execute on function public.admin_overview() to service_role;
grant execute on function public.record_share_access(uuid) to service_role;
