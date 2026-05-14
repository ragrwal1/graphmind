-- Consolidate the app-facing data model around members.
-- Current product surface:
-- 1. members: profile and editable vocabulary
-- 2. member_notes: immutable raw note log
-- 3. member_memory: AI rollup and embedding used for matching
-- 4. companies: future company base for matching

drop view if exists entity_name_vocabulary;
drop function if exists update_investor_aliases(text, text[], text);

drop table if exists processing_queue cascade;
drop table if exists entity_resolution_log cascade;
drop table if exists investor_context_notes cascade;
drop table if exists claims cascade;
drop table if exists voice_notes cascade;
drop table if exists investor_alias_revisions cascade;
drop table if exists sync_runs cascade;

do $$
begin
  if to_regclass('public.investors') is not null
     and to_regclass('public.members') is null then
    alter table investors rename to members;
  end if;

  if to_regclass('public.investor_notes') is not null
     and to_regclass('public.member_notes') is null then
    alter table investor_notes rename to member_notes;
  end if;

  if to_regclass('public.investor_memory_overviews') is not null
     and to_regclass('public.member_memory') is null then
    alter table investor_memory_overviews rename to member_memory;
  end if;
end $$;

alter table if exists member_notes
  rename column investor_id to member_id;

alter table if exists member_memory
  rename column investor_id to member_id;

alter table if exists members
  drop column if exists portfolio_company_names;

alter table if exists member_memory
  drop column if exists interest_tags,
  drop column if exists sentiment_label,
  drop column if exists overview_text_hash,
  drop column if exists overview_embedding_model,
  drop column if exists overview_embedding_updated_at,
  drop column if exists overview_generation_model,
  drop column if exists overview_prompt_version;

alter index if exists investors_airtable_id_idx rename to members_airtable_id_idx;
alter index if exists investors_status_idx rename to members_status_idx;
alter index if exists investors_embedding_ivfflat_idx rename to members_embedding_ivfflat_idx;
alter index if exists investor_notes_investor_id_occurred_at_idx rename to member_notes_member_id_occurred_at_idx;
alter index if exists investor_memory_overviews_embedding_ivfflat_idx rename to member_memory_embedding_ivfflat_idx;
alter index if exists investor_memory_overviews_overview_json_idx rename to member_memory_overview_json_idx;

drop index if exists investor_memory_overviews_interest_tags_idx;
drop index if exists investor_memory_overviews_text_hash_idx;
drop index if exists investor_memory_overviews_prompt_version_idx;

alter table if exists members
  rename constraint investors_status_check to members_status_check;

alter table if exists member_notes
  rename constraint investor_notes_note_text_check to member_notes_note_text_check;

alter table if exists member_notes
  rename constraint investor_notes_source_check to member_notes_source_check;

alter table if exists member_memory
  rename constraint investor_memory_overviews_note_count_check to member_memory_note_count_check;

alter table if exists member_memory
  drop constraint if exists investor_memory_overviews_sentiment_label_check,
  drop constraint if exists member_memory_sentiment_label_check;

drop trigger if exists set_investors_updated_at on members;
drop trigger if exists set_members_updated_at on members;
create trigger set_members_updated_at
before update on members
for each row execute function set_updated_at();

create or replace function update_member_aliases(
  p_airtable_id text,
  p_aliases text[]
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
begin
  update members
  set
    aliases = p_aliases,
    material_change = true
  where members.airtable_id = p_airtable_id;

  if not found then
    raise exception 'Member not found for airtable_id %', p_airtable_id
      using errcode = 'P0002';
  end if;

  return query
  select
    members.airtable_id,
    members.name,
    members.aliases,
    members.related_organization,
    members.email,
    members.linkedin,
    members.raw_hash
  from members
  where members.airtable_id = p_airtable_id;
end;
$$;

update members
set airtable_id = replace(
  replace(airtable_id, 'snapshot-investor-', 'snapshot-member-'),
  'manual-investor-',
  'manual-member-'
)
where airtable_id like 'snapshot-investor-%'
   or airtable_id like 'manual-investor-%';
