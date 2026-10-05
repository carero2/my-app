/* ==========================================================================
   Módulo Finanzas: añadir, listado y métricas.
   ========================================================================== */
import {
  datos, anadir, actualizar, borrar, restaurar, ajuste, nube, enLote,
  eur, eur0, eurN, eurN0, escapar, dia, desdeDia, navMes,
  inicioCiclo, finCiclo, nombreCiclo, diasCiclo, cicloDia, rangoCiclo,
  avisar, abrirHoja, cerrarHoja, confirmar, emitir, vacio, irA,
} from './nucleo.js';

/* Las categorías son una colección más, así que se editan desde la app y viajan
   en la sincronización. Estas ocho se crean la primera vez, con los mismos
   identificadores de siempre para que el histórico no pierda su categoría. */
const SEMILLA = [
  {id:'comida',     nom:'Comida',     emo:'🍽',  color:'#C7513F'},
  {id:'transporte', nom:'Transporte', emo:'🚇',  color:'#3E6FA8'},
  {id:'compras',    nom:'Compras',    emo:'👕',  color:'#8C8378'},
  {id:'ocio',       nom:'Ocio',       emo:'🍺',  color:'#D98A2B'},
  {id:'hogar',      nom:'Hogar',      emo:'🏠',  color:'#4E8A5B'},
  {id:'salud',      nom:'Gimnasio',   emo:'🏋',  color:'#7A5BA6'},
  {id:'viajes',     nom:'Viajes',     emo:'✈️', color:'#2F8C8C'},
  {id:'otros',      nom:'Otros',      emo:'📦',  color:'#5F5A54'},
];
export const PALETA_CAT = ['#C7513F','#3E6FA8','#8C8378','#D98A2B','#4E8A5B','#7A5BA6',
                           '#2F8C8C','#5F5A54','#B0447A','#5C7A1E'];

/* Las semillas llevan _semilla: si el servidor ya tiene esa categoría (quizá
   renombrada o recoloreada desde otro dispositivo), gana la del servidor en
   vez de pisarla con los valores por defecto. */
export function sembrarCategorias() {
  if (!ajuste('catsSembradas')) {
    enLote(() => SEMILLA.forEach((c, i) => {
      if (!datos.categorias.some(x => x.id === c.id))
        anadir('categorias', { ...c, orden: i, _semilla: true });
    }));
    ajuste('catsSembradas', true);
  }
  asegurarNoDefinido();
}

/** Destino de lo que no se sabe categorizar: pagos de comercios desconocidos
    y filas de CSV sin pista. Se crea una vez; si la archivas, no vuelve. */
export const NO_DEFINIDO = { id:'no-definido', nom:'No definido', emo:'❓', color:'#8C8378', orden: 99 };
export function asegurarNoDefinido() {
  if (!datos.categorias.some(c => c.id === NO_DEFINIDO.id))
    anadir('categorias', { ...NO_DEFINIDO, _semilla: true });
}
/** Gastos que entraron solos (tarjeta compartida) y esperan tu visto bueno. */
export const porRevisar = () => datos.gastos.filter(g => g.revisar);
export function verPorRevisar() {
  sub = 'lista'; revisando = true; filtro = null; busca = ''; impMin = ''; impMax = '';
  volverA = null;
}
export const sinCategoria = () =>
  datos.gastos.filter(g => g.cat === NO_DEFINIDO.id && g.tipo !== 'ingreso');
/** Abre Movimientos buscando lo que está en «No definido», en todo el histórico. */
export function verSinCategoria() {
  sub = 'lista'; filtro = null; impMin = ''; impMax = ''; revisando = false;
  busca = cat(NO_DEFINIDO.id).nom;
  volverA = null;
}

const porOrden = (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || (a.t || 0) - (b.t || 0);
/** Categorías disponibles para asignar. */
export const cats = () => datos.categorias.filter(c => !c.archivada).sort(porOrden);
export const catsTodas = () => [...datos.categorias].sort(porOrden);
/** Nunca devuelve nulo: un movimiento con una categoría ya borrada se sigue viendo. */
export const cat = id => datos.categorias.find(c => c.id === id) ||
  { id, nom: id ? id[0].toUpperCase() + id.slice(1) : 'Otros', emo:'•', color:'#8C8378', huerfana:true };
const color = id => cat(id).color || '#8C8378';
const colorVar = n => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim() || '#888';

/** Identificador legible a partir del nombre, para que el atajo sea fácil de mantener. */
export function idDesde(nombre) {
  const base = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'cat';
  if (!datos.categorias.some(c => c.id === base)) return base;
  let n = 2;
  while (datos.categorias.some(c => c.id === base + n)) n++;
  return base + n;
}

/* ---------- Consultas ---------- */
export const esIngreso = g => g.tipo === 'ingreso';
export const delMes = off => {
  const a = inicioCiclo(off).getTime(), b = finCiclo(off).getTime();
  return datos.gastos.filter(g => g.t >= a && g.t <= b);
};
export const gastado = off => delMes(off).filter(g => !esIngreso(g)).reduce((s,g) => s + g.c, 0);
export const ingresado = off => delMes(off).filter(esIngreso).reduce((s,g) => s + g.c, 0);
/* ---------- Consultas por año ---------- */
export const delAnio = (off = 0) => {
  const a = new Date(new Date().getFullYear() + off, 0, 1).getTime();
  const b = new Date(new Date().getFullYear() + off, 11, 31, 23, 59, 59, 999).getTime();
  return datos.gastos.filter(g => g.t >= a && g.t <= b);
};
export const gastadoAnio   = (off = 0) => delAnio(off).filter(g => !esIngreso(g)).reduce((s,g) => s+g.c, 0);
export const ingresadoAnio = (off = 0) => delAnio(off).filter(esIngreso).reduce((s,g) => s+g.c, 0);
/** Desplazamiento en meses desde hoy hasta el mes m del año con desplazamiento off. */
const offDeMes = (m, off = 0) => {
  const hoy = new Date();
  return (new Date().getFullYear() + off - hoy.getFullYear()) * 12 + (m - hoy.getMonth());
};

/* Dos niveles independientes y compatibles: un presupuesto para todo el mes y,
   opcionalmente, un límite propio para cada categoría. */
export const presupuesto  = () => ajuste('presupuesto') || 0;
export const presupuestos = () => ajuste('presupuestos') || {};
export const topeCat      = id => presupuestos()[id] || 0;
export const sumaTopes    = () =>
  Object.values(presupuestos()).reduce((s, v) => s + (Number(v) || 0), 0);
export const gastadoCat = (id, off = 0) =>
  delMes(off).filter(g => g.cat === id && !esIngreso(g)).reduce((s,g) => s + g.c, 0);
/** Categorías que ya han superado su propio límite este mes. */
export const excedidas = (off = 0) =>
  cats().filter(c => topeCat(c.id) && gastadoCat(c.id, off) > topeCat(c.id));

/* ==========================================================================
   Gastos fijos
   Se generan solos una vez al mes, el día indicado. Quedan marcados con el
   identificador de su plantilla para poder distinguirlos en las métricas.
   ========================================================================== */
export const fijos = () => [...datos.fijos].sort((a,b) => (a.diaMes||1) - (b.diaMes||1));
export const totalFijos = (off = 0) =>
  delMes(off).filter(g => g.fijo && !esIngreso(g)).reduce((s,g) => s + g.c, 0);

/** Crea los movimientos de este mes cuyo día ya haya llegado. */
export function generarFijos() {
  const hoy = new Date();
  const mesAct = dia().slice(0, 7);
  const pendientes = datos.fijos.filter(f =>
    f.activo !== false && f.ultimo !== mesAct && (f.diaMes || 1) <= hoy.getDate());
  if (!pendientes.length) return 0;
  enLote(() => pendientes.forEach(f => {
    const cuando = new Date(hoy.getFullYear(), hoy.getMonth(), Math.min(f.diaMes || 1, 28), 12);
    anadir('gastos', { c: f.c, cat: f.cat, n: f.nom, tipo: f.tipo || 'gasto',
                       t: cuando.getTime(), fijo: f.id });
    actualizar('fijos', f.id, { ultimo: mesAct });
  }));
  return pendientes.length;
}

export function hojaFijos() {
  abrirHoja(`
    <h3>Gastos fijos</h3>
    <p class="pieNota" style="padding:0 0 6px">Se registran solos cada mes el día que indiques.
      Puedes editarlos o borrarlos después como cualquier otro movimiento.</p>
    <div id="listaFijos"></div>
    <div class="fila"><button id="fjCerrar">Cerrar</button>
      <button class="ok" id="fjNuevo">+ Nuevo</button></div>`,
  caja => {
    const pinta = () => {
      const lista = fijos();
      caja.querySelector('#listaFijos').innerHTML = lista.length ? lista.map(f => {
        const c = cat(f.cat);
        return `<div class="filaCat2 ${f.activo === false ? 'archivada' : ''}" data-id="${f.id}">
          <span class="punto" style="background:${c.color}22;color:${c.color}">${c.emo}</span>
          <span class="txt"><b>${escapar(f.nom)}</b>
            <small>día ${f.diaMes || 1} de cada mes${f.activo === false ? ' · pausado' : ''}</small></span>
          <b class="num">${eur(f.c)}</b>
        </div>`;
      }).join('') : vacio({
        titulo: 'Sin gastos fijos',
        cuerpo: 'Alquiler, cuotas, suscripciones: apúntalos una vez y se descuentan '
              + 'del presupuesto todos los meses.',
        accion: 'Añadir el primero'
      });
    };
    pinta();
    caja.querySelector('#fjCerrar').onclick = cerrarHoja;
    caja.querySelector('#fjNuevo').onclick = () => hojaFijo(null);
    caja.querySelector('#listaFijos').onclick = e => {
      if (e.target.closest('[data-vacio]')) return hojaFijo(null);
      const fila = e.target.closest('[data-id]');
      if (fila) hojaFijo(datos.fijos.find(f => f.id === fila.dataset.id));
    };
  });
}

function hojaFijo(f) {
  const nuevo = !f;
  const d = f || { nom:'', c:'', cat: cats()[0]?.id || 'otros', diaMes:1, activo:true };
  abrirHoja(`
    <h3>${nuevo ? 'Nuevo gasto fijo' : 'Editar gasto fijo'}</h3>
    <label><span>Concepto</span><input id="fNom" maxlength="40" value="${escapar(d.nom)}"
      placeholder="Alquiler, Netflix, gimnasio…"></label>
    <label><span>Importe</span><input id="fImp" type="number" inputmode="decimal" min="0" step="any"
      value="${d.c || ''}" placeholder="0"></label>
    <label><span>Categoría</span><select id="fCat">${cats().map(c =>
      `<option value="${c.id}" ${c.id === d.cat ? 'selected' : ''}>${c.emo} ${c.nom}</option>`).join('')}</select></label>
    <label><span>Día del mes</span><input id="fDia" type="number" inputmode="numeric" min="1" max="28"
      value="${d.diaMes || 1}"></label>
    <p class="pieNota" style="padding:6px 2px 0">El máximo es 28 para que exista en todos los meses.</p>
    ${nuevo ? '' : `<div class="opciones" id="fEstado" style="margin-top:14px">
      <button data-a="1" aria-pressed="${d.activo !== false}">Activo</button>
      <button data-a="0" aria-pressed="${d.activo === false}">Pausado</button></div>`}
    <div class="fila">
      ${nuevo ? '' : '<button class="mal" id="fBorrar">Borrar</button>'}
      <button id="fCancelar">Cancelar</button>
      <button class="ok" id="fOk">${nuevo ? 'Crear' : 'Guardar'}</button>
    </div>`,
  caja => {
    let activo = d.activo !== false;
    const $ = x => caja.querySelector(x);
    $('#fEstado')?.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      activo = b.dataset.a === '1';
      caja.querySelectorAll('#fEstado [data-a]').forEach(x =>
        x.setAttribute('aria-pressed', (x.dataset.a === '1') === activo));
    });
    $('#fCancelar').onclick = () => { cerrarHoja(); hojaFijos() };
    $('#fBorrar')?.addEventListener('click', () => {
      const it = borrar('fijos', f.id);
      cerrarHoja(); hojaFijos(); emitir();
      avisar('Gasto fijo borrado', { texto:'Deshacer',
        alPulsar: () => { restaurar('fijos', it); emitir() } });
    });
    $('#fOk').onclick = () => {
      const nom = $('#fNom').value.trim();
      const imp = parseFloat($('#fImp').value) || 0;
      if (!nom) return avisar('Ponle un concepto');
      if (imp <= 0) return avisar('El importe debe ser mayor que cero');
      const campos = { nom, c: Math.round(imp*100)/100, cat: $('#fCat').value,
                       diaMes: Math.min(28, Math.max(1, parseInt($('#fDia').value) || 1)), activo };
      nuevo ? anadir('fijos', campos) : actualizar('fijos', f.id, campos);
      cerrarHoja(); hojaFijos(); emitir();
      avisar(nuevo ? 'Gasto fijo creado' : 'Guardado');
      if (nuevo) generarFijos();
    };
  });
}

