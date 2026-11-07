/* Atemwetter – Datenzugriff (Supabase).
   Lesen: Orte, Luft-/Pollentage, Inhalte (Tipp, Partner-Box). Ohne Verbindung: zuletzt gespeicherter Stand,
   sonst der mitgelieferte Schnappschuss public/snapshot.json.
   Schreiben (nur angemeldete Admins, abgesichert durch die Zugriffsregeln in der Datenbank):
   Inhalte und Partner-Codes. */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, DEFAULT_PLACE } from './config.js';

const CACHE_KEY = 'aw-cache-v1';
const enabled = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const sb = enabled ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' }
}) : null;

const cache = {
  get(){ try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch(e){ return null; } },
  set(v){ try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch(e){} }
};

function viennaDate(offsetDays = 0){
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
}

function stateFromRow(row){
  return { tip: row.tip || {}, partner: row.partner || {}, appLink: row.app_link || '', storeUrl: row.store_url || '' };
}

function buildAir(places, days){
  const byPlace = {};
  let updated = null;
  for(const d of days){
    (byPlace[d.place_id] = byPlace[d.place_id] || []).push({
      date: d.date, aqi_max: d.aqi_max, pm25: d.pm25, pm10: d.pm10, no2: d.no2, o3_max: d.o3_max,
      inversion: d.inversion, aqi_hourly: d.aqi_hourly || [], pollen: d.pollen, pollen_hourly: d.pollen_hourly || {}
    });
    if(!updated || d.updated_at > updated) updated = d.updated_at;
  }
  return {
    updated: updated || new Date().toISOString(),
    source: 'GeoSphere Austria (CC BY 4.0), Copernicus CAMS',
    default: DEFAULT_PLACE,
    places: places.map(p => ({ id: p.id, name: p.name, region: p.region, lat: p.lat, lon: p.lon, elev: p.elev,
                               days: (byPlace[p.id] || []).sort((a,b) => a.date < b.date ? -1 : 1).slice(0, 3) }))
  };
}

async function loadSnapshot(){
  try { const r = await fetch(new URL('snapshot.json', document.baseURI)); if(r.ok) return r.json(); } catch(e){}
  return null;
}

/** Lädt alles, was die Oberfläche zum Start braucht: { air, state, fromCache } */
export async function loadAll(){
  if(enabled){
    try {
      const since = viennaDate(-1);
      const [pl, dy, ct] = await Promise.all([
        sb.from('places').select('id,name,region,lat,lon,elev,sort').eq('active', true).order('sort'),
        sb.from('air_days').select('*').gte('date', since).order('date'),
        sb.from('content').select('*').eq('id', 'main').maybeSingle()
      ]);
      if(pl.error) throw pl.error; if(dy.error) throw dy.error; if(ct.error) throw ct.error;
      const today = viennaDate(0);
      const days = dy.data.filter(d => d.date >= today || !dy.data.some(x => x.place_id === d.place_id && x.date >= today));
      const result = { air: buildAir(pl.data, days), state: stateFromRow(ct.data || {}), fromCache: false };
      cache.set({ air: result.air, state: result.state, at: Date.now() });
      return result;
    } catch(e){ console.warn('Datenbank nicht erreichbar, nutze gespeicherten Stand', e); }
  }
  const c = cache.get();
  if(c) return { air: c.air, state: c.state, fromCache: true };
  const snap = await loadSnapshot();
  if(snap) return { air: snap.air, state: snap.state, fromCache: true };
  throw new Error('Keine Daten verfügbar');
}

/** Schnittstelle für das Dashboard. */
export const api = {
  enabled,
  onAuth(cb){
    if(!enabled) return;
    const check = async session => {
      const email = session && session.user ? session.user.email : null;
      if(!email){ cb(false, null); return; }
      const { data, error } = await sb.rpc('is_admin');
      cb(!error && data === true, email);
    };
    sb.auth.getSession().then(({ data }) => check(data.session));
    sb.auth.onAuthStateChange((_ev, session) => { setTimeout(() => check(session), 0); });
  },
  async sendLoginLink(email){
    const redirect = location.origin + location.pathname + '#verwalten';
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } });
    if(error) throw error;
  },
  async signOut(){ if(enabled) await sb.auth.signOut(); },
  async saveContent(state){
    const row = { id: 'main', tip: state.tip, partner: state.partner, app_link: state.appLink || '', store_url: state.storeUrl || '', updated_at: new Date().toISOString() };
    const { error } = await sb.from('content').upsert(row);
    if(error) throw error;
  },
  async listCodes(){
    const { data, error } = await sb.from('partner_codes').select('*').order('created_at');
    if(error) throw error; return data;
  },
  async addCode(name, code){
    const { error } = await sb.from('partner_codes').insert({ name, code });
    if(error) throw error;
  },
  async changeCount(id, delta){
    const { error } = await sb.rpc('change_code_count', { code_id: id, delta });
    if(error) throw error;
  },
  async deleteCode(id){
    const { error } = await sb.from('partner_codes').delete().eq('id', id);
    if(error) throw error;
  },
  /** Live-Änderungen der Inhalte (Tipp, Partner-Box) abonnieren. */
  watchContent(cb){
    if(!enabled) return;
    sb.channel('content').on('postgres_changes', { event: '*', schema: 'public', table: 'content' },
      payload => { if(payload.new && payload.new.id === 'main') cb(stateFromRow(payload.new)); }).subscribe();
  }
};
