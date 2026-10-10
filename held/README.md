# Held — Decide before you build

A guided Product Decision OS. Walk a short week: name the bet, focus, explore real options, choose as the Decider, fake a product, watch real people, leave with a **Verdict Packet**.

No design-sprint experience required — every step explains what you do, what AI does, and what not to skip.

## Run the guided demo

```bash
npm install
npm run verify:core
npm run dev          # http://localhost:3000
npm run test:e2e     # headless FTUE walkthrough (dev server must be up)
npm run build
```

1. Open `/` — brand + plain-language “how it works”
2. **Start the guided demo** → `/sprint`
3. Welcome modal (first visit) → coach + checklist through Verdict
4. Export the Verdict Packet (`.md`)

## What you leave with

**Verdict Packet:** the bet → evidence with sources → Ship / Loop / Kill → what to build next.

## Deep tech (ours)

| System | Role |
| --- | --- |
| Sprint Graph + Gate Runtime | Append-only Decider events; illegal skips throw |
| Diversity Engine | Niche + cosine floors; kills near-dupes |
| Preference Model | Pairwise signals from heat/straw/supervote (never auto-decide) |
| Evidence Graph | Claims cite sources; linked to sprint questions |
| Verdict Eval Harness | Grades citations, diversity, human supervote, Friday rules |
| Façade Compiler | Storyboard → interview tasks → instrumented states |

## Adapters (plugs — not the company)

`src/lib/adapters/` — swappable: Map research, LLM, Codegen, Panel. Local demos today; Apify / OpenRouter / etc. later.

## Persistence

- Durable file repository at `.data/sprints/` via `/api/sprints`
- Postgres DDL in [`src/lib/db/schema.sql`](src/lib/db/schema.sql)
- Browser caches in localStorage; UI prefers the API store

Stack: Next.js 15 · React 19 · Tailwind v4
