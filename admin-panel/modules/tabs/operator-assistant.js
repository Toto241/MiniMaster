// MiniMaster Admin-Panel - Operator-Assistant Antworten (Welle 2 Step 7)
// Spiegelt generateOperatorAssistantAnswer aus admin-panel/app.js (Z.11332).
// Pure Funktion: lower-case Stichwortabgleich liefert vorgefertigte Antwort.
// Reihenfolge MUSS exakt mit dem Original uebereinstimmen, damit ueberlappende
// Stichworte (z.B. "config" und "cloud-dienst") deterministisch dieselbe
// Antwort liefern.
import { register } from "../core/registry.js";
import { buildOperatorSubscriptionAnswerDe } from "../shared/pricing-lookup.js";

const TOPICS = [
  {
    id: "admin",
    keywords: ["admin", "claim", "rolle"],
    answer: "Admin-Rechte pr\u00fcfen: 1) Mit Operator-User einloggen, 2) Full Validation starten, 3) Check 'Admin Authentication' muss OK sein. Falls ERROR: setAdminClaim-Funktion ausf\u00fchren und Token neu laden.",
  },
  {
    id: "firebase",
    keywords: ["firebase", "config", "projekt"],
    answer: "Firebase-Integration: Im Inbetriebnahme-Assistenten die Bootstrap-Felder ausf\u00fcllen, lokal speichern und bei Projektwechsel neu laden. Danach Runtime-Konfiguration sichern und Full Validation ausf\u00fchren.",
  },
  {
    id: "rollout",
    keywords: ["inbetriebnahme", "go live", "deploy", "rollout"],
    answer: "Inbetriebnahme im Panel: 1) Firebase-Bootstrap eintragen, 2) Runtime-Konfiguration speichern, 3) optionale Support/Auditor-Rollen zuweisen, 4) Assistent ausf\u00fchren, 5) Full Validation ohne ERROR abschlie\u00dfen, 6) Deploy-Befehl aus dem Bericht verwenden.",
  },
  {
    id: "functions",
    keywords: ["function", "callable", "cloud function"],
    answer: "Cloud Functions pr\u00fcfen: Full Validation ausf\u00fchren. Wenn Function-Checks NOT_FOUND zeigen, zuerst Backend deployen (firebase deploy --only functions). Bei WARN ist Endpoint erreichbar, aber Business/Auth-Fehler im Health-Check erwartbar.",
  },
  {
    id: "firestore",
    keywords: ["firestore", "berechtigung", "permission", "rules"],
    answer: "Firestore-Integration: Checks auf masters/children/supportTickets/audit_logs m\u00fcssen OK sein. Bei Permission-Fehlern Firestore Rules und Admin-Claims pr\u00fcfen; zus\u00e4tzlich sicherstellen, dass der Operator wirklich mit einem Admin-User eingeloggt ist.",
  },
  {
    id: "support",
    keywords: ["support", "ticket", "ki"],
    answer: "Support-Workflow: 1) Ticketliste laden, 2) Ticketdetail \u00f6ffnen, 3) Admin-Response speichern, 4) Statuswechsel testen (in_progress/closed). KI-Antworten im Ticketdetail samt Confidence pr\u00fcfen und dokumentieren.",
  },
  {
    id: "runtime",
    keywords: ["konfiguration", "configuration", "runtime", "cloud-dienst"],
    answer: "Runtime-Konfiguration: Im Tab 'Cloud Integration & Operator Assistant' den Block 'Runtime Configuration (Cloud + KI)' nutzen. Erst Konfiguration laden, dann Cloud- und KI-Felder pflegen, speichern und mit 'Test KI-Konfiguration' plausibilisieren.",
  },
  {
    id: "compliance",
    keywords: ["compliance", "dsar", "audit"],
    answer: "Compliance-Flow: DSAR Export f\u00fcr Test-Master ausl\u00f6sen, Audit-Logs f\u00fcr Zeitraum exportieren, Ergebnisse archivieren. Danach Setup-Report exportieren und als Betriebsnachweis ablegen.",
  },
  {
    id: "device",
    keywords: ["ger\u00e4t", "device", "child", "kind"],
    answer: "Ger\u00e4te-\u00dcbersicht: Im Tab 'Ger\u00e4te' werden alle verbundenen Kinderhandys angezeigt \u2013 mit Online-Ampel, Lock-Status, Blacklist-Anzahl und FCM-Token-Status. Im Detail-Modal findet man Tasks, Usage-History und App-Blacklist pro Ger\u00e4t.",
  },
  {
    id: "pairing",
    keywords: ["pairing", "kopplung", "code", "token"],
    answer: "Pairing-\u00dcbersicht: Im Tab 'Pairing' sieht man alle Pairing-Codes (6-stellig, 24h g\u00fcltig) und Pairing-Tokens (UUID, 5 Min g\u00fcltig). Abgelaufene Eintr\u00e4ge werden markiert. Filter nach Codes/Tokens/Alle m\u00f6glich.",
  },
  {
    id: "errorlog",
    keywords: ["error", "fehler", "log"],
    answer: "Error Logs: Im Tab 'Error Logs' kann man nach Funktionsnamen, Fehlermeldung und Datum suchen. Jeder Eintrag zeigt Funktion, Nachricht, User-ID und Schweregrad. Paginated mit 25 Eintr\u00e4gen pro Seite.",
  },
  {
    id: "performance",
    keywords: ["performance", "metrik", "geschwindigkeit"],
    answer: "Performance: In der \u00dcbersicht werden die letzten 20 Performance-Metriken (Funktionsname, Dauer, Status) angezeigt. Bei hoher Latenz die betroffene Cloud Function auf Optimierungspotenzial pr\u00fcfen.",
  },
  {
    id: "subscription",
    keywords: ["subscription", "abo", "ablauf", "trial"],
    answer: buildOperatorSubscriptionAnswerDe(),
  },
];

const FALLBACK_ANSWER =
  "Empfohlener Ablauf: 1) Full Validation starten, 2) Fehler zuerst in Firebase-Config/Claims beheben, 3) Firestore/Functions erneut pr\u00fcfen, 4) Support- und Compliance-Workflow testweise durchlaufen, 5) Setup-Report exportieren.";

function _classify(question) {
  const q = String(question == null ? "" : question).toLowerCase();
  if (!q) return null;
  for (const topic of TOPICS) {
    if (topic.keywords.some((k) => q.includes(k))) return topic;
  }
  return null;
}

function _generateAnswer(question) {
  const topic = _classify(question);
  return topic ? topic.answer : FALLBACK_ANSWER;
}

export const generateOperatorAssistantAnswer = _generateAnswer;
export const classifyOperatorAssistantTopic = _classify;
export const OPERATOR_ASSISTANT_TOPICS = TOPICS;
export const OPERATOR_ASSISTANT_FALLBACK = FALLBACK_ANSWER;

register("operatorAssistant", {
  generate: _generateAnswer,
  classify: _classify,
  topics: TOPICS,
  fallback: FALLBACK_ANSWER,
});
