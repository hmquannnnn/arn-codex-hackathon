create schema if not exists :"KITLY_DB_SCHEMA";

-- psql template: supply -v KITLY_DB_SCHEMA="$KITLY_DB_SCHEMA". Never change the configured schema.
create table :"KITLY_DB_SCHEMA".shops (id text primary key, name text not null, tier text not null, rating numeric not null,
  ship_fee int not null, city text not null);
create table :"KITLY_DB_SCHEMA".products (id text primary key, shop_id text references :"KITLY_DB_SCHEMA".shops(id), title text not null,
  category text not null, description text not null, price int not null, rating numeric not null,
  review_count int not null, sold_count int not null, stock int not null, tags text[] not null default '{}',
  attributes jsonb not null default '{}', ship_days_min int not null, ship_days_max int not null,
  updated_for_demand_at timestamptz);
create table :"KITLY_DB_SCHEMA".product_versions (id bigserial primary key, product_id text references :"KITLY_DB_SCHEMA".products(id),
  snapshot jsonb not null, created_at timestamptz default now());
create table :"KITLY_DB_SCHEMA".vouchers (id text primary key, scope text not null, shop_id text references :"KITLY_DB_SCHEMA".shops(id),
  code text not null, kind text not null, value int not null, max_discount int, min_spend int not null,
  valid_until date not null, owner_persona text, label text not null);   -- owner_persona null = public (D46)
create table :"KITLY_DB_SCHEMA".personas (id text primary key, name text not null, district text, city text,
  favorite_shop_ids text[] not null default '{}', cart jsonb not null default '[]');   -- D39, only 'lan' is stored
create table :"KITLY_DB_SCHEMA".intent_sessions (id uuid primary key default gen_random_uuid(), query text not null,
  event text not null, language text not null, plan jsonb not null, source text not null,
  created_at timestamptz not null default now());
create table :"KITLY_DB_SCHEMA".demand_items (id bigserial primary key, session_id uuid references :"KITLY_DB_SCHEMA".intent_sessions(id) on delete cascade,
  event text not null, need_label text not null, category text, tags text[] not null default '{}',
  matched_count int not null, budget_hint int, created_at timestamptz not null);
create table :"KITLY_DB_SCHEMA".insight_advice (gap_key text primary key, counts_signature text not null, advice text not null);
create table :"KITLY_DB_SCHEMA".demand_watches (id bigserial primary key, gap_key text not null, created_at timestamptz default now()); -- Full
create table :"KITLY_DB_SCHEMA".kit_threads (id uuid primary key default gen_random_uuid(), owner text not null, title text not null,
  persona text not null default 'lan',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table :"KITLY_DB_SCHEMA".kit_versions (id bigserial primary key, thread_id uuid not null references :"KITLY_DB_SCHEMA".kit_threads(id) on delete cascade,
  version int not null, kind text not null, user_text text not null, plan jsonb not null,
  excluded_keys text[] not null default '{}', status text not null, options jsonb not null default '[]',
  explanation text not null default '', diff jsonb, selection jsonb, follow_up jsonb,
  created_at timestamptz not null default now(), unique (thread_id, version));
create table :"KITLY_DB_SCHEMA".kit_messages (id bigserial primary key, thread_id uuid not null references :"KITLY_DB_SCHEMA".kit_threads(id) on delete cascade,
  after_version int not null, user_text text not null, answer text not null, follow_up jsonb,
  created_at timestamptz not null default now());                                    -- D42 answer turns
create index on :"KITLY_DB_SCHEMA".kit_threads (owner, updated_at desc);
create index on :"KITLY_DB_SCHEMA".demand_items (created_at); create index on :"KITLY_DB_SCHEMA".products (category);

grant usage on schema :"KITLY_DB_SCHEMA" to service_role;
grant all privileges on table :"KITLY_DB_SCHEMA".shops, :"KITLY_DB_SCHEMA".products, :"KITLY_DB_SCHEMA".product_versions, :"KITLY_DB_SCHEMA".vouchers, :"KITLY_DB_SCHEMA".personas, :"KITLY_DB_SCHEMA".intent_sessions, :"KITLY_DB_SCHEMA".demand_items, :"KITLY_DB_SCHEMA".insight_advice, :"KITLY_DB_SCHEMA".demand_watches, :"KITLY_DB_SCHEMA".kit_threads, :"KITLY_DB_SCHEMA".kit_versions, :"KITLY_DB_SCHEMA".kit_messages to service_role;
grant all privileges on sequence :"KITLY_DB_SCHEMA".product_versions_id_seq, :"KITLY_DB_SCHEMA".demand_items_id_seq, :"KITLY_DB_SCHEMA".demand_watches_id_seq, :"KITLY_DB_SCHEMA".kit_versions_id_seq, :"KITLY_DB_SCHEMA".kit_messages_id_seq to service_role;
