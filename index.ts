/**
 * MiniMaster Cloud Functions — Barrel Export
 *
 * All function implementations are in src/ modules.
 * This file re-exports them so Firebase CLI can discover them.
 */

// Auth & Registration
export {
  setAdminClaim,
  setUserRole,
  generateCustomToken,
  registerMasterDevice,
  revokeUserTokens,
  bootstrapFirstAdmin,
  createOperatorAccessKey,
  redeemOperatorAccessKey,
  resetOperatorAccounts,
  resetAllAuthUsers,
  resetAllAuthUsersHealth,
} from "./src/auth";

// Pairing
export { createPairingCode, validatePairingCode, generatePairingLink, validatePairingToken } from "./src/pairing";

// Device Management
export {
  setDeviceLocked, updateAppBlacklist, setUsageRules, getRulesForChild,
  recordHeartbeat, registerFcmToken, updateFCMToken, reportDailyUsage,
  reportTamperEvent,
} from "./src/device";

// Deterministic decisioning layer
export {
  ingestEvent,
  getRules,
  generateSuggestion,
  logDecision,
} from "./src/controllers/decisioning";

// Cross-Platform Control-Plane (Android + iOS bidirectional interface)
export {
  registerDeviceEndpoint,
  publishDeviceEvent,
  fetchPendingCommands,
  acknowledgeCommand,
  syncPolicySnapshot,
} from "./src/device-sync";

// Tasks
export { createTask, completeTask, approveTask, rejectTask } from "./src/tasks";

// Subscriptions
export {
  verifyPurchase, getSubscriptionStatus, revokeSubscription, checkExpiredSubscriptions,
  onPlayBillingNotification, reverifyActiveSubscriptions,
} from "./src/subscription";

// Support & AI
export {
  createSupportTicket, grantSupportAccess, revokeSupportAccess, cleanupExpiredGrants,
  onTicketCreated, onSupportTicketUpdated, provideSolutionFeedback, getTicketUserData, aiExplainProblem,
  grantDebugAccess, skipDebugMode, analyzeWithDebugData, processUserReplyMessage, getDebugInfo,
} from "./src/support";

// Legal Policies & Consent
export {
  getActiveLegalPolicies, needsLegalReconsent, recordLegalConsent,
  publishLegalPolicy, markLegalReconsentRequired,
} from "./src/legal";

// Triggers (FCM sync, photo analysis, task notifications)
export { onChildDeviceUpdateV2, analyzeTaskPhoto, onTaskStatusChange } from "./src/triggers";

// Admin (account deletion, error reports, DSAR export, Firebase management)
export {
  deleteUserAccount, sendDailyErrorReport, exportUserData, adminHealthCheck,
  testGeminiConnection, getKnowledgeBase, updateKnowledgeBase,
  sendTestFcmMessage, triggerScheduledJob,
  analyzeSystemErrors, executeAutoFix,
} from "./src/admin";

// Operator-Setup ("Inbetriebnahme") – Admin-Panel + PowerShell-Tooling
export {
  getOperatorSetupStatus,
  setOperatorSetupChecklistItem,
} from "./src/operator-setup";

