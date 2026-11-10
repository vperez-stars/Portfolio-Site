// The city's ground: land, water, streets, bridges, the subway cut, background buildings and the places themselves.
window.WORLD = (() => {
  const { PLACES, STREETS, LAND, SLAB, TRENCH } = CITY;
  const { Builder, windowTextures, place: placeGeometry, tree, house } = MODELS;
  const ROAD = 8; // street width

  const land = new THREE.MeshLambertMaterial({ color: "#8f98a3", vertexColors: false });
  const fabric = new THREE.MeshLambertMaterial({ vertexColors: true });
  const water = new THREE.MeshPhongMaterial({ color: "#7db4d0", specular: "#ffffff", shininess: 60 });
  let wave = null;
  const placesById = {};

  function buildAll(scene) {
    const tex = windowTextures();
    fabric.map = tex.map; fabric.emissiveMap = tex.glow; fabric.emissive = new THREE.Color("#ffffff"); fabric.emissiveIntensity = 0;
    addLand(scene);
    addWater(scene);
    addBase(scene);
    addFabric(scene);
    addTrench(scene);
    return addPlaces(scene, tex);
  }

  function landMesh(box, y0, holes = []) {
    const [x0, x1, z0, z1] = box;
    const s = new THREE.Shape([new THREE.Vector2(x0, -z1), new THREE.Vector2(x1, -z1), new THREE.Vector2(x1, -z0), new THREE.Vector2(x0, -z0)]);
    for (const [a, b, c, d] of holes) s.holes.push(new THREE.Path([new THREE.Vector2(a, -c), new THREE.Vector2(a, -d), new THREE.Vector2(b, -d), new THREE.Vector2(b, -c)]));
    const g = new THREE.ExtrudeGeometry(s, { depth: -y0, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    const m = new THREE.Mesh(g, land);
    m.receiveShadow = true;
    return m;
  }

  function addLand(scene) {
    scene.add(landMesh(LAND.west, -12), landMesh(LAND.down, -12, [TRENCH]), landMesh(LAND.yard, -12), landMesh(LAND.north, -7));
    const b = new Builder();
    for (const x of [-120, -60]) { // viaducts from the outside services
      b.box(ROAD, 0.8, 11, x, -0.8, -130.5, "#8f98a3").box(0.4, 0.8, 11, x - 4, 0, -130.5, "#d8dbe0").box(0.4, 0.8, 11, x + 4, 0, -130.5, "#d8dbe0");
    }
    const span = (x0, x1, z0, z1) => { // a bridge over water, along x or z
      const alongX = x1 - x0 > z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, len = alongX ? x1 - x0 : z1 - z0;
      const [w, d] = alongX ? [len, ROAD + 1] : [ROAD + 1, len];
      b.box(w, 1, d, cx, -1, cz, "#8f98a3");
      for (const s of [-1, 1]) {
        const [rx, rz] = alongX ? [cx, cz + s * (ROAD / 2 + 0.6)] : [cx + s * (ROAD / 2 + 0.6), cz];
        b.box(alongX ? len : 0.5, 1, alongX ? 0.5 : len, rx, 0, rz, "#c84a3a");
        for (const e of [-1, 1]) {
          const [tx, tz] = alongX ? [cx + e * (len / 2 - 1), rz] : [rx, cz + e * (len / 2 - 1)];
          b.box(1.4, 6, 1.4, tx, 0, tz, "#c84a3a").box(1.9, 0.5, 1.9, tx, 6, tz, "#f3f1eb");
        }
      }
    };
    span(-28, -8, -60, -60); span(-28, -8, 0, 0); span(28, 28, 36, 54); span(58, 58, 36, 54);
    // the east end of the tunnel
    b.box(9, 5, 1.5, -6, 0, 25.5, "#b08f2c").box(9, 5, 1.5, -6, 0, 34.5, "#b08f2c").box(9, 1.4, 10.5, -6, 5, 30, "#dcb83c");
    // the runway
    b.box(105, 0.12, 10, 81, 0.25, -119, "#3a424c");
    for (let x = 34; x < 130; x += 9) b.box(5, 0.05, 0.7, x, 0.37, -119, "#f3f1eb");
    addMesh(scene, b, true);
  }

  function addMesh(scene, b, shadows) {
    const m = new THREE.Mesh(b.geometry(), fabric);
    m.receiveShadow = true; m.castShadow = !!shadows;
    scene.add(m);
    return m;
  }

  function waterParts() {
    const [sx0, sx1, sz0, sz1] = SLAB;
    return [[-26, -10, sz0, sz1], [-10, 135, 38, 52], [135, sx1, sz0, sz1], [sx0, -170, sz0, sz1], [-170, -26, sz0, -125], [-10, 135, sz0, -125], [-170, -26, 112, sz1], [-10, 135, 112, sz1]];
  }

  function addWater(scene) {
    const parts = waterParts();
    const pos = [], uv = [], nor = [];
    for (const [a, b, c, d] of parts) for (const [x, z] of [[a, c], [a, d], [b, d], [a, c], [b, d], [b, c]]) { pos.push(x, -1.8, z); uv.push(x / 40, z / 40); nor.push(0, 1, 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 256, 256); x.strokeStyle = "rgba(0,40,70,.13)"; x.lineWidth = 2;
    for (let i = 0; i < 26; i++) { const a = Math.random() * 256, b = Math.random() * 256, l = 18 + Math.random() * 30; x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo(a + l / 2, b - 3, a + l, b); x.stroke(); }
    wave = new THREE.CanvasTexture(c); wave.wrapS = wave.wrapT = THREE.RepeatWrapping; wave.encoding = THREE.sRGBEncoding;
    water.map = wave;
    const m = new THREE.Mesh(g, water); m.receiveShadow = true;
    scene.add(m);
  }

  function addBase(scene) {
    const [a, b, c, d] = SLAB;
    const mat = new THREE.MeshLambertMaterial({ color: "#5a646f" });
    const g = new Builder();
    g.box(b - a, 4, d - c, (a + b) / 2, -16, (c + d) / 2, "#ffffff");
    for (const [x0, x1, z0, z1] of waterParts()) g.box(x1 - x0, 10.1, z1 - z0, (x0 + x1) / 2, -12, (z0 + z1) / 2, "#ffffff");
    const geo = g.geometry(); geo.deleteAttribute("color"); geo.deleteAttribute("uv");
    scene.add(new THREE.Mesh(geo, mat));
  }

  const FOOT = { cityhall: 11, plaza: 12, station: 15, tower: 10, library: 13, helipad: 12, hall: 11, warehouse: 11, factory: 12, track: 13, containers: 12, terminal: 13, hangar: 12, arena: 12, cake: 10, cinema: 10, phone: 20, pier: 10 };
  const clearOf = (x, z, r) => PLACES.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > ((FOOT[p.kind] || 8) + r) ** 2);

  const overCut = (x, z) => x > TRENCH[0] && x < TRENCH[1] && z > TRENCH[2] && z < TRENCH[3];

  function addFabric(scene) {
    const b = new Builder();
    const edges = (list, lo, hi) => { const out = [], s = [lo, ...list, hi]; for (let i = 0; i < s.length - 1; i++) { const a = s[i] === lo ? lo : s[i] + ROAD / 2, c = s[i + 1] === hi ? hi : s[i + 1] - ROAD / 2; if (c - a >= 6) out.push([a, c]); } return out; };
    const district = (grid, box, tint, maxH, fill) => {
      for (const [x0, x1] of edges(grid.xs, box[0], box[1])) for (const [z0, z1] of edges(grid.zs, box[2], box[3])) {
        if (overCut((x0 + x1) / 2, (z0 + z1) / 2)) continue;
        b.box(x1 - x0, 0.25, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, tint);
        fill(b, x0, x1, z0, z1, maxH);
      }
    };
    const inTrench = (x, z) => x > TRENCH[0] - 6 && x < TRENCH[1] + 6 && z > TRENCH[2] - 6 && z < TRENCH[3] + 6;
    const fill = (b, x0, x1, z0, z1, maxH) => {
      const n = Math.max(1, Math.round((x1 - x0) / 7.5)), m = Math.max(1, Math.round((z1 - z0) / 7.5));
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
        const x = x0 + ((i + 0.5) * (x1 - x0)) / n, z = z0 + ((j + 0.5) * (z1 - z0)) / m;
        if (!clearOf(x, z, 3.2) || inTrench(x, z)) continue;
        if (z0 < -94 && x > -10) continue; // the airport's apron
        if (z1 < -90 && x < -26) { if (Math.random() < 0.6) tree(b, x, 0.25, z, 1 + Math.random() * 0.5); continue; } // the park on the north side
        const r = Math.random();
        if (r < 0.2) tree(b, x, 0.25, z, 0.8 + Math.random() * 0.6);
        else if (x < -90 && z > 60 && r < 0.95) house(b, x, z, "#c9b89a");
        else if (r < 0.9) { const h = 2 + Math.random() * maxH, g = 232 + Math.floor(Math.random() * 18), c = `rgb(${g},${g},${g - 3})`; b.box(4.6 + Math.random() * 1.5, h, 4.6 + Math.random() * 1.5, x, 0.25, z, c, true); }
      }
    };
    district(STREETS.west, [LAND.west[0], LAND.west[1], LAND.west[2], LAND.west[3]], "#e4ece4", 6, fill);
    district(STREETS.down, [LAND.down[0], LAND.down[1], LAND.down[2], LAND.down[3]], "#e2e8ef", 10, fill);
    district(STREETS.yard, [LAND.yard[0], LAND.yard[1], LAND.yard[2], LAND.yard[3]], "#efe7da", 4, fill);
    b.box(305, 0.25, 7, -17.5, 0, -163, "#e6e2d2"); // the outside services' strip
    // lane dashes
    const dash = (x0, z0, x1, z1) => { const alongX = x1 !== x0, len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0); for (let s = 3; s < len; s += 7) if (!overCut(alongX ? Math.min(x0, x1) + s : x0, alongX ? z0 : Math.min(z0, z1) + s)) b.box(alongX ? 3 : 0.3, 0.04, alongX ? 0.3 : 3, alongX ? Math.min(x0, x1) + s : x0, 0.01, alongX ? z0 : Math.min(z0, z1) + s, "#e8e6df"); };
    for (const g of Object.values(STREETS)) {
      for (const x of g.xs) dash(x, g.zs[0], x, g.zs[g.zs.length - 1]);
      for (const z of g.zs) dash(g.xs[0], z, g.xs[g.xs.length - 1], z);
    }
    addMesh(scene, b, true);
  }

  function addTrench(scene) {
    const [a, c, e, f] = TRENCH, cx = (a + c) / 2, cz = (e + f) / 2, w = c - a, d = f - e;
    const floor = new Builder();
    floor.box(w, 0.2, d, cx, -8.7, cz, "#2d3640");
    for (const z of [cz - 1.5, cz + 1.5]) floor.box(w, 0.15, 0.3, cx, -8.5, z, "#c7cdd4"); // the rails
    for (let x = a + 3; x < c; x += 3) floor.box(0.6, 0.08, 6, x, -8.56, cz, "#55606c");
    for (let x = a + 6; x < c; x += 12) floor.box(0.5, 0.5, 0.5, x, -1.2, e + 0.4, "#ffb066").box(0.5, 0.5, 0.5, x, -1.2, f - 0.4, "#ffb066");
    // railings at street level
    for (const z of [e - 0.2, f + 0.2]) floor.box(w + 1, 1, 0.3, cx, 0, z, "#f3f1eb");
    for (const x of [a - 0.2, c + 0.2]) floor.box(0.3, 1, d + 1, x, 0, cz, "#f3f1eb");
    addMesh(scene, floor, false);
    // Inner walls, lit from the rails up.
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 9, d), new THREE.MeshBasicMaterial({ color: "#3f4852", side: THREE.BackSide }));
    wall.position.set(cx, -4.5, cz);
    scene.add(wall);
  }

  function addPlaces(scene, tex) {
    const meshes = [];
    for (const p of PLACES) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.map, emissiveMap: tex.glow, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0 });
      const m = new THREE.Mesh(placeGeometry(p), mat);
      const under = p.kind === "rust";
      m.position.set(p.x, under ? -8.6 : p.kind === "lighthouse" || p.kind === "island" ? -1.6 : 0.25, p.z);
      if (p.kind === "track") m.rotation.y = 0;
      if (p.kind === "portal") m.rotation.y = 0;
      m.castShadow = !under; m.receiveShadow = true;
      m.userData.place = p; m.userData.mat = mat;
      p.mesh = m;
      placesById[p.id] = p;
      // Where a label sits, and what a camera should frame.
      m.geometry.computeBoundingBox();
      p.top = m.position.y + m.geometry.boundingBox.max.y;
      scene.add(m);
      meshes.push(m);
    }
    return meshes;
  }

  return { buildAll, land, fabric, water, wave: () => wave, placesById };
})();
