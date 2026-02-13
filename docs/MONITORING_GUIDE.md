# Monitoring & Observability Guide

## Overview

MiniMaster implements comprehensive monitoring and audit logging covering:
- **Audit Logging:** All critical actions logged to Firestore for GDPR compliance
- **Performance Monitoring:** Function execution times tracked and logged
- **Health Checks:** `/healthCheck` endpoint for system status monitoring
- **Admin Dashboard:** Web-based audit log viewer with filtering and export

---

## Audit Logs

### What is Logged

All critical user actions are automatically logged to the `audit_logs` Firestore collection. Each log entry includes:

- **timestamp**: When the action occurred
- **userId**: Who performed the action
- **userRole**: Role of the user (master, child, admin)
- **action**: Type of action performed
- **resource**: Type of resource affected
- **resourceId**: Specific resource identifier
- **result**: Success or failure
- **errorMessage**: Error details (if failed)
- **metadata**: Additional context (previous state, counts, etc.)

### Logged Actions

| Action | Trigger | Data Stored |
|--------|---------|-------------|
| `DEVICE_LOCK_CHANGED` | Master locks/unlocks child device | childId, isLocked, previousState |
| `BLACKLIST_UPDATED` | Master updates app blacklist | childId, appCount, previousCount |
| `USAGE_RULES_UPDATED` | Master sets screen time rules | childId, rules data |
| `TASK_CREATED` | Master creates a task | taskId, description, deadline |
| `TASK_COMPLETED` | Child completes task | taskId, proofUrl, previousStatus |
| `TASK_APPROVED` | Master approves task | taskId, unlockDuration |
| `PAIRING_CODE_CREATED` | Master generates pairing code | code, expiresAt |
| `DEVICE_PAIRED` | Child device successfully pairs | childId, isPremium |
| `ACCOUNT_DELETION_REQUESTED` | User initiates account deletion | timestamp |
| `ACCOUNT_DELETED` | Account successfully deleted | childrenDeleted, tasksDeleted |
| `DATA_EXPORTED` | User exports their data (GDPR) | childrenCount, tasksCount |

### Accessing Audit Logs

#### Admin Panel (Web UI)

1. Navigate to `/admin-panel/audit-logs.html`
2. Login with admin credentials
3. Use filters to narrow results:
   - User ID
   - Action type
   - Result (success/failure)
   - Date range
4. Click "View" on any entry for detailed information
5. Export filtered results to CSV

#### Programmatic Access (Firestore)

```javascript
// Get logs for a specific user
const logs = await firebase.firestore()
    .collection('audit_logs')
    .where('userId', '==', 'specific-imei')
    .orderBy('timestamp', 'desc')
    .limit(100)
    .get();

// Get all failed actions in the last 24 hours
const oneDayAgo = new Date();
oneDayAgo.setDate(oneDayAgo.getDate() - 1);

const failedLogs = await firebase.firestore()
    .collection('audit_logs')
    .where('result', '==', 'failure')
    .where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(oneDayAgo))
    .get();
```

#### Security Rules

Only admins can read audit logs. Client applications cannot access them directly:

```javascript
match /audit_logs/{logId} {
  allow read: if isAdmin();
  allow write: if false; // Only Cloud Functions can write
}
```

---

## Performance Monitoring

### Metrics Available

The `PerformanceMonitor` class tracks:

- **Function Duration:** Execution time for each Cloud Function
- **Success/Failure Status:** Whether the function completed successfully
- **Slow Function Warnings:** Functions taking >5 seconds are flagged

### Logged Performance Data

All performance metrics are written to Cloud Functions logs:

```
INFO: Performance: setDeviceLocked { functionName: "setDeviceLocked", duration: 234, status: "success" }
WARN: Slow function detected: setAppBlacklist { duration: 6234 }
ERROR: Performance: approveTask (failed) { functionName: "approveTask", duration: 1523, status: "error", error: "..." }
```

### Viewing Performance Logs

**Firebase Console:**
1. Navigate to Functions → Logs
2. Filter by severity (INFO/WARN/ERROR)
3. Search for "Performance:" to see execution times

**gcloud CLI:**
```bash
gcloud functions logs read --limit=100 | grep "Performance:"
```

### Using Performance Monitoring

Wrap any Cloud Function logic with `PerformanceMonitor.trackFunction()`:

