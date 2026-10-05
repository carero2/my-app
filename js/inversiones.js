/* ==========================================================================
   Inversiones: cálculo.

   Un producto es una lista de movimientos: lo que metes, lo que sacas y cuánto
   valía en una fecha. De ahí sale todo lo demás. Hay dos maneras de saber lo
   que vale, y la primera funciona desde el primer día:

     manual · apuntas tú el valor total cuando lo consultes. Para una cartera
              gestionada, un plan de pensiones o un piso es lo único posible, y
              además el banco ya te da ese número hecho.
     auto   · apuntas las posiciones por su ISIN o su ticker y se busca el
              precio solo. Más fiel, pero hay que mantener las posiciones.

   La rentabilidad se calcula con TIR y no con la regla de tres de
   (valor − aportado) / aportado, que con aportaciones repartidas en el tiempo
   miente: mil euros puestos hace cinco años y mil puestos el mes pasado no han
   trabajado lo mismo.
   ========================================================================== */
import {
  datos, anadir, actualizar, borrar, ajuste, enLote,
  dia, desdeDia, eur, eur0, escapar, nube, avisar, emitir,
} from './nucleo.js';

export const MODOS = {
  manual: { nom:'Valor a mano',        ayuda:'Apuntas tú el valor total cuando lo consultes' },
  auto:   { nom:'Precios automáticos', ayuda:'Apuntas las posiciones y se busca su precio solo' },
};

/* El tipo no cambia el cálculo: todo producto se reduce a valor actual y coste
   acumulado. Solo decide cómo se etiqueta y si el dinero es disponible o no.
   Un plan de pensiones vale lo que vale, pero no puedes contar con él mañana. */
/* `fiscal` dice en qué base tributa lo que saques, que no es un detalle menor:
   un fondo paga sobre la ganancia en la base del ahorro, y un plan de pensiones
   paga sobre TODO lo rescatado como rendimiento del trabajo. Mezclarlos daría
   un número muy equivocado, así que cada uno va por su lado.
     ahorro  · base del ahorro, sobre la ganancia (escala de abajo)
     trabajo · base general, sobre el total rescatado
     otro    · tributa, pero con reglas que no caben en una estimación simple */
export const TIPOS_PROD = {
  cartera:  { nom:'Cartera gestionada', liquido:true,  fiscal:'ahorro' },
  fondo:    { nom:'Fondo o ETF',        liquido:true,  fiscal:'ahorro' },
  acciones: { nom:'Acciones',           liquido:true,  fiscal:'ahorro' },
  pension:  { nom:'Plan de pensiones',  liquido:false, fiscal:'trabajo' },
  cripto:   { nom:'Criptomonedas',      liquido:true,  fiscal:'ahorro' },
  inmueble: { nom:'Inmueble',           liquido:false, fiscal:'otro' },
  otro:     { nom:'Otro',               liquido:true,  fiscal:'otro' },
};

/* ---------- Escala del ahorro del IRPF ----------
   Vigente desde el ejercicio 2025: el tipo máximo subió del 28% al 30%.
   Es estatal y no varía por comunidad, salvo Navarra y País Vasco, que tienen
   la suya. Los tramos son marginales: cada uno se aplica solo a su parte. */
export const TRAMOS_AHORRO = [
  { hasta: 6000,     pct: 19 },
  { hasta: 50000,    pct: 21 },
  { hasta: 200000,   pct: 23 },
  { hasta: 300000,   pct: 27 },
  { hasta: Infinity, pct: 30 },
];

export function impuestoAhorro(ganancia) {
  if (!(ganancia > 0)) return 0;
  let queda = ganancia, suelo = 0, total = 0;
  for (const t of TRAMOS_AHORRO) {
    const trozo = Math.min(queda, t.hasta - suelo);
    if (trozo <= 0) break;
    total += trozo * t.pct / 100;
    queda -= trozo;
    suelo = t.hasta;
  }
  return Math.round(total * 100) / 100;
}

/** El tipo medio que sale de esa escala, que es el número que se entiende. */
export const tipoMedioAhorro = ganancia =>
  ganancia > 0 ? (impuestoAhorro(ganancia) / ganancia) * 100 : 0;
export const tipoDe = p => (TIPOS_PROD[p?.tipo] ? p.tipo : 'cartera');
export const PALETA_INV = ['#3E6FA8','#4E8A5B','#7A5BA6','#D98A2B','#2F8C8C','#C7513F'];

