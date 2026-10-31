-- Atomic owner-authorized writes: one network round trip and a per-thread lock.
create or replace function :"KITLY_DB_SCHEMA".kitly_append_version(p_owner text, p_version jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare tid uuid := (p_version->>'threadId')::uuid; n int; result jsonb;
begin
  perform 1 from :"KITLY_DB_SCHEMA".kit_threads where id=tid and owner=p_owner for update;
  if not found then raise exception 'Thread not found'; end if;
  select coalesce(max(version),0)+1 into n from :"KITLY_DB_SCHEMA".kit_versions where thread_id=tid;
  insert into :"KITLY_DB_SCHEMA".kit_versions(thread_id,version,kind,user_text,plan,excluded_keys,status,options,explanation,diff,selection,follow_up)
  values(tid,n,p_version->>'kind',p_version->>'userText',p_version->'plan',array(select jsonb_array_elements_text(p_version->'excludedKeys')),p_version->>'status',p_version->'options',p_version->>'explanation',nullif(p_version->'diff','null'::jsonb),nullif(p_version->'selection','null'::jsonb),nullif(p_version->'followUp','null'::jsonb)) returning to_jsonb(kit_versions.*) into result;
  update :"KITLY_DB_SCHEMA".kit_threads set updated_at=greatest(updated_at,(result->>'created_at')::timestamptz) where id=tid;
  return jsonb_build_object('version',n,'createdAt',result->>'created_at');
end $$;
revoke all on function :"KITLY_DB_SCHEMA".kitly_append_version(text,jsonb) from public, anon, authenticated;
grant execute on function :"KITLY_DB_SCHEMA".kitly_append_version(text,jsonb) to service_role;

create or replace function :"KITLY_DB_SCHEMA".kitly_save_selection(p_thread uuid, p_owner text, p_selection jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from :"KITLY_DB_SCHEMA".kit_threads where id=p_thread and owner=p_owner for update;
  if not found then raise exception 'Thread not found'; end if;
  update :"KITLY_DB_SCHEMA".kit_versions set selection=p_selection where id=(select id from :"KITLY_DB_SCHEMA".kit_versions where thread_id=p_thread order by version desc limit 1);
  if not found then raise exception 'Version not found'; end if;
  update :"KITLY_DB_SCHEMA".kit_threads set updated_at=greatest(updated_at,clock_timestamp()) where id=p_thread;
end $$;
revoke all on function :"KITLY_DB_SCHEMA".kitly_save_selection(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function :"KITLY_DB_SCHEMA".kitly_save_selection(uuid,text,jsonb) to service_role;
notify pgrst, 'reload schema';
