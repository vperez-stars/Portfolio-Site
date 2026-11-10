// The page around the city: the key, the panel, and the journey controls.
(() => {
  const { DISTRICTS, MODES, PLACES, FLOWS } = CITY;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const view = $("view"), stage = $("stage");

  const wheels = (a, b) => `<circle cx="${a}" cy="12.5" r="2"/><circle cx="${b}" cy="12.5" r="2"/>`;
  const SHAPES = {
    foot: `<circle cx="12" cy="2.6" r="2.2"/><path d="M9.5 6h5l1 5h-1.6l-.4 4h-3l-.4-4H8.5z"/>`,
    drone: `<rect x="9" y="6" width="6" height="3.4" rx="1"/><rect x="1" y="3" width="8" height="1.4" rx=".7"/><rect x="15" y="3" width="8" height="1.4" rx=".7"/><path d="M4.5 4h1v3l4 1v1l-5-1zM18.5 4h1v4l-5 1V8l4-1z"/>`,
    taxi: `<path d="M3 8l2.4-4.5h9.2L18 8h3a2 2 0 012 2v2.5H1V10a2 2 0 012-2z"/><rect x="8.5" y="1" width="3.5" height="1.6"/>${wheels(6, 18)}`,
    bus: `<rect x="1" y="1.5" width="22" height="10" rx="2"/>${wheels(6, 18)}`,
    courier: `<circle cx="5" cy="11" r="3.4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="19" cy="11" r="3.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 11l5-6h6l3 6M10 5l3 6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="1.8" r="1.7"/>`,
    tram: `<path d="M9 3l3-2.5L15 3" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="3.2" width="22" height="8.6" rx="2"/>${wheels(6, 18)}`,
    subway: `<path d="M2 11V5a3.5 3.5 0 013.5-3.5h13A3.5 3.5 0 0122 5v6z"/><rect x="0" y="12.6" width="24" height="1.6"/>`,
    freight: `<rect x="1" y="2" width="9" height="9.5"/><rect x="11" y="4" width="7" height="7.5"/><path d="M18.5 3h3l1.5 3v5.5h-4.5z"/>${wheels(5, 15)}<circle cx="21" cy="12.5" r="2"/>`,
    forklift: `<rect x="3" y="6" width="10" height="5.5" rx="1"/><path d="M5 6V2h6l1.5 4z"/><rect x="15" y="0" width="1.7" height="13"/><rect x="16" y="11.4" width="7.5" height="1.6"/>${wheels(5, 12)}`,
    van: `<path d="M1 2h14v9.5H1zM16 4.5h3.5L23 8.5v3h-7z"/>${wheels(5.5, 18)}`,
    heli: `<rect x="2" y="0" width="20" height="1.3" rx=".6"/><rect x="11.2" y="1" width="1.6" height="2.6"/><ellipse cx="9" cy="7.4" rx="6.4" ry="4"/><path d="M14 6h8l1-3.5h1V9h-9z"/><rect x="4" y="13" width="10" height="1.2"/>`,
    plane: `<path d="M1 8.2c0-1.1 3-1.7 6-1.7h3.2L15.5.5h2.6l-3 6h4.6l2-2.4h1.7L21.8 8l1 3.9h-1.7l-2-2.4h-4.6l3 5.5h-2.6l-5.3-5.5H7c-3 0-6-.7-6-1.8z"/>`,
    ship: `<path d="M1 9.5h22l-2.6 5H3.6z"/><rect x="3" y="3" width="4.5" height="6"/><rect x="9" y="5.5" width="3.8" height="3.6"/><rect x="13.4" y="5.5" width="3.8" height="3.6"/><rect x="17.8" y="5.5" width="3.8" height="3.6"/><rect x="11" y="1.6" width="3.8" height="3.6"/>`,
    pin: `<path d="M12 0a5.4 5.4 0 00-5.4 5.4C6.6 9.4 12 15 12 15s5.4-5.6 5.4-9.6A5.4 5.4 0 0012 0zm0 7.4a2 2 0 110-4 2 2 0 010 4z"/>`,
  };
  const icon = (m) => `<svg viewBox="0 0 24 15" fill="currentColor" aria-hidden="true" style="--c:${m === "pin" ? "var(--accent)" : MODES[m].color}">${SHAPES[m]}</svg>`;

  const live = !!(window.THREE && window.ENGINE && window.TRAFFIC && ENGINE.init(stage));
  let tab = "journeys", tourBuiltFor = null, pressedMode = null;
  const byId = {};
  PLACES.forEach((p) => (byId[p.id] = p));
  const flowsById = {};
  FLOWS.forEach((f) => (flowsById[f.id] = f));

  // ---- The key
  const groups = {};
  for (const [id, m] of Object.entries(MODES)) (groups[m.group] = groups[m.group] || []).push(id);
  $("key").innerHTML = Object.entries(groups).map(([name, ids]) => `<section class="kgroup"><h3>${esc(name)}</h3><div>${ids.map((id) => `<button type="button" class="chip" data-mode="${id}" aria-pressed="false" title="${esc(MODES[id].what)}" style="--c:${MODES[id].color}">${icon(id)}${esc(MODES[id].name)}</button>`).join("")}</div></section>`).join("");
  $("key").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    if (!live) { showMode(b.dataset.mode); return; }
    if (pressedMode === b.dataset.mode) ENGINE.clear(); else ENGINE.selectMode(b.dataset.mode);
  });
  function pressChip(mode) {
    pressedMode = mode || null;
    document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.mode === mode)));
  }

  // ---- Lists
  function showJourneys() {
    view.innerHTML = `
      <h2>How a trip moves through the app</h2>
      <p class="lede">${PLACES.length} parts of the repo as places, ${FLOWS.length} real data paths as lines. Pick a journey and follow one vehicle at a time.</p>
      <div class="jlist">${TOURS.map((t) => live
        ? `<button type="button" class="jrow" data-tour="${t.id}"><b>${esc(t.name)}</b><span class="tag">${esc(t.tag)}</span><span class="b">${esc(t.blurb)}</span></button>`
        : `<details class="jrow"><summary><b>${esc(t.name)}</b><span class="tag">${esc(t.tag)}</span></summary><ol>${t.steps.map((s) => `<li><b>${esc(s.title)}</b> ${esc(s.body)}</li>`).join("")}</ol></details>`).join("")}</div>
      <h3>Reading the city</h3>
      <ul class="read">
        <li><b>Vehicle</b><span>The kind of transfer. Each one in the key means one thing.</span></li>
        <li><b>River</b><span>The network. Everything crossing it is an HTTP request between browser and server.</span></li>
        <li><b>Color</b><span><span style="color:var(--s-green)">■</span> browser, <span style="color:var(--s-blue)">■</span> server, <span style="color:var(--s-rust)">■</span> Rust, <span style="color:var(--s-brown)">■</span> files, <span style="color:var(--s-orange)">■</span> tools, <span style="color:var(--s-yellow)">■</span> outside services.</span></li>
        <li><b>Plain</b><span>Background buildings, not part of the app. A part goes plain when the current view doesn't use it.</span></li>
      </ul>
      <p class="scale-note">Click any building or vehicle, or a vehicle in the key. Vehicle speeds and how often they run aren't to scale. The ROUTES_MAP switch starts on what this server is set to, and shows the other way it can run.</p>`;
    view.scrollTop = 0;
  }
  view.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tour]"); if (t) { ENGINE.startTour(t.dataset.tour); return; }
    const p = e.target.closest("[data-place]"); if (p) { live ? ENGINE.select(p.dataset.place) : showPlace(byId[p.dataset.place]); return; }
    const f = e.target.closest("[data-flow]"); if (f && live) { ENGINE.selectFlow(f.dataset.flow); return; }
    const s = e.target.closest("[data-step]"); if (s) { ENGINE.goStep(+s.dataset.step); return; }
    if (e.target.closest(".back")) { if (live) ENGINE.clear(true); else showTab(); }
    const a = e.target.closest("[data-act]");
    if (a) ({ prev: ENGINE.prevStep, next: ENGINE.nextStep, play: ENGINE.togglePlay, exit: () => ENGINE.clear(true) })[a.dataset.act]();
  });
  function showPlaces() {
    const by = {};
    for (const p of PLACES) (by[p.d] = by[p.d] || []).push(p);
    view.innerHTML = `<h2>Every place in the city</h2><p class="lede">Each one is a real file or service. Pick one to see what arrives and what leaves.</p>` +
      ["page", "server", "kernel", "data", "tools", "ext"].map((d) => `<h3>${esc(DISTRICTS[d].name)}</h3><p class="lede" style="font-size:12.5px">${esc(DISTRICTS[d].note)}</p><div class="plist">${by[d].map((p) => `<button type="button" class="prow" data-place="${p.id}"><b>${esc(p.name)}</b><small>${esc(p.files)}</small></button>`).join("")}</div>`).join("");
    view.scrollTop = 0;
  }
  const backLink = () => `<button type="button" class="back">← ${tab === "places" ? "All places" : "All journeys"}</button>`;
  const lineRow = (f, line2) => `<button type="button" class="lrow" data-flow="${f.id}">${icon(f.mode)}<span><b>${esc(f.label)}</b><small>${line2}</small></span></button>`;

  // ---- Details
  function showPlace(p) {
    const flows = (FLOWS.filter((f) => f.from === p.id || f.to === p.id));
    const running = live ? flows.filter(TRAFFIC.running) : flows;
    const resting = flows.filter((f) => !running.includes(f) && !f.idle);
    const row = (f) => {
      const outward = f.from === p.id, other = byId[outward ? f.to : f.from].name, reply = f.reply ?? (typeof f.back === "string" ? f.back : null);
      return lineRow(f, `${outward ? "to" : "from"} ${esc(other)}: ${esc(f.carries)}${reply ? ` · reply: ${esc(reply)}` : ""}`);
    };
    view.innerHTML = `${backLink()}<div class="sign inline-sign sign-${DISTRICTS[p.d].sign}"><b>${esc(DISTRICTS[p.d].name)}</b></div>
      <h2>${esc(p.name)}</h2><p class="files">${esc(p.files)}</p><p>${esc(p.text)}</p>
      ${running.length ? `<h3>Lines here</h3>${running.map(row).join("")}` : ""}
      ${resting.length ? `<h3>Not running on this map</h3><p class="lede" style="font-size:12.5px">Switch ROUTES_MAP to see ${resting.length === 1 ? "this one" : "these"} working.</p>${resting.map(row).join("")}` : ""}`;
    view.scrollTop = 0;
  }
  function showMode(id) {
    const m = MODES[id], flows = FLOWS.filter((f) => f.mode === id && (!live || TRAFFIC.running(f)));
    view.innerHTML = `${backLink()}<p style="color:${m.color}">${icon(id).replace("<svg", '<svg width="48" height="30"')}</p><h2>${esc(m.name)}</h2><p>${esc(m.what)}</p>
      <h3>${flows.length} ${flows.length === 1 ? "line" : "lines"} on this map</h3>
      ${flows.map((f) => lineRow(f, `${esc(byId[f.from].name)} to ${esc(byId[f.to].name)}`)).join("")}`;
    view.scrollTop = 0;
  }
  function showFlow(f) {
    const m = MODES[f.mode], reply = f.reply ?? null;
    view.innerHTML = `${backLink()}<p style="color:${m.color}">${icon(f.mode).replace("<svg", '<svg width="48" height="30"')}</p>
      <h2>${esc(f.label)}</h2><p class="lede">${esc(m.name)}: ${esc(m.what)}</p>
      <h3>Carries</h3><p class="mono">${esc(f.carries)}</p>
      ${reply ? `<h3>Comes back with</h3><p class="mono">${esc(reply)}</p>` : `<p class="lede">One way: nothing comes back on this line.</p>`}
      <h3>Between</h3><div class="plist">${[f.from, f.to].map((id) => `<button type="button" class="prow" data-place="${id}"><b>${esc(byId[id].name)}</b><small>${esc(byId[id].files)}</small></button>`).join("")}</div>`;
    view.scrollTop = 0;
  }
  function showTab() {
    $("tab-journeys").setAttribute("aria-selected", String(tab === "journeys"));
    $("tab-places").setAttribute("aria-selected", String(tab === "places"));
    tab === "journeys" ? showJourneys() : showPlaces();
  }
  for (const [id, name] of [["tab-journeys", "journeys"], ["tab-places", "places"]]) {
    $(id).addEventListener("click", () => { tab = name; if (live && (ENGINE.getTour() || pressedMode)) ENGINE.clear(true); showTab(); });
  }

  // ---- A journey
  function buildTour(t) {
    tourBuiltFor = t.def.id;
    view.innerHTML = `${backLink()}<h2>${esc(t.def.name)}</h2><p class="lede">${esc(t.def.tag)}. ${esc(t.def.blurb)}</p>
      <div class="done" id="done" hidden>That's the whole journey. Every lit line and colored building is part of it.</div>
      <div class="controls">
        <button type="button" data-act="prev" id="s-prev" aria-label="Previous step">←</button>
        <button type="button" data-act="play" class="play" id="s-play">Pause</button>
        <button type="button" data-act="next" id="s-next" aria-label="Next step">→</button>
        <span class="count" id="s-count" aria-live="polite"></span>
      </div>
      <ol class="steps">${t.def.steps.map((s, i) => `<li class="step" id="st-${i}"><button type="button" data-step="${i}">${s.flow ? icon(flowsById[s.flow].mode) : icon("pin")}<span><b>${esc(s.title)}</b><span class="b">${esc(s.body)}</span></span></button></li>`).join("")}</ol>`;
    view.scrollTop = 0;
  }
  function showStep(t) {
    if (tourBuiltFor !== t.def.id) buildTour(t);
    const n = t.def.steps.length;
    t.def.steps.forEach((_, i) => {
      const el = $(`st-${i}`);
      el.className = `step${i === t.i && !t.finished ? " now" : ""}${i < t.i || t.finished ? " past" : ""}`;
    });
    $("s-prev").disabled = t.i === 0;
    $("s-next").disabled = !!t.finished;
    $("s-next").textContent = t.i === n - 1 && !t.finished ? "Finish" : "→";
    $("s-play").textContent = t.finished ? "Play again" : t.playing ? "Pause" : "Play";
    $("s-count").textContent = t.finished ? `${n} steps` : `Step ${t.i + 1} of ${n}`;
    $("done").hidden = !t.finished;
    if (!t.finished) $(`st-${t.i}`).scrollIntoView({ block: "nearest", behavior: ENGINE.reduced ? "auto" : "smooth" });
    else view.scrollTop = 0;
  }

  // ---- Wiring
  if (live) {
    ENGINE.on("focus", ({ place, mode, flow }) => {
      pressChip(mode);
      if (place) showPlace(place); else if (mode) showMode(mode); else if (flow) showFlow(flow); else showTab();
    });
    ENGINE.on("tour", (t) => { tourBuiltFor = null; if (t) pressChip(null); else showTab(); });
    ENGINE.on("step", showStep);
    ENGINE.on("map", (m) => {
      $("map-google").setAttribute("aria-pressed", String(m === "google"));
      $("map-osm").setAttribute("aria-pressed", String(m === "osm"));
    });
    // Start on the map this server is set to. With no answer, Google's: the setting's default.
    fetch("app-config").then((r) => r.json()).then((c) => { if (!ENGINE.getTour() && (c.map === "osm" || c.map === "google")) ENGINE.setMap(c.map); }).catch(() => {});
    for (const m of ["google", "osm"]) $(`map-${m}`).addEventListener("click", () => { if (ENGINE.getTour()) ENGINE.clear(); ENGINE.setMap(m); });
    const pause = $("pause");
    const label = () => (pause.textContent = ENGINE.traffic() ? "Pause traffic" : "Play traffic");
    ENGINE.on("traffic", label); label();
    pause.addEventListener("click", () => ENGINE.setTraffic(!ENGINE.traffic()));
    $("reset").addEventListener("click", () => ENGINE.clear(true));
    addEventListener("keydown", (e) => {
      if (e.key === "Escape") ENGINE.clear(true);
      if (ENGINE.getTour() && e.key === "ArrowRight") ENGINE.nextStep();
      if (ENGINE.getTour() && e.key === "ArrowLeft") ENGINE.prevStep();
    });
  } else {
    stage.insertAdjacentHTML("beforeend", `<div class="nogl"><p>The 3D city needs WebGL, and this browser isn't offering it. The journeys and places beside it still read as text.</p></div>`);
    document.querySelector(".tools").hidden = true;
  }
  showTab();
})();
