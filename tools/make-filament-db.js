'use strict';
/* Erzeugt js/filament-db.js aus der SpoolmanDB (https://github.com/Donkie/SpoolmanDB, MIT-Lizenz, siehe
   THIRD_PARTY_NOTICES.md). Aufruf:
     node tools/make-filament-db.js                  lädt https://donkie.github.io/SpoolmanDB/filaments.json
     node tools/make-filament-db.js <Pfad zur filaments.json>
   Behalten werden nur Filamente mit 1,75 mm; je Eintrag [Name, Hex-Farbe, Düse °C, Bett °C] (0 = nicht angegeben).
   Die Temperaturen sind Herstellerangaben der Datenbank (ungeprüft, bei vielen Herstellern leer) und dienen nur als Hinweis. */
const fs = require('fs');
const path = require('path');

const SOURCE = 'https://donkie.github.io/SpoolmanDB/filaments.json';
const OUT = path.join(__dirname, '..', 'js', 'filament-db.js');

async function load(arg) {
  if (arg && !/^https?:/i.test(arg)) return JSON.parse(fs.readFileSync(arg, 'utf8'));
  const res = await fetch(arg || SOURCE);
  if (!res.ok) throw new Error('Download fehlgeschlagen: HTTP ' + res.status);
  return res.json();
}

// Acht Stellen: die Quelle mischt zwei Konventionen. Bei diesen Herstellern steht der Alpha-Wert hinten (RRGGBBAA),
// bei allen anderen vorn (AARRGGBB); geprüft an den 33 Einträgen der Quelle (z. B. „Clear“ = 00FFFFFF = Weiß).
const ALPHA_LAST = new Set(['Das Filament', 'Sunlu']);
// Mehrfarbige Filamente (color_hexes, z. B. „Pink & Blue“) bekommen nur ihre erste Farbe.
const hexOf = f => {
  const h = String(f.color_hex || (Array.isArray(f.color_hexes) ? f.color_hexes[0] : '') || '').replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(h)) return h.toUpperCase();
  if (/^[0-9a-f]{8}$/i.test(h)) return (ALPHA_LAST.has(f.manufacturer) ? h.slice(0, 6) : h.slice(2)).toUpperCase();
  return '';
};
// Temperatur: Einzelwert, sonst Mitte des Bereichs (z. B. [255, 265] → 260), sonst 0 = nicht angegeben
const temp = (v, range) => {
  if (Number.isFinite(Number(v)) && Number(v) > 0) return Math.round(Number(v));
  const r = Array.isArray(range) ? range.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
  return r.length === 2 ? Math.round((r[0] + r[1]) / 2) : 0;
};

function build(all) {
  const db = {}, seen = new Set();
  let dropped = 0;
  for (const f of all) {
    if (Number(f.diameter) !== 1.75 || !f.manufacturer || !f.material || !f.name) { dropped++; continue; }
    const hex = hexOf(f);
    if (!hex) { dropped++; continue; }
    const key = [f.manufacturer, f.material, f.name, hex].join('\u0001');
    if (seen.has(key)) { dropped++; continue; }
    seen.add(key);
    ((db[f.manufacturer] ??= {})[f.material] ??= []).push([String(f.name).trim(), hex, temp(f.extruder_temp, f.extruder_temp_range), temp(f.bed_temp, f.bed_temp_range)]);
  }
  const sorted = {};
  for (const m of Object.keys(db).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))) {
    sorted[m] = {};
    for (const mat of Object.keys(db[m]).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })))
      sorted[m][mat] = db[m][mat].sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }) || a[1].localeCompare(b[1]));
  }
  return { db: sorted, dropped };
}

(async () => {
  const all = await load(process.argv[2]);
  const { db, dropped } = build(all);
  const n = Object.values(db).reduce((s, m) => s + Object.values(m).reduce((t, a) => t + a.length, 0), 0);
  const head = '/* Filament-Datenbank (1,75 mm): Hersteller → Material → [Name, Hex-Farbe, Düse °C, Bett °C]; 0 = nicht angegeben.\n' +
    '   Quelle: SpoolmanDB (https://github.com/Donkie/SpoolmanDB), MIT-Lizenz – siehe THIRD_PARTY_NOTICES.md.\n' +
    '   Erzeugt mit tools/make-filament-db.js am ' + new Date().toISOString().slice(0, 10) + '; nicht von Hand ändern.\n' +
    '   Die Temperaturen sind Herstellerangaben der Quelle, ungeprüft und lückenhaft: nur als Hinweis anzeigen, nie rechnen. */\n';
  fs.writeFileSync(OUT, head + 'const FILAMENT_DB = ' + JSON.stringify(db) + ';\n');
  console.log(Object.keys(db).length + ' Hersteller, ' + n + ' Filamente (' + dropped + ' verworfen) → js/filament-db.js, ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB');
})().catch(e => { console.error(e.message); process.exit(1); });
