'use strict';
/* Prüft den Modell-Import (js/import.js): Zerlegen in Körper, ZIP, 3MF mit Transformationen,
   Modifiern und Platten. Optional mit einer echten Makerworld-3MF: MW3MF=<Pfad> node tests/import.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const fflate = require('../vendor/fflate.min.js');

const ROOT = path.join(__dirname, '..');
const ctx = vm.createContext({ console, TextDecoder });
for (const f of ['util', 'stl', 'colour-changes', 'import'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const K = vm.runInContext('({importModels, splitBodies, makeGeom, readSTL})', ctx);

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else { fail++; console.log('FEHLER ' + name + (detail ? ': ' + detail : '')); } }

/* ---------- Testnetze ---------- */
function boxTris(x0, y0, z0, x1, y1, z1, inward) {
  const v = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  return f.map(t => (inward ? [t[0], t[2], t[1]] : t).map(i => v[i]));
}
function stlBytes(tris) {
  const b = Buffer.alloc(84 + tris.length * 50); b.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => t.flat().forEach((c, j) => b.writeFloatLE(c, 84 + i * 50 + 12 + j * 4)));
  return new Uint8Array(b.buffer, b.byteOffset, b.length);
}
const imp = entries => K.importModels(entries, fflate);
const dims = pos => { const g = K.makeGeom('x', pos); return [g.x, g.y, g.z].map(v => Math.round(v * 100) / 100).join('x'); };

// 1) Einzelner Körper bleibt ein Teil
let r = imp([{ name: 'wuerfel.stl', bytes: stlBytes(boxTris(0, 0, 0, 10, 10, 10)) }]);
check('Einzelkörper', r.parts.length === 1 && r.parts[0].name === 'wuerfel.stl', r.parts.length);

// 2) Zwei getrennte Körper → zwei Teile, sortiert von vorne links
r = imp([{ name: 'set.stl', bytes: stlBytes([...boxTris(40, 0, 0, 50, 10, 5), ...boxTris(0, 0, 0, 20, 20, 20)]) }]);
check('Zwei Körper', r.parts.length === 2, r.parts.length);
check('Zwei Körper Maße', r.parts.length === 2 && dims(r.parts[0].pos) === '20x20x20' && dims(r.parts[1].pos) === '10x10x5', r.parts.map(p => dims(p.pos)).join(' '));
check('Zwei Körper Namen', r.parts[0].name === 'set.stl · Teil 1');

// 3) Hohlkörper (Außen- + Innenhülle) und unverschmolzene, sich berührende Körper bleiben ein Teil
r = imp([{ name: 'hohl.stl', bytes: stlBytes([...boxTris(0, 0, 0, 30, 30, 30), ...boxTris(2, 2, 2, 28, 28, 28, true)]) }]);
check('Hohlkörper = 1 Teil', r.parts.length === 1, r.parts.length);
r = imp([{ name: 'pilz.stl', bytes: stlBytes([...boxTris(15, 15, 0, 25, 25, 20), ...boxTris(0, 0, 20, 40, 40, 25)]) }]);
check('Stiel + Hut (berühren sich) = 1 Teil', r.parts.length === 1, r.parts.length);
r = imp([{ name: 'ueberlapp.stl', bytes: stlBytes([...boxTris(0, 0, 0, 20, 20, 10), ...boxTris(15, 5, 0, 40, 15, 10), ...boxTris(60, 0, 0, 70, 10, 10)]) }]);
check('Überlappende Körper verschmelzen, entfernter bleibt eigenes Teil', r.parts.length === 2 && dims(r.parts[0].pos) === '40x20x10', r.parts.map(p => dims(p.pos)).join(' '));

