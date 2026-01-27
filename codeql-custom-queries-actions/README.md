# CodeQL Custom Queries Development Guide

This directory contains custom CodeQL queries extending the default `codeql/actions-all` pack for MiniMaster-specific security and quality checks.

## Structure

```
codeql-custom-queries-actions/
├── codeql-pack.yml          # Pack metadata & dependencies
├── codeql-pack.lock.yml     # Locked dependency versions
└── example.ql               # Example query (Hello World problem)
```

## Available Queries in the Pack

### Transitive Dependencies

```yaml
codeql/actions-all: ^0.4.26  # Base pack: Security & Quality rules for JS/TS + Java/Kotlin
```

Includes checks for:
- **JavaScript/TypeScript**: XSS, SQL injection, unsafe DOM manipulation, command injection
- **Java/Kotlin**: SQL injection, unsafe reflection, weak cryptography, resource leaks

## Custom Query Template

To add a MiniMaster-specific query, create a new `.ql` file following this pattern:

```ql
/**
 * @name [Human-readable name]
 * @kind problem
 * @problem.severity [warning|error]
 * @id minimaster/[category]/[query-id]
 * @tags [security|quality]
 * @description
 * Detailed explanation of the security/quality issue detected.
 */

import [language]  // 'javascript' or 'java' depending on target

from [DataFlowNode|AST Node] node
where
  // Your detection logic here
select node, "Message explaining the issue"
```

## Domain-Specific Security Patterns to Monitor

### Firebase Firestore (TypeScript/JavaScript)

1. **Exposed `secretKey` in logs** – Flag any `console.log/warn/error()` containing `secretKey` variable
2. **Direct field mutation without validation** – Detect `FieldValue.serverTimestamp()` without prior rule check
3. **Missing `families/*` namespace check** – Warn if new Firestore paths added without `families/*` deny rule verification

### Android (Kotlin/Java)

1. **SharedPreferences storing sensitive data** – Flag `MasterCredentialsRepository` writes without encryption
2. **AccessibilityService abuse** – Detect if `MiniMasterAccessibilityService` performs unauthorized access
3. **FCM token leakage** – Warn if `fcmToken` sent in cleartext outside Firebase messaging

### Common

1. **Hardcoded secrets** – API keys, Firebase config, etc.
2. **Insecure deserialization** – Untrusted JSON parsing in Cloud Functions
3. **Missing input validation** – Cloud Functions without early `invalid-argument` throws

## Example: Detect `secretKey` in Logs

```ql
/**
 * @name Potential secretKey leak in logs
 * @kind problem
 * @problem.severity error
 * @id minimaster/firebase/secretkey-leak
 */

import javascript

from CallExpr call, Identifier secretKey
where
  // Detect console.log/warn/error() with secretKey variable
  (
    call.getCallee().(MemberExpr).getProperty().getName() in ["log", "warn", "error"] or
    call.getCallee().(Identifier).getName() in ["log", "warn", "error"]
  ) and
  secretKey.getName() = "secretKey" and
  call.hasArgument(secretKey)
select call, "Potential secretKey exposure in logs. Use functions.logger.info() instead."
```

## Workflow Integration

**File**: `.github/workflows/codeql-analysis.yml`

**How it runs**:
1. CodeQL CLI initializes with this pack
2. Custom queries + transitive dependencies (`codeql-custom-queries-actions` + `codeql/actions-all`) are compiled
3. Analysis runs on JavaScript and Java code
4. Results appear in GitHub Security tab

## Debugging CodeQL Queries

### Local Testing

```bash
# Install CodeQL CLI (requires codeql binary in PATH)
codeql query run --database=<path-to-db> path/to/query.ql
```

### Create a test database (requires Java/JavaScript code in codebase)

```bash
codeql database create --language=javascript ./db
codeql database analyze ./db codeql/javascript-queries
```

### Query Structure Checks

- Use CodeQL extension in VS Code (configured in `.vscode/settings.json`)
- Syntax errors appear in "Problems" panel
- Test queries against a real codebase before committing

## Best Practices for New Queries

1. **Start with the `codeql/actions-all` base pack** – Leverage existing queries, extend only for MiniMaster-specific issues
2. **Use DataFlow analysis for taint tracking** – For security-critical flows (e.g., user input → Firestore write)
3. **Document severity clearly** – `error` for security-critical, `warning` for quality
4. **Test on PR before enabling CI gate** – Add to `.github/workflows/codeql-analysis.yml` only after validation
5. **Name query IDs consistently** – Format: `minimaster/[domain]/[check]` (e.g., `minimaster/firebase/auth-bypass`)

## References

- [CodeQL documentation](https://codeql.github.com/docs/)
- [QL language reference](https://codeql.github.com/docs/ql-language-reference/)
- [CodeQL for JavaScript](https://codeql.github.com/docs/codeql-language-guides/codeql-for-javascript/)
- [CodeQL for Java](https://codeql.github.com/docs/codeql-language-guides/codeql-for-java/)
