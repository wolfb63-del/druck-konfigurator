'use strict';
/* Reinigungslinie (js/purge.js): Seite, Platzbedarf, G-Code. Sollwerte aus der Konstruktion (Würfel 20 mm in der
   Bettmitte des Kobra S1, Bett 0…250, Düse 0,4, Filament 1,75), nicht aus der Ausgabe des Codes. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = vm.createContext({ console, TextDecoder });
for (const f of ['util', 'data', 'stl', 'orient', 'holes', 'store', 'engine', 'orca-templates', 'export3mf', 'purge'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const K = vm.runInContext('({exportTemplate, purgeBoxes, planPurge, purgeGcode, withPurge, purgeMargin, makeGeom})', ctx);

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) pass++; else { fail++; console.log('FEHLER: ' + name + (extra !== undefined ? ' → ' + extra : '')); } };
const near = (a, b, t = 0.01) => Math.abs(a - b) <= t;

const v = [[0,0,0],[20,0,0],[20,20,0],[0,20,0],[0,0,10],[20,0,10],[20,20,10],[0,20,10]];
const tris = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].map(t => t.map(i => v[i]));
const cube = K.makeGeom('w', Float32Array.from(tris.flat(2)));
const tpl = K.exportTemplate('kobra_s1', '0.4'), before = JSON.stringify(tpl.settings);
const boxes = K.purgeBoxes(tpl, [{ geom: cube }], false);

check('Box: Würfel in der Bettmitte', boxes.length === 1 && near(boxes[0].x0, 115) && near(boxes[0].x1, 135) && near(boxes[0].y0, 115) && near(boxes[0].y1, 135), JSON.stringify(boxes));

const margin = K.purgeMargin(tpl, ['5–8 mm']);
check('Abstand: Brim 5 mm (Vorlage 5, Empfehlung 5), kein Skirt', near(margin, 5), margin);
check('Abstand: größerer Brim der Empfehlung gewinnt (8)', near(K.purgeMargin(tpl, ['8–10 mm']), 8));

const plan = K.planPurge(tpl, boxes, 'auto', margin);
// frei je Seite: 115 − 5 = 110 (Würfel mittig); Bedarf = 3 + 0,48 + 0,24 + 3 = 6,72
check('Plan: freier Platz 110 mm je Seite', ['front', 'back', 'left', 'right'].every(k => near(plan.free[k], 110)), JSON.stringify(plan.free));
check('Plan: Bedarf 6,72 mm, passt', near(plan.need, 6.72) && plan.ok, plan.need);
check('Plan: Auto bei Gleichstand → hinten', plan.side === 'back');

check('Auto: Objekt vorn-links → hinten', K.planPurge(tpl, [{ x0: 20, x1: 40, y0: 20, y1: 40 }], 'auto', 0).side === 'back');
check('Auto: Objekt hinten → vorne', K.planPurge(tpl, [{ x0: 100, x1: 150, y0: 200, y1: 245 }], 'auto', 0).side === 'front');
check('Auto: Objekt rechts → links', K.planPurge(tpl, [{ x0: 120, x1: 245, y0: 100, y1: 150 }], 'auto', 0).side === 'left');

// Zu wenig Platz: Objekt 4 mm vor dem hinteren Rand
const tight = K.planPurge(tpl, [{ x0: 100, x1: 150, y0: 100, y1: 246 }], 'back', 0);
check('Zu wenig Platz hinten → ok=false', !tight.ok && near(tight.free.back, 4), tight.free.back);
check('Brim zählt: Objekt 10 mm vom Rand, Brim 5 → 5 frei < 6,72', !K.planPurge(tpl, [{ x0: 100, x1: 150, y0: 100, y1: 240 }], 'back', 5).ok);
check('Gewählte Seite bleibt, auch wenn sie nicht passt', tight.side === 'back');

// G-Code hinten: Bahn 1 bei y = 247, Bahn 2 bei y = 246,52; x von 75 bis 175
const g = K.purgeGcode(tpl, plan);
check('G-Code: Startposition X75 Y247', /G1 X75 Y247 F6000/.test(g), g);
check('G-Code: Bahn hin bis X175 Y247', /G1 X175 Y247 E5\.18\d* F1200/.test(g), g);
// E je mm: ((0,48−0,3)·0,3 + π·0,15²) / (π·0,875²) = 0,124686 / 2,405282 = 0,051836 → 100 mm = 5,1836
const e = Number(/X175 Y247 E([\d.]+)/.exec(g)[1]);
check('Extrusion 100 mm = 5,184 mm Filament (unabhängig gerechnet)', near(e, 5.1836, 0.005), e);
check('G-Code: Bahn 2 bei Y246.52 zurück bis X75', /G1 X75 Y246\.52 E5\.18\d* F1200/.test(g), g);
check('Prüfbefund 2: kein Rückzug am Ende (Orca fährt nicht wieder vor)', !/E-/.test(g) && /G1 Z2 F600\n; --- Ende/.test(g), g);
check('G-Code: relative Extrusion M83, keine G92', /M83/.test(g) && !/G92/.test(g));
check('G-Code: Aufheizen vor der Linie', g.indexOf('M109') > -1 && g.indexOf('M109') < g.indexOf('E5.18'));

// Seiten: vorne y = 3 / 3,48, links x = 3 …
const front = K.purgeGcode(tpl, K.planPurge(tpl, boxes, 'front', 0)), left = K.purgeGcode(tpl, K.planPurge(tpl, boxes, 'left', 0)), right = K.purgeGcode(tpl, K.planPurge(tpl, boxes, 'right', 0));
check('vorne: Y3, zweite Bahn Y3.48', /G1 X75 Y3 F6000/.test(front) && /Y3\.48 E/.test(front), front);
check('links: X3, Bahn läuft in Y (Y75 → Y175)', /G1 X3 Y75 F6000/.test(left) && /G1 X3 Y175 E5\.18/.test(left), left);
check('rechts: X247, zweite Bahn X246.52', /G1 X247 Y75 F6000/.test(right) && /X246\.52 Y175 E/.test(right), right);

// Absolute Extrusion: laufende Summe, M82, G92 E0 am Anfang und Ende
const abs = { ...tpl, settings: { ...tpl.settings, use_relative_e_distances: '0' } };
const ga = K.purgeGcode(abs, K.planPurge(abs, boxes, 'back', 0));
const es = [...ga.matchAll(/ E(-?[\d.]+) F/g)].map(m => Number(m[1]));
check('absolut: M82, G92 E0 vorn und hinten', /M82/.test(ga) && (ga.match(/G92 E0/g) || []).length === 2, ga);
check('absolut: E steigt 5,18 → 5,23 → 10,41 (laufende Summe, kein Rückzug)', es.length === 3 && near(es[0], 5.1836, 0.005) && near(es[1], 5.2085, 0.01) && near(es[2], 10.39, 0.02), es.join(' '));

// Z-Offset fließt in die Z-Höhe der Linie
const zo = { ...tpl, settings: { ...tpl.settings, z_offset: '0.25' } };
check('z_offset 0,25 → Linie bei Z0.55', /G1 Z0\.55 F600/.test(K.purgeGcode(zo, K.planPurge(zo, boxes, 'back', 0))));

// Vorlage unverändert; Kopie trägt Start-Code + Linie und den Schlüssel in different_settings_to_system
const out = K.withPurge(tpl, plan);
check('withPurge: Vorlage unverändert', JSON.stringify(tpl.settings) === before);
check('withPurge: Start-G-Code der Vorlage bleibt vorn, Linie hängt hinten dran', out.settings.machine_start_gcode.startsWith(tpl.settings.machine_start_gcode.trim()) && /Reinigungslinie/.test(out.settings.machine_start_gcode.slice(tpl.settings.machine_start_gcode.length)));
const grp = out.settings.different_settings_to_system, last = grp[grp.length - 1].split(';');
check('withPurge: machine_start_gcode steht in der Drucker-Gruppe (letzte)', last.includes('machine_start_gcode') && grp.length === tpl.settings.filament_settings_id.length + 2, grp.length);
check('withPurge: ohne Plan → Vorlage selbst', K.withPurge(tpl, null) === tpl);
check('planPurge: ohne Teile / ohne Start-Code → null', K.planPurge(tpl, [], 'auto', 0) === null && K.planPurge({ settings: { ...tpl.settings, machine_start_gcode: 5 }, bedCenter: tpl.bedCenter }, boxes, 'auto', 0) === null);

// Snapmaker U1: Bett x 0,5…270,5, y 1…271, Linie liegt im Druckbereich
const u1 = K.exportTemplate('snapmaker_u1', '0.4'), pu = K.planPurge(u1, K.purgeBoxes(u1, [{ geom: cube }], false), 'front', 0);
check('U1: vorne bei Y4 (Bettrand y=1 + 3), X ab 85,5 (Mitte 135,5)', near(pu.lane[0], 4) && /G1 X85\.5 Y4 F6000/.test(K.purgeGcode(u1, pu)), K.purgeGcode(u1, pu));

// Prüfbefund 1: Prime-Tower (Mehrfarbdruck). Kobra S1: Turm x 165…200 (Breite 35, Brim 5 → 160…205), y ab 205,01 (−5) bis +60 (+5) = 200…270
const tw = K.planPurge(tpl, boxes, 'back', 0, true), tw0 = K.planPurge(tpl, boxes, 'back', 0, false);
check('Turm: hinten nicht mehr frei (Turm reicht bis y 270 > Bett 250)', !tw.ok && tw.free.back < 0 && near(tw.free.back, 250 - 270, 0.01), tw.free.back);
check('Turm: ohne Mehrfarbdruck unverändert 115 mm frei hinten', near(tw0.free.back, 115) && tw0.ok);
check('Turm: Auto weicht aus (nicht hinten)', K.planPurge(tpl, boxes, 'auto', 0, true).side !== 'back');
const u1T = K.exportTemplate('snapmaker_u1', '0.4'), bu = K.purgeBoxes(u1T, [{ geom: cube }], false);
check('Turm U1: Turm y ab 226,01 (−5) bis +60 → hinten über das Bett (271) hinaus', !K.planPurge(u1T, bu, 'back', 0, true).ok);
check('Turm: Vorlage ohne enable_prime_tower → Turm zählt nicht', near(K.planPurge({ ...tpl, settings: { ...tpl.settings, enable_prime_tower: '0' } }, boxes, 'back', 0, true).free.back, 115));

// Prüfbefund 3: Extrusionsmodus nicht gesetzt → keine Linie (M83/M82 wären geraten)
const noRel = { ...tpl, settings: { ...tpl.settings } }; delete noRel.settings.use_relative_e_distances;
check('Befund 3: ohne use_relative_e_distances → null', K.planPurge(noRel, boxes, 'back', 0) === null);

// Prüfbefund 4: Bett nicht rechteckig oder mit Sperrbereich → keine Linie; Platzhalter "0x0" ist kein Sperrbereich
const round = { ...tpl, settings: { ...tpl.settings, printable_area: ['100x0', '86.6x50', '50x86.6', '0x100', '-50x86.6', '-86.6x50'] } };
const slanted = { ...tpl, settings: { ...tpl.settings, printable_area: ['0x0', '250x0', '240x250', '0x250'] } };
const excl = { ...tpl, settings: { ...tpl.settings, bed_exclude_area: ['0x0', '30x0', '30x20', '0x20'] } };
const ph = { ...tpl, settings: { ...tpl.settings, bed_exclude_area: ['0x0'] } };
check('Befund 4: Sechseck-/Rundbett → null', K.planPurge(round, boxes, 'back', 0) === null);
check('Befund 4: schiefes Viereck → null', K.planPurge(slanted, boxes, 'back', 0) === null);
check('Befund 4: echter Sperrbereich → null', K.planPurge(excl, boxes, 'back', 0) === null);
check('Befund 4: Platzhalter "0x0" bleibt erlaubt', K.planPurge(ph, boxes, 'back', 0) !== null);

// Temperatur-Platzhalter wie in der Vorlage: Kobra first_layer_temperature[initial_tool], U1 nozzle_temperature_initial_layer[initial_extruder]
check('Temperatur Kobra: wie im Start-Code der Vorlage', /M109 S\{first_layer_temperature\[initial_tool\]\}/.test(g), g.split('\n')[3]);
check('Temperatur U1: wie im Start-Code der Vorlage', /M109 S\{nozzle_temperature_initial_layer\[initial_extruder\]\}/.test(K.purgeGcode(u1, pu)));
const plain = { ...tpl, settings: { ...tpl.settings, machine_start_gcode: 'G28' } };
check('Temperatur ohne Vorbild: aktueller Orca-Name', /M109 S\{nozzle_temperature_initial_layer\[initial_extruder\]\}/.test(K.purgeGcode(plain, K.planPurge(plain, boxes, 'back', 0))));

console.log(pass + '/' + (pass + fail) + ' bestanden');
process.exit(fail ? 1 : 0);