const orden = (a, b) => (a.t || 0) - (b.t || 0);

export const productos = () => datos.inversiones.filter(c => !c.archivada).sort(orden);
export const producto  = id => datos.inversiones.find(c => c.id === id) || null;
/* Nombres viejos, por si quedara algo apuntando a ellos. */
export const carteras = productos, cartera = producto;
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
  if (modoDe(c) !== 'auto') return ultimoValor(invId);
  const v = valorPorPosiciones(invId);
  if (v === null) return ultimoValor(invId);
  /* El efectivo sin invertir de la cuenta también es tuyo: sin él, el total de
     la app no cuadra con el que enseña el banco y se desconfía de los dos. */
  return Math.round((v + (c.efectivo || 0)) * 100) / 100;
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
   plusvalía, que es justo lo que se quiere ver de un vistazo.

   Los cortes no son siempre meses, y esa es la parte que importa: un mes medido
   mes a mes da un punto, y diez años dan ciento veinte. El paso se elige según
   lo que dure el periodo para que la línea tenga siempre entre una docena y unas
   cuarenta marcas, que es la densidad en la que una línea se lee. El último
   corte es siempre ahora, no el último día cerrado, porque el borde derecho de
   la gráfica tiene que ser el valor de hoy. */

const DIA = 86400000;

/* Las etiquetas van abreviadas porque cinco botones con el nombre entero se
   parten en dos filas en un móvil, y porque «1M / 6M / 1A» es como lo escriben
   todas las apps de bolsa: se reconoce sin leerlo. El nombre largo va en el
   aria-label, que es donde hace falta de verdad. */
export const PERIODOS_INV = [
  { id: 'mes',  nom: '1M',   largo: 'Último mes',    dias: 30 },
  { id: '3m',   nom: '3M',   largo: 'Últimos 3 meses', dias: 91 },
  { id: '6m',   nom: '6M',   largo: 'Últimos 6 meses', dias: 182 },
  { id: 'ano',  nom: '1A',   largo: 'Último año',    dias: 365 },
  { id: 'todo', nom: 'Todo', largo: 'Todo el histórico', dias: null },
];

const finDeMes = (a, m) => new Date(a, m + 1, 0, 23, 59, 59, 999).getTime();
const sinPunto = s => s.replace(/\./g, '');

const etqDia = (ms, ano) => sinPunto(new Date(ms).toLocaleDateString('es-ES',
  ano ? { day:'numeric', month:'short', year:'2-digit' } : { day:'numeric', month:'short' }));
const etqMes = (ms, ano) => sinPunto(new Date(ms).toLocaleDateString('es-ES',
  ano ? { month:'short', year:'2-digit' } : { month:'short' }));

/** Los instantes en los que se mide, del más viejo al más nuevo. */
export function cortes(desde, hasta = Date.now()) {
  const dias = Math.max(0, (hasta - desde) / DIA);
  /* Pasados once meses hay dos «oct» en la misma gráfica: ahí el año deja de
     ser ruido y pasa a ser lo único que distingue un punto de otro. */
  const conAno = dias > 330;
  const ms = [];

  /* La escalera va por cuántas marcas deja cada paso, no por lo que suena
     redondo: un paso mensual en seis meses deja siete puntos, que no es una
     línea sino un zigzag. Semanal aguanta hasta casi el año (45 marcas) y es
     ahí donde el mensual empieza a tener suficientes. */
  if (dias <= 320) {
    const paso = (dias <= 45 ? 1 : 7) * DIA;
    for (let t = hasta; t > desde; t -= paso) ms.push(t);
    /* El borde izquierdo se añade a mano para no perder el principio del
       periodo, pero solo si queda sitio: si el bucle ya ha llegado casi hasta
       ahí, meterlo otra vez dibuja dos puntos pegados con la misma etiqueta. */
    if (!ms.length || ms[ms.length - 1] - desde > paso / 2) ms.push(desde);
    ms.reverse();
    return ms.map(x => ({ ms: x, etq: etqDia(x, conAno) }));
  }

  /* Hasta tres años, fin de mes; más allá, de tres en tres meses. */
  const paso = dias > 1100 ? 3 : 1;
  const f = new Date(hasta);
  for (let i = 0; i < 600; i += paso) {
    const t = Math.min(finDeMes(f.getFullYear(), f.getMonth() - i), hasta);
    if (t < desde) break;
    ms.push(t);
  }
  ms.reverse();
  return ms.map(x => ({ ms: x, etq: etqMes(x, conAno) }));
}

