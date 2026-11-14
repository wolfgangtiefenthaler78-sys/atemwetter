// Baut die Antreiber-App:
//  www/index.html  = kleiner Lader. Er startet die eingebaute Version oder eine heruntergeladene neuere.
//                    Startet eine neue Version nicht sauber, nimmt er beim nächsten Start wieder die eingebaute.
//  www/…           = feste Dateien (Schriften, Logo, Capacitor) aus static/
//  dist/app.html + dist/version.json = Update-Dateien für das Release „antreiber-aktuell“
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

const META = JSON.parse(readFileSync('app-meta.json', 'utf8'));
const html = readFileSync('src/app.html', 'utf8');
const version = createHash('sha256').update(html).digest('hex').slice(0, 12);
const b64 = Buffer.from(html, 'utf8').toString('base64');

const loader = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;background:#fdf6f0}@media (prefers-color-scheme:dark){html,body{background:#1a1714}}</style></head><body>
<script id="builtin" type="text/plain">${b64}</script>
<script>
window.__AB_SHELL = ${META.shell};
window.__AB_UPDATE = ${JSON.stringify({ base: META.updateBase, apk: META.apkUrl })};
(function(){
  var BUILTIN = '${version}', html = null, v = BUILTIN;
  function ls(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function set(k,x){ try{ x === null ? localStorage.removeItem(k) : localStorage.setItem(k,x); }catch(e){} }
  window.__AB_BUILTIN = BUILTIN;
  var sv = ls('ab-bundle-v'), sh = ls('ab-bundle');
  // Neue App installiert? Dann gilt deren eingebaute Version, alte Downloads verwerfen.
  if(sv && ls('ab-bundle-base') !== BUILTIN){ set('ab-bundle', null); set('ab-bundle-v', null); sv = null; }
  if(sv && sh && sv !== BUILTIN){
    if(ls('ab-boot-try') === sv && ls('ab-boot-ok') !== sv){ set('ab-bundle', null); set('ab-bundle-v', null); set('ab-bundle-bad', sv); }
    else { html = sh; v = sv; }
  }
  if(!html){
    var b = document.getElementById('builtin').textContent.trim(), bin = atob(b), u = new Uint8Array(bin.length);
    for(var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    html = new TextDecoder().decode(u); v = BUILTIN;
  }
  set('ab-boot-try', v); window.__AB_RUNNING = v;
  document.open(); document.write(html); document.close();
})();
</script></body></html>`;

rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
cpSync('static', 'www', { recursive: true });
writeFileSync('www/index.html', loader);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/app.html', html);
writeFileSync('dist/version.json', JSON.stringify({
  version, shell: META.shell, minShell: META.minShell, apkUrl: META.apkUrl, built: new Date().toISOString()
}, null, 2));
console.log('Antreiber gebaut: Inhalt', version, '· Shell', META.shell);
