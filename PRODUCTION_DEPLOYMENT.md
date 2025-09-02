# Production Deployment Guide

This guide provides step-by-step instructions for deploying MiniMaster to a production Firebase environment.

## Prerequisites

Before deploying to production, ensure you have:

- [ ] Firebase account with billing enabled (required for Cloud Functions)
- [ ] Firebase project created for production
- [ ] Firebase CLI installed: `npm install -g firebase-tools`
- [ ] Domain name configured (optional, for custom web hosting)
- [ ] SSL certificate configured (for custom domains)

## 1. Firebase Project Setup

### Create Production Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Create a project"
3. Enter project name (e.g., "minimaster-prod")
4. Enable Google Analytics (recommended)
5. Choose or create Analytics account

### Enable Required Services

Enable these Firebase services in the console:

- [x] **Authentication**
  - Go to Authentication > Sign-in method
  - Enable desired providers (Email/Password, Google, etc.)
  
- [x] **Firestore Database**
  - Go to Firestore Database > Create database
  - Start in production mode
  - Choose appropriate region (closest to users)

- [x] **Cloud Storage**
  - Go to Storage > Get started
  - Choose same region as Firestore

- [x] **Cloud Functions**
  - Will be enabled automatically when deploying functions

- [x] **Cloud Messaging (FCM)**
  - Go to Project Settings > Cloud Messaging
  - Note down Server Key for later use

### Upgrade to Blaze Plan

1. Go to Project Settings > Usage and billing
2. Click "Modify plan"
3. Select "Blaze (pay as you go)"
4. Add payment method
5. Set spending limits (recommended):
   - Cloud Functions: $50/month
   - Firestore: $25/month
   - Storage: $10/month

## 2. Local Development Setup

### Clone and Configure

```bash
# Clone repository
git clone https://github.com/Toto241/MiniMaster.git
cd MiniMaster

# Install dependencies
npm install

# Login to Firebase
firebase login

# Add production project
firebase use --add
# Select your production project and give it an alias (e.g., "prod")
```

### Environment Configuration

Create environment-specific configuration:

```bash
# Set production project as active
firebase use prod

# Initialize Firebase configuration
firebase init
```

When prompted, select:
- [x] Firestore: Configure security rules and indexes
- [x] Functions: Configure Cloud Functions
- [x] Storage: Configure Firebase Storage security rules
- [x] Hosting: Configure Firebase Hosting (for web control panel)

Choose these options:
- Firestore rules file: `firestore.rules` (existing)
- Firestore indexes file: `firestore.indexes.json` (create new)
- Functions language: TypeScript (existing)
- Functions source directory: `.` (current directory)
- Storage rules file: `storage.rules` (existing)
- Hosting public directory: `web-control`

## 3. Security Configuration

### Update Firestore Rules

Review and customize `firestore.rules` for production:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function for authentication
    function isSignedIn() {
      return request.auth != null;
    }
    
    // Production: Add more restrictive rules
    function isValidUser() {
      return isSignedIn() && request.auth.token.email_verified == true;
    }
    
    // Masters collection - restrict to authenticated users
    match /masters/{masterId} {
      allow read, write: if isValidUser() && request.auth.uid == masterId;
    }
    
    // Children collection - restrict to linked master
    match /children/{childId} {
      allow read, write: if isValidUser() && 
        (request.auth.uid == resource.data.masterImei || 
         request.auth.uid == childId);
    }
    
    // Tasks subcollection
    match /children/{childId}/tasks/{taskId} {
      allow read, write: if isValidUser() && 
        (request.auth.uid == get(/databases/$(database)/documents/children/$(childId)).data.masterImei ||
         request.auth.uid == childId);
    }
    
    // Pairing codes - temporary access only
    match /pairingCodes/{codeId} {
      allow read: if isValidUser();
      allow write: if false; // Only Cloud Functions can write
    }
  }
}
```

### Update Storage Rules

Review `storage.rules` for production security:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Task photos - restrict to authenticated users
    match /task_photos/{childId}/{taskId}/{filename} {
      allow read, write: if request.auth != null &&
        (request.auth.uid == childId || 
         request.auth.uid == getChildMasterImei(childId));
    }
    
    // Helper function to get master IMEI for a child
    function getChildMasterImei(childId) {
      return firestore.get(/databases/(default)/documents/children/$(childId)).data.masterImei;
    }
  }
}
```

## 4. Production Deployment

### Deploy Backend Services

```bash
# Deploy all services
firebase deploy --project prod

# Or deploy specific services:
firebase deploy --only functions --project prod
firebase deploy --only firestore --project prod
firebase deploy --only storage --project prod
firebase deploy --only hosting --project prod
```

### Verify Deployment

After deployment, verify each service:

1. **Cloud Functions**: Check Firebase Console > Functions
   - All functions should show "Deployed" status
   - Test with Firebase CLI: `firebase functions:shell`

2. **Firestore**: Check Firebase Console > Firestore Database
   - Database should be created and empty
   - Test rules with Firebase Console simulator

3. **Storage**: Check Firebase Console > Storage
   - Bucket should be created
   - Test upload permissions

4. **Hosting**: Visit your Firebase Hosting URL
   - Web control panel should load
   - Test authentication flow

## 5. Android App Configuration

### Production Firebase Config

1. In Firebase Console, go to Project Settings
2. Click "Add app" > Android
3. Enter package names:
   - Master app: `com.minimaster.masterapp`
   - Child app: `com.google.pairing`
4. Download `google-services.json` files
5. Place in respective app directories

