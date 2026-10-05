/* ==========================================================================
   Inversión: interfaz. El cálculo vive en inversiones.js.

   Tres pantallas y un solo esqueleto repetido, que es lo que hace que una app
   con cuentas se sienta sencilla:

     Resumen    · todos los productos sumados. Valor, plusvalía y TIR arriba;
                  debajo la gráfica de aportado contra valor; después la lista.
     Detalle    · el mismo esqueleto para un producto, más sus movimientos.
     Simulador  · no mira tus datos. Proyecta una regla de ahorro y sirve de
                  puerta de entrada a quien todavía no invierte.

   Una sola rentabilidad a la vista, la TIR, con una línea que la explica. Ver
   dos a la vez (TIR y ponderada por tiempo) es la forma más rápida de que
   alguien deje de fiarse de sus propios números.
   ========================================================================== */
import {
  datos, anadir, actualizar, borrar, enLote, nube,
  eur, eur0, pc, dia, desdeDia, escapar, avisar, emitir, vacio,
  abrirHoja, cerrarHoja, confirmar,
} from './nucleo.js';
import {
  MODOS, TIPOS_PROD, PALETA_INV, tipoDe,
  productos, producto, modoDe,
  aportes, valoraciones, posicionesDe, invertido,
  vlDe, navEurDe, refrescarPrecios, valorPorPosiciones, anotarValor,
  valorActual, ultimoValor, fechaValor, rentabilidad, serie, reparto, desfase,
  crearProducto, borrarProducto, seriePeriodica, leerPosiciones,
  resumenGlobal, rentabilidadGlobal, serieGlobal, PERIODOS_INV,
  ESCENARIOS, simular, costeDeEsperar, analisis, comisionDe, vlPedido,
} from './inversiones.js';
import { ingresado } from './finanzas.js';

let pantalla = 'resumen';   // 'resumen' | 'simulador'
let sel = null;             // id del producto abierto, o null para el agregado
let cargando = false;       // hay una petición de precios en vuelo
/* El periodo de la gráfica es uno solo para las dos pantallas: quien está
   mirando el último año del agregado quiere el último año al abrir un producto,
   no volver a elegirlo. Por defecto, toda la historia. */
let periodoGraf = 'todo';
/* Estado de la barra móvil. El índice es null hasta que hay puntos; entonces se
   coloca en el último, que es hoy: así la lectura nunca está vacía y el panel no
   cambia de alto al arrastrar, que movería la página entera bajo el dedo. */
let grafIdx = null, grafPts = [], grafColor = 'var(--acento)', grafEscala = { min: 0, rango: 1 };

/* Lo último que se simuló, para no perderlo al cambiar de pestaña. */
let sim = { inicial: 0, mensual: 200, anios: 20, pct: 6, inflacion: 0, subida: 0 };

const LINEA_TIR = 'Rentabilidad anual de tu dinero, contando cuándo metiste cada euro. '
  + 'No es la rentabilidad del producto.';

export function pintar(vista) {
  vista.innerHTML = `<div class="scroll">
    <div class="titulo">Inversión</div>
    <div class="segmentos">
      <button class="seg" data-p="resumen" aria-pressed="${pantalla === 'resumen'}">Mis productos</button>
      <button class="seg" data-p="simulador" aria-pressed="${pantalla === 'simulador'}">Simulador</button>
    </div>
    <div id="invCuerpo"></div>
  </div>`;

  vista.querySelector('.segmentos').onclick = e => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    pantalla = b.dataset.p; sel = null; pintar(vista);
  };

  const cuerpo = vista.querySelector('#invCuerpo');
  if (pantalla === 'simulador') return pintarSimulador(cuerpo, vista);
  if (sel && producto(sel)) pintarDetalle(cuerpo, vista);
  else { sel = null; pintarResumen(cuerpo, vista) }
  quizaRefrescar(vista);
}

/* ---------- Precios al día sin pedirlo ----------
   El valor liquidativo se publica una vez al día, así que una copia de menos de
   doce horas es la misma. Si la que hay es más vieja, se pide sola al abrir la
   pestaña: tener que acordarse de pulsar un botón es lo que hace que una
   cartera esté siempre desactualizada. */
const FRESCO = 12 * 3600 * 1000;
let ultimoIntento = 0;

async function quizaRefrescar(vista) {
  if (cargando || !nube) return;
  if (Date.now() - vlPedido() < FRESCO) return;
  /* Si falla, no se insiste en cada repintado: una vez por hora basta. */
  if (Date.now() - ultimoIntento < 3600 * 1000) return;
  const auto = productos().filter(p => modoDe(p) === 'auto' && posicionesDe(p.id).length);
  if (!auto.length) return;
  ultimoIntento = Date.now();
  cargando = true;
  try { for (const p of auto) await refrescarPrecios(p.id) }
  finally { cargando = false; emitir() }
}

/* ==========================================================================
   Resumen: todos los productos juntos
   ========================================================================== */