// 4) Mehrere Dateien + ZIP
const zipped = fflate.zipSync({ 'modell/a.stl': stlBytes(boxTris(0, 0, 0, 5, 5, 5)), 'modell/b.stl': stlBytes(boxTris(0, 0, 0, 6, 6, 6)), '__MACOSX/modell/._a.stl': new Uint8Array([1, 2]), 'liesmich.txt': new Uint8Array([65]) });
r = imp([{ name: 'paket.zip', bytes: zipped }, { name: 'c.stl', bytes: stlBytes(boxTris(0, 0, 0, 7, 7, 7)) }]);
check('ZIP + Einzeldatei', r.parts.length === 3 && r.parts.map(p => p.name).join() === 'a.stl,b.stl,c.stl', r.parts.map(p => p.name).join());
check('ohne threemf', r.threemf === null);

// 5) Selbstgebaute 3MF: Komponente mit Drehung + Item-Verschiebung, Modifier, zwei Platten
function meshXml(id, tris) {
  const v = [], t = [];
  tris.forEach(tri => { t.push('<triangle v1="' + v.length + '" v2="' + (v.length + 1) + '" v3="' + (v.length + 2) + '"/>'); tri.forEach(p => v.push('<vertex x="' + p[0] + '" y="' + p[1] + '" z="' + p[2] + '"/>')); });
  return '<object id="' + id + '" type="model"><mesh><vertices>' + v.join('') + '</vertices><triangles>' + t.join('') + '</triangles></mesh></object>';
}
const u8 = s => fflate.strToU8(s);
const objFile = '<?xml version="1.0"?><model unit="millimeter" xmlns:p="x"><resources>' + meshXml(1, boxTris(-10, -5, -2, 10, 5, 2)) + meshXml(2, boxTris(-1, -1, -1, 1, 1, 1)) + '</resources><build/></model>';
const rootFile = '<?xml version="1.0"?><model unit="millimeter" xmlns:p="x"><resources>' +
  '<object id="3" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="1" transform="0 1 0 -1 0 0 0 0 1 0 0 0"/><component p:path="/3D/Objects/object_1.model" objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></components></object>' +
  '<object id="4" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></components></object>' +
  '</resources><build><item objectid="3" transform="1 0 0 0 1 0 0 0 1 100 50 2"/><item objectid="4" transform="1 0 0 0 1 0 0 0 1 300 50 1"/></build></model>';
const settingsFile = '<?xml version="1.0"?><config>' +
  '<object id="3"><metadata key="name" value="Halter &amp; Clip"/><metadata key="extruder" value="2"/><part id="1" subtype="normal_part"></part><part id="2" subtype="modifier_part"></part></object>' +
  '<object id="4"><metadata key="name" value="Knopf"/><metadata key="extruder" value="4"/><part id="2" subtype="normal_part"></part></object>' +
  '<plate><metadata key="plater_id" value="1"/><model_instance><metadata key="object_id" value="3"/></model_instance></plate>' +
  '<plate><metadata key="plater_id" value="2"/><model_instance><metadata key="object_id" value="4"/></model_instance></plate></config>';
const tmf = fflate.zipSync({
  '_rels/.rels': u8('<Relationships><Relationship Target="/3D/3dmodel.model" Id="rel-1"/></Relationships>'),
  '3D/3dmodel.model': u8(rootFile), '3D/Objects/object_1.model': u8(objFile),
  'Metadata/model_settings.config': u8(settingsFile), 'Metadata/project_settings.config': u8('{"printer_settings_id":"Bambu Lab X1 Carbon 0.4 nozzle"}')
});
r = imp([{ name: 'projekt.3mf', bytes: tmf }]);
check('3MF Teile', r.parts.length === 2, r.parts.length);
const halter = r.parts[0], knopf = r.parts[1];
check('3MF Name entschlüsselt', halter && halter.name === 'Halter & Clip', halter && halter.name);
check('3MF Drehung (20x10 → 10x20), Modifier weg', halter && dims(halter.pos) === '10x20x4', halter && dims(halter.pos));
const hg = halter && K.makeGeom('h', halter.pos);
check('3MF Lage (Mitte 100/50, unten 0)', hg && Math.abs((hg.mn[0] + hg.mx[0]) / 2 - 100) < 1e-4 && Math.abs((hg.mn[1] + hg.mx[1]) / 2 - 50) < 1e-4 && Math.abs(hg.mn[2]) < 1e-4, hg && hg.mn.join());
check('3MF Slot/Platte', halter && halter.extruder === 2 && halter.plate === 1 && knopf.extruder === 4 && knopf.plate === 2);
check('3MF Modifier-Hinweis', r.notes.some(n => /Modifier/.test(n)), r.notes.join('|'));
check('3MF threemf', r.threemf && r.threemf.plates.length === 2 && r.threemf.settings.printer_settings_id.indexOf('Bambu') === 0);

