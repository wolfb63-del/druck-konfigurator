'use strict';
/* 3MF-Export für OrcaSlicer. Basis ist die vom Nutzer in Orca gespeicherte Vorlage
   (ORCA_TEMPLATES, erzeugt aus templates/*.3mf). Überschrieben werden nur Werte, die der
   Konfigurator berechnet – alles andere (Druckerprofil, Start-G-Code, Grenzen) bleibt aus der
   Vorlage. Kein DOM-Zugriff: tests/verify-3mf.js prüft das Ergebnis mit der Orca-CLI. */

const ORCA_KIND = { pla: 'PLA', petg: 'PETG', abs: 'ABS', asa: 'ASA', tpu: 'TPU' };
const BED_TEMP_KEYS = ['hot_plate_temp', 'textured_plate_temp', 'cool_plate_temp', 'eng_plate_temp'];
const SEAM_ORCA = { Hinten: 'back', Ausgerichtet: 'aligned' };
const ACCEL_KEYS = [['Beschleunigung Standard', 'default_acceleration'], ['Beschleunigung Außenwand', 'outer_wall_acceleration'],
  ['Beschleunigung Innenwand', 'inner_wall_acceleration'], ['Beschleunigung massive Füllung', 'internal_solid_infill_acceleration'],
  ['Beschleunigung Füllung', 'sparse_infill_acceleration'], ['Beschleunigung obere Fläche', 'top_surface_acceleration']];
const PART_GAP_MM = 8;          // Abstand zwischen Teilen beim Anordnen
const PLATE_STRIDE = 1.2;       // Orca legt Platte n um 1,2 × Bettgröße versetzt ab (Spalten = ⌈√Platten⌉)
const objectPath = k => '/3D/Objects/object_' + k + '.model';

function exportTemplate(printerId, nozD) {
  if (printerId === 'orca') return typeof orcaActiveTemplate === 'function' ? orcaActiveTemplate(nozD) : null;
  return (ORCA_TEMPLATES[printerId] || {})[nozD] || null;
}

// Gleiche Zuordnung wie buildOrcaProcessJSON: Gyroid ist in beiden Mustervorschlägen die Primärempfehlung.
function orcaInfillPattern(pattern) { return pattern.indexOf('Gyroid') === 0 ? 'gyroid' : 'crosshatch'; }
const numStr = v => String(Math.round(Number(v) * 1000) / 1000);

// Brim-Empfehlung ("5–8 mm", "Nicht nötig", "0–5 mm") → [brim_type, brim_width]; untere Grenze als Startwert.
function orcaBrim(brim) {
  const m = /^(\d+(?:[.,]\d+)?)/.exec(brim);
  const w = m ? Number(m[1].replace(',', '.')) : 0;
  return w > 0 ? ['outer_only', numStr(w)] : ['no_brim', null];
}

/* Stützen wie im Datenblatt (Stützparameter): gleiches Material wie das Teil, Z-Abstand = Schichthöhe
   (PETG +0,05 mm), Spannen („1,0–1,5 mm“) mit der unteren Grenze. „Nur kritische Bereiche“ ändert bei
   Baumstützen nichts (per Orca-CLI geprüft 2026-09-26) und wird nur der Vollständigkeit halber gesetzt.
   Astabstand/-durchmesser: die v4-Werte entsprechen den organischen Baumstützen (Orca-Standard 1 mm / 2 mm);
   der klassische Astabstand (Standard 5 mm) bleibt unverändert. */
function supportChanges(r) {
  const sp = r.sp, tpu = r.tpu;
  const out = [
    ['Stützentyp', 'support_type', 'tree(auto)'],
    ['Schwellenwinkel', 'support_threshold_angle', sp.angle],
    ['Nur kritische Bereiche', 'support_critical_regions_only', 1],
    ['Nur auf Druckplatte', 'support_on_build_plate_only', 1],
    ['Kleine Überhänge entfernen', 'support_remove_small_overhang', sp.small === 'Ein' ? 1 : 0],
    ['Raft', 'raft_layers', 0],
    ['Oberer Z-Abstand', 'support_top_z_distance', numStr(r.supZ.top)],
    ['Unterer Z-Abstand', 'support_bottom_z_distance', numStr(r.supZ.bottom)],
    ['Stützen/Objekt XY-Abstand', 'support_object_xy_distance', numStr(lowerNum(sp.xy))],
    ['Abstand erste Schicht', 'support_object_first_layer_gap', tpu ? '0.25' : '0.2'],
    ['Obere Schnittstellenschichten', 'support_interface_top_layers', sp.iface],
    ['Untere Schnittstellenschichten', 'support_interface_bottom_layers', 1],
    ['Schnittstellenabstand', 'support_interface_spacing', numStr(lowerNum(sp.gap))],
    ['Abstand Grundmuster', 'support_base_pattern_spacing', tpu ? '3' : '2.5'],
    ['Wände um Stützen', 'tree_support_wall_count', 0],
    ['Stützspitze', 'tree_support_tip_diameter', '0.8'],
    ['Ast-Dichte', 'tree_support_top_rate', lowerNum(sp.density) + '%'],
    ['Astabstand', 'tree_support_branch_distance_organic', numStr(lowerNum(sp.branch))],
    ['Ast-Durchmesser', 'tree_support_branch_diameter_organic', '2']
  ];
  // Gleiches Material wie das Teil (Entscheidung 2026-09-26): 0 = Filament des Objekts
  out.push(['Stützenfilament', 'support_filament', 0], ['Schnittstellenfilament', 'support_interface_filament', 0]);
  return out;
}

/* Liefert die Werte, die in project_settings.config geschrieben werden, jeweils mit
   Beschriftung, damit Dialog und Test dieselbe Liste verwenden. slot ist 0-basiert.
   liveSlots (optional): echte Belegung vom Drucker [{type, colour}] – Typ und Farbe aller
   Slots werden übernommen, der gewählte Slot bekommt den Typ des gewählten Filaments. */
