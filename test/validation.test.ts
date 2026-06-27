/**
 * Comprehensive tests for the centralized validation module.
 * Covers XSS protection, input sanitization, and all validation functions.
 */
import * as functions from "firebase-functions/v1";
import {
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
  validateSku,
  validateSafe,
} from "../src/validation";

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml("<script>alert('xss')</script>"))
      .toBe("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;");
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("A & B")).toBe("A &amp; B");
  });

  it("escapes quotes", () => {
    expect(escapeHtml("\"quoted\"")).toBe("&quot;quoted&quot;");
  });

  it("returns empty string for non-strings", () => {
    expect(escapeHtml(123 as unknown as string)).toBe("");
  });

  it("returns same string for safe input", () => {
    expect(escapeHtml("safe text")).toBe("safe text");
  });
});

describe("stripHtml", () => {
  it("removes all HTML tags", () => {
    expect(stripHtml("<b>bold</b>")).toBe("bold");
  });

  it("removes nested tags", () => {
    expect(stripHtml("<div><span>text</span></div>")).toBe("text");
  });

  it("returns empty string for non-strings", () => {
    expect(stripHtml(null as unknown as string)).toBe("");
  });

  it("leaves no angle brackets, even for tags revealed by removal", () => {
    expect(stripHtml("<<b>script>alert(1)<</b>/script>")).not.toMatch(/[<>]/);
    expect(stripHtml("<scr<ipt>ipt>x")).not.toMatch(/[<>]/);
    expect(stripHtml("plain & safe")).toBe("plain & safe"); // non-bracket text untouched
  });
});

describe("validateString", () => {
  it("returns trimmed string for valid input", () => {
    expect(validateString("  hello  ", "field")).toBe("hello");
  });

  it("throws for missing required field", () => {
    expect(() => validateString(undefined, "field")).toThrow(functions.https.HttpsError);
  });

  it("throws for non-string", () => {
    expect(() => validateString(123, "field")).toThrow(functions.https.HttpsError);
  });

  it("throws for empty string when not allowed", () => {
    expect(() => validateString("", "field", { allowEmpty: false })).toThrow(functions.https.HttpsError);
  });

  it("returns empty string when not required", () => {
    expect(validateString(undefined, "field", { required: false })).toBe("");
  });

  it("throws when maxLength exceeded", () => {
    expect(() => validateString("a".repeat(100), "field", { maxLength: 10 }))
      .toThrow(functions.https.HttpsError);
  });

  it("throws when minLength not met", () => {
    expect(() => validateString("a", "field", { minLength: 5 }))
      .toThrow(functions.https.HttpsError);
  });

  it("throws for pattern mismatch", () => {
    expect(() => validateString("abc", "field", { pattern: /^\d+$/ }))
      .toThrow(functions.https.HttpsError);
  });

  it("applies stripHtml sanitation by default", () => {
    expect(validateString("<b>text</b>", "field")).toBe("text");
  });

  it("applies escapeHtml sanitation when requested", () => {
    expect(validateString("<b>text</b>", "field", { sanitize: "escape" }))
      .toBe("&lt;b&gt;text&lt;&#x2F;b&gt;");
  });

  it("skips sanitation when requested", () => {
    expect(validateString("<b>text</b>", "field", { sanitize: "none" }))
      .toBe("<b>text</b>");
  });

  it("prevents XSS payloads", () => {
    const xssPayload = "<img src=x onerror=\"alert('XSS')\">";
    const result = validateString(xssPayload, "field");
    expect(result).not.toContain("<img");
    expect(result).not.toContain("onerror");
  });
});

describe("validateDeviceId", () => {
  it("returns valid device ID", () => {
    expect(validateDeviceId("device123")).toBe("device123");
  });

  it("throws for empty string", () => {
    expect(() => validateDeviceId("")).toThrow(functions.https.HttpsError);
  });

  it("throws for invalid characters", () => {
    expect(() => validateDeviceId("device<script>")).toThrow(functions.https.HttpsError);
  });

  it("throws for non-string", () => {
    expect(() => validateDeviceId(123)).toThrow(functions.https.HttpsError);
  });
});

