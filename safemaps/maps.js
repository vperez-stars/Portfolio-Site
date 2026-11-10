// The map behind the page: Google's (with live traffic and Google place search)
// or OpenStreetMap's (through Leaflet, with OpenStreetMap place search). The
// server's ROUTES_MAP picks one (GET /app-config). Both offer the same small
// interface, so app.js never touches a map library directly:
//
//   await view.load()                     load the library
//   await view.create(element, options)   { center, zoom, dark, onClick(point), onContextMenu(point), onDragStart() }
//                                         onContextMenu: a right-click, or a long press on a touch screen
//                                         dark: start with the dark map (Google's can only be dark from the start)
//   view.line(points, style)              { color, weight, opacity, dashed, under, popup } -> { front(on), remove() }
//                                         under: beneath every other line (the OpenStreetMap map draws in order)
//                                         popup: { heading, text }, opened by a click on the line, which then
//                                         doesn't count as a map click
//   view.marker(point, element, options)  { title, zIndex, popup, onClick, onDragEnd } -> { move(point), remove() }
//                                         popup: { heading, text }, opened by a click or tap
//                                         onClick: called on a click or tap instead (no popup)
//                                         onDragEnd(point): the marker can be dragged; called where it's dropped
//   view.markerGroup()                    -> { add(point, element, options), show(on), clear() }
//                                         markers that cluster into a count where crowded (OpenStreetMap)
//   view.fit(points), view.panTo(point), view.setZoom(zoom)
//   view.center()                         the point at the middle of the map
//   view.view(), view.onMoveEnd(handler)  what the map shows ({ south, west, north, east, zoom }), and when it moves
//   view.traffic(on), view.hasTraffic     a traffic layer, when the map has one
//   view.baseMap(kind)                    "roadmap", "satellite", "terrain" or "dark"
//   view.switchesDark                     whether baseMap("dark") works after create (not on Google's map)
//   view.transit(on), view.biking(on)     transit lines, bike lanes and trails over the map
//   await view.search(container, placeholder, onPick(place))   place search in a box
//   await view.reverse(point)             the nearest address, { label, countryCode }, or null
//   view.credit(text, on)                 a credit line for data drawn on the map
//
// Points are { lat, lng }. Google's terms don't allow its results on another
// map, so the OpenStreetMap page never loads Google at all. Its traffic layer
// is TomTom's, served through our server (trafficTiles), which holds the key.

// Served from here (frontend/vendor), so the map works without the internet once its images are kept (sw.js).
const LEAFLET = "vendor/leaflet/"; // Leaflet 1.9.4
const MARKER_CLUSTER = "vendor/markercluster/"; // Leaflet.markercluster 1.5.3
const CLUSTER_RADIUS_PX = 40; // markers closer than this on screen share one count
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const TOMTOM_CREDIT = 'Traffic &copy; <a href="https://www.tomtom.com">TomTom</a>';
// The OpenStreetMap map's other looks, all free with credit. maxNativeZoom: past it, tiles are enlarged.
const OSM_BASE_MAPS = {
  roadmap: { url: OSM_TILES, maxNativeZoom: 19, attribution: OSM_CREDIT },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxNativeZoom: 18,
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
  },
  // The roadmap's own tiles, darkened by the page (styles.css): no key, and the offline copy serves both.
  dark: { url: OSM_TILES, maxNativeZoom: 19, className: "map-tiles--dark", attribution: OSM_CREDIT },
  terrain: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    maxNativeZoom: 17,
    attribution: `${OSM_CREDIT}, SRTM · Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`,
  },
};
// Transparent layers over it. OpenStreetMap has no free bus layer, so transit shows rail: trains, streetcar, light rail.
const OSM_OVERLAYS = {
  transit: {
    url: "https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
    attribution: 'Rail &copy; <a href="https://www.openrailwaymap.org">OpenRailwayMap</a>',
  },
  biking: {
    url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm-lite/{z}/{x}/{y}.png",
    attribution: 'Bike lanes &copy; <a href="https://www.cyclosm.org">CyclOSM</a>',
  },
};
// Tile layers stack by zIndex: the base map, then transit and bike lanes, then traffic on top.
const Z_BASE = 0;
const Z_OVERLAY = 2;
const Z_TRAFFIC = 3;
const PHOTON = "https://photon.komoot.io/api/";
const PHOTON_REVERSE = "https://photon.komoot.io/reverse";
// The OpenStreetMap Foundation's address lookup (fair use: one lookup per click is well inside it).
const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";
const LOOKUP_TIMEOUT_MS = 5000;
const SEARCH_BIAS = { lat: 43.0389, lng: -87.9065 }; // prefer places around Milwaukee

