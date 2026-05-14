-- Airtable webhook cursor/state storage plus hash-guarded sync upserts.

create table if not exists sync_state (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_sync_state_updated_at on sync_state;
create trigger set_sync_state_updated_at
before update on sync_state
for each row execute function set_updated_at();

create or replace function sync_upsert_member(
  p_airtable_id text,
  p_name text,
  p_aliases text[],
  p_related_organization text,
  p_email text,
  p_linkedin text,
  p_raw_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer;
begin
  with upserted as (
    insert into members (
      airtable_id,
      name,
      aliases,
      related_organization,
      email,
      linkedin,
      raw_hash,
      material_change,
      status,
      synced_at
    ) values (
      p_airtable_id,
      p_name,
      coalesce(p_aliases, '{}'::text[]),
      p_related_organization,
      p_email,
      p_linkedin,
      p_raw_hash,
      true,
      'active',
      now()
    )
    on conflict (airtable_id) do update set
      name = excluded.name,
      aliases = excluded.aliases,
      related_organization = excluded.related_organization,
      email = excluded.email,
      linkedin = excluded.linkedin,
      raw_hash = excluded.raw_hash,
      material_change = members.raw_hash is distinct from excluded.raw_hash,
      status = 'active',
      synced_at = now(),
      embedding = case
        when members.raw_hash is distinct from excluded.raw_hash then null
        else members.embedding
      end
    where members.raw_hash is distinct from excluded.raw_hash
    returning 1
  )
  select exists(select 1 from upserted) into did_write;

  return did_write;
end;
$$;

create or replace function sync_upsert_company(
  p_airtable_id text,
  p_name text,
  p_aliases text[],
  p_vertical text,
  p_stage text,
  p_diligence_status text,
  p_description text,
  p_fiscal_year text,
  p_website text,
  p_contact_email text,
  p_source_organization text,
  p_raw_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  did_write boolean;
begin
  with upserted as (
    insert into companies (
      airtable_id,
      name,
      aliases,
      vertical,
      stage,
      diligence_status,
      description,
      fiscal_year,
      website,
      contact_email,
      source_organization,
      raw_hash,
      material_change,
      status,
      synced_at
    ) values (
      p_airtable_id,
      p_name,
      coalesce(p_aliases, '{}'::text[]),
      p_vertical,
      p_stage,
      p_diligence_status,
      p_description,
      p_fiscal_year,
      p_website,
      p_contact_email,
      p_source_organization,
      p_raw_hash,
      true,
      'active',
      now()
    )
    on conflict (airtable_id) do update set
      name = excluded.name,
      aliases = excluded.aliases,
      vertical = excluded.vertical,
      stage = excluded.stage,
      diligence_status = excluded.diligence_status,
      description = excluded.description,
      fiscal_year = excluded.fiscal_year,
      website = excluded.website,
      contact_email = excluded.contact_email,
      source_organization = excluded.source_organization,
      raw_hash = excluded.raw_hash,
      material_change = companies.raw_hash is distinct from excluded.raw_hash,
      status = 'active',
      synced_at = now(),
      embedding = case
        when companies.raw_hash is distinct from excluded.raw_hash then null
        else companies.embedding
      end
    where companies.raw_hash is distinct from excluded.raw_hash
    returning 1
  )
  select exists(select 1 from upserted) into did_write;

  return did_write;
end;
$$;

create or replace function sync_archive_member(p_airtable_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  did_write boolean;
begin
  update members
  set status = 'archived',
      material_change = true,
      synced_at = now()
  where airtable_id = p_airtable_id
    and status is distinct from 'archived';

  get diagnostics changed_count = row_count;
  return changed_count > 0;
end;
$$;

create or replace function sync_archive_company(p_airtable_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer;
begin
  update companies
  set status = 'archived',
      material_change = true,
      synced_at = now()
  where airtable_id = p_airtable_id
    and status is distinct from 'archived';

  get diagnostics changed_count = row_count;
  return changed_count > 0;
end;
$$;
