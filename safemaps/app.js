// The web map for the routing engine: pick a trip, draw the ranked routes, explain the choice.
//
// All routing, scoring and traffic lookups happen in the backend (POST /route).
// This page only collects the trip, draws what comes back and explains the
// ranking. The map itself is Google's or OpenStreetMap's, as the server says
// (ROUTES_MAP); maps.js hides which.
//
// While driving, the page follows the device's location: it tracks progress
// along the chosen route, switches to another drawn route if the driver takes
// it, and asks the server for a new route (starting the way the car is going)
// after leaving them all.
//
// Nothing on the page names the map provider; Google's logo and terms on its
// map, and the credits on either map, are required and stay.
//
// This file starts the page, wires its controls and asks the server for routes.
// The rest: core.js (settings, state, helpers), editing.js (the trip on the map,
// stops, Undo), results.js (routes drawn and explained), drive.js (following the
// drive), layers.js (the map's look, buses), trips.js (links, recent trips) and
// expo.js (demo mode, "How it works", the phone link).

import { createMapView } from "./maps.js";
import { $, MILWAUKEE, NARROW, PROFILE_LABELS, element, state } from "./core.js";
import { addStop, addStopOnMap, changeOnMap, chosenStops, clearPoint, mapTouchAllowed, removeStop, setPoint, swapEnds, undoMapChange, unnamed } from "./editing.js";
import { clearRoutes, drawClosures, drawTraffic, showTrip } from "./results.js";
import { keepScreenOn, recenter, setNavStatus, setPreviewRate, startDriving, startPreview, stopDriving, useMyLocation } from "./drive.js";
import { applyBaseMap, drawBuses, isNight, rememberLayers, restoreLayers, savedLayers, showTransit } from "./layers.js";
import { forgetRecentTrips, openTripFromLink, rememberTrip, showRecentTrips, tripLink } from "./trips.js";
import { setUpDemo, showAbout, showPhoneLink } from "./expo.js";
import { lang, startTranslating, switchLanguage } from "./i18n.js";
import { isActiveMode, requestActiveTrip, setUpModes, showActiveTrip } from "./bike.js";
import { requestTransitTrip, showTransitTrip } from "./transit.js";

boot();

async function boot() {
  startTranslating(); // in Spanish, everything on the page from here on
  loadProfiles();
  wireControls();
  // Keeps the page and the map images seen for when the network drops (sw.js). Browsers allow it
  // on https and on this computer's own address.

  let trafficTiles = false;
  try {
    const appConfig = await (await fetch("/app-config")).json();
    state.mapKind = appConfig.map;
    trafficTiles = Boolean(appConfig.traffic_tiles);
    state.buses.available = Boolean(appConfig.bus_routes);
    state.modesAvailable = { bike: Boolean(appConfig.bike), walk: Boolean(appConfig.walk), transit: Boolean(appConfig.transit) };
    if (Number.isFinite(appConfig.fuel_price)) state.fuelPrice = appConfig.fuel_price;
  } catch {
    state.mapKind = "google"; // an older server: it only knew Google's map
  }
  document.body.classList.toggle("map-osm", state.mapKind === "osm"); // shows the .osm-only credits
  const config = window.ROUTES_CONFIG || {};
  if (state.mapKind === "google" && (window.ROUTES_CONFIG_MISSING || !config.mapsApiKey)) {
    showSetup();
    return;
  }
  if (state.mapKind === "osm") useOsmControls();
  else $("road-events").querySelector('option[value="tomtom"]').remove(); // TomTom's traffic is for the other map
  // Each plan on Google's map is a paid request: there, routes are planned again only when asked.
  $("auto-replan").checked = state.mapKind === "osm";
  state.view = createMapView(state.mapKind, {
    mapsApiKey: config.mapsApiKey,
    language: lang,
    mapId: config.mapId,
    trafficTiles: trafficTiles ? trafficTileUrl() : null,
    onAuthFailure: () =>
      showSetup("The map key was rejected. Check which websites it allows and that the map service is enabled for it."),
  });
  try {
    await state.view.load();
  } catch (error) {
    showSetup(error.message);
    return;
  }
  await initMap();
  setUpModes(state.modesAvailable || {});
  restoreLayers();
  setInterval(applyBaseMap, 5 * 60 * 1000); // dusk and dawn come while the page is open
  setUpDemo();
  showRecentTrips();
  openTripFromLink();
}

