/* Atemwetter – Einstieg: Daten laden, Oberfläche starten, Live-Änderungen der Inhalte übernehmen. */
// Schriften liegen in der App selbst (kein Abruf bei Google, keine Weitergabe der IP-Adresse)
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/familjen-grotesk/latin-500.css';
import '@fontsource/familjen-grotesk/latin-600.css';
import '@fontsource/familjen-grotesk/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles.css';
import { loadAll, api } from './data.js';
import { startApp } from './app.js';
import { initNative } from './native.js';
import { showPosition } from './live.js';

window.__AWLive = showPosition;   // „Meinen Standort verwenden“ auch auf der Website mit Live-Daten für den genauen Punkt

initNative();

(async () => {
  let data;
  try { data = await loadAll(); }
  catch (e) { document.getElementById('load-error').hidden = false; return; }
  const app = startApp(data, api);
  api.watchContent(state => app.setState(state));
})();
