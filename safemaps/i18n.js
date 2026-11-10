// The page in Spanish.
//
// Which Spanish: Mexico's, as most Spanish speakers in Milwaukee would expect, in the words its
// traffic rules use (Mexico City's Reglamento de Tránsito, the NOM-034 road-sign standard):
// conducir, dar vuelta a la izquierda, sentido contrario, glorieta, carril, incorporarse, cruce de
// ferrocarril, zona escolar. Spain's DGT agrees on most of these; its own ones (paso a nivel, cambio
// de sentido, giro, coche) aren't used. The screen's own words follow the navigation apps in Latin
// American Spanish (punto de partida, Tu ubicación, Tráfico, Terreno, Rutas en bicicleta), and so
// does the reader: tú, as those apps do. Phones are "celular", as people in Mexico and the US say.
// English is written into the page (index.html, the scripts) and comes from
// the server (route reasons, turn-by-turn directions); in Spanish, every piece of text is
// translated as it appears: whole phrases from PHRASES, phrases with numbers or names in them
// from PATTERNS. Text that matches neither (road names, closure descriptions from 511, weather
// alert names) stays as it is. The language is the browser's, or the one picked with the
// language button, remembered in this browser.

const LANG_KEY = "routes-lang";

export const lang = chooseLanguage();
export const locale = lang === "es" ? "es-US" : "en-US"; // for times, dates, numbers and the spoken voice

function chooseLanguage() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {
    // Storage blocked: the browser's language decides.
  }
  return (navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
}

// Switch to the other language: the page opens again at url (with the trip on it).
export function switchLanguage(url) {
  try {
    localStorage.setItem(LANG_KEY, lang === "es" ? "en" : "es");
  } catch {
    return; // nowhere to remember it: the page would open in the same language
  }
  window.location.href = url;
}

// ---- Whole phrases

