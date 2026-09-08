/* ==========================================================================
   Hábitos: cálculo. Periodos, cumplimiento, rachas, cronómetro y resumen.
   La interfaz vive en habitos-ui.js.
   Grupos definidos por el usuario como submódulos, cada uno con su color.
   Tipos: sino, cantidad y crono.  Periodicidad: día, semana o mes.
   Los diarios pueden limitarse a ciertos días de la semana.
   ========================================================================== */
import {
  datos, anadir, actualizar, ajuste, enLote,
  dia, diaSuma, desdeDia, lunes, periodo, periodoAtras,
  avisar, emitir,
} from './nucleo.js';

export const TIPOS = {
  sino:     { nom:'Sí o no',    ayuda:'Una casilla que marcas al cumplirlo' },
  cantidad: { nom:'Cantidad',   ayuda:'Cuentas unidades hacia un objetivo' },
  crono:    { nom:'Cronómetro', ayuda:'Mides el tiempo dedicado, tipo pomodoro' },
};
export const FRECS = {
  dia:    { nom:'Cada día',    corto:'diario'  },
  semana: { nom:'Cada semana', corto:'semanal' },
  mes:    { nom:'Cada mes',    corto:'mensual' },
};
export const PALETA = ['#3E6FA8','#C7513F','#4E8A5B','#D98A2B','#7A5BA6','#8C8378'];
export const DIAS = [[1,'L'],[2,'M'],[3,'X'],[4,'J'],[5,'V'],[6,'S'],[7,'D']];

const orden = (a,b) => (a.orden ?? 0) - (b.orden ?? 0) || a.t - b.t;
export const activos    = () => datos.habitos.filter(h => !h.archivado).sort(orden);
export const archivados = () => datos.habitos.filter(h => h.archivado).sort(orden);
export const grupos = () => [...new Set(activos().map(h => h.grupo || 'General'))];
export const frecDe = h => h.frec || 'dia';

/* ---------- Color por grupo ----------
   El color pertenece al grupo, no al hábito. Se fija la primera vez que se crea
   y se copia a cada hábito para que viaje en la sincronización. */
export function colorGrupo(g) {
  const mapa = ajuste('coloresGrupo') || {};
  if (mapa[g]) return mapa[g];
  const heredado = datos.habitos.find(h => (h.grupo || 'General') === g && h.color)?.color;
  const usados = new Set(Object.values(mapa));
  const libre = PALETA.find(c => !usados.has(c)) || PALETA[Object.keys(mapa).length % PALETA.length];
  const col = heredado || libre;
  ajuste('coloresGrupo', { ...mapa, [g]: col });
  return col;
}
export function fijarColorGrupo(g, col) {
  ajuste('coloresGrupo', { ...(ajuste('coloresGrupo') || {}), [g]: col });
  enLote(() => datos.habitos.filter(h => (h.grupo || 'General') === g && h.color !== col)
    .forEach(h => actualizar('habitos', h.id, { color: col })));
}
export const colorDe = h => h.color || colorGrupo(h.grupo || 'General');

/* ---------- Días activos ----------
   Sin el campo `dias`, un hábito diario cuenta todos los días. */
const numDia = p => ((desdeDia(p).getDay() + 6) % 7) + 1;      // 1 lunes … 7 domingo
export function toca(h, p = periodo(frecDe(h), Date.now())) {
  if (frecDe(h) !== 'dia') return true;
  if (!Array.isArray(h.dias) || !h.dias.length) return true;
  return h.dias.includes(numDia(p));
}
/** Un hábito de solo seguimiento se registra pero no es un objetivo:
    no se cumple, no genera racha y no entra en ningún porcentaje. */
export const esObjetivo = h => h.cuenta !== false;
/** ¿Entra en el círculo de progreso del día? */
export const cuentaHoy = h => frecDe(h) === 'dia' && esObjetivo(h) && toca(h);

/* ---------- Registros ---------- */
export const clave = (h, ms = Date.now()) => periodo(frecDe(h), ms);
export const registro = (h, p = clave(h)) =>
  datos.registros.find(r => r.hab === h.id && r.d === p);
export const valorDe = (h, p = clave(h)) => registro(h, p)?.v || 0;

export function cumplido(h, p = clave(h)) {
  if (!esObjetivo(h)) return false;
  const v = valorDe(h, p);
  return h.tipo === 'sino' ? v >= 1 : v >= (h.objetivo || 1);
}
/** Rachas: los periodos en los que no toca se saltan, no la rompen. */
export function racha(h) {
  if (!esObjetivo(h)) return 0;
  const frec = frecDe(h);
  let n = 0, p = clave(h), tope = 0;
  if (!toca(h, p) || !cumplido(h, p)) {
    if (toca(h, p) && !cumplido(h, p)) p = periodoAtras(frec, p, 1);  // aún puede cerrarse
    else while (!toca(h, p) && tope++ < 400) p = periodoAtras(frec, p, 1);
  }
  tope = 0;
  while (tope++ < 400) {
    if (!toca(h, p)) { p = periodoAtras(frec, p, 1); continue }
    if (!cumplido(h, p)) break;
    n++; p = periodoAtras(frec, p, 1);
  }
  return n;
}
export function fijarValor(h, v, p = clave(h)) {
  const val = Math.max(0, Math.round(v * 100) / 100);
  const existente = registro(h, p);
  /* Desmarcar deja el registro a cero en lugar de borrarlo: un borrado
     dejaría lápida en el servidor y el periodo no se podría volver a marcar. */
  if (existente) actualizar('registros', existente.id, { v: val });
  else if (val > 0) anadir('registros', { id: `${h.id}_${p}`, hab: h.id, d: p, v: val });
}

/* ==========================================================================
   Cronómetro
   ========================================================================== */
export const cronoActivo = () => ajuste('crono');
let avisado = false;

export function arrancarCrono(h) {
  const actual = cronoActivo();
  if (actual && actual.hab !== h.id) {
    const otro = datos.habitos.find(x => x.id === actual.hab);
    pararCrono();
    avisar('Se paró ' + (otro?.nombre || 'el otro cronómetro'));
  }
  ajuste('crono', { hab: h.id, inicio: Date.now() });
  avisado = false;
  emitir();
}
export function pararCrono() {
  const c = cronoActivo();
  if (!c) return 0;
  const h = datos.habitos.find(x => x.id === c.hab);
  const mins = (Date.now() - c.inicio) / 60000;
  ajuste('crono', null);
  if (h && mins >= 0.1) fijarValor(h, valorDe(h) + mins);
  emitir();
  return mins;
}
export const minutosCrono = h => {
  const c = cronoActivo();
  return c && c.hab === h.id ? (Date.now() - c.inicio) / 60000 : 0;
};
export const reloj = m => {
  const t = Math.max(0, Math.floor(m * 60));
  const hr = Math.floor(t / 3600);
  return (hr ? hr + ':' : '') + String(Math.floor(t / 60) % 60).padStart(2,'0') +
         ':' + String(t % 60).padStart(2,'0');
};

/* Vigila el objetivo del pomodoro. El refresco visual del reloj lo hace la interfaz. */
setInterval(() => {
  const c = cronoActivo();
  if (!c) return;
  const h = datos.habitos.find(x => x.id === c.hab);
  if (!h) { ajuste('crono', null); return }
  if (!avisado && h.objetivo && valorDe(h) + minutosCrono(h) >= h.objetivo) {
    avisado = true;
    navigator.vibrate?.([200, 100, 200]);
    avisar(`${h.nombre}: ${h.objetivo} min completados`,
      { texto:'Parar', alPulsar: () => { pararCrono(); avisar('Cronómetro parado') } });
  }
}, 1000);


/* ---------- Resumen ----------
   Tres ventanas naturales: la semana en curso (lunes a domingo), el mes
   (día 1 al último) y el año. Cada una acepta un desplazamiento, para poder
   compararse con la anterior. */

export const RANGOS = {
  semana: { nom:'Semana', etq:'esta semana', previo:'la semana pasada', sub:'dia',
            ini: (o=0) => { const d = lunes(); d.setDate(d.getDate() + 7*o); return d },
            fin: (o=0) => { const d = lunes(); d.setDate(d.getDate() + 7*o + 6); return d } },
  mes:    { nom:'Mes', etq:'este mes', previo:'el mes pasado', sub:'semana',
            ini: (o=0) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+o, 1) },
            fin: (o=0) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+o+1, 0) } },
  ano:    { nom:'Año', etq:'este año', previo:'el año pasado', sub:'mes',
            ini: (o=0) => new Date(new Date().getFullYear()+o, 0, 1),
            fin: (o=0) => new Date(new Date().getFullYear()+o, 11, 31) },
};
const aMs = (d, fin) => { d.setHours(fin ? 23 : 0, fin ? 59 : 0, fin ? 59 : 0, 0); return d.getTime() };

/** Periodos del hábito dentro de la ventana que ya han empezado.
 *  Nunca cuenta periodos anteriores a la creación del hábito: uno creado
 *  anteayer no debe salir al 7% por compararlo con el mes entero. */
function periodosEn(h, iniMs, finMs) {
  const frec = frecDe(h);
  const hasta = Math.min(finMs, Date.now());
  if (hasta < iniMs) return [];
  const nacimiento = periodo(frec, h.t || 0);
  const out = [];
  let p, tope;
  if (frec === 'dia')         { p = dia(iniMs); tope = dia(hasta) }
  else if (frec === 'semana') { p = 's' + dia(lunes(iniMs).getTime());
                                tope = 's' + dia(lunes(hasta).getTime()) }
  else                        { p = 'm' + dia(iniMs).slice(0,7); tope = 'm' + dia(hasta).slice(0,7) }
  let guarda = 0;
  while (p <= tope && guarda++ < 500) {
    if (p >= nacimiento) out.push(p);
    p = periodoAtras(frec, p, -1);
  }
  return out;
}

export const redondo = n => Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',');
export const horas = m => m >= 60
  ? (m / 60).toFixed(m % 60 >= 6 ? 1 : 0).replace('.', ',') + ' h'
  : Math.round(m) + ' min';
export const acumulado = (h, suma) => h.tipo === 'crono'
  ? horas(suma)
  : redondo(Math.round(suma * 10) / 10) + (h.unidad ? ' ' + h.unidad : '');

/* Un hábito mensual no tiene sentido en el resumen semanal: su periodo no
   cabe dentro de la ventana. Cada rango admite las periodicidades que contiene. */
const ADMITE = { semana: ['dia','semana'], mes: ['dia','semana','mes'], ano: ['dia','semana','mes'] };

function medirHabito(h, iniMs, finMs) {
  let debidos = 0, hechos = 0, extras = 0, suma = 0, veces = 0;
  for (const p of periodosEn(h, iniMs, finMs)) {
    const v = valorDe(h, p);
    suma += v;
    if (v > 0) veces++;
    if (!esObjetivo(h)) continue;
    if (toca(h, p)) { debidos++; if (cumplido(h, p)) hechos++ }
    else if (v > 0) extras++;
  }
  return { h, debidos, hechos, extras, suma, veces,
           pct: debidos ? Math.round((hechos / debidos) * 100) : null };
}

/** Días del rango, ya transcurridos, en los que se cumplió todo lo que tocaba. */
function diasPerfectos(iniMs, finMs) {
  const diarios = activos().filter(h => frecDe(h) === 'dia' && esObjetivo(h));
  if (!diarios.length) return { perfectos: 0, conAlgo: 0 };
  let perfectos = 0, conAlgo = 0;
  let d = dia(iniMs);
  const tope = dia(Math.min(finMs, Date.now()));
  let guarda = 0;
  while (d <= tope && guarda++ < 400) {
    const tocaban = diarios.filter(h => toca(h, d) && d >= periodo('dia', h.t || 0));
    if (tocaban.length) {
      conAlgo++;
      if (tocaban.every(h => cumplido(h, d))) perfectos++;
    }
    d = diaSuma(d, 1);
  }
  return { perfectos, conAlgo };
}

export function calcularResumen(rango, off = 0) {
  const R = RANGOS[rango];
  const iniMs = aMs(R.ini(off), false), finMs = aMs(R.fin(off), true);
  const dentro = activos().filter(h => ADMITE[rango].includes(frecDe(h)));
  const filas = dentro.filter(esObjetivo).map(h => medirHabito(h, iniMs, finMs))
    .filter(f => f.debidos || f.extras || f.suma);
  const seguimiento = dentro.filter(h => !esObjetivo(h)).map(h => medirHabito(h, iniMs, finMs))
    .filter(f => f.suma > 0);

  const deb = filas.reduce((s,f) => s + f.debidos, 0);
  const hec = filas.reduce((s,f) => s + f.hechos, 0);
  const conMeta = filas.filter(f => f.debidos);
  const ordenadas = [...conMeta].sort((a,b) => b.pct - a.pct);

  return {
    filas, seguimiento, deb, hec, iniMs, finMs,
    extras: filas.reduce((s,f) => s + f.extras, 0),
    pct: deb ? Math.round((hec / deb) * 100) : null,
    completos: conMeta.filter(f => f.pct === 100).length,
    conMeta: conMeta.length,
    mejor: ordenadas[0] || null,
    peor: ordenadas.length > 1 ? ordenadas.at(-1) : null,
    ...diasPerfectos(iniMs, finMs),
    fuera: activos().length - dentro.length,
  };
}

/** Serie de subperiodos para el gráfico: días de la semana, semanas del mes
 *  o meses del año, cada uno con su porcentaje de cumplimiento. */
export function serieResumen(rango, off = 0) {
  const R = RANGOS[rango];
  const iniMs = aMs(R.ini(off), false), finMs = aMs(R.fin(off), true);
  const dentro = activos().filter(h => ADMITE[rango].includes(frecDe(h)) && esObjetivo(h));
  const ahora = Date.now();
  const trozos = [];

  if (R.sub === 'dia') {
    for (let i = 0; i < 7; i++) {
      const d = new Date(iniMs); d.setDate(d.getDate() + i);
      trozos.push({ etq: ['L','M','X','J','V','S','D'][i],
                    a: aMs(new Date(d), false), b: aMs(new Date(d), true) });
    }
  } else if (R.sub === 'semana') {
    /* La primera semana del mes suele empezar a media semana: se recorta al día 1. */
    let d = new Date(iniMs);
    let guarda = 0;
    while (d.getTime() <= finMs && guarda++ < 8) {
      const a = new Date(d);
      const b = lunes(d.getTime()); b.setDate(b.getDate() + 6);
      trozos.push({ etq: 'S' + (trozos.length + 1),
                    a: aMs(a, false), b: aMs(new Date(Math.min(b.getTime(), finMs)), true) });
      const sig = lunes(d.getTime()); sig.setDate(sig.getDate() + 7); d = sig;
    }
  } else {
    const anio = new Date(iniMs).getFullYear();
    for (let m = 0; m < 12; m++)
      trozos.push({ etq: new Date(anio, m, 1).toLocaleDateString('es-ES',{month:'narrow'}),
                    a: aMs(new Date(anio, m, 1), false), b: aMs(new Date(anio, m+1, 0), true) });
  }

  return trozos.filter(Boolean).map(t => {
    if (t.a > ahora) return { ...t, pct: null, futuro: true };
    let deb = 0, hec = 0;
    for (const h of dentro) {
      const m = medirHabito(h, t.a, t.b);
      deb += m.debidos; hec += m.hechos;
    }
    return { ...t, deb, hec, pct: deb ? Math.round((hec / deb) * 100) : null, futuro: false };
  });
}