// trafficTiles: the OpenStreetMap map's traffic layer, a tile URL template ({z}/{x}/{y}); none means no layer.
// language: "en" or "es", for Google's map: its labels, controls and place search.
export function createMapView(kind, { mapsApiKey, mapId, onAuthFailure, trafficTiles = null, language = "en" } = {}) {
  return kind === "osm" ? new OsmView(trafficTiles) : new GoogleView(mapsApiKey, mapId, onAuthFailure, language);
}

// ---- Google

class GoogleView {
  hasTraffic = true;
  switchesDark = false;

  constructor(apiKey, mapId, onAuthFailure, language) {
    this.language = language;
    this.apiKey = apiKey;
    this.mapId = mapId || "DEMO_MAP_ID";
    this.onAuthFailure = onAuthFailure;
  }

  load() {
    return new Promise((resolve, reject) => {
      window.initMap = resolve;
      // Google calls this when it rejects the key (wrong website, service not enabled, ...).
      window.gm_authFailure = () => this.onAuthFailure && this.onAuthFailure();
      const params = new URLSearchParams({
        key: this.apiKey,
        v: "weekly",
        loading: "async",
        libraries: "places,marker",
        language: this.language,
        region: "US",
        callback: "initMap",
      });
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      script.async = true;
      script.onerror = () => reject(new Error("The map couldn't load. Check the key and your network."));
      document.head.append(script);
    });
  }

