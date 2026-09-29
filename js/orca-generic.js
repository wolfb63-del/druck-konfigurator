'use strict';
/* Beliebiger Drucker aus den OrcaSlicer-Systemprofilen (js/orca-printers/). Kein DOM – tests/verify-3mf.js
   prüft das mit der Orca-CLI. Liefert eine „Vorlage“ im selben Aufbau wie ORCA_TEMPLATES (S1/U1), damit der
   3MF-Export unverändert weiterarbeitet:
     settings  = Orca-Grundwerte ⊕ Druckerprofil ⊕ Prozessprofil ⊕ Filamentprofil je Slot
     *_settings_id = Namen der Systemprofile → die Orca-Oberfläche lädt beim Öffnen genau diese Profile
   Geschwindigkeiten und Beschleunigung stammen aus dem Prozessprofil des Druckers (nicht aus den S1-Tests). */

const ORCA_PRINTER_PREFIX = 'orca:';
const DEFAULT_SLOT_TYPE = 'PLA';
const MULTI_SLOT_COUNT = 4;   // Drucker mit Filament-Wechsler (AMS/MMU) bekommen 4 Slots, sonst 1 je Düse

const first = v => (Array.isArray(v) ? v[0] : v);

/* Bereinigungen, die für jede Orca-project_settings.config gelten – egal ob aus einem Katalogprofil
   zusammengesetzt (orcaGenericTemplate) oder aus einer hochgeladenen eigenen Datei gelesen
   (orca-custom.js). Verändert settings direkt (in place). */
function orcaCleanupSettings(settings) {
  // Leere Einträge (null) lassen Orca abstürzen (beobachtet 2026-09-27: extruder_printable_height=[null]
  // → Zugriffsverletzung bei Bambu-Druckern) – solche Schlüssel weglassen, Orca nimmt dann den Grundwert
  for (const [k, v] of Object.entries(settings)) if (v === null || (Array.isArray(v) && v.some(x => x === null || x === undefined))) delete settings[k];
  /* machine_max_… und machine_min_… sind [Normal-, Silent-Modus]-Paare, unabhängig von der Kopfzahl. Einige
   * offizielle Orca-Profile (z. B. ältere Anycubic-Drucker) geben nur einen Wert an – das lässt die
   * Orca-CLI bei „marlin“/„marlin2“/„reprap“-Firmware abstürzen (beobachtet 2026-09-27, Kobra Max/Plus/
   * S1 Max/X/Vyper). Auf 2 Werte auffüllen behebt es, ohne den eigentlichen Wert zu ändern. Ausnahme:
   * machine_max_junction_deviation ist kein Modus-Paar, sondern ein einzelner Wert (beobachtet 2026-09-28
   * beim eigenen Kobra-S1-Profil – Auffüllen auf 2 Werte ließ die CLI dort abstürzen, ohne Fehlermeldung). */
  for (const k of Object.keys(settings)) if (/^machine_(max|min)_/.test(k) && !/_junction_deviation$/.test(k) && Array.isArray(settings[k]) && settings[k].length === 1)
    settings[k] = [settings[k][0], settings[k][0]];
  // Manche Profile geben Flächen als Text „0x0,220x0,…“ an; im Projekt erwartet Orca eine Liste.
  // NICHT thumbnails – das ist ein einzelner Beschreibungsstring („230x110/PNG“), kein Koordinaten-Text
  // (Fehler gefunden 2026-09-28: als Array geschickt ließ die CLI ebenfalls ohne Meldung abstürzen).
  for (const k of ['printable_area', 'bed_exclude_area'])
    if (typeof settings[k] === 'string') settings[k] = settings[k].split(',').map(s => s.trim()).filter(Boolean);
}

/* Wie viele Filament-Slots ein Drucker im Projekt bekommt: je Düse einer; 4 bei Druckern mit
   Filament-Wechsler. single_extruder_multi_material taugt dafür nicht – Orca schaltet es in den
   Grundwerten für fast alle Drucker ein. Erkannt werden daher Bambu (AMS) und Namen mit Wechsler-Hinweis. */
