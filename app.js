// Solo interacción: menú, carta de masajes, reserva rápida y formulario a WhatsApp,
// horario abierto/cerrado, mapa diferido y popup del flyer. El contenido ya viene escrito en el HTML.
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let SITIO = { whatsapp: '', nombre: '', horario: [], servicios: {} };
  try { SITIO = JSON.parse($('#sitio-datos').textContent); } catch { /* sin datos */ }
  const waUrl = (t) => `https://api.whatsapp.com/send?phone=${SITIO.whatsapp}&text=${encodeURIComponent(t)}`;

  // ---------- Menú ----------
  const nav = $('#nav');
  const burger = $('#burger');
  burger.addEventListener('click', () => {
    const abierto = nav.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', abierto);
  });
  $$('#menu a').forEach((a) => a.addEventListener('click', () => { nav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }));

  // ---------- Carta de masajes ----------
  const items = $$('.menu__item');
  const vista = $('#vista');
  const escritorio = matchMedia('(min-width: 960px)');
  function mostrar(id) {
    const s = SITIO.servicios[id]; if (!s || !vista) return;
    const img = $('#vImg');
    vista.classList.add('is-swap');
    setTimeout(() => {
      img.src = s.f[0] || 'img/logo.jpg'; img.alt = s.n;
      $('#vNombre').textContent = s.n; $('#vTxt').textContent = s.t;
      $('#vPrecio').textContent = s.p + (s.d ? ` · ${s.d}` : '');
      const w = $('#vWa'); if (w) w.href = s.wa || '#';
      vista.classList.remove('is-swap');
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  }
  function elegir(item) {
    const abrir = !item.classList.contains('is-on') || escritorio.matches;
    items.forEach((i) => {
      const on = i === item && abrir;
      i.classList.toggle('is-on', on);
      $('.menu__row', i).setAttribute('aria-expanded', on);
      $('.menu__detail', i).hidden = !on;
    });
    if (abrir) mostrar(item.dataset.id);
  }
  items.forEach((i) => $('.menu__row', i).addEventListener('click', () => elegir(i)));
  if (items[0]) mostrar(items[0].dataset.id);

  // ---------- Reserva rápida ----------
  const quick = $('#quick');
  if (quick) quick.addEventListener('submit', (e) => {
    e.preventDefault();
    const masaje = $('#q-masaje').value, modo = $('#q-modo').value;
    window.open(waUrl(`Hola! Quiero reservar ${masaje} 👋\n\n📍 *Lugar:* ${modo}\n\n¿Qué horarios tienes disponibles?`), '_blank', 'noopener');
  });

  // ---------- Formulario → WhatsApp ----------
  const form = $('#form');
  if (form) {
    const modo = $('#f-modo'), comunaWrap = $('#f-comuna-wrap');
    const v = (id) => $(id).value.trim();
    function mensaje() {
      const domicilio = modo.value === 'A domicilio';
      const l = ['Hola! Quiero reservar un masaje 👋', ''];
      l.push(`🙋 *Nombre:* ${v('#f-nombre') || '…'}`);
      l.push(`💆 *Masaje:* ${v('#f-masaje') || '…'}`);
      l.push(`📍 *Lugar:* ${modo.value || '…'}`);
      if (domicilio) l.push(`🏠 *Comuna:* ${v('#f-comuna') || '…'}`);
      if (v('#f-cuando')) l.push(`🗓️ *Día y hora:* ${v('#f-cuando')}`);
      if (v('#f-detalle')) l.push(`📝 *Comentarios:* ${v('#f-detalle')}`);
      return l.join('\n');
    }
    const pintar = () => { comunaWrap.hidden = modo.value !== 'A domicilio'; $('#preview').textContent = mensaje().replace(/\*/g, ''); };
    form.addEventListener('input', pintar); form.addEventListener('change', pintar); pintar();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const req = [['nombre', '#f-nombre'], ['masaje', '#f-masaje'], ['modo', '#f-modo']];
      if (modo.value === 'A domicilio') req.push(['comuna', '#f-comuna']);
      let primero = null;
      ['nombre', 'masaje', 'modo', 'comuna'].forEach((k) => $(`[data-err="${k}"]`).closest('.field').classList.remove('is-bad'));
      req.forEach(([k, id]) => { if (!v(id)) { $(`[data-err="${k}"]`).closest('.field').classList.add('is-bad'); primero = primero || $(id); } });
      if (primero) { primero.focus(); return; }
      window.open(waUrl(mensaje()), '_blank', 'noopener');
    });
  }

  // ---------- Horario abierto / cerrado (hora de Chile) ----------
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const estado = $('#estado');
  if (estado && SITIO.horario.length) {
    const aMin = (h) => { const [a, b] = h.split(':'); return +a * 60 + +b; };
    const corta = (h) => h.replace(/^0/, '');
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const MAPA = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const ahora = () => { const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value])); return [MAPA[p.weekday], +p.hour * 60 + +p.minute]; };
    const tramosDe = (d) => (SITIO.horario.find((h) => h.d === d) || { tramos: [] }).tramos;
    function pintarEstado(d, min) {
      const hoy = tramosDe(d);
      const abierto = hoy.find(([a, b]) => min >= aMin(a) && min < aMin(b));
      let txt;
      if (abierto) txt = `🟢 Abierto ahora · cierra a las ${corta(abierto[1])}`;
      else {
        const luego = hoy.find(([a]) => min < aMin(a));
        if (luego) txt = `🔴 Cerrado · abre hoy a las ${corta(luego[0])}`;
        else {
          let sig = null;
          for (let i = 1; i <= 7 && !sig; i++) { const dd = (d + i) % 7; const t = tramosDe(dd); if (t.length) sig = [dd, t[0][0], i]; }
          txt = sig ? `🔴 Cerrado · abre ${sig[2] === 7 ? 'el próximo ' : 'el '}${DIAS[sig[0]]} a las ${corta(sig[1])}` : '🔴 Cerrado';
        }
      }
      estado.textContent = txt;
      $$('#horario li').forEach((li) => li.classList.toggle('is-today', +li.dataset.dia === d));
    }
    window.__estadoHorario = pintarEstado; // para pruebas: __estadoHorario(0, 600)
    const refrescar = () => pintarEstado(...ahora());
    refrescar(); setInterval(refrescar, 60000);
  }

  // ---------- Mapa diferido ----------
  const mapa = $('#mapa');
  if (mapa) {
    const cargar = () => {
      if ($('iframe', mapa)) return;
      const f = document.createElement('iframe');
      f.src = mapa.dataset.src; f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade'; f.title = `Mapa de ${SITIO.nombre}`;
      mapa.append(f);
    };
    $('#mapaBtn').addEventListener('click', cargar);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { cargar(); io.disconnect(); } }, { rootMargin: '300px' });
      io.observe(mapa);
    }
  }

  // ---------- Popup del flyer (una vez por visita) ----------
  const popup = $('#popup');
  if (popup) {
    let visto = false; try { visto = sessionStorage.getItem('flyer') === '1'; } catch { /* sin storage */ }
    if (!visto) setTimeout(() => { try { sessionStorage.setItem('flyer', '1'); } catch { /* nada */ } popup.showModal(); }, 4000);
    $('#pX').addEventListener('click', () => popup.close());
    popup.addEventListener('click', (e) => { if (e.target === popup) popup.close(); });
  }
})();
