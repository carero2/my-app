/* ==========================================================================
   Inversiones: interfaz. El cálculo vive en inversiones.js.
   ========================================================================== */
import {
  datos, anadir, actualizar, borrar, enLote, nube,
  eur, eur0, dia, desdeDia, escapar, avisar, emitir, vacio,
  abrirHoja, cerrarHoja, confirmar,
} from './nucleo.js';
import {
  MODOS, PALETA_INV, carteras, cartera, modoDe,
  aportes, valoraciones, posicionesDe, invertido,
  vlDe, navEurDe, vlPedido, refrescarPrecios, valorPorPosiciones, anotarValor,
  leerPosiciones,
  valorActual, ultimoValor, fechaValor, rentabilidad, serie, reparto, desfase,
  crearCartera, borrarCartera,
} from './inversiones.js';

let sel = null;        // cartera que se está mirando
let cargando = false;  // hay una petición de precios en vuelo

export function pintar(vista) {
  const cs = carteras();
  if (sel && !cs.some(c => c.id === sel)) sel = null;
  if (!sel && cs.length) sel = cs[0].id;

  vista.innerHTML = `<div class="scroll">
    <div class="titulo">Inversión</div>
    ${cs.length > 1 ? `<div class="segmentos envuelve">
      ${cs.map(c => `<button class="seg" data-c="${c.id}" aria-pressed="${sel === c.id}"
        style="${sel === c.id ? `background:${c.color};border-color:transparent;color:#fff`
          : `border-color:${c.color}66`}"><i class="pinta" style="background:${c.color}"></i>${
          escapar(c.nom)}</button>`).join('')}
    </div>` : ''}
    <div id="invCuerpo"></div>
  </div>`;

  vista.querySelector('.segmentos')?.addEventListener('click', e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    sel = b.dataset.c; pintar(vista);
  });

  const cuerpo = vista.querySelector('#invCuerpo');
  if (!cs.length) {
    cuerpo.innerHTML = vacio({
      titulo: 'Aún no sigues ninguna inversión',
      cuerpo: 'Apunta lo que vas aportando y cuánto vale. Puedes dejar que los precios '
            + 'se busquen solos por ISIN, anotar el valor a mano, o simplemente estimarlo '
            + 'a un interés anual.',
      accion: 'Crear mi primera cartera',
    });
    cuerpo.querySelector('[data-vacio]').onclick = () => hojaCartera(null, vista);
    return;
  }
  pintarCartera(cuerpo, vista);
}

function pintarCartera(c, vista) {
  const inv = cartera(sel);
  const modo = modoDe(inv);
  const puesto = invertido(sel);
  const valor = valorActual(sel);
  const plus = valor === null ? null : Math.round((valor - puesto) * 100) / 100;
  const pctPlus = (plus === null || !puesto) ? null : Math.round((plus / puesto) * 1000) / 10;
  const tirAnual = rentabilidad(sel);
  const fecha = fechaValor(sel);
  const ap = aportes(sel);
  const pts = serie(sel);

  /* Aportación media al mes: ayuda a saber si el ritmo es el que creías. */
  const meses = ap.length
    ? Math.max(1, (Date.now() - Math.min(...ap.map(m => m.t))) / (30.44 * 86400000)) : 0;
  const alMes = meses ? puesto / meses : 0;

  c.innerHTML = `
    <div class="panel">
      <div class="subtitulo" style="padding:0 0 6px">${escapar(inv.nom)} · ${
        MODOS[modo].nom.toLowerCase()}</div>
      <div class="granCifra num ${plus !== null && plus < 0 ? 'rojo' : ''}">${
        valor === null ? '—' : eur(valor)}</div>
      ${plus !== null ? `<div class="delta">${plus >= 0 ? '▲ ' : '▼ '}<span class="num">${
        eur(Math.abs(plus))}</span>${pctPlus === null ? '' : ` · ${plus >= 0 ? '+' : '−'}${
        Math.abs(pctPlus)}%`} sobre lo aportado</div>` : ''}
      ${valor === null ? `<div class="delta">Sin valor todavía. ${
        modo === 'auto' ? 'Añade tus fondos y actualiza los precios.'
        : modo === 'manual' ? 'Anota cuánto vale hoy.' : 'Añade una aportación.'}</div>` : ''}
      ${fecha ? `<div class="delta">Valorado a ${desdeDia(fecha)
        .toLocaleDateString('es-ES', { day:'numeric', month:'long' })}${
        modo === 'estimado' ? ' · proyección, no es dinero real' : ''}</div>` : ''}
    </div>

    ${(() => {
      const d = desfase(sel); if (!d) return '';
      return `<div class="calTot extra" style="border-color:var(--aviso)">
        <span>Faltan ${d.n} aportacion${d.n === 1 ? '' : 'es'} por reflejar:
          el valor se queda corto</span>
        <b class="num">≈ ${eur(d.importe)}</b>
      </div>
      <p class="estado">Los títulos guardados son los del extracto del ${
        new Date(d.desde).toLocaleDateString('es-ES', { day:'numeric', month:'long' })}.
        Vuelve a pegar la tabla de tu banco para ponerlos al día.</p>`;
    })()}

    <div class="rejilla">
      <div class="mini"><b class="num">${eur0(puesto)}</b><small>aportado en total</small></div>
      <div class="mini"><b class="num">${tirAnual === null ? '—' : (tirAnual > 0 ? '+' : '')
        + tirAnual + '%'}</b><small>anual (TIR)</small></div>
      <div class="mini"><b class="num">${eur0(alMes)}</b><small>de media al mes</small></div>
      <div class="mini"><b class="num">${ap.length}</b><small>aportacion${
        ap.length === 1 ? '' : 'es'}</small></div>
    </div>

    ${pts.length > 1 ? `<div class="panel">
      <div class="rotulo">Aportado y valor</div>
      ${grafica(pts, inv.color)}
      <div class="calPie">
        <span><i class="lleno" style="background:${inv.color}"></i>Lo que vale</span>
        <span><i style="background:var(--hueco);border-color:transparent"></i>Lo que has puesto</span>
      </div>
    </div>` : ''}

    ${modo === 'auto' ? bloquePosiciones(inv) : ''}
    ${modo === 'manual' ? bloqueManual(inv) : ''}
    ${modo === 'estimado' ? `<div class="panel">
      <div class="rotulo" style="margin-top:0">Estimación al ${inv.pct ?? 0}% anual</div>
      <p class="pieNota" style="padding:4px 0 0">Esto no es lo que vale tu cartera: es lo que
        valdría si cada aportación hubiera crecido a ese interés desde el día que la hiciste.
        Para ver el dinero de verdad, cambia el modo en los ajustes de la cartera.</p>
    </div>` : ''}

    <div class="rotulo">Aportaciones</div>
    ${ap.length ? `<ul class="filas">${ap.slice().reverse().slice(0, 8).map(m => `
      <li data-ap="${m.id}">
        <span class="punto" style="background:${inv.color}22;color:${inv.color}">${
          m.c >= 0 ? '↑' : '↓'}</span>
        <span class="txt"><b>${m.c >= 0 ? 'Aportación' : 'Reembolso'}</b>
          <small>${new Date(m.t).toLocaleDateString('es-ES',
            { day:'numeric', month:'short', year:'numeric' }).replace('.', '')}</small></span>
        <span class="imp num ${m.c >= 0 ? '' : 'rojo'}">${eur(Math.abs(m.c))}</span>
        <button class="borrar" data-quitar="${m.id}" aria-label="Borrar esta aportación"
          data-tip="Borrar">✕</button>
      </li>`).join('')}</ul>
      ${ap.length > 8 ? `<p class="estado">Se enseñan las 8 últimas de ${ap.length}.</p>` : ''}`
    : vacio({ titulo: 'Sin aportaciones', cuerpo: 'Apunta lo que metes y cuándo: es la mitad '
        + 'de la cuenta, y sin ello no se puede saber cuánto has ganado.',
        accion: 'Añadir la primera' })}

    <div class="acciones" style="margin-top:18px">
      <button class="accion" id="invAporte">Añadir aportación</button>
      ${modo === 'manual' ? '<button class="accion" id="invValor">Anotar valor</button>' : ''}
      ${modo === 'auto' ? `<button class="accion" id="invPrecios" ${cargando ? 'disabled' : ''}>${
        cargando ? 'Buscando…' : 'Actualizar precios'}</button>` : ''}
      <button class="accion nuevo" id="invCfg">Ajustes</button>
    </div>`;

  const $ = s => c.querySelector(s);
  $('#invAporte').onclick = () => hojaAporte(null, vista);
  /* Hay dos estados vacíos posibles: el de fondos (modo auto) y el de
     aportaciones. Cada uno abre lo suyo. */
  c.querySelectorAll('[data-vacio]').forEach(b => {
    const deFondos = !!b.closest('.vacio')?.previousElementSibling?.textContent?.includes('Fondos')
      || /extracto/i.test(b.textContent);
    b.onclick = () => deFondos ? hojaImportar(vista) : hojaAporte(null, vista);
  });
  $('#invValor')?.addEventListener('click', () => hojaValorManual(vista));
  $('#invPrecios')?.addEventListener('click', () => actualizar2(vista));
  $('#invCfg').onclick = () => hojaCartera(inv, vista);
  $('#invPos')?.addEventListener('click', () => hojaPosicion(null, vista));
  $('#invImport')?.addEventListener('click', () => hojaImportar(vista));
  c.onclick = e => {
    const q = e.target.closest('[data-quitar]');
    if (q) { quitarAporte(q.dataset.quitar, vista); return }
    const p = e.target.closest('[data-pos]');
    if (p) hojaPosicion(datos.posiciones.find(x => x.id === p.dataset.pos), vista);
  };
}

/* ---------- Bloques propios de cada modo ---------- */
function bloquePosiciones(inv) {
  const pos = posicionesDe(inv.id);
  if (!pos.length) {
    return `<div class="rotulo">Fondos</div>${vacio({
      titulo: 'Sin fondos todavía',
      cuerpo: 'Lo más rápido es copiar la tabla de posiciones de tu banco y pegarla: '
            + 'de ahí salen los ISIN y los títulos sin teclear nada.',
      accion: 'Pegar el extracto' })}
    <div class="acciones"><button class="accion nuevo" id="invPos">Añadir uno a mano</button></div>`;
  }
  const rep = reparto(inv.id);
  const sinPrecio = pos.filter(p => !vlDe(p.isin)?.nav);
  const fuente = pos.map(p => vlDe(p.isin)?.fuente).find(Boolean);
  return `<div class="rotulo">Fondos</div>
    ${(rep.length ? rep : pos.map(p => ({ ...p, valor: null, pct: null }))).map(p => {
      const v = vlDe(p.isin);
      return `<div class="filaCat2" data-pos="${p.id}">
        <span class="txt"><b>${escapar(p.nom || v?.nom || p.isin)}</b>
          <small>${escapar(p.isin)} · ${(p.part || 0).toLocaleString('es-ES',
            { maximumFractionDigits: 4 })} part.${
            v?.nav ? ` · ${v.nav.toLocaleString('es-ES', { minimumFractionDigits: 2,
              maximumFractionDigits: 4 })} ${v.moneda || 'EUR'}${
              (v.moneda || 'EUR') !== 'EUR' && v.navEur
                ? ` → ${v.navEur.toLocaleString('es-ES', { minimumFractionDigits: 2,
                    maximumFractionDigits: 4 })} €` : ''}`
            : ' · sin precio'}</small></span>
        ${p.valor === null ? '' : `<span class="txt" style="flex:none;text-align:right">
          <b class="num">${eur0(p.valor)}</b><small>${p.pct}%</small></span>`}
      </div>`;
    }).join('')}
    ${sinPrecio.length ? `<p class="estado rojo">Sin precio ${
      sinPrecio.length === 1 ? 'un fondo' : sinPrecio.length + ' fondos'}: ${
      sinPrecio.map(p => escapar(p.isin)).join(', ')}. ${
      !nube ? 'Los precios los busca tu Worker, y la sincronización está sin configurar.'
            : 'Pulsa «Actualizar precios»; si sigue igual, revisa el ISIN.'}</p>` : ''}
    ${fuente ? `<p class="estado">Valores liquidativos de ${escapar(fuente)}, a través de tu
      Worker. Se guardan en el móvil para poder mirar la cartera sin cobertura.</p>` : ''}
    <div class="acciones">
      <button class="accion" id="invImport">Pegar extracto</button>
      <button class="accion nuevo" id="invPos">Añadir fondo</button></div>`;
}

function bloqueManual(inv) {
  const vs = valoraciones(inv.id);
  if (!vs.length) return '';
  return `<div class="rotulo">Valores anotados</div>
    <ul class="filas">${vs.slice().reverse().slice(0, 5).map(m => `<li>
      <span class="txt"><b class="num">${eur(m.c)}</b>
        <small>${new Date(m.t).toLocaleDateString('es-ES',
          { day:'numeric', month:'short', year:'numeric' }).replace('.', '')}</small></span>
    </li>`).join('')}</ul>`;
}

/* ---------- Gráfica de dos líneas ----------
   Lo aportado es un escalón que solo sube; el valor va por encima o por debajo.
   La distancia entre las dos es la plusvalía, que es lo que se quiere leer. */
function grafica(pts, color) {
  const vals = pts.flatMap(p => [p.puesto, p.vale]).filter(v => v !== null && isFinite(v));
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0);
  const rango = max - min || 1;
  const x = i => (i / Math.max(1, pts.length - 1)) * 100;
  const y = v => 100 - ((v - min) / rango) * 92 - 4;

  const linea = campo => pts.map((p, i) => p[campo] === null ? null : `${x(i)},${y(p[campo])}`)
    .filter(Boolean).join(' ');
  const areaPuesto = `0,100 ${linea('puesto')} 100,100`;

  return `<svg class="graf" viewBox="0 0 100 100" preserveAspectRatio="none"
      role="img" aria-label="Evolución de lo aportado y del valor">
    <polygon points="${areaPuesto}" fill="var(--hueco)"></polygon>
    <polyline points="${linea('puesto')}" fill="none" stroke="var(--muted)" stroke-width="1.5"
      vector-effect="non-scaling-stroke" stroke-linejoin="round"></polyline>
    <polyline points="${linea('vale')}" fill="none" stroke="${color}" stroke-width="2.5"
      vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"></polyline>
  </svg>
  <div class="ejeX">${[0, Math.floor(pts.length / 3), Math.floor(2 * pts.length / 3),
    pts.length - 1].filter((v, i, a) => a.indexOf(v) === i)
    .map(i => `<span>${escapar(pts[i].etq)}</span>`).join('')}</div>`;
}

/* ---------- Actualizar precios ---------- */
async function actualizar2(vista) {
  if (cargando) return;
  if (!nube) return avisar('Configura primero la sincronización: los precios los busca tu Worker');
  cargando = true; pintar(vista);
  const r = await refrescarPrecios(sel);
  cargando = false;
  if (r.ok) {
    emitir();
    avisar(r.fallidos.length ? `Faltan ${r.fallidos.length} por valorar` : 'Precios al día');
  } else {
    avisar(r.motivo === 'sin-nube' ? 'Hace falta la sincronización configurada'
      : r.motivo === 'sin-isin' ? 'Añade antes algún fondo con su ISIN'
      : r.motivo === 'tiempo' ? 'El Worker ha tardado demasiado; inténtalo de nuevo'
      : 'No se han podido traer los precios');
  }
  pintar(vista);
}

/* ---------- Hojas ---------- */
function hojaAporte(m, vista) {
  const nuevo = !m;
  abrirHoja(`<h3>${nuevo ? 'Añadir aportación' : 'Editar aportación'}</h3>
    <label><span>Importe</span>
      <input id="apC" type="number" inputmode="decimal" step="any" value="${m?.c ?? ''}"
        placeholder="250" autofocus>
      <small class="pega" id="apMal"></small></label>
    <label><span>Fecha</span>
      <input id="apT" type="date" max="${dia()}" value="${dia(m?.t || Date.now())}"></label>
    <p class="pieNota" style="padding:10px 0 0">Para un reembolso, pon el importe en negativo.</p>
    <div class="fila"><button id="apNo">Cancelar</button>
      <button class="ok" id="apOk">${nuevo ? 'Añadir' : 'Guardar'}</button></div>`,
  caja => {
    const $ = s => caja.querySelector(s);
    $('#apC').addEventListener('blur', e => {
      const v = parseFloat(e.target.value);
      const mal = e.target.value !== '' && (!isFinite(v) || v === 0);
      e.target.classList.toggle('mal-dato', mal);
      $('#apMal').textContent = mal ? 'Pon una cantidad distinta de cero.' : '';
    });
    $('#apC').addEventListener('input', e => {
      e.target.classList.remove('mal-dato'); $('#apMal').textContent = '';
    });
    $('#apNo').onclick = cerrarHoja;
    $('#apOk').onclick = () => {
      const c = parseFloat($('#apC').value);
      if (!isFinite(c) || c === 0) {
        $('#apC').classList.add('mal-dato');
        $('#apMal').textContent = 'Pon una cantidad distinta de cero.';
        return $('#apC').focus();
      }
      const t = desdeDia($('#apT').value).getTime();
      if (nuevo) anadir('invmov', { inv: sel, tipo: 'aporte', c, t });
      else actualizar('invmov', m.id, { c, t });
      cerrarHoja(); emitir(); pintar(vista);
      avisar(nuevo ? `Aportación de ${eur(Math.abs(c))}` : 'Aportación actualizada');
    };
  });
}

async function quitarAporte(id, vista) {
  const m = datos.invmov.find(x => x.id === id); if (!m) return;
  if (!await confirmar({
    titulo: `Borrar la aportación de ${eur(Math.abs(m.c))}`,
    cuerpo: `Del ${new Date(m.t).toLocaleDateString('es-ES',
      { day:'numeric', month:'long', year:'numeric' })}. La rentabilidad se recalculará sin ella.`,
    si: 'Borrar', no: 'Cancelar',
  })) return;
  borrar('invmov', id); emitir(); pintar(vista);
  avisar('Aportación borrada');
}

function hojaValorManual(vista) {
  const ultimo = ultimoValor(sel);
  abrirHoja(`<h3>Anotar valor</h3>
    <p>Pon lo que dice tu banco hoy. Cada día guarda un solo apunte: si ya has
       anotado hoy, este lo corrige.</p>
    <label><span>Valor total de la cartera</span>
      <input id="vmC" type="number" inputmode="decimal" step="any" min="0"
        value="${ultimo ?? ''}" placeholder="0" autofocus>
      <small class="pega" id="vmMal"></small></label>
    <label><span>Fecha</span>
      <input id="vmT" type="date" max="${dia()}" value="${dia()}"></label>
    <div class="fila"><button id="vmNo">Cancelar</button>
      <button class="ok" id="vmOk">Guardar</button></div>`,
  caja => {
    const $ = s => caja.querySelector(s);
    $('#vmC').addEventListener('blur', e => {
      const v = parseFloat(e.target.value);
      const mal = e.target.value !== '' && (!isFinite(v) || v < 0);
      e.target.classList.toggle('mal-dato', mal);
      $('#vmMal').textContent = mal ? 'Pon un valor de cero o más.' : '';
    });
    $('#vmC').addEventListener('input', e => {
      e.target.classList.remove('mal-dato'); $('#vmMal').textContent = '';
    });
    $('#vmNo').onclick = cerrarHoja;
    $('#vmOk').onclick = () => {
      const v = parseFloat($('#vmC').value);
      if (!isFinite(v) || v < 0) {
        $('#vmC').classList.add('mal-dato');
        $('#vmMal').textContent = 'Pon un valor de cero o más.';
        return $('#vmC').focus();
      }
      anotarValor(sel, v, desdeDia($('#vmT').value).getTime());
      cerrarHoja(); emitir(); pintar(vista);
      avisar('Valor anotado');
    };
  });
}

function hojaPosicion(p, vista) {
  const nuevo = !p;
  abrirHoja(`<h3>${nuevo ? 'Añadir fondo' : escapar(p.nom || p.isin)}</h3>
    <label><span>ISIN o ticker</span>
      <input id="poI" maxlength="12" value="${escapar(p?.isin || '')}"
        placeholder="El ISIN de un fondo, o el ticker de una acción"
        autocapitalize="characters" spellcheck="false">
      <small class="pega" id="poMal"></small></label>
    <label><span>Participaciones o acciones</span>
      <input id="poP" type="number" inputmode="decimal" step="any" min="0"
        value="${p?.part ?? ''}" placeholder="12,3456"></label>
    <label><span>Nombre (opcional)</span>
      <input id="poN" maxlength="80" value="${escapar(p?.nom || '')}"
        placeholder="Se rellena solo al buscar el precio"></label>
    ${nuevo ? `<p class="pieNota" style="padding:14px 0 0">Si tienes varias posiciones, sale
      más a cuenta pegar la tabla de tu bróker de una vez que añadirlas una a una.</p>
      <div class="opciones"><button id="poPegar">Pegar la tabla</button></div>` : ''}
    <div class="fila">
      ${nuevo ? '' : '<button class="mal" id="poDel">Quitar</button>'}
      <button id="poNo">Cancelar</button>
      <button class="ok" id="poOk">${nuevo ? 'Añadir' : 'Guardar'}</button></div>`,
  caja => {
    const $ = s => caja.querySelector(s);
    /* Vale un ISIN de fondo o el ticker de una acción o un ETF. */
    const valido = x => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(x)
      || (/^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(x) && /[A-Z]/.test(x));
    $('#poI').addEventListener('blur', e => {
      const v = e.target.value.trim().toUpperCase();
      e.target.value = v;
      const mal = v && !valido(v);
      e.target.classList.toggle('mal-dato', mal);
      $('#poMal').textContent = mal
        ? 'Pon el ISIN de un fondo (12 caracteres) o el ticker de una acción o un ETF.' : '';
    });
    $('#poI').addEventListener('input', e => {
      e.target.classList.remove('mal-dato'); $('#poMal').textContent = '';
    });
    $('#poPegar')?.addEventListener('click', () => { cerrarHoja(); hojaImportar(vista) });
    $('#poDel')?.addEventListener('click', async () => {
      if (!await confirmar({
        titulo: `Quitar ${p.nom || p.isin} de la cartera`,
        cuerpo: 'Dejará de contar en el valor. Las aportaciones no se tocan.',
        si: 'Quitar', no: 'Cancelar',
      })) return;
      borrar('posiciones', p.id); cerrarHoja(); emitir(); pintar(vista);
      avisar('Fondo quitado');
    });
    $('#poNo').onclick = cerrarHoja;
    $('#poOk').onclick = () => {
      const isin = $('#poI').value.trim().toUpperCase();
      if (!valido(isin)) {
        $('#poI').classList.add('mal-dato');
        $('#poMal').textContent =
          'Pon el ISIN de un fondo (12 caracteres) o el ticker de una acción o un ETF.';
        return $('#poI').focus();
      }
      const campos = { isin, part: parseFloat($('#poP').value) || 0, nom: $('#poN').value.trim() };
      if (nuevo) anadir('posiciones', { inv: sel, ...campos });
      else actualizar('posiciones', p.id, campos);
      cerrarHoja(); emitir(); pintar(vista);
      avisar(nuevo ? 'Fondo añadido' : 'Fondo actualizado');
    };
  });
}

/* ---------- Importar el extracto ----------
   Teclear nueve números cada vez que aportas es lo que hace que una cartera
   deje de estar al día. Pegar la tabla del banco cuesta diez segundos. */
function hojaImportar(vista) {
  abrirHoja(`<h3>Pegar extracto</h3>
    <p>Copia la tabla de posiciones de tu banco y pégala aquí entera, con
       cabeceras y todo. Se buscan los ISIN y los títulos; lo demás se ignora.</p>
    <label><span>Tabla de posiciones</span>
      <textarea id="imTxt" placeholder="IE00BYX5MX67  S&P 500 INDEX P ACC EUR  EUR  175.529  2.953,7100 €"
        style="min-height:150px" autofocus></textarea></label>
    <div id="imPrevia"></div>
    <div class="fila"><button id="imNo">Cancelar</button>
      <button class="ok" id="imOk" disabled>Importar</button></div>`,
  caja => {
    const $ = x => caja.querySelector(x);
    let filas = [];
    const mirar = () => {
      filas = leerPosiciones($('#imTxt').value).filter(f => f.part !== null);
      const ok = filas.length > 0;
      $('#imOk').disabled = !ok;
      if (!$('#imTxt').value.trim()) { $('#imPrevia').innerHTML = ''; return }
      if (!ok) {
        $('#imPrevia').innerHTML = `<p class="estado rojo">No se reconoce ningún fondo.
          Hace falta que cada línea lleve su ISIN y el número de títulos.</p>`;
        return;
      }
      const suma = filas.reduce((s, f) => s + (f.valor || 0), 0);
      const ya = posicionesDe(sel).map(x => x.isin);
      const nuevos = filas.filter(f => !ya.includes(f.isin)).length;
      $('#imPrevia').innerHTML = `
        <div class="calTot" style="margin-top:16px">
          <span>${filas.length} fondo${filas.length === 1 ? '' : 's'} reconocido${
            filas.length === 1 ? '' : 's'}${nuevos ? ` · ${nuevos} nuevo${
            nuevos === 1 ? '' : 's'}` : ''}</span>
          ${suma ? `<b class="num">${eur(suma)}</b>` : ''}</div>
        <ul class="filas">${filas.slice(0, 12).map(f => `<li>
          <span class="txt"><b>${escapar(f.nom || f.isin)}</b>
            <small>${escapar(f.isin)} · ${f.part.toLocaleString('es-ES',
              { maximumFractionDigits: 6 })} part.</small></span>
          ${f.valor ? `<span class="imp num">${eur(f.valor)}</span>` : ''}
        </li>`).join('')}</ul>
        ${suma ? `<p class="pieNota" style="padding:10px 0 0">Se anotará también ese total
          como valor de hoy, así la gráfica tiene un punto aunque falle algún precio.</p>` : ''}`;
    };
    $('#imTxt').addEventListener('input', mirar);
    $('#imNo').onclick = cerrarHoja;
    $('#imOk').onclick = () => {
      const ya = posicionesDe(sel);
      const suma = filas.reduce((s, f) => s + (f.valor || 0), 0);
      enLote(() => {
        for (const f of filas) {
          const antes = ya.find(p => p.isin === f.isin);
          /* La fecha se refresca también al actualizar: marca cuándo se
             confirmaron estos títulos, que es lo que mira el aviso de desfase. */
          if (antes) actualizar('posiciones', antes.id,
            { part: f.part, nom: antes.nom || f.nom, t: Date.now() });
          else anadir('posiciones', { inv: sel, isin: f.isin, part: f.part, nom: f.nom });
        }
        /* Lo que ya no aparece en el extracto es que se ha vendido. */
        const vistos = filas.map(f => f.isin);
        ya.filter(p => !vistos.includes(p.isin)).forEach(p => borrar('posiciones', p.id));
        if (suma) anotarValor(sel, Math.round(suma * 100) / 100);
      });
      cerrarHoja(); emitir(); pintar(vista);
      avisar(`${filas.length} fondos actualizados`);
    };
    mirar();
  });
}

function hojaCartera(inv, vista) {
  const nuevo = !inv;
  const modo = nuevo ? 'manual' : modoDe(inv);
  abrirHoja(`<h3>${nuevo ? 'Nueva cartera' : 'Ajustes de la cartera'}</h3>
    <label><span>Nombre</span>
      <input id="caN" maxlength="40" value="${escapar(inv?.nom || '')}"
        placeholder="Cartera indexada, plan de pensiones…"></label>

    <label style="margin-top:20px"><span>Cómo se sabe lo que vale</span></label>
    <div class="opciones" id="caModo">
      ${Object.entries(MODOS).map(([id, m]) =>
        `<button data-m="${id}" aria-pressed="${modo === id}">${m.nom}</button>`).join('')}
    </div>
    <p class="pieNota" id="caAyuda" style="padding:8px 0 0">${MODOS[modo].ayuda}.</p>

    <label id="caCampoPct" class="${modo === 'estimado' ? '' : 'oculto'}">
      <span>Interés anual estimado (%)</span>
      <input id="caPct" type="number" inputmode="decimal" step="any"
        value="${inv?.pct ?? 8}" placeholder="8"></label>

    <label style="margin-top:20px"><span>Color</span></label>
    <div class="colores" id="caCol">
      ${PALETA_INV.map(x => `<button data-col="${x}" style="background:${x}"
        aria-pressed="${(inv?.color || PALETA_INV[0]) === x}"
        aria-label="Usar el color ${x}"></button>`).join('')}
    </div>

    <div class="fila">
      ${nuevo ? '' : '<button class="mal" id="caDel">Borrar</button>'}
      <button id="caNo">Cancelar</button>
      <button class="ok" id="caOk">${nuevo ? 'Crear' : 'Guardar'}</button></div>`,
  caja => {
    const $ = s => caja.querySelector(s);
    let mSel = modo, cSel = inv?.color || PALETA_INV[0];
    $('#caModo').onclick = e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      mSel = b.dataset.m;
      caja.querySelectorAll('#caModo button').forEach(x =>
        x.setAttribute('aria-pressed', x.dataset.m === mSel));
      $('#caAyuda').textContent = MODOS[mSel].ayuda + '.';
      $('#caCampoPct').classList.toggle('oculto', mSel !== 'estimado');
    };
    $('#caCol').onclick = e => {
      const b = e.target.closest('[data-col]'); if (!b) return;
      cSel = b.dataset.col;
      caja.querySelectorAll('#caCol button').forEach(x =>
        x.setAttribute('aria-pressed', x.dataset.col === cSel));
    };
    $('#caDel')?.addEventListener('click', async () => {
      const nAp = aportes(inv.id).length;
      if (!await confirmar({
        titulo: `Borrar la cartera ${inv.nom}`,
        cuerpo: `Se irán también sus ${nAp} aportacion${nAp === 1 ? '' : 'es'}, sus valores `
              + 'anotados y sus fondos. No se puede deshacer.',
        si: 'Borrar la cartera', no: 'Cancelar',
      })) return;
      borrarCartera(inv.id); sel = null;
      cerrarHoja(); emitir(); pintar(vista);
      avisar('Cartera borrada');
    });
    $('#caNo').onclick = cerrarHoja;
    $('#caOk').onclick = () => {
      const campos = {
        nom: $('#caN').value.trim() || 'Mi cartera',
        modo: mSel, color: cSel,
        pct: mSel === 'estimado' ? (parseFloat($('#caPct').value) || 0) : (inv?.pct ?? 8),
      };
      if (nuevo) sel = crearCartera(campos).id;
      else actualizar('inversiones', inv.id, campos);
      cerrarHoja(); emitir(); pintar(vista);
      avisar(nuevo ? 'Cartera creada' : 'Cartera actualizada');
    };
  });
}