function pintarResumen(c, vista) {
  const ps = productos();
  if (!ps.length) {
    /* La pantalla vacía no espera a que la llenes: enseña para qué sirve esto.
       Quien todavía no invierte entra por el simulador, no por un formulario. */
    c.innerHTML = vacio({
      titulo: 'Aquí verás lo que tienes invertido',
      cuerpo: 'Apunta cada producto —una cartera gestionada, un plan de pensiones, '
            + 'unas acciones— y la app lleva la cuenta de lo que has puesto, lo que vale '
            + 'y lo que ha rendido. Si todavía no inviertes, empieza por ver qué pasaría.',
      accion: 'Ver qué pasaría si invirtiera',
    }) + '<div class="acciones"><button class="accion nuevo" id="invNuevo">Añadir un producto</button></div>';
    c.querySelector('[data-vacio]').onclick = () => { pantalla = 'simulador'; pintar(vista) };
    c.querySelector('#invNuevo').onclick = () => hojaProducto(null, vista);
    return;
  }

  const g = resumenGlobal();
  const tirG = rentabilidadGlobal();
  const noLiquido = ps.filter(p => !TIPOS_PROD[tipoDe(p)].liquido).length;

  c.innerHTML = `
    <div class="panel">
      <div class="subtitulo" style="padding:0 0 6px">${g.n} producto${g.n === 1 ? '' : 's'}</div>
      <div class="granCifra num ${g.plus !== null && g.plus < 0 ? 'rojo' : ''}">${
        g.valor === null ? '—' : eur(g.valor)}</div>
      ${g.plus !== null ? `<div class="delta">${g.plus >= 0 ? '▲ ' : '▼ '}<span class="num">${
        eur(Math.abs(g.plus))}</span> sobre los <span class="num">${eur(g.puesto)}</span>
        que has puesto</div>` : ''}
      ${tirG !== null ? `<div class="delta"><b class="num">${tirG > 0 ? '+' : ''}${pc(tirG)}</b>
        anual · TIR</div>
        <p class="estado">${LINEA_TIR}</p>` : ''}
      ${g.sinValor.length ? `<p class="estado rojo">${g.sinValor.length === 1
        ? `Falta el valor de ${escapar(g.sinValor[0].nom)}`
        : `Faltan los valores de ${g.sinValor.length} productos`}, así que el total
        se queda corto.</p>` : ''}
    </div>

    ${bloqueGrafica(serieGlobal, 'var(--acento)')}

    <div class="rotulo">Productos</div>
    <ul class="filas" id="invLista">${ps.map(p => {
      const v = valorActual(p.id), puesto = invertido(p.id);
      const plus = v === null ? null : Math.round((v - puesto) * 100) / 100;
      const d = desfase(p.id);
      return `<li><button class="fila-prod" data-prod="${p.id}">
        <span class="punto" style="background:${p.color}22;color:${p.color}">●</span>
        <span class="txt"><b>${escapar(p.nom)}</b>
          <small>${d ? '<span class="fijo rev">sin actualizar</span>' : ''}${
            escapar(TIPOS_PROD[tipoDe(p)].nom)}${
            TIPOS_PROD[tipoDe(p)].liquido ? '' : ' · no disponible'}</small></span>
        <span class="txt" style="flex:none;text-align:right">
          <b class="num">${v === null ? '—' : eur0(v)}</b>
          <small class="num ${plus !== null && plus < 0 ? 'rojo' : ''}">${
            plus === null ? 'sin valor' : (plus >= 0 ? '+' : '−') + eur0(Math.abs(plus))}</small></span>
      </button></li>`;
    }).join('')}</ul>
    ${noLiquido ? `<p class="estado">Disponible ahora mismo: <b class="num">${eur(g.liquido)}</b>.
      El resto está en productos de los que no puedes disponer cuando quieras.</p>` : ''}

    ${bloqueAnalisis()}

    <div class="acciones" style="margin-top:18px">
      <button class="accion nuevo" id="invNuevo">Añadir producto</button>
    </div>`;

  c.querySelector('#invNuevo').onclick = () => hojaProducto(null, vista);
  c.querySelector('#invLista').onclick = e => {
    const f = e.target.closest('[data-prod]'); if (!f) return;
    sel = f.dataset.prod; pintar(vista);
  };
  enchufarGrafica(c, serieGlobal, 'var(--acento)');
}

/* ---------- Qué dicen tus números ----------
   Hechos sobre los datos del usuario, no opiniones sobre el mercado. Cuando se
   compara con una regla conocida se cita la regla, para que se vea que es una
   referencia de fuera y no un juicio de la app. */
function bloqueAnalisis() {
  /* El ingreso medio de los últimos seis meses, de la pestaña Finanzas. Esta
     app tiene las dos mitades —lo que entra y lo que inviertes—, que es
     justo lo que no puede cruzar una app que solo mira la cartera. */
  let ingresoMensual = null;
  const meses = [];
  for (let i = 1; i <= 6; i++) meses.push(ingresado(-i));
  const conDatos = meses.filter(x => x > 0);
  if (conDatos.length >= 3) ingresoMensual = conDatos.reduce((a, b) => a + b, 0) / conDatos.length;

  const hallazgos = analisis({ ingresoMensual });
  if (!hallazgos.length) return '';
  return `<div class="rotulo">Qué dicen tus números</div>
    ${hallazgos.map(h => `<div class="panel hallazgo ${h.tono}">
      <b>${h.titulo}</b>
      <p>${h.texto}</p>
      ${h.nota ? `<p class="estado">${h.nota}</p>` : ''}
    </div>`).join('')}`;
}

/* ==========================================================================
   Detalle de un producto
   ========================================================================== */
