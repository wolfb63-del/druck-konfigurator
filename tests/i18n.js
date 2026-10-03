'use strict';
/* Prüft die Sprachwahl (js/i18n.js, js/i18n-en.js) ohne Browser:
   1) Wörterbuch: keine doppelten Schlüssel, keine leeren Übersetzungen.
   2) Orca-Begriffe wörtlich wie OrcaSlicer (tools/orca-labels-en.json, erzeugt aus Orcas PrintConfig.cpp).
   3) Vollständigkeit: jeder feste Text und jedes title/aria-label/placeholder aus index.html und jede
      Datenblatt-Bezeichnung/-Gruppe, die engine.js für alle Drucker × Filamente × Objekte × Ziele erzeugt,
      hat eine englische Fassung (Ausnahmen: Eigennamen, Zahlen, Formate – Liste unten).
   4) Übersetzer an einer Attrappe des DOM: hin und zurück, Leerraum bleibt, von der Seite neu
      geschriebener Text wird neu übersetzt, unbekannter Text bleibt deutsch. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else { fail++; console.log('FEHLER ' + name + (detail !== undefined ? ': ' + detail : '')); } }

const src = fs.readFileSync(path.join(ROOT, 'js', 'i18n-en.js'), 'utf8');
const dctx = vm.createContext({});
vm.runInContext(src + '\n;globalThis.I18N_EN = I18N_EN;', dctx);
const EN = dctx.I18N_EN;

// 1) Doppelte Schlüssel erkennt nur der Quelltext (im Objekt gewinnt still der letzte)
{
  const keys = [...src.replace(/\/\/[^\n]*/g, '').matchAll(/(?:^|[{,]\s*)'((?:[^'\\]|\\.)*)'\s*:/gm)].map(m => m[1]);
  const seen = new Set(), dup = keys.filter(k => seen.has(k) || !seen.add(k));
  check('Wörterbuch: keine doppelten Schlüssel', dup.length === 0, dup.join(' | '));
  // TPU-Fassungen der Hilfetexte erzeugt i18n-en.js zur Laufzeit (kein eigener Eintrag im Quelltext)
  const literal = Object.keys(EN).filter(k => !k.endsWith(' TPU reagiert deutlich empfindlicher auf hohe Geschwindigkeit als PLA.'));
  check('Wörterbuch: Schlüssel gefunden', keys.length === literal.length, keys.length + ' / ' + literal.length);
  const empty = Object.entries(EN).filter(([k, v]) => !v || !v.trim()).map(([k]) => k);
  check('Wörterbuch: keine leeren Übersetzungen', empty.length === 0, empty.join(' | '));
}

// 2) Orca-Begriffe: deutsche Bezeichnung im Tool → Orca-Schlüssel → exakter englischer Orca-Name
{
  const orca = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'orca-labels-en.json'), 'utf8'));
  const ORCA_TERMS = {
    'Wandlinien': 'wall_loops', 'Max. Volumenstrom': 'filament_max_volumetric_speed', 'Maximale Volumengeschwindigkeit': 'filament_max_volumetric_speed',
    'Schichthöhe': 'layer_height', 'Höhe der ersten Schicht': 'initial_layer_print_height', 'Elefantenfußkompensation': 'elefant_foot_compensation',
    'Nahtposition': 'seam_position', 'Obere Schichten': 'top_shell_layers', 'Untere Schichten': 'bottom_shell_layers',
    'Fülldichte': 'sparse_infill_density', 'Füllmuster': 'sparse_infill_pattern', 'Lückenfüllung': 'gap_infill_speed',
    'Erste Schicht': 'initial_layer_speed', 'Füllung erste Schicht': 'initial_layer_infill_speed', 'Außenwand': 'outer_wall_speed',
    'Innere Wand': 'inner_wall_speed', 'Füllung': 'sparse_infill_speed', 'Obere Fläche': 'top_surface_speed', 'Travel': 'travel_speed',
    'Raft': 'raft_layers', 'Durchflussverhältnis': 'filament_flow_ratio', 'Pressure Advance': 'pressure_advance',
    'Düsendurchmesser': 'nozzle_diameter', 'Z-Hop': 'z_hop'
  };
  const wrong = Object.entries(ORCA_TERMS).filter(([de, key]) => EN[de] !== orca[key]).map(([de, key]) => de + ' → „' + EN[de] + '“, Orca: „' + orca[key] + '“');
  check('Orca-Begriffe wörtlich wie OrcaSlicer (' + Object.keys(ORCA_TERMS).length + ')', wrong.length === 0, wrong.join(' | '));
}

