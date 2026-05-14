-- Persist edit history for investor entity vocabulary changes.

create table if not exists investor_alias_revisions (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references investors(id) on delete cascade,
  previous_aliases text[] not null default '{}',
  next_aliases text[] not null default '{}',
  edited_by text,
  created_at timestamptz not null default now(),
  constraint investor_alias_revisions_changed_check check (previous_aliases is distinct from next_aliases)
);

create index if not exists investor_alias_revisions_investor_id_created_at_idx
  on investor_alias_revisions (investor_id, created_at desc);

create or replace function update_investor_aliases(
  p_airtable_id text,
  p_aliases text[],
  p_edited_by text default null
)
returns table (
  airtable_id text,
  name text,
  aliases text[],
  related_organization text,
  email text,
  linkedin text,
  raw_hash text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_investor investors%rowtype;
begin
  select *
  into existing_investor
  from investors
  where investors.airtable_id = p_airtable_id
  for update;

  if not found then
    raise exception 'Investor not found for airtable_id %', p_airtable_id
      using errcode = 'P0002';
  end if;

  if existing_investor.aliases is distinct from p_aliases then
    update investors
    set
      aliases = p_aliases,
      material_change = true
    where id = existing_investor.id;

    insert into investor_alias_revisions (
      investor_id,
      previous_aliases,
      next_aliases,
      edited_by
    )
    values (
      existing_investor.id,
      existing_investor.aliases,
      p_aliases,
      p_edited_by
    );
  end if;

  return query
  select
    investors.airtable_id,
    investors.name,
    investors.aliases,
    investors.related_organization,
    investors.email,
    investors.linkedin,
    investors.raw_hash
  from investors
  where investors.id = existing_investor.id;
end;
$$;
