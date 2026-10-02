'use strict';
/* Modell-Import: STL (auch mit mehreren Körpern), mehrere Dateien, ZIP (z. B. von Makerworld)
   und 3MF (Orca/Bambu/Makerworld). Kein DOM-Zugriff – tests/import.js prüft das in Node.
   Ergebnis: { name, parts:[{name, pos, objectId?, extruder?, plate?}], threemf|null, notes:[] }.
   pos ist ein flaches Dreiecksarray in Druckbett-Koordinaten (wie in der Quelldatei platziert). */

const MAX_BODIES = 200;     // mehr getrennte Körper → eher ein zerfallenes Netz als ein Teilesatz
const WELD_MM = 1e-4;       // Eckpunkte näher als das gelten als identisch
const TOUCH_MM = 0.05;      // Körper mit weniger Abstand gelten als ein Teil
const MIN_BODY_TRIS = 4;    // kleinere Splitter sind kein eigenständiges Teil
const UNIT_MM = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };
const MODEL_EXT = /\.(stl|3mf)$/i;

/* ---------- STL in Körper zerlegen ---------- */
function bboxOf(pos, tris) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (let k = 0; k < 9; k++) {
    const v = pos[t * 9 + k], a = k % 3;
    if (v < mn[a]) mn[a] = v;
    if (v > mx[a]) mx[a] = v;
  }
  return { mn, mx };
}
const boxesTouch = (a, b) => [0, 1, 2].every(k => a.mn[k] <= b.mx[k] + TOUCH_MM && b.mn[k] <= a.mx[k] + TOUCH_MM);

/* Zerlegt ein Netz in getrennte Teile. Körper, deren Hüllquader sich berühren oder überlappen,
   bleiben ein Teil – das deckt Hohlkörper (Innenwand), unverschmolzene Tinkercad-Exporte
   (Stiel + Hut) und Einsätze ab. Getrennt wird nur, was auch auf dem Bett getrennt liegt. */
function splitBodies(pos) {
  const n = pos.length / 9;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const seen = new Map();
  for (let t = 0; t < n; t++) for (let v = 0; v < 3; v++) {
    const o = t * 9 + v * 3;
    const key = Math.round(pos[o] / WELD_MM) + ',' + Math.round(pos[o + 1] / WELD_MM) + ',' + Math.round(pos[o + 2] / WELD_MM);
    const other = seen.get(key);
    if (other === undefined) seen.set(key, t); else { const a = find(t), b = find(other); if (a !== b) parent[a] = b; }
  }
  const groups = new Map();
  for (let t = 0; t < n; t++) { const r = find(t); (groups.get(r) || groups.set(r, []).get(r)).push(t); }
  if (groups.size === 1 || groups.size > MAX_BODIES) return [pos];

  let bodies = [...groups.values()].map(tris => ({ tris, ...bboxOf(pos, tris) }));
  bodies.sort((a, b) => b.tris.length - a.tris.length);
  // Splitter an den größten Körper hängen
  const main = bodies[0];
  bodies = bodies.filter((b, i) => {
    if (!i || b.tris.length >= MIN_BODY_TRIS) return true;
    for (const t of b.tris) main.tris.push(t);
    for (let k = 0; k < 3; k++) { main.mn[k] = Math.min(main.mn[k], b.mn[k]); main.mx[k] = Math.max(main.mx[k], b.mx[k]); }
    return false;
  });
  // Berührende Körper zusammenfassen, bis sich nichts mehr ändert (der gemeinsame Quader wächst mit)
  let kept = bodies, merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < kept.length && !merged; i++) for (let j = i + 1; j < kept.length; j++) {
      const A = kept[i], B = kept[j];
      if (!boxesTouch(A, B)) continue;
      for (const t of B.tris) A.tris.push(t);
      for (let k = 0; k < 3; k++) { A.mn[k] = Math.min(A.mn[k], B.mn[k]); A.mx[k] = Math.max(A.mx[k], B.mx[k]); }
      kept.splice(j, 1); merged = true; break;
    }
  }
  if (kept.length === 1) return [pos];
  // Reihenfolge wie im Bett: von vorne links nach hinten rechts
  kept.sort((a, b) => (a.mn[1] - b.mn[1]) || (a.mn[0] - b.mn[0]));
  return kept.map(b => {
    const out = new Float32Array(b.tris.length * 9);
    b.tris.sort((x, y) => x - y).forEach((t, j) => out.set(pos.subarray(t * 9, t * 9 + 9), j * 9));
    return out;
  });
}