function plannedChanges(r, slot, liveSlots) {
  const f = []; // [Beschriftung, Key, Wert, Slot-Index oder null]
  const fil = (label, key, v, index = slot) => f.push([label, key, String(v), index]);
  const proc = (label, key, v) => f.push([label, key, String(v), null]);

  (liveSlots || []).forEach((s, i) => {
    if (s.colour) fil('Slot ' + (i + 1) + ' Farbe (Drucker)', 'filament_colour', s.colour, i);
    if (i !== slot && s.type) fil('Slot ' + (i + 1) + ' Typ (Drucker)', 'filament_type', s.type, i);
  });

  fil('Filamenttyp', 'filament_type', ORCA_KIND[r.m.kind] || 'PLA');
  fil('Düse', 'nozzle_temperature', r.nozzle);
  fil('Düse erste Schicht', 'nozzle_temperature_initial_layer', r.nozzle);
  BED_TEMP_KEYS.forEach(k => { fil('Heizbett (' + k.replace('_temp', '') + ')', k, r.m.bed); fil('Heizbett erste Schicht (' + k.replace('_temp', '') + ')', k + '_initial_layer', r.m.bed); });
  fil('Lüfter min.', 'fan_min_speed', r.m.fan);
  fil('Lüfter max.', 'fan_max_speed', r.m.fan);
  fil('Max. Volumenstrom', 'filament_max_volumetric_speed', numStr(r.maxVol));
  fil('Durchflussverhältnis', 'filament_flow_ratio', numStr(r.m.flow));
  // Lüfter erste Schicht und Z-Hop als Filament-Überschreibung je Slot. Den Rückzug schreibt das Tool
  // bewusst nicht: er hängt von Filament, Temperatur und Extruder ab, das Orca-Filamentprofil des Slots
  // bringt passende Werte mit (Entscheidung des Nutzers 2026-09-26, bisherige Standardwerte passten).
  fil('Lüfter erste Schicht aus', 'close_fan_the_first_x_layers', Number(r.m.fanFirst) > 0 ? 0 : 1);
  const isNum = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  if (isNum(r.m.zhop)) fil('Z-Hop', 'filament_z_hop', numStr(r.m.zhop));
  if (r.m.pa !== null && r.m.pa !== undefined && r.m.pa !== '') {
    fil('Pressure Advance', 'pressure_advance', numStr(r.m.pa));
    fil('Pressure Advance aktiv', 'enable_pressure_advance', 1);
  }

  proc('Schichthöhe', 'layer_height', numStr(r.layer));
  proc('Erste Schicht', 'initial_layer_print_height', numStr(r.firstLayer));
  proc('Wandlinien', 'wall_loops', r.w);
  proc('Fülldichte', 'sparse_infill_density', r.inf + '%');
  proc('Füllmuster', 'sparse_infill_pattern', orcaInfillPattern(r.pattern));
  proc('Obere Schichten', 'top_shell_layers', r.t);
  proc('Untere Schichten', 'bottom_shell_layers', r.b);
  proc('Außenwand', 'outer_wall_speed', r.sp_outer);
  proc('Innenwand', 'inner_wall_speed', r.sp_inner);
  proc('Füllung', 'sparse_infill_speed', r.sp_fill);
  proc('Innere massive Füllung', 'internal_solid_infill_speed', r.sp_fill);
  proc('Obere Fläche', 'top_surface_speed', r.top);
  proc('Lückenfüllung', 'gap_infill_speed', r.m.gap);
  proc('Erste Schicht Geschwindigkeit', 'initial_layer_speed', r.m.first);
  proc('Travel', 'travel_speed', r.m.travel);
  // Beschleunigung nur, wenn das Datenblatt sie vorgibt (TPU 800 mm/s²); sonst bleibt das Werksprofil.
  // Druckbewegungen werden begrenzt, Travel und erste Schicht (500 mm/s² in den Vorlagen) bleiben.
  if (Number(r.m.accel) > 0) ACCEL_KEYS.forEach(([label, key]) => proc(label, key, numStr(r.m.accel)));
  proc('Stützen', 'enable_support', r.supOn ? 1 : 0);
  if (r.supOn) supportChanges(r).forEach(([label, key, v]) => proc(label, key, v));
  const [brimType, brimWidth] = orcaBrim(r.brim);
  proc('Brim', 'brim_type', brimType);
  if (brimWidth) proc('Brim-Breite', 'brim_width', brimWidth);
  if (SEAM_ORCA[r.seam]) proc('Nahtposition', 'seam_position', SEAM_ORCA[r.seam]);
  if (r.o === 'watertight') {  // Lücken zwischen den Bahnen sind die typischen Undichtigkeiten
    proc('Lückenfüllung', 'gap_fill_target', 'everywhere');
    proc('Vertikale Schalendicke sicherstellen', 'ensure_vertical_shell_thickness', 'ensure_all');
  }
  return f.map(([label, key, value, index]) => ({ label, key, value, perSlot: index !== null, index }));
}

// Neue project_settings (Kopie) + Liste der tatsächlichen Änderungen gegenüber der Vorlage.
/* OrcaSlicer-GUI lädt beim Öffnen eines Projekts die genannten System-Presets neu und übernimmt aus
   der Datei nur die Schlüssel, die in different_settings_to_system stehen (Aufbau wie von Orca selbst
   gespeichert: [Prozess, Filament 1..n, Drucker], Schlüssel mit ";" getrennt). Ohne diese Liste
   landen in der Oberfläche die Presetwerte statt der exportierten (beobachtet 2026-09-26). */
function filamentSlotTypes(r, slot, liveSlots, n, extra = []) {
  const types = Array(n).fill(null);
  (liveSlots || []).forEach((s, i) => { if (i < n && s.type) types[i] = s.type; });
  extra.forEach(e => { if (e.slot < n) types[e.slot] = ORCA_KIND[e.r.m.kind] || types[e.slot]; });
  types[slot] = ORCA_KIND[r.m.kind] || types[slot];
  return types;
}

/* extra: [{slot, r}] – weitere Slots, die Teile mit eigenem Filament belegen. Dort werden nur die
   Filamentwerte (Temperaturen, Lüfter, Fluss …) aus dem Ergebnis dieses Teils geschrieben. */