// The OpenStreetMap map has no Google behind it: no Google live traffic or traffic
// layer, and no closure sources that come from Google.
function useOsmControls() {
  $("live-traffic").checked = false;
  $("live-traffic").closest("label").hidden = true;
  // The Traffic layer shows TomTom's traffic map, or without it draws the measured slowdowns.
  $("traffic-layer").checked = false;
  for (const source of ["google", "apify"]) $("road-events").querySelector(`option[value="${source}"]`).remove();
}

// TomTom's traffic map comes through our server, which holds the key. A map layer
// can't send headers, so a shared demo's access code rides in the address.
function trafficTileUrl() {
  const code = accessCode();
  return `/traffic-tiles/{z}/{x}/{y}.png${code ? `?code=${encodeURIComponent(code)}` : ""}`;
}

async function initMap() {
  // Google's map can only be dark from the start, so the night map is decided before it's made.
  const saved = savedLayers();
  state.dark = (!saved || saved["dark-at-night"] !== false) && (!saved || !saved.base || saved.base === "roadmap") && isNight();
  await state.view.create($("map"), {
    center: MILWAUKEE,
    zoom: 11,
    dark: state.dark,
    onClick: (point) => {
      if (!mapTouchAllowed()) return;
      // First click sets the start; after that, clicks move the destination.
      const kind = state.origin ? "destination" : "origin";
      changeOnMap(kind, unnamed(point));
    },
    onContextMenu: addStopOnMap,
    onDragStart: () => {
      if (!state.nav.active) return;
      state.nav.following = false; // the driver is looking around; "Re-center" resumes
      $("recenter").hidden = false;
    },
  });
  await Promise.all(
    ["origin", "destination"].map((kind) =>
      state.view.search($(`${kind}-search`), kind === "origin" ? "Where from?" : "Where to?", (place) =>
        setPoint(kind, place, { fromSearch: true }),
      ),
    ),
  );
  state.closureMarkers = state.view.markerGroup();
}

// ---- Undo: changes made on the map (clicks, drags, pins added or removed), taken back newest first

