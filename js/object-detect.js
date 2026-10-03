/* Objekt-Erkennung: schlägt aus Form und Datei eine der Objekt-Vorlagen (OBJ in data.js) vor. Rechenlogik ohne
   DOM (Node-testbar). Nur Signale, die sich zuverlässig lesen lassen; alles andere (Halterung, Präzisionsteil,
   wasserdicht, Funktionsteil, TPU-Typen) bleibt die Wahl des Nutzers – die Form allein sagt nichts über den Zweck.
   Der Vorschlag ist nur eine Vorauswahl (mit Begründung, jederzeit änderbar), kein Urteil.
   Reihenfolge (das erste zutreffende Signal gewinnt):
   1. Farbwechsel nach Höhe in der Datei: flache Platte (höchstens 6 mm dick, mindestens 8-mal so breit wie dick)
      mit mindestens 5 Wechseln (HueForge-Bilder haben typisch 6–15) → hueforge, sonst multicolor.
   2. Teile mit mehr als einem Slot → multicolor. Beide Datei-Signale gelten nur bei Projekten mit einem Teil (der
      Aufrufer reicht sie sonst nicht durch): bei mehreren Teilen entscheidet nur die Form des gewählten Teils.
   3. Deutliche Überhänge (mindestens 10 % der Oberfläche über dem Schwellenwinkel, Stufe „needed“) → overhang.
   4. Dünne Wand: mittlere Wanddicke 2·V/A höchstens 2,2 mm bei einem Körper über 6 mm Höhe, mindestens 1.500 mm²
      Oberfläche und hohl (Volumen höchstens halb so groß wie der Hüllquader) → thin.
   Bekannte Grenzen: Die Platten-Schwelle trennt „HueForge“ und „Gravur“ nur nach der Form. V stammt aus dem
   vorzeichenbehafteten Volumen von makeGeom: bei offenen Netzen und Körpern mit umgekehrter Windung ist es nicht das
   echte Volumen – dann fehlt ein Treffer (offenes Rohr) oder, selten, es gibt einen falschen. Hohle Handyhüllen in
   Druckausrichtung werden als „thin“ erkannt, sind aber meist TPU-Hüllen (die TPU-Wahl des Nutzers bleibt, siehe app.js). */

const DETECT_PLATE_MAX_Z = 6, DETECT_PLATE_RATIO = 8, DETECT_PLATE_MIN_CHANGES = 5;
const DETECT_OVERHANG_RATIO = 0.10, DETECT_THIN_MM = 2.2, DETECT_THIN_MIN_AREA = 1500, DETECT_THIN_MAX_FILL = 0.5;

/* g: Geometrie (x, y, z, vol, total); info: {colourChanges, slotCount, analysis} → {key, why, ...} oder null */
function detectObject(g, info) {
  if (!g) return null;
  const i = info || {}, changes = i.colourChanges || [];
  const flat = g.z <= DETECT_PLATE_MAX_Z && Math.min(g.x, g.y) >= DETECT_PLATE_RATIO * g.z;
  if (changes.length) return flat && changes.length >= DETECT_PLATE_MIN_CHANGES ? { key: 'hueforge', why: 'plate', n: changes.length } : { key: 'multicolor', why: 'changes', n: changes.length };
  if (i.slotCount > 1) return { key: 'multicolor', why: 'slots', n: i.slotCount };
  const a = i.analysis;
  if (a && a.level === 'needed' && a.ratio >= DETECT_OVERHANG_RATIO) return { key: 'overhang', why: 'overhang', ratio: a.ratio, th: a.th };
  if (g.z > DETECT_PLATE_MAX_Z && g.total >= DETECT_THIN_MIN_AREA && g.vol > 0) {
    const mean = 2 * g.vol / g.total;
    // Hohl: Volumen höchstens halb so groß wie der umschließende Quader – schließt Vollstäbe und hochkant stehende Klingen aus
    const fill = g.vol / Math.max(1e-9, g.x * g.y * g.z);
    if (mean <= DETECT_THIN_MM && fill <= DETECT_THIN_MAX_FILL) return { key: 'thin', why: 'thin', mm: mean };
  }
  return null;
}
