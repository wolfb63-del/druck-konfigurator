'use strict';
/* Muster für zusammengesetzte Texte aus engine.js/data.js/export3mf.js (Zusammenfassung, Hinweise, Stützen-
   Empfehlung, Änderungsliste …). Diese Dateien bleiben unverändert; übersetzt wird an der Anzeige (js/i18n.js).
   Je Eintrag [RegExp mit ^…$, Ersetzung]: Text mit $1 … oder Funktion (m, g1, …) => Text. Zahlen kommen
   deutsch formatiert (4,2 / 27.073) und werden hier ins englische Format umgesetzt (4.2 / 27,073).
   Geprüft von tests/i18n-muster.js (erzeugt die Texte mit engine.js und prüft jedes Textstück).
   Reihenfolge: fest formulierte Sätze stehen als Wörterbuch-Einträge unten (I18N_EN), Sätze mit Zahlen oder
   Namen als Muster in I18N_EN_PATTERNS. Die Hilfsnamen beginnen mit „mu“, damit nichts mit anderen Skripten kollidiert. */

// Zahl aus dem deutschen Format ins englische (Tausenderpunkt → Komma, Dezimalkomma → Punkt), Einheiten bleiben
const muNum = s => String(s).replace(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g, t => {
  const [i, f] = t.replace(/\./g, '').split(',');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f !== undefined ? '.' + f : '');
});
// Bekannter Text über das Wörterbuch (exakt), sonst unverändert
const muTr = s => (typeof tr === 'function' ? tr(s) : s);
// „0,4 mm Messing“ (Düsenmaß + Düsenmaterial)
const muNoz = s => { const m = /^(\d+(?:,\d+)?) mm (.+)$/.exec(s); return m ? muNum(m[1]) + ' mm ' + muTr(m[2]) : muTr(s); };
const MU_NOZ = '(\\d+(?:,\\d+)?) mm (Gehärteter Stahl|Edelstahl \\(Standard\\)|Messing)';
const muNozRe = new RegExp('^' + MU_NOZ + '$');
const MU_UNITS = 'mm\\/s²|mm\\/s|mm³\\/s|mm²|mm|°C|°|%|s';
// Teile einer Zeile mit „ · “ einzeln übersetzen (Zusatzspalte des Datenblatts, „Vor dem Druck“-Liste)
const muSplit = s => s.split(' · ').map(muTr).join(' · ');

