-- Graphmind V1 schema: voice-first VC memory.
-- Requires pgvector for OpenAI text-embedding-3-small vectors.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'predicate_type') then
    create type predicate_type as enum (
      'investor.thesis_vertical',
      'investor.stage_preference',
      'investor.check_size',
      'investor.geography_preference',
      'investor.pass_reason',
      'investor.next_step',
      'company.raise_status',
      'company.raise_amount',
      'company.key_strength',
      'company.concern',
      'investor.nickname',
      'investor.pronunciation',
      'investor.relationship_context',
      'investor.personal_detail',
      'investor.general_context'
    );
  end if;
end $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  airtable_id text unique not null,
  name text not null,
  aliases text[] not null default '{}',
  vertical text,
  stage text,
  diligence_status text,
  description text,
  fiscal_year text,
  embedding vector(1536),
  raw_hash text,
  material_change boolean not null default false,
  status text not null default 'active',
  synced_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint companies_status_check check (status in ('active', 'inactive', 'archived'))
);

create table if not exists investors (
  id uuid primary key default gen_random_uuid(),
  airtable_id text unique not null,
  name text not null,
  aliases text[] not null default '{}',
  related_organization text,
  email text,
  linkedin text,
  embedding vector(1536),
  raw_hash text,
  material_change boolean not null default false,
  status text not null default 'active',
  synced_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint investors_status_check check (status in ('active', 'inactive', 'archived'))
);

create table if not exists voice_notes (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid references investors(id) on delete set null,
  speaker_id uuid,
  storage_path text,
  duration_s integer,
  raw_transcript text,
  corrected_transcript text,
  status text not null default 'processing',
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint voice_notes_status_check check (
    status in ('processing', 'done', 'failed', 'empty', 'extraction_failed')
  ),
  constraint voice_notes_retry_count_check check (retry_count >= 0),
  constraint voice_notes_duration_check check (duration_s is null or duration_s >= 0)
);

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  subject_entity_id uuid not null,
  subject_entity_type text not null,
  predicate predicate_type not null,
  object_text text,
  tense text,
  claim_confidence double precision,
  source_voice_note_id uuid references voice_notes(id) on delete set null,
  status text not null default 'pending',
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint claims_subject_entity_type_check check (subject_entity_type in ('company', 'investor')),
  constraint claims_confidence_check check (
    claim_confidence is null or (claim_confidence >= 0 and claim_confidence <= 1)
  ),
  constraint claims_status_check check (status in ('pending', 'approved', 'rejected'))
);

create table if not exists investor_context_notes (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid references investors(id) on delete cascade,
  note_type text not null,
  note_text text not null,
  source_voice_note_id uuid references voice_notes(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint investor_context_notes_type_check check (
    note_type in ('nickname', 'pronunciation', 'relationship', 'personal', 'general')
  )
);

create table if not exists entity_resolution_log (
  id uuid primary key default gen_random_uuid(),
  raw_token text,
  candidate_entity_id uuid,
  candidate_name text,
  fuse_score double precision,
  resolved boolean not null default false,
  voice_note_id uuid references voice_notes(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint entity_resolution_log_score_check check (
    fuse_score is null or (fuse_score >= 0 and fuse_score <= 1)
  )
);

create table if not exists processing_queue (
  id uuid primary key default gen_random_uuid(),
  voice_note_id uuid references voice_notes(id) on delete cascade,
  status text not null default 'queued',
  enqueued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint processing_queue_status_check check (status in ('queued', 'processing', 'done', 'failed'))
);

create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  records_checked integer not null default 0,
  records_updated integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint sync_runs_records_checked_check check (records_checked >= 0),
  constraint sync_runs_records_updated_check check (records_updated >= 0)
);

create index if not exists companies_airtable_id_idx on companies (airtable_id);
create index if not exists companies_status_idx on companies (status);
create index if not exists companies_fiscal_year_idx on companies (fiscal_year desc);
create index if not exists companies_active_fiscal_year_idx on companies (fiscal_year desc) where status = 'active';

create index if not exists investors_airtable_id_idx on investors (airtable_id);
create index if not exists investors_status_idx on investors (status);

create index if not exists voice_notes_investor_id_idx on voice_notes (investor_id);
create index if not exists voice_notes_status_idx on voice_notes (status);
create index if not exists voice_notes_created_at_idx on voice_notes (created_at desc);

create index if not exists claims_subject_entity_id_idx on claims (subject_entity_id);
create index if not exists claims_status_idx on claims (status);
create index if not exists claims_confidence_idx on claims (claim_confidence desc);
create index if not exists claims_subject_status_confidence_idx
  on claims (subject_entity_type, subject_entity_id, status, claim_confidence desc);

create index if not exists investor_context_notes_active_idx
  on investor_context_notes (investor_id)
  where active = true;

create index if not exists entity_resolution_log_voice_note_id_idx
  on entity_resolution_log (voice_note_id);

create index if not exists processing_queue_queued_idx
  on processing_queue (enqueued_at)
  where status = 'queued';

create index if not exists sync_runs_source_started_at_idx
  on sync_runs (source, started_at desc);

-- pgvector indexes are created after table definition. Lists are small today,
-- but these preserve the API contract as the CRM grows.
create index if not exists companies_embedding_ivfflat_idx
  on companies using ivfflat (embedding vector_cosine_ops)
  with (lists = 16)
  where embedding is not null;

create index if not exists investors_embedding_ivfflat_idx
  on investors using ivfflat (embedding vector_cosine_ops)
  with (lists = 4)
  where embedding is not null;

drop trigger if exists set_companies_updated_at on companies;
create trigger set_companies_updated_at
before update on companies
for each row execute function set_updated_at();

drop trigger if exists set_investors_updated_at on investors;
create trigger set_investors_updated_at
before update on investors
for each row execute function set_updated_at();

create or replace view entity_name_vocabulary as
select
  'company'::text as entity_type,
  id as entity_id,
  name,
  aliases,
  updated_at,
  status
from companies
union all
select
  'investor'::text as entity_type,
  id as entity_id,
  name,
  aliases,
  updated_at,
  status
from investors;