const PHRASES = [
  // The panel
  ["Safe Route Planner", "Planificador de Rutas Seguras"],
  ["Safety first, then fuel, then time.", "Primero la seguridad, luego el combustible, luego el tiempo."],
  ["How it works", "Cómo funciona"],
  ["Open on your phone", "Abrir en tu celular"],
  ["Trip planner", "Planificador de viaje"],
  ["About this app", "Acerca de esta app"],
  ["Visitors' answers", "Respuestas de los visitantes"],
  ["Stats", "Estadísticas"],
  ["Inside the app", "Por dentro de la app (en inglés)"], // that page is in English only
  ["Back to the planner", "Volver al planificador"],
  ["The road ahead, seen from behind the car", "El camino por delante, visto desde atrás del auto"],
  ["STOP", "ALTO"],
  ["Preview the drive", "Vista previa del recorrido"],
  ["Stop the preview", "Detener la vista previa"],
  ["Preview", "Vista previa"],
  ["Preview speed", "Velocidad de la vista previa"],
  ["Now on", "Ahora en"],
  ["That's the end of the preview.", "Aquí termina la vista previa."],
  ["Stop sign", "Señal de alto"],
  ["Traffic light", "Semáforo"],
  ["Turn", "Vuelta"],
  ["Not every stop sign is mapped. Watch the road.", "No todas las señales de alto están en el mapa. Pon atención al camino."],
  ["Trip", "Viaje"],
  ["Start", "Punto de partida"],
  ["Destination", "Destino"],
  ["Swap", "Invertir"],
  ["Swap the start and destination", "Invertir el punto de partida y el destino"],
  ["Use my location", "Usar mi ubicación"],
  ["Locating…", "Buscando tu ubicación…"],
  ["Where from?", "¿Desde dónde?"],
  ["Where to?", "¿A dónde?"],
  ["Add a stop", "Agregar una parada"],
  ["Remove", "Quitar"],
  [
    "Search for a place, or click the map: the first click sets the start, the next the destination. Right-click (or press and hold) to add a stop. Drag a pin to move it, click it to remove it;",
    "Busca un lugar o haz clic en el mapa: el primer clic marca el punto de partida y el siguiente, el destino. Haz clic derecho (o mantén presionado) para agregar una parada. Arrastra un marcador para moverlo y haz clic en él para quitarlo;",
  ],
  ["Undo", "Deshacer"],
  [
    "on the map takes a change back. With the keyboard, Tab to the map: Enter puts a point at the cross in the middle, S a stop.",
    "en el mapa revierte un cambio. Con el teclado, usa Tab hasta el mapa: Enter pone un punto en la cruz del centro, y S, una parada.",
  ],
  ["Recent trips", "Viajes recientes"],
  ["Forget these trips", "Olvidar estos viajes"],
  ["Driver profile", "Perfil de conductor"],
  ["Extra time you'd accept for a safer route", "Tiempo extra que aceptarías por una ruta más segura"],
  ["No fixed limit", "Sin límite fijo"],
  ["Leave", "Salir"],
  ["Now", "Ahora"],
  ["In 1 hour", "En 1 hora"],
  ["Show closures", "Mostrar cierres"],
  ["Find route", "Buscar ruta"],
  ["Finding…", "Buscando…"],
  ["Clear", "Borrar"],
  ["Start driving", "Empezar a conducir"],
  ["Stop driving", "Dejar de conducir"],
  ["Spoken directions while driving", "Indicaciones por voz al conducir"],
  ["Advanced", "Avanzado"],
  ["Closures and slowdowns", "Cierres y demoras"],
  ["Automatic (best available)", "Automático (el mejor disponible)"],
  ["Wisconsin work zones (WZDx)", "Zonas de obra de Wisconsin (WZDx)"],
  ["Wisconsin 511 (official)", "Wisconsin 511 (oficial)"],
  ["TomTom traffic (every street)", "Tráfico de TomTom (todas las calles)"],
  ["Traffic speeds along routes", "Velocidades del tráfico en las rutas"],
  ["Traffic tiles (paid)", "Mapas de tráfico (de pago)"],
  ["None", "Ninguno"],
  ["Live traffic", "Tráfico en vivo"],
  ["Our router", "Nuestro sistema de rutas"],
  ["Plan again after each change on the map", "Volver a planificar tras cada cambio en el mapa"],
  ["Demo mode: show sample trips when no one's using it", "Modo demostración: mostrar viajes de ejemplo cuando nadie lo usa"],
  ["Safe & economical (recommended)", "Segura y económica (recomendado)"],
  ["Fastest", "La más rápida"],
  ["Avoid highways", "Evitar autopistas"],
  ["Scenic", "Panorámica"],
  ["Calm: extra wary of risky turns", "Tranquila: evita aún más los vueltas riesgosas"],
  ["Eco: least fuel", "Eco: el menor consumo"],
  ["New driver: avoids freeways and risky turns", "Conductor nuevo: evita autopistas y vueltas riesgosas"],

  // The map and what floats on it
  [
    "Map. Arrow keys move it, plus and minus zoom. Enter puts the start, then the destination, at the middle; S adds a stop there; Control Z undoes.",
    "Mapa. Las flechas lo mueven, más y menos acercan y alejan. Enter pone el punto de partida y luego el destino, en el centro; S agrega una parada ahí; Control Z deshace.",
  ],
  ["Re-center", "Centrar"],
  ["Map layers", "Capas del mapa"],
  ["Map type", "Tipo de mapa"],
  ["Default", "Mapa"],
  ["Satellite", "Satélite"],
  ["Terrain", "Terreno"],
  ["Traffic", "Tráfico"],
  ["Transit", "Transporte público"],
  ["Biking", "Rutas en bicicleta"],
  ["Only buses near the trip", "Solo rutas de autobús cerca del viaje"],
  ["Dark map at night", "Mapa oscuro de noche"],
  ["Map key", "Leyenda"],
  ["Recommended route", "Ruta recomendada"],
  ["Standard (fastest) route", "Ruta estándar (la más rápida)"],
  ["Other routes", "Otras rutas"],
  ["Road closed", "Calle cerrada"],
  ["Lane closure", "Cierre de carril"],
  ["Weather hazard", "Peligro por clima"],
  ["Road event", "Evento vial"],
  ["Weather hazard: fog, ice, flooding", "Peligro por clima: niebla, hielo, inundación"],
  ["Several closures: zoom in", "Varios cierres: acerca el mapa"],
  ["Risky turn across traffic", "Vuelta riesgosa que cruza el sentido contrario"],
  ["Risky turn the recommended route avoids", "Vuelta riesgosa que evita la ruta recomendada"],
  ["Railroad crossing (faded: one it avoids)", "Cruce de ferrocarril (tenue: uno que evita)"],
  ["School zone at school times (faded: one it avoids)", "Zona escolar en horario escolar (tenue: una que evita)"],
  ["Traffic: flowing → jammed", "Tráfico: fluido → congestionado"],
  ["Bus routes, each its own color", "Rutas de autobús, cada una con su color"],
  ["Up to 3 stops: remove one to add another.", "Hasta 3 paradas: quita una para agregar otra."],
  ["Destination set.", "Destino marcado."],
  ["Start set.", "Punto de partida marcado."],
  ["Put the start back", "Volver a poner el punto de partida"],
  ["Put the destination back", "Volver a poner el destino"],
  ["Take the start off the map", "Quitar el punto de partida del mapa"],
  ["Take the destination off the map", "Quitar el destino del mapa"],
  ["Take the stop off the map", "Quitar la parada del mapa"],
  ["Put the stop back", "Volver a poner la parada"],
  ["Start: drag to move, click to remove", "Punto de partida: arrastra para mover, haz clic para quitar"],
  ["Destination: drag to move, click to remove", "Destino: arrastra para mover, haz clic para quitar"],
  ["Zoom in", "Acercar"],
  ["Zoom out", "Alejar"],
  ["Close", "Cerrar"],
  ["Railroad crossing", "Cruce de ferrocarril"],
  ["Railroad crossing avoided", "Cruce de ferrocarril evitado"],
  ["School zone", "Zona escolar"],
  ["School zone avoided", "Zona escolar evitada"],
  ["The recommended route crosses railroad tracks here, at street level.", "La ruta recomendada cruza aquí las vías del tren, a nivel de la calle."],
  [
    "The standard route crosses railroad tracks here, at street level. The recommended route doesn't.",
    "La ruta estándar cruza aquí las vías del tren, a nivel de la calle. La ruta recomendada no.",
  ],
  ["The recommended route passes this school at drop-off or pickup time.", "La ruta recomendada pasa por esta escuela a la hora de entrada o salida."],
  [
    "The standard route passes this school at drop-off or pickup time. The recommended route doesn't.",
    "La ruta estándar pasa por esta escuela a la hora de entrada o salida. La ruta recomendada no.",
  ],
  ["Risky turn", "Vuelta riesgosa"],
  ["Risky turn avoided", "Vuelta riesgosa evitada"],

  // The result
  ["Comparing routes for safety, fuel and time…", "Comparando rutas por seguridad, combustible y tiempo…"],
  [
    "The trip changed since these routes. Find route plans it again.",
    "El viaje cambió desde que se calcularon estas rutas. «Buscar ruta» lo vuelve a planificar.",
  ],
  ["Recommended", "Recomendada"],
  ["All routes, best first · pick one to follow it", "Todas las rutas, la mejor primero · elige una para seguirla"],
  ["safety", "seguridad"],
  ["Safety score: 0 to 100, higher is safer", "Puntuación de seguridad: de 0 a 100, más alta es más segura"],
  ["No risks found on this route: a perfect 100.", "No se encontraron riesgos en esta ruta: un 100 perfecto."],
  ["What the safety score counts", "Qué cuenta la puntuación de seguridad"],
  ["Risk points", "Puntos de riesgo"],
  ["This route", "Esta ruta"],
  ["Standard", "Estándar"],
  ["Total", "Total"],
  ["Safety score", "Puntuación de seguridad"],
  [
    "The score is 100 with no risks, and halves with every 10 risk points: 100 ÷ (1 + points ÷ 10).",
    "La puntuación es 100 sin riesgos y se reduce a la mitad con cada 10 puntos de riesgo: 100 ÷ (1 + puntos ÷ 10).",
  ],
  ["Turns across traffic at busy junctions", "Vueltas que cruzan el sentido contrario en cruces concurridos"],
  ["Turns across traffic where crashes happened", "Vueltas que cruzan el sentido contrario donde hubo choques"],
  ["Driving into a low sun", "Conducir con el sol bajo de frente"],
  ["Slippery roads: turns across oncoming traffic count as riskier, so routes avoid more of them.", "Calles resbalosas: las vueltas que cruzan el sentido contrario cuentan como más riesgosas, así que las rutas evitan más de ellas."],
  ["Drive with care: the routes account for hazards reported on the roads.", "Conduce con precaución: las rutas toman en cuenta los peligros reportados en las calles."],
  ["Time", "Tiempo"],
  ["Distance", "Distancia"],
  ["Fuel", "Combustible"],
  ["Risky turns", "Vueltas riesgosas"],
  ["Lane closures", "Cierres de carril"],
  ["Closed roads", "Calles cerradas"],
  ["School zones", "Zonas escolares"],
  ["Rail crossings", "Cruces de ferrocarril"],
  ["Railroad crossings", "Cruces de ferrocarril"],
  ["Weather hazards", "Peligros por clima"],
  ["Sun glare", "Sol de frente"],
  ["Too slow to recommend", "Demasiado lenta para recomendarla"],
  ["Standard route", "Ruta estándar"],
  ["Alternative route", "Ruta alternativa"],
  ["Our safer design", "Nuestro diseño más seguro"],
  ["Would you take this route?", "¿Tomarías esta ruta?"],
  ["Yes", "Sí"],
  ["No", "No"],
  ["Thanks for your answer!", "¡Gracias por tu respuesta!"],
  ["Best time to leave?", "¿Mejor hora para salir?"],
  ["Comparing…", "Comparando…"],
  ["Plan the trip for this time", "Planificar el viaje para esta hora"],
  ["No sun glare or school zones", "Sin sol de frente ni zonas escolares"],
  ["after dark", "de noche"],
  ["Best time to leave · pick one to plan it", "Mejor hora para salir · elige una para planificarla"],
  ["Some of our designs couldn't be checked against live traffic, so they're left out.", "Algunos de nuestros diseños no se pudieron comprobar con el tráfico en vivo, así que se omiten."],
  ["This trip is outside the area our router covers, so only standard routes are shown.", "Este viaje está fuera del área que cubre nuestro sistema de rutas, así que solo se muestran rutas estándar."],
  ["Our router isn't available right now, so only standard routes are shown.", "Nuestro sistema de rutas no está disponible ahora, así que solo se muestran rutas estándar."],
  ["Standard routes weren't available for this trip, so only our designs are shown.", "No hubo rutas estándar para este viaje, así que solo se muestran nuestros diseños."],

  // Problems
  ["Can't reach the routing server. Open this page from it, e.g. http://127.0.0.1:3143", "No se puede conectar con el servidor de rutas. Abre esta página desde él, p. ej. http://127.0.0.1:3143"],
  ["This demo needs its access code: open it from the link or QR code you were given.", "Esta demostración necesita su código de acceso: ábrela desde el enlace o el código QR que te dieron."],
  ["No drivable route was found between these points.", "No se encontró una ruta en auto entre estos puntos."],
  [
    "Today's live traffic limit is used up. Turn off Live traffic to keep planning, or try again tomorrow.",
    "Se agotó el límite de tráfico en vivo de hoy. Desactiva «Tráfico en vivo» para seguir planificando, o inténtalo mañana.",
  ],
  ["The live traffic service didn't answer. Try again, or turn off Live traffic.", "El servicio de tráfico en vivo no respondió. Inténtalo de nuevo o desactiva «Tráfico en vivo»."],
  ["The server is in offline replay mode and has no saved traffic data for this trip.", "El servidor está en modo sin conexión y no tiene datos de tráfico guardados para este viaje."],
  [
    "The map key was rejected. Check which websites it allows and that the map service is enabled for it.",
    "La clave del mapa fue rechazada. Revisa qué sitios web permite y que el servicio de mapas esté activado para ella.",
  ],
  ["The map couldn't load. Check the key and your network.", "El mapa no pudo cargarse. Revisa la clave y tu conexión."],
  ["The map couldn't load. Check your network.", "El mapa no pudo cargarse. Revisa tu conexión."],
  ["Place search is unavailable. Click the map instead.", "La búsqueda de lugares no está disponible. Haz clic en el mapa."],
  ["The map needs a key", "El mapa necesita una clave"],
  ["Copy frontend/config.example.js to frontend/config.js and paste the map key in.", "Copia frontend/config.example.js a frontend/config.js y pega la clave del mapa."],
  ["Allow the key on http://localhost:3143/* and http://127.0.0.1:3143/*.", "Permite la clave en http://localhost:3143/* y http://127.0.0.1:3143/*."],
  ["Reload this page.", "Vuelve a cargar esta página."],
  ["Full setup steps are in the README, under “The browser key for the map”.", "Los pasos completos están en el README, en “The browser key for the map”."],
  ["The routing server works without it: try it at /docs.", "El servidor de rutas funciona sin ella: pruébalo en /docs."],

  // Driving
  ["Location only works on a secure page: https, or this computer's own address.", "La ubicación solo funciona en una página segura: https, o la dirección de esta misma computadora."],
  ["This browser can't share its location.", "Este navegador no puede compartir su ubicación."],
  [
    "Location access was denied. Allow it for this site in the browser's address bar, then try again.",
    "Se negó el acceso a la ubicación. Permítelo para este sitio en la barra de direcciones del navegador y vuelve a intentarlo.",
  ],
  ["Finding your location took too long. Try again.", "Encontrar tu ubicación tardó demasiado. Inténtalo de nuevo."],
  ["Your location isn't available right now.", "Tu ubicación no está disponible ahora."],
  ["My location", "Tu ubicación"],
  ["Current location", "Ubicación actual"],
  ["Waiting for your location…", "Esperando tu ubicación…"],
  ["You have arrived.", "Llegaste a tu destino."],
  ["You've arrived.", "Llegaste a tu destino."],
  ["You've reached your stop.", "Llegaste a tu parada."],
  ["You've reached your last stop.", "Llegaste a tu última parada."],
  ["Weak GPS signal…", "Señal de GPS débil…"],
  ["Waiting for a GPS signal…", "Esperando señal de GPS…"],
  ["Off route. Finding a new one…", "Fuera de ruta. Buscando una nueva…"],
  ["Finding a new route.", "Buscando una nueva ruta."],
  ["New route found", "Nueva ruta encontrada"],

  // "How it works", the phone link and demo mode
  [
    "Most navigation apps pick the fastest route. This one puts your safety first, then fuel, then time: of the routes it finds, the safest wins; among equally safe ones, the one that burns the least fuel; then the fastest.",
    "La mayoría de las apps de navegación eligen la ruta más rápida. Esta pone primero tu seguridad, luego el combustible y luego el tiempo: de las rutas que encuentra, gana la más segura; entre las igual de seguras, la que gasta menos combustible; y después, la más rápida.",
  ],
  ["What makes a route risky", "Qué hace riesgosa una ruta"],
  ["Turns across oncoming traffic", "Vueltas que cruzan el sentido contrario"],
  ["at busy junctions, less where a traffic signal controls them, more where crashes have happened.", "en cruces concurridos: menos si hay semáforo, más donde ha habido choques."],
  ["Closed roads and lane closures", "Calles y carriles cerrados"],
  [", live from Wisconsin's work zones and 511", ", en vivo de las zonas de obra de Wisconsin y el 511"],
  [", and TomTom traffic", " y del tráfico de TomTom"],
  ["at drop-off and pickup times, and", "a la hora de entrada y salida, y los"],
  ["railroad crossings", "cruces de ferrocarril"],
  ["Sun glare:", "Sol de frente:"],
  [
    "driving toward a low sun around sunrise and sunset, worked out from where the sun is when you leave.",
    "conducir con el sol bajo de frente al amanecer y al atardecer, calculado según dónde está el sol cuando sales.",
  ],
  ["After dark:", "De noche:"],
  ["turns across traffic count as riskier: oncoming cars are judged by their headlights.", "las vueltas que cruzan el sentido contrario cuentan como más riesgosas: los autos de frente se calculan por sus faros."],
  ["Weather:", "Clima:"],
  ["National Weather Service alerts", "Alertas del Servicio Meteorológico Nacional"],
  [", and fog, ice or flooding reported on the roads", ", y niebla, hielo o inundaciones reportadas en las calles"],
  [". On snow and ice, turns across traffic count as riskier.", ". Con nieve y hielo, las vueltas que cruzan el sentido contrario cuentan como más riesgosas."],
  ["Each route gets a", "Cada ruta recibe una"],
  ["safety score", "puntuación de seguridad"],
  ["from 0 to 100 that adds these up the same way for everyone: higher is safer.", "de 0 a 100 que suma estos riesgos igual para todos: más alta es más segura."],
  ["How the routes are found", "Cómo se encuentran las rutas"],
  [
    "Our own router searches Milwaukee's streets for routes that avoid those risks, then compares each with the standard, fastest route. You choose how much extra time a safer route may take, and when you leave: school zones and the sun change with the time.",
    "Nuestro propio sistema de rutas busca en las calles de Milwaukee rutas que eviten esos riesgos y compara cada una con la ruta estándar, la más rápida. Tú eliges cuánto tiempo extra puede tomar una ruta más segura y cuándo sales: las zonas escolares y el sol cambian con la hora.",
  ],
  ["Map data © OpenStreetMap contributors. Work zones and incidents: Wisconsin DOT (511).", "Datos del mapa © colaboradores de OpenStreetMap. Obras e incidentes: Wisconsin DOT (511)."],
  ["Traffic © TomTom.", "Tráfico © TomTom."],
  ["Crash locations: NHTSA's Fatality Analysis Reporting System, 2020–2024.", "Ubicación de accidentes: Fatality Analysis Reporting System de la NHTSA, 2020–2024."],
  ["This page is open at this computer's own address, which phones can't reach.", "Esta página está abierta en la dirección de esta computadora, a la que los celulares no llegan."],
  [
    "Start the tunnel (EXPO.md, “Let visitors use their phones”) and open this page from its https://…trycloudflare.com address. The code to scan will show here.",
    "Inicia el túnel (EXPO.md, “Let visitors use their phones”) y abre esta página desde su dirección https://…trycloudflare.com. El código para escanear aparecerá aquí.",
  ],
  ["Making the code…", "Creando el código…"],
  ["Point the phone's camera at the code, then tap the link it shows.", "Apunta la cámara del celular al código y toca el enlace que aparece."],
  ["Driving mode on a phone needs the secure https link from the tunnel.", "El modo de navegación en un celular necesita el enlace seguro https del túnel."],
  ["The trip on the map comes with it, ready to drive.", "El viaje del mapa viene incluido, listo para conducir."],
  ["To find it again later, use the browser's “Add to Home Screen”.", "Para encontrarla después, usa «Agregar a la pantalla de inicio» del navegador."],
  ["The code couldn't be made. Visitors can type this address:", "No se pudo crear el código. Los visitantes pueden escribir esta dirección:"],
  ["Touch anywhere to plan your own", "Toca la pantalla para planificar el tuyo"],

  // "Which route is safer?"
  ["Which route is safer?", "¿Cuál ruta es más segura?"],
  ["Which Is Safer", "¿Cuál Es Más Segura?"],
  ["Two real routes across Milwaukee. Pick the safer one.", "Dos rutas reales por Milwaukee. Elige la más segura."],
  ["Plan your own trip", "Planifica tu propio viaje"],
  ["More", "Más"],
  ["Finding two routes…", "Buscando dos rutas…"],
  ["Route A is safer", "La ruta A es más segura"],
  ["Route B is safer", "La ruta B es más segura"],
  ["Route A", "Ruta A"],
  ["Route B", "Ruta B"],
  ["Next trip", "Siguiente viaje"],
  ["Right!", "¡Correcto!"],
  ["Not this time.", "Esta vez no."],
  ["Route A is safer.", "La ruta A es más segura."],
  ["Route B is safer.", "La ruta B es más segura."],
  ["These routes are all equally safe. Try another trip.", "Estas rutas son igual de seguras. Prueba otro viaje."],
  ["Can't reach the routing server.", "No se puede conectar con el servidor de rutas."],
  ["Map of the two routes", "Mapa de las dos rutas"],
  [
    "The safety score counts turns across oncoming traffic at busy or crash-prone junctions, railroad crossings, school zones at school times, closed roads and lane closures, weather hazards and driving into a low sun.",
    "La puntuación de seguridad cuenta las vueltas que cruzan el sentido contrario en cruces concurridos o propensos a choques, los cruces de ferrocarril, las zonas escolares en horario escolar, las calles y carriles cerrados, los peligros por clima y conducir con el sol bajo de frente.",
  ],
  ["guessed the safer route in the game", "adivinaron la ruta más segura en el juego"],

  // Bike mode
  ["Car", "Auto"],
  ["Bike", "Bicicleta"],
  ["How you're going", "Cómo vas"],
  ["Rider", "Ciclista"],
  ["Most adults: some traffic is OK", "La mayoría de los adultos: algo de tráfico está bien"],
  ["Family: the quietest streets, even if longer", "Familia: las calles más tranquilas, aunque sea más largo"],
  ["Confident: busier streets are fine", "Con experiencia: calles más concurridas están bien"],
  ["E-bike: like most adults, but faster", "Bici eléctrica: como la mayoría, pero más rápido"],
  ["Start riding", "Empezar recorrido"],
  ["Stop riding", "Terminar recorrido"],
  ["Bike stress", "Estrés para ciclistas"],
  ["Zoom in to see each street's stress.", "Acerca el mapa para ver el estrés de cada calle."],
  ["Bike stress: low → very busy", "Estrés para ciclistas: poco → mucho"],
  ["Shortest route", "Ruta más corta"],
  ["Shortest", "La más corta"],
  ["Busy crossings", "Cruces concurridos"],
  ["Railroad tracks", "Vías del tren"],
  ["Where cyclists were killed", "Donde murieron ciclistas"],
  ["Minutes on very busy streets", "Minutos en calles muy concurridas"],
  ["Minutes on busy streets", "Minutos en calles concurridas"],
  ["Minutes on unlit stretches, after dark", "Minutos en tramos sin luz, de noche"],
  ["Crossing busy roads without a signal", "Cruzar calles concurridas sin semáforo"],
  ["Busy crossing", "Cruce concurrido"],
  ["Busy crossing without a signal", "Cruce concurrido sin semáforo"],
  ["Busy crossing the recommended route avoids", "Cruce concurrido que evita la ruta recomendada"],
  ["Busy crossing avoided", "Cruce concurrido evitado"],
  ["The recommended route crosses a busy road here without a signal. Take care.", "La ruta recomendada cruza aquí una calle concurrida sin semáforo. Ten cuidado."],
  ["The shortest route crosses a busy road here without a signal. The recommended route doesn't.", "La ruta más corta cruza aquí una calle concurrida sin semáforo. La ruta recomendada no."],
  ["Winter: trails may not be cleared of snow and ice. Check before you ride.", "Invierno: puede que los senderos no estén despejados de nieve y hielo. Revisa antes de salir."],
  ["It's dark: crossing busy roads counts as riskier. Use lights.", "Ya es de noche: cruzar calles concurridas cuenta como más riesgoso. Usa luces."],
  [
    "Busy streets count by the minute; crossings of busy roads without a signal count each. The score is 100 with no risks, and halves with every 10 risk points.",
    "Las calles concurridas cuentan por minuto; cada cruce de una calle concurrida sin semáforo cuenta aparte. La puntuación es 100 sin riesgos y se reduce a la mitad con cada 10 puntos de riesgo.",
  ],
  ["Low stress: anyone", "Poco estrés: para cualquiera"],
  ["Some traffic: most adults", "Algo de tráfico: la mayoría de los adultos"],
  ["Busy: confident riders", "Concurrida: ciclistas con experiencia"],
  ["Very busy: few riders", "Muy concurrida: pocos ciclistas"],

  // Walking mode
  ["Walk", "A pie"],
  ["Walker", "Peatón"],
  ["Most people: a short detour for a calmer walk", "La mayoría: un desvío corto por una caminata más tranquila"],
  ["Careful: slower, the calmest streets", "Con cuidado: más despacio, por las calles más tranquilas"],
  ["Step-free: no stairs, for a wheelchair or stroller", "Sin escalones: sin escaleras, para silla de ruedas o carriola"],
  ["Start walking", "Empezar a caminar"],
  ["Stop walking", "Terminar caminata"],
  ["Walking: sidewalk or path → busy street without one", "A pie: banqueta o sendero → calle concurrida sin banqueta"],
  ["Sidewalk or path", "Banqueta o sendero"],
  ["Quiet street without a sidewalk", "Calle tranquila sin banqueta"],
  ["Busy street with no sidewalk mapped", "Calle concurrida sin banqueta en el mapa"],
  ["Busy street without a sidewalk", "Calle concurrida sin banqueta"],
  ["Where pedestrians were killed", "Donde murieron peatones"],
  ["Minutes on busy streets without a sidewalk", "Minutos en calles concurridas sin banqueta"],
  ["Minutes on busy streets with no sidewalk mapped", "Minutos en calles concurridas sin banqueta en el mapa"],
  ["Winter: sidewalks may be icy where they aren't cleared.", "Invierno: las banquetas pueden tener hielo donde no las han limpiado."],
  ["It's dark: crossing busy roads counts as riskier. Wear something bright.", "Ya es de noche: cruzar calles concurridas cuenta como más riesgoso. Usa ropa clara o reflejante."],
  ["Comparing routes for safety and time…", "Comparando rutas por seguridad y tiempo…"],
  ["No bike route was found between these points.", "No se encontró una ruta en bicicleta entre estos puntos."],
  ["No walking route was found between these points.", "No se encontró una ruta a pie entre estos puntos."],
  ["The server has no bike map.", "El servidor no tiene el mapa para bicicletas."],
  ["This walk is over 10 miles. Try Transit or Bike for a trip this long.", "Esta caminata es de más de 16 km. Para un viaje tan largo, prueba Transporte público o Bicicleta."],
  ["The server has no walking map.", "El servidor no tiene el mapa para caminar."],

  // Transit mode
  ["Transit", "Transporte público"],
  ["Bus ride, in the route's color ·", "Viaje en autobús, del color de la ruta ·"],
  ["walk", "a pie"],
  ["Checking the bus schedule…", "Consultando los horarios de autobús…"],
  ["Bus schedule: Milwaukee County Transit System", "Horarios de autobús: Milwaukee County Transit System"],
  [
    "Times are from the bus schedule, not live: buses can run late. Be at the stop a minute or two early.",
    "Los horarios son los programados, no en tiempo real: los autobuses pueden retrasarse. Llega a la parada uno o dos minutos antes.",
  ],
  [
    "It's dark: waiting at a stop counts as riskier. Wait where it's lit, and wear something bright.",
    "Ya es de noche: esperar en una parada cuenta como más riesgoso. Espera donde haya luz y usa ropa clara o reflejante.",
  ],
  ["All bus options, best first · pick one to see it", "Todas las opciones de autobús, la mejor primero · elige una para verla"],
  ["The recommended trip, step by step", "El viaje recomendado, paso a paso"],
  ["This trip, step by step", "Este viaje, paso a paso"],
  ["Walking", "A pie"],
  ["Waiting", "Esperando"],
  ["Transfers", "Transbordos"],
  ["Arrive", "Llegada"],
  ["Walk to your destination", "Camina hasta tu destino"],
  ["This trip", "Este viaje"],
  ["No risks found on this trip: a perfect 100.", "No se encontraron riesgos en este viaje: un 100 perfecto."],
  ["Minutes walking on busy streets without a sidewalk", "Minutos caminando por calles concurridas sin banqueta"],
  ["Minutes walking on busy streets with no sidewalk mapped", "Minutos caminando por calles concurridas sin banqueta en el mapa"],
  ["Minutes walking on unlit stretches, after dark", "Minutos caminando por tramos sin luz, de noche"],
  ["Minutes waiting at a stop after dark", "Minutos esperando en una parada de noche"],
  [
    "The walks count as walking routes do; waiting after dark counts by the minute, and each transfer counts one. The score is 100 with no risks, and halves with every 10 risk points.",
    "Las caminatas cuentan como las rutas a pie; esperar de noche cuenta por minuto, y cada transbordo cuenta uno. La puntuación es 100 sin riesgos y se reduce a la mitad con cada 10 puntos de riesgo.",
  ],
  ["No bus gets there from here at this time. Try another time, or walking or biking.", "Ningún autobús llega ahí desde aquí a esta hora. Prueba otra hora, o ir a pie o en bicicleta."],
  ["The bus schedule isn't ready: it loads when the server starts. Try again in a minute.", "Los horarios de autobús aún no están listos: se cargan al iniciar el servidor. Intenta de nuevo en un minuto."],

  // The stats screen
  ["Booth Stats", "Estadísticas del stand"],
  ["Today at the booth", "Hoy en el stand"],
  ["Today's numbers", "Los números de hoy"],
  ["trips planned today", "viajes planificados hoy"],
  ["got a safer route than the standard one", "obtuvieron una ruta más segura que la estándar"],
  ["risky turns across traffic avoided", "vueltas riesgosas evitadas"],
  ["railroad crossings avoided", "cruces de ferrocarril evitados"],
  ["school zones avoided at school times", "zonas escolares evitadas en horario escolar"],
  ["closed roads avoided", "calles cerradas evitadas"],
  ["points safer, on average, when the route changed", "puntos más segura, en promedio, cuando cambió la ruta"],
  ["said they'd take the safer route", "dijeron que tomarían la ruta más segura"],
  ["No answers yet today", "Aún no hay respuestas hoy"],
  ["Can't reach the server: showing the last numbers.", "No se puede conectar con el servidor: se muestran los últimos números."],
  [
    "Plan a trip on the screen next to this one, or on your phone. Each route avoids the risks it can.",
    "Planifica un viaje en la pantalla de al lado o en tu celular. Cada ruta evita los riesgos que puede.",
  ],
  ["QR code to open the planner on a phone", "Código QR para abrir el planificador en un celular"],

  // The control page
  ["Expo Control", "Control de la expo"],
  ["Expo control", "Control de la expo"],
  ["Is everything ready, and what's used up today", "Si todo está listo y lo que se ha usado hoy"],
  ["Ready for visitors", "Listo para los visitantes"],
  ["Used today", "Usado hoy"],
  ["The booth", "El stand"],
  ["Pause demo mode", "Pausar el modo de demostración"],
  ["Resume demo mode", "Reanudar el modo de demostración"],
  ["Restart today's stats", "Reiniciar las estadísticas de hoy"],
  ["Admin code (when the server has ROUTES_ADMIN_CODE)", "Código de administrador (cuando el servidor tiene ROUTES_ADMIN_CODE)"],
  ["Open:", "Abrir:"],
  ["the booth screen (demo mode)", "la pantalla del stand (modo de demostración)"],
  ["the stats screen", "la pantalla de estadísticas"],
  ["visitors' answers", "las respuestas de los visitantes"],
  ["the game", "el juego"],
  ["the planner", "el planificador"],
  ["the server's full health", "el estado completo del servidor"],
  ["Can't reach the server.", "No se puede conectar con el servidor."],
  ["The server", "El servidor"],
  ["not answering: is it running?", "no responde: ¿está encendido?"],
  ["running", "funcionando"],
  ["The road map", "El mapa de calles"],
  ["not loaded: build it (EXPO.md)", "no está cargado: hay que generarlo (EXPO.md)"],
  ["Closures matched to the map", "Cierres ubicados en el mapa"],
  ["done", "listo"],
  ["still matching (about a minute after a start)", "ubicándolos todavía (cerca de un minuto después de iniciar)"],
  ["Crash data", "Datos de choques"],
  ["none loaded (ROUTES_CRASH_DATA)", "sin cargar (ROUTES_CRASH_DATA)"],
  ["Railroad crossings and schools", "Cruces de ferrocarril y escuelas"],
  ["Stop signs and lights for the driving view", "Señales de alto y semáforos para la vista de conducción"],
  ["none: python -m app.road_controls (EXPO.md)", "ninguno: python -m app.road_controls (EXPO.md)"],
  ["Weather alerts", "Alertas del clima"],
  ["turned on", "activadas"],
  ["off (ROUTES_WEATHER_ALERTS)", "desactivadas (ROUTES_WEATHER_ALERTS)"],
  ["Bus routes", "Rutas de autobús"],
  ["ready", "listas"],
  ["not downloaded yet", "sin descargar todavía"],
  ["Google route requests", "Solicitudes de rutas a Google"],
  ["TomTom traffic requests", "Solicitudes de tráfico a TomTom"],
  ["TomTom traffic map squares", "Cuadros del mapa de tráfico de TomTom"],
  ["No paid services are set up: nothing to run out of.", "No hay servicios de pago configurados: nada se puede agotar."],
  ["Demo mode is paused on the booth screens.", "El modo de demostración está en pausa en las pantallas del stand."],
  ["Demo mode runs on the booth screens.", "El modo de demostración funciona en las pantallas del stand."],
  ["Demo mode paused.", "Modo de demostración en pausa."],
  ["Demo mode resumed.", "Modo de demostración reanudado."],
  ["The stats count from now.", "Las estadísticas cuentan a partir de ahora."],
  [
    "Count today's stats from now? Earlier trips and answers stay saved but stop counting.",
    "¿Contar las estadísticas de hoy a partir de ahora? Los viajes y las respuestas anteriores siguen guardados, pero dejan de contar.",
  ],
  ["The control page needs the admin code.", "La página de control necesita el código de administrador."],
  ["Without ROUTES_ADMIN_CODE, only this computer can use the control page.", "Sin ROUTES_ADMIN_CODE, solo esta computadora puede usar la página de control."],

  // Visitors' answers
  ["Visitors' Answers", "Respuestas de los visitantes"],
  ["Today", "Hoy"],
  ["All days", "Todos los días"],
  ["said they'd take the recommended route", "dijeron que tomarían la ruta recomendada"],
  ["No answers yet", "Aún no hay respuestas"],
  ["Answer", "Respuesta"],
  ["Visitors", "Visitantes"],
  ["Average safety points gained", "Promedio de puntos de seguridad ganados"],
  ["Average extra minutes", "Promedio de minutos adicionales"],
  ["Averages are against the standard route. No places are kept.", "Los promedios se comparan con la ruta estándar. No se guarda ningún lugar."],
];

