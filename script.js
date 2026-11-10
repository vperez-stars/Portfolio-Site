// English / Spanish toggle and a gentle scroll reveal.
// The page is written in English in index.html, so it still works without JavaScript.
// To change a translation, edit the matching key below; the key is the element's
// data-i18n (plain text) or data-i18n-html (text with <i> for titles of works) value.
//
// The Spanish follows the Real Academia Española (DLE, Diccionario panhispánico de dudas,
// Ortografía and Libro de estilo): titles of works in italics (el <i>Guernica</i>),
// "guerra civil española" in lower case, one-word numbers written out, month names in
// lower case, no "&" in running text, and Spanish words instead of unadapted anglicisms
// (mercadotecnia, aplicaciones, programación).

const STRINGS = {
  en: {}, // filled in from the page itself on load
  es: {
    'skip': 'Saltar al contenido',
    'nav.about': 'Sobre mí',
    'nav.projects': 'Proyectos',
    'nav.experience': 'Experiencia',
    'nav.contact': 'Contacto',

    'hero.eyebrow': 'Analista de negocio · Control de calidad · Desarrollo web',
    'hero.title': 'Hola, soy Ventura.',
    'hero.lead': 'Empecé a programar porque quería construir mis propias herramientas y diseñarlas como a mí me gustaría usarlas. Hoy creo aplicaciones web que ayudan a la gente a desplazarse con más seguridad, a organizar su trabajo y a recordar lo que importa.',
    'hero.cta1': 'Ver mis proyectos',
    'hero.cta2': 'Hablemos',

    'about.title': 'Sobre mí',
    'about.p1': 'Siempre he querido entender cómo funcionan las herramientas que uso y crear las mías cuando no existe la adecuada. Eso es lo que me llevó a la programación. Me gusta todo el proceso: decidir qué debe hacer una herramienta, diseñar cómo debe sentirse al usarla y construirla hasta que lo consiga.',
    'about.p2': 'Antes de dedicarme a la tecnología, trabajé en ventas. En Park Business Capital, en Miami, pasé de captar clientes en frío a cerrar ventas en mis tres primeros meses, con unas cifras que triplicaban la media del sector. También mejoré el guion de ventas de la empresa, enseñé nuevas tecnologías a la plantilla veterana y formé en ventas a las nuevas incorporaciones. Antes, en Domino’s, en Miami Beach, planificaba las rutas de reparto y coordinaba los tiempos del horno para que los pedidos salieran a su hora. (Sí: ya planificaba rutas mucho antes de SafeMaps).',
    'about.p3': 'Ahora formo parte de i.c.stars, un programa de formación en tecnología y liderazgo en Milwaukee, como analista de negocio y de control de calidad. Desarrollo aplicaciones web para proyectos de clientes reales, las presento y dirijo el turno de preguntas sobre el enfoque técnico y el valor para el negocio.',
    'about.p4': 'Trabajo en inglés y en español, y así construyo también: SafeMaps y mi puzle de Guernica funcionan en los dos idiomas.',
    'about.quote': 'La tecnología puede ayudarnos a recordar. Hice mi puzle de Guernica para que nunca olvidemos el valor de la acción pacífica y no violenta.',

    'skills.title': 'Con qué trabajo',
    'skills.build': 'Construyo con',
    'skills.ai': 'API de Anthropic y herramientas de IA',
    'skills.git': 'Git y GitHub',
    'skills.analyze': 'Análisis y calidad',
    'skills.ba': 'Análisis de negocio',
    'skills.data': 'Análisis de datos',
    'skills.qa': 'Aseguramiento de la calidad',
    'skills.office': 'Microsoft 365 y Excel',
    'skills.work': 'Cómo trabajo',
    'skills.agile': 'Metodologías ágiles',
    'skills.waterfall': 'Modelo en cascada',
    'skills.pm': 'Gestión de proyectos',
    'skills.present': 'Presentaciones a clientes',
    'skills.team': 'Trabajo en equipo',
    'skills.problem': 'Resolución de problemas y pensamiento crítico',
    'skills.learning': 'Aprendizaje continuo',
    'skills.clients': 'Ventas y clientes',
    'skills.sales': 'Ventas',
    'skills.service': 'Atención al cliente',
    'skills.relations': 'Relaciones comerciales',
    'skills.marketing': 'Mercadotecnia',
    'skills.speak': 'Idiomas',
    'skills.en': 'Inglés',
    'skills.es': 'Español',

    'projects.title': 'Proyectos',
    'projects.intro': 'Cosas que he construido. Cada una tiene una demo que puedes probar.',
    'link.demo': 'Probar la demo',
    'link.puzzle': 'Hacer el puzle',
    'tags.bilingual': 'Bilingüe ES/EN',

    'safemaps.desc': 'La mayoría de las aplicaciones de mapas eligen la ruta más rápida. SafeMaps elige primero la más segura, después la que ahorra combustible y, por último, la más rápida, para viajes en coche, en bicicleta, a pie y en autobús por Milwaukee.',
    'safemaps.highlight': 'Calcula las rutas con su propio motor sobre las calles de OpenStreetMap y datos públicos de accidentes. En un viaje de ejemplo, la ruta más segura obtiene cien puntos de seguridad frente a los veintiséis de la ruta estándar, a cambio de unos siete minutos más.',
    'safemaps.note': 'Demo con rutas calculadas de antemano.',

    'onetouch.desc': 'Un espacio de trabajo para el soporte informático: pregunta por las incidencias en lenguaje natural, crea tus propios paneles de gráficos y comprueba qué trabajo necesita atención primero.',
    'onetouch.highlight': 'Dibuja su propia arquitectura en 2D y 3D, para que puedas seguir una petición real por todo el sistema, paso a paso.',
    'onetouch.note': 'Demo con datos ficticios.',

    'guernica.title': 'En memoria de Guernica',
    'guernica.desc': 'Un puzle de dieciocho piezas del <i>Guernica</i> de Picasso. Cada pieza que colocas desvela un capítulo de la guerra civil española y de sus poetas (Lorca, Alberti, Cernuda, Guillén y Aleixandre), en español y en inglés.',
    'guernica.why': 'Por qué lo hice: el bombardeo de Guernica muestra lo que cuesta la violencia y por qué merece la pena recordar la acción pacífica y no violenta. Quería que la gente reconstruyera esa memoria con sus propias manos, pieza a pieza.',
    'guernica.note': 'Lo hice para una feria de tecnología. Picasso también pintó el <i>Guernica</i> para una: la Exposición Internacional de París de 1937, dedicada a las artes y las técnicas.',

    'exp.title': 'Experiencia',
    'exp.ics.role': 'Analista de negocio y control de calidad',
    'exp.ics.dates': 'De agosto a diciembre de 2026',
    'exp.ics.place': 'Milwaukee (Wisconsin)',
    'exp.ics.1': 'Desarrollo aplicaciones web para proyectos de clientes reales, combinando programación, análisis de negocio y liderazgo.',
    'exp.ics.2': 'Presento soluciones ante salas llenas de clientes y dirijo el turno de preguntas sobre el enfoque técnico y el valor para el negocio.',
    'exp.ics.3': 'Entrego proyectos con metodologías ágiles y con el modelo en cascada, y sigo el trabajo en Jira y GitHub.',
    'exp.park.role': 'Cierre de ventas',
    'exp.park.dates': 'De agosto a octubre de 2024',
    'exp.park.place': 'Miami (Florida)',
    'exp.park.1': 'Me ascendieron de la captación de clientes en frío al cierre de ventas en tres meses, con unas ventas que triplicaban la media del sector.',
    'exp.park.2': 'Mejoré el guion de ventas de la empresa y lo compartí con el equipo.',
    'exp.park.3': 'Enseñé nuevas tecnologías a la plantilla veterana y formé en técnicas de venta a las nuevas incorporaciones.',
    'exp.dominos.role': 'Atención al cliente',
    'exp.dominos.dates': 'De julio a octubre de 2022',
    'exp.dominos.place': 'Miami Beach (Florida)',
    'exp.dominos.1': 'Planificaba las rutas de reparto y coordinaba los tiempos del horno para que los pedidos salieran a su hora.',
    'exp.dominos.2': 'Gestionaba el inventario, atendía la caja y cerraba el local.',
    'exp.cert': 'Certificación CompTIA A+ (mayo de 2023)',

    'contact.title': 'Hablemos',
    'contact.text': '¿Construimos algo o solo quieres saludar? Escríbeme.',
    'contact.where': 'Vivo en la zona de Milwaukee.',
    'contact.email': 'Escríbeme',

    'footer.text': 'Diseñado y programado a mano, cambio a cambio.'
  }
};

