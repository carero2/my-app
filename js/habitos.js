/* ==========================================================================
   Módulo Hábitos.
   Grupos definidos por el usuario como submódulos, cada uno con su color.
   Tipos: sino, cantidad y crono.  Periodicidad: día, semana o mes.
   Los diarios pueden limitarse a ciertos días de la semana.
   ========================================================================== */
import {
  datos, anadir, actualizar, borrar, restaurar, ajuste,
  dia, diaSuma, desdeDia, lunes, periodo, periodoAtras, etiquetaPeriodo,
  escapar, avisar, abrirHoja, cerrarHoja, emitir,
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
const DIAS = [[1,'L'],[2,'M'],[3,'X'],[4,'J'],[5,'V'],[6,'S'],[7,'D']];

const orden = (a,b) => (a.orden ?? 0) - (b.orden ?? 0) || a.t - b.t;
export const activos    = () => datos.habitos.filter(h => !h.archivado).sort(orden);
export const archivados = () => datos.habitos.filter(h => h.archivado).sort(orden);
export const grupos = () => [...new Set(activos().map(h => h.grupo || 'General'))];
const frecDe = h => h.frec || 'dia';

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
  datos.habitos.filter(h => (h.grupo || 'General') === g && h.color !== col)
    .forEach(h => actualizar('habitos', h.id, { color: col }));
}
const colorDe = h => h.color || colorGrupo(h.grupo || 'General');

/* ---------- Días activos ----------
   Sin el campo `dias`, un hábito diario cuenta todos los días. */
const numDia = p => ((desdeDia(p).getDay() + 6) % 7) + 1;      // 1 lunes … 7 domingo
export function toca(h, p = periodo(frecDe(h), Date.now())) {
  if (frecDe(h) !== 'dia') return true;
  if (!Array.isArray(h.dias) || !h.dias.length) return true;
  return h.dias.includes(numDia(p));
}
/** ¿Entra en el círculo de progreso del día? */
export const cuentaHoy = h =>
  frecDe(h) === 'dia' && h.cuenta !== false && toca(h);

/* ---------- Registros ---------- */
const clave = (h, ms = Date.now()) => periodo(frecDe(h), ms);
export const registro = (h, p = clave(h)) =>
  datos.registros.find(r => r.hab === h.id && r.d === p);
export const valorDe = (h, p = clave(h)) => registro(h, p)?.v || 0;

export function cumplido(h, p = clave(h)) {
  const v = valorDe(h, p);
  return h.tipo === 'sino' ? v >= 1 : v >= (h.objetivo || 1);
}
/** Rachas: los periodos en los que no toca se saltan, no la rompen. */
export function racha(h) {
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
export function mejorRacha(h) {
  const frec = frecDe(h);
  const hechos = new Set(datos.registros.filter(r => r.hab === h.id)
    .filter(r => h.tipo === 'sino' ? r.v >= 1 : r.v >= (h.objetivo || 1)).map(r => r.d));
  if (!hechos.size) return 0;
  const anterior = p => { let q = periodoAtras(frec, p, 1), t = 0;
    while (!toca(h, q) && t++ < 400) q = periodoAtras(frec, q, 1); return q };
  const siguiente = p => { let q = periodoAtras(frec, p, -1), t = 0;
    while (!toca(h, q) && t++ < 400) q = periodoAtras(frec, q, -1); return q };
  let mejor = 0;
  for (const p of hechos) {
    if (hechos.has(siguiente(p))) continue;         // no es el final de una serie
    let n = 0, q = p, t = 0;
    while (hechos.has(q) && t++ < 400) { n++; q = anterior(q) }
    mejor = Math.max(mejor, n);
  }
  return mejor;
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
const reloj = m => {
  const t = Math.max(0, Math.floor(m * 60));
  const hr = Math.floor(t / 3600);
  return (hr ? hr + ':' : '') + String(Math.floor(t / 60) % 60).padStart(2,'0') +
         ':' + String(t % 60).padStart(2,'0');
};

setInterval(() => {
  const c = cronoActivo();
  if (!c) return;
  const h = datos.habitos.find(x => x.id === c.hab);
  if (!h) { ajuste('crono', null); return }
  const total = valorDe(h) + minutosCrono(h);
  document.querySelectorAll(`[data-reloj="${h.id}"]`).forEach(el => el.textContent = reloj(total));
  document.querySelectorAll(`[data-progreso="${h.id}"]`).forEach(el =>
    el.style.width = Math.min(total / (h.objetivo || total || 1), 1) * 100 + '%');
  if (!avisado && h.objetivo && total >= h.objetivo) {
    avisado = true;
    navigator.vibrate?.([200, 100, 200]);
    avisar(`${h.nombre}: ${h.objetivo} min completados`,
      { texto:'Parar', alPulsar: () => { pararCrono(); avisar('Cronómetro parado') } });
  }
}, 1000);

/* ==========================================================================
   Tarjeta
   ========================================================================== */
const redondo = n => Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',');

export function tarjeta(h) {
  const frec = frecDe(h);
  const v = valorDe(h);
  const enMarcha = cronoActivo()?.hab === h.id;
  const obj = h.objetivo || 0;
  const total = h.tipo === 'crono' ? v + minutosCrono(h) : v;
  const pct = obj ? Math.min(total / obj, 1) * 100 : (total > 0 ? 100 : 0);
  const col = colorDe(h);
  const hecho = cumplido(h);
  const hoyToca = toca(h);

  let control = '';
  if (h.tipo === 'sino') {
    control = `<button class="marca ${hecho ? 'hecho' : ''}" data-acc="sino" data-h="${h.id}"
      ${hecho ? `style="background:${col}"` : ''} aria-label="Marcar">✓</button>`;
  } else if (h.tipo === 'cantidad') {
    control = `<div class="contador">
      <button data-acc="menos" data-h="${h.id}" aria-label="Restar">−</button>
      <div class="valor num" data-acc="fijar" data-h="${h.id}">${redondo(v)}
        <small>${obj ? 'de ' + obj : ''} ${escapar(h.unidad || '')}</small></div>
      <button data-acc="mas" data-h="${h.id}" aria-label="Sumar">+</button></div>`;
  } else {
    control = `<div class="crono">
      <span class="reloj num" data-reloj="${h.id}">${reloj(total)}</span>
      <button class="play ${enMarcha ? 'marcha' : ''}" data-acc="crono" data-h="${h.id}"
        aria-label="${enMarcha ? 'Parar' : 'Empezar'}">${enMarcha ? '■' : '▶'}</button></div>`;
  }

  const r = racha(h);
  const unidades = frec === 'dia' ? ['día','días'] : frec === 'semana'
    ? ['semana','semanas'] : ['mes','meses'];
  const sub = [
    frec === 'dia' ? diasTexto(h) : FRECS[frec].corto,
    obj ? 'objetivo ' + (h.tipo === 'crono' ? obj + ' min' : obj + ' ' + (h.unidad || '')) : '',
    h.cuenta === false ? 'no cuenta en el día' : '',
  ].filter(Boolean).join(' · ');

  return `<div class="hab ${hecho ? 'hecho' : ''} ${hoyToca ? '' : 'descanso'}" data-hab="${h.id}">
    <div class="hab-cab">
      <div class="punto" style="background:${col}22;color:${col}">${h.emo || '•'}</div>
      <div class="hab-nom" data-acc="editar" data-h="${h.id}">
        <b>${escapar(h.nombre)}</b>
        ${sub ? `<small>${escapar(sub)}</small>` : ''}
      </div>
      ${hoyToca ? control : '<span class="hoyNo">hoy no toca</span>'}
    </div>
    ${h.tipo !== 'sino' || obj ? `<div class="barra"><i data-progreso="${h.id}"
      style="width:${pct}%;background:${col}"></i></div>` : ''}
    <div class="tira" data-tira="${h.id}">${tira(h, col)}</div>
    ${r ? `<div class="racha">🔥 ${r} ${r === 1 ? unidades[0] : unidades[1]} seguidos</div>` : ''}
  </div>`;
}

function diasTexto(h) {
  if (!Array.isArray(h.dias) || !h.dias.length || h.dias.length === 7) return '';
  if (h.dias.join() === '1,2,3,4,5') return 'de lunes a viernes';
  if (h.dias.join() === '6,7') return 'fines de semana';
  return DIAS.filter(([n]) => h.dias.includes(n)).map(([,l]) => l).join(' ');
}

/** Tira de periodos. Cada celda es tocable: abre el registro de ese periodo. */
function tira(h, col) {
  const frec = frecDe(h);
  const relleno = p => {
    const v = valorDe(h, p);
    return h.tipo === 'sino' ? (v >= 1 ? 1 : 0) : Math.min(v / (h.objetivo || 1), 1);
  };
  const celda = (p, etq, futuro) => {
    const off = !futuro && !toca(h, p);
    const pct = futuro || off ? 0 : relleno(p);
    return `<div data-p="${p}" data-h="${h.id}"><i class="${futuro ? 'futuro' : ''} ${off ? 'apagado' : ''}"
      style="${pct ? `background:${col};opacity:${0.3 + pct * 0.7}` : ''}"></i>${etq}</div>`;
  };

  if (frec === 'dia') {
    const base = dia(lunes().getTime()), hoy = dia();
    return DIAS.map(([, letra], i) => {
      const p = diaSuma(base, i);
      return celda(p, letra, p > hoy);
    }).join('');
  }
  const n = frec === 'semana' ? 8 : 6;
  const actual = periodo(frec, Date.now());
  const celdas = [];
  for (let i = n - 1; i >= 0; i--) {
    const p = periodoAtras(frec, actual, i);
    celdas.push(celda(p, etiquetaPeriodo(frec, p), false));
  }
  return celdas.join('');
}

/** Conecta los clics de cualquier contenedor con tarjetas de hábitos. */
export function conectar(contenedor) {
  contenedor.onclick = e => {
    const celda = e.target.closest('[data-tira] [data-p]');
    if (celda) {
      const h = datos.habitos.find(x => x.id === celda.dataset.h);
      if (h) hojaValor(h, celda.dataset.p);
      return;
    }
    const b = e.target.closest('[data-acc]'); if (!b) return;
    const h = datos.habitos.find(x => x.id === b.dataset.h); if (!h) return;
    const v = valorDe(h);
    const acc = b.dataset.acc;

    if (acc === 'sino')   { fijarValor(h, v >= 1 ? 0 : 1); navigator.vibrate?.(12) }
    if (acc === 'mas')    { fijarValor(h, v + (h.paso || 1)); navigator.vibrate?.(8) }
    if (acc === 'menos')  { fijarValor(h, v - (h.paso || 1)); navigator.vibrate?.(8) }
    if (acc === 'fijar')  hojaValor(h);
    if (acc === 'editar') hojaHabito(h);
    if (acc === 'crono') {
      if (cronoActivo()?.hab === h.id) {
        const m = pararCrono();
        avisar(`Sumados ${Math.round(m)} min a ${h.nombre}`);
      } else arrancarCrono(h);
    }
  };
}

/* ==========================================================================
   Vista del módulo
   ========================================================================== */
let seg = null;   // null = Todos · 'resumen' · 'archivados' · nombre de grupo

export function pintar(vista) {
  const gs = grupos();
  if (seg && !['resumen','archivados'].includes(seg) && !gs.includes(seg)) seg = null;
  const arch = archivados().length;

  vista.innerHTML = `<div class="scroll">
    <div class="segmentos envuelve">
      <button class="seg" data-g="" aria-pressed="${!seg}">Todos</button>
      ${gs.map(g => { const c = colorGrupo(g); return `<button class="seg" data-g="${escapar(g)}"
        aria-pressed="${seg === g}" style="${seg === g
          ? `background:${c};border-color:transparent;color:#fff`
          : `border-color:${c}66`}"><i class="pinta" style="background:${c}"></i>${escapar(g)}</button>` }).join('')}
    </div>
    <div class="acciones">
      <button class="accion ${seg === 'resumen' ? 'on' : ''}" data-g="resumen">📊 Resumen</button>
      ${arch ? `<button class="accion ${seg === 'archivados' ? 'on' : ''}"
        data-g="archivados">🗄 Archivados</button>` : ''}
      <button class="accion nuevo" data-g="+">+ Hábito</button>
    </div>
    <div id="habCuerpo"></div></div>`;

  vista.querySelector('.scroll').addEventListener('click', e => {
    const b = e.target.closest('.seg[data-g], .accion[data-g]'); if (!b) return;
    if (b.dataset.g === '+') return hojaHabito(null);
    seg = b.dataset.g || null;
    pintar(vista);
  });

  const cuerpo = vista.querySelector('#habCuerpo');
  if (seg === 'resumen')    return pintarResumen(cuerpo);
  if (seg === 'archivados') return pintarArchivados(cuerpo);

  const lista = activos().filter(h => !seg || (h.grupo || 'General') === seg);
  if (!lista.length) {
    cuerpo.innerHTML = `<p class="vacio">
      ${datos.habitos.length ? 'No hay hábitos en este grupo.' : 'Todavía no has creado ningún hábito.'}
      <button id="crear">Crear el primero</button></p>`;
    cuerpo.querySelector('#crear').onclick = () => hojaHabito(null);
    return;
  }

  let html = anillo(lista);
  if (!seg) {
    for (const g of grupos()) {
      const del = lista.filter(h => (h.grupo || 'General') === g);
      if (!del.length) continue;
      html += `<div class="etiqueta" style="color:${colorGrupo(g)}">${escapar(g)}</div>` +
              del.map(tarjeta).join('');
    }
  } else html += lista.map(tarjeta).join('');

  cuerpo.innerHTML = html;
  conectar(cuerpo);
}

/** Solo cuentan los diarios que tocan hoy y que no estén excluidos a propósito. */
export function anillo(lista) {
  const delDia = lista.filter(cuentaHoy);
  const otros = lista.length - delDia.length;
  if (!delDia.length) {
    return otros ? `<div class="resumenDia"><div><b>Hoy no toca nada</b>
      <small>${otros} hábito${otros===1?'':'s'} sin cómputo diario</small></div></div>` : '';
  }
  const hechos = delDia.filter(h => cumplido(h)).length;
  const pct = (hechos / delDia.length) * 100;
  return `<div class="resumenDia">
    <div class="anillo" style="--pct:${pct}">
      <span class="num">${hechos}<small>/${delDia.length}</small></span></div>
    <div><b>${hechos === delDia.length ? '¡Todo hecho por hoy!' : 'Vas por buen camino'}</b>
      <small>de lo que toca hoy${otros ? ` · ${otros} fuera del cómputo` : ''}</small></div>
  </div>`;
}

/* ---------- Resumen ---------- */
function pintarResumen(c) {
  const lista = activos();
  if (!lista.length) { c.innerHTML = '<p class="vacio">Nada que resumir todavía.</p>'; return }

  const filas = lista.map(h => {
    const frec = frecDe(h);
    const n = frec === 'dia' ? 30 : frec === 'semana' ? 12 : 6;
    const actual = periodo(frec, Date.now());
    let hechos = 0, aplican = 0, suma = 0;
    for (let i = 0; i < n; i++) {
      const p = periodoAtras(frec, actual, i);
      if (!toca(h, p)) continue;
      aplican++;
      suma += valorDe(h, p);
      if (cumplido(h, p)) hechos++;
    }
    return { h, frec, aplican, hechos, suma,
             pct: aplican ? Math.round((hechos / aplican) * 100) : 0,
             racha: racha(h), mejor: mejorRacha(h) };
  });

  c.innerHTML = `
    <div class="rejilla">
      <div class="mini"><b class="num">${lista.filter(h => cuentaHoy(h) && cumplido(h)).length}/${
        lista.filter(cuentaHoy).length}</b><small>cumplidos hoy</small></div>
      <div class="mini"><b class="num">${Math.round(
        filas.reduce((s,f) => s + f.pct, 0) / filas.length)}%</b><small>constancia media</small></div>
      <div class="mini"><b class="num">${Math.max(...filas.map(f => f.mejor), 0)}</b>
        <small>racha más larga</small></div>
      <div class="mini"><b class="num">${filas.filter(f => f.racha > 0).length}</b>
        <small>hábitos en racha</small></div>
    </div>

    ${filas.map(f => {
      const col = colorDe(f.h);
      const unidad = f.h.tipo === 'crono' ? 'min' : (f.h.unidad || '');
      const nom = f.frec === 'dia' ? 'días' : f.frec === 'semana' ? 'semanas' : 'meses';
      return `<div class="panel" style="padding:15px">
        <div class="hab-cab" style="margin-bottom:10px">
          <div class="punto" style="background:${col}22;color:${col}">${f.h.emo || '•'}</div>
          <div class="hab-nom"><b>${escapar(f.h.nombre)}</b>
            <small>últim${nom === 'días' ? 'os' : 'as'} ${f.aplican} ${nom} que tocaban</small></div>
          <div class="imp num">${f.pct}%</div>
        </div>
        <div class="barra"><i style="width:${f.pct}%;background:${col}"></i></div>
        <div class="racha">${f.hechos} de ${f.aplican} cumplidos${
          f.h.tipo !== 'sino' && f.suma ? ` · ${redondo(Math.round(f.suma))} ${escapar(unidad)} en total` : ''
        }${f.mejor ? ` · mejor racha ${f.mejor}` : ''}</div>
      </div>`;
    }).join('')}`;
}

function pintarArchivados(c) {
  c.innerHTML = `<p class="pieNota">Conservan su historial. Puedes recuperarlos cuando quieras.</p>` +
    archivados().map(h => `<div class="grupo" style="margin-top:10px"><div>
      <span>${h.emo || '•'} ${escapar(h.nombre)}</span>
      <button class="acento" data-rec="${h.id}">Recuperar</button></div></div>`).join('');
  c.onclick = e => {
    const b = e.target.closest('[data-rec]'); if (!b) return;
    actualizar('habitos', b.dataset.rec, { archivado: false });
    seg = null; avisar('Hábito recuperado'); emitir();
  };
}

/* ==========================================================================
   Registro de un periodo concreto, también pasado
   ========================================================================== */
export function hojaValor(h, p = clave(h)) {
  const frec = frecDe(h);
  const hoy = periodo(frec, Date.now());
  const futuro = frec === 'dia' ? p > hoy : false;

  const selector = frec === 'dia'
    ? `<input id="vFecha" type="date" value="${p}" max="${hoy}">`
    : `<select id="vFecha">${Array.from({length: frec === 'semana' ? 12 : 12}, (_, i) => {
        const q = periodoAtras(frec, hoy, i);
        return `<option value="${q}" ${q === p ? 'selected' : ''}>${
          i === 0 ? (frec === 'semana' ? 'Esta semana' : 'Este mes') : etiquetaPeriodo(frec, q)}</option>`;
      }).join('')}</select>`;

  const v = valorDe(h, p);
  const entrada = h.tipo === 'sino'
    ? `<div class="opciones" id="vSino">
         <button data-v="1" aria-pressed="${v >= 1}">✓ Hecho</button>
         <button data-v="0" aria-pressed="${v < 1}">Sin hacer</button></div>`
    : `<label><span>${h.tipo === 'crono' ? 'Minutos' : 'Cantidad' +
        (h.unidad ? ' en ' + escapar(h.unidad) : '')}</span>
       <input id="vVal" type="number" inputmode="decimal" step="any" min="0" value="${v || ''}"
         placeholder="0"></label>`;

  abrirHoja(`<h3>${escapar(h.nombre)}</h3>
    <p class="pieNota" style="padding:0 0 4px">Registra o corrige un ${
      frec === 'dia' ? 'día' : frec === 'semana' ? 'semana' : 'mes'} concreto.</p>
    <label><span>${frec === 'dia' ? 'Fecha' : 'Periodo'}</span>${selector}</label>
    ${entrada}
    ${futuro ? '<p class="pieNota rojo">No se puede registrar el futuro.</p>' : ''}
    <div class="fila"><button id="vCancelar">Cancelar</button>
      <button class="ok" id="vOk">Guardar</button></div>`,
  caja => {
    let pSel = p, vSel = v;
    const $ = s => caja.querySelector(s);
    $('#vFecha').onchange = e => {
      pSel = e.target.value;
      cerrarHoja(); hojaValor(h, pSel);          // se repinta con los datos de ese periodo
    };
    $('#vSino')?.addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      vSel = Number(b.dataset.v);
      caja.querySelectorAll('#vSino button').forEach(x =>
        x.setAttribute('aria-pressed', Number(x.dataset.v) === vSel));
    });
    $('#vCancelar').onclick = cerrarHoja;
    $('#vOk').onclick = () => {
      if (pSel > periodo(frec, Date.now()) && frec === 'dia') return avisar('Esa fecha aún no ha llegado');
      const valor = h.tipo === 'sino' ? vSel : (parseFloat($('#vVal').value) || 0);
      fijarValor(h, valor, pSel);
      cerrarHoja(); emitir();
      avisar(pSel === periodo(frec, Date.now()) ? 'Registrado'
        : 'Registrado en ' + etiquetaPeriodo(frec, pSel));
    };
  });
}

/* ==========================================================================
   Alta y edición de hábitos
   ========================================================================== */
export function hojaHabito(h) {
  const nuevo = !h;
  const grupoPrevio = (seg && !['resumen','archivados'].includes(seg)) ? seg : '';
  const d = h || { nombre:'', grupo: grupoPrevio, tipo:'sino', frec:'dia', objetivo:'',
                   unidad:'', emo:'•', paso:1, dias:[], cuenta:true };
  abrirHoja(`
    <h3>${nuevo ? 'Nuevo hábito' : 'Editar hábito'}</h3>
    <label><span>Nombre</span><input id="hNom" maxlength="40" value="${escapar(d.nombre)}"
      placeholder="Leer, entrenar, dormir…"></label>
    <label><span>Grupo (será una pestaña dentro de Hábitos)</span>
      <input id="hGrupo" maxlength="24" list="listaGrupos" value="${escapar(d.grupo)}"
        placeholder="Trabajo, entrenamiento, sueño…">
      <datalist id="listaGrupos">${grupos().map(g => `<option value="${escapar(g)}">`).join('')}</datalist></label>
    <label><span>Emoji</span><input id="hEmo" maxlength="2" value="${escapar(d.emo || '•')}"></label>

    <label><span>Color del grupo</span></label>
    <div class="colores" id="hCol"></div>
    <p class="pieNota" id="hColNota" style="padding:6px 2px 0"></p>

    <label><span>Cada cuánto</span></label>
    <div class="opciones" id="hFrecs">${Object.entries(FRECS).map(([id,f]) =>
      `<button data-f="${id}" aria-pressed="${(d.frec||'dia')===id}">${f.nom}</button>`).join('')}</div>
    <div id="hDias"></div>

    <label><span>Tipo</span></label>
    <div class="opciones" id="hTipos">${Object.entries(TIPOS).map(([id,t]) =>
      `<button data-t="${id}" aria-pressed="${d.tipo===id}">${t.nom}</button>`).join('')}</div>
    <p class="pieNota" id="hAyuda" style="padding:6px 2px 0">${TIPOS[d.tipo].ayuda}</p>
    <div id="hExtra"></div>

    ${nuevo ? '' : `<div class="fila" style="margin-top:18px">
      <button id="hSubir">↑ Subir</button><button id="hBajar">↓ Bajar</button>
      <button id="hArchivar">Archivar</button></div>`}
    <div class="fila">
      ${nuevo ? '' : '<button class="mal" id="hBorrar">Borrar</button>'}
      <button id="hCancelar">Cancelar</button>
      <button class="ok" id="hOk">${nuevo ? 'Crear' : 'Guardar'}</button>
    </div>`,
  caja => {
    let tipo = d.tipo, frec = d.frec || 'dia';
    let dias = Array.isArray(d.dias) ? [...d.dias] : [];
    let cuenta = d.cuenta !== false;
    let color = null;                       // null = el que ya tenga el grupo
    const $ = s => caja.querySelector(s);

    const grupoActual = () => $('#hGrupo').value.trim() || 'General';
    const existe = () => grupos().includes(grupoActual());

    const pintarColor = () => {
      const g = grupoActual();
      const actual = color || (existe() ? colorGrupo(g) : null) || siguienteColor();
      $('#hCol').innerHTML = PALETA.map(c => `<button data-c="${c}" style="background:${c}"
        aria-pressed="${c === actual}" aria-label="Color"></button>`).join('');
      $('#hColNota').textContent = existe()
        ? `El color es de todo el grupo «${g}». Cambiarlo afecta a sus demás hábitos.`
        : `Grupo nuevo: este color quedará asociado a «${g}».`;
    };
    const siguienteColor = () => {
      const usados = new Set(Object.values(ajuste('coloresGrupo') || {}));
      return PALETA.find(c => !usados.has(c)) || PALETA[0];
    };
    const pintarDias = () => {
      $('#hDias').innerHTML = frec !== 'dia' ? '' : `
        <label><span>Días en los que cuenta</span></label>
        <div class="opciones dias" id="hDiasBtns">${DIAS.map(([n,l]) =>
          `<button data-d="${n}" aria-pressed="${!dias.length || dias.includes(n)}">${l}</button>`).join('')}</div>
        <p class="pieNota" style="padding:6px 2px 0">Los días que no marques se saltan:
          no rompen la racha ni cuentan en el progreso del día.</p>
        <div class="opciones" style="margin-top:10px" id="hCuenta">
          <button data-c="1" aria-pressed="${cuenta}">Cuenta en el progreso</button>
          <button data-c="0" aria-pressed="${!cuenta}">Solo seguimiento</button></div>`;
    };
    const pintarExtra = () => {
      $('#hAyuda').textContent = TIPOS[tipo].ayuda;
      const cada = frec === 'dia' ? 'diario' : frec === 'semana' ? 'semanal' : 'mensual';
      $('#hExtra').innerHTML = tipo === 'sino' ? '' : `
        <label><span>Objetivo ${cada}${tipo === 'crono' ? ' en minutos' : ''}</span>
          <input id="hObj" type="number" inputmode="decimal" min="0" step="any"
            value="${d.objetivo || ''}" placeholder="${tipo === 'crono' ? '25' : '10'}"></label>
        ${tipo === 'cantidad' ? `
        <label><span>Unidad</span><input id="hUni" maxlength="14" value="${escapar(d.unidad || '')}"
          placeholder="páginas, libros, vasos, km…"></label>
        <label><span>Cuánto suma cada toque</span><input id="hPaso" type="number" min="0.1" step="any"
          value="${d.paso || 1}"></label>` : ''}`;
    };
    pintarColor(); pintarDias(); pintarExtra();

    $('#hGrupo').oninput = () => { color = null; pintarColor() };
    $('#hCol').onclick = e => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      color = b.dataset.c; pintarColor();
    };
    $('#hFrecs').onclick = e => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      frec = b.dataset.f;
      caja.querySelectorAll('#hFrecs button').forEach(x =>
        x.setAttribute('aria-pressed', x.dataset.f === frec));
      pintarDias(); pintarExtra();
    };
    caja.addEventListener('click', e => {
      const bd = e.target.closest('#hDiasBtns [data-d]');
      if (bd) {
        const n = Number(bd.dataset.d);
        if (!dias.length) dias = DIAS.map(([x]) => x);      // estaban todos implícitos
        dias = dias.includes(n) ? dias.filter(x => x !== n) : [...dias, n].sort();
        caja.querySelectorAll('#hDiasBtns [data-d]').forEach(x =>
          x.setAttribute('aria-pressed', dias.includes(Number(x.dataset.d))));
      }
      const bc = e.target.closest('#hCuenta [data-c]');
      if (bc) {
        cuenta = bc.dataset.c === '1';
        caja.querySelectorAll('#hCuenta [data-c]').forEach(x =>
          x.setAttribute('aria-pressed', (x.dataset.c === '1') === cuenta));
      }
    });
    $('#hTipos').onclick = e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      tipo = b.dataset.t;
      caja.querySelectorAll('#hTipos button').forEach(x =>
        x.setAttribute('aria-pressed', x.dataset.t === tipo));
      pintarExtra();
    };
    $('#hCancelar').onclick = cerrarHoja;

    $('#hSubir')?.addEventListener('click', () => mover(h, -1));
    $('#hBajar')?.addEventListener('click', () => mover(h, +1));
    $('#hArchivar')?.addEventListener('click', () => {
      actualizar('habitos', h.id, { archivado: true });
      cerrarHoja(); emitir();
      avisar('Archivado', { texto:'Deshacer',
        alPulsar: () => { actualizar('habitos', h.id, { archivado: false }); emitir() } });
    });
    $('#hBorrar')?.addEventListener('click', () => {
      const regs = datos.registros.filter(r => r.hab === h.id);
      const it = borrar('habitos', h.id);
      regs.forEach(r => borrar('registros', r.id));
      cerrarHoja(); emitir();
      avisar('Hábito borrado', { texto:'Deshacer', alPulsar: () => {
        restaurar('habitos', it); regs.forEach(r => restaurar('registros', r)); emitir();
      }});
    });
    $('#hOk').onclick = () => {
      const nombre = $('#hNom').value.trim();
      if (!nombre) return avisar('Ponle un nombre');
      const grupo = grupoActual();
      const col = color || (existe() ? colorGrupo(grupo) : siguienteColor());
      fijarColorGrupo(grupo, col);
      const campos = {
        nombre, tipo, frec, grupo, color: col,
        emo: $('#hEmo').value.trim() || '•',
        objetivo: parseFloat($('#hObj')?.value) || 0,
        unidad: $('#hUni')?.value.trim() || '',
        paso: parseFloat($('#hPaso')?.value) || 1,
        dias: frec === 'dia' && dias.length && dias.length < 7 ? dias : [],
        cuenta: frec === 'dia' ? cuenta : false,
      };
      if (nuevo) { anadir('habitos', { ...campos, orden: datos.habitos.length }); avisar('Hábito creado') }
      else {
        if (frec !== frecDe(h)) avisar('Cambiada la periodicidad: el historial anterior se conserva aparte');
        actualizar('habitos', h.id, campos);
      }
      cerrarHoja(); emitir();
    };
  });
}

function mover(h, delta) {
  const lista = activos();
  const i = lista.findIndex(x => x.id === h.id);
  const j = i + delta;
  if (j < 0 || j >= lista.length) return avisar('Ya está en el extremo');
  lista.forEach((x, k) => { if ((x.orden ?? 0) !== k) actualizar('habitos', x.id, { orden: k }) });
  actualizar('habitos', lista[i].id, { orden: j });
  actualizar('habitos', lista[j].id, { orden: i });
  cerrarHoja(); emitir();
}