### Build Production APKs

```bash
# Generate release keystore (first time only)
keytool -genkey -v -keystore release-key.keystore -alias minimaster -keyalg RSA -keysize 2048 -validity 10000

# Build release APKs
./gradlew :masterApp:assembleRelease
./gradlew :childApp:assembleRelease
```

### Sign and Distribute

1. Sign APKs with your release keystore
2. Test on physical devices
3. Upload to Google Play Console (internal testing first)
4. Gradually roll out to production

## 6. Monitoring and Maintenance

### Set Up Monitoring

1. **Firebase Performance Monitoring**
   ```bash
   # Add to both Android apps
   implementation 'com.google.firebase:firebase-perf:20.4.1'
   ```

2. **Crashlytics**
   ```bash
   # Add to both Android apps
   implementation 'com.google.firebase:firebase-crashlytics:18.4.3'
   ```

3. **Cloud Functions Monitoring**
   - Enable in Firebase Console > Functions
   - Set up alerting for function failures

### Configure Backups

1. **Firestore Backup**
   ```bash
   # Set up automated daily backups
   gcloud config set project YOUR-PROJECT-ID
   gcloud firestore databases export gs://YOUR-BACKUP-BUCKET
   ```

2. **Storage Backup**
   - Enable versioning on Cloud Storage bucket
   - Set up lifecycle rules for old versions

### Performance Optimization

1. **Firestore Indexes**
   - Monitor console for index recommendations
   - Deploy custom indexes as needed

2. **Cloud Functions**
   - Monitor execution time and memory usage
   - Optimize cold start performance
   - Use Firebase Functions SDK v2 for better performance

3. **CDN Configuration**
   - Enable Firebase Hosting CDN
   - Configure cache headers for static assets

## 7. Security Best Practices

### Production Checklist

- [ ] **API Keys**: Restrict Firebase API keys to specific domains/apps
- [ ] **CORS**: Configure Cloud Functions CORS for production domains only
- [ ] **Rate Limiting**: Implement rate limiting for sensitive functions
- [ ] **Input Validation**: Validate all user inputs in Cloud Functions
- [ ] **Audit Logging**: Enable Cloud Audit Logs for compliance
- [ ] **VPC**: Consider VPC connector for enhanced security
- [ ] **IAM**: Use least-privilege IAM roles
- [ ] **Secrets**: Store sensitive configuration in Firebase Config/Secret Manager

### API Key Restrictions

In Google Cloud Console:

1. Go to APIs & Services > Credentials
2. Click on your Firebase API key
3. Under "Application restrictions":
   - For Android: Add your app's SHA-1 fingerprints
   - For HTTP referrers: Add your production domains
4. Under "API restrictions":
   - Select specific APIs only

## 8. Scaling Considerations

### Expected Load

- **Users**: Plan for your expected user base
- **Functions**: Estimate calls per day per user
- **Storage**: Calculate photo storage needs
- **Firestore**: Plan for reads/writes per user

### Scaling Strategies

1. **Cloud Functions**
   - Configure memory allocation based on usage
   - Use Firebase Performance Monitoring to identify bottlenecks
   - Consider Cloud Run for high-throughput scenarios

2. **Firestore**
   - Shard collections for high write volumes
   - Use composite indexes for complex queries
   - Implement pagination for large result sets

3. **Storage**
   - Enable multi-region for global users
   - Implement image compression/resizing
   - Use Cloud CDN for frequently accessed content

## 9. Cost Optimization

### Monitoring Costs

1. Set up billing alerts in Google Cloud Console
2. Use Firebase Usage Dashboard to track service usage
3. Monitor daily spend in billing reports

### Cost Reduction Strategies

1. **Cloud Functions**: Minimize cold starts, optimize memory usage
2. **Firestore**: Use efficient query patterns, implement caching
3. **Storage**: Compress images, clean up unused files
4. **Hosting**: Enable compression, use appropriate cache headers

## 10. Disaster Recovery

### Backup Strategy

1. **Daily Firestore exports** to Cloud Storage
2. **Code backup** in version control (GitHub)
3. **Configuration backup** of Firebase project settings

### Recovery Procedures

1. **Function Outage**: Redeploy from source control
2. **Data Loss**: Restore from Firestore backup
3. **Project Corruption**: Recreate project and restore data

### Testing Recovery

1. Create test project
2. Practice restore procedures
3. Document recovery time objectives (RTO)
4. Test with partial data corruption scenarios

## 11. Post-Deployment Checklist

- [ ] All Cloud Functions deployed and tested
- [ ] Firestore rules tested with real data
- [ ] Storage rules tested with file uploads
- [ ] Android apps connect to production Firebase
- [ ] Web control panel works end-to-end
- [ ] Push notifications working
- [ ] Monitoring and alerting configured
- [ ] Backup procedures tested
- [ ] Performance baselines established
- [ ] Security audit completed
- [ ] Load testing performed (if applicable)

## Support and Troubleshooting

### Common Issues

1. **Function Timeout**: Increase timeout in firebase.json
2. **CORS Errors**: Configure CORS headers in functions
3. **Authentication Issues**: Check API key restrictions
4. **Performance**: Monitor with Firebase Performance

### Getting Help

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Support](https://firebase.google.com/support)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/firebase)
- [Firebase Slack Community](https://firebase.community/)

## Conclusion

Following this guide ensures a secure, scalable, and maintainable production deployment of MiniMaster. Regular monitoring and maintenance are essential for optimal performance and user experience.

Remember to test all procedures in a staging environment before applying to production!