const STORAGE_KEY = 'portfolio-lang';

function setLanguage(lang) {
  if (!STRINGS[lang]) lang = 'en';
  // Plain text: set as text so nothing is parsed as HTML.
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const text = STRINGS[lang][el.dataset.i18n];
    if (text) el.textContent = text;
  });
  // Text with italic titles: these strings are written in this file, never taken from visitors.
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const html = STRINGS[lang][el.dataset.i18nHtml];
    if (html) el.innerHTML = html;
  });
  document.documentElement.lang = lang;
  document.querySelectorAll('.lang-toggle button').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
  });
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* storage blocked: the choice just isn't remembered */ }
}

function startingLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
  } catch (e) { /* ignore */ }
  return (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en';
}

document.addEventListener('DOMContentLoaded', () => {
  // Keep the English from the page so switching back restores it exactly.
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    STRINGS.en[el.dataset.i18n] = el.textContent;
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    STRINGS.en[el.dataset.i18nHtml] = el.innerHTML;
  });

  document.querySelectorAll('.lang-toggle button').forEach((btn) => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });

  const lang = startingLanguage();
  if (lang !== 'en') setLanguage(lang);

  // Fade sections and cards in as they scroll into view.
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const targets = document.querySelectorAll('.section > h2, .about-grid, .skills-groups, .project-card, .job, .contact-list');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    targets.forEach((el, i) => {
      el.classList.add('reveal');
      if (el.classList.contains('project-card')) el.style.transitionDelay = `${(i % 3) * 90}ms`;
      io.observe(el);
    });
  }
});
