// The third-person view while driving a car: a tilted map that follows the road from behind the car,
// with the stop signs, traffic lights and turns coming up, and the road the car is on. drive.js keeps
// following the trip as ever; this only shows it. Where it can't run (no WebGL, say), the flat map
// below stays in view.
//
// The map's look comes from OpenFreeMap (no key, with 3D buildings), or OpenStreetMap's own images
// where that doesn't answer. The lights are drawn without a color: nothing here knows if one is red.

import { bearing, loadScript } from "./maps.js";
import { $, COLORS, NAV, element, state } from "./core.js";
import { lang } from "./i18n.js";
import { postJson } from "./app.js";
import { advancePreview, nearestOnPath, spokenDistance } from "./drive.js";

const LIBRARY = "vendor/maplibre/maplibre-gl.js"; // MapLibre GL JS 4.7.1
const STYLESHEET = "vendor/maplibre/maplibre-gl.css";
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const STYLE_WAIT_MS = 4000;
const RASTER_STYLE = {
  version: 8,
  sources: {
    osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" },
  },
  layers: [
    { id: "ground", type: "background", paint: { "background-color": "#dfe4e8" } },
    { id: "osm", type: "raster", source: "osm" },
  ],
};
const CAMERA = { zoom: 18.3, pitch: 68, maxPitch: 70 };
const CAR_AT = 0.5; // the padding above the map's center, as a share of its height: the car sits three quarters down
const LOOK_AHEAD_M = 25; // the road's direction is judged this far on, so the view eases into bends
const CAMERA_EASE_MS = 120; // the camera trails the car by about this, which rounds off the corners of the route's line
const TURN_EASE_MS = 380;
const SIGNS_EVERY_MS = 200; // which signs are near, and the card over the map; their size changes every frame
const SIGNS_WITHIN_M = 805; // half a mile: stop signs and lights start to show here
const TURNS_WITHIN_M = 450;
const PASSED_M = 15;
const MAX_PIXEL_RATIO = 1.5; // finer than this costs frames, on a view that's always moving
// The eight points, clockwise from north. Spanish calls west "oeste", so its letters differ from English's.
const COMPASS = lang === "es"
  ? [["N", "norte"], ["NE", "noreste"], ["E", "este"], ["SE", "sureste"], ["S", "sur"], ["SO", "suroeste"], ["O", "oeste"], ["NO", "noroeste"]]
  : [["N", "north"], ["NE", "northeast"], ["E", "east"], ["SE", "southeast"], ["S", "south"], ["SW", "southwest"], ["W", "west"], ["NW", "northwest"]];
const COMPASS_STICKS_DEG = 5; // how far past the edge of a point before it changes, so a wavy road doesn't flicker

const view = { map: null, path: null, items: [], roads: [], from: null, to: null, target: null, heading: null, fixAt: 0, spanMs: 1000, lastFrame: 0, lastSigns: 0, frame: 0, shown: null, along: 0, bearing: 0, compass: null };

export function driveViewOn() {
  return document.body.classList.contains("driving3d");
}

export async function openDriveView() {
  const box = $("drive-view");
  try {
    if (!document.querySelector(`link[href="${STYLESHEET}"]`)) {
      document.head.append(element("link", { rel: "stylesheet", href: STYLESHEET }));
    }
    if (!window.maplibregl) await loadScript(LIBRARY);
    const style = await mapStyle();
    if (!state.nav.active || view.map) return;
    box.hidden = false;
    const path = state.paths[state.activeRouteId];
    const start = path ? path.points[0] : state.origin;
    view.map = new window.maplibregl.Map({
      container: $("drive-view-map"),
      style,
      center: start,
      bearing: path ? roadBearing(path, 0) : 0,
      ...CAMERA,
      interactive: false,
      pixelRatio: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
      attributionControl: { compact: true },
    });
    view.map.on("error", (event) => console.warn("Driving view:", event.error && event.error.message));
    view.map.on("resize", holdTheCar);
    await new Promise((resolve) => view.map.once("load", resolve));
    if (!view.map) return;
    holdTheCar();
    addRouteLine();
    view.bearing = view.map.getBearing();
    view.along = 0;
    view.shown = { lat: start.lat, lng: start.lng };
    view.lastFrame = performance.now();
    document.body.classList.add("driving3d");
    box.scrollIntoView({ block: "start" }); // on a phone, the button that started this is further down
    view.map.resize();
    view.frame = requestAnimationFrame(draw);
  } catch (error) {
    console.warn("No driving view:", error);
    closeDriveView();
  }
}

