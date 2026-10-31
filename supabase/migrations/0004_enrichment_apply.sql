-- Apply is a single compare/snapshot/write transaction, including across server instances.
create schema if not exists :"KITLY_DB_SCHEMA";
create or replace function :"KITLY_DB_SCHEMA".kitly_apply_listing(
  p_id text, p_expected jsonb, p_snapshot jsonb, p_patch jsonb, p_updated_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  original :"KITLY_DB_SCHEMA".products;
  expected :"KITLY_DB_SCHEMA".products;
  updated :"KITLY_DB_SCHEMA".products;
begin
  select * into original from :"KITLY_DB_SCHEMA".products where id = p_id for update;
  if not found then return jsonb_build_object('status','missing'); end if;
  if original.title = p_patch->>'title' and original.description = p_patch->>'description'
    and to_jsonb(original.tags) = p_patch->'tags' and original.attributes = p_patch->'attributes'
    then return jsonb_build_object('status','used'); end if;
  expected := jsonb_populate_record(null:: :"KITLY_DB_SCHEMA".products, p_expected);
  if original is distinct from expected then return jsonb_build_object('status','changed'); end if;
  insert into :"KITLY_DB_SCHEMA".product_versions(product_id,snapshot) values(p_id,p_snapshot);
  update :"KITLY_DB_SCHEMA".products set title=p_patch->>'title', description=p_patch->>'description',
    tags=array(select jsonb_array_elements_text(p_patch->'tags')), attributes=p_patch->'attributes',
    updated_for_demand_at=p_updated_at where id=p_id returning * into updated;
  return jsonb_build_object('status','ok','product',to_jsonb(updated));
end $$;
revoke all on function :"KITLY_DB_SCHEMA".kitly_apply_listing(text,jsonb,jsonb,jsonb,timestamptz) from public;
grant execute on function :"KITLY_DB_SCHEMA".kitly_apply_listing(text,jsonb,jsonb,jsonb,timestamptz) to service_role;
notify pgrst, 'reload schema';
