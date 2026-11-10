// "Which route is safer?" (game.html): a sample trip across Milwaukee, two of its routes drawn as A
// and B without their scores, and the visitor picks the safer one. Then both scores show, with what
// each route has, and the guess is counted for the stats screen (right or not; no places).
//
// The two routes: the recommended one and the standard one, when their safety scores differ; else
// the recommended one and the least safe other. Trips whose routes all score the same are skipped.

import { createMapView, decodePolyline } from "./maps.js";
import { $, DEMO, MILWAUKEE, element } from "./core.js";
import { lang, startTranslating, switchLanguage } from "./i18n.js";

const COLORS = { a: "#1a73e8", b: "#9334e6", safer: "#0b7a53", other: "#8a94a3" };
// Well-known places, paired up at random (and DEMO's sample trips).
const PLACES = [
  { label: "Fiserv Forum", lat: 43.0451, lng: -87.9172 },
  { label: "Bay View", lat: 42.9978, lng: -87.8954 },
  { label: "American Family Field", lat: 43.028, lng: -87.9712 },
  { label: "Bayshore", lat: 43.118, lng: -87.91 },
  { label: "Lakefront Brewery", lat: 43.0546, lng: -87.9055 },
  { label: "Mitchell Park Domes", lat: 43.0255, lng: -87.9455 },
  { label: "Harley-Davidson Museum", lat: 43.0317, lng: -87.9165 },
  { label: "Mayfair Mall", lat: 43.0605, lng: -88.048 },
  { label: "State Fair Park", lat: 43.0225, lng: -88.013 },
  { label: "Shorewood", lat: 43.089, lng: -87.887 },
  { label: "Southridge Mall", lat: 42.946, lng: -88.01 },
  { label: "UW-Milwaukee", lat: 43.0766, lng: -87.8814 },
];
const MIN_APART_M = 4000; // shorter trips rarely have two routes that differ

const game = { view: null, lines: [], pair: null, trip: null, played: 0, right: 0, tries: 0 };

start();

async function start() {
  startTranslating();
  $("lang").addEventListener("click", () => switchLanguage(window.location.href));
  $("pick-a").addEventListener("click", () => reveal(0));
  $("pick-b").addEventListener("click", () => reveal(1));
  $("game-next").addEventListener("click", nextRound);
  let kind = "osm";
  try {
    kind = (await (await fetch("/app-config")).json()).map;
  } catch {
    // An older server: the OpenStreetMap map needs nothing more.
  }
  const config = window.ROUTES_CONFIG || {};
  game.view = createMapView(kind, { mapsApiKey: config.mapsApiKey, mapId: config.mapId, language: lang });
  try {
    await game.view.load();
    await game.view.create($("map"), { center: MILWAUKEE, zoom: 11, onClick: () => {}, onDragStart: () => {} });
  } catch (error) {
    $("game-status").textContent = error.message;
    return;
  }
  nextRound();
}

// A trip from the page's link (from=lat,lng&to=lat,lng), or two well-known places far enough apart.
function pickTrip() {
  const params = new URLSearchParams(window.location.search);
  const place = (text) => {
    const [lat, lng] = (text || "").split(",").map(Number);
    return text && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng, label: null } : null;
  };
  const [from, to] = [place(params.get("from")), place(params.get("to"))];
  if (from && to) return { from, to };
  const pool = [...PLACES];
  for (;;) {
    const [a, b] = [pool[Math.floor(Math.random() * pool.length)], pool[Math.floor(Math.random() * pool.length)]];
    if (a.label !== b.label && apartM(a, b) >= MIN_APART_M) return { from: a, to: b };
  }
}

async function nextRound() {
  game.pair = null;
  for (const line of game.lines.splice(0)) line.remove();
  $("game-reveal").hidden = true;
  $("game-next").hidden = true;
  setPicking(false);
  $("game-status").hidden = false;
  $("game-status").textContent = "Finding two routes…";
  game.trip = pickTrip();
  const { from, to } = game.trip;
  $("game-trip").textContent = from.label && to.label ? `${from.label} → ${to.label}` : "";
  let plan;
  try {
    plan = await routes(from, to);
  } catch (error) {
    $("game-status").textContent = error.message;
    $("game-next").hidden = false;
    return;
  }
  const pair = twoRoutes(plan);
  if (!pair) {
    // Every route as safe as the others: nothing to guess. Another trip (from the link: show why).
    if (++game.tries < 4 && !new URLSearchParams(window.location.search).get("from")) return nextRound();
    $("game-status").textContent = "These routes are all equally safe. Try another trip.";
    $("game-next").hidden = false;
    return;
  }
  game.tries = 0;
  game.pair = pair;
  const points = pair.map((route) => decodePolyline(route.encoded_polyline));
  points.forEach((path, i) => {
    const color = i === 0 ? COLORS.a : COLORS.b;
    game.lines.push(game.view.line(path, { color: "#ffffff", weight: 10, zIndex: 10 + i * 2 }));
    game.lines.push(game.view.line(path, { color, weight: 6, zIndex: 11 + i * 2 }));
  });
  game.view.fit(points.flat());
  $("game-status").hidden = true;
  setPicking(true);
}

