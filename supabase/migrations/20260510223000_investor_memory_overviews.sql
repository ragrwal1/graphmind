-- Simplify investor memory architecture:
-- notes are the immutable log, memory_overviews are the canonical rollup used
-- by the profile UI and future company matching.

do $$
begin
  if to_regclass('public.investor_note_summaries') is not null
     and to_regclass('public.investor_memory_overviews') is null then
    alter table investor_note_summaries rename to investor_memory_overviews;
  end if;
end $$;

alter table if exists investor_memory_overviews
  rename column summary_text to overview_text;

alter table if exists investor_memory_overviews
  rename column summary_embedding to overview_embedding;

alter table if exists investor_memory_overviews
  rename column summary_updated_at to overview_updated_at;

alter table if exists investor_memory_overviews
  drop column if exists embedding_input;

alter index if exists investor_note_summaries_interest_tags_idx
  rename to investor_memory_overviews_interest_tags_idx;

alter index if exists investor_note_summaries_embedding_ivfflat_idx
  rename to investor_memory_overviews_embedding_ivfflat_idx;

alter table if exists investor_memory_overviews
  rename constraint investor_note_summaries_note_count_check
  to investor_memory_overviews_note_count_check;

alter table if exists investor_memory_overviews
  rename constraint investor_note_summaries_sentiment_label_check
  to investor_memory_overviews_sentiment_label_check;
