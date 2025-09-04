# AccessibilityService Implementation

## Overview

The `MiniMasterAccessibilityService` is a critical component of the Mini-Master parental control system that provides real-time app monitoring and blocking capabilities for the child device.

## Key Features

### 1. Foreground App Monitoring
- **Real-time detection**: Monitors which app is currently in the foreground using AccessibilityService events
- **Usage stats integration**: Falls back to UsageStatsManager for additional monitoring reliability  
- **System app filtering**: Ignores system apps and the Mini-Master app itself to focus on user applications

### 2. App Blocking Functionality
- **Rule-based blocking**: Blocks apps based on rules received from the parent device via Firebase Cloud Messaging
- **Immediate enforcement**: Automatically redirects users away from blocked applications
- **Visual feedback**: Returns user to the Mini-Master app with context about which app was blocked

### 3. Real-time Rule Updates
- **FCM integration**: Receives blocking rule updates through Firebase Cloud Messaging
- **SharedPreferences communication**: Communicates with `RuleSyncService` for rule synchronization
- **Dynamic updates**: Updates blocking rules without requiring app restart

### 4. Structured Logging & Monitoring
- **Firebase Integration**: Uses Firebase Performance Monitoring and Crashlytics for comprehensive tracking
- **Structured events**: Logs accessibility events, app blocking attempts, and rule updates with detailed context
- **Error tracking**: Captures and reports errors for debugging and improvement

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Parent Device (masterApp)                │
└─────────────────────────┬───────────────────────────────────────┘
                          │ Firebase Cloud Messaging
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Firebase Backend                         │
│  - Cloud Functions      - Firestore          - FCM             │
└─────────────────────────┬───────────────────────────────────────┘
                          │ FCM Push Messages
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Child Device (childApp)                    │
├─────────────────────────────────────────────────────────────────┤
│  RuleSyncService                                                │
│  ├─ Receives FCM messages                                       │
│  ├─ Parses app blocking rules                                   │
│  └─ Updates SharedPreferences                                   │
│                          │                                      │
│                          ▼ SharedPreferences                    │
│  MiniMasterAccessibilityService                                 │
│  ├─ Monitors foreground apps                                    │
│  ├─ Reads blocking rules                                        │
│  ├─ Enforces app blocking                                       │
│  └─ Logs events to Firebase                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration Files

### AndroidManifest.xml
The AccessibilityService is declared in the manifest with appropriate permissions:

```xml
<service
    android:name=".MiniMasterAccessibilityService"
    android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
    android:exported="true">
    <intent-filter>
        <action android:name="android.accessibilityservice.AccessibilityService" />
    </intent-filter>
    <meta-data
        android:name="android.accessibilityservice"
        android:resource="@xml/accessibility_service_config" />
</service>
```

### Accessibility Service Configuration
Located at `res/xml/accessibility_service_config.xml`:

```xml
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/accessibility_service_description"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged"
    android:accessibilityFlags="flagDefault|flagReportViewIds|flagRetrieveInteractiveWindows"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="100"
    android:canRetrieveWindowContent="true"
    android:settingsActivity="com.google.pairing.MainActivity" />
```

## Usage Flow

### 1. Service Initialization
1. User enables the accessibility service through device settings
2. Service connects and initializes monitoring
3. Starts periodic checks for rule updates and app monitoring

### 2. Rule Synchronization  
1. Parent device sends blocking rules via Firebase Cloud Messaging
2. `RuleSyncService` receives FCM message and parses rules
3. Rules are stored in SharedPreferences
4. `MiniMasterAccessibilityService` reads updated rules

### 3. App Blocking Enforcement
1. Service detects foreground app change
2. Checks if app is in blocked list
3. If blocked, redirects to Mini-Master app
4. Logs blocking event for parental monitoring

## Firebase Integration

### Performance Monitoring
- Tracks service initialization time
- Monitors rule update latency
- Measures app blocking response time

### Crashlytics
- Captures service crashes and errors
- Logs structured events for debugging
- Tracks custom metrics for monitoring

### Structured Logging
Uses `AppLogger` utility for consistent logging:

```kotlin
// Log accessibility events
AppLogger.logAccessibilityEvent("WINDOW_STATE_CHANGED", packageName, "detected")

// Log app blocking events  
AppLogger.logAppBlockingEvent(packageName, "parental_control_rule", true)

// Log rule sync events
AppLogger.logRuleSyncEvent("app_blocking", "success", "Updated 5 blocked apps")
```

## Internationalization

Service descriptions are provided in multiple languages:
- **English**: "Mini-Master parental control service..."  
- **German**: "Mini-Master Kindersicherungsdienst..."
- **French**: "Service de contrôle parental Mini-Master..."

## Security & Privacy

### Permissions Required
- `android.permission.BIND_ACCESSIBILITY_SERVICE`: Required for accessibility service functionality
- `android.permission.PACKAGE_USAGE_STATS`: For usage statistics monitoring

### Data Handling
- Only monitors app package names, not app content
- No personal data is accessed or transmitted
- All communication with backend uses secure Firebase channels

## Testing

### Manual Testing
1. Enable accessibility service in device settings
2. Open blocked app - should redirect to Mini-Master app
3. Check logs for monitoring events

### Automated Testing
- Unit tests for rule parsing logic
- Integration tests with `RuleSyncService`
- E2E tests for complete blocking flow

## Troubleshooting

### Common Issues
1. **Service not working**: Check if accessibility service is enabled in device settings
2. **Rules not updating**: Verify FCM connectivity and SharedPreferences access
3. **Apps not blocked**: Check accessibility event monitoring and rule parsing

### Debug Logging
Enable detailed logging by filtering for tags:
- `MiniMaster-AccessibilityService`
- `MiniMaster-RuleSync`
- `MiniMaster-AppBlocking`

## Future Enhancements

### Planned Features
- Time-based blocking rules
- App usage time limits
- Category-based app blocking
- Advanced monitoring dashboard
- Offline rule caching

### Performance Optimizations
- Reduce battery usage with smart monitoring intervals
- Optimize rule checking algorithms
- Implement more efficient IPC between services