/** Notas que ya has usado, de la más repetida a la menos. Se ofrecen como
    sugerencias al escribir: casi todo el mundo repite los mismos conceptos. */
export function notasFrecuentes(prefijo = '') {
  const p = prefijo.trim().toLowerCase();
  const cuenta = new Map();
  for (const g of datos.gastos) {
    const n = (g.n || '').trim();
    if (!n || (p && !n.toLowerCase().startsWith(p))) continue;
    cuenta.set(n, (cuenta.get(n) || 0) + 1);
  }
  return [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6).map(([n]) => n);
}

/* ---------- Estado del módulo ---------- */
let sub = 'anadir', off = 0, filtro = null, busca = '', vistaMet = 'mes', anioOff = 0;
/* Rango a medida de las métricas. Por defecto, los últimos tres meses. */
let rangoDesde = null, rangoHasta = null;
let impMin = '', impMax = '';
let revisando = false;   // bandeja de gastos compartidos por revisar
let buffer = '', catSel = null, tipoSel = 'gasto', nota = '', fechaSel = null, editando = null;
/* Dónde estaba el usuario cuando entró a añadir o a editar. Al guardar vuelve
   ahí: dejarlo en el teclado con la pantalla en blanco no cierra la tarea. */
let volverA = null;
/** Nunca devuelve una categoría archivada o inexistente: si la seleccionada
    desaparece, cae en la primera disponible. */
function catActiva() {
  const lista = cats();
  if (!lista.length) return null;
  if (!catSel || !lista.some(c => c.id === catSel)) catSel = lista[0].id;
  return catSel;
}
let abierto = { nota:false, fecha:false };

export function irASub(s, desde = null) { sub = s; if (s === 'anadir') volverA = desde }

export function pintar(vista) {
  vista.innerHTML = `
    <div class="${sub === 'anadir' ? 'compacto' : 'scroll'}">
      <div class="segmentos">
        ${[['anadir','Añadir'],['lista','Movimientos'],['metricas','Métricas']].map(([id,nom]) =>
          `<button class="seg" data-sub="${id}" aria-pressed="${sub===id}">${nom}</button>`).join('')}
      </div>
      <div id="finCuerpo"></div>
    </div>`;
  vista.querySelector('.segmentos').onclick = e => {
    const b = e.target.closest('[data-sub]'); if (!b) return;
    /* Entrar a Añadir desde aquí no viene de ninguna parte: al guardar,
       lo natural es caer en Movimientos y ver el apunte recién hecho. */
    if (b.dataset.sub === 'anadir') volverA = null;
    sub = b.dataset.sub; revisando = false; pintar(vista);
  };
  const cuerpo = vista.querySelector('#finCuerpo');
  if (sub === 'anadir')   pintarAnadir(cuerpo);
  if (sub === 'lista')    pintarLista(cuerpo);
  if (sub === 'metricas') pintarMetricas(cuerpo);
}

/* ==========================================================================
   Submódulo: añadir
   ========================================================================== */
const valor = () => {
  if (!buffer) return 0;
  const [e, d=''] = buffer.split(',');
  return parseFloat((e || '0') + '.' + d.padEnd(2,'0').slice(0,2)) || 0;
};
const paraInput = ms => new Date(ms - new Date(ms).getTimezoneOffset()*60000).toISOString().slice(0,16);