  async create(element, { center, zoom, dark = false, onClick, onContextMenu, onDragStart }) {
    this.map = new google.maps.Map(element, {
      center,
      zoom,
      colorScheme: dark ? "DARK" : "LIGHT", // fixed once the map is made
      mapId: this.mapId,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    this.trafficLayer = new google.maps.TrafficLayer();
    this.transitLayer = new google.maps.TransitLayer();
    this.bikingLayer = new google.maps.BicyclingLayer();
    ({ AdvancedMarkerElement: this.Marker } = await google.maps.importLibrary("marker"));
    this.map.addListener("click", (event) => onClick({ lat: event.latLng.lat(), lng: event.latLng.lng() }));
    if (onContextMenu) this.onContextMenu(element, onContextMenu);
    this.map.addListener("dragstart", onDragStart);
  }

  // The browser's own contextmenu event (a right-click, or a long press on Android), turned into a
  // spot on the map. The map's own contextmenu event didn't reliably come on this page.
  onContextMenu(element, handler) {
    const overlay = new google.maps.OverlayView(); // only for its projection: pixels to places
    overlay.onAdd = overlay.draw = overlay.onRemove = () => {};
    overlay.setMap(this.map);
    element.addEventListener(
      "contextmenu",
      (event) => {
        const projection = overlay.getProjection();
        if (!projection || event.target.closest("gmp-advanced-marker, .gm-style-iw-c, .gmnoprint, .gm-control-active, button, a")) return;
        event.preventDefault();
        const box = element.getBoundingClientRect();
        const at = projection.fromContainerPixelToLatLng(new google.maps.Point(event.clientX - box.left, event.clientY - box.top));
        handler({ lat: at.lat(), lng: at.lng() });
      },
      true,
    );
  }

  // under: Google stacks lines by zIndex alone.
  line(points, { color, weight = 5, opacity = 1, dashed = false, zIndex = 0, popup = null }) {
    const options = dashed
      ? {
          strokeOpacity: 0,
          icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: color, scale: 3 }, offset: "0", repeat: "14px" }],
        }
      : { strokeColor: color, strokeWeight: weight, strokeOpacity: opacity };
    const line = new google.maps.Polyline({ map: this.map, path: points, clickable: Boolean(popup), zIndex, ...options });
    if (popup) {
      line.addListener("click", (event) => {
        this.info ||= new google.maps.InfoWindow();
        this.info.setContent(popupContent(popup));
        this.info.setPosition(event.latLng);
        this.info.open({ map: this.map });
      });
    }
    return {
      front: (on) => line.setOptions({ zIndex: on ? zIndex + 100 : zIndex }),
      remove: () => line.setMap(null),
    };
  }

  marker(point, element, { title = "", zIndex, popup = null, onClick = null, onDragEnd = null } = {}) {
    const marker = new this.Marker({
      map: this.map,
      position: point,
      content: element,
      title,
      zIndex,
      gmpClickable: Boolean(popup || onClick),
      gmpDraggable: Boolean(onDragEnd),
    });
    if (onDragEnd) {
      marker.addListener("dragend", () => {
        const at = marker.position; // a LatLng or a { lat, lng }, depending on the version
        onDragEnd(typeof at.lat === "function" ? { lat: at.lat(), lng: at.lng() } : { lat: at.lat, lng: at.lng });
      });
    }
    if (onClick) {
      marker.addEventListener("gmp-click", onClick);
    } else if (popup) {
      marker.addEventListener("gmp-click", () => {
        this.info ||= new google.maps.InfoWindow();
        this.info.setContent(popupContent(popup));
        this.info.open({ anchor: marker, map: this.map });
      });
    }
    return {
      move: (to) => {
        marker.position = to;
      },
      show: (on) => {
        marker.map = on ? this.map : null;
      },
      remove: () => {
        marker.map = null;
      },
    };
  }

  // Google's map shows fewer closures (no TomTom), so its markers don't cluster.
  markerGroup() {
    const markers = [];
    let shown = true;
    return {
      add: (point, element, options) => {
        const marker = this.marker(point, element, options);
        marker.show(shown);
        markers.push(marker);
        return marker;
      },
      show: (on) => {
        shown = on;
        markers.forEach((marker) => marker.show(on));
      },
      clear: () => markers.splice(0).forEach((marker) => marker.remove()),
    };
  }

  fit(points) {
    const bounds = new google.maps.LatLngBounds();
    points.forEach((point) => bounds.extend(point));
    if (!bounds.isEmpty()) this.map.fitBounds(bounds, 48);
  }

  panTo(point) {
    this.map.panTo(point);
  }

  center() {
    const middle = this.map.getCenter();
    return { lat: middle.lat(), lng: middle.lng() };
  }

  view() {
    const box = this.map.getBounds();
    if (!box) return null;
    const [sw, ne] = [box.getSouthWest(), box.getNorthEast()];
    return { south: sw.lat(), west: sw.lng(), north: ne.lat(), east: ne.lng(), zoom: this.map.getZoom() };
  }

  onMoveEnd(handler) {
    this.map.addListener("idle", handler);
  }

  setZoom(zoom) {
    this.map.setZoom(zoom);
  }

  traffic(on) {
    this.trafficLayer.setMap(on ? this.map : null);
  }

  // Satellite comes with street names on it (Google's "hybrid"). Dark is set when the map is made.
  baseMap(kind) {
    this.map.setMapTypeId({ satellite: "hybrid", terrain: "terrain" }[kind] || "roadmap");
  }

  transit(on) {
    this.transitLayer.setMap(on ? this.map : null);
  }

  biking(on) {
    this.bikingLayer.setMap(on ? this.map : null);
  }

  // Google's own credits cover everything this map draws.
  credit() {}

  // Needs the Geocoding API enabled for the key; without it, clicked points keep their coordinates.
  async reverse(point) {
    try {
      this.geocoder ||= new google.maps.Geocoder();
      const { results } = await this.geocoder.geocode({ location: point });
      const best = results && results[0];
      if (!best) return null;
      const country = best.address_components.find((part) => part.types.includes("country"));
      return {
        label: best.formatted_address.replace(/, USA$/, ""),
        countryCode: country ? country.short_name : null,
      };
    } catch (error) {
      console.warn("Address lookup unavailable:", error);
      return null;
    }
  }

  async search(container, placeholder, onPick) {
    try {
      const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");
      let search;
      try {
        search = new PlaceAutocompleteElement({
          includedRegionCodes: ["us"],
          locationBias: { center: SEARCH_BIAS, radius: 50000 },
        });
      } catch (error) {
        console.warn("Place search options not accepted; using defaults:", error);
        search = new PlaceAutocompleteElement({});
      }
      search.setAttribute("placeholder", placeholder);
      const pick = async (place) => {
        await place.fetchFields({ fields: ["location", "displayName", "formattedAddress", "addressComponents"] });
        const country = (place.addressComponents || []).find((part) => part.types.includes("country"));
        onPick({
          lat: place.location.lat(),
          lng: place.location.lng(),
          label: place.displayName || place.formattedAddress,
          countryCode: country ? country.shortText : null,
        });
      };
      // Current versions fire "gmp-select"; older ones fired "gmp-placeselect".
      search.addEventListener("gmp-select", (event) => pick(event.placePrediction.toPlace()));
      search.addEventListener("gmp-placeselect", (event) => pick(event.place));
      container.replaceChildren(search);
    } catch (error) {
      console.warn("Place search unavailable:", error);
      container.textContent = "Place search is unavailable. Click the map instead.";
    }
  }
}