```typescript
export const myFunction = functions.https.onCall(
  async (data, context) => {
    return PerformanceMonitor.trackFunction("myFunction", async () => {
      // Your function logic here
      return { success: true };
    });
  }
);
```

---

## Health Check

### Endpoint

**URL:** `https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/healthCheck`

**Method:** GET

**Authentication:** None (public endpoint)

### Response Format

**Healthy System (200 OK):**
```json
{
  "status": "healthy",
  "checks": {
    "firestore": true,
    "auth": true,
    "timestamp": "2026-02-13T10:30:00.000Z"
  }
}
```

**Unhealthy System (503 Service Unavailable):**
```json
{
  "status": "unhealthy",
  "checks": {
    "firestore": false,
    "auth": true,
    "timestamp": "2026-02-13T10:30:00.000Z"
  }
}
```

### Health Checks Performed

1. **Firestore:** Writes a test document to `_health/check` collection
2. **Firebase Auth:** Lists one user to verify connectivity

### Use Cases

- **Uptime Monitoring:** Integrate with UptimeRobot, Pingdom, or similar services
- **CI/CD Health Gates:** Verify deployment success before proceeding
- **Incident Response:** Quick system status validation during outages
- **Load Balancer Health Checks:** Route traffic only to healthy instances

### Example Integration (UptimeRobot)

1. Create new HTTP(s) monitor
2. URL: `https://us-central1-minimaster-prod.cloudfunctions.net/healthCheck`
3. Monitoring interval: 5 minutes
4. Alert contacts: Your team email/SMS

---

## GDPR Compliance Features

### Right to Data Portability

Users can export all their data using the `exportUserData` function:

**Client-side (Android/Web):**
```javascript
const exportUserData = firebase.functions().httpsCallable('exportUserData');
const result = await exportUserData();
const jsonData = result.data.data; // JSON string
```

**Exported Data Includes:**
- Master account data
- All paired children devices
- All tasks created/assigned
- Subscription information
- Audit logs (last 90 days)

### Right to Erasure (Right to be Forgotten)

Users can request complete account deletion via `deleteUserAccount`:

**What Gets Deleted:**
1. All child devices linked to the master
2. All tasks (across all children)
3. All subscriptions
4. Master account document
5. Firebase Auth user record

**Audit Trail:**
- Deletion request is logged BEFORE deletion
- Successful deletion is logged with counts
- Failed deletions are logged with error details

### Data Retention

- **Audit Logs:** 90 days (GDPR Article 17 compliance)
- **User Data:** Until account deletion requested
- **Firestore Backups:** 30 days (automatic Firebase backups)

### Privacy Controls

Users can:
- View all audit logs related to their account (via admin panel if granted access)
- Export their data at any time
- Request complete account deletion
- Revoke device pairings

---

## Troubleshooting

### No Audit Logs Appearing

**Possible Causes:**

1. **Firestore Rules:** Verify admin can read logs
   ```javascript
   match /audit_logs/{logId} {
     allow read: if isAdmin(); // ✅ Correct
   }
   ```

2. **Missing AuditLogger Calls:** Check that functions include:
   ```typescript
   await AuditLogger.logSuccess(...);
   ```

3. **Firestore Connection Issues:** Check Cloud Functions logs for write errors

**Solution:** Review function code and Firestore rules. Check Firebase Console for error logs.

### High Error Rates in Logs

**Investigation Steps:**

1. **Check Cloud Functions Logs:**
   ```bash
   firebase functions:log --only setDeviceLocked
   ```

2. **Filter Audit Logs by Result:**
   - Open Admin Panel → Audit Logs
   - Set Result filter to "Failure"
   - Review error messages

