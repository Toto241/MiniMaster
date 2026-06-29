/**
 * AI-assisted Firebase config parsing — Cloud Functions.
 *
 * Lets an admin paste a Firebase web config / `google-services.json` (or a
 * messy copy-paste) and get the recognised fields back for review. It NEVER
 * applies anything: the operator reviews the result and feeds it into the
 * existing Firebase config-transfer flow.
 *
 * Security model:
 *   - Deterministic parsing runs FIRST (JSON / known shapes / regex). The LLM
 *     is only a fallback for unstructured text.
 *   - Secret material is protected: if the input looks like a service account
 *     (`private_key` / `service_account`), it is parsed LOCALLY ONLY and is
 *     NEVER sent to Gemini. The private key is never extracted, stored, logged,
 *     or returned — at most the `project_id` is surfaced.
 *   - The response contains only non-secret Firebase web-config fields.
 *
 * Permissions: admin + App Check. Audited as `operator.ai_config_parse`
 * (field names only, never values).
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import { requireAdmin, validateAppCheck, AuditLogger } from "./shared";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const MAX_RAW_TEXT_BYTES = 100_000;

/** Non-secret Firebase web-config fields we recognise and return. */
export const WEB_CONFIG_KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
  "measurementId",
] as const;

export type ParsedWebConfig = Partial<Record<(typeof WEB_CONFIG_KEYS)[number], string>>;

export interface ParseResult {
  parsed: ParsedWebConfig;
  detected: string[];
  warnings: string[];
  usedAi: boolean;
}

/** True when the input carries private-key / service-account material. */
export function looksSensitive(text: string): boolean {
  return /private_key|service_account|-----BEGIN[\s\S]*PRIVATE KEY-----/i.test(text);
}

function assignKnownWebKeys(target: ParsedWebConfig, source: Record<string, unknown>): void {
  for (const key of WEB_CONFIG_KEYS) {
    const val = source[key];
    if (typeof val === "string" && val.trim().length > 0) target[key] = val.trim();
  }
}

/** Shape of the parts of a google-services.json (Android) we read. */
interface GoogleServicesInfo {
  project_id?: unknown;
  storage_bucket?: unknown;
  project_number?: unknown;
}
interface GoogleServicesClient {
  client_info?: { mobilesdk_app_id?: unknown };
  api_key?: unknown;
}
interface GoogleServicesObject {
  project_info?: unknown;
  client?: unknown;
}

/** Pulls fields from a google-services.json (Android) object structure. */
function fromGoogleServices(obj: Record<string, unknown>, parsed: ParsedWebConfig): boolean {
  const info = (obj as GoogleServicesObject).project_info as GoogleServicesInfo | undefined;
  if (!info || typeof info !== "object") return false;
  if (typeof info.project_id === "string") parsed.projectId = info.project_id;
  if (typeof info.storage_bucket === "string") parsed.storageBucket = info.storage_bucket;
  if (typeof info.project_number === "string") parsed.messagingSenderId = info.project_number;
  const clientArr = (obj as GoogleServicesObject).client;
  const client = Array.isArray(clientArr) ? (clientArr[0] as GoogleServicesClient | undefined) : null;
  if (client && typeof client === "object") {
    const appId = client.client_info?.mobilesdk_app_id;
    if (typeof appId === "string") parsed.appId = appId;
    const apiKeyArr = client.api_key;
    const firstKey = Array.isArray(apiKeyArr) ? (apiKeyArr[0] as { current_key?: unknown } | undefined) : undefined;
    const apiKey = firstKey?.current_key;
    if (typeof apiKey === "string") parsed.apiKey = apiKey;
  }
  return true;
}

/** Best-effort regex extraction (handles JS snippets / loose paste). */
function regexExtract(text: string, parsed: ParsedWebConfig): void {
  for (const key of WEB_CONFIG_KEYS) {
    if (parsed[key]) continue;
    // eslint-disable-next-line security/detect-non-literal-regexp -- key from WEB_CONFIG_KEYS constant
    const re = new RegExp(`["']?${key}["']?\\s*[:=]\\s*["']([^"']+)["']`);
    const m = text.match(re);
    if (m?.[1]) parsed[key] = m[1].trim();
  }
}

