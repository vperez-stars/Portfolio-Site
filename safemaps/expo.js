// For the expo: demo mode's sample trips, "How it works", and the link for phones.

import { loadScript } from "./maps.js";
import { $, DEMO, QR_LIBRARY, element, state } from "./core.js";
import { requestTrip } from "./app.js";
import { removeStop, setPoint } from "./editing.js";
import { showTrip } from "./results.js";
import { tripLink } from "./trips.js";
import { locale } from "./i18n.js";
import { setMode } from "./bike.js";

export function setUpDemo() {
  const fromLink = new URLSearchParams(window.location.search).get("demo");
  let on = fromLink === "1";
  try {
    if (fromLink !== null) localStorage.setItem("routes-demo", on ? "on" : "off");
    else on = localStorage.getItem("routes-demo") === "on";
  } catch {
    // Storage blocked: the link's ?demo=1 still works for this visit.
  }
  state.demo.on = on;
  $("demo-mode").checked = on;
  $("demo-mode").addEventListener("change", (event) => {
    state.demo.on = event.target.checked;
    try {
      localStorage.setItem("routes-demo", state.demo.on ? "on" : "off");
    } catch {
      // Remembered for this visit only.
    }
    if (!state.demo.on) stopDemo();
    restartIdleTimer();
  });
  // Anyone touching the page ends the demo, and the idle countdown starts over.
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    document.addEventListener(type, (event) => event.isTrusted && userIsHere(), { capture: true, passive: true });
  }
  restartIdleTimer();
  checkDemoPause();
  setInterval(checkDemoPause, DEMO_PAUSE_CHECK_MS);
}

const DEMO_PAUSE_CHECK_MS = 30000;

// The control page (control.html) can pause demo mode on the screens running it, without walking
// to the booth. Only screens in demo mode ask; a failed check changes nothing.
async function checkDemoPause() {
  if (!state.demo.on) return;
  try {
    const response = await fetch("/expo-control", { cache: "no-store" });
    if (!response.ok) return;
    state.demo.paused = Boolean((await response.json()).demo_paused);
  } catch {
    return;
  }
  if (state.demo.paused) stopDemo();
  else if (!state.demo.running) restartIdleTimer();
}

function userIsHere() {
  if (state.demo.running) stopDemo();
  restartIdleTimer();
}

export function restartIdleTimer() {
  clearTimeout(state.demo.idleTimer);
  if (state.demo.on && !state.nav.active) state.demo.idleTimer = setTimeout(startDemo, DEMO.idleMs);
}

function startDemo() {
  if (!state.demo.on || state.demo.paused || state.nav.active || document.querySelector("dialog[open]")) return restartIdleTimer();
  state.demo.running = true;
  demoStep();
}

async function demoStep() {
  if (!state.demo.running) return;
  if (state.mode !== "car") setMode("car"); // the sample trips are car trips
  const trip = DEMO.trips[state.demo.index % DEMO.trips.length];
  state.demo.index += 1;
  for (const stop of [...state.stops]) removeStop(stop.id);
  setPoint("origin", { ...trip.from, countryCode: "US" });
  setPoint("destination", { ...trip.to, countryCode: "US" });
  const banner = $("demo-banner");
  banner.replaceChildren(
    element("strong", {}, `Sample trip: ${trip.from.label} → ${trip.to.label}`),
    element("span", {}, "Touch anywhere to plan your own"),
  );
  banner.hidden = false;
  try {
    const result = await requestTrip(state.origin, state.destination, { stops: [], demo: true });
    if (state.demo.running) showTrip(result);
  } catch (error) {
    console.warn("A sample trip failed:", error);
  }
  if (state.demo.running) state.demo.stepTimer = setTimeout(demoStep, DEMO.showMs);
}

export function stopDemo() {
  if (state.demo.running) state.demo.stoppedAt = Date.now();
  state.demo.running = false;
  clearTimeout(state.demo.stepTimer);
  $("demo-banner").hidden = true;
}

