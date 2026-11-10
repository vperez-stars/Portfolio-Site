// Changing the trip on the map and in the panel: the start and destination, stops, their pins,
// Swap, and Undo for changes made on the map.

import { distanceM } from "./maps.js";
import { $, MAX_STOPS, element, state } from "./core.js";
import { clearTrip, tripChanged, updateFindButton } from "./app.js";
import { setNavStatus } from "./drive.js";

// fromSearch: picked in the search box, which already shows its name. A map click or a
// location is spelled out under the box instead, and clears the box (on the OpenStreetMap map).
// onMap: a change "Undo" can take back; any other change to the point forgets those.
export async function setPoint(kind, point, { fromSearch = false, onMap = false } = {}) {
  if (window.SAFEMAPS_DEMO) point = window.SAFEMAPS_DEMO.snap(point);
  if (!onMap) forgetUndo(kind);
  state[kind] = point;
  $(`${kind}-picked`).textContent = fromSearch ? "" : placeName(point);
  const box = $(`${kind}-search`).querySelector("input");
  if (box && !fromSearch) box.value = "";
  placePin(kind, point);
  updateFindButton();
  nameIt(point, () => {
    if (state[kind] === point) $(`${kind}-picked`).textContent = point.label;
  });
  tripChanged();
}

// A spot on the map, not yet named.
export function unnamed({ lat, lng }) {
  return { lat, lng, label: null, countryCode: null };
}

