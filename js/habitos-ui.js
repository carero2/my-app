/* ==========================================================================
   Hábitos: interfaz. Tarjetas, vista del módulo, resumen y hojas de edición.
   El cálculo vive en habitos.js.
   ========================================================================== */
import {
  datos, anadir, actualizar, borrar, restaurar, ajuste, enLote,
  dia, diaSuma, lunes, periodo, periodoAtras, etiquetaPeriodo,
  escapar, avisar, abrirHoja, cerrarHoja, emitir,
} from './nucleo.js';
import {
  TIPOS, FRECS, PALETA, DIAS, RANGOS,
  activos, archivados, grupos, frecDe, clave, colorDe, colorGrupo, fijarColorGrupo,
  toca, esObjetivo, cuentaHoy, valorDe, cumplido, racha, fijarValor,
  cronoActivo, arrancarCrono, pararCrono, minutosCrono, reloj,
  redondo, acumulado, calcularResumen,
} from './habitos.js';

/* Refresca los relojes en pantalla mientras haya un cronómetro en marcha. */
setInterval(() => {
  const c = cronoActivo();
  if (!c) return;
  const h = datos.habitos.find(x => x.id === c.hab);
  if (!h) return;
  const total = valorDe(h) + minutosCrono(h);
  document.querySelectorAll(`[data-reloj="${h.id}"]`).forEach(el => el.textContent = reloj(total));
  document.querySelectorAll(`[data-progreso="${h.id}"]`).forEach(el =>
    el.style.width = Math.min(total / (h.objetivo || total || 1), 1) * 100 + '%');
}, 1000);

/* ==========================================================================
   Tarjeta
   ========================================================================== */
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
  /* En un día libre la tarjeta se atenúa, pero el control sigue activo:
     una sesión fuera de plan debe poder registrarse. */
  const sub = [
    frec === 'dia' ? diasTexto(h) : FRECS[frec].corto,
    obj ? 'objetivo ' + (h.tipo === 'crono' ? obj + ' min' : obj + ' ' + (h.unidad || '')) : '',
    esObjetivo(h) ? '' : 'solo seguimiento',
  ].filter(Boolean).join(' · ');

  return `<div class="hab ${hecho ? 'hecho' : ''} ${hoyToca ? '' : 'descanso'}" data-hab="${h.id}">
    <div class="hab-cab">
      <div class="punto" style="background:${col}22;color:${col}">${h.emo || '•'}</div>
      <div class="hab-nom" data-acc="editar" data-h="${h.id}">
        <b>${escapar(h.nombre)}</b>
        ${sub ? `<small>${escapar(sub)}</small>` : ''}
      </div>
      ${hoyToca ? '' : '<span class="hoyNo">libre</span>'}
      ${control}
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
  const ahora = periodo(frec, Date.now());
  const celda = (p, etq, futuro) => {
    const off = !futuro && !toca(h, p);
    const pct = futuro ? 0 : relleno(p);
    return `<div data-p="${p}" data-h="${h.id}" class="${p === ahora ? 'ahora' : ''}">
      <i class="${futuro ? 'futuro' : ''} ${off && !pct ? 'apagado' : ''}"
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

function pintarResumen(c) {
  if (!activos().length) { c.innerHTML = '<p class="vacio">Nada que resumir todavía.</p>'; return }
  const r = calcularResumen(resSeg);
  const R = RANGOS[resSeg];
  const rotulo = resSeg === 'ano'
    ? String(new Date().getFullYear())
    : `${R.ini().toLocaleDateString('es-ES',{day:'numeric',month:'short'})} – ` +
      `${R.fin().toLocaleDateString('es-ES',{day:'numeric',month:'short'})}`;

  const logros = [...r.filas, ...r.seguimiento]
    .filter(f => f.h.tipo !== 'sino' && f.suma > 0)
    .sort((a,b) => b.suma - a.suma);

  c.innerHTML = `
    <div class="opciones" id="resSegs" style="margin-top:4px">
      ${Object.entries(RANGOS).map(([id,x]) =>
        `<button data-r="${id}" aria-pressed="${resSeg===id}">${x.nom}</button>`).join('')}
    </div>

    <div class="panel">
      <div class="subtitulo" style="padding:0 0 6px">${rotulo}</div>
      <div class="granCifra num">${r.pct === null ? '—' : r.pct + '%'}</div>
      <div class="delta">${r.deb
        ? `${r.hec} de ${r.deb} cumplidos de lo que tocaba ${R.etq}`
        : 'Todavía no tocaba nada en este periodo'}</div>
      ${r.deb ? `<div class="barra" style="margin-top:12px">
        <i style="width:${r.pct}%"></i></div>` : ''}
    </div>

    <div class="rejilla">
      <div class="mini"><b class="num">${r.hec}</b><small>cumplidos</small></div>
      <div class="mini"><b class="num">${Math.max(0, r.deb - r.hec)}</b>
        <small>${r.deb - r.hec === 1 ? 'te queda' : 'te quedan'} por cumplir</small></div>
      <div class="mini"><b class="num">${r.completos}</b><small>hábitos al 100%</small></div>
      <div class="mini"><b class="num">${r.extras ? '+' + r.extras : '0'}</b>
        <small>sesiones fuera de plan</small></div>
    </div>
    ${r.fuera ? `<p class="pieNota">${r.fuera} hábito${r.fuera === 1 ? '' : 's'} de periodo más
      largo que esta ventana; ${r.fuera === 1 ? 'aparece' : 'aparecen'} en Mes o en Año.</p>` : ''}

    ${logros.length ? `<div class="etiqueta">Acumulado ${R.etq}</div>
      ${logros.map(f => `<div class="logro" style="border-left-color:${colorDe(f.h)}">
        <span class="logroEmo">${f.h.emo || '•'}</span>
        <span>${escapar(f.h.nombre)}</span>
        <b class="num">${escapar(acumulado(f.h, f.suma))}</b></div>`).join('')}` : ''}

    <div class="etiqueta">Por hábito</div>
    ${r.filas.length ? r.filas.slice().sort((a,b) => (b.pct ?? -1) - (a.pct ?? -1)).map(f => {
      const col = colorDe(f.h);
      return `<div class="panel" style="padding:14px 15px">
        <div class="hab-cab" style="margin-bottom:9px">
          <div class="punto" style="background:${col}22;color:${col}">${f.h.emo || '•'}</div>
          <div class="hab-nom"><b>${escapar(f.h.nombre)}</b>
            <small>${f.debidos ? `${f.hechos} de ${f.debidos}` : 'sin periodos que cumplir'}${
              f.extras ? ` · +${f.extras} extra` : ''}</small></div>
          <div class="imp num">${f.pct === null ? '—' : f.pct + '%'}</div>
        </div>
        <div class="barra"><i style="width:${f.pct ?? 0}%;background:${col}"></i></div>
      </div>`;
    }).join('') : '<p class="vacio">Nada registrado en este periodo.</p>'}

    ${r.seguimiento.length ? `<div class="etiqueta">Solo seguimiento</div>
      <p class="pieNota" style="padding:0 4px 4px">Se registran pero no son objetivos,
        así que no cuentan en ningún porcentaje.</p>
      ${r.seguimiento.map(f => {
        const col = colorDe(f.h);
        return `<div class="panel" style="padding:14px 15px">
          <div class="hab-cab">
            <div class="punto" style="background:${col}22;color:${col}">${f.h.emo || '•'}</div>
            <div class="hab-nom"><b>${escapar(f.h.nombre)}</b>
              <small>${f.veces} ${f.veces === 1 ? 'registro' : 'registros'} ${RANGOS[resSeg].etq}</small></div>
            <div class="imp num">${f.h.tipo === 'sino' ? f.veces : escapar(acumulado(f.h, f.suma))}</div>
          </div></div>`;
      }).join('')}` : ''}`;

  c.querySelector('#resSegs').onclick = e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    resSeg = b.dataset.r; pintarResumen(c);
  };
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
      $('#hDias').innerHTML = (frec !== 'dia' ? '' : `
        <label><span>Días en los que cuenta</span></label>
        <div class="opciones dias" id="hDiasBtns">${DIAS.map(([n,l]) =>
          `<button data-d="${n}" aria-pressed="${!dias.length || dias.includes(n)}">${l}</button>`).join('')}</div>
        <p class="pieNota" style="padding:6px 2px 0">Los días que no marques se saltan:
          no rompen la racha ni cuentan en el progreso del día.</p>`) + `
        <label style="margin-top:14px"><span>¿Es un objetivo?</span></label>
        <div class="opciones" id="hCuenta">
          <button data-c="1" aria-pressed="${cuenta}">Objetivo a cumplir</button>
          <button data-c="0" aria-pressed="${!cuenta}">Solo llevar la cuenta</button></div>
        <p class="pieNota" style="padding:6px 2px 0">${cuenta
          ? 'Cuenta en los porcentajes y genera racha.'
          : 'Se registra y se acumula, pero nunca aparece como cumplido ni entra en ningún porcentaje.'}</p>`;
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
      if (bc) { cuenta = bc.dataset.c === '1'; pintarDias() }
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
      let it;
      enLote(() => { it = borrar('habitos', h.id); regs.forEach(r => borrar('registros', r.id)) });
      cerrarHoja(); emitir();
      avisar('Hábito borrado', { texto:'Deshacer', alPulsar: () => {
        enLote(() => { restaurar('habitos', it); regs.forEach(r => restaurar('registros', r)) });
        emitir();
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
        cuenta,
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
  enLote(() => {
    lista.forEach((x, k) => { if ((x.orden ?? 0) !== k) actualizar('habitos', x.id, { orden: k }) });
    actualizar('habitos', lista[i].id, { orden: j });
    actualizar('habitos', lista[j].id, { orden: i });
  });
  cerrarHoja(); emitir();
}
