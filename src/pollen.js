/* Atemwetter – Pollen- und Sporenkatalog (gemeinsam für App, Tagestipp und Mitteilungen). Ohne Bildschirmzugriff. */
export const POLLEN_NAMES = {alder:'Erle',birch:'Birke',grass:'Gräser',mugwort:'Beifuß',ragweed:'Ambrosia'};
export const POLLEN_TH = {alder:[10,50], birch:[10,100], grass:[10,50], mugwort:[5,20], ragweed:[3,10]};
export const LEVELS = [{name:'keine',c:'var(--q1)'},{name:'gering',c:'var(--q2)'},{name:'mäßig',c:'var(--q3)'},{name:'hoch',c:'var(--q4)'}];
export function pollenLevel(k,v){ v=v||0; const t=POLLEN_TH[k]||[10,50]; const i = v<1?0 : v<t[0]?1 : v<t[1]?2 : 3; return Object.assign({i}, LEVELS[i]); }
// Typische Blühzeiten in Mitteleuropa (0 = Jänner): Monate mit Flug (ms), Hauptblüte (pk), Allergiepotenzial (pot 1–3).
// k = Schlüssel der tagesgenauen Copernicus-Prognose (nur Erle, Birke, Gräser, Beifuß, Ambrosia).
export const SEASON_GROUPS = ['Laubbäume','Nadelbäume','Gräser und Kräuter','Schimmelpilzsporen'];
export const SEASON = [
  {id:'hazel',    g:0, n:'Hasel',       pn:'Haselpollen',      ms:[0,1,2],         pk:[1],   pot:2, note:'In milden Wintern oft schon ab Dezember.'},
  {id:'alder',    g:0, n:'Erle',        pn:'Erlenpollen',      ms:[0,1,2,3],       pk:[1,2], pot:2, k:'alder'},
  {id:'elm',      g:0, n:'Ulme',        pn:'Ulmenpollen',      ms:[1,2,3],         pk:[2],   pot:1},
  {id:'poplar',   g:0, n:'Pappel',      pn:'Pappelpollen',     ms:[2,3],           pk:[2],   pot:1, note:'Die weißen Samenflocken im Frühsommer sind keine Pollen und lösen selbst kaum Allergien aus.'},
  {id:'willow',   g:0, n:'Weide',       pn:'Weidenpollen',     ms:[2,3,4],         pk:[3],   pot:1},
  {id:'ash',      g:0, n:'Esche',       pn:'Eschenpollen',     ms:[2,3],           pk:[3],   pot:2, note:'Verwandt mit der Olive; wer auf eine reagiert, reagiert oft auch auf die andere.'},
  {id:'hornbeam', g:0, n:'Hainbuche',   pn:'Hainbuchenpollen', ms:[2,3,4],         pk:[3],   pot:2, note:'Verwandt mit Birke, Erle und Hasel.'},
  {id:'birch',    g:0, n:'Birke',       pn:'Birkenpollen',     ms:[2,3,4],         pk:[3],   pot:3, k:'birch', note:'Häufig zusammen mit Beschwerden bei rohem Kern- und Steinobst oder Haselnüssen.'},
  {id:'plane',    g:0, n:'Platane',     pn:'Platanenpollen',   ms:[3,4],           pk:[3],   pot:2, note:'Häufiger Stadtbaum.'},
  {id:'beech',    g:0, n:'Buche',       pn:'Buchenpollen',     ms:[3,4],           pk:[4],   pot:1},
  {id:'oak',      g:0, n:'Eiche',       pn:'Eichenpollen',     ms:[3,4,5],         pk:[4],   pot:2},
  {id:'olive',    g:0, n:'Olive',       pn:'Olivenpollen',     ms:[4,5],           pk:[4],   pot:3, note:'Vor allem im Mittelmeerraum, also im Urlaub wichtig.'},
  {id:'lime',     g:0, n:'Linde',       pn:'Lindenpollen',     ms:[5,6],           pk:[5],   pot:1},
  {id:'chestnut', g:0, n:'Edelkastanie',pn:'Kastanienpollen',  ms:[5,6],           pk:[5],   pot:1, note:'Häufig im Tessin und in Südtirol.'},
  {id:'cypress',  g:1, n:'Zypresse',    pn:'Zypressenpollen',  ms:[0,1,2,3],       pk:[1,2], pot:2, note:'Vor allem im Mittelmeerraum und als Zierbaum; im Süden ein häufiger Auslöser im Spätwinter.'},
  {id:'juniper',  g:1, n:'Wacholder und Thuja', pn:'Pollen von Wacholder und Thuja', ms:[2,3,4], pk:[3], pot:2, note:'Thuja (Lebensbaum) ist eine häufige Heckenpflanze. Wacholder, Thuja und Zypresse gehören zur selben Familie.'},
  {id:'larch',    g:1, n:'Lärche',      pn:'Lärchenpollen',    ms:[2,3,4],         pk:[3],   pot:1},
  {id:'pine',     g:1, n:'Kiefer',      pn:'Kiefernpollen',    ms:[4,5],           pk:[4],   pot:1, note:'Der gelbe Blütenstaub auf Autos und Pfützen („Schwefelregen“) ist auffällig, löst aber selten Allergien aus.'},
  {id:'spruce',   g:1, n:'Fichte',      pn:'Fichtenpollen',    ms:[4,5],           pk:[4],   pot:1, note:'Viel sichtbarer Blütenstaub, aber selten Auslöser von Allergien.'},
  {id:'fir',      g:1, n:'Tanne',       pn:'Tannenpollen',     ms:[4,5],           pk:[4],   pot:1, note:'Selten Auslöser von Allergien.'},
  {id:'grass',    g:2, n:'Gräser',      pn:'Gräserpollen',     ms:[4,5,6,7],       pk:[4,5], pot:3, k:'grass'},
  {id:'rye',      g:2, n:'Roggen',      pn:'Roggenpollen',     ms:[4,5],           pk:[4],   pot:3, note:'Getreide aus der Familie der Gräser; wer auf Gräser reagiert, reagiert meist auch auf Roggen.'},
  {id:'plantain', g:2, n:'Wegerich',    pn:'Wegerichpollen',   ms:[4,5,6,7,8],     pk:[5],   pot:2},
  {id:'sorrel',   g:2, n:'Ampfer',      pn:'Ampferpollen',     ms:[4,5,6],         pk:[5],   pot:1},
  {id:'nettle',   g:2, n:'Brennnessel', pn:'Brennnesselpollen',ms:[5,6,7,8],       pk:[6,7], pot:1, note:'Das verwandte Glaskraut im Mittelmeerraum ist dagegen ein starker Auslöser.'},
  {id:'mugwort',  g:2, n:'Beifuß',      pn:'Beifußpollen',     ms:[6,7,8],         pk:[7],   pot:3, k:'mugwort'},
  {id:'goosefoot',g:2, n:'Gänsefuß',    pn:'Gänsefußpollen',   ms:[6,7,8],         pk:[7],   pot:1},
  {id:'ragweed',  g:2, n:'Ambrosia',    pn:'Ambrosiapollen',   ms:[7,8,9],         pk:[7,8], pot:3, k:'ragweed', note:'Schon wenige Ambrosiapollen können Beschwerden auslösen.'},
  {id:'alternaria',g:3,n:'Alternaria',  pn:'Alternaria-Sporen',ms:[4,5,6,7,8,9],   pk:[6,7], pot:3, note:'Schimmelpilzsporen, keine Pollen. Viele Sporen an warmen, trockenen und windigen Tagen und bei der Getreideernte.'},
  {id:'cladosporium',g:3,n:'Cladosporium',pn:'Cladosporium-Sporen',ms:[4,5,6,7,8,9],pk:[6,7], pot:2, note:'Schimmelpilzsporen, keine Pollen. Im Sommer die häufigsten Sporen in der Luft.'}];
export const SEASON_BY = Object.fromEntries(SEASON.map(P=>[P.id,P]));
export const POT = ['','gering','mittel','hoch'];
export const MN = ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
export const MS = ['Jän','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
export const phase = (P,m) => P.pk.includes(m) ? 2 : P.ms.includes(m) ? 1 : 0;