function buildProjectSettings(tpl, r, slot, liveSlots, extra = []) {
  const settings = JSON.parse(JSON.stringify(tpl.settings));
  const changes = [];
  const nFil = settings.filament_settings_id.length;
  const groups = nFil + 2; // Prozess, Filamente, Drucker
  const tplDiff = tpl.settings.different_settings_to_system || [];
  const diff = Array.from({ length: groups }, (_, i) => new Set(String(tplDiff[i] || '').split(';').filter(Boolean)));
  const inherits = Array.from({ length: groups }, (_, i) => (tpl.settings.inherits_group || [])[i] || '');

  // 1) Jeder Slot bekommt das System-Preset seines Filamenttyps (sofern Orca eines kennt)
  const presets = tpl.filamentPresets || {};
  filamentSlotTypes(r, slot, liveSlots, nFil, extra).forEach((type, i) => {
    const preset = type && presets[String(type).toUpperCase()];
    if (!preset || settings.filament_settings_id[i] === preset) return;
    changes.push({ label: 'Slot ' + (i + 1) + ' Preset', key: 'filament_settings_id', before: settings.filament_settings_id[i], after: preset });
    settings.filament_settings_id[i] = preset;
    diff[1 + i].clear();    // Abweichungen der alten (Benutzer-)Presets gelten nicht mehr
    inherits[1 + i] = '';   // direkt ein System-Preset
    // Kennt die Vorlage die Werte des Profils (Orca-Drucker), auch diese in den Slot übernehmen –
    // sonst rechnet die Orca-CLI mit den Werten des vorigen Profils (die Oberfläche lädt sie neu).
    const vals = tpl.filamentValues && tpl.filamentValues[String(type).toUpperCase()];
    if (vals) for (const [k, v] of Object.entries(vals)) if (k !== 'filament_settings_id' && Array.isArray(settings[k]) && i < settings[k].length) settings[k][i] = Array.isArray(v) ? v[0] : v;
  });

  // 2) Berechnete Werte schreiben und als „geändert“ vermerken
  const extraFil = extra.flatMap(e => plannedChanges(e.r, e.slot, null)
    .filter(c => c.perSlot && c.index === e.slot)
    .map(c => ({ ...c, label: 'Slot ' + (e.slot + 1) + ': ' + c.label })));
  for (const c of [...plannedChanges(r, slot, liveSlots), ...extraFil]) {
    if (!(c.key in settings)) continue; // Schlüssel kennt diese Orca-Version nicht → Vorlage unverändert
    if (c.perSlot && !(c.index < settings[c.key].length)) continue; // mehr Druckerslots als in der Vorlage
    const before = c.perSlot ? settings[c.key][c.index] : settings[c.key];
    if (c.perSlot) settings[c.key][c.index] = c.value; else settings[c.key] = c.value;
    diff[c.perSlot ? 1 + c.index : 0].add(c.key);
    if (before !== c.value) changes.push({ label: c.label, key: c.key, before, after: c.value });
  }
  settings.different_settings_to_system = diff.map(s => [...s].join(';'));
  settings.inherits_group = inherits;
  return { settings, changes };
}

/* Prozesswerte, die Orca je Objekt überschreiben kann (Objekt-Einstellungen). Schichthöhe, erste Schicht,
   Travel und Erste-Schicht-Geschwindigkeit gelten für die ganze Platte und bleiben global. */
const OBJECT_KEYS = new Set(['wall_loops', 'sparse_infill_density', 'sparse_infill_pattern', 'top_shell_layers', 'bottom_shell_layers',
  'outer_wall_speed', 'inner_wall_speed', 'sparse_infill_speed', 'internal_solid_infill_speed', 'top_surface_speed', 'gap_infill_speed',
  'enable_support', 'raft_layers', 'brim_type', 'brim_width', 'seam_position', 'gap_fill_target', 'ensure_vertical_shell_thickness']);
const isObjectKey = k => OBJECT_KEYS.has(k) || /^(support_|tree_support_)/.test(k);

// Abweichungen eines Teils von den globalen Werten → [{label, key, value}] für model_settings.config
function objectOverrides(settings, pr) {
  return plannedChanges(pr, 0, null).filter(c => !c.perSlot && isObjectKey(c.key) && c.key in settings && String(settings[c.key]) !== c.value);
}

const xmlEsc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const uuid = (n, tail) => ('0000' + n.toString(16)).slice(-4) + '0000-' + tail;
const coord = v => String(Math.round(v * 1e5) / 1e5);

// Netz als 3MF-Objekt: gemeinsame Eckpunkte, lokal um den Mittelpunkt zentriert (wie Orca es speichert).
// Ein Netz als <object>; center = Mittelpunkt des Teils, damit Modifikatoren relativ dazu passen
function meshObjectXML(pos, center, id) {
  const [cx, cy, cz] = center, n = pos.length / 9;
  const index = new Map(), verts = [], tris = [];
  for (let i = 0; i < n; i++) {
    const t = [];
    for (let v = 0; v < 3; v++) {
      const o = i * 9 + v * 3;
      const x = coord(pos[o] - cx), y = coord(pos[o + 1] - cy), z = coord(pos[o + 2] - cz);
      const key = x + ' ' + y + ' ' + z;
      let vid = index.get(key);
      if (vid === undefined) { vid = verts.length; index.set(key, vid); verts.push('     <vertex x="' + x + '" y="' + y + '" z="' + z + '"/>'); }
      t.push(vid);
    }
    if (t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]) tris.push('     <triangle v1="' + t[0] + '" v2="' + t[1] + '" v3="' + t[2] + '"/>');
  }
  return '  <object id="' + id + '" p:UUID="' + uuid(id, '81cb-4c03-9d28-80fed5dfa1dc') + '" type="model">\n   <mesh>\n    <vertices>\n' +
    verts.join('\n') + '\n    </vertices>\n    <triangles>\n' + tris.join('\n') + '\n    </triangles>\n   </mesh>\n  </object>\n';
}