const I18N_EN_PATTERNS = [
  // Zusammenfassung unter dem Titel: „<Quelle> Düse: 0,4 mm Messing.“
  [/^(.+?) Düse: (\d+(?:,\d+)?) mm (Gehärteter Stahl|Edelstahl \(Standard\)|Messing)\.$/, (m, src, d, mat) => muTr(src) + ' Nozzle: ' + muNum(d) + ' mm ' + muTr(mat) + '.'],
  // Maße des Teils
  [/^(\d[\d.,]*) × (\d[\d.,]*) × (\d[\d.,]*) mm ·$/, (m, x, y, z) => muNum(x) + ' × ' + muNum(y) + ' × ' + muNum(z) + ' mm ·'],
  // Überhanganalyse (Satz unter den Reglern und Stützen-Empfehlung)
  [/^Keine relevanten Überhänge über (\d+)° \(Bodenfläche ausgenommen\)\.$/, 'No relevant overhangs above $1° (bottom face excluded).'],
  [/^Über (\d+)°: ca\. ([\d.,]+) mm² \(([\d.,]+) % der Oberfläche, Bodenfläche ausgenommen\)\.$/, (m, a, f, r) => 'Above ' + a + '°: approx. ' + muNum(f) + ' mm² (' + muNum(r) + ' % of the surface, bottom face excluded).'],
  [/^Keine relevanten Überhänge über (\d+)°\. Flächen, die auf dem Druckbett liegen, werden nicht mitgezählt\. Kleine Fasen und Bohrungen druckt der Slicer ohne Stütze\.$/, 'No relevant overhangs above $1°. Faces resting on the print bed are not counted. The slicer prints small chamfers and holes without support.'],
  [/^Einzelne Überhänge \(ca\. ([\d.,]+) mm², ([\d.,]+) % der Oberfläche\)\. Meist druckbar; nur stützen, wenn die Vorschau frei hängende Bahnen zeigt\.$/, (m, f, r) => 'A few overhangs (approx. ' + muNum(f) + ' mm², ' + muNum(r) + ' % of the surface). Usually printable; only add supports if the preview shows lines hanging in mid-air.'],
  [/^Deutliche Überhänge \(ca\. ([\d.,]+) mm²\)\. Vor dem Aktivieren von Stützen das Modell im Slicer drehen oder um (\d+)–(\d+)° kippen – das reduziert Stützen oft mehr als jede Einstellung\. Nur wenn das nicht reicht, Baumstützen „nur kritische Bereiche“\.$/, (m, f, a, b) => 'Significant overhangs (approx. ' + muNum(f) + ' mm²). Before enabling supports, rotate the model in the slicer or tilt it by ' + a + '–' + b + '° – this often reduces supports more than any setting. Only if that is not enough, use tree supports with “Critical regions only”.'],
  [/^Deutliche Überhänge erkannt \(ca\. ([\d.,]+) mm², ([\d.,]+) % der Oberfläche(?:, davon ca\. ([\d.,]+) mm² fast waagerecht)?\)\. Baumstützen ab Druckbett, nur kritische Bereiche\.$/, (m, f, r, c) => 'Significant overhangs detected (approx. ' + muNum(f) + ' mm², ' + muNum(r) + ' % of the surface' + (c ? ', of which approx. ' + muNum(c) + ' mm² almost horizontal' : '') + '). Tree supports from the bed, critical regions only.'],
  [/^STL-Maße und Überhanganalyse \((\d+)°\) wurden berücksichtigt\.$/, 'STL dimensions and overhang analysis ($1°) were taken into account.'],
  // Stützen-Empfehlung: Anleitung (Stücke zwischen <i>-Tags)
  [/^So stellst du es in (.+) ein:$/, 'How to set it up in $1:'],
  [/^Schwellenwinkel: ([\d.,]+)°$/, (m, a) => 'Threshold angle: ' + muNum(a) + '°'],
  // Datenblatt: Zusätze und Werte
  [/^(Vor dem Druck trocknen|Bei Bedarf trocknen): ca\. ([\d–]+) °C für ([\d–]+) Stunden?\.$/, (m, w, t, h) => (w === 'Bei Bedarf trocknen' ? 'Dry if needed' : 'Dry before printing') + ': approx. ' + t + ' °C for ' + h + ' ' + (h === '1' ? 'hour' : 'hours') + '.'],
  [/^([+−]\d+) °C für (Gehärteter Stahl|Edelstahl \(Standard\)|Messing)$/, (m, t, mat) => t + ' °C for ' + muTr(mat)],
  [/^\+(\d+) °C für dichte Schichten$/, '+$1 °C for tightly fused layers'],
  [/^effektiv ca\. (\d+) mm\/s \(Grenze ([\d.,]+) mm³\/s\)$/, (m, v, l) => 'effectively approx. ' + v + ' mm/s (limit ' + muNum(l) + ' mm³/s)'],
  [/^Richtwert ([\d.,]+) mm \/ ([\d.,]+) mm\/s \(am S1 getestet\)$/, (m, l, s) => 'Guide value ' + muNum(l) + ' mm / ' + muNum(s) + ' mm/s (tested on the S1)'],
  [/^umgerechnet für (\d+(?:,\d+)?) mm (Gehärteter Stahl|Edelstahl \(Standard\)|Messing)$/, (m, d, mat) => 'converted for ' + muNum(d) + ' mm ' + muTr(mat)],
  [/^kleine Aufstandsfläche erkannt \(([\d.,]+) mm²\)$/, (m, a) => 'small footprint detected (' + muNum(a) + ' mm²)'],
  [/^([\d–]+ %) \/ Gyroid oder Kubisch$/, '$1 / Gyroid or Cubic'],
  [/^([\d–]+ %) \/ Linien$/, '$1 / Rectilinear'],
  [/^([\d–]+ %) \/ Blitz \(Lightning\)$/, '$1 / Lightning'],
  [/^Multiplikator ([\d.,]+)$/, (m, v) => 'Multiplier ' + muNum(v)],
  [new RegExp('^' + MU_NOZ + '$'), (m, d, mat) => muNum(d) + ' mm ' + muTr(mat)],
  [/^Düse (\d+(?:,\d+)?) mm (Gehärteter Stahl|Edelstahl \(Standard\)|Messing)$/, (m, d, mat) => 'Nozzle ' + muNum(d) + ' mm ' + muTr(mat)],
  // Warnungen und Hinweise (nach dem fett gesetzten Anfang)
  [/^„(.+)“ ist ein TPU-Objekt\. Mit (.+) wird es steif; die Werte sind allgemeine Startwerte\.$/, (m, o, f) => '“' + muTr(o) + '” is a TPU object. With ' + muTr(f) + ' it becomes stiff; the values are general starting values.'],
  [/^Faserverstärktes Filament schleift nicht gehärtete Düsen \((.+)\) schnell aus\. Nur mit gehärteter Stahldüse drucken\.$/, (m, mat) => 'Fiber-reinforced filament quickly wears out non-hardened nozzles (' + muTr(mat) + '). Print only with a hardened steel nozzle.'],
  [/^Faserverstärkte Filamente verstopfen feine Düsen \(([\d,]+) mm\) leicht – mindestens ([\d,]+) mm, besser ([\d,]+) mm verwenden\.$/, (m, d, a, b) => 'Fiber-reinforced filaments easily clog fine nozzles (' + muNum(d) + ' mm) – use at least ' + muNum(a) + ' mm, preferably ' + muNum(b) + ' mm.'],
  [/^Der Start-G-Code im OrcaSlicer-Profil von (.+) heizt fest auf (\d+) °C – Orca setzt dann keine eigene Düsentemperatur, gedruckt wird mit (\d+) statt (\d+) °C\. Im Druckerprofil den Start-G-Code auf „M109 S\[nozzle_temperature_initial_layer\]“ ändern\.$/, 'The start G-code in the OrcaSlicer profile of $1 heats to a fixed $2 °C – Orca then sets no nozzle temperature of its own, so printing happens at $3 instead of $4 °C. In the printer profile, change the start G-code to “M109 S[nozzle_temperature_initial_layer]”.'],
  [/^Der (.+) hat serienmäßig kein Gehäuse\. Für ABS\/ASA möglichst die optionale Top Cover verwenden oder zumindest für eine zugluftfreie, gut belüftete Umgebung sorgen; Bett vor dem Start einige Minuten vorheizen\. Beim Drucken entstehen Styrol-Dämpfe und ultrafeine Partikel – Raum gut lüften, nicht in Wohn- oder Schlafräumen drucken\.$/, 'The $1 has no enclosure as standard. For ABS/ASA, use the optional top cover if possible or at least ensure a draft-free, well-ventilated environment; preheat the bed for a few minutes before starting. Printing releases styrene fumes and ultrafine particles – ventilate the room well and do not print in living or sleeping areas.'],
  [/^Dicht wird ein Teil über die Wand: (\d+) Wandlinien, (\d+) \/ (\d+) Deck-\/Bodenschichten, \+(\d+) °C und eine langsamere Außenwand sind gesetzt; im Slicer „Lückenfüllung überall“\. Lüfter eher niedrig halten\. PETG und ASA werden dichter als PLA\. Einfache Gefäße ohne Deckel: Vasenmodus mit breiter Linie \(([\d,–]+) mm\) ist oft dichter\. Für dauerhaften Wasserkontakt oder Druck innen mit Epoxidharz beschichten\. Nicht für Trinkwasser oder Lebensmittel geeignet – nach dem Druck mit Wasser testen\.$/, (m, w, t, b, x, v) => 'A part becomes watertight through its wall: ' + w + ' wall loops, ' + t + ' / ' + b + ' top/bottom layers, +' + x + ' °C and a slower outer wall are set; in the slicer, “Gap infill: Everywhere”. Keep the fan rather low. PETG and ASA get denser than PLA. Simple vessels without a lid: vase mode with a wide line (' + muNum(v) + ' mm) is often tighter. For permanent water contact or pressure inside, coat with epoxy resin. Not suitable for drinking water or food – test with water after printing.'],
  [/^Das Profil gilt für (\d+(?:,\d+)?) mm (Gehärteter Stahl|Edelstahl \(Standard\)|Messing), gewählt ist (\d+(?:,\d+)?) mm (Gehärteter Stahl|Edelstahl \(Standard\)|Messing)\. Temperatur (unverändert|[+−]\d+ °C), Volumenstrom ×([\d.,]+), Schichthöhe und Linienbreite angepasst\. Das ist eine Näherung – nach dem ersten Druck prüfen und über „Werte anpassen“ speichern\.$/, (m, d1, m1, d2, m2, t, v) => 'The profile applies to ' + muNum(d1) + ' mm ' + muTr(m1) + ', selected is ' + muNum(d2) + ' mm ' + muTr(m2) + '. Temperature ' + (t === 'unverändert' ? 'unchanged' : t) + ', volumetric speed ×' + muNum(v) + ', layer height and line width adjusted. This is an approximation – check after the first print and save it via “Adjust values”.'],
  [/^Kleine Löcher erkannt \(⌀ bis ([\d.,]+) mm, z\. B\. für Wellen\/Stifte\) – bei ineinandergreifenden oder eng passenden Teilen \(z\. B\. Zahnrädern\) vorher einen Testkörper mit dem kritischen Maß drucken und nachmessen\. Weichen die Maße ab, in OrcaSlicer unter Prozesseinstellungen → Erweitert die X-Y-Konturkompensation anpassen \(xy_contour_compensation für Außenkonturen\/Zähne, xy_hole_compensation für Löcher\)\.$/, (m, d) => 'Small holes detected (⌀ up to ' + muNum(d) + ' mm, e.g. for shafts/pins) – for meshing or tight-fitting parts (e.g. gears), first print a test piece with the critical dimension and measure it. If the dimensions deviate, adjust the X-Y contour compensation in OrcaSlicer under Process settings → Advanced (xy_contour_compensation for outer contours/teeth, xy_hole_compensation for holes).'],
  // Orca-Hinweise (orcaWarningText)
  [/^Kein (.+)-eigenes Preset für (\w+) bekannt – Filament-JSON erbt stattdessen von „(.+)“\. Das klappt nur, wenn diese generische Bibliothek in deiner OrcaSlicer-Installation mit installiert ist\.$/, 'No $1 preset of its own is known for $2 – the filament JSON inherits from “$3” instead. This only works if that generic library is installed along with your OrcaSlicer.'],
  [/^Process-JSON: für ([\d,]+) mm Düse ist am (.+) kein Preset verifiziert \(nur ([\d,\/ mm]+) geprüft\) – Import kann fehlschlagen, Werte notfalls manuell eintragen\.$/, (m, d, p, ok) => 'Process JSON: no preset is verified for a ' + muNum(d) + ' mm nozzle on the ' + p + ' (only ' + muNum(ok) + ' checked) – the import may fail; enter the values manually if necessary.'],
  // Material-Namen vor einem Doppelpunkt (Überschrift einer Warnung)
  [/^(PLA – Standard|PLA Matt|PLA-CF \(Carbonfaser\)|PETG-CF \(Carbonfaser\)):$/, (m, n) => muTr(n) + ':'],
  // Zeilen mit „ · “ (Zusatzspalte, „Vor dem Druck“-Liste) – zuletzt, damit speziellere Muster vorgehen
  [/^(.+ · .+)$/, (m, s) => muSplit(s)],
  // Reine Zahlenwerte mit Einheit (0,20 mm · 18,0 mm³/s · 1,0–1,5 mm · 2,5–3,0 mm): nur das Zahlenformat
  [new RegExp('^(?=.*\\d[.,]\\d)(?:\\d[\\d.,]*|' + MU_UNITS + '|[\\s–\\/×+−·])+$'), (m) => muNum(m)]
];

