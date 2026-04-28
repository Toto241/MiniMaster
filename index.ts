/**
 * MiniMaster Cloud Functions — Barrel Export
 *
 * All function implementations are in src/ modules.
 * This file re-exports them so Firebase CLI can discover them.
 *
 * Architecture:
 * - v1 Callable Functions: Auth, Device, Tasks, Subscription, Support, Legal, Admin
 * - v2 Firestore Triggers: FCM sync, photo analysis, task notifications
 * - Shared: Validation, Resilience (Circuit Breaker), Rate Limiting, Error Handling
 */

// ==================== AUTH & REGISTRATION ====================
export {
  setAdminClaim,
  setUserRole,
  generateCustomToken,
  createMasterWebBootstrapToken,
  redeemMasterWebBootstrapToken,
  registerMasterDevice,
  revokeUserTokens,
  bootstrapFirstAdmin,
  createOperatorAccessKey,
  redeemOperatorAccessKey,
  resetOperatorAccounts,
  resetAllAuthUsers,
  resetAllAuthUsersHealth,
  getLegacyAuthUsageStats,
  migrateToFamiliesSchema,
} from "./src/auth";

// ==================== PAIRING ====================
export {
  createPairingCode,
  validatePairingCode,
  generatePairingLink,
  validatePairingToken,
} from "./src/pairing";

// ==================== DEVICE MANAGEMENT ====================
export {
  setDeviceLocked,
  updateAppBlacklist,
  setUsageRules,
  getRulesForChild,
  recordHeartbeat,
  registerFcmToken,
  updateFCMToken,
  reportDailyUsage,
  reportTamperEvent,
} from "./src/device";

// ==================== DETERMINISTIC DECISIONING ====================
export {
  ingestEvent,
  getRules,
  generateSuggestion,
  logDecision,
} from "./src/controllers/decisioning";

// ==================== CROSS-PLATFORM CONTROL-PLANE ====================
export {
  registerDeviceEndpoint,
  publishDeviceEvent,
  fetchPendingCommands,
  acknowledgeCommand,
  syncPolicySnapshot,
} from "./src/device-sync";

// ==================== TASKS ====================
export {
  createTask,
  completeTask,
  approveTask,
  rejectTask,
} from "./src/tasks";

// ==================== SUBSCRIPTIONS ====================
export {
  verifyPurchase,
  getSubscriptionStatus,
  revokeSubscription,
  checkExpiredSubscriptions,
  onPlayBillingNotification,
  reverifyActiveSubscriptions,
} from "./src/subscription";

// ==================== SUPPORT & AI ====================
export {
  createSupportTicket,
  grantSupportAccess,
  revokeSupportAccess,
  cleanupExpiredGrants,
  onTicketCreated,
  onSupportTicketUpdated,
  provideSolutionFeedback,
  getTicketUserData,
  aiExplainProblem,
  grantDebugAccess,
  skipDebugMode,
  analyzeWithDebugData,
  processUserReplyMessage,
  getDebugInfo,
} from "./src/support";

// ==================== LEGAL POLICIES & CONSENT ====================
export {
  getActiveLegalPolicies,
  needsLegalReconsent,
  recordLegalConsent,
  publishLegalPolicy,
  markLegalReconsentRequired,
} from "./src/legal";

// ==================== TRIGGERS ====================
export {
  onChildDeviceUpdateV2,
  analyzeTaskPhoto,
  onTaskStatusChange,
} from "./src/triggers";

// ==================== ADMIN ====================
export {
  deleteUserAccount,
  sendDailyErrorReport,
  exportUserData,
  adminHealthCheck,
  testGeminiConnection,
  getKnowledgeBase,
  updateKnowledgeBase,
  sendTestFcmMessage,
  triggerScheduledJob,
  analyzeSystemErrors,
  executeAutoFix,
} from "./src/admin";

// ==================== OPERATOR SETUP ====================
export {
  getOperatorSetupStatus,
  setOperatorSetupChecklistItem,
} from "./src/operator-setup";

// ==================== MONETIZATION ====================
export {
  B2C_TIERS,
  B2B_TIERS,
  VALID_PRODUCT_IDS,
  AFFILIATE_CONFIG,
  VAT_RATES,
  calculatePrice,
  getTierBySku,
  isB2BSku,
  isB2CSku,
  getChildLimit,
  getParentAppLimit,
  getSubscriptionDurationMs,
  formatPriceCents,
  applyPromoCode,
} from "./src/pricing-config";

// B2B Licensing
export {
  createB2BOrganization,
  activateB2BLicense,
  getB2BLicenseStatus,
  addB2BDevice,
  removeB2BDevice,
  getB2BUsageReport,
  revokeB2BLicense,
  listB2BOrganizations,
} from "./src/b2b-licensing";

// Affiliate Program
export {
  registerAffiliate,
  reviewAffiliate,
  trackAffiliateConversion,
  getAffiliateDashboard,
  listAffiliates,
  processAffiliatePayouts,
} from "./src/affiliate";

// ==================== MONITORING & CUTOVER ====================
export {
  legacyAuthCutoverMonitor,
} from "./src/cutover-monitor";

// ==================== INFRASTRUCTURE EXPORTS ====================
// These are used by other modules but also available for testing/admin

// Validation utilities
export {
  escapeHtml,
  stripHtml,
  validateString,
  validateDeviceId,
  validateTaskDescription,
  validateRejectionReason,
  validateUrl,
  validateFirebaseStorageUrl,
  validateBoolean,
  validateNumber,
  validateTimestamp,
  validateISODate,
  validateStringArray,
  validateObject,
  validateUsageRules,
  validateToken,
  validateEventType,
  validateSku,
  validateSafe,
} from "./src/validation";

// Resilience patterns (Circuit Breaker, Retry, Timeout)
export {
  withResilience,
  withRetry,
  withTimeout,
  fetchWithTimeout,
  getCircuitBreaker,
  resetCircuitBreaker,
  getAllCircuitMetrics,
} from "./src/resilience";

// Rate limiting
export {
  checkDistributedRateLimit,
  requireRateLimit,
  checkRateLimitLegacy,
  getRateLimitMetrics,
  resetRateLimit,
} from "./src/rate-limiter";

// Error handling
export {
  withErrorHandling,
  classifyError,
  logStructuredError,
  buildErrorResponse,
  getHealthStatus,
  getFunctionMetrics,
  getAllMetrics,
  recordInvocation,
} from "./src/error-handler";