// ---- Phrases with numbers, times and names in them

const JUNCTIONS = { "a busy junction": "un cruce concurrido", "a crash-prone junction": "un cruce propenso a choques" };
const junctionEs = (text) => JUNCTIONS[text.replace(" with a traffic signal", "")] + (text.endsWith(" with a traffic signal") ? " con semáforo" : "");
const RISKS = {
  "risky turns": "vueltas riesgosas",
  "lane closures": "cierres de carril",
  "school zones": "zonas escolares",
  "railroad crossings": "cruces de ferrocarril",
  "weather hazards": "peligros por clima",
  "sun glare": "sol de frente",
};
// Turn-by-turn wording (app.features on the server), then "onto <road>".
const MOVES = {
  "Turn left": "Da vuelta a la izquierda",
  "Turn right": "Da vuelta a la derecha",
  "Bear left": "Da vuelta ligeramente a la izquierda",
  "Bear right": "Da vuelta ligeramente a la derecha",
  "Turn sharp left": "Da vuelta cerrada a la izquierda",
  "Turn sharp right": "Da vuelta cerrada a la derecha",
  "Make a U-turn": "Da vuelta en U",
  "Take the ramp on the left": "Toma la rampa de la izquierda",
  "Take the ramp on the right": "Toma la rampa de la derecha",
  Merge: "Incorpórate",
  "Keep left": "Mantente a la izquierda",
  "Keep right": "Mantente a la derecha",
  "Enter the roundabout": "Entra a la glorieta",
  Continue: "Continúa",
};
// The word before the road's name, as each move is said: "da vuelta a la izquierda en", "incorpórate a",
// "continúa por"; "hacia" for the rest (ramps, keeping left or right, roundabouts, U-turns).
const ONTO = {
  "Turn left": "en",
  "Turn right": "en",
  "Bear left": "en",
  "Bear right": "en",
  "Turn sharp left": "en",
  "Turn sharp right": "en",
  Merge: "a",
  Continue: "por",
};
const EVENT_SOURCES = {
  "Wisconsin work zones (WZDx)": "las zonas de obra de Wisconsin (WZDx)",
  "Wisconsin 511": "Wisconsin 511",
  "TomTom traffic": "el tráfico de TomTom",
  "traffic speeds along the routes": "las velocidades del tráfico en las rutas",
  "traffic tiles": "los mapas de tráfico",
};
// A route's other hazards, counted in the route list: one, and more than one.
const COUNTED = {
  "lane closures": ["cierre de carril", "cierres de carril"],
  "closed roads": ["calle cerrada", "calles cerradas"],
  "school zones": ["zona escolar", "zonas escolares"],
  "rail crossings": ["cruce de ferrocarril", "cruces de ferrocarril"],
  "weather hazards": ["peligro por clima", "peligros por clima"],
};
const plural = (count, one, many) => (Number(count) === 1 ? one : many);
const list = (items, map) => items.map((item) => map[item] || item).join(", ").replace(/, ([^,]*)$/, " y $1");
const risks = (words) => list(words.split(/, | and /), RISKS);
const when = (text) => (text === "now" ? "ahora" : text.replace(/^at (.+)$/, "a las $1"));

