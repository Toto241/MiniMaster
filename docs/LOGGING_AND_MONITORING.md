# Logging & Monitoring Infrastructure

## Overview

MiniMaster implements a comprehensive audit logging and monitoring system to ensure compliance, security, and operational visibility. This document describes the architecture, usage, and maintenance of the logging infrastructure.

## Audit Logging

### What is Logged?

The system tracks all critical operations across the platform:

#### Device Management
- Device registration (`device.register`)
- Device locking/unlocking (`device.lock`, `device.unlock`)
- Device pairing (`device.pair`)
- Device deletion (`device.delete`)

#### Task Operations
- Task creation (`task.create`)
- Task completion (`task.complete`)
- Task approval/rejection (`task.approve`, `task.reject`)

#### Rule Management
- App blacklist updates (`rules.update_blacklist`)
- Usage rules updates (`rules.update_usage`)
- Screen time configuration (`rules.update_screen_time`)

#### Authentication Events
- Token generation (`auth.token_generated`)
- Login/logout events (`auth.login`, `auth.logout`)

#### Administrative Actions
- Admin claim assignment (`admin.set_admin_claim`)
- Support access grants/revocations (`admin.grant_support_access`, `admin.revoke_support_access`)
- Subscription management (`admin.revoke_subscription`)

#### System Events
- Heartbeat checks (`system.heartbeat`)
- System errors (`system.error`)

### Log Schema

Each audit log entry contains the following fields:

```typescript
interface AuditLog {
  timestamp: Timestamp;          // When the action occurred
  userId: string;                // User ID (masterImei or childImei)
  userRole: string;              // "master" | "child" | "admin" | "support" | "unknown"
  action: string;                // The action performed (e.g., "device.lock")
  resource: string;              // Resource path (e.g., "children/123...")
  resourceType: string;          // Type: "device" | "task" | "rule" | "subscription" | "user" | "system"
  status: string;                // "success" | "failure" | "denied"
  metadata: {                    // Additional context data
    [key: string]: any;
    duration?: number;           // Execution time in milliseconds
    reason?: string;             // Reason for denial (if denied)
  };
  errorMessage?: string;         // Error message (if failure)
  ipAddress?: string;            // Client IP address (future)
  userAgent?: string;            // Client user agent (future)
}
```

### Accessing Logs

#### Admin Panel
Navigate to the Admin Panel and click "View Audit Logs" to access the web-based log viewer:
- **URL**: `/admin-panel/logs.html`
- **Authentication**: Requires admin role
- **Features**:
  - Filter by date range
  - Filter by action type
  - Filter by status (success/failure/denied)
  - Filter by user ID
  - View detailed log metadata
  - Real-time statistics dashboard

#### Firestore Console
Logs are stored in the `audit_logs` collection in Firestore:
- Navigate to Firebase Console → Firestore Database
- Open the `audit_logs` collection
- Use Firestore's built-in query capabilities

#### Cloud Logging
All audit events are also logged to Google Cloud Logging:
- Navigate to Google Cloud Console → Logging
- Filter by resource type: "Cloud Function"
- Search for "Audit Event" in log entries

### Implementation Details

The `AuditLogger` utility class provides three main methods:

```typescript
// Log successful operations
await AuditLogger.logSuccess(
  action,
  context,
  resource,
  resourceType,
  metadata
);

// Log failed operations
await AuditLogger.logFailure(
  action,
  context,
  resource,
  resourceType,
  error,
  metadata
);

// Log denied access attempts
await AuditLogger.logDenied(
  action,
  context,
  resource,
  resourceType,
  reason,
  metadata
);
```

All Cloud Functions automatically log their operations using this infrastructure.

## Performance Monitoring

### Backend Metrics

Performance data is tracked for all Cloud Functions:
- Execution duration
- Success/failure rates
- Error types and frequencies

Metrics are stored in the `performance_metrics` collection with the following schema:

```typescript
interface PerformanceMetric {
  functionName: string;
  duration: number;              // Execution time in ms
  timestamp: Timestamp;
  status: "success" | "error";
  errorMessage?: string;
  userId?: string;
}
```