function wireControls() {
  $("find").addEventListener("click", () => findRoute());
  $("swap").addEventListener("click", swapEnds);
  // The other language: the page opens again with the trip on it (tripLink).
  $("lang").addEventListener("click", () => switchLanguage(tripLink()));
  $("clear").addEventListener("click", clearAll);
  $("locate").addEventListener("click", useMyLocation);
  $("drive").addEventListener("click", () => (state.nav.active ? stopDriving() : startDriving()));
  $("preview").addEventListener("click", startPreview);
  $("drive-preview").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button) setPreviewRate(Number(button.dataset.rate));
  });
  $("recenter").addEventListener("click", recenter);
  $("undo").addEventListener("click", undoMapChange);
  $("map").addEventListener("keydown", placeByKeyboard);
  // The cross in the middle of the map is for keyboard users: the last kind of input decides.
  document.addEventListener("keydown", () => (document.body.dataset.input = "keys"), true);
  document.addEventListener("pointerdown", () => (document.body.dataset.input = "pointer"), true);
  $("traffic-layer").addEventListener("change", (event) => {
    if (state.view && state.view.hasTraffic) state.view.traffic(event.target.checked);
    else drawTraffic(); // no traffic layer: the measured slowdowns from the last trip
    $("legend-traffic").hidden = !event.target.checked;
  });
  for (const radio of document.querySelectorAll('input[name="base-map"]')) {
    radio.addEventListener("change", () => {
      state.baseMap = radio.value;
      applyBaseMap({ always: true });
    });
  }
  $("dark-at-night").addEventListener("change", () => applyBaseMap());
  $("transit-layer").addEventListener("change", (event) => showTransit(event.target.checked));
  $("buses-near").addEventListener("change", drawBuses);
  $("recent-clear").addEventListener("click", forgetRecentTrips);
  $("demo-mode").addEventListener("change", showRecentTrips);
  // Ctrl+Z (⌘Z on a Mac) takes back the last change on the map, except while typing in a box.
  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "z") return;
    if (!state.undo.length || event.target.closest("input, textarea, select, [contenteditable], gmp-place-autocomplete")) return;
    event.preventDefault();
    undoMapChange();
  });
  $("biking-layer").addEventListener("change", (event) => state.view && state.view.biking(event.target.checked));
  for (const input of document.querySelectorAll("#layers input")) input.addEventListener("change", rememberLayers);
  $("closures-layer").addEventListener("change", drawClosures);
  $("about-open").addEventListener("click", showAbout);
  $("phone-open").addEventListener("click", showPhoneLink);
  $("add-stop").addEventListener("click", () => addStop());
  // The map key starts folded on a phone, where it would cover much of the map.
  if (window.matchMedia(NARROW).matches) $("legend").open = false;
  // A screen wake lock is dropped whenever the page is hidden; take it again on return.
  document.addEventListener("visibilitychange", () => {
    if (state.nav.active && document.visibilityState === "visible") keepScreenOn();
  });
}

// From the keyboard, points go where the cross in the middle of the map is: Enter for the start,
// then the destination, S for a stop. The map's own keys move it (arrows) and zoom it (+ and -).
// Pins are reached with Tab, and Enter on one removes it.
function placeByKeyboard(event) {
  const key = event.key.toLowerCase();
  if ((key !== "enter" && key !== "s") || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest(".leaflet-marker-icon, gmp-advanced-marker, .leaflet-popup, .gm-style-iw-c, input, button, a")) return;
  if (!state.view || !mapTouchAllowed()) return;
  event.preventDefault();
  const point = state.view.center();
  const before = { origin: state.origin, destination: state.destination, stops: state.stops.length };
  if (key === "s") addStopOnMap(point);
  else changeOnMap(state.origin ? "destination" : "origin", unnamed(point));
  const said =
    state.stops.length > before.stops
      ? `Stop ${state.stops.length} added.`
      : state.destination !== before.destination
        ? "Destination set."
        : state.origin !== before.origin
          ? "Start set."
          : "";
  $("map-status").textContent = said;
}

async function loadProfiles() {
  const select = $("profile");
  try {
    const response = await fetch("/profiles");
    const { default: chosen, profiles } = await response.json();
    for (const profile of profiles) {
      const option = element("option", { value: profile.name }, PROFILE_LABELS[profile.name] || profile.name);
      option.selected = profile.name === chosen;
      select.append(option);
    }
  } catch {
    select.append(element("option", { value: "safe-economy" }, PROFILE_LABELS["safe-economy"]));
  }
}

export function updateFindButton() {
  $("find").disabled = !(state.origin && state.destination);
}

function clearAll() {
  if (state.nav.active) stopDriving();
  for (const kind of ["origin", "destination"]) clearPoint(kind);
  for (const stop of [...state.stops]) removeStop(stop.id);
  clearTrip();
}

// The drawn routes and their results, keeping the trip's places. A route request on its way is dropped.
export function clearTrip() {
  state.findTicket += 1;
  clearTimeout(state.refreshTimer);
  setFinding(false);
  clearRoutes();
  drawBuses(); // all of them again, with no trip to be near
  state.trafficEvents = [];
  drawTraffic();
  state.plan = null;
  $("osm-credit").hidden = true;
  $("results").replaceChildren();
  $("drive").hidden = true;
  setNavStatus(null);
  updateFindButton();
}

