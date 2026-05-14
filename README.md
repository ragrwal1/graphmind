# Graphmind

Voice-first VC memory: company and investor profiles, entity-resolved claims, and explainable recommendations (Airtable + Supabase + Vercel + OpenAI).

## Setup

Copy `.env.example` to `.env.local`, fill values, then `npm install` and `npm run dev`.

## Deploy

Production: [https://realm-graphmind.vercel.app](https://realm-graphmind.vercel.app) (Vercel project `graphmind`, `main`).

`graphmind.vercel.app` is taken by an unrelated app. **`graphmind.realmspark.vercel.app` cannot be assigned from this Vercel account**: `*.realmspark.vercel.app` is reserved for another team. To use that hostname, someone with access to the **realmspark** Vercel team must add this project’s production deployment as a domain there, or you use a DNS name you control (for example `graphmind.realmspark.com`).

Set env vars in the Vercel project to match `.env.example`; `APP_URL` should match the public URL above (or your eventual custom domain).
