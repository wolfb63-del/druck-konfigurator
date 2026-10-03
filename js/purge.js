/* Reinigungslinie (Purge-Linie) für die Düse – Wunsch des Nutzers 2026-10-03.
   Rechenlogik ohne DOM (Node-testbar). Die Linie wird als G-Code ans Ende des Start-G-Codes der
   Druckervorlage gehängt (Kopie, die Vorlage bleibt unverändert) – wie withZOffset in export3mf.js.
   Seite: 'front' (y klein), 'back' (y groß), 'left' (x klein), 'right' (x groß) oder 'auto'
   (Seite mit dem meisten freien Platz neben allen Objekten).
   Bekannte Grenzen:
   - Kobra S1 und Snapmaker U1 reinigen in der Firmware (G9111 bzw. PRINT_START-Makros); die Linie kommt
     dort zusätzlich nach dem Firmware-Start. Welche Linie die Firmware selbst zieht, ist nicht sichtbar.
   - Die Lage der Objekte kennt nur dieser Export; verschiebt man sie später in Orca, gilt die Prüfung nicht mehr.
   - Der Platzbedarf rechnet Brim und Skirt der Vorlage/Empfehlung ein, nicht Stützen außerhalb des Teils.
   - Prime-Tower (Mehrfarbdruck): Position aus der Vorlage, Tiefe unbekannt → mit 60 mm Tiefe geschätzt (konservativ).
   - Nur rechteckige Betten ohne Sperrbereiche (bed_exclude_area) und mit ausdrücklich gesetztem
     use_relative_e_distances; sonst keine Linie (Delta/Rundbett, unbekannter Extrusionsmodus: nicht prüfbar).
   - Kein Rückzug am Ende: Orca fährt nach dem Start-G-Code nicht wieder vor (unbestätigt, aus der Orca-Logik abgeleitet).
   - Das Extrusionsvolumen ist die übliche Näherung (abgerundeter Querschnitt), kein gemessener Wert. */

const PURGE_SIDES = ['auto', 'front', 'back', 'left', 'right'];
const PURGE_INSET_MM = 3;       // Abstand der ersten Bahn vom Rand des Druckbereichs
const PURGE_CLEAR_MM = 3;       // Mindestabstand der Linie zu Objekt/Brim
const PURGE_LENGTH_MM = 100;    // Länge je Bahn (gekürzt, wenn das Bett kürzer ist)
const PURGE_HEIGHT_MM = 0.3;    // Höhe der Linie
const PURGE_SPEED = 1200;       // mm/min beim Ziehen der Linie
const PURGE_WIDTH_FACTOR = 1.2; // Linienbreite = 1,2 × Düse
const PURGE_TOWER_DEPTH_MM = 60; // geschätzte Tiefe des Prime-Towers (Orca rechnet sie aus dem Spülvolumen)

const purgeNum = v => Number(Array.isArray(v) ? v[0] : v);
const purgeRound = (v, n = 3) => String(Math.round(v * 10 ** n) / 10 ** n);

/* Druckbereich der Vorlage in Bett-Koordinaten: {x0, x1, y0, y1}; null bei Bett, das kein achsparalleles
   Rechteck ist, oder bei echten Sperrbereichen (der Platzhalter "0x0" zählt nicht) */
function purgeBed(tpl) {
  const pts = (tpl.settings.printable_area || []).map(p => p.split('x').map(Number));
  const excl = [].concat(tpl.settings.bed_exclude_area || []).filter(a => a && a !== '0x0');
  if (excl.length) return null;
  if (!pts.length) return { x0: 0, x1: tpl.bedCenter[0] * 2, y0: 0, y1: tpl.bedCenter[1] * 2 };
  const xs = [...new Set(pts.map(p => p[0]))], ys = [...new Set(pts.map(p => p[1]))];
  if (pts.length !== 4 || xs.length !== 2 || ys.length !== 2 || pts.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  return { x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])) };
}

/* Belegte Fläche je Platte in Bett-Koordinaten dieser Platte: [{x0, x1, y0, y1}].
   Neuer Aufbau (STL/Teileliste): wie arrangeParts. Übernommene 3MF: jede Platte wird auf die Bettmitte
   gerückt (plateShifts), die Größe bleibt. */
