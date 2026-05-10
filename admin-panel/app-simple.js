import { showSupportPanel } from './support.js';
import { showDebugPanel } from './debug.js';

const PLACEHOLDER_PAGES = {
  overview:      { title: 'Übersicht',           body: 'Dashboard kommt hier hin.' },
  users:         { title: 'Benutzer',            body: 'Benutzerverwaltung ist noch nicht implementiert.' },
  devices:       { title: 'Geräte',              body: 'Geräteverwaltung ist noch nicht implementiert.' },
  subscriptions: { title: 'Abos',                body: 'Abo-Verwaltung ist noch nicht implementiert.' },
  pairing:       { title: 'Kopplung',            body: 'Kopplungsverwaltung ist noch nicht implementiert.' },
  compliance:    { title: 'Compliance',          body: 'Compliance-Formulare sind noch nicht implementiert.' },
  qa:            { title: 'QA',                  body: 'QA-Ergebnisse und Automatisierungsberichte werden hier angezeigt.' },
  admin:         { title: 'Administration',     body: 'Administrative Einstellungen sind noch nicht implementiert.' },
  ai:            { title: 'KI',                  body: 'KI-Analyse kommt hier hin.' },
  legal:         { title: 'Recht und Datenschutz', body: 'Datenschutzinformationen und rechtliche Hinweise.' },
};

const PANEL_RENDERERS = {
  support: showSupportPanel,
  errors: showDebugPanel,
};

function renderPlaceholder(content, page) {
  const meta = PLACEHOLDER_PAGES[page];
  const h2 = document.createElement('h2');
  h2.textContent = meta.title;
  const p = document.createElement('p');
  p.textContent = meta.body;
  content.append(h2, p);
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
  if (PLACEHOLDER_PAGES[page]) {
    renderPlaceholder(content, page);
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
});
