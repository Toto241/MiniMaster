/**
 * Centralized Input Validation & Sanitization Module.
 * Provides strict validation for all Cloud Function inputs with XSS protection,
 * injection prevention, and type safety.
 */
import * as functions from "firebase-functions/v1";

// ==================== CONSTANTS ====================

const MAX_STRING_LENGTH = 4096;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_TASK_DESCRIPTION_LENGTH = 500;
const MAX_REASON_LENGTH = 500;
const MAX_URL_LENGTH = 2048;
const MAX_ID_LENGTH = 256;
const ALLOWED_HTML_TAGS: string[] = [];

// ==================== SANITIZATION ====================

/**
 * HTML Entity encoding to prevent XSS attacks.
 * Escapes all HTML special characters in user input.
 */
export function escapeHtml(input: string): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Removes all HTML tags from input (strip approach).
 * More aggressive than escapeHtml - use for plain text fields.
 */
export function stripHtml(input: string): string {
  if (typeof input !== "string") return "";
  return input.replace(/<[^>]*>/g, "");
}

/**
 * Validates and sanitizes a string field.
 * Checks type, length, and applies XSS protection.
 */
export function validateString(
  value: unknown,
  fieldName: string,
  options: {
    required?: boolean;
    maxLength?: number;
    minLength?: number;
    allowEmpty?: boolean;
    pattern?: RegExp;
    sanitize?: "escape" | "strip" | "none";
  } = {}
): string {
  const {
    required = true,
    maxLength = MAX_STRING_LENGTH,
    minLength = 0,
    allowEmpty = false,
    pattern,
    sanitize = "strip",
  } = options;

  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `${fieldName} is required.`
      );
    }
    return "";
  }

  if (typeof value !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must be a string.`
    );
  }

  const trimmed = value.trim();

  if (!allowEmpty && trimmed.length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} cannot be empty.`
    );
  }

  if (trimmed.length < minLength) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must be at least ${minLength} characters.`
    );
  }

  if (trimmed.length > maxLength) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must not exceed ${maxLength} characters (got ${trimmed.length}).`
    );
  }

  if (pattern && !pattern.test(trimmed)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} format is invalid.`
    );
  }

  switch (sanitize) {
    case "escape":
      return escapeHtml(trimmed);
    case "strip":
      return stripHtml(trimmed);
    case "none":
    default:
      return trimmed;
  }
}

/**
 * Validates a child/device ID (UUID or IMEI format).
 */
export function validateDeviceId(value: unknown, fieldName = "childId"): string {
  return validateString(value, fieldName, {
    required: true,
    maxLength: MAX_ID_LENGTH,
    minLength: 1,
    pattern: /^[a-zA-Z0-9_-]+$/,
    sanitize: "none",
  });
}

/**
 * Validates a task description.
 */
export function validateTaskDescription(value: unknown): string {
  return validateString(value, "description", {
    required: true,
    maxLength: MAX_TASK_DESCRIPTION_LENGTH,
    minLength: 1,
    sanitize: "strip",
  });
}

/**
 * Validates a rejection reason.
 */
export function validateRejectionReason(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return validateString(value, "reason", {
    required: false,
    maxLength: MAX_REASON_LENGTH,
    sanitize: "strip",
  });
}

/**
 * Validates a URL (Firebase Storage or HTTPS).
 */
export function validateUrl(value: unknown, fieldName = "url"): string {
  const url = validateString(value, fieldName, {
    required: true,
    maxLength: MAX_URL_LENGTH,
    pattern: /^https:\/\/.+/,
    sanitize: "none",
  });

  try {
    new URL(url);
  } catch {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must be a valid URL.`
    );
  }

  return url;
}

/**
 * Validates a Firebase Storage URL specifically.
 */
export function validateFirebaseStorageUrl(value: unknown, fieldName = "photoUrl"): string {
  const url = validateUrl(value, fieldName);
  const validStorageUrl = /^https:\/\/firebasestorage\.googleapis\.com\//;
  if (!validStorageUrl.test(url)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must be a valid Firebase Storage URL.`
    );
  }
  return url;
}

/**
 * Validates a boolean value.
 */
export function validateBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must be a boolean.`
    );
  }
  return value;
}

