'use strict';
/* Prüft "Eigenen Drucker verwenden" (js/orca-custom.js) gegen die echte OrcaSlicer-CLI: aus einer
   project_settings.config (wie sie beim Hochladen einer eigenen Orca-3MF vorliegt) ein Template bauen,
   3MF exportieren, headless slicen und die Werte im G-Code prüfen. Testdaten: die reale, bereits gegen
   Orca verifizierte Kobra-S1-Vorlage (ORCA_TEMPLATES) als Stand-in für ein "hochgeladenes" fremdes
   Profil – der customPrinterTemplate-Pfad kennt diesen Drucker nicht extra, muss ihn also rein aus den
   Rohwerten korrekt aufbauen. Aufruf: node tests/verify-custom-printer.js  (ORCA=<Pfad> optional) */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const fflate = require('../vendor/fflate.min.js');

const ROOT = path.join(__dirname, '..');
const ORCA = process.env.ORCA || 'C:\\Program Files\\OrcaSlicer\\orca-slicer.exe';
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-custom-printer-'));

const ctx = vm.createContext({ console, TextDecoder });
for (const f of ['util', 'data', 'stl', 'store', 'engine', 'orca-templates', 'orient', 'holes', 'orca-generic', 'orca-custom', 'colour-changes', 'export3mf'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const K = vm.runInContext('({compute, getMat, store, parseSTL, makeGeom, exportTemplate, build3mf, customPrinterTemplate, customPrinterEntry, ORCA_TEMPLATES})', ctx);

let pass = 0, fail = 0;
function check(ok, msg) { if (ok) { pass++; console.log('OK   ' + msg); } else { fail++; console.log('FEHLER ' + msg); } }

function boxTris(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  return [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]].map(t => t.map(i => v[i]));
}
function stl(name, tris) {
  const b = Buffer.alloc(84 + tris.length * 50); b.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => t.flat().forEach((c, j) => b.writeFloatLE(c, 84 + i * 50 + 12 + j * 4)));
  return K.parseSTL(name, b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}

// "Hochgeladene" project_settings.config: die reale, bereits verifizierte Kobra-S1-Vorlage – das
// Tool kennt diesen Drucker hier absichtlich NICHT über seinen eigenen Sonderpfad, nur generisch.
const uploadedSettings = K.ORCA_TEMPLATES.kobra_s1['0.4'].settings;
const entry = K.customPrinterEntry(uploadedSettings, 'Mein Testdrucker');
check(entry.orca.vendor === 'custom' && entry.orca.nozzle === '0.4', 'customPrinterEntry: vendor=custom, Düse 0,4 mm erkannt');
check(entry.orca.customTemplate.bedCenter[0] > 100 && entry.orca.customTemplate.bedCenter[1] > 100, 'Bettmitte aus printable_area berechnet: ' + JSON.stringify(entry.orca.customTemplate.bedCenter));
check(entry.orca.customTemplate.slots.length === 4, '4 Filament-Slots erkannt (wie in der Vorlage): ' + entry.orca.customTemplate.slots.length);

// PRINTERS.orca im Kontext selbst setzen (wie es custom-printer-ui.js im Browser täte)
vm.runInContext('PRINTERS.orca = customPrinterEntry(ORCA_TEMPLATES.kobra_s1["0.4"].settings, "Mein Testdrucker", "");', ctx);
check(K.exportTemplate('orca', '0.4').orcaVersion === '2.4.2', 'Ohne Versionsangabe greift der Fallback 2.4.2 (leere Version lässt die CLI abstürzen)');
const tpl = K.exportTemplate('orca', '0.4');
// Name aus der hochgeladenen Datei hat Vorrang vor dem Dateinamen-Fallback (realistisches Verhalten:
// die eigene Datei bringt ihren echten Druckernamen schon mit)
check(!!tpl && tpl.printerPreset === 'Anycubic Kobra S1 0.4 nozzle', 'exportTemplate("orca", "0.4") liefert das eigene Profil mit seinem echten Namen: ' + (tpl && tpl.printerPreset));
const noName = Object.assign({}, K.ORCA_TEMPLATES.kobra_s1['0.4'].settings); delete noName.printer_settings_id;
const fallbackTpl = K.customPrinterTemplate(noName, 'Mein Testdrucker');
check(fallbackTpl.printerPreset === 'Mein Testdrucker', 'Ohne printer_settings_id greift der Dateiname als Fallback: ' + fallbackTpl.printerPreset);

const geom = K.makeGeom('wuerfel.stl', Float32Array.from(boxTris(105, 105, 0, 125, 125, 20).flat(2)));
const inp = { printer: 'kobra_s1', material: 'pla_hs', nozD: '0.4', nozM: 'steel_hardened', object: 'general', goal: 'balanced', load: 'medium', support: 'auto', supportLevel: 'balanced', thresh: '45' };
const r = K.compute(inp, geom, { getMat: K.getMat, settings: K.store.settings });
const { bytes } = K.build3mf(tpl, r, geom, 0, fflate);
const dir = path.join(OUT, 'custom'); fs.mkdirSync(dir);
const file = path.join(dir, 'export.3mf'); fs.writeFileSync(file, bytes);
try {
  execFileSync(ORCA, ['--slice', '0', '--outputdir', dir, file], { stdio: 'pipe', timeout: 240000 });
  const gfile = fs.readdirSync(dir).find(f => f.endsWith('.gcode'));
  check(!!gfile, 'Orca-CLI hat erfolgreich gesliced');
  if (gfile) {
    const text = fs.readFileSync(path.join(dir, gfile), 'utf8');
    check(/; filament used \[mm\]/.test(text), 'G-Code enthält Filamentverbrauch (Slicing lief durch)');
    check(text.includes('215') || /M10[49] S21[0-9]/.test(text), 'Düsentemperatur (PLA HS, ~215 °C) im G-Code');
  }
} catch (e) { check(false, 'Orca-CLI fehlgeschlagen: ' + (e.stderr || e.message).toString().slice(0, 400)); }

console.log('\n' + pass + '/' + (pass + fail) + ' bestanden');
process.exit(fail ? 1 : 0);
