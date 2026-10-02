'use strict';
/* 3D-Ansicht: Vollbild-Viewer aus 3dView (Wireframe, Achsen, Schnitt, Messen)
   kombiniert mit der Überhang-Einfärbung aus v4. Z zeigt nach oben, das Modell
   steht wie auf dem Druckbett (XY zentriert, Unterkante auf z = 0). */
const Viewer = (() => {
  const COLORS = { bed: [.60, .66, .74], over: [.90, .32, .31], near: [.95, .71, .24], ok: [.25, .66, .96] };
  const MARKER_COLOR = 0xffcc00;
  const CLICK_TOLERANCE_PX = 5;

  let renderer = null, scene, camera, controls, stage;
  let mesh = null, grid = null, axes, geomRef = null, maxDim = 100;
  let wireframeOn = false;
  const clip = { on: false, axis: 'x', fraction: 0, plane: null, helper: null };
  const measure = { on: false, points: [], markers: [], line: null, onChange: () => {} };
  const pick = { on: false, onPick: null };   // Fläche anklicken → Dreiecksindex
  const AXIS_INDEX = { x: 0, y: 1, z: 2 };
  const AXIS_VECTORS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

  function available() { return typeof THREE !== 'undefined' && !!THREE.OrbitControls; }

  function init(stageEl) {
    stage = stageEl;
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.localClippingEnabled = true;
    stage.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e1e);
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
    camera.up.set(0, 0, 1);
    camera.position.set(130, -150, 110);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.0));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.55); d1.position.set(1, -1, 2); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.25); d2.position.set(-1, 1, -1); scene.add(d2);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .08;

    axes = new THREE.AxesHelper(1);
    scene.add(axes);
    clip.plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    clip.helper = new THREE.PlaneHelper(clip.plane, 100, MARKER_COLOR);
    clip.helper.visible = false;
    scene.add(clip.helper);
    setBedGrid(100);

    initPicking();
    new ResizeObserver(resize).observe(stage);
    resize();
    (function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();
  }

  function resize() {
    if (!renderer) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function setBedGrid(size) {
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    grid = new THREE.GridHelper(Math.ceil(size * 1.6 / 10) * 10, Math.max(4, Math.ceil(size * 1.6 / 10)), 0x555555, 0x333333);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);
    axes.scale.setScalar(size * 0.75);
  }

  function disposeMesh() {
    if (!mesh) return;
    scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh = null;
  }

  // Zeigt geom (aus parseSTL) an; Einfärbung folgt über colorize(). false = kein Renderer.
  function show(geom) {
    if (!renderer) return false;
    disposeMesh();
    geomRef = geom;
    const g = new THREE.BufferGeometry();
    const cx = (geom.mn[0] + geom.mx[0]) / 2, cy = (geom.mn[1] + geom.mx[1]) / 2, cz = geom.mn[2];
    const p = new Float32Array(geom.pos.length);
    for (let i = 0; i < p.length; i += 3) { p[i] = geom.pos[i] - cx; p[i + 1] = geom.pos[i + 1] - cy; p[i + 2] = geom.pos[i + 2] - cz; }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.length), 3));
    g.computeVertexNormals();
    mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: .6, metalness: .05, flatShading: true, side: THREE.DoubleSide,
      wireframe: wireframeOn, clippingPlanes: clip.on ? [clip.plane] : []
    }));
    scene.add(mesh);

    maxDim = Math.max(geom.x, geom.y, geom.z) || 10;
    setBedGrid(maxDim);
    clip.helper.size = maxDim * 1.5;
    setClipFraction(0);
    clearMeasurement();

    camera.position.set(maxDim * 1.3, -maxDim * 1.5, maxDim * 1.1);
    camera.near = maxDim / 100; camera.far = maxDim * 60; camera.updateProjectionMatrix();
    controls.target.set(0, 0, geom.z / 2); controls.update();
    return true;
  }

  function clear() {
    disposeMesh();
    geomRef = null;
    clearMeasurement();
  }

  // Überhang-Einfärbung, unverändert aus v4.
  function colorize(th) {
    if (!mesh || !geomRef) return;
    const geom = geomRef, c = mesh.geometry.attributes.color.array;
    for (let i = 0; i < geom.n; i++) {
      const a = geom.ang[i];
      const inner = geom.hidden && geom.hidden[i] > 0.5; // Innenfläche unverschmolzener Körper
      const col = geom.bed[i] ? COLORS.bed : inner ? COLORS.ok : a > th ? COLORS.over : (a > th * .6 && a > 0) ? COLORS.near : COLORS.ok;
      for (let v = 0; v < 3; v++) { const k = (i * 3 + v) * 3; c[k] = col[0]; c[k + 1] = col[1]; c[k + 2] = col[2]; }
    }
    mesh.geometry.attributes.color.needsUpdate = true;
  }

  // Stabilitäts-Einfärbung: Klasse je Dreieck (0 stabil, 1 dünn/schwach, 2 kritisch) aus fragility.js
  const STABILITY = [[.30, .74, .42], [.95, .71, .24], [.90, .32, .31]];
  function colorizeClasses(cls) {
    if (!mesh || !geomRef || !cls || cls.length !== geomRef.n) return;
    const c = mesh.geometry.attributes.color.array;
    for (let i = 0; i < cls.length; i++) {
      const col = STABILITY[cls[i]] || STABILITY[0];
      for (let v = 0; v < 3; v++) { const k = (i * 3 + v) * 3; c[k] = col[0]; c[k + 1] = col[1]; c[k + 2] = col[2]; }
    }
    mesh.geometry.attributes.color.needsUpdate = true;
  }

  function setWireframe(on) { wireframeOn = on; if (mesh) mesh.material.wireframe = on; }
  function setAxes(on) { if (axes) axes.visible = on; }

  /* ---------- Schnitt ---------- */
  function setClip(on) {
    clip.on = on;
    if (!renderer) return;
    clip.helper.visible = on;
    if (mesh) mesh.material.clippingPlanes = on ? [clip.plane] : [];
  }
  function setClipAxis(axis) {
    clip.axis = axis;
    if (!renderer) return;
    clip.plane.normal.set(...AXIS_VECTORS[axis]);
    setClipFraction(0);
  }
  // fraction in [-1, 1]: Lage der Schnittebene relativ zur Modellmitte entlang der Achse.
  function setClipFraction(fraction) {
    clip.fraction = fraction;
    if (!renderer) return;
    const k = AXIS_INDEX[clip.axis];
    const center = geomRef && k === 2 ? geomRef.z / 2 : 0;
    const half = geomRef ? [geomRef.x, geomRef.y, geomRef.z][k] / 2 : maxDim / 2;
    clip.plane.constant = fraction * half - center;
  }

  /* ---------- Messen ---------- */
  function clearMeasurement() {
    for (const m of measure.markers) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    measure.markers = [];
    if (measure.line) { scene.remove(measure.line); measure.line.geometry.dispose(); measure.line.material.dispose(); measure.line = null; }
    measure.points = [];
    measure.onChange(measure.on ? 'Ersten Punkt anklicken …' : '');
  }
  function addMeasurePoint(point) {
    if (measure.points.length >= 2) clearMeasurement();
    measure.points.push(point);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(maxDim * 0.012, 12, 12), new THREE.MeshBasicMaterial({ color: MARKER_COLOR }));
    marker.position.copy(point);
    scene.add(marker);
    measure.markers.push(marker);
    if (measure.points.length === 2) {
      measure.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(measure.points), new THREE.LineBasicMaterial({ color: MARKER_COLOR }));
      scene.add(measure.line);
      measure.onChange(`Abstand: ${measure.points[0].distanceTo(measure.points[1]).toFixed(2)} mm`);
    } else {
      measure.onChange('Zweiten Punkt anklicken …');
    }
  }
  function setMeasure(on, onChange) {
    measure.on = on;
    if (onChange) measure.onChange = onChange;
    clearMeasurement();
  }
  // Einmaliges Anklicken einer Fläche; Messen wird dafür pausiert.
  function setPick(on, onPick) {
    pick.on = on; pick.onPick = on ? onPick : null;
    if (renderer) renderer.domElement.style.cursor = on ? 'crosshair' : '';
  }
  function initPicking() {
    const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down = null;
    renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    renderer.domElement.addEventListener('pointerup', e => {
      if ((!measure.on && !pick.on) || !mesh || !down) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_TOLERANCE_PX) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      // Der Raycaster kennt keine Schnittebene: weggeschnittene Treffer (negative Seite) überspringen.
      const hit = raycaster.intersectObject(mesh).find(h => !clip.on || clip.plane.distanceToPoint(h.point) >= 0);
      if (!hit) return;
      if (pick.on) { const cb = pick.onPick; setPick(false); if (cb) cb(hit.faceIndex); return; }
      addMeasurePoint(hit.point.clone());
    });
  }

  return { available, init, show, clear, colorize, colorizeClasses, setWireframe, setAxes, setClip, setClipAxis, setClipFraction, setMeasure, setPick };
})();