/**
 * Validates a number within optional bounds.
 */
export function validateNumber(
  value: unknown,
  fieldName: string,
  options: {
    required?: boolean;
    min?: number;
    max?: number;
    integer?: boolean;
  } = {}
): number {
  const { required = true, min, max, integer = false } = options;

  if (value === undefined || value === null) {
    if (required) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `${fieldName} is required.`
      );
    }
    return 0;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must be a number.`
    );
  }

  if (integer && !Number.isInteger(value)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must be an integer.`
    );
  }

  if (min !== undefined && value < min) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must be at least ${min}.`
    );
  }

  if (max !== undefined && value > max) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must not exceed ${max}.`
    );
  }

  return value;
}

/**
 * Validates a timestamp (epoch milliseconds).
 */
export function validateTimestamp(value: unknown, fieldName: string): number {
  const ts = validateNumber(value, fieldName, { integer: true, min: 0 });
  const now = Date.now();
  const oneYearFromNow = now + 365 * 24 * 60 * 60 * 1000;

  if (ts > oneYearFromNow) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} is too far in the future.`
    );
  }

  return ts;
}

/**
 * Validates an ISO 8601 date string.
 */
export function validateISODate(value: unknown, fieldName = "deadlineISO"): string {
  const dateStr = validateString(value, fieldName, {
    required: true,
    pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
    sanitize: "none",
  });

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must be a valid ISO 8601 date.`
    );
  }

  const now = new Date();
  const maxFuture = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  if (date > maxFuture) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} cannot be more than 1 year in the future.`
    );
  }

  return dateStr;
}

/**
 * Validates an array of strings (e.g., app blacklist).
 */
export function validateStringArray(
  value: unknown,
  fieldName: string,
  options: {
    required?: boolean;
    maxLength?: number;
    maxItemLength?: number;
    allowEmpty?: boolean;
    unique?: boolean;
  } = {}
): string[] {
  const {
    required = true,
    maxLength = 200,
    maxItemLength = 256,
    allowEmpty = true,
    unique = true,
  } = options;

  if (value === undefined || value === null) {
    if (required) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `${fieldName} is required.`
      );
    }
    return [];
  }

  if (!Array.isArray(value)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must be an array.`
    );
  }

  if (!allowEmpty && value.length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} cannot be empty.`
    );
  }

  if (value.length > maxLength) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} may contain at most ${maxLength} entries.`
    );
  }

  const normalized = value.map((item, index) => {
    if (typeof item !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `${fieldName}[${index}] must be a string.`
      );
    }
    const trimmed = stripHtml(item.trim());
    if (trimmed.length === 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `${fieldName}[${index}] cannot be empty.`
      );
    }
    if (trimmed.length > maxItemLength) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `${fieldName}[${index}] exceeds maximum length of ${maxItemLength}.`
      );
    }
    return trimmed;
  });

  return unique ? Array.from(new Set(normalized)) : normalized;
}

/**
 * Validates an object (Record<string, unknown>).
 */