function pintarDetalle(c, vista) {
  const p = producto(sel);
  const modo = modoDe(p);
  const puesto = invertido(sel);
  const valor = valorActual(sel);
  const plus = valor === null ? null : Math.round((valor - puesto) * 100) / 100;
  const tirP = rentabilidad(sel);
  const fecha = fechaValor(sel);
  const ap = aportes(sel);
  const d = desfase(sel);

  c.innerHTML = `
    <button class="volver" id="invVolver">‹ Todos los productos</button>

    <div class="panel">
      <div class="subtitulo" style="padding:0 0 6px">${escapar(p.nom)} ·
        ${escapar(TIPOS_PROD[tipoDe(p)].nom.toLowerCase())}</div>
      <div class="granCifra num ${plus !== null && plus < 0 ? 'rojo' : ''}">${
        valor === null ? '—' : eur(valor)}</div>
      ${plus !== null ? `<div class="delta">${plus >= 0 ? '▲ ' : '▼ '}<span class="num">${
        eur(Math.abs(plus))}</span> sobre los <span class="num">${eur(puesto)}</span>
        que has puesto</div>` : ''}
      ${tirP !== null ? `<div class="delta"><b class="num">${tirP > 0 ? '+' : ''}${pc(tirP)}</b>
        anual · TIR</div><p class="estado">${LINEA_TIR}</p>` : ''}
      ${valor === null ? `<div class="delta">Sin valor todavía. ${
        modo === 'auto' ? 'Añade tus posiciones y actualiza los precios.'
        : 'Anota cuánto vale hoy.'}</div>` : ''}
      ${fecha ? `<div class="delta">Valor a ${desdeDia(fecha)
        .toLocaleDateString('es-ES', { day:'numeric', month:'long' })}</div>` : ''}
    </div>

    ${d ? `<div class="calTot extra" style="border-color:var(--aviso)">
        <span>Faltan ${d.n} aportacion${d.n === 1 ? '' : 'es'} por reflejar:
          el valor se queda corto</span>
        <b class="num">≈ ${eur(d.importe)}</b></div>
      <p class="estado">Las posiciones guardadas son las del extracto del ${
        new Date(d.desde).toLocaleDateString('es-ES', { day:'numeric', month:'long' })}.
        Vuelve a pegar la tabla de tu banco para ponerlas al día.</p>` : ''}

    ${bloqueGrafica(per => serie(sel, per), p.color)}

    ${modo === 'auto' ? bloquePosiciones(p) : bloqueValores(p)}

    <div class="rotulo">Aportaciones</div>
    ${ap.length ? `<ul class="filas">${ap.slice().reverse().slice(0, 8).map(m => `
      <li data-ap="${m.id}">
        <span class="punto" style="background:${p.color}22;color:${p.color}">${
          m.c >= 0 ? '↑' : '↓'}</span>
        <span class="txt"><b>${m.c >= 0 ? 'Aportación' : 'Reembolso'}</b>
          <small>${new Date(m.t).toLocaleDateString('es-ES',
            { day:'numeric', month:'short', year:'numeric' }).replace('.', '')}</small></span>
        <span class="imp num ${m.c >= 0 ? '' : 'rojo'}">${eur(Math.abs(m.c))}</span>
        <button class="borrar" data-quitar="${m.id}" aria-label="Borrar esta aportación"
          data-tip="Borrar">✕</button>
      </li>`).join('')}</ul>
      ${ap.length > 8 ? `<p class="estado">Se enseñan las 8 últimas de ${ap.length}.</p>` : ''}`
    : vacio({ titulo: 'Sin aportaciones', cuerpo: 'Apunta lo que metes y cuándo: sin las fechas '
        + 'se puede saber cuánto tienes, pero no cuánto ha rendido.',
        accion: 'Añadir la primera' })}

    ${p.nota ? `<div class="rotulo">Por qué lo tengo</div>
      <div class="panel"><p style="margin:0;white-space:pre-wrap">${escapar(p.nota)}</p></div>` : ''}

    <div class="acciones" style="margin-top:18px">
      <button class="accion" id="invAporte">Añadir aportación</button>
      ${modo === 'manual' ? '<button class="accion" id="invValor">Anotar valor</button>' : ''}
      ${modo === 'auto' ? `<button class="accion" id="invPrecios" ${cargando ? 'disabled' : ''}>${
        cargando ? 'Buscando…' : 'Actualizar precios'}</button>` : ''}
      <button class="accion nuevo" id="invCfg">Ajustes</button>
    </div>`;

  const $ = x => c.querySelector(x);
  $('#invVolver').onclick = () => { sel = null; pintar(vista) };
  $('#invAporte').onclick = () => hojaAporte(null, vista);
  $('#invValor')?.addEventListener('click', () => hojaValorManual(vista));
  $('#invPrecios')?.addEventListener('click', () => actualizar2(vista));
  $('#invCfg').onclick = () => hojaProducto(p, vista);
  $('#invPos')?.addEventListener('click', () => hojaPosicion(null, vista));
  $('#invImport')?.addEventListener('click', () => hojaImportar(vista));
  c.querySelectorAll('[data-vacio]').forEach(b => {
    const deFondos = /pegar|tabla/i.test(b.textContent);
    b.onclick = () => deFondos ? hojaImportar(vista) : hojaAporte(null, vista);
  });
  c.addEventListener('click', e => {
    const q = e.target.closest('[data-quitar]');
    if (q) { quitarAporte(q.dataset.quitar, vista); return }
    const pos = e.target.closest('[data-pos]');
    if (pos) hojaPosicion(datos.posiciones.find(x => x.id === pos.dataset.pos), vista);
  });
  enchufarGrafica(c, per => serie(sel, per), p.color);
}

/* ---------- Bloques propios de cada modo ---------- */
function bloquePosiciones(p) {
  const pos = posicionesDe(p.id);
  if (!pos.length) {
    return `<div class="rotulo">Posiciones</div>${vacio({
      titulo: 'Sin posiciones todavía',
      cuerpo: 'Lo más rápido es copiar la tabla de posiciones de tu banco y pegarla: '
            + 'de ahí salen los identificadores y las cantidades sin teclear nada.',
      accion: 'Pegar la tabla' })}
    <div class="acciones"><button class="accion nuevo" id="invPos">Añadir una a mano</button></div>`;
  }
  const rep = reparto(p.id);
  const sinPrecio = pos.filter(x => !navEurDe(x.isin));
  const fuente = pos.map(x => vlDe(x.isin)?.fuente).find(Boolean);
  return `<div class="rotulo">Posiciones</div>
    ${(rep.length ? rep : pos.map(x => ({ ...x, valor: null, pct: null }))).map(x => {
      const v = vlDe(x.isin);
      return `<div class="filaCat2" data-pos="${x.id}">
        <span class="txt"><b>${escapar(x.nom || v?.nom || x.isin)}</b>
          <small>${escapar(x.isin)} · ${(x.part || 0).toLocaleString('es-ES',
            { maximumFractionDigits: 4 })}${
            v?.nav ? ` · ${v.nav.toLocaleString('es-ES', { minimumFractionDigits: 2,
              maximumFractionDigits: 4 })} ${v.moneda || 'EUR'}${
              (v.moneda || 'EUR') !== 'EUR' && v.navEur
                ? ` → ${v.navEur.toLocaleString('es-ES', { minimumFractionDigits: 2,
                    maximumFractionDigits: 4 })} €` : ''}`
            : ' · sin precio'}</small></span>
        ${x.valor === null ? '' : `<span class="txt" style="flex:none;text-align:right">
          <b class="num">${eur0(x.valor)}</b><small>${x.pct}%</small></span>`}
      </div>`;
    }).join('')}
    ${sinPrecio.length ? `<p class="estado rojo">Sin precio ${
      sinPrecio.length === 1 ? 'una posición' : sinPrecio.length + ' posiciones'}: ${
      sinPrecio.map(x => escapar(x.isin)).join(', ')}. ${
      !nube ? 'Los precios los busca tu Worker, y la sincronización está sin configurar.'
            : 'Pulsa «Actualizar precios»; si sigue igual, revisa el identificador.'}</p>` : ''}
    ${fuente ? `<p class="estado">Precios de ${escapar(fuente)}, a través de tu Worker.
      Se guardan en el móvil para poder mirarlo sin cobertura.</p>` : ''}
    <div class="acciones">
      <button class="accion" id="invImport">Pegar tabla</button>
      <button class="accion nuevo" id="invPos">Añadir una</button></div>`;
}