function pintarAnadir(c) {
  const t = gastado(0), presu = presupuesto();
  const sel = catActiva();
  if (!sel) {
    c.innerHTML = vacio({
      titulo: 'No hay ninguna categoría activa',
      cuerpo: 'Cada movimiento necesita una categoría. Las has archivado todas, '
            + 'así que crea o reactiva alguna para poder registrar gastos.',
      accion: 'Gestionar categorías'
    });
    c.querySelector('[data-vacio]').onclick = () => hojaCategorias();
    return;
  }
  const fechaTxt = fechaSel
    ? new Date(fechaSel).toLocaleString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
    : 'Ahora';

  c.innerHTML = `
    <div class="cinta">
      <span>${nombreCiclo(0)} · <b class="num">${eur(t)}</b></span>
      <span>${(() => {
        const mal = excedidas().length;
        if (mal) return `<span class="rojo">${mal} categoría${mal===1?'':'s'} pasada${mal===1?'':'s'}</span>`;
        if (presu) return presu - t >= 0 ? `quedan ${eurN0(presu-t)}` : `${eurN0(t-presu)} de más`;
        return `${delMes(0).length} movimiento${delMes(0).length===1?'':'s'}`;
      })()}</span>
    </div>
    ${presu ? `<div class="barra"><i style="width:${Math.min(t/presu,1)*100}%"
      class="${t>presu?'pasado':''}"></i></div>` : ''}
    <div id="edCaja"></div>
    <div class="cifra ${buffer ? '' : 'cero'} ${tipoSel==='ingreso'?'ingreso':''}" id="cifra">
      ${buffer ? (tipoSel==='ingreso'?'+ ':'') + buffer + ' €' : '0,00 €'}</div>
    <div class="extras" id="extras">
      <button class="tipoSel ${tipoSel==='ingreso'?'puesto':''}" data-x="tipo" data-tipo="${tipoSel}">
        ${tipoSel==='ingreso' ? '↑ Ingreso' : '↓ Gasto'}</button>
      ${abierto.nota
        ? `<input type="text" id="inNota" maxlength="60" placeholder="Nota" value="${escapar(nota)}"
             list="notasUsadas" autocomplete="off">
           <datalist id="notasUsadas">${notasFrecuentes()
             .map(n => `<option value="${escapar(n)}">`).join('')}</datalist>`
        : `<button data-x="nota" class="${nota?'puesto':''}">${nota ? '✎ '+escapar(nota) : 'Nota'}</button>`}
      ${abierto.fecha
        ? `<input type="datetime-local" id="inFecha" max="${paraInput(Date.now())}"
             value="${paraInput(fechaSel || Date.now())}">`
        : `<button data-x="fecha" class="${fechaSel?'puesto':''}">${fechaTxt}</button>`}
    </div>
    <div class="cats" id="cats">
      ${cats().map(x => `<button class="cat" data-id="${x.id}" aria-pressed="${x.id===sel}"
        ${x.id===sel ? `style="background:${color(x.id)}"` : ''}><span>${x.emo}</span>${x.nom}</button>`).join('')}
    </div>
    <div class="teclas" id="teclas">
      ${[1,2,3,4,5,6,7,8,9,',',0,'⌫'].map(k => `<button data-k="${k}">${k}</button>`).join('')}
    </div>
    <div class="sugeridas" id="sugeridas"></div>
    <button class="principal ${tipoSel==='ingreso'?'verde':''}" id="guardar" ${valor()>0?'':'disabled'}>
      ${editando ? 'Guardar cambios' : tipoSel==='ingreso' ? 'Guardar ingreso' : 'Guardar gasto'}</button>`;

  if (editando) {
    c.querySelector('#edCaja').innerHTML =
      `<div class="editando"><span>Editando un movimiento</span>
       <button id="cancelarEd" style="padding:6px 12px">Cancelar</button></div>`;
    c.querySelector('#cancelarEd').onclick = () => { limpiar(); pintarAnadir(c) };
  }

  const iN = c.querySelector('#inNota');
  if (iN) {
    iN.oninput = e => { nota = e.target.value; pintarSugerencias(c) };
    /* El blur se retrasa: si no, tocar una sugerencia cierra el campo antes
       de que llegue el clic. */
    iN.onblur = () => setTimeout(() => {
      if (document.activeElement?.id === 'inNota') return;
      abierto.nota = false; pintarAnadir(c);
    }, 180);
    iN.focus();
    pintarSugerencias(c);
  }
  const iF = c.querySelector('#inFecha');
  if (iF) { iF.onchange = e => {
              const v = e.target.value ? new Date(e.target.value).getTime() : null;
              if (v && v > Date.now()) { avisar('Esa fecha aún no ha llegado'); return }
              fechaSel = v;
            };
            iF.onblur = () => { abierto.fecha = false; pintarAnadir(c) }; iF.focus() }

  c.querySelector('#extras').onclick = e => {
    const b = e.target.closest('button[data-x]'); if (!b) return;
    if (b.dataset.x === 'tipo') tipoSel = tipoSel === 'gasto' ? 'ingreso' : 'gasto';
    else abierto[b.dataset.x] = true;
    pintarAnadir(c);
  };
  c.querySelector('#cats').onclick = e => {
    const b = e.target.closest('.cat'); if (!b) return;
    catSel = b.dataset.id; pintarAnadir(c);
  };
  c.querySelector('#teclas').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = b.dataset.k;
    if (k === '⌫') buffer = buffer.slice(0, -1);
    else if (k === ',') { if (!buffer.includes(',')) buffer = (buffer || '0') + ',' }
    else if (!(buffer.includes(',') && buffer.split(',')[1].length >= 2) && buffer.replace(',','').length < 9)
      buffer += k;
    navigator.vibrate?.(8);
    pintarAnadir(c);
  };
  c.querySelector('#guardar').onclick = () => {
    const imp = valor(); if (imp <= 0) return;
    const campos = { c: imp, cat: catActiva(), n: nota.trim(), tipo: tipoSel };
    const destino = volverA;
    let aviso;
    if (editando) {
      actualizar('gastos', editando, { ...campos, t: fechaSel || Date.now(), revisar: false });
      aviso = ['Movimiento actualizado', null];
    } else {
      const nuevo = anadir('gastos', { ...campos, t: fechaSel || Date.now() });
      /* Al volver atrás el movimiento desaparece de la vista: el aviso lleva
         el deshacer, que es la única forma de corregir un error sin buscarlo. */
      aviso = [(tipoSel === 'ingreso' ? 'Ingreso de ' : 'Guardado ') + eur(imp),
        { texto: 'Deshacer', alPulsar: () => { borrar('gastos', nuevo.id); emitir() } }];
    }
    limpiar();
    volverA = null;
    if (destino?.modulo === 'hoy') { irA('hoy') }
    else { sub = destino?.sub || 'lista'; pintar(document.getElementById('v-finanzas')) }
    avisar(...aviso);
  };
}

function pintarSugerencias(c) {
  const caja = c.querySelector('#sugeridas');
  if (!caja) return;
  const lista = abierto.nota ? notasFrecuentes(nota).filter(n => n !== nota.trim()) : [];
  caja.innerHTML = lista.map(n =>
    `<button data-nota="${escapar(n)}">${escapar(n)}</button>`).join('');
  caja.onclick = e => {
    const b = e.target.closest('[data-nota]'); if (!b) return;
    nota = b.dataset.nota;
    abierto.nota = false;
    pintarAnadir(c);
  };
}

function limpiar() {
  buffer = ''; catSel = null; tipoSel = 'gasto'; nota = ''; fechaSel = null; editando = null;
  abierto = { nota:false, fecha:false };
}
export function editarMovimiento(id) {
  const g = datos.gastos.find(x => x.id === id); if (!g) return;
  editando = id;
  volverA = { modulo: 'finanzas', sub: 'lista' };   // se edita desde la lista
  buffer = g.c.toFixed(2).replace('.', ',').replace(/,00$/, '');
  catSel = g.cat; nota = g.n || ''; fechaSel = g.t; tipoSel = g.tipo === 'ingreso' ? 'ingreso' : 'gasto';
  abierto = { nota:false, fecha:false };
  sub = 'anadir';
}

/* ==========================================================================
   Submódulo: movimientos
   ========================================================================== */
