// Transit mode: bus trips by the schedule (POST /transit-route). Each option walks to a stop, rides,
// maybe transfers, and walks on; the walks are planned like walking routes (busy crossings, streets
// without sidewalks), and waiting at a stop after dark and each transfer count against the safety
// score. The recommended option is the safest of those arriving near the earliest.
//
// On the map, the chosen option's rides are drawn in their routes' colors and its walks dotted; the
// other options are gray. The times are the schedule's, not live.

import { decodePolyline } from "./maps.js";
import { $, KM_TO_MI, capitalize, element, state } from "./core.js";
import { postJson } from "./app.js";
import { stressBar } from "./bike.js";
import { clearRoutes, clockTime, scorePill, scoreRing, selectRoute } from "./results.js";

const WALK_COLOR = "#4a5a6a";
const RISK_LABELS = {
  stress_4_minutes: "Minutes walking on busy streets without a sidewalk",
  stress_3_minutes: "Minutes walking on busy streets with no sidewalk mapped",
  busy_crossings: "Crossing busy roads without a signal",
  crash_spots: "Where pedestrians were killed",
  rail_crossings: "Railroad tracks",
  unlit_minutes: "Minutes walking on unlit stretches, after dark",
  dark_wait_minutes: "Minutes waiting at a stop after dark",
  transfers: "Transfers",
  lane_closures: "Lane closures",
  closures: "Closed roads",
};

const transit = { detail: [] }; // the chosen option's lines and stops

export async function requestTransitTrip(origin, destination) {
  return postJson("/transit-route", {
    origin: { lat: origin.lat, lng: origin.lng },
    destination: { lat: destination.lat, lng: destination.lng },
    departure_offset_min: Number($("leave").value) || 0,
  });
}

export function showTransitTrip(trip, { fit = true } = {}) {
  const { plan } = trip;
  state.plan = plan;
  clearRoutes();
  drawOptions(plan, fit);
  state.redrawPlan = () => {
    const chosen = state.activeRouteId;
    for (const entry of state.routeLines) entry.lines.forEach((line) => line.remove());
    state.routeLines = [];
    drawOptions(plan, false);
    chooseOption(chosen);
  };
  const notes = [
    "Times are from the bus schedule, not live: buses can run late. Be at the stop a minute or two early.",
    ...(trip.after_dark ? ["It's dark: waiting at a stop counts as riskier. Wait where it's lit, and wear something bright."] : []),
  ];
  $("results").replaceChildren(
    ...notes.map((note) => element("div", { className: "alert" }, element("p", {}, note))),
    winnerCard(plan),
    element("section", { id: "transit-steps", className: "steps" }),
    element("h2", { className: "results__heading" }, "All bus options, best first · pick one to see it"),
    optionList(plan),
  );
  const credit = $("osm-credit");
  credit.textContent = trip.attribution.join(" · ");
  credit.hidden = false;
  chooseOption(plan.winner.id);
  $("drive").hidden = true; // no turn-by-turn on the bus
}

// Every option as a gray line under the chosen one; state.paths keeps them for "Only buses near the trip".
function drawOptions(plan, fit) {
  const everywhere = [];
  state.paths = {};
  for (const option of [...plan.candidates].reverse()) {
    const points = decodePolyline(option.encoded_polyline);
    everywhere.push(...points);
    state.paths[option.id] = { points };
    state.routeLines.push({ id: option.id, lines: [state.view.line(points, { color: "#a9b2bc", weight: 5, opacity: 0.8, zIndex: 5 })] });
  }
  if (fit) state.view.fit(everywhere);
}

