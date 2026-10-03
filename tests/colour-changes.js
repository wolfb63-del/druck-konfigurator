'use strict';
/* Farbwechsel nach Höhe in übernommenen 3MF (js/colour-changes.js, Einhängestelle in build3mfFromProject).
   Vorbild: BUHO_Front_113x170_S_CP.3mf (Bambu A1 mini, mehrfarbige Gravur, 0,16 mm erste Schicht, 0,08 mm Schichten,
   sieben Wechsel). Die Sollwerte stammen aus dieser Datei bzw. aus der Konstruktion der Testdatei, nicht aus der
   Ausgabe des Codes. Mit BUHO3MF=<Pfad zur Originaldatei> läuft zusätzlich der Test mit der echten Datei. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const fflate = require('../vendor/fflate.min.js');

const ROOT = path.join(__dirname, '..');
const ctx = vm.createContext({ console, TextDecoder });
for (const f of ['util', 'data', 'stl', 'orient', 'holes', 'store', 'engine', 'orca-templates', 'colour-changes', 'export3mf', 'import'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const K = vm.runInContext('({importModels, makeGeom, compute, getMat, store, exportTemplate, build3mfFromProject, parseColourChanges, colourChangesOffGrid})', ctx);

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) pass++; else { fail++; console.log('FEHLER: ' + name + (extra !== undefined ? ' → ' + extra : '')); } };
const u8 = s => fflate.strToU8(s);

// Wechsel wie in BUHO_Front_113x170_S_CP.3mf (Original): Extruder 1 schwarz, 2 weiß, 3 rot, 4 gelb
const XML = '<?xml version="1.0" encoding="utf-8"?>\n<custom_gcodes_per_layer>\n<plate>\n<plate_info id="1"/>\n' +
  [[0.72000002861022949, 2, '#FFFFFF'], [0.80000001192092896, 1, '#161616'], [0.87999999523162842, 2, '#FFFFFF'], [1.2000000476837158, 1, '#161616'],
    [1.3600000143051147, 3, '#FF0000'], [1.5199999809265137, 4, '#FFFF00'], [1.9199999570846558, 1, '#161616']]
    .map(([z, e, c]) => '<layer top_z="' + z + '" type="2" extruder="' + e + '" color="' + c + '" extra="" gcode="tool_change"/>\n').join('') +
  '<mode value="MultiAsSingle"/>\n</plate>\n</custom_gcodes_per_layer>';

// parseColourChanges
const cc = K.parseColourChanges(XML);
check('Parser: sieben Wechsel', cc.length === 7, cc.length);
check('Parser: Höhen 0,72 / 0,8 / 0,88 / 1,2 / 1,36 / 1,52 / 1,92', cc.map(c => Math.round(c.topZ * 100) / 100).join() === '0.72,0.8,0.88,1.2,1.36,1.52,1.92', cc.map(c => c.topZ).join());
check('Parser: Extruder 2,1,2,1,3,4,1 und Farben', cc.map(c => c.extruder).join() === '2,1,2,1,3,4,1' && cc[4].color === '#FF0000' && cc[0].color === '#FFFFFF');
check('Parser: Pause (type 1), Extruder 0 und kaputte Höhe werden ignoriert, leere Eingabe → []',
  K.parseColourChanges('<layer top_z="1" type="1" extruder="1" color="#000000"/><layer top_z="2" type="2" extruder="0" color="#000000"/><layer top_z="x" type="2" extruder="1"/>').length === 0 &&
  K.parseColourChanges('').length === 0 && K.parseColourChanges(null).length === 0);
check('Parser: Farbe fehlt oder ungültig → leer', K.parseColourChanges('<layer top_z="1" type="2" extruder="2" color="rot"/>')[0].color === '');

// Raster der Schichtgrenzen: erste 0,16 + n × 0,08 → alle sieben liegen darauf (0,72 = 0,16 + 7 × 0,08 …)
check('Raster 0,16 + n × 0,08: alle Wechsel liegen auf Schichtgrenzen', K.colourChangesOffGrid(cc, '0.16', '0.08').length === 0);
// 0,2 + n × 0,16: (0,72−0,2)/0,16 = 3,25 … 1,92 → 10,75: keiner trifft
check('Raster 0,2 + n × 0,16 (die Werte des Tools): alle sieben daneben', K.colourChangesOffGrid(cc, '0.2', '0.16').length === 7, K.colourChangesOffGrid(cc, '0.2', '0.16').length);
check('Raster: ungültige Höhen → keine Meldung', K.colourChangesOffGrid(cc, '', '0.08').length === 0);

// Ende zu Ende: Projekt mit einem Objekt (Extruder 1), Wechsel auf 1–4, Original 0,16 / 0,08
function cubeXml(id, s) {
  const b = [[0,0,0],[s,0,0],[s,s,0],[0,s,0],[0,0,s],[s,0,s],[s,s,s],[0,s,s]];
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  return '<object id="' + id + '" type="model"><mesh><vertices>' + b.map(v => '<vertex x="' + v[0] + '" y="' + v[1] + '" z="' + v[2] + '"/>').join('') +
    '</vertices><triangles>' + f.map(t => '<triangle v1="' + t[0] + '" v2="' + t[1] + '" v3="' + t[2] + '"/>').join('') + '</triangles></mesh></object>';
}
function project(origSettings, xml) {
  const files = {
    '_rels/.rels': u8('<Relationships><Relationship Target="/3D/3dmodel.model" Id="rel-1"/></Relationships>'),
    '3D/3dmodel.model': u8('<?xml version="1.0"?><model unit="millimeter" xmlns:p="x"><resources>' + cubeXml(1, 20) + '</resources><build><item objectid="1"/></build></model>'),
    'Metadata/model_settings.config': u8('<?xml version="1.0"?><config><object id="1"><metadata key="name" value="graviert"/><metadata key="extruder" value="1"/><part id="1" subtype="normal_part"/></object><plate><metadata key="plater_id" value="1"/><model_instance><metadata key="object_id" value="1"/></model_instance></plate></config>'),
    'Metadata/project_settings.config': u8(JSON.stringify(origSettings)),
  };
  if (xml) files['Metadata/custom_gcode_per_layer.xml'] = u8(xml);
  return fflate.zipSync(files);
}
const ORIG = { layer_height: '0.08', initial_layer_print_height: '0.16', filament_colour: ['#161616', '#FFFFFF', '#FF0000', '#FFFF00'], printer_settings_id: 'Bambu Lab A1 mini 0.4 nozzle' };
function convert(zip, printer, slotChosen, mode, live) {
  const imp = K.importModels([{ name: 'g.3mf', bytes: zip }], fflate);
  const base = { printer, nozD: '0.4', nozM: 'steel_hardened', material: 'pla_hs', object: 'general', goal: 'balanced', load: 'medium', support: 'auto', supportLevel: 'balanced', thresh: '45' };
  const jobs = imp.parts.map(p => { const g = K.makeGeom(p.name, p.pos);
    return { geom: g, slot: mode === 'keep' && p.extruder ? p.extruder - 1 : null, part: { objectId: p.objectId, instance: p.instance, plate: p.plate }, r: K.compute(base, g, { getMat: K.getMat, settings: K.store.settings }) }; });
  const res = K.build3mfFromProject(K.exportTemplate(printer, '0.4'), jobs[0].r, jobs, slotChosen, fflate, live || null, imp.threemf);
  const z = fflate.unzipSync(res.bytes);
  return { imp, res, z, ps: JSON.parse(fflate.strFromU8(z['Metadata/project_settings.config'])), ms: fflate.strFromU8(z['Metadata/model_settings.config']) };
}

const withCc = project(ORIG, XML);
const o = convert(withCc, 'snapmaker_u1', 2, 'keep');
check('Import: threemf.colourChanges mit sieben Wechseln', o.imp.threemf.colourChanges.length === 7, o.imp.threemf.colourChanges.length);
check('Befund 1: Schichthöhe der Datei bleibt (0,08), erste Schicht 0,16 – nicht die 0,16/0,2 des Tools', o.ps.layer_height === '0.08' && o.ps.initial_layer_print_height === '0.16', o.ps.layer_height + ' / ' + o.ps.initial_layer_print_height);
check('Befund 2: Farbwechsel-Datei unverändert übernommen (Bytes gleich)', Buffer.compare(Buffer.from(o.z['Metadata/custom_gcode_per_layer.xml']), Buffer.from(u8(XML))) === 0);
check('Befund 2: Slots 1–4 tragen die Farben der Wechsel (schwarz, weiß, rot, gelb)', JSON.stringify(o.ps.filament_colour) === JSON.stringify(['#161616', '#FFFFFF', '#FF0000', '#FFFF00']), JSON.stringify(o.ps.filament_colour));
check('Befund 2: Objekt bleibt auf Extruder 1 (Slot der Datei), nicht auf dem gewählten Slot 3', /<object id="1">[\s\S]*?key="extruder" value="1"/.test(o.ms) && !/key="extruder" value="3"/.test(o.ms), o.ms.slice(0, 300));
check('Dialogliste: Schichthöhe/erste Schicht mit Hinweis "aus der Datei"', o.res.changes.some(c => c.key === 'layer_height' && c.after === '0.08' && /aus der Datei/.test(c.label)) && o.res.changes.filter(c => c.key === 'layer_height').length === 1);
check('Keine Meldung zu Schichtgrenzen, wenn alles passt', !o.res.notes.some(n => /Schichtgrenzen/.test(n)), o.res.notes.join(' | '));

// Belegung vom Drucker/von Hand vorhanden: Farben der Slots nicht überschreiben
const live = [{ type: 'PLA', colour: '#111111' }, { type: 'PLA', colour: '#222222' }, { type: 'PETG', colour: '#333333' }, { type: 'PETG', colour: '#444444' }];
const ol = convert(withCc, 'snapmaker_u1', 2, 'keep', live);
check('Mit Belegung: Slotfarben der Belegung, Schichthöhe trotzdem aus der Datei', JSON.stringify(ol.ps.filament_colour) === JSON.stringify(['#111111', '#222222', '#333333', '#444444']) && ol.ps.layer_height === '0.08', JSON.stringify(ol.ps.filament_colour));

// Wechsel nicht auf der Schichtgrenze (Datei mit 0,2 / 0,16): Hinweis
const odd = convert(project({ ...ORIG, layer_height: '0.16', initial_layer_print_height: '0.2' }, XML), 'snapmaker_u1', 2, 'keep');
check('Wechsel neben dem Raster → Hinweis mit den Höhen', odd.res.notes.some(n => /Schichtgrenzen/.test(n) && /0\.72/.test(n)), odd.res.notes.join(' | '));
// Datei ohne Schichthöhen in den Einstellungen
const noLh = convert(project({ filament_colour: ORIG.filament_colour }, XML), 'snapmaker_u1', 2, 'keep');
check('Ohne Schichthöhen in der Datei → Hinweis, Wert des Tools bleibt', noLh.res.notes.some(n => /nennt ihre Schichthöhen nicht/.test(n)) && noLh.ps.layer_height !== undefined);
// Drucker mit weniger Slots als Extruder in den Wechseln (Kobra S1 hat 4; Test mit Wechsel auf Extruder 6)
const six = convert(project(ORIG, XML.replace('extruder="4"', 'extruder="6"')), 'kobra_s1', 0, 'keep');
check('Extruder 6 in den Wechseln, Drucker mit 4 Slots → Hinweis', six.res.notes.some(n => /Extruder 6/.test(n)), six.res.notes.join(' | '));

// Datei ohne Wechsel: unverändertes Verhalten (Schichthöhe vom Tool, keine Wechsel-Hinweise)
const plain = convert(project(ORIG, null), 'snapmaker_u1', 2, 'all');
check('Ohne Farbwechsel: keine colourChanges, Schichthöhe vom Tool', plain.imp.threemf.colourChanges.length === 0 && plain.ps.layer_height !== '0.08' && !plain.res.changes.some(c => /aus der Datei/.test(c.label)), plain.ps.layer_height);

// Prüfbefund 1: Schalenschichten für die Schichthöhe der Datei. Das Tool rechnet r.t/r.b für seine Schichthöhe r.layer;
// bei 0,08 mm braucht dieselbe Dicke entsprechend mehr Schichten.
const imp0 = K.importModels([{ name: 'g.3mf', bytes: withCc }], fflate);
const r0 = K.compute({ printer: 'snapmaker_u1', nozD: '0.4', nozM: 'steel_hardened', material: 'pla_hs', object: 'general', goal: 'balanced', load: 'medium', support: 'auto', supportLevel: 'balanced', thresh: '45' }, K.makeGeom('x', imp0.parts[0].pos), { getMat: K.getMat, settings: K.store.settings });
const wantT = Math.ceil(r0.t * r0.layer / 0.08 - 1e-9), wantB = Math.ceil(r0.b * r0.layer / 0.08 - 1e-9);
check('Befund 1: obere/untere Schichten bei 0,08 mm = Dicke des Tools / 0,08 (nicht die Zahl für ' + r0.layer + ' mm)',
  o.ps.top_shell_layers === String(wantT) && o.ps.bottom_shell_layers === String(wantB) && wantT >= r0.t && wantB >= r0.b, o.ps.top_shell_layers + '/' + o.ps.bottom_shell_layers + ' erwartet ' + wantT + '/' + wantB + ' (Tool ' + r0.t + '/' + r0.b + ' bei ' + r0.layer + ')');
check('Befund 1: Dicke oben/unten bleibt gleich (Schichten × 0,08 ≥ Tool-Dicke, höchstens eine Schicht mehr)', wantT * 0.08 >= r0.t * r0.layer - 1e-9 && (wantT - 1) * 0.08 < r0.t * r0.layer - 1e-9);
check('Befund 1: Objekt-Überschreibung setzt die Schalenschichten nicht auf den alten Wert zurück', !(new RegExp('key="top_shell_layers" value="' + r0.t + '"').test(o.ms) && String(r0.t) !== o.ps.top_shell_layers), o.ms.slice(0, 400));
check('shellLayersFor ohne gültige Höhe → unverändert', (() => { const s = vm.runInContext('shellLayersFor', ctx)({ t: 5, b: 4, layer: 0.2 }, 0); return s.t === 5 && s.b === 4; })());

// Prüfbefund 2: filament_colour muss in different_settings_to_system (Gruppe 1 + Slot), sonst setzt Orca sie beim Öffnen zurück
check('Befund 2: filament_colour in den Abweichungen von Slot 1–4 (Gruppen 2–5)', [1, 2, 3, 4].every(g => o.ps.different_settings_to_system[g].split(';').includes('filament_colour')), JSON.stringify(o.ps.different_settings_to_system.map(s => s.length)));
check('Befund 2: mit Belegung vom Drucker wird filament_colour nicht zusätzlich eingetragen (Live-Pfad macht es selbst)', ol.ps.different_settings_to_system.length === o.ps.different_settings_to_system.length);

// Prüfbefund 4: mehrere Platten – Farbe nur setzen, wenn alle Wechsel des Extruders dieselbe Farbe haben
const XML2 = '<custom_gcodes_per_layer><plate><plate_info id="1"/><layer top_z="0.72" type="2" extruder="2" color="#FFFFFF" extra="" gcode="tool_change"/><layer top_z="0.8" type="2" extruder="3" color="#FF0000" extra="" gcode="tool_change"/></plate>' +
  '<plate><plate_info id="2"/><layer top_z="0.72" type="2" extruder="2" color="#0000FF" extra="" gcode="tool_change"/><layer top_z="0.8" type="2" extruder="3" color="#FF0000" extra="" gcode="tool_change"/></plate></custom_gcodes_per_layer>';
const p2 = K.parseColourChanges(XML2);
check('Mehrere Platten: Parser trägt die Platte mit (1,1,2,2)', p2.map(c => c.plate).join() === '1,1,2,2', p2.map(c => c.plate).join());
const two = convert(project(ORIG, XML2), 'snapmaker_u1', 2, 'keep');
check('Mehrere Platten: Extruder 2 mit widersprüchlichen Farben → Vorlagenfarbe bleibt, Extruder 3 (beide rot) → #FF0000',
  two.ps.filament_colour[1] !== '#FFFFFF' && two.ps.filament_colour[1] !== '#0000FF' && two.ps.filament_colour[2] === '#FF0000', JSON.stringify(two.ps.filament_colour));

// Prüfbefund 3: Teil ohne Extruder in der Datei → Hinweis
const noExt = convert(project(ORIG, XML).length ? fflate.zipSync({ ...fflate.unzipSync(withCc), 'Metadata/model_settings.config': u8(fflate.strFromU8(fflate.unzipSync(withCc)['Metadata/model_settings.config']).replace('<metadata key="extruder" value="1"/>', '')) }) : null, 'snapmaker_u1', 2, 'keep');
check('Befund 3: Teil ohne Extruder → Hinweis zur Zuordnung', noExt.res.notes.some(n => /ohne Extruder in der Datei/.test(n)), noExt.res.notes.join(' | '));
check('Befund 3: mit Extruder in der Datei kein solcher Hinweis', !o.res.notes.some(n => /ohne Extruder in der Datei/.test(n)));

// Echte Datei (optional)
if (process.env.BUHO3MF && fs.existsSync(process.env.BUHO3MF)) {
  const real = convert(new Uint8Array(fs.readFileSync(process.env.BUHO3MF)), 'snapmaker_u1', 2, 'keep');
  check('BUHO-Original: sieben Wechsel, Höhen 0,16/0,08 bleiben', real.imp.threemf.colourChanges.length === 7 && real.ps.layer_height === '0.08' && real.ps.initial_layer_print_height === '0.16', real.ps.layer_height);
  check('BUHO-Original: Slots schwarz/weiß/rot/gelb, Objekt auf Extruder 1', JSON.stringify(real.ps.filament_colour) === JSON.stringify(['#161616', '#FFFFFF', '#FF0000', '#FFFF00']) && /key="extruder" value="1"/.test(real.ms));
} else console.log('übersprungen: BUHO-Original (BUHO3MF=<Pfad zu BUHO_Front_113x170_S_CP.3mf> setzen)');

console.log(pass + '/' + (pass + fail) + ' bestanden');
process.exit(fail ? 1 : 0);
