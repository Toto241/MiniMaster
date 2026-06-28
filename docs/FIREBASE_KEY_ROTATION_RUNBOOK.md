# Firebase Key Rotation Runbook (Pre-Go-Live)

**Status:** Critical Security Task — Must complete before production rollout
**Audience:** Security Team / DevOps Lead
**Timeline:** ~2 hours (with GCP approval buffer)

> **Fast path (post-incident, 2026-06-28):** after generating the new key in the
> GCP Console, install it everywhere in one step:
> ```powershell
> npm run key:install -- -KeyPath C:\path\to\new-key.json -SetCiSecret
> ```
> This validates the file (rejects the revoked key `7e76f1c1d4…`, the template,
> and wrong-project keys), writes the git-ignored `serviceAccountKey.json`, runs
> the secret-leak guard, and updates the `FIREBASE_SERVICE_ACCOUNT_KEY` Actions
> secret via `gh` — without ever printing the key. Production Cloud Functions use
> Application Default Credentials and need **no** key file. The manual steps below
> remain the reference / rollback procedure.

---

## Overview

MiniMaster uses Firebase Admin SDK in Cloud Functions to manage authentication, Firestore real-time database, and Cloud Storage. Service account keys must be rotated before go-live to:

- ✅ Limit key lifespan exposure (old key: ~2 months without rotation)
- ✅ Enable IP-based access restrictions (Cloud Functions region + Admin Console)
- ✅ Establish audit trail for compliance
- ✅ Practice key rotation protocol for future updates

---

## Pre-Rotation Checklist

- [ ] **Backup current key** (if not in Secret Manager)
  ```bash
  # Current key location:
  # - Local: Not committed (in .gitignore ✅)
  # - CI/CD: GitHub Secrets FIREBASE_SERVICE_ACCOUNT_KEY
  # - Secure?: IAM Editor role restricted to `toto241@...` (verify)
  ```

- [ ] **No active deployments** in progress
  - Check GitHub Actions: no running `firebase deploy`
  - Stagger key rotation: deploy new functions **after** old key is revoked

- [ ] **Secret guard passes locally**
  - Run `npm run guard:secrets` from repository root
  - Resolve any reported tracked credential leak before key operations

- [ ] **Firebase Console access** ready (GCP Project: `minimaster-28fbd`)
  - [ ] Able to access Service Accounts page
  - [ ] Able to view/manage keys
  - [ ] Able to manage Firestore security rules

- [ ] **Access to GitHub Secrets** (for CI/CD rotation)
  - [ ] Can view/edit Secrets in repo settings
  - [ ] Can trigger Actions to test deployment

---

## Step 1: Generate New Service Account Key

**Location:** Cloud Console → Project `minimaster-28fbd` → Service Accounts

### 1a. Navigate to Service Account

```
GCP Cloud Console
├─ Select Project: "minimaster-28fbd"
├─ IAM & Admin → Service Accounts
└─ Find: "firebase-adminsdk-{hash}@minimaster-28fbd.iam.gserviceaccount.com"
```

### 1b. Create New Key (JSON format)

1. Click service account email link
2. Go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Select **JSON** format
5. Click **Create**
   - **New key will be downloaded automatically**
   - **Save to secure location** (password-protected file manager / 1Password / Azure Key Vault)

**⚠️ Important:**
- Do NOT commit to Git
- Do NOT share unencrypted
- Expires in 90 days — plan next rotation

### 1c. Verify New Key Contents

```bash
# Verify JSON structure (PowerShell)
$key = Get-Content "path\to\new-firebase-adminsdk-key.json" | ConvertFrom-Json
Write-Host "Project ID: $($key.project_id)"
Write-Host "Key ID: $($key.private_key_id)"
Write-Host "Type: $($key.type)"  # Should be "service_account"
```

---

## Step 2: Test New Key Against Staging

### 2a. Deploy Cloud Functions with New Key

**Location:** CI/CD or Local Firebase CLI

```bash
# Local testing (using new key in environment)
$env:GOOGLE_APPLICATION_CREDENTIALS = "path\to\new-key.json"

# Deploy functions only (dry-run first)
firebase deploy --only functions --dry-run

# If dry-run succeeds, run actual deploy
firebase deploy --only functions
```

### 2b. Verify Deployment Works

```typescript
// Quick smoke test in Cloud Functions logs
// Expected: New key authenticates successfully
console.log("Service account project:", admin.app().options.projectId);
// Should output: "minimaster-28fbd"
```

### 2c. Test All Key Endpoints

Use the admin-panel test interface:

```
Admin Dashboard → Debug Commands
  ├─ GET_MASTER_DEVICE (requires new key auth)
  ├─ CREATE_TASK (write to Firestore)
  ├─ COMPLETE_TASK (read/write task + upload photo)
  └─ EXPORT_USER_DATA (read all user collections)
```

**Expected result:** All commands return 200 OK with valid data.

---

## Step 3: Rotate in GitHub Secrets

### 3a. Update CI/CD Secret

**Location:** GitHub Repo → Settings → Secrets and variables → Actions

1. Go to **Secrets** section
2. Find secret: `FIREBASE_SERVICE_ACCOUNT_KEY`
3. Click **Update secret**
4. Paste **entire contents** of new JSON key
5. Click **Update secret**

```bash
# (GitHub UI — no CLI needed)
# Monitor: GitHub Actions → Recent runs should show "Secret was rotated"
```

