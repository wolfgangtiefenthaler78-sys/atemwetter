// Nach dem Build: Einzeldatei-Version als dist/app.html bereitstellen und dist/version.json schreiben.
// Die Android-App vergleicht version.json mit ihrer laufenden Version und lädt app.html bei Bedarf nach.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const html = readFileSync('dist-single/index.html', 'utf8');
const version = createHash('sha256').update(html).digest('hex').slice(0, 12);
const meta = JSON.parse(readFileSync('data/app-meta.json', 'utf8'));
copyFileSync('dist-single/index.html', 'dist/app.html');
writeFileSync('dist/version.json', JSON.stringify({ version, minShell: meta.minShell, storeUrl: meta.storeUrl, built: new Date().toISOString() }, null, 2));
console.log('app.html + version.json', version);
