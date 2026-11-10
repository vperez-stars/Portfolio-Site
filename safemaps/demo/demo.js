// =====================================================================
// SAFE ROUTE PLANNER: STATIC DEMO
//
// Loaded before the page's own scripts on the portfolio copy (GitHub Pages),
// where there is no routing server. It answers the page's server requests
// (/route, /bike-route, /walk-route, /transit-route, /leave-times, ...) with
// answers the real server gave, recorded between 12 sample places in
// Milwaukee (demo/record-trips.mjs). The map, its layers, the drawing, the
// explanations, directions and the 3D drive preview all run as they do live.
//
// So that every trip has a recorded answer, a point set on the map moves to
// the nearest sample place, and place search lists the sample places.
// =====================================================================
(function () {
  "use strict";

  const SCRIPT = document.currentScript ? document.currentScript.src : location.href;
  const DATA = new URL("data/", SCRIPT);
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
  const DEFAULT_PROFILE = "safe-economy";

  // ---------------------------------------------------------------
  // No offline copy here: a service worker left from another visit would serve old files
  // ---------------------------------------------------------------
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then((list) => list.forEach((r) => r.unregister())).catch(() => {});
    }
  } catch (e) { /* nothing to undo */ }

  // ---------------------------------------------------------------
  // Places
  // ---------------------------------------------------------------
  function distanceM(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function nearest(point) {
    let best = 0;
    PLACES.forEach((p, i) => { if (distanceM(point, p) < distanceM(point, PLACES[best])) best = i; });
    return best;
  }
  const indexOf = (point) => {
    if (!point) return -1;
    const i = nearest(point);
    return distanceM(point, PLACES[i]) < 30 ? i : -1;
  };

  // ---------------------------------------------------------------
  // A note at the bottom of the page
  // ---------------------------------------------------------------
  let toastTimer = null;
  function say(text, ms = 6000) {
    let box = document.getElementById("demo-toast");
    if (!box) {
      if (!document.body) return document.addEventListener("DOMContentLoaded", () => say(text, ms), { once: true });
      box = document.createElement("div");
      box.id = "demo-toast";
      box.setAttribute("role", "status");
      document.body.append(box);
    }
    box.textContent = text;
    box.classList.add("demo-toast--on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove("demo-toast--on"), ms);
  }

  // A point set on the map, by search or by location, moves to the nearest sample place
  function snap(point) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return point;
    const i = nearest(point);
    const place = PLACES[i];
    const moved = distanceM(point, place);
    if (moved > 30) {
      const miles = moved / 1609.344;
      say(`This demo has routes recorded between 12 sample places, so that point moved to the nearest one: ${place.label}` +
        (miles >= 0.5 ? ` (${miles.toFixed(1)} miles away).` : "."));
    }
    return { lat: place.lat, lng: place.lng, label: place.label, countryCode: "US" };
  }

  // ---------------------------------------------------------------
  // The recorded answers: one gzipped file per ordered pair of places
  // ---------------------------------------------------------------
  const realFetch = window.fetch.bind(window);
  async function readMaybeGzip(url) {
    const response = await realFetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Some hosts send .gz files already unpacked (Content-Encoding: gzip); others as they are
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      if (typeof DecompressionStream === "undefined") throw new Error("This browser is too old to read the demo's recorded routes.");
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(stream).text());
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const bundles = new Map();
  function bundle(i, j) {
    const key = `${i}-${j}`;
    if (!bundles.has(key)) {
      const loading = readMaybeGzip(new URL(`trips/${key}.json.gz`, DATA));
      loading.catch(() => bundles.delete(key));
      bundles.set(key, loading);
    }
    return bundles.get(key);
  }
  let profilesFile = null, busFile = null;

  // ---------------------------------------------------------------
  // Answers
  // ---------------------------------------------------------------
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const problem = (detail, status = 422) => json({ detail }, status);
  const pad = (n) => String(n).padStart(2, "0");
  const localIso = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  // "Leaving at" is now (plus the chosen wait), not when the answer was recorded
  function leavingNow(body, offset) {
    const out = copy(body);
    if (out && out.leaving_at) out.leaving_at = localIso(Date.now() + (offset || 0) * 60000);
    return out;
  }
  const answer = (recorded, offset) => (recorded.status === 200 ? json(leavingNow(recorded.body, offset)) : json(recorded.body, recorded.status));

  // Which recorded trip a request asks for, or why there isn't one
  function tripOf(body) {
    if (body.heading != null) {
      return { why: "Following your location and finding a new route on the way needs the live routing server. In this demo, try Preview the drive." };
    }
    if (body.stops && body.stops.length) return { why: "Stops need the live routing server. This demo plans trips straight between its 12 sample places." };
    const i = indexOf(body.origin), j = indexOf(body.destination);
    if (i < 0 || j < 0) return { why: "This demo has routes recorded between 12 sample places in Milwaukee. Pick them in the search boxes or click near one." };
    if (i === j) return { why: "The start and destination are the same place. Pick two different places." };
    return { i, j };
  }

  async function route(path, body) {
    const trip = tripOf(body);
    if (trip.why) return problem(trip.why);
    const b = await bundle(trip.i, trip.j);
    const offset = Number(body.departure_offset_min) || 0;
    if (path === "/route") {
      const profile = body.profile || DEFAULT_PROFILE;
      // The default profile has every wait and detour limit recorded; the others, leaving now
      if (profile === DEFAULT_PROFILE && body.max_extra_min != null && b.carExtra[body.max_extra_min]) return answer(b.carExtra[body.max_extra_min], offset);
      if (profile === DEFAULT_PROFILE && offset && b.carLeave[offset]) return answer(b.carLeave[offset], offset);
      if (!b.car[profile]) return problem(`The ${profile} profile isn't recorded in this demo.`);
      return answer(b.car[profile], offset);
    }
    if (path === "/leave-times") {
      if ((body.profile || DEFAULT_PROFILE) !== DEFAULT_PROFILE) {
        return problem("In this demo, the best time to leave is recorded for the recommended profile (Safe & economical). Switch to it to compare.");
      }
      const out = copy(b.leaveTimes);
      if (out.status === 200 && out.body && Array.isArray(out.body.times)) {
        for (const t of out.body.times) t.leaving_at = localIso(Date.now() + (t.offset_min || 0) * 60000);
      }
      return json(out.body, out.status);
    }
    if (path === "/bike-route" || path === "/walk-route") {
      const list = path === "/bike-route" ? b.bike : b.walk;
      const recorded = list[body.profile || "everyday"];
      if (!recorded) return problem("That profile isn't recorded in this demo.");
      return answer(recorded, offset);
    }
    if (path === "/transit-route") {
      if (b.transit.status === 200) {
        const when = new Date(b.recordedAt);
        say(`Bus times come from the schedule at the moment this demo was recorded (${when.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}).`, 8000);
      }
      return json(b.transit.body, b.transit.status);
    }
    return problem("Not in this demo.", 404);
  }

  // Stop signs and lights along a route (the 3D drive preview), looked up by the route's line
  async function roadControls(body) {
    const line = String(body.encoded_polyline || "");
    let key = null;
    try {
      const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(line));
      key = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 16);
    } catch (e) { /* no hashing here: none found */ }
    for (const loading of bundles.values()) {
      const b = await loading.catch(() => null);
      if (b && key && b.controls[key]) return json(b.controls[key]);
    }
    return json({ controls: [], roads: [] });
  }

  // Place search (Photon) and naming a point: the sample places
  function photonFeature(p) {
    return { type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: { name: p.label, city: "Milwaukee", state: "Wisconsin", countrycode: "us" } };
  }
  function placeSearch(url) {
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    let found = PLACES.filter((p) => p.label.toLowerCase().includes(q) || q.split(/\s+/).some((w) => w.length > 2 && p.label.toLowerCase().includes(w)));
    if (!found.length) found = PLACES; // nothing by that name: show what there is
    return json({ type: "FeatureCollection", features: found.map(photonFeature) });
  }
  function placeName(url) {
    const lat = Number(url.searchParams.get("lat")), lng = Number(url.searchParams.get("lon"));
    const p = PLACES[nearest({ lat, lng })];
    if (url.hostname.includes("nominatim")) return json({ name: p.label, address: { city: "Milwaukee", state: "Wisconsin", country_code: "us" } });
    return json({ type: "FeatureCollection", features: [photonFeature(p)] });
  }

  const ENDPOINTS = new Set(["app-config", "profiles", "bus-routes", "route", "leave-times", "bike-route", "walk-route", "transit-route",
    "road-controls", "bike-stress", "feedback", "guess", "expo-control", "expo-stats", "feedback-summary", "health"]);

  async function serve(url, method, body) {
    const name = url.pathname.split("/").pop();
    switch (name) {
      case "app-config":
        return json({ map: "osm", traffic_tiles: false, bus_routes: true, bike: true, walk: true, transit: true, fuel_price: 3.25 });
      case "profiles":
        profilesFile ||= readMaybeGzip(new URL("profiles.json", DATA));
        return json(await profilesFile);
      case "bus-routes":
        busFile ||= readMaybeGzip(new URL("bus-routes.json.gz", DATA));
        return json(await busFile);
      case "route": case "leave-times": case "bike-route": case "walk-route": case "transit-route":
        return route(`/${name}`, body || {});
      case "road-controls":
        return roadControls(body || {});
      case "bike-stress":
        return json({ lines: { 1: [], 2: [], 3: [], 4: [] }, complete: true });
      case "feedback": case "guess":
        return new Response(null, { status: 204 });
      case "expo-control":
        return json({ paused: false });
      case "health":
        return json({ status: "ok", demo: true });
      default:
        return problem("Visitor statistics are kept by the live server, so they aren't in this demo.", 404);
    }
  }

  window.fetch = async function (input, init) {
    const options = init || {};
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, location.href);
    if (url.hostname === "photon.komoot.io" && url.pathname.startsWith("/api")) return placeSearch(url);
    if ((url.hostname === "photon.komoot.io" && url.pathname.startsWith("/reverse")) || url.hostname === "nominatim.openstreetmap.org") return placeName(url);
    const name = url.pathname.split("/").pop();
    if (url.origin !== location.origin || !ENDPOINTS.has(name)) return realFetch(input, init);
    const method = (options.method || "GET").toUpperCase();
    let body = null;
    if (typeof options.body === "string") { try { body = JSON.parse(options.body); } catch (e) { body = null; } }
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 250)); // a server takes a moment
    try {
      return await serve(url, method, body);
    } catch (error) {
      console.error("Demo answer failed:", error);
      return problem(`The demo couldn't load that recorded answer (${error.message}). Check the connection and try again.`, 503);
    }
  };

  window.SAFEMAPS_DEMO = { places: PLACES, snap, say };
})();