// 5b) Mehrfarbig aus Teilen (gemeldet 2026-10-01, Hausschild): ein Objekt, zwei druckbare Teile mit
//     verschiedenen Slots → zwei Teile im Tool, mit partId und Slot je Teil; gleiche Slots → bleibt ein Teil
const twoColour = (exA, exB) => fflate.zipSync({
  '_rels/.rels': u8('<Relationships><Relationship Target="/3D/3dmodel.model" Id="rel-1"/></Relationships>'),
  '3D/3dmodel.model': u8('<?xml version="1.0"?><model unit="millimeter" xmlns:p="x"><resources><object id="3" type="model"><components>' +
    '<component p:path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>' +
    '<component p:path="/3D/Objects/object_1.model" objectid="2" transform="1 0 0 0 1 0 0 0 0.5 0 0 4"/></components></object></resources>' +
    '<build><item objectid="3" transform="1 0 0 0 1 0 0 0 1 100 50 2"/></build></model>'),
  '3D/Objects/object_1.model': u8(objFile),
  'Metadata/model_settings.config': u8('<?xml version="1.0"?><config><object id="3"><metadata key="name" value="Schild"/><metadata key="extruder" value="1"/>' +
    '<part id="1" subtype="normal_part"><metadata key="name" value="Platte"/><metadata key="extruder" value="' + exA + '"/></part>' +
    '<part id="2" subtype="normal_part"><metadata key="name" value="Relief"/><metadata key="extruder" value="' + exB + '"/></part></object>' +
    '<plate><metadata key="plater_id" value="1"/><model_instance><metadata key="object_id" value="3"/></model_instance></plate></config>'),
  'Metadata/project_settings.config': u8('{"printer_settings_id":"Snapmaker U1"}')
});
r = imp([{ name: 'schild.3mf', bytes: twoColour(4, 3) }]);
check('Mehrfarbig: zwei Teile', r.parts.length === 2, r.parts.length);
check('Mehrfarbig: Namen, Slots, partId', r.parts.length === 2 && r.parts[0].name === 'Schild · Platte' && r.parts[0].extruder === 4 && r.parts[0].partId === '1' &&
  r.parts[1].name === 'Schild · Relief' && r.parts[1].extruder === 3 && r.parts[1].partId === '2', r.parts.map(p => p.name + '/' + p.extruder + '/' + p.partId).join(' | '));
check('Mehrfarbig: Teil-Transformation (Relief halb so hoch)', r.parts.length === 2 && dims(r.parts[1].pos) === '2x2x1', r.parts[1] && dims(r.parts[1].pos));
r = imp([{ name: 'schild.3mf', bytes: twoColour(2, 2) }]);
check('Gleicher Slot je Teil: ein Teil, Slot der Teile (2) statt Objekt-Slot (1)', r.parts.length === 1 && !r.parts[0].partId && r.parts[0].extruder === 2 && String(r.parts[0].partIds) === '1,2', r.parts.map(p => p.extruder + '/' + p.partIds).join());

