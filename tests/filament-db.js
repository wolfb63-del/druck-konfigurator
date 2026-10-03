'use strict';
/* Filament-Auswahl (js/filament-pick.js) und mitgelieferte Datenbank (js/filament-db.js, Quelle SpoolmanDB).
   Sollwerte: Stichproben aus der Quelldatei filaments.json (am 2026-10-03 geladen) und aus der Konstruktion
   der Zuordnungsregeln, nicht aus der Ausgabe des Codes. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = vm.createContext({ console });
for (const f of ['filament-db', 'filament-pick'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const K = vm.runInContext('({FILAMENT_DB, filamentTypeFor, fdbManufacturers, fdbMaterials, fdbColours})', ctx);
const DB = K.FILAMENT_DB;

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) pass++; else { fail++; console.log('FEHLER: ' + name + (extra !== undefined ? ' → ' + extra : '')); } };

// Zuordnung Material → Typ (Regeln der Datei, Beispiele aus der Datenbank)
const T = { 'PLA': 'PLA', 'PLA+': 'PLA', 'HTPLA+': 'PLA', 'PLA+WOOD': 'PLA', 'PLA-CF': 'PLA-CF', 'PETG': 'PETG', 'PETG-CF': 'PETG-CF', 'PETG-CF10': 'PETG-CF', 'PETG-GF': 'PETG',
  'PCTG': 'PETG', 'HTPET+': 'PETG', 'ABS': 'ABS', 'ABS+': 'ABS', 'ABS+MATTE': 'ABS', 'ABS+GF20': 'ABS', 'ABS-GF': 'ABS', 'ASA': 'ASA', 'EASYASA': 'ASA', 'ASA-CF': 'ASA', 'ASA-X': 'ASA',
  'TPU': 'TPU', 'TPU-95A': 'TPU', 'TPU-55D': 'TPU', 'TPE': 'TPU', 'TPC': 'TPU', 'PA': 'PA', 'PA6': 'PA', 'PA12': 'PA', 'PA6-GF': 'PA', 'PAHT-CF': 'PA', 'PA11-CF': 'PA', 'PA-CF': 'PA',
  'PC': 'PC', 'PC-CF': 'PC', 'PCABS': 'PC', 'PC+ABS': 'PC', 'PCPBT': 'PC',
  'PET-CF': '', 'PET-GF': '', 'PVB': '', 'HIPS': '', 'WOOD': '', 'PVA': '', 'PHA': '', 'PEEK-CF': '', 'PP': '', 'BIOFUSION': '', 'GREENTEC': '', 'CF': '', 'PEI': '', '': '' };
for (const [m, t] of Object.entries(T)) check('Typ ' + (m || '(leer)') + ' → ' + (t || 'unbekannt'), K.filamentTypeFor(m) === t, K.filamentTypeFor(m));
check('Groß-/Kleinschreibung und Leerzeichen egal', K.filamentTypeFor('pla +') === 'PLA' && K.filamentTypeFor(' Petg ') === 'PETG' && K.filamentTypeFor(null) === '');

// Alle Materialien der Datenbank: das Ergebnis ist immer einer der neun Typen oder ''
const NINE = new Set(['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PLA-CF', 'PETG-CF', 'PA', 'PC', '']);
const allMats = [...new Set(Object.values(DB).flatMap(m => Object.keys(m)))];
check('Datenbank: jedes Material landet in einem der neun Typen oder unbekannt', allMats.every(m => NINE.has(K.filamentTypeFor(m))), allMats.filter(m => !NINE.has(K.filamentTypeFor(m))).join());
const total = Object.values(DB).reduce((s, m) => s + Object.values(m).reduce((t, a) => t + a.length, 0), 0);
const mapped = Object.values(DB).reduce((s, m) => s + Object.entries(m).reduce((t, [k, a]) => t + (K.filamentTypeFor(k) ? a.length : 0), 0), 0);
check('Datenbank: über 95 % der Filamente haben einen bekannten Typ', mapped / total > 0.95, (mapped / total).toFixed(3));

// Aufbau der Datenbank
const mf = K.fdbManufacturers(DB);
check('Hersteller: 67 laut Quelle, alphabetisch', mf.length === 67 && mf.every((m, i) => !i || m.localeCompare(mf[i - 1], 'de', { sensitivity: 'base' }) >= 0), mf.length);
check('Hersteller: Bambu Lab, Creality, ELEGOO, ANYCUBIC, Prusament, Sunlu, Polymaker vorhanden', ['Bambu Lab', 'Creality', 'ELEGOO', 'ANYCUBIC', 'Prusament', 'Sunlu', 'Polymaker'].every(m => mf.includes(m)));
check('Alle Farben: Hex gültig (#RRGGBB), Name nicht leer, Temperaturen Zahlen ≥ 0',
  Object.keys(DB).every(m => Object.keys(DB[m]).every(k => K.fdbColours(DB, m, k).every(c => /^#[0-9A-F]{6}$/.test(c.hex) && c.name && c.nozzle >= 0 && c.bed >= 0))));
check('Keine doppelten Einträge (Hersteller, Material, Name, Farbe)', (() => { const s = new Set(); for (const m of Object.keys(DB)) for (const k of Object.keys(DB[m])) for (const c of DB[m][k]) { const key = [m, k, c[0], c[1]].join('|'); if (s.has(key)) return false; s.add(key); } return true; })());
check('Anzahl Filamente 1,75 mm: 4705 eindeutig laut Quelle', total === 4705, total);

// Stichprobe aus der Quelle: {"manufacturer":"3D-Fuel","name":"Almond","material":"PLA+","color_hex":"CFBCAE","extruder_temp":220,"bed_temp":60,"diameter":1.75}
const almond = K.fdbColours(DB, '3D-Fuel', 'PLA+').find(c => c.name === 'Almond');
check('Stichprobe 3D-Fuel PLA+ Almond: #CFBCAE, Düse 220, Bett 60', almond && almond.hex === '#CFBCAE' && almond.nozzle === 220 && almond.bed === 60, JSON.stringify(almond));

// Auswahlfunktionen mit kleiner Beispiel-Datenbank
const small = { B: { 'PLA': [['Rot', 'FF0000', 210, 60], ['Blau', '0000FF', 0, 0]], 'PVB': [['Klar', 'FFFFFF', 0, 0]], 'ABS+': [['Grau', '808080', 240, 100]] }, A: {} };
check('fdbManufacturers: A vor B', JSON.stringify(K.fdbManufacturers(small)) === '["A","B"]');
check('fdbMaterials: bekannte Typen zuerst (ABS+, PLA), dann PVB; Anzahl je Material', JSON.stringify(K.fdbMaterials(small, 'B')) === JSON.stringify([{ material: 'ABS+', type: 'ABS', count: 1 }, { material: 'PLA', type: 'PLA', count: 2 }, { material: 'PVB', type: '', count: 1 }]), JSON.stringify(K.fdbMaterials(small, 'B')));
check('fdbMaterials/-Colours: unbekannter Hersteller/Material → leer', K.fdbMaterials(small, 'X').length === 0 && K.fdbColours(small, 'B', 'ZZZ').length === 0 && K.fdbColours(null, 'B', 'PLA').length === 0);
check('fdbColours: Hex bekommt #', K.fdbColours(small, 'B', 'PLA')[0].hex === '#FF0000');

// Befund des Prüf-Agenten: 8-stellige Hex-Werte (Quelle: "Clear" 00FFFFFF, "Neon Green" 3C8AD77F bei AmazonBasics = Alpha vorn;
// Das Filament "Transl. Wassergrün" 00d4d488 und Sunlu "Clear" ffffffaa = Alpha hinten)
const colOf = (m, mat, n) => K.fdbColours(DB, m, mat).find(c => c.name === n);
const anyOf = (m, n) => Object.keys(DB[m]).map(k => colOf(m, k, n)).find(Boolean);
check('Hex: Anycubic "Clear" 00FFFFFF → #FFFFFF (nicht Cyan)', anyOf('ANYCUBIC', 'Clear') && anyOf('ANYCUBIC', 'Clear').hex === '#FFFFFF', JSON.stringify(anyOf('ANYCUBIC', 'Clear')));
check('Hex: AmazonBasics "Neon Green" 3C8AD77F → #8AD77F', anyOf('AmazonBasics', 'Neon Green') && anyOf('AmazonBasics', 'Neon Green').hex === '#8AD77F', JSON.stringify(anyOf('AmazonBasics', 'Neon Green')));
check('Hex: Das Filament "Transl. Wassergrün" 00d4d488 (Alpha hinten) → #00D4D4', anyOf('Das Filament', 'Transl. Wassergrün') && anyOf('Das Filament', 'Transl. Wassergrün').hex === '#00D4D4', JSON.stringify(anyOf('Das Filament', 'Transl. Wassergrün')));
check('Hex: Sunlu "Clear" ffffffaa (Alpha hinten) → #FFFFFF', anyOf('Sunlu', 'Clear') && anyOf('Sunlu', 'Clear').hex === '#FFFFFF', JSON.stringify(anyOf('Sunlu', 'Clear')));
// Quelle: AURAPOL ASA "Graphite black" extruder_temp null, Bereich [255,265]; bed_temp null, Bereich [105,115]
const gb = anyOf('AURAPOL', 'Graphite black');
check('Temperatur: Mitte des Bereichs (Düse 260, Bett 110), wenn kein Einzelwert', gb && gb.nozzle === 260 && gb.bed === 110, JSON.stringify(gb));
check('Temperatur: Einzelwert gewinnt (3D-Fuel Almond 220/60 bleibt)', K.fdbColours(DB, '3D-Fuel', 'PLA+').find(c => c.name === 'Almond').nozzle === 220);

console.log(pass + '/' + (pass + fail) + ' bestanden');
process.exit(fail ? 1 : 0);