function bloqueValores(p) {
  const vs = valoraciones(p.id);
  if (!vs.length) return '';
  return `<div class="rotulo">Valores anotados</div>
    <ul class="filas">${vs.slice().reverse().slice(0, 5).map(m => `<li>
      <span class="txt"><b class="num">${eur(m.c)}</b>
        <small>${new Date(m.t).toLocaleDateString('es-ES',
          { day:'numeric', month:'short', year:'numeric' }).replace('.', '')}</small></span>
    </li>`).join('')}</ul>`;
}

/* ==========================================================================
   Simulador

   No mira tus datos: proyecta una regla de ahorro. Tres supuestos etiquetados
   en vez de un número único, porque una banda de confianza se lee como «este
   es el peor caso» y no lo es; y redondeado a miles, porque la falsa precisión
   es lo que convierte una herramienta en una promesa.
   ========================================================================== */
const miles = n => Math.round(n / 1000) * 1000;

function pintarSimulador(c, vista) {
  const base = { ...sim };
  const centro = simular({ ...base, pct: 6 });
  const espera = costeDeEsperar({ ...base, pct: 6 }, 2);
  const conInfl = base.inflacion > 0;

  c.innerHTML = `
    <p class="pieNota" style="padding:14px 0 0">Esto no mira tus datos: calcula qué pasaría
      con una regla de ahorro. Sirve para hacerse una idea del orden de magnitud.</p>

    <div class="panel">
      <label><span>Cuánto aportas al mes</span>
        <input id="siM" type="number" inputmode="decimal" step="any" min="0"
          value="${base.mensual}"></label>
      <label><span>Con cuánto empiezas</span>
        <input id="siI" type="number" inputmode="decimal" step="any" min="0"
          value="${base.inicial}"></label>
      <label><span>Durante cuántos años</span>
        <input id="siA" type="number" inputmode="numeric" step="1" min="1" max="60"
          value="${base.anios}"></label>
      <details class="mas" ${conInfl || base.subida ? 'open' : ''}>
        <summary>Más supuestos</summary>
        <label><span>Inflación anual (%), para verlo en euros de hoy</span>
          <input id="siInf" type="number" inputmode="decimal" step="any" min="0"
            value="${base.inflacion}" placeholder="0"></label>
        <label><span>Cuánto sube tu aportación cada año (%)</span>
          <input id="siSub" type="number" inputmode="decimal" step="any" min="0"
            value="${base.subida}" placeholder="0"></label>
      </details>
    </div>

    <div class="rotulo">Qué tendrías en ${base.anios} año${base.anios === 1 ? '' : 's'}</div>
    <ul class="filas">${ESCENARIOS.map(e => {
      const r = simular({ ...base, pct: e.pct });
      return `<li>
        <span class="txt"><b>Si rindiera un ${e.pct}% al año</b>
          <small>${escapar(e.nom)}</small></span>
        <span class="imp num">${eur0(miles(conInfl ? r.hoy : r.total))}</span>
      </li>`;
    }).join('')}</ul>
    <p class="estado">${conInfl
      ? `En euros de hoy, descontando una inflación del ${base.inflacion}% anual.`
      : `En euros de dentro de ${base.anios} años. Abre «Más supuestos» para verlo en euros de hoy.`}</p>

    ${centro.total > 0 ? `<div class="panel">
      <div class="rotulo" style="margin-top:0">De dónde sale ese dinero</div>
      <p class="pieNota" style="padding:4px 0 10px">Con el supuesto intermedio, del 6%.</p>
      <div class="barra" style="height:14px">
        <i style="width:${Math.round((centro.puesto / centro.total) * 100)}%;
           background:var(--muted)"></i></div>
      <div class="calTot" style="margin-top:12px">
        <span>Lo pones tú</span><b class="num">${eur0(miles(centro.puesto))}</b></div>
      <div class="calTot" style="margin-top:6px">
        <span>Lo pone el interés compuesto</span>
        <b class="num">${eur0(miles(centro.interes))}</b></div>
    </div>` : ''}

    ${espera.coste > 500 ? `<div class="panel">
      <div class="rotulo" style="margin-top:0">Lo que cuesta esperar</div>
      <p style="margin:8px 0 0">Empezando hoy tendrías <b class="num">${eur0(miles(espera.ahora))}</b>.
        Empezando dentro de dos años, <b class="num">${eur0(miles(espera.luego))}</b>.</p>
      <p class="estado">Esos dos años de espera cuestan
        <b class="num">${eur0(miles(espera.coste))}</b>.</p>
    </div>` : ''}

    <p class="pieNota">Los mercados no suben en línea recta: la media puede cumplirse y aun así
      pasar años en negativo. Los porcentajes de arriba son supuestos elegidos a mano, no una
      predicción ni una proyección de ningún producto concreto.</p>`;

  const leer = () => {
    const n = x => { const v = parseFloat(c.querySelector(x)?.value); return isFinite(v) ? v : 0 };
    sim = {
      mensual: Math.max(0, n('#siM')),
      inicial: Math.max(0, n('#siI')),
      anios: Math.min(60, Math.max(1, Math.round(n('#siA')) || 1)),
      pct: 6,
      inflacion: Math.max(0, n('#siInf')),
      subida: Math.max(0, n('#siSub')),
    };
    pintarSimulador(c, vista);
  };
  ['#siM', '#siI', '#siA', '#siInf', '#siSub'].forEach(x =>
    c.querySelector(x)?.addEventListener('change', leer));
}

