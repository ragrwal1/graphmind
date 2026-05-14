-- Ensure app-facing semantic search RPCs exist and are visible to PostgREST.
-- This is intentionally idempotent so GitHub-backed Supabase migrations can
-- repair projects that were linked after the original search migration landed.

create index if not exists companies_embedding_ivfflat_idx
  on companies using ivfflat (embedding vector_cosine_ops)
  with (lists = 50)
  where embedding is not null;

create index if not exists companies_fts_idx
  on companies
  using gin(
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(vertical, '')
    )
  );

create or replace function search_companies_semantic(
  query_embedding vector(1536),
  match_count int default 20,
  similarity_threshold float default 0.25
)
returns table (
  airtable_id text,
  name text,
  vertical text,
  stage text,
  diligence_status text,
  description text,
  website text,
  similarity float
)
language sql stable
as $$
  select
    companies.airtable_id,
    companies.name,
    companies.vertical,
    companies.stage,
    companies.diligence_status,
    companies.description,
    companies.website,
    (1 - (companies.embedding <=> query_embedding))::float as similarity
  from companies
  where companies.status = 'active'
    and companies.embedding is not null
    and (1 - (companies.embedding <=> query_embedding)) > similarity_threshold
  order by companies.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function search_members_semantic(
  query_embedding vector(1536),
  match_count int default 10,
  similarity_threshold float default 0.25
)
returns table (
  airtable_id text,
  name text,
  aliases text[],
  related_organization text,
  email text,
  linkedin text,
  raw_hash text,
  similarity float
)
language sql stable
as $$
  select
    members.airtable_id,
    members.name,
    members.aliases,
    members.related_organization,
    members.email,
    members.linkedin,
    members.raw_hash,
    (1 - (member_memory.overview_embedding <=> query_embedding))::float as similarity
  from member_memory
  join members on members.id = member_memory.member_id
  where members.status = 'active'
    and member_memory.overview_embedding is not null
    and (1 - (member_memory.overview_embedding <=> query_embedding)) > similarity_threshold
  order by member_memory.overview_embedding <=> query_embedding
  limit match_count;
$$;

notify pgrst, 'reload schema';