function pintarLista(c) {
  const q = busca.trim().toLowerCase();
  const min = parseFloat(String(impMin).replace(',', '.'));
  const max = parseFloat(String(impMax).replace(',', '.'));
  const hayRango = isFinite(min) || isFinite(max);
  const buscando = !!q || hayRango;

  /* Con cualquier filtro activo se ignora el mes: lo que quieres es
     encontrarlo, esté donde esté. */
  let gs = revisando ? porRevisar() : buscando ? datos.gastos : delMes(off);
  if (q) gs = gs.filter(g => (g.n || '').toLowerCase().includes(q) ||
      cat(g.cat).nom.toLowerCase().includes(q) || g.c.toFixed(2).replace('.', ',').includes(q));
  if (isFinite(min)) gs = gs.filter(g => g.c >= min);
  if (isFinite(max)) gs = gs.filter(g => g.c <= max);
  const presentes = catsTodas().filter(x => gs.some(g => g.cat === x.id && !esIngreso(g)));
  if (filtro && !presentes.some(x => x.id === filtro)) filtro = null;

  if (revisando) {
    const total = gs.reduce((t, g) => t + g.c, 0);
    c.innerHTML = `
      <div class="bandeja">
        <div><b>Por revisar</b>
          <small>${gs.length} gasto${gs.length === 1 ? '' : 's'} de la tarjeta compartida ·
            tu parte ${eurN(total)}</small></div>
        <button id="salirRev" aria-label="Salir de la revisión" data-tip="Salir">✕</button>
      </div>
      <p class="pieNota" style="padding:6px 4px 0">Toca uno para corregirlo; al guardarlo queda
        revisado. Con ✓ lo das por bueno tal cual.</p>
      ${gs.length > 1 ? '<button class="principal" id="okTodos">Confirmar todos</button>' : ''}
      <div id="cuerpo"></div>`;
    c.querySelector('#salirRev').onclick = () => { revisando = false; pintarLista(c) };
    c.querySelector('#okTodos')?.addEventListener('click', () => {
      const ids = gs.map(g => g.id);
      enLote(() => ids.forEach(id => actualizar('gastos', id, { revisar: false })));
      revisando = false;
      avisar(`${ids.length} gastos confirmados`);
      emitir();
    });
    if (!gs.length) {
      c.querySelector('#cuerpo').innerHTML = vacio({
        titulo: 'Nada pendiente de revisar',
        cuerpo: 'Aquí caen los gastos que entran solos desde la tarjeta compartida. '
              + 'Ahora mismo no queda ninguno por confirmar.'
      });
      return;
    }
  } else c.innerHTML = `
    <div class="buscador">
      <label for="buscar">Buscar movimientos</label>
      <input id="buscar" type="search" placeholder="Concepto, categoría o importe"
        value="${escapar(busca)}" autocapitalize="off" autocorrect="off">
    </div>
    <div class="rango">
      <label for="impMin">Desde
        <input id="impMin" type="number" inputmode="decimal" min="0" step="any"
          placeholder="0 €" value="${escapar(impMin)}"></label>
      <label for="impMax">Hasta
        <input id="impMax" type="number" inputmode="decimal" min="0" step="any"
          placeholder="Sin límite" value="${escapar(impMax)}"></label>
      ${buscando ? `<button id="limpiar" aria-label="Quitar los filtros de búsqueda"
        data-tip="Quitar filtros">✕</button>` : ''}
    </div>
    <div class="navmes ${buscando ? 'oculto' : ''}" id="nav"></div>
    <div class="filtros" id="filtros"></div>
    <div id="cuerpo"></div>`;

  /* Se repinta en cada tecla, así que hay que devolver el foco y el cursor. */
  const vivo = (id, alCambiar) => {
    const el = c.querySelector(id);
    el.oninput = e => {
      const pos = e.target.selectionStart;
      alCambiar(e.target.value);
      pintarLista(c);
      const nuevo = c.querySelector(id);
      if (!nuevo) return;
      nuevo.focus();
      try { nuevo.setSelectionRange(pos, pos) } catch { /* los number no lo admiten */ }
    };
  };
  if (!revisando) {
    vivo('#buscar', v => busca = v);
    vivo('#impMin', v => impMin = v);
    vivo('#impMax', v => impMax = v);
  }
  c.querySelector('#limpiar')?.addEventListener('click', () => {
    busca = ''; impMin = ''; impMax = ''; pintarLista(c);
  });

  if (!revisando) {
  if (!buscando) navMes(c.querySelector('#nav'), off,
    n => { off = n; pintarLista(c) },
    datos.gastos.length ? Math.min(...datos.gastos.map(g => g.t)) : Date.now(),
    cicloDia() ? 'ciclo' : 'mes');

  c.querySelector('#filtros').innerHTML = presentes.length > 1
    ? `<button class="chip" data-f="" aria-pressed="${!filtro}">Todo</button>` +
      presentes.map(x => `<button class="chip" data-f="${x.id}" aria-pressed="${filtro===x.id}"
        ${filtro===x.id ? `style="background:${color(x.id)};border-color:transparent;color:#fff"` : ''}
        >${x.emo} ${x.nom}</button>`).join('')
    : '';
  c.querySelector('#filtros').onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    filtro = b.dataset.f || null; pintarLista(c);
  };
  }

  const vis = filtro ? gs.filter(g => g.cat === filtro) : gs;
  const cuerpo = c.querySelector('#cuerpo');
  if (!vis.length) {
    cuerpo.innerHTML = buscando
      ? vacio({
          titulo: 'Ningún movimiento cumple esos filtros',
          cuerpo: 'Prueba con otro texto o ensancha el rango de importe.',
          accion: 'Quitar los filtros'
        })
      : vacio({
          titulo: `Sin movimientos en ${nombreCiclo(off).toLowerCase()}`,
          cuerpo: 'Cuando registres un gasto o un ingreso de este mes aparecerá aquí, '
                + 'agrupado por día.',
          accion: 'Añadir un movimiento'
        });
    cuerpo.querySelector('[data-vacio]').onclick = () => {
      if (buscando) { busca = ''; impMin = ''; impMax = ''; filtro = null; pintarLista(c); return }
      sub = 'anadir'; pintar(document.getElementById('v-finanzas'));
    };
    return;
  }

  /* Con filtros activos, el recuento y el total de lo encontrado es lo primero
     que quieres saber: «¿cuánto llevo gastado en cafés este año?». */
  const resumen = buscando && !revisando ? (() => {
    const sale = vis.filter(g => !esIngreso(g)).reduce((s,g) => s + g.c, 0);
    const entra = vis.filter(esIngreso).reduce((s,g) => s + g.c, 0);
    const media = sale / Math.max(1, vis.filter(g => !esIngreso(g)).length);
    return `<div class="resultado">
      <span>${vis.length} resultado${vis.length === 1 ? '' : 's'} en todo el histórico${
        sale ? ` · media ${eur(media)}` : ''}</span>
      <b class="num">${eur(sale)}${entra ? ` · +${eur(entra)}` : ''}</b></div>`;
  })() : '';

  const hoy = dia();
  const dias = {};
  [...vis].sort((a,b) => b.t - a.t).forEach(g => (dias[dia(g.t)] ||= []).push(g));

  cuerpo.innerHTML = resumen + Object.entries(dias).map(([d, gs2]) => {
    const neto = gs2.reduce((s,g) => s + (esIngreso(g) ? g.c : -g.c), 0);
    const etq = d === hoy ? 'Hoy'
      : new Date(gs2[0].t).toLocaleDateString('es-ES',{weekday:'long', day:'numeric', month:'short'});
    return `<div class="dia-cab"><span>${etq}</span>
        <span class="num">${neto >= 0 ? '+' : ''}${eur(Math.abs(neto))}</span></div>
      <ul class="filas">${gs2.map(g => {
        const x = cat(g.cat), ing = esIngreso(g);
        return `<li data-id="${g.id}">
          <div class="punto" style="background:${ing ? colorVar('ingreso') : color(x.id)}22">
            ${ing ? '↑' : x.emo}</div>
          <div class="txt"><b>${g.n ? escapar(g.n) : (ing ? 'Ingreso' : x.nom)}</b>
            <small>${g.fijo ? '<span class="fijo">fijo</span>' : ''}${
              g.revisar ? '<span class="fijo rev">revisar</span>' : ''}${
              g.compartido ? `½ de ${eur(g.total || g.c * g.compartido)}${
              g.quien ? ' · ' + escapar(g.quien) : ''} · ` : ''}${
              g.n ? (ing ? 'Ingreso' : x.nom) + ' · ' : ''}${new Date(g.t)
              .toLocaleDateString('es-ES',{day:'numeric',month:'short'})} · ${new Date(g.t)
              .toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</small></div>
          ${g.pend && nube ? '<div class="subir"></div>' : ''}
          <div class="imp num ${ing ? 'ingreso' : ''}">${ing ? '+' : ''}${eur(g.c)}</div>
          ${revisando ? `<button class="confirmar" data-ok="${g.id}" aria-label="Confirmar este gasto" data-tip="Confirmar">✓</button>` : ''}
          <button class="borrar" data-borrar="${g.id}" aria-label="Borrar este movimiento" data-tip="Borrar">✕</button>
        </li>`;
      }).join('')}</ul>`;
  }).join('');

  /* Pulsación larga sobre una fila: repetir ese movimiento con la fecha de hoy.
     El café de todos los días deja de necesitar teclado. */
  let temporizador = null, largo = false;
  const cancelar = () => { clearTimeout(temporizador); temporizador = null };
  cuerpo.addEventListener('pointerdown', e => {
    const fila = e.target.closest('li[data-id]');
    if (!fila || e.target.closest('[data-borrar]')) return;
    largo = false;
    temporizador = setTimeout(() => {
      largo = true;
      navigator.vibrate?.(20);
      repetir(fila.dataset.id);
    }, 550);
  });
  ['pointerup','pointercancel','pointerleave'].forEach(ev =>
    cuerpo.addEventListener(ev, cancelar));
  cuerpo.addEventListener('scroll', cancelar, true);

  cuerpo.onclick = e => {
    if (largo) { largo = false; return }   // la pulsación larga ya actuó
    const okBtn = e.target.closest('[data-ok]');
    if (okBtn) {
      actualizar('gastos', okBtn.dataset.ok, { revisar: false });
      if (!porRevisar().length) revisando = false;
      emitir();
      return;
    }
    const del = e.target.closest('[data-borrar]');
    if (del) {
      const it = borrar('gastos', del.dataset.borrar);
      if (it) avisar('Movimiento borrado',
        { texto:'Deshacer', alPulsar: () => { restaurar('gastos', it); avisar('Recuperado') } });
      return;
    }
    const fila = e.target.closest('li[data-id]');
    if (fila) { editarMovimiento(fila.dataset.id); emitir() }
  };
}

/* ==========================================================================
   Submódulo: métricas
   ========================================================================== */
/** Crea una copia de un movimiento con la fecha de ahora. */
export function repetir(id) {
  const g = datos.gastos.find(x => x.id === id);
  if (!g) return;
  const nuevo = anadir('gastos',
    { c: g.c, cat: g.cat, n: g.n || '', tipo: g.tipo || 'gasto', t: Date.now() });
  avisar('Repetido ' + eur(g.c), { texto:'Deshacer',
    alPulsar: () => { borrar('gastos', nuevo.id); emitir() } });
  emitir();
}

