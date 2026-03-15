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

    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}
