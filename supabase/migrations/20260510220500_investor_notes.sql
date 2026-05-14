-- Desktop-authored investor memory notes and derived summaries.

create table if not exists investor_notes (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references investors(id) on delete cascade,
  note_text text not null,
  occurred_at timestamptz not null default now(),
  source text not null default 'desktop',
  created_by text,
  created_at timestamptz not null default now(),
  constraint investor_notes_note_text_check check (char_length(trim(note_text)) > 0),
  constraint investor_notes_source_check check (source in ('desktop', 'voice', 'import'))
);

create index if not exists investor_notes_investor_id_occurred_at_idx
  on investor_notes (investor_id, occurred_at desc);

create table if not exists investor_note_summaries (
  investor_id uuid primary key references investors(id) on delete cascade,
  summary_text text not null default '',
  sentiment_label text not null default 'unknown',
  interest_tags text[] not null default '{}',
  embedding_input text not null default '',
  summary_embedding vector(1536),
  note_count integer not null default 0,
  last_note_at timestamptz,
  summary_updated_at timestamptz not null default now(),
  constraint investor_note_summaries_note_count_check check (note_count >= 0),
  constraint investor_note_summaries_sentiment_label_check check (
    sentiment_label in ('unknown', 'positive', 'selective', 'cautious', 'negative', 'mixed')
  )
);

create index if not exists investor_note_summaries_interest_tags_idx
  on investor_note_summaries using gin (interest_tags);

create index if not exists investor_note_summaries_embedding_ivfflat_idx
  on investor_note_summaries using ivfflat (summary_embedding vector_cosine_ops)
  with (lists = 4)
  where summary_embedding is not null;
