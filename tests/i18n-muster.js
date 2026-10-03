'use strict';
/* Prüft die Muster für zusammengesetzte Texte (js/i18n-en-muster.js) ohne Browser:
   erzeugt mit engine.js/data.js (compute für alle Drucker × Filamente × Objekte × Ziele × Belastung × Support ×
   Stützreduzierung, mit und ohne Test-Geometrie) die Texte, die panel.js (update()) in die Seite schreibt, zerlegt
   sie wie das DOM an den Tags in Textknoten und prüft im Englisch-Modus, dass jedes Stück mit deutschen Wörtern
   übersetzt wird (Ausnahmen: Liste unten). Dazu Stichproben mit erwarteten englischen Sätzen und Zahlenformaten.
   Aufruf: node tests/i18n-muster.js [--dump]  (--dump listet die nicht übersetzten Stücke). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const DUMP = process.argv.includes('--dump');

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else { fail++; console.log('FEHLER ' + name + (detail !== undefined ? ': ' + detail : '')); } }
const read = f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');

// ---------- Rechenkern (ohne DOM) ----------
const ectx = vm.createContext({ console });
for (const f of ['util', 'data', 'store', 'engine', 'stl']) vm.runInContext(read(f + '.js'), ectx);
const E = vm.runInContext('({compute, getMat, store, BUILTIN, OBJ, PRINTERS, NOZZLE_MATERIALS, GOAL_LABEL, STATUS, makeGeom, orcaWarningText, de, esc})', ectx);
// panel.js braucht das DOM; precisionHint() wird deshalb aus dem Quelltext herausgelöst (kein abgeschriebener Text)
const precisionSrc = /function precisionHint\(r\)\{[\s\S]*?\n\}/.exec(read('panel.js'));
check('precisionHint im Quelltext von panel.js gefunden', !!precisionSrc);

// ---------- Übersetzer wie im Browser ----------
const mem = {};
const tctx = vm.createContext({
  document: { documentElement: {}, body: { nodeType: 8 }, addEventListener: () => {}, getElementById: () => null },
  navigator: { language: 'de-DE' }, localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } }
});
const optional = f => (fs.existsSync(path.join(ROOT, 'js', f)) ? read(f) : '');
vm.runInContext(read('i18n-en.js') + '\n' + optional('i18n-en-ui.js') + '\n' + read('i18n-en-muster.js') + '\n' + read('i18n.js') +
  '\n;globalThis.I18N = I18N; globalThis.tr = tr; globalThis.num = fmtNum; globalThis.I18N_EN = I18N_EN; globalThis.I18N_EN_PATTERNS = I18N_EN_PATTERNS;', tctx);
tctx.I18N.setLang('en');
const tr = s => tctx.tr(s);
// Textknoten-Schlüssel wie i18n.js textNode(): Leerraum zusammengefasst, getrimmt
const norm = s => s.replace(/\s+/g, ' ').trim();

// ---------- Test-Geometrien ----------
function box(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];   // außen liegende Normalen
  const out = [];
  for (const q of f) for (const t of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) for (const i of t) out.push(...v[i]);
  return out;
}
const soup = (...boxes) => new Float32Array([].concat(...boxes));
const GEOMS = {
  none: null,
  cube: E.makeGeom('würfel', soup(box(0, 0, 0, 20, 20, 20))),                                          // kein Überhang, normale Fläche
  tiny: E.makeGeom('klein', soup(box(0, 0, 0, 8, 8, 3))),                                              // Höhe < 4 mm, kleine Aufstandsfläche
  slender: E.makeGeom('schlank', soup(box(0, 0, 0, 10, 10, 60))),                                      // schlank → Brim
  flat: E.makeGeom('flach', soup(box(0, 0, 0, 130, 60, 4.4))),                                         // > 110 mm und > 80 mm
  few: E.makeGeom('wenig', soup(box(0, 0, 0, 30, 30, 30), box(30, 10, 14, 36, 20, 17))),               // kleiner Überhang
  needed: E.makeGeom('pilz', soup(box(15, 15, 0, 25, 25, 20), box(0, 0, 20, 40, 40, 25)))              // große Decke (waagerecht)
};

// ---------- Texte erzeugen (spiegelt panel.js update()) ----------
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = s => s.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, m => ENT[m]);
// HTML → Textknoten (Tags trennen, wie im DOM)
const pieces = html => html.split(/<[^>]*>/).map(decode).map(norm).filter(Boolean);

const pool = new Map();   // Stück → erstes Beispiel (Kontext)
const add = (html, ctx) => { for (const p of pieces(html)) if (!pool.has(p)) pool.set(p, ctx); };
const MATS = E.BUILTIN.map(b => b.id);
const NOZ_D = ['0.2', '0.25', '0.4', '0.6', '0.8'];
const stabilityLike = ''; // Stabilitäts-Hinweis (fragility-ui.js) gehört nicht zu engine/data/export3mf

// precisionHint(project, r) einmal bauen; Löcher der Testteile: ⌀ 3 und ⌀ 5 mm
const precisionFn = new Function('project', 'partHoles', 'P_TF', 'P_NUM', 'return (' + precisionSrc[0].replace('function precisionHint', 'function') + ')');
const deTF = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m));   // deutsche Fassung, wie panel.js ohne Sprachwahl
const precisionHint = (project, r) => precisionFn(project, () => [{ r: 1.5 }, { r: 2.5 }], deTF, E.de)(r);
function render(r, geom, project) {
  const ctx = r.printer.id + '/' + r.m.id + '/' + r.o;
  const st = E.STATUS[r.effectiveStatus] || E.STATUS.generic;
  const E_ = E.esc, de = E.de;
  // Titel und Zusammenfassung
  add(r.m.name, ctx); add(r.ob.label, ctx); add(E.GOAL_LABEL[r.g], ctx);
  add((geom ? de(geom.x, 1) + ' × ' + de(geom.y, 1) + ' × ' + de(geom.z, 1) + ' mm · ' : '') + '<span class="badge">' + st[1] + '</span> ' + E_(r.m.overridden ? 'Standardprofil mit deinen eigenen Werten.' : r.m.src) + ' Düse: ' + E_(r.nozLabel) + '.', ctx);
  add(E.orcaWarningText(r), ctx);
  const hint = project ? precisionHint(project, r) : null;
  const dangerAll = r.danger.concat(hint ? [hint] : []);
  add(dangerAll.length ? '<b>Achtung:</b><br>' + dangerAll.map(E_).join('<br>') : '', ctx);
  add(r.warn.join('<br><br>'), ctx);
  add('<b>Vor dem Druck:</b> Filamentprofil prüfen · Düse ' + E_(r.nozLabel) + ' · Bett reinigen · erste Schicht beobachten' + (r.dryNeed && r.m.dry ? ' · ' + E_(r.m.dry) : '') + (geom ? '<br>STL-Maße und Überhanganalyse (' + r.a.th + '°) wurden berücksichtigt.' : ''), ctx);
  add('<h3>Stützen-Empfehlung</h3><b>' + E_(r.sup) + '</b><br>' + E_(r.supNeed) +
    (r.supOn ? '<br><br><b>So stellst du es in ' + E_(r.printer.slicer) + ' ein:</b><br>1. <i>Stützstrukturen aktivieren</i> einschalten.<br>2. <i>Typ: Baum (automatisch)</i> und <i>nur kritische Bereiche</i> aktivieren.<br>3. <i>Schwellenwinkel: ' + r.sp.angle + '°</i>.<br>4. <i>Nur auf Druckplatte</i> zuerst testen; bei unerreichbaren Innenflächen deaktivieren.<br>5. Raft aus. Immer die Schichtvorschau prüfen.' : '<br><br>Im Slicer <i>Stützstrukturen aktivieren</i> ausgeschaltet lassen und in der Vorschau kurz kontrollieren, ob keine Bahnen frei in der Luft hängen.'), ctx);
  if (r.a) add(r.a.level === 'none' ? 'Keine relevanten Überhänge über ' + r.a.th + '° (Bodenfläche ausgenommen).' : 'Über ' + r.a.th + '°: ca. ' + de(r.a.flagged, 0) + ' mm² (' + de(r.a.ratio * 100, 1) + ' % der Oberfläche, Bodenfläche ausgenommen).', ctx);
  add('Die Bezeichnungen orientieren sich an ' + E_(r.printer.slicer) + '. Je nach Version und „Erweitert“-Schalter liegen einzelne Felder tiefer in der jeweiligen Registerkarte. Die Nahtposition gehört zu <b>Qualität</b>, nicht zu Struktur.', ctx);
  // Stützparameter-Raster (Spiegel von panel.js; Werte aus dem Rechenkern)
  const tpu = r.tpu, sp = r.sp;
  if (r.supOn) {
    const p = [['Stützstrukturen', 'Aktivieren, nur kritische Bereiche'], ['Typ', 'Baum (automatisch)'], ['Schwellenwinkel', sp.angle + '°'], ['Nur auf Druckplatte', 'zunächst aktivieren'], ['Kleine Überhänge entfernen', sp.small], ['Druckbasis/Raft', '0 Schichten'], ['Oberer Z-Abstand', de(r.supZ.top, 2) + ' mm'], ['Unterer Z-Abstand', de(r.supZ.bottom, 2) + ' mm'], ['Wände um Stützstrukturen', '0'], ['Abstand Grundmuster', tpu ? '3,0 mm' : '2,5–3,0 mm'], ['Obere Schnittstellenschichten', sp.iface], ['Untere Schnittstellenschichten', '1'], ['Oberer Schnittstellenabstand', sp.gap], ['Stützen/Objekt XY-Abstand', sp.xy], ['Stützen/Objekt Abstand erste Schicht', tpu ? '0,25 mm' : '0,20 mm'], ['Stützspitze', '0,8 mm'], ['Ast-Dichte', sp.density], ['Astabstand', sp.branch], ['Stützast-Durchmesser', '2,0 mm']];
    add('<div class="grid">' + p.map(x => '<div><b>' + x[0] + '</b><br><span class="muted">' + x[1] + '</span></div>').join('') + '</div>', ctx);
  } else add('<p>Für die aktuelle Auswahl' + (geom ? ' und dieses Modell' : '') + ' werden keine Stützen empfohlen. Die Stützparameter erscheinen hier, sobald Stützen nötig sind oder du bei „Support“ „Support erlaubt“ wählst und das Modell Überhänge hat.</p>', ctx);
  // Datenblatt: Bezeichnung, Wert und Zusatz je Zeile (rowHTML / specCell)
  const row = x => '<div><b>' + E_(x[0]) + '</b><span class="value">' + x[1] + (x[2] ? '<small>' + x[2] + '</small>' : '') + '</span></div>';
  add(r.rows.map(row).join(''), ctx);
  add(r.ordered.map(g => '<div class="order-title">' + g[0] + '</div>' + g[1].map(row).join('')).join(''), ctx);
}

let combos = 0;
const seenKeys = new Set();
function run(printer, over, geom, gname) {
  const I = Object.assign({ printer, nozD: '0.4', nozM: E.PRINTERS[printer].nozzleDefault, material: 'pla_hs', object: 'general', goal: 'balanced', load: 'medium', support: 'auto', supportLevel: 'balanced', thresh: '45' }, over);
  const key = JSON.stringify(I) + gname;
  if (seenKeys.has(key)) return;
  seenKeys.add(key);
  let r; try { r = E.compute(I, geom, { getMat: E.getMat, settings: E.store.settings }); } catch (e) { return; }
  combos++; render(r, geom, geom ? { threemf: false, parts: [{}], selected: 0 } : null);
}
for (const printer of ['kobra_s1', 'snapmaker_u1']) {
  const pm = E.PRINTERS[printer];
  // 1) Grundraster: Filament × Objekt × Ziel × Geometrie
  for (const material of MATS) for (const object of Object.keys(E.OBJ)) for (const goal of ['balanced', 'quality', 'fast', 'strong'])
    for (const [gname, geom] of Object.entries(GEOMS)) run(printer, { material, object, goal }, geom, gname);
  // 2) je eine weitere Achse variieren (Belastung, Support, Stützreduzierung, Düse, Düsenmaterial)
  for (const material of ['pla_hs', 'tpu', 'petg_cf', 'abs']) for (const object of Object.keys(E.OBJ))
    for (const [gname, geom] of Object.entries(GEOMS)) {
      for (const load of ['low', 'high']) run(printer, { material, object, load }, geom, gname);
      for (const support of ['avoid', 'allow']) run(printer, { material, object, support }, geom, gname);
      if (gname === 'needed') for (const supportLevel of ['safe', 'reduced', 'minimal']) for (const support of ['auto', 'allow']) run(printer, { material, object, supportLevel, support }, geom, gname);
      if (gname === 'none') for (const nozD of NOZ_D) run(printer, { material, object, nozD }, geom, gname);
      if (gname === 'none') for (const nozM of pm.nozzleOptions.concat(Object.keys(E.NOZZLE_MATERIALS))) run(printer, { material, object, nozM }, geom, gname);
      if (gname === 'none') for (const nozD of ['0.2', '0.6']) for (const nozM of Object.keys(E.NOZZLE_MATERIALS)) run(printer, { material, object, nozD, nozM }, geom, gname);
    }
}
// Eigenes Profil und Profil mit Notizen/Überschreibung
E.store.profiles.eigen = Object.assign({}, E.BUILTIN.find(b => b.id === 'petg'), { name: 'Mein Filament', notes: 'Zeile eins\nZeile zwei' });
E.store.profiles.pla = { nozzle: [200, 205, 210], notes: 'Meine Notiz' };
for (const mat of ['eigen', 'pla']) for (const printer of ['kobra_s1', 'snapmaker_u1']) {
  const r = E.compute({ printer, nozD: '0.4', nozM: E.PRINTERS[printer].nozzleDefault, material: mat, object: 'general', goal: 'balanced', load: 'medium', support: 'auto', supportLevel: 'balanced', thresh: '45' }, null, { getMat: E.getMat, settings: E.store.settings });
  combos++; render(r, null, null);
}
delete E.store.profiles.eigen; delete E.store.profiles.pla;

// ---------- Prüfung ----------
// Bewusst nicht übersetzt (ganze Wörter/Textknoten): Eigennamen, Produkt- und Profilnamen, englische Fachwörter der
// Seite selbst, Nutzereingaben aus den Testprofilen. Wörter dieser Liste zählen beim Prüfen als sprachneutral.
const NAMES = ['Anycubic Kobra S1 Combo', 'Snapmaker U1', 'Anycubic PLA High Speed', 'ELEGOO Rapid PLA+ High Speed', 'PETG High Speed', 'TPU 95A',
  'Smooth Plate', 'Gyroid', 'PLA Silk', 'PETG', 'ASA', 'ABS', 'TPU', 'PLA', 'OrcaSlicer', 'Orca', 'Brim', 'Travel', 'STL', 'ACE', 'S1', 'U1',
  'Mein Filament', 'Meine Notiz', 'Zeile eins', 'Zeile zwei'];
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAME_RE = new RegExp('(?:' + NAMES.slice().sort((a, b) => b.length - a.length).map(reEsc).join('|') + ')', 'g');
const UNIT_RE = /mm\/s²|mm\/s|mm³\/s|mm²|mm|°C|\bs\b/g;
const needsTranslation = p => /[A-Za-zÄÖÜäöüß]/.test(p.replace(NAME_RE, '').replace(UNIT_RE, ''));
const GERMAN = /[äöüß]|\b(und|der|die|das|den|dem|des|mit|bei|nicht|nur|für|ist|sind|wird|werden|oder|auf|von|zum|zur|eine|einen|kann|dann|wenn|noch|nach|vor|über|mehr|weniger|kein|keine|nötig|Düse|Stütze[n]?|Schicht(en)?|Wand|Vorschau)\b/i;
const lookup = vm.runInContext('i18nLookup', tctx);
const notCovered = [], stillGerman = [], numWrong = [];
for (const [p, ctx] of pool) {
  const en = tr(p);
  if (needsTranslation(p) && lookup(p) === undefined) notCovered.push(p + '   ⟵ ' + ctx);
  else if (needsTranslation(p) && GERMAN.test(en)) stillGerman.push(p + ' → ' + en + '   ⟵ ' + ctx);
  if (/\d,\d/.test(p) && /\d,\d{1,2}(?!\d)/.test(en)) numWrong.push(p + ' → ' + en);
  if (/\d\.\d{3}/.test(p) && !/\d,\d{3}/.test(en)) numWrong.push(p + ' → ' + en);
}
const needed = [...pool.keys()].filter(needsTranslation).length;
console.log('Textstücke: ' + pool.size + ' (aus ' + combos + ' Berechnungen), davon mit Text zu übersetzen: ' + needed + ', übersetzt: ' + (needed - notCovered.length) + ' von ' + needed + ', Muster: ' + tctx.I18N_EN_PATTERNS.length);
if (DUMP) { for (const s of notCovered) console.log('  FEHLT> ' + s); for (const s of stillGerman) console.log('  DEUTSCH> ' + s); for (const s of numWrong) console.log('  ZAHL> ' + s); }
check('Jedes Textstück mit Text hat eine englische Fassung (' + needed + ' geprüft)', notCovered.length === 0, '\n  ' + notCovered.slice(0, 40).join('\n  ') + (notCovered.length > 40 ? '\n  … ' + (notCovered.length - 40) + ' weitere' : ''));
check('Übersetzungen enthalten keine deutschen Wörter mehr', stillGerman.length === 0, '\n  ' + stillGerman.slice(0, 20).join('\n  '));
check('Zahlen im englischen Format (Punkt statt Dezimalkomma, Komma als Tausender)', numWrong.length === 0, '\n  ' + numWrong.slice(0, 20).join('\n  '));

// ---------- Stichproben ----------
const X = (de, en) => check('Stichprobe: ' + de.slice(0, 60), tr(de) === en, '\n  erhalten: ' + tr(de) + '\n  erwartet: ' + en);
X('20,0 × 20,0 × 20,0 mm ·', '20.0 × 20.0 × 20.0 mm ·');
X('Am Kobra S1 getestetes Startprofil (0,4-mm-Werksdüse, Smooth Plate). Düse: 0,4 mm Gehärteter Stahl.', 'Starting profile tested on the Kobra S1 (0.4 mm factory nozzle, Smooth Plate). Nozzle: 0.4 mm Hardened steel.');
X('Allgemeiner Startwert. Düse: 0,25 mm Messing.', 'General starting value. Nozzle: 0.25 mm Brass.');
X('Standardprofil mit deinen eigenen Werten. Düse: 0,6 mm Edelstahl (Standard).', 'Default profile with your own values. Nozzle: 0.6 mm Stainless steel (standard).');
X('Über 45°: ca. 27.073 mm² (4,2 % der Oberfläche, Bodenfläche ausgenommen).', 'Above 45°: approx. 27,073 mm² (4.2 % of the surface, bottom face excluded).');
X('Keine relevanten Überhänge über 45°. Flächen, die auf dem Druckbett liegen, werden nicht mitgezählt. Kleine Fasen und Bohrungen druckt der Slicer ohne Stütze.', 'No relevant overhangs above 45°. Faces resting on the print bed are not counted. The slicer prints small chamfers and holes without support.');
X('Deutliche Überhänge erkannt (ca. 1.200 mm², 12,5 % der Oberfläche, davon ca. 1.000 mm² fast waagerecht). Baumstützen ab Druckbett, nur kritische Bereiche.', 'Significant overhangs detected (approx. 1,200 mm², 12.5 % of the surface, of which approx. 1,000 mm² almost horizontal). Tree supports from the bed, critical regions only.');
X('Einzelne Überhänge (ca. 50 mm², 0,3 % der Oberfläche). Meist druckbar; nur stützen, wenn die Vorschau frei hängende Bahnen zeigt.', 'A few overhangs (approx. 50 mm², 0.3 % of the surface). Usually printable; only add supports if the preview shows lines hanging in mid-air.');
X('+5 °C für Messing', '+5 °C for Brass');
X('−5 °C für Gehärteter Stahl', '−5 °C for Hardened steel');
X('+5 °C für dichte Schichten', '+5 °C for tightly fused layers');
X('effektiv ca. 83 mm/s (Grenze 12,0 mm³/s)', 'effectively approx. 83 mm/s (limit 12.0 mm³/s)');
X('Richtwert 0,6 mm / 35 mm/s (am S1 getestet)', 'Guide value 0.6 mm / 35 mm/s (tested on the S1)');
X('umgerechnet für 0,4 mm Messing', 'converted for 0.4 mm Brass');
X('0,35 mm', '0.35 mm'); X('1,0–1,5 mm', '1.0–1.5 mm'); X('2,5–3,0 mm', '2.5–3.0 mm');
X('Vor dem Druck trocknen: ca. 65 °C für 4–6 Stunden.', 'Dry before printing: approx. 65 °C for 4–6 hours.');
X('Bei Bedarf trocknen: ca. 70 °C für 4 Stunden.', 'Dry if needed: approx. 70 °C for 4 hours.');
X('Düse 0,4 mm Messing', 'Nozzle 0.4 mm Brass');

console.log(pass + '/' + (pass + fail) + ' bestanden');
process.exit(fail ? 1 : 0);
