/* ==========================================================================
   Inversiones: cálculo.

   Una cartera se sigue de una de tres maneras, según lo que puedas conseguir:

     auto      · apuntas las participaciones de cada fondo por su ISIN y el
                 Worker busca el valor liquidativo. Es lo más fiel, pero si tu
                 cartera la rebalancea un gestor automático tendrás que volver
                 a teclear las participaciones cada vez que lo haga.
     manual    · apuntas tú el valor total cuando te apetece mirarlo. Mucho
                 menos trabajo y, para una cartera gestionada, casi igual de
                 útil: el banco ya te da ese número hecho.
     estimado  · no hay valor real; se proyecta lo aportado a un interés anual
                 que tú fijas. Sirve para hacerse una idea, no para saber.

   La rentabilidad se calcula con TIR y no con la regla de tres de
   (valor − aportado) / aportado, que con aportaciones repartidas en el tiempo
   miente: mil euros puestos hace cinco años y mil puestos el mes pasado no han
   trabajado lo mismo.
   ========================================================================== */
import {
  datos, anadir, actualizar, borrar, ajuste, enLote,
  dia, desdeDia, eur, escapar, nube, avisar, emitir,
} from './nucleo.js';

export const MODOS = {
  auto:     { nom:'Precios automáticos', ayuda:'Apuntas participaciones por ISIN y se buscan solos' },
  manual:   { nom:'Valor a mano',        ayuda:'Apuntas tú el valor total cuando lo consultes' },
  estimado: { nom:'Estimación',          ayuda:'Sin datos reales: proyecta lo aportado a un interés anual' },
};
export const PALETA_INV = ['#3E6FA8','#4E8A5B','#7A5BA6','#D98A2B','#2F8C8C','#C7513F'];

const orden = (a, b) => (a.t || 0) - (b.t || 0);

export const carteras = () => datos.inversiones.filter(c => !c.archivada).sort(orden);
export const cartera  = id => datos.inversiones.find(c => c.id === id) || null;
export const modoDe   = c => (MODOS[c?.modo] ? c.modo : 'manual');

/* ---------- Movimientos de una cartera ----------
   Un único hilo temporal con dos tipos de apunte: lo que metes («aporte», en
   negativo si lo sacas) y cuánto valía en una fecha («valor»). */
export const aportes = invId => datos.invmov
  .filter(m => m.inv === invId && m.tipo !== 'valor').sort(orden);
export const valoraciones = invId => datos.invmov
  .filter(m => m.inv === invId && m.tipo === 'valor').sort(orden);
export const posicionesDe = invId => datos.posiciones
  .filter(p => p.inv === invId).sort((a, b) => (b.part || 0) - (a.part || 0));

export const invertido = invId =>
  aportes(invId).reduce((s, m) => s + (m.c || 0), 0);

/* ---------- Precios ----------
   Los valores liquidativos vienen del Worker y se guardan aquí para que la
   cartera se pueda mirar sin cobertura. */
export const cacheVL = () => ajuste('vlCache') || {};
export const vlDe = isin => cacheVL()[String(isin || '').toUpperCase()] || null;

export function guardarVL(mapa) {
  const c = { ...cacheVL() };
  for (const [isin, d] of Object.entries(mapa)) if (d && d.nav) c[isin] = d;
  ajuste('vlCache', c);
  ajuste('vlPedido', Date.now());
  return c;
}

export const vlPedido = () => ajuste('vlPedido') || 0;