3. **Common Issues:**
   - Invalid authentication tokens
   - Permission denied errors (user doesn't own resource)
   - Firestore rules blocking legitimate operations
   - Network timeouts

### Performance Degradation

**Signs:**
- Slow function warnings in logs
- User complaints about delays
- Timeout errors

**Diagnosis:**

1. **Check Performance Logs:**
   ```
   grep "Slow function detected" logs.txt
   ```

2. **Identify Bottlenecks:**
   - Large batch operations (e.g., deleting many tasks)
   - Unindexed Firestore queries
   - External API calls (OpenAI, Google Play API)

3. **Solutions:**
   - Add Firestore indexes
   - Batch operations more efficiently
   - Increase function timeout (if needed)
   - Cache frequently accessed data

### Admin Panel Not Loading Logs

**Checklist:**

1. **User is Admin:** Verify custom claim
   ```javascript
   const token = await user.getIdTokenResult();
   console.log(token.claims.role); // Should be "admin"
   ```

2. **Firebase Initialized:** Check browser console for errors

3. **Firestore Rules:** Ensure admin can read:
   ```javascript
   function isAdmin() {
     return request.auth.token.role == 'admin';
   }
   ```

4. **Network Errors:** Check browser Network tab for failed requests

---

## Alerting (Recommended Setup)

### Cloud Monitoring Alerts

Configure alerts in Firebase Console → Monitoring:

**1. High Error Rate**
- Metric: `cloud.googleapis.com/functions/execution/count`
- Filter: `status="error"`
- Condition: `rate > 5 errors/minute`
- Notification: Email to ops team

**2. Slow Function Alert**
- Metric: `cloud.googleapis.com/functions/execution/duration`
- Condition: `95th percentile > 10 seconds`
- Notification: Email to dev team

**3. Failed Auth Alert**
- Metric: Custom log-based metric
- Filter: `jsonPayload.message="unauthenticated"`
- Condition: `count > 20 in 1 minute` (potential brute-force)
- Notification: Email + SMS to security team

**4. Account Deletion Spike**
- Metric: Custom log-based metric
- Filter: `jsonPayload.action="ACCOUNT_DELETED"`
- Condition: `count > 5 in 1 hour`
- Notification: Email to product team

### Third-Party Integrations

#### Sentry (Error Tracking)

Optional integration for enhanced error tracking:

```typescript
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.FUNCTIONS_EMULATOR ? "development" : "production",
    tracesSampleRate: 0.1,
  });
}

// Wrap functions
export const myFunction = functions.https.onCall(
  async (data, context) => {
    try {
      // Function logic
    } catch (error) {
      Sentry.captureException(error);
      throw error;
    }
  }
);
```

#### Slack Notifications

Create a webhook to send critical alerts to Slack:

```typescript
async function sendSlackAlert(message: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  
  await fetch(webhookUrl, {
    method: 'POST',
    body: JSON.stringify({ text: message }),
  });
}

// Use in critical functions
await sendSlackAlert(`⚠️ High failure rate detected in setDeviceLocked`);
```

---

## Best Practices

### For Developers

1. **Always Add Audit Logging:** Every new sensitive function should include audit logs
2. **Use Try-Catch Blocks:** Ensure failures are logged before throwing
3. **Include Meaningful Metadata:** Add context that helps debugging
4. **Test Logging:** Verify logs appear in Firestore after testing functions

### For Operators

1. **Regular Log Reviews:** Check audit logs weekly for anomalies
2. **Monitor Failed Actions:** Investigate repeated failures from the same user
3. **Export for Compliance:** Regularly export audit logs for compliance archiving
4. **Set Up Alerts:** Configure at least basic error rate alerts

### For Security Teams

1. **Unusual Patterns:** Watch for:
   - Repeated failed auth attempts
   - Mass account deletions
   - Unexpected permission changes
2. **GDPR Requests:** Use audit logs to verify data export/deletion completion
3. **Access Reviews:** Periodically review who has admin access

---

## Metrics Dashboard (Future Enhancement)

Consider building a real-time metrics dashboard using:

- **Firebase Console:** Built-in function metrics
- **Google Cloud Monitoring:** Custom dashboards with log-based metrics
- **Grafana:** Open-source dashboard for visualizing logs
- **DataStudio:** Google's free data visualization tool

**Key Metrics to Track:**
- Total function invocations per day
- Error rate by function
- Average function duration
- Active users (based on audit logs)
- Most common actions
- Geographic distribution of requests

---

## Changelog

### 2026-02-13 - Initial Release
- Implemented AuditLogger class
- Added audit logging to 9 critical functions
- Created admin panel audit log viewer
- Added healthCheck endpoint
- Implemented exportUserData for GDPR
- Enhanced deleteUserAccount with full audit trail
- Updated Firestore rules for audit_logs collection

---

## Support

For questions or issues related to monitoring:
- **Technical Issues:** Check Cloud Functions logs first
- **Audit Log Questions:** Review this guide
- **New Feature Requests:** Create GitHub issue
- **Security Concerns:** Contact security team immediately

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-13  
**Maintained By:** MiniMaster Development Team
