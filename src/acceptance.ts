/**
 * Acceptance-Test-Steuerung (Abnahme-Gates).
 *
 * Bietet sowohl einen lokalen Python-Server-Endpunkt (via HTTP)
 * als auch eine Cloud-Callable für Remote-Status-Abfrage.
 */

import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import { requireAdmin, AuditLogger } from "./shared";

export interface AcceptanceRun {
  runId: string;
  startedAt: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
  status: "running" | "success" | "partial" | "failed";
  triggeredBy: string;
  results: {
    lint: { passed: boolean; errors: number; warnings: number; durationMs: number };
    build: { passed: boolean; durationMs: number };
    test: { passed: boolean; suitesTotal: number; suitesPassed: number; testsTotal: number; testsPassed: number; durationMs: number };
    coverage?: { branches: number; functions: number; lines: number; statements: number };
  };
  logs: string[];
}

const ACCEPTANCE_COLLECTION = "acceptanceRuns";

/**
 * Cloud-Callable: Startet KEINE Tests direkt (kein npm in Functions),
 * sondern liest den letzten Acceptance-Run aus Firestore oder
 * validiert Gates gegen hinterlegte Erwartungen.
 */
export const getAcceptanceStatus = functions.https.onCall(async (_data, context: CallableContext) => {
  requireAdmin(context);

  const snap = await db()
    .collection(ACCEPTANCE_COLLECTION)
    .orderBy("startedAt", "desc")
    .limit(1)
    .get();

  if (snap.empty) {
    return { status: "unknown", lastRun: null, message: "Noch kein Acceptance-Run hinterlegt. Bitte lokal via start.bat --acceptance ausführen." };
  }

  const doc = snap.docs[0]!;
  const run = doc.data() as AcceptanceRun;

  const thresholds = {
    branches: 87,
    functions: 90,
    lines: 94,
    statements: 94,
    testSuites: 91,
    lintErrors: 0,
  };

  const gates = {
    lintClean: run.results.lint.passed && run.results.lint.errors === 0,
    buildPassed: run.results.build.passed,
    allTestsPassed: run.results.test.passed && run.results.test.suitesPassed >= thresholds.testSuites,
    coverageBranches: (run.results.coverage?.branches ?? 0) >= thresholds.branches,
    coverageFunctions: (run.results.coverage?.functions ?? 0) >= thresholds.functions,
    coverageLines: (run.results.coverage?.lines ?? 0) >= thresholds.lines,
    coverageStatements: (run.results.coverage?.statements ?? 0) >= thresholds.statements,
  };

  const allGatesPassed = Object.values(gates).every(Boolean);

  return {
    status: run.status,
    lastRun: {
      runId: run.runId,
      startedAt: run.startedAt?.toMillis?.() ?? null,
      completedAt: run.completedAt?.toMillis?.() ?? null,
      triggeredBy: run.triggeredBy,
    },
    gates,
    allGatesPassed,
    thresholds,
    results: run.results,
  };
});

/**
 * Cloud-Callable: Schreibt einen Acceptance-Run (von lokaler Ausführung
 * oder CI-Pipeline) in Firestore. Admin-only.
 */
export const submitAcceptanceRun = functions.https.onCall(async (data: unknown, context: CallableContext) => {
  requireAdmin(context);

  const payload = data as Partial<AcceptanceRun> & { results?: AcceptanceRun["results"] };
  if (!payload.runId || !payload.results) {
    throw new functions.https.HttpsError("invalid-argument", "runId und results sind erforderlich.");
  }

  const runId = String(payload.runId);
  const ref = db().collection(ACCEPTANCE_COLLECTION).doc(runId);

  const doc: Omit<AcceptanceRun, "runId"> & { runId: string; submittedAt: admin.firestore.Timestamp } = {
    runId,
    startedAt: admin.firestore.Timestamp.fromMillis(Number(payload.startedAt) || Date.now()),
    completedAt: payload.completedAt
      ? admin.firestore.Timestamp.fromMillis(Number(payload.completedAt))
      : admin.firestore.Timestamp.now(),
    status: payload.status ?? "failed",
    triggeredBy: payload.triggeredBy ?? context.auth?.uid ?? "unknown",
    results: payload.results as AcceptanceRun["results"],
    logs: Array.isArray(payload.logs) ? payload.logs.slice(0, 500) : [],
    submittedAt: admin.firestore.Timestamp.now(),
  };

  await ref.set(doc);

  await AuditLogger.log(
    "acceptance.run_submitted",
    context.auth!.uid,
    "admin",
    runId,
    "acceptance_run",
    doc.status === "success" ? "success" : "failure",
    { allPassed: doc.status === "success" }
  );

  return { success: true, runId };
});

/**
 * Cloud-Callable: Prüft, ob die aktuelle Codebase die Acceptance-Gates
 * passen würde (nur statische Prüfung, keine Test-Ausführung).
 */
export const checkAcceptanceGates = functions.https.onCall(async (_data, context: CallableContext) => {
  requireAdmin(context);

  const thresholds = {
    branches: 87,
    functions: 90,
    lines: 94,
    statements: 94,
    testSuites: 91,
    lintErrors: 0,
  };

  // Lese letzten Run
  const snap = await db()
    .collection(ACCEPTANCE_COLLECTION)
    .orderBy("startedAt", "desc")
    .limit(1)
    .get();

  if (snap.empty) {
    return { gatesAvailable: false, message: "Kein Acceptance-Run vorhanden." };
  }

  const run = snap.docs[0]!.data() as AcceptanceRun;

  const gates = {
    lintClean: run.results.lint.passed && run.results.lint.errors === 0,
    buildPassed: run.results.build.passed,
    allTestsPassed: run.results.test.passed && run.results.test.suitesPassed >= thresholds.testSuites,
    coverageBranches: (run.results.coverage?.branches ?? 0) >= thresholds.branches,
    coverageFunctions: (run.results.coverage?.functions ?? 0) >= thresholds.functions,
    coverageLines: (run.results.coverage?.lines ?? 0) >= thresholds.lines,
    coverageStatements: (run.results.coverage?.statements ?? 0) >= thresholds.statements,
  };

  return {
    gatesAvailable: true,
    gates,
    allGatesPassed: Object.values(gates).every(Boolean),
    thresholds,
    lastRunId: run.runId,
  };
});