// Route reasons from the server (app.scoring), with the time limit that applied.
const limit = (text) =>
  text
    .replace(/^over ([\d.]+) min longer than the fastest route$/, "más de $1 min más lenta que la ruta más rápida")
    .replace(/^over ([\d.]+)x the fastest route's time$/, "más de $1 veces el tiempo de la ruta más rápida")
    .replace(/^within ([\d.]+) min of the fastest time$/, "a menos de $1 min del tiempo más rápido")
    .replace(/^within ([\d.]+)x the fastest time$/, "dentro de $1 veces el tiempo más rápido");
const REASONS = [
  [/^goes through a closed road$/i, () => "pasa por una calle cerrada"],
  [/^too slow: (.+)$/i, (_, over) => `demasiado lenta: ${limit(over)}`],
  [/^safest (within .+); safer routes take longer$/i, (_, within) => `la más segura ${limit(within)}; las rutas más seguras tardan más`],
  [/^safest: fewest (.+)$/i, (_, words) => `la más segura: la que tiene menos ${risks(words)}`],
  [/^as safe as any, and uses the least fuel$/i, () => "tan segura como cualquiera, y la que usa menos combustible"],
  [/^as safe and fuel-efficient as any, and the fastest$/i, () => "tan segura y eficiente como cualquiera, y la más rápida"],
  [/^more (.+) than the winner$/i, (_, words) => `más ${risks(words)} que la ganadora`],
  [/^as safe, but uses more fuel$/i, () => "igual de segura, pero usa más combustible"],
  [/^as safe and efficient, but slower$/i, () => "igual de segura y eficiente, pero más lenta"],
  [/^the recommended route on every leg$/i, () => "la ruta recomendada en cada tramo"],
  [/^the standard route on every leg$/i, () => "la ruta estándar en cada tramo"],
  [/^the shortest route on every leg$/i, () => "la ruta más corta en cada tramo"],
  // Bike routes (app.bike)
  [/^the shortest route is also the lowest-stress one$/i, () => "la ruta más corta también es la de menos estrés"],
  [/^as low-stress, but slower$/i, () => "con el mismo estrés, pero más lenta"],
  [
    /^lowest stress within ([\d.]+)x the shortest time, at most ([\d.]+) min more: (\d+) min on busy streets instead of (\d+)$/i,
    (_, ratio, extra, ours, theirs) => `la de menos estrés dentro de ${ratio} veces el tiempo más corto, con ${extra} min más como máximo: ${ours} min en calles concurridas en vez de ${theirs}`,
  ],
  [/^more stress: (\d+) min on busy streets$/i, (_, n) => `más estrés: ${n} min en calles concurridas`],
  // Walking routes (app.bike, on the walking map)
  [
    /^lowest stress within ([\d.]+)x the shortest time, at most ([\d.]+) min more: (\d+) min on streets without sidewalks instead of (\d+)$/i,
    (_, ratio, extra, ours, theirs) => `la de menos estrés dentro de ${ratio} veces el tiempo más corto, con ${extra} min más como máximo: ${ours} min en calles sin banqueta en vez de ${theirs}`,
  ],
  [/^more stress: (\d+) min on streets without sidewalks$/i, (_, n) => `más estrés: ${n} min en calles sin banqueta`],
  [/^safest within ([\d.]+)x the shortest time, at most ([\d.]+) min more$/i, (_, ratio, extra) => `la más segura dentro de ${ratio} veces el tiempo más corto, con ${extra} min más como máximo`],
  [/^less safe: safety score (\d+)$/i, (_, n) => `menos segura: puntuación de seguridad ${n}`],
  // Bus trips (app.transit_plan)
  [/^safest, and arrives earliest$/i, () => "la más segura, y la que llega primero"],
  [/^safest within (\d+) min of the earliest arrival$/i, (_, n) => `la más segura entre las que llegan a menos de ${n} min de la primera`],
  [/^arrives (\d+) min after the earliest$/i, (_, n) => `llega ${n} min después de la primera`],
  [/^arrives earliest$/i, () => "la que llega primero"],
  [/^as safe, but arrives later$/i, () => "igual de segura, pero llega más tarde"],
  [/^too long a detour: over ([\d.]+)x the shortest time or ([\d.]+) min more$/i, (_, ratio, extra) => `un desvío demasiado largo: más de ${ratio} veces el tiempo más corto o ${extra} min más`],
];

// The changes a bike route makes, in "Instead of the shortest route: ...".
const BIKE_CHANGES = [
  [/^safety score (\d+) → (\d+)$/, "puntuación de seguridad $1 → $2"],
  [/^(\d+) min less on busy streets$/, "$1 min menos en calles concurridas"],
  [/^(\d+) min less on busy streets without a sidewalk$/, "$1 min menos en calles concurridas sin banqueta"],
  [/^(\d+) fewer busy crossings?$/, (_, n) => `${n} ${plural(n, "cruce concurrido", "cruces concurridos")} menos`],
  [/^([\d.]+) min longer$/, "$1 min más"],
];
// One change the recommended route makes, in "Instead of the standard route: ...".
const CHANGES = [
  [/^safety score (\d+) → (\d+)$/, "puntuación de seguridad $1 → $2"],
  [/^(\d+) fewer risky turns?$/, (_, n) => `${n} ${plural(n, "vuelta riesgosa", "vueltas riesgosas")} menos`],
  [/^(\d+) fewer lane closures?$/, (_, n) => `${n} ${plural(n, "cierre de carril", "cierres de carril")} menos`],
  [/^(\d+) fewer school zones?$/, (_, n) => `${n} ${plural(n, "zona escolar", "zonas escolares")} menos`],
  [/^(\d+) fewer rail crossings?$/, (_, n) => `${n} ${plural(n, "cruce de ferrocarril", "cruces de ferrocarril")} menos`],
  [/^(\d+) fewer weather hazards?$/, (_, n) => `${n} ${plural(n, "peligro por clima", "peligros por clima")} menos`],
  [/^(\d+) min less sun glare$/, "$1 min menos de sol de frente"],
  [/^avoids a closed road$/, "evita una calle cerrada"],
  [/^(\S+) less gas$/, "$1 menos de gasolina"],
  [/^(\S+) more gas$/, "$1 más de gasolina"],
  [/^([\d.]+) min longer$/, "$1 min más"],
  [/^([\d.]+) min faster$/, "$1 min menos"],
  [/^a different path$/, "un camino distinto"],
];

const PATTERNS = [
  // Trip input
  [/^Up to (\d+) minutes$/, "Hasta $1 minutos"],
  [/^In (\d+) minutes$/, "En $1 minutos"],
  [/^Stop (\d+)$/, "Parada $1"],
  [/^Stop (\d+) added\.$/, "Parada $1 agregada."],
  [/^Stop (\d+): drag to move, click to remove$/, "Parada $1: arrastra para mover, haz clic para quitar"],
  [/^(.+) → (.+) · (\d+) stops?$/, (_, from, to, n) => `${from} → ${to} · ${n} ${plural(n, "parada", "paradas")}`],
  // The result
  [/^The server answered (\d+)\.?$/, "El servidor respondió $1."],
  [/^School zones count: leaving (.+) is a school drop-off or pickup time\.$/, (_, at) => `Las zonas escolares cuentan: salir ${when(at)} es hora de entrada o salida escolar.`],
  [/^It's dark leaving (.+): turns across traffic count as riskier\.$/, (_, at) => `Ya es de noche si sales ${when(at)}: las vueltas que cruzan el sentido contrario cuentan como más riesgosas.`],
  [/^The sun is low leaving (.+): roads heading into it count as riskier\.$/, (_, at) => `El sol está bajo si sales ${when(at)}: las calles que van hacia él cuentan como más riesgosas.`],
  [/^Route data requests for this trip: (\d+)(?: \((\d+) of (\d+) today\))?$/, (_, n, used, cap) => `Solicitudes de datos de ruta para este viaje: ${n}${used ? ` (${used} de ${cap} hoy)` : ""}`],
  [
    /^No closure or slowdown data for this trip(?: \(([^()]*(?:\([^()]*\)[^()]*)*) unavailable\))?\.$/,
    (_, missing) => `No hay datos de cierres ni demoras para este viaje${missing ? ` (sin ${list(missing.split(", "), EVENT_SOURCES)})` : ""}.`,
  ],
  [
    /^Closures and slowdowns from (.+?)(?: \(([^()]*(?:\([^()]*\)[^()]*)*) unavailable\))?(?:; (\d+) closures? nearby)?\.$/,
    (_, used, missing, n) =>
      `Cierres y demoras de ${list(used.split(" and "), EVENT_SOURCES)}${missing ? ` (sin ${list(missing.split(", "), EVENT_SOURCES)})` : ""}${
        n ? `; ${n} ${plural(n, "cierre cerca", "cierres cerca")}` : ""
      }.`,
  ],
  [/^(Road closed|Lane closure|Weather hazard|Road event): (.+)$/s, (_, heading, text) => `${translate(heading)}: ${text}`],
  [
    /^The recommended route turns across oncoming traffic at ((?:a busy junction|a crash-prone junction)(?: with a traffic signal)?)(, where fatal crashes have happened)?\.$/,
    (_, junction, fatal) => `La ruta recomendada da vuelta cruzando el sentido contrario en ${junctionEs(junction)}${fatal ? ", donde ha habido choques mortales" : ""}.`,
  ],
  [/^Turn across traffic at ((?:a busy junction|a crash-prone junction)(?: with a traffic signal)?)$/, (_, junction) => `Vuelta que cruza el sentido contrario en ${junctionEs(junction)}`],
  [
    /^The standard route turns across oncoming traffic here, at ((?:a busy junction|a crash-prone junction)(?: with a traffic signal)?)\. The recommended route doesn't\.$/,
    (_, junction) => `La ruta estándar da vuelta aquí cruzando el sentido contrario, en ${junctionEs(junction)}. La ruta recomendada no.`,
  ],
  [/^Avoided: a turn across traffic at ((?:a busy junction|a crash-prone junction)(?: with a traffic signal)?)$/, (_, junction) => `Evitada: una vuelta que cruza el sentido contrario en ${junctionEs(junction)}`],
  [/^Via (.+)$/, (_, roads) => `Por ${roads.replaceAll(", then ", ", luego ")}`],
  [/^Our safer design (\d+)$/, "Nuestro diseño más seguro $1"],
  [/^the route via (.+)$/, (_, roads) => `la ruta por ${roads.replaceAll(", then ", ", luego ")}`],
  [/^(.+) gas ·$/, "$1 de gasolina ·"],
  [/^(\d+) risky$/, "$1 riesgosas"],
  [/^(\d+) (lane closures|closed roads|school zones|rail crossings|weather hazards)$/, (_, n, what) => `${n} ${plural(n, ...COUNTED[what])}`],
  [/^(\d+) min sun glare$/, "$1 min de sol de frente"],
  [/^(\d+) school zones?$/, (_, n) => `${n} ${plural(n, "zona escolar", "zonas escolares")}`],
  [/^Instead of the standard route: (.+)$/, (_, changes) => `En lugar de la ruta estándar: ${changes.split(", ").map((part) => apply(CHANGES, part)).join(", ")}`],
  [/^(Now|In 1 hour|In (\d+) min) · (.+)$/, (_, at, minutes, clock) => `${at === "Now" ? "Ahora" : at === "In 1 hour" ? "En 1 hora" : `En ${minutes} min`} · ${clock}`],
  // Driving
  [/^Following (.+) instead$/, (_, route) => `Siguiendo ${translate(route).replace(/^Ruta /, "la ruta ").replace(/^\p{Lu}/u, (c) => c.toLowerCase())}`],
  [/^New route: (.+)$/, (_, reason) => `Nueva ruta: ${translate(reason)}`],
  [/^(.+) Trying again shortly\.$/, (_, problem) => `${translate(problem)} Se intentará de nuevo en breve.`],
  [/^([\d.]+) mi left · about (\d+) min$/, "quedan $1 mi · unos $2 min"],
  [/^In (.+?): (.+)\n(.+)$/s, (_, distance, move, left) => `En ${translate(distance)}: ${translate(move)}\n${translate(left)}`],
  [/^In (\d+ feet|[\d.]+ miles), (.+)$/, (_, distance, move) => `En ${translate(distance)}, ${translate(move).replace(/^\p{Lu}/u, (c) => c.toLowerCase())}`],
  [/^(\d+) feet$/, "$1 pies"],
  [/^([\d.]+) miles$/, "$1 millas"],
  [new RegExp(`^(${Object.keys(MOVES).join("|")})(?: onto (.+))?$`), (_, move, road) => `${MOVES[move]}${road ? ` ${ONTO[move] || "hacia"} ${road}` : ""}`],
  [/^Arrive at stop (\d+)$/, "Llega a la parada $1"],
  // Buses, demo mode, "How it works", the phone link
  [/^Route (\w+)$/, "Ruta $1"],
  [/^Sample trip: (.+)$/, "Viaje de ejemplo: $1"],
  [/^Across (\d+) Milwaukee test trips$/, "En $1 viajes de prueba en Milwaukee"],
  [/^Measured (.+), with that day's closures and traffic\.$/, "Medido el $1, con los cierres y el tráfico de ese día."],
  [/^(\d+) of (\d+) trips got a different route than the standard one\.$/, "$1 de $2 viajes obtuvieron una ruta distinta a la estándar."],
  [/^Average safety score: (\d+) for the standard routes, (\d+) for ours\.$/, "Puntuación de seguridad promedio: $1 en las rutas estándar, $2 en las nuestras."],
  [/^(\d+) risky turns avoided: (\d+) on the standard routes, (\d+) on ours\.$/, "$1 vueltas riesgosas evitadas: $2 en las rutas estándar, $3 en las nuestras."],
  [/^(Closed roads|Lane closures|School zones|Railroad crossings): (\d+) on the standard routes, (\d+) on ours\.$/, (_, what, theirs, ours) => `${translate(what)}: ${theirs} en las rutas estándar, ${ours} en las nuestras.`],
  [/^About ([\d.]+) min longer per trip on average: the price of the safer choice\.$/, "Unos $1 min más por viaje en promedio: el precio de la opción más segura."],
  [/^No slower on average \(([\d.]+) min (faster|difference) per trip\)\.$/, (_, n, kind) => `No más lenta en promedio (${n} min ${kind === "faster" ? "más rápida" : "de diferencia"} por viaje).`],
  [/^QR code for (.+)$/, "Código QR de $1"],
  // The stats screen
  [/^Today at the booth · (.+)$/, "Hoy en el stand · $1"],
  [/^got a safer route than the standard one \((.+)\)$/, "obtuvieron una ruta más segura que la estándar ($1)"],
  [/^(.+) yes · (.+) no$/, "$1 sí · $2 no"],
  [/^Updated (.+)$/, "Actualizado $1"],
  [/^Today since (.+)$/, "Hoy desde $1"],
  // The control page
  [/^· (.+)$/s, (_, detail) => `· ${translate(detail)}`],
  [
    /^Today(?: since (.+?))?: (.+) trips, (.+) with a safer route; (.+) yes, (.+) no\. (.+)$/,
    (_, since, trips, safer, yes, no, demo) => `Hoy${since ? ` desde ${since}` : ""}: ${trips} viajes, ${safer} con una ruta más segura; ${yes} sí, ${no} no. ${translate(demo)}`,
  ],
  [/^(.+), ([\d,.]+) junctions$/, "$1, $2 cruces"],
  [/^([\d,.]+) crash locations$/, "$1 lugares con choques"],
  [/^([\d,.]+) crossings, ([\d,.]+) schools$/, "$1 cruces de ferrocarril, $2 escuelas"],
  [/^([\d,.]+) stop signs, ([\d,.]+) lights$/, "$1 señales de alto, $2 semáforos"],
  [/^([\d,.]+) of ([\d,.]+)$/, "$1 de $2"],
  [/^([\d,.]+) \(no cap\)$/, "$1 (sin límite)"],
  // Bike mode
  [/^(Low stress: anyone|Some traffic: most adults|Busy: confident riders|Very busy: few riders)( · |: )(\d+) min$/, (_, name, joint, n) => `${translate(name)}${joint}${n} min`],
  [/^(Sidewalk or path|Quiet street without a sidewalk|Busy street with no sidewalk mapped|Busy street without a sidewalk)( · |: )(\d+) min$/, (_, name, joint, n) => `${translate(name)}${joint}${n} min`],
  [/^Walking routes: map data (.+)$/, "Rutas a pie: datos del mapa $1"],
  // Bus trips
  [/^Leave (.+) · arrive (.+)$/, "Sal a las $1 · llegas a las $2"],
  [/^Wait about (\d+) min$/, "Espera unos $1 min"],
  [/^Toward (.+)$/, "Hacia $1"],
  [/^Walk to (.+) to transfer$/, "Camina hasta $1 para transbordar"],
  [/^Walk to (.+)$/, "Camina hasta $1"],
  [
    /^Get on at (.+)\. Ride (\d+) stops? \((\d+) min\), get off at (.+) at (.+)\.$/,
    (_, on, n, minutes, off, at) => `Súbete en ${on}. Viaja ${n} ${plural(n, "parada", "paradas")} (${minutes} min) y bájate en ${off} a las ${sentenceEnd(at)}`,
  ],
  [/^Get on route (.+) here at (.+)\.$/, (_, route, at) => `Súbete a la ruta ${route} aquí a las ${sentenceEnd(at)}`],
  [/^Get off route (.+) here at (.+)\.$/, (_, route, at) => `Bájate de la ruta ${route} aquí a las ${sentenceEnd(at)}`],
  [/^(\d+) min · walk (\d+) min$/, "$1 min · $2 min a pie"],
  [/^(\d+) min · ([\d.]+) mi · (\d+) busy crossings?$/, (_, minutes, miles, n) => `${minutes} min · ${miles} mi · ${n} ${plural(n, "cruce concurrido", "cruces concurridos")}`],
  [/^(\d+) busy crossings?$/, (_, n) => `${n} ${plural(n, "cruce concurrido", "cruces concurridos")}`],
  [/^Instead of the shortest route: (.+)$/, (_, changes) => `En lugar de la ruta más corta: ${changes.split(", ").map((part) => apply(BIKE_CHANGES, part)).join(", ")}`],
  [/^You: (\d+) of (\d+) right$/, "Tú: $1 de $2 correctas"],
  [/^guessed the safer route in the game \((.+) tries\)$/, "adivinaron la ruta más segura en el juego ($1 intentos)"],
  [/^Route design: map data (.+)$/, "Diseño de ruta: datos del mapa $1"],
  [/^Bike routes: map data (.+)$/, "Rutas en bici: datos del mapa $1"],
  // A stress bar, read aloud: each level's minutes, joined.
  [/^((?:Low stress|Some traffic|Busy|Very busy|Sidewalk|Quiet street)[^,]*: \d+ min(?:, [^,]+: \d+ min)+)$/, (_, list) => list.split(", ").map(translate).join(", ")],
  // Last: parts joined with " · " ("3 min sun glare · 1 school zone"), when each part translates.
  [/^(.+ · .+)$/, (_, parts) => (parts.split(" · ").every((part) => translate(part) !== part) ? parts.split(" · ").map(translate).join(" · ") : parts)],
];

// A time at the end of a sentence: "10:24 a.m." takes no second period.
function sentenceEnd(time) {
  return time.endsWith(".") ? time : `${time}.`;
}

const phrases = new Map(PHRASES.map(([english, spanish]) => [english, spanish]));

// The first rule that changes the text.
function apply(rules, text) {
  for (const [pattern, replacement] of rules) {
    if (!pattern.test(text)) continue;
    const changed = text.replace(pattern, replacement);
    if (changed !== text) return changed;
  }
  return text;
}

// One piece of text in the page's language. Surrounding spaces are kept; reasons keep their capital.
export function translate(text) {
  if (lang !== "es" || !text) return text;
  const core = text.replace(/[ \t\r\n]+/g, (space) => (space.includes("\n") && /\S\n\S/.test(text) ? space : " ")).trim();
  if (!core) return text;
  const [lead, trail] = [text.match(/^\s*/)[0], text.match(/\s*$/)[0]];
  const found = phrases.get(core) ?? phrase(core);
  return found === core ? text : `${lead ? " " : ""}${found}${trail ? " " : ""}`;
}

function phrase(text) {
  const reason = apply(REASONS, text);
  if (reason !== text) return /^[A-Z]/.test(text) ? reason.charAt(0).toUpperCase() + reason.slice(1) : reason;
  return apply(PATTERNS, text);
}

// ---- The page, translated as it changes

const ATTRIBUTES = ["title", "aria-label", "placeholder", "alt"];
const done = new WeakMap(); // node -> the text it was given, so it isn't translated twice

// Google's map translates its own text (it loads in Spanish); the pop-ups on it are ours.
function skipped(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!element) return true;
  if (element.closest("script, style, [translate='no'], .leaflet-control-attribution")) return true;
  return Boolean(element.closest(".gm-style")) && !element.closest(".gm-style-iw");
}

function translateText(node) {
  if (done.get(node) === node.data || skipped(node)) return;
  const translated = translate(node.data);
  done.set(node, translated);
  if (translated !== node.data) node.data = translated;
}

function translateAttributes(element) {
  if (skipped(element)) return;
  for (const name of ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value) {
      const translated = translate(value);
      if (translated !== value) element.setAttribute(name, translated);
    }
  }
}

function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  translateAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) translateText(node);
    else translateAttributes(node);
  }
}

// In Spanish, translate the page now and everything added to it later.
export function startTranslating() {
  const button = document.getElementById("lang");
  if (button) {
    button.textContent = lang === "es" ? "English" : "Español";
    button.lang = lang === "es" ? "en" : "es";
  }
  if (lang !== "es") return;
  document.documentElement.lang = "es";
  document.title = translate(document.title);
  translateTree(document.body);
  new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === "characterData") translateText(change.target);
      else if (change.type === "attributes") translateAttributes(change.target);
      else change.addedNodes.forEach(translateTree);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
}
