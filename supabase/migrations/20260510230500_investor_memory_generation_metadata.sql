-- Record which prompt and model generated the current memory overview.

alter table if exists investor_memory_overviews
  add column if not exists overview_generation_model text,
  add column if not exists overview_prompt_version text;

create index if not exists investor_memory_overviews_prompt_version_idx
  on investor_memory_overviews (overview_prompt_version);
