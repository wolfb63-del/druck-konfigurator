/* Farbwechsel nach Höhe in übernommenen 3MF (Orca/Bambu: Metadata/custom_gcode_per_layer.xml, z. B. die
   mehrfarbige Gravur BUHO_Front): Ab einer Höhe druckt ein anderer Extruder. Rechenlogik ohne DOM (Node-testbar).
   Zwei Dinge dürfen dabei nicht angefasst werden, sonst stimmen Farben und Gravur nicht mehr:
   - die Schichthöhen der Datei: die Wechsel liegen auf Schichtgrenzen (z. B. 0,72 / 0,80 / 0,88 mm bei 0,08 mm);
     mit einer anderen Höhe (0,16 mm) fallen mehrere Wechsel in eine Schicht und dünne Gravurlinien verschwinden;
   - die Zuordnung Teil → Slot und Wechsel → Slot (Extruder 1–4 der Datei bleiben Slot 1–4).
   Bekannte Grenzen: Wie Orca Wechsel behandelt, die nicht auf einer Schichtgrenze liegen, ist nicht geprüft; das
   Tool meldet sie nur. Die Farben der Slots kommen aus den Wechseln (Farbe des Designers), solange keine Belegung
   vom Drucker oder von Hand vorliegt. Gewechselt wird nur nach Höhe (type 2, tool_change); Pausen und eigener
   G-Code je Schicht (andere Typen) bleiben unverändert in der Datei, werden aber nicht ausgewertet. Farbwechsel
   mit Typ 0 (ColorChange, z. B. M600/AMS im Einzel-Extruder-Modus) werden nicht erkannt: eine solche Datei bekommt
   wie bisher die Schichthöhe des Tools (nicht an einer echten Datei geprüft).
   Mehrere Platten: die Wechsel werden aus allen Platten gelesen; eine Slotfarbe setzt das Tool nur, wenn alle Wechsel
   dieses Extruders dieselbe Farbe haben. */

/* Wechsel aus dem XML: [{plate, topZ, extruder (1-basiert), color}] nur Typ 2 (Farb-/Extruderwechsel) */
function parseColourChanges(xml) {
  const out = [];
  let plate = 1;
  for (const m of String(xml || '').matchAll(/<plate_info\b[^>]*?\bid="(\d+)"|<layer\b([^>]*?)\/?>/g)) {
    if (m[1]) { plate = Number(m[1]); continue; }
    const a = k => (new RegExp('\\b' + k + '="([^"]*)"').exec(m[2]) || [])[1];
    const topZ = Number(a('top_z')), extruder = Number(a('extruder'));
    if (a('type') !== '2' || !Number.isFinite(topZ) || !(extruder >= 1)) continue;
    out.push({ plate, topZ, extruder, color: /^#[0-9a-f]{6}$/i.test(a('color') || '') ? a('color').toUpperCase() : '' });
  }
  return out;
}

/* Liegen alle Wechsel auf Schichtgrenzen (erste + n × Schichthöhe, 0,001 mm Toleranz)? → Höhen, die nicht passen */
function colourChangesOffGrid(changes, firstLayer, layerHeight) {
  const f = Number(firstLayer), h = Number(layerHeight);
  if (!(f > 0) || !(h > 0)) return [];
  return changes.filter(c => {
    const n = (c.topZ - f) / h;
    return c.topZ < f - 1e-3 || Math.abs(n - Math.round(n)) * h > 1e-3;
  }).map(c => c.topZ);
}

/* Schreibt die Schichthöhen der Datei zurück und färbt die Slots. settings = neue project_settings (wird verändert),
   orig = project_settings der Datei, hasLive = Belegung vom Drucker/von Hand liegt vor (Farben dann nicht überschreiben).
   Ergebnis: {notes, layer} – layer = die verwendeten Höhen oder null, wenn die Datei keine nennt. */
function applyColourChanges(settings, orig, changes, hasLive) {
  const notes = [], used = [...new Set(changes.map(c => c.extruder))].sort((a, b) => a - b);
  const lh = orig && orig.layer_height, fl = orig && orig.initial_layer_print_height;
  let layer = null;
  if (Number(lh) > 0 && Number(fl) > 0) {
    layer = { layerHeight: String(lh), firstLayer: String(fl) };
    settings.layer_height = layer.layerHeight;
    settings.initial_layer_print_height = layer.firstLayer;
    const off = colourChangesOffGrid(changes, fl, lh);
    if (off.length) notes.push('Farbwechsel bei ' + off.join(' / ') + ' mm liegen nicht auf Schichtgrenzen (' + fl + ' mm + n × ' + lh + ' mm) – in Orca prüfen.');
  } else notes.push('Die Datei nennt ihre Schichthöhen nicht – Farbwechsel nach Höhe bitte in Orca prüfen.');
  const n = (settings.filament_colour || []).length;
  if (!hasLive) for (const e of used) {
    const cols = [...new Set(changes.filter(c => c.extruder === e).map(c => c.color))];
    if (cols.length !== 1 || !cols[0] || e > n) continue;   // widersprüchliche oder fehlende Farben: Vorlage lassen
    settings.filament_colour[e - 1] = cols[0];
    // Orca übernimmt beim Öffnen nur Schlüssel aus different_settings_to_system (Gruppe 1 + Slot) – wie in buildProjectSettings
    const d = settings.different_settings_to_system;
    if (Array.isArray(d) && d.length > e) d[e] = [...new Set(String(d[e] || '').split(';').filter(Boolean).concat('filament_colour'))].join(';');
  }
  const missing = used.filter(e => e > n);
  if (missing.length) notes.push('Farbwechsel auf Extruder ' + missing.join(', ') + ' – so viele Slots hat dein Drucker nicht, bitte in Orca zuweisen.');
  return { notes, layer, used };
}

/* Obere/untere Schalenschichten für die Schichthöhe der Datei: dieselbe Dicke, wie das Tool sie meinte
   (r.t/r.b Schichten × r.layer), sonst wären es bei 0,08 mm nur 0,4/0,32 mm. Ergebnis {t, b} */
function shellLayersFor(r, layerHeight) {
  const lh = Number(layerHeight);
  if (!r || !(lh > 0) || !(r.layer > 0)) return { t: r && r.t, b: r && r.b };
  return { t: Math.ceil(r.t * r.layer / lh - 1e-9), b: Math.ceil(r.b * r.layer / lh - 1e-9) };
}