// 3) Vollständigkeit
{
  const SKIP = /^(EN|DE|Anycubic|Snapmaker|Kobra S1|U1|Anycubic Kobra S1|Anycubic Kobra S1 Combo|Snapmaker U1|Snapmaker U1:|Kobra S1:|Rinkhals|Facebook|OK|STL, 3MF, ZIP|Filament-JSON|Process-JSON|bw\.3d\.druck@gmail\.com|Gyroid|Smooth Plate|ABS|ASA|PETG|PETG High Speed|PLA Silk|TPU 95A|Anycubic PLA High Speed|ELEGOO Rapid PLA\+ High Speed|[\d.,\s]+mm)$/;
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '');
  const clean = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  const want = new Set();
  for (const m of html.matchAll(/>([^<>]+)</g)) { const t = clean(m[1]); if (t && /[A-Za-zÄÖÜäöüß]{2}/.test(t)) want.add(t); }
  for (const m of html.matchAll(/\s(?:title|aria-label|placeholder)="([^"]+)"/g)) { const t = clean(m[1]); if (!/^(EN|DE)$/.test(t)) want.add(t); }
  const ectx = vm.createContext({ console });
  for (const f of ['util', 'data', 'store', 'engine']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ectx);
  const E = vm.runInContext('({compute, getMat, store, BUILTIN, helpFor})', ectx);
  for (const printer of ['kobra_s1', 'snapmaker_u1']) for (const mat of E.BUILTIN.map(b => b.id))
    for (const object of ['general', 'functional', 'decor', 'tire', 'case', 'multicolor', 'dumpling']) for (const goal of ['balanced', 'quality', 'fast', 'strong']) {
      let r; try { r = E.compute({ printer, nozD: '0.4', nozM: 'brass', material: mat, object, goal, load: 'medium', support: 'auto', supportLevel: 'balanced', thresh: '45' }, null, { getMat: E.getMat, settings: E.store.settings }); } catch (e) { continue; }
      want.add(r.ob.label); want.add(r.m.name);   // Titel „Filament – Objekt · Ziel“ (panel.js)
      const help = l => { const h = E.helpFor(l, r.m.kind); if (h) want.add(h); };   // „?“-Texte genau wie engine.js sie baut (auch TPU-Zusatz)
      (r.rows || []).forEach(x => { want.add(x[0]); help(x[0]); });
      (r.ordered || []).forEach(g => { want.add(g[0]); g[1].forEach(x => { want.add(x[0]); help(x[0]); }); });
    }
  for (const v of Object.values(vm.runInContext('GOAL_LABEL', ectx))) want.add(v);
  const missing = [...want].filter(t => !SKIP.test(t) && EN[t] === undefined);
  check('Vollständig: feste Texte, Attribute und Datenblatt (' + want.size + ')', missing.length === 0, missing.join(' | '));
}

// 3b) Satzvorlagen im Code (H_TF/O_TF/T(…) mit festem Text): jede hat einen Eintrag, Platzhalter gleich
{
  const used = new Set();
  for (const f of ['holes-ui.js', 'orient-ui.js']) {
    const code = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    for (const m of code.matchAll(/[HO]_TF\('((?:[^'\\]|\\.)*)'/g)) used.add(m[1]);
    // Vorlagen, die per ?: gewählt werden: H_TF(x ? 'A {n}' : 'B {n}', …)
    for (const m of code.matchAll(/\? '((?:[^'\\]|\\.)*\{[a-z]+\}(?:[^'\\]|\\.)*)' : '((?:[^'\\]|\\.)*)'/g)) { used.add(m[1]); used.add(m[2]); }
  }
  for (const v of ['senkrecht', 'waagerecht (X)', 'waagerecht (Y)']) used.add(v);
  const missing = [...used].filter(k => !Object.prototype.hasOwnProperty.call(EN, k));
  check('Satzvorlagen: alle ' + used.size + ' im Wörterbuch', used.size >= 15 && missing.length === 0, missing.join(' | '));
  const ph = t => (t.match(/\{\w+\}/g) || []).sort().join();
  const bad = Object.keys(EN).filter(k => /\{\w+\}/.test(k) && ph(k) !== ph(EN[k]));
  check('Satzvorlagen: Platzhalter deutsch = englisch', bad.length === 0, bad.join(' | '));
}