export function closeDriveView() {
  cancelAnimationFrame(view.frame);
  for (const item of view.items) if (item.marker) item.marker.remove();
  if (view.map) view.map.remove();
  Object.assign(view, { map: null, path: null, items: [], roads: [], from: null, to: null, target: null, heading: null, shown: null, compass: null });
  $("drive-view").hidden = true;
  $("drive-turn").hidden = true;
  $("drive-ahead").hidden = true;
  $("drive-road").hidden = true;
  document.body.classList.remove("driving3d");
}

// A new position from drive.js: the view moves there over about the time since the last one, along the road.
export function driveViewFix(here, heading) {
  if (!view.map || !view.shown) return;
  const path = currentPath();
  const on = path && nearestOnPath(here, path);
  const now = performance.now();
  view.from = { point: view.target || view.shown, along: view.along };
  view.to = { point: here, along: on && on.distance <= NAV.onRouteM ? on.along : null };
  view.heading = heading;
  view.spanMs = Math.min(2000, Math.max(200, now - view.fixAt));
  view.fixAt = now;
}

async function mapStyle() {
  try {
    const response = await fetch(STYLE_URL, { signal: AbortSignal.timeout(STYLE_WAIT_MS) });
    if (response.ok) {
      const style = await response.json();
      style.layers = style.layers.filter((layer) => !layer.id.startsWith("poi")); // shops and parking only clutter the road
      return style;
    }
  } catch {
    // The look below needs no style of its own.
  }
  return RASTER_STYLE;
}

function holdTheCar() {
  view.map.setPadding({ top: view.map.getContainer().clientHeight * CAR_AT, bottom: 0, left: 0, right: 0 });
}

function addRouteLine() {
  const line = { type: "Feature", geometry: { type: "LineString", coordinates: [] } };
  view.map.addSource("route", { type: "geojson", data: line });
  const round = { "line-cap": "round", "line-join": "round" };
  view.map.addLayer({ id: "route-edge", type: "line", source: "route", layout: round, paint: { "line-color": "#ffffff", "line-width": 16 } });
  view.map.addLayer({ id: "route", type: "line", source: "route", layout: round, paint: { "line-color": COLORS.winner, "line-width": 11 } });
}

function currentPath() {
  const path = state.paths[state.activeRouteId] || null;
  if (path !== view.path && view.map && view.map.getSource("route")) showPath(path);
  return path;
}

// The followed route's line, its turns at once, and its signs and road names when the server has answered.
function showPath(path) {
  view.path = path;
  for (const item of view.items) if (item.marker) item.marker.remove();
  view.items = [];
  view.roads = [];
  if (!path) return;
  view.map.getSource("route").setData({ type: "Feature", geometry: { type: "LineString", coordinates: path.points.map((p) => [p.lng, p.lat]) } });
  view.items = path.maneuvers
    .filter((maneuver) => arrowFor(maneuver.maneuver))
    .map((maneuver) => ({ kind: "turn", along: maneuver.along, at: maneuver.location, arrow: arrowFor(maneuver.maneuver) }));
  if (!path.encoded) return;
  postJson("/road-controls", { encoded_polyline: path.encoded })
    .then(({ controls, roads }) => {
      if (view.path !== path) return;
      view.items.push(...controls.map((control) => ({ kind: control.kind, along: control.along_m, at: control })));
      view.roads = roads;
    })
    .catch((error) => console.warn("No signs for this route:", error));
}