// 6) ZIP mit einer 3MF und STLs → 3MF hat Vorrang
r = imp([{ name: 'mw.zip', bytes: fflate.zipSync({ 'projekt.3mf': tmf, 'teil.stl': stlBytes(boxTris(0, 0, 0, 5, 5, 5)) }) }]);
check('ZIP: 3MF hat Vorrang', r.parts.length === 2 && r.threemf && r.notes.some(n => /ignoriert/.test(n)), r.notes.join('|'));

// 6b) Befunde der Prüfung: Splitter erweitert die Box; Einheit gilt auch für Verschiebungen; Namensraum-Präfixe
const splinter = [[15, 0, 0], [15, 1, 0], [15, 0, 1]];
r = imp([{ name: 'splitter.stl', bytes: stlBytes([...boxTris(0, 0, 0, 10, 10, 10), splinter, ...boxTris(15.02, 0, 0, 25, 10, 10)]) }]);
check('Splitter verbindet berührende Körper', r.parts.length === 1, r.parts.length);
const inchModel = '<?xml version="1.0"?><m:model unit="inch" xmlns:m="x"><m:resources>' +
  meshXml(1, boxTris(0, 0, 0, 1, 1, 1)).replace(/<(\/?)(object|mesh|vertices|vertex|triangles|triangle)\b/g, '<$1m:$2') +
  '</m:resources><m:build><m:item objectid="1" transform="1 0 0 0 1 0 0 0 1 2 0 0"/></m:build></m:model>';
r = imp([{ name: 'zoll.3mf', bytes: fflate.zipSync({ '3D/3dmodel.model': u8(inchModel) }) }]);
{ const g = r.parts[0] && K.makeGeom('z', r.parts[0].pos);
  check('Zoll-3MF mit Präfixen: 25,4 mm groß, um 50,8 mm verschoben', g && Math.abs(g.x - 25.4) < 1e-3 && Math.abs(g.mn[0] - 50.8) < 1e-3, g && g.x + ' / ' + g.mn[0]); }
// 6c) Einfache 3MF ohne model_settings.config (Cura, PrusaSlicer, CAD) → wie STL, kein Projekt (2026-10-02)
check('Einfache 3MF: kein Projekt, Hinweis', r.threemf === null && r.notes.some(n => /Einfache 3MF/.test(n)), r.notes.join('|'));
// 6d) Befund 2026-10-02: gespiegeltes Item (x → −x) – Normalen müssen nach außen zeigen (Volumen > 0, Soll 2·3·4 = 24)
r = imp([{ name: 'spiegel.3mf', bytes: fflate.zipSync({ '3D/3dmodel.model': u8('<?xml version="1.0"?><model unit="millimeter"><resources>' +
  meshXml(1, boxTris(0, 0, 0, 2, 3, 4)) + '</resources><build><item objectid="1" transform="-1 0 0 0 1 0 0 0 1 10 0 0"/></build></model>') }) }]);
{ const p = r.parts[0].pos; let vol = 0;
  for (let i = 0; i < p.length; i += 9) vol += (p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])) / 6;
  check('Gespiegeltes 3MF-Item: Normalen nach außen (Volumen +24)', Math.abs(vol - 24) < 1e-3, vol); }
// 6e) Prüf-Agent 2026-10-02: Spiegelung in Komponenten, doppelt (hebt sich auf) und verschachtelt über drei Ebenen.
//     Sollwert unverändert aus der Konstruktion: Quader 2·3·4 → Volumen +24, egal wie oft gespiegelt wird
const volOf = p => { let v = 0; for (let i = 0; i < p.length; i += 9) v += (p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])) / 6; return v; };
const mirrorCase = (objs, item) => imp([{ name: 'spiegel2.3mf', bytes: fflate.zipSync({ '3D/3dmodel.model': u8('<?xml version="1.0"?><model unit="millimeter"><resources>' +
  meshXml(1, boxTris(0, 0, 0, 2, 3, 4)) + objs + '</resources><build><item objectid="' + item[0] + '" transform="' + item[1] + '"/></build></model>') }) }]);
