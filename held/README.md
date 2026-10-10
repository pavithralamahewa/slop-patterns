# Held — Product Decision OS

Compress “what should we build?” into a week of structured learning. Agents diverge. **You Decide.** Five real users close a **Verdict Packet**.

Not a UI generator. Not Miro with chat. Not Apify + OpenRouter with a landing page.

## Product deliverable

**Verdict Packet:** Founding Hypothesis → evidence with provenance → Ship / Loop / Kill → what to build next.

## Deep tech (ours)

| System | Role |
| --- | --- |
| Sprint Graph + Gate Runtime | Append-only Decider events; illegal skips throw |
| Diversity Engine | Niche + cosine floors; kills near-dupes |
| Preference Model | Pairwise signals from heat/straw/supervote (never auto-votes) |
| Evidence Graph | Claims cite sources; linked to sprint questions |
| Verdict Eval Harness | Grades Map citations, diversity, human supervote, Friday rules |
| Façade Compiler | Storyboard → interview task graph → instrumented states |

## Adapters (plugs — not the company)

`src/lib/adapters/` — swappable interfaces:

- Map research → local demo today; `map.apify` stub for Apify
- LLM → local draft today; `llm.openrouter` stub for OpenRouter
- Codegen → local HTML façade stub (v0/etc. later)
- Panel → local screener draft (Respondent / User Interviews later)

## Sprint Zero (dogfood)

Encoded Design Sprint **on Held itself** at `/sprint`:

1. Foundation — Founding Hypothesis locked  
2. Map — first-run target + 3 questions + cited evidence  
3. Sketch — Diversity Engine filters clone  
4. Decide — human supervote only  
5. Prototype — Façade Compiler + codegen adapter  
6. Test — five real users required; no fake quotes  
7. Verdict — exportable Verdict Packet (.md)

```bash
npm install
npm run dev          # http://localhost:3000/sprint
npm run verify:core  # diversity + gates + dogfood → test + adapters
npm run build
```

Production Postgres Gate Runtime ships **after** five real Friday interviews (plan dogfood order).

## Stack

Next.js 15 · React 19 · Tailwind v4

**Persistence (v1):**
- Durable file repository at `.data/sprints/` via `/api/sprints`
- Postgres DDL ready in [`src/lib/db/schema.sql`](src/lib/db/schema.sql) — set `DATABASE_URL` when wiring `pg`
- Browser keeps localStorage cache; UI prefers API store

Separate from Slop Patterns.
