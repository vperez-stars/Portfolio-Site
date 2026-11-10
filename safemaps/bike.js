// Bike and walking modes (see BIKE_MODE.md), and the switch between all the modes: bike and walking
// trips from the server (POST /bike-route, /walk-route), their routes drawn by stress, and the Bike
// stress layer (GET /bike-stress). Bus trips are transit.js's.
//
// A bike route's stretches are colored by their Level of Traffic Stress: 1 for anyone (trails,
// quiet streets) to 4 for only the most confident riders (fast, multi-lane traffic). A walk's are
// colored the same way by its sidewalks: 1 a sidewalk or path, 4 a busy street without one. The
// recommended route is the lowest-stress one within the traveler's detour limit; the standard one
// is the shortest.

import { decodePolyline } from "./maps.js";
import { $, KM_TO_MI, capitalize, element, state } from "./core.js";
import { postJson } from "./app.js";
import { chosenStops } from "./editing.js";
import { clearRoutes, drawRoutes, isStandard, routeLabel, routeKind, scorePill, scoreRing, selectRoute } from "./results.js";

export const STRESS_COLORS = { 1: "#1a9850", 2: "#8bbd2a", 3: "#f08c00", 4: "#d7191c" };
const MODE_KEY = "routes-mode";
const MODES = ["car", "bike", "walk", "transit"];
const STRESS_MIN_ZOOM = 14; // the stress layer asks for the streets in view only this close in
const RISK_LABELS = {
  stress_4_minutes: "Minutes on very busy streets",
  stress_3_minutes: "Minutes on busy streets",
  busy_crossings: "Crossing busy roads without a signal",
  crash_spots: "Where cyclists were killed",
  rail_crossings: "Railroad tracks",
  unlit_minutes: "Minutes on unlit stretches, after dark",
  lane_closures: "Lane closures",
  closures: "Closed roads",
};

// What the bike and walking modes say and ask for.
const ACTIVE = {
  bike: {
    path: "/bike-route",
    profile: "bike-profile",
    start: "Start riding",
    stop: "Stop riding",
    stress: { 1: "Low stress: anyone", 2: "Some traffic: most adults", 3: "Busy: confident riders", 4: "Very busy: few riders" },
    busy: "busy streets",
    killed: "Where cyclists were killed",
    risks: RISK_LABELS,
    winter: "Winter: trails may not be cleared of snow and ice. Check before you ride.",
    dark: "It's dark: crossing busy roads counts as riskier. Use lights.",
  },
  walk: {
    path: "/walk-route",
    profile: "walk-profile",
    start: "Start walking",
    stop: "Stop walking",
    stress: { 1: "Sidewalk or path", 2: "Quiet street without a sidewalk", 3: "Busy street with no sidewalk mapped", 4: "Busy street without a sidewalk" },
    busy: "busy streets without a sidewalk",
    killed: "Where pedestrians were killed",
    risks: {
      ...RISK_LABELS,
      stress_4_minutes: "Minutes on busy streets without a sidewalk",
      stress_3_minutes: "Minutes on busy streets with no sidewalk mapped",
      crash_spots: "Where pedestrians were killed",
    },
    winter: "Winter: sidewalks may be icy where they aren't cleared.",
    dark: "It's dark: crossing busy roads counts as riskier. Wear something bright.",
  },
};

const modes = { available: { car: true }, stressRequest: 0 };

// Bike and walking trips come from here; car trips from results.js, bus trips from transit.js.
export function isActiveMode(mode) {
  return mode in ACTIVE;
}

// What the Start button says in each mode.
export function startLabel(mode, going = false) {
  const words = ACTIVE[mode] || { start: "Start driving", stop: "Stop driving" };
  return going ? words.stop : words.start;
}

// The switch, with the modes the server has maps (or a schedule) for; the stress layer with the bike map.
export function setUpModes(available) {
  Object.assign(modes.available, available);
  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.closest("label").hidden = !modes.available[radio.value];
    radio.addEventListener("change", () => setMode(radio.value, { remember: true }));
  }
  if (!MODES.some((mode) => mode !== "car" && modes.available[mode])) return;
  $("mode").hidden = false;
  if (modes.available.bike) {
    $("bike-stress-switch").hidden = false;
    $("bike-stress-layer").addEventListener("change", drawStressLayer);
    state.view.onMoveEnd(() => $("bike-stress-layer").checked && drawStressLayer());
  }
  const fromLink = new URLSearchParams(window.location.search).get("mode");
  let saved = null;
  try {
    saved = localStorage.getItem(MODE_KEY);
  } catch {
    // Storage blocked: car mode unless the link says.
  }
  setMode(fromLink || saved || "car");
}

