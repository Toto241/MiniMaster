# Mini-Master: Parental Control Application Suite

Mini-Master is a comprehensive Android parental control solution with a Node.js/Firebase backend, consisting of a `masterApp` (parent) and `childApp` (child) with Firebase Cloud Functions backend.

**ALWAYS follow these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

### Backend Setup and Testing
- **Install Dependencies:** Always start with dependency installation from project root:
  ```bash
  npm install
  ```
  Takes ~40 seconds. Expect TypeScript version warnings (5.9.2 vs supported <5.6.0) but these are non-blocking.

- **Run Backend Tests:** Comprehensive unit test suite for Cloud Functions:
  ```bash
  npm test
  ```
  **NEVER CANCEL:** Takes ~15-30 seconds. ALWAYS wait for completion. 7 tests covering pairing code creation and validation.

- **Lint Code:** Check code quality before commits:
  ```bash
  npm run lint
  ```
  Takes ~5 seconds. Expect TypeScript version warning but linting passes.

### Android Apps Setup
**CRITICAL:** Android builds fail in restricted environments due to network access to dl.google.com being blocked.

**Expected Error Message:**
```
Could not GET 'https://dl.google.com/dl/android/maven2/...'
> dl.google.com
```

1. **Prerequisites (if building locally):**
   - Download and place `google-services.json` in both `masterApp/` and `childApp/` directories
   - Gradle wrapper is included (`./gradlew` exists)

2. **Build Commands (only work with full network access):**
   ```bash
   # Make gradlew executable
   chmod +x ./gradlew
   
   # Build debug APKs - NEVER CANCEL: Can take 5-15 minutes on first run
   ./gradlew :masterApp:assembleDebug
   ./gradlew :childApp:assembleDebug
   
   # Run Android unit tests - NEVER CANCEL: Takes 3-10 minutes  
   ./gradlew testDebugUnitTest
   
   # Run instrumented tests (requires device/emulator)
   ./gradlew :masterApp:connectedAndroidTest
   ./gradlew :childApp:connectedAndroidTest
   
   # Check Kotlin code style
   ./gradlew ktlintCheck
   ```

3. **Network Limitations Workaround:**
   - In restricted environments, document that Android builds cannot be verified
   - Reference the CI pipeline (`.github/workflows/ci.yml`) which runs these builds
   - Focus on backend validation which works fully

### Firebase Deployment
**Note:** Firebase CLI may not be available in all environments.

```bash
# Deploy all (requires Firebase CLI and authentication)
firebase deploy

# Deploy specific components
firebase deploy --only functions
firebase deploy --only firestore  
firebase deploy --only storage
```

## Validation Scenarios

### Backend Validation (Always Possible)
1. **Run full test suite and ensure all pass:**
   ```bash
   npm test
   ```
   **Expected:** 7/7 tests passing covering:
   - `createPairingCode`: 4 tests (success, collision retry, missing childId, max attempts)
   - `validatePairingToken`: 3 tests (valid token, invalid token, expired token)
   - Runtime: ~15-30 seconds

2. **Verify linting passes:**
   ```bash
   npm run lint
   ```
   **Expected:** No errors, TypeScript version warning is normal and safe to ignore

3. **Check TypeScript compilation:**
   ```bash
   npx tsc --noEmit
   ```
   **Expected:** No output (silent success)

### End-to-End Testing (Device Required)
- **E2E Test Script:** `./run_e2e_test.sh` automates full pairing flow
- **Requirements:** Android device/emulator with both apps installed
- **NEVER CANCEL:** E2E tests can take 5-10 minutes for full flow

### CI Validation
- **Always check CI status:** `.github/workflows/ci.yml` runs on push/PR
- **Backend job:** npm ci, lint, test (always passes in clean environment)
- **Android job:** Gradle builds and tests (may fail in restricted networks)

## Build Times and Timeouts

**CRITICAL TIMEOUT SETTINGS:**
- **Backend tests:** 30+ seconds (set timeout to 60+ seconds)
- **Backend dependency install:** 60+ seconds (set timeout to 120+ seconds)
- **Android builds (first time):** 5-15 minutes (set timeout to 30+ minutes)
- **Android tests:** 3-10 minutes (set timeout to 20+ minutes)
- **E2E tests:** 5-10 minutes (set timeout to 20+ minutes)

**NEVER CANCEL these operations. They are expected to take significant time.**

## Known Limitations and Issues