function pintarMetricas(c) {
  if (!rangoDesde) {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    rangoDesde = dia(d.getTime()); rangoHasta = dia();
  }
  c.innerHTML = `
    <div class="opciones" id="metSegs" style="margin-top:10px">
      <button data-v="mes" aria-pressed="${vistaMet==='mes'}">Mes</button>
      <button data-v="ano" aria-pressed="${vistaMet==='ano'}">Año</button>
      <button data-v="rango" aria-pressed="${vistaMet==='rango'}">A medida</button>
    </div>
    <div id="metCuerpo"></div>`;
  c.querySelector('#metSegs').onclick = e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    vistaMet = b.dataset.v; pintarMetricas(c);
  };
  const caja = c.querySelector('#metCuerpo');
  if (vistaMet === 'ano')   return pintarAnio(caja);
  if (vistaMet === 'rango') return pintarRango(caja);
  pintarMes(caja);
}

/* ---------- Métricas de un periodo cualquiera ----------
   El mes y el año tienen métricas que solo tienen sentido en ellos (lo que
   queda de presupuesto, la proyección a fin de mes). Un rango arbitrario no:
   aquí se enseña lo que se puede calcular de verdad para dos fechas sueltas. */
function pintarRango(c) {
  c.innerHTML = `
    <div class="rango" style="padding:12px 0 4px">
      <label for="rgD">Desde<input id="rgD" type="date" max="${dia()}" value="${rangoDesde}"></label>
      <label for="rgH">Hasta<input id="rgH" type="date" max="${dia()}" value="${rangoHasta}"></label>
    </div>
    <div class="opciones" id="rgAtajos" style="margin-bottom:4px">
      <button data-d="30">30 días</button>
      <button data-d="90">3 meses</button>
      <button data-d="180">6 meses</button>
      <button data-d="365">12 meses</button>
    </div>
    <div id="rgCuerpo"></div>`;

  /* «30 días» son treinta contando hoy, no treinta y uno: el rango incluye
     ambos extremos, así que se retrocede uno menos. */
  const atajo = n => {
    const d = new Date(); d.setDate(d.getDate() - (n - 1));
    rangoDesde = dia(d.getTime()); rangoHasta = dia();
    pintarRango(c);
  };
  c.querySelector('#rgAtajos').onclick = e => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    atajo(parseInt(b.dataset.d));
  };
  c.querySelector('#rgD').onchange = e => { rangoDesde = e.target.value; pintarRango(c) };
  c.querySelector('#rgH').onchange = e => { rangoHasta = e.target.value; pintarRango(c) };

  const cuerpo = c.querySelector('#rgCuerpo');
  if (rangoDesde > rangoHasta) {
    cuerpo.innerHTML = vacio({
      titulo: 'Las fechas están del revés',
      cuerpo: 'La fecha de inicio es posterior a la de fin. Cámbialas y saldrán las cuentas.' });
    return;
  }

  const a = desdeDia(rangoDesde).getTime();
  const b = desdeDia(rangoHasta).getTime() + 86399999;
  const gs = datos.gastos.filter(g => g.t >= a && g.t <= b);
  /* Se mide de inicio de día a inicio de día: contar hasta el final del último
     da 0,99999 días de más, que al redondear se convierte en uno entero. */
  const dias = Math.round(
    (desdeDia(rangoHasta).getTime() - a) / 86400000) + 1;

  if (!gs.length) {
    cuerpo.innerHTML = vacio({
      titulo: 'Sin movimientos en esas fechas',
      cuerpo: `No hay nada registrado entre el ${desdeDia(rangoDesde)
        .toLocaleDateString('es-ES', { day:'numeric', month:'long' })} y el ${desdeDia(rangoHasta)
        .toLocaleDateString('es-ES', { day:'numeric', month:'long' })}.` });
    return;
  }

  const sale  = gs.filter(g => !esIngreso(g)).reduce((s, g) => s + g.c, 0);
  const entra = gs.filter(esIngreso).reduce((s, g) => s + g.c, 0);
  const porCat = cats().map(x => ({
    ...x, s: gs.filter(g => !esIngreso(g) && g.cat === x.id).reduce((s, g) => s + g.c, 0),
  })).filter(x => x.s > 0).sort((x, y) => y.s - x.s);
  const sinGasto = new Set(gs.filter(g => !esIngreso(g)).map(g => dia(g.t))).size;

  cuerpo.innerHTML = `
    <div class="panel">
      <div class="subtitulo" style="padding:0 0 6px">${dias} día${dias === 1 ? '' : 's'}</div>
      <div class="granCifra num">${eur(sale)}</div>
      <div class="delta">gastado${entra ? `, y <span class="num">${eur(entra)}</span>
        de ingresos` : ''}</div>
    </div>

    <div class="rejilla">
      <div class="mini"><b class="num">${eur(sale / dias)}</b><small>al día</small></div>
      <div class="mini"><b class="num">${eur0(sale / (dias / 30.44))}</b><small>al mes</small></div>
      <div class="mini"><b class="num ${entra - sale < 0 ? 'rojo' : ''}">${
        eur0(entra - sale)}</b><small>balance</small></div>
      <div class="mini"><b class="num">${dias - sinGasto}</b><small>días sin gastar</small></div>
    </div>

    ${porCat.length ? `<div class="rotulo">En qué se te fue</div>
      ${porCat.map(x => `<div class="filaCat">
        <span>${x.emo} ${escapar(x.nom)}</span>
        <span class="num">${eur(x.s)}</span>
        <span class="pct num">${Math.round((x.s / sale) * 100)}%</span>
        <div class="barra"><i style="width:${(x.s / porCat[0].s) * 100}%;
          background:${color(x.id)}"></i></div>
      </div>`).join('')}` : ''}`;
}

