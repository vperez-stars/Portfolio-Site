// Safe Route City: what's in the city. Every place is a real part of the repo; every line a real data path.
window.CITY = (() => {
  const DISTRICTS = {
    page: { name: "Browser Town", sign: "green", note: "Runs on the visitor's device" },
    server: { name: "Server Downtown", sign: "blue", note: "The FastAPI server, in one Python process" },
    kernel: { name: "Rust Subway", sign: "rust", note: "Compiled search and geometry" },
    data: { name: "Warehouses", sign: "brown", note: "Files on the server's disk" },
    tools: { name: "Build Yard", sign: "orange", note: "Commands run by hand" },
    ext: { name: "Outside Services", sign: "yellow", note: "Data leaves the computer here" },
  };

  // Group: where the data moves. Each mode is one kind of transfer.
  const MODES = {
    foot: { name: "On foot", group: "Inside the browser", color: "#7a8796", speed: 5, lane: 3.2, style: "dots", what: "Page modules calling each other. Nothing leaves the browser." },
    drone: { name: "Drone", group: "Inside the browser", color: "#1fb4d2", speed: 16, air: true, style: "dash", what: "The device's own GPS fixes, handed to the page." },
    taxi: { name: "Taxi", group: "Browser and server", color: "#e8ad00", speed: 20, lane: 1.3, style: "dash", what: "An HTTP request, and the JSON reply on the way back." },
    bus: { name: "City bus", group: "Browser and server", color: "#2f7fe6", speed: 14, lane: 2.1, style: "dash", what: "A page polling the server on a timer: every 15, 20 or 30 seconds." },
    courier: { name: "Bike courier", group: "Browser and server", color: "#e0479e", speed: 11, lane: 2.7, style: "dots", what: "A small one-way note. The server answers 204, with no content." },
    tram: { name: "Streetcar", group: "Inside the server", color: "#16a05a", speed: 15, lane: 0.8, style: "rail", what: "Python function calls inside the server process." },
    subway: { name: "Subway", group: "Inside the server", color: "#e4572e", speed: 34, under: true, style: "rail", what: "Calls from Python into Rust through ctypes. Python's lock is let go, so trips run side by side." },
    freight: { name: "Freight train", group: "Inside the server", color: "#a9834a", speed: 9, lane: 1.7, style: "rail", what: "Whole map files: loaded when the server starts, written when a map is built." },
    forklift: { name: "Forklift", group: "Inside the server", color: "#93a81f", speed: 6, lane: 2.4, style: "dots", what: "Small file reads and writes: saved answers, counters, logs." },
    van: { name: "Delivery van", group: "To the outside world", color: "#a765d8", speed: 16, lane: 1.9, style: "dash", what: "The browser fetching map images, place search and map styles directly, without the server." },
    heli: { name: "Traffic helicopter", group: "To the outside world", color: "#f0506e", speed: 20, air: true, style: "dash", what: "The server pulling live traffic, closures and weather, kept for 3 to 10 minutes." },
    plane: { name: "Airplane", group: "To the outside world", color: "#5563e8", speed: 46, air: true, style: "dash", what: "Paid Google Routes API calls. Each one counts toward the daily cap." },
    ship: { name: "Cargo ship", group: "To the outside world", color: "#16938f", speed: 6, water: true, style: "dash", what: "Bulk downloads: road data, crash files and the bus schedule. Rare and large." },
  };

  // [id, name, files, district, x, z, kind, height, what it does, major?]
  const P = (id, name, files, d, x, z, kind, h, text, major) => ({ id, name, files, d, x, z, kind, h, text, major: !!major });
  const PLACES = [
    // Browser Town
    P("app", "Trip Planner", "frontend/index.html, app.js", "page", -47, -15, "cityhall", 16, "Starts the page, wires its controls and asks the server for routes. All routing happens in the backend; this page collects the trip and shows the answer.", 1),
    P("core", "Town Square", "frontend/core.js", "page", -75, -15, "plaza", 4, "Settings, shared state and helpers that the other page modules read."),
    P("editing", "Trip Editor", "frontend/editing.js", "page", -75, -45, "slab", 11, "The trip on the map: start, destination, stops, dragging pins, and Undo."),
    P("results", "Route Drawing Office", "frontend/results.js", "page", -47, 15, "slab", 14, "Draws the ranked routes and explains them: the safety score ring, the reasons, Best time to leave?, and Would you take this route?", 1),
    P("maps", "Map Hall", "frontend/maps.js", "page", -75, 15, "dome", 13, "The map underneath, Google's or OpenStreetMap's, behind one small interface. Also place search on the OpenStreetMap map.", 1),
    P("layers", "Layer Cake", "frontend/layers.js", "page", -75, 45, "cake", 14, "The map's look: default, satellite, terrain, traffic, biking, the dark map at night, and the bus lines."),
    P("drive", "Driving School", "frontend/drive.js", "page", -47, 45, "slab", 10, "Follows the drive: GPS, progress along the route, spoken directions, asking for a new route after leaving them all, and Preview the drive.", 1),
    P("drive3d", "Drive-In Cinema", "frontend/drive3d.js", "page", -47, 75, "cinema", 9, "The third-person driving view on MapLibre GL: 3D buildings, the route, a compass, and the stop signs and lights ahead."),
    P("bikejs", "Bike & Walk Shop", "frontend/bike.js", "page", -47, -45, "shop", 8, "The Car, Bike and Walk switch. Requests bike and walking trips and draws their routes by stress."),
    P("transitjs", "Bus Info Kiosk", "frontend/transit.js", "page", -47, -75, "shop", 7, "Bus trips step by step: walk, get on, ride, get off, with the stops on the map."),
    P("i18n", "Translators' Office", "frontend/i18n.js", "page", -75, -75, "slab", 10, "Translates the page into Spanish as it appears, including the server's route reasons and directions."),
    P("trips", "Trip Archive", "frontend/trips.js", "page", -105, -15, "slab", 8, "Trip links and the last 5 trips, kept in this browser only."),
    P("expo", "Expo Hall", "frontend/expo.js", "page", -105, -45, "hall", 10, "Demo mode, How it works and the phone link with its QR code.", 1),
    P("sw", "Tile Depot", "frontend/sw.js", "page", -105, 15, "warehouse", 8, "The service worker. Keeps the page's files and up to 4,000 map images viewed, so the page still opens when the network drops.", 1),
    P("vendor", "Library Hardware", "frontend/vendor/", "page", -105, 45, "shop", 7, "Local copies of Leaflet, MapLibre GL, MarkerCluster and the QR code generator, so the page needs no CDN."),
    P("stats", "Scoreboard Arena", "frontend/stats.html, stats.js", "page", -105, -75, "arena", 7, "The second screen at the booth: today's trips, how many got a safer route, and what they avoided."),
    P("answers", "Poll Booth", "frontend/answers.html, answers.js", "page", -135, -75, "shop", 7, "Visitors' answers to Would you take this route?, today and over all days."),
    P("control", "Control Room", "frontend/control.html, control.js", "page", -135, -45, "slab", 11, "Readiness checks, today's paid usage, and the switches that pause demo mode and restart the stats."),
    P("game", "Arcade", "frontend/game.html, game.js", "page", -135, -15, "arcade", 8, "Which route is safer? Two routes without their scores, and the visitor guesses."),
    P("phones", "Visitors' Phones", "the same page, opened from the QR code", "page", -135, 75, "phone", 12, "Phones run the same page as the booth screen. They reach the laptop through the Cloudflare tunnel.", 1),
    P("gps", "Device GPS", "navigator.geolocation", "page", -135, 45, "mast", 14, "The device's location. Browsers only share it with https pages or localhost, which is why phones need the tunnel."),
    P("tunnel", "Cloudflare Tunnel", "cloudflared (docker compose --profile phones)", "ext", -30, 30, "portal", 5, "A free public https address for the laptop. Requests go under the river and come up on the server side. Set ROUTES_ACCESS_CODE first, because the link is public."),

    // Server Downtown
    P("main", "Central Station", "backend/app/main.py", "server", 13, -14, "station", 15, "The HTTP API (FastAPI). Every request from every page arrives here. It also serves the page's own files, and checks the access code.", 1),
    P("gate", "Toll Gate", "check_access() in main.py", "server", -5, -7, "booth", 4, "With ROUTES_ACCESS_CODE set, requests without the code are refused with a 401. It protects paid requests on a public link."),
    P("engine", "Dispatch Tower", "backend/app/engine.py", "server", 43, -15, "tower", 40, "The pipeline: coordinates in, ranked routes out. Fills the candidate pool, has every route measured, and hands them to the scorer.", 1),
    P("router", "Route Designers", "backend/app/router.py", "server", 73, -15, "tower", 28, "Our own router. Decides what each road segment and turn costs for this profile, in perceived minutes, then designs up to 3 routes on different corridors.", 1),
    P("roadgraph", "Road Atlas", "backend/app/roadgraph.py", "server", 103, -15, "library", 13, "The road map in memory: junctions, segments, turn restrictions, signals, schools and rail crossings. Also matches closures onto roads.", 1),
    P("road_events", "Traffic News Center", "backend/app/road_events.py", "server", 13, -75, "helipad", 15, "Five sources of closures, lane closures and jams. It collects them, drops repeats, and redraws each along the roads it lies on.", 1),
    P("weather", "Weather Station", "backend/app/weather.py", "server", 37, -81, "dome", 9, "National Weather Service alerts where the trip starts. Winter alerts make turns across traffic count 1.5 times as risky."),
    P("tiles", "Tile Exchange", "backend/app/traffic_tiles.py", "server", 49, -68, "slab", 8, "Fetches TomTom's traffic map for the page and keeps each image 3 minutes, so TomTom's key never reaches a browser."),
    P("pricing", "Price Check", "backend/app/pricing.py", "server", 68, -81, "slab", 10, "Sends our designs to Google through up to 25 points each, for live-traffic times, and measures how closely Google followed."),
    P("candidates", "Candidate Pool", "backend/app/candidates.py", "server", 79, -68, "pool", 4, "Widens the pool of Google routes: alternatives, avoid-highways, and via points pushed sideways."),
    P("features", "Inspection Station", "backend/app/features.py", "server", 37, -46, "slab", 11, "Measures each route: highway minutes, risky turns, closures, school zones, rail crossings, sun glare and fuel.", 1),
    P("fuel", "Gas Station", "backend/app/fuel.py", "server", 49, -37, "gas", 4, "The rough fuel model: consumption by speed, turns and time in traffic."),
    P("scoring", "Court House", "backend/app/scoring.py", "server", 69, -50, "court", 12, "Pure scoring and ranking, the part you tune. By default: safety first, then fuel, then time.", 1),
    P("profiles", "Persona Office", "backend/app/profiles.py", "server", 79, -38, "shop", 7, "The presets: safe-economy (the default), fastest, highway-averse, scenic, calm, eco and new driver."),
    P("sun", "Observatory", "backend/app/sun.py", "server", 98, -52, "dome", 10, "Where the sun is, worked out from NOAA's formulas, and when a route drives into its glare."),
    P("driving_side", "Keep-Right Office", "backend/app/driving_side.py", "server", 109, -52, "shop", 6, "Which countries keep left, so a turn across traffic means the right thing."),
    P("hotspots", "Crash Map Office", "backend/app/hotspots.py", "server", 103, -38, "slab", 8, "An index of recorded crashes, for finding which junctions are crash-prone."),
    P("records", "Records Hall", "backend/app/feedback.py, trip_log.py", "server", 8.5, -51.5, "court", 9, "Visitors' answers, guesses and counted trips. No places are ever kept: a start or destination may be someone's home."),
    P("expoctl", "Control Desk", "backend/app/expo_control.py", "server", 20.5, -52, "shop", 6, "What the control page sets: demo mode paused, and since when the stats count."),
    P("standards", "City Standards", "backend/app/models.py, config.py, geo.py, kept.py", "server", 98, -81, "slab", 9, "Shared by nearly everything: the data models, settings from backend/.env, geometry helpers, and a small store of recent results."),
    P("road_controls", "Signs & Signals", "backend/app/road_controls.py", "server", 109, -68, "shop", 6, "Stop signs and traffic lights along a route, for the driving view only. The search and the safety score don't read them."),
    P("bikepy", "Stress Bureau", "backend/app/bike.py", "server", 13, 15, "slab", 11, "Bike and walking routes: the lowest-stress route within a detour the rider accepts, beside the shortest.", 1),
    P("hub", "Transit Hub", "backend/app/timetable.py, transit_plan.py, transit.py", "server", 40.5, 19, "hall", 9, "Reads MCTS's bus schedule. RAPTOR finds the fastest way with one, two and three buses, and the safest of those arriving near the earliest wins.", 1),
    P("entrance", "Subway Entrance", "backend/app/native.py, search_kernel.py, geo_kernel.py", "kernel", 52, 11, "entrance", 4, "The way down to Rust: finds and loads the native library, and wraps its calls with ctypes."),
    P("search_rs", "Search Station", "backend/rust_kernel/src/search.rs", "kernel", 76, 15, "rust", 3, "A* over the map's turns as flat arrays, guided by a search back from the destination. Python's lock is let go, so trips plan side by side on the computer's cores.", 1),
    P("geometry_rs", "Geometry Station", "backend/rust_kernel/src/geometry.rs", "kernel", 100, 15, "rust", 3, "The geometry a plan repeats thousands of times: what a route passes, and what's near it, with a grid of cells to keep lookups quick.", 1),

    // Airport
    P("terminal", "Airport Terminal", "backend/app/routes_client.py", "server", 45, -103, "terminal", 8, "The client for Google's Routes API. Checks the cache, then the daily cap, and only then flies.", 1),
    P("atc", "Control Tower", "backend/app/usage.py", "server", 72, -104, "atc", 20, "A local cap on live Google requests (ROUTES_DAILY_LIMIT). Past it, flights are refused until midnight and saved answers keep working."),
    P("hangar", "Answer Hangar", "backend/app/cache.py, .cache/routes/*.json", "data", 98, -104.5, "hangar", 9, "One JSON file per distinct Google request. Modes: record, replay or off. Answers expire after 30 days, live-traffic ones after 5 minutes in record mode.", 1),

    // Warehouses and Build Yard
    P("vault", "Records Vault", ".cache/routes/ (feedback.jsonl, trips.jsonl, guesses.jsonl, counters)", "data", 13, -40, "warehouse", 5, "The server's own notes on disk: visitors' answers, counted trips and guesses, daily counters, the last TomTom answer, and the saved bus feed."),
    P("graphs", "Map Warehouse", "data/graphs/*.json.gz", "data", 73, 76, "warehouse", 10, "The built maps: car, bike and walk, plus the stop signs and lights. Outside the Docker image, on a mounted folder.", 1),
    P("crashes", "Crash Records", "data/crashes/*.csv", "data", 103, 102, "warehouse", 7, "Fatal crashes from NHTSA, including the ones where a cyclist or pedestrian died. An optional Community Maps export can add all reported crashes."),
    P("foundry", "Map Foundry", "backend/app/build_graph.py", "tools", 103, 76, "factory", 11, "python -m app.build_graph milwaukee-metro. Turns downloaded OpenStreetMap data into a road graph, with --bike and --walk versions.", 1),
    P("pier_osm", "OSM Pier", "backend/app/overpass.py, osm_extract.py", "tools", 126, 76, "pier", 6, "Downloads roads in tiles from the Overpass API, or reads an extract file (.osm.pbf) where Overpass can't be reached."),
    P("pier_crash", "Crash Data Pier", "backend/app/crash_data.py", "tools", 126, 102, "pier", 6, "Downloads NHTSA's fatal crash files, about 170 MB, once. Picks out the Milwaukee area."),
    P("track", "Test Track", "backend/app/evaluate.py, bike_evaluate.py", "tools", 13, 76, "track", 2, "Runs 20 Milwaukee trips through the same API the page uses, and writes RESULTS.md and frontend/results.json for How it works.", 1),
    P("loadtest", "Crowd Gate", "backend/app/loadtest.py", "tools", 43, 70, "shop", 5, "Plays many visitors at once before the expo, to see whether the server keeps up."),
    P("cli", "Workshop", "backend/app/cli.py", "tools", 43, 83, "shop", 6, "Runs and tunes the engine from the terminal, without a browser."),
    P("lab", "Crash-Test Lab", "backend/tests/, .github/workflows/tests.yml", "tools", 13, 102, "hall", 7, "The test suite, with no network needed, and browser tests of the page. GitHub runs it on every push."),
    P("docker", "Container Terminal", "Dockerfile, docker-compose.yml", "tools", 73, 102, "containers", 8, "Packs the code and the Rust library into an image. The keys, maps and saved answers stay on the computer as mounted folders."),

    // Outside services
    P("suppliers", "Map Image Suppliers", "OpenStreetMap, Esri, OpenTopoMap, CyclOSM, OpenRailwayMap", "ext", -150, -152, "mast", 13, "The free map images behind the OpenStreetMap map's layers."),
    P("openfree", "OpenFreeMap", "tiles.openfreemap.org", "ext", -118, -152, "mast", 11, "The style and 3D buildings for the driving view."),
    P("photon", "Photon", "photon.komoot.io", "ext", -86, -152, "mast", 11, "Place search and addresses for clicked spots, on the OpenStreetMap map."),
    P("gmaps", "Google Maps & Places", "Maps JavaScript API, Places API (New)", "ext", -52, -152, "mast", 15, "Google's map and place search, with the browser's own restricted key."),
    P("wi511", "Wisconsin 511", "511wi.gov/api/v2", "ext", 15, -152, "mast", 13, "Official closures, incidents and travel times. Free key, fetched at most every 5 minutes."),
    P("wzdx", "Work Zone Feed", "511wi.gov/api/wzdx", "ext", 47, -152, "mast", 13, "Every work zone in Wisconsin (WZDx). Public, no key, about 6 MB, fetched at most every 5 minutes."),
    P("tomtom", "TomTom", "api.tomtom.com", "ext", 79, -152, "mast", 15, "Jams, closures and crashes on every street, plus the traffic map. Capped at 80 requests and 6,000 images a day."),
    P("apify", "Apify (off)", "api.apify.com", "ext", 111, -152, "mast", 9, "An optional traffic source. Paid, and only used when both listed and given a token, so nothing flies here by default."),
    P("google", "Google Routes API", "routes.googleapis.com", "ext", 188, -104, "island", 22, "Google's own route suggestions and live-traffic prices, at Pro tier when traffic-aware. The only stop that costs money per trip.", 1),
    P("nws", "National Weather Service", "api.weather.gov", "ext", 165, -30, "lighthouse", 18, "Free weather alerts, needing no key. Answers are cached 10 minutes per spot."),
    P("mcts", "MCTS Schedule", "kamino.mcts.org GTFS feed", "ext", 182, 28, "island", 10, "Milwaukee County Transit System's bus schedule. Fetched at most once a week, with about a million stop times."),
    P("overpass", "OpenStreetMap", "Overpass API, slice.openstreetmap.us", "ext", 190, 70, "island", 14, "The road data behind every map we design on. Credited as © OpenStreetMap contributors."),
    P("nhtsa", "NHTSA FARS", "static.nhtsa.gov", "ext", 186, 104, "island", 10, "Public records of fatal crashes, 2020 to 2024 by default."),
  ];

  // [id, mode, from, to, what it is, what it carries, options]
  const F = (id, mode, from, to, label, carries, o = {}) => ({ id, mode, from, to, label, carries, ...o });
  const FLOWS = [
    F("f_edit", "foot", "editing", "app", "The trip to plan", "start, destination, stops"),
    F("f_core", "foot", "core", "app", "Shared state", "state, settings"),
    F("f_results", "foot", "app", "results", "The reply, to draw", "TripResponse"),
    F("f_draw", "foot", "results", "maps", "Lines and markers to draw", "routes, closures, risky turns"),
    F("f_layers", "foot", "layers", "maps", "The map's look", "base map, overlays"),
    F("f_drive", "foot", "results", "drive", "The route picked to follow", "route, maneuvers"),
    F("f_3d", "foot", "drive", "drive3d", "Position for the 3D view", "location, heading"),
    F("f_expo", "foot", "expo", "app", "Sample trips in demo mode", "sample trip"),
    F("f_trips", "foot", "trips", "app", "A recent trip to plan again", "start, destination, stops"),
    F("f_i18n", "foot", "i18n", "app", "Text in Spanish", "translated strings"),
    F("f_bike", "foot", "app", "bikejs", "A bike or walking trip", "active mode"),
    F("f_transit", "foot", "app", "transitjs", "A bus trip", "trip"),
    F("f_sw", "foot", "maps", "sw", "Map images, caught by the service worker", "image requests"),
    F("f_vendor", "foot", "vendor", "maps", "The map libraries", "Leaflet, MapLibre GL"),
    F("d_gps", "drone", "gps", "drive", "A location fix", "lat, lng, heading, accuracy"),

    F("t_route", "taxi", "app", "main", "POST /route", "TripRequest", { back: "TripResponse" }),
    F("t_boot", "taxi", "app", "main", "The page's files, GET /app-config, GET /profiles", "GET", { back: "HTML, JS, settings" }),
    F("t_leave", "taxi", "results", "main", "POST /leave-times", "the trip", { back: "the safest time to leave" }),
    F("t_bike", "taxi", "bikejs", "main", "POST /bike-route, /walk-route, GET /bike-stress", "BikeTripRequest", { back: "plan by stress" }),
    F("t_transit", "taxi", "transitjs", "main", "POST /transit-route", "TransitTripRequest", { back: "bus options" }),
    F("t_buses", "taxi", "layers", "main", "GET /bus-routes", "GET", { back: "bus lines", only: "osm" }),
    F("t_controls", "taxi", "drive3d", "main", "POST /road-controls", "encoded polyline", { back: "stop signs, lights" }),
    F("t_tiles", "taxi", "maps", "main", "GET /traffic-tiles/{z}/{x}/{y}.png", "tile address", { back: "PNG", only: "osm" }),
    F("t_game", "taxi", "game", "main", "POST /route, not counted as a trip", "sample trip", { back: "two routes" }),
    F("t_phone", "taxi", "phones", "main", "Any request, through the tunnel", "X-Access-Code", { back: "the same replies", tunnel: true }),
    F("t_eval", "taxi", "track", "main", "POST /route, 20 Milwaukee trips", "TripRequest", { back: "TripResponse" }),
    F("t_load", "taxi", "loadtest", "main", "Many visitors at once", "TripRequest", { back: "timings" }),
    F("t_ctl", "taxi", "control", "main", "POST /expo-control", "X-Admin-Code, a switch", { back: "new state" }),
    F("b_stats", "bus", "stats", "main", "GET /expo-stats, every 20 s", "GET", { back: "today's counts" }),
    F("b_answers", "bus", "answers", "main", "GET /expo-stats, /feedback-summary, every 20 s", "GET", { back: "yes and no counts" }),
    F("b_control", "bus", "control", "main", "GET /health, /expo-stats, /expo-control, every 15 s", "GET", { back: "readiness, usage" }),
    F("b_expo", "bus", "expo", "main", "GET /expo-control, every 30 s", "GET", { back: "demo paused or not" }),
    F("c_feedback", "courier", "results", "main", "POST /feedback", "yes or no, how much safer and slower", { oneWay: true }),
    F("c_guess", "courier", "game", "main", "POST /guess", "right or not, the two scores", { oneWay: true }),

    F("v_photon", "van", "maps", "photon", "Place search and addresses", "search text", { back: "places", only: "osm" }),
    F("v_tiles", "van", "sw", "suppliers", "Map images, up to 4,000 kept", "tile address", { back: "images", only: "osm" }),
    F("v_google", "van", "maps", "gmaps", "Google's map and place search", "browser key", { back: "map, places", only: "google" }),
    F("v_style", "van", "drive3d", "openfree", "The driving view's style and buildings", "style URL", { back: "style, vector tiles" }),

    F("s_engine", "tram", "main", "engine", "build_router_candidates()", "the trip, its profile and context", { back: "RoutePlan" }),
    F("s_events", "tram", "main", "road_events", "collect(), then snap", "the trip's area", { back: "road events" }),
    F("s_weather", "tram", "main", "weather", "alerts at the start", "origin", { back: "WeatherAlert" }),
    F("s_router", "tram", "engine", "router", "router.routes()", "ends, profile, events", { back: "RoutedPath" }),
    F("s_features", "tram", "engine", "features", "Measure each candidate", "raw route JSON", { back: "RouteFeatures" }),
    F("s_scoring", "tram", "engine", "scoring", "Rank the candidates", "candidates, profile", { back: "ranked plan" }),
    F("s_profiles", "tram", "main", "profiles", "get_profile()", "profile name", { back: "ScoringProfile" }),
    F("s_atlas", "tram", "router", "roadgraph", "The map's segments and turns", "segment lookups", { back: "edges" }),
    F("s_snap", "tram", "road_events", "roadgraph", "Match events to roads", "event ends", { back: "road paths" }),
    F("s_fuel", "tram", "features", "fuel", "Fuel for each stretch", "speed, distance", { back: "liters" }),
    F("s_sun", "tram", "features", "sun", "Minutes of sun glare", "time, heading", { back: "glare minutes" }),
    F("s_side", "tram", "features", "driving_side", "Which side traffic keeps to", "country code", { back: "keep left or right" }),
    F("s_hot", "tram", "features", "hotspots", "Crashes near a junction", "a junction", { back: "crash count" }),
    F("s_cand", "tram", "engine", "candidates", "Google's routes", "origin, destination", { back: "raw routes", only: "google" }),
    F("s_client", "tram", "candidates", "terminal", "computeRoutes request", "request body", { back: "raw routes", only: "google" }),
    F("s_price", "tram", "engine", "pricing", "price_route()", "a design", { back: "live time, match %", only: "google" }),
    F("s_price2", "tram", "pricing", "terminal", "Up to 25 points to pass through", "via points", { back: "Google's version", only: "google" }),
    F("s_bike", "tram", "main", "bikepy", "plan_with_stops()", "places, profile, events", { back: "plan by stress" }),
    F("s_bike2", "tram", "bikepy", "roadgraph", "The bike or walking map", "segment lookups", { back: "edges" }),
    F("s_hub", "tram", "main", "hub", "transit_plan.plan()", "origin, destination, time", { back: "bus options" }),
    F("s_walks", "tram", "hub", "bikepy", "Walks to and from the stops", "stop locations", { back: "walking routes" }),
    F("s_ctrl", "tram", "main", "road_controls", "roads_along()", "a route", { back: "signs, lights" }),
    F("s_tiles", "tram", "main", "tiles", "A traffic image", "z, x, y", { back: "PNG", only: "osm" }),
    F("s_rec", "tram", "main", "records", "Log an answer or a trip", "no places", { back: "summaries" }),
    F("s_expoctl", "tram", "main", "expoctl", "The control page's switches", "demo_paused, reset_stats", { back: "state" }),
    F("s_std", "tram", "main", "standards", "Settings and data models", "Settings, models", { back: "validated values" }),
    F("s_cli", "tram", "cli", "engine", "The same pipeline, from a terminal", "trip, --set overrides", { back: "ranked table" }),

    F("u_search", "subway", "router", "search_rs", "The A* route search, with reverse_bound()", "flat arrays, costs", { back: "cheapest path" }),
    F("u_bike", "subway", "bikepy", "search_rs", "The same search, on the bike and walking maps", "flat arrays, costs", { back: "cheapest path" }),
    F("u_atlas", "subway", "roadgraph", "search_rs", "The map's turns, compiled to arrays", "turn table", { back: "handle" }),
    F("u_feat", "subway", "features", "geometry_rs", "What a route passes", "route points", { back: "zones, crossings" }),
    F("u_events", "subway", "road_events", "geometry_rs", "What's near each event", "event paths", { back: "matches" }),
    F("u_price", "subway", "pricing", "geometry_rs", "How closely Google followed", "two polylines", { back: "match %", only: "google" }),
    F("u_geo2", "subway", "roadgraph", "geometry_rs", "Nearest road, on a grid", "points", { back: "segments" }),

    F("r_graph", "freight", "graphs", "roadgraph", "Car, bike and walking maps, at start-up", "*.json.gz", { oneWay: true }),
    F("r_ctrl", "freight", "graphs", "road_controls", "Stop signs and lights, at start-up", "*-controls.json.gz", { oneWay: true }),
    F("r_crash", "freight", "crashes", "hotspots", "Crash locations, at start-up", "*.csv", { oneWay: true }),
    F("r_build", "freight", "pier_osm", "foundry", "Downloaded road data", "OSM tiles", { oneWay: true }),
    F("r_write", "freight", "foundry", "graphs", "A newly built map", "*.json.gz", { oneWay: true }),
    F("r_crash2", "freight", "pier_crash", "crashes", "The area's crashes", "*.csv", { oneWay: true }),

    F("k_cache", "forklift", "terminal", "hangar", "Saved Google answers", "request hash", { back: "saved answer", only: "google" }),
    F("k_usage", "forklift", "terminal", "atc", "Today's request count", "+1", { back: "under the cap?", only: "google" }),
    F("k_rec", "forklift", "records", "vault", "feedback.jsonl, trips.jsonl, guesses.jsonl", "one JSON line", { back: "the lines" }),
    F("k_ctl", "forklift", "expoctl", "vault", "expo-control.json", "state", { back: "state" }),
    F("k_tomtom", "forklift", "road_events", "vault", "The last TomTom answer", "tomtom-incidents.json", { back: "reused after a restart", only: "osm" }),

    F("h_osm", "ship", "overpass", "pier_osm", "Roads, signals, schools, trails, sidewalks", "Overpass JSON or .osm.pbf", { oneWay: true }),
    F("h_fars", "ship", "nhtsa", "pier_crash", "Fatal crash files, about 170 MB", "FARS ZIPs", { oneWay: true }),
    F("h_gtfs", "ship", "mcts", "hub", "The bus schedule, at most weekly", "transit-feed.zip", { oneWay: true }),

    F("e_tomtom", "heli", "road_events", "tomtom", "Traffic incidents, at most every 10 minutes", "the metro's box", { back: "jams, closures", only: "osm" }),
    F("e_511", "heli", "road_events", "wi511", "Events and travel times, every 5 minutes", "API key", { back: "closures, incidents" }),
    F("e_wzdx", "heli", "road_events", "wzdx", "Work zones, every 5 minutes", "GET", { back: "work zones" }),
    F("e_nws", "heli", "weather", "nws", "Active alerts at a point", "lat, lng", { back: "alerts" }),
    F("e_tiles", "heli", "tiles", "tomtom", "Traffic images, kept 3 minutes", "z, x, y, key", { back: "PNG", only: "osm" }),
    F("e_apify", "heli", "road_events", "apify", "Off unless listed and given a token", "tile list", { idle: true }),

    F("a_google", "plane", "terminal", "google", "computeRoutes", "origin, destination, via points", { back: "routes, live traffic", only: "google" }),
  ];

  // The street grid. Each x list crosses each z list inside its district.
  const STREETS = {
    west: { xs: [-150, -120, -90, -60, -34], zs: [-90, -60, -30, 0, 30, 60, 90] },
    down: { xs: [-2, 28, 58, 88, 118], zs: [-90, -60, -30, 0, 30] },
    yard: { xs: [-2, 28, 58, 88, 118], zs: [62, 90] },
  };
  // Water and land, as boxes: [x0, x1, z0, z1]
  const LAND = { west: [-170, -26, -125, 112], down: [-10, 135, -125, 38], yard: [-10, 135, 52, 112], north: [-170, 135, -168, -136] };
  const SLAB = [-178, 215, -128, 116];
  const TRENCH = [63, 113, 5, 25];

  return { DISTRICTS, MODES, PLACES, FLOWS, STREETS, LAND, SLAB, TRENCH };
})();
