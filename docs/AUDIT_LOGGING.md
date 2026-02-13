# Audit Logging System

## Overview

All security-critical operations in the MiniMaster application are logged to the `audit_logs` Firestore collection. This provides comprehensive tracking for compliance (GDPR/DSGVO), debugging, and security incident investigation.

## Logged Actions

### Device Management
- `device.registered`: New master device registered
- `device.paired`: Child device paired with master via pairing code
- `device.locked`: Device locked by master
- `device.unlocked`: Device unlocked by master

### Task Management
- `task.created`: New task assigned to child
- `task.completed`: Task completed by child (with photo proof)
- `task.approved`: Task approved by master after review
- `task.rejected`: Task rejected by master

### Rules & Restrictions
- `rules.blacklist_updated`: App blacklist updated for child device
- `rules.usage_updated`: Usage rules/limits updated for child device

### Admin Actions
- `admin.claim_set`: Admin role granted to user
- `admin.support_granted`: Support access granted to admin
- `admin.support_revoked`: Support access revoked
- `admin.subscription_revoked`: Subscription manually revoked by admin

### Authentication Events
- `auth.login_success`: Successful authentication
- `auth.login_failure`: Failed authentication attempt
- `auth.token_generated`: Custom authentication token created

### Data Access
- `data.user_accessed`: User data accessed by admin
- `data.user_deleted`: User account deleted

## Data Model

Each audit log entry contains the following fields:

```typescript
{
  id: string;                    // Auto-generated document ID
  timestamp: Timestamp;          // Server timestamp when action occurred
  userId: string;                // UID of user performing action (masterImei/childImei/adminUid)
  userRole: "master" | "child" | "admin";
  action: AuditAction;           // Specific action performed (see enum above)
  resource: string;              // Affected resource ID (childId, taskId, etc.)
  metadata: Record<string, any>; // Action-specific contextual data
  status: "success" | "failure"; // Whether operation succeeded
  errorMessage?: string;         // Error message if failed
}
```

## Viewing Logs

### Admin Panel (Web)
1. Log in to the Admin Panel with admin credentials
2. Scroll to the "Audit Logs" section
3. Apply filters:
   - **Action**: Filter by specific action type
   - **Role**: Filter by user role (master/child/admin)
   - **Status**: Filter by success/failure
   - **Date Range**: Filter by time period
4. Click "Filter" to apply
5. Click "View" on any entry for full details including metadata
6. Click "Export CSV" to download logs for external analysis

### Firestore Console
Direct access via Firebase Console:
1. Navigate to Firestore Database
2. Open the `audit_logs` collection
3. Browse or query documents directly

### BigQuery (Advanced Analysis)
For large-scale analysis or complex queries:
```bash
firebase firestore:export gs://your-bucket/audit-logs
```

Then import into BigQuery for SQL analysis.

## Security & Access Control

### Firestore Rules
- **Read**: Only users with `admin` custom claim can read audit logs
- **Write**: Only Cloud Functions (via Admin SDK) can write logs
- **Client Access**: Completely blocked for non-admin users

```javascript
match /audit_logs/{logId} {
  allow read: if isAdmin();
  allow write: if false; // Only backend can write
}
```

### Tamper-Proof Design
- Logs are write-once only
- No update or delete operations allowed
- All writes go through server-side Cloud Functions
- Admin SDK bypasses security rules for writes

## Retention Policy

**Automatic Cleanup**: Logs older than **6 months** are automatically deleted to manage storage costs and comply with data minimization principles.

- **Function**: `cleanupOldAuditLogs`
- **Schedule**: 1st of every month at midnight UTC (`0 0 1 * *`)
- **Batch Size**: 500 logs per run
- **Implementation**: Uses scheduled Cloud Function with Pub/Sub trigger

To adjust retention period, modify the `sixMonthsAgo` calculation in `index.ts`:

```typescript
const sixMonthsAgo = new Date();
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6); // Change -6 to desired months
```

## GDPR/DSGVO Compliance

### Requirements Met
✅ **Right to Access**: Users can request their audit logs via support tickets  
✅ **Data Minimization**: Only necessary metadata logged  
✅ **Purpose Limitation**: Logs used only for security, debugging, and compliance  
✅ **Storage Limitation**: 6-month automatic retention  
✅ **Integrity & Confidentiality**: Admin-only access with tamper-proof design  

### User Data Deletion
When a user account is deleted via `deleteUserAccount` function:
- User's audit logs are **retained** for compliance purposes
- `userId` field remains for traceability
- Consider anonymizing user data after account deletion for enhanced privacy

## Usage Examples

### Logging Success
```typescript
await AuditLogger.logSuccess(
  masterId,
  "master",
  AuditAction.DEVICE_LOCKED,
  childId,
  { previousState: false, newState: true }
);
```

### Logging Failure
```typescript
await AuditLogger.logFailure(
  masterId,
  "master",
  AuditAction.DEVICE_LOCKED,
  childId,
  new Error("Child device not found"),
  { requestedLockState: true }
);
```

### Logging Auth Events
```typescript
await AuditLogger.logAuthEvent(
  uid,
  AuditAction.TOKEN_GENERATED,
  true,
  { role: "master" }
);
```

## Troubleshooting

### Logs Not Appearing
1. **Check Admin Claim**: Ensure your user has `role: "admin"` custom claim
2. **Verify Firestore Rules**: Deploy latest rules with `firebase deploy --only firestore`
3. **Check Functions Logs**: View Cloud Functions logs for any write errors
4. **Composite Indexes**: When filtering by multiple fields (action + role, or with date ranges), Firestore requires composite indexes
   - On first filtered query, Firestore will provide a link in the browser console to create the required index
   - Click the link, wait for index creation to complete (1-5 minutes)
   - Refresh the page and try the filter again

### Performance Optimization
- Queries are limited to 100 results by default
- Use date range filters for better performance on large datasets
- Consider exporting to BigQuery for complex analysis
- Monitor Firestore read costs in Firebase Console

### CSV Export Issues
- Browser may block automatic downloads - check popup blocker
- Large exports (10,000+) may take time - wait for completion
- CSV format uses semicolons for commas in error messages to prevent column breaks

## Future Enhancements

Potential improvements:
- [ ] Real-time audit log streaming to monitoring dashboard
- [ ] Anomaly detection for suspicious patterns (e.g., excessive failed logins)
- [ ] Integration with external SIEM tools (Splunk, ELK stack)
- [ ] Automated alerts for critical security events
- [ ] User-specific audit log export feature for GDPR data portability
- [ ] IP address and user agent tracking (requires Cloud Functions request context)

## Related Documentation

- [ERROR_CODES.md](../ERROR_CODES.md) - Error codes used in audit logs
- [ARCHITECTURE.md](../ARCHITECTURE.md) - Overall system architecture
- [SECURITY.md](../SECURITY.md) - Security threat model and mitigations
- [Admin Panel Documentation](./ADMIN_PANEL_ARCHITECTURE.md) - Admin interface details
