/**
 * Legacy Auth Auto-Cutover Monitor
 *
 * Runs daily via a scheduled Cloud Function. Checks if 14 consecutive days
 * have passed without any legacy auth usage. If so, sets the cutover flag
 * in Firestore config, which is read by auth.ts at runtime.
 *
 * The actual hard cutover (rejecting legacy requests) is gated by both:
 * 1. The Firestore config flag (dynamic, checked per-request)
 * 2. The env var DISABLE_LEGACY_SECRETKEY_AUTH (static, emergency override)
 */
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { db } from "../firebase";

interface UsageDoc { count?: number }

const CUTOVER_WINDOW_DAYS = 14;
const CUTOVER_READY_FIELD = "legacyAuthCutoverReady";
const CUTOVER_ENABLED_FIELD = "legacyAuthCutoverEnabled";
const CUTOVER_EXECUTED_FIELD = "legacyAuthCutoverExecutedAt";

/**
 * Scheduled job: runs every day at 03:00 UTC (low-traffic window).
 * Checks legacy auth usage and updates the cutover readiness flag.
 */
export const legacyAuthCutoverMonitor = functions.pubsub
  .schedule("0 3 * * *")
  .timeZone("UTC")
  .onRun(async (_context) => {
    const now = new Date();
    const results = {
      daysChecked: CUTOVER_WINDOW_DAYS,
      daysWithUsage: 0,
      totalCalls: 0,
      cutoverReady: false,
      cutoverExecuted: false,
    };

    try {
      for (let i = 0; i < CUTOVER_WINDOW_DAYS; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);

        try {
          const snapshot = await db()
            .collection("legacy_auth_usage")
            .doc(dateStr)
            .collection("users")
            .limit(1)
            .get();

          if (!snapshot.empty) {
            results.daysWithUsage++;
            let dayCalls = 0;
            snapshot.forEach((doc) => {
              const rawCount = (doc.data() as UsageDoc).count;
              dayCalls += typeof rawCount === "number" ? rawCount : 0;
            });
            results.totalCalls += dayCalls;
          }
        } catch {
          // Day missing = zero usage
        }
      }

      results.cutoverReady = results.daysWithUsage === 0 && results.totalCalls === 0;

      const configRef = db().collection("config").doc("auth");
      await configRef.set(
        {
          [CUTOVER_READY_FIELD]: results.cutoverReady,
          [CUTOVER_ENABLED_FIELD]: results.cutoverReady,
          lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
          windowDays: CUTOVER_WINDOW_DAYS,
          stats: {
            daysWithUsage: results.daysWithUsage,
            totalCalls: results.totalCalls,
          },
        },
        { merge: true }
      );

      if (results.cutoverReady) {
        const configSnap = await configRef.get();
        const alreadyExecuted = configSnap.data()?.[CUTOVER_EXECUTED_FIELD] != null;

        if (!alreadyExecuted) {
          await configRef.update({
            [CUTOVER_EXECUTED_FIELD]: admin.firestore.FieldValue.serverTimestamp(),
            [CUTOVER_ENABLED_FIELD]: true,
            cutoverRecommended: true,
          });
          results.cutoverExecuted = true;

          functions.logger.info(
            "LEGACY AUTH CUTOVER READY: 14 days without legacy auth usage. " +
            "Set DISABLE_LEGACY_SECRETKEY_AUTH=true or use admin panel to complete cutover.",
            { stats: results }
          );
        }
      }

      functions.logger.info("Legacy auth cutover monitor completed", { results });
      return results;
    } catch (error) {
      functions.logger.error("Legacy auth cutover monitor failed", { error });
      throw error;
    }
  });

/**
 * Reads the dynamic cutover config from Firestore.
 * Used by auth.ts to determine if legacy auth should be rejected.
 */
export async function isLegacyAuthCutoverEnabled(): Promise<boolean> {
  try {
    const configSnap = await db().collection("config").doc("auth").get();
    if (!configSnap.exists) return false;

    const data = configSnap.data();
    const configEnabled = data?.legacyAuthCutoverEnabled === true;
    const envEnabled = process.env.DISABLE_LEGACY_SECRETKEY_AUTH === "true";

    return configEnabled || envEnabled;
  } catch {
    return process.env.DISABLE_LEGACY_SECRETKEY_AUTH === "true";
  }
}