/** Dónde empieza el periodo elegido, sin inventar historia que no existe. */
export const inicioPeriodo = (periodo, primera) => {
  const p = PERIODOS_INV.find(x => x.id === periodo);
  if (!p || p.dias === null) return primera;
  return Math.max(primera, Date.now() - p.dias * DIA);
};

/* ---------- Cuánto valía en un instante cualquiera ----------
   Entre dos valoraciones nadie sabe qué pasó. Arrastrar la última hasta la
   siguiente deja una línea plana que pega un salto el día que se anotó, y eso
   afirma algo que no ocurrió: que la cartera estuvo meses quieta y se movió en
   un día. Unir los dos puntos conocidos con una recta no sabe más que eso, pero
   tampoco afirma de más.

   Antes de la primera valoración se devuelve null, no cero: no saber cuánto
   valía no es lo mismo que valer nada, y pintar ese cero hundiría la línea. */
export function valorEn(vals, ms) {
  if (!vals.length || ms < vals[0].t) return null;
  const ult = vals[vals.length - 1];
  if (ms >= ult.t) return ult.c;
  let j = 1;
  while (j < vals.length && vals[j].t <= ms) j++;
  const a = vals[j - 1], b = vals[j];
  const tramo = b.t - a.t;
  if (tramo <= 0) return b.c;
  return a.c + (b.c - a.c) * ((ms - a.t) / tramo);
}

export function serie(invId, periodo = 'todo') {
  const c = producto(invId); if (!c) return [];
  const ap = aportes(invId);
  if (!ap.length) return [];
  const vals = valoraciones(invId);
  const cs = cortes(inicioPeriodo(periodo, ap[0].t));

  /* Las aportaciones vienen ordenadas, así que se recorren una vez en paralelo
     con los cortes en vez de filtrar la lista entera en cada punto. */
  let i = 0, puesto = 0;
  const puntos = cs.map(k => {
    while (i < ap.length && ap[i].t <= k.ms) puesto += ap[i++].c || 0;
    const vale = valorEn(vals, k.ms);
    return { ms: k.ms, etq: k.etq,
      puesto: Math.round(puesto * 100) / 100,
      vale: vale === null ? null : Math.round(vale * 100) / 100 };
  });
  /* El último punto siempre es hoy, con el valor de hoy. */
  const v = valorActual(invId);
  if (puntos.length && v !== null) puntos[puntos.length - 1].vale = v;
  return puntos;
}


/* ---------- Aportaciones periódicas ----------
   Quien aporta todos los meses lleva decenas de apuntes iguales, y teclearlos
   uno a uno es la razón por la que luego no hay historial con el que calcular
   nada. Se generan de golpe a partir de la regla.

   El día del mes se conserva: quien aporta el 31 sigue aportando el 31, salvo
   en los meses que no lo tienen, donde cae en el último. */
export function seriePeriodica({ c, total, cada = 'mes', desde, hasta = Date.now() }) {
  /* Dos formas de decir lo mismo: cuánto pusiste cada vez, o cuánto has puesto
     en total. La segunda es la que se puede leer del banco sin hacer cuentas,
     así que el importe de cada una sale de dividir. */
  if (isFinite(total) && total !== 0) {
    const hueco = seriePeriodica({ c: 1, cada, desde, hasta });
    if (!hueco.length) return [];
    const cada1 = Math.round((total / hueco.length) * 100) / 100;
    const serie = hueco.map(x => ({ t: x.t, c: cada1 }));
    /* El redondeo deja unos céntimos sueltos: se le dan a la última para que
       la suma cuadre al céntimo con lo que ha dicho el usuario. */
    const sobra = Math.round((total - cada1 * serie.length) * 100) / 100;
    if (sobra) serie[serie.length - 1].c = Math.round((cada1 + sobra) * 100) / 100;
    return serie;
  }
  const salida = [];
  if (!isFinite(c) || c === 0 || !desde) return salida;
  const ini = new Date(desde), fin = new Date(hasta);
  if (ini > fin) return salida;
  const diaMes = ini.getDate();
  let i = 0;
  while (i < 600) {                       // tope de cordura: 50 años mensuales
    let f;
    if (cada === 'semana')      { f = new Date(ini); f.setDate(f.getDate() + 7 * i) }
    else if (cada === 'trimestre' || cada === 'mes') {
      const saltos = cada === 'trimestre' ? 3 * i : i;
      const base = new Date(ini.getFullYear(), ini.getMonth() + saltos, 1);
      const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      f = new Date(base.getFullYear(), base.getMonth(), Math.min(diaMes, ultimo));
    } else if (cada === 'anio') {
      f = new Date(ini.getFullYear() + i, ini.getMonth(), 1);
      const ultimo = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
      f.setDate(Math.min(diaMes, ultimo));
    } else break;
    if (f > fin) break;
    salida.push({ t: f.getTime(), c });
    i++;
  }
  return salida;
}

/* ---------- Altas y bajas ---------- */
export function crearProducto(datosNuevos) {
  const usados = productos().map(c => c.color);
  const color = PALETA_INV.find(c => !usados.includes(c)) || PALETA_INV[0];
  return anadir('inversiones', {
    nom: 'Mi producto', modo: 'manual', tipo: 'cartera', color, ...datosNuevos });
}
export const crearCartera = crearProducto;

export function borrarProducto(id) {
  enLote(() => {
    datos.invmov.filter(m => m.inv === id).forEach(m => borrar('invmov', m.id));
    datos.posiciones.filter(p => p.inv === id).forEach(p => borrar('posiciones', p.id));
    borrar('inversiones', id);
  });
}
export const borrarCartera = borrarProducto;

/* ==========================================================================
   Agregado de todos los productos

   La pantalla principal no es la suma de pantallas de producto: es una sola
   pregunta, «cuánto tengo y he ganado dinero». Para responderla hace falta
   sumar valores, sumar aportaciones y calcular una TIR con todos los flujos
   juntos, que no es la media de las TIR de cada uno.
   ========================================================================== */

/** Suma de lo que vale todo. Si falta el valor de alguno, se dice cuál para no
 *  enseñar un total que parece completo y no lo está. */
export function resumenGlobal() {
  const ps = productos();
  let valor = 0, puesto = 0, liquido = 0;
  const sinValor = [];
  for (const p of ps) {
    puesto += invertido(p.id);
    const v = valorActual(p.id);
    if (v === null) { sinValor.push(p); continue }
    valor += v;
    if (TIPOS_PROD[tipoDe(p)].liquido) liquido += v;
  }
  return {
    n: ps.length,
    valor: ps.length ? Math.round(valor * 100) / 100 : null,
    puesto: Math.round(puesto * 100) / 100,
    liquido: Math.round(liquido * 100) / 100,
    plus: ps.length ? Math.round((valor - puesto) * 100) / 100 : null,
    sinValor,
  };
}

/** TIR de todo el patrimonio invertido: todos los flujos en una sola cuenta. */
export function rentabilidadGlobal() {
  const ps = productos();
  if (!ps.length) return null;
  const flujos = [];
  let valor = 0;
  for (const p of ps) {
    const v = valorActual(p.id);
    if (v === null) return null;              // sin un valor, la TIR sería falsa
    valor += v;
    for (const m of aportes(p.id)) flujos.push({ t: m.t, c: -m.c });
  }
  if (!flujos.length) return null;
  const desde = Math.min(...flujos.map(f => f.t));
  if (Date.now() - desde < 60 * 86400000) return null;
  const r = tir([...flujos, { t: Date.now(), c: valor }]);
  return r === null ? null : Math.round(r * 1000) / 10;
}

/** La serie de todos los productos juntos, para la gráfica del agregado.
 *  Se mide a todos en los mismos instantes. Antes se alineaban por posición
 *  en la lista, lo que solo funcionaba de casualidad mientras todos los
 *  productos tuvieran puntos mensuales seguidos y acabaran hoy. */
export function serieGlobal(periodo = 'todo') {
  const ps = productos();
  if (!ps.length) return [];
  const vivos = ps.map(p => ({ p, ap: aportes(p.id), vals: valoraciones(p.id),
    i: 0, puesto: 0, hoy: valorActual(p.id) }))
    .filter(x => x.ap.length);
  if (!vivos.length) return [];

  const primera = Math.min(...vivos.map(x => x.ap[0].t));
  const cs = cortes(inicioPeriodo(periodo, primera));

  return cs.map((k, n) => {
    const ultimo = n === cs.length - 1;
    let puesto = 0, vale = 0, hayValor = false;
    for (const e of vivos) {
      while (e.i < e.ap.length && e.ap[e.i].t <= k.ms) e.puesto += e.ap[e.i++].c || 0;
      puesto += e.puesto;
      /* En el último punto manda el valor de hoy, que en modo automático sale
         de las posiciones y no de la lista de valoraciones. */
      const v = ultimo && e.hoy !== null ? e.hoy : valorEn(e.vals, k.ms);
      if (v !== null) { vale += v; hayValor = true }
    }
    return { ms: k.ms, etq: k.etq, puesto: Math.round(puesto * 100) / 100,
      vale: hayValor ? Math.round(vale * 100) / 100 : null };
  });
}

/* ==========================================================================
   Simulador

   No proyecta tu cartera: proyecta una regla de ahorro. Y lo hace con tres
   supuestos etiquetados en vez de con un número único, porque un «tendrás
   83.000 €» con dos decimales es una promesa que nadie puede cumplir.
   ========================================================================== */

export const ESCENARIOS = [
  { pct: 3, nom: 'Prudente' },
  { pct: 6, nom: 'Intermedio' },
  { pct: 9, nom: 'Optimista' },
];

/** Interés compuesto con aportaciones al final de cada mes. */
export function simular({ inicial = 0, mensual = 0, anios = 10, pct = 6, subida = 0,
                          inflacion = 0 }) {
  const meses = Math.max(0, Math.round(anios * 12));
  const r = Math.pow(1 + pct / 100, 1 / 12) - 1;       // tasa mensual equivalente
  let saldo = inicial, puesto = inicial, cuota = mensual;
  for (let m = 1; m <= meses; m++) {
    saldo = saldo * (1 + r) + cuota;
    puesto += cuota;
    if (subida && m % 12 === 0) cuota *= 1 + subida / 100;
  }
  /* En euros de hoy: lo que de verdad vas a poder comprar con ese dinero. */
  const deflactor = inflacion ? Math.pow(1 + inflacion / 100, anios) : 1;
  return {
    total: saldo,
    puesto,
    interes: saldo - puesto,
    hoy: saldo / deflactor,
  };
}

/** Lo que cuesta empezar más tarde: el mismo cálculo con menos años. */
export function costeDeEsperar(params, anios = 2) {
  const ahora = simular(params);
  const luego = simular({ ...params, anios: Math.max(0, params.anios - anios) });
  return { ahora: ahora.total, luego: luego.total, coste: ahora.total - luego.total };
}

/* ==========================================================================
   Análisis

   Esto no recomienda productos ni opina sobre el mercado: solo dice lo que se
   puede afirmar con certeza mirando los datos del usuario. Cuando se compara
   con una regla conocida, se cita la regla, para que quede claro que es una
   referencia ajena y no un juicio de la app.

   Cada hallazgo solo aparece si hay datos suficientes para que sea cierto. Es
   preferible una pantalla con dos cosas verdaderas que con seis de relleno.
   ========================================================================== */

/* Las cantidades del análisis se envuelven para que el modo discreto las tape
   igual que las de cualquier otra pantalla. */
const cifra = n => `<span class="num">${eur0(n)}</span>`;

/** Comisiones conocidas de un producto, en % anual sobre el valor.
 *  Las de los fondos salen de su ficha; la de la plataforma la pone el usuario,
 *  porque no está publicada en ninguna parte que se pueda consultar. */
export function comisionDe(invId) {
  const p = producto(invId); if (!p) return null;
  const extra = isFinite(p.comision) ? p.comision : null;
  if (modoDe(p) !== 'auto') return extra;

  const total = valorPorPosiciones(invId);
  if (!total) return extra;
  let suma = 0, cubierto = 0;
  for (const x of posicionesDe(invId)) {
    const v = vlDe(x.isin);
    const val = (x.part || 0) * (navEurDe(x.isin) || 0);
    if (!val) continue;
    if (v?.comision === null || v?.comision === undefined) continue;
    suma += v.comision * val;
    cubierto += val;
  }
  if (!cubierto) return extra;
  /* Media ponderada solo sobre lo que se conoce: extrapolar al resto sería
     inventarse el dato de los fondos que no lo publican. */
  const fondos = suma / cubierto;
  return Math.round((fondos + (extra || 0)) * 1000) / 1000;
}

/** Qué parte del valor está cubierta por comisiones conocidas. */
export function coberturaComision(invId) {
  const p = producto(invId);
  if (!p || modoDe(p) !== 'auto') return 1;
  const total = valorPorPosiciones(invId);
  if (!total) return 0;
  const con = posicionesDe(invId).reduce((s, x) => {
    const v = vlDe(x.isin);
    const val = (x.part || 0) * (navEurDe(x.isin) || 0);
    return s + (v && v.comision !== null && v.comision !== undefined ? val : 0);
  }, 0);
  return con / total;
}

/** Regularidad de las aportaciones del último año. */
function ritmo(invId) {
  const ap = aportes(invId).filter(m => m.c > 0);
  if (ap.length < 4) return null;
  const hace = Date.now() - 365 * 86400000;
  const recientes = ap.filter(m => m.t >= hace);
  if (recientes.length < 3) return null;
  const meses = new Set(recientes.map(m =>
    new Date(m.t).getFullYear() + '-' + new Date(m.t).getMonth())).size;
  const transcurridos = Math.min(12, Math.ceil(
    (Date.now() - Math.min(...recientes.map(m => m.t))) / (30.44 * 86400000)));
  return { meses, transcurridos, huecos: Math.max(0, transcurridos - meses) };
}

/** Los hallazgos, en orden de importancia. */
export function analisis({ ingresoMensual = null } = {}) {
  const ps = productos();
  const salida = [];
  if (!ps.length) return salida;

  const g = resumenGlobal();

  /* --- Lo que cuestan las comisiones --- */
  const conComision = ps.map(p => ({ p, c: comisionDe(p.id), v: valorActual(p.id) }))
    .filter(x => x.c !== null && x.v);
  if (conComision.length) {
    const valorCubierto = conComision.reduce((s, x) => s + x.v, 0);
    const media = conComision.reduce((s, x) => s + x.c * x.v, 0) / valorCubierto;
    const alAnio = valorCubierto * media / 100;
    /* A veinte años, sobre el valor de hoy creciendo al 6%: lo que se queda la
       comisión por el camino. Es la comparación que hace entender el número. */
    const bruto = valorCubierto * Math.pow(1.06, 20);
    const neto  = valorCubierto * Math.pow(1.06 - media / 100, 20);
    salida.push({
      id: 'comisiones', tono: 'info',
      titulo: `Te cuesta el ${media.toLocaleString('es-ES', {
        minimumFractionDigits: 2, maximumFractionDigits: 2 })}% al año`,
      texto: `Sobre ${cifra(valorCubierto)} son unos ${cifra(alAnio)} al año. Si ese dinero `
           + `creciera al 6% durante veinte años, las comisiones se llevarían `
           + `${cifra(bruto - neto)} por el camino.`,
      nota: 'Son las comisiones de gestión y depósito publicadas, más la de plataforma que '
          + 'hayas puesto tú. Los gastos corrientes reales suelen ser algo mayores, así que '
          + 'esto es un suelo.',
    });
  }

  /* --- Concentración --- */
  if (g.valor) {
    const partes = ps.map(p => ({ p, v: valorActual(p.id) || 0 }))
      .sort((a, b) => b.v - a.v);
    const top = partes[0];
    const pct = Math.round((top.v / g.valor) * 100);
    if (ps.length > 1 && pct >= 60) salida.push({
      id: 'concentracion', tono: 'aviso',
      titulo: `${pct}% está en un solo producto`,
      texto: `${escapar(top.p.nom)} concentra ${cifra(top.v)} de los ${cifra(g.valor)} `
           + 'que tienes.',
      nota: 'No es ni bueno ni malo por sí mismo: depende de qué haya dentro de ese producto. '
          + 'Pero conviene saberlo.',
    });
  }

  /* --- Qué parte de lo que ingresas acaba invertida --- */
  if (ingresoMensual > 0) {
    const hace = Date.now() - 365 * 86400000;
    const delAnio = ps.flatMap(p => aportes(p.id)).filter(m => m.t >= hace && m.c > 0);
    if (delAnio.length >= 3) {
      const primero = Math.min(...delAnio.map(m => m.t));
      const meses = Math.max(1, (Date.now() - primero) / (30.44 * 86400000));
      const alMes = delAnio.reduce((s, m) => s + m.c, 0) / meses;
      const tasa = (alMes / ingresoMensual) * 100;
      salida.push({
        id: 'tasa', tono: 'info',
        titulo: `Inviertes el ${Math.round(tasa)}% de lo que ingresas`,
        texto: `Unos ${cifra(alMes)} al mes de los ${cifra(ingresoMensual)} que entran.`,
        nota: 'Como referencia ajena: la regla del 50/30/20 reserva un 20% para ahorro e '
            + 'inversión. Es una regla general, no una medida de si lo estás haciendo bien.',
      });
    }
  }

  /* --- Lo que costaría sacarlo --- */
  const delAhorro = ps.filter(p => TIPOS_PROD[tipoDe(p)].fiscal === 'ahorro');
  if (delAhorro.length) {
    let valor = 0, puesto = 0, completo = true;
    for (const p of delAhorro) {
      const v = valorActual(p.id);
      if (v === null) { completo = false; continue }
      valor += v; puesto += invertido(p.id);
    }
    const ganancia = valor - puesto;
    if (completo && ganancia > 0) {
      const cuota = impuestoAhorro(ganancia);
      const tipo = tipoMedioAhorro(ganancia);
      const fuera = ps.filter(p => TIPOS_PROD[tipoDe(p)].fiscal !== 'ahorro');
      salida.push({
        id: 'fiscal', tono: 'info',
        titulo: `Sacarlo todo hoy costaría unos ${cifra(cuota)}`,
        texto: `La ganancia sería ${cifra(ganancia)} y te quedarían `
             + `${cifra(valor - cuota)}. Sale a un ${tipo.toLocaleString('es-ES',
               { maximumFractionDigits: 1 })}% de media sobre la ganancia.`,
        nota: 'Estimación con la escala del ahorro del IRPF: 19% hasta 6.000, 21% hasta '
            + '50.000, 23% hasta 200.000, 27% hasta 300.000 y 30% por encima, en euros de '
            + 'ganancia. Supone que '
            + 'vendes todo de golpe y que no tienes otras ganancias ni pérdidas ese año, que '
            + 'se suman a la misma base y pueden cambiar el tramo. Navarra y País Vasco tienen '
            + 'su propia escala. '
            + (fuera.length ? `No incluye ${fuera.map(p => escapar(p.nom)).join(', ')}, que `
              + 'tributa de otra forma. ' : '')
            + 'Traspasar entre fondos no tributa en España: solo se paga al reembolsar. '
            + 'Esto no es asesoramiento fiscal.',
      });
    }
  }

  /* --- Constancia --- */
  for (const p of ps) {
    const r = ritmo(p.id);
    if (r && r.huecos >= 2) {
      salida.push({
        id: 'ritmo-' + p.id, tono: 'aviso',
        titulo: `${r.huecos} meses sin aportar a ${escapar(p.nom)}`,
        texto: `En los últimos ${r.transcurridos} meses has aportado en ${r.meses}.`,
        nota: 'Si fue a propósito, ignóralo. Si no, puede que se te pasara alguna.',
      });
      break;                                  // con avisar de uno basta
    }
  }

  /* --- Datos viejos --- */
  const viejos = ps.filter(p => {
    const f = fechaValor(p.id);
    if (!f) return false;
    return Date.now() - desdeDia(f).getTime() > 45 * 86400000;
  });
  if (viejos.length) salida.push({
    id: 'viejo', tono: 'aviso',
    titulo: viejos.length === 1
      ? `${escapar(viejos[0].nom)} lleva más de mes y medio sin actualizar`
      : `${viejos.length} productos llevan más de mes y medio sin actualizar`,
    texto: 'El valor que ves es el de la última vez que lo anotaste, no el de hoy.',
  });

  return salida;
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
   tabla llevan la coma (1.234,5600 €). Se mira cuál es el último separador de
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

/* ---------- Valoraciones pasadas pegadas de golpe ----------
   Reconstruir el pasado a partir de precios históricos es un modelo; copiar lo
   que el banco ya enseña es un dato. Diez líneas pegadas valen más que
   cualquier estimación, así que el trabajo está en tragarse los formatos de
   fecha e importe que use cada banco sin pedirle a nadie que los normalice.

   De cada línea se saca una fecha y un importe. La fecha se quita del texto
   antes de buscar el número, porque si no «30/09/2026» aporta tres números que
   no son dinero. Del resto se coge el último, que es donde los extractos ponen
   el total: delante suele haber participaciones o un valor liquidativo. */
const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Devuelve [fechaMs, textoSinLaFecha] o null si en la línea no hay fecha. */
function fechaDeLinea(linea) {
  const corta = (a, m, d) => {
    const f = new Date(a, m, d, 12);
    return (f.getFullYear() === a && f.getMonth() === m && f.getDate() === d) ? f.getTime() : null;
  };
  /* AAAA-MM-DD, el formato sin ambigüedad: se prueba primero. */
  let m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(linea);
  if (m) {
    const t = corta(+m[1], +m[2] - 1, +m[3]);
    if (t !== null) return [t, linea.replace(m[0], ' ')];
  }
  /* DD/MM/AAAA y DD/MM/AA. En España el día va delante, siempre. */
  m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(linea);
  if (m) {
    const a = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    const t = corta(a, +m[2] - 1, +m[1]);
    if (t !== null) return [t, linea.replace(m[0], ' ')];
  }
  /* «30 sept 2026» y «sept 2026»: lo que sale al copiar de una web. */
  m = new RegExp(`(?:(\\d{1,2})\\s+)?(${MESES_ES.join('|')})[a-z]*\\.?\\s+(\\d{4})`, 'i').exec(linea);
  if (m) {
    const mes = MESES_ES.indexOf(m[2].toLowerCase().slice(0, 3));
    /* Sin día se toma el último del mes: es el cierre, que es lo que publica
       un extracto mensual. */
    const dia1 = m[1] ? +m[1] : new Date(+m[3], mes + 1, 0).getDate();
    const t = corta(+m[3], mes, dia1);
    if (t !== null) return [t, linea.replace(m[0], ' ')];
  }
  return null;
}

/**
 * Lee un pegote de «fecha  importe» por línea.
 * Devuelve { valores: [{t, c}] ordenados, ignoradas: n, futuras: n }.
 */
export function leerValores(texto, hasta = Date.now()) {
  const lineas = String(texto || '').replace(/ /g, ' ').split(/[\r\n]+/);
  const porDia = new Map();          // un apunte por día: el último gana
  let ignoradas = 0, futuras = 0;

  for (const bruta of lineas) {
    const linea = bruta.trim();
    if (!linea) continue;
    const f = fechaDeLinea(linea);
    if (!f) { ignoradas++; continue }
    const [t, resto] = f;
    const nums = resto.match(/-?\d[\d.,]*/g);
    if (!nums) { ignoradas++; continue }
    const c = numeroSuelto(nums[nums.length - 1]);
    if (c === null || !isFinite(c) || c < 0) { ignoradas++; continue }
    /* Una valoración futura no existe: o es una errata o es una proyección, y
       ninguna de las dos debe entrar en el histórico como si fuera un hecho. */
    if (t > hasta) { futuras++; continue }
    porDia.set(dia(t), { t, c: Math.round(c * 100) / 100 });
  }
  const valores = [...porDia.values()].sort((a, b) => a.t - b.t);
  return { valores, ignoradas, futuras };
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
       muchos nombres de producto llevan cifras, y el último número antes
       del importe es siempre el bueno. */
    const corte = /(\d[\d.,]*)\s*(?:€|\$|£|EUR|USD|GBP)\B/.exec(trozo);
    const cabeza = corte ? trozo.slice(0, corte.index) : trozo;
    const nums = [...cabeza.matchAll(/(?<![\w.,])(\d[\d.,]*)(?![\w])/g)].map(m => m[1]);
    const part = nums.length ? numeroSuelto(nums[nums.length - 1]) : null;

    /* El último importe de la fila es el valor en euros, si viene. */
    const imps = [...trozo.matchAll(/(\d[\d.,]*)\s*(?:€|EUR)\B/g)].map(m => numeroSuelto(m[1]));
    const valor = imps.length ? imps[imps.length - 1] : null;

    /* El nombre es lo que queda al quitar la cifra de títulos y el código de
       divisa. No se quitan todos los dígitos: muchos nombres los llevan. */
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