function purgeBoxes(tpl, jobs, fromProject) {
  const [bx, by] = tpl.bedCenter;
  if (fromProject) {
    const [bw, bd] = bedSize(tpl), ids = [...new Set(jobs.map(j => (j.part && j.part.plate) || j.plate || 1))];
    return ids.map(id => {
      const on = jobs.filter(j => ((j.part && j.part.plate) || j.plate || 1) === id);
      const w = Math.max(...on.map(j => j.geom.mx[0])) - Math.min(...on.map(j => j.geom.mn[0]));
      const d = Math.max(...on.map(j => j.geom.mx[1])) - Math.min(...on.map(j => j.geom.mn[1]));
      return { x0: bx - w / 2, x1: bx + w / 2, y0: by - d / 2, y1: by + d / 2 };
    });
  }
  const geoms = jobs.map(j => j.geom), [bw, bd] = bedSize(tpl), { places, plateCount } = arrangeParts(geoms, tpl);
  const cols = Math.ceil(Math.sqrt(plateCount)), boxes = Array.from({ length: plateCount }, () => null);
  places.forEach((p, i) => {
    const ox = (p.plate % cols) * bw * PLATE_STRIDE, oy = -Math.floor(p.plate / cols) * bd * PLATE_STRIDE;   // Plattenversatz
    const b = { x0: p.x - ox - geoms[i].x / 2, x1: p.x - ox + geoms[i].x / 2, y0: p.y - oy - geoms[i].y / 2, y1: p.y - oy + geoms[i].y / 2 };
    const c = boxes[p.plate];
    boxes[p.plate] = c ? { x0: Math.min(c.x0, b.x0), x1: Math.max(c.x1, b.x1), y0: Math.min(c.y0, b.y0), y1: Math.max(c.y1, b.y1) } : b;
  });
  return boxes.filter(Boolean);
}

/* Zusätzlicher Abstand durch Skirt und Brim (mm): größter Brim der Teile + Skirt der Vorlage */
function purgeMargin(tpl, brims) {
  const s = tpl.settings, w = purgeNum(s.nozzle_diameter) * PURGE_WIDTH_FACTOR;
  const brim = Math.max(0, purgeNum(s.brim_width) || 0, ...(brims || []).map(b => Number(orcaBrim(b)[1]) || 0));
  const loops = Number(s.skirt_loops) || 0;
  return brim + (loops > 0 ? (Number(s.skirt_distance) || 0) + loops * w : 0);
}

/* Plan: freier Platz je Seite, gewählte Seite, Linie. Ergebnis {side, ok, free, need, line} oder null,
   wenn die Vorlage keine brauchbaren Werte hat. */
function planPurge(tpl, boxes, side, margin, withTower) {
  const s = tpl && tpl.settings, noz = s && purgeNum(s.nozzle_diameter), fil = s && purgeNum(s.filament_diameter);
  if (!s || !(noz > 0) || !(fil > 0) || typeof s.machine_start_gcode !== 'string' || !boxes || !boxes.length) return null;
  if (!['0', '1'].includes(String(s.use_relative_e_distances))) return null;   // Extrusionsmodus unbekannt → M83/M82 wären geraten
  const bed = purgeBed(tpl), m = margin || 0, w = noz * PURGE_WIDTH_FACTOR;
  if (!bed) return null;
  if (withTower && String(s.enable_prime_tower) === '1') {   // Mehrfarbdruck: der Turm steht ebenfalls auf dem Bett
    const tx = purgeNum(s.wipe_tower_x), ty = purgeNum(s.wipe_tower_y), tw = Number(s.prime_tower_width), pad = Number(s.prime_tower_brim_width) || 0;
    if ([tx, ty, tw].every(Number.isFinite)) boxes = boxes.concat({ x0: tx - pad, x1: tx + tw + pad, y0: ty - pad, y1: ty + PURGE_TOWER_DEPTH_MM + pad });
  }
  const free = {
    front: Math.min(...boxes.map(b => b.y0)) - bed.y0 - m, back: bed.y1 - Math.max(...boxes.map(b => b.y1)) - m,
    left: Math.min(...boxes.map(b => b.x0)) - bed.x0 - m, right: bed.x1 - Math.max(...boxes.map(b => b.x1)) - m,
  };
  const need = PURGE_INSET_MM + w + w / 2 + PURGE_CLEAR_MM;   // Rand, zwei Bahnen, Sicherheitsabstand
  const chosen = side && PURGE_SIDES.includes(side) && side !== 'auto' ? side
    : ['back', 'front', 'right', 'left'].reduce((best, k) => free[k] > free[best] ? k : best, 'back');
  const horiz = chosen === 'front' || chosen === 'back';
  const mid = horiz ? (bed.x0 + bed.x1) / 2 : (bed.y0 + bed.y1) / 2, span = horiz ? bed.x1 - bed.x0 : bed.y1 - bed.y0;
  const len = Math.max(10, Math.min(PURGE_LENGTH_MM, span - 20));
  const edge = { front: bed.y0, back: bed.y1, left: bed.x0, right: bed.x1 }[chosen];
  const dir = chosen === 'front' || chosen === 'left' ? 1 : -1;   // von der Kante nach innen
  const lane = [edge + dir * PURGE_INSET_MM, edge + dir * (PURGE_INSET_MM + w)];
  return { side: chosen, ok: free[chosen] >= need, free, need, w, len, mid, horiz, lane, noz, fil };
}

