// Map layers: the map's look (and the dark map at night), remembered in this browser, and the
// OpenStreetMap map's bus routes.

import { decodePolyline, distanceM } from "./maps.js";
import { $, LAYERS_KEY, MILWAUKEE, M_PER_DEG_LAT, NEAR_TRIP_M, NIGHT_SUN_DEG, state } from "./core.js";
import { redrawLines } from "./results.js";

export function rememberLayers() {
  const layers = { base: document.querySelector('input[name="base-map"]:checked').value };
  for (const box of document.querySelectorAll('#layers input[type="checkbox"]')) layers[box.id] = box.checked;
  try {
    localStorage.setItem(LAYERS_KEY, JSON.stringify(layers));
  } catch {
    // Storage blocked: the layers start as they are next time.
  }
}

export function savedLayers() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYERS_KEY));
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}

// Set as last time, through the controls' own change handlers.
export function restoreLayers() {
  const saved = savedLayers();
  if (!saved) return;
  const radio = [...document.querySelectorAll('input[name="base-map"]')].find((input) => input.value === saved.base);
  const changes = radio && !radio.checked ? [radio] : [];
  for (const box of document.querySelectorAll('#layers input[type="checkbox"]')) {
    if (typeof saved[box.id] === "boolean" && box.checked !== saved[box.id]) changes.push(box);
  }
  for (const input of changes) {
    input.checked = input.type === "radio" || !input.checked;
    input.dispatchEvent(new Event("change"));
  }
}

// The map's look: the type chosen, or the dark map at night when Default is chosen and "Dark map at
// night" is on. always: show it even if it hasn't changed (a new type was picked). Google's map
// can't switch to or from dark once made: there the switch counts from the next visit.
export function applyBaseMap({ always = false } = {}) {
  if (!state.view) return;
  const dark = state.view.switchesDark
    ? $("dark-at-night").checked && state.baseMap === "roadmap" && isNight()
    : state.dark;
  if (dark === state.dark && !always) return;
  state.dark = dark;
  state.view.baseMap(dark && state.baseMap === "roadmap" ? "dark" : state.baseMap);
  redrawLines();
}

// Whether the sun is down where the map is (or where the trip starts).
export function isNight() {
  return sunAltitudeDeg(new Date(), state.origin || MILWAUKEE) < NIGHT_SUN_DEG;
}

// The sun's height above the horizon, in degrees (accurate to a fraction of a degree: plenty for dusk).
function sunAltitudeDeg(when, { lat, lng }) {
  const rad = Math.PI / 180;
  const days = when.getTime() / 86400000 - 10957.5; // since noon, January 1, 2000 (UTC)
  const anomaly = (357.529 + 0.98560028 * days) * rad;
  const meanLongitude = 280.459 + 0.98564736 * days;
  const longitude = (meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * rad;
  const tilt = (23.439 - 0.00000036 * days) * rad;
  const declination = Math.asin(Math.sin(tilt) * Math.sin(longitude));
  const rightAscension = Math.atan2(Math.cos(tilt) * Math.sin(longitude), Math.cos(longitude));
  const siderealDeg = (280.46061837 + 360.98564736629 * days) % 360;
  const hourAngle = (siderealDeg + lng) * rad - rightAscension;
  const altitude = Math.asin(
    Math.sin(lat * rad) * Math.sin(declination) + Math.cos(lat * rad) * Math.cos(declination) * Math.cos(hourAngle),
  );
  return altitude / rad;
}

// Transit lines from the map itself, and on the OpenStreetMap map the county's bus routes from
// our server (drawBuses).
export async function showTransit(on) {
  if (!state.view) return;
  state.view.transit(on);
  const buses = state.buses;
  if (!buses.available) return;
  $("legend-buses").hidden = !on;
  if (on && !buses.data) {
    try {
      const response = await fetch("/bus-routes");
      if (!response.ok) throw new Error(`The server answered ${response.status}`);
      const data = await response.json();
      for (const route of data.routes) {
        route.points = route.paths.map(decodePolyline);
        route.dense = route.points.map((path) => densify(path, NEAR_TRIP_M / 2)); // for "near the trip"
      }
      if (data.routes.length) buses.data = data; // none yet (the server still fetching): asked again next time
    } catch (error) {
      console.warn("Bus routes unavailable:", error);
      return;
    }
  }
  // The switch may have changed while the routes were on their way.
  if (buses.data && buses.data.attribution) state.view.credit(buses.data.attribution, $("transit-layer").checked);
  drawBuses();
}

// Each bus route in its own color, beneath the trip's routes; click one for its name. With "Only buses
// near the trip" on and a trip drawn, just the routes that run near the route being followed.
export function drawBuses() {
  const buses = state.buses;
  buses.lines.splice(0).forEach((line) => line.remove());
  if (!buses.data || !$("transit-layer").checked || !state.view) return;
  const followed = state.paths[state.activeRouteId];
  const near = $("buses-near").checked && followed ? nearPath(followed.points, NEAR_TRIP_M) : null;
  for (const route of buses.data.routes) {
    if (near && !route.dense.some((path) => path.some(near))) continue;
    const popup = { heading: `Route ${route.name}`, text: route.long_name };
    for (const path of route.points) {
      buses.lines.push(state.view.line(path, { color: route.color, weight: 3, opacity: 0.75, zIndex: 1, under: true, popup }));
    }
  }
}

// A test for "within about meters of the path", on a grid of cells that size.
function nearPath(points, meters) {
  const latStep = meters / M_PER_DEG_LAT;
  const lngStep = meters / (M_PER_DEG_LAT * Math.cos((points[0].lat * Math.PI) / 180));
  const cell = (p) => [Math.floor(p.lat / latStep), Math.floor(p.lng / lngStep)];
  const cells = new Set();
  for (const p of densify(points, meters / 2)) {
    const [row, col] = cell(p);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) cells.add(`${row + dr},${col + dc}`);
  }
  return (p) => cells.has(cell(p).join(","));
}

// The path's points, plus more so none are further apart than meters.
function densify(points, meters) {
  const dense = points.slice(0, 1);
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const steps = Math.ceil(distanceM(a, b) / meters);
    for (let k = 1; k < steps; k++) dense.push({ lat: a.lat + ((b.lat - a.lat) * k) / steps, lng: a.lng + ((b.lng - a.lng) * k) / steps });
    dense.push(b);
  }
  return dense;
}
