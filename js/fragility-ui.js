'use strict';
/* Stabilitäts-Ansicht in der 3D-Ansicht: Umschalter Überhang | Stabilität, Farbkarte aus fragility.js,
   Legende und eine Kennzeile. Nur Hinweis – an den Druckparametern ändert sich nichts.
   Gerechnet wird erst, wenn die Ansicht eingeschaltet ist; das Ergebnis bleibt je Teil-Geometrie und
   Linienbreite gespeichert (nach dem Drehen eines Teils entsteht eine neue Geometrie → neu rechnen). */
const Stability = (() => {
  const cache = new WeakMap();   // geom → { lw, result }
  let mode = 'overhang', pending = 0;

  // Linienbreite der Außenwand der gewählten Düse (Wände bestehen aus diesen Linien)
  const lineWidth = () => (NOZ[nkey($('nozD').value)] || NOZ['0.4']).lwo;

  function cached(g) {
    const e = g && cache.get(g), lw = lineWidth();
    return e && e.lw === lw ? e.result : null;
  }
  function resultFor(g) {
    let r = cached(g);
    if (!r && g) { r = analyzeFragility(g, { lineWidth: lineWidth() }); cache.set(g, { lw: lineWidth(), result: r }); }
    return r;
  }

  function summary(r) {
    if (!r) return '';
    const t = r.thresholds, parts = [];
    if (r.reasons.includes('thin')) parts.push('dünne Wände (unter ' + de(t.warn, 1) + ' mm' + (r.minThick !== null ? ', dünnste ≈ ' + de(r.minThick, 1) + ' mm' : '') + ')');
    if (r.reasons.includes('z')) parts.push('schwach in Z ' + fragHeightText(r.zWorst.z) + ' (schmaler Querschnitt, ' + de(r.zWorst.above, 0) + ' mm Material darüber)');
    const head = { ok: 'Stabil', warn: 'Schwache Stellen', critical: 'Kritisch' }[r.level];
    return head + (parts.length ? ': ' + parts.join('; ') + '.' : ' – keine dünnen Wände unter ' + de(t.warn, 1) + ' mm, keine schlanken Stellen in Z.') +
      ' Nur Hinweis, die Druckeinstellungen bleiben unverändert.';
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
    if (r) { Viewer.colorizeClasses(r.cls); $('stabInfo').textContent = summary(r); return; }
    $('stabInfo').textContent = 'Stabilität wird berechnet …';
    const ticket = ++pending;
    setTimeout(() => {
      if (ticket !== pending || g !== geom || mode !== 'stability') return;   // inzwischen anderes Teil/Modus
      try {
        const res = resultFor(g);
        Viewer.colorizeClasses(res.cls);
        $('stabInfo').textContent = summary(res);
      } catch (e) {
        $('stabInfo').textContent = 'Stabilität konnte nicht berechnet werden: ' + e.message;
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
        if (!stale) try { resultFor(job.g); } catch (e) { cache.set(job.g, { lw: lineWidth(), result: null, error: e.message }); }
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
    if (!r) { schedule(g); return '<span class="pstab wait">Stabilität …</span>'; }
    const thin = r.reasons.includes('thin') && r.minThick !== null, z = r.reasons.includes('z');
    const detail = (thin ? ' · ' + de(r.minThick, 1) + ' mm' : '') + (z ? (thin ? ' · Z' : ' · in Z') : '');
    return '<span class="pstab ' + r.level + '" title="' + esc(summary(r)) + '">' + SHORT[r.level] + detail + '</span>';
  }

  /* Modell-Karte (auch bei nur einem Teil): Kurzbewertung und Vorschläge für das gewählte Teil */
  function renderCard() {
    const box = $('stabBox'), g = geom;
    box.classList.toggle('hidden', !g);
    if (!g) return;
    $('stabPart').textContent = project && project.parts.length > 1 ? project.parts[project.selected].name : '';
    const r = cached(g), e = cache.get(g);
    if (!r) {
      $('stabText').textContent = e && e.lw === lineWidth() && e.error ? 'Stabilität konnte nicht berechnet werden: ' + e.error : 'Stabilität wird berechnet …';
      $('stabAdvice').innerHTML = ''; $('stabNote').classList.add('hidden');
      if (!(e && e.lw === lineWidth() && e.error)) schedule(g);
      return;
    }
    $('stabText').innerHTML = badge(g) + ' ' + esc(summary(r).replace(/ Nur Hinweis.*$/, '').replace(/^(Stabil|Schwache Stellen|Kritisch)(: | – )/, ''));
    const adv = fragilityAdvice(r);
    $('stabAdvice').innerHTML = adv.map(a => '<li>' + esc(a.text) + '</li>').join('');
    $('stabNote').textContent = FRAG_DISCLAIMER;
    $('stabNote').classList.toggle('hidden', !adv.length);
  }

  // Eine Zeile für die Hinweise im Datenblatt (nur bei schwachen/kritischen Teilen, nur aus dem Zwischenspeicher)
  function hintLine(g) {
    const r = cached(g);
    if (!r || r.level === 'ok') return '';
    return '<b>Stabilität (Näherung):</b> ' + esc(summary(r).replace(/ Nur Hinweis.*$/, '')) + ' ' + fragilityAdvice(r).map(a => esc(a.text)).join(' ') + ' <i>' + esc(FRAG_DISCLAIMER) + '</i>';
  }

  /* Ausrichtungsvorschlag: würde die neue Lage ein (dann) kritisches Teil in Z schwächen? Rechnet die
     neue Lage einmal durch (je Teil und Drehung zwischengespeichert) und schreibt den Hinweis in el. */
  const orientChecks = new WeakMap();   // Teil → { key, lw, text }
  function orientNote(part, R, el) {
    const key = R.join(','), lw = lineWidth(), c = orientChecks.get(part);
    if (c && c.key === key && c.lw === lw) { el.textContent = c.text; el.classList.toggle('hidden', !c.text); return; }
    el.textContent = ''; el.classList.add('hidden');
    setTimeout(() => {
      if (part.geom !== geom) return;                      // inzwischen anderes Teil oder gedreht
      try {
        const after = analyzeFragility(makeGeom(part.name, rotatePositions(part.origPos, R)), { lineWidth: lw });
        const text = orientationZText(orientationZCheck(resultFor(part.geom), after));
        orientChecks.set(part, { key, lw, text });
        if (part.geom === geom) { el.textContent = text; el.classList.toggle('hidden', !text); }
      } catch (err) { /* nur Hinweis – ohne Ergebnis bleibt er weg */ }
    }, 40);
  }

  $('viewMode').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setMode(b.dataset.view); });
  $('nozD').addEventListener('change', () => { if (mode === 'stability') paint(geom); });

  return { paint, setMode, mode: () => mode, resultFor, cached, summary, badge, renderCard, hintLine, orientNote };
})();
