// What every part of the page shares: settings, the page's state, and small helpers.

export const MILWAUKEE = { lat: 43.0389, lng: -87.9065 };

export const KM_TO_MI = 0.621371;

export const M_PER_MI = 1609.344;

export const LITERS_PER_GALLON = 3.78541;

export const M_PER_DEG_LAT = 111320;

export const NAV = {
  onRouteM: 40, // within this of a route counts as driving it (GPS error included)
  offRouteFixes: 2, // consecutive fixes off every route before asking for a new one
  rerouteGapMs: 20000, // at most one new route per 20 s: each one costs route data requests
  arrivedM: 40,
  worstAccuracyM: 60, // fixes less precise than this don't judge the route
  headingFromM: 10, // without a GPS heading, the bearing over this distance is the direction of travel
  followZoom: 16,
  announceFarM: 400, // spoken directions: "In a quarter mile, ..." this far before a turn
  announceNearM: 60, // and the turn itself this close
  previewRates: [1, 2, 3, 5, 10], // "Preview the drive" plays the route this many times faster than it would be driven
  previewRate: 3, // until the viewer picks another
  previewTickMs: 500, // how often it updates the directions; the view moves every frame
};

export const COLORS = {
  winner: "#0b7a53",
  standard: "#4a5a6a",
  alternative: "#a9b2bc",
  closed: "#202124",
  lanes: "#e37400",
  slow: "#f2a600",
  jam: "#d93025",
  hazard: "#7b4fd6",
};

export const CO2_KG_PER_GALLON = 8.887; // burning a gallon of gasoline (US EPA)

export const MAX_STOPS = 3;

export const LAYERS_KEY = "routes-layers"; // the map layers chosen, remembered in this browser

export const RECENT_KEY = "routes-recent"; // the last trips planned in this browser

export const MAX_RECENT = 5;

export const NIGHT_SUN_DEG = -6; // the dark map from dusk (the sun this far below the horizon) to dawn

export const NEAR_TRIP_M = 400; // "Only buses near the trip": routes running within this of the route followed

// What each kind of risk is called in the safety score's breakdown, by the server's names.
export const RISK_LABELS = {
  busy_crossings: "Turns across traffic at busy junctions",
  hotspot_crossings: "Turns across traffic where crashes happened",
  closures: "Closed roads",
  lane_closures: "Lane closures",
  school_zones: "School zones",
  rail_crossings: "Railroad crossings",
  weather_hazards: "Weather hazards",
  sun_glare: "Driving into a low sun",
};

// Demo mode: after DEMO.idleMs with no one touching the page, it plans these trips in turn.
export const DEMO = {
  idleMs: 45000,
  showMs: 20000,
  trips: [
    { from: { label: "Fiserv Forum", lat: 43.0451, lng: -87.9172 }, to: { label: "Bay View", lat: 42.9978, lng: -87.8954 } },
    { from: { label: "Milwaukee Public Market", lat: 43.035, lng: -87.9086 }, to: { label: "Wauwatosa Village", lat: 43.0494, lng: -88.0076 } },
    { from: { label: "UW-Milwaukee", lat: 43.0766, lng: -87.8814 }, to: { label: "Mitchell Airport", lat: 42.9476, lng: -87.8966 } },
    { from: { label: "Marquette University", lat: 43.0383, lng: -87.9286 }, to: { label: "Milwaukee County Zoo", lat: 43.032, lng: -88.0405 } },
  ],
};

// Where closures and slowdowns came from, by the server's source names.
export const EVENT_SOURCES = {
  wzdx: "Wisconsin work zones (WZDx)",
  wi511: "Wisconsin 511",
  tomtom: "TomTom traffic",
  google: "traffic speeds along the routes",
  apify: "traffic tiles",
};

export const QR_LIBRARY = "vendor/qrcode-generator/qrcode.js"; // qrcode-generator 1.4.4

export const NARROW = "(max-width: 760px)"; // the phone layout in styles.css

export const PROFILE_LABELS = {
  "safe-economy": "Safe & economical (recommended)",
  fastest: "Fastest",
  "highway-averse": "Avoid highways",
  scenic: "Scenic",
  calm: "Calm: extra wary of risky turns",
  eco: "Eco: least fuel",
  "new-driver": "New driver: avoids freeways and risky turns",
};

export const state = {
  view: null, // the map (see maps.js)
  mapKind: "google", // or "osm": no Google at all; traffic from 511 and TomTom
  mode: "car", // or "bike" or "walk" (bike.js), or "transit" (transit.js): as the server has maps for
  origin: null, // { lat, lng, label, countryCode }
  destination: null,
  pins: { origin: null, destination: null },
  undo: [], // changes made on the map, newest last: { kind, what, undo() }
  baseMap: "roadmap", // the map's look: "roadmap", "satellite" or "terrain"
  dark: false, // the dark map is showing (at night, with Default chosen)
  buses: { available: false, data: null, lines: [] }, // the Transit layer's bus routes (OpenStreetMap map)
  findTicket: 0, // the latest route request: answers to older ones are dropped
  finding: false, // a route request is on its way
  refreshTimer: null, // planning the trip again after a change on the map
  noticeTimer: null, // hides a mapNotice
  stops: [], // places to stop at on the way: { id, point, pin }, in order
  nextStopId: 1,
  fuelPrice: 3.25, // US dollars a gallon (the server's ROUTES_FUEL_PRICE)
  demo: { on: false, running: false, paused: false, index: 0, idleTimer: null, stepTimer: null }, // paused: from the control page
  routeLines: [], // { id, lines: [line handle] }
  turnMarkers: [],
  modeMarks: [], // what a bike, walking or bus trip draws besides its routes (stress, crossings, stops)
  redrawPlan: null, // draws the plan again for a new map look, when results.js's drawRoutes can't (bus trips)
  closures: [], // closures and lane closures from the last trip
  closureLines: [], // ...drawn, when "Show closures" is on
  closureMarkers: null, // their markers, a group that clusters where crowded
  trafficEvents: [], // slow and jammed stretches (511 travel times, TomTom's jams) from the last trip
  trafficShapes: [], // ...drawn, when the Traffic layer is on and the map has no traffic layer of its own
  plan: null, // the last plan from the server
  paths: {}, // route id -> { points: [{ lat, lng }], cumulative: [m], lengthM, minutes, label }
  activeRouteId: null, // the route being followed: the winner, or one the driver picked
  nav: {
    active: false,
    watchId: null,
    car: null, // the location marker
    carArrow: null, // its direction-of-travel arrow
    following: true, // the map moves with the car until the driver drags it
    fix: null, // last position
    anchor: null, // where the current heading was measured from
    heading: null, // degrees clockwise from north, once known
    offRoute: 0,
    rerouting: false,
    lastRerouteAt: 0,
    wakeLock: null,
    spoken: new Set(), // directions already announced, so each is said once (far and near)
    stopsLeft: [], // the trip's stops not reached yet, while driving
    preview: null, // playing the route back instead of following GPS: { path, along, at }
    previewTimer: null,
  },
};

export const $ = (id) => document.getElementById(id);

export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Build a DOM element. Text is always set as text, never parsed as HTML.
export function element(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style") node.style.cssText = value;
    else node[key] = value;
  }
  node.append(...children.filter((child) => child !== null && child !== undefined && child !== ""));
  return node;
}
