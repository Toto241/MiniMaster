# Mini-Master Eltern-Panel (Web-Control)

This web interface provides PC-based control functionality equivalent to the Mini-Master parent Android app. It serves as the Eltern-Panel and allows parents to manage their children's devices directly from a computer browser.

## Features

### Dashboard
- View all paired child devices
- Real-time device status (online/offline)
- Device lock/unlock controls
- Quick access to task creation

### Task Management
- Create new tasks with deadlines
- Review completed tasks with photo proofs
- Approve or reject task completions
- Real-time task status updates

### Device Control
- Instant device locking/unlocking
- Real-time synchronization with child devices
- Online status monitoring

### Subscription Management
- View current subscription status
- Access to premium features upgrade

## Setup Instructions

### 1. Firebase Configuration

Before using the web control panel, you need to configure it with your Firebase project:

1. Open `app.js` file
2. Replace the `firebaseConfig` object with your actual Firebase configuration:

```javascript
const firebaseConfig = {
    apiKey: "your-actual-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
};
```

You can get these values from your Firebase console:
- Go to Project Settings → General → Your apps
- Select "Web app" and copy the configuration

### 2. Firebase Security Rules

Ensure your Firestore security rules allow read access to the `masters` and `children` collections for authenticated users. The web app uses Firebase Authentication via secure bootstrap tokens.

### 3. CORS Configuration

If you plan to host this on a different domain than your Firebase project, you may need to configure CORS settings in your Firebase project.

## Usage

### Login
The web panel no longer supports direct Secret-Key login. Instead, authentication is performed via secure session links:

1. Open the **Parent Panel (Support-Kanal)** (`parent-panel/index.html`) on your mobile device or desktop
2. Log in with your credentials
3. Generate a secure web control link (bootstrap token)
4. Open the generated link in your browser — the web control panel will automatically authenticate you via Firebase Custom Token

For local development or testing, the panel also supports Firebase Auth state restoration from `localStorage` when a valid session exists.

### Managing Devices
- **View Devices**: All paired devices are displayed with their current status
- **Lock/Unlock**: Use the toggle switch to instantly lock or unlock a device
- **Create Tasks**: Click "Create Task" on any device card to assign a new task

### Task Review
1. Click "Review Tasks" in the top action bar
2. View all tasks pending approval with photo proofs
3. Click "Approve Task" to approve completed tasks
4. Use "Back to Dashboard" to return to the main view

### Subscription
- Click "Go Premium" to view subscription management options
- Access premium features (implementation depends on your billing setup)

## Technical Details

### Real-time Updates
The web interface uses Firebase Firestore real-time listeners to provide instant updates when:
- Device status changes
- New devices are paired
- Tasks are completed
- Lock status changes

### Security
- Uses Firebase Authentication via secure bootstrap tokens
- Direct secret-key login is disabled for security
- Credentials are validated on every operation
- Photo URLs are validated to ensure they use HTTPS only

### Browser Compatibility
- Modern browsers with ES6+ support
- Chrome, Firefox, Safari, Edge
- Mobile browser compatible (responsive design)

## File Structure

```
web-control/
├── index.html          # Main HTML structure
├── styles.css          # CSS styling and responsive design
├── app.js             # JavaScript functionality and Firebase integration
└── README.md          # This documentation
```

## Customization

### Styling
Modify `styles.css` to customize the appearance:
- Color scheme
- Layout adjustments
- Responsive breakpoints
- Animation effects

### Functionality
Extend `app.js` to add new features:
- Additional Firebase Functions calls
- Enhanced device information display
- Custom task types
- Analytics integration

## Deployment

### Option 1: Firebase Hosting
1. Install Firebase CLI: `npm install -g firebase-tools`
2. Initialize hosting: `firebase init hosting`
3. Copy web-control files to your public directory
4. Deploy: `firebase deploy --only hosting`

### Option 2: Static Web Server
Since this is a client-side application, you can host it on any static web server:
- Apache HTTP Server
- Nginx
- GitHub Pages
- Netlify
- Vercel

### Option 3: Local Development
For testing and development:
1. Use a simple HTTP server like `python3 -m http.server` (Windows fallback: `python -m http.server`) or `npx http-server`
2. Navigate to the web-control directory
3. Run the server and access via localhost

## Troubleshooting

### Common Issues

**"Firebase configuration error"**
- Check that the Firebase configuration in `app.js` is correct
- Ensure your Firebase project is active

**"Authentication failed"**
- Make sure you are opening the panel via a valid secure link from the Parent Panel (Support-Kanal)
- Check that the bootstrap token has not expired

**"Error loading devices"**
- Verify Firestore security rules allow read access
- Check browser console for detailed error messages

**"Network errors"**
- Ensure stable internet connection
- Check if Firebase services are accessible from your network

### Debug Mode
Open browser developer tools (F12) to see detailed console logs and network requests for troubleshooting.

## Integration with Mobile Apps

This web interface shares the same Firebase backend with the Android mobile apps:
- Same user accounts and authentication
- Synchronized device states
- Shared task management
- Real-time updates across all platforms

Changes made in the web interface will immediately reflect in the mobile apps and vice versa.

## Security Considerations

- Always use HTTPS in production
- Keep Firebase configuration secure
- Monitor access logs in Firebase console
- Consider implementing additional authentication layers for sensitive operations
- Photo proof URLs are strictly validated to accept only HTTPS links