// ---- OpenStreetMap (Leaflet)

class OsmView {
  switchesDark = true;

  constructor(trafficTiles) {
    this.trafficTiles = trafficTiles;
    this.hasTraffic = Boolean(trafficTiles);
    this.trafficLayer = null;
    this.base = null;
    this.overlays = {};
  }

  async load() {
    addStylesheet(`${LEAFLET}leaflet.css`);
    try {
      await loadScript(`${LEAFLET}leaflet.js`);
    } catch {
      throw new Error("The map couldn't load. Check your network.");
    }
    // Clustering is a nicety: without it, every marker shows on its own.
    try {
      addStylesheet(`${MARKER_CLUSTER}MarkerCluster.css`);
      await loadScript(`${MARKER_CLUSTER}leaflet.markercluster.js`);
    } catch (error) {
      console.warn("Marker clustering unavailable:", error);
    }
  }

  async create(element, { center, zoom, dark = false, onClick, onContextMenu, onDragStart }) {
    this.map = L.map(element, { zoomControl: true }).setView([center.lat, center.lng], zoom);
    this.map.createPane("under").style.zIndex = 350; // between the map's tiles (200) and its lines (400)
    this.baseMap(dark ? "dark" : "roadmap");
    this.map.on("click", (event) => onClick({ lat: event.latlng.lat, lng: event.latlng.lng }));
    // Leaflet turns a long press into a contextmenu event on touch screens too.
    if (onContextMenu) this.map.on("contextmenu", (event) => onContextMenu({ lat: event.latlng.lat, lng: event.latlng.lng }));
    this.map.on("dragstart", onDragStart);
  }

  line(points, { color, weight = 5, opacity = 1, dashed = false, under = false, popup = null }) {
    const line = L.polyline(
      points.map((p) => [p.lat, p.lng]),
      {
        color,
        weight: dashed ? 4 : weight,
        opacity,
        dashArray: dashed ? "2 10" : null,
        interactive: Boolean(popup),
        bubblingMouseEvents: false, // a click on the line opens its popup, and doesn't set a trip point too
        pane: under ? "under" : "overlayPane",
      },
    ).addTo(this.map);
    if (popup) line.bindPopup(popupContent(popup));
    // Leaflet draws in the order lines are added; bring one forward to raise it.
    return { front: (on) => on && line.bringToFront(), remove: () => line.remove() };
  }

  // layer: a marker group's layer to add it to, instead of the map.
  marker(point, element, { title = "", zIndex = 0, popup = null, onClick = null, onDragEnd = null, layer = null } = {}) {
    // Anchored at the bottom middle, like Google's markers, so the same styles fit both.
    const anchor = document.createElement("div");
    anchor.className = "lf-anchor";
    anchor.append(element);
    const marker = L.marker([point.lat, point.lng], {
      icon: L.divIcon({ html: anchor, className: "lf-icon", iconSize: [0, 0] }),
      title,
      zIndexOffset: zIndex * 100,
      interactive: Boolean(title || popup || onClick || onDragEnd),
      keyboard: Boolean(popup || onClick),
      draggable: Boolean(onDragEnd),
      autoPan: true, // dragged to the edge, the map follows
    });
    // A marker's click doesn't reach the map, so it never counts as a map click too; nor does the end of a drag.
    if (onClick) marker.on("click", onClick);
    if (onDragEnd) marker.on("dragend", () => onDragEnd({ lat: marker.getLatLng().lat, lng: marker.getLatLng().lng }));
    else if (popup) marker.bindPopup(popupContent(popup), { offset: [0, -6] });
    marker.addTo(layer || this.map);
    return {
      move: (to) => marker.setLatLng([to.lat, to.lng]),
      show: (on) => (on ? marker.addTo(layer || this.map) : (layer || this.map).removeLayer(marker)),
      remove: () => (layer || this.map).removeLayer(marker),
    };
  }

  // Markers that merge into a count where they crowd together, and split apart as the map zooms in.
  markerGroup() {
    const layer = L.markerClusterGroup
      ? L.markerClusterGroup({
          maxClusterRadius: CLUSTER_RADIUS_PX,
          showCoverageOnHover: false,
          iconCreateFunction: (cluster) =>
            L.divIcon({ html: `<span>${cluster.getChildCount()}</span>`, className: "cluster", iconSize: [30, 30] }),
        })
      : L.layerGroup();
    layer.addTo(this.map);
    return {
      add: (point, element, options) => this.marker(point, element, { ...options, layer }),
      show: (on) => (on ? layer.addTo(this.map) : layer.remove()),
      clear: () => layer.clearLayers(),
    };
  }