// Car, bike, walk or transit: the controls that apply, and what's drawn. Routes for the other mode are cleared.
export function setMode(mode, { remember = false } = {}) {
  if (!modes.available[mode]) mode = "car";
  const changed = state.mode !== mode;
  state.mode = mode;
  document.body.dataset.mode = mode;
  showStressKey();
  const radio = document.querySelector(`input[name="mode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  if (!state.nav.active) $("drive").textContent = startLabel(mode);
  if (remember) {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Remembered for this visit only.
    }
    // The Biking layer helps on a bike, the Transit layer on the bus: on with that mode, off again after.
    for (const [layer, on] of [["biking-layer", mode === "bike"], ["transit-layer", mode === "transit"]]) {
      const box = $(layer);
      if (box.checked !== on) {
        box.checked = on;
        box.dispatchEvent(new Event("change"));
      }
    }
  }
  if (changed && state.plan) {
    clearRoutes();
    state.plan = null;
    $("results").replaceChildren();
    $("drive").hidden = true;
  }
}

// stops: places still to stop at (the chosen ones by default; while on the way, those not reached yet).
export async function requestActiveTrip(origin, destination, { stops = chosenStops() } = {}) {
  const words = ACTIVE[state.mode];
  return postJson(words.path, {
    origin: { lat: origin.lat, lng: origin.lng },
    destination: { lat: destination.lat, lng: destination.lng },
    stops: stops.map((point) => ({ lat: point.lat, lng: point.lng })),
    profile: $(words.profile).value,
    departure_offset_min: Number($("leave").value) || 0,
  });
}

// ---- A bike or walking trip, drawn and explained

export function showActiveTrip(trip, { fit = true } = {}) {
  const { plan } = trip;
  const words = ACTIVE[state.mode];
  state.plan = plan;
  clearRoutes();
  drawRoutes(plan, fit);
  drawStress(plan.winner);
  drawCrossings(plan);
  const standard = plan.candidates.find(isStandard);
  const notes = [...(trip.winter ? [words.winter] : []), ...(trip.after_dark ? [words.dark] : [])];
  $("results").replaceChildren(
    ...notes.map((note) => element("div", { className: "alert" }, element("p", {}, note))),
    winnerCard(plan, standard),
    element("h2", { className: "results__heading" }, "All routes, best first · pick one to follow it"),
    routeList(plan),
  );
  const credit = $("osm-credit");
  credit.textContent = trip.attribution.join(" · ");
  credit.hidden = false;
  selectRoute(plan.winner.id);
  $("drive").hidden = false;
}

// The recommended route, stretch by stretch in its stress colors, over its white edge. (What's in
// state.modeMarks goes with the routes: clearRoutes.)
function drawStress(route) {
  for (const stretch of route.stress_segments) {
    state.modeMarks.push(state.view.line(decodePolyline(stretch.encoded_polyline), { color: STRESS_COLORS[stretch.stress], weight: 6, zIndex: 22 }));
  }
}

// Crossings of busy roads without a signal: the recommended route's as dots, the shortest route's it avoids as rings.
function drawCrossings(plan) {
  const ours = plan.winner.features.crossings;
  const mark = (crossing, avoided) => {
    const dot = element("div", { className: avoided ? "turn-dot turn-dot--avoided" : "turn-dot" });
    const heading = avoided ? "Busy crossing avoided" : "Busy crossing";
    const text = avoided
      ? "The shortest route crosses a busy road here without a signal. The recommended route doesn't."
      : "The recommended route crosses a busy road here without a signal. Take care.";
    state.modeMarks.push(state.view.marker(crossing, dot, { title: heading, zIndex: avoided ? 29 : 30, popup: { heading, text } }));
  };
  ours.forEach((crossing) => mark(crossing, false));
  const standard = plan.candidates.find(isStandard);
  if (!standard || standard.id === plan.winner.id) return;
  const near = (a, b) => Math.abs(a.lat - b.lat) < 0.0003 && Math.abs(a.lng - b.lng) < 0.0004;
  for (const crossing of standard.features.crossings) {
    if (!ours.some((mine) => near(mine, crossing))) mark(crossing, true);
  }
}

function winnerCard(plan, standard) {
  const winner = plan.winner;
  const f = winner.features;
  const card = element(
    "section",
    { className: "winner" },
    element(
      "div",
      { className: "winner__head" },
      element(
        "div",
        {},
        element("span", { className: "winner__badge" }, "Recommended"),
        element("h2", { className: "winner__title" }, routeLabel(winner, plan)),
        ...(winner.via ? [element("p", { className: "winner__kind" }, routeKind(winner, plan))] : []),
      ),
      scoreRing(winner.safety_score),
    ),
  );
  if (winner.reason) card.append(element("p", { className: "winner__reason" }, capitalize(winner.reason)));
  if (standard && standard.id !== winner.id) card.append(element("p", { className: "override" }, comparedWithShortest(winner, standard)));
  card.append(
    stressBar(f.minutes_by_stress),
    element(
      "dl",
      { className: "stats" },
      ...[
        ["Time", `${Math.round(f.duration_min)} min`],
        ["Distance", `${(f.distance_km * KM_TO_MI).toFixed(1)} mi`],
        ["Busy crossings", String(f.busy_crossings)],
        ["Railroad tracks", String(f.rail_crossings)],
        ...(f.crash_spots ? [[ACTIVE[state.mode].killed, String(f.crash_spots)]] : []),
      ].map(([label, value]) => element("div", {}, element("dt", {}, label), element("dd", {}, value))),
    ),
    breakdown(winner, standard),
  );
  return card;
}

// Minutes at each stress level, as one bar, named as mode names them.
export function stressBar(minutes, mode = state.mode) {
  const names = ACTIVE[mode].stress;
  const total = minutes.reduce((sum, value) => sum + value, 0) || 1;
  const bar = element(
    "div",
    { className: "stress-bar", role: "img" },
    ...minutes.map((value, i) =>
      element("span", { className: "stress-bar__part", style: `flex:${value / total};background:${STRESS_COLORS[i + 1]}`, title: `${names[i + 1]}: ${Math.round(value)} min` }),
    ),
  );
  bar.setAttribute("aria-label", minutes.map((value, i) => `${names[i + 1]}: ${Math.round(value)} min`).join(", "));
  return element(
    "div",
    { className: "stress" },
    bar,
    element(
      "ul",
      { className: "stress__key" },
      ...minutes.map((value, i) => element("li", {}, element("span", { className: "key", style: `background:${STRESS_COLORS[i + 1]}` }), `${names[i + 1]} · ${Math.round(value)} min`)),
    ),
  );
}

function comparedWithShortest(winner, standard) {
  const parts = [`safety score ${standard.safety_score} → ${winner.safety_score}`];
  const busy = (route) => route.features.minutes_by_stress[2] + route.features.minutes_by_stress[3];
  const calmer = busy(standard) - busy(winner);
  if (calmer >= 0.5) parts.push(`${Math.round(calmer)} min less on ${ACTIVE[state.mode].busy}`);
  const fewer = standard.features.busy_crossings - winner.features.busy_crossings;
  if (fewer > 0) parts.push(`${fewer} fewer busy crossing${fewer === 1 ? "" : "s"}`);
  const minutes = winner.features.duration_min - standard.features.duration_min;
  if (minutes >= 0.5) parts.push(`${minutes.toFixed(1)} min longer`);
  return `Instead of the shortest route: ${parts.join(", ")}`;
}

function breakdown(winner, standard) {
  const compare = Boolean(standard && standard.id !== winner.id);
  const ours = winner.safety_risks || {};
  const theirs = compare ? standard.safety_risks || {} : {};
  const labels = ACTIVE[state.mode].risks;
  const kinds = Object.keys(labels).filter((kind) => ours[kind] || theirs[kind]);
  if (!kinds.length) return element("p", { className: "breakdown__none" }, "No risks found on this route: a perfect 100.");
  const points = (value) => (value ? (Math.round(value * 10) / 10).toString() : "–");
  const total = (risks) => Object.values(risks).reduce((sum, value) => sum + value, 0);
  const columns = (a, b) => [a, ...(compare ? [b] : [])];
  const row = (label, cells, className = "") => element("tr", { className }, element("th", {}, label), ...cells.map((text) => element("td", {}, text)));
  return element(
    "details",
    { className: "breakdown" },
    element("summary", {}, "What the safety score counts"),
    element(
      "table",
      { className: "breakdown__table" },
      element("thead", {}, row("Risk points", columns("This route", "Shortest"))),
      element("tbody", {}, ...kinds.map((kind) => row(labels[kind], columns(points(ours[kind]), points(theirs[kind]))))),
      element(
        "tfoot",
        {},
        row("Total", columns(points(total(ours)), points(total(theirs))), "breakdown__total"),
        row("Safety score", columns(String(winner.safety_score), compare ? String(standard.safety_score) : "")),
      ),
    ),
    element(
      "p",
      { className: "breakdown__note" },
      "Busy streets count by the minute; crossings of busy roads without a signal count each. The score is 100 with no risks, and halves with every 10 risk points.",
    ),
  );
}

function routeList(plan) {
  return element(
    "ol",
    { className: "routes" },
    ...plan.candidates.map((route) => {
      const f = route.features;
      const item = element(
        "li",
        { className: "route", tabIndex: 0, dataset: { id: route.id } },
        element("span", { className: "swatch", style: `background:${route.id === plan.winner.id ? STRESS_COLORS[1] : isStandard(route) ? "#4a5a6a" : "#a9b2bc"}` }),
        element(
          "div",
          {},
          element("div", { className: "route__name" }, routeLabel(route, plan), " ", scorePill(route.safety_score)),
          element("div", { className: "route__reason" }, [route.via ? routeKind(route, plan) : "", route.reason ? capitalize(route.reason) : ""].filter(Boolean).join(" · ")),
          stressBar(f.minutes_by_stress).firstChild,
        ),
        element(
          "div",
          { className: "route__numbers" },
          element("div", {}, `${Math.round(f.duration_min)} min · ${(f.distance_km * KM_TO_MI).toFixed(1)} mi`),
          element("div", { className: f.busy_crossings ? "risky" : "" }, `${f.busy_crossings} busy crossing${f.busy_crossings === 1 ? "" : "s"}`),
        ),
      );
      item.addEventListener("click", () => selectRoute(route.id));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") selectRoute(route.id);
      });
      return item;
    }),
  );
}

// ---- The Bike stress layer: every street and trail in view, colored by stress

// The map key's stress colors: in bike mode, or with the stress layer on.
function showStressKey() {
  $("legend-stress").hidden = !(state.mode === "bike" || $("bike-stress-layer").checked);
}

async function drawStressLayer() {
  const ticket = ++modes.stressRequest;
  const clear = () => modes.layer && modes.layer.splice(0).forEach((line) => line.remove());
  showStressKey();
  if (!$("bike-stress-layer").checked) {
    $("stress-hint").hidden = true;
    return clear();
  }
  const view = state.view.view();
  if (!view) return;
  if (view.zoom < STRESS_MIN_ZOOM) {
    clear();
    $("stress-hint").hidden = false;
    return;
  }
  $("stress-hint").hidden = true;
  let data;
  try {
    const params = new URLSearchParams({ south: view.south, west: view.west, north: view.north, east: view.east });
    const response = await fetch(`/bike-stress?${params}`);
    if (!response.ok) throw new Error(`The server answered ${response.status}`);
    data = await response.json();
  } catch (error) {
    console.warn("Bike stress unavailable:", error);
    return;
  }
  if (ticket !== modes.stressRequest || !$("bike-stress-layer").checked) return; // the map moved again meanwhile
  clear();
  modes.layer = [];
  for (const [stress, lines] of Object.entries(data.lines)) {
    for (const encoded of lines) {
      modes.layer.push(state.view.line(decodePolyline(encoded), { color: STRESS_COLORS[stress], weight: 3, opacity: 0.85, zIndex: 2, under: true }));
    }
  }
}