/** Pide al Worker los valores liquidativos de los ISIN de una cartera. */
export async function refrescarPrecios(invId, { forzar = false } = {}) {
  const isins = [...new Set(posicionesDe(invId).map(p => p.isin).filter(Boolean))];
  if (!isins.length) return { ok: false, motivo: 'sin-isin' };
  if (!nube) return { ok: false, motivo: 'sin-nube' };

  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${nube.url.replace(/\/+$/, '')}/vl${forzar ? '?forzar=1' : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + nube.clave },
      body: JSON.stringify({ isin: isins }),
      signal: ctrl.signal,
    });
    if (!r.ok) return { ok: false, motivo: 'http-' + r.status };
    const d = await r.json();
    guardarVL(d.vl || {});
    const fallidos = isins.filter(i => !d.vl?.[i]?.nav);
    /* Si se ha podido valorar entera, se deja constancia del total de hoy:
       así la gráfica va teniendo historia sin que haya que hacer nada. */
    if (!fallidos.length) anotarValor(invId, valorPorPosiciones(invId));
    return { ok: true, fallidos, vl: d.vl };
  } catch (e) {
    return { ok: false, motivo: e.name === 'AbortError' ? 'tiempo' : String(e.message || e) };
  } finally { clearTimeout(reloj) }
}

/** El valor liquidativo pasado a euros. Un fondo en dólares no se puede sumar
 *  a uno en euros, y tratar 192,86 $ como 192,86 € infla la cartera un 12%. */
export const navEurDe = isin => {
  const v = vlDe(isin);
  if (!v) return null;
  if (v.navEur) return v.navEur;
  if ((v.moneda || 'EUR').toUpperCase() === 'EUR') return v.nav || null;
  return null;                           // en divisa y sin cambio: no se inventa
};

/** Valor de la cartera sumando participaciones por su último valor liquidativo. */
export function valorPorPosiciones(invId) {
  let total = 0;
  for (const p of posicionesDe(invId)) {
    const nav = navEurDe(p.isin);
    if (!nav) return null;               // con un solo fondo sin precio, el total sería falso
    total += (p.part || 0) * nav;
  }
  return Math.round(total * 100) / 100;
}

/** Guarda (o corrige) el valor de un día. Un día, un apunte. */
export function anotarValor(invId, v, cuando = Date.now()) {
  if (!isFinite(v) || v < 0) return null;
  const d = dia(cuando);
  const ya = valoraciones(invId).find(m => dia(m.t) === d);
  return ya ? actualizar('invmov', ya.id, { c: v })
            : anadir('invmov', { inv: invId, tipo: 'valor', c: v, t: cuando });
}

/* ---------- ¿Está el extracto al día? ----------
   Los títulos no se mueven solos: entre dos movimientos la valoración por
   precio es exacta. Pero en cuanto aportas, los títulos guardados se quedan
   cortos y el valor calculado también. Más vale decirlo que enseñar un número
   bajo sin avisar. */
export function desfase(invId) {
  const c = cartera(invId);
  if (!c || modoDe(c) !== 'auto') return null;
  const pos = posicionesDe(invId);
  if (!pos.length) return null;
  const desde = Math.max(0, ...pos.map(p => p.t || 0));
  if (!desde) return null;
  /* Un margen de un día: la aportación del propio día del extracto ya suele
     estar reflejada en él. */
  const posteriores = aportes(invId).filter(m => m.t > desde + 86400000);
  if (!posteriores.length) return null;
  return {
    desde,
    n: posteriores.length,
    importe: Math.round(posteriores.reduce((s, m) => s + m.c, 0) * 100) / 100,
  };
}

/* ---------- Valor actual, según el modo ---------- */
export function valorActual(invId) {
  const c = cartera(invId); if (!c) return null;
  const modo = modoDe(c);
  if (modo === 'auto')     return valorPorPosiciones(invId) ?? ultimoValor(invId);
  if (modo === 'estimado') return proyectar(invId, Date.now());
  return ultimoValor(invId);
}

export function ultimoValor(invId) {
  const v = valoraciones(invId);
  return v.length ? v[v.length - 1].c : null;
}

