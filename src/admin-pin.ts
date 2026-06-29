import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { CallableContext } from "firebase-functions/v1/https";
import { auth, db } from "../firebase";

const scryptAsync = promisify(scrypt);

/**
 * Firestore hands back documents as untyped `DocumentData` (`any`-valued), which
 * trips the `no-unsafe-*` lint family at every field access. This narrow,
 * caller-asserted shape declares only the field this module actually reads.
 */
interface AdminPinDoc { pinHash?: string }

export const ADMIN_PIN_DOC_ID = "adminPin";
export const ADMIN_PIN_VERIFICATION_MINUTES = 30;
const SCRYPT_KEY_LEN = 64;

export function validateAdminPinFormat(pin: string): void {
  if (!/^\d{6,8}$/.test(pin)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Admin-PIN muss 6–8 Ziffern enthalten."
    );
  }
}

export async function hashAdminPin(pin: string): Promise<string> {
  validateAdminPinFormat(pin);
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(pin, salt, SCRYPT_KEY_LEN)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyAdminPinHash(pin: string, pinHash: string): Promise<boolean> {
  validateAdminPinFormat(pin);
  const parts = pinHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const salt = parts[1]!;
  const expectedHex = parts[2]!;
  const derived = (await scryptAsync(pin, salt, SCRYPT_KEY_LEN)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(expected, derived);
}

export async function getStoredAdminPinHash(): Promise<string | null> {
  const doc = await db().collection("operatorConfig").doc(ADMIN_PIN_DOC_ID).get();
  const pinHash = (doc.data() as AdminPinDoc | undefined)?.pinHash;
  return typeof pinHash === "string" && pinHash.length > 0 ? pinHash : null;
}

export async function isAdminPinConfigured(): Promise<boolean> {
  return (await getStoredAdminPinHash()) !== null;
}

export async function persistAdminPinHash(pinHash: string, uid: string): Promise<void> {
  await db().collection("operatorConfig").doc(ADMIN_PIN_DOC_ID).set(
    {
      pinHash,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: uid,
      version: 1,
      algorithm: "scrypt",
    },
    { merge: true }
  );
}

export function getAdminVerificationAgeMinutes(context: CallableContext): number | null {
  const verifiedAt = context.auth?.token?.admin_verified_at as number | undefined;
  if (typeof verifiedAt !== "number") return null;
  return (Date.now() / 1000 - verifiedAt) / 60;
}

export function isAdminVerificationFresh(context: CallableContext): boolean {
  const ageMinutes = getAdminVerificationAgeMinutes(context);
  return ageMinutes !== null && ageMinutes <= ADMIN_PIN_VERIFICATION_MINUTES;
}

/**
 * Enforces a fresh admin_verified_at claim when an operator admin PIN is configured.
 */
export async function requireAdminPinVerification(
  context: CallableContext,
  actionName: string
): Promise<void> {
  const pinHash = await getStoredAdminPinHash();
  if (!pinHash) {
    return;
  }

  if (!isAdminVerificationFresh(context)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Admin-PIN-Bestätigung erforderlich für ${actionName}. Bitte PIN eingeben und erneut versuchen.`
    );
  }
}

export async function mergeOperatorCustomClaims(
  uid: string,
  patch: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const user = await auth().getUser(uid);
  const existing = (user.customClaims || {}) as Record<string, unknown>;
  const merged = { ...existing, ...patch };
  await auth().setCustomUserClaims(uid, merged);
  return merged;
}
