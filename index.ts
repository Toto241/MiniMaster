/**
 * MiniMaster Cloud Functions — Barrel Export
 *
 * All function implementations are in src/ modules.
 * This file re-exports them so Firebase CLI can discover them.
 */

// Auth & Registration
export { setAdminClaim, generateCustomToken, registerMasterDevice, revokeUserTokens } from "./src/auth";

// Pairing
export { createPairingCode, validatePairingCode, generatePairingLink, validatePairingToken } from "./src/pairing";

// Device Management
export {
  setDeviceLocked, updateAppBlacklist, setUsageRules, getRulesForChild,
  recordHeartbeat, registerFcmToken, updateFCMToken, reportDailyUsage,
  reportTamperEvent,
} from "./src/device";

// Tasks
export { createTask, completeTask, approveTask, rejectTask } from "./src/tasks";

// Subscriptions
export {
  verifyPurchase, getSubscriptionStatus, revokeSubscription, checkExpiredSubscriptions,
} from "./src/subscription";

// Support & AI
export {
  createSupportTicket, grantSupportAccess, revokeSupportAccess, cleanupExpiredGrants,
  onTicketCreated, provideSolutionFeedback,
} from "./src/support";

// Triggers (FCM sync, photo analysis, task notifications)
export { onChildDeviceUpdateV2, analyzeTaskPhoto, onTaskStatusChange } from "./src/triggers";

// Admin (account deletion, error reports, DSAR export)
export { deleteUserAccount, sendDailyErrorReport, exportUserData } from "./src/admin";

