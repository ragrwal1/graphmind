# STT POC

Minimal isolated speech-to-structured-memory demo.

## Run

From the repo root:

```sh
node poc/stt-demo/server.mjs
```

Open `http://localhost:8787`, click Record, say something like:

```text
rohan is now into cars and abhi really likes energy
```

Then click Stop. The response includes the spoken name, resolved member name, and
the `airtable_id` exposed as `investor_id` for quick downstream wiring.

## Env

The server reads `.env.local` and `.env` from the repo root.

Required:

```sh
OPENAI_API_KEY=
```

Optional, for live member nicknames from Supabase:

```sh
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

If Supabase is not configured or fails, the POC falls back to `app/data/members.seed.json`.
