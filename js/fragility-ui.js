'use strict';
/* Stabilitäts-Ansicht in der 3D-Ansicht: Umschalter Überhang | Stabilität, Farbkarte aus fragility.js,
   Legende und eine Kennzeile. Nur Hinweis – an den Druckparametern ändert sich nichts.
   Gerechnet wird erst, wenn die Ansicht eingeschaltet ist; das Ergebnis bleibt je Teil-Geometrie und
   Linienbreite gespeichert (nach dem Drehen eines Teils entsteht eine neue Geometrie → neu rechnen). */
const Stability = (() => {
  // Sprachwahl (js/i18n.js); ohne sie deutsch. Zahlen über fmtNum aus i18n.js
  const F_TF = (s, v) => typeof trf === 'function' ? trf(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m));
  const F_NUM = (v, d) => typeof fmtNum === 'function' ? fmtNum(v, d) : de(v, d);
  const F_EN = () => typeof I18N !== 'undefined' && I18N.lang() === 'en';
  // Texte aus fragility.js (Hinweise, Haftungstext, Ausrichtungs-Warnung): Regeln in js/i18n-en-ui.js
  const F_ADV = s => typeof uiRules === 'function' ? uiRules(s, 'fragility') : s;
  // wie fragHeightText (fragility.js), aber in der Sprache der Oberfläche
  const F_HEIGHT = z => (z < 0.5 ? F_TF('direkt über dem Bett') : F_TF('bei {z} mm Höhe', { z: F_EN() ? z.toFixed(1) : z.toFixed(1).replace('.', ',') }));
  const cache = new WeakMap();   // geom → { lw, result }
  let mode = 'overhang', pending = 0;

  // Linienbreite der Außenwand der gewählten Düse (Wände bestehen aus diesen Linien)
  const lineWidth = () => (NOZ[nkey($('nozD').value)] || NOZ['0.4']).lwo;

  function cached(g) {
    const e = g && cache.get(g), lw = lineWidth();
    return e && e.lw === lw ? e.result : null;
  }
  // deadline nur für die automatische Berechnung (Teileliste); von Hand angestoßen wird immer zu Ende gerechnet
  const AUTO_MS = 4000;
  // Ab dieser Größe gar nicht erst automatisch rechnen – schon Vorbereitung dauert sonst viele Sekunden
  // (1,25 Mio. Dreiecke: ~20 s, gemeldet 2026-10-03). Von Hand („Jetzt berechnen“) geht es weiter.
  const AUTO_MAX_TRIS = 300000;
  function resultFor(g, deadline) {
    let r = cached(g);
    if (!r && g) { r = analyzeFragility(g, { lineWidth: lineWidth(), deadline }); cache.set(g, { lw: lineWidth(), result: r }); }
    return r;
  }
  const slow = g => { const e = g && cache.get(g); return !!(e && e.lw === lineWidth() && e.slow); };

  // Kurzbewertung in Teilen: head + sep + body (+ ' ' + hint) = summary(); die Modell-Karte zeigt nur body
  function summaryParts(r) {
    const t = r.thresholds, parts = [], w = F_NUM(t.warn, 1);
    if (r.reasons.includes('thin')) parts.push(r.minThick !== null ? F_TF('dünne Wände (unter {w} mm, dünnste ≈ {m} mm)', { w, m: F_NUM(r.minThick, 1) }) : F_TF('dünne Wände (unter {w} mm)', { w }));
    if (r.reasons.includes('z')) parts.push(F_TF('schwach in Z {h} (schmaler Querschnitt, {n} mm Material darüber)', { h: F_HEIGHT(r.zWorst.z), n: F_NUM(r.zWorst.above, 0) }));
    const head = { ok: F_TF('Stabil'), warn: F_TF('Schwache Stellen'), critical: F_TF('Kritisch') }[r.level];
    return { head, sep: parts.length ? ': ' : ' – ', hint: F_TF('Nur Hinweis, die Druckeinstellungen bleiben unverändert.'),
      body: parts.length ? parts.join('; ') + '.' : F_TF('keine dünnen Wände unter {w} mm, keine schlanken Stellen in Z.', { w }) };
  }
  function summary(r) {
    if (!r) return '';
    const p = summaryParts(r);
    return p.head + p.sep + p.body + ' ' + p.hint;
  }

  function render() {
    const on = mode === 'stability';
    document.querySelectorAll('#viewMode [data-view]').forEach(b => {
      const act = b.dataset.view === mode;
      b.classList.toggle('active', act); b.setAttribute('aria-pressed', String(act));
    });
    $('ohOverhang').classList.toggle('hidden', on);
    $('ohStability').classList.toggle('hidden', !on);
  }

  // Färbt die 3D-Ansicht im gewählten Modus. Große Teile brauchen einige Sekunden → erst Hinweis zeigen.
  function paint(g) {
    render();
    if (mode !== 'stability' || !g) { Viewer.colorize(+$('thresh').value); return; }
    const r = cached(g);
    if (r) { Viewer.colorizeClasses(r.cls); $('stabInfo').textContent = summary(r); $('stabInfo').classList.remove('busy'); return; }
    $('stabInfo').textContent = slow(g) ? 'Stabilität wird berechnet – sehr detailreiches Modell, das kann länger dauern …' : 'Stabilität wird berechnet …';
    $('stabInfo').classList.add('busy');   // Fortschrittsbalken (css/ui-neu.css)
    const ticket = ++pending;
    setTimeout(() => {
      if (ticket !== pending || g !== geom || mode !== 'stability') return;   // inzwischen anderes Teil/Modus
      $('stabInfo').classList.remove('busy');
      try {
        const res = resultFor(g);
        Viewer.colorizeClasses(res.cls);
        $('stabInfo').textContent = summary(res);
      } catch (e) {
        $('stabInfo').textContent = F_TF('Stabilität konnte nicht berechnet werden: {msg}', { msg: e.message });
        Viewer.colorize(+$('thresh').value);
      }
    }, 30);
  }

  function setMode(m) { mode = m; paint(geom); }

  /* Kennzahl für die Teileliste. Noch nicht berechnete Teile werden nacheinander im Hintergrund
     gerechnet (je Teil ein eigener Takt, damit die Seite zwischendurch reagiert); danach wird die
     Seite neu gezeichnet (update() zeichnet Teileliste, Modell-Karte und Datenblatt). */
  const queue = [];
  let running = false;
  const refresh = () => { if (typeof update === 'function') update(); else if (typeof renderPartList === 'function') renderPartList(); };
  function schedule(g) {
    if (!queue.some(q => q.g === g)) queue.push({ g });
    if (running) return;
    running = true;
    const next = () => {
      const job = queue.shift();
      if (!job) { running = false; return; }
      setTimeout(() => {
        // Teil gehört nicht mehr zum geladenen Projekt (neue Datei, gedreht) → überspringen
        const stale = typeof project !== 'undefined' && (!project || !project.parts.some(p => p.geom === job.g));
        if (!stale && job.g.n > AUTO_MAX_TRIS) cache.set(job.g, { lw: lineWidth(), result: null, slow: true });
        else if (!stale) try { resultFor(job.g, Date.now() + AUTO_MS); }
        catch (e) { cache.set(job.g, e.timeout ? { lw: lineWidth(), result: null, slow: true } : { lw: lineWidth(), result: null, error: e.message }); }
        if (!queue.length) refresh();
        next();
      }, 0);
    };
    next();
  }
  const SHORT = { ok: 'stabil', warn: 'schwach', critical: 'kritisch' };
  function badge(g) {
    const e = g && cache.get(g), r = cached(g);
    if (e && e.lw === lineWidth() && e.error) return '<span class="pstab err" title="' + esc(e.error) + '">Stabilität ?</span>';
    if (slow(g)) return '<span class="pstab wait" title="Sehr detailreiches Modell – Stabilität in der Modell-Karte per Klick berechnen">Stabilität: per Klick</span>';
    if (!r) { schedule(g); return '<span class="pstab wait">Stabilität …</span>'; }
    const thin = r.reasons.includes('thin') && r.minThick !== null, z = r.reasons.includes('z');
    const detail = (thin ? ' · ' + F_NUM(r.minThick, 1) + ' mm' : '') + (z ? (thin ? ' · Z' : ' · in Z') : '');
    return '<span class="pstab ' + r.level + '" title="' + esc(summary(r)) + '">' + SHORT[r.level] + detail + '</span>';
  }

  /* Modell-Karte (auch bei nur einem Teil): Kurzbewertung und Vorschläge für das gewählte Teil */
  function renderCard() {
    const box = $('stabBox'), g = geom;
    box.classList.toggle('hidden', !g);
    if (!g) return;
    $('stabPart').textContent = project && project.parts.length > 1 ? project.parts[project.selected].name : '';
    const r = cached(g), e = cache.get(g);
    if (!r && slow(g)) {
      $('stabText').innerHTML = F_TF('Sehr detailreiches Modell – die Stabilität wird nicht automatisch berechnet, damit die Seite nicht hängt.') + ' <button class="linkbtn" type="button" id="stabRun">' + F_TF('Jetzt berechnen') + '</button> ' + F_TF('(kann einige Sekunden dauern)');
      $('stabAdvice').innerHTML = ''; $('stabNote').classList.add('hidden');
      $('stabRun').onclick = () => {
        $('stabText').textContent = 'Stabilität wird berechnet …'; $('stabText').classList.add('busy');
        setTimeout(() => {
          cache.delete(g);
          try { resultFor(g); } catch (err) { cache.set(g, { lw: lineWidth(), result: null, error: err.message }); }
          $('stabText').classList.remove('busy'); refresh();
        }, 30);
      };
      return;
    }
    if (!r) {
      $('stabText').textContent = e && e.lw === lineWidth() && e.error ? F_TF('Stabilität konnte nicht berechnet werden: {msg}', { msg: e.error }) : F_TF('Stabilität wird berechnet …');
      $('stabAdvice').innerHTML = ''; $('stabNote').classList.add('hidden');
      if (!(e && e.lw === lineWidth() && e.error)) schedule(g);
      return;
    }
    $('stabText').innerHTML = badge(g) + ' ' + esc(summaryParts(r).body);
    const adv = fragilityAdvice(r);
    $('stabAdvice').innerHTML = adv.map(a => '<li>' + esc(F_ADV(a.text)) + '</li>').join('');
    $('stabNote').textContent = F_ADV(FRAG_DISCLAIMER);
    $('stabNote').classList.toggle('hidden', !adv.length);
  }

  // Eine Zeile für die Hinweise im Datenblatt (nur bei schwachen/kritischen Teilen, nur aus dem Zwischenspeicher)
  function hintLine(g) {
    const r = cached(g);
    if (!r || r.level === 'ok') return '';
    const p = summaryParts(r);
    return '<b>' + F_TF('Stabilität (Näherung):') + '</b> ' + esc(p.head + p.sep + p.body) + ' ' + fragilityAdvice(r).map(a => esc(F_ADV(a.text))).join(' ') + ' <i>' + esc(F_ADV(FRAG_DISCLAIMER)) + '</i>';
  }

  /* Ausrichtungsvorschlag: würde die neue Lage ein (dann) kritisches Teil in Z schwächen? Rechnet die
     neue Lage einmal durch (je Teil und Drehung zwischengespeichert) und schreibt den Hinweis in el. */
  const orientChecks = new WeakMap();   // Teil → { key, lw, text }
  function orientNote(part, R, el) {
    const key = R.join(','), lw = lineWidth(), c = orientChecks.get(part);
    if (c && c.key === key && c.lw === lw) { el.textContent = F_ADV(c.text); el.classList.toggle('hidden', !c.text); return; }
    el.textContent = ''; el.classList.add('hidden');
    // Zu detailreich für die automatische Rechnung: Hinweis entfällt, und es wird nicht bei jedem update()
    // neu versucht (Prüfung 2026-10-03: sonst bis zu 4 s Blockade bei jeder Änderung)
    if (slow(part.geom) || part.geom.n > AUTO_MAX_TRIS) { orientChecks.set(part, { key, lw, text: '' }); return; }
    setTimeout(() => {
      if (part.geom !== geom) return;                      // inzwischen anderes Teil oder gedreht
      try {
        const before = resultFor(part.geom, Date.now() + AUTO_MS);   // jede Rechnung mit eigener Frist
        const after = analyzeFragility(makeGeom(part.name, rotatePositions(part.origPos, R)), { lineWidth: lw, deadline: Date.now() + AUTO_MS });
        const text = orientationZText(orientationZCheck(before, after));
        orientChecks.set(part, { key, lw, text });
        if (part.geom === geom) { el.textContent = F_ADV(text); el.classList.toggle('hidden', !text); }
      } catch (err) {
        // nur Hinweis – ohne Ergebnis bleibt er weg; bei Zeitlimit merken, damit nicht ständig neu gerechnet wird
        if (err && err.timeout) orientChecks.set(part, { key, lw, text: '' });
      }
    }, 40);
  }

  $('viewMode').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setMode(b.dataset.view); });
  $('nozD').addEventListener('change', () => { if (mode === 'stability') paint(geom); });

  return { paint, setMode, mode: () => mode, resultFor, cached, summary, badge, renderCard, hintLine, orientNote };
})();
