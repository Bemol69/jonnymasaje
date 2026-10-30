// Arma la web para publicar. Vercel lo ejecuta en cada cambio (ver vercel.json).
//  1. Lee sitio.config.json (lo define el desarrollador) y data/*.json (lo edita el cliente en /admin)
//  2. Optimiza las fotos a WebP (dist/img/_opt) y escribe las tarjetas dentro del HTML (para Google)
//  3. Reemplaza los %%MARCADORES%% y bloques <!-- SI:CLAVE -->, y genera canonical, Open Graph,
//     datos estructurados, robots.txt y sitemap.xml
// Uso local: node scripts/build.mjs  →  servir la carpeta dist/
import { readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, 'data');
const DIST = join(ROOT, 'dist');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const readData = (file) => {
  if (!existsSync(join(DATA, file))) return {};
  try { return readJson(join(DATA, file)); } catch (e) { console.warn(`⚠️  data/${file} dañado, se usan valores por defecto: ${e.message}`); return {}; }
};

// Se vacía dist/ por dentro (en Windows la carpeta puede estar abierta por el servidor local o una terminal)
mkdirSync(DIST, { recursive: true });
for (const f of readdirSync(DIST)) rmSync(join(DIST, f), { recursive: true, force: true });

// ---------- Fotos livianas ----------
let sharp = null;
try { sharp = (await import('sharp')).default; } catch { console.warn('⚠️  sharp no está instalado (npm install): se usan las fotos originales'); }
const OPT = 'img/_opt';
const optimizadas = new Map();
function optimizar(src, ancho) {
  const path = String(src || '').replace(/^\//, '');
  if (!path) return Promise.resolve('');
  if (!sharp || !/\.(jpe?g|png|webp)$/i.test(path) || !existsSync(join(ROOT, path))) return Promise.resolve(path);
  const key = `${path}@${ancho}`;
  if (!optimizadas.has(key)) {
    optimizadas.set(key, (async () => {
      try {
        const buf = readFileSync(join(ROOT, path));
        const out = `${OPT}/${createHash('sha1').update(buf).digest('hex').slice(0, 12)}-${ancho}.webp`;
        mkdirSync(join(DIST, OPT), { recursive: true });
        await sharp(buf).rotate().resize({ width: ancho, withoutEnlargement: true }).webp({ quality: 78, effort: 5 }).toFile(join(DIST, out));
        return out;
      } catch (e) {
        console.warn(`⚠️  No se pudo optimizar ${path}: ${e.message}`);
        return path;
      }
    })());
  }
  return optimizadas.get(key);
}

const config = readJson(join(ROOT, 'sitio.config.json'));
const ajustes = readData('ajustes.json');
const flyerData = readData('flyer.json');
const sesionData = readData('sesion.json');
const testimoniosData = readData('testimonios.json');

// Manda el dominio propio de site_url; si todavía es un .vercel.app, se usa el dominio de producción de Vercel
const propio = config.site_url && !/\.vercel\.app/.test(config.site_url);
const SITE = (!propio && process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : config.site_url || 'http://localhost:5611').replace(/\/$/, '');

// ---------- 1. Datos ----------
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const rel = (path) => str(path).replace(/^\//, '');
const num = (v, def) => (v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : def);
const lista = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

const T = {
  nombre: str(config.nombre),
  marca_a: str(config.marca_a) || str(config.nombre),
  marca_b: str(config.marca_b),
  lema: str(config.lema),
  rubro: str(config.rubro),
  whatsapp: str(ajustes.whatsapp).replace(/\D/g, ''),
  mensaje: str(ajustes.mensaje_whatsapp) || 'Hola! Vi tu página y quiero reservar un masaje 👋',
  instagram: str(ajustes.instagram).replace(/^@/, ''),
  email: str(ajustes.email),
  ciudad: str(ajustes.ciudad),
  region: str(ajustes.region),
  direccion: str(ajustes.direccion),
  zonas: lista(ajustes.zonas),
};

if (!T.nombre) throw new Error('Falta el nombre (sitio.config.json)');
if (T.whatsapp && (!/^\d{10,15}$/.test(T.whatsapp) || (T.whatsapp.startsWith('56') && !/^569\d{8}$/.test(T.whatsapp)))) {
  throw new Error(`WhatsApp inválido "${T.whatsapp}": usa formato internacional; en Chile son 11 dígitos, ej 56912345678`);
}
const wa = (texto) => `https://api.whatsapp.com/send?phone=${T.whatsapp}&text=${encodeURIComponent(texto)}`;

function readFolder(folder) {
  const dir = join(DATA, folder);
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
  const items = [];
  for (const file of files) {
    try { items.push({ id: basename(file, '.json'), ...readJson(join(dir, file)) }); }
    catch (e) { console.warn(`⚠️  Se omitió ${folder}/${file}: ${e.message}`); }
  }
  return items;
}
const byOrder = (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es');
const conNombre = (x) => x.visible !== false && typeof x.nombre === 'string' && x.nombre.trim();

const CATEGORIAS = [
  { id: 'relajacion', nombre: 'Relajación' },
  { id: 'musculo', nombre: 'Músculo' },
  { id: 'rostro', nombre: 'Rostro' },
  { id: 'domicilio', nombre: 'A domicilio' },
];
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const MAX_SERVICIOS = 10; // demo: nunca más de 10

const servicios = readFolder('servicios').filter(conNombre).map((s) => {
  const nombre = s.nombre.trim();
  const precio = num(s.precio, 0) > 0 ? Math.round(num(s.precio, 0)) : 0;
  const cat = CATEGORIAS.find((c) => c.id === str(s.categoria)) || CATEGORIAS[0];
  return {
    id: s.id, nombre, cat, precio,
    duracion: str(s.duracion),
    texto: str(s.texto),
    portada: rel(s.portada),
    fotos: lista(s.fotos).map(rel),
    etiqueta: str(s.etiqueta),
    destacado: s.destacado === true,
    orden: num(s.orden, 1000),
    mensaje: str(s.mensaje) || `Hola! Quiero info de ${nombre} 👋`,
  };
}).sort((a, b) => (b.destacado - a.destacado) || byOrder(a, b)).slice(0, MAX_SERVICIOS);

await Promise.all(servicios.map(async (s, i) => {
  const [chica, grande] = i === 0 ? [800, 1200] : [480, 800];
  s.mini = await optimizar(s.portada, grande);
  s.miniChica = await optimizar(s.portada, chica);
  s.srcset = s.mini === s.miniChica ? '' : `${s.miniChica} ${chica}w, ${s.mini} ${grande}w`;
  s.sizes = i === 0 ? '(max-width: 900px) 100vw, 720px' : '(max-width: 600px) 100vw, (max-width: 960px) 50vw, 400px';
  const todas = [...new Set([s.portada, ...s.fotos].filter(Boolean))];
  s.galeria = await Promise.all(todas.map((f) => optimizar(f, 1200)));
}));

const categorias = CATEGORIAS.filter((c) => servicios.some((s) => s.cat.id === c.id));
const pasos = (Array.isArray(sesionData.pasos) ? sesionData.pasos : [])
  .map((p) => ({ titulo: str(p && p.titulo), texto: str(p && p.texto) })).filter((p) => p.titulo);
const testimonios = (Array.isArray(testimoniosData.testimonios) ? testimoniosData.testimonios : [])
  .map((t) => ({ texto: str(t && t.texto), nombre: str(t && t.nombre), detalle: str(t && t.detalle) })).filter((t) => t.texto && t.nombre);

// Horario por día (lunes = 0). Cada día: cerrado, o 1-2 tramos HH:MM
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const hora = (v) => (/^([01]?\d|2[0-3]):[0-5]\d$/.test(str(v)) ? str(v).padStart(5, '0') : '');
const horario = (Array.isArray(ajustes.horario) ? ajustes.horario : []).map((h) => {
  const d = DIAS.indexOf(str(h && h.dia));
  if (d < 0) return null;
  const tramos = [];
  if (h.cerrado !== true) {
    if (hora(h.abre) && hora(h.cierra)) tramos.push([hora(h.abre), hora(h.cierra)]);
    if (hora(h.abre2) && hora(h.cierra2)) tramos.push([hora(h.abre2), hora(h.cierra2)]);
  }
  return { d, tramos };
}).filter(Boolean).sort((a, b) => a.d - b.d);
const hayHorario = horario.some((h) => h.tramos.length);
console.log(`✅ datos: ${servicios.length} servicios (${servicios.filter((s) => s.precio).length} con precio), ${categorias.length} categorías, ${pasos.length} pasos, ${testimonios.length} testimonios, horario ${hayHorario ? 'sí' : 'no'}`);

// ---------- 2. HTML de las secciones ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const abs = (path) => `${SITE}/${String(path).replace(/^\//, '')}`;
const pad = (n) => String(n).padStart(2, '0');
const flecha = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const loto = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 10c6 8 8 16 0 28-8-12-6-20 0-28Z"/><path d="M32 38c-6-2-14-8-18-18 10 0 18 4 18 18Z"/><path d="M32 38c6-2 14-8 18-18-10 0-18 4-18 18Z"/><path d="M10 46c8 6 14 8 22 8s14-2 22-8" /></svg>';
const precioTxt = (s) => (s.precio ? `Desde $${miles(s.precio)}` : 'Cotizar por WhatsApp');

const servicioHtml = (s, i) => `
        <li class="menu__item${i === 0 ? ' is-on' : ''}" data-id="${esc(s.id)}">
          <button type="button" class="menu__row" data-servicio="${esc(s.id)}" aria-expanded="${i === 0}" aria-controls="det-${esc(s.id)}">
            <span class="menu__name">${esc(s.nombre)}</span>
            <span class="menu__dur">${esc(s.duracion)}</span>
            <span class="menu__price${s.precio ? '' : ' is-ask'}">${esc(s.precio ? `Desde $${miles(s.precio)}` : 'Cotizar')}</span>
            <span class="menu__chev" aria-hidden="true"></span>
          </button>
          <div class="menu__detail" id="det-${esc(s.id)}"${i === 0 ? '' : ' hidden'}>
            <figure class="menu__fig"><img src="${esc(s.mini || 'img/logo.jpg')}" alt="${esc(s.nombre)}" width="480" height="360" loading="lazy" decoding="async"></figure>
            <p>${esc(s.texto)}</p>
            ${T.whatsapp ? `<a class="btn btn--dark" href="${esc(wa(s.mensaje))}" target="_blank" rel="noopener">Reservar este masaje</a>` : ''}
          </div>
        </li>`;

const pasoHtml = (p, i) => `
          <li data-reveal style="--d:${i * 90}ms"><span class="step__n">${pad(i + 1)}</span><div><strong>${esc(p.titulo)}</strong><p>${esc(p.texto)}</p></div></li>`;
const testimonioHtml = (t, i) => `
        <figure class="quote" data-reveal style="--d:${i * 80}ms">
          <blockquote>“${esc(t.texto)}”</blockquote>
          <figcaption><strong>${esc(t.nombre)}</strong>${t.detalle ? `<span>${esc(t.detalle)}</span>` : ''}</figcaption>
        </figure>`;
const filtrosHtml = [{ id: '*', nombre: 'Todos' }, ...categorias].map((c, i) =>
  `<button type="button" class="chip${i === 0 ? ' is-on' : ''}" data-filtro="${esc(c.id)}">${esc(c.nombre)}</button>`).join('');
const horaCorta = (h) => h.replace(/^0/, '');
const horarioTabla = DIAS.map((dia, d) => {
  const h = horario.find((x) => x.d === d);
  const txt = h && h.tramos.length ? h.tramos.map(([a, b]) => `${horaCorta(a)} – ${horaCorta(b)}`).join(' y ') : 'Cerrado';
  return `<li data-dia="${d}"><span>${dia}</span><span>${txt}</span></li>`;
}).join('');
const marquee = [...servicios.map((s) => s.nombre), 'Tu bienestar, mi prioridad'];

// ---------- 3. Marcadores ----------
const colores = config.colores || {};
const fuentes = config.fuentes || {};
const FUENTE_TITULOS = fuentes.titulos || 'Bricolage Grotesque';
const FUENTE_TEXTO = fuentes.texto || 'Hanken Grotesk';
const fuenteParam = (f, pesos) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:${pesos}`;
const SEO_TITULO = str(config.seo_titulo) || `${T.nombre} · ${T.rubro} en ${T.ciudad}`;
const SEO_DESCRIPCION = str(config.seo_descripcion) || str(ajustes.hero_bajada);
const precioMin = servicios.filter((s) => s.precio).sort((x, y) => x.precio - y.precio)[0];
const flyerImg = rel(flyerData.imagen);
const flyerOn = flyerData.mostrar !== false && flyerImg && existsSync(join(ROOT, flyerImg));
const mapaQuery = encodeURIComponent(T.direccion);
const heroFoto = 'img/jonny.jpg';
const waNum = T.whatsapp ? `+${T.whatsapp.slice(0, 2)} ${T.whatsapp.slice(2, 3)} ${T.whatsapp.slice(3, 7)} ${T.whatsapp.slice(7)}` : '';

const VARS = {
  NOMBRE: T.nombre, MARCA_A: T.marca_a, MARCA_B: T.marca_b, LEMA: T.lema, RUBRO: T.rubro,
  SEO_TITULO, SEO_DESCRIPCION,
  CIUDAD: T.ciudad, REGION: T.region, EMAIL: T.email, INSTAGRAM: T.instagram, DIRECCION: T.direccion,
  WHATSAPP: T.whatsapp ? '1' : '', HORARIO: hayHorario ? '1' : '', FLYER: flyerOn ? '1' : '', FLYER_POPUP: flyerOn && flyerData.popup === true ? '1' : '',
  TESTIMONIOS: testimonios.length ? '1' : '', PASOS: pasos.length ? '1' : '', FILTROS_ON: categorias.length > 1 ? '1' : '',
  WA_LINK: T.whatsapp ? wa(T.mensaje) : '#', WA_NUMERO: waNum,
  MAPA_URL: `https://www.google.com/maps?q=${mapaQuery}&output=embed`,
  COMO_LLEGAR: `https://www.google.com/maps/search/?api=1&query=${mapaQuery}`,
  HERO_EYEBROW: str(ajustes.hero_eyebrow), HERO_TITULO: str(ajustes.hero_titulo), HERO_DESTACADO: str(ajustes.hero_destacado), HERO_BAJADA: str(ajustes.hero_bajada),
  HERO_FOTO: await optimizar(heroFoto, 640), HERO_CABINA: await optimizar('img/servicios/relajacion.jpg', 480), HERO_PIEDRAS: await optimizar('img/servicios/piedras-calientes.jpg', 360),
  SOBRE_TITULO: str(ajustes.sobre_titulo), SOBRE_TEXTO: str(ajustes.sobre_texto), FRASE: str(ajustes.frase), FRASE_TEXTO: str(ajustes.frase_texto),
  PASOS_TITULO: str(sesionData.titulo) || 'Así es tu sesión', PASOS_BAJADA: str(sesionData.bajada),
  FLYER_IMG: flyerOn ? await optimizar(flyerImg, 900) : '', FLYER_TITULO: str(flyerData.titulo), FLYER_TEXTO: str(flyerData.texto),
  FLYER_WA: T.whatsapp ? wa(str(flyerData.mensaje_whatsapp) || T.mensaje) : '#',
  N_SERVICIOS: String(servicios.length),
  PRECIO_DESDE: precioMin ? `$${miles(precioMin.precio)}` : '', DURACION_DESDE: precioMin ? precioMin.duracion : '',
  FUENTES_URL: `https://fonts.googleapis.com/css2?${fuenteParam(FUENTE_TITULOS, 'opsz,wght@12..96,500..800')}&${fuenteParam(FUENTE_TEXTO, 'wght@300;400;500;600')}&display=swap`,
  FUENTE_TITULOS, FUENTE_TEXTO,
  DIAS_OPCIONES: DIAS.map((d) => `
              - ${d}`).join(''),
  CATEGORIAS_OPCIONES: CATEGORIAS.map((c) => `
          - { label: ${JSON.stringify(c.nombre)}, value: ${c.id} }`).join(''),
  GITHUB_REPO: str(config.github_repo), SITE_URL: `${SITE}/`, ANIO: String(new Date().getFullYear()),
  COLOR_TINTA: colores.tinta, COLOR_NOGAL: colores.nogal, COLOR_DORADO: colores.dorado, COLOR_DORADO_CLARO: colores.dorado_claro,
  COLOR_PAPEL: colores.papel, COLOR_CREMA: colores.crema, COLOR_LINEA: colores.linea, COLOR_SALVIA: colores.salvia,
  // Solo lo que necesita el navegador (app.js)
  SITIO_JSON: JSON.stringify({
    whatsapp: T.whatsapp,
    nombre: T.nombre,
    horario: hayHorario ? horario : [],
    servicios: Object.fromEntries(servicios.map((s) => [s.id, {
      n: s.nombre, c: s.cat.nombre, t: s.texto, p: precioTxt(s), d: s.duracion, f: s.galeria, wa: T.whatsapp ? wa(s.mensaje) : '',
    }])),
  }).replace(/</g, '\\u003c'),
};

// Bloques opcionales: <!-- SI:CLAVE --> ... <!-- /SI:CLAVE --> se eliminan si CLAVE está vacía
function render(text, file, escape, extra = {}) {
  const V = { ...VARS, ...extra };
  let out = text;
  for (let prev; prev !== out;) {
    prev = out;
    out = out.replace(/<!-- SI:([A-Z0-9_]+) -->([\s\S]*?)<!-- \/SI:\1 -->/g, (m, key, body) => (str(V[key]) ? body : ''));
  }
  const missing = new Set();
  out = out.replace(/%%([A-Z0-9_]+)%%/g, (m, key) => {
    const v = V[key];
    if (v === undefined || v === null || (v === '' && key.startsWith('COLOR_'))) { missing.add(key); return m; }
    return escape && key !== 'SITIO_JSON' ? esc(v) : String(v);
  });
  if (missing.size) throw new Error(`${file}: faltan valores para ${[...missing].join(', ')}`);
  return out;
}

// ---------- 4. SEO ----------
const OG_IMAGE = abs('img/og-base.jpg');
const dayEn = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': str(config.schema_tipo) || 'LocalBusiness',
  '@id': `${SITE}/#negocio`,
  name: T.nombre,
  slogan: T.lema || undefined,
  description: SEO_DESCRIPCION,
  url: `${SITE}/`,
  logo: abs('img/logo.jpg'),
  image: [OG_IMAGE, abs(heroFoto)],
  email: T.email || undefined,
  telephone: T.whatsapp ? `+${T.whatsapp}` : undefined,
  priceRange: servicios.some((s) => s.precio) ? `Desde $${miles(Math.min(...servicios.filter((s) => s.precio).map((s) => s.precio)))} CLP` : undefined,
  areaServed: T.zonas.map((name) => ({ '@type': 'City', name: name.replace(/\s*\(.*\)/, '') })),
  address: { '@type': 'PostalAddress', streetAddress: T.direccion || undefined, addressLocality: T.ciudad, addressRegion: T.region || undefined, addressCountry: 'CL' },
  openingHoursSpecification: hayHorario ? horario.filter((h) => h.tramos.length).flatMap((h) => h.tramos.map(([opens, closes]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: dayEn[h.d], opens, closes }))) : undefined,
  hasMap: T.direccion ? `https://www.google.com/maps/search/?api=1&query=${mapaQuery}` : undefined,
  sameAs: T.instagram ? [`https://www.instagram.com/${T.instagram}/`] : [],
  hasOfferCatalog: {
    '@type': 'OfferCatalog', name: 'Masajes',
    itemListElement: servicios.map((s) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: s.nombre, description: s.texto },
      ...(s.precio ? { priceSpecification: { '@type': 'PriceSpecification', priceCurrency: 'CLP', minPrice: s.precio } } : {}),
    })),
  },
};
const head = `<link rel="canonical" href="${SITE}/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(T.nombre)}">
  <meta property="og:locale" content="es_CL">
  <meta property="og:url" content="${SITE}/">
  <meta property="og:title" content="${esc(SEO_TITULO)}">
  <meta property="og:description" content="${esc(SEO_DESCRIPCION)}">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(T.nombre)}">
  <meta name="twitter:card" content="summary_large_image">${config.google_verificacion
    ? `\n  <meta name="google-site-verification" content="${esc(config.google_verificacion)}">` : ''}
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`;

