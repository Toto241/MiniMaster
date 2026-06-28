# Security Incident — Secrets in public Git history (2026-06-27)

**Severity: CRITICAL.** When `Toto241/MiniMaster` was made **public**, secrets that
exist in the Git **history** (not the working tree) became publicly retrievable.
The working tree and current `HEAD` are clean (`npm run guard:secrets` passes); the
exposure is purely historical and must be treated as **compromised**.

## Findings

| # | Artifact (in history) | Severity | Notes |
|---|---|---|---|
| 1 | `minimaster-28fbd-firebase-adminsdk-fbsvc-7e76f1c1d4.json` — real Firebase Admin SDK **service-account private key** | 🔴 CRITICAL | `client_email: firebase-adminsdk-fbsvc@minimaster-28fbd.iam.gserviceaccount.com`. Grants full admin access to the Firebase project. Introduced in commit `1cd1ec9`, neutralised to `REPLACE_ME` in `bc83d64`, but the real key remains in history. |
| 2 | Firebase Web API key `AIzaSyBjINek6A4RVqha9_wOBTVQZ5PDyl9MBkE` | 🟠 MEDIUM | Present in 3 commits. Client-side identifier (not strictly secret) but should be restricted/rotated now that it is public. |
| 3 | `java_pid19756.hprof` — JVM heap dump | 🟠 MEDIUM | Heap dumps can contain in-memory secrets/PII. Should be purged from history. |
| — | `.env` values (Gemini, Resend keys) | ✅ none | Never committed (verified). |
| — | HTML/test/template `BEGIN PRIVATE KEY` hits | ✅ none | Placeholders / test fixtures, not real secrets. |

## Remediation

### Step 1 — ROTATE / REVOKE immediately (owner action, cannot be automated)
The leaked credentials are public and must be assumed compromised. **Do this first** —
scrubbing history does not undo prior exposure.

1. **Service-account key (CRITICAL):** Google Cloud Console → IAM & Admin →
   Service Accounts → `firebase-adminsdk-fbsvc@minimaster-28fbd` → Keys →
   **delete key id `7e76f1c1d4…`** and create a new one. Update any consumer
   (the `FIREBASE_SERVICE_ACCOUNT_KEY` GitHub secret / local `serviceAccountKey.json`)
   with the new key.
2. **Firebase Web API key:** Google Cloud Console → APIs & Services → Credentials →
   restrict the key (Application restrictions + API restrictions) or regenerate it.
3. Review Firebase/GCP audit logs for unexpected admin activity since the first
   public exposure.

### Step 2 — Purge the secrets from Git history (destructive; owner-authorised)
Rewrites history and requires a force-push to a public repo (affects clones/forks).
Run **after** rotation. Recommended tool: `git filter-repo`.

```bash
pip install git-filter-repo            # if not installed
# from a fresh mirror clone:
git clone --mirror https://github.com/Toto241/MiniMaster.git
cd MiniMaster.git
git filter-repo --invert-paths \
  --path minimaster-28fbd-firebase-adminsdk-fbsvc-7e76f1c1d4.json \
  --path java_pid19756.hprof
# (optionally also redact the web API key string with --replace-text)
git push --force --mirror
```

After force-pushing, open a GitHub Support request to purge cached views, and ask
known fork owners to delete/re-fork. **Note:** any party that already cloned retains
the data — Step 1 (rotation) is the only true mitigation.

### Step 3 — Prevention (DONE in code)
- `.gitignore` already excludes `*firebase-adminsdk*.json`, `serviceAccountKey*.json`, `*.hprof`.
- `scripts/secret-leak-guard.js` hardened: the `firebase-adminsdk*.json` filename rule
  now matches **prefixed** names (e.g. `minimaster-28fbd-firebase-adminsdk-*.json`),
  which previously slipped past the prefix-anchored pattern; `.hprof` files are now blocked.
  The content scan (`BEGIN PRIVATE KEY`, `service_account`) remains the backstop.

## Status
- Working tree / `HEAD`: clean (`guard:secrets` green).
- **Step 2 (history purge): DONE (2026-06-28).** `git filter-repo --invert-paths`
  removed `minimaster-28fbd-firebase-adminsdk-fbsvc-7e76f1c1d4.json` and
  `java_pid19756.hprof` from all history. All 14 branches + tags `v2.0.0`/`v2.1.0`
  force-pushed to `origin` (`main`: `459e7a0` → `e54f68b`). Verified: 0 reachable
  blobs across origin. Web API key (#2) intentionally left in history — it is a
  client-side identifier that still ships in the working tree; mitigate via API-key
  restrictions, not history rewrite.
- Prevention: in place (Step 3).
- **Owner actions still outstanding:**
  1. **Step 1 — key rotation (CRITICAL, not yet confirmed).** Scrubbing history does
     not invalidate the already-exposed key. Delete key `7e76f1c1d4…` in GCP and
     restrict the Web API key.
  2. **GitHub-side residue.** GitHub's read-only `refs/pull/*` refs (195 PR snapshots)
     and cached commit views (e.g. SHA `1cd1ec95…`) can still serve the old blob and
     are NOT writable by force-push. Open a GitHub Support request to purge cached
     views / stale PR refs.
  3. **Local stashes.** Two local-only stashes still reference pre-rewrite commits
     (not pushed). If their contents are no longer needed, drop them and run
     `git gc --prune=now` to evict the old objects locally.
