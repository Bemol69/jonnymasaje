// Solo interacción: menú, revelados, filtros, ficha de masaje, formulario a WhatsApp,
// horario abierto/cerrado, mapa diferido y popup del flyer. Todo el contenido ya viene escrito en el HTML.
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let SITIO = { whatsapp: '', nombre: '', horario: [], servicios: {} };
  try { SITIO = JSON.parse($('#sitio-datos').textContent); } catch { /* sin datos */ }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const waUrl = (t) => `https://api.whatsapp.com/send?phone=${SITIO.whatsapp}&text=${encodeURIComponent(t)}`;

  // ---------- Menú y barra ----------
  const nav = $('#nav');
  const burger = $('#burger');
  burger.addEventListener('click', () => {
    const abierto = nav.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', abierto);
  });
  $$('#menu a').forEach((a) => a.addEventListener('click', () => { nav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }));
  const onScroll = () => nav.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // ---------- Títulos por palabra ----------
  let n = 0;
  function dividir(nodo) {
    [...nodo.childNodes].forEach((c) => {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach((p) => {
          if (!p) return;
          if (/^\s+$/.test(p)) { frag.append(' '); return; }
          const w = document.createElement('span'); w.className = 'w';
          const i = document.createElement('span'); i.textContent = p; i.style.setProperty('--i', n++);
          w.append(i); frag.append(w);
        });
        c.replaceWith(frag);
      } else if (c.nodeType === 1) dividir(c);
    });
  }
  $$('[data-words]').forEach((el) => { el.setAttribute('aria-label', el.textContent.trim()); n = 0; dividir(el); $$('.w', el).forEach((w) => w.setAttribute('aria-hidden', 'true')); });

  // ---------- Revelados ----------
  const objetivos = $$('[data-reveal], [data-words], .led, .hero__art');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    objetivos.forEach((el) => io.observe(el));
  } else objetivos.forEach((el) => el.classList.add('is-in'));

  // Parallax suave de los arcos del hero (solo transform)
  const arte = $('.hero__art');
  if (arte && !reduce && matchMedia('(min-width: 900px)').matches) {
    const a = $('.arch--cabina', arte), o = $('.orb', arte);
    let tick = false;
    addEventListener('scroll', () => {
      if (tick) return; tick = true;
      requestAnimationFrame(() => { const y = Math.min(scrollY, 900); a.style.transform = `translateY(${y * -0.06}px)`; o.style.transform = `translateY(${y * 0.05}px)`; tick = false; });
    }, { passive: true });
  }

  // ---------- Filtros ----------
  const grid = $('#svcGrid');
  $$('.chip').forEach((chip) => chip.addEventListener('click', () => {
    const f = chip.dataset.filtro;
    $$('.chip').forEach((c) => c.classList.toggle('is-on', c === chip));
    grid.classList.toggle('is-filtered', f !== '*');
    $$('.svc', grid).forEach((s) => { s.hidden = f !== '*' && s.dataset.cat !== f; if (!s.hidden) s.classList.add('is-in'); });
  }));

  // ---------- Ficha de masaje ----------
  const modal = $('#modal');
  const loto = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 10c6 8 8 16 0 28-8-12-6-20 0-28Z"/><path d="M32 38c-6-2-14-8-18-18 10 0 18 4 18 18Z"/><path d="M32 38c6-2 14-8 18-18-10 0-18 4-18 18Z"/><path d="M10 46c8 6 14 8 22 8s14-2 22-8"/></svg>';
  function abrir(id) {
    const s = SITIO.servicios[id]; if (!s) return;
    $('#mCat').textContent = s.c; $('#m-nombre').textContent = s.n; $('#mTxt').textContent = s.t;
    $('#mPrice').textContent = s.p + (s.d ? ` · ${s.d}` : '');
    const m = $('#mMedia'); m.className = 'modal__media' + (s.f.length ? '' : ' is-orn');
    m.innerHTML = s.f.length ? '' : loto;
    if (s.f.length) { const img = new Image(); img.src = s.f[0]; img.alt = s.n; m.append(img); }
    const w = $('#mWa'); if (w) w.href = s.wa || '#';
    modal.showModal();
  }
  $$('[data-servicio]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.servicio)));
  $('#mX').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

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
      if (v('#f-detalle')) l.push(`📝 *Detalle:* ${v('#f-detalle')}`);
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
      let txt, on = false;
      if (abierto) { txt = `🟢 Abierto ahora · cierra a las ${corta(abierto[1])}`; on = true; }
      else {
        const luego = hoy.find(([a]) => min < aMin(a));
        if (luego) txt = `🔴 Cerrado · abre hoy a las ${corta(luego[0])}`;
        else {
          let sig = null;
          for (let i = 1; i <= 7 && !sig; i++) { const dd = (d + i) % 7; const t = tramosDe(dd); if (t.length) sig = [dd, t[0][0], i]; }
          txt = sig ? `🔴 Cerrado · abre ${sig[2] === 7 ? 'el próximo ' : 'el '}${DIAS[sig[0]]} a las ${corta(sig[1])}` : '🔴 Cerrado';
        }
      }
      estado.textContent = txt; estado.classList.toggle('is-open', on);
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