function pintarMes(c) {
  c.innerHTML = `<div class="navmes" id="nav"></div><div id="cuerpo"></div>`;
  navMes(c.querySelector('#nav'), off,
    n => { off = n; pintarMes(c) },
    datos.gastos.length ? Math.min(...datos.gastos.map(g => g.t)) : Date.now(),
    cicloDia() ? 'ciclo' : 'mes');

  const gs = delMes(off);
  const cuerpo = c.querySelector('#cuerpo');
  if (!gs.length) {
    cuerpo.innerHTML = vacio({
      titulo: `Sin datos en ${nombreCiclo(off).toLowerCase()}`,
      cuerpo: 'Las métricas del mes necesitan al menos un movimiento. '
            + 'Cambia de mes con las flechas de arriba o registra uno.'
    });
    return;
  }

  const total = gastado(off), entra = ingresado(off), presu = presupuesto();
  const prev = gastado(off - 1);
  const delta = prev > 0 ? ((total - prev) / prev) * 100 : null;
  const enCurso = off === 0;
  const diasMes = diasCiclo(off);
  /* Con mes contable, «los días que llevas» se cuentan desde el inicio del
     ciclo, no desde el 1 del calendario. */
  const diasPasados = enCurso
    ? Math.min(diasMes, Math.floor((Date.now() - inicioCiclo(off).getTime()) / 86400000) + 1)
    : diasMes;
  const media = total / diasPasados;
  /* La proyección se calla los primeros días: con dos o tres datos es ruido.
     Los gastos fijos no se promedian: se suman enteros una sola vez. */
  const proyectable = !enCurso || diasPasados >= 7;
  const fijoMes = totalFijos(off);
  const mediaVar = (total - fijoMes) / diasPasados;
  const proyeccion = mediaVar * diasMes + fijoMes;

  const porDia = {};
  gs.filter(g => !esIngreso(g)).forEach(g => { const k = dia(g.t); porDia[k] = (porDia[k]||0) + g.c });
  const top = Object.entries(porDia).sort((a,b) => b[1]-a[1])[0];
  /* Días sin gastar: métrica clásica de las apps de presupuesto, y la única
     que mide una decisión en vez de una cantidad. */
  const sinGastar = diasPasados - Object.keys(porDia).length;
  /* Un mes suelto es ruido; la media de los tres anteriores es mejor vara. */
  const trimestre = [1,2,3].map(i => gastado(off - i)).filter(x => x > 0);
  const mediaPrev = trimestre.length
    ? trimestre.reduce((s,x) => s+x, 0) / trimestre.length : null;
  const esfuerzo = entra > 0 ? Math.round((total / entra) * 100) : null;
  const ratioFijo = total > 0 ? Math.round((fijoMes / total) * 100) : 0;

  /* Cada categoría se mide contra su propio límite; si no tiene, contra el
     presupuesto del mes, y si tampoco lo hay, contra el gasto total. */
  const referencia = presu || total;
  const porCat = catsTodas().map(x => ({...x,
      s: gs.filter(g => g.cat===x.id && !esIngreso(g)).reduce((s,g) => s+g.c, 0),
      tope: topeCat(x.id) }))
    .filter(x => x.s > 0 || x.tope > 0)
    .sort((a,b) => b.s - a.s);
  const pasadas = porCat.filter(x => x.tope && x.s > x.tope).length;

  cuerpo.innerHTML = `
    <div class="panel">
      <div class="granCifra num">${eur(total)}</div>
      <div class="delta">${delta === null ? 'Sin mes anterior con el que comparar'
        : (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta).toFixed(0) + '% respecto a ' +
          nombreCiclo(off-1).split(' ')[0].toLowerCase()}</div>
      ${mediaPrev ? `<div class="delta">${total > mediaPrev ? '▲ ' : '▼ '}${
        Math.abs(Math.round(((total - mediaPrev)/mediaPrev)*100))}% respecto a ${
          trimestre.length === 1 ? 'el mes anterior'
          : `tu media de los últimos ${trimestre.length} meses`
        } <span class="num">(${eur0(mediaPrev)})</span></div>` : ''}
      ${presu ? `<div class="barra" style="margin-top:14px"><i class="${total>presu?'pasado':''}"
          style="width:${Math.min(total/presu,1)*100}%"></i></div>
        <div class="delta">${total <= presu
          ? `Te quedan ${eurN0(presu-total)} de los ${eurN0(presu)} del mes`
          : `Has pasado el presupuesto en ${eur0(total-presu)}`}</div>` : ''}
    </div>

    ${entra > 0 ? `<div class="rejilla">
      <div class="mini"><b class="num" style="color:var(--ingreso)">${eur0(entra)}</b><small>ingresos</small></div>
      <div class="mini"><b class="num" style="${entra-total<0?'color:var(--alerta)':''}">
        ${entra-total>=0?'+':''}${eur0(entra-total)}</b><small>balance del mes</small></div>
      <div class="mini"><b class="num">${Math.max(0,Math.round((1-total/entra)*100))}%</b>
        <small>de lo que entra, ahorrado</small></div>
      <div class="mini"><b class="num ${esfuerzo > 100 ? 'rojo' : ''}">${esfuerzo}%</b>
        <small>de tus ingresos, gastado</small></div>
    </div>
    <div class="rejilla">
      <div class="mini"><b class="num">${eur0(media)}</b><small>gasto al día</small></div>
      <div class="mini"><b class="num">${sinGastar}</b><small>días sin gastar</small></div>
      <div class="mini"><b class="num">${ratioFijo}%</b><small>del gasto es fijo</small></div>
      <div class="mini"><b class="num">${proyectable ? eur0(proyeccion) : '—'}</b>
        <small>${proyectable ? 'proyección a fin de mes' : 'proyección desde el día 7'}</small></div>
    </div>` : `<div class="rejilla">
      <div class="mini"><b class="num">${eur0(media)}</b><small>al día de media</small></div>
      <div class="mini"><b class="num">${sinGastar}</b><small>días sin gastar</small></div>
      <div class="mini"><b class="num">${eur0(top[1])}</b><small>el ${new Date(desdeClave(top[0]))
        .toLocaleDateString('es-ES',{day:'numeric',month:'short'})}, el día más caro</small></div>
      <div class="mini"><b class="num">${proyectable ? eur0(proyeccion) : '—'}</b>
        <small>${enCurso ? (proyectable ? 'proyección a fin de mes' : 'proyección desde el día 7')
                         : 'gasto medio del mes'}</small></div>
    </div>
    ${fijoMes ? `<p class="pieNota">${eur0(fijoMes)} de gasto fijo, el ${ratioFijo}% del total.
      Lo variable, que es donde puedes actuar, son ${eur0(total - fijoMes)}.</p>` : ''}`}

    <div class="panel">
      <div class="rotulo">En qué se te va${
        pasadas ? ` · <span class="rojo">${pasadas} categoría${pasadas===1?'':'s'} pasada${
          pasadas===1?'':'s'}</span>` : ''}</div>
      <div class="pieNota" style="padding:2px 0 0">Las categorías sin límite propio se miden
        sobre ${presu ? 'el presupuesto del mes' : 'el gasto total'}.</div>
      ${porCat.map(x => {
        const base = x.tope || referencia;
        const rel = base ? Math.min(x.s / base, 1) * 100 : 0;
        const mal = x.tope && x.s > x.tope;
        return `<div class="filaCat">
          <span>${x.emo} ${x.nom}${x.tope ? ` <small class="tope num">de ${eur0(x.tope)}</small>` : ''}</span>
          <span class="num">${eur(x.s)}</span>
          <div class="barra"><i class="${mal ? 'pasado' : ''}"
            style="width:${rel}%;background:${mal ? '' : color(x.id)}"></i></div>
          <span class="pct num ${mal ? 'rojo' : ''}">${x.tope
            ? (mal ? `${eurN0(x.s - x.tope)} de más` : `quedan ${eurN0(x.tope - x.s)}`)
            : base ? ((x.s/base)*100).toFixed(0) + '%' : '—'}</span>
        </div>`;
      }).join('')}
    </div>

    <div class="panel">
      <div class="rotulo">Últimos seis meses</div>
      ${grafMeses()}
    </div>`;
}
const desdeClave = s => { const [a,m,d] = s.split('-').map(Number); return new Date(a, m-1, d) };

/* ==========================================================================
   Métricas del año
   ========================================================================== */
function pintarAnio(c) {
  const anio = new Date().getFullYear() + anioOff;
  const primero = datos.gastos.length ? Math.min(...datos.gastos.map(g => g.t)) : Date.now();
  const gs = delAnio(anioOff);

  c.innerHTML = `<div class="navmes" id="navA"></div><div id="cuerpoA"></div>`;
  const nav = c.querySelector('#navA');
  nav.innerHTML = `
    <button data-d="-1" ${new Date(anio,0,1).getTime() > primero ? '' : 'disabled'}
      aria-label="Ver el año anterior" data-tip="Año anterior">‹</button>
    <b>${anio}</b>
    <button data-d="1" ${anioOff < 0 ? '' : 'disabled'} aria-label="Ver el año siguiente" data-tip="Año siguiente">›</button>`;
  nav.onclick = e => {
    const b = e.target.closest('button[data-d]');
    if (b && !b.disabled) { anioOff += parseInt(b.dataset.d); pintarAnio(c) }
  };

  const cuerpo = c.querySelector('#cuerpoA');
  if (!gs.length) {
    cuerpo.innerHTML = vacio({
      titulo: `Sin movimientos en ${anio}`,
      cuerpo: 'No hay nada registrado en este año. Prueba con otro año desde las flechas.'
    });
    return;
  }

  const total = gastadoAnio(anioOff), entra = ingresadoAnio(anioOff);
  const prev  = gastadoAnio(anioOff - 1);
  const delta = prev > 0 ? ((total - prev) / prev) * 100 : null;

  /* Meses con datos: el año en curso solo lleva los transcurridos. */
  const enCurso = anioOff === 0;
  const mesesVividos = enCurso ? new Date().getMonth() + 1 : 12;
  const porMes = Array.from({length: 12}, (_, m) => ({
    m, etq: new Date(anio, m, 1).toLocaleDateString('es-ES',{month:'narrow'}),
    v: gastado(offDeMes(m, anioOff)),
  }));
  const conGasto = porMes.filter(x => x.v > 0);
  const caro  = conGasto.length ? conGasto.reduce((a,b) => b.v > a.v ? b : a) : null;
  const barato = conGasto.length ? conGasto.reduce((a,b) => b.v < a.v ? b : a) : null;
  const nomMes = m => new Date(anio, m, 1).toLocaleDateString('es-ES',{month:'long'});

  const porCat = catsTodas().map(x => ({...x,
      s: gs.filter(g => g.cat === x.id && !esIngreso(g)).reduce((s,g) => s+g.c, 0) }))
    .filter(x => x.s > 0).sort((a,b) => b.s - a.s);

  /* Meses cerrados en positivo y reparto fijo/variable: dos lecturas que un
     total anual esconde. */
  let enVerde = 0, conDatos = 0;
  for (let m = 0; m < mesesVividos; m++) {
    const o = offDeMes(m, anioOff);
    const g = gastado(o), i = ingresado(o);
    if (g || i) { conDatos++; if (i - g > 0) enVerde++ }
  }
  const fijoAnio = gs.filter(g => g.fijo && !esIngreso(g)).reduce((s,g) => s+g.c, 0);
  const presu = presupuesto();
  const bajoPresu = presu ? Array.from({length: mesesVividos}, (_, m) =>
    gastado(offDeMes(m, anioOff))).filter(v => v > 0 && v <= presu).length : null;

  cuerpo.innerHTML = `
    <div class="panel">
      <div class="granCifra num">${eur(total)}</div>
      <div class="delta">${delta === null
        ? `Gastado en ${anio}` + (enCurso ? ` · ${mesesVividos} ${mesesVividos===1?'mes':'meses'}` : '')
        : (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta).toFixed(0) + '% respecto a ' + (anio-1)}</div>
    </div>

    <div class="rejilla">
      <div class="mini"><b class="num">${eur0(total / mesesVividos)}</b><small>al mes de media</small></div>
      <div class="mini"><b class="num">${gs.length}</b><small>movimientos</small></div>
      ${caro ? `<div class="mini"><b class="num">${eur0(caro.v)}</b>
        <small>${nomMes(caro.m)}, el mes más caro</small></div>` : ''}
      ${barato && barato.m !== caro.m ? `<div class="mini"><b class="num">${eur0(barato.v)}</b>
        <small>${nomMes(barato.m)}, el más contenido</small></div>`
        : `<div class="mini"><b class="num">${eur0(total / Math.max(1, gs.length))}</b>
        <small>gasto medio</small></div>`}
    </div>

    ${entra > 0 ? `<div class="rejilla">
      <div class="mini"><b class="num" style="color:var(--ingreso)">${eur0(entra)}</b>
        <small>ingresos del año</small></div>
      <div class="mini"><b class="num" style="${entra-total<0?'color:var(--alerta)':''}">
        ${entra-total>=0?'+':''}${eur0(entra-total)}</b><small>balance</small></div>
      <div class="mini"><b class="num">${Math.max(0, Math.round((1-total/entra)*100))}%</b>
        <small>de lo que entra, ahorrado</small></div>
      <div class="mini"><b class="num">${enVerde}/${conDatos}</b>
        <small>meses cerrados en positivo</small></div>
    </div>` : ''}

    ${fijoAnio || bajoPresu !== null ? `<div class="rejilla">
      ${fijoAnio ? `<div class="mini"><b class="num">${eur0(fijoAnio)}</b>
          <small>gasto fijo del año</small></div>
        <div class="mini"><b class="num">${eur0(total - fijoAnio)}</b>
          <small>gasto variable</small></div>` : ''}
      ${bajoPresu !== null ? `<div class="mini"><b class="num">${bajoPresu}/${mesesVividos}</b>
        <small>meses dentro del presupuesto</small></div>` : ''}
      ${entra > 0 ? `<div class="mini"><b class="num">${eur0((entra-total)/mesesVividos)}</b>
        <small>ahorro mensual medio</small></div>` : ''}
    </div>` : ''}

    <div class="panel">
      <div class="rotulo">Gasto mes a mes</div>
      ${grafAnio(porMes, enCurso ? new Date().getMonth() : 11)}
    </div>

    <div class="panel">
      <div class="rotulo">En qué se te fue el año</div>
      ${porCat.map(x => `<div class="filaCat">
        <span>${x.emo} ${x.nom}</span><span class="num">${eur(x.s)}</span>
        <div class="barra"><i style="width:${(x.s/total)*100}%;background:${color(x.id)}"></i></div>
        <span class="pct num">${((x.s/total)*100).toFixed(0)}% · ${eur0(x.s/mesesVividos)}/mes</span>
      </div>`).join('')}
    </div>`;
}

