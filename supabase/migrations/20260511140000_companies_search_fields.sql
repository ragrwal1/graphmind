-- Add fields needed for hybrid search and company card display.
-- The companies table was created in the initial migration with core fields;
-- this migration adds the CSV-sourced enrichment columns and search indexes.

-- Additional company fields from the opportunities CSV
alter table companies add column if not exists website text;
alter table companies add column if not exists contact_email text;
alter table companies add column if not exists source_organization text;

-- Full-text search index: name + description + vertical (GIN for @@ operator)
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

-- Semantic nearest-neighbour search via pgvector cosine distance.
-- Returns companies ordered by embedding similarity to a query vector.
create or replace function search_companies_semantic(
  query_embedding vector(1536),
  match_count     int   default 20,
  similarity_threshold float default 0.25
)
returns table (
  airtable_id      text,
  name             text,
  vertical         text,
  stage            text,
  diligence_status text,
  description      text,
  website          text,
  similarity       float
)
language sql stable
as $$
  select
    airtable_id,
    name,
    vertical,
    stage,
    diligence_status,
    description,
    website,
    (1 - (embedding <=> query_embedding))::float as similarity
  from companies
  where status = 'active'
    and embedding is not null
    and (1 - (embedding <=> query_embedding)) > similarity_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Semantic nearest-neighbour search for members (investors).
-- Members already have an embedding column; this surfaces them via RPC too.
create or replace function search_members_semantic(
  query_embedding vector(1536),
  match_count     int   default 10,
  similarity_threshold float default 0.25
)
returns table (
  airtable_id          text,
  name                 text,
  aliases              text[],
  related_organization text,
  email                text,
  linkedin             text,
  raw_hash             text,
  similarity           float
)
language sql stable
as $$
  select
    airtable_id,
    name,
    aliases,
    related_organization,
    email,
    linkedin,
    raw_hash,
    (1 - (embedding <=> query_embedding))::float as similarity
  from members
  where status = 'active'
    and embedding is not null
    and (1 - (embedding <=> query_embedding)) > similarity_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
