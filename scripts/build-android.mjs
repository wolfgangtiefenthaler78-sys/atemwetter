// Erzeugt android/app/src/main/assets/public/index.html über www/index.html: einen kleinen Lader,
// der die mitgelieferte Version startet oder eine bereits heruntergeladene neuere (siehe src/native.js).
// Startet eine neue Version nicht sauber, fällt der Lader beim nächsten Start auf die eingebaute zurück.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SHELL = JSON.parse(readFileSync('data/app-meta.json', 'utf8')).minShell; // nativer Stand dieser APK
const html = readFileSync('dist-single/index.html', 'utf8');
const version = createHash('sha256').update(html).digest('hex').slice(0, 12);
const b64 = Buffer.from(html, 'utf8').toString('base64');
const loader = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;background:#2f5d8a}</style></head><body>
<script id="builtin" type="text/plain">${b64}</script>
<script>
window.__AW_SHELL = ${SHELL};
(function(){
  var BUILTIN = '${version}', html = null, v = BUILTIN;
  function ls(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function set(k,x){ try{ x === null ? localStorage.removeItem(k) : localStorage.setItem(k,x); }catch(e){} }
  window.__AW_BUILTIN = BUILTIN;
  var sv = ls('aw-bundle-v'), sh = ls('aw-bundle');
  if(sv && ls('aw-bundle-base') !== BUILTIN){ set('aw-bundle', null); set('aw-bundle-v', null); sv = null; }
  if(sv && sh && sv !== BUILTIN){
    if(ls('aw-boot-try') === sv && ls('aw-boot-ok') !== sv){ set('aw-bundle', null); set('aw-bundle-v', null); set('aw-bundle-bad', sv); }
    else { html = sh; v = sv; }
  }
  if(!html){
    var b = document.getElementById('builtin').textContent.trim(), bin = atob(b), u = new Uint8Array(bin.length);
    for(var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    html = new TextDecoder().decode(u); v = BUILTIN;
  }
  set('aw-boot-try', v); window.__AW_RUNNING = v;
  document.open(); document.write(html); document.close();
})();
</script></body></html>`;
mkdirSync('www', { recursive: true });
writeFileSync('www/index.html', loader);
copyFileSync('public/snapshot.json', 'www/snapshot.json');
console.log('www/index.html', loader.length, 'Bytes, eingebaute Version', version, 'Shell', SHELL);
