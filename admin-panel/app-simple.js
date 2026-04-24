import { showSupportPanel } from './support.js';
import { showDebugPanel } from './debug.js';

/**
 * Handles navigation by loading different content into the #content element.
 */
function loadPage(page) {
  const content = document.getElementById('content');
  // Clear current content
  content.innerHTML = '';
  switch (page) {
    case 'overview':
      content.innerHTML = '<h2>Übersicht</h2><p>Dashboard kommt hier hin.</p>';
      break;
    case 'users':
      content.innerHTML = '<h2>Benutzer</h2><p>Benutzerverwaltung ist noch nicht implementiert.</p>';
      break;
    case 'devices':
      content.innerHTML = '<h2>Geräte</h2><p>Geräteverwaltung ist noch nicht implementiert.</p>';
      break;
    case 'subscriptions':
      content.innerHTML = '<h2>Abos</h2><p>Abo-Verwaltung ist noch nicht implementiert.</p>';
      break;
    case 'pairing':
      content.innerHTML = '<h2>Kopplung</h2><p>Kopplungsverwaltung ist noch nicht implementiert.</p>';
      break;
    case 'support':
      showSupportPanel(content);
      break;
    case 'errors':
      showDebugPanel(content);
      break;
    case 'compliance':
      content.innerHTML = '<h2>Compliance</h2><p>Compliance-Formulare sind noch nicht implementiert.</p>';
      break;
    case 'qa':
      content.innerHTML = '<h2>QA</h2><p>QA-Ergebnisse und Automatisierungsberichte werden hier angezeigt.</p>';
      break;
    case 'admin':
      content.innerHTML = '<h2>Administration</h2><p>Administrative Einstellungen sind noch nicht implementiert.</p>';
      break;
    case 'ai':
      content.innerHTML = '<h2>KI</h2><p>KI-Analyse kommt hier hin.</p>';
      break;
    case 'legal':
      content.innerHTML = '<h2>Recht und Datenschutz</h2><p>Datenschutzinformationen und rechtliche Hinweise.</p>';
      break;
    default:
      content.innerHTML = '<p>Unbekannte Seite.</p>';
  }
}

// Attach click handlers to the navigation
document.addEventListener('DOMContentLoaded', () => {
  const navLinks = document.querySelectorAll('.app-nav a');
  navLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const page = link.dataset.page;
      loadPage(page);
    });
  });
});