async function routes(from, to) {
  const headers = { "Content-Type": "application/json" };
  const code = accessCode();
  if (code) headers["X-Access-Code"] = code;
  const body = {
    origin: { lat: from.lat, lng: from.lng },
    destination: { lat: to.lat, lng: to.lng },
    live_traffic: false, // no paid requests for a game
    counted: false, // not a visitor's own trip
  };
  let response;
  try {
    response = await fetch("/route", { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach the routing server.");
  }
  if (!response.ok) throw new Error(response.status === 401 ? "This demo needs its access code: open it from the link or QR code you were given." : `The server answered ${response.status}.`);
  return (await response.json()).plan;
}

// The recommended route and another that scores differently, in random order as A and B.
function twoRoutes(plan) {
  const winner = plan.winner;
  const standard = plan.candidates.find((route) => route.is_standard);
  const others = plan.candidates.filter((route) => route.id !== winner.id && route.safety_score !== winner.safety_score);
  const other = standard && others.includes(standard) ? standard : others.sort((x, y) => x.safety_score - y.safety_score)[0];
  if (!other) return null;
  return Math.random() < 0.5 ? [winner, other] : [other, winner];
}

function reveal(picked) {
  if (!game.pair) return;
  setPicking(false);
  const [a, b] = game.pair;
  const safer = a.safety_score > b.safety_score ? 0 : 1;
  const right = picked === safer;
  game.played += 1;
  game.right += right ? 1 : 0;
  // The safer route turns green, the other gray.
  for (const line of game.lines.splice(0)) line.remove();
  game.pair.forEach((route, i) => {
    const path = decodePolyline(route.encoded_polyline);
    game.lines.push(game.view.line(path, { color: "#ffffff", weight: 10, zIndex: i === safer ? 20 : 10 }));
    game.lines.push(game.view.line(path, { color: i === safer ? COLORS.safer : COLORS.other, weight: 6, zIndex: i === safer ? 21 : 11 }));
  });
  const name = (i) => (i === 0 ? "Route A" : "Route B");
  $("game-reveal").replaceChildren(
    element("p", { className: `game__verdict game__verdict--${right ? "right" : "wrong"}` }, right ? "Right!" : "Not this time.", " ", `${name(safer)} is safer.`),
    compare(a, b),
  );
  $("game-reveal").hidden = false;
  $("game-next").hidden = false;
  $("game-tally").textContent = `You: ${game.right} of ${game.played} right`;
  postGuess({ right, picked_score: game.pair[picked].safety_score, other_score: game.pair[1 - picked].safety_score });
}

// Both routes side by side: the score, then what makes it.
function compare(a, b) {
  const f = (route) => route.features;
  const risky = (route) => f(route).busy_crossing_turns + f(route).hotspot_crossing_turns;
  const rows = [
    ["Safety score", (route) => String(route.safety_score)],
    ["Risky turns", (route) => String(risky(route))],
    ["Railroad crossings", (route) => String(f(route).rail_crossings)],
    ["School zones", (route) => String(f(route).school_zones)],
    ["Closed roads", (route) => String(f(route).closures)],
    ["Lane closures", (route) => String(f(route).lane_closures)],
    ["Time", (route) => `${Math.round(f(route).duration_min)} min`],
  ].filter(([label, value]) => label === "Safety score" || label === "Time" || value(a) !== "0" || value(b) !== "0");
  return element(
    "table",
    { className: "breakdown__table game__table" },
    element("thead", {}, element("tr", {}, element("th", {}, ""), element("th", {}, "Route A"), element("th", {}, "Route B"))),
    element("tbody", {}, ...rows.map(([label, value]) => element("tr", {}, element("th", {}, label), element("td", {}, value(a)), element("td", {}, value(b))))),
  );
}

async function postGuess(guess) {
  const headers = { "Content-Type": "application/json" };
  const code = accessCode();
  if (code) headers["X-Access-Code"] = code;
  try {
    await fetch("/guess", { method: "POST", headers, body: JSON.stringify(guess) });
  } catch (error) {
    console.warn("The guess wasn't counted:", error);
  }
}

function setPicking(on) {
  $("pick-a").disabled = !on;
  $("pick-b").disabled = !on;
}

function apartM(a, b) {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6371000;
}

// A shared demo's access code (see app.js): from the link, or remembered from an earlier visit.
function accessCode() {
  const fromLink = new URLSearchParams(window.location.search).get("code");
  try {
    if (fromLink) localStorage.setItem("routes-access-code", fromLink);
    return fromLink || localStorage.getItem("routes-access-code");
  } catch {
    return fromLink;
  }
}