function draw(now) {
  view.frame = requestAnimationFrame(draw);
  const path = currentPath();
  const elapsed = Math.max(0, Math.min(500, now - view.lastFrame));
  view.lastFrame = now;
  const target = wherePointed(now, path);
  const follow = 1 - Math.exp(-elapsed / CAMERA_EASE_MS);
  view.target = target;
  view.shown = { lat: view.shown.lat + (target.lat - view.shown.lat) * follow, lng: view.shown.lng + (target.lng - view.shown.lng) * follow };
  const wanted = path && view.along !== null ? roadBearing(path, view.along) : view.heading === null ? view.bearing : view.heading;
  view.bearing += (((wanted - view.bearing + 540) % 360) - 180) * (1 - Math.exp(-elapsed / TURN_EASE_MS));
  view.map.jumpTo({ center: view.shown, bearing: view.bearing });
  sizeSigns();
  showCompass();
  if (now - view.lastSigns >= SIGNS_EVERY_MS) {
    view.lastSigns = now;
    showSigns(path);
  }
}

// Where the car is now: a preview's own place on the road, or else between the last GPS position and the newest.
function wherePointed(now, path) {
  if (state.nav.preview && path) {
    view.along = advancePreview(now); // the frame's own time: what the screen will show it at
    return pointAt(path, view.along);
  }
  if (!view.to) return view.shown;
  const share = Math.min(1, (now - view.fixAt) / view.spanMs);
  const { from, to } = view;
  if (to.along !== null && from.along !== null && path) {
    view.along = from.along + (to.along - from.along) * share;
    return pointAt(path, view.along);
  }
  view.along = to.along;
  return { lat: from.point.lat + (to.point.lat - from.point.lat) * share, lng: from.point.lng + (to.point.lng - from.point.lng) * share };
}

export function roadBearing(path, along) {
  return bearing(pointAt(path, along), pointAt(path, Math.min(path.lengthM, along + LOOK_AHEAD_M)));
}

// The point this far along the path.
export function pointAt(path, along) {
  const { points, cumulative } = path;
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] <= along) low = middle;
    else high = middle;
  }
  const length = cumulative[high] - cumulative[low];
  const share = length ? Math.max(0, Math.min(1, (along - cumulative[low]) / length)) : 0;
  return { lat: points[low].lat + (points[high].lat - points[low].lat) * share, lng: points[low].lng + (points[high].lng - points[low].lng) * share };
}

// The signs just ahead on the map, and what's next on the card over it.
function showSigns(path) {
  const along = view.along;
  let nextControl = null;
  for (const item of view.items) {
    const toGo = along === null ? Infinity : item.along - along;
    const near = toGo > -PASSED_M && toGo < (item.kind === "turn" ? TURNS_WITHIN_M : SIGNS_WITHIN_M);
    if (near && !item.marker) {
      item.face = signFace(item);
      item.marker = new window.maplibregl.Marker({
        element: element("div", { className: "road-sign-spot" }, item.face),
        anchor: "bottom",
        pitchAlignment: "viewport",
        rotationAlignment: "viewport",
        subpixelPositioning: true, // whole pixels would make a moving sign shake
        offset: [item.kind === "turn" ? 34 : 20, 0],
      })
        .setLngLat(item.at)
        .addTo(view.map);
    } else if (!near && item.marker) {
      item.marker.remove();
      item.marker = null;
    }
    if (item.kind !== "turn" && toGo > 0 && (!nextControl || toGo < nextControl.along - along)) nextControl = item;
  }
  showCard(path, along, nextControl);
  showRoad(along);
}