// ---- Asking the backend

// fit: zoom the map to the routes. A trip planned again after a change on the map keeps the view,
// and isn't added to the recent trips (asked for ones are).
export async function findRoute({ fit = true, again = false } = {}) {
  if (!state.origin || !state.destination) return;
  const ticket = ++state.findTicket;
  setFinding(true);
  const mode = state.mode;
  showStatus(mode === "transit" ? "Checking the bus schedule…" : mode === "car" ? "Comparing routes for safety, fuel and time…" : "Comparing routes for safety and time…");
  try {
    let trip;
    if (mode === "transit") trip = await requestTransitTrip(state.origin, state.destination);
    else if (isActiveMode(mode)) trip = await requestActiveTrip(state.origin, state.destination);
    else trip = await requestTrip(state.origin, state.destination, { counted: !again });
    if (ticket !== state.findTicket || mode !== state.mode) return;
    if (mode === "transit") showTransitTrip(trip, { fit });
    else if (isActiveMode(mode)) showActiveTrip(trip, { fit });
    else showTrip(trip, { fit });
    if (!again) rememberTrip();
  } catch (error) {
    if (ticket === state.findTicket) showStatus(error.message, true);
  } finally {
    if (ticket === state.findTicket) setFinding(false);
  }
}

function setFinding(on) {
  state.finding = on;
  const button = $("find");
  button.classList.toggle("is-busy", on);
  button.textContent = on ? "Finding…" : "Find route";
  if (on) button.disabled = true;
  else updateFindButton();
}

// After the trip changes with its routes on the map, or on their way, plan it again: once, for a
// burst of changes. With "Plan again after each change" off, a note says the routes are out of date.
export function tripChanged() {
  clearTimeout(state.refreshTimer);
  if (!(state.plan || state.finding) || state.nav.active || state.demo.running) return;
  if (state.finding) {
    state.findTicket += 1; // the answer on its way is for the trip before this change
    setFinding(false);
    if (!state.plan) $("results").replaceChildren();
  }
  if (!$("auto-replan").checked) {
    if (!$("stale-note")) {
      $("results").prepend(
        element("p", { id: "stale-note", className: "status status--stale" }, "The trip changed since these routes. Find route plans it again."),
      );
    }
    return;
  }
  state.refreshTimer = setTimeout(() => findRoute({ fit: false, again: true }), 400);
}

// The trip as the server takes it. heading: the direction a moving car is driving, so new
// routes start that way. stops: places still to stop at (the chosen ones by default).
// demo: a sample trip, planned without live traffic so it costs no paid requests. counted: a
// visitor's trip for the expo's stats; sample trips and plans made again aren't.
export function tripPayload(origin, destination, { heading = null, stops = chosenStops(), demo = false, counted = !demo } = {}) {
  const payload = {
    origin: { lat: origin.lat, lng: origin.lng },
    destination: { lat: destination.lat, lng: destination.lng },
    stops: stops.map((point) => ({ lat: point.lat, lng: point.lng })),
    profile: $("profile").value,
    country_code: origin.countryCode || destination.countryCode || null,
    live_traffic: $("live-traffic").checked && !demo,
    use_router: $("use-router").checked,
    road_events: $("road-events").value,
    departure_offset_min: Number($("leave").value) || 0,
    counted,
  };
  if ($("extra-time").value) payload.max_extra_min = Number($("extra-time").value);
  if (heading !== null) payload.heading = Math.round(heading * 10) / 10;
  return payload;
}

export async function requestTrip(origin, destination, options = {}) {
  return postJson("/route", tripPayload(origin, destination, options));
}

