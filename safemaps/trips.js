// Whole trips: in a link (for phones), and the recent ones planned in this browser.

import { $, MAX_RECENT, MAX_STOPS, RECENT_KEY, element, state } from "./core.js";
import { accessCode, clearTrip, findRoute } from "./app.js";
import { addStop, chosenStops, removeStop, setPoint } from "./editing.js";
import { setMode } from "./bike.js";

function recentTrips() {
  try {
    const trips = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(trips) ? trips.filter((trip) => trip && trip.from && trip.to) : [];
  } catch {
    return [];
  }
}

export function rememberTrip() {
  if ($("demo-mode").checked || state.demo.running || !state.origin || !state.destination) return;
  const keep = ({ lat, lng, label }) => ({ lat, lng, label: /^(My|Current) location$/.test(label || "") ? null : label });
  const trip = { from: keep(state.origin), to: keep(state.destination), stops: chosenStops().map(keep), mode: state.mode };
  const key = (t) => JSON.stringify([t.from, t.to, t.stops].flat().map((p) => [p.lat.toFixed(4), p.lng.toFixed(4)]));
  const trips = [trip, ...recentTrips().filter((other) => key(other) !== key(trip))].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(trips));
  } catch {
    return;
  }
  showRecentTrips();
}

export function forgetRecentTrips() {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // Nothing kept to forget.
  }
  showRecentTrips();
}

export function showRecentTrips() {
  const trips = $("demo-mode").checked ? [] : recentTrips();
  $("recent").hidden = trips.length === 0;
  const name = (point) => (point.label ? point.label.split(",")[0] : `${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}`);
  $("recent-list").replaceChildren(
    ...trips.map((trip) => {
      const stops = trip.stops && trip.stops.length ? ` · ${trip.stops.length} stop${trip.stops.length === 1 ? "" : "s"}` : "";
      const button = element("button", { className: "recent__trip", type: "button" }, `${name(trip.from)} → ${name(trip.to)}${stops}`);
      button.addEventListener("click", () => loadTrip(trip));
      return element("li", {}, button);
    }),
  );
}

// This page's address with the access code and the trip on the map: start, destination and stops.
// Names come along, except "My location", which is somewhere else on the phone.
export function tripLink() {
  const params = new URLSearchParams();
  const code = accessCode();
  if (code) params.set("code", code);
  const where = (point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
  for (const [key, point] of [["from", state.origin], ["to", state.destination]]) {
    if (!point) continue;
    params.set(key, where(point));
    if (point.label && !/^(My|Current) location$/.test(point.label)) params.set(`${key}Name`, point.label.slice(0, 80));
  }
  for (const stop of chosenStops()) params.append("stop", where(stop));
  if (state.mode !== "car") params.set("mode", state.mode);
  const query = params.toString();
  return `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ""}`;
}

// A trip in the page's address (tripLink, from "Open on your phone"): placed on the map and planned.
export function openTripFromLink() {
  const params = new URLSearchParams(window.location.search);
  const place = (text, label = null) => {
    const [lat, lng] = (text || "").split(",").map(Number);
    return text && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng, label, countryCode: null } : null;
  };
  const from = place(params.get("from"), params.get("fromName"));
  const to = place(params.get("to"), params.get("toName"));
  if (from && to) loadTrip({ from, to, stops: params.getAll("stop").map((text) => place(text)).filter(Boolean) });
}

// A whole trip in place of the one on the map, planned at once.
function loadTrip({ from, to, stops = [], mode = null }) {
  if (mode) setMode(mode);
  if (state.nav.active) return;
  const copy = ({ lat, lng, label = null }) => ({ lat, lng, label, countryCode: null });
  clearTrip();
  for (const stop of [...state.stops]) removeStop(stop.id);
  setPoint("origin", copy(from));
  setPoint("destination", copy(to));
  for (const stop of stops.slice(0, MAX_STOPS)) addStop({ point: copy(stop) });
  findRoute();
}
