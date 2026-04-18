if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const protocol = window.location.protocol;
    const isHttp = protocol === "http:" || protocol === "https:";

    if (!isHttp) {
      console.info(
        "Service worker skipped: unsupported origin protocol",
        protocol,
      );
      return;
    }

    function showUpdateBanner(newWorker) {
      // Re-use existing banner if already shown
      if (document.getElementById("sw-update-banner")) return;

      const banner = document.createElement("div");
      banner.id = "sw-update-banner";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      banner.style.cssText = [
        "position:fixed",
        "left:50%",
        "bottom:20px",
        "transform:translateX(-50%)",
        "z-index:99999",
        "background:#0f172a",
        "color:#fff",
        "padding:12px 16px",
        "border-radius:8px",
        "box-shadow:0 4px 16px rgba(0,0,0,0.25)",
        "font-family:system-ui,-apple-system,sans-serif",
        "font-size:14px",
        "display:flex",
        "gap:12px",
        "align-items:center",
        "max-width:90vw"
      ].join(";");

      const message = document.createElement("span");
      message.textContent = "Neue Version verfügbar.";
      banner.appendChild(message);

      const reloadBtn = document.createElement("button");
      reloadBtn.type = "button";
      reloadBtn.textContent = "Jetzt aktualisieren";
      reloadBtn.style.cssText =
        "background:#22c55e;color:#0f172a;border:0;padding:6px 10px;border-radius:6px;cursor:pointer;font-weight:600;";
      reloadBtn.addEventListener("click", () => {
        // Cleanly hand control to the new SW before reloading
        try { newWorker.postMessage({ type: "SKIP_WAITING" }); } catch (_) { /* noop */ }
        window.location.reload();
      });
      banner.appendChild(reloadBtn);

      const dismissBtn = document.createElement("button");
      dismissBtn.type = "button";
      dismissBtn.textContent = "Später";
      dismissBtn.setAttribute("aria-label", "Update-Hinweis ausblenden");
      dismissBtn.style.cssText =
        "background:transparent;color:#cbd5e1;border:1px solid #475569;padding:6px 10px;border-radius:6px;cursor:pointer;";
      dismissBtn.addEventListener("click", () => banner.remove());
      banner.appendChild(dismissBtn);

      document.body.appendChild(banner);
    }

    navigator.serviceWorker
      .register("./service-worker.js")
      .then((registration) => {
        registration.update().catch(() => {
          // Best effort only; failing update should not break the app.
        });

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // Don't reload silently – give the operator control to avoid form data loss.
              showUpdateBanner(newWorker);
            }
          });
        });
      })
      .catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
  });
}
