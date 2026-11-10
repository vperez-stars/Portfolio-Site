# Libraries served with the page

Copied unchanged from npm (through unpkg.com), so the web map works without the internet:

| Folder | Package | Version | License |
| --- | --- | --- | --- |
| `leaflet/` | [leaflet](https://leafletjs.com) | 1.9.4 | BSD-2-Clause (`leaflet/LICENSE`) |
| `markercluster/` | [leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) | 1.5.3 | MIT (`markercluster/MIT-LICENCE.txt`) |
| `maplibre/` | [maplibre-gl](https://maplibre.org) | 4.7.1 | BSD-3-Clause (`maplibre/LICENSE.txt`) |
| `qrcode-generator/` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | 1.4.4 | MIT (in the file's header) |
| `three/` | [three](https://threejs.org) | 0.147.0 | MIT (`three/LICENSE`) |

To update one, download the same files from `https://unpkg.com/<package>@<version>/` and change the version here and in `maps.js`, `core.js` or `drive3d.js`.

`three/` is for `city.html`: `build/three.min.js` and `examples/js/controls/OrbitControls.js`. Those non-module builds are gone from later versions of the package, so moving past 0.147 means loading it as modules.