### Frontend Monitoring

Future implementation will include Firebase Performance Monitoring for:
- Page load times
- API call durations
- Network request performance
- Custom traces for critical operations

## Error Tracking

### Error Logs

All errors are logged to the `error_logs` collection:

```typescript
interface ErrorLog {
  functionName: string;
  message: string;
  stack?: string;
  userId?: string;
  timestamp: string;
}
```

### Error Severity Levels

The `AppError` class supports severity classification:
- `low`: Minor issues that don't affect functionality
- `medium`: Issues that may degrade user experience
- `high`: Issues that affect critical functionality
- `critical`: Severe issues requiring immediate attention

### Error Handling

All Cloud Functions use the `handleError` utility:

```typescript
try {
  // Function logic
} catch (error) {
  await handleError(error, context, "functionName");
  throw error;
}
```

## Data Retention

### Firestore Collections

- **audit_logs**: 90 days (recommended TTL policy)
- **performance_metrics**: 30 days (recommended TTL policy)
- **error_logs**: 60 days (recommended TTL policy)

To implement TTL (Time-To-Live) policies:
1. Use Firebase Extensions: Firestore TTL Extension
2. Add a `ttl` field to documents with expiration timestamp
3. The extension automatically deletes expired documents

Current backend status:
- `audit_logs` entries now include a `ttl` timestamp at write time with a 90-day retention target.
- `error_logs` entries now include a `ttl` timestamp at write time with a 60-day retention target.
- `performance_metrics` still needs the same TTL field wiring before retention is fully consistent across all observability collections.

### Cloud Logging

- Default retention: 30 days
- Configurable in Google Cloud Console
- Can be exported to Cloud Storage for long-term archival

### Archival Strategy

For compliance requirements:
1. Set up a scheduled Cloud Function to export logs monthly
2. Store archived logs in Cloud Storage buckets
3. Use lifecycle policies to move old archives to Coldline storage
4. Implement signed URLs for secure access to archived data

## Security & Access Control

### Firestore Rules

All logging collections are protected by security rules:

```javascript
// Audit Logs - Read-Only for Admins
match /audit_logs/{logId} {
  allow read: if isAdmin();
  allow write: if false; // Only Cloud Functions
}

// Performance Metrics - Read-Only for Admins
match /performance_metrics/{metricId} {
  allow read: if isAdmin();
  allow write: if false; // Only Cloud Functions
}

// Error Logs - Read-Only for Admins
match /error_logs/{errorId} {
  allow read: if isAdmin();
  allow write: if false; // Only Cloud Functions
}
```

### Data Privacy

- User IDs are logged but no personally identifiable information (PII)
- Sensitive data (passwords, tokens) is never logged
- Error messages are sanitized to remove sensitive context
- IP addresses and user agents are optional fields for future implementation

## Compliance

### GDPR Compliance

The audit logging system supports GDPR requirements:

1. **Right to Access**: Users can request their audit logs via support
2. **Right to Erasure**: Logs can be deleted upon user request
3. **Data Minimization**: Only necessary data is logged
4. **Purpose Limitation**: Logs are used only for security and compliance
5. **Audit Trail**: All data access is logged for accountability

### Retention Policies

Implement appropriate retention policies based on legal requirements:
- Security logs: 1-2 years (varies by jurisdiction)
- Financial transactions: 7 years (common requirement)
- General operations: 90 days (recommended minimum)

## Monitoring & Alerts

### Daily Error Reports

Future implementation will include a scheduled function for error aggregation:
- Runs daily at 9 AM (configurable)
- Aggregates errors from the previous 24 hours
- Groups errors by function and type
- Sends summary report via email/Slack

### Alert Thresholds

Recommended alert configurations:
- **Critical Errors**: Immediate notification
- **High Error Rate**: > 5% failure rate in 1 hour
- **Performance Degradation**: Average duration > 2x baseline
- **Security Events**: Any denied access attempts

## Usage Examples

