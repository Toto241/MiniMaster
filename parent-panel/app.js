const FIREBASE_STORAGE_KEY = "operatorFirebaseConfigOverride";
    const fallbackFirebaseConfig = {
      apiKey: "your-api-key",
      authDomain: "your-project.firebaseapp.com",
      projectId: "your-project-id",
      storageBucket: "your-project.firebasestorage.app",
      messagingSenderId: "your-messaging-sender-id",
      appId: "your-app-id"
    };

    let app = null;
    let db = null;
    let functions = null;
    let auth = null;
    let currentMasterImei = null;
    let appCheckConfigured = false;

    function getAppCheckSiteKey() {
      const globalSiteKey = typeof window !== "undefined" ? window.MINIMASTER_APP_CHECK_SITE_KEY : null;
      if (globalSiteKey) {
        return globalSiteKey;
      }

      const host = typeof window !== "undefined" && window.location ? String(window.location.hostname || "") : "";
      const isLocalDev = host === "localhost" || host === "127.0.0.1";
      if (!isLocalDev) {
        return null;
      }

      try {
        return localStorage.getItem("minimasterAppCheckSiteKey");
      } catch {
        return null;
      }
    }

    function bindUiActions() {
      document.getElementById("load-own-tickets-btn")?.addEventListener("click", () => {
        loadOwnTickets();
      });
      document.getElementById("secure-web-control-btn")?.addEventListener("click", () => {
        openSecureWebControl();
      });
      document.getElementById("secure-child-panel-btn")?.addEventListener("click", () => {
        openSecureChildPanel();
      });
      document.getElementById("submit-support-ticket-btn")?.addEventListener("click", () => {
        submitSupportTicket();
      });
    }

    function ensureAppCheckConfigured(appInstance, statusElementId) {
      if (appCheckConfigured) return true;
      const siteKey = getAppCheckSiteKey();
      if (!siteKey) {
        setStatus(statusElementId, "App Check ist nicht konfiguriert. Bitte zuerst im Operator-Dashboard einen reCAPTCHA-Site-Key hinterlegen.", "error");
        return false;
      }
      if (typeof firebase.appCheck !== "function") {
        setStatus(statusElementId, "Firebase App Check SDK wurde nicht geladen.", "error");
        return false;
      }

      firebase.appCheck(appInstance).activate(siteKey, true);
      appCheckConfigured = true;
      return true;
    }

    function loadFirebaseConfig() {
      try {
        const raw = localStorage.getItem(FIREBASE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && parsed.projectId && parsed.apiKey) return parsed;
      } catch (error) {
        console.warn("Firebase override konnte nicht geladen werden:", error);
      }
      return fallbackFirebaseConfig;
    }

    function setStatus(elementId, message, type) {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.textContent = message;
      el.className = type ? "status " + type : "status";
    }

    function isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
    }

    function updateSecureWebControlButtonState() {
      ["secure-web-control-btn", "secure-child-panel-btn"].forEach((id) => {
        const button = document.getElementById(id);
        if (!button) return;
        button.disabled = !(functions && auth && currentMasterImei);
      });
    }

    function getMasterWebBootstrapTokenFromLocation() {
      try {
        if (!window.location || !window.location.search) return "";
        return new URLSearchParams(window.location.search).get("bootstrapToken") || "";
      } catch {
        return "";
      }
    }

    function clearMasterWebBootstrapTokenFromLocation() {
      try {
        if (!window.location || !window.history || typeof window.history.replaceState !== "function") return;
        const url = new URL(window.location.href || window.location.search, "https://minimaster.app");
        url.searchParams.delete("bootstrapToken");
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}` || window.location.pathname || "/");
      } catch {
        // noop
      }
    }

    async function tryBootstrapTicketAuthFromUrl() {
      const bootstrapToken = getMasterWebBootstrapTokenFromLocation();
      if (!bootstrapToken || !functions || !auth) {
        return false;
      }
      setStatus("ticket-auth-status", "Authentifiziere über sicheren Web-Link...", "");
      const redeemFn = functions.httpsCallable("redeemMasterWebBootstrapToken");
      const tokenResult = await redeemFn({ bootstrapToken });
      clearMasterWebBootstrapTokenFromLocation();
      await auth.signInWithCustomToken(tokenResult.data.customToken);
      return true;
    }

    function getSecurePanelFallbackPath(target) {
      if (target === "child-panel") {
        return "/child-panel/index.html";
      }
      return "/web-control/index.html";
    }

    function getSecurePanelLabel(target) {
      return target === "child-panel" ? "Kinder-Panel" : "Web-Control";
    }

    async function openSecurePanel(target) {
      try {
        if (!functions || !auth || !currentMasterImei) {
          setStatus("ticket-auth-status", "Bitte zuerst im Eltern-Panel authentifizieren.", "error");
          return false;
        }
        if (!ensureAppCheckConfigured(app, "ticket-auth-status")) {
          return false;
        }

        const targetLabel = getSecurePanelLabel(target);
        setStatus("ticket-auth-status", "Erzeuge sicheren " + targetLabel + "-Link...", "");
        const createBootstrapFn = functions.httpsCallable("createMasterWebBootstrapToken");
        const result = await createBootstrapFn({ target });
        const payload = result && result.data ? result.data : {};
        const bootstrapToken = typeof payload.bootstrapToken === "string" ? payload.bootstrapToken.trim() : "";
        const targetPath = typeof payload.targetPath === "string" && payload.targetPath.trim()
          ? payload.targetPath.trim()
          : getSecurePanelFallbackPath(target);
        const queryParamName = typeof payload.queryParamName === "string" && payload.queryParamName.trim()
          ? payload.queryParamName.trim()
          : "bootstrapToken";

        if (!bootstrapToken) {
          throw new Error("Bootstrap-Token fehlt in der Serverantwort.");
        }

        const targetUrl = new URL(targetPath, window.location.href || "https://minimaster.app/parent-panel/index.html");
        targetUrl.searchParams.set(queryParamName, bootstrapToken);
        const nextLocation = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;

        setStatus("ticket-auth-status", "Öffne " + targetLabel + " mit bestehender Sitzung...", "success");
        if (window.location && typeof window.location.assign === "function") {
          window.location.assign(nextLocation);
        } else if (window.location) {
          window.location.href = nextLocation;
        }
        return true;
      } catch (error) {
        const targetLabel = getSecurePanelLabel(target);
        setStatus("ticket-auth-status", "Sicherer " + targetLabel + "-Start fehlgeschlagen: " + (error.message || "Unbekannter Fehler"), "error");
        return false;
      }
    }

    async function openSecureWebControl() {
      return openSecurePanel("web-control");
    }

    async function openSecureChildPanel() {
      return openSecurePanel("child-panel");
    }

    function initFirebase() {
      const config = loadFirebaseConfig();
      if (!config || !config.projectId || String(config.projectId).includes("your-")) {
        setStatus("ticket-auth-status", "Firebase-Konfiguration fehlt. Bitte zuerst auf der Startseite konfigurieren.", "error");
        return;
      }
      app = firebase.initializeApp(config, "parent-panel-app");
      if (!ensureAppCheckConfigured(app, "ticket-auth-status")) {
        return;
      }
      db = firebase.firestore(app);
      functions = firebase.app("parent-panel-app").functions();
      auth = firebase.app("parent-panel-app").auth();

      auth.onAuthStateChanged(async (user) => {
        if (user) {
          currentMasterImei = user.uid;
          let platformLabel = "";
          try {
            const masterDoc = await db.collection("masters").doc(user.uid).get();
            if (masterDoc.exists) {
              const platform = masterDoc.data()?.subscription?.platform || "unknown";
              platformLabel = platform === "android" ? "🤖 Android" : platform === "ios" ? "🍎 iOS" : platform === "web" ? "🌐 Web" : "❓ " + platform;
            }
          } catch { /* ignore */ }
          setStatus("ticket-auth-status", "Authentifiziert als " + user.uid + (platformLabel ? " · " + platformLabel : ""), "success");
          updateSecureWebControlButtonState();
          loadOwnTickets();
          return;
        }

        currentMasterImei = null;
        updateSecureWebControlButtonState();
      });

      tryBootstrapTicketAuthFromUrl().catch((error) => {
        setStatus("ticket-auth-status", "Sicherer Web-Link fehlgeschlagen: " + (error.message || "Unbekannter Fehler"), "error");
      });

      updateSecureWebControlButtonState();
    }

    async function authenticateForTickets() {
      setStatus("ticket-auth-status", "Direkte Secret-Key-Anmeldung ist deaktiviert. Bitte das Eltern-Panel ueber eine bestehende sichere Sitzung oder einen bootstrapToken-Link oeffnen.", "error");
    }

    async function submitSupportTicket() {
      try {
        if (!functions || !currentMasterImei) {
          setStatus("ticket-submit-status", "Bitte zuerst authentifizieren.", "error");
          return;
        }
        if (!ensureAppCheckConfigured(app, "ticket-submit-status")) {
          return;
        }
        const senderName = document.getElementById("ticket-sender-name").value.trim();
        const senderEmail = document.getElementById("ticket-sender-email").value.trim();
        const senderRole = document.getElementById("ticket-sender-role").value;
        const problem = document.getElementById("ticket-problem").value.trim();
        const consentValue = document.querySelector("input[name='ticket-support-access']:checked")?.value;
        const allowSupportAccess = consentValue === "yes";

        if (!senderName) {
          setStatus("ticket-submit-status", "Bitte Absendernamen eintragen.", "error");
          return;
        }
        if (!isValidEmail(senderEmail)) {
          setStatus("ticket-submit-status", "Bitte eine gueltige Rueckfrage-E-Mail eintragen.", "error");
          return;
        }
        if (!problem) {
          setStatus("ticket-submit-status", "Bitte Problem oder Frage beschreiben.", "error");
          return;
        }

        const enrichedProblem = [
          "[Sender] " + senderName,
          "[SenderRole] " + senderRole,
          "[ReplyTo] " + senderEmail,
          "[SourcePanel] parent-panel",
          "",
          problem
        ].join("\n");

        const createTicket = functions.httpsCallable("createSupportTicket");
        const result = await createTicket({
          problemDescription: enrichedProblem,
          allowSupportAccess,
          consentSource: "parent-panel"
        });

        if (result.data && result.data.success) {
          setStatus("ticket-submit-status", "Ticket erstellt: " + result.data.ticketId + ". Rueckfragen gehen an " + senderEmail, "success");
          document.getElementById("ticket-problem").value = "";
          loadOwnTickets();
        } else {
          setStatus("ticket-submit-status", "Ticket konnte nicht erstellt werden.", "error");
        }
      } catch (error) {
        setStatus("ticket-submit-status", "Fehler beim Erstellen: " + (error.message || "Unbekannter Fehler"), "error");
      }
    }

    async function handleDebugConsent(ticketId, allowDebug) {
      try {
        if (!functions || !currentMasterImei) {
          setStatus("ticket-submit-status", "Bitte zuerst authentifizieren.", "error");
          return;
        }
        if (!ensureAppCheckConfigured(app, "ticket-submit-status")) {
          return;
        }
        setStatus("ticket-submit-status", "Verarbeite Debug-Entscheidung...", "");
        const callable = functions.httpsCallable(allowDebug ? "grantDebugAccess" : "skipDebugMode");
        await callable({ ticketId });
        setStatus(
          "ticket-submit-status",
          allowDebug
            ? "Debug-Modus wurde aktiviert. KI arbeitet jetzt automatisch weiter."
            : "Debug-Modus wurde abgelehnt. KI arbeitet ohne Debug-Daten weiter.",
          "success"
        );
        await loadOwnTickets();
      } catch (error) {
        setStatus("ticket-submit-status", "Aktion fehlgeschlagen: " + (error.message || "Unbekannter Fehler"), "error");
      }
    }

    async function submitTicketReply(ticketId) {
      try {
        if (!functions || !currentMasterImei) {
          setStatus("ticket-submit-status", "Bitte zuerst authentifizieren.", "error");
          return;
        }
        if (!ensureAppCheckConfigured(app, "ticket-submit-status")) {
          return;
        }
        const textarea = document.getElementById("reply-" + ticketId);
        const message = textarea ? textarea.value.trim() : "";
        if (!message) {
          setStatus("ticket-submit-status", "Bitte zuerst eine Antwort eingeben.", "error");
          return;
        }

        setStatus("ticket-submit-status", "Sende Antwort an KI...", "");
        const replyFn = functions.httpsCallable("processUserReplyMessage");
        await replyFn({ ticketId, message });
        if (textarea) textarea.value = "";
        setStatus("ticket-submit-status", "Antwort wurde gesendet. KI analysiert weiter.", "success");
        await loadOwnTickets();
      } catch (error) {
        setStatus("ticket-submit-status", "Antwort konnte nicht gesendet werden: " + (error.message || "Unbekannter Fehler"), "error");
      }
    }

    function renderTicketListState(listEl, message, type) {
      listEl.replaceChildren();
      if (!message) {
        return;
      }
      const stateEl = document.createElement("div");
      stateEl.className = type ? "status " + type : "status";
      stateEl.textContent = message;
      listEl.appendChild(stateEl);
    }

    function createTicketMetaLabel(label, value) {
      const span = document.createElement("span");
      span.textContent = label + ": " + value;
      return span;
    }

    function createTicketActionButtons(docId) {
      const wrapper = document.createElement("div");
      wrapper.className = "inline";

      const allowBtn = document.createElement("button");
      allowBtn.className = "btn btn-green";
      allowBtn.type = "button";
      allowBtn.textContent = "Ja, Debug-Modus aktivieren";
      allowBtn.addEventListener("click", () => {
        handleDebugConsent(docId, true);
      });

      const denyBtn = document.createElement("button");
      denyBtn.className = "btn btn-ghost";
      denyBtn.type = "button";
      denyBtn.textContent = "Nein, ohne Debug weiter";
      denyBtn.addEventListener("click", () => {
        handleDebugConsent(docId, false);
      });

      wrapper.appendChild(allowBtn);
      wrapper.appendChild(denyBtn);
      return wrapper;
    }

    function createTicketReplyBox(docId) {
      const wrapper = document.createElement("div");

      const label = document.createElement("label");
      label.setAttribute("for", "reply-" + docId);
      label.textContent = "Antwort an KI";

      const textarea = document.createElement("textarea");
      textarea.id = "reply-" + docId;
      textarea.className = "reply-input";
      textarea.placeholder = "Antwort oder weitere Beobachtung eingeben...";

      const buttonRow = document.createElement("div");
      buttonRow.className = "inline";

      const submitBtn = document.createElement("button");
      submitBtn.className = "btn btn-primary";
      submitBtn.type = "button";
      submitBtn.textContent = "Antwort senden";
      submitBtn.addEventListener("click", () => {
        submitTicketReply(docId);
      });

      buttonRow.appendChild(submitBtn);
      wrapper.appendChild(label);
      wrapper.appendChild(textarea);
      wrapper.appendChild(buttonRow);
      return wrapper;
    }

    function createTicketItem(doc) {
      const ticket = doc.data() || {};
      const created = ticket.createdAt && ticket.createdAt.toDate ? ticket.createdAt.toDate().toLocaleString() : "-";
      const status = String(ticket.status || "open");
      const conversationStatus = String(ticket.conversationStatus || "-");
      const response = ticket.adminResponse || ticket.aiGeneratedSolution || "Noch keine Rueckmeldung.";

      const article = document.createElement("article");
      article.className = "ticket-item";

      const title = document.createElement("strong");
      title.textContent = "Ticket " + doc.id;

      const meta = document.createElement("div");
      meta.className = "ticket-meta";
      meta.appendChild(createTicketMetaLabel("Status", status));
      meta.appendChild(createTicketMetaLabel("Conversation", conversationStatus));
      meta.appendChild(createTicketMetaLabel("Erstellt", created));

      const responseBox = document.createElement("div");
      const responseLabel = document.createElement("strong");
      responseLabel.textContent = "Rueckmeldung:";
      const responseBreak = document.createElement("br");
      const responseText = document.createTextNode(response);
      responseBox.appendChild(responseLabel);
      responseBox.appendChild(responseBreak);
      responseBox.appendChild(responseText);

      article.appendChild(title);
      article.appendChild(meta);
      article.appendChild(responseBox);

      if (conversationStatus === "awaiting_debug_consent") {
        article.appendChild(createTicketActionButtons(doc.id));
      }

      if (conversationStatus === "waiting_user_response" || status === "awaiting_user_feedback") {
        article.appendChild(createTicketReplyBox(doc.id));
      }

      return article;
    }

    async function loadOwnTickets() {
      const listEl = document.getElementById("ticket-list");
      if (!listEl) return;
      if (!db || !currentMasterImei) {
        listEl.replaceChildren();
        return;
      }
      renderTicketListState(listEl, "Lade Tickets...");
      try {
        const snapshot = await db.collection("supportTickets")
          .where("masterImei", "==", currentMasterImei)
          .orderBy("createdAt", "desc")
          .limit(10)
          .get();

        if (snapshot.empty) {
          renderTicketListState(listEl, "Noch keine Tickets vorhanden.");
          return;
        }

        listEl.replaceChildren();
        snapshot.forEach((doc) => {
          listEl.appendChild(createTicketItem(doc));
        });
      } catch (error) {
        renderTicketListState(
          listEl,
          "Tickets konnten nicht geladen werden: " + (error && error.message ? error.message : "Unbekannter Fehler"),
          "error"
        );
      }
    }

    bindUiActions();
    initFirebase();
    window.authenticateForTickets = authenticateForTickets;
    window.openSecureWebControl = openSecureWebControl;
    window.openSecureChildPanel = openSecureChildPanel;
    window.handleDebugConsent = handleDebugConsent;
    window.submitTicketReply = submitTicketReply;
    window.submitSupportTicket = submitSupportTicket;
    window.loadOwnTickets = loadOwnTickets;
