/* ==========================================================================
   Núcleo: datos, sincronización y piezas de interfaz compartidas.
   Cada módulo importa de aquí; nadie habla con localStorage directamente.
   ========================================================================== */

export const COLECCIONES = ['gastos', 'habitos', 'registros', 'notas', 'categorias', 'fijos',
                            'inversiones', 'invmov', 'posiciones'];

const K = {
  datos:  c => 'vida.' + c,
  cola:   c => 'vida.cola.' + c,
  cfg:    'vida.nube',
  ajuste: a => 'vida.ajuste.' + a,
  sync:   'vida.ultimaSync',
};

/* ---------- Utilidades ---------- */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/* Importes en prosa: van envueltos para que el modo discreto los tape igual
   que las cifras de las tarjetas. En textos planos (avisos, title) usa eur(). */
export const eurN  = n => `<span class="num">${eur(n)}</span>`;
export const eurN0 = n => `<span class="num">${eur0(n)}</span>`;

export const eur  = n => n.toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';
export const eur0 = n => Math.round(n).toLocaleString('es-ES') + ' €';
/* Porcentajes en español: coma decimal. Escritos con toString salían «14.2%»
   justo al lado de un «1.432,04 €», con los dos separadores al revés en la
   misma línea. */
export const pc = (n, dec = 1) =>
  n.toLocaleString('es-ES', {minimumFractionDigits:dec, maximumFractionDigits:dec}) + '%';
export const escapar = s => String(s ?? '').replace(/[<>&"]/g,
  m => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[m]));

/** Día natural en formato AAAA-MM-DD, en hora local (no UTC). */
export const dia = (ms = Date.now()) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
export const desdeDia = s => { const [a,m,d] = s.split('-').map(Number); return new Date(a, m-1, d) };
export const diaSuma = (s, n) => { const d = desdeDia(s); d.setDate(d.getDate() + n); return dia(d.getTime()) };

