'use strict';
/* Objekt-Erkennung (js/object-detect.js), HueForge-Vorlage und Schichthöhen aus der Datei (engine.js).
   Sollwerte aus der Konstruktion der Testkörper (Maße, Volumen, Oberfläche von Hand gerechnet), nicht aus der Ausgabe
   des Codes. HueForge-Werte laut HueForge-Anleitung: erste Schicht 0,16 mm, Schichthöhe 0,08 mm, 100 % Füllung, Linien. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const fflate = require('../vendor/fflate.min.js');

const ROOT = path.join(__dirname, '..');
const ctx = vm.createContext({ console, TextDecoder });
for (const f of ['util', 'data', 'stl', 'orient', 'holes', 'store', 'engine', 'orca-templates', 'colour-changes', 'object-detect', 'export3mf'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const K = vm.runInContext('({makeGeom, analyze, compute, getMat, store, exportTemplate, build3mf, detectObject, fileLayerFor, OBJ})', ctx);

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) pass++; else { fail++; console.log('FEHLER: ' + name + (extra !== undefined ? ' → ' + extra : '')); } };

// Quader als Dreiecksliste; inverted = nach innen zeigend (für Hohlräume)
function box(x0, y0, z0, x1, y1, z1, inverted) {
  const v = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  return f.map(t => (inverted ? [t[0], t[2], t[1]] : t).map(i => v[i]));
}
const geom = (...boxes) => K.makeGeom('t', Float32Array.from(boxes.flat(3)));
const ch = n => Array.from({ length: n }, (_, i) => ({ topZ: 0.72 + i * 0.08, extruder: 1 + i % 4, color: '#FFFFFF' }));
const det = (g, info) => K.detectObject(g, info);

// 1. Farbwechsel nach Höhe
const plate = geom(box(0, 0, 0, 113, 170, 3));
// Schwelle: ab 5 Wechseln HueForge (Befund des Prüf-Agenten: 3 war zu niedrig)
check('Platte mit 4 Wechseln → Mehrfarbig/Gravur, mit 5 → HueForge', det(plate, { colourChanges: ch(4) }).key === 'multicolor' && det(plate, { colourChanges: ch(5) }).key === 'hueforge');
check('Platte 113 × 170 × 3 mit 7 Wechseln → HueForge', det(plate, { colourChanges: ch(7) }).key === 'hueforge' && det(plate, { colourChanges: ch(7) }).n === 7);
check('Platte mit nur 2 Wechseln → Mehrfarbig/Gravur', det(plate, { colourChanges: ch(2) }).key === 'multicolor');
check('Hoher Körper 20 × 20 × 40 mit Wechseln → Mehrfarbig/Gravur', det(geom(box(0, 0, 0, 20, 20, 40)), { colourChanges: ch(7) }).key === 'multicolor');
check('Platte 40 × 40 × 6 (Seitenverhältnis 6,7 < 8) mit Wechseln → Mehrfarbig, nicht HueForge', det(geom(box(0, 0, 0, 40, 40, 6)), { colourChanges: ch(7) }).key === 'multicolor');
check('Platte 48 × 48 × 6 (Seitenverhältnis genau 8, 6 mm) → HueForge', det(geom(box(0, 0, 0, 48, 48, 6)), { colourChanges: ch(7) }).key === 'hueforge');
check('Platte 100 × 100 × 6,5 (dicker als 6 mm) → Mehrfarbig', det(geom(box(0, 0, 0, 100, 100, 6.5)), { colourChanges: ch(7) }).key === 'multicolor');
// 2. mehrere Slots
const cube = geom(box(0, 0, 0, 40, 40, 40));
check('Teile mit 2 Slots → Mehrfarbig/Gravur', det(cube, { slotCount: 2 }).key === 'multicolor' && det(cube, { slotCount: 2 }).n === 2);
check('Massiver Würfel 40 mm, ein Slot, keine Überhänge → kein Vorschlag (mittlere Dicke 2·64000/9600 = 13,3 mm)', det(cube, { slotCount: 1, analysis: K.analyze(cube, 45) }) === null);
// 3. Überhänge: Pilz (Stiel 10 × 10 × 30, Kopf 60 × 60 × 5): Überhangfläche ≈ 3600 − 100 = 3500 mm² von rund 9700 mm² Oberfläche
const mushroom = geom(box(25, 25, 0, 35, 35, 30), box(0, 0, 30, 60, 60, 35));
const am = K.analyze(mushroom, 45), dm = det(mushroom, { analysis: am });
check('Pilz: Überhangfläche ≈ 3500 mm², Anteil über 10 %, Stufe "needed"', am.level === 'needed' && am.ratio > 0.10 && Math.abs(am.flagged - 3500) < 60, JSON.stringify({ lvl: am.level, ratio: am.ratio, fl: am.flagged }));
check('Pilz → Freiform / Überhänge', dm && dm.key === 'overhang' && dm.th === 45 && dm.ratio > 0.10, JSON.stringify(dm));
const few = { level: 'needed', ratio: 0.08, th: 45 };
check('Überhänge unter 10 % der Oberfläche (8 %) → kein Vorschlag', det(cube, { analysis: few }) === null);
// 4. dünne Wand: Hohlquader 40 mm außen, Wand 1,3 mm: V = 40³ − 37,4³ = 11687, A = 6·40² + 6·37,4² = 17993 → 2V/A = 1,30 mm
const shell = geom(box(0, 0, 0, 40, 40, 40), box(1.3, 1.3, 1.3, 38.7, 38.7, 38.7, true));
const ds = det(shell, { analysis: K.analyze(shell, 45) });
check('Hohlquader mit 1,3 mm Wand → Dünnwandiges Gehäuse, mittlere Dicke ≈ 1,30 mm', ds && ds.key === 'thin' && Math.abs(ds.mm - 1.30) < 0.02, JSON.stringify(ds));
const shell3 = geom(box(0, 0, 0, 40, 40, 40), box(3, 3, 3, 37, 37, 37, true));   // 3 mm Wand: V = 64000 − 39304 = 24696, A = 9600 + 6936 → 2V/A = 2,98 mm
check('Hohlquader mit 3 mm Wand → kein Vorschlag (2,98 mm > 2,2)', det(shell3, {}) === null);
check('Kleine dünne Teile (Oberfläche unter 1500 mm²) → kein Vorschlag', det(geom(box(0, 0, 0, 10, 10, 8), box(1, 1, 1, 9, 9, 7, true)), {}) === null);
// Befund des Prüf-Agenten: Vollstäbe und hochkant stehende Klingen sind keine Gehäuse (2V/A ≈ Radius bzw. halbe Dicke, aber nicht hohl)
const rod = geom(box(0, 0, 0, 4, 4, 110));   // A = 2·16 + 4·440 = 1792 mm², V = 1760 → 2V/A = 1,96 mm, Füllung 1,0
check('Vollstab 4 × 4 × 110 (2V/A = 1,96 mm, Füllung 1,0) → kein Vorschlag', det(rod, {}) === null);
const blade = geom(box(0, 0, 0, 100, 2, 50));   // A = 10600, V = 10000 → 2V/A = 1,89 mm, Füllung 1,0
check('Hochkant stehende Klinge 100 × 2 × 50 → kein Vorschlag', det(blade, {}) === null);
check('Hohlquader 40 mm mit 2,2 mm Wand (Füllung 0,29) → Dünnwandiges Gehäuse', (() => { const s = geom(box(0, 0, 0, 40, 40, 40), box(2.2, 2.2, 2.2, 37.8, 37.8, 37.8, true)); const d = det(s, {}); return d && d.key === 'thin'; })());
check('Flache dünne Platte ohne Wechsel → kein Vorschlag (Höhe ≤ 6 mm zählt nicht als Gehäuse)', det(geom(box(0, 0, 0, 100, 100, 2)), {}) === null);
// Reihenfolge und Randfälle
check('Wechsel vor Überhang: Pilz mit Wechseln → Mehrfarbig', det(mushroom, { analysis: am, colourChanges: ch(5) }).key === 'multicolor');
check('Ohne Geometrie oder ohne Info → null, keine Ausnahme', det(null, {}) === null && det(cube) === null);

// HueForge-Vorlage in der Engine: Plattengeometrie 113 × 170 × 3
const base = { printer: 'snapmaker_u1', nozD: '0.4', nozM: 'steel_hardened', material: 'pla_hs', object: 'hueforge', goal: 'balanced', load: 'medium', support: 'auto', supportLevel: 'balanced', thresh: '45' };
const rh = K.compute(base, plate, { getMat: K.getMat, settings: K.store.settings });
check('HueForge: Schichthöhe 0,08, erste Schicht 0,16, Füllung 100 %, Muster Linien', rh.layer === 0.08 && rh.firstLayer === 0.16 && rh.inf === 100 && rh.pattern === 'Linien', JSON.stringify({ l: rh.layer, f: rh.firstLayer, i: rh.inf, p: rh.pattern }));
check('HueForge: obere/untere Schichten für 0,08 mm (mindestens 10 / 8)', rh.t >= 10 && rh.b >= 8, rh.t + '/' + rh.b);
const rq = K.compute({ ...base, object: 'multicolor' }, plate, { getMat: K.getMat, settings: K.store.settings });
check('Zum Vergleich: Mehrfarbig/Gravur ohne Datei bleibt bei den Werten des Tools (Platte < 4 mm: 0,16, erste Schicht 0,20)', rq.layer === 0.16 && rq.firstLayer === 0.2 && rq.inf === 20, JSON.stringify({ l: rq.layer, f: rq.firstLayer, i: rq.inf }));
const tpl = K.exportTemplate('snapmaker_u1', '0.4'), z = fflate.unzipSync(K.build3mf(tpl, rh, [{ geom: plate, slot: null, r: rh, part: {} }], 0, fflate, null).bytes);
const ps = JSON.parse(fflate.strFromU8(z['Metadata/project_settings.config']));
check('Export HueForge: Muster rectilinear, Dichte 100 %, Schichthöhe 0.08, erste Schicht 0.16', ps.sparse_infill_pattern === 'rectilinear' && ps.sparse_infill_density === '100%' && ps.layer_height === '0.08' && ps.initial_layer_print_height === '0.16', JSON.stringify([ps.sparse_infill_pattern, ps.sparse_infill_density, ps.layer_height, ps.initial_layer_print_height]));

// Schichthöhen der Datei im Datenblatt (Befund des Nutzers: Datenblatt zeigte 0,16 / 0,20, der Export 0,08 / 0,16)
check('fileLayerFor: Höhen der Datei, nur mit Farbwechseln', JSON.stringify(K.fileLayerFor({ layer_height: '0.08', initial_layer_print_height: '0.16' }, ch(3))) === '{"layer":0.08,"first":0.16}' && K.fileLayerFor({ layer_height: '0.08', initial_layer_print_height: '0.16' }, []) === null && K.fileLayerFor({}, ch(3)) === null && K.fileLayerFor(null, ch(3)) === null);
const rf = K.compute({ ...base, object: 'multicolor', fileLayer: { layer: 0.08, first: 0.16 } }, plate, { getMat: K.getMat, settings: K.store.settings });
check('Datenblatt mit Dateihöhen: 0,08 / 0,16, obere/untere Schichten 10 / 8', rf.layer === 0.08 && rf.firstLayer === 0.16 && rf.t === 10 && rf.b === 8, JSON.stringify({ l: rf.layer, f: rf.firstLayer, t: rf.t, b: rf.b }));
check('Datenblatt: Hinweis "Schichthöhen aus der Datei" vorhanden, ohne Dateihöhen nicht', rf.warn.some(w => /Schichthöhen aus der Datei/.test(w)) && !rq.warn.some(w => /Schichthöhen aus der Datei/.test(w)));
const rf2 = K.compute({ ...base, object: 'multicolor', fileLayer: { layer: 0.08, first: 0 } }, plate, { getMat: K.getMat, settings: K.store.settings });
const rowOf = (r, label) => { const row = r.rows.find(x => x[0] === label); return row ? row[1] : null; };
check('Datenblatt-Zeile "Schichthöhe / erste Schicht" zeigt die Dateihöhen (0,08 / 0,16 mm), nicht die Düsenwerte (0,20)', rowOf(rf, 'Schichthöhe / erste Schicht') === '0,08 / 0,16 mm' && rowOf(rq, 'Schichthöhe / erste Schicht') === '0,16 / 0,20 mm' && rowOf(rh, 'Schichthöhe / erste Schicht') === '0,08 / 0,16 mm', [rowOf(rf, 'Schichthöhe / erste Schicht'), rowOf(rq, 'Schichthöhe / erste Schicht'), rowOf(rh, 'Schichthöhe / erste Schicht')].join(' | '));
check('Unvollständige Dateihöhen (erste Schicht 0) werden ignoriert', rf2.layer === 0.16 && rf2.firstLayer === 0.2);

console.log(pass + '/' + (pass + fail) + ' bestanden');
process.exit(fail ? 1 : 0);