describe("validateTaskDescription", () => {
  it("returns valid description", () => {
    expect(validateTaskDescription("Clean your room")).toBe("Clean your room");
  });

  it("strips HTML from description", () => {
    expect(validateTaskDescription("<b>Clean</b> room")).toBe("Clean room");
  });

  it("throws for empty description", () => {
    expect(() => validateTaskDescription("")).toThrow(functions.https.HttpsError);
  });

  it("throws for too long description", () => {
    expect(() => validateTaskDescription("a".repeat(501))).toThrow(functions.https.HttpsError);
  });
});

describe("validateRejectionReason", () => {
  it("returns valid reason", () => {
    expect(validateRejectionReason("Not complete")).toBe("Not complete");
  });

  it("returns undefined for undefined input", () => {
    expect(validateRejectionReason(undefined)).toBeUndefined();
  });

  it("returns undefined for null input", () => {
    expect(validateRejectionReason(null)).toBeUndefined();
  });

  it("strips HTML from reason", () => {
    expect(validateRejectionReason("<b>Bad</b> job")).toBe("Bad job");
  });
});

describe("validateUrl", () => {
  it("returns valid HTTPS URL", () => {
    expect(validateUrl("https://example.com/path")).toBe("https://example.com/path");
  });

  it("throws for HTTP URL", () => {
    expect(() => validateUrl("http://example.com")).toThrow(functions.https.HttpsError);
  });

  it("throws for invalid URL", () => {
    expect(() => validateUrl("not-a-url")).toThrow(functions.https.HttpsError);
  });

  it("throws for URL exceeding max length", () => {
    expect(() => validateUrl("https://example.com/" + "a".repeat(3000))).toThrow(functions.https.HttpsError);
  });
});

describe("validateFirebaseStorageUrl", () => {
  it("returns valid Firebase Storage URL", () => {
    const url = "https://firebasestorage.googleapis.com/v0/b/bucket/o/children%2Fchild1%2Fphotos%2Ftask.jpg";
    expect(validateFirebaseStorageUrl(url)).toBe(url);
  });

  it("throws for non-Firebase URL", () => {
    expect(() => validateFirebaseStorageUrl("https://evil.com/steal")).toThrow(functions.https.HttpsError);
  });
});

describe("validateBoolean", () => {
  it("returns true", () => {
    expect(validateBoolean(true, "field")).toBe(true);
  });

  it("returns false", () => {
    expect(validateBoolean(false, "field")).toBe(false);
  });

  it("throws for non-boolean", () => {
    expect(() => validateBoolean("true", "field")).toThrow(functions.https.HttpsError);
  });
});

describe("validateNumber", () => {
  it("returns valid number", () => {
    expect(validateNumber(42, "field")).toBe(42);
  });

  it("throws for non-number", () => {
    expect(() => validateNumber("42", "field")).toThrow(functions.https.HttpsError);
  });

  it("throws for NaN", () => {
    expect(() => validateNumber(NaN, "field")).toThrow(functions.https.HttpsError);
  });

  it("throws when below min", () => {
    expect(() => validateNumber(5, "field", { min: 10 })).toThrow(functions.https.HttpsError);
  });

  it("throws when above max", () => {
    expect(() => validateNumber(100, "field", { max: 50 })).toThrow(functions.https.HttpsError);
  });

  it("throws for non-integer when integer required", () => {
    expect(() => validateNumber(3.14, "field", { integer: true })).toThrow(functions.https.HttpsError);
  });

  it("returns 0 for optional undefined", () => {
    expect(validateNumber(undefined, "field", { required: false })).toBe(0);
  });
});

describe("validateTimestamp", () => {
  it("returns valid timestamp", () => {
    const ts = Date.now();
    expect(validateTimestamp(ts, "field")).toBe(ts);
  });

  it("throws for negative timestamp", () => {
    expect(() => validateTimestamp(-1, "field")).toThrow(functions.https.HttpsError);
  });

  it("throws for timestamp too far in future", () => {
    expect(() => validateTimestamp(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000, "field"))
      .toThrow(functions.https.HttpsError);
  });
});