function grafAnio(serie, ultimo) {
  const max = Math.max(...serie.map(s => s.v), 1);
  const an = 100 / 12, ancho = an * 0.6;
  return `<svg class="graf" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    ${serie.map((s,i) => {
      const h = (s.v / max) * 100;
      return `<rect x="${i*an + (an-ancho)/2}" y="${100-h}" width="${ancho}"
        height="${Math.max(h, 1.2)}" fill="${i > ultimo ? 'transparent' : 'var(--ink)'}"
        opacity="${i > ultimo ? '.15' : i === ultimo ? '1' : '.6'}"/>`;
    }).join('')}
  </svg>
  <div style="display:flex;margin-top:8px">
    ${serie.map((s,i) => `<div style="flex:1;text-align:center;font-size:var(--t-meta);line-height:1.4;
      color:var(--muted)${i === ultimo ? ';color:var(--ink);font-weight:600' : ''}">
      ${s.etq}<br><span class="num">${s.v ? Math.round(s.v/1000 >= 1 ? s.v/1000 : s.v)
        + (s.v >= 1000 ? 'k' : '') : '—'}</span></div>`).join('')}
  </div>`;
}

function grafMeses() {
  const serie = [];
  for (let i = 5; i >= 0; i--) {
    const o = off - i;
    serie.push({ etq: nombreCiclo(o).split(' ')[0].slice(0,3).toLowerCase(),
                 v: gastado(o), activo: i === 0 });
  }
  const max = Math.max(...serie.map(s => s.v), 1);
  const an = 100 / serie.length, ancho = an * 0.52;
  return `<svg class="graf" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    ${serie.map((s,i) => {
      const h = (s.v/max)*100;
      return `<rect x="${i*an + (an-ancho)/2}" y="${100-h}" width="${ancho}"
        height="${Math.max(h,1.2)}" fill="${s.activo ? 'var(--ink)' : 'var(--hueco)'}"/>`;
    }).join('')}</svg>
  <div style="display:flex;margin-top:8px">
    ${serie.map(s => `<div style="flex:1;text-align:center;font-size:var(--t-meta);line-height:1.5;
      color:var(--muted)${s.activo ? ';color:var(--ink);font-weight:500' : ''}">
      ${s.etq}<br><span class="num">${s.v ? eur0(s.v) : '—'}</span></div>`).join('')}
  </div>`;
}

/* ==========================================================================
   Importador de CSV
   ========================================================================== */
export function hojaImportarCSV() {
  abrirHoja(`
    <h3>Importar CSV</h3>
    <p class="pieNota" style="padding:0 0 6px">Columnas: <b>fecha;importe;categoria;nota;tipo</b>.
    Las dos últimas son opcionales. Separador punto y coma o coma. Pega el contenido del archivo.</p>
    <textarea id="csvTxt" placeholder="fecha;importe;categoria;nota&#10;06/09/2026;12,40;comida;Menú del día"></textarea>
    <div id="csvPrevia" class="estado"></div>
    <div class="fila"><button id="csvCancelar">Cancelar</button>
      <button class="ok" id="csvImportar">Analizar</button></div>`,
  caja => {
    let listos = null;
    caja.querySelector('#csvCancelar').onclick = cerrarHoja;
    caja.querySelector('#csvImportar').onclick = () => {
      const btn = caja.querySelector('#csvImportar');
      if (!listos) {
        const r = analizarCSV(caja.querySelector('#csvTxt').value);
        caja.querySelector('#csvPrevia').innerHTML = r.error ? r.error
          : `${r.filas.length} movimientos listos${r.duplicados ? `, ${r.duplicados} repetidos que se omiten` : ''}` +
            `${r.fallos ? `, ${r.fallos} líneas ilegibles` : ''}.` +
            (r.filas.length ? `<br>Primero: ${escapar(r.filas[0].n || cat(r.filas[0].cat).nom)} ·
              ${eur(r.filas[0].c)} · ${new Date(r.filas[0].t).toLocaleDateString('es-ES')}` : '');
        if (r.filas?.length) { listos = r.filas; btn.textContent = `Importar ${r.filas.length}` }
        return;
      }
      enLote(() => listos.forEach(f => anadir('gastos', f)));
      cerrarHoja();
      avisar(`Importados ${listos.length} movimientos`);
    };
  });
}

/** Acepta punto y coma o coma como separador, y fechas dd/mm/aaaa o aaaa-mm-dd. */
export function analizarCSV(texto) {
  const lineas = texto.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lineas.length) return { error: 'No hay nada que analizar' };

  const sep = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ';' : ',';
  const cabecera = lineas[0].toLowerCase();
  const tieneCabecera = /fecha|importe|cantidad/.test(cabecera);
  const cols = tieneCabecera ? lineas[0].split(sep).map(s => s.trim().toLowerCase()) : null;
  const idx = n => cols ? cols.findIndex(c => c.includes(n)) : -1;
  const iF = tieneCabecera ? idx('fecha') : 0;
  const iI = tieneCabecera ? (idx('importe') >= 0 ? idx('importe') : idx('cantidad')) : 1;
  const iC = tieneCabecera ? idx('categ') : 2;
  const iN = tieneCabecera ? idx('nota') : 3;
  const iT = tieneCabecera ? idx('tipo')  : 4;
  if (iF < 0 || iI < 0) return { error: 'No encuentro las columnas de fecha e importe' };

  const existentes = new Set(datos.gastos.map(g => `${dia(g.t)}|${g.c.toFixed(2)}`));
  const filas = []; let fallos = 0, duplicados = 0;

  for (const linea of lineas.slice(tieneCabecera ? 1 : 0)) {
    const p = linea.split(sep).map(s => s.trim().replace(/^"|"$/g, ''));
    const ms = fecha(p[iF]);
    const imp = Math.abs(Number(String(p[iI] ?? '').replace(/[^\d,.-]/g,'').replace(',', '.')));
    if (!ms || !isFinite(imp) || imp <= 0) { fallos++; continue }
    const clave = `${dia(ms)}|${imp.toFixed(2)}`;
    if (existentes.has(clave)) { duplicados++; continue }
    existentes.add(clave);
    const catBruta = (p[iC] || '').toLowerCase();
    filas.push({
      c: Math.round(imp*100)/100,
      cat: porNombre(catBruta) || adivinarCat(p[iN] || p[iC] || ''),
      n: (p[iN] || '').slice(0, 60),
      ...(p[iN] ? { com: p[iN].slice(0, 80) } : {}),
      tipo: /ingreso|abono|nomina|nómina/i.test(p[iT] || p[iN] || '') ? 'ingreso' : 'gasto',
      t: ms,
    });
  }
  if (!filas.length) {
    return duplicados
      ? { error: `Las ${duplicados} líneas legibles ya las tenías registradas.` }
      : { error: 'No he podido leer ninguna línea. Revisa que la primera columna sea la fecha ' +
                 '(06/09/2026 o 2026-09-06) y la segunda el importe.' };
  }
  return { filas, fallos, duplicados };
}

function fecha(s = '') {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3], 12).getTime();
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) { const a = +m[3] < 100 ? 2000 + +m[3] : +m[3];
           return new Date(a, +m[2]-1, +m[1], 12).getTime() }
  return null;
}