/* Feste Sätze und Bezeichnungen ohne Zahlen: werden dem Wörterbuch nur hinzugefügt, wenn es dort (auch aus
   js/i18n-en-ui.js) noch keinen Eintrag gibt. */
const MU_FIXED = {
  // Titel, Quellenangaben der Filamentprofile
  'Halterung': 'Bracket', 'Präzisionsteil': 'Precision part', 'Freiform / Überhänge': 'Freeform / overhangs',
  'Am Kobra S1 getestetes Startprofil (0,4-mm-Werksdüse, Smooth Plate).': 'Starting profile tested on the Kobra S1 (0.4 mm factory nozzle, Smooth Plate).',
  'Am Kobra S1 getestetes Startprofil (0,4-mm-Werksdüse). Bewusst langsam.': 'Starting profile tested on the Kobra S1 (0.4 mm factory nozzle). Deliberately slow.',
  'Allgemeiner Startwert.': 'General starting value.',
  'Allgemeiner Startwert für normales (nicht High-Speed-)PLA.': 'General starting value for regular (non-high-speed) PLA.',
  'Allgemeiner Startwert. Silk glänzt am meisten bei langsamer Außenwand.': 'General starting value. Silk looks glossiest with a slow outer wall.',
  'Allgemeiner Startwert. Nur mit gehärteter Düse.': 'General starting value. Hardened nozzle only.',
  'Standardprofil mit deinen eigenen Werten.': 'Default profile with your own values.', 'Eigenes Profil.': 'Your own profile.',
  // Überschriften der Hinweise
  'Achtung:': 'Warning:', 'Hinweis:': 'Note:', 'Deine Notizen:': 'Your notes:', 'Umgerechnet:': 'Converted:', 'Feine Düse:': 'Fine nozzle:',
  'Quetschbares Teil:': 'Squishy part:', 'PLA im geschlossenen Drucker:': 'PLA in an enclosed printer:', 'Mehrfarbig:': 'Multicolor:',
  'Freiform:': 'Freeform:', 'Wasserdicht:': 'Watertight:', 'Dünnwandig:': 'Thin-walled:', 'Vor dem Druck:': 'Before printing:',
  // „Vor dem Druck“-Liste
  'Filamentprofil prüfen': 'Check the filament profile', 'Bett reinigen': 'Clean the bed', 'erste Schicht beobachten': 'watch the first layer',
  // Hinweise zu Drucker und Material
  'Temperaturen und Materialwerte stammen aus Tests am Kobra S1 und sind hier allgemeine Startwerte. Geschwindigkeiten, Beschleunigung und Volumenstrom sind auf das OrcaSlicer-Profil dieses Druckers begrenzt. Ersten Druck beobachten und über „Werte anpassen“ nachjustieren.': 'Temperatures and material values come from tests on the Kobra S1 and are general starting values here. Speeds, acceleration and volumetric speed are capped to the OrcaSlicer profile of this printer. Watch the first print and fine-tune via “Adjust values”.',
  'Temperatur- und Geschwindigkeitswerte sind von Anycubic-Tests übernommen, nicht auf dem U1 gegengetestet. Der U1 kann mechanisch deutlich mehr (CoreXY, laut Hersteller bis 500 mm/s) – vorsichtig steigern und die ersten Schichten sowie die Schichtvorschau genau beobachten.': 'Temperature and speed values are taken from Anycubic tests and have not been cross-tested on the U1. The U1 is mechanically capable of much more (CoreXY, up to 500 mm/s according to the manufacturer) – increase carefully and watch the first layers and the layer preview closely.',
  'TPU in der Regel nicht über die ACE-Pro-Station zuführen, sondern über den externen Spulenhalter (Herstellerangabe prüfen).': 'As a rule, do not feed TPU through the ACE Pro station; use the external spool holder instead (check the manufacturer’s information).',
  'Allgemeine Startwerte. Nach dem ersten Druck anpassen und über „Werte anpassen“ als eigene Werte speichern. Bei matter oder lückiger Oberfläche die maximale Volumengeschwindigkeit um 2–3 mm³/s senken.': 'General starting values. Adjust after the first print and save them as your own values via “Adjust values”. If the surface looks matte or patchy, lower the max volumetric speed by 2–3 mm³/s.',
  'Nur für sehr kleine Details sinnvoll; die Druckzeit steigt stark.': 'Only useful for very small details; print time increases a lot.',
  'Richtwert 2 Wände, 3 obere und 3 untere Schichten, 5 % Gyroid. Sehr dünne Schalen (1 Wand, 0 % Füllung) geben der Deckschicht keine Auflage. Für weicheres Ergebnis nur die Fülldichte senken und in der Vorschau prüfen. Bei Kinderspielzeug auf lose Fäden, scharfe Kanten und verschluckbare Kleinteile achten.': 'Guide values: 2 walls, 3 top and 3 bottom layers, 5 % gyroid. Very thin shells (1 wall, 0 % infill) give the top layer nothing to rest on. For a softer result, only lower the infill density and check the preview. For children’s toys, watch for loose strings, sharp edges and small parts that could be swallowed.',
  'Bewusst langsam. Schnelle Werksprozessprofile sind für TPU ungeeignet – im Slicer ein eigenes, langsames Prozessprofil speichern und auswählen.': 'Deliberately slow. Fast factory process profiles are unsuitable for TPU – save and select your own slow process profile in the slicer.',
  'Haftet auf glatter PEI-Platte sehr stark – Klebestift als Trennschicht verwenden, sonst kann die Beschichtung ausreißen. Neigt zu Fäden: bei Bedarf Rückzug leicht erhöhen.': 'Sticks very strongly to a smooth PEI plate – use glue stick as a release layer, otherwise the coating can tear out. Prone to stringing: raise retraction slightly if needed.',
  'Haube und Tür geschlossen lassen, Lüfter niedrig halten, Bett vor dem Start einige Minuten vorheizen. Beim Drucken entstehen Styrol-Dämpfe und ultrafeine Partikel – Raum gut lüften, nicht in Wohn- oder Schlafräumen drucken.': 'Keep the hood and door closed, keep the fan low, and preheat the bed for a few minutes before starting. Printing releases styrene fumes and ultrafine particles – ventilate the room well and do not print in living or sleeping areas.',
  'Bei langen Drucken den Deckel etwas öffnen – zu warme Luft im Bauraum kann Hitzestau im Hotend verursachen.': 'On long prints, open the lid slightly – overly warm air in the build chamber can cause heat creep in the hotend.',
  'Feine Schichten (erste Schicht doppelt so dick wie die Schichthöhe) und Füllung 100 % mit Linien. Die Farbwechsel bei den Höhen, die HueForge nennt, setzt du in OrcaSlicer (Schichtfarbwechsel) oder lädst die 3MF aus HueForge – dann übernimmt das Tool ihre Schichthöhen und Wechsel. An Druckern mit nur einer Düse den Reinigungsturm ausschalten.': 'Fine layers (first layer twice the layer height) and 100 % infill with lines. Set the colour changes at the heights HueForge gives you in OrcaSlicer (layer colour change), or load the 3MF from HueForge – the tool then keeps its layer heights and changes. On printers with a single nozzle, switch the prime tower off.',
  'Jeder Farbwechsel kostet Zeit und Spülmaterial. Kleine Details in einer eigenen Farbe verursachen viele zusätzliche Wechsel. Eine größere Schichthöhe reduziert die Zahl der Wechsel.': 'Every color change costs time and flushing material. Small details in a color of their own cause many additional changes. A larger layer height reduces the number of changes.',
  'Zuerst die Ausrichtung prüfen. Das Modell um 10–20° zu kippen reduziert Stützen oft deutlicher als jede Parameteränderung.': 'Check the orientation first. Tilting the model by 10–20° often reduces supports more than any parameter change.',
  'In der Vorschau prüfen, ob schmale Wände wirklich Bahnen bekommen. Bei zu dünnen Stellen im Slicer „Dünne Wände erkennen“ aktivieren.': 'Check in the preview whether narrow walls really get toolpaths. For spots that are too thin, enable “Detect thin walls” in the slicer.',
  'Präzisionsteil: Vorher einen kleinen Testkörper mit dem kritischen Maß drucken und nachmessen. Weichen die Maße systematisch ab, in OrcaSlicer unter Prozesseinstellungen → Erweitert die X-Y-Konturkompensation (xy_contour_compensation für Außenkonturen, xy_hole_compensation für Löcher) oder das Durchflussverhältnis anpassen.': 'Precision part: first print a small test piece with the critical dimension and measure it. If the dimensions deviate systematically, adjust the X-Y contour compensation in OrcaSlicer under Process settings → Advanced (xy_contour_compensation for outer contours, xy_hole_compensation for holes) or the flow ratio.',
  // Stützen-Empfehlung
  'Geometrie prüfen': 'Check geometry', 'Nur bei zwingender Geometrie': 'Only if the geometry requires it', 'Nur kritische Bereiche': 'Support critical regions only',
  'Vermeiden: zuerst Modell drehen': 'Avoid: rotate the model first', 'Ja – Baumstützen': 'Yes – tree supports',
  'Vor dem Druck die Schichtvorschau prüfen: Die Oberseite darf keine freien Bahnen oder Löcher zeigen.': 'Check the layer preview before printing: the top must not show any lines hanging in mid-air or holes.',
  'Noch keine STL geladen. In der Slicer-Vorschau die Überhangfarbe prüfen.': 'No STL loaded yet. Check the overhang coloring in the slicer preview.',
  'einschalten.': '.', 'und': 'and', 'aktivieren.': '.', 'Typ: Baum (automatisch)': 'Set type: Tree (auto)', 'nur kritische Bereiche': 'enable Support critical regions only',
  'Nur auf Druckplatte': 'On build plate only', 'zuerst testen; bei unerreichbaren Innenflächen deaktivieren.': ': test this first; turn it off if inner faces are unreachable.',
  '5. Raft aus. Immer die Schichtvorschau prüfen.': '5. Raft off. Always check the layer preview.',
  'Im Slicer': 'In the slicer, leave', 'Stützstrukturen aktivieren': 'Enable support',
  'ausgeschaltet lassen und in der Vorschau kurz kontrollieren, ob keine Bahnen frei in der Luft hängen.': 'off, and briefly check in the preview that no lines hang freely in mid-air.',
  'Für die aktuelle Auswahl werden keine Stützen empfohlen. Die Stützparameter erscheinen hier, sobald Stützen nötig sind oder du bei „Support“ „Support erlaubt“ wählst und das Modell Überhänge hat.': 'No supports are recommended for the current selection. The support parameters appear here as soon as supports are needed, or when you choose “Support allowed” under “Support” and the model has overhangs.',
  'Für die aktuelle Auswahl und dieses Modell werden keine Stützen empfohlen. Die Stützparameter erscheinen hier, sobald Stützen nötig sind oder du bei „Support“ „Support erlaubt“ wählst und das Modell Überhänge hat.': 'No supports are recommended for the current selection and this model. The support parameters appear here as soon as supports are needed, or when you choose “Support allowed” under “Support” and the model has overhangs.',
  'Die Bezeichnungen orientieren sich an OrcaSlicer. Je nach Version und „Erweitert“-Schalter liegen einzelne Felder tiefer in der jeweiligen Registerkarte. Die Nahtposition gehört zu': 'The labels follow OrcaSlicer. Depending on the version and the “Advanced” switch, some fields are deeper in the respective tab. The seam position belongs to',
  ', nicht zu Struktur.': ', not to Strength.',
  // Stützparameter und Stützen-Gruppe des Datenblatts (Orca-Wortlaut)
  'Typ': 'Type', 'Baum (automatisch)': 'Tree (auto)', 'Schwellenwinkel': 'Threshold angle', 'Aktivieren': 'Enable', 'Aktivieren, nur kritische Bereiche': 'Enable, critical regions only',
  'zunächst aktivieren': 'enable at first', 'Ein, zuerst testen': 'On, test first', 'Aus': 'Off', 'Kleine Überhänge entfernen': 'Remove small overhangs',
  'Druckbasis/Raft': 'Raft layers', '0 Schichten': '0 layers', 'Oberer Z-Abstand': 'Top Z distance', 'Unterer Z-Abstand': 'Bottom Z distance',
  'Wände um Stützstrukturen': 'Support wall loops', 'Abstand Grundmuster': 'Base pattern spacing', 'Obere Schnittstellenschichten': 'Top interface layers',
  'Untere Schnittstellenschichten': 'Bottom interface layers', 'Oberer Schnittstellenabstand': 'Top interface spacing', 'Schnittstellenabstand': 'Top interface spacing',
  'Stützen/Objekt XY-Abstand': 'Support/object XY distance', 'Stützen/Objekt Abstand erste Schicht': 'Support/object first layer gap',
  'Stützspitze': 'Tip Diameter', 'Ast-Dichte': 'Branch Density', 'Astabstand': 'Tree support branch distance', 'Stützast-Durchmesser': 'Tree support branch diameter',
  // Datenblatt: weitere Werte und Zusätze
  'Ja': 'Yes', 'Angabe auf der Rolle': 'see the spool label', 'ABS/ASA neigt bei größeren Teilen zum Verziehen': 'ABS/ASA tends to warp on larger parts',
  'großes flaches Teil: wenn Ecken abheben, 3–5 mm Brim oder Mausohren': 'large flat part: if corners lift, use a 3–5 mm brim or mouse ears',
  'Ein, Breite 30–35 mm': 'On, width 30–35 mm', 'ca. 5 s laut Hersteller': 'approx. 5 s according to the manufacturer'
};
if (typeof I18N_EN !== 'undefined') for (const k of Object.keys(MU_FIXED)) if (!Object.prototype.hasOwnProperty.call(I18N_EN, k)) I18N_EN[k] = MU_FIXED[k];
