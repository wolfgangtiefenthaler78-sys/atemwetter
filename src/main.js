/* Atemwetter – Einstieg: Daten laden, Oberfläche starten, Live-Änderungen der Inhalte übernehmen. */
import './styles.css';
import { loadAll, api } from './data.js';
import { startApp } from './app.js';
import { initNative } from './native.js';

initNative();

(async () => {
  let data;
  try { data = await loadAll(); }
  catch (e) { document.getElementById('load-error').hidden = false; return; }
  const app = startApp(data, api);
  api.watchContent(state => app.setState(state));
})();
