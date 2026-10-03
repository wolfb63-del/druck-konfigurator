'use strict';
/* Prüft den 3MF-Export für beliebige Orca-Drucker gegen die echte OrcaSlicer-CLI – mit den echten Profilnamen,
   also genau der Datei, die Nutzer bekommen. (Ein anfänglicher Fehler „CLI lehnt fremde Drucker ab“ lag an
   print_compatible_printers aus der S1-Vorlage, behoben 2026-09-27.)
   Aufruf: node tests/verify-orca-printers.js   (PRINTERS="Hersteller|Teil des Namens;…" optional) */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const fflate = require('../vendor/fflate.min.js');
const first = v => (Array.isArray(v) ? v[0] : v);

const ROOT = path.join(__dirname, '..');
const ORCA = process.env.ORCA || 'C:\\Program Files\\OrcaSlicer\\orca-slicer.exe';
const RES = process.env.ORCA_PROFILES || 'C:/Program Files/OrcaSlicer/resources/profiles';
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'verifyorca-'));

const ctx = vm.createContext({ console, TextDecoder });
for (const f of ['util', 'data', 'stl', 'store', 'engine', 'orca-templates', 'orient', 'holes', 'colour-changes', 'export3mf', 'orca-printers/index', 'orca-generic'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const K = vm.runInContext('({compute,getMat,store,makeGeom,build3mf,orcaGenericTemplate,orcaPrinterEntry,exportTemplate,ORCA_PRINTER_INDEX,PRINTERS})', ctx);

// Stichprobe quer durch Bauarten: Bettschubser, CoreXY, Bambu, Prusa, IDEX, eigene Klipper-Vorlage
const SAMPLE = (process.env.PRINTERS || [
  'Creality|Ender-3 V3 SE 0.4', 'Creality|K1C 0.4', 'Prusa|MK4 0.4', 'Prusa|MINI 0.4', 'BBL|X1 Carbon 0.4', 'BBL|A1 mini 0.4',
  'Voron|2.4 350 0.4', 'Elegoo|Neptune 4 Pro 0.4', 'Sovol|SV06 0.4', 'Qidi|Q1 Pro 0.4', 'Flashforge|Adventurer 5M 0.4', 'Custom|MyKlipper 0.4'
].join(';')).split(';').map(s => s.split('|'));

let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FEHL ') + msg); if (!ok) failures++; };

function boxTris(x0, y0, z0, x1, y1, z1) {
  const v = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  return [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].map(t => t.map(i => v[i]));
}
const geom = K.makeGeom('wuerfel.stl', Float32Array.from(boxTris(0, 0, 0, 20, 20, 20).flat(2)));

for (const [vendor, frag] of SAMPLE) {
  const vi = K.ORCA_PRINTER_INDEX.vendors[vendor];
  const name = vi && Object.keys(vi.printers).find(n => n.includes(frag));
  if (!name) { check(false, `${vendor} „${frag}“ nicht in den Profilen`); continue; }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'orca-printers', vi.file), 'utf8'), ctx);
  const entry = K.orcaPrinterEntry(vendor, name);
  vm.runInContext('PRINTERS.orca=' + JSON.stringify(entry), ctx);
  // Düse wie im Tool: beim Wählen des Druckers wird dessen Düse eingestellt (printer-picker.js) – fest 0,4 mm
  // würde z. B. einem 0,2-mm-Drucker 0,45 mm Linienbreite geben (bis 2026-09-29 so, daher die Ausfälle feiner Düsen)
  const nozD = String(Number(entry.orca.nozzle));
  const inp = { printer: 'orca', material: 'petg', nozD, nozM: 'brass', object: 'general', goal: 'balanced', load: 'medium', support: 'auto', supportLevel: 'balanced', thresh: '45' };
  const r = K.compute(inp, geom, { getMat: K.getMat, settings: K.store.settings });
  const tpl = K.orcaGenericTemplate(vendor, name);
  console.log(`\n${name} (${tpl.settings.filament_settings_id.length} Slot${tpl.settings.filament_settings_id.length > 1 ? 's' : ''}, Bett ${tpl.bed.join(' × ')})`);
  const { bytes } = K.build3mf(tpl, r, [{ geom, r }], 0, fflate);
  const dir = fs.mkdtempSync(path.join(OUT, 'p-')), file = path.join(dir, 'export.3mf');
  fs.writeFileSync(file, bytes);
  // Profilnamen in der Datei prüfen (die CLI bekommt die Datei unverändert)
  const z =fflate.unzipSync(bytes), ps = JSON.parse(fflate.strFromU8(z['Metadata/project_settings.config']));
  check(ps.printer_settings_id === name && ps.print_settings_id === tpl.settings.print_settings_id, `Profilnamen in der Datei: ${ps.printer_settings_id} · ${ps.print_settings_id} · ${ps.filament_settings_id.join(', ')}`);
  check(ps.filament_settings_id.every(Boolean), 'jeder Slot hat ein Filamentprofil');
  try { execFileSync(ORCA, ['--slice', '0', '--outputdir', dir, file], { stdio: 'pipe', timeout: 240000 }); }
  catch (e) { check(false, 'Orca-CLI fehlgeschlagen: ' + String(e.stdout || e.message).split(/\r?\n/).filter(Boolean).slice(-2).join(' | ')); continue; }
  const gfile = fs.readdirSync(dir).find(f => f.endsWith('.gcode'));
  if (!gfile) { check(false, 'kein G-Code'); continue; }
  const text = fs.readFileSync(path.join(dir, gfile), 'utf8');
  const cfg = {}; for (const m of text.matchAll(/^; ([a-z0-9_]+) = (.*)$/gm)) cfg[m[1]] = m[2].trim();
  let x = null, y = null, type = '', maxZ = 0; const bb = [1e9, 1e9, -1e9, -1e9], temps = [];
  for (const l of text.split('\n')) {
    if (l.startsWith(';TYPE:')) type = l.slice(6);
    if (l.startsWith('; FEATURE:')) type = l.slice(10).trim();   // Bambu kennzeichnet so
    // Klipper-Startmakros heißen je Hersteller anders (PRINT_START, start_print, PRINT_START_LHS …)
    if (/^\w*(print_start|start_print)\w*\b/i.test(l)) for (const t of l.matchAll(/\b(?:EXTRUDER_TEMP|T_EXTRUDER|HOTEND(?:_TEMP)?|NOZZLE(?:_TEMP)?|EXTRUDER)=(\d{3})\b/gi)) temps.push(+t[1]);
    // G9111 ist Anycubics eigenes Startmakro (Klipper) – auch bei Fremdprofilen mit demselben Format gültig
    const g9111 = /^G9111 .*?extruderTemp=(\d+)/.exec(l); if (g9111) temps.push(+g9111[1]);
    const t = /^M10[49] .*?S(\d+)/.exec(l); if (t && +t[1] > 0) temps.push(+t[1]);
    if (!/^G[01] /.test(l)) continue;
    const gx = /X(-?[\d.]+)/.exec(l), gy = /Y(-?[\d.]+)/.exec(l); if (gx) x = +gx[1]; if (gy) y = +gy[1];
    if (/ E\.?\d/.test(l) && /wall/i.test(type)) { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); }
  }
  // Düsenversatz aus dem Druckerprofil (z. B. Elegoo Neptune 4: -2,5 × -3,5) rechnet Orca in den G-Code ein
  const off = String(first(tpl.settings.extruder_offset) || '0x0').split('x').map(Number);
  const cx = tpl.bedCenter[0] - (off[0] || 0), cy = tpl.bedCenter[1] - (off[1] || 0), mx = (bb[0] + bb[2]) / 2, my = (bb[1] + bb[3]) / 2;
  check(Math.abs(mx - cx) < 1.5 && Math.abs(my - cy) < 1.5, `Teil mittig ${mx.toFixed(1)}/${my.toFixed(1)} ≈ Bettmitte ${cx}/${cy}` + (off[0] || off[1] ? ` (Düsenversatz ${off.join(' × ')})` : ''));
  if (entry.orca.fixedStartTemp) // Herstellerprofil heizt fest – dann muss das Datenblatt davor warnen
    check(r.danger.some(d => d.includes('heizt fest auf ' + entry.orca.fixedStartTemp)), `Profil heizt fest auf ${entry.orca.fixedStartTemp} °C – Warnung im Datenblatt`);
  else check(temps.includes(r.nozzle), `Düse ${r.nozzle} °C wird geheizt (${[...new Set(temps)].join('/') || 'kein M104/M109 – Start-Makro?'})`);
  const procOuter = Number(String(tpl.process.outer_wall_speed || '').split(',')[0]);
  check(Number(cfg.outer_wall_speed) === r.sp_outer && (!procOuter || r.sp_outer <= procOuter), `Außenwand ${cfg.outer_wall_speed} mm/s ≤ Orca-Profil ${procOuter || '–'}`);
  check(String(cfg.gcode_flavor || '') === String(tpl.settings.gcode_flavor || ''), `G-Code-Art ${cfg.gcode_flavor}`);
  const startLine = String(tpl.settings.machine_start_gcode || '').split(/\\n|\n/).map(l => l.trim()).find(l => l && !l.startsWith(';') && !/[{[]/.test(l));
  check(!startLine || text.includes(startLine), `Start-G-Code des Druckers im G-Code (${startLine ? startLine.slice(0, 40) : 'nur Platzhalter'})`);
  // G9111 ist bei diesem Drucker nur falsch, wenn er selbst gar keines vorsieht (sonst ist es sein eigenes Format)
  const usesG9111 = /G9111\b/.test(String(tpl.settings.machine_start_gcode || ''));
  check(usesG9111 || !text.includes('G9111'), 'kein fremdes S1-Startmakro (G9111) im G-Code');
}
console.log(failures ? `\nFEHLGESCHLAGEN: ${failures} Prüfungen` : '\nOK: alle Stichproben-Drucker slicen korrekt');
console.log('Arbeitsordner: ' + OUT);
process.exit(failures ? 1 : 0);
