-- Track whether overview_embedding matches the current overview_text.

alter table if exists investor_memory_overviews
  add column if not exists overview_text_hash text,
  add column if not exists overview_embedding_model text,
  add column if not exists overview_embedding_updated_at timestamptz;

create index if not exists investor_memory_overviews_text_hash_idx
  on investor_memory_overviews (overview_text_hash);