/** Resuelve lo que venga en un CSV: acepta el identificador o el nombre visible. */
export function porNombre(txt) {
  if (!txt) return null;
  const n = String(txt).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const c = datos.categorias.find(x =>
    x.id === n || x.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === n);
  return c ? c.id : null;
}

/* ==========================================================================
   Reconocimiento de comercios
   MANTENER EN SINCRONÍA con las funciones equivalentes del Worker, que las
   usa para el pop-up del atajo tras un pago.
   ========================================================================== */
const VACIAS = new Set(['sa','sl','slu','sau','sc','cb','inc','ltd','gmbh','de','del','la','el',
  'los','las','y','en','es','eur','the','and','co']);
const GENERICAS = new Set(['bar','restaurante','cafeteria','cafe','supermercado','super','tienda',
  'farmacia','gasolinera','estacion','hotel','parking','panaderia','kiosko','kiosco','bazar',
  'mercado','taberna','cerveceria','pizzeria','hostal','autoservicio','frutas','fruteria']);
const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const palabrasComercio = s => normal(s).split(' ')
  .filter(w => w.length > 1 && !/^\d+$/.test(w) && !VACIAS.has(w));
export function mismoComercio(a, b) {
  const pa = palabrasComercio(a), pb = palabrasComercio(b);
  if (!pa.length || !pb.length || pa[0] !== pb[0] || pa[0].length < 3) return false;
  if (GENERICAS.has(pa[0])) return pa[1] !== undefined && pa[1] === pb[1];
  return true;
}

const REGLAS = [
  [/mercadona|carrefour|lidl|aldi|\bdia\b|alcampo|eroski|consum|super|frut|panader|restaurante|\bbar\b|cafe|cafeter|glovo|just ?eat|burger|pizza|mcdonald|telepizza/, 'comida'],
  [/renfe|metro|emt|uber|cabify|taxi|gasolin|repsol|cepsa|\bbp\b|galp|shell|parking|peaje|bicing|\bbus\b|alsa/, 'transporte'],
  [/amazon|zara|decathlon|mediamarkt|corte ingles|primark|aliexpress|ikea|pull|bershka|mango|fnac/, 'compras'],
  [/cine|netflix|spotify|hbo|disney|steam|teatro|concierto|museo|discoteca|\bpub\b|playstation/, 'ocio'],
  [/alquiler|hipoteca|endesa|iberdrola|naturgy|movistar|vodafone|orange|comunidad|leroy|bricomart/, 'hogar'],
  [/gimnasio|\bgym\b|basic ?fit|fitness|crossfit|padel|piscina|fisio|farmacia|clinic|dentist|medic/, 'salud'],
  [/booking|airbnb|hotel|hostal|ryanair|vueling|iberia|easyjet|aerolin|aeropuerto|equipaje/, 'viajes'],
];

/** Categoría para un concepto: primero lo que hiciste antes en ese mismo
    comercio (si una categoría reúne el 60%), luego las reglas, y si nada
    encaja, «No definido». */
export function adivinarCat(texto) {
  const activas = cats().filter(c => c.id !== NO_DEFINIDO.id);
  const existe = id => activas.some(c => c.id === id);
  const previos = datos.gastos.filter(g => g.tipo !== 'ingreso' && existe(g.cat) &&
    mismoComercio(texto, g.com || g.n));
  if (previos.length) {
    const cuenta = new Map();
    for (const g of previos) cuenta.set(g.cat, (cuenta.get(g.cat) || 0) + 1);
    const [id, n] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
    return n / previos.length >= 0.6 ? id : NO_DEFINIDO.id;
  }
  const t = normal(texto);
  const regla = REGLAS.find(([re, id]) => re.test(t) && existe(id));
  return regla ? regla[1] : NO_DEFINIDO.id;
}


/* ==========================================================================
   Gestor de categorías
   ========================================================================== */
export function hojaCategorias() {
  const usos = id => datos.gastos.filter(g => g.cat === id).length;
  abrirHoja(`
    <h3>Categorías</h3>
    <p class="pieNota" style="padding:0 0 6px">Toca una para editarla. El orden es el que
      verás en el teclado de gastos.</p>
    <div id="listaCats"></div>
    <div class="fila"><button id="catCerrar">Cerrar</button>
      <button class="ok" id="catNueva">+ Nueva</button></div>`,
  caja => {
    const pinta = () => {
      caja.querySelector('#listaCats').innerHTML = catsTodas().map(c => `
        <div class="filaCat2 ${c.archivada ? 'archivada' : ''}" data-id="${c.id}">
          <span class="punto" style="background:${c.color}22;color:${c.color}">${c.emo}</span>
          <span class="txt"><b>${escapar(c.nom)}</b>
            <small>${usos(c.id)} movimiento${usos(c.id) === 1 ? '' : 's'}${
              c.archivada ? ' · archivada' : ''}</small></span>
          <button data-sube="${c.id}" aria-label="Subir ${escapar(c.nom)} en el orden" data-tip="Subir">↑</button>
        </div>`).join('');
    };
    pinta();
    caja.querySelector('#catCerrar').onclick = cerrarHoja;
    caja.querySelector('#catNueva').onclick = () => hojaCategoria(null);
    caja.querySelector('#listaCats').onclick = e => {
      const sube = e.target.closest('[data-sube]');
      if (sube) {
        const lista = catsTodas();
        const i = lista.findIndex(x => x.id === sube.dataset.sube);
        if (i <= 0) return avisar('Ya es la primera');
        enLote(() => {
          lista.forEach((x, k) => actualizar('categorias', x.id, { orden: k }));
          actualizar('categorias', lista[i].id, { orden: i - 1 });
          actualizar('categorias', lista[i-1].id, { orden: i });
        });
        pinta(); emitir();
        return;
      }
      const fila = e.target.closest('[data-id]');
      if (fila) hojaCategoria(datos.categorias.find(c => c.id === fila.dataset.id));
    };
  });
}

function hojaCategoria(c) {
  const nueva = !c;
  const d = c || { nom:'', emo:'🏷', color: PALETA_CAT.find(x =>
    !datos.categorias.some(y => y.color === x)) || PALETA_CAT[0] };
  const usos = c ? datos.gastos.filter(g => g.cat === c.id).length : 0;
  abrirHoja(`
    <h3>${nueva ? 'Nueva categoría' : 'Editar categoría'}</h3>
    <label><span>Nombre</span><input id="cNom" maxlength="20" value="${escapar(d.nom)}"
      placeholder="Regalos, mascota, formación…"></label>
    <label><span>Emoji</span><input id="cEmo" maxlength="2" value="${escapar(d.emo)}"></label>
    <label><span>Color</span></label>
    <div class="colores" id="cCol">${PALETA_CAT.map(x => `<button data-c="${x}"
      style="background:${x}" aria-pressed="${d.color === x}" aria-label="Usar el color ${x}"></button>`).join('')}</div>
    ${nueva ? '' : `<p class="pieNota">Identificador: <b>${d.id}</b>. Es lo que debe enviar el
      atajo de iOS, y no cambia aunque renombres la categoría.</p>`}
    <div class="fila">
      ${nueva ? '' : (d.archivada
        ? '<button class="acento" id="cRecuperar">Recuperar</button>'
        : '<button class="mal" id="cQuitar">' + (usos ? 'Archivar' : 'Borrar') + '</button>')}
      <button id="cCancelar">Cancelar</button>
      <button class="ok" id="cOk">${nueva ? 'Crear' : 'Guardar'}</button>
    </div>`,
  caja => {
    let color = d.color;
    const $ = s => caja.querySelector(s);
    $('#cCol').onclick = e => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      color = b.dataset.c;
      caja.querySelectorAll('#cCol button').forEach(x =>
        x.setAttribute('aria-pressed', x.dataset.c === color));
    };
    $('#cCancelar').onclick = () => { cerrarHoja(); hojaCategorias() };
    $('#cRecuperar')?.addEventListener('click', () => {
      actualizar('categorias', c.id, { archivada: false });
      cerrarHoja(); hojaCategorias(); emitir(); avisar('Categoría recuperada');
    });
    $('#cQuitar')?.addEventListener('click', () => {
      if (usos) {
        actualizar('categorias', c.id, { archivada: true });
        avisar(`Archivada: sus ${usos} movimientos la conservan`);
      } else {
        const it = borrar('categorias', c.id);
        avisar('Categoría borrada', { texto:'Deshacer',
          alPulsar: () => { restaurar('categorias', it); emitir() } });
      }
      cerrarHoja(); hojaCategorias(); emitir();
    });
    $('#cOk').onclick = () => {
      const nom = $('#cNom').value.trim();
      if (!nom) return avisar('Ponle un nombre');
      const campos = { nom, emo: $('#cEmo').value.trim() || '🏷', color };
      if (nueva) anadir('categorias', { ...campos, id: idDesde(nom), orden: datos.categorias.length });
      else actualizar('categorias', c.id, campos);
      cerrarHoja(); hojaCategorias(); emitir();
      avisar(nueva ? 'Categoría creada' : 'Categoría actualizada');
    };
  });
}