export async function postJson(path, payload) {
  const headers = { "Content-Type": "application/json" };
  const code = accessCode();
  if (code) headers["X-Access-Code"] = code;
  let response;
  try {
    response = await fetch(path, { method: "POST", headers, body: JSON.stringify(payload) });
  } catch {
    throw new Error("Can't reach the routing server. Open this page from it, e.g. http://127.0.0.1:3143");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(response.status, body, path));
  return body;
}

// A shared demo (see EXPO.md) may need an access code. It comes in the link (?code=...)
// and is remembered in this browser, so the QR code only has to be scanned once.
export function accessCode() {
  const fromLink = new URLSearchParams(window.location.search).get("code");
  try {
    if (fromLink) localStorage.setItem("routes-access-code", fromLink);
    return fromLink || localStorage.getItem("routes-access-code");
  } catch {
    return fromLink; // storage blocked: the link's code still works for this visit
  }
}

// The server's own error details name its data sources, so only bad-input (422) details are shown as-is.
const ERROR_MESSAGES = {
  401: "This demo needs its access code: open it from the link or QR code you were given.",
  404: "No drivable route was found between these points.",
  429: "Today's live traffic limit is used up. Turn off Live traffic to keep planning, or try again tomorrow.",
  502: "The live traffic service didn't answer. Try again, or turn off Live traffic.",
  503: "The server is in offline replay mode and has no saved traffic data for this trip.",
};

// ...and for the other modes, where they differ.
const MODE_ERROR_MESSAGES = {
  "/bike-route": { 404: "No bike route was found between these points.", 503: "The server has no bike map." },
  "/walk-route": { 404: "No walking route was found between these points.", 503: "The server has no walking map." },
  "/transit-route": {
    404: "No bus gets there from here at this time. Try another time, or walking or biking.",
    503: "The bus schedule isn't ready: it loads when the server starts. Try again in a minute.",
  },
};

function errorMessage(status, body, path = "") {
  const detail = body && body.detail;
  if (status === 422 && Array.isArray(detail)) return detail.map((item) => item.msg).join("; ");
  if (status === 422 && detail) return detail;
  return (MODE_ERROR_MESSAGES[path] || {})[status] || ERROR_MESSAGES[status] || `The server answered ${status}.`;
}

// Rewrite the server's notes (written for developers) into what a driver needs to know.
const NOTE_MESSAGES = [
  [/not priced/, "Some of our designs couldn't be checked against live traffic, so they're left out."],
  [/Own router skipped/, "This trip is outside the area our router covers, so only standard routes are shown."],
  [/Own router unavailable/, "Our router isn't available right now, so only standard routes are shown."],
  [/suggestions skipped/, "Standard routes weren't available for this trip, so only our designs are shown."],
];

export function driverNotes(notes) {
  if (notes.length) console.info("Server notes:", notes);
  const messages = new Set();
  for (const note of notes) {
    const match = NOTE_MESSAGES.find(([pattern]) => pattern.test(note));
    if (match) messages.add(match[1]); // other notes (re-pinned, duplicate designs) are only for developers
  }
  return [...messages];
}

// ---- Small helpers

export function showStatus(message, isError = false) {
  $("results").replaceChildren(element("p", { className: `status${isError ? " status--error" : ""}` }, message));
}

function showSetup(problem) {
  const setup = $("setup");
  setup.hidden = false;
  setup.replaceChildren(
    element(
      "div",
      { className: "setup__card" },
      element("h2", {}, "The map needs a key"),
      ...(problem ? [element("p", { className: "status status--error" }, problem)] : []),
      element(
        "ol",
        {},
        element("li", {}, "Copy frontend/config.example.js to frontend/config.js and paste the map key in."),
        element("li", {}, "Allow the key on http://localhost:3143/* and http://127.0.0.1:3143/*."),
        element("li", {}, "Reload this page."),
      ),
      element("p", {}, "Full setup steps are in the README, under “The browser key for the map”."),
      element("p", {}, "The routing server works without it: try it at /docs."),
    ),
  );
}