const MULTI_MATERIAL_NAME = /combo|\bams\b|\bcfs\b|\bace\b|mmu|multi|toolchanger|\bu1\b/i;
function orcaSlotCount(vendor, p, name) {
  if (p.extruders > 1) return p.extruders;
  if (vendor === 'BBL' || MULTI_MATERIAL_NAME.test(name || '')) return MULTI_SLOT_COUNT;
  return 1;
}

/* Vorlage für den Drucker `name` des Herstellers `vendor` (Daten müssen geladen sein: ORCA_PRINTER_DATA[vendor]). */
function orcaGenericTemplate(vendor, name) {
  const data = ORCA_PRINTER_DATA[vendor];
  const p = data && data.printers[name];
  if (!p) return null;
  const n = orcaSlotCount(vendor, p, name);
  const settings = JSON.parse(JSON.stringify(ORCA_PROJECT_BASE.settings));
  // Filament-Schlüssel auf die Slot-Zahl bringen (Grundwert = erster Eintrag)
  for (const k of ORCA_PROJECT_BASE.filamentKeys) if (Array.isArray(settings[k])) settings[k] = Array(n).fill(settings[k][0]);
  Object.assign(settings, JSON.parse(JSON.stringify(data.processes[p.process] || {})));
  Object.assign(settings, JSON.parse(JSON.stringify(p.machine)));
  const presets = p.filaments || {};
  const values = {};
  for (const [type, fname] of Object.entries(presets)) values[type] = data.filaments[fname] || {};
  const startName = presets[DEFAULT_SLOT_TYPE] || Object.values(presets)[0] || '';
  const filKeys = new Set(ORCA_PROJECT_BASE.filamentKeys.concat(Object.keys(values[DEFAULT_SLOT_TYPE] || {})));
  // Alle Slots zunächst mit dem PLA-Profil des Druckers füllen; der Export tauscht je Slot passend zum Filament
  for (const k of filKeys) {
    const v = (values[DEFAULT_SLOT_TYPE] || {})[k];
    if (v === undefined || k === 'filament_settings_id') continue;
    settings[k] = Array(n).fill(Array.isArray(v) ? v[0] : v);
  }
  // Einstellungen je Kopf auf die Zahl der Köpfe bringen (sonst lehnt Orca Mehrkopf-Drucker ab)
  const heads = Math.max(1, p.extruders || 1);
  for (const k of ORCA_PROJECT_BASE.extruderKeys || []) {
    const v = settings[k];
    if (v === undefined || (Array.isArray(v) && (v.length === heads || v.length === 0))) continue;
    settings[k] = Array(heads).fill(Array.isArray(v) ? v[0] : v);
  }
  orcaCleanupSettings(settings);
  // Spülmengen: je Kopf eine Slot × Slot-Tabelle (0 auf der Diagonale)
  if (Array.isArray(settings.flush_volumes_matrix)) {
    const f = settings.flush_volumes_matrix.map(Number).find(x => x > 0) || 280;
    const one = Array.from({ length: n * n }, (_, i) => String(i % (n + 1) === 0 ? 0 : f));
    settings.flush_volumes_matrix = Array.from({ length: heads }, () => one).flat();
  }
  settings.printer_settings_id = name;
  settings.print_settings_id = p.process;
  settings.print_compatible_printers = [name];   // Orca prüft, ob das Prozessprofil zum Drucker passt
  settings.filament_settings_id = Array(n).fill(startName);
  settings.inherits_group = Array(n + 2).fill('');
  settings.different_settings_to_system = Array(n + 2).fill('');
  return {
    source: 'orca', vendor, orcaVersion: ORCA_PROJECT_BASE.orcaVersion,
    printerPreset: name, bedCenter: p.center, bed: p.bed,
    slots: Array.from({ length: n }, () => ({ name: startName, type: DEFAULT_SLOT_TYPE, colour: '' })),
    settings, filamentPresets: presets, filamentValues: values, filamentKeys: [...filKeys],
    process: data.processes[p.process] || {}
  };
}