/* ---------- Panel de la gráfica, con su selector de periodo ----------
   El panel se dibuja o no según la historia completa, nunca según el periodo
   elegido: si desapareciera al elegir «Mes» se iría con él el selector, y no
   habría forma de volver. Cuando el periodo elegido se queda sin puntos, lo que
   se cambia es el interior, y el selector sigue ahí. */
function bloqueGrafica(dame, color) {
  if (dame('todo').length < 2) return '';
  return `<div class="panel" id="grafPanel">${graficaInterior(dame, color)}</div>`;
}

function graficaInterior(dame, color) {
  const pts = dame(periodoGraf);
  const botones = PERIODOS_INV.map(p =>
    `<button data-gp="${p.id}" aria-pressed="${p.id === periodoGraf}"
       aria-label="${p.largo}" title="${p.largo}">${p.nom}</button>`).join('');
  const cuerpo = pts.length > 1
    ? grafica(pts, color)
    : `<p class="estado">En este periodo no hay suficiente historia para dibujar la
         línea. Prueba con uno más largo.</p>`;
  return `<div class="rotulo" style="padding-top:0">Aportado y valor</div>
    <div class="opciones periodos" id="grafPer" style="margin:0 0 14px">${botones}</div>
    ${cuerpo}`;
}

/** Vuelve a pintar solo el panel: cambiar el periodo no debe mover la página. */
function enchufarGrafica(c, dame, color) {
  const panel = c.querySelector('#grafPanel');
  if (!panel) return;
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-gp]'); if (!b) return;
    periodoGraf = b.dataset.gp;
    grafIdx = null;                       // otro periodo, otra barra
    panel.innerHTML = graficaInterior(dame, color);
    enchufarBarra(panel);
  });
  enchufarBarra(panel);
}

/* ---------- Gráfica de dos líneas ----------
   Lo aportado es un escalón que solo sube; el valor va por encima o por debajo.
   La distancia entre las dos es la plusvalía, que es lo que se quiere leer. */

/* La escala no se fuerza a cero. Forzarlo es lo honesto en un gráfico de
   barras, pero aquí machaca justo el dato: en un periodo corto las dos líneas
   valen casi lo mismo y, medidas desde cero, quedan pegadas arriba y no se ve
   ni el movimiento ni el hueco entre ellas. Como no empezar en cero exagera
   las subidas, cuando pasa se dice debajo de la gráfica. */
function rangoDe(pts) {
  const vals = pts.flatMap(p => [p.puesto, p.vale]).filter(v => v !== null && isFinite(v));
  if (!vals.length) return { min: 0, max: 1, cero: true };
  const max = Math.max(...vals), min = Math.min(...vals);
  return { min, max, cero: min <= 0 };
}

/* Posición vertical de un importe dentro del lienzo de 100×100. El dibujo vive
   entre el 4% y el 96% para que una línea en el máximo no se coma el borde. */
const yDe = (v, min, rango) => 100 - ((v - min) / rango) * 92 - 4;

let nGraf = 0;   // para que los clip-path de dos gráficas no choquen