### 3b. Trigger Test Deployment

```bash
# In GitHub Actions, manually trigger test build
GitHub → Actions → "CI: Revalidate Release Gates"
  → Click "Run workflow"
  → Keep "main" branch selected
  → Click "Run workflow"
```

**Wait for completion (~10 min)**
Expected result:
- ✅ `npm run build` passes
- ✅ `npm run lint` passes
- ✅ `npm run test` passes (1500/1500 tests, 40 suites)
- ✅ `firebase deploy --dry-run` successful

---

## Step 4: Revoke Old Key

⚠️ **ONLY after new key verified in production!**

### 4a. Identify Old Key

**Location:** Cloud Console → Service Accounts → Keys

- **Current(Old) Key:** Created ~2026-01-15, Key ID: `xxxxxxxx...`, Status: **Active**
- **New Key:** Created ~2026-03-22, Key ID: `yyyyyyyy...`, Status: **Active**

### 4b. Delete Old Key

1. Click on old key row
2. Click **Delete** (⚠️ irreversible)
3. Confirm: "Yes, delete this key"

**Result:** Old key can no longer authenticate to Firebase
**Impact:** Any lingering processes using old key will fail immediately

### 4c. Document Key ID for Audit

Update file: `docs/RELEASE_EVIDENCE_REGISTER.md`

```markdown
### Firebase Key Rotation (2026-03-22)

| Field | Value |
|-------|-------|
| Old Key ID | xxxxxxxx... |
| Old Key Created | 2026-01-15 |
| Old Key Deleted | 2026-03-22 14:30 UTC |
| New Key ID | yyyyyyyy... |
| New Key Created | 2026-03-22 |
| New Key Expires | 2026-06-20 |
| Rotated By | [Your Name] |
| Verified In | GitHub Actions CI + Admin Panel tests |
```

---

## Step 5: (Optional) Enable IP Restrictions

**One-time setup for additional security:**

### 5a. If using Cloud Functions with Cloud NAT

```bash
# GCP Cloud Console → VPC network → Cloud NAT
# Ensure Cloud Functions egress goes through NAT
# (reduces attack surface for key compromise)
```

### 5b. Firestore Security Rules — Verify Admin SDK Auth

Check `firestore.rules` includes admin SDK bypass:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Admin SDK (service account) can always read/write
    match /{document=**} {
      allow read, write: if request.auth.uid != null
                         || request.auth.token.iss == "https://securetoken.google.com/minimaster-28fbd";
    }
  }
}
```

**Current state:** ✅ Rules already include admin SDK bypass (no changes needed)

---

## Step 6: Add to Automation (Future Rotations)

### 6a. Calendar Reminder

Set recurring calendar event:
- **Event:** "Firebase Service Account Key Rotation Due"
- **Frequency:** Every 90 days
- **Owner:** Security Team Lead
- **Attendees:** DevOps, Engineering Lead

### 6b. Automate Key Rotation (Future Work)

```typescript
// Future: Use Google Secret Manager with automatic rotation
// reference: https://cloud.google.com/docs/authentication/best-practices-automating-key-rotation

// GCP recommendation:
// - Store Service Account key in Secret Manager
// - Enable automatic rotation (AWS Secrets Manager pattern)
// - Update CI/CD to fetch from Secret Manager instead of GitHub Secrets
```

---

## Rollback Procedure (If New Key Fails)

⚠️ **Only if new key causes production incidents**

### Signs of Key Issues
- Cloud Functions return `unauthenticated` errors
- Firestore reads/writes timeout
- Storage upload/download fail
- Admin Panel unable to execute tasks

### Rollback Steps

1. **Immediately revoke new key**
   ```bash
   gcloud iam service-accounts keys delete [NEW_KEY_ID] \
    --iam-account=firebase-adminsdk-...@minimaster-28fbd.iam.gserviceaccount.com
   ```

2. **Restore old key in GitHub Secrets**
   - If old key was deleted: restore from backup (1Password / Key Vault)
   - Update `FIREBASE_SERVICE_ACCOUNT_KEY` secret
   - Re-trigger Actions

3. **Redeploy Cloud Functions**
   ```bash
   firebase deploy --only functions
   ```

4. **Verify rollback**
   - Check Admin Panel again
   - Review Cloud Functions logs for "old key" authentication

5. **Root cause analysis**
   - Check if new key lacked required IAM roles
   - Verify secret format (no extra whitespace)
   - Review error logs in Cloud Functions

---

## Success Criteria ✅

- [ ] New key generated and securely stored
- [ ] New key tested against staging endpoints
- [ ] New key deployed to GitHub Secrets
- [ ] CI/CD test deployment passes (1500/1500 tests, 40 suites)
- [ ] Old key revoked successfully
- [ ] Key rotation documented in RELEASE_EVIDENCE_REGISTER.md
- [ ] No production incidents post-rotation (24h monitoring)

---

## Contact

**If key rotation fails?**
- Check GCP Service Account IAM roles (must include `roles/firebase.admin`)
- Review GitHub Secrets format (paste JSON exactly as downloaded)
- Contact GCP support: `Toto241/MiniMaster` project repo

**References**
- [Google Cloud Service Account Keys](https://cloud.google.com/docs/authentication/production)
- [Firebase Admin SDK Authentication](https://firebase.google.com/docs/admin/setup)
- [Key Rotation Best Practices](https://cloud.google.com/docs/authentication/best-practices-automating-key-rotation)