// Show one option: drawn leg by leg on the map, and step by step under the recommendation.
function chooseOption(id) {
  const option = state.plan.candidates.find((candidate) => candidate.id === id) || state.plan.winner;
  const old = transit.detail.splice(0);
  old.forEach((mark) => mark.remove());
  state.modeMarks = state.modeMarks.filter((mark) => !old.includes(mark));
  for (const leg of option.legs) {
    const points = decodePolyline(leg.encoded_polyline);
    if (leg.kind === "walk") {
      transit.detail.push(state.view.line(points, { color: WALK_COLOR, dashed: true, zIndex: 23 }));
      continue;
    }
    transit.detail.push(state.view.line(points, { color: "#ffffff", weight: 10, zIndex: 20 }));
    transit.detail.push(state.view.line(points, { color: leg.route.color, weight: 6, zIndex: 21 }));
    for (const [stop, verb] of [[leg.board, "Get on"], [leg.alight, "Get off"]]) {
      const dot = element("div", { className: "transit-stop", style: `--stop-color:${leg.route.color}` });
      const text = `${verb} route ${leg.route.name} here at ${clockTime(stop.time)}.`;
      transit.detail.push(state.view.marker(stop, dot, { title: stop.name, zIndex: 31, popup: { heading: stop.name, text } }));
    }
  }
  state.modeMarks.push(...transit.detail); // cleared with the routes
  selectRoute(option.id);
  const steps = $("transit-steps");
  if (steps) {
    steps.replaceChildren(
      element("h2", { className: "results__heading" }, option.id === state.plan.winner.id ? "The recommended trip, step by step" : "This trip, step by step"),
      legList(option),
    );
  }
}

// The routes an option rides, in order: "GRE → 15".
function busChips(option) {
  const rides = option.legs.filter((leg) => leg.kind === "ride");
  const chips = element("span", { className: "bus-chips" });
  rides.forEach((leg, i) => {
    if (i) chips.append(element("span", { className: "bus-chips__then", ariaHidden: "true" }, "→"));
    chips.append(busChip(leg.route));
  });
  return chips;
}

function busChip(route) {
  const light = isLight(route.color);
  return element("span", { className: light ? "bus-chip bus-chip--light" : "bus-chip", style: `background:${route.color}`, title: route.long_name || route.name }, route.name);
}

// Dark text on light route colors (yellow, light green), white on the rest.
function isLight(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}

function winnerCard(plan) {
  const winner = plan.winner;
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
        element("h2", { className: "winner__title" }, busChips(winner)),
        element("p", { className: "winner__kind" }, `Leave ${clockTime(winner.leave_at)} · arrive ${clockTime(winner.arrive_at)}`),
      ),
      scoreRing(winner.safety_score),
    ),
  );
  if (winner.reason) card.append(element("p", { className: "winner__reason" }, capitalize(winner.reason)));
  const walks = winner.legs.filter((leg) => leg.kind === "walk");
  const minutes = [0, 0, 0, 0];
  for (const walk of walks) walk.minutes_by_stress.forEach((value, i) => (minutes[i] += value));
  card.append(
    element(
      "dl",
      { className: "stats" },
      ...[
        ["Time", `${Math.round(winner.duration_min)} min`],
        ["Walking", `${Math.round(winner.walk_min)} min`],
        ["Waiting", `${Math.round(winner.wait_min)} min`],
        ["Transfers", String(winner.transfers)],
        ["Busy crossings", String(winner.busy_crossings)],
      ].map(([label, value]) => element("div", {}, element("dt", {}, label), element("dd", {}, value))),
    ),
    ...(minutes.some((value) => value > 0) ? [stressBar(minutes, "walk")] : []),
    breakdown(winner),
  );
  return card;
}

function legList(option) {
  const list = element("ol", { className: "legs" });
  const last = option.legs.length - 1;
  option.legs.forEach((leg, i) => {
    if (leg.kind === "ride") {
      if (leg.wait_minutes >= 1.5) {
        // (Not the minute at the first stop the walk there leaves for: "Be at the stop a minute or two early.")
        list.append(element("li", { className: "leg" }, element("span", { className: "leg__time" }), element("p", { className: "leg__wait" }, `Wait about ${Math.round(leg.wait_minutes)} min`)));
      }
      list.append(
        element(
          "li",
          { className: "leg leg--ride" },
          element("span", { className: "leg__time" }, clockTime(leg.board.time)),
          element(
            "div",
            { className: "leg__body", style: `border-left-color:${leg.route.color}` },
            element("div", { className: "leg__title" }, busChip(leg.route), " ", leg.headsign ? `Toward ${leg.headsign}` : leg.route.long_name),
            element("div", { className: "leg__detail" }, `Get on at ${leg.board.name}. Ride ${leg.stops} stop${leg.stops === 1 ? "" : "s"} (${Math.round(leg.minutes)} min), get off at ${leg.alight.name} at ${clockTime(leg.alight.time)}.`),
          ),
        ),
      );
      return;
    }
    if (leg.meters < 30) return; // the stop is right there
    const where = i === 0 ? `to ${option.legs[1].board.name}` : i === last ? "to your destination" : `to ${option.legs[i + 1].board.name} to transfer`;
    const crossings = leg.busy_crossings ? ` · ${leg.busy_crossings} busy crossing${leg.busy_crossings === 1 ? "" : "s"}` : "";
    list.append(
      element(
        "li",
        { className: "leg" },
        element("span", { className: "leg__time" }, i === 0 ? clockTime(option.leave_at) : ""),
        element(
          "div",
          { className: "leg__body" },
          element("div", { className: "leg__title" }, `Walk ${where}`),
          element("div", { className: leg.busy_crossings ? "leg__detail risky" : "leg__detail" }, `${Math.round(leg.minutes)} min · ${((leg.meters / 1000) * KM_TO_MI).toFixed(1)} mi${crossings}`),
        ),
      ),
    );
  });
  list.append(element("li", { className: "leg" }, element("span", { className: "leg__time" }, clockTime(option.arrive_at)), element("div", { className: "leg__title" }, "Arrive")));
  return list;
}

function breakdown(option) {
  const risks = option.safety_risks || {};
  const kinds = Object.keys(RISK_LABELS).filter((kind) => risks[kind]);
  if (!kinds.length) return element("p", { className: "breakdown__none" }, "No risks found on this trip: a perfect 100.");
  const points = (value) => (Math.round(value * 10) / 10).toString();
  const row = (label, text, className = "") => element("tr", { className }, element("th", {}, label), element("td", {}, text));
  return element(
    "details",
    { className: "breakdown" },
    element("summary", {}, "What the safety score counts"),
    element(
      "table",
      { className: "breakdown__table" },
      element("thead", {}, row("Risk points", "This trip")),
      element("tbody", {}, ...kinds.map((kind) => row(RISK_LABELS[kind], points(risks[kind])))),
      element(
        "tfoot",
        {},
        row("Total", points(Object.values(risks).reduce((sum, value) => sum + value, 0)), "breakdown__total"),
        row("Safety score", String(option.safety_score)),
      ),
    ),
    element(
      "p",
      { className: "breakdown__note" },
      "The walks count as walking routes do; waiting after dark counts by the minute, and each transfer counts one. The score is 100 with no risks, and halves with every 10 risk points.",
    ),
  );
}

function optionList(plan) {
  return element(
    "ol",
    { className: "routes" },
    ...plan.candidates.map((option) => {
      const item = element(
        "li",
        { className: "route", tabIndex: 0, dataset: { id: option.id } },
        element("span", { className: "swatch", style: `background:${option.legs.find((leg) => leg.kind === "ride").route.color}` }),
        element(
          "div",
          {},
          element("div", { className: "route__name" }, busChips(option), " ", scorePill(option.safety_score)),
          element("div", { className: "route__reason" }, option.reason ? capitalize(option.reason) : ""),
        ),
        element(
          "div",
          { className: "route__numbers" },
          element("div", {}, `${clockTime(option.leave_at)} → ${clockTime(option.arrive_at)}`),
          element("div", {}, `${Math.round(option.duration_min)} min · walk ${Math.round(option.walk_min)} min`),
          element("div", { className: option.busy_crossings ? "risky" : "" }, `${option.busy_crossings} busy crossing${option.busy_crossings === 1 ? "" : "s"}`),
        ),
      );
      item.addEventListener("click", () => chooseOption(option.id));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") chooseOption(option.id);
      });
      return item;
    }),
  );
}