// Netz-Datei eines Teils: das Teil selbst (id) und seine Modifikatoren (mods: [{id, pos}])
function meshModelXML(geom, id = 1, mods = []) {
  const center = [(geom.mn[0] + geom.mx[0]) / 2, (geom.mn[1] + geom.mx[1]) / 2, (geom.mn[2] + geom.mx[2]) / 2];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n' +
    ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n' + meshObjectXML(geom.pos, center, id) +
    mods.map(m => meshObjectXML(m.pos, center, m.id)).join('') + ' </resources>\n <build/>\n</model>\n';
}

/* Bohrloch-Verstärkung: je gewähltem Loch ein Orca-Modifikator (Zylinder) mit 100 % Füllung.
   Ids liegen weit über denen der Teile, damit sie in keiner Datei kollidieren. */
const HOLE_MOD_ID_BASE = 10000;
const HOLE_MOD_SETTINGS = [['sparse_infill_density', '100%']];
function holeMods(k, holes) {
  return (holes || []).map((h, j) => ({ id: HOLE_MOD_ID_BASE + k * 1000 + j + 1, pos: holeModifierMesh(h), name: 'Verstärkung Loch ' + h.id + ' (Ø ' + de(2 * h.r, 1) + ' mm)' }));
}

function bedSize(tpl) {
  const pts = (tpl.settings.printable_area || []).map(p => p.split('x').map(Number));
  if (!pts.length) return [tpl.bedCenter[0] * 2, tpl.bedCenter[1] * 2];
  return [0, 1].map(k => Math.max(...pts.map(p => p[k])) - Math.min(...pts.map(p => p[k])));
}

/* Teile zeilenweise aufs Bett legen; passt keine Zeile mehr, beginnt eine neue Platte.
   Ergebnis je Teil: {plate (0-basiert), x, y} = Mitte in Orca-Weltkoordinaten. */