// 4) Übersetzer an einer DOM-Attrappe
{
  const mkText = v => ({ nodeType: 3, nodeValue: v, nextSibling: null });
  const mkEl = (tag, attrs, kids) => {
    const a = new Map(Object.entries(attrs || {})), el = { nodeType: 1, tagName: tag, firstChild: null, nextSibling: null,
      hasAttribute: k => a.has(k), getAttribute: k => (a.has(k) ? a.get(k) : null), setAttribute: (k, v) => a.set(k, String(v)) };
    (kids || []).forEach((k, i, arr) => { if (i === 0) el.firstChild = k; k.nextSibling = arr[i + 1] || null; });
    return el;
  };
  const t1 = mkText('\n  Datei  '), t2 = mkText('Unbekannter Satz 42'), btn = mkEl('BUTTON', { title: 'Hilfe', 'aria-label': 'Menü' }, [t1]);
  const body = mkEl('BODY', {}, [btn, mkEl('P', {}, [t2])]);
  const mem = { 'druckKonfigurator.lang': 'de' };
  const ctx = vm.createContext({ document: { documentElement: {}, body, addEventListener: () => {}, getElementById: () => null },
    navigator: { language: 'de-DE' }, localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } } });
  vm.runInContext(src + '\n' + fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8') + '\n;globalThis.I18N = I18N; globalThis.tr = tr;', ctx);
  ctx.I18N.setLang('en');
  check('Übersetzer: Text englisch, Leerraum erhalten', t1.nodeValue === '\n  File  ', JSON.stringify(t1.nodeValue));
  check('Übersetzer: Attribute englisch', btn.getAttribute('title') === 'Help' && btn.getAttribute('aria-label') === 'Menu', btn.getAttribute('title') + ' / ' + btn.getAttribute('aria-label'));
  check('Übersetzer: unbekannter Text bleibt deutsch', t2.nodeValue === 'Unbekannter Satz 42');
  check('Übersetzer: tr() englisch', ctx.tr('Datei') === 'File' && ctx.tr('Gibt es nicht') === 'Gibt es nicht');
  check('trf(): Vorlage mit Werten', vm.runInContext("trf('Loch {id}', { id: 3 })", ctx) === 'Hole 3');
  check('num(): englisches Zahlenformat', vm.runInContext('num(27073.4, 0) + "|" + num(4.25, 1)', ctx) === '27,073|4.3', vm.runInContext('num(27073.4, 0) + "|" + num(4.25, 1)', ctx));
  check('Übersetzer: Sprache gespeichert, html lang = en', mem['druckKonfigurator.lang'] === 'en' && ctx.document.documentElement.lang === 'en');
  // Seite schreibt neuen deutschen Text in denselben Knoten → wird übersetzt; zurück auf Deutsch → neuer Text
  t1.nodeValue = 'Export'; ctx.I18N.textNode(t1);
  check('Übersetzer: neu geschriebener Text wird übersetzt', t1.nodeValue === 'Export');
  t1.nodeValue = 'Ansicht'; ctx.I18N.textNode(t1);
  check('Übersetzer: neu geschriebener Text (Ansicht → View)', t1.nodeValue === 'View', t1.nodeValue);
  ctx.I18N.setLang('de');
  check('num(): deutsches Zahlenformat nach Umschalten', (ctx.I18N.setLang('de'), vm.runInContext('num(27073.4, 0) + "|" + num(4.25, 1)', ctx)) === '27.073|4,3');
  check('Übersetzer: zurück auf Deutsch, Originale wieder da', t1.nodeValue === 'Ansicht' && btn.getAttribute('title') === 'Hilfe' && btn.getAttribute('aria-label') === 'Menü', t1.nodeValue + ' / ' + btn.getAttribute('title'));
  // Befunde Prüf-Agent 2026-10-03
  const fuge = mkText(' sichern oder teilen.'), tipEl = mkEl('SPAN', { 'data-tip': 'Wirkt nur, wenn Stützen nötig sind. Weniger Stützen sparen Material, erhöhen aber das Risiko für Durchhängen.' }, []);
  const nameText = mkText('Modell'), named = mkEl('SPAN', { translate: 'no' }, [nameText]), proto = mkText('constructor');
  ctx.document.body = mkEl('BODY', {}, [fuge, tipEl, named, proto]);
  ctx.I18N.setLang('en');
  check('Fuge: kein Leerzeichen vor Satzzeichen', fuge.nodeValue === '.', JSON.stringify(fuge.nodeValue));
  check('Hilfe-Tooltip (data-tip) wird übersetzt', /^Only applies if supports are needed/.test(tipEl.getAttribute('data-tip')), tipEl.getAttribute('data-tip'));
  check('translate="no": Nutzername bleibt unverändert', nameText.nodeValue === 'Modell');
  check('Teileliste: translate="no" nur am Namen, nicht am ganzen Eintrag (Plaketten übersetzbar)', /<span class="pname" translate="no">/.test(fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8')) && !/data-part[^>]*translate="no"|title="'\+esc\(p\.name\)\+'" translate="no"/.test(fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8')));
  check('Prototyp-Schlüssel („constructor“) bleibt Text', proto.nodeValue === 'constructor' && ctx.tr('toString') === 'toString');
  check('Plakette „Stützen nötig“ eindeutig übersetzt', EN['Stützen nötig'] === 'supports needed' && /needed:'Stützen nötig'/.test(fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8')));
  ctx.I18N.setLang('de');
  check('Zurück: Fuge und Tooltip wieder deutsch', fuge.nodeValue === ' sichern oder teilen.' && /^Wirkt nur/.test(tipEl.getAttribute('data-tip')));
  // Standard ohne Speicher: Browsersprache
  const ctx2 = vm.createContext({ document: { documentElement: {}, body, addEventListener: () => {}, getElementById: () => null }, navigator: { language: 'en-US' }, localStorage: { getItem: () => null, setItem: () => {} } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8') + '\n;globalThis.I18N = I18N;', ctx2);
  check('Standard: englischer Browser → Englisch', ctx2.I18N.lang() === 'en');
}

console.log(pass + '/' + (pass + fail) + ' bestanden');
process.exit(fail ? 1 : 0);