  fit(points) {
    if (points.length) this.map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [48, 48] });
  }

  panTo(point) {
    this.map.panTo([point.lat, point.lng]);
  }

  center() {
    const { lat, lng } = this.map.getCenter();
    return { lat, lng };
  }

  view() {
    const box = this.map.getBounds();
    return { south: box.getSouth(), west: box.getWest(), north: box.getNorth(), east: box.getEast(), zoom: this.map.getZoom() };
  }

  onMoveEnd(handler) {
    this.map.on("moveend", handler);
  }

  setZoom(zoom) {
    this.map.setZoom(zoom);
  }

  // TomTom's traffic map over the streets: green, orange and red by speed. Routes stay on top.
  traffic(on) {
    if (!this.trafficTiles) return;
    this.trafficLayer ||= L.tileLayer(this.trafficTiles, { maxZoom: 19, opacity: 0.85, zIndex: Z_TRAFFIC, attribution: TOMTOM_CREDIT });
    if (on) this.trafficLayer.addTo(this.map);
    else this.trafficLayer.remove();
  }

  baseMap(kind) {
    const { url, ...options } = OSM_BASE_MAPS[kind] || OSM_BASE_MAPS.roadmap;
    if (this.base) this.base.remove();
    // crossOrigin: fetched so the page can keep them for offline use (sw.js); every one of these servers allows it.
    this.base = L.tileLayer(url, { maxZoom: 19, zIndex: Z_BASE, crossOrigin: "anonymous", ...options }).addTo(this.map);
  }

  transit(on) {
    this.overlay("transit", on);
  }

  biking(on) {
    this.overlay("biking", on);
  }

  credit(text, on) {
    this.credits ||= new Set(); // Leaflet counts each add, so a credit added twice needs two removes
    if (on === this.credits.has(text)) return;
    if (on) this.credits.add(text) && this.map.attributionControl.addAttribution(text);
    else this.credits.delete(text) && this.map.attributionControl.removeAttribution(text);
  }

  // Photon first; where it fails or doesn't answer in time (some networks can't reach it), OpenStreetMap's
  // own Nominatim, which then answers the rest of the visit's lookups.
  async reverse(point) {
    if (!this.photonDown) {
      try {
        const params = new URLSearchParams({ lat: point.lat, lon: point.lng, lang: "en", limit: 1 });
        const response = await fetch(`${PHOTON_REVERSE}?${params}`, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
        if (!response.ok) throw new Error(`Photon answered ${response.status}`);
        const { features } = await response.json();
        return features.length ? photonPlace(features[0]) : null;
      } catch (error) {
        console.warn("Address lookup through Photon failed, trying Nominatim:", error);
        this.photonDown = true;
      }
    }
    try {
      const params = new URLSearchParams({ lat: point.lat, lon: point.lng, format: "jsonv2", "accept-language": "en" });
      const response = await fetch(`${NOMINATIM_REVERSE}?${params}`, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
      const place = await response.json();
      return place.address ? nominatimPlace(place) : null;
    } catch (error) {
      console.warn("Address lookup failed:", error);
      return null;
    }
  }

  overlay(name, on) {
    const { url, attribution } = OSM_OVERLAYS[name];
    this.overlays[name] ||= L.tileLayer(url, { maxZoom: 19, zIndex: Z_OVERLAY, attribution, crossOrigin: "anonymous" });
    if (on) this.overlays[name].addTo(this.map);
    else this.overlays[name].remove();
  }

  // Place search through Photon, built on OpenStreetMap data (free, fair use). Arrow keys move
  // through the suggestions, Enter picks one (the first if none is highlighted), Escape closes them.
  async search(container, placeholder, onPick) {
    const listId = `${container.id}-suggestions`;
    const input = document.createElement("input");
    Object.assign(input, { type: "search", className: "osm-search", placeholder, autocomplete: "off" });
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-label", placeholder);
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", listId);
    input.setAttribute("aria-expanded", "false");
    const list = document.createElement("ul");
    Object.assign(list, { id: listId, className: "osm-suggestions", hidden: true });
    list.setAttribute("role", "listbox");
    let timer = null;
    let results = [];
    let active = -1; // the highlighted suggestion

    const open = (on) => {
      list.hidden = !on;
      input.setAttribute("aria-expanded", String(on));
      if (!on) highlight(-1);
    };
    const highlight = (index) => {
      active = index;
      [...list.children].forEach((item, i) => item.setAttribute("aria-selected", String(i === index)));
      if (index >= 0) {
        input.setAttribute("aria-activedescendant", `${listId}-${index}`);
        list.children[index].scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    };
    const choose = (place) => {
      input.value = place.label;
      open(false);
      onPick(place);
    };
    const show = () => {
      list.replaceChildren(
        ...results.map((place, i) => {
          const item = document.createElement("li");
          Object.assign(item, { id: `${listId}-${i}`, textContent: place.label });
          item.setAttribute("role", "option");
          item.addEventListener("mousedown", (event) => {
            event.preventDefault(); // keep focus, so blur doesn't hide the list first
            choose(place);
          });
          return item;
        }),
      );
      open(results.length > 0);
      highlight(-1);
    };
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const text = input.value.trim();
      if (text.length < 3) {
        results = [];
        return show();
      }
      timer = setTimeout(async () => {
        try {
          results = await photon(text);
        } catch (error) {
          console.warn("Place search failed:", error);
          results = [];
        }
        show();
      }, 300);
    });
    input.addEventListener("keydown", (event) => {
      const count = list.hidden ? 0 : results.length;
      if (event.key === "ArrowDown" && count) {
        event.preventDefault();
        highlight((active + 1) % count);
      } else if (event.key === "ArrowUp" && count) {
        event.preventDefault();
        highlight(active <= 0 ? count - 1 : active - 1);
      } else if (event.key === "Enter" && results.length) {
        event.preventDefault();
        choose(results[Math.max(active, 0)]);
      } else if (event.key === "Escape" && count) {
        event.preventDefault();
        open(false);
      }
    });
    input.addEventListener("blur", () => setTimeout(() => open(false), 150));
    container.replaceChildren(input, list);
  }
}