describe("validateISODate", () => {
  it("returns valid ISO date", () => {
    expect(validateISODate("2024-12-31T23:59:59Z")).toBe("2024-12-31T23:59:59Z");
  });

  it("throws for invalid date", () => {
    expect(() => validateISODate("not-a-date")).toThrow(functions.https.HttpsError);
  });

  it("throws for date too far in future", () => {
    const farFuture = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(() => validateISODate(farFuture)).toThrow(functions.https.HttpsError);
  });
});

describe("validateStringArray", () => {
  it("returns valid string array", () => {
    expect(validateStringArray(["a", "b", "c"], "field")).toEqual(["a", "b", "c"]);
  });

  it("deduplicates entries", () => {
    expect(validateStringArray(["a", "a", "b"], "field")).toEqual(["a", "b"]);
  });

  it("strips HTML from entries", () => {
    expect(validateStringArray(["<b>a</b>"], "field")).toEqual(["a"]);
  });

  it("throws for non-array", () => {
    expect(() => validateStringArray("not-array", "field")).toThrow(functions.https.HttpsError);
  });

  it("throws when maxLength exceeded", () => {
    expect(() => validateStringArray(new Array(201).fill("a"), "field", { maxLength: 200 }))
      .toThrow(functions.https.HttpsError);
  });

  it("returns empty array for optional undefined", () => {
    expect(validateStringArray(undefined, "field", { required: false })).toEqual([]);
  });
});

describe("validateObject", () => {
  it("returns valid object", () => {
    const obj = { key: "value" };
    expect(validateObject(obj, "field")).toEqual(obj);
  });

  it("throws for non-object", () => {
    expect(() => validateObject("not-object", "field")).toThrow(functions.https.HttpsError);
  });

  it("throws for unknown keys", () => {
    expect(() => validateObject({ a: 1, b: 2 }, "field", { allowedKeys: new Set(["a"]) }))
      .toThrow(functions.https.HttpsError);
  });

  it("throws for too deeply nested object", () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } };
    expect(() => validateObject(deep, "field", { maxDepth: 3 }))
      .toThrow(functions.https.HttpsError);
  });

  it("returns empty object for optional undefined", () => {
    expect(validateObject(undefined, "field", { required: false })).toEqual({});
  });
});

describe("validateUsageRules", () => {
  it("returns valid usage rules", () => {
    const rules = {
      dailyLimit: 120,
      bedtimeStart: "21:00",
      bedtimeEnd: "07:00",
    };
    expect(validateUsageRules(rules)).toEqual(rules);
  });

  it("throws for unknown keys", () => {
    expect(() => validateUsageRules({ unknownKey: 123 })).toThrow(functions.https.HttpsError);
  });

  it("throws for invalid dailyLimit", () => {
    expect(() => validateUsageRules({ dailyLimit: -1 })).toThrow(functions.https.HttpsError);
  });

  it("throws for invalid bedtime format", () => {
    expect(() => validateUsageRules({ bedtimeStart: "invalid" })).toThrow(functions.https.HttpsError);
  });

  it("throws for non-object", () => {
    expect(() => validateUsageRules("not-object")).toThrow(functions.https.HttpsError);
  });
});

describe("validateToken", () => {
  it("returns valid token", () => {
    expect(validateToken("validtoken123")).toBe("validtoken123");
  });

  it("throws for too short token", () => {
    expect(() => validateToken("short")).toThrow(functions.https.HttpsError);
  });

  it("throws for too long token", () => {
    expect(() => validateToken("a".repeat(1025))).toThrow(functions.https.HttpsError);
  });
});

describe("validateSku", () => {
  it("returns valid SKU", () => {
    expect(validateSku("family_monthly")).toBe("family_monthly");
  });

  it("throws for invalid SKU", () => {
    expect(() => validateSku("invalid_sku")).toThrow(functions.https.HttpsError);
  });
});

describe("validateSafe", () => {
  it("returns success for valid input", () => {
    const result = validateSafe(() => validateString("hello", "field"));
    expect(result.success).toBe(true);
    expect(result.value).toBe("hello");
  });

  it("returns failure for invalid input", () => {
    const result = validateSafe(() => validateString(undefined, "field"));
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