export function fechaValor(invId) {
  const c = cartera(invId);
  if (modoDe(c) === 'auto') {
    /* La fecha que importa es la del valor liquidativo más viejo: la cartera
       está valorada a ese día, no a hoy. */
    const fechas = posicionesDe(invId).map(p => vlDe(p.isin)?.fecha).filter(Boolean);
    if (fechas.length) return fechas.sort()[0];
  }
  const v = valoraciones(invId);
  return v.length ? dia(v[v.length - 1].t) : null;
}

/** Proyección a interés compuesto: cada aportación crece desde su propia fecha. */
export function proyectar(invId, cuando = Date.now()) {
  const c = cartera(invId); if (!c) return null;
  const r = (c.pct ?? 0) / 100;
  let total = 0;
  for (const m of aportes(invId)) {
    const anios = (cuando - m.t) / (365.25 * 86400000);
    total += (m.c || 0) * Math.pow(1 + r, Math.max(0, anios));
  }
  return Math.round(total * 100) / 100;
}

/* ---------- Rentabilidad ----------
   TIR por bisección. Se evita Newton a propósito: converge más rápido pero se
   va a tomar viento con flujos irregulares, y aquí la velocidad da igual. */
export function tir(flujos) {
  const f = flujos.filter(x => isFinite(x.c) && x.c !== 0);
  if (f.length < 2) return null;
  if (!f.some(x => x.c > 0) || !f.some(x => x.c < 0)) return null;

  const t0 = Math.min(...f.map(x => x.t));
  const van = r => f.reduce((s, x) =>
    s + x.c / Math.pow(1 + r, (x.t - t0) / (365.25 * 86400000)), 0);

  let lo = -0.9999, hi = 10;
  let vlo = van(lo), vhi = van(hi);
  if (!isFinite(vlo) || !isFinite(vhi) || vlo * vhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const med = (lo + hi) / 2, v = van(med);
    if (!isFinite(v)) return null;
    if (vlo * v <= 0) { hi = med; vhi = v } else { lo = med; vlo = v }
  }
  const r = (lo + hi) / 2;
  return r > 9.9 || r < -0.99 ? null : r;
}

/** TIR de una cartera: las aportaciones salen de tu bolsillo, el valor de hoy
 *  entra. Necesita al menos dos meses de recorrido para no dar disparates. */
export function rentabilidad(invId) {
  const v = valorActual(invId);
  if (v === null) return null;
  const ap = aportes(invId);
  if (!ap.length) return null;
  const desde = Math.min(...ap.map(m => m.t));
  if (Date.now() - desde < 60 * 86400000) return null;
  const r = tir([...ap.map(m => ({ t: m.t, c: -m.c })), { t: Date.now(), c: v }]);
  return r === null ? null : Math.round(r * 1000) / 10;      // en % con un decimal
}

/* ---------- Serie para la gráfica ----------
   Dos líneas: lo que has puesto y lo que vale. La distancia entre ambas es la
   plusvalía, que es justo lo que se quiere ver de un vistazo. */
export function serie(invId, meses = 12) {
  const c = cartera(invId); if (!c) return [];
  const modo = modoDe(c);
  const ap = aportes(invId);
  if (!ap.length) return [];

  const hoy = new Date();
  const puntos = [];
  for (let i = meses - 1; i >= 0; i--) {
    const corte = new Date(hoy.getFullYear(), hoy.getMonth() - i + 1, 0, 23, 59, 59);
    const ms = Math.min(corte.getTime(), Date.now());
    const puesto = ap.filter(m => m.t <= ms).reduce((s, m) => s + m.c, 0);
    if (!puesto && !puntos.length) continue;                 // antes de empezar, nada que pintar
    let vale;
    if (modo === 'estimado') vale = proyectarHasta(invId, ms);
    else {
      const antes = valoraciones(invId).filter(m => m.t <= ms);
      vale = antes.length ? antes[antes.length - 1].c : null;
    }
    puntos.push({ ms, etq: corte.toLocaleDateString('es-ES', { month:'short' }).replace('.', ''),
      puesto: Math.round(puesto * 100) / 100,
      vale: vale === null ? null : Math.round(vale * 100) / 100 });
  }
  /* El último punto siempre es hoy, con el valor de hoy. */
  if (puntos.length) {
    const v = valorActual(invId);
    puntos[puntos.length - 1].vale = v === null ? puntos[puntos.length - 1].vale : v;
  }
  return puntos;
}

