// The traffic: a street graph, a path for every line, painted lanes, and the vehicles that run them.
window.TRAFFIC = (() => {
  const { STREETS, FLOWS, MODES, TRENCH } = CITY;
  const RIDE = 0.32; // ground vehicles ride just above the block plates

  // ---- Street graph
  const nodes = new Map(), edges = [];
  const key = (x, z) => `${x},${z}`;
  const node = (x, z) => { const k = key(x, z); if (!nodes.has(k)) nodes.set(k, { k, x, z, adj: [] }); return nodes.get(k); };
  function link(x0, z0, x1, z1, door = true) {
    const a = node(x0, z0), b = node(x1, z1), len = Math.hypot(x1 - x0, z1 - z0);
    a.adj.push({ to: b, len }); b.adj.push({ to: a, len });
    if (door) edges.push({ a, b });
  }
  for (const g of Object.values(STREETS)) {
    for (const x of g.xs) for (let i = 0; i + 1 < g.zs.length; i++) if (!(x === 88 && g.zs[i] === 0)) link(x, g.zs[i], x, g.zs[i + 1]); // no street across the subway cut
    for (const z of g.zs) for (let i = 0; i + 1 < g.xs.length; i++) link(g.xs[i], z, g.xs[i + 1], z);
  }
  link(-34, -60, -2, -60, false); link(-34, 0, -2, 0, false); // the river's bridges
  link(28, 30, 28, 62, false); link(58, 30, 58, 62, false); // the channel's bridges
  link(-120, -90, -120, -144, false); link(-60, -90, -60, -144, false); // the viaducts
  link(-160, -144, -120, -144); link(-120, -144, -60, -144); link(-60, -144, -40, -144);

  function nearest(x, z) {
    let best = null;
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dz = e.b.z - e.a.z;
      const t = Math.max(0, Math.min(1, ((x - e.a.x) * dx + (z - e.a.z) * dz) / (dx * dx + dz * dz)));
      const px = e.a.x + t * dx, pz = e.a.z + t * dz, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, e, x: px, z: pz };
    }
    return best;
  }
  function shortest(a, b) {
    const dist = new Map([[a.k, 0]]), prev = new Map(), open = new Set([a]);
    while (open.size) {
      let u = null;
      for (const n of open) if (!u || dist.get(n.k) < dist.get(u.k)) u = n;
      open.delete(u);
      if (u === b) break;
      for (const { to, len } of u.adj) {
        const d = dist.get(u.k) + len;
        if (!dist.has(to.k) || d < dist.get(to.k)) { dist.set(to.k, d); prev.set(to.k, u); open.add(to); }
      }
    }
    const path = [b];
    while (path[0] !== a) path.unshift(prev.get(path[0].k));
    return { path, len: dist.get(b.k) };
  }
  function roadPath(ax, az, bx, bz) {
    const pa = nearest(ax, az), pb = nearest(bx, bz);
    if (pa.e === pb.e) return [[ax, az], [pa.x, pa.z], [pb.x, pb.z], [bx, bz]];
    let best = null;
    for (const u of [pa.e.a, pa.e.b]) for (const v of [pb.e.a, pb.e.b]) {
      const s = shortest(u, v), total = s.len + Math.hypot(pa.x - u.x, pa.z - u.z) + Math.hypot(pb.x - v.x, pb.z - v.z);
      if (!best || total < best.total) best = { total, path: s.path };
    }
    return [[ax, az], [pa.x, pa.z], ...best.path.map((n) => [n.x, n.z]), [pb.x, pb.z], [bx, bz]];
  }

  // ---- Paths
  const tidy = (pts) => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) > 0.05);

  // Keep right: shift a polyline to the right of its direction of travel, mitered at corners.
  function keepRight(pts, by) {
    if (!by) return pts;
    const n = pts.length, out = [];
    const normal = (a, b) => { const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz); return l < 1e-6 ? null : [-dz / l, dx / l]; };
    for (let i = 0; i < n; i++) {
      const before = i > 0 ? normal(pts[i - 1], pts[i]) : null, after = i < n - 1 ? normal(pts[i], pts[i + 1]) : null;
      const a = before || after || [0, 0], b = after || before || [0, 0];
      let mx = a[0] + b[0], mz = a[1] + b[1];
      const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
      const scale = Math.min(2, 1 / Math.max(0.5, mx * a[0] + mz * a[1]));
      out.push([pts[i][0] + mx * by * scale, pts[i][1], pts[i][2] + mz * by * scale]);
    }
    return out;
  }

  // Rounds corners, then measures. A vehicle's position is then just a distance along it.
  function makePath(raw, radius = 3.5) {
    const pts = tidy(raw), dense = [];
    const v = (p) => new THREE.Vector3(p[0], p[1], p[2]);
    dense.push(v(pts[0]));
    for (let i = 1; i < pts.length - 1; i++) {
      const p = v(pts[i]), a = v(pts[i - 1]), b = v(pts[i + 1]);
      const r = Math.min(radius, a.distanceTo(p) / 2, b.distanceTo(p) / 2);
      const s = p.clone().add(a.clone().sub(p).setLength(r)), e = p.clone().add(b.clone().sub(p).setLength(r));
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        dense.push(s.clone().multiplyScalar((1 - t) ** 2).add(p.clone().multiplyScalar(2 * t * (1 - t))).add(e.clone().multiplyScalar(t * t)));
      }
    }
    dense.push(v(pts[pts.length - 1]));
    const cum = [0];
    for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + dense[i].distanceTo(dense[i - 1]));
    return {
      pts: dense, cum, len: cum[cum.length - 1],
      at(d, pos, tan) {
        d = Math.max(0, Math.min(this.len, d));
        let i = 1;
        while (i < cum.length - 1 && cum[i] < d) i++;
        const span = cum[i] - cum[i - 1] || 1;
        pos.lerpVectors(dense[i - 1], dense[i], (d - cum[i - 1]) / span);
        tan.subVectors(dense[i], dense[i - 1]);
        return this;
      },
    };
  }

  const WATERWAYS = {
    h_osm: [[176, -1.7, 70], [150, -1.7, 76], [136, -1.7, 76]],
    h_fars: [[172, -1.7, 104], [150, -1.7, 102], [136, -1.7, 102]],
    h_gtfs: [[168, -1.7, 30], [146, -1.7, 45], [110, -1.7, 45], [42, -1.7, 44]],
  };
  const SUBWAY_Y = -8.25, TRENCH_Z = (TRENCH[2] + TRENCH[3]) / 2;

  function rawPath(f, a, b) {
    const m = MODES[f.mode];
    if (WATERWAYS[f.id]) return WATERWAYS[f.id];
    if (f.mode === "subway") return [[a.x, SUBWAY_Y, a.z], [a.x, SUBWAY_Y, TRENCH_Z], [b.x, SUBWAY_Y, TRENCH_Z]];
    if (f.mode === "plane") {
      return [[a.x, RIDE, a.z], [a.x, RIDE, -119], [58, RIDE, -119], [118, 1, -119], [150, 26, -122], [172, 44, -118], [b.x, b.top + 14, b.z], [b.x + 1, b.top + 2, b.z]];
    }
    if (m.air) {
      const alt = f.mode === "drone" ? 40 : Math.max(a.top, b.top) + 20;
      return [[a.x, a.top + 1, a.z], [a.x, alt, a.z], [b.x, alt, b.z], [b.x, b.top + 1, b.z]];
    }
    if (f.mode === "forklift" && Math.hypot(a.x - b.x, a.z - b.z) < 32) return [[a.x, RIDE, a.z], [b.x, RIDE, b.z]];
    if (f.tunnel) {
      const up = roadPath(a.x, a.z, -34, 30), down = roadPath(-2, 30, b.x, b.z);
      return [...up.map(([x, z]) => [x, RIDE, z]), [-29, RIDE, 30], [-25, -5, 30], [-11, -5, 30], [-7, RIDE, 30], ...down.map(([x, z]) => [x, RIDE, z])];
    }
    return roadPath(a.x, a.z, b.x, b.z).map(([x, z]) => [x, RIDE, z]);
  }

  // ---- Painted lanes
  function textures() {
    const make = (w, h, paint) => {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      paint(c.getContext("2d"), w, h);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
      return t;
    };
    return {
      dash: () => make(64, 8, (x, w, h) => { x.fillStyle = "#fff"; x.fillRect(0, 0, w * 0.68, h); }),
      dots: () => make(32, 32, (x, w) => { x.fillStyle = "#fff"; x.beginPath(); x.arc(w / 2, w / 2, w * 0.34, 0, 7); x.fill(); }),
      rail: () => make(32, 16, (x, w, h) => { x.fillStyle = "rgba(255,255,255,.5)"; x.fillRect(0, 0, w, h); x.fillStyle = "#fff"; x.fillRect(4, 0, 9, h); }),
    };
  }
  const PERIOD = { dash: 5, dots: 2.4, rail: 2.2 };
  const WIDTH = { foot: 0.7, courier: 0.7, forklift: 0.7, heli: 1, plane: 1.3, drone: 0.8, ship: 1.3, subway: 1.1, freight: 1.1, tram: 0.9 };

  function strip(paths, width, period, lift) {
    const pos = [], uv = [], index = [];
    let base = 0;
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(1, 0, 0), t = new THREE.Vector3(), p = new THREE.Vector3();
    for (const path of paths) {
      const n = path.pts.length;
      for (let i = 0; i < n; i++) {
        t.subVectors(path.pts[Math.min(i + 1, n - 1)], path.pts[Math.max(i - 1, 0)]);
        const s = new THREE.Vector3().crossVectors(t, up);
        if (s.lengthSq() > 1e-4) side.copy(s.normalize());
        p.copy(path.pts[i]);
        pos.push(p.x + (side.x * width) / 2, p.y + lift, p.z + (side.z * width) / 2, p.x - (side.x * width) / 2, p.y + lift, p.z - (side.z * width) / 2);
        uv.push(path.cum[i] / period, 0, path.cum[i] / period, 1);
        if (i < n - 1) index.push(base + i * 2, base + i * 2 + 1, base + i * 2 + 2, base + i * 2 + 1, base + i * 2 + 3, base + i * 2 + 2);
      }
      base += n * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    return g;
  }

  // ---- Everything together
  const flows = {};
  const modeTex = {};
  const geos = {};
  const mats = { day: new THREE.MeshLambertMaterial({ vertexColors: true }), night: new THREE.MeshBasicMaterial({ vertexColors: true }) };
  let theme = "day", mapMode = "google", focus = null, motion = true;

  function vehicleFor(mode, big) {
    geos[mode] = geos[mode] || MODELS.vehicle(mode, MODES[mode].color);
    const g = new THREE.Group();
    const body = new THREE.Mesh(geos[mode], mats[theme]);
    g.add(body); g.userData.body = body;
    if (mode === "heli") {
      const r = new THREE.Mesh(MODELS.rotor(9), mats[theme]);
      r.position.set(0.4, 4.15, 0); g.add(r); g.userData.rotor = r;
    }
    if (big) g.scale.setScalar(big);
    return g;
  }

  function build(scene, placesById) {
    const make = textures();
    for (const [id, m] of Object.entries(MODES)) {
      modeTex[id] = make[m.style]();
    }
    for (const f of FLOWS) {
      const a = placesById[f.from], b = placesById[f.to], m = MODES[f.mode];
      f.reply = f.back; // the reply's label, before f.back becomes the way back
      const raw = rawPath(f, a, b);
      const lane = m.air ? 1.2 : m.water ? 3 : m.under ? 1.5 : m.lane;
      const radius = f.mode === "plane" ? 12 : m.air ? 7 : 3.5;
      f.out = makePath(keepRight(raw, lane), radius);
      f.back = makePath(keepRight([...raw].reverse(), lane), radius);
      const paths = f.oneWay ? [f.out] : [f.out, f.back];
      const lift = m.air ? 0 : 0.03 + (Object.keys(MODES).indexOf(f.mode) % 7) * 0.012;
      const mat = new THREE.MeshBasicMaterial({ color: m.color, map: modeTex[f.mode], transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide });
      f.ribbon = new THREE.Mesh(strip(paths, WIDTH[f.mode] || 0.8, PERIOD[m.style], lift), mat);
      f.ribbon.renderOrder = 2;
      scene.add(f.ribbon);
      if (!f.idle) {
        f.vehicle = vehicleFor(f.mode);
        f.s = Math.random() * (f.out.len + f.back.len + 8 * m.speed);
        scene.add(f.vehicle);
      } else {
        mat.opacity = 0.3;
      }
      flows[f.id] = f;
    }
    place();
    apply();
  }

  const P = new THREE.Vector3(), T = new THREE.Vector3();
  function pose(v, path, d) {
    path.at(d, P, T);
    v.position.copy(P);
    const flat = Math.hypot(T.x, T.z);
    if (flat > 1e-4) v.rotation.y = Math.atan2(-T.z, T.x);
    v.userData.body.rotation.z = flat > 1e-4 ? Math.atan2(T.y, flat) * 0.8 : 0;
  }

  function place() { for (const f of FLOWS) if (f.vehicle) step(f, 0); }

  function step(f, dt) {
    const m = MODES[f.mode], wait = 4 * m.speed;
    const total = f.out.len + wait + f.back.len + wait;
    f.s = (f.s + dt * m.speed) % total;
    if (f.s < f.out.len) pose(f.vehicle, f.out, f.s);
    else if (f.s < f.out.len + wait) pose(f.vehicle, f.out, f.out.len);
    else if (f.s < f.out.len + wait + f.back.len) pose(f.vehicle, f.back, f.s - f.out.len - wait);
    else pose(f.vehicle, f.back, f.back.len);
    if (f.vehicle.userData.rotor) f.vehicle.userData.rotor.rotation.y += dt * 22;
  }

  function update(dt, time) {
    for (const [id, tex] of Object.entries(modeTex)) tex.offset.x = (-(time * MODES[id].speed * 0.5) / PERIOD[MODES[id].style]) % 1;
    for (const f of FLOWS) if (f.vehicle && f.vehicle.visible) step(f, dt);
  }

  const running = (f) => !f.only || f.only === mapMode;

  // focus: null shows everything; otherwise { flows: Set of ids, vehicles: bool }
  function apply() {
    for (const f of FLOWS) {
      const on = running(f), lit = !focus || focus.flows.has(f.id);
      f.ribbon.visible = on && (lit || !focus.hideRest);
      f.ribbon.material.opacity = f.idle ? 0.3 : lit ? 0.95 : 0.07;
      if (f.vehicle) f.vehicle.visible = on && lit && (!focus || focus.vehicles !== false);
    }
  }
  const setMap = (m) => { mapMode = m; apply(); };
  const setFocus = (fx) => { focus = fx; apply(); };
  function setTheme(t) {
    theme = t;
    const mat = mats[t];
    for (const f of FLOWS) if (f.vehicle) f.vehicle.traverse((o) => { if (o.isMesh) o.material = mat; });
  }

  return { build, update, flows, vehicleFor, pose, setMap, setFocus, setTheme, running, getMap: () => mapMode };
})();
