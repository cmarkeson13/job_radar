# Efficiency Roadmap

Longer-term tasks to move the app from “works” to “efficient”. Each block follows the same template: **Issue**, **Solution**, **Implementation Plan**.

---

## 1. Model quality vs. reliability
- **Issue:** GPT-3.5 struggles with strict JSON, causing retries and inconsistent scores.
- **Solution:** Standardize on GPT-4o / GPT-4.1 (with an optional “cheap mode” fallback) for resume analysis, job analysis, and matching.
- **Implementation Plan:** Add `OPENAI_RESUME_MODEL`, `OPENAI_JOB_ANALYZER_MODEL`, `OPENAI_MATCH_MODEL` envs; update defaults; add a toggle or feature flag for “economy mode”.
- **Status:** ✅ Economy/Premium toggle shipped. Use `OPENAI_MODEL_ECONOMY` (default GPT‑3.5) and `OPENAI_MODEL_PREMIUM`/`OPENAI_RESUME_MODEL` (default GPT‑4o mini) to tune models per environment.

## 2. Selective company fetching
- **Issue:** Bulk fetch hits every company even if only a few are new or stale, wasting time and rate-limit budget.
- **Solution:** Support targeted fetches (newly added companies, selected subset) and keep the existing “stale in 7 days” fallback.
- **Implementation Plan:** Extend `/api/jobs/fetch` to accept `companyIds`; fire a fetch automatically when a new company is created/imported; update UI with checkboxes.

## 3. Job analyzer reuse
- **Issue:** Job descriptions that haven’t changed still trigger analyzer/scoring work.
- **Solution:** Store a hash of the description; only re-run `analyzeJobProfile` when the hash changes; reuse cached JSON otherwise.
- **Implementation Plan:** Add `description_hash` column, compute before upsert, skip analyzer if unchanged; add index for quick comparison.

## 4. Minimal scoring via score versions
- **Issue:** Users re-score the entire backlog even if only a handful of jobs or preferences changed.
- **Solution:** Track `score_version` (per user) and `needs_scoring` flags so only new/changed jobs are queued.
- **Implementation Plan:** 
  1. Add `score_version` to `user_profiles`, `job_score_version` + `needs_scoring` to `jobs`.
  2. On resume/preference change: increment version and set `needs_scoring=true` for open jobs.
  3. On new/updated job: set `needs_scoring=true`.
  4. Scoring API selects `WHERE needs_scoring=true` and updates `job_score_version`.

## 5. Priority queue for fetch + scoring
- **Issue:** All jobs/companies are treated equally; no way to prioritize “new company” or “urgent” batches.
- **Solution:** Introduce a lightweight queue table (or Supabase cron) that tracks pending company/job tasks with priority/status.
- **Implementation Plan:** Create `job_tasks` table with `type (fetch|score)`, `priority`, `payload`, `status`; workers poll this table; UI enqueues tasks via API.

## 6. Budget-aware scoring
- **Issue:** Users can accidentally trigger huge scoring batches and burn tokens.
- **Solution:** Let them cap runs by count, estimated cost, or score freshness.
- **Implementation Plan:** Add UI inputs (max jobs, max $) before calling `/api/jobs/score-all`; backend enforces the limit and reports estimated vs. actual cost.

## 7. Auto-purge stale data
- **Issue:** Closed jobs pile up and inflate queries + UI noise.
- **Solution:** Archive or delete jobs that have been `closed_flag=true` for > X days; optionally export to CSV before purge.
- **Implementation Plan:** Add nightly cron/API that moves stale jobs to an `archived_jobs` table or deletes them; surface “archive now” button in UI.

## 8. Dashboards for freshness
- **Issue:** Hard to tell which companies/jobs need attention.
- **Solution:** Expose “last fetched” and “jobs pending scoring” indicators directly in the UI.
- **Implementation Plan:** 
  - Companies page: badges for “stale > 7 days” and “pending detection”.
  - Jobs/Top Matches: banner “N jobs awaiting score”.
  - Optionally, send email/slack digest summarizing deltas.

---

Tackle items in order of ROI: start with model upgrade + selective fetches (fast wins), then score-versioning and job hashes for the biggest long-term savings. This list lives in `docs/efficiency-todo.md`; keep updating it as we check items off.


