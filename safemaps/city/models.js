// Low-poly models, merged into one vertex-colored geometry each, so the whole city draws in few calls.
THREE.ColorManagement.legacyMode = false; // colors below are written in sRGB; before any is made

window.MODELS = (() => {
  const CELL = 1.7; // one window's size, in world units
  const col = new THREE.Color();
  const tmp = new THREE.Matrix4();
  const shade = (hex, f) => "#" + new THREE.Color(hex).multiplyScalar(f).getHexString();

  class Builder {
    constructor() { this.p = []; this.n = []; this.c = []; this.u = []; }
    add(geo, matrix, color, win) {
      const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix);
      const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
      col.set(color);
      for (let i = 0; i < pos.count; i++) {
        this.p.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        this.n.push(nor.getX(i), nor.getY(i), nor.getZ(i));
        this.c.push(col.r, col.g, col.b);
        if (win) { const [a, b] = win(i, uv.getX(i), uv.getY(i)); this.u.push(a, b); } else this.u.push(0.002, 0.002);
      }
      return this;
    }
    box(w, h, d, x, y, z, color, windows, rotY = 0) {
      const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y + h / 2, z);
      let win = null;
      if (windows) {
        const ox = Math.floor(Math.random() * 8), oy = Math.floor(Math.random() * 8);
        win = (i, u, v) => {
          const face = Math.floor(i / 6); // +x, -x, +y, -y, +z, -z
          if (face === 2 || face === 3) return [0.002, 0.002];
          const across = face < 2 ? d : w;
          const nu = Math.max(1, Math.round(across / CELL)), nv = Math.max(1, Math.round(h / CELL));
          return [(u * nu + ox) / 8, (v * nv + oy) / 8];
        };
      }
      return this.add(new THREE.BoxGeometry(w, h, d), m, color, win);
    }
    cyl(rt, rb, h, x, y, z, color, seg = 14) {
      return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), tmp.clone().makeTranslation(x, y + h / 2, z), color);
    }
    dome(r, x, y, z, color) {
      return this.add(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), tmp.clone().makeTranslation(x, y, z), color);
    }
    ball(r, x, y, z, color) {
      return this.add(new THREE.SphereGeometry(r, 10, 7), tmp.clone().makeTranslation(x, y, z), color);
    }
    barrel(r, len, x, y, z, color, alongX = true) { // half a cylinder lying down
      const g = new THREE.CylinderGeometry(r, r, len, 16, 1, false, 0, Math.PI);
      const m = new THREE.Matrix4();
      if (alongX) m.makeRotationZ(Math.PI / 2);
      else m.makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
      m.setPosition(x, y, z);
      return this.add(g, m, color);
    }
    gable(w, rise, d, x, y, z, color) { // a pitched roof, ridge along x
      const s = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
      const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
      const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x - w / 2, y, z);
      return this.add(g, m, color);
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(this.u, 2));
      g.computeBoundingSphere();
      return g;
    }
  }

  // Walls with windows. map darkens the glass by day; emissive lights some windows at night.
  function windowTextures() {
    const make = (paint) => {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const x = c.getContext("2d");
      paint(x);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
      return t;
    };
    const lit = [];
    for (let i = 0; i < 64; i++) lit.push(Math.random() < 0.38 ? (Math.random() < 0.8 ? "#ffd48a" : "#bfe0ff") : null);
    const each = (fn) => { for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) fn(q * 32 + 7, r * 32 + 6, lit[r * 8 + q]); };
    return {
      map: make((x) => { x.fillStyle = "#fff"; x.fillRect(0, 0, 256, 256); x.fillStyle = "#6f8496"; each((a, b) => x.fillRect(a, b, 18, 20)); }),
      glow: make((x) => { x.fillStyle = "#000"; x.fillRect(0, 0, 256, 256); each((a, b, on) => { if (on) { x.fillStyle = on; x.fillRect(a, b, 18, 20); } }); }),
    };
  }

  const PAL = { page: "#35a67e", server: "#4282c9", kernel: "#d65a2c", data: "#a87d52", tools: "#e6902f", ext: "#dcb83c" };
  const PALE = "#f3f1eb";
  const GLASS = "#31465a";

  // Each draws at the origin, ground at y = 0.
  const DRAW = {
    cityhall(b, c, h) { b.box(17, h * 0.55, 13, 0, 0, 0, c, true).box(7, h * 0.3, 7, 0, h * 0.55, 0, shade(c, 1.15), true).cyl(0.2, 2.8, h * 0.3, 0, h * 0.85, 0, shade(c, 0.75)); for (const x of [-6, -2, 2, 6]) b.cyl(0.5, 0.5, 4, x, 0, 7, PALE, 8); },
    plaza(b, c) { b.box(19, 0.5, 19, 0, 0, 0, shade(c, 1.35)).cyl(4, 4.6, 0.9, 0, 0.5, 0, PALE, 20).cyl(3.5, 3.5, 0.3, 0, 1.2, 0, "#74c0dc", 20).cyl(0.5, 0.8, 3.2, 0, 1.2, 0, c, 10); for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) tree(b, x, 0.5, z, 1); },
    slab(b, c, h) { b.box(11, h, 10, 0, 0, 0, c, true).box(8, 1, 7, 0, h, 0, shade(c, 1.2)).box(2, 1, 2, 2, h + 1, 1, PALE); },
    shop(b, c, h) { b.box(9, h, 8, 0, 0, 0, c, true).box(10, 0.6, 2.6, 0, h * 0.42, 5, shade(c, 0.7)).box(9.6, 0.5, 8.6, 0, h, 0, shade(c, 1.2)); },
    dome(b, c, h) { b.box(10, h * 0.5, 10, 0, 0, 0, c, true).cyl(4.6, 4.8, 1, 0, h * 0.5, 0, PALE, 18).dome(4.4, 0, h * 0.5 + 1, 0, shade(c, 1.3)); },
    cake(b, c, h) { const n = 5, t = h / n; for (let i = 0; i < n; i++) b.box(15 - i * 2.2, t * 0.85, 15 - i * 2.2, 0, i * t, 0, i % 2 ? PALE : c, i % 2 === 0); },
    cinema(b, c, h) { b.box(15, h, 10, 0, 0, -1, c).box(15, 3, 1, 0, h * 0.72, 4.6, PALE).box(16, 0.6, 3.4, 0, h * 0.5, 5.6, shade(c, 0.65)).box(4, 2.5, 0.5, -3.5, 0, 4.2, GLASS).box(4, 2.5, 0.5, 3.5, 0, 4.2, GLASS); },
    hall(b, c, h) { b.box(17, h * 0.55, 12, 0, 0, 0, c, true).barrel(6, 17, 0, h * 0.55, 0, shade(c, 1.25)); },
    warehouse(b, c, h) { b.box(17, h, 12, 0, 0, 0, c).gable(17, 3, 12, 0, h, 0, shade(c, 1.25)); for (const x of [-5, 0, 5]) b.box(3.2, Math.min(h * 0.65, 4), 0.4, x, 0, 6.1, shade(c, 0.6)); },
    arena(b, c) { b.cyl(9.5, 10, 4, 0, 0, 0, c, 28).cyl(7.6, 7.6, 0.2, 0, 4, 0, "#5cae62", 28).box(9, 3, 0.8, 0, 6.5, -7, GLASS); for (const x of [-4, 4]) b.box(0.5, 3, 0.5, x, 4, -7, PALE); },
    arcade(b, c, h) { b.box(11, h, 9, 0, 0, 0, c, true).box(8, 3, 6.5, 0, h, 0, shade(c, 1.25)).box(5, 2, 4, 0, h + 3, 0, shade(c, 1.5)); },
    phone(b, c, h) { b.box(9, h, 2.2, 0, 0, 0, "#20262e").box(7.6, h - 2.2, 0.3, 0, 1.1, 1.2, c); for (let i = 0; i < 5; i++) { const x = -14 + i * 7; if (i !== 2) house(b, x, 8, c); } },
    mast(b, c, h) { b.box(5, 0.5, 5, 0, 0, 0, shade(c, 0.8)).cyl(0.25, 1, h, 0, 0.5, 0, c, 6).dome(2.3, 0, h * 0.7, 0, PALE).cyl(0.9, 0.9, 1.6, 2.2, 0.5, 2, shade(c, 0.7), 10).ball(0.45, 0, h + 0.8, 0, "#e5533d"); },
    portal(b, c, h) { b.box(9, h, 1.5, 0, 0, -4.5, shade(c, 0.8)).box(9, h, 1.5, 0, 0, 4.5, shade(c, 0.8)).box(9, 1.4, 10.5, 0, h, 0, c); },
    station(b, c, h) { b.box(21, h * 0.5, 15, 0, 0, 0, c, true).barrel(7.5, 21, 0, h * 0.5, 0, shade(c, 1.35)).box(4.5, h * 1.5, 4.5, 8, 0, 5.5, shade(c, 0.9), true).cyl(0.2, 3, 3.5, 8, h * 1.5, 5.5, shade(c, 0.6), 4); },
    booth(b, c) { b.box(2.6, 3, 2.6, 0, 0, 0, c).box(3.6, 0.5, 3.6, 0, 3, 0, PALE).box(7, 0.5, 0.5, -3, 1.2, 2.4, "#e5533d"); },
    tower(b, c, h) { b.box(14, h * 0.5, 14, 0, 0, 0, c, true).box(10.5, h * 0.3, 10.5, 0, h * 0.5, 0, shade(c, 1.1), true).box(6.5, h * 0.2, 6.5, 0, h * 0.8, 0, shade(c, 1.22), true).cyl(0.1, 0.5, 6, 0, h, 0, PALE, 6); },
    library(b, c, h) { b.box(19, h * 0.7, 14, 0, 0, 0, c, true).box(21, 1, 16, 0, h * 0.7, 0, PALE).box(13, h * 0.25, 9, 0, h * 0.7 + 1, 0, shade(c, 1.2), true); for (let x = -8; x <= 8; x += 3.2) b.cyl(0.45, 0.45, 5, x, 0, 7.8, PALE, 8); },
    helipad(b, c, h) { b.box(17, h, 15, 0, 0, 0, c, true).box(11, 0.5, 11, 0, h, 0, "#3a424c").cyl(4.2, 4.2, 0.1, 0, h + 0.5, 0, PALE, 24).cyl(3.4, 3.4, 0.12, 0, h + 0.52, 0, "#3a424c", 24); },
    pool(b, c, h) { b.box(11, h, 10, 0, 0, 0, c).box(9, 0.3, 8, 0, h, 0, "#3ec2e6"); },
    gas(b, c) { b.box(9, 0.6, 6, 0, 3.4, 0, c); for (const [x, z] of [[-3.5, -2], [3.5, -2], [-3.5, 2], [3.5, 2]]) b.box(0.4, 3.4, 0.4, x, 0, z, PALE); b.box(1, 1.4, 0.8, -1.5, 0, 0, "#e5533d").box(1, 1.4, 0.8, 1.5, 0, 0, "#e5533d"); },
    court(b, c, h) { b.box(13, h * 0.7, 9, 0, 0, 0, c).gable(13, 2.6, 11, 0, h * 0.7, 0, PALE); for (let x = -5; x <= 5; x += 2.5) b.cyl(0.42, 0.42, h * 0.62, x, 0.3, 5, PALE, 8); },
    entrance(b, c) { b.box(6, 3, 4, 0, 0, 0, c).box(7, 0.5, 5, 0, 3, 0, PALE).box(4, 0.2, 0.3, 0, 2.1, 2.1, "#fff"); },
    rust(b, c) { b.box(15, 0.8, 7, 0, 0, 0, shade(c, 0.6)).box(12, 0.4, 5, 0, 3.6, 0, c); for (const x of [-5, 0, 5]) b.box(0.4, 2.8, 0.4, x, 0.8, 0, PALE); },
    terminal(b, c, h) { b.box(21, h * 0.6, 9, 0, 0, 0, c, true).barrel(4.5, 21, 0, h * 0.6, 0, shade(c, 1.3)); },
    atc(b, c, h) { b.cyl(1.5, 2.1, h, 0, 0, 0, c, 10).cyl(3.4, 2.5, 3, 0, h, 0, GLASS, 8).cyl(3.6, 3.6, 0.5, 0, h + 3, 0, PALE, 8); },
    hangar(b, c, h) { b.barrel(h, 20, 0, 0, 0, c, false).box(14, h * 0.75, 0.4, 0, 0, 10.1, shade(c, 0.62)); },
    factory(b, c, h) { b.box(18, h * 0.6, 13, 0, 0, 0, c, true).gable(18, 2.5, 13, 0, h * 0.6, 0, shade(c, 1.2)); for (const x of [-5.5, 0, 5.5]) b.cyl(0.9, 1.25, h + 4, x, 0, -4, shade(c, 0.72), 10); },
    pier(b, c, h) { b.box(12, 1, 8, 2, 0, 0, shade(c, 0.6)).box(0.8, h + 8, 0.8, -2, 1, -3, c).box(0.8, h + 8, 0.8, -2, 1, 3, c).box(0.8, h + 8, 0.8, 4, 1, -3, c).box(0.8, h + 8, 0.8, 4, 1, 3, c).box(17, 1, 1.6, 5, h + 8, 0, c).box(2.6, 2, 2.6, 8, 1, 0, "#2b6ea8"); },
    track(b, c) { b.box(19, 0.3, 14, 0, 0, 0, "#3a424c").box(16, 0.4, 3, 0, 0, 0, shade(c, 1.2)).box(8, 2.6, 3, 0, 0, -8.6, c, true); },
    containers(b, c) { const hues = [c, "#2b6ea8", "#c84a3a", "#2f8f6a", "#d8d3c5"]; for (let y = 0; y < 3; y++) for (let i = 0; i < 3 - y; i++) for (let j = 0; j < 2; j++) b.box(6, 2.4, 2.6, -5.5 + i * 6.3 + y * 3, y * 2.5, -1.7 + j * 3.2, hues[(i + y * 2 + j * 3) % 5]); },
    island(b, c, h) { b.cyl(14, 17, 5, 0, -3.5, 0, "#d7c8a2", 14).cyl(11, 13, 0.6, 0, 1.3, 0, "#79a568", 14).box(9, h, 9, 0, 1.6, 0, c, true).box(6, h * 0.35, 6, 0, h + 1.6, 0, shade(c, 1.2), true); tree(b, -8, 1.6, 5, 1); tree(b, 7, 1.6, 7, 0.9); },
    lighthouse(b, c, h) { b.box(26, 2.2, 5, -2, -2.2, 0, "#c5c0b2").cyl(2, 3, h, 0, 0, 0, PALE, 12).cyl(2.1, 2.2, 3, 0, h * 0.5, 0, c, 12).cyl(1.5, 1.5, 2.2, 0, h, 0, "#ffd86a", 10).dome(1.9, 0, h + 2.2, 0, "#c84a3a"); },
  };

  function tree(b, x, y, z, s) { b.cyl(0.25 * s, 0.35 * s, 1.5 * s, x, y, z, "#8a6f52", 5); b.add(new THREE.IcosahedronGeometry(1.7 * s, 0), tmp.clone().makeTranslation(x, y + 2.8 * s, z), "#6ea777"); }
  function house(b, x, z, c) { b.box(4, 2.6, 4, x, 0, z, PALE).gable(4.4, 1.6, 4.6, x, 2.6, z, c); }

  function place(p) {
    const b = new Builder();
    (DRAW[p.kind] || DRAW.slab)(b, PAL[p.d], p.h);
    return b.geometry();
  }

  // Vehicles point along +x, sitting on y = 0. Toy-sized so they read from far away.
  const VEHICLES = {
    taxi(b, c) { b.box(5, 1.1, 2.3, 0, 0.4, 0, c).box(2.7, 0.95, 2, -0.2, 1.5, 0, GLASS).box(2.6, 0.2, 2, -0.2, 2.45, 0, c).box(0.8, 0.35, 0.8, -0.2, 2.65, 0, "#fff"); },
    bus(b, c) { b.box(9, 2.3, 2.8, 0, 0.4, 0, c).box(8.6, 0.8, 2.9, 0, 1.6, 0, GLASS).box(9, 0.3, 2.8, 0, 2.7, 0, "#fff"); },
    courier(b, c) { b.cyl(0.8, 0.8, 0.2, -1.1, 0, 0, "#2b2f36", 10).cyl(0.8, 0.8, 0.2, 1.1, 0, 0, "#2b2f36", 10).box(2.4, 0.2, 0.3, 0, 0.9, 0, c).cyl(0.45, 0.6, 1.5, -0.2, 1, 0, c, 8).ball(0.5, 0, 3, 0, "#f4d9c0"); },
    foot(b, c) { b.cyl(0.55, 0.7, 2.1, 0, 0, 0, c, 8).ball(0.55, 0, 2.7, 0, "#f4d9c0"); },
    van(b, c) { b.box(5.6, 2.6, 2.5, 0, 0.4, 0, "#fff").box(5.7, 0.7, 2.6, 0, 1, 0, c).box(1.2, 1, 2.3, 2.5, 1.8, 0, GLASS); },
    tram(b, c) { b.box(6, 2.6, 2.6, -3.3, 0.3, 0, c).box(6, 2.6, 2.6, 3.3, 0.3, 0, c).box(12.4, 0.8, 2.7, 0, 1.5, 0, GLASS).box(12.6, 0.3, 2, 0, 2.9, 0, "#fff"); },
    subway(b, c) { for (const x of [-9.4, 0, 9.4]) b.box(9, 2.6, 2.7, x, 0.2, 0, c).box(8.6, 0.8, 2.8, x, 1.4, 0, GLASS); },
    freight(b, c) { b.box(5.5, 3.2, 2.8, 8.4, 0.3, 0, "#3a424c").box(1.6, 1, 2.2, 7, 3.5, 0, c); const h = [c, "#2b6ea8", "#c84a3a"]; for (let i = 0; i < 3; i++) b.box(5.2, 2.7, 2.7, 2.6 - i * 5.7, 0.4, 0, h[i]); },
    forklift(b, c) { b.box(2.8, 1, 2, -0.4, 0.3, 0, c).box(1.5, 1.2, 1.8, -0.8, 1.3, 0, GLASS).box(0.3, 3.2, 1.9, 1.1, 0.2, 0, "#3a424c").box(1.7, 1.4, 1.6, 2.1, 0.5, 0, "#c9a36b"); },
    ship(b, c) { b.box(22, 2.8, 6.4, 0, 0, 0, c).box(5, 5, 5, -8, 2.8, 0, "#fff").box(3.4, 1.5, 5.4, -8, 7.8, 0, GLASS); const h = ["#c84a3a", "#2b6ea8", "#d8b23a", "#2f8f6a"]; for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) b.box(2.8, 2.2, 2.5, -2.6 + i * 3.1, 2.8 + (i % 2 ? 2.3 * j : 0), -1.4 + (i % 2 ? 1.4 : j * 2.8), h[(i + j) % 4]); },
    heli(b, c) { b.ball(1.7, 0.6, 1.9, 0, c).box(5, 0.55, 0.55, -3, 2.2, 0, c).box(0.4, 1.8, 0.3, -5.3, 2.3, 0, c).box(4.2, 0.25, 0.25, 0.4, 0, 1.2, "#3a424c").box(4.2, 0.25, 0.25, 0.4, 0, -1.2, "#3a424c").box(0.4, 0.8, 0.4, 0.4, 3.3, 0, "#3a424c"); },
    plane(b, c) { const fuselage = new THREE.CylinderGeometry(1.15, 1.15, 17, 12); b.add(fuselage, new THREE.Matrix4().makeRotationZ(Math.PI / 2), "#fff"); b.box(5, 0.32, 21, 0.5, -0.3, 0, c).box(2.4, 0.26, 7.4, -7.6, 0.3, 0, c).box(2.4, 3.5, 0.3, -7.6, 0.8, 0, c).add(new THREE.SphereGeometry(1.15, 10, 8), new THREE.Matrix4().makeTranslation(8.5, 0, 0), "#fff").box(1.2, 0.6, 2, 7.8, 0.45, 0, GLASS); },
    drone(b, c) { b.box(1.7, 0.55, 1.7, 0, 0.2, 0, c); for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) b.cyl(0.95, 0.95, 0.1, x, 0.75, z, "#d9e4ec", 12).box(0.2, 0.15, 0.2, x, 0.4, z, c); },
  };

  function vehicle(mode, color) {
    const b = new Builder();
    VEHICLES[mode](b, color);
    return b.geometry();
  }

  function rotor(len) {
    const b = new Builder();
    b.box(len, 0.12, 0.5, 0, 0, 0, "#20262e").box(0.5, 0.12, len, 0, 0, 0, "#20262e");
    return b.geometry();
  }

  return { Builder, windowTextures, place, vehicle, rotor, tree, house, shade, PAL, PALE };
})();