/* Platzhalter für die Starttemperatur: so wie der Start-G-Code der Vorlage selbst (Kobra: first_layer_temperature[initial_tool],
   U1: nozzle_temperature_initial_layer[initial_extruder]); sonst der aktuelle Orca-Name */
function purgeTempKey(s) {
  const g = s.machine_start_gcode, m = /(first_layer_temperature|nozzle_temperature_initial_layer)\[(initial_tool|initial_extruder)\]/.exec(g);
  return m ? m[0] : 'nozzle_temperature_initial_layer[initial_extruder]';
}

/* G-Code der Linie: Z anheben → zur Startposition → Bahn hin → Versatz → Bahn zurück → Z anheben */
function purgeGcode(tpl, plan) {
  const s = tpl.settings, h = PURGE_HEIGHT_MM, rel = String(s.use_relative_e_distances) !== '0';
  const ePerMm = ((plan.w - h) * h + Math.PI * (h / 2) ** 2) / (Math.PI * (plan.fil / 2) ** 2);
  const z = h + (Number(s.z_offset) || 0);
  const a = plan.mid - plan.len / 2, b = plan.mid + plan.len / 2;
  const xy = (along, across) => plan.horiz ? 'X' + purgeRound(along, 2) + ' Y' + purgeRound(across, 2) : 'X' + purgeRound(across, 2) + ' Y' + purgeRound(along, 2);
  let e = 0;
  const ex = mm => { e += mm; return 'E' + purgeRound(rel ? mm : e, 4); };   // relativ: Menge je Zug, absolut: laufende Summe
  const L = ['; --- Reinigungslinie (Druck-Konfigurator): ' + { front: 'vorne', back: 'hinten', left: 'links', right: 'rechts' }[plan.side] + ' ---',
    'G90', rel ? 'M83' : 'M82', 'M109 S{' + purgeTempKey(s) + '}'];
  if (!rel) L.push('G92 E0');
  L.push('G1 Z2 F600', 'G1 ' + xy(a, plan.lane[0]) + ' F6000', 'G1 Z' + purgeRound(z, 3) + ' F600',
    'G1 ' + xy(b, plan.lane[0]) + ' ' + ex(plan.len * ePerMm) + ' F' + PURGE_SPEED,
    'G1 ' + xy(b, plan.lane[1]) + ' ' + ex(plan.w * ePerMm) + ' F' + PURGE_SPEED,
    'G1 ' + xy(a, plan.lane[1]) + ' ' + ex(plan.len * ePerMm) + ' F' + PURGE_SPEED);
  L.push('G1 Z2 F600');   // kein Rückzug: Orca fährt danach nicht wieder vor, es würde Filament am Druckbeginn fehlen
  if (!rel) L.push('G92 E0');
  L.push('; --- Ende Reinigungslinie ---');
  return L.join('\n');
}

/* Kopie der Vorlage mit angehängter Linie; ohne Plan unverändert. Orca übernimmt beim Öffnen nur Schlüssel
   aus different_settings_to_system (Gruppe des Druckers = letzte), deshalb steht machine_start_gcode dort. */
function withPurge(tpl, plan) {
  if (!tpl || !plan) return tpl;
  const nFil = (tpl.settings.filament_settings_id || []).length, groups = nFil + 2;
  const diff = Array.from({ length: groups }, (_, i) => String((tpl.settings.different_settings_to_system || [])[i] || ''));
  const keys = new Set(diff[groups - 1].split(';').filter(Boolean)); keys.add('machine_start_gcode');
  diff[groups - 1] = [...keys].join(';');
  const start = tpl.settings.machine_start_gcode.replace(/\s+$/, '');
  return { ...tpl, settings: { ...tpl.settings, machine_start_gcode: start + '\n' + purgeGcode(tpl, plan) + '\n', different_settings_to_system: diff } };
}
