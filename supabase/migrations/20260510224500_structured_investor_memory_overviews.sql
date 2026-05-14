-- Store investor memory as structured JSON while keeping overview_text as the
-- canonical flattened text used for display fallback and future embeddings.

alter table if exists investor_memory_overviews
  add column if not exists overview_json jsonb not null default '{}'::jsonb;

create index if not exists investor_memory_overviews_overview_json_idx
  on investor_memory_overviews using gin (overview_json);
