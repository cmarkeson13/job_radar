## Benchmark Scoring Workflow

We seeded 20 synthetic jobs (two per 10‑point score band) under the company `TEST Benchmarks`. Use them to calibrate the AI scoring pipeline without touching real data.

### 1. Seed (or re-seed) the benchmark jobs

```bash
psql "$SUPABASE_DB_URL" -f scripts/seed_benchmark_jobs.sql
```

The script is idempotent; it deletes every `bench_%` job before inserting fresh rows.

### 2. Score the benchmarks

Use the existing UI bulk action (`Score Selected`) or call the scoring API so every `bench_%` job has `score_you`, reasoning, strengths/gaps, and hard blockers populated.

### 3. Analyze the distribution

Run the helper script to compare actual scores with the intended bands.

```bash
node scripts/analyze-benchmarks.js
```

Requirements:

- `.env.local` (or environment) must expose `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (read-only is fine but service role simplifies access).
- Node 18+.

The script prints:

- Each benchmark job with expected midpoint (e.g., `90-100 ⇒ 95`) vs. the actual score and delta.
- Mean delta / mean absolute delta across the full set.
- Per-band deltas to see which slices are over/under-scored.

### 4. Prompt tuning loop

1. Inspect the deltas + reasoning.
2. Update `MATCHING_SYSTEM_PROMPT` (in `lib/profile-schema.ts`) to reward/punish the right signals.
3. Re-score ONLY the benchmark jobs to avoid token waste.
4. Re-run `node scripts/analyze-benchmarks.js` and compare against the target.

Repeat until the distribution aligns with expectations (90s look like must-interview, 10s are clear hard-no, etc.). Once satisfied, re-score the full job list.