const proyectarHasta = (invId, ms) => {
  const c = cartera(invId);
  const r = (c.pct ?? 0) / 100;
  return Math.round(aportes(invId).filter(m => m.t <= ms).reduce((s, m) =>
    s + m.c * Math.pow(1 + r, Math.max(0, (ms - m.t) / (365.25 * 86400000))), 0) * 100) / 100;
};

/* ---------- Altas y bajas ---------- */
export function crearCartera(datosNuevos) {
  const usados = carteras().map(c => c.color);
  const color = PALETA_INV.find(c => !usados.includes(c)) || PALETA_INV[0];
  return anadir('inversiones', { nom: 'Mi cartera', modo: 'manual', color, ...datosNuevos });
}

export function borrarCartera(id) {
  enLote(() => {
    datos.invmov.filter(m => m.inv === id).forEach(m => borrar('invmov', m.id));
    datos.posiciones.filter(p => p.inv === id).forEach(p => borrar('posiciones', p.id));
    borrar('inversiones', id);
  });
}

/* ---------- Reparto actual, para ver la concentración ---------- */
export function reparto(invId) {
  const total = valorPorPosiciones(invId);
  if (!total) return [];
  return posicionesDe(invId).map(p => {
    const v = vlDe(p.isin);
    const val = (p.part || 0) * (navEurDe(p.isin) || 0);
    return { ...p, valor: Math.round(val * 100) / 100,
      pct: Math.round((val / total) * 1000) / 10, nom: p.nom || v?.nom || p.isin,
      divisa: (v?.moneda || 'EUR').toUpperCase() };
  }).sort((a, b) => b.valor - a.valor);
}

/* ---------- Importar la tabla de posiciones ----------
   Los títulos cambian cada vez que aportas, así que teclear media docena de
   números al mes es justo lo que hace que nadie mantenga su cartera al día.
   La tabla de posiciones de cualquier banco o bróker se copia entera y de ahí
   sale todo: no se asume ningún formato concreto, solo que cada fila lleve un
   identificador y una cantidad.

   Ojo a los decimales: hay extractos donde los títulos llevan el punto como
   separador decimal (3.52 participaciones) mientras los importes de la misma
   tabla llevan la coma (184,8400 €). Se mira cuál es el último separador de
   cada número en vez de asumir una convención. */
const ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/g;
/* Palabras cortas en mayúsculas que aparecen en cualquier extracto y que no son
   el ticker de nada. Sin esta lista, un listado de acciones daría posiciones
   fantasma llamadas «EUR» o «TOTAL». */
const NO_TICKER = new Set(['EUR','USD','GBP','CHF','JPY','TOTAL','SUMA','ISIN','ACC','CAP',
  'DIS','INC','ETF','NAV','VL','IVA','N/A','NA','SI','NO','DIV','PCT','COD']);

export function numeroSuelto(txt) {
  const t = String(txt).trim();
  if (!/\d/.test(t)) return null;
  const coma = t.lastIndexOf(','), punto = t.lastIndexOf('.');
  let limpio;
  if (coma > punto)      limpio = t.replace(/\./g, '').replace(',', '.');
  else if (punto > coma) limpio = t.replace(/,/g, '');
  else                   limpio = t;
  const n = parseFloat(limpio);
  return isFinite(n) ? n : null;
}

