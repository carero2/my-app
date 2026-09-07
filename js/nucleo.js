/* ==========================================================================
   Núcleo: datos, sincronización y piezas de interfaz compartidas.
   Cada módulo importa de aquí; nadie habla con localStorage directamente.
   ========================================================================== */

export const COLECCIONES = ['gastos', 'habitos', 'registros', 'notas'];

const K = {
  datos:  c => 'vida.' + c,
  cola:   c => 'vida.cola.' + c,
  cfg:    'vida.nube',
  ajuste: a => 'vida.ajuste.' + a,
  sync:   'vida.ultimaSync',
};

/* ---------- Utilidades ---------- */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const eur  = n => n.toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';
export const eur0 = n => Math.round(n).toLocaleString('es-ES') + ' €';
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
export const NOMBRE_FREC = { dia:'día', semana:'semana', mes:'mes' };

export const inicioMes = off => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+off, 1) };
export const finMes    = off => new Date(inicioMes(off+1).getTime() - 1);
export const nombreMes = off => inicioMes(off)
  .toLocaleDateString('es-ES', {month:'long', year:'numeric'}).replace(/^./, m => m.toUpperCase());

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

export function anadir(col, item) {
  const nuevo = { id: uid(), t: Date.now(), ...item, pend: true };
  datos[col].push(nuevo);
  guardar(col); emitir(); sincronizar();
  return nuevo;
}
export function actualizar(col, id, cambios) {
  const it = datos[col].find(x => x.id === id);
  if (!it) return null;
  Object.assign(it, cambios, { pend: true });
  guardar(col); emitir(); sincronizar();
  return it;
}
/** Inserta o actualiza según exista el id. Útil para los registros diarios. */
export function poner(col, item) {
  const existe = datos[col].find(x => x.id === item.id);
  return existe ? actualizar(col, item.id, item) : anadir(col, item);
}
export function borrar(col, id) {
  const it = datos[col].find(x => x.id === id);
  if (!it) return null;
  datos[col] = datos[col].filter(x => x.id !== id);
  if (nube && !it.pend) cola[col].push(id);   // lo que nunca subió no necesita lápida
  guardar(col); emitir(); sincronizar();
  return it;
}
/** Devuelve a la vida un item borrado, para el botón Deshacer.
 *  Recibe id nuevo: el servidor ya puede tener una lápida con el anterior,
 *  y esa lápida volvería a borrarlo en la siguiente sincronización. */
export function restaurar(col, item) {
  cola[col] = cola[col].filter(x => x !== item.id);
  datos[col].push({ ...item, id: uid(), pend: true });
  guardar(col); emitir(); sincronizar();
}

/* ---------- Sincronización ---------- */
const limpiar = o => { const c = { ...o }; delete c.pend; return c };
export const pendientes = () =>
  COLECCIONES.reduce((n, c) => n + datos[c].filter(x => x.pend).length + cola[c].length, 0);

async function llamar(ruta, opciones = {}) {
  if (!nube) throw new Error('sin configurar');
  const r = await fetch(nube.url.replace(/\/+$/, '') + ruta, {
    ...opciones,
    headers: { Authorization: 'Bearer ' + nube.clave,
               'Content-Type': 'application/json', ...(opciones.headers || {}) },
  });
  if (r.status === 401) throw new Error('clave');
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
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
export async function sincronizar({ ruidoso = false } = {}) {
  if (!nube || sincronizando) return;
  if (!navigator.onLine) { if (ruidoso) avisar('Sin conexión'); return }
  sincronizando = true;
  try {
    for (const col of COLECCIONES) {
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
    localStorage.setItem(K.sync, ultimaSync);
    guardar(); emitir();
    if (ruidoso) avisar('Sincronizado');
  } catch (e) {
    const msg = e.message === 'clave' ? 'Clave incorrecta'
              : e.message.startsWith('http') ? 'El servidor respondió ' + e.message.slice(5)
              : 'No se pudo conectar';
    if (ruidoso) avisar(msg);
    ultimoError = msg;
  } finally {
    sincronizando = false;
    refrescarGlobo();
  }
}
export let ultimoError = null;

function refrescarGlobo() {
  const g = document.getElementById('globoPend');
  if (g) g.classList.toggle('on', !!nube && pendientes() > 0);
}

/* ---------- Aviso emergente ---------- */
let temporizador;
export function avisar(texto, accion) {
  const caja = document.getElementById('aviso');
  const btn  = document.getElementById('avisoAccion');
  document.getElementById('avisoTxt').textContent = texto;
  clearTimeout(temporizador);
  if (accion) {
    btn.hidden = false; btn.textContent = accion.texto;
    btn.onclick = () => { caja.classList.remove('on'); accion.alPulsar() };
  } else { btn.hidden = true; btn.onclick = null }
  caja.classList.add('on');
  temporizador = setTimeout(() => caja.classList.remove('on'), accion ? 6000 : 2200);
}

/* ---------- Hoja modal ---------- */
export function abrirHoja(html, alMontar) {
  const fondo = document.getElementById('hoja');
  const caja  = document.getElementById('hojaCaja');
  caja.innerHTML = html;
  fondo.classList.add('on');
  fondo.setAttribute('aria-hidden', 'false');
  fondo.onclick = e => { if (e.target === fondo) cerrarHoja() };
  alMontar?.(caja);
}
export function cerrarHoja() {
  const fondo = document.getElementById('hoja');
  fondo.classList.remove('on');
  fondo.setAttribute('aria-hidden', 'true');
  document.getElementById('hojaCaja').innerHTML = '';
}

/* ---------- Navegación por mes, reutilizada por varios módulos ---------- */
export function navMes(destino, off, alCambiarMes, primerDato) {
  destino.innerHTML =
    `<button data-d="-1" ${inicioMes(off).getTime() > primerDato ? '' : 'disabled'} aria-label="Anterior">‹</button>
     <b>${nombreMes(off)}</b>
     <button data-d="1" ${off < 0 ? '' : 'disabled'} aria-label="Siguiente">›</button>`;
  destino.onclick = e => {
    const b = e.target.closest('button[data-d]');
    if (b && !b.disabled) alCambiarMes(off + parseInt(b.dataset.d));
  };
}