// ---------- 5. dist/ ----------
const BLOQUES = {
  '<!-- SERVICIOS -->': servicios.map(servicioHtml).join(''),
  '<!-- PASOS -->': pasos.map(pasoHtml).join(''),
  '<!-- TESTIMONIOS -->': testimonios.map(testimonioHtml).join(''),
  '<!-- SELECT_SERVICIOS -->': servicios.map((s) => `<option>${esc(s.nombre)}</option>`).join(''),
  '<!-- HORARIO_TABLA -->': horarioTabla,
};
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const marker of ['<!-- SEO:HEAD', ...Object.keys(BLOQUES)]) {
  if (!html.includes(marker)) throw new Error(`Falta el marcador ${marker} en index.html`);
}
html = render(html, 'index.html', true).replace(/<!-- SEO:HEAD[^>]*-->/, () => head);
for (const [marker, contenido] of Object.entries(BLOQUES)) html = html.replaceAll(marker, () => contenido);

cpSync(join(ROOT, 'img'), join(DIST, 'img'), { recursive: true });
// favicon.ico: ICO con un PNG adentro
if (sharp && existsSync(join(ROOT, 'img', 'logo.jpg'))) {
  const png = await sharp(join(ROOT, 'img', 'logo.jpg')).resize(48, 48).png().toBuffer();
  const ico = Buffer.alloc(22);
  ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
  ico.writeUInt8(48, 6); ico.writeUInt8(48, 7); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
  writeFileSync(join(DIST, 'favicon.ico'), Buffer.concat([ico, png]));
}
if (existsSync(join(ROOT, '404.html'))) writeFileSync(join(DIST, '404.html'), render(readFileSync(join(ROOT, '404.html'), 'utf8'), '404.html', true));
cpSync(join(ROOT, 'admin'), join(DIST, 'admin'), { recursive: true });
const css = render(readFileSync(join(ROOT, 'styles.css'), 'utf8'), 'styles.css', false);
const js = render(readFileSync(join(ROOT, 'app.js'), 'utf8'), 'app.js', false);
const version = (text) => createHash('sha1').update(text).digest('hex').slice(0, 10);
html = html
  .replace('href="styles.css"', `href="styles.css?v=${version(css)}"`)
  .replace('src="app.js"', `src="app.js?v=${version(js)}"`);
writeFileSync(join(DIST, 'index.html'), html);
writeFileSync(join(DIST, 'styles.css'), css);
writeFileSync(join(DIST, 'app.js'), js);
writeFileSync(join(DIST, 'admin', 'config.yml'), render(readFileSync(join(ROOT, 'admin', 'config.yml'), 'utf8'), 'admin/config.yml', false));

writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>
</urlset>
`);

if (!T.whatsapp) console.warn('⚠️  Sin WhatsApp: los botones y el formulario se ocultan');
console.log(`✅ sitio listo en dist/ para ${SITE}`);
