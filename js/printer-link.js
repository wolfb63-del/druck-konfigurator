'use strict';
/* Live-Abfrage der Filament-Belegung über Moonraker – nur lesende GET-Anfragen.
   Kobra S1 (Rinkhals): Objekt filament_hub → ACE-Slots.
   Snapmaker U1 (paxx/Klipper): Objekt print_task_config → Arrays je Werkzeugkopf.
   Funktioniert nur, wenn die Seite über http://127.0.0.1 läuft (Moonraker-CORS);
   per Doppelklick (file://) blockiert der Browser die Antwort. */

const MOONRAKER_PORT = 7125;
const LINK_TIMEOUT_MS = 8000;  // Kobra S1 (Rinkhals) antwortet gemessen zwischen 0,2 und 15 s
const LINK_ATTEMPTS = 2;

const hex2 = n => Math.max(0, Math.min(255, Math.round(+n || 0))).toString(16).padStart(2, '0').toUpperCase();
const normType = t => String(t || '').trim().toUpperCase();

// Je Drucker: Abfrage-Objekt und Umwandlung in [{type, colour, name, present}]
const SLOT_ADAPTERS = {
  kobra_s1: {
    query: 'filament_hub',
    parse: status => {
      const hub = ((status.filament_hub || {}).filament_hubs || [])[0];
      if (!hub || !Array.isArray(hub.slots)) throw Error('keine ACE-Daten (filament_hub) gefunden');
      return hub.slots.slice().sort((a, b) => a.index - b.index).map(s => {
        const c = Array.isArray(s.color) ? s.color : [136, 136, 136];
        return { type: normType(s.type), colour: '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]), name: normType(s.type) || 'leer', present: s.status === 'ready' };
      });
    }
  },
  snapmaker_u1: {
    query: 'print_task_config',
    parse: status => {
      const p = status.print_task_config;
      if (!p || !Array.isArray(p.filament_type)) throw Error('keine Werkzeugkopf-Daten (print_task_config) gefunden');
      return p.filament_type.map((t, i) => {
        const rgba = String((p.filament_color_rgba || [])[i] || '888888FF');
        const vendor = (p.filament_vendor || [])[i] || '';
        return { type: normType(t), colour: '#' + rgba.slice(0, 6).toUpperCase(), name: (vendor ? vendor + ' ' : '') + normType(t), present: (p.filament_exist || [])[i] !== false };
      });
    }
  }
};

// Nur über den lokalen Server (http). file:// blockiert der Drucker per CORS, eine https-Seite (Online-Version)
// darf der Browser nicht an ein http-Gerät im Heimnetz fragen lassen.
function linkAvailable() { return location.protocol === 'http:'; }

// Liefert {slots, host, time} oder wirft einen Fehler mit verständlicher Meldung.
const HOST_PATTERN = /^[A-Za-z0-9.-]+$/;

async function fetchLiveSlots(printerId, host) {
  const adapter = SLOT_ADAPTERS[printerId];
  if (!adapter) throw Error('für diesen Drucker gibt es keine Live-Abfrage');
  if (!host) throw Error('keine IP-Adresse eingetragen');
  if (!HOST_PATTERN.test(host)) throw Error('ungültige IP-Adresse/Hostname');
  if (!linkAvailable()) throw Error(location.protocol === 'https:'
    ? 'Live-Abfrage geht in der Online-Version nicht – dafür das Tool herunterladen und über den lokalen Server starten'
    : 'Live-Abfrage nur beim Start über „Konfigurator starten.cmd“ bzw. tools/serve.py (nicht per Doppelklick auf index.html)');
  for (let attempt = 1; ; attempt++) {
    try { return await querySlotsOnce(adapter, host); }
    catch (e) { if (attempt >= LINK_ATTEMPTS || !e.retryable) throw e; }
  }
}

async function querySlotsOnce(adapter, host) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), LINK_TIMEOUT_MS);
  try {
    const res = await fetch('http://' + host + ':' + MOONRAKER_PORT + '/printer/objects/query?' + adapter.query, { signal: ctrl.signal });
    if (!res.ok) throw Error('Drucker antwortet mit HTTP ' + res.status);
    const data = await res.json();
    return { slots: adapter.parse((data.result || {}).status || {}), host, time: new Date() };
  } catch (e) {
    const err = e.name === 'AbortError' ? Error('Drucker unter ' + host + ' antwortet nicht (Zeitüberschreitung)')
      : e instanceof TypeError ? Error('Drucker unter ' + host + ' nicht erreichbar oder Zugriff blockiert') : null;
    if (err) { err.retryable = true; throw err; }
    throw e;
  } finally { clearTimeout(timer); }
}

// Grobe Zuordnung Druckerangabe → Filamenttyp des Konfigurators ("PLA+", "PETG-HF" …)
function slotMatchesKind(slotType, kind) {
  const t = normType(slotType), k = (ORCA_KIND[kind] || '').toUpperCase();
  return !!t && !!k && (t === k || t.startsWith(k));
}