### Viewing Logs in Admin Panel

1. Log in to the Admin Panel as an admin user
2. Click "View Audit Logs" from the dashboard
3. Use filters to narrow down results:
   - Select date range for time-based filtering
   - Choose action type (e.g., "device.lock")
   - Select status (success/failure/denied)
   - Enter user ID for user-specific logs
4. Click "View" on any log entry to see detailed metadata

### Querying Logs Programmatically

```javascript
// Get all failed login attempts in the last 24 hours
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
const failedLogins = await db()
  .collection('audit_logs')
  .where('action', '==', 'auth.login')
  .where('status', '==', 'failure')
  .where('timestamp', '>=', yesterday)
  .get();

// Get all actions by a specific user
const userLogs = await db()
  .collection('audit_logs')
  .where('userId', '==', 'specific-user-id')
  .orderBy('timestamp', 'desc')
  .limit(100)
  .get();
```

### Analyzing Performance Metrics

```javascript
// Get average execution time for a function
const metrics = await db()
  .collection('performance_metrics')
  .where('functionName', '==', 'setDeviceLocked')
  .where('status', '==', 'success')
  .get();

const totalDuration = metrics.docs.reduce((sum, doc) => 
  sum + doc.data().duration, 0
);
const avgDuration = totalDuration / metrics.size;
console.log(`Average execution time: ${avgDuration}ms`);
```

## Best Practices

### For Developers

1. **Always log important operations**: When adding new features, include audit logging
2. **Use appropriate action types**: Choose the most specific action type available
3. **Include relevant metadata**: Add context that helps debugging and analysis
4. **Don't log sensitive data**: Never include passwords, tokens, or PII
5. **Handle logging errors gracefully**: Logging failures shouldn't crash functions

### For Administrators

1. **Review logs regularly**: Check for suspicious patterns or anomalies
2. **Set up alerts**: Configure notifications for critical events
3. **Archive old logs**: Export logs before they're deleted by TTL policies
4. **Monitor performance**: Watch for degradation trends
5. **Audit access**: Regularly review who has admin access to logs

### For Security

1. **Monitor denied access attempts**: Investigate patterns of denied access
2. **Track admin actions**: Pay special attention to admin operations
3. **Review error logs**: Errors can indicate security issues
4. **Implement rate limiting**: Use audit logs to detect abuse
5. **Correlate events**: Look for related events across different logs

## Troubleshooting

### Logs Not Appearing

1. Check Firestore rules are correctly deployed
2. Verify Cloud Functions have write access to Firestore
3. Check Cloud Logging for function errors
4. Ensure the `AuditLogger` class is imported correctly

### Performance Issues

1. Ensure Firestore indexes are created for query filters
2. Consider batch writes for high-volume logging
3. Monitor Cloud Function execution times
4. Check for rate limiting or quota issues

### Admin Panel Issues

1. Verify admin user has correct custom claims
2. Check Firebase Authentication is properly configured
3. Review browser console for JavaScript errors
4. Ensure Firestore rules allow admin read access

## Future Enhancements

Planned improvements to the logging infrastructure:

1. **Real-time Monitoring Dashboard**: Live view of system activity
2. **Advanced Analytics**: Machine learning-based anomaly detection
3. **Integration with External Tools**: Sentry, Datadog, or New Relic
4. **Custom Report Generation**: Automated compliance reports
5. **Enhanced Alerting**: Integration with Slack, PagerDuty, or email
6. **IP Address Logging**: Track client IP addresses for security
7. **Geolocation**: Map user activity by location
8. **Session Tracking**: Link related events across sessions

## Support

For questions or issues with the logging infrastructure:
- Review this documentation
- Check Cloud Logging for error messages
- Contact the development team
- Create a support ticket in the admin panel

## Changelog

### Version 1.0 (2026-02-13)
- Initial implementation of audit logging infrastructure
- Added `AuditLogger` utility class
- Integrated audit logging into all Cloud Functions
- Created admin panel log viewer
- Added Firestore security rules for logging collections
- Documented system architecture and usage