// "How it works", with the headline numbers of the latest results summary (python -m app.evaluate).
export async function showAbout() {
  const dialog = $("about");
  dialog.showModal();
  if (dialog.dataset.loaded) return;
  dialog.dataset.loaded = "yes";
  try {
    const response = await fetch("results.json", { cache: "no-store" });
    const results = response.ok ? await response.json() : null;
    if (!results || !results.trips) return;
    $("about-results-title").textContent = `Across ${results.trips} Milwaukee test trips`;
    $("about-numbers").replaceChildren(...resultLines(results).map((text) => element("li", {}, text)));
    const day = new Date(`${results.generated}T12:00:00`).toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" });
    $("about-measured").textContent = `Measured ${day}, with that day's closures and traffic.`;
    $("about-results").hidden = false;
  } catch {
    // The explanation stands on its own without the numbers.
  }
}

function resultLines(r) {
  const count = (value) => String(Math.round(value));
  const avoided = r.risky_turns_standard - r.risky_turns_ours;
  const lines = [
    `${r.different} of ${r.trips} trips got a different route than the standard one.`,
    ...(r.safety_score_ours !== undefined
      ? [`Average safety score: ${count(r.safety_score_standard / r.trips)} for the standard routes, ${count(r.safety_score_ours / r.trips)} for ours.`]
      : []),
    `${count(avoided)} risky turns avoided: ${count(r.risky_turns_standard)} on the standard routes, ${count(r.risky_turns_ours)} on ours.`,
  ];
  for (const [key, name] of [["closures", "Closed roads"], ["lane_closures", "Lane closures"], ["school_zones", "School zones"], ["rail_crossings", "Railroad crossings"]]) {
    const [standard, ours] = [r[`${key}_standard`], r[`${key}_ours`]];
    if (standard > ours) lines.push(`${name}: ${count(standard)} on the standard routes, ${count(ours)} on ours.`);
  }
  const minutes = r.minutes_added_per_trip;
  lines.push(
    minutes > 0
      ? `About ${minutes.toFixed(1)} min longer per trip on average: the price of the safer choice.`
      : `No slower on average (${Math.abs(minutes).toFixed(1)} min ${minutes < 0 ? "faster" : "difference"} per trip).`,
  );
  return lines;
}

// A QR code of this page's address, with the access code, to scan with a phone. Phones need
// the public https link from the tunnel (EXPO.md): this computer's own address won't open on them.
export async function showPhoneLink() {
  const body = $("phone-body");
  $("phone").showModal();
  if (["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) {
    body.replaceChildren(
      element("p", {}, "This page is open at this computer's own address, which phones can't reach."),
      element(
        "p",
        {},
        "Start the tunnel (EXPO.md, “Let visitors use their phones”) and open this page from its https://…trycloudflare.com address. The code to scan will show here.",
      ),
    );
    return;
  }
  const link = tripLink();
  const withTrip = Boolean(state.origin && state.destination);
  body.replaceChildren(element("p", { className: "status" }, "Making the code…"));
  try {
    if (!window.qrcode) await loadScript(QR_LIBRARY);
    const qr = window.qrcode(0, "M");
    qr.addData(link);
    qr.make();
    body.replaceChildren(
      element("img", { className: "qr", src: qr.createDataURL(6, 3), alt: `QR code for ${link}` }),
      element("p", { className: "qr__link" }, link),
      window.location.protocol === "https:"
        ? element("p", { className: "hint" }, "Point the phone's camera at the code, then tap the link it shows.")
        : element("p", { className: "hint" }, "Driving mode on a phone needs the secure https link from the tunnel."),
      ...(withTrip ? [element("p", { className: "hint" }, "The trip on the map comes with it, ready to drive.")] : []),
      element("p", { className: "hint" }, "To find it again later, use the browser's “Add to Home Screen”."),
    );
  } catch {
    body.replaceChildren(element("p", {}, "The code couldn't be made. Visitors can type this address:"), element("p", { className: "qr__link" }, link));
  }
}