export function validateObject(
  value: unknown,
  fieldName: string,
  options: {
    required?: boolean;
    allowedKeys?: Set<string>;
    maxDepth?: number;
  } = {}
): Record<string, unknown> {
  const { required = true, allowedKeys, maxDepth = 3 } = options;

  if (value === undefined || value === null) {
    if (required) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `${fieldName} is required.`
      );
    }
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must be an object.`
    );
  }

  const obj = value as Record<string, unknown>;

  if (allowedKeys) {
    const invalidKeys = Object.keys(obj).filter((k) => !allowedKeys.has(k));
    if (invalidKeys.length > 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `${fieldName} contains unknown keys: ${invalidKeys.join(", ")}`
      );
    }
  }

  // Check max depth to prevent deeply nested objects
  function checkDepth(obj: unknown, depth: number): void {
    if (depth > maxDepth) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `${fieldName} exceeds maximum nesting depth of ${maxDepth}.`
      );
    }
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      Object.values(obj).forEach((v) => {
        if (v && typeof v === "object") checkDepth(v, depth + 1);
      });
    }
  }
  checkDepth(obj, 1);

  return obj;
}

/**
 * Validates usage rules object.
 */
export function validateUsageRules(value: unknown): Record<string, unknown> {
  const rules = validateObject(value, "usageRules", {
    required: true,
    allowedKeys: new Set([
      "dailyLimit",
      "bedtimeStart",
      "bedtimeEnd",
      "scheduledDowntime",
      "dailyLimitSeconds",
      "allowedHours",
      "appLimits",
    ]),
  });

  // Validate specific fields
  if (rules.dailyLimit !== undefined) {
    validateNumber(rules.dailyLimit, "dailyLimit", { min: 0, max: 1440, integer: true });
  }

  if (rules.dailyLimitSeconds !== undefined) {
    validateNumber(rules.dailyLimitSeconds, "dailyLimitSeconds", { min: 0, max: 86400, integer: true });
  }

  const timeRegex = /^\d{2}:\d{2}$/;
  if (rules.bedtimeStart !== undefined) {
    const s = validateString(rules.bedtimeStart, "bedtimeStart", { pattern: timeRegex, sanitize: "none" });
    rules.bedtimeStart = s;
  }
  if (rules.bedtimeEnd !== undefined) {
    const s = validateString(rules.bedtimeEnd, "bedtimeEnd", { pattern: timeRegex, sanitize: "none" });
    rules.bedtimeEnd = s;
  }

  if (rules.allowedHours !== undefined) {
    const ah = validateObject(rules.allowedHours, "allowedHours", {
      allowedKeys: new Set(["start", "end"]),
    });
    if (ah.start !== undefined) {
      ah.start = validateString(ah.start, "allowedHours.start", { pattern: timeRegex, sanitize: "none" });
    }
    if (ah.end !== undefined) {
      ah.end = validateString(ah.end, "allowedHours.end", { pattern: timeRegex, sanitize: "none" });
    }
    rules.allowedHours = ah;
  }

  if (rules.appLimits !== undefined) {
    const al = validateObject(rules.appLimits, "appLimits");
    for (const [packageName, limit] of Object.entries(al)) {
      if (!packageName || typeof limit !== "number" || limit < 0) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "appLimits entries must contain a package name and non-negative numeric limit."
        );
      }
    }
  }

  return rules;
}

/**
 * Validates FCM/Auth token.
 */
export function validateToken(value: unknown, fieldName = "token"): string {
  return validateString(value, fieldName, {
    required: true,
    maxLength: 1024,
    minLength: 10,
    sanitize: "none",
  });
}

/**
 * Validates event type for tamper/device events.
 */
export function validateEventType(value: unknown): string {
  const validEvents = [
    "accessibility_service_disabled",
    "device_admin_removal_attempt",
    "package_uninstall_attempt",
    "screen_capture_detected",
    "vpn_detected",
    "usb_debugging_enabled",
    "unknown_source_install",
    "root_detected",
    "bootloader_unlocked",
  ];

  const event = validateString(value, "eventType", {
    required: true,
    maxLength: 64,
    sanitize: "strip",
  });

  if (!validEvents.includes(event)) {
    functions.logger.warn(`Unrecognized event type: ${event}`);
  }

  return event;
}

/**
 * Validates subscription SKU.
 */
export function validateSku(value: unknown): string {
  const validSkus = [
    "single_child_monthly",
    "family_monthly",
    "single_child_yearly",
    "family_yearly",
  ];

  const sku = validateString(value, "sku", {
    required: true,
    maxLength: 64,
    sanitize: "none",
  });

  if (!validSkus.includes(sku)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Invalid product ID: ${sku}. Allowed: ${validSkus.join(", ")}`
    );
  }

  return sku;
}

// ==================== VALIDATION RESULT TYPE ====================

export interface ValidationResult<T> {
  success: boolean;
  value?: T;
  error?: string;
}

/**
 * Validates data and returns a result object instead of throwing.
 * Useful for batch operations where partial failures are acceptable.
 */
export function validateSafe<T>(validator: () => T): ValidationResult<T> {
  try {
    return { success: true, value: validator() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Validation failed";
    return { success: false, error: message };
  }
}