const comp = (id, ref, t) => '<object id="' + id + '" type="model"><components><component objectid="' + ref + '" transform="' + t + '"/></components></object>';
for (const [name, objs, item] of [
  ['Komponente gespiegelt (x)', comp(2, 1, '-1 0 0 0 1 0 0 0 1 0 0 0'), [2, '1 0 0 0 1 0 0 0 1 10 10 0']],
  ['Komponente und Item gespiegelt (doppelt)', comp(2, 1, '-1 0 0 0 1 0 0 0 1 0 0 0'), [2, '-1 0 0 0 1 0 0 0 1 10 10 0']],
  ['drei Ebenen gespiegelt (z, y, x)', comp(2, 1, '1 0 0 0 1 0 0 0 -1 0 0 4') + comp(3, 2, '1 0 0 0 -1 0 0 0 1 0 3 0'), [3, '-1 0 0 0 1 0 0 0 1 10 10 0']]]) {
  r = mirrorCase(objs, item);
  const v = r.parts.length === 1 ? volOf(r.parts[0].pos) : NaN;
  check('Spiegelung, ' + name + ': Volumen +24', Math.abs(v - 24) < 1e-3, r.parts.length + ' Teile, Volumen ' + v);
}

// 6f) Schneller Einlese-Weg (2026-10-03) und Rückfall: Eckpunkte in üblicher Reihenfolge, in anderer
//     Reihenfolge, mit Zusatz-Attribut und mit Zeilenumbruch; Dreieck mit p1. Sollwerte aus der Konstruktion.
{
  const xml = '<?xml version="1.0"?><model unit="millimeter"><resources><object id="1" type="model"><mesh><vertices>' +
    '<vertex x="0" y="0" z="0"/><vertex z="0" y="0" x="10"/><vertex x="0" y="10" z="0" pid="2"/><vertex\n x="0"\n y="0"\n z="10"/>' +
    '</vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3" p1="0"/><triangle v3="3" v2="2" v1="0"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>';
  r = imp([{ name: 'reihenfolge.3mf', bytes: fflate.zipSync({ '3D/3dmodel.model': u8(xml) }) }]);
  const p = r.parts[0] && Array.from(r.parts[0].pos);
  const want = [0,0,0, 0,10,0, 10,0,0,  0,0,0, 10,0,0, 0,0,10,  0,0,0, 0,10,0, 0,0,10];
  check('Einlesen: Attribut-Reihenfolge, Zusatz-Attribute, Zeilenumbruch – gleiche Koordinaten', p && p.length === want.length && p.every((v, i) => v === want[i]), JSON.stringify(p));
}

// 7) Fehlerfälle
let err = '';
try { imp([{ name: 'foto.png', bytes: new Uint8Array(4) }]); } catch (e) { err = e.message; }
check('Falscher Dateityp meldet Fehler', /nur STL, 3MF oder ZIP/.test(err), err);

// 8) Echte Makerworld-3MF (optional)
const mw = process.env.MW3MF;
if (mw && fs.existsSync(mw)) {
  const t0 = Date.now();
  r = imp([{ name: path.basename(mw), bytes: new Uint8Array(fs.readFileSync(mw)) }]);
  console.log(path.basename(mw) + ': ' + r.parts.length + ' Teile in ' + (Date.now() - t0) + ' ms, Platten ' + (r.threemf ? r.threemf.plates.length : '-'));
  r.parts.forEach(p => { const g = K.makeGeom(p.name, p.pos); console.log('  P' + p.plate + ' Slot ' + p.extruder + '  ' + p.name + '  ' + dims(p.pos) + '  unten z=' + g.mn[2].toFixed(2)); });
  check('Makerworld: Teile gelesen', r.parts.length > 0);
  check('Makerworld: alle Teile liegen auf z=0', r.parts.every(p => Math.abs(K.makeGeom('', p.pos).mn[2]) < 0.05));
}

console.log(pass + '/' + (pass + fail) + ' bestanden');
process.exit(fail ? 1 : 0);