// A marker's popup: a heading and a line of text, set as text (feed descriptions are never parsed as HTML).
function popupContent({ heading, text }) {
  const box = document.createElement("div");
  box.className = "popup";
  const title = document.createElement("strong");
  title.textContent = heading;
  box.append(title);
  if (text) {
    const body = document.createElement("p");
    body.textContent = text;
    box.append(body);
  }
  return box;
}

function addStylesheet(href) {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = href;
  document.head.append(css);
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`${src} didn't load`));
    document.head.append(script);
  });
}

async function photon(text) {
  const params = new URLSearchParams({ q: text, lat: SEARCH_BIAS.lat, lon: SEARCH_BIAS.lng, limit: 5, lang: "en" });
  const response = await fetch(`${PHOTON}?${params}`);
  if (!response.ok) throw new Error(`Photon answered ${response.status}`);
  const { features } = await response.json();
  return features.map(photonPlace);
}

// "Fiserv Forum, 1111 N Vel R. Phillips Ave, Milwaukee, Wisconsin" from one of Photon's results.
function photonPlace({ geometry, properties: p }) {
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const parts = [p.name, street, p.city || p.district, p.state].filter(Boolean);
  return {
    lat: geometry.coordinates[1],
    lng: geometry.coordinates[0],
    label: [...new Set(parts)].join(", "),
    countryCode: p.countrycode ? p.countrycode.toUpperCase() : null,
  };
}

// A Nominatim answer in the same shape and wording as Photon's: the place's name, the street address, the town.
function nominatimPlace({ name, address: a }) {
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const town = a.city || a.town || a.village || a.hamlet || a.suburb;
  const parts = [name, street, town, a.state].filter(Boolean);
  return {
    label: [...new Set(parts)].join(", "),
    countryCode: a.country_code ? a.country_code.toUpperCase() : null,
  };
}

// ---- Geometry without a map library

// Google's encoded polyline format, which every route from the server uses.
export function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

const EARTH_RADIUS_M = 6371008.8;
const radians = (degrees) => (degrees * Math.PI) / 180;

export function distanceM(a, b) {
  const h =
    Math.sin(radians(b.lat - a.lat) / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Compass bearing from one point to another, degrees clockwise from north.
export function bearing(from, to) {
  const y = Math.sin(radians(to.lng - from.lng)) * Math.cos(radians(to.lat));
  const x =
    Math.cos(radians(from.lat)) * Math.sin(radians(to.lat)) -
    Math.sin(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.cos(radians(to.lng - from.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
