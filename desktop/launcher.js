(function () {
  const idleTimeoutMs = 30 * 60 * 1000;
  let timer = null;

  function resetTimer() {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(function () {
      alert("Sitzung wegen Inaktivitaet beendet. Bitte Launcher erneut oeffnen.");
      window.close();
    }, idleTimeoutMs);
  }

  ["click", "keydown", "mousemove", "touchstart", "scroll"].forEach(function (eventName) {
    window.addEventListener(eventName, resetTimer, { passive: true });
  });

  resetTimer();
})();