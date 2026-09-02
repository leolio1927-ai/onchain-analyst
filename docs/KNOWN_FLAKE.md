# KNOWN TEST FLAKES

| File | Symptom | Isolate | Root Cause | Action |
|---|---|---|---|---|
| `TokenPage.test.tsx` `HoldingsPage.test.tsx` `FeeFrontier.test.tsx` | Full vitest suite timeout (20s) under high concurrency | Passes 100% when isolated or using `--pool=forks` | Resource contention in node default worker threads on Windows/WSL | Do not re-investigate on timeout in full suite; run isolated or with `--pool=forks`. |
| `landing.test.tsx` | Unhandled error (timer / DOM event) | n/a | Pre-existing async timer outside swap scope | Do not touch / keep isolated |
