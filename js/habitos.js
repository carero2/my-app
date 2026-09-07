/* ==========================================================================
   Módulo Hábitos.
   Los submódulos son los grupos que define el usuario (trabajo, sueño...),
   más un resumen con métricas.
   Tipos: sino, cantidad y crono.  Periodicidad: día, semana o mes.
   ========================================================================== */
import {
  datos, anadir, actualizar, borrar, restaurar, ajuste,
  dia, diaSuma, lunes, periodo, periodoAtras, etiquetaPeriodo,
  escapar, avisar, abrirHoja, cerrarHoja, emitir,
} from './nucleo.js';

export const TIPOS = {
  sino:     { nom:'Sí o no',    ayuda:'Una casilla que marcas al cumplirlo' },
  cantidad: { nom:'Cantidad',   ayuda:'Cuentas unidades hacia un objetivo' },
  crono:    { nom:'Cronómetro', ayuda:'Mides el tiempo dedicado, tipo pomodoro' },
};
export const FRECS = {
  dia:    { nom:'Cada día',     corto:'diario'  },
  semana: { nom:'Cada semana',  corto:'semanal' },
  mes:    { nom:'Cada mes',     corto:'mensual' },
};
export const PALETA = ['#C7513F','#3E6FA8','#D98A2B','#4E8A5B','#7A5BA6','#8C8378'];

const orden = (a,b) => (a.orden ?? 0) - (b.orden ?? 0) || a.t - b.t;
export const activos    = () => datos.habitos.filter(h => !h.archivado).sort(orden);
export const archivados = () => datos.habitos.filter(h => h.archivado).sort(orden);
export const grupos = () => [...new Set(activos().map(h => h.grupo || 'General'))];
const frecDe = h => h.frec || 'dia';

/* ---------- Registros ---------- */
const clave = (h, ms) => periodo(frecDe(h), ms);
export const registro = (h, p = clave(h, Date.now())) =>
  datos.registros.find(r => r.hab === h.id && r.d === p);
export const valorDe = (h, p = clave(h, Date.now())) => registro(h, p)?.v || 0;

export function cumplido(h, p = clave(h, Date.now())) {
  const v = valorDe(h, p);
  return h.tipo === 'sino' ? v >= 1 : v >= (h.objetivo || 1);
}
export function racha(h) {
  let n = 0, p = clave(h, Date.now());
  if (!cumplido(h, p)) p = periodoAtras(frecDe(h), p, 1);   // el periodo en curso aún puede cerrarse
  while (cumplido(h, p)) { n++; p = periodoAtras(frecDe(h), p, 1) }
  return n;
}
export function mejorRacha(h) {
  const hechos = new Set(datos.registros.filter(r => r.hab === h.id)
    .filter(r => h.tipo === 'sino' ? r.v >= 1 : r.v >= (h.objetivo || 1)).map(r => r.d));
  let mejor = 0;
  for (const p of hechos) {
    if (hechos.has(periodoAtras(frecDe(h), p, -1))) continue;   // no es el final de una serie
    let n = 0, q = p;
    while (hechos.has(q)) { n++; q = periodoAtras(frecDe(h), q, 1) }
    mejor = Math.max(mejor, n);
  }
  return mejor;
}

function fijarValor(h, v) {
  const p = clave(h, Date.now());
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
  const h = Math.floor(t / 3600);
  return (h ? h + ':' : '') + String(Math.floor(t / 60) % 60).padStart(2,'0') +
         ':' + String(t % 60).padStart(2,'0');
};

/* Un solo temporizador para toda la app: refresca los relojes en pantalla. */
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
   Tarjeta de hábito
   ========================================================================== */
const redondo = n => Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',');

export function tarjeta(h) {
  const frec = frecDe(h);
  const v = valorDe(h);
  const enMarcha = cronoActivo()?.hab === h.id;
  const obj = h.objetivo || 0;
  const total = h.tipo === 'crono' ? v + minutosCrono(h) : v;
  const pct = obj ? Math.min(total / obj, 1) * 100 : (total > 0 ? 100 : 0);
  const col = h.color || PALETA[1];
  const hecho = cumplido(h);

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
  const sub = [
    frec === 'dia' ? '' : FRECS[frec].corto,
    obj ? 'objetivo ' + (h.tipo === 'crono' ? obj + ' min' : obj + ' ' + (h.unidad || '')) : '',
  ].filter(Boolean).join(' · ');

  return `<div class="hab ${hecho ? 'hecho' : ''}" data-hab="${h.id}">
    <div class="hab-cab">
      <div class="punto" style="background:${col}22;color:${col}">${h.emo || '•'}</div>
      <div class="hab-nom" data-acc="editar" data-h="${h.id}">
        <b>${escapar(h.nombre)}</b>
        ${sub ? `<small>${escapar(sub)}</small>` : ''}
      </div>
      ${control}
    </div>
    ${h.tipo !== 'sino' || obj ? `<div class="barra"><i data-progreso="${h.id}"
      style="width:${pct}%;background:${col}"></i></div>` : ''}
    <div class="tira">${tira(h, col)}</div>
    ${r ? `<div class="racha">🔥 ${r} ${frec === 'dia' ? (r === 1 ? 'día' : 'días')
        : frec === 'semana' ? (r === 1 ? 'semana' : 'semanas')
        : (r === 1 ? 'mes' : 'meses')} seguidos</div>` : ''}
  </div>`;
}

/** Tira de periodos recientes. Los días se muestran como semana natural de lunes a domingo. */
function tira(h, col) {
  const frec = frecDe(h);
  const relleno = p => {
    const v = valorDe(h, p);
    if (h.tipo === 'sino') return v >= 1 ? 1 : 0;
    return Math.min(v / (h.objetivo || 1), 1);
  };
  const celda = (p, etq, futuro) => {
    const pct = futuro ? 0 : relleno(p);
    return `<div><i class="${futuro ? 'futuro' : ''}"
      style="${pct ? `background:${col};opacity:${0.3 + pct * 0.7}` : ''}"></i>${etq}</div>`;
  };

  if (frec === 'dia') {
    const L = ['L','M','X','J','V','S','D'];
    const base = dia(lunes().getTime()), hoy = dia();
    return L.map((etq, i) => {
      const p = diaSuma(base, i);
      return celda(p, etq, p > hoy);
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

/** Conecta los clics de cualquier contenedor que muestre tarjetas de hábitos. */
export function conectar(contenedor) {
  contenedor.onclick = e => {
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
    <div class="segmentos">
      <button class="seg" data-g="" aria-pressed="${!seg}">Todos</button>
      ${gs.map(g => `<button class="seg" data-g="${escapar(g)}"
        aria-pressed="${seg === g}">${escapar(g)}</button>`).join('')}
      <button class="seg" data-g="resumen" aria-pressed="${seg === 'resumen'}">Resumen</button>
      ${arch ? `<button class="seg" data-g="archivados"
        aria-pressed="${seg === 'archivados'}">Archivados</button>` : ''}
      <button class="seg nuevo" data-g="+">+ Hábito</button>
    </div>
    <div id="habCuerpo"></div></div>`;

  vista.querySelector('.segmentos').onclick = e => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    if (b.dataset.g === '+') return hojaHabito(null);
    seg = b.dataset.g || null;
    pintar(vista);
  };

  const cuerpo = vista.querySelector('#habCuerpo');
  if (seg === 'resumen')     return pintarResumen(cuerpo);
  if (seg === 'archivados')  return pintarArchivados(cuerpo);

  const lista = activos().filter(h => !seg || (h.grupo || 'General') === seg);
  if (!lista.length) {
    cuerpo.innerHTML = `<p class="vacio">
      ${datos.habitos.length ? 'No hay hábitos en este grupo.' : 'Todavía no has creado ningún hábito.'}
      <button id="crear">Crear el primero</button></p>`;
    cuerpo.querySelector('#crear').onclick = () => hojaHabito(null);
    return;
  }

  const hechos = lista.filter(h => cumplido(h)).length;
  const cabecera = `<div class="resumenDia">
      <div class="anillo" style="--pct:${lista.length ? (hechos/lista.length)*100 : 0}">
        <span class="num">${hechos}<small>/${lista.length}</small></span></div>
      <div><b>${hechos === lista.length ? '¡Todo hecho!' : 'Vas por buen camino'}</b>
        <small>${hechos} de ${lista.length} cumplidos en su periodo</small></div>
    </div>`;

  /* Sin filtro, se agrupa con encabezados; con filtro, lista plana. */
  let html = cabecera;
  if (!seg) {
    for (const g of grupos()) {
      const del = lista.filter(h => (h.grupo || 'General') === g);
      if (!del.length) continue;
      html += `<div class="etiqueta">${escapar(g)}</div>` + del.map(tarjeta).join('');
    }
  } else html += lista.map(tarjeta).join('');

  cuerpo.innerHTML = html;
  conectar(cuerpo);
}

/* ---------- Resumen ---------- */
function pintarResumen(c) {
  const lista = activos();
  if (!lista.length) { c.innerHTML = '<p class="vacio">Nada que resumir todavía.</p>'; return }

  const filas = lista.map(h => {
    const frec = frecDe(h);
    const n = frec === 'dia' ? 30 : frec === 'semana' ? 12 : 6;
    const actual = periodo(frec, Date.now());
    let hechos = 0, suma = 0, con = 0;
    for (let i = 0; i < n; i++) {
      const p = periodoAtras(frec, actual, i);
      const v = valorDe(h, p);
      if (v > 0) { con++; suma += v }
      if (cumplido(h, p)) hechos++;
    }
    return { h, frec, n, hechos, pct: Math.round((hechos / n) * 100), suma, con,
             racha: racha(h), mejor: mejorRacha(h) };
  });

  const totalRachas = filas.reduce((s,f) => s + f.racha, 0);
  c.innerHTML = `
    <div class="rejilla">
      <div class="mini"><b class="num">${lista.filter(h => cumplido(h)).length}/${lista.length}</b>
        <small>cumplidos ahora mismo</small></div>
      <div class="mini"><b class="num">${Math.round(
        filas.reduce((s,f) => s + f.pct, 0) / filas.length)}%</b>
        <small>constancia media</small></div>
      <div class="mini"><b class="num">${Math.max(...filas.map(f => f.mejor), 0)}</b>
        <small>racha más larga</small></div>
      <div class="mini"><b class="num">${totalRachas}</b>
        <small>periodos en racha ahora</small></div>
    </div>

    ${filas.map(f => {
      const col = f.h.color || PALETA[1];
      const unidad = f.h.tipo === 'crono' ? 'min' : (f.h.unidad || '');
      return `<div class="panel" style="padding:15px">
        <div class="hab-cab" style="margin-bottom:10px">
          <div class="punto" style="background:${col}22;color:${col}">${f.h.emo || '•'}</div>
          <div class="hab-nom"><b>${escapar(f.h.nombre)}</b>
            <small>últimos ${f.n} ${f.frec === 'dia' ? 'días' : f.frec === 'semana' ? 'semanas' : 'meses'}</small></div>
          <div class="imp num">${f.pct}%</div>
        </div>
        <div class="barra"><i style="width:${f.pct}%;background:${col}"></i></div>
        <div class="racha">${f.hechos} de ${f.n} cumplidos${
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
   Hojas de edición
   ========================================================================== */
function hojaValor(h) {
  const frec = frecDe(h);
  abrirHoja(`<h3>${escapar(h.nombre)}</h3>
    <label><span>Valor de est${frec === 'dia' ? 'e día' : frec === 'semana' ? 'a semana' : 'e mes'}${
      h.unidad ? ' en ' + escapar(h.unidad) : ''}</span>
      <input id="vVal" type="number" inputmode="decimal" step="any" min="0" value="${valorDe(h)}"></label>
    <div class="fila"><button id="vCancelar">Cancelar</button>
      <button class="ok" id="vOk">Guardar</button></div>`,
  caja => {
    caja.querySelector('#vVal').select?.();
    caja.querySelector('#vCancelar').onclick = cerrarHoja;
    caja.querySelector('#vOk').onclick = () => {
      fijarValor(h, parseFloat(caja.querySelector('#vVal').value) || 0);
      cerrarHoja(); emitir();
    };
  });
}

export function hojaHabito(h) {
  const nuevo = !h;
  const d = h || { nombre:'', grupo: (seg && !['resumen','archivados'].includes(seg)) ? seg : '',
                   tipo:'sino', frec:'dia', objetivo:'', unidad:'', emo:'•', color:PALETA[1], paso:1 };
  abrirHoja(`
    <h3>${nuevo ? 'Nuevo hábito' : 'Editar hábito'}</h3>
    <label><span>Nombre</span><input id="hNom" maxlength="40" value="${escapar(d.nombre)}"
      placeholder="Leer, entrenar, dormir…"></label>
    <label><span>Grupo (será una pestaña dentro de Hábitos)</span>
      <input id="hGrupo" maxlength="24" list="listaGrupos" value="${escapar(d.grupo)}"
        placeholder="Trabajo, entrenamiento, sueño…">
      <datalist id="listaGrupos">${grupos().map(g => `<option value="${escapar(g)}">`).join('')}</datalist></label>
    <label><span>Emoji</span><input id="hEmo" maxlength="2" value="${escapar(d.emo || '•')}"></label>

    <label><span>Cada cuánto</span></label>
    <div class="opciones" id="hFrecs">${Object.entries(FRECS).map(([id,f]) =>
      `<button data-f="${id}" aria-pressed="${(d.frec||'dia')===id}">${f.nom}</button>`).join('')}</div>

    <label><span>Tipo</span></label>
    <div class="opciones" id="hTipos">${Object.entries(TIPOS).map(([id,t]) =>
      `<button data-t="${id}" aria-pressed="${d.tipo===id}">${t.nom}</button>`).join('')}</div>
    <p class="pieNota" id="hAyuda" style="padding:6px 2px 0">${TIPOS[d.tipo].ayuda}</p>
    <div id="hExtra"></div>

    <label><span>Color</span></label>
    <div class="colores" id="hCol">${PALETA.map(c => `<button data-c="${c}"
      style="background:${c}" aria-pressed="${d.color===c}" aria-label="Color"></button>`).join('')}</div>

    ${nuevo ? '' : `<div class="fila" style="margin-top:18px">
      <button id="hSubir">↑ Subir</button><button id="hBajar">↓ Bajar</button>
      <button id="hArchivar">Archivar</button></div>`}
    <div class="fila">
      ${nuevo ? '' : '<button class="mal" id="hBorrar">Borrar</button>'}
      <button id="hCancelar">Cancelar</button>
      <button class="ok" id="hOk">${nuevo ? 'Crear' : 'Guardar'}</button>
    </div>`,
  caja => {
    let tipo = d.tipo, frec = d.frec || 'dia', color = d.color || PALETA[1];
    const $ = s => caja.querySelector(s);

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
    pintarExtra();

    $('#hFrecs').onclick = e => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      frec = b.dataset.f;
      caja.querySelectorAll('#hFrecs button').forEach(x =>
        x.setAttribute('aria-pressed', x.dataset.f === frec));
      pintarExtra();
    };
    $('#hTipos').onclick = e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      tipo = b.dataset.t;
      caja.querySelectorAll('#hTipos button').forEach(x =>
        x.setAttribute('aria-pressed', x.dataset.t === tipo));
      pintarExtra();
    };
    $('#hCol').onclick = e => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      color = b.dataset.c;
      caja.querySelectorAll('#hCol button').forEach(x =>
        x.setAttribute('aria-pressed', x.dataset.c === color));
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
      const campos = {
        nombre, tipo, frec, color,
        grupo: $('#hGrupo').value.trim() || 'General',
        emo: $('#hEmo').value.trim() || '•',
        objetivo: parseFloat($('#hObj')?.value) || 0,
        unidad: $('#hUni')?.value.trim() || '',
        paso: parseFloat($('#hPaso')?.value) || 1,
      };
      if (nuevo) { anadir('habitos', { ...campos, orden: datos.habitos.length }); avisar('Hábito creado') }
      else {
        /* Cambiar la periodicidad deja los registros anteriores con claves de otro
           periodo: dejan de contar, pero no se pierden si vuelves a la original. */
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
