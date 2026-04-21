# Mini-Master Child Panel

The Child Panel is a lightweight web interface designed for children to submit support tickets and request help from their parents or the support team. It is typically accessed from the child's device browser.

## Features

- **Support Ticket Submission**: Children can describe problems they are experiencing and submit tickets for review.
- **Bootstrap Token Authentication**: Authentication is performed via secure bootstrap tokens provided by the parent or generated through the pairing flow.
- **Consent-aware**: The panel respects legal context and consent requirements before allowing submissions.

## Setup

1. Open `index.html` in a browser.
2. The panel will automatically attempt to authenticate using a bootstrap token from the URL query parameters (`?bootstrapToken=...`).
3. If no token is present, the child can still view the ticket submission form, but backend submission requires a valid authenticated session.

## Integration

- Shares the same Firebase backend as the Android child app and web control panel.
- Tickets submitted here appear in the parent web control panel and support dashboard.

## Security

- Uses Firebase Authentication via secure bootstrap tokens.
- Does not store credentials in the browser.
- All submissions are validated server-side.