### Critical Issues (Per COMPREHENSIVE_ISSUES_ANALYSIS.md)
1. **Android Manifest Syntax Error:** `masterApp/src/main/AndroidManifest.xml:14` has invalid XML syntax
2. **Data Model Inconsistency:** Firestore rules use nested structure but Cloud Functions use flat structure
3. **Missing Internationalization:** masterApp lacks i18n support despite documentation claims

### Network Restrictions
- **Google Maven Repository:** Access to `dl.google.com` is blocked in restricted environments
- **Exact Error:** `Could not GET 'https://dl.google.com/dl/android/maven2/...' > dl.google.com`
- **Affected Commands:** Any `./gradlew` command (build, test, tasks, etc.)
- **Workaround:** Focus on backend validation; reference CI for Android builds
- **Firebase CLI:** May not be available; document deployment commands for reference

### Environment Compatibility
- **Node.js Version:** Requires v20+ (specified in README)
- **TypeScript Warning:** Version 5.9.2 vs supported <5.6.0 is expected and non-blocking

## Common Tasks Reference

### Repository Structure
```
MiniMaster/
├── README.md              # Project overview and setup
├── package.json           # Node.js dependencies and scripts  
├── index.ts              # Firebase Cloud Functions
├── firestore.rules       # Firestore security rules
├── storage.rules         # Firebase Storage rules
├── test/                 # Backend unit tests
├── masterApp/            # Parent Android app
├── childApp/             # Child Android app
├── .github/workflows/    # CI/CD configuration
└── run_e2e_test.sh      # End-to-end test automation
```

### Quick Commands Summary
```bash
# Essential validation (always works)
npm install && npm run lint && npm test

# TypeScript compilation check
npx tsc --noEmit

# Android validation (requires network access - will fail with dl.google.com error)
chmod +x ./gradlew && ./gradlew testDebugUnitTest

# Full build (network dependent)
./gradlew assembleDebug
```

## Troubleshooting

### When Android Commands Fail
**Symptoms:** Any `./gradlew` command fails with `dl.google.com` network error
**Solution:** This is expected in restricted environments. Focus on backend validation:
```bash
# Use these commands instead
npm run lint    # Always works
npm test       # Always works
npx tsc --noEmit  # Always works
```

### When Tests Fail
**Backend Test Failures:**
- Ensure `npm install` completed successfully
- Check that Node.js v20+ is available
- Memory issues: Tests use `--max-old-space-size=4096`

**TypeScript Version Warning:**
- Expected warning: "YOUR TYPESCRIPT VERSION: 5.9.2" vs supported <5.6.0
- This is non-blocking and safe to ignore
- Linting and compilation still work correctly

### Quick Health Check
Run this command to verify everything is working:
```bash
npm run lint && npm test && echo "✅ Repository is healthy"
```
Should complete in ~20-35 seconds total.

## Testing Strategy

### Unit Tests Coverage
- **Backend:** 7 tests covering Cloud Functions (createPairingCode, validatePairingToken)
- **Android:** Limited unit tests, documented in `Testanleitung.md`
- **Missing:** Some ViewModels lack unit tests (see COMPREHENSIVE_ISSUES_ANALYSIS.md)

### Manual Testing
- **Reference:** Complete manual test scenarios in `Testanleitung.md`
- **Languages:** Test plan includes German documentation
- **End-to-End:** Covers full pairing flow between parent and child apps

### Automated Testing
- **CI Pipeline:** Runs on every push/PR
- **E2E Script:** Automates device-based testing when hardware available
- **Documentation:** `AUTOMATED_UX_TESTS_SUMMARY.md` details current coverage

## Key Project Files

### Configuration
- `package.json` - Node.js project configuration
- `tsconfig.json` - TypeScript configuration  
- `jest.config.cjs` - Test configuration
- `.eslintrc.js` - Linting rules
- `firebase.ts` - Firebase initialization

### Documentation
- `README.md` - Main project documentation
- `ARCHITECTURE.md` - System architecture overview
- `Testanleitung.md` - Comprehensive testing guide (German)
- `RUNBOOK.md` - Operations and deployment guide
- `COMPREHENSIVE_ISSUES_ANALYSIS.md` - Known issues and fixes needed

### Build and Deployment
- `.github/workflows/ci.yml` - CI/CD pipeline
- `build.gradle` - Root Gradle configuration
- `settings.gradle` - Gradle project settings
- `gradlew` / `gradlew.bat` - Gradle wrapper scripts

Remember: **ALWAYS validate your changes with `npm test` and `npm run lint` before committing.** These are the most reliable validation steps available in any environment.