// Drawing and explaining the result: routes, closures, risky turns, the recommendation and its
// safety score, every route, and the visitor's answers and the best time to leave.

import { decodePolyline, distanceM } from "./maps.js";
import { $, CO2_KG_PER_GALLON, COLORS, EVENT_SOURCES, KM_TO_MI, LITERS_PER_GALLON, RISK_LABELS, capitalize, element, state } from "./core.js";
import { driverNotes, findRoute, postJson, tripPayload } from "./app.js";
import { nearestOnPath } from "./drive.js";
import { drawBuses } from "./layers.js";
import { locale } from "./i18n.js";

// fit: zoom the map to the routes. Off while driving, so the map stays on the car.
export function showTrip(trip, { fit = true } = {}) {
  const { plan } = trip;
  state.plan = plan;
  clearRoutes();
  drawRoutes(plan, fit);
  drawRiskyTurns(plan);
  drawCrossingsAndSchools(plan);
  state.closures = trip.road_events.filter((event) => !isTraffic(event));
  drawClosures();
  state.trafficEvents = trip.road_events.filter(isTraffic);
  drawTraffic();

  const credit = $("osm-credit");
  credit.textContent = trip.attribution.join(" · ");
  credit.hidden = trip.attribution.length === 0;

  const standard = plan.candidates.find(isStandard);
  const notes = driverNotes(trip.notes);
  const usage = trip.google; // the server's count of route data requests
  const when = trip.leaving_at && Number($("leave").value) ? `at ${clockTime(trip.leaving_at)}` : "now";
  $("results").replaceChildren(
    ...(trip.weather_alerts || []).map(weatherAlert),
    winnerCard(plan, standard),
    element("h2", { className: "results__heading" }, "All routes, best first · pick one to follow it"),
    routeList(plan),
    leaveTimesBlock(),
    ...(notes.length ? [element("ul", { className: "notes" }, ...notes.map((note) => element("li", {}, note)))] : []),
    element("p", { className: "usage" }, roadEventsLine(trip)),
    ...(trip.school_hours ? [element("p", { className: "usage" }, `School zones count: leaving ${when} is a school drop-off or pickup time.`)] : []),
    ...(trip.low_sun ? [element("p", { className: "usage" }, `The sun is low leaving ${when}: roads heading into it count as riskier.`)] : []),
    ...(trip.after_dark ? [element("p", { className: "usage" }, `It's dark leaving ${when}: turns across traffic count as riskier.`)] : []),
    // Route data requests are paid ones; the OpenStreetMap map never makes any.
    ...(state.mapKind === "osm"
      ? []
      : [
          element(
            "p",
            { className: "usage" },
            `Route data requests for this trip: ${usage.live_requests}` +
              (usage.daily_limit ? ` (${usage.used_today} of ${usage.daily_limit} today)` : ""),
          ),
        ]),
  );
  selectRoute(plan.winner.id);
  $("drive").hidden = false;
}

// On satellite imagery and the night map, the gray and black lines get a white edge to stand out.
function edgedLines() {
  return state.baseMap === "satellite" || state.dark;
}

export function drawRoutes(plan, fit) {
  const view = state.view;
  const edged = edgedLines();
  const everywhere = [];
  state.paths = {};
  // Losers first, so the winner is drawn on top.
  const ordered = [...plan.candidates].reverse();
  for (const route of ordered) {
    const path = decodePolyline(route.encoded_polyline);
    everywhere.push(...path);
    state.paths[route.id] = followablePath(path, route, plan);
    const isWinner = route.id === plan.winner.id;
    const lines = [];
    if (isWinner) {
      lines.push(view.line(path, { color: "#ffffff", weight: 10, zIndex: 20 }));
      lines.push(view.line(path, { color: COLORS.winner, weight: 6, zIndex: 21 }));
    } else if (isStandard(route)) {
      if (edged) lines.push(view.line(path, { color: "#ffffff", weight: 7, opacity: 0.85, zIndex: 9 }));
      lines.push(view.line(path, { color: COLORS.standard, dashed: true, zIndex: 10 }));
    } else {
      if (edged) lines.push(view.line(path, { color: "#ffffff", weight: 8, opacity: 0.7, zIndex: 4 }));
      lines.push(view.line(path, { color: COLORS.alternative, weight: 5, opacity: 0.8, zIndex: 5 }));
    }
    state.routeLines.push({ id: route.id, lines });
  }
  if (fit) view.fit(everywhere);
}

// Which source the closures and slowdowns came from, and which were tried first but unavailable.
function roadEventsLine(trip) {
  const skipped = trip.road_events_skipped.map((name) => EVENT_SOURCES[name] || name);
  const unavailable = skipped.length ? ` (${skipped.join(", ")} unavailable)` : "";
  if (!trip.road_events_source) return `No closure or slowdown data for this trip${unavailable}.`;
  // Sources used together arrive joined with "+".
  const used = trip.road_events_source.split("+").map((name) => EVENT_SOURCES[name] || name).join(" and ");
  // A closure of both directions of a divided road arrives once per carriageway.
  const closures = trip.road_events.filter((event) => event.kind === "closed" || event.kind === "lanes");
  const shown = new Set(closures.map((event) => `${event.kind}|${event.description}`)).size;
  const counted = shown ? `; ${shown} closure${shown === 1 ? "" : "s"} nearby` : "";
  return `Closures and slowdowns from ${used}${unavailable}${counted}.`;
}

// Closed roads in black, lane closures in orange, with a dot to hover for the details.
function isTraffic(event) {
  return event.kind === "slow" || event.kind === "jam";
}

// Measured traffic (511 travel times, TomTom's jams): orange where slow, red where jammed,
// under the Traffic layer on a map without a traffic layer of its own.
export function drawTraffic() {
  for (const shape of state.trafficShapes) shape.remove();
  state.trafficShapes = [];
  if (!state.view || state.view.hasTraffic || !$("traffic-layer").checked) return;
  for (const event of state.trafficEvents) {
    const color = event.kind === "jam" ? COLORS.jam : COLORS.slow;
    state.trafficShapes.push(state.view.line(decodePolyline(event.path), { color, weight: 4, opacity: 0.85, zIndex: 3 }));
  }
}

// Closed roads in black, lane closures in dashed orange, each with a marker to tap for the details.
// Crowded markers merge into a count on the OpenStreetMap map. "Show closures" hides them all.
export function drawClosures() {
  for (const line of state.closureLines) line.remove();
  state.closureLines = [];
  if (!state.closureMarkers) return;
  state.closureMarkers.clear();
  if (!$("closures-layer").checked) return;
  for (const event of state.closures) {
    const path = decodePolyline(event.path);
    if (path.length > 1 && event.kind === "closed" && edgedLines()) {
      state.closureLines.push(state.view.line(path, { color: "#ffffff", weight: 10, opacity: 0.85, zIndex: 24 }));
    }
    if (path.length > 1) {
      state.closureLines.push(
        event.kind === "closed"
          ? state.view.line(path, { color: COLORS.closed, weight: 7, zIndex: 25 })
          : event.kind === "hazard"
            ? state.view.line(path, { color: COLORS.hazard, weight: 6, opacity: 0.75, zIndex: 24 })
            : state.view.line(path, { color: COLORS.lanes, dashed: true, zIndex: 25 }),
      );
    }
    const heading = { closed: "Road closed", lanes: "Lane closure", hazard: "Weather hazard" }[event.kind] || "Road event";
    const dot = element("div", { className: `event-dot event-dot--${event.kind}` });
    const title = event.description ? `${heading}: ${event.description}` : heading;
    state.closureMarkers.add(path[0], dot, { title, zIndex: 26, popup: { heading, text: event.description } });
  }
}

// The routes and closures drawn again for a new map look (see drawRoutes), keeping the route being followed.
export function redrawLines() {
  if (state.plan && state.redrawPlan) state.redrawPlan();
  else if (state.plan) {
    const active = state.activeRouteId;
    for (const entry of state.routeLines) entry.lines.forEach((line) => line.remove());
    state.routeLines = [];
    drawRoutes(state.plan, false);
    selectRoute(active);
  }
  drawClosures();
}

// What following a route needs: its points, the distance to each along it, and its expected time.
function followablePath(points, route, plan) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + distanceM(points[i - 1], points[i]));
  const followable = {
    points,
    cumulative,
    lengthM: cumulative[cumulative.length - 1],
    minutes: route.features.duration_min,
    encoded: route.encoded_polyline, // to ask for the stop signs and lights along it (drive3d.js)
    label: route.via ? `the route via ${route.via}` : routeKind(route, plan), // "Following ... instead"
  };
  // Where each turn-by-turn instruction falls along the route, to know which comes next.
  followable.maneuvers = route.maneuvers.map((maneuver) => ({
    ...maneuver,
    along: nearestOnPath(maneuver.location, followable).along,
  }));
  return followable;
}

// Railroad crossings and school zones (when they count, at school times): the recommended route's,
// and, faded, the standard route's that the recommended route stays clear of.
function drawCrossingsAndSchools(plan) {
  const standard = plan.candidates.find(isStandard);
  const kinds = [
    {
      field: "rail_crossing_points",
      className: "spot spot--rail",
      heading: "Railroad crossing",
      ours: "The recommended route crosses railroad tracks here, at street level.",
      theirs: "The standard route crosses railroad tracks here, at street level. The recommended route doesn't.",
    },
    {
      field: "school_points",
      className: "spot spot--school",
      heading: "School zone",
      ours: "The recommended route passes this school at drop-off or pickup time.",
      theirs: "The standard route passes this school at drop-off or pickup time. The recommended route doesn't.",
    },
  ];
  for (const kind of kinds) {
    const ours = plan.winner.features[kind.field] || [];
    const show = (spot, avoided) => {
      const mark = element("div", { className: `${kind.className}${avoided ? " spot--avoided" : ""}` });
      const heading = avoided ? `${kind.heading} avoided` : kind.heading;
      const text = avoided ? kind.theirs : kind.ours;
      state.turnMarkers.push(state.view.marker(spot, mark, { title: heading, zIndex: avoided ? 27 : 28, popup: { heading, text } }));
    };
    ours.forEach((spot) => show(spot, false));
    if (!standard || standard.id === plan.winner.id) continue;
    for (const spot of standard.features[kind.field] || []) {
      if (!ours.some((mine) => distanceM(mine, spot) < 30)) show(spot, true);
    }
  }
}

// Red dots: the recommended route's risky turns. Red rings: the standard route's, where the
// recommended route doesn't turn: what choosing it avoids.
function drawRiskyTurns(plan) {
  const risky = (route) => route.features.crossing_turns.filter((turn) => (turn.busy || turn.hotspot) && turn.location);
  const why = (turn) => `${turn.hotspot ? "a crash-prone junction" : "a busy junction"}${turn.signal ? " with a traffic signal" : ""}`;
  const ours = risky(plan.winner);
  for (const turn of ours) {
    const dot = element("div", { className: "turn-dot" });
    const text = `The recommended route turns across oncoming traffic at ${why(turn)}${turn.hotspot ? ", where fatal crashes have happened" : ""}.`;
    state.turnMarkers.push(
      state.view.marker(turn.location, dot, { title: `Turn across traffic at ${why(turn)}`, zIndex: 30, popup: { heading: "Risky turn", text } }),
    );
  }
  const standard = plan.candidates.find(isStandard);
  if (!standard || standard.id === plan.winner.id) return;
  for (const turn of risky(standard)) {
    if (ours.some((mine) => distanceM(mine.location, turn.location) < 30)) continue; // both routes turn there
    const ring = element("div", { className: "turn-dot turn-dot--avoided" });
    const text = `The standard route turns across oncoming traffic here, at ${why(turn)}. The recommended route doesn't.`;
    state.turnMarkers.push(
      state.view.marker(turn.location, ring, { title: `Avoided: a turn across traffic at ${why(turn)}`, zIndex: 29, popup: { heading: "Risky turn avoided", text } }),
    );
  }
}

// Make one route the one to follow, and bring it to the front without changing how it's drawn.
export function selectRoute(id) {
  state.activeRouteId = id;
  for (const entry of state.routeLines) {
    for (const line of entry.lines) line.front(entry.id === id);
  }
  for (const item of document.querySelectorAll(".route")) {
    item.classList.toggle("route--active", item.dataset.id === id);
  }
  drawBuses(); // "Only buses near the trip" means near this route
}

export function clearRoutes() {
  for (const entry of state.routeLines) entry.lines.forEach((line) => line.remove());
  for (const marker of [...state.turnMarkers, ...state.modeMarks]) marker.remove();
  state.routeLines = [];
  state.turnMarkers = [];
  state.modeMarks = [];
  state.redrawPlan = null;
  state.closures = [];
  drawClosures();
  state.paths = {};
  state.activeRouteId = null;
}

function winnerCard(plan, standard) {
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
        element("h2", { className: "winner__title" }, routeLabel(winner, plan)),
        ...(winner.via ? [element("p", { className: "winner__kind" }, routeKind(winner, plan))] : []),
      ),
      scoreRing(winner.safety_score),
    ),
  );
  if (winner.reason) card.append(element("p", { className: "winner__reason" }, capitalize(winner.reason)));
  if (standard && standard.id !== winner.id) {
    card.append(element("p", { className: "override" }, comparedWithStandard(winner, standard)));
  }
  card.append(stats(winner), safetyBreakdown(winner, standard), feedbackBlock(winner, standard));
  return card;
}

// The safety score as a ring that fills to it: green when high, amber, then red.
export function scoreRing(score) {
  const band = score >= 80 ? "high" : score >= 50 ? "mid" : "low";
  return element(
    "div",
    { className: `score score--${band}`, style: `--score:${score}`, title: "Safety score: 0 to 100, higher is safer" },
    element("strong", {}, String(score)),
    element("span", {}, "safety"),
  );
}

// What the safety score counts: each kind of risk's points, beside the standard route's when that's
// a different route. Points add up and compare across routes; the score comes from their total.
function safetyBreakdown(winner, standard) {
  const compare = Boolean(standard && standard.id !== winner.id);
  const ours = winner.safety_risks || {};
  const theirs = compare ? standard.safety_risks || {} : {};
  const kinds = Object.keys(RISK_LABELS).filter((kind) => ours[kind] || theirs[kind]);
  if (!kinds.length) return element("p", { className: "breakdown__none" }, "No risks found on this route: a perfect 100.");
  const points = (value) => (value ? (Math.round(value * 10) / 10).toString() : "–");
  const total = (risks) => Object.values(risks).reduce((sum, value) => sum + value, 0);
  const columns = (ourValue, theirValue) => [ourValue, ...(compare ? [theirValue] : [])];
  const row = (label, cells, className = "") =>
    element("tr", { className }, element("th", {}, label), ...cells.map((text) => element("td", {}, text)));
  return element(
    "details",
    { className: "breakdown" },
    element("summary", {}, "What the safety score counts"),
    element(
      "table",
      { className: "breakdown__table" },
      element("thead", {}, row("Risk points", columns("This route", "Standard"))),
      element("tbody", {}, ...kinds.map((kind) => row(RISK_LABELS[kind], columns(points(ours[kind]), points(theirs[kind]))))),
      element(
        "tfoot",
        {},
        row("Total", columns(points(total(ours)), points(total(theirs))), "breakdown__total"),
        row("Safety score", columns(String(winner.safety_score), compare ? String(standard.safety_score) : "")),
      ),
    ),
    element("p", { className: "breakdown__note" }, "The score is 100 with no risks, and halves with every 10 risk points: 100 ÷ (1 + points ÷ 10)."),
  );
}

export function scorePill(score) {
  const band = score >= 80 ? "high" : score >= 50 ? "mid" : "low";
  return element("span", { className: `score-pill score-pill--${band}`, title: "Safety score: 0 to 100, higher is safer" }, `${score}`);
}

function weatherAlert(alert) {
  const until = alert.ends ? ` until ${clockTime(alert.ends)}` : "";
  return element(
    "div",
    { className: "alert" },
    element("strong", {}, `${alert.event}${until}`),
    element(
      "p",
      {},
      alert.slippery
        ? "Slippery roads: turns across oncoming traffic count as riskier, so routes avoid more of them."
        : "Drive with care: the routes account for hazards reported on the roads.",
    ),
  );
}

// "3:45 PM" from an ISO time.
export function clockTime(iso) {
  const moment = new Date(iso);
  return Number.isNaN(moment.getTime()) ? "" : moment.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

function stats(route) {
  const f = route.features;
  const items = [
    ["Time", `${Math.round(f.duration_min)} min${route.live_traffic ? "" : " (est.)"}`],
    ["Distance", `${(f.distance_km * KM_TO_MI).toFixed(1)} mi`],
    ["Fuel", `${gallons(route).toFixed(2)} gal · ${dollars(gallons(route) * state.fuelPrice)}`],
    ["CO₂", `${(gallons(route) * CO2_KG_PER_GALLON).toFixed(1)} kg`],
    ["Risky turns", String(riskyTurns(route))],
  ];
  for (const [label, value] of hazards(f)) items.push([label, value]);
  return element("dl", { className: "stats" }, ...items.map(([label, value]) => element("div", {}, element("dt", {}, label), element("dd", {}, value))));
}

function gallons(route) {
  return route.features.fuel_l / LITERS_PER_GALLON;
}

// "$1.40", or "35¢" under a dollar.
function dollars(amount) {
  return amount < 1 ? `${Math.round(amount * 100)}¢` : `$${amount.toFixed(2)}`;
}

// The hazards a route has besides risky turns, as [label, shown value], for the ones it has.
export function hazards(f) {
  return [
    ["Lane closures", f.lane_closures],
    ["Closed roads", f.closures],
    ["School zones", f.school_zones],
    ["Rail crossings", f.rail_crossings],
    ["Weather hazards", f.weather_hazards || 0],
  ]
    .filter(([, count]) => count > 0)
    .map(([label, count]) => [label, String(count)])
    .concat((f.sun_glare_min || 0) >= 0.5 ? [["Sun glare", `${Math.round(f.sun_glare_min)} min`]] : []);
}

function routeList(plan) {
  return element(
    "ol",
    { className: "routes" },
    ...plan.candidates.map((route) => {
      const color = route.id === plan.winner.id ? COLORS.winner : isStandard(route) ? COLORS.standard : COLORS.alternative;
      const f = route.features;
      const risky = riskyTurns(route);
      const item = element(
        "li",
        { className: "route", tabIndex: 0, dataset: { id: route.id } },
        element("span", { className: "swatch", style: `background:${color}` }),
        element(
          "div",
          {},
          element("div", { className: "route__name" }, routeLabel(route, plan), " ", scorePill(route.safety_score)),
          element(
            "div",
            { className: "route__reason" },
            [
              route.via ? routeKind(route, plan) : "",
              route.reason ? capitalize(route.reason) : route.eligible ? "" : "Too slow to recommend",
            ]
              .filter(Boolean)
              .join(" · "),
          ),
        ),
        element(
          "div",
          { className: "route__numbers" },
          element("div", {}, `${Math.round(f.duration_min)} min · ${(f.distance_km * KM_TO_MI).toFixed(1)} mi`),
          element(
            "div",
            {},
            `${dollars(gallons(route) * state.fuelPrice)} gas · `,
            element("span", { className: risky ? "risky" : "" }, `${risky} risky`),
          ),
          ...hazards(f).map(([label, value]) => element("div", { className: "risky" }, `${value} ${label.toLowerCase()}`)),
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

function comparedWithStandard(winner, standard) {
  const parts = [];
  if (winner.safety_score !== standard.safety_score) parts.push(`safety score ${standard.safety_score} → ${winner.safety_score}`);
  const fewer = riskyTurns(standard) - riskyTurns(winner);
  if (fewer > 0) parts.push(`${fewer} fewer risky turn${fewer === 1 ? "" : "s"}`);
  for (const [field, name] of [
    ["lane_closures", "lane closure"],
    ["school_zones", "school zone"],
    ["rail_crossings", "rail crossing"],
    ["weather_hazards", "weather hazard"],
  ]) {
    const fewerOf = (standard.features[field] || 0) - (winner.features[field] || 0);
    if (fewerOf > 0) parts.push(`${fewerOf} fewer ${name}${fewerOf === 1 ? "" : "s"}`);
  }
  const glare = (standard.features.sun_glare_min || 0) - (winner.features.sun_glare_min || 0);
  if (glare >= 0.5) parts.push(`${Math.round(glare)} min less sun glare`);
  if (standard.features.closures && !winner.features.closures) parts.push("avoids a closed road");
  const cost = (gallons(winner) - gallons(standard)) * state.fuelPrice;
  if (cost <= -0.01) parts.push(`${dollars(-cost)} less gas`);
  else if (cost >= 0.01) parts.push(`${dollars(cost)} more gas`);
  const minutes = winner.features.duration_min - standard.features.duration_min;
  if (minutes >= 0.5) parts.push(`${minutes.toFixed(1)} min longer`);
  else if (minutes <= -0.5) parts.push(`${(-minutes).toFixed(1)} min faster`);
  return `Instead of the standard route: ${parts.join(", ") || "a different path"}`;
}

// The standard route is the one a typical navigation app would suggest: the
// map provider's own choice, or with the OpenStreetMap map, our fastest route.
export function isStandard(route) {
  return route.is_standard;
}

// What a route is called: by its road ("Via W Wisconsin Ave"), or else by what it is.
export function routeLabel(route, plan) {
  return route.via ? `Via ${route.via}` : routeKind(route, plan);
}

// What a route is: one of our designs, the standard route, or another alternative.
export function routeKind(route, plan) {
  if (route.source === "own") {
    // Number our designs when there are several (ids are own-1, own-2, ...).
    const several = plan.candidates.filter((candidate) => candidate.source === "own").length > 1;
    return several ? `Our safer design ${route.id.split("-").pop()}` : "Our safer design";
  }
  if (isStandard(route)) return state.mode === "car" ? "Standard route" : "Shortest route";
  return "Alternative route";
}

function riskyTurns(route) {
  return route.features.busy_crossing_turns + route.features.hotspot_crossing_turns;
}

// "Would you take this route?": answers are counted on the server, with no places kept.
function feedbackBlock(winner, standard) {
  const block = element("div", { className: "feedback" }, element("span", { className: "feedback__question" }, "Would you take this route?"));
  const answer = async (choice) => {
    block.replaceChildren(element("span", { className: "feedback__thanks" }, "Thanks for your answer!"));
    try {
      await postJson("/feedback", {
        choice,
        safety_gain: standard ? winner.safety_score - standard.safety_score : 0,
        extra_min: standard ? Math.round((winner.features.duration_min - standard.features.duration_min) * 10) / 10 : 0,
        profile: $("profile").value,
      });
    } catch (error) {
      console.warn("The answer wasn't saved:", error);
    }
  };
  for (const [choice, label] of [["yes", "Yes"], ["no", "No"]]) {
    const button = element("button", { className: `chip chip--${choice}`, type: "button" }, label);
    button.addEventListener("click", () => answer(choice));
    block.append(button);
  }
  return block;
}

// "Best time to leave?": the recommended route's safety and time leaving now, in 15 or 30 minutes, or in an hour.
function leaveTimesBlock() {
  const block = element("div", { className: "leave-times" });
  const button = element("button", { className: "chip chip--clock", type: "button" }, "Best time to leave?");
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Comparing…";
    try {
      block.replaceChildren(leaveTimesList(await postJson("/leave-times", tripPayload(state.origin, state.destination))));
    } catch (error) {
      block.replaceChildren(element("p", { className: "status status--error" }, error.message));
    }
  });
  block.append(button);
  return block;
}

function leaveTimesList({ times, best_offset_min: best }) {
  const rows = times.map((time) => {
    const when = time.offset_min === 0 ? "Now" : time.offset_min === 60 ? "In 1 hour" : `In ${time.offset_min} min`;
    const why = [
      time.sun_glare_min >= 0.5 ? `${Math.round(time.sun_glare_min)} min sun glare` : "",
      time.school_zones ? `${time.school_zones} school zone${time.school_zones === 1 ? "" : "s"}` : "",
      time.after_dark ? "after dark" : "",
    ].filter(Boolean);
    const row = element(
      "button",
      { className: `leave-time${time.offset_min === best ? " leave-time--best" : ""}`, type: "button", title: "Plan the trip for this time" },
      element("span", { className: "leave-time__when" }, `${when} · ${clockTime(time.leaving_at)}`),
      element("span", { className: "leave-time__why" }, why.join(" · ") || "No sun glare or school zones"),
      element("span", { className: "leave-time__numbers" }, scorePill(time.safety_score), ` ${Math.round(time.duration_min)} min`),
    );
    row.addEventListener("click", () => {
      $("leave").value = String(time.offset_min);
      findRoute();
    });
    return row;
  });
  return element("div", { className: "leave-times__list" }, element("p", { className: "results__heading" }, "Best time to leave · pick one to plan it"), ...rows);
}
