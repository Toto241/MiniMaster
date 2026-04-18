// MiniMaster Admin-Panel - Datums-Helfer (Welle 1 Step 8)
// Pure Funktion aus admin-panel/app.js (toDateSafe).
// Behandelt Date, Firestore-Timestamps (Client + Admin Schema) und ISO-Strings.
import { register } from "./registry.js";

function _toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "string" || typeof value === "number") {
    const directDate = new Date(value);
    return Number.isNaN(directDate.getTime()) ? null : directDate;
  }

  const seconds =
    typeof value.seconds === "number"
      ? value.seconds
      : typeof value._seconds === "number"
        ? value._seconds
        : null;
  if (seconds == null) return null;

  const nanoseconds =
    typeof value.nanoseconds === "number"
      ? value.nanoseconds
      : typeof value._nanoseconds === "number"
        ? value._nanoseconds
        : 0;
  return new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000));
}

export const toDateSafe = _toDateSafe;

register("dates", {
  toDateSafe: _toDateSafe,
});