// Each sign grows as it comes closer.
function sizeSigns() {
  for (const item of view.items) {
    if (!item.marker || view.along === null) continue;
    const toGo = item.along - view.along;
    const scale = item.kind === "turn" ? Math.max(0.45, Math.min(1.3, 1.35 - toGo / 320)) : Math.max(0.4, Math.min(1, 1 - toGo / 900));
    item.face.style.transform = `scale(${scale.toFixed(3)})`;
  }
}

function signFace(item) {
  if (item.kind === "stop") return element("div", { className: "road-sign road-sign--stop", title: "Stop sign" }, element("span", {}, "STOP"));
  if (item.kind === "signal") {
    return element("div", { className: "road-sign road-sign--signal", title: "Traffic light" }, element("i", {}), element("i", {}), element("i", {}));
  }
  return element("div", { className: `road-sign road-sign--turn road-sign--${item.arrow}`, title: "Turn" }, element("i", {}));
}

function showCard(path, along, control) {
  const next = path && along !== null ? path.maneuvers.find((maneuver) => maneuver.along > along + 5) : null;
  const arrow = next && arrowFor(next.maneuver);
  $("drive-turn").hidden = !arrow;
  if (arrow) {
    const look = `drive-hud__turn road-sign--${arrow}`;
    if ($("drive-turn").className !== look) $("drive-turn").className = look;
    setText("drive-turn-distance", spokenDistance(next.along - along));
  }
  const soon = control && control.along - along < SIGNS_WITHIN_M;
  $("drive-ahead").hidden = !soon;
  if (soon) {
    setText("drive-ahead-what", control.kind === "stop" ? "Stop sign" : "Traffic light");
    setText("drive-ahead-distance", spokenDistance(control.along - along));
    $("drive-ahead").dataset.kind = control.kind;
  }
}

function showCompass() {
  $("drive-compass-dial").style.transform = `rotate(${(-view.bearing).toFixed(1)}deg)`;
  const point = compassPoint(view.bearing, view.compass);
  if (point === view.compass) return;
  view.compass = point;
  $("drive-compass-point").textContent = COMPASS[point][0];
  $("drive-compass").setAttribute("aria-label", lang === "es" ? `Rumbo: ${COMPASS[point][1]}` : `Going ${COMPASS[point][1]}`);
}

// Which of the eight points a bearing is nearest (its place in COMPASS), staying on the current one near the edge.
export function compassPoint(degrees, current = null) {
  const bearingNow = ((degrees % 360) + 360) % 360;
  if (current !== null) {
    const off = Math.abs(((bearingNow - current * 45 + 540) % 360) - 180);
    if (off <= 22.5 + COMPASS_STICKS_DEG) return current;
  }
  return Math.round(bearingNow / 45) % 8;
}

// The road the car is on, by the last name it passed along the route. None on a nameless stretch, or off the route.
function showRoad(along) {
  let name = "";
  if (along !== null) {
    for (const road of view.roads) {
      if (road.along_m > along) break;
      name = road.name;
    }
  }
  $("drive-road").hidden = !name;
  if (name) setText("drive-road-name", name);
}

// Only when it changes: the page's Spanish translates each new text.
function setText(id, text) {
  const node = $(id);
  if (node.dataset.english !== text) {
    node.dataset.english = text;
    node.textContent = text;
  }
}

// Which arrow a turn gets; one that's just straight on gets none.
function arrowFor(maneuver) {
  const name = maneuver || "";
  const side = name.includes("LEFT") ? "left" : name.includes("RIGHT") ? "right" : "";
  if (!side) return name === "MERGE" ? "ahead" : name.startsWith("ROUNDABOUT") ? "ahead" : null;
  if (name.startsWith("UTURN")) return `uturn-${side}`;
  if (name.includes("SLIGHT") || name.startsWith("RAMP") || name.startsWith("FORK") || name.startsWith("MERGE")) return `bear-${side}`;
  return `turn-${side}`;
}