function placeName(point) {
  return point.label || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

// A spot picked on the map gets the nearest address, when the lookup answers. show: put it on the page.
async function nameIt(point, show) {
  if (point.label || !state.view) return;
  const place = await state.view.reverse(point);
  if (!place || !place.label || point.label) return;
  point.label = place.label;
  point.countryCode ||= place.countryCode;
  show();
}

// The start or destination taken off the map. Routes drawn to it go too.
export function clearPoint(kind, { onMap = false } = {}) {
  if (!onMap) forgetUndo(kind);
  state[kind] = null;
  if (state.pins[kind]) state.pins[kind].remove();
  state.pins[kind] = null;
  $(`${kind}-picked`).textContent = "";
  const box = $(`${kind}-search`).querySelector("input");
  if (box) box.value = "";
  if (state.plan || state.finding) clearTrip();
  updateFindButton();
}

// Dragging a pin moves it; clicking it removes it. A drag that isn't allowed (while driving) springs back.
export function placePin(kind, point) {
  if (state.pins[kind]) state.pins[kind].remove();
  const pin = element("div", { className: `map-pin map-pin--${kind}` }, element("span", {}, kind === "origin" ? "A" : "B"));
  state.pins[kind] = state.view.marker(point, pin, {
    title: `${kind === "origin" ? "Start" : "Destination"}: drag to move, click to remove`,
    zIndex: PIN_Z,
    onClick: () => mapTouchAllowed() && changeOnMap(kind, null),
    onDragEnd: (to) => (mapTouchAllowed() ? changeOnMap(kind, unnamed(to)) : placePin(kind, state[kind])),
  });
}

// Start and destination trade places, and the stops turn around: the same trip, the other way.
export function swapEnds() {
  if (state.nav.active || !(state.origin || state.destination)) return;
  const { origin, destination } = state;
  for (const [kind, point] of [["origin", destination], ["destination", origin]]) {
    if (point) setPoint(kind, point);
    else clearPoint(kind);
  }
  state.stops.reverse();
  for (const stop of state.stops) $("stops").append(stop.row);
  renumberStops();
}

// Pins sit over the routes' markers (turns, crossings, schools), so they can always be dragged.
const PIN_Z = 40;

// No accidental trip changes while driving, or from the touch that stopped the demo.
export function mapTouchAllowed() {
  return !state.nav.active && Date.now() - (state.demo.stoppedAt || 0) >= 800;
}

// kind: what changed ("origin", "destination" or "stops"); what: the button's tooltip; undo: puts it back.
function remember(kind, what, undo) {
  state.undo.push({ kind, what, undo });
  updateUndoButton();
}

// point: where the start or destination goes, or null to remove it.
export function changeOnMap(kind, point) {
  const before = state[kind];
  const name = kind === "origin" ? "start" : "destination";
  remember(kind, before ? `Put the ${name} back` : `Take the ${name} off the map`, () =>
    before ? setPoint(kind, before, { onMap: true }) : clearPoint(kind, { onMap: true }),
  );
  if (point) setPoint(kind, point, { onMap: true });
  else clearPoint(kind, { onMap: true });
}

export function undoMapChange() {
  if (state.nav.active) return; // kept for after the drive
  const change = state.undo.pop();
  if (change) change.undo();
  updateUndoButton();
}

// A place set some other way (search, location, Clear) can't be undone back to an older click.
function forgetUndo(kind) {
  state.undo = state.undo.filter((change) => change.kind !== kind);
  updateUndoButton();
}

function updateUndoButton() {
  const last = state.undo[state.undo.length - 1];
  $("undo").hidden = !last;
  $("undo").title = last ? last.what : "";
}

// A short note over the map, gone after a few seconds (the driving banner, while not driving).
function mapNotice(text) {
  if (state.nav.active) return;
  setNavStatus(text);
  clearTimeout(state.noticeTimer);
  state.noticeTimer = setTimeout(() => state.nav.active || setNavStatus(null), 3500);
}

// point: a place already picked on the map; index: its place in the order (last by default);
// id: the stop's own, when Undo puts back a removed stop. Returns the stop's id, or null when full.
export async function addStop({ point = null, index = state.stops.length, id = state.nextStopId++ } = {}) {
  if (window.SAFEMAPS_DEMO) return window.SAFEMAPS_DEMO.say("Stops need the live routing server. This demo plans trips straight between its 12 sample places.");
  if (state.stops.length >= MAX_STOPS || !state.view) return null;
  const searchBox = element("div", { id: `stop-${id}-search`, className: "search" });
  const remove = element("button", { className: "link-button link-button--remove", type: "button" }, "Remove");
  const pin = element("span", { className: "pin pin--via" });
  pin.setAttribute("aria-hidden", "true");
  const row = element(
    "div",
    { className: "stop stop--via" },
    pin,
    element(
      "div",
      { className: "stop__body" },
      element("div", { className: "stop__head" }, element("span", { className: "stop__label" }), remove),
      searchBox,
      element("p", { id: `stop-${id}-picked`, className: "picked" }),
    ),
  );
  remove.addEventListener("click", () => removeStop(id));
  const stop = { id, point, pin: null, row };
  const next = state.stops[index];
  $("stops").insertBefore(row, next ? next.row : null);
  state.stops.splice(index, 0, stop);
  renumberStops();
  $("add-stop").hidden = state.stops.length >= MAX_STOPS;
  if (point) {
    showStopName(stop);
    tripChanged();
  }
  await state.view.search(searchBox, "Add a stop", (place) => setStop(id, place));
  const input = searchBox.querySelector("input");
  if (input && !point) input.focus();
  return id;
}

// Picked in the stop's search box, which shows its name.
function setStop(id, place) {
  const stop = state.stops.find((candidate) => candidate.id === id);
  if (!stop) return;
  forgetUndo("stops");
  stop.point = place;
  stop.row.querySelector(".picked").textContent = "";
  renumberStops();
  tripChanged();
}

function moveStop(id, point) {
  const stop = state.stops.find((candidate) => candidate.id === id);
  if (!stop) return;
  stop.point = point;
  const box = stop.row.querySelector("input");
  if (box) box.value = "";
  renumberStops();
  showStopName(stop);
  tripChanged();
}

// onMap: Undo can bring it back (see removeStopOnMap); any other removal forgets those.
export function removeStop(id, { onMap = false } = {}) {
  const index = state.stops.findIndex((stop) => stop.id === id);
  if (index < 0) return;
  if (!onMap) forgetUndo("stops");
  const [stop] = state.stops.splice(index, 1);
  stop.row.remove();
  if (stop.pin) stop.pin.remove();
  renumberStops();
  $("add-stop").hidden = false;
  tripChanged();
}

// A stop placed on the map is spelled out under its box, then named by the nearest address.
function showStopName(stop) {
  const point = stop.point;
  const picked = stop.row.querySelector(".picked");
  picked.textContent = point ? placeName(point) : "";
  if (point) nameIt(point, () => stop.point === point && (picked.textContent = point.label));
}

// A right-click or long press adds a stop where it fits the trip best. Before the trip has
// both ends, it sets them like a click.
export function addStopOnMap(point) {
  if (!mapTouchAllowed()) return;
  if (window.SAFEMAPS_DEMO && state.origin && state.destination) return window.SAFEMAPS_DEMO.say("Stops need the live routing server. This demo plans trips straight between its 12 sample places.");
  if (!state.origin || !state.destination) return changeOnMap(state.origin ? "destination" : "origin", unnamed(point));
  if (state.stops.length >= MAX_STOPS) return mapNotice(`Up to ${MAX_STOPS} stops: remove one to add another.`);
  const id = state.nextStopId++;
  remember("stops", "Take the stop off the map", () => removeStop(id, { onMap: true }));
  addStop({ point: unnamed(point), index: bestStopIndex(point), id });
}

function moveStopOnMap(id, point) {
  const stop = state.stops.find((candidate) => candidate.id === id);
  if (!stop) return;
  const before = stop.point;
  remember("stops", "Put the stop back", () => moveStop(id, before));
  moveStop(id, point);
}

function removeStopOnMap(id) {
  const index = state.stops.findIndex((stop) => stop.id === id);
  if (index < 0) return;
  const { point } = state.stops[index];
  remember("stops", "Put the stop back", () => addStop({ point, index, id }));
  removeStop(id, { onMap: true });
}

// Where a new stop fits: the place in the order that adds the least distance, as the crow flies.
function bestStopIndex(point) {
  const length = (points) => points.reduce((sum, p, i) => (i ? sum + distanceM(points[i - 1], p) : 0), 0);
  let best = state.stops.length;
  let shortest = Infinity;
  for (let i = 0; i <= state.stops.length; i++) {
    const stops = state.stops.map((stop) => stop.point);
    stops.splice(i, 0, point);
    const total = length([state.origin, ...stops, state.destination].filter(Boolean));
    if (total < shortest - 1) [best, shortest] = [i, total];
  }
  return best;
}

// Stops are numbered in order, in the panel and on their map pins, which drag and click like the others.
function renumberStops() {
  state.stops.forEach((stop, i) => {
    const number = String(i + 1);
    stop.row.querySelector(".pin").textContent = number;
    stop.row.querySelector(".stop__label").textContent = `Stop ${number}`;
    if (stop.pin) stop.pin.remove();
    stop.pin = stop.point
      ? state.view.marker(stop.point, element("div", { className: "map-pin map-pin--stop" }, element("span", {}, number)), {
          title: `Stop ${number}: drag to move, click to remove`,
          zIndex: PIN_Z,
          onClick: () => mapTouchAllowed() && removeStopOnMap(stop.id),
          onDragEnd: (to) => (mapTouchAllowed() ? moveStopOnMap(stop.id, unnamed(to)) : renumberStops()),
        })
      : null;
  });
}

export function chosenStops() {
  return state.stops.filter((stop) => stop.point).map((stop) => stop.point);
}