function grafica(pts, color) {
  const { min, max, cero } = rangoDe(pts);
  const rango = (max - min) || Math.max(1, Math.abs(max) * 0.02);
  const x = i => (i / Math.max(1, pts.length - 1)) * 100;
  const y = v => yDe(v, min, rango);

  /* Estado que necesita la barra móvil para no recalcular nada al arrastrar. */
  grafPts = pts; grafColor = color; grafEscala = { min, rango };
  if (grafIdx === null || grafIdx > pts.length - 1) grafIdx = pts.length - 1;

  const linea = campo => pts.map((p, i) => p[campo] === null ? null : `${x(i)},${y(p[campo])}`)
    .filter(Boolean).join(' ');

  /* ---- La banda entre las dos líneas ----
     Antes se rellenaba desde la línea de aportado hasta abajo, y eso dejaba la
     plusvalía como una rendija encima de un bloque enorme: justo el dato que
     se quiere ver era el único sin tinta. Ahora se pinta lo que hay *entre* las
     dos líneas, que es la plusvalía, y se parte en verde y rojo con dos
     recortes: uno por encima de la línea de aportado y otro por debajo. Así,
     cuando el valor cruza y se pone en pérdidas, cada tramo lleva su color sin
     tener que calcular dónde se cortan exactamente. */
  const i0 = pts.findIndex(p => p.vale !== null);
  let banda = '';
  if (i0 !== -1 && i0 < pts.length - 1) {
    const id = ++nGraf;
    const porVale = [], porPuesto = [];
    for (let i = i0; i < pts.length; i++) {
      if (pts[i].vale !== null) porVale.push(`${x(i)},${y(pts[i].vale)}`);
      porPuesto.push(`${x(i)},${y(pts[i].puesto)}`);
    }
    const franja = [...porVale, ...porPuesto.slice().reverse()].join(' ');
    const linPuesto = porPuesto.join(' ');
    const xIni = x(i0), xFin = x(pts.length - 1);
    banda = `<defs>
        <clipPath id="gArr${id}"><polygon points="${xIni},-5 ${linPuesto} ${xFin},-5"/></clipPath>
        <clipPath id="gAba${id}"><polygon points="${xIni},105 ${linPuesto} ${xFin},105"/></clipPath>
      </defs>
      <polygon points="${franja}" fill="var(--ingreso)" fill-opacity=".20"
        clip-path="url(#gArr${id})"></polygon>
      <polygon points="${franja}" fill="var(--alerta)" fill-opacity=".20"
        clip-path="url(#gAba${id})"></polygon>`;
  }

  /* Rejilla: tres hairlines del mismo tono que los bordes, nunca discontinuas. */
  const rejilla = [4, 50, 96].map(p =>
    `<line x1="0" y1="${p}" x2="100" y2="${p}" stroke="var(--line)" stroke-width="1"
       vector-effect="non-scaling-stroke"></line>`).join('');

  const marcas = [0, Math.floor(pts.length / 3), Math.floor(2 * pts.length / 3),
    pts.length - 1].filter((v, i, a) => a.indexOf(v) === i);

  return `<div class="grafZona">
      <div class="ejeY" aria-hidden="true">
        <span class="num">${eur0(max)}</span>
        <span class="num">${eur0((max + min) / 2)}</span>
        <span class="num">${eur0(min)}</span>
      </div>
      <div class="grafCaja" id="grafCaja" tabindex="0" role="slider"
          aria-label="Recorrer la gráfica por fechas" aria-valuemin="0"
          aria-valuemax="${pts.length - 1}" aria-valuenow="${grafIdx}"
          aria-valuetext="${escapar(textoPunto(pts[grafIdx]))}">
        <svg class="graf" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          ${rejilla}
          ${banda}
          <polyline points="${linea('puesto')}" fill="none" stroke="var(--muted)"
            stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"
            stroke-dasharray="4 3"></polyline>
          <polyline points="${linea('vale')}" fill="none" stroke="${color}" stroke-width="2.5"
            vector-effect="non-scaling-stroke" stroke-linejoin="round"
            stroke-linecap="round"></polyline>
        </svg>
        ${marcaBarra(pts, grafIdx, color, min, rango)}
      </div>
      <div class="ejeX">${marcas.map(i => `<span>${escapar(pts[i].etq)}</span>`).join('')}</div>
    </div>
    <div class="grafLee" id="grafLee">${lectura(pts, grafIdx, color)}</div>
    ${cero ? '' : `<p class="estado">La escala no empieza en cero, para que se vea
      el movimiento.</p>`}`;
}

/** La barra vertical y los dos puntos, en coordenadas de porcentaje de la caja. */
function marcaBarra(pts, i, color, min, rango) {
  const p = pts[i];
  const x = (i / Math.max(1, pts.length - 1)) * 100;
  const punto = (v, col) => v === null ? ''
    : `<i class="grafPunto" style="top:${yDe(v, min, rango)}%;background:${col}"></i>`;
  /* El punto del valor se dibuja el último para que quede encima cuando las dos
     líneas se juntan: es la serie principal, no la referencia. */
  return `<div class="grafBarra" id="grafBarra" style="left:${x}%">
    ${punto(p.puesto, 'var(--muted)')}${punto(p.vale, color)}
  </div>`;
}

/** Lo que se lee al mover la barra. Los importes van en .num porque el modo
 *  discreto tiene que taparlos igual que a los de las demás pantallas. */
