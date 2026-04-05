(function () {
  "use strict";

  var SELECTOR = "button, a, input:not([type='hidden']), select, textarea, [role='button'], .close";

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/^[✓✗✔✕▶⚡←→×•\-\s]+/u, "")
      .trim();
  }

  function fallbackLabelFromElement(element) {
    if (!element || !element.ownerDocument) return "";

    if (element.id) {
      var label = element.ownerDocument.querySelector("label[for='" + element.id + "']");
      if (label) {
        return normalizeText(label.textContent);
      }
    }

    var wrapperLabel = element.closest("label");
    if (wrapperLabel) {
      return normalizeText(wrapperLabel.textContent);
    }

    return "";
  }

  function deriveTooltip(element) {
    if (!element || element.hasAttribute("title")) return "";

    var ariaLabel = normalizeText(element.getAttribute("aria-label"));
    if (ariaLabel) return ariaLabel;

    var dataTooltip = normalizeText(element.getAttribute("data-tooltip"));
    if (dataTooltip) return dataTooltip;

    var tagName = (element.tagName || "").toLowerCase();
    var placeholder = normalizeText(element.getAttribute("placeholder"));
    var labelText = fallbackLabelFromElement(element);

    if (tagName === "input" || tagName === "select" || tagName === "textarea") {
      return labelText || placeholder;
    }

    var text = normalizeText(element.textContent);
    if (!text && tagName === "a") {
      text = normalizeText(element.getAttribute("href"));
    }

    if (!text && element.classList && element.classList.contains("close")) {
      text = "Dialog schließen";
    }

    if (!text && (element.textContent || "").trim() === "×") {
      text = "Dialog schließen";
    }

    return text || labelText || placeholder;
  }

  function applyTooltip(element) {
    if (!element || !element.matches || !element.matches(SELECTOR)) return;
    if (element.hasAttribute("title")) return;

    var tooltip = deriveTooltip(element);
    if (!tooltip) return;

    element.setAttribute("title", tooltip);
    if (!element.hasAttribute("aria-label")) {
      element.setAttribute("aria-label", tooltip);
    }
  }

  function applyTooltips(root) {
    if (!root) return;
    applyTooltip(root);
    if (root.querySelectorAll) {
      root.querySelectorAll(SELECTOR).forEach(applyTooltip);
    }
  }

  function observeMutations() {
    if (!window.MutationObserver || !document.body) return;
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node && node.nodeType === Node.ELEMENT_NODE) {
            applyTooltips(node);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    applyTooltips(document.body || document.documentElement);
    observeMutations();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.MiniMasterTooltipAutofill = {
    apply: applyTooltips,
  };
})();