/* ---------- 3MF lesen ---------- */
const attrsOf = tag => { const o = {}; tag.replace(/([\w:]+)="([^"]*)"/g, (_, k, v) => { o[k] = v; }); return o; };
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
// unit = Einheit der Datei in mm; gilt auch für den Verschiebungsanteil
const parseTransform = (s, unit = 1) => {
  const t = s ? s.trim().split(/\s+/).map(Number) : IDENTITY;
  if (t.length !== 12 || !t.every(Number.isFinite)) return IDENTITY;
  return t.map((v, i) => i >= 9 ? v * unit : v);
};
// Tags mit oder ohne Namensraum-Präfix (z. B. <m:vertex> aus 3D Builder)
const tagRe = (name, flags = 'g') => new RegExp('<(?:\\w+:)?' + name + '\\b([^>]*?)\\/?>', flags);
const blockRe = name => new RegExp('<(?:\\w+:)?' + name + '\\b([^>]*[^/>])?>([\\s\\S]*?)<\\/(?:\\w+:)?' + name + '>', 'g');
// 3MF-Matrizen wirken auf Zeilenvektoren: p' = p·A, danach ·B  →  C = A·B
function mulTransform(a, b) {
  const A = [[a[0], a[1], a[2], 0], [a[3], a[4], a[5], 0], [a[6], a[7], a[8], 0], [a[9], a[10], a[11], 1]];
  const B = [[b[0], b[1], b[2], 0], [b[3], b[4], b[5], 0], [b[6], b[7], b[8], 0], [b[9], b[10], b[11], 1]];
  const C = A.map(row => [0, 1, 2].map(c => row.reduce((s, v, k) => s + v * B[k][c], 0)));
  return [...C[0], ...C[1], ...C[2], ...C[3]];
}

function parseModelXML(text) {
  const unit = UNIT_MM[(/<(?:\w+:)?model\b[^>]*\bunit="([^"]+)"/.exec(text) || [])[1] || 'millimeter'] || 1;
  const objects = new Map();
  for (const m of text.matchAll(blockRe('object'))) {
    const a = attrsOf(m[1] || ''), body = m[2], obj = { id: a.id, name: a.name || '', type: a.type || 'model', mesh: null, components: [] };
    const meshXml = blockRe('mesh').exec(body);
    if (meshXml) {
      const vs = [];
      for (const v of meshXml[2].matchAll(tagRe('vertex'))) { const va = attrsOf(v[1]); vs.push(+va.x * unit, +va.y * unit, +va.z * unit); }
      const ts = [];
      for (const t of meshXml[2].matchAll(tagRe('triangle'))) { const ta = attrsOf(t[1]); ts.push(+ta.v1, +ta.v2, +ta.v3); }
      obj.mesh = { v: Float64Array.from(vs), t: Uint32Array.from(ts) };
    }
    for (const c of body.matchAll(tagRe('component'))) {
      const ca = attrsOf(c[1]);
      obj.components.push({ path: ca['p:path'] || null, objectid: ca.objectid, transform: parseTransform(ca.transform, unit) });
    }
    objects.set(a.id, obj);
  }
  const items = [...text.matchAll(tagRe('item'))].map(m => {
    const a = attrsOf(m[1]);
    return { objectid: a.objectid, transform: parseTransform(a.transform, unit), printable: a.printable !== '0' };
  });
  return { objects, items };
}

// model_settings.config: Name, Slot (extruder), Teiletyp je Bauteil und die Platten
function parseModelSettings(text) {
  const objects = new Map(), plates = [];
  if (!text) return { objects, plates };
  const meta = (xml, key) => { const m = new RegExp('<metadata key="' + key + '" value="([^"]*)"').exec(xml); return m ? m[1] : null; };
  for (const m of text.matchAll(blockRe('object'))) {
    const head = m[2].split('<part')[0], parts = new Map();
    for (const p of m[2].matchAll(blockRe('part'))) { const pa = attrsOf(p[1] || ''); parts.set(pa.id, { subtype: pa.subtype || 'normal_part', extruder: meta(p[2], 'extruder'), name: meta(p[2], 'name') }); }
    objects.set(attrsOf(m[1] || '').id, { name: meta(head, 'name'), extruder: meta(head, 'extruder'), parts });
  }
  for (const m of text.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
    // Instanzen einzeln: dasselbe Objekt kann mehrfach auf verschiedenen Platten stehen
    const inst = [...m[1].matchAll(/<model_instance>([\s\S]*?)<\/model_instance>/g)].map(x => ({ id: meta(x[1], 'object_id'), instance: +(meta(x[1], 'instance_id') || 0) }));
    plates.push({ id: +(meta(m[1], 'plater_id') || plates.length + 1), name: meta(m[1], 'plater_name') || '', objects: inst.map(x => x.id), instances: inst });
  }
  return { objects, plates };
}

const unxml = s => String(s).replace(/&(lt|gt|quot|apos|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[e]));