function lectura(pts, i, color) {
  const p = pts[i];
  const fecha = new Date(p.ms).toLocaleDateString('es-ES',
    { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');
  const dif = p.vale === null ? null : Math.round((p.vale - p.puesto) * 100) / 100;
  const pct = dif === null || !p.puesto ? null : (dif / p.puesto) * 100;
  return `<div class="grafFecha">${escapar(fecha)}</div>
    <div class="grafFila"><span><i class="lleno" style="background:${color}"></i>Lo que vale</span>
      <b class="num">${p.vale === null ? '—' : eur(p.vale)}</b></div>
    <div class="grafFila"><span><i class="rayada"></i>Lo que has puesto</span>
      <b class="num">${eur(p.puesto)}</b></div>
    <div class="grafFila dif ${dif !== null && dif < 0 ? 'rojo' : ''}">
      <span>Diferencia</span>
      <b>${dif === null ? '—' : `${dif >= 0 ? '▲' : '▼'} <span class="num">${
        eur(Math.abs(dif))}</span>${pct === null ? ''
        : ` <span class="num">${pct >= 0 ? '+' : '−'}${pc(Math.abs(pct))}</span>`}`}</b></div>`;
}

/** La misma lectura en una frase, para quien usa lector de pantalla. */
function textoPunto(p) {
  const fecha = new Date(p.ms).toLocaleDateString('es-ES',
    { day: 'numeric', month: 'long', year: 'numeric' });
  return p.vale === null
    ? `${fecha}: has puesto ${eur(p.puesto)}, sin valor registrado`
    : `${fecha}: vale ${eur(p.vale)}, has puesto ${eur(p.puesto)}`;
}

/* ---------- La barra móvil ----------
   Se engancha al punto más cercano: se apunta a una fecha, no a una línea de un
   píxel. Con el teclado hacen las flechas lo mismo que el dedo, porque si la
   única forma de leer un valor fuera arrastrar, quien no puede arrastrar se
   queda sin los números. */
function enchufarBarra(panel) {
  const caja = panel.querySelector('#grafCaja');
  if (!caja) return;
  const lee = panel.querySelector('#grafLee');

  const mover = i => {
    const n = grafPts.length;
    grafIdx = Math.max(0, Math.min(n - 1, i));
    const p = grafPts[grafIdx];
    lee.innerHTML = lectura(grafPts, grafIdx, grafColor);
    panel.querySelector('#grafBarra')?.remove();
    caja.insertAdjacentHTML('beforeend',
      marcaBarra(grafPts, grafIdx, grafColor, grafEscala.min, grafEscala.rango));
    caja.setAttribute('aria-valuenow', grafIdx);
    caja.setAttribute('aria-valuetext', textoPunto(p));
  };

  const desdeX = ev => {
    const r = caja.getBoundingClientRect();
    const f = (ev.clientX - r.left) / Math.max(1, r.width);
    mover(Math.round(f * (grafPts.length - 1)));
  };

  caja.addEventListener('pointerdown', e => {
    caja.setPointerCapture(e.pointerId);
    desdeX(e);
    e.preventDefault();        // sin esto el arrastre selecciona texto
  });
  caja.addEventListener('pointermove', e => {
    if (caja.hasPointerCapture(e.pointerId)) desdeX(e);
  });
  caja.addEventListener('keydown', e => {
    const salto = { ArrowLeft: -1, ArrowRight: 1, PageDown: -5, PageUp: 5 }[e.key];
    if (salto !== undefined) { mover(grafIdx + salto); e.preventDefault(); return }
    if (e.key === 'Home') { mover(0); e.preventDefault() }
    if (e.key === 'End')  { mover(grafPts.length - 1); e.preventDefault() }
  });
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
const CADAS = { mes:'Cada mes', semana:'Cada semana', trimestre:'Cada trimestre', anio:'Cada año' };

function hojaAporte(m, vista) {
  const nuevo = !m;
  abrirHoja(`<h3>${nuevo ? 'Añadir aportación' : 'Editar aportación'}</h3>
    ${nuevo ? `<div class="opciones" id="apModo" style="margin-top:4px">
      <button data-p="0" aria-pressed="true">Una sola vez</button>
      <button data-p="1" aria-pressed="false">Periódica</button>
    </div>` : ''}
    <div class="opciones oculto" id="apQue" style="margin-top:14px">
      <button data-q="cada" aria-pressed="true">Sé cuánto puse cada vez</button>
      <button data-q="total" aria-pressed="false">Sé el total</button>
    </div>
    <label><span id="apEtqC">Importe${nuevo ? ' de cada aportación' : ''}</span>
      <input id="apC" type="number" inputmode="decimal" step="any" value="${m?.c ?? ''}"
        placeholder="250" autofocus>
      <small class="pega" id="apMal"></small></label>
    <label><span id="apEtqT">Fecha</span>
      <input id="apT" type="date" max="${dia()}" value="${dia(m?.t || Date.now())}"></label>

    <div id="apPeri" class="oculto">
      <label><span>Cada cuánto</span>
        <select id="apCada" class="selAncho">${Object.entries(CADAS).map(([k, v]) =>
          `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label><span>Hasta</span>
        <input id="apHasta" type="date" max="${dia()}" value="${dia()}"></label>
      <div id="apPrevia"></div>
    </div>

    <p class="pieNota" style="padding:10px 0 0">Para un reembolso, pon el importe en negativo.</p>
    <div class="fila"><button id="apNo">Cancelar</button>
      <button class="ok" id="apOk">${nuevo ? 'Añadir' : 'Guardar'}</button></div>`,
  caja => {
    const $ = s => caja.querySelector(s);
    let periodica = false, porTotal = false;
    const serie = () => {
      const v = parseFloat($('#apC').value);
      const comun = {
        cada: $('#apCada').value,
        desde: desdeDia($('#apT').value).getTime(),
        hasta: desdeDia($('#apHasta').value).getTime(),
      };
      return porTotal ? seriePeriodica({ total: v, ...comun })
                      : seriePeriodica({ c: v, ...comun });
    };
    const previa = () => {
      if (!periodica) return;
      const s = serie();
      const total = s.reduce((x, y) => x + y.c, 0);
      $('#apPrevia').innerHTML = s.length
        ? `<div class="calTot" style="margin-top:16px">
             <span>${s.length} aportacion${s.length === 1 ? '' : 'es'}, de ${
               new Date(s[0].t).toLocaleDateString('es-ES', { month:'short', year:'numeric' })
               .replace('.', '')} a ${new Date(s[s.length - 1].t)
               .toLocaleDateString('es-ES', { month:'short', year:'numeric' }).replace('.', '')}</span>
             <b class="num">${eur(total)}</b></div>
           <p class="estado">${porTotal
             ? `Salen a <b class="num">${eur(s[0].c)}</b> cada una. Repartir por igual no es `
               + 'exactamente lo que hiciste, pero para la rentabilidad basta: lo que la mueve '
               + 'de verdad es cuándo empezaste, no el reparto mes a mes.'
             : 'Compara ese total con lo que tu banco llame «invertido»: si no cuadra, '
               + 'ajusta el importe o las fechas antes de guardar.'}</p>`
        : `<p class="estado">Con esas fechas no sale ninguna aportación.</p>`;
      $('#apOk').textContent = s.length ? `Añadir ${s.length}` : 'Añadir';
    };
    $('#apQue')?.addEventListener('click', e => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      porTotal = b.dataset.q === 'total';
      caja.querySelectorAll('#apQue button').forEach(x =>
        x.setAttribute('aria-pressed', (x.dataset.q === 'total') === porTotal));
      $('#apEtqC').textContent = porTotal ? 'Total aportado hasta ahora'
                                          : 'Importe de cada aportación';
      $('#apC').placeholder = porTotal ? '12000' : '250';
      previa();
    });
    $('#apModo')?.addEventListener('click', e => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      periodica = b.dataset.p === '1';
      caja.querySelectorAll('#apModo button').forEach(x =>
        x.setAttribute('aria-pressed', (x.dataset.p === '1') === periodica));
      $('#apPeri').classList.toggle('oculto', !periodica);
      $('#apQue').classList.toggle('oculto', !periodica);
      $('#apEtqT').textContent = periodica ? 'Primera aportación' : 'Fecha';
      if (!periodica) {
        /* Al volver a "una sola vez" el reparto por total no tiene sentido, así que
           se apaga; los botones tienen que reflejarlo para cuando vuelva a abrirse. */
        porTotal = false;
        caja.querySelectorAll('#apQue button').forEach(x =>
          x.setAttribute('aria-pressed', x.dataset.q === 'cada'));
        $('#apC').placeholder = '250';
        $('#apEtqC').textContent = 'Importe';
      }
      else $('#apEtqC').textContent = porTotal ? 'Total aportado hasta ahora'
                                               : 'Importe de cada aportación';
      $('#apOk').textContent = 'Añadir';
      previa();
    });
    ['#apC', '#apT', '#apHasta', '#apCada'].forEach(x =>
      caja.querySelector(x)?.addEventListener('input', previa));
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
      if (periodica) {
        const s = serie();
        if (!s.length) return avisar('Con esas fechas no sale ninguna aportación');
        enLote(() => s.forEach(x => anadir('invmov', { inv: sel, tipo:'aporte', c: x.c, t: x.t })));
        cerrarHoja(); emitir(); pintar(vista);
        return avisar(`${s.length} aportaciones · ${eur(s.reduce((a, b) => a + b.c, 0))}`);
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
      <textarea id="imTxt" placeholder="LU0000000000  FONDO INDEXADO GLOBAL  EUR  120,5  1.480,20 €"
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

function hojaProducto(inv, vista) {
  const nuevo = !inv;
  const modo = nuevo ? 'manual' : modoDe(inv);
  const tipo = nuevo ? 'cartera' : tipoDe(inv);
  abrirHoja(`<h3>${nuevo ? 'Nuevo producto' : 'Ajustes del producto'}</h3>
    <label><span>Nombre</span>
      <input id="caN" maxlength="40" value="${escapar(inv?.nom || '')}"
        placeholder="Cartera indexada, plan de pensiones…" autofocus></label>

    <label style="margin-top:20px"><span>Qué tipo de producto es</span>
      <select id="caTipo" class="selAncho">${Object.entries(TIPOS_PROD).map(([id, t]) =>
        `<option value="${id}" ${tipo === id ? 'selected' : ''}>${t.nom}</option>`).join('')}</select>
    </label>
    <p class="pieNota" id="caLiq" style="padding:8px 0 0"></p>

    <label style="margin-top:20px"><span>Cómo se sabe lo que vale</span></label>
    <div class="opciones" id="caModo">
      ${Object.entries(MODOS).map(([id, m]) =>
        `<button data-m="${id}" aria-pressed="${modo === id}">${m.nom}</button>`).join('')}
    </div>
    <p class="pieNota" id="caAyuda" style="padding:8px 0 0">${MODOS[modo].ayuda}.</p>

    <label><span>Efectivo sin invertir (€, opcional)</span>
      <input id="caEfe" type="number" inputmode="decimal" step="any" min="0"
        value="${inv?.efectivo ?? ''}" placeholder="0"></label>
    <p class="pieNota" style="padding:6px 0 0">Lo que haya en la cuenta sin colocar. Solo se
      suma cuando los precios se buscan solos; si anotas el valor a mano, ya lo llevará dentro.</p>

    <label><span>Comisión de la plataforma (% al año, opcional)</span>
      <input id="caCom" type="number" inputmode="decimal" step="any" min="0" max="10"
        value="${inv?.comision ?? ''}" placeholder="0,15"></label>
    <p class="pieNota" style="padding:6px 0 0">Lo que te cobra quien te lo gestiona, aparte de
      lo que cobren los fondos. Suele venir en su web, no en la ficha de los productos.</p>

    <label><span>Por qué lo tengo (opcional)</span>
      <textarea id="caNota" maxlength="400" style="min-height:80px;font-family:inherit;
        font-size:var(--t-base)" placeholder="Para qué es este dinero y cuándo piensas tocarlo"
        >${escapar(inv?.nota || '')}</textarea></label>
    <p class="pieNota" style="padding:6px 0 0">Escrito en frío, esto vale más que cualquier
      gráfica el día que el producto esté en pérdidas.</p>

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
    const liq = () => {
      const t = TIPOS_PROD[$('#caTipo').value];
      $('#caLiq').textContent = t.liquido ? ''
        : 'De este dinero no puedes disponer cuando quieras, así que no cuenta en el total '
          + 'disponible.';
    };
    $('#caTipo').onchange = liq; liq();
    $('#caModo').onclick = e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      mSel = b.dataset.m;
      caja.querySelectorAll('#caModo button').forEach(x =>
        x.setAttribute('aria-pressed', x.dataset.m === mSel));
      $('#caAyuda').textContent = MODOS[mSel].ayuda + '.';
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
        titulo: `Borrar el producto ${inv.nom}`,
        cuerpo: `Se irán también sus ${nAp} aportacion${nAp === 1 ? '' : 'es'}, sus valores `
              + 'anotados y sus posiciones. No se puede deshacer.',
        si: 'Borrar el producto', no: 'Cancelar',
      })) return;
      borrarProducto(inv.id); sel = null;
      cerrarHoja(); emitir(); pintar(vista);
      avisar('Producto borrado');
    });
    $('#caNo').onclick = cerrarHoja;
    $('#caOk').onclick = () => {
      const campos = {
        nom: $('#caN').value.trim() || 'Mi producto',
        tipo: $('#caTipo').value,
        modo: mSel, color: cSel,
        nota: $('#caNota').value.trim(),
        comision: $('#caCom').value === '' ? null : (parseFloat($('#caCom').value) || 0),
        efectivo: $('#caEfe').value === '' ? null : (parseFloat($('#caEfe').value) || 0),
      };
      if (nuevo) sel = crearProducto(campos).id;
      else actualizar('inversiones', inv.id, campos);
      cerrarHoja(); emitir(); pintar(vista);
      avisar(nuevo ? 'Producto creado' : 'Producto actualizado');
    };
  });
}
