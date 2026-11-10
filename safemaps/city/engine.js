// Camera, light, labels, picking, focus, and the journey player. ui.js talks to this through ENGINE.
window.ENGINE = (() => {
  const { PLACES, FLOWS, MODES, DISTRICTS } = CITY;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const listeners = {};
  const emit = (name, data) => (listeners[name] || []).forEach((fn) => fn(data));
  const on = (name, fn) => (listeners[name] = listeners[name] || []).push(fn);

  let wrap, renderer, scene, camera, controls, hemi, sun, ghost, ring, labels = [], labelBox, tip;
  let traffic = !reduced, clock = 0, last = 0, frame = 0;
  let flight = null, selected = null, hovered = null, litPlaces = null;
  let tour = null, tourCar = null, tourMode = null, payload = null;
  const byId = {};
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let pointerSeen = false, downAt = null, placeMeshes = [], vehicleBodies = [];

  const NOTES = [
    { text: "Browser Town", sub: "runs on the visitor's device", x: -100, y: 8, z: -108, sign: "green" },
    { text: "Server Downtown", sub: "the FastAPI process", x: 118, y: 10, z: -28, sign: "blue" },
    { text: "Build Yard", sub: "commands run by hand", x: 40, y: 6, z: 112, sign: "orange" },
    { text: "Outside Services", sub: "data leaves the computer", x: -20, y: 18, z: -164, sign: "yellow" },
    { text: "The river is the network", sub: "crossing it is an HTTP request", x: -18, y: 4, z: -32, sign: "river" },
    { text: "Rust Subway", sub: "backend/rust_kernel", x: 88, y: 0, z: 46, sign: "rust" },
  ];

  function init(el) {
    wrap = el;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch (error) {
      return false;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    wrap.prepend(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "A 3D model city. The Places tab lists the same places as text.");

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 5, 3000);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.maxPolarAngle = 1.42; controls.minDistance = 28; controls.maxDistance = 1200;
    controls.screenSpacePanning = false;

    hemi = new THREE.HemisphereLight("#ffffff", "#b8bfc6", 0.75);
    sun = new THREE.DirectionalLight("#fff1dc", 0.95);
    sun.position.set(-150, 260, 140); sun.target.position.set(20, 0, -25);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -270, right: 270, top: 230, bottom: -230, near: 20, far: 800 });
    sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
    scene.add(hemi, sun, sun.target);

    ghost = new THREE.MeshLambertMaterial({ color: "#ece9e2" });
    placeMeshes = WORLD.buildAll(scene);
    PLACES.forEach((p) => (byId[p.id] = p));
    TRAFFIC.build(scene, byId);
    for (const f of FLOWS) if (f.vehicle) { f.vehicle.userData.body.userData.flow = f; vehicleBodies.push(f.vehicle.userData.body); }
    for (const f of FLOWS) { (byId[f.from].flows = byId[f.from].flows || []).push(f); (byId[f.to].flows = byId[f.to].flows || []).push(f); }

    ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.renderOrder = 3;
    scene.add(ring);

    buildLabels();
    applyTheme();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

    bindPointer();
    new ResizeObserver(resize).observe(wrap);
    resize();
    overview(true);
    ghostAll(null);
    requestAnimationFrame(loop);
    return true;
  }

  const isDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

  function applyTheme() {
    const dark = isDark();
    const css = getComputedStyle(document.documentElement);
    scene.background = new THREE.Color(css.getPropertyValue("--scene").trim() || (dark ? "#0d141c" : "#dfe5ea"));
    hemi.color.set(dark ? "#8aa2cc" : "#ffffff"); hemi.groundColor.set(dark ? "#232c3a" : "#b8bfc6"); hemi.intensity = dark ? 0.62 : 0.75;
    sun.color.set(dark ? "#a9bfe8" : "#fff1dc"); sun.intensity = dark ? 0.4 : 0.95;
    WORLD.water.color.set(dark ? "#14374e" : "#7db4d0");
    WORLD.land.color.set(dark ? "#4a5461" : "#8f98a3");
    WORLD.fabric.emissiveIntensity = dark ? 0.6 : 0;
    ghost.color.set(dark ? "#77828f" : "#ece9e2");
    for (const p of PLACES) p.mesh.userData.mat.emissiveIntensity = dark ? 1 : 0;
    ring.material.color.set(dark ? "#ffffff" : "#0b7a53");
    TRAFFIC.setTheme(dark ? "night" : "day");
    if (tourCar) tourCar.traverse((o) => { if (o.isMesh) o.material = firstVehicleMat(); });
    renderer.shadowMap.needsUpdate = true;
  }
  const firstVehicleMat = () => FLOWS.find((f) => f.vehicle).vehicle.userData.body.material;

  // ---- Labels
  const shortFile = (p) => p.files.split(",")[0].trim().split("/").pop() || p.files;
  function buildLabels() {
    labelBox = wrap.querySelector(".labels");
    tip = wrap.querySelector(".tip");
    payload = wrap.querySelector(".payload");
    for (const p of PLACES) {
      const el = document.createElement("button");
      el.type = "button"; el.tabIndex = -1;
      el.className = `sign sign-${DISTRICTS[p.d].sign}`;
      el.innerHTML = `<b></b><small></small>`;
      el.firstChild.textContent = p.name; el.lastChild.textContent = shortFile(p);
      el.addEventListener("click", () => select(p.id));
      labelBox.append(el);
      labels.push({ el, place: p, x: p.x, y: p.top + 2, z: p.z, major: p.major, hidden: true });
    }
    for (const n of NOTES) {
      const el = document.createElement("div");
      el.className = `sign note sign-${n.sign}`;
      el.innerHTML = `<b></b><small></small>`;
      el.firstChild.textContent = n.text; el.lastChild.textContent = n.sub;
      labelBox.append(el);
      labels.push({ el, note: true, x: n.x, y: n.y, z: n.z, hidden: true });
    }
    for (const l of labels) { l.el.hidden = true; }
  }

  const V = new THREE.Vector3();
  function layoutLabels() {
    const w = wrap.clientWidth, h = wrap.clientHeight, dist = camera.position.distanceTo(controls.target);
    const nearEnough = dist < 330, far = dist > 260;
    const scored = [];
    for (const l of labels) {
      const p = l.place;
      let rank = -1;
      if (l.note) rank = tour || litPlaces ? -1 : far ? 90 : -1;
      else {
        const off = !p || (litPlaces && !litPlaces.has(p.id));
        if (p === selected || p === hovered) rank = 100;
        else if (tour && tour.now && tour.now.has(p.id)) rank = 95;
        else if (off) rank = -1;
        else if (litPlaces) rank = 70;
        else if (p.major) rank = 60;
        else if (nearEnough) rank = 30;
      }
      l.rank = rank;
      if (rank >= 0) scored.push(l);
      else if (!l.hidden) { l.el.hidden = true; l.hidden = true; }
    }
    scored.sort((a, b) => b.rank - a.rank);
    const placed = [];
    for (const l of scored) {
      V.set(l.x, l.y, l.z).project(camera);
      const x = ((V.x + 1) / 2) * w, y = ((1 - V.y) / 2) * h;
      if (l.hidden) { l.el.hidden = false; l.hidden = false; l.bw = l.el.offsetWidth; l.bh = l.el.offsetHeight; }
      const bw = l.bw || 90, bh = l.bh || 30, left = x - bw / 2, top = y - bh - 4;
      const outside = V.z > 1 || left < 4 || top < 4 || left + bw > w - 4 || top + bh > h - 4;
      const hit = placed.some((b) => left < b.left + b.bw + 3 && left + bw + 3 > b.left && top < b.top + b.bh + 2 && top + bh + 2 > b.top);
      if (outside || (hit && l.rank < 100)) { l.el.hidden = true; l.hidden = true; continue; }
      placed.push({ left, top, bw, bh });
      l.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }
  }

  // ---- Pointer
  function bindPointer() {
    const c = renderer.domElement;
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      pointerSeen = e.pointerType === "mouse";
      tip.style.transform = `translate(${Math.min(e.clientX - r.left + 14, r.width - 250)}px, ${e.clientY - r.top + 14}px)`;
    });
    c.addEventListener("pointerleave", () => { pointerSeen = false; setHover(null, null); });
    c.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; flight = null; });
    c.addEventListener("pointerup", (e) => {
      const moved = !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6;
      downAt = null;
      if (moved) return;
      const r = c.getBoundingClientRect();
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const hit = pick();
      if (hit && hit.flow) selectFlow(hit.flow.id);
      else if (hit && hit.place) select(hit.place.id);
      else if (!tour) clear();
    });
  }

  function pick() {
    ray.setFromCamera(pointer, camera);
    const vs = vehicleBodies.filter((b) => b.parent.visible);
    const hits = ray.intersectObjects([...vs, ...placeMeshes], false);
    if (!hits.length) return null;
    const u = hits[0].object.userData;
    return u.flow ? { flow: u.flow } : { place: u.place };
  }

  function setHover(place, flow) {
    if (hovered !== place) {
      if (hovered) hovered.mesh.userData.mat.color.setScalar(1);
      hovered = place;
      if (hovered) hovered.mesh.userData.mat.color.setScalar(1.28);
    }
    renderer.domElement.style.cursor = place || flow ? "pointer" : "";
    if (place || flow) {
      tip.hidden = false;
      const m = flow && MODES[flow.mode];
      tip.firstChild.textContent = flow ? `${m.name}: ${flow.label}` : place.name;
      tip.lastChild.textContent = flow ? `${byId[flow.from].name} to ${byId[flow.to].name}` : place.files;
    } else tip.hidden = true;
  }

  // ---- Focus
  function ghostAll(keep) {
    litPlaces = keep;
    for (const p of PLACES) {
      const running = !p.flows || p.flows.some((f) => TRAFFIC.running(f) && !f.idle);
      const lit = running && (!keep || keep.has(p.id));
      p.mesh.material = lit ? p.mesh.userData.mat : ghost;
    }
  }
  function reveal(on) {
    for (const m of [WORLD.land, WORLD.fabric]) {
      if (m.transparent === on) continue;
      m.transparent = on; m.opacity = on ? 0.3 : 1; m.depthWrite = !on; m.needsUpdate = true;
    }
  }
  const endpoints = (flows) => { const s = new Set(); for (const f of flows) { s.add(f.from); s.add(f.to); } return s; };

  function select(id) {
    if (tour) stopTour();
    const p = byId[id];
    selected = p;
    const flows = (p.flows || []).filter(TRAFFIC.running);
    TRAFFIC.setFocus({ flows: new Set(flows.map((f) => f.id)) });
    const keep = endpoints(flows); keep.add(id); ghostAll(keep);
    reveal(p.d === "kernel");
    ring.visible = true; ring.position.set(p.x, p.mesh.position.y + 0.4, p.z);
    p.ringSize = p.kind === "island" ? 22 : 15; ring.scale.setScalar(p.ringSize);
    frameBox(pointsOf([p]), 90);
    emit("focus", { place: p });
  }

  function selectMode(mode) {
    if (tour) stopTour();
    selected = null; ring.visible = false;
    const flows = FLOWS.filter((f) => f.mode === mode && TRAFFIC.running(f));
    TRAFFIC.setFocus({ flows: new Set(flows.map((f) => f.id)) });
    const ends = endpoints(flows);
    ghostAll(ends);
    reveal(mode === "subway");
    if (mode === "subway") frameBox(pointsOf([...ends].map((id) => byId[id])), 200);
    emit("focus", { mode });
  }

  function selectFlow(id) {
    if (tour) stopTour();
    const f = TRAFFIC.flows[id];
    selected = null; ring.visible = false;
    TRAFFIC.setFocus({ flows: new Set([id]) });
    ghostAll(endpoints([f]));
    reveal(f.mode === "subway");
    frameBox(f.out.pts, 70);
    emit("focus", { flow: f });
  }

  function clear(fly) {
    if (tour) stopTour();
    selected = null; ring.visible = false;
    TRAFFIC.setFocus(null); ghostAll(null); reveal(false);
    if (fly) overview();
    emit("focus", {});
  }

  function setMap(m) {
    TRAFFIC.setMap(m);
    ghostAll(litPlaces);
    emit("map", m);
  }

  // ---- Camera
  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
    camera.aspect = w / h; camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    for (const l of labels) { l.bw = 0; l.hidden || (l.el.hidden = true); l.hidden = true; }
    if (controls) layoutLabels();
  }

  function view(target, dist, polar = 0.9, azimuth) {
    const off = camera.position.clone().sub(controls.target);
    const az = azimuth === undefined ? Math.atan2(off.x, off.z) : azimuth;
    const pos = new THREE.Vector3(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az)).multiplyScalar(dist).add(target);
    return { pos, target };
  }
  function flyTo(v, seconds = 1.15) {
    if (reduced || seconds === 0) { camera.position.copy(v.pos); controls.target.copy(v.target); controls.update(); flight = null; return; }
    flight = { t: 0, seconds, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), ...v };
  }
  function overview(instant) {
    const dist = Math.min(900, 250 / (Math.tan((15 * Math.PI) / 180) * Math.max(camera.aspect, 0.8)));
    flyTo(view(new THREE.Vector3(20, 0, -22), dist, 0.84, 0.08), instant ? 0 : 1.4);
  }
  const pointsOf = (places) => places.map((p) => new THREE.Vector3(p.x, p.mesh.position.y, p.z));
  function frameBox(points, minDist) {
    const box = new THREE.Box3().setFromPoints(points), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const span = Math.max(s.x, s.z, s.y * 1.3);
    const dist = Math.max(minDist, (span * 1.25) / (2 * Math.tan((15 * Math.PI) / 180) * Math.min(1.1, camera.aspect)));
    c.y = Math.max(c.y, c.y * 0.4);
    flyTo(view(c, Math.min(dist, 760), 0.92));
  }

  // ---- Journeys
  function startTour(id) {
    clear();
    const def = TOURS.find((t) => t.id === id);
    setMap(def.map);
    tour = { def, i: -1, trail: new Set(), seen: new Set(), now: new Set(), playing: !reduced, t: 0, dur: 1, wait: 0, path: null };
    emit("tour", tour);
    enterStep(0);
  }
  function stopTour() {
    tour = null;
    if (tourCar) tourCar.visible = false;
    payload.hidden = true;
    emit("tour", null);
  }
  function enterStep(i) {
    if (!tour) return;
    const s = tour.def.steps[i];
    tour.i = i; tour.t = 0; tour.waited = 0; tour.done = false; tour.path = null;
    ring.visible = false;
    if (s.flow) {
      const f = TRAFFIC.flows[s.flow], m = MODES[f.mode];
      tour.trail.add(f.id); tour.seen.add(f.from); tour.seen.add(f.to);
      tour.now = new Set([f.from, f.to]);
      tour.path = s.dir === "back" ? f.back : f.out;
      tour.dur = Math.max(2, Math.min(6, tour.path.len / (m.speed * 1.5)));
      TRAFFIC.setFocus({ flows: tour.trail, vehicles: false, hideRest: false });
      ghostAll(tour.seen);
      reveal(f.mode === "subway");
      if (tourMode !== f.mode) {
        if (tourCar) scene.remove(tourCar);
        tourCar = TRAFFIC.vehicleFor(f.mode, ["subway", "freight", "ship", "plane"].includes(f.mode) ? 1 : 1.5);
        tourCar.traverse((o) => { if (o.isMesh) o.material = firstVehicleMat(); });
        tourMode = f.mode; scene.add(tourCar);
      }
      tourCar.visible = true;
      payload.hidden = false;
      payload.textContent = s.dir === "back" ? f.reply || "the reply" : f.carries;
      TRAFFIC.pose(tourCar, tour.path, 0);
      frameBox(tour.path.pts, f.mode === "foot" ? 80 : f.mode === "subway" ? 130 : 105);
    } else {
      const p = byId[s.at];
      tour.seen.add(s.at); tour.now = new Set([s.at]);
      TRAFFIC.setFocus({ flows: tour.trail, vehicles: false, hideRest: false });
      ghostAll(tour.seen); reveal(false);
      if (tourCar) tourCar.visible = false;
      payload.hidden = true;
      ring.visible = true; ring.position.set(p.x, p.mesh.position.y + 0.4, p.z); ring.scale.setScalar(14);
      tour.dur = 1;
      frameBox(pointsOf([p]), 70);
    }
    if (reduced && tour.path) { TRAFFIC.pose(tourCar, tour.path, tour.path.len); tour.t = tour.dur; }
    emit("step", tour);
  }
  function nextStep() { if (!tour) return; if (tour.i + 1 < tour.def.steps.length) enterStep(tour.i + 1); else finishTour(); }
  function prevStep() { if (tour && tour.i > 0) enterStep(tour.i - 1); }
  function goStep(i) { if (tour) { tour.playing = false; enterStep(i); emit("step", tour); } }
  function togglePlay() {
    if (!tour) return;
    tour.playing = !tour.playing;
    if (tour.playing && tour.finished) { tour.finished = false; tour.trail.clear(); tour.seen.clear(); enterStep(0); }
    emit("step", tour);
  }
  function finishTour() {
    tour.playing = false; tour.finished = true; tour.now = new Set();
    if (tourCar) tourCar.visible = false;
    payload.hidden = true; ring.visible = false;
    reveal(false);
    frameBox([...tour.seen].flatMap((id) => pointsOf([byId[id]])), 120);
    emit("step", tour);
  }
  function updateTour(dt) {
    if (!tour || tour.finished) return;
    tour.t += dt;
    const k = Math.min(1, tour.t / tour.dur), ease = k * k * (3 - 2 * k);
    if (tour.path && tourCar) {
      TRAFFIC.pose(tourCar, tour.path, tour.path.len * ease);
      V.copy(tourCar.position); V.y += 6; V.project(camera);
      const w = wrap.clientWidth, h = wrap.clientHeight;
      payload.style.transform = `translate(calc(${((V.x + 1) / 2) * w}px - 50%), calc(${((1 - V.y) / 2) * h}px - 100%))`;
      if (tourCar.userData.rotor) tourCar.userData.rotor.rotation.y += dt * 22;
    }
    if (k >= 1 && tour.playing) {
      tour.waited += dt;
      const s = tour.def.steps[tour.i], read = Math.max(2.2, s.body.split(" ").length / 3.4);
      if (tour.waited > read) nextStep();
    }
  }

  // ---- The loop
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now; clock += dt; frame++;
    if (traffic) {
      TRAFFIC.update(dt, clock);
      const w = WORLD.wave(); if (w) w.offset.set(clock * 0.006, clock * 0.004);
    }
    updateTour(dt);
    if (flight) {
      flight.t += dt;
      const k = Math.min(1, flight.t / flight.seconds), e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      camera.position.lerpVectors(flight.fromPos, flight.pos, e);
      controls.target.lerpVectors(flight.fromTarget, flight.target, e);
      if (k >= 1) flight = null;
    }
    controls.update();
    if (ring.visible && !reduced) ring.material.opacity = 0.6 + 0.35 * Math.sin(clock * 3.2);
    if (pointerSeen && frame % 4 === 0 && !downAt) {
      const hit = pick();
      setHover(hit && hit.place, hit && hit.flow);
    }
    if (frame % 3 === 0) layoutLabels();
    renderer.render(scene, camera);
    renderer.shadowMap.needsUpdate = false;
  }

  const setTraffic = (v) => { traffic = v; emit("traffic", v); };
  return { init, on, select, selectMode, selectFlow, clear, setMap, startTour, stopTour, nextStep, prevStep, goStep, togglePlay, overview, setTraffic, traffic: () => traffic, byId, reduced, getTour: () => tour };
})();
