'use strict';
/* Erzeugt den Stabilitäts-Prüfkörper als binäre STL (Maße wie in tests/fragility.js) zum Drucken:
     node tools/make-pruefkoerper.js [ziel.stl]     (Standard: testdaten/stabilitaet-pruefkoerper.stl)
   Alle Körper sind einzelne geschlossene Quader/Zylinder; berührende Körper verschmilzt der Slicer. */
const fs = require('fs');
const path = require('path');

function box(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  return [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]].map(t => t.map(i => v[i]));
}
function cylinder(cx, cy, r, z0, z1, seg = 48) {
  const tris = [];
  for (let i = 0; i < seg; i++) {
    const a = 2 * Math.PI * i / seg, b = 2 * Math.PI * (i + 1) / seg;
    const pa = [cx + r * Math.cos(a), cy + r * Math.sin(a)], pb = [cx + r * Math.cos(b), cy + r * Math.sin(b)];
    tris.push([[cx, cy, z1], [...pa, z1], [...pb, z1]], [[cx, cy, z0], [...pb, z0], [...pa, z0]]);
    tris.push([[...pa, z0], [...pb, z0], [...pb, z1]], [[...pa, z0], [...pb, z1], [...pa, z1]]);
  }
  return tris;
}

const BODIES = [
  ['Grundplatte 60 × 40 × 3', box(0, 0, 0, 60, 40, 3)],
  ['Wand 0,6 mm (30 lang, 20 hoch)', box(5, 5, 3, 5.6, 35, 23)],
  ['Wand 1,2 mm (30 lang, 20 hoch)', box(15, 5, 3, 16.2, 35, 23)],
  ['Wand 3 mm (30 lang, 20 hoch)', box(25, 5, 3, 28, 35, 23)],
  ['Stift Ø 3 × 25', cylinder(40, 20, 1.5, 3, 28)],
  ['Block 6 × 6 × 10', box(48, 5, 3, 54, 11, 13)],
  ['Block 6 × 6 × 10', box(48, 29, 3, 54, 35, 13)],
  ['Steg 1 breit × 4 hoch, 18 frei', box(50.5, 11, 9, 51.5, 29, 13)],
  ['Wand 1,2 mm stehend (30 lang, 20 hoch)', box(65, 0, 0, 66.2, 30, 20)],
  ['Wand 1,2 mm liegend (30 × 20)', box(70, 0, 0, 100, 20, 1.2)]
];

const out = process.argv[2] || path.join(__dirname, '..', 'testdaten', 'stabilitaet-pruefkoerper.stl');
const tris = BODIES.flatMap(b => b[1]);
const buf = Buffer.alloc(84 + tris.length * 50);
buf.write('Stabilitaets-Pruefkoerper Druck-Konfigurator', 0, 'ascii');
buf.writeUInt32LE(tris.length, 80);
tris.forEach((t, i) => t.flat().forEach((c, j) => buf.writeFloatLE(c, 84 + i * 50 + 12 + j * 4)));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(out + ': ' + tris.length + ' Dreiecke, ' + BODIES.length + ' Körper');