function parse3MF(fileName, zip, zipLib) {
  const text = p => zip[p] ? zipLib.strFromU8(zip[p]) : null;
  const rels = text('_rels/.rels') || '';
  const rootPath = ((/Target="\/?([^"]+\.model)"/.exec(rels) || [])[1]) || Object.keys(zip).find(k => /^3D\/[^/]+\.model$/i.test(k));
  if (!rootPath || !zip[rootPath]) throw Error('kein 3D-Modell in der 3MF gefunden');
  const models = new Map();
  const model = p => { if (!models.has(p)) { const t = text(p); if (t === null) throw Error(p + ' fehlt'); models.set(p, parseModelXML(t)); } return models.get(p); };
  const root = model(rootPath);
  const settings = parseModelSettings(text('Metadata/model_settings.config'));
  const plateOf = new Map();
  settings.plates.forEach(pl => pl.instances.forEach(x => plateOf.set(x.id + '#' + x.instance, pl.id)));
  const seen = new Map(); // Build-Items je Objekt zählen → Instanznummer

  // Alle Dreiecke eines Objekts (rekursiv über Komponenten) mit der Gesamttransformation sammeln
  function collect(path, id, T, skipPart, out, depth) {
    if (depth > 8) throw Error('verschachtelte Komponenten zu tief');
    const obj = model(path).objects.get(id);
    if (!obj) throw Error('Objekt ' + id + ' fehlt in ' + path);
    if (obj.mesh) {
      const { v, t } = obj.mesh;
      // Gespiegelt (Determinante < 0): Umlaufsinn tauschen, sonst zeigen die Normalen nach innen
      const det = T[0] * (T[4] * T[8] - T[5] * T[7]) - T[1] * (T[3] * T[8] - T[5] * T[6]) + T[2] * (T[3] * T[7] - T[4] * T[6]);
      const order = det < 0 ? [0, 2, 1] : [0, 1, 2];
      for (let j = 0; j < t.length; j++) {
        const i = j - j % 3 + order[j % 3];
        const k = t[i] * 3, x = v[k], y = v[k + 1], z = v[k + 2];
        out.push(x * T[0] + y * T[3] + z * T[6] + T[9], x * T[1] + y * T[4] + z * T[7] + T[10], x * T[2] + y * T[5] + z * T[8] + T[11]);
      }
    }
    for (const c of obj.components) {
      if (skipPart(c.objectid)) continue;
      collect(c.path ? c.path.replace(/^\//, '') : path, c.objectid, mulTransform(c.transform, T), () => false, out, depth + 1);
    }
  }

  const parts = [], notes = [];
  let skipped = 0;
  root.items.forEach(item => {
    const obj = root.objects.get(item.objectid);
    if (!obj || (obj.type && obj.type !== 'model')) return;
    const ms = settings.objects.get(item.objectid);
    // Modifier, Negativteile und Stützen-Blocker/-Erzwinger sind keine druckbaren Körper
    const skipPart = pid => { const p = ms && ms.parts.get(pid); const skip = !!p && p.subtype !== 'normal_part'; if (skip) skipped++; return skip; };
    const instance = seen.get(item.objectid) || 0;
    seen.set(item.objectid, instance + 1);
    const objName = unxml((ms && ms.name) || obj.name || 'Objekt ' + item.objectid);
    const plate = plateOf.get(item.objectid + '#' + instance) || 1;
    /* Mehrfarbig aus Teilen: ein Objekt, dessen druckbare Teile verschiedene Slots haben (z. B. Schild in
       Weiß + Relief in Schwarz), wird je Teil einzeln geführt – sonst gingen Slots und Farben im Tool
       verloren und die berechneten Werte landeten im Slot des Objekts statt in den gedruckten Slots
       (gemeldet 2026-10-01). partId = id des Teils in model_settings.config, für den Export. */
    const normal = ms ? [...ms.parts].filter(([, p]) => p.subtype === 'normal_part') : [];
    const slotOf = p => +(p.extruder || (ms && ms.extruder) || 0) || null;
    if (obj.components.length > 1 && normal.length > 1 && new Set(normal.map(([, p]) => slotOf(p))).size > 1) {
      for (const c of obj.components) {
        const p = ms.parts.get(c.objectid);
        if (p && p.subtype !== 'normal_part') { skipped++; continue; }
        const out = [];
        collect(c.path ? c.path.replace(/^\//, '') : rootPath, c.objectid, mulTransform(c.transform, item.transform), () => false, out, 1);
        if (!out.length) continue;
        parts.push({
          name: objName + ' · ' + unxml((p && p.name) || 'Teil ' + c.objectid),
          pos: Float32Array.from(out), objectId: item.objectid, partId: c.objectid, instance, transform: item.transform,
          extruder: p ? slotOf(p) : (ms && ms.extruder ? +ms.extruder : null), plate, printable: item.printable
        });
      }
      return;
    }
    const out = [];
    collect(rootPath, item.objectid, item.transform, skipPart, out, 0);
    if (!out.length) return;
    // Alle Teile mit demselben eigenen Slot: der gilt (Orca nimmt den Teil-Slot vor dem Objekt-Slot), und
    // beim Export muss ein geänderter Slot auch an diesen Teilen gesetzt werden (partIds)
    const own = normal.filter(([, p]) => p.extruder).map(([id]) => id);
    const common = own.length && own.length === normal.length ? slotOf(ms.parts.get(own[0])) : null;
    parts.push({
      name: objName,
      pos: Float32Array.from(out), objectId: item.objectid, instance, transform: item.transform, partIds: own.length ? own : undefined,
      extruder: common || (ms && ms.extruder ? +ms.extruder : null), plate, printable: item.printable
    });
  });
  if (!parts.length) throw Error('keine druckbaren Objekte in ' + fileName);
  if (skipped) notes.push(skipped + ' Modifier/Hilfskörper ausgelassen (werden nicht gedruckt).');
  let projectSettings = null;
  try { projectSettings = JSON.parse(text('Metadata/project_settings.config') || 'null'); } catch (e) { notes.push('Einstellungen der 3MF nicht lesbar – nur die Geometrie wird verwendet.'); }
  /* Nur Orca-/Bambu-Projekte (mit model_settings.config) werden als Projekt übernommen. Einfache 3MF aus
     Cura, PrusaSlicer oder CAD liefern nur die Form – wie eine STL, mit Lage-Tasten und Lochverstärkung
     (Entscheidung 2026-10-02). Bemalung aus PrusaSlicer geht dabei verloren. */
  if (!zip['Metadata/model_settings.config']) {
    notes.push('Einfache 3MF ohne Orca-/Bambu-Projektdaten: nur die Form wird übernommen, wie bei einer STL.');
    return { parts, notes, threemf: null };
  }
  return { parts, notes, threemf: { name: fileName, zip, plates: settings.plates, settings: projectSettings } };
}

/* ---------- Einstieg ---------- */
function stlParts(fileName, bytes) {
  const pos = readSTL(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const bodies = splitBodies(pos);
  const base = fileName.replace(/^.*[\\/]/, '');
  return bodies.map((p, i) => ({ name: bodies.length > 1 ? base + ' · Teil ' + (i + 1) : base, pos: p }));
}

// entries: [{name, bytes: Uint8Array}] – ausgewählte oder gezogene Dateien
function importModels(entries, zipLib) {
  const notes = [];
  let files = [];
  for (const e of entries) {
    if (/\.zip$/i.test(e.name)) {
      const zip = zipLib.unzipSync(e.bytes);
      const inner = Object.keys(zip).filter(k => MODEL_EXT.test(k) && !/(^|\/)(__MACOSX|\.)/.test(k) && zip[k].length);
      if (!inner.length) notes.push(e.name + ': keine STL/3MF darin.');
      files.push(...inner.map(k => ({ name: k.replace(/^.*\//, ''), bytes: zip[k], from: e.name })));
    } else if (MODEL_EXT.test(e.name)) files.push(e);
    else notes.push(e.name + ': nur STL, 3MF oder ZIP.');
  }
  // Makerworld-ZIPs enthalten oft dasselbe Modell als 3MF und als STLs: genau eine 3MF hat Vorrang.
  const tmf = files.filter(f => /\.3mf$/i.test(f.name));
  if (tmf.length === 1 && files.length > 1) {
    notes.push('Die 3MF „' + tmf[0].name + '“ wird verwendet, ' + (files.length - 1) + ' weitere Datei(en) ignoriert.');
    files = tmf;
  }
  if (!files.length) throw Error(notes.join(' ') || 'keine Modelldatei');

  const parts = [];
  let threemf = null;
  for (const f of files) {
    if (/\.3mf$/i.test(f.name)) {
      const r = parse3MF(f.name, zipLib.unzipSync(f.bytes), zipLib);
      parts.push(...r.parts); notes.push(...r.notes);
      if (files.length === 1) threemf = r.threemf;
    } else parts.push(...stlParts(f.name, f.bytes));
  }
  if (files.length > 1 && tmf.length) notes.push('Mehrere 3MF: nur die Geometrie wird übernommen, nicht Platten und Einstellungen.');
  const name = entries.length === 1 ? entries[0].name.replace(/^.*[\\/]/, '') : parts.length + ' Teile';
  return { name, parts, threemf, notes };
}
