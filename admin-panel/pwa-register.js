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
              window.location.reload();
            }
          });
        });
      })
      .catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
  });
}
