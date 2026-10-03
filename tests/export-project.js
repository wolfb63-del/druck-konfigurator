'use strict';
/* Prüft build3mfFromProject ohne Orca: Plattenverschiebung je Instanz, Slot/Objektwerte in
   model_settings, Hinweis bei fehlenden Objekt-Einstellungen. Die Orca-Prüfung mit einer echten
   Makerworld-Datei macht tests/verify-3mf.js (MW3MF=<Pfad>). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const fflate = require('../vendor/fflate.min.js');

const ROOT = path.join(__dirname, '..');
const ctx = vm.createContext({ console, TextDecoder });
for (const f of ['util', 'data', 'stl', 'orient', 'holes', 'store', 'engine', 'orca-templates', 'export3mf', 'import'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const K = vm.runInContext('({importModels, makeGeom, compute, getMat, store, exportTemplate, build3mfFromProject, findHoles, HOLE_RING_MM, withZOffset, build3mf})', ctx);

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else { fail++; console.log('FEHLER ' + name + (detail !== undefined ? ': ' + detail : '')); } }

const u8 = s => fflate.strToU8(s);
function cubeXml(id, s) {
  const b = [[0,0,0],[s,0,0],[s,s,0],[0,s,0],[0,0,s],[s,0,s],[s,s,s],[0,s,s]];
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  return '<object id="' + id + '" type="model"><mesh><vertices>' + b.map(v => '<vertex x="' + v[0] + '" y="' + v[1] + '" z="' + v[2] + '"/>').join('') +
    '</vertices><triangles>' + f.map(t => '<triangle v1="' + t[0] + '" v2="' + t[1] + '" v3="' + t[2] + '"/>').join('') + '</triangles></mesh></object>';
}
function project(items, settingsXml) {
  return fflate.zipSync({
    '_rels/.rels': u8('<Relationships><Relationship Target="/3D/3dmodel.model" Id="rel-1"/></Relationships>'),
    '3D/3dmodel.model': u8('<?xml version="1.0"?><model unit="millimeter" xmlns:p="x"><resources>' + cubeXml(1, 20) + cubeXml(2, 10) + '</resources><build>' + items + '</build></model>'),
    'Metadata/model_settings.config': u8(settingsXml),
    'Metadata/plate_1.gcode': u8('; alt')
  });
}
function run(zip, printer = 'kobra_s1') {
  const imp = K.importModels([{ name: 'p.3mf', bytes: zip }], fflate);
  const base = { printer, nozD: '0.4', nozM: 'steel_hardened', material: 'pla_hs', object: 'general', goal: 'balanced', load: 'medium', support: 'auto', supportLevel: 'balanced', thresh: '45' };
  const jobs = imp.parts.map(p => { const g = K.makeGeom(p.name, p.pos);
    return { geom: g, slot: p.extruder ? p.extruder - 1 : null, part: { objectId: p.objectId, instance: p.instance, plate: p.plate }, r: K.compute(base, g, { getMat: K.getMat, settings: K.store.settings }) }; });
  const res = K.build3mfFromProject(K.exportTemplate(printer, '0.4'), jobs[0].r, jobs, jobs[0].slot ?? 0, fflate, null, imp.threemf);
  const z = fflate.unzipSync(res.bytes);
  return { imp, res, z, root: fflate.strFromU8(z['3D/3dmodel.model']), ms: fflate.strFromU8(z['Metadata/model_settings.config']) };
}

// 1) Zwei Objekte auf zwei Platten → je Platte auf die S1-Bettmitte (125/125, Platte 2 um 300 mm versetzt)
let t = run(project('<item objectid="1" transform="1 0 0 0 1 0 0 0 1 128 128 0"/><item objectid="2" transform="1 0 0 0 1 0 0 0 1 435.2 128 0"/>',
  '<?xml version="1.0"?><config><object id="1"><metadata key="name" value="Gross"/><metadata key="extruder" value="2"/><metadata key="enable_support" value="1"/><part id="1" subtype="normal_part"></part></object>' +
  '<object id="2"><metadata key="name" value="Klein"/><metadata key="extruder" value="1"/><part id="2" subtype="normal_part"></part></object>' +
  '<plate><metadata key="plater_id" value="1"/><model_instance><metadata key="object_id" value="1"/><metadata key="instance_id" value="0"/></model_instance></plate>' +
  '<plate><metadata key="plater_id" value="2"/><model_instance><metadata key="object_id" value="2"/><metadata key="instance_id" value="0"/></model_instance></plate></config>'));
const items = t.root.match(/<item[^>]*>/g);
check('Platte 1 mittig (Würfel 20: Ursprung 115/115)', /1 0 0 0 1 0 0 0 1 115 115 0/.test(items[0]), items[0]);
check('Platte 2 mittig (Würfel 10: Ursprung 420/120)', /1 0 0 0 1 0 0 0 1 420 120 0/.test(items[1]), items[1]);
check('Slot des Designers bleibt, Stützen-Vorgabe ersetzt', /<object id="1">[\s\S]*?key="extruder" value="2"/.test(t.ms) && !/key="enable_support" value="1"/.test(t.ms));
check('alter G-Code entfernt', !t.z['Metadata/plate_1.gcode']);

// 2) Befund der Prüfung: dasselbe Objekt als zwei Instanzen auf zwei Platten → jede Instanz ihre eigene Verschiebung
t = run(project('<item objectid="1" transform="1 0 0 0 1 0 0 0 1 100 100 0"/><item objectid="1" transform="1 0 0 0 1 0 0 0 1 400 100 0"/>',
  '<?xml version="1.0"?><config><object id="1"><metadata key="name" value="Schraube"/><metadata key="extruder" value="1"/><part id="1" subtype="normal_part"></part></object>' +
  '<plate><metadata key="plater_id" value="1"/><model_instance><metadata key="object_id" value="1"/><metadata key="instance_id" value="0"/></model_instance></plate>' +
  '<plate><metadata key="plater_id" value="2"/><model_instance><metadata key="object_id" value="1"/><metadata key="instance_id" value="1"/></model_instance></plate></config>'));
check('Instanzen: Platten erkannt', t.imp.parts.map(p => p.plate).join() === '1,2', t.imp.parts.map(p => p.plate).join());
const it2 = t.root.match(/<item[^>]*>/g);
check('Instanz 1 → Platte 1 mittig (115/115)', /1 0 0 0 1 0 0 0 1 115 115 0/.test(it2[0]), it2[0]);
check('Instanz 2 → Platte 2 mittig (415/115)', /1 0 0 0 1 0 0 0 1 415 115 0/.test(it2[1]), it2[1]);

// 3) Befund der Prüfung: Objekt fehlt in model_settings → Hinweis statt stillem Verlust
t = run(project('<item objectid="1" transform="1 0 0 0 1 0 0 0 1 128 128 0"/>', '<?xml version="1.0"?><config></config>'));
check('Fehlende Objekt-Einstellungen → Hinweis', t.res.notes.some(n => /keine Objekt-Einstellungen/.test(n)), t.res.notes.join('|'));

// 4) Lochverstärkung in einer übernommenen 3MF (2026-10-02). Prüfkörper: Platte 40×40×6 mit Loch Ø 5 in der
//    Mitte, als Komponente um x +5 verschoben → Loch im Objekt-System bei (5, 0). Sollwert des Modifikators
//    aus der Konstruktion: Zylinder um (5, 0), Radius 2,5 + Ring, z 0…6 – unabhängig von Drehung/Spiegelung des Items.
function plateMesh(id) {
  const n = 32, r = 2.5, h = 6, half = 20, vs = [], ts = [];
  const sq = a => { const c = Math.cos(a), s = Math.sin(a), k = half / Math.max(Math.abs(c), Math.abs(s)); return [k * c, k * s]; };
  const ci = a => [r * Math.cos(a), r * Math.sin(a)];
  const tri = (...p) => { const i = vs.length / 3; p.forEach(q => vs.push(...q)); ts.push([i, i + 1, i + 2]); };
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n, b = 2 * Math.PI * (i + 1) / n, [oa, ob, ia, ib] = [sq(a), sq(b), ci(a), ci(b)];
    tri([...ia, h], [...oa, h], [...ob, h]); tri([...ia, h], [...ob, h], [...ib, h]);
    tri([...ia, 0], [...ob, 0], [...oa, 0]); tri([...ia, 0], [...ib, 0], [...ob, 0]);
    tri([...oa, 0], [...ob, 0], [...ob, h]); tri([...oa, 0], [...ob, h], [...oa, h]);
    tri([...ia, 0], [...ib, h], [...ib, 0]); tri([...ia, 0], [...ia, h], [...ib, h]);
  }
  const v = []; for (let i = 0; i < vs.length; i += 3) v.push('<vertex x="' + vs[i] + '" y="' + vs[i + 1] + '" z="' + vs[i + 2] + '"/>');
  return '<object id="' + id + '" type="model"><mesh><vertices>' + v.join('') + '</vertices><triangles>' + ts.map(t => '<triangle v1="' + t[0] + '" v2="' + t[1] + '" v3="' + t[2] + '"/>').join('') + '</triangles></mesh></object>';
}
// o: settings (false = Objekt fehlt in model_settings), parts (Zahl der <part>-Einträge), root (Attribute des
// Hauptmodells), plate2 (zweite Instanz auf Platte 2), colour (zweites Teil mit anderem Slot → Teil wird einzeln geführt, partId; 'plate': zweites
// Teil ist ebenfalls eine Platte mit Loch Ø 5, um x −45 verschoben → Loch im Objekt-System bei (−45, 0))
function holeProject(items, o = {}) {
  const parts = o.parts ?? 1, colour = !!o.colour, twin = o.colour === 'plate';
  const comps = '<component p:path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 5 0 0"/>' +
    (colour ? '<component p:path="/3D/Objects/object_1.model" objectid="3" transform="1 0 0 0 1 0 0 0 1 ' + (twin ? '-45 0 0' : '-15 -15 6') + '"/>' : '');
  const partXml = id => '<part id="' + id + '" subtype="normal_part"><metadata key="extruder" value="' + (id === 3 ? 2 : 1) + '"/></part>';
  const settings = o.settings === false ? '' : '<object id="2"><metadata key="name" value="Platte"/><metadata key="extruder" value="1"/>' +
    (colour ? partXml(1) + partXml(3) : parts ? partXml(1) : '') + '</object>';
  return fflate.zipSync({
    '_rels/.rels': u8('<Relationships><Relationship Target="/3D/3dmodel.model" Id="rel-1"/></Relationships>'),
    '3D/3dmodel.model': u8('<?xml version="1.0"?><model ' + (o.root || 'unit="millimeter" xmlns:p="x"') + '><resources><object id="2" type="model"><components>' +
      comps + '</components></object></resources><build>' + items + '</build></model>'),
    '3D/Objects/object_1.model': u8('<?xml version="1.0"?><model unit="millimeter"><resources>' + plateMesh(1) + (twin ? plateMesh(3) : colour ? cubeXml(3, 4) : '') + '</resources><build/></model>'),
    '3D/_rels/3dmodel.model.rels': u8('<Relationships><Relationship Target="/3D/Objects/object_1.model" Id="rel-1"/></Relationships>'),
    'Metadata/model_settings.config': u8('<?xml version="1.0"?><config>' + settings +
      '<plate><metadata key="plater_id" value="1"/><model_instance><metadata key="object_id" value="2"/><metadata key="instance_id" value="0"/></model_instance>' +
      (o.plate2 ? '</plate><plate><metadata key="plater_id" value="2"/>' : '') +
      '<model_instance><metadata key="object_id" value="2"/><metadata key="instance_id" value="1"/></model_instance></plate></config>')
  });
}
// pick(job, i): angehakte Löcher des Teils (Standard: alle gefundenen)
function runHoles(zip, pick = j => j.found) {
  const imp = K.importModels([{ name: 'p.3mf', bytes: zip }], fflate);
  const base = { printer: 'kobra_s1', nozD: '0.4', nozM: 'steel_hardened', material: 'pla_hs', object: 'general', goal: 'balanced', load: 'medium', support: 'auto', supportLevel: 'balanced', thresh: '45' };
  const jobs = imp.parts.map(p => { const g = K.makeGeom(p.name, p.pos);
    return { geom: g, slot: null, found: K.findHoles(g), part: { objectId: p.objectId, partId: p.partId, instance: p.instance, plate: p.plate, transform: p.transform }, r: K.compute(base, g, { getMat: K.getMat, settings: K.store.settings }) }; });
  jobs.forEach((j, i) => { j.holes = pick(j, i); });
  const res = K.build3mfFromProject(K.exportTemplate('kobra_s1', '0.4'), jobs[0].r, jobs, 0, fflate, null, imp.threemf);
  const z = fflate.unzipSync(res.bytes), str = k => z[k] ? fflate.strFromU8(z[k]) : '';
  const modFile = Object.keys(z).find(k => /verstaerkung/.test(k));
  const v = modFile ? [...str(modFile).matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map(m => m.slice(1).map(Number)) : [];
  const tr = modFile ? [...str(modFile).matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].map(m => m.slice(1).map(Number)) : [];
  // Vorzeichenbehaftetes Volumen: > 0 heißt Normalen nach außen
  const vol = tr.reduce((s, [a, b, c]) => { const [p, q, r] = [v[a], v[b], v[c]];
    return s + (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6; }, 0);
  const mn = [0, 1, 2].map(k => Math.min(...v.map(p => p[k]))), mx = [0, 1, 2].map(k => Math.max(...v.map(p => p[k])));
  return { jobs, res, notes: res.notes.join('|'), mods: (str('Metadata/model_settings.config').match(/modifier_part/g) || []).length, root: str('3D/3dmodel.model'), ms: str('Metadata/model_settings.config'), rels: str('3D/_rels/3dmodel.model.rels'), modFile, mn, mx, vol };
}
const RING = 2.5 + K.HOLE_RING_MM, near = (a, b) => Math.abs(a - b) < 0.05;
const frameOk = h => near(h.mn[0], 5 - RING) && near(h.mx[0], 5 + RING) && near(h.mn[1], -RING) && near(h.mx[1], RING) && near(h.mn[2], 0) && near(h.mx[2], 6);
const box = h => h.mn.concat(h.mx).map(x => x.toFixed(2)).join(' ');
// Item 1: 90° um Z gedreht, Item 2: zweite Instanz desselben Objekts woanders
let hp = runHoles(holeProject('<item objectid="2" transform="0 1 0 -1 0 0 0 0 1 100 50 0"/><item objectid="2" transform="0 1 0 -1 0 0 0 0 1 200 50 0"/>'));
check('Loch im Import gefunden (je Instanz eins)', hp.jobs.length === 2 && hp.jobs.every(j => j.found.length === 1), hp.jobs.map(j => j.found.length).join());
check('Gedrehtes Item: Modifikator im Objekt-System um (5, 0), R = r + Ring, z 0…6', frameOk(hp), box(hp));
check('Modifikator-Normalen nach außen', hp.vol > 0, hp.vol);
check('Zwei Instanzen → ein Modifikator, als Komponente am Objekt 2', (hp.root.match(/verstaerkung\.model/g) || []).length === 1 && /<object[^>]*id="2"[\s\S]*?verstaerkung\.model[\s\S]*?<\/components>/.test(hp.root), hp.root);
check('model_settings: modifier_part mit 100 % Füllung im Objekt 2', /<object id="2">[\s\S]*?subtype="modifier_part">[\s\S]*?sparse_infill_density" value="100%"[\s\S]*?<\/object>/.test(hp.ms) && (hp.ms.match(/modifier_part/g) || []).length === 1, hp.ms);
check('Netz-Datei in den Beziehungen', /verstaerkung\.model/.test(hp.rels), hp.rels);
{ const ids = [...hp.root.matchAll(/<component[^>]*objectid="(\d+)"/g)].map(m => m[1]);
  check('Modifikator-Id kollidiert nicht mit vorhandenen Ids', new Set(ids).size === ids.length && !ids.slice(1).includes('1'), ids.join()); }
// Gespiegeltes Item (x → −x): gleicher Sollwert im Objekt-System, Normalen weiterhin nach außen
hp = runHoles(holeProject('<item objectid="2" transform="-1 0 0 0 1 0 0 0 1 100 50 0"/>'));
check('Gespiegeltes Item: Modifikator um (5, 0)', frameOk(hp), box(hp));
check('Gespiegeltes Item: Normalen nach außen', hp.vol > 0, hp.vol);
// Objekt fehlt in model_settings → kein Modifikator (Orca würde ihn als festen Körper drucken), Hinweis
hp = runHoles(holeProject('<item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 50 0"/>', { settings: false }));
check('Ohne Objekt-Einstellungen: kein Modifikator, Hinweis', !hp.modFile && !/verstaerkung/.test(hp.root) && hp.res.notes.some(n => /Lochverstärkung/.test(n)), hp.res.notes.join('|'));

// Befunde des Prüf-Agenten 2026-10-02
const two = '<item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 50 0"/><item objectid="2" transform="1 0 0 0 1 0 0 0 1 200 50 0"/>';
const refusedOnce = h => !h.modFile && h.mods === 0 && (h.notes.match(/Lochverstärkung in dieser 3MF nicht möglich/g) || []).length === 1;
// (1) Nur in einer Kopie angehakt → Modifikator gilt trotzdem für beide: Hinweis
hp = runHoles(holeProject(two), (j, i) => i === 0 ? j.found : []);
check('Befund 1: nur eine Kopie angehakt → ein Modifikator, Hinweis „alle Kopien“', hp.mods === 1 && /2-mal auf dem Bett/.test(hp.notes), hp.notes);
// (2) model_settings führt weniger Teile als Komponenten → nichts anlegen, ein Hinweis (auch bei zwei Kopien nur einmal = Befund 6)
hp = runHoles(holeProject(two, { parts: 0 }));
check('Befund 2+6: Teile ≠ Komponenten → kein Modifikator, Hinweis genau einmal', refusedOnce(hp), hp.notes);
// (3) Hauptmodell ohne p-Namensraum → nichts anlegen
hp = runHoles(holeProject('<item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 50 0"/>', { root: 'unit="millimeter"' }));
check('Befund 3: ohne xmlns:p → kein Modifikator, Hinweis', refusedOnce(hp), hp.notes);
// (4) Hauptmodell nicht in mm → nichts anlegen
hp = runHoles(holeProject('<item objectid="2" transform="1 0 0 0 1 0 0 0 1 4 2 0"/>', { root: 'unit="inch" xmlns:p="x"' }));
check('Befund 4: Einheit inch → kein Modifikator, Hinweis', refusedOnce(hp), hp.notes);
// (5) Erneuter Export einer schon verstärkten Datei → kein zweiter Modifikator
hp = runHoles(holeProject('<item objectid="2" transform="0 1 0 -1 0 0 0 0 1 100 50 0"/>'));
const again = runHoles(hp.res.bytes);
check('Befund 5: erneuter Export → weiterhin genau ein Modifikator', hp.mods === 1 && again.mods === 1 && again.jobs.length === 1, hp.mods + '/' + again.mods + '/' + again.jobs.length);
// Unsymmetrische Item-Matrix: Drehung (zyklisch) + Spiegelung + Streckung ×2 entlang der Lochachse + Verschiebung.
// Nicht orthogonal → ein vertauschtes (transponiertes) Inverses fiele auf. Sollwert unverändert: (5, 0), z 0…6
hp = runHoles(holeProject('<item objectid="2" transform="0 0 -1 1 0 0 0 2 0 100 50 30"/>'));
check('Drehung + Spiegelung + Streckung: Loch erkannt (Achse y)', hp.jobs[0].found.length === 1 && hp.jobs[0].found[0].axis === 'y', JSON.stringify(hp.jobs[0].found.map(h => h.axis)));
check('Drehung + Spiegelung + Streckung: Modifikator um (5, 0), z 0…6', frameOk(hp), box(hp));
check('Drehung + Spiegelung + Streckung: Normalen nach außen', hp.vol > 0, hp.vol);
// Mehrfarbig geteiltes Objekt (partId): Teil = Komponente·Item, der Modifikator gehört trotzdem ins Objekt-System
hp = runHoles(holeProject('<item objectid="2" transform="0 1 0 -1 0 0 0 0 1 100 50 0"/>', { colour: true }));
check('Mehrfarbig: zwei Teile, Loch nur in der Platte', hp.jobs.length === 2 && hp.jobs[0].part.partId === '1' && hp.jobs[0].found.length === 1 && hp.jobs[1].found.length === 0, hp.jobs.map(j => j.part.partId + ':' + j.found.length).join());
check('Mehrfarbig: Modifikator um (5, 0), z 0…6', frameOk(hp) && hp.mods === 1, box(hp) + ' / ' + hp.mods);

// Befund 1 des Prüf-Agenten (2. Runde): zwei Teile eines Objekts mit gleichnamigem „Loch 1 (Ø 5,0 mm)“. Erst nur
// Teil 1 verstärkt, die Datei erneut übernommen und jetzt alle Löcher angehakt → das zweite Loch braucht einen
// eigenen Modifikator, das erste keinen weiteren. Beim erneuten Einlesen sind beide Teile im selben Slot und
// werden ein Teil mit neu nummerierten Löchern – genau dann griff die alte Erkennung über den Namen daneben.
// Sollwert aus der Konstruktion: zweiter Zylinder um (−45, 0), R = r + Ring, z 0…6.
hp = runHoles(holeProject('<item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 50 0"/>', { colour: 'plate' }), (j, i) => i === 0 ? j.found : []);
check('Zwei Platten: je ein Loch Ø 5 mit gleicher Nummer', hp.jobs.length === 2 && hp.jobs.every(j => j.found.length === 1 && near(j.found[0].r, 2.5)) && hp.jobs[0].found[0].id === hp.jobs[1].found[0].id, hp.jobs.map(j => j.found.map(h => h.id + '/' + h.r)).join(' '));
check('Zwei Platten, nur Teil 1 angehakt: ein Modifikator um (5, 0)', hp.mods === 1 && frameOk(hp), box(hp) + ' / ' + hp.mods);
{
  const again = runHoles(hp.res.bytes), rest = [5 - RING, 5 + RING];
  const z2 = fflate.unzipSync(again.res.bytes), files = Object.keys(z2).filter(k => /verstaerkung/.test(k));
  const cx = files.flatMap(f => { const xs = [...fflate.strFromU8(z2[f]).matchAll(/<vertex x="([^"]+)"/g)].map(m => +m[1]);
    return xs.length ? [(Math.min(...xs) + Math.max(...xs)) / 2] : []; });
  check('Befund 1: erneuter Export, Teil 2 angehakt → zweiter Modifikator um (−45, 0)', again.mods === 2 && cx.some(x => near(x, -45)) && cx.some(x => near(x, 5)), again.mods + ' / ' + cx.map(x => x.toFixed(2)).join() + ' / ' + rest);
  const third = runHoles(again.res.bytes);
  check('Befund 1: dritter Export → weiterhin genau zwei Modifikatoren', third.mods === 2, String(third.mods));
}

// Testlücken laut Prüf-Agent 2026-10-02
// (a) Loch nur in der Kopie auf Platte 2 angehakt: Modifikator trotzdem objektlokal um (5, 0); die Platte
//     verschiebt nur das Item (Platte 2 mittig bei x 415, siehe oben), nicht den Modifikator
hp = runHoles(holeProject(two, { plate2: true }), (j, i) => i === 1 ? j.found : []);
{ const items = hp.root.match(/<item[^>]*>/g) || [];
  check('Platte 2: Instanzen auf Platte 1 und 2', hp.jobs.map(j => j.part.plate).join() === '1,2', hp.jobs.map(j => j.part.plate).join());
  check('Platte 2: ein Modifikator, objektlokal um (5, 0), z 0…6', hp.mods === 1 && frameOk(hp), box(hp) + ' / ' + hp.mods);
  check('Platte 2: zweites Item liegt auf Platte 2 (x > 300)', items.length === 2 && +items[1].match(/transform="(?:\S+ ){9}(\S+)/)[1] > 300, items.join(' ')); }
// (b) Kein Loch angehakt → Modell, Komponenten und Beziehungen wie in der Quelldatei, keine Netz-Datei
{ const src = holeProject(two), z0 = fflate.unzipSync(src), s0 = k => fflate.strFromU8(z0[k]);
  hp = runHoles(src, () => []);
  const compsOf = x => (x.match(/<components>[\s\S]*?<\/components>/) || [''])[0];
  check('Kein Loch angehakt: keine Netz-Datei, kein modifier_part', !hp.modFile && hp.mods === 0, hp.modFile + ' / ' + hp.mods);
  check('Kein Loch angehakt: Komponenten und Beziehungen unverändert', compsOf(hp.root) === compsOf(s0('3D/3dmodel.model')) && hp.rels === s0('3D/_rels/3dmodel.model.rels'), compsOf(hp.root)); }

// Orca-Kennung (gemeldet 2026-10-02): ohne <metadata name="OrcaSlicer"> behandelt Orca eine umgestellte
// Makerworld-Datei als BambuStudio-Projekt und meldet „Die 3MF wurde von BambuStudio erstellt …“
// (OrcaSlicer bbs_3mf.cpp: Tag ORCASLICER_TAG → is_orca_3mf; Plater.cpp: Zweig From_BBS). Sollwert: genau
// eine Kennung mit der Orca-Version der Vorlage; die Application-Angabe des Designers bleibt.
{
  const tplVer = K.exportTemplate('kobra_s1', '0.4').orcaVersion;
  const tags = x => [...x.matchAll(/<metadata name="OrcaSlicer">([^<]*)<\/metadata>/g)].map(m => m[1]);
  check('Vorlage hat eine Orca-Version (x.y.z)', /^\d+\.\d+\.\d+/.test(tplVer || ''), tplVer);
  const mw = '<?xml version="1.0"?><model unit="millimeter" xmlns:p="x"><metadata name="Application">BambuStudio-02.05.03.61</metadata><resources>' + cubeXml(1, 20) + '</resources><build><item objectid="1"/></build></model>';
  const mwZip = (root, settings) => fflate.zipSync({ '3D/3dmodel.model': u8(root), 'Metadata/model_settings.config': u8(settings || '<?xml version="1.0"?><config><object id="1"><metadata key="name" value="W"/></object></config>') });
  let o = runHoles(mwZip(mw), () => []);
  check('Makerworld-Datei: genau eine OrcaSlicer-Kennung mit Vorlagen-Version', JSON.stringify(tags(o.root)) === JSON.stringify([tplVer]), tags(o.root).join() + ' / ' + tplVer);
  check('Makerworld-Datei: Application des Designers bleibt', /<metadata name="Application">BambuStudio-02\.05\.03\.61<\/metadata>/.test(o.root), o.root.slice(0, 300));
  // Schon vorhandene (ältere) Kennung → durch die Version der Vorlage ersetzt, nicht verdoppelt
  o = runHoles(mwZip(mw.replace('<resources>', '<metadata name="OrcaSlicer">2.1.0</metadata><resources>')), () => []);
  check('Vorhandene Kennung: ersetzt statt verdoppelt', JSON.stringify(tags(o.root)) === JSON.stringify([tplVer]), tags(o.root).join());
  // Hauptmodell mit Namensraum-Präfix: Kennung mit demselben Präfix, sonst liest Orca sie nicht als metadata
  o = runHoles(mwZip(mw.replace('<model ', '<m:model xmlns:m="x" ').replace('</model>', '</m:model>').replace(/<metadata /, '<m:metadata ').replace('</metadata>', '</m:metadata>')), () => []);
  check('Präfix m: → <m:metadata name="OrcaSlicer">', new RegExp('<m:metadata name="OrcaSlicer">' + tplVer.replace(/\./g, '\.') + '</m:metadata>').test(o.root), o.root.slice(0, 300));
}

// Z-Offset je Drucker (Auftrag 2026-10-03): Vorlagen haben z_offset 0; der eingetragene Wert landet in der 3MF
{
  const tpl = K.exportTemplate('kobra_s1', '0.4'), before = JSON.stringify(tpl.settings);
  check('Vorlage Kobra S1: z_offset 0 (Ausgangslage)', String(tpl.settings.z_offset) === '0', tpl.settings.z_offset);
  const z = K.withZOffset(tpl, '0,25');
  check('Z-Offset 0,25 → Kopie mit z_offset "0.25", Vorlage unverändert', z !== tpl && z.settings.z_offset === '0.25' && JSON.stringify(tpl.settings) === before);
  check('Ungültig/leer → Vorlage unverändert', K.withZOffset(tpl, '') === tpl && K.withZOffset(tpl, 'abc') === tpl && K.withZOffset(tpl, 5) === tpl && K.withZOffset(tpl, null) === tpl);
  // Ende-zu-Ende: STL-Export und Makerworld-Projekt tragen den Wert in project_settings
  const v = [[0,0,0],[20,0,0],[20,20,0],[0,20,0],[0,0,10],[20,0,10],[20,20,10],[0,20,10]];
  const cube = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].map(t => t.map(i => v[i]));
  const g = K.makeGeom('w', Float32Array.from(cube.flat(2)));
  const r = K.compute({ printer: 'kobra_s1', nozD: '0.4', nozM: 'steel_hardened', material: 'pla_hs', object: 'general', goal: 'balanced', load: 'medium', support: 'auto', supportLevel: 'balanced', thresh: '45' }, g, { getMat: K.getMat, settings: K.store.settings });
  const stl = K.build3mf(z, r, [{ geom: g, slot: null, r, part: {} }], 0, fflate, null);
  const zs = JSON.parse(fflate.strFromU8(fflate.unzipSync(stl.bytes)['Metadata/project_settings.config'])).z_offset;
  check('STL-Export: z_offset 0.25 in der 3MF', zs === '0.25', zs);
  // Befund 2026-10-03: Orca übernimmt den Wert nur, wenn z_offset in der Drucker-Gruppe von
  // different_settings_to_system steht (letzter Eintrag) – sonst lädt es das Profil neu und zeigt 0
  const psAll = JSON.parse(fflate.strFromU8(fflate.unzipSync(stl.bytes)['Metadata/project_settings.config']));
  const dss = psAll.different_settings_to_system;
  check('STL-Export: z_offset in der Drucker-Gruppe von different_settings_to_system', Array.isArray(dss) && dss.length === psAll.filament_settings_id.length + 2 && dss[dss.length - 1].split(';').includes('z_offset'), JSON.stringify(dss && dss[dss.length - 1]));
  check('Vorlage: different_settings_to_system unverändert', JSON.stringify(tpl.settings.different_settings_to_system) === JSON.stringify(JSON.parse(before).different_settings_to_system));
}

// Lightning für Deko/Figur (Auftrag 2026-10-03): nur bei Objekt „decor“, nicht bei hoher Belastung oder „strong“
{
  const v = [[0,0,0],[20,0,0],[20,20,0],[0,20,0],[0,0,10],[20,0,10],[20,20,10],[0,20,10]];
  const g = K.makeGeom('w', Float32Array.from([[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].map(t => t.map(i => v[i])).flat(2)));
  const pat = (object, goal, load) => {
    const r = K.compute({ printer: 'kobra_s1', nozD: '0.4', nozM: 'steel_hardened', material: 'pla_hs', object, goal, load, support: 'auto', supportLevel: 'balanced', thresh: '45' }, g, { getMat: K.getMat, settings: K.store.settings });
    const b = K.build3mf(K.exportTemplate('kobra_s1', '0.4'), r, [{ geom: g, slot: null, r, part: {} }], 0, fflate, null);
    return JSON.parse(fflate.strFromU8(fflate.unzipSync(b.bytes)['Metadata/project_settings.config'])).sparse_infill_pattern;
  };
  check('Deko · ausgewogen → lightning', pat('decor', 'balanced', 'low') === 'lightning', pat('decor', 'balanced', 'low'));
  check('Deko · schnell → lightning', pat('decor', 'fast', 'medium') === 'lightning');
  check('Deko · Maximale Stabilität → nicht lightning', pat('decor', 'strong', 'low') !== 'lightning');
  check('Deko · hohe Belastung → nicht lightning', pat('decor', 'balanced', 'high') !== 'lightning');
  check('Funktionsteil → gyroid', pat('general', 'balanced', 'medium') === 'gyroid', pat('general', 'balanced', 'medium'));
}

console.log(pass + '/' + (pass + fail) + ' bestanden');
process.exit(fail ? 1 : 0);