/**
 * Deterministic, no-network parse. Returns the recognised config plus markers.
 * Service-account material is detected but never extracted beyond project_id.
 */
export function deterministicParse(rawText: string): ParseResult {
  const parsed: ParsedWebConfig = {};
  const detected: string[] = [];
  const warnings: string[] = [];

  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(rawText) as Record<string, unknown> | null;
  } catch {
    // Try the first {...} block (handles `const firebaseConfig = {...};`).
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        obj = JSON.parse(rawText.slice(start, end + 1)) as Record<string, unknown> | null;
      } catch { obj = null; }
    }
  }

  if (obj && typeof obj === "object") {
    if (obj.type === "service_account") {
      detected.push("service_account");
      warnings.push(
        "Service-Account erkannt: wird NUR lokal verarbeitet, nicht an die KI gesendet; " +
        "der private_key wird weder gespeichert noch zurückgegeben. Bitte den Key direkt " +
        "über Secret Manager / das Secret-Onboarding hinterlegen."
      );
      if (typeof obj.project_id === "string") parsed.projectId = obj.project_id;
    } else if (fromGoogleServices(obj, parsed)) {
      detected.push("google_services_json");
    } else {
      assignKnownWebKeys(parsed, obj);
      if (Object.keys(parsed).length > 0) detected.push("web_config");
    }
  }

  // Fallback regex pass for anything still missing (loose paste / JS snippet).
  regexExtract(rawText, parsed);

  return { parsed, detected, warnings, usedAi: false };
}

/** Calls Gemini to extract web-config fields from unstructured text. */
async function geminiExtract(rawText: string): Promise<ParsedWebConfig> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return {};

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const prompt =
    "Extract the Firebase web app configuration from the text below. Respond with " +
    "STRICT JSON only (no prose, no code fences) using exactly these optional keys: " +
    WEB_CONFIG_KEYS.join(", ") + ". Omit keys you cannot find.\n\nTEXT:\n" + rawText;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 500, responseMimeType: "application/json" },
      }),
    });
    if (!response.ok) return {};
    const result = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = result.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const out: ParsedWebConfig = {};
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      assignKnownWebKeys(out, json);
    } catch {
      // ignore malformed AI output — deterministic result still stands
    }
    return out;
  } catch {
    return {};
  }
}

export const aiParseFirebaseConfig = functions
  .runWith({ secrets: ["GEMINI_API_KEY"] })
  .https.onCall(async (data: { rawText?: string }, context: CallableContext) => {
    requireAdmin(context);
    validateAppCheck(context, true);

    const rawText = typeof data?.rawText === "string" ? data.rawText : "";
    if (rawText.trim().length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "rawText (nicht-leer) erforderlich.");
    }
    if (Buffer.byteLength(rawText, "utf8") > MAX_RAW_TEXT_BYTES) {
      throw new functions.https.HttpsError("invalid-argument", "rawText überschreitet 100 KB.");
    }

    const result = deterministicParse(rawText);
    const sensitive = looksSensitive(rawText);

    // Only ask the LLM for help when deterministic parsing came up short AND the
    // input carries no secret material. Secrets are never sent to Gemini.
    const haveCore = Boolean(result.parsed.projectId || result.parsed.apiKey);
    if (!haveCore && !sensitive) {
      const aiFields = await geminiExtract(rawText);
      for (const key of WEB_CONFIG_KEYS) {
        if (!result.parsed[key] && aiFields[key]) result.parsed[key] = aiFields[key];
      }
      result.usedAi = Object.keys(aiFields).length > 0;
    } else if (!haveCore && sensitive) {
      result.warnings.push(
        "KI-Unterstützung übersprungen, weil der Text sensibles Material enthält. " +
        "Bitte die Firebase-Web-Config (ohne Service-Account) separat einfügen."
      );
    }

    await AuditLogger.logSuccess(
      "operator.ai_config_parse", context, "firebase-config", "system",
      { fields: Object.keys(result.parsed), detected: result.detected, usedAi: result.usedAi }
    );

    return result;
  });
