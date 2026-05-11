import { showSupportPanel } from './support.js';
import { showDebugPanel } from './debug.js';

const PAGE_MODELS = {
  start: {
    title: 'Start',
    description: 'Zentrale Lageübersicht für Release, QA, CI und Betrieb.',
    sections: [
      {
        title: 'Systemzustand',
        items: [
          'Firebase-/Backend-Konfiguration prüfen',
          'Admin-Claims und lokale Tooling-Verfügbarkeit validieren',
          'ADB-/USB-/Dual-Device-Bereitschaft anzeigen',
        ],
        primaryAction: 'Release-Workspace öffnen',
      },
      {
        title: 'Release-Lage',
        items: [
          'P0-/P1-Release-Blocker priorisieren',
          'Readiness-Status und letzte Evidence-Ausführung anzeigen',
          'Go-/No-Go-Status deterministisch berechnen',
        ],
        primaryAction: 'Readiness validieren',
      },
      {
        title: 'QA-Lage',
        items: [
          'Android-10-bis-16-Matrix anzeigen',
          'Smoke-/Standard-/Full-Profile zusammenführen',
          'Veraltete und fehlende Evidence sichtbar markieren',
        ],
        primaryAction: 'QA-Matrix prüfen',
      },
      {
        title: 'CI-/Workflow-Lage',
        items: [
          'Release-Evidence-Workflow überwachen',
          'Firestore-/Code-Scanning-Status aggregieren',
          'Fehlerhafte CI-Läufe hervorheben',
        ],
        primaryAction: 'Fehlerdiagnose öffnen',
      },
    ],
  },
  qa: {
    title: 'Qualitätssicherung & Tests',
    description: 'Führende QA-Sicht für Matrix, Evidence, Emulatoren und Testregister.',
    sections: [
      {
        title: 'Android-Matrix',
        items: [
          'API-Level 29 bis 36 (Android 10 bis 16)',
          'Dual-Device Parent-/Child-Szenarien',
          'Smoke-, Standard- und Full-Profile',
        ],
        primaryAction: 'Matrixplan erzeugen',
      },
      {
        title: 'Evidence & Register',
        items: [
          'SHA-256-validierte Evidence-Manifeste',
          'Unsupported-/Not-Mapped-Tests sichtbar halten',
          'Veraltete Nachweise priorisieren',
        ],
        primaryAction: 'Evidence validieren',
      },
      {
        title: 'Automatisierung',
        items: [
          'Smoke-Matrix erneut ausführen',
          'Retry-/Rerun-Flows für fehlgeschlagene Läufe',
          'Release-Evidence-Export vorbereiten',
        ],
        primaryAction: 'Smoke-Matrix ausführen',
      },
    ],
  },
  release: {
    title: 'Release & Readiness',
    description: 'Go-Live-, Audit- und Store-Readiness-Sicht.',
    sections: [
      {
        title: 'Release-Gates',
        items: [
          'P0-/P1-Blocker und Evidence-Status',
          'Legacy-Auth-Cutover-Tracking',
          'App-Check-/Secrets-/Compliance-Signale',
        ],
        primaryAction: 'P0/P1-Blocker anzeigen',
      },
      {
        title: 'Store & Legal',
        items: [
          'Google-Play-Readiness prüfen',
          'Consent-/Policy-Versionen anzeigen',
          'Export- und Audit-Pakete vorbereiten',
        ],
        primaryAction: 'Release-Evidence exportieren',
      },
    ],
  },
  commissioning: {
    title: 'Einrichtung & Commissioning',
    description: 'Lokale Setup-, Emulator- und Gerätebereitstellung.',
    sections: [
      {
        title: 'Setup & Geräte',
        items: [
          'USB-/ADB-Verfügbarkeit prüfen',
          'Debug-Token- und Firebase-Konfiguration verwalten',
          'Dual-Device-Commissioning starten',
        ],
        primaryAction: 'Setup prüfen',
      },
      {
        title: 'Operator-Flows',
        items: [
          'Lokale Runner- und PowerShell-Kommandos bündeln',
          'QA-/Commissioning-Historie einsehen',
          'Rerun der letzten fehlgeschlagenen Gates',
        ],
        primaryAction: 'Commissioning starten',
      },
    ],
  },
  support: {
    title: 'Betrieb & Support',
    description: 'Support-, Audit- und Betriebsarbeitsbereich.',
    sections: [
      {
        title: 'Supportzugriffe',
        items: [
          'Debug-Zugriffe verwalten',
          'Support-Sitzungen dokumentieren',
          'Fehleranalysen bündeln',
        ],
        primaryAction: 'Supportzugriff gewähren',
      },
      {
        title: 'Audit & Compliance',
        items: [
          'DSAR-/Audit-Exports erzeugen',
          'Operations-Fehler priorisieren',
          'Historische Evidence referenzieren',
        ],
        primaryAction: 'Audit exportieren',
      },
    ],
  },
  legal: {
    title: 'Recht & Datenschutz',
    description: 'Verwaltung von Policies, Consent und Store-Angaben.',
    sections: [
      {
        title: 'Policies & Consent',
        items: [
          'Datenschutz- und Nutzungsbedingungen verwalten',
          'Consent-Versionen und Re-Consent-Status anzeigen',
          'Store-Pflichtangaben prüfen',
        ],
        primaryAction: 'Policy veröffentlichen',
      },
    ],
  },
  commands: {
    title: 'Befehlszentrale',
    description: 'Zentraler Einstiegspunkt für freigegebene lokale Operator-Kommandos.',
    sections: [
      {
        title: 'Operator-Kommandos',
        items: [
          'validate:readiness',
          'ci:revalidate',
          'run-usb-tests.ps1',
          'run-dual-device-commissioning.ps1',
        ],
        primaryAction: 'Readiness-Gate ausführen',
      },
    ],
  },
};

const PANEL_RENDERERS = {
  support: showSupportPanel,
  errors: showDebugPanel,
};

function renderSection(section) {
  const article = document.createElement('article');
  article.className = 'panel-card';

  const h3 = document.createElement('h3');
  h3.textContent = section.title;

  const ul = document.createElement('ul');
  for (const item of section.items) {
    const li = document.createElement('li');
    li.textContent = item;
    ul.append(li);
  }

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'primary-action';
  action.textContent = section.primaryAction;

  article.append(h3, ul, action);
  return article;
}

function renderStructuredPage(content, page) {
  const model = PAGE_MODELS[page];

  const hero = document.createElement('section');
  hero.className = 'panel-hero';

  const h2 = document.createElement('h2');
  h2.textContent = model.title;

  const description = document.createElement('p');
  description.textContent = model.description;

  hero.append(h2, description);
  content.append(hero);

  const grid = document.createElement('section');
  grid.className = 'panel-grid';

  for (const section of model.sections) {
    grid.append(renderSection(section));
  }

  content.append(grid);
}

function renderUnknown(content) {
  const p = document.createElement('p');
  p.textContent = 'Unbekannte Seite.';
  content.append(p);
}

function loadPage(page) {
  const content = document.getElementById('content');
  content.innerHTML = '';

  if (PANEL_RENDERERS[page]) {
    PANEL_RENDERERS[page](content);
    return;
  }

  if (PAGE_MODELS[page]) {
    renderStructuredPage(content, page);
    return;
  }

  renderUnknown(content);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.app-nav a').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      loadPage(link.dataset.page);
    });
  });

  loadPage('start');
});