/* Materialwerte für einen Orca-Drucker begrenzen: jede Geschwindigkeit höchstens so hoch wie im Prozessprofil
   des Druckers, Volumenstrom höchstens wie im Filamentprofil, Beschleunigung höchstens wie im Prozessprofil.
   So bleiben langsame Drucker bei ihren Orca-Werten, TPU bleibt trotzdem langsam. */
function orcaLimitMaterial(m, o) {
  const P = o.process || {};
  const num = k => { const v = Number(String(first(P[k]) ?? '').replace('%', '')); return Number.isFinite(v) && v > 0 && !String(first(P[k])).includes('%') ? v : null; };
  const cap = (v, k) => { const lim = num(k); return lim ? Math.min(v, lim) : v; };
  const capArr = (a, k) => (Array.isArray(a) ? a.map(v => cap(v, k)) : a);
  const mv = (o.maxVol || {})[String(ORCA_KIND[m.kind] || '').toUpperCase()];
  return Object.assign({}, m, {
    outer: capArr(m.outer, 'outer_wall_speed'), inner: capArr(m.inner, 'inner_wall_speed'), fill: capArr(m.fill, 'sparse_infill_speed'),
    top: cap(m.top, 'top_surface_speed'), gap: cap(m.gap, 'gap_infill_speed'), first: cap(m.first, 'initial_layer_speed'), travel: cap(m.travel, 'travel_speed'),
    maxVol: mv > 0 ? Math.min(m.maxVol, mv) : m.maxVol,
    accel: Number(m.accel) > 0 ? cap(m.accel, 'default_acceleration') : m.accel
  });
}

/* Heizt der Start-G-Code des Herstellerprofils fest (z. B. „M109 S205“ ohne Platzhalter), setzt Orca keinen
   eigenen Heizbefehl mehr – gedruckt wird dann mit dieser Temperatur statt der Filamenttemperatur.
   Beobachtet 2026-09-27 bei LONGER LK10 und Orca Arena X1C (per Orca-CLI). */
function fixedStartTemp(machine) {
  const g = String((machine || {}).machine_start_gcode || '');
  const m = /^\s*M109\s+S(\d{3})\b/m.exec(g);
  return m && !/\[(nozzle_temperature|first_layer_temperature)[^\]]*\]|\{(nozzle_temperature|first_layer_temperature)/.test(g) ? +m[1] : null;
}

// Drucker-Eintrag für PRINTERS (id 'orca') aus den geladenen Herstellerdaten
function orcaPrinterEntry(vendor, name) {
  const data = ORCA_PRINTER_DATA[vendor], p = data && data.printers[name];
  if (!p) return null;
  const maxVol = {};
  for (const [type, fname] of Object.entries(p.filaments || {})) {
    const v = Number(first((data.filaments[fname] || {}).filament_max_volumetric_speed));
    if (v > 0) maxVol[type] = v;
  }
  return {
    id: 'orca', label: name.replace(/ \d+(\.\d+)? nozzle$/, ''), slicer: 'OrcaSlicer',
    nozzleOptions: ['brass', 'steel_stainless', 'steel_hardened'], nozzleDefault: 'brass',
    multicolorSystem: null, enclosureBuiltin: false, testedOK: false,
    orca: { vendor, name, nozzle: String(p.nozzle), process: data.processes[p.process] || {}, maxVol, fixedStartTemp: fixedStartTemp(p.machine) }
  };
}

// Vorlage des aktiven Orca-Druckers (PRINTERS.orca) – nur für seine eigene Düse; zwischengespeichert
let orcaTplCache = { key: '', tpl: null };
function orcaActiveTemplate(nozD) {
  const o = typeof PRINTERS !== 'undefined' && PRINTERS.orca && PRINTERS.orca.orca;
  if (!o || nkey(o.nozzle) !== nkey(nozD)) return null;
  if (o.vendor === 'custom') return o.customTemplate || null;   // eigenes Profil, keine Katalogdaten nötig
  if (!ORCA_PRINTER_DATA[o.vendor]) return null;
  if (orcaTplCache.key !== o.name) orcaTplCache = { key: o.name, tpl: orcaGenericTemplate(o.vendor, o.name) };
  return orcaTplCache.tpl;
}