/** Lee un pegote de texto y devuelve lo que ha reconocido, sin tocar nada. */
export function leerPosiciones(texto) {
  const t = String(texto || '').replace(/\u00a0/g, ' ');
  const marcas = [...t.matchAll(ISIN_RE)];
  const filas = [];
  for (let i = 0; i < marcas.length; i++) {
    const isin = marcas[i][1];
    const trozo = t.slice(marcas[i].index + isin.length,
      i + 1 < marcas.length ? marcas[i + 1].index : undefined);

    /* El primer importe con divisa marca dónde acaban los títulos: lo que haya
       antes y sea número es la cantidad de participaciones. Hace falta porque
       muchos nombres llevan cifras («S&P 500 INDEX»), y el último número antes
       del importe es siempre el bueno. */
    const corte = /(\d[\d.,]*)\s*(?:€|\$|£|EUR|USD|GBP)\B/.exec(trozo);
    const cabeza = corte ? trozo.slice(0, corte.index) : trozo;
    const nums = [...cabeza.matchAll(/(?<![\w.,])(\d[\d.,]*)(?![\w])/g)].map(m => m[1]);
    const part = nums.length ? numeroSuelto(nums[nums.length - 1]) : null;

    /* El último importe de la fila es el valor en euros, si viene. */
    const imps = [...trozo.matchAll(/(\d[\d.,]*)\s*(?:€|EUR)\B/g)].map(m => numeroSuelto(m[1]));
    const valor = imps.length ? imps[imps.length - 1] : null;

    /* El nombre es lo que queda al quitar la cifra de títulos y el código de
       divisa. No se quitan todos los dígitos: «S&P 500» los lleva en el nombre. */
    let nom = cabeza;
    if (nums.length) {
      const ult = nums[nums.length - 1];
      nom = nom.slice(0, nom.lastIndexOf(ult)) + nom.slice(nom.lastIndexOf(ult) + ult.length);
    }
    nom = nom.replace(/\b(EUR|USD|GBP)\b/g, ' ').replace(/[\t|]+/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 80);

    filas.push({ isin, part, valor, nom });
  }

  /* Acciones y ETFs no tienen ISIN en muchos extractos, solo el ticker. Un
     ticker suelto es indistinguible de una palabra cualquiera, así que solo se
     acepta cuando abre la línea y le sigue una cantidad: así un listado de
     acciones se lee, pero el texto corriente no genera posiciones inventadas. */
  const conISIN = new Set(filas.map(f => f.isin));
  for (const linea of t.split(/\r?\n/)) {
    if (ISIN_RE.test(linea)) { ISIN_RE.lastIndex = 0; continue }
    ISIN_RE.lastIndex = 0;
    const m = /^\s*([A-Z][A-Z0-9.\-]{0,11})(?:[\s\t|,;]+)(.*)$/.exec(linea);
    if (!m || NO_TICKER.has(m[1])) continue;
    const resto = m[2];
    const corte = /(\d[\d.,]*)\s*(?:€|\$|£|EUR|USD|GBP)\B/.exec(resto);
    const cabeza = corte ? resto.slice(0, corte.index) : resto;
    const nums = [...cabeza.matchAll(/(?<![\w.,])(\d[\d.,]*)(?![\w])/g)].map(x => x[1]);
    if (!nums.length) continue;
    const part = numeroSuelto(nums[nums.length - 1]);
    if (part === null || part <= 0) continue;
    if (conISIN.has(m[1])) continue;
    const imps = [...resto.matchAll(/(\d[\d.,]*)\s*(?:€|EUR)\B/g)].map(x => numeroSuelto(x[1]));
    let nom = cabeza;
    const ult = nums[nums.length - 1];
    nom = (nom.slice(0, nom.lastIndexOf(ult)) + nom.slice(nom.lastIndexOf(ult) + ult.length))
      .replace(/\b(EUR|USD|GBP)\b/g, ' ').replace(/[\t|]+/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 80);
    filas.push({ isin: m[1], part, valor: imps.length ? imps[imps.length - 1] : null, nom });
  }
  return filas;
}