/* ---------- Periodos: día, semana (empieza en lunes) y mes ---------- */
/** Lunes de la semana a la que pertenece esa fecha. */
export const lunes = (ms = Date.now()) => {
  const d = new Date(ms);
  d.setHours(12,0,0,0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // domingo (0) cuenta como último día
  return d;
};
/** Clave del periodo. Los días conservan el formato antiguo, así no hay migración. */
export const periodo = (frec, ms = Date.now()) =>
  frec === 'semana' ? 's' + dia(lunes(ms).getTime())
  : frec === 'mes'  ? 'm' + dia(ms).slice(0, 7)
  : dia(ms);

/** Devuelve la clave de n periodos antes. */
export function periodoAtras(frec, clave, n) {
  if (frec === 'semana') return 's' + diaSuma(clave.slice(1), -7 * n);
  if (frec === 'mes') {
    const [a, m] = clave.slice(1).split('-').map(Number);
    const d = new Date(a, m - 1 - n, 1);
    return 'm' + `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  return diaSuma(clave, -n);
}
export function etiquetaPeriodo(frec, clave) {
  if (frec === 'semana') return desdeDia(clave.slice(1))
    .toLocaleDateString('es-ES', {day:'numeric', month:'short'});
  if (frec === 'mes') { const [a,m] = clave.slice(1).split('-').map(Number);
    return new Date(a, m-1, 1).toLocaleDateString('es-ES', {month:'short'}).replace('.',''); }
  return desdeDia(clave).toLocaleDateString('es-ES', {day:'numeric', month:'short'});
}
export const inicioMes = off => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+off, 1) };
export const finMes    = off => new Date(inicioMes(off+1).getTime() - 1);
export const nombreMes = off => inicioMes(off)
  .toLocaleDateString('es-ES', {month:'long', year:'numeric'}).replace(/^./, m => m.toUpperCase());

/* ---------- Mes contable ----------
   Quien cobra el 28 no vive en meses naturales: su «septiembre» va del 28 de
   agosto al 27 de septiembre. Con un día de inicio configurado, Finanzas usa
   ese ciclo en vez del mes del calendario. Hábitos no lo usa: sus periodos son
   del calendario y cambiarlos reescribiría registros ya guardados.

   El nombre lo pone el mes que domina el ciclo. Con día 28, el ciclo que
   arranca el 28 de agosto tiene 27 días de septiembre y 4 de agosto, así que
   se llama septiembre; con día 5, el que arranca el 5 de septiembre se llama
   septiembre también. La frontera está en el 16. */
const diasDe = (a, m) => new Date(a, m + 1, 0).getDate();

export function cicloDia() {
  const d = ajuste('cicloInicio');
  return Number.isInteger(d) && d >= 1 && d <= 31 ? d : null;
}

export function inicioCiclo(off = 0) {
  const D = cicloDia();
  if (!D) return inicioMes(off);
  const hoy = new Date();
  let a = hoy.getFullYear(), m = hoy.getMonth();
  /* Si todavía no se ha llegado al día de corte, el ciclo en curso empezó el
     mes pasado. Un día 31 se queda en el último día de los meses cortos. */
  if (hoy.getDate() < Math.min(D, diasDe(a, m))) m -= 1;
  m += off;
  return new Date(a, m, Math.min(D, diasDe(a, m)));
}

export const finCiclo = (off = 0) => new Date(inicioCiclo(off + 1).getTime() - 1);

/** Días que dura el ciclo: con mes contable no son los del mes natural.
 *  Se mide de inicio a inicio, no hasta el fin (que es un milisegundo antes),
 *  y se redondea porque el cambio de hora mete una hora de más o de menos. */
export const diasCiclo = (off = 0) =>
  Math.round((inicioCiclo(off + 1).getTime() - inicioCiclo(off).getTime()) / 86400000);

export function nombreCiclo(off = 0) {
  const D = cicloDia();
  if (!D) return nombreMes(off);
  const ini = inicioCiclo(off);
  const etq = new Date(ini.getFullYear(), ini.getMonth() + (D >= 16 ? 1 : 0), 1);
  return etq.toLocaleDateString('es-ES', {month:'long', year:'numeric'})
    .replace(/^./, m => m.toUpperCase());
}

/** El rango en claro, para que el usuario vea qué está mirando. */
export function rangoCiclo(off = 0) {
  if (!cicloDia()) return '';
  const f = d => d.toLocaleDateString('es-ES', { day:'numeric', month:'short' }).replace('.', '');
  return `${f(inicioCiclo(off))} – ${f(finCiclo(off))}`;
}

const leerJSON = (k, alt) => { try { return JSON.parse(localStorage.getItem(k)) ?? alt } catch { return alt } };

/* ---------- Estado ---------- */
export const datos = {};
const cola = {};
for (const c of COLECCIONES) {
  datos[c] = leerJSON(K.datos(c), []);
  cola[c]  = leerJSON(K.cola(c), []);
}
export let nube = leerJSON(K.cfg, null);
export let ultimaSync = parseInt(localStorage.getItem(K.sync)) || 0;

export const ajuste = (nombre, valor) => {
  if (valor === undefined) return leerJSON(K.ajuste(nombre), null);
  valor === null ? localStorage.removeItem(K.ajuste(nombre))
                 : localStorage.setItem(K.ajuste(nombre), JSON.stringify(valor));
  return valor;
};

/* ---------- Tema ----------
   'auto' sigue al sistema; 'claro' y 'oscuro' mandan sobre él. El atributo va
   en <html> para que el CSS lo lea, y el theme-color del navegador se ajusta a
   la vez: si no, la barra de estado del iPhone se queda del color contrario. */
export const TEMAS = { auto:'El del sistema', claro:'Claro', oscuro:'Oscuro' };

export function temaActual() {
  const t = ajuste('tema');
  return TEMAS[t] ? t : 'auto';
}

export function aplicarTema(t = temaActual()) {
  const raiz = document.documentElement;
  if (t === 'auto') raiz.removeAttribute('data-tema');
  else raiz.setAttribute('data-tema', t);
  const oscuro = t === 'oscuro' ||
    (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')
    ?.setAttribute('content', oscuro ? '#141517' : '#F5F4F0');
}

export function fijarTema(t) {
  ajuste('tema', t === 'auto' ? null : t);
  aplicarTema(t);
}

/* ---------- Modo discreto ----------
   Oculta los importes sin tocar los datos, para poder abrir la app con alguien
   al lado. Se aplica con una clase en <html> y lo tapa el CSS: así no hay que
   acordarse de nada en cada sitio donde se pinta una cifra. */
export const discreto = () => !!ajuste('discreto');
export function alternarDiscreto() {
  const v = !discreto();
  ajuste('discreto', v || null);
  document.documentElement.classList.toggle('discreto', v);
  return v;
}
export const aplicarDiscreto = () =>
  document.documentElement.classList.toggle('discreto', discreto());

/* ---------- Navegación ----------
   app.js registra aquí su función de cambiar de módulo, para que finanzas o
   hábitos puedan devolver al usuario a Hoy sin importar app.js (sería un ciclo). */
let navegar = null;
export const alNavegar = f => { navegar = f };
export const irA = modulo => navegar?.(modulo);

/* ---------- Suscripciones ---------- */
const oyentes = new Set();
export const alCambiar = fn => oyentes.add(fn);
export const emitir = () => oyentes.forEach(fn => fn());

/* ---------- Persistencia ---------- */
export function guardar(...cols) {
  try {
    for (const c of (cols.length ? cols : COLECCIONES)) {
      localStorage.setItem(K.datos(c), JSON.stringify(datos[c]));
      localStorage.setItem(K.cola(c), JSON.stringify(cola[c]));
    }
  } catch { avisar('No se pudo guardar en este dispositivo') }
  refrescarGlobo();
}

/* Una escritura suelta guarda, repinta y sincroniza al momento. Dentro de
   enLote() todo eso se aplaza al final: importar 300 movimientos hacía 300
   peticiones al Worker y 300 repintados completos de la pantalla. */
let lote = 0;
const loteCols = new Set();
function tocado(col) {
  if (lote) { loteCols.add(col); return }
  guardar(col); emitir(); sincronizar();
}
export function enLote(fn) {
  lote++;
  try { return fn() }
  finally {
    if (--lote === 0 && loteCols.size) {
      const cols = [...loteCols];
      loteCols.clear();
      guardar(...cols); emitir(); sincronizar();
    }
  }
}

export function anadir(col, item) {
  const nuevo = { id: uid(), t: Date.now(), ...item, pend: true };
  datos[col].push(nuevo);
  tocado(col);
  return nuevo;
}
export function actualizar(col, id, cambios) {
  const it = datos[col].find(x => x.id === id);
  if (!it) return null;
  Object.assign(it, cambios, { pend: true });
  delete it._semilla;   // editado a mano: ya es intención del usuario, no un valor por defecto
  tocado(col);
  return it;
}
export function borrar(col, id) {
  const it = datos[col].find(x => x.id === id);
  if (!it) return null;
  datos[col] = datos[col].filter(x => x.id !== id);
  if (nube && !it.pend) cola[col].push(id);   // lo que nunca subió no necesita lápida
  tocado(col);
  return it;
}
/** Devuelve a la vida un item borrado, para el botón Deshacer.
 *  Recibe id nuevo: el servidor ya puede tener una lápida con el anterior,
 *  y esa lápida volvería a borrarlo en la siguiente sincronización. */
export function restaurar(col, item) {
  cola[col] = cola[col].filter(x => x !== item.id);
  const copia = { ...item, id: uid(), pend: true };
  delete copia._semilla;
  datos[col].push(copia);
  tocado(col);
}

/* ---------- Sincronización ---------- */
const limpiar = o => { const c = { ...o }; delete c.pend; delete c._semilla; return c };
export const pendientes = () =>
  COLECCIONES.reduce((n, c) => n + datos[c].filter(x => x.pend).length + cola[c].length, 0);

const LIMITE_MS = 15000;
async function llamar(ruta, opciones = {}) {
  if (!nube) throw new Error('sin configurar');
  /* Sin tiempo límite, una conexión que se queda colgada (típico al cambiar de
     antena en móvil) deja la promesa sin resolver para siempre. */
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), LIMITE_MS);
  try {
    const r = await fetch(nube.url.replace(/\/+$/, '') + ruta, {
      ...opciones,
      signal: corte.signal,
      headers: { Authorization: 'Bearer ' + nube.clave,
                 'Content-Type': 'application/json', ...(opciones.headers || {}) },
    });
    if (r.status === 401) throw new Error('clave');
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('tiempo');
    throw e;
  } finally {
    clearTimeout(reloj);
  }
}

/** Prueba las dos rutas por separado y mide tiempos, para saber si el problema
 *  es de red, de clave o del Worker. */
export async function diagnostico() {
  const pasos = [];
  const medir = async (nombre, fn) => {
    const t0 = Date.now();
    try { const r = await fn(); pasos.push({ nombre, ok:true, ms: Date.now()-t0, detalle: r }) }
    catch (e) { pasos.push({ nombre, ok:false, ms: Date.now()-t0, detalle: e.message }) }
  };
  pasos.push({ nombre:'Conexión del dispositivo', ok: navigator.onLine, ms:0,
               detalle: navigator.onLine ? 'en línea' : 'el sistema dice que no hay red' });
  if (!nube) { pasos.push({ nombre:'Configuración', ok:false, ms:0, detalle:'sin URL ni clave' });
               return pasos }

  await medir('Worker vivo (sin clave)', async () => {
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), LIMITE_MS);
    try {
      const r = await fetch(nube.url.replace(/\/+$/, '') + '/salud', { signal: corte.signal });
      return 'respondió ' + r.status;
    } finally { clearTimeout(reloj) }
  });
  await medir('Lectura con clave', async () => {
    const d = await llamar('/col/gastos');
    return (d.items?.length ?? 0) + ' movimientos en el servidor';
  });
  await medir('Escritura de prueba', async () => {
    const r = await llamar('/col/diagnostico', { method:'POST',
      body: JSON.stringify({ id:'ping', t: Date.now() }) });
    return r.ok ? 'aceptada' : 'rechazada';
  });
  pasos.push({ nombre:'Pendientes de subir', ok: true, ms:0, detalle: pendientes() + ' items' });
  return pasos;
}

export function configurarNube(cfg) {
  nube = cfg;
  cfg ? localStorage.setItem(K.cfg, JSON.stringify(cfg)) : localStorage.removeItem(K.cfg);
  if (!cfg) {
    for (const c of COLECCIONES) { datos[c].forEach(x => delete x.pend); cola[c] = [] }
    guardar();
  }
}
export const probarNube = cfg => { const previa = nube; nube = cfg;
  return llamar('/col/gastos').finally(() => { nube = previa }) };

export function marcarTodoPendiente() {
  for (const c of COLECCIONES) datos[c].forEach(x => x.pend = true);
  guardar();
}

let sincronizando = false;
export let ultimoError = null;
export let ultimoIntento = 0;

export async function sincronizar({ ruidoso = false } = {}) {
  if (!nube) { if (ruidoso) avisar('Configura primero la dirección y la clave'); return }
  if (sincronizando) { if (ruidoso) avisar('Ya hay una sincronización en marcha'); return }
  if (!navigator.onLine) { if (ruidoso) avisar('Sin conexión'); return }
  ultimoIntento = Date.now();
  sincronizando = true;
  try {
    for (const col of COLECCIONES) {
      /* Valores por defecto sin tocar (_semilla): si el servidor ya tiene ese
         item, se adopta el suyo en vez de pisarlo. Evita que abrir la app en
         un dispositivo nuevo resetee categorías renombradas en otro. */
      const semillas = datos[col].filter(x => x.pend && x._semilla);
      if (semillas.length) {
        const { items = [], borrados = [] } = await llamar('/col/' + col);
        const remotos = new Map(items.map(r => [r.id, r]));
        const tumbas = new Set(borrados);
        for (const s of semillas) {
          if (remotos.has(s.id)) { Object.assign(s, remotos.get(s.id)); delete s.pend }
          else if (tumbas.has(s.id)) s._descartar = true;
        }
        datos[col] = datos[col].filter(x => !x._descartar);
      }

      const suben = datos[col].filter(x => x.pend);
      for (let i = 0; i < suben.length; i += 200) {
        await llamar('/col/' + col, { method:'POST',
          body: JSON.stringify(suben.slice(i, i+200).map(limpiar)) });
      }
      suben.forEach(x => delete x.pend);

      if (cola[col].length) {
        await llamar(`/col/${col}/borrados`, { method:'POST', body: JSON.stringify(cola[col]) });
        cola[col] = [];
      }

      const { items = [], borrados = [] } = await llamar('/col/' + col);
      const tumbas = new Set(borrados);
      const local = new Map(datos[col].map(x => [x.id, x]));
      for (const r of items) {
        const mio = local.get(r.id);
        if (!mio) local.set(r.id, r);
        else if (!mio.pend) Object.assign(mio, r);   // el servidor manda si no tengo cambios sin subir
      }
      for (const id of tumbas) local.delete(id);
      datos[col] = [...local.values()];
    }
    ultimaSync = Date.now();
    ultimoError = null;
    fallosSeguidos = 0;
    pararReintentos();
    localStorage.setItem(K.sync, ultimaSync);
    guardar(); emitir();
    if (ruidoso) avisar('Sincronizado');
  } catch (e) {
    const msg = e.message === 'clave' ? 'Clave incorrecta'
              : e.message === 'tiempo' ? 'El servidor no respondió a tiempo'
              : e.message.startsWith('http') ? 'El servidor respondió ' + e.message.slice(5)
              : 'No se pudo conectar';
    /* Se recuerda aunque el intento fuera silencioso: así Ajustes puede
       explicar por qué lleva días sin sincronizar. */
    ultimoError = msg;
    if (ruidoso) avisar(msg);
    /* Un error de clave no se arregla reintentando; uno de red, sí. */
    if (e.message !== 'clave') programarReintento();
  } finally {
    sincronizando = false;
    refrescarGlobo();
  }
}

/* ---------- Reintentos ----------
   Cuando la red falla, la app volvía a intentarlo solo al reabrirla. Con un
   bloqueo intermitente eso deja cambios sin subir durante días. Aquí se
   reintenta sola con espera creciente: 30 s, 1 min, 2, 4… hasta 15 minutos. */
let fallosSeguidos = 0, relojReintento = null;
export const hayReintento = () => !!relojReintento;
const esperaActual = () => Math.min(30000 * 2 ** (fallosSeguidos - 1), 900000);

function programarReintento() {
  if (!nube || !pendientes()) return;          // sin nada que subir, no urge
  fallosSeguidos++;
  pararReintentos();
  relojReintento = setTimeout(() => { relojReintento = null; sincronizar() }, esperaActual());
}
function pararReintentos() {
  if (relojReintento) { clearTimeout(relojReintento); relojReintento = null }
}
function refrescarGlobo() {
  const g = document.getElementById('globoPend');
  if (g) g.classList.toggle('on', !!nube && pendientes() > 0);
}

/* ---------- Aviso emergente ---------- */
let temporizador;
export function avisar(texto, accion) {
  const caja = document.getElementById('aviso');
  const btn  = document.getElementById('avisoAccion');
  const txt  = document.getElementById('avisoTxt');
  if (!caja || !btn || !txt) return;   // aún sin interfaz: no debe romper la escritura
  txt.textContent = texto;
  clearTimeout(temporizador);
  if (accion) {
    btn.hidden = false; btn.textContent = accion.texto;
    btn.onclick = () => { caja.classList.remove('on'); accion.alPulsar() };
  } else { btn.hidden = true; btn.onclick = null }
  caja.classList.add('on');
  temporizador = setTimeout(() => caja.classList.remove('on'), accion ? 6000 : 2200);
}

/* ---------- Hoja modal ---------- */
let vigilarSalida = null;
let focoPrevio = null;      // a dónde devolver el foco al cerrar

const FOCABLES = 'button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/** opciones.sucio: función que devuelve true si hay cambios sin guardar.
 *  En ese caso, tocar fuera o pulsar Escape pide confirmación. */
export function abrirHoja(html, alMontar, opciones = {}) {
  const fondo = document.getElementById('hoja');
  const caja  = document.getElementById('hojaCaja');
  // Sólo se recuerda el foco de quien abrió la primera hoja de la pila.
  if (!fondo.classList.contains('on')) focoPrevio = document.activeElement;
  caja.innerHTML = html;
  fondo.classList.add('on');
  fondo.setAttribute('aria-hidden', 'false');
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-modal', 'true');
  vigilarSalida = opciones.sucio || null;
  fondo.onclick = e => { if (e.target === fondo) intentarCerrar() };
  document.addEventListener('keydown', teclaHoja);
  alMontar?.(caja);
  // El foco entra en la hoja: si no, el tabulador sigue recorriendo la pantalla
  // de detrás. Se posa en la propia hoja salvo que algo pida el foco a propósito:
  // así no salta el teclado del móvil cada vez que se abre una.
  const primero = caja.querySelector('[autofocus]');
  if (primero) primero.focus();
  else { caja.tabIndex = -1; caja.focus() }
}
function teclaHoja(e) {
  if (e.key === 'Escape') { intentarCerrar(); return }
  if (e.key !== 'Tab') return;
  // Cepo de foco: el tabulador da la vuelta dentro de la hoja.
  const caja = document.getElementById('hojaCaja');
  const f = [...caja.querySelectorAll(FOCABLES)].filter(el => el.offsetParent !== null);
  if (!f.length) return;
  const primero = f[0], ultimo = f[f.length - 1];
  if (!caja.contains(document.activeElement)) { e.preventDefault(); primero.focus(); return }
  if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
}
async function intentarCerrar() {
  if (vigilarSalida?.() && !await confirmar({
    titulo: 'Descartar los cambios',
    cuerpo: 'Lo que has escrito en esta hoja no se guardará.',
    si: 'Descartar cambios', no: 'Seguir editando'
  })) return;
  cerrarHoja();
}
export function cerrarHoja() {
  const fondo = document.getElementById('hoja');
  fondo.classList.remove('on');
  fondo.setAttribute('aria-hidden', 'true');
  document.getElementById('hojaCaja').innerHTML = '';
  document.removeEventListener('keydown', teclaHoja);
  vigilarSalida = null;
  // El foco vuelve al botón que abrió la hoja, no al principio de la página.
  if (focoPrevio?.isConnected) focoPrevio.focus();
  focoPrevio = null;
}

/* ---------- Confirmación con nombre ---------- */
/** Sustituye a confirm(): dice qué se va a borrar y con qué verbo, y arranca
 *  con el foco en el botón que no destruye nada.
 *  confirmar({titulo, cuerpo, si, no}) -> Promise<boolean> */
export function confirmar({ titulo, cuerpo = '', si = 'Borrar', no = 'Cancelar' }) {
  return new Promise(listo => {
    const fondo = document.getElementById('confirma');
    const caja  = document.getElementById('confirmaCaja');
    const antes = document.activeElement;
    caja.innerHTML =
      `<h3 id="confirmaTit">${escapar(titulo)}</h3>
       ${cuerpo ? `<p>${escapar(cuerpo)}</p>` : ''}
       <div class="fila">
         <button data-r="0" autofocus>${escapar(no)}</button>
         <button data-r="1" class="mal">${escapar(si)}</button>
       </div>`;
    fondo.classList.add('on');
    fondo.setAttribute('aria-hidden', 'false');
    caja.setAttribute('aria-labelledby', 'confirmaTit');
    const botones = [...caja.querySelectorAll('button')];
    botones[0].focus();                       // Escape y Cancelar son lo mismo
    const cerrar = r => {
      fondo.classList.remove('on');
      fondo.setAttribute('aria-hidden', 'true');
      caja.innerHTML = '';
      document.removeEventListener('keydown', tecla, true);
      if (antes?.isConnected) antes.focus();
      listo(r);
    };
    function tecla(e) {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar(false) }
      else if (e.key === 'Tab') {                    // cepo dentro del diálogo
        e.preventDefault();
        const i = botones.indexOf(document.activeElement);
        botones[(i + (e.shiftKey ? botones.length - 1 : 1)) % botones.length].focus();
      }
    }
    document.addEventListener('keydown', tecla, true);
    caja.onclick = e => {
      const b = e.target.closest('button[data-r]');
      if (b) cerrar(b.dataset.r === '1');
    };
    fondo.onclick = e => { if (e.target === fondo) cerrar(false) };
  });
}

/* ---------- Estado vacío ---------- */
/** Tres piezas obligatorias: qué falta, por qué está vacío y el botón que lo llena.
 *  El botón lleva [data-vacio] para que quien lo pinta le enganche el click. */
export function vacio({ titulo, cuerpo = '', accion = '' }) {
  return `<div class="vacio"><b>${escapar(titulo)}</b>
    ${cuerpo ? `<p>${escapar(cuerpo)}</p>` : ''}
    ${accion ? `<button type="button" data-vacio>${escapar(accion)}</button>` : ''}</div>`;
}

/* ---------- Navegación por mes (o por año), reutilizada por varios módulos ---------- */
export function navMes(destino, off, alCambiarMes, primerDato, paso = 'mes') {
  const anual = paso === 'anio';
  const esCiclo = paso === 'ciclo';
  const rotulo = anual ? String(new Date().getFullYear() + off)
    : esCiclo ? nombreCiclo(off) : nombreMes(off);
  const hayAtras = anual
    ? new Date(new Date().getFullYear() + off, 0, 1).getTime() > primerDato
    : (esCiclo ? inicioCiclo(off) : inicioMes(off)).getTime() > primerDato;
  const nom = anual ? 'año' : 'mes';
  /* Con mes contable el nombre no basta: hay que ver de qué día a qué día. */
  const sub = esCiclo ? rangoCiclo(off) : '';
  destino.innerHTML =
    `<button data-d="-1" ${hayAtras ? '' : 'disabled'}
       aria-label="Ver el ${nom} anterior" data-tip="${anual ? 'Año' : 'Mes'} anterior">‹</button>
     <b>${rotulo}${sub ? `<small>${sub}</small>` : ''}</b>
     ${off ? `<button class="hoy" data-ir="0">${anual ? 'Este año' : 'Hoy'}</button>` : ''}
     <button data-d="1" ${off < 0 ? '' : 'disabled'}
       aria-label="Ver el ${nom} siguiente" data-tip="${anual ? 'Año' : 'Mes'} siguiente">›</button>`;
  destino.onclick = e => {
    const ir = e.target.closest('button[data-ir]');
    if (ir) { alCambiarMes(0); return }
    const b = e.target.closest('button[data-d]');
    if (b && !b.disabled) alCambiarMes(off + parseInt(b.dataset.d));
  };
}