function arrangeParts(geoms, tpl) {
  const [bw, bd] = bedSize(tpl), [bx, by] = tpl.bedCenter, gap = PART_GAP_MM;
  const order = geoms.map((g, i) => i).sort((a, b) => geoms[b].y - geoms[a].y || geoms[b].x - geoms[a].x);
  const plates = [];   // je Platte Zeilen: {y0, depth, width, items:[{i, x0}]}
  let rows = [];
  plates.push(rows);
  const nextY = () => rows.length ? rows[rows.length - 1].y0 + rows[rows.length - 1].depth + gap : 0;
  for (const i of order) {
    const g = geoms[i];
    let row = rows.find(r => r.width + gap + g.x <= bw && g.y <= r.depth);
    if (!row) {
      if (rows.length && nextY() + g.y > bd) { rows = []; plates.push(rows); }
      row = { y0: nextY(), depth: g.y, width: -gap, items: [] };
      rows.push(row);
    }
    row.items.push({ i, x0: row.width + gap });
    row.width += gap + g.x;
  }
  const cols = Math.ceil(Math.sqrt(plates.length)), places = [];
  plates.forEach((prow, pi) => {
    const usedW = Math.max(...prow.map(r => r.width)), last = prow[prow.length - 1], usedD = last.y0 + last.depth;
    const ox = (pi % cols) * bw * PLATE_STRIDE + bx - usedW / 2, oy = -Math.floor(pi / cols) * bd * PLATE_STRIDE + by - usedD / 2;
    prow.forEach(r => r.items.forEach(it => {
      places[it.i] = { plate: pi, x: ox + it.x0 + geoms[it.i].x / 2, y: oy + r.y0 + r.depth / 2 };
    }));
  });
  // Teile, die größer als das Bett sind, lassen sich nicht sinnvoll platzieren → Hinweis im Dialog
  const oversize = geoms.map((g, i) => i).filter(i => geoms[i].x > bw || geoms[i].y > bd);
  return { places, plateCount: plates.length, oversize };
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
const MODEL_OPEN = '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n';
const REL_TYPE = 'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel';

function modelSettingsXML(objs, plateCount) {
  const object = o => '  <object id="' + o.id + '">\n    <metadata key="name" value="' + o.name + '"/>\n    <metadata key="extruder" value="' + o.extruder + '"/>\n' +
    o.overrides.map(c => '    <metadata key="' + c.key + '" value="' + xmlEsc(c.value) + '"/>\n').join('') +
    '    <part id="' + o.k + '" subtype="normal_part">\n      <metadata key="name" value="' + o.name + '"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n      <metadata key="source_file" value="' + o.name + '"/>\n' +
    '      <metadata key="source_object_id" value="0"/>\n      <metadata key="source_volume_id" value="0"/>\n      <metadata key="source_offset_x" value="0"/>\n      <metadata key="source_offset_y" value="0"/>\n      <metadata key="source_offset_z" value="0"/>\n    </part>\n' +
    (o.mods || []).map(m => '    <part id="' + m.id + '" subtype="modifier_part">\n      <metadata key="name" value="' + xmlEsc(m.name) + '"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n' +
      HOLE_MOD_SETTINGS.map(([k, v]) => '      <metadata key="' + k + '" value="' + v + '"/>\n').join('') + '    </part>\n').join('') + '  </object>\n';
  const instance = o => '    <model_instance>\n      <metadata key="object_id" value="' + o.id + '"/>\n      <metadata key="instance_id" value="0"/>\n      <metadata key="identify_id" value="' + o.k + '"/>\n    </model_instance>\n';
  const plate = pi => '  <plate>\n    <metadata key="plater_id" value="' + (pi + 1) + '"/>\n    <metadata key="plater_name" value=""/>\n    <metadata key="locked" value="false"/>\n' +
    objs.filter(o => o.place.plate === pi).map(instance).join('') + '  </plate>\n';
  return XML_HEAD + '<config>\n' + objs.map(object).join('') + Array.from({ length: plateCount }, (_, pi) => plate(pi)).join('') +
    '  <assemble>\n' + objs.map(o => '   <assemble_item object_id="' + o.id + '" instance_id="0" transform="1 0 0 0 1 0 0 0 1 ' + coord(o.place.x) + ' ' + coord(o.place.y) + ' ' + o.hz + '" offset="0 0 0" />\n').join('') + '  </assemble>\n</config>\n';
}

// parts: ein geom (Einzelteil) oder [{geom}] – alle Teile bekommen dieselben Werte und den gewählten Slot.
/* parts: ein geom oder [{geom, r?, slot?}]. r/slot = Werte und Slot für alle Teile ohne eigene Angabe.
   Teile mit eigenem r bekommen abweichende Prozesswerte als Objekt-Einstellung, ein eigener Slot
   bekommt die Filamentwerte dieses Teils. notes: Werte, die Orca nur global kennt. */
/* Welche Slots welche Filamentwerte bekommen: der Standard-Slot die von r, jeder weitere Slot die des
   ersten Teils darin. Teile mit anderem Material im selben Slot → Hinweis (Orca kennt ein Filament je Slot). */
function slotPlan(items, r, slot) {
  const partSlot = p => (p.slot === null || p.slot === undefined ? slot : p.slot);
  const extra = [], notes = [];
  for (const p of items) {
    const ps = partSlot(p), pr = p.r || r;
    if (ps === slot) { if (pr.m.kind !== r.m.kind) notes.push(p.geom.name + ': ' + pr.m.name + ' im selben Slot wie ' + r.m.name + ' – es gelten die Filamentwerte von ' + r.m.name + '.'); continue; }
    const other = extra.find(e => e.slot === ps);
    if (!other) extra.push({ slot: ps, r: pr });
    else if (other.r.m.kind !== pr.m.kind) notes.push(p.geom.name + ': Slot ' + (ps + 1) + ' ist schon mit ' + other.r.m.name + ' belegt – es gelten dessen Filamentwerte.');
  }
  for (const p of items) if (p.r && Math.abs(p.r.layer - r.layer) > 1e-9) notes.push(p.geom.name + ': Schichthöhe ' + de(p.r.layer, 2) + ' mm empfohlen – Orca nutzt für alle Teile ' + de(r.layer, 2) + ' mm.');
  return { extra, notes, partSlot };
}

function build3mfFiles(tpl, r, parts, slot, liveSlots) {
  const items = (Array.isArray(parts) ? parts : [parts]).map(p => p.geom ? p : { geom: p });
  const list = items.map(p => p.geom);
  const { extra, notes, partSlot } = slotPlan(items, r, slot);
  const { settings, changes } = buildProjectSettings(tpl, r, slot, liveSlots, extra);
  const { places, plateCount } = arrangeParts(list, tpl);
  const n = list.length, title = xmlEsc(n === 1 ? list[0].name : n + ' Teile');
  // Netz k (1..n) liegt in object_k.model mit id k; das Objekt im Hauptmodell hat id n+k.
  const objs = items.map((p, i) => ({ g: p.geom, k: i + 1, id: n + i + 1, name: xmlEsc(p.geom.name), hz: coord(p.geom.z / 2), place: places[i],
    extruder: partSlot(p) + 1, overrides: p.r ? objectOverrides(settings, p.r) : [], mods: holeMods(i + 1, p.holes) }));
  const objectChanges = objs.filter(o => o.overrides.length).map(o => ({ name: o.g.name, changes: o.overrides }));
  const files = {
    '[Content_Types].xml': XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n <Default Extension="png" ContentType="image/png"/>\n <Default Extension="gcode" ContentType="text/x.gcode"/>\n</Types>\n',
    '_rels/.rels': XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="' + REL_TYPE + '"/>\n</Relationships>\n',
    '3D/_rels/3dmodel.model.rels': XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      objs.map(o => ' <Relationship Target="' + objectPath(o.k) + '" Id="rel-' + o.k + '" Type="' + REL_TYPE + '"/>\n').join('') + '</Relationships>\n',
    '3D/3dmodel.model': XML_HEAD + MODEL_OPEN +
      ' <metadata name="Application">BambuStudio-02.06.00.51</metadata>\n <metadata name="OrcaSlicer">' + xmlEsc(tpl.orcaVersion) + '</metadata>\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n <metadata name="Title">' + title + '</metadata>\n <resources>\n' +
      objs.map(o => '  <object id="' + o.id + '" p:UUID="' + uuid(o.k, '61cb-4c03-9d28-80fed5dfa1dc') + '" type="model">\n   <components>\n    <component p:path="' + objectPath(o.k) + '" objectid="' + o.k + '" p:UUID="' + uuid(o.k, 'b206-40ff-9872-83e8017abed1') + '" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n' +
        o.mods.map(m => '    <component p:path="' + objectPath(o.k) + '" objectid="' + m.id + '" p:UUID="' + uuid(m.id, 'b206-40ff-9872-83e8017abed1') + '" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n').join('') +
        '   </components>\n  </object>\n').join('') +
      ' </resources>\n <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">\n' +
      objs.map(o => '  <item objectid="' + o.id + '" p:UUID="' + uuid(o.id, 'b1ec-4553-aec9-835e5b724bb4') + '" transform="1 0 0 0 1 0 0 0 1 ' + coord(o.place.x) + ' ' + coord(o.place.y) + ' ' + o.hz + '" printable="1"/>\n').join('') +
      ' </build>\n</model>\n',
    'Metadata/model_settings.config': modelSettingsXML(objs, plateCount),
    'Metadata/project_settings.config': JSON.stringify(settings, null, 4),
    'Metadata/slice_info.config': XML_HEAD + '<config>\n  <header>\n    <header_item key="X-BBL-Client-Type" value="slicer"/>\n    <header_item key="X-BBL-Client-Version" value="02.06.00.51"/>\n    <header_item key="OrcaSlicer-Version" value="' + xmlEsc(tpl.orcaVersion) + '"/>\n  </header>\n</config>\n',
    'Metadata/filament_sequence.json': JSON.stringify(Object.fromEntries(Array.from({ length: plateCount }, (_, pi) => ['plate_' + (pi + 1), { nozzle_sequence: [], optimal_assignment: [], sequence: [] }])))
  };
  objs.forEach(o => { files[objectPath(o.k).slice(1)] = meshModelXML(o.g, o.k, o.mods); });
  return { files, changes, plateCount, objectChanges, notes };
}

/* ---------- Vorhandene 3MF (z. B. Makerworld) auf den eigenen Drucker umstellen ----------
   Entscheidung 2026-09-26: Lage, Platten, Farben und Bemalung des Designers bleiben. Ersetzt werden
   die Einstellungen (project_settings aus der eigenen Orca-Vorlage + berechnete Werte), je Objekt
   Slot und die selbst berechneten Objektwerte; jede Platte wird auf die Bettmitte gerückt. */
const PLATE_SLICE_FILES = /^Metadata\/plate_\d+\.gcode(\.md5)?$/;

// Mitte der Teile je Platte → Verschiebung auf die Bettmitte der Platte im eigenen Drucker
function plateShifts(jobs, tpl) {
  const [bw, bd] = bedSize(tpl), [bx, by] = tpl.bedCenter;
  const ids = [...new Set(jobs.map(j => j.plate || 1))].sort((a, b) => a - b);
  const count = Math.max(...ids), cols = Math.ceil(Math.sqrt(count)), shifts = new Map(), oversize = [];
  for (const id of ids) {
    const on = jobs.filter(j => (j.plate || 1) === id);
    const mnx = Math.min(...on.map(j => j.geom.mn[0])), mxx = Math.max(...on.map(j => j.geom.mx[0]));
    const mny = Math.min(...on.map(j => j.geom.mn[1])), mxy = Math.max(...on.map(j => j.geom.mx[1]));
    const pi = id - 1, tx = (pi % cols) * bw * PLATE_STRIDE + bx, ty = -Math.floor(pi / cols) * bd * PLATE_STRIDE + by;
    shifts.set(id, [tx - (mnx + mxx) / 2, ty - (mny + mxy) / 2]);
    if (mxx - mnx > bw || mxy - mny > bd) oversize.push(id);
  }
  return { shifts, oversize };
}

// Objekt-Kopf in model_settings.config: Slot setzen, eigene Werte setzen bzw. auf global zurücknehmen
function patchObjectHead(head, extruder, own, computedKeys) {
  const setMeta = (h, key, value) => {
    const re = new RegExp('(<metadata key="' + key + '" value=")[^"]*(")');
    return re.test(h) ? h.replace(re, '$1' + xmlEsc(value) + '$2') : h.replace(/(<object id="[^"]*">\n?)/, '$1    <metadata key="' + key + '" value="' + xmlEsc(value) + '"/>\n');
  };
  let h = setMeta(head, 'extruder', extruder);
  const ownKeys = new Set(own.map(c => c.key));
  for (const key of computedKeys) if (!ownKeys.has(key)) h = h.replace(new RegExp('[ \\t]*<metadata key="' + key + '" value="[^"]*"/>\\n?', 'g'), '');
  for (const c of own) h = setMeta(h, c.key, c.value);
  return h;
}

// Slot eines einzelnen Teils (<part id> innerhalb von <object id>) in model_settings.config setzen
function patchPartExtruder(ms, objectId, partId, extruder) {
  const oe = String(objectId).replace(/[^\w-]/g, ''), pe = String(partId).replace(/[^\w-]/g, '');
  return ms.replace(new RegExp('(<object id="' + oe + '">[\\s\\S]*?<part id="' + pe + '"[^>]*>)([\\s\\S]*?)(</part>)'), (all, open, body, close) => {
    const re = /(<metadata key="extruder" value=")[^"]*(")/;
    if (re.test(body)) return open + body.replace(re, '$1' + extruder + '$2') + close;
    return open + '\n      <metadata key="extruder" value="' + extruder + '"/>' + body + close;
  });
}

/* Umkehrung einer 3MF-Transformation (Zeilenvektoren: p' = p·M + t, Werte wie in import.js) */
function invertTransform(t) {
  const [a, b, c, d, e, f, g, h, i] = t;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const m = [A, c * h - b * i, b * f - c * e, B, a * i - c * g, c * d - a * f, C, b * g - a * h, a * e - b * d].map(v => v / det);
  const [x, y, z] = [t[9], t[10], t[11]];
  return { m: [...m, -(x * m[0] + y * m[3] + z * m[6]), -(x * m[1] + y * m[4] + z * m[7]), -(x * m[2] + y * m[5] + z * m[8])], mirrored: det < 0 };
}
// Dreiecke (Bett-Koordinaten) ins Objekt-Koordinatensystem; bei Spiegelung Umlaufsinn tauschen, damit die Normalen nach außen zeigen
function toObjectFrame(pos, inv) {
  const T = inv.m, out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    out[i] = x * T[0] + y * T[3] + z * T[6] + T[9]; out[i + 1] = x * T[1] + y * T[4] + z * T[7] + T[10]; out[i + 2] = x * T[2] + y * T[5] + z * T[8] + T[11];
  }
  if (inv.mirrored) for (let i = 0; i < out.length; i += 9) for (let k = 0; k < 3; k++) { const v = out[i + 3 + k]; out[i + 3 + k] = out[i + 6 + k]; out[i + 6 + k] = v; }
  return out;
}

/* Bohrloch-Verstärkung in einer übernommenen 3MF (Entscheidung 2026-10-02): die Modifikator-Netze kommen
   in eine eigene Netz-Datei, hängen als Komponente (ohne eigene Transformation) am Objekt und stehen in
   model_settings als modifier_part. Die Löcher liegen in Bett-Koordinaten der Quelldatei; die Umkehrung
   der Item-Transformation bringt sie ins Objekt-System. Mehrere Instanzen teilen ein Objekt: gleiche
   Modifikatoren werden nur einmal angelegt (und gelten in Orca für alle Kopien). Ist das Objekt nicht
   eindeutig (holeTargetOk), wird nichts angelegt – Orca würde den Zylinder sonst als festen Körper drucken.
   Ein Modifikator aus einem früheren Export wird nicht noch einmal angelegt. Erkannt wird er an Durchmesser
   und Lage im Objekt-System (0,1 mm), die im Namen stehen – nicht an der Loch-Nummer: die ändert sich beim
   erneuten Einlesen, wenn Teile zusammengefasst werden (Befund der Prüfung 2026-10-02). Liegt eine Mitte
   genau auf einer Rundungsgrenze, kann trotzdem ein zweiter entstehen – harmlos, beide 100 %. */
// Objekt im Hauptmodell bis zum Ende seiner Komponentenliste – nie über das eigene </object> hinaus
const rootObjectRe = oid => new RegExp('(<(?:\\w+:)?object\\b[^>]*\\bid="' + oid + '"[^>]*>(?:(?!</(?:\\w+:)?object>)[\\s\\S])*?)(</(?:\\w+:)?components>)');
/* Darf am Objekt ein Modifikator hängen? Nur wenn alles eindeutig ist (Befunde der Prüfung 2026-10-02):
   Hauptmodell in mm und mit p-Namensraum, Objekt aus Komponenten, und model_settings führt genau so viele
   Teile wie Komponenten – Orca ordnet Teile und Einstellungen sonst womöglich über die Reihenfolge zu
   (unbestätigt), und der Zylinder würde zum festen Körper.
   Bekannte Grenze: geprüft wird nur die Einheit des Hauptmodells; die Modifikator-Netze sind in mm. Hätte eine
   Objekt-Datei eine andere Einheit, könnte die Lage abweichen (unbestätigt, Orca/Bambu schreiben immer mm). */
function holeTargetOk(root, ms, oid) {
  const unit = (/<(?:\w+:)?model\b[^>]*\bunit="([^"]+)"/.exec(root) || [])[1] || 'millimeter';
  if (unit !== 'millimeter' || !/<(?:\w+:)?model\b[^>]*\bxmlns:p="/.test(root)) return false;
  const obj = rootObjectRe(oid).exec(root), msObj = new RegExp('<object id="' + oid + '">([\\s\\S]*?)</object>').exec(ms);
  if (!obj || !msObj) return false;
  const comps = (obj[1].match(/<(?:\w+:)?component\b/g) || []).length, parts = (msObj[1].match(/<part\b/g) || []).length;
  return comps > 0 && comps === parts;
}
function addHoleModifiers(out, ms, items, rootPath, zipLib, notes) {
  const withHoles = items.filter(j => j.holes && j.holes.length);
  if (!withHoles.length) return ms;
  const models = Object.keys(out).filter(k => /\.model$/i.test(k));
  let nextId = 0;
  for (const k of models) for (const m of zipLib.strFromU8(out[k]).matchAll(/<(?:\w+:)?object\b[^>]*?\bid="(\d+)"/g)) nextId = Math.max(nextId, +m[1]);
  nextId = Math.max(nextId + 1, HOLE_MOD_ID_BASE);
  let file = 'verstaerkung.model', n = 1;
  while (out['3D/Objects/' + file]) file = 'verstaerkung_' + (++n) + '.model';
  const path = '/3D/Objects/' + file;
  let root = zipLib.strFromU8(out[rootPath]);
  const meshes = [], byObject = new Map(), refused = new Set();
  for (const j of withHoles) {
    const name = j.geom.name, oid = String(j.part.objectId).replace(/[^\w-]/g, '');
    const inv = j.part.transform ? invertTransform(j.part.transform) : null;
    if (!byObject.has(oid) && !(inv && holeTargetOk(root, ms, oid))) {
      if (!refused.has(oid)) notes.push(name + ': Lochverstärkung in dieser 3MF nicht möglich – bitte in Orca einen Modifikator setzen.');
      refused.add(oid);
      continue;
    }
    if (!inv || refused.has(oid)) continue;
    const msObj = (new RegExp('<object id="' + oid + '">[\\s\\S]*?</object>').exec(ms) || [''])[0];
    const seen = byObject.get(oid) || byObject.set(oid, { keys: new Set(), mods: [] }).get(oid);
    for (const h of j.holes) {
      const pos = toObjectFrame(holeModifierMesh(h), inv);
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.length; i++) { const a = i % 3; mn[a] = Math.min(mn[a], pos[i]); mx[a] = Math.max(mx[a], pos[i]); }
      const where = '(Ø ' + de(2 * h.r, 1) + ' mm, bei ' + [0, 1, 2].map(a => de(Math.round((mn[a] + mx[a]) * 5) / 10 || 0, 1)).join(' / ') + ')';
      if (msObj.includes(xmlEsc(where) + '"')) continue;   // schon aus einem früheren Export vorhanden
      const label = 'Verstärkung Loch ' + h.id + ' ' + where;
      const key = mn.concat(mx).map(v => Math.round(v * 100)).join(',');
      if (seen.keys.has(key)) continue;
      seen.keys.add(key);
      const id = nextId++;
      meshes.push(meshObjectXML(pos, [0, 0, 0], id));
      seen.mods.push({ id, name: label });
    }
  }
  if (!meshes.length) return ms;
  for (const [oid, { mods }] of byObject) {
    if (!mods.length) continue;
    const copies = new Set(items.filter(j => String(j.part.objectId) === oid).map(j => j.part.instance || 0)).size;
    if (copies > 1) notes.push(withHoles.find(j => String(j.part.objectId) === oid).geom.name + ': steht ' + copies + '-mal auf dem Bett – die Lochverstärkung gilt für alle Kopien (Orca hängt sie ans Objekt).');
    const comps = mods.map(m => '    <component p:path="' + path + '" objectid="' + m.id + '" p:UUID="' + uuid(m.id, 'b206-40ff-9872-83e8017abed1') + '" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n').join('');
    root = root.replace(rootObjectRe(oid), (all, body, close) => body + comps + close);
    const parts = mods.map(m => '    <part id="' + m.id + '" subtype="modifier_part">\n      <metadata key="name" value="' + xmlEsc(m.name) + '"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n' +
      HOLE_MOD_SETTINGS.map(([k, v]) => '      <metadata key="' + k + '" value="' + v + '"/>\n').join('') + '    </part>\n').join('');
    ms = ms.replace(new RegExp('(<object id="' + oid + '">[\\s\\S]*?)(</object>)'), (all, body, close) => body + parts + '  ' + close);
  }
  out[rootPath] = zipLib.strToU8(root);
  out['3D/Objects/' + file] = zipLib.strToU8(XML_HEAD + MODEL_OPEN + ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n' + meshes.join('') + ' </resources>\n <build/>\n</model>\n');
  const relsPath = '3D/_rels/3dmodel.model.rels', rel = ' <Relationship Target="' + path + '" Id="rel-verstaerkung-' + n + '" Type="' + REL_TYPE + '"/>\n';
  out[relsPath] = zipLib.strToU8(out[relsPath]
    ? zipLib.strFromU8(out[relsPath]).replace(/<\/Relationships>/, rel + '</Relationships>')
    : XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' + rel + '</Relationships>\n');
  return ms;
}

/* jobs: [{geom, r, slot, part:{objectId, partId?, plate}}] wie aus partJobs(); threemf = Import-Ergebnis mit zip.
   partId: Teil eines mehrfarbigen Objekts (import.js) – dessen Slot wird am Teil selbst gesetzt. */
function build3mfFromProject(tpl, r, jobs, slot, zipLib, liveSlots, threemf) {
  const items = jobs.map(j => ({ ...j, plate: j.part && j.part.plate }));
  const { extra, notes, partSlot } = slotPlan(items, r, slot);
  const nFil = tpl.settings.filament_settings_id.length;
  items.forEach(j => { if (partSlot(j) >= nFil) notes.push(j.geom.name + ': Slot ' + (partSlot(j) + 1) + ' gibt es an deinem Drucker nicht – bitte in Orca zuweisen.'); });
  const { settings, changes } = buildProjectSettings(tpl, r, slot, liveSlots, extra.filter(e => e.slot < nFil));
  const { shifts, oversize } = plateShifts(items, tpl);
  oversize.forEach(id => notes.push('Platte ' + id + ' ist größer als dein Druckbett – in Orca prüfen.'));

  const out = {};
  for (const [name, data] of Object.entries(threemf.zip)) if (!PLATE_SLICE_FILES.test(name)) out[name] = data;
  out['Metadata/project_settings.config'] = zipLib.strToU8(JSON.stringify(settings, null, 4));

  // Build-Items verschieben (Translation = letzte drei Werte der Matrix)
  const rootPath = Object.keys(out).find(k => /^3D\/3dmodel\.model$/i.test(k));
  // Je Build-Item die Platte seiner Instanz – dasselbe Objekt kann auf mehreren Platten stehen
  const plateOfItem = new Map(items.map(j => [j.part.objectId + '#' + (j.part.instance || 0), j.plate || 1]));
  const itemCount = new Map();
  out[rootPath] = zipLib.strToU8(zipLib.strFromU8(out[rootPath]).replace(/<((?:\w+:)?item\b)([^>]*?)(\/?)>/g, (all, tag, attrs, close) => {
    const id = (/objectid="([^"]+)"/.exec(attrs) || [])[1], inst = itemCount.get(id) || 0;
    itemCount.set(id, inst + 1);
    const shift = shifts.get(plateOfItem.get(id + '#' + inst));
    if (!shift) return all;
    const t = (/transform="([^"]+)"/.exec(attrs) || [])[1];
    const m = t ? t.trim().split(/\s+/).map(Number) : [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    m[9] += shift[0]; m[10] += shift[1];
    const tr = 'transform="' + m.map(v => String(Math.round(v * 1e4) / 1e4)).join(' ') + '"';
    return '<' + tag + (t ? attrs.replace(/transform="[^"]+"/, tr) : attrs + ' ' + tr) + close + '>';
  }));

  // Slot und eigene Werte je Objekt
  const computedKeys = [...new Set(plannedChanges(r, 0, null).filter(c => !c.perSlot && isObjectKey(c.key)).map(c => c.key).concat([...OBJECT_KEYS], supportChanges(r).map(x => x[1])))];
  const objectChanges = [];
  let ms = zipLib.strFromU8(out['Metadata/model_settings.config'] || zipLib.strToU8('<?xml version="1.0" encoding="UTF-8"?>\n<config>\n</config>\n'));
  const done = new Set(); // Objekt mit mehreren Instanzen nur einmal anpassen
  for (const j of items) {
    for (const pid of j.part.partId ? [j.part.partId] : j.part.partIds || []) ms = patchPartExtruder(ms, j.part.objectId, pid, Math.min(partSlot(j), nFil - 1) + 1);
    if (done.has(j.part.objectId)) continue;
    done.add(j.part.objectId);
    const own = objectOverrides(settings, j.r);
    if (own.length) objectChanges.push({ name: j.geom.name, changes: own });
    const esc = String(j.part.objectId).replace(/[^\w-]/g, '');
    if (!new RegExp('<object id="' + esc + '">').test(ms)) { notes.push(j.geom.name + ': keine Objekt-Einstellungen in der 3MF – Slot und eigene Werte bitte in Orca prüfen.'); continue; }
    ms = ms.replace(new RegExp('(<object id="' + esc + '">)([\\s\\S]*?)(?=<part\\b|</object>)'), (all, open, body) => patchObjectHead(open + body, Math.min(partSlot(j), nFil - 1) + 1, own, computedKeys));
  }
  ms = addHoleModifiers(out, ms, items, rootPath, zipLib, notes);
  out['Metadata/model_settings.config'] = zipLib.strToU8(ms);
  return { bytes: zipLib.zipSync(out, { level: 6 }), changes, objectChanges, notes, plateCount: shifts.size };
}

// ZIP über fflate (vendor/fflate.min.js); zipLib wird übergeben, damit der Test es in Node nutzen kann.
function build3mf(tpl, r, parts, slot, zipLib, liveSlots) {
  const { files, changes, plateCount, objectChanges, notes } = build3mfFiles(tpl, r, parts, slot, liveSlots);
  const entries = {};
  for (const [p, text] of Object.entries(files)) entries[p] = zipLib.strToU8(text);
  return { bytes: zipLib.zipSync(entries, { level: 6 }), changes, plateCount, objectChanges, notes };
}
