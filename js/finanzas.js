/* ==========================================================================
   Módulo Finanzas: añadir, listado y métricas.
   ========================================================================== */
import {
  datos, anadir, actualizar, borrar, restaurar, ajuste, nube,
  eur, eur0, escapar, dia, inicioMes, finMes, nombreMes, navMes,
  avisar, abrirHoja, cerrarHoja, emitir,
} from './nucleo.js';

export const CATS = [
  {id:'comida',     nom:'Comida',     emo:'🍽'},
  {id:'transporte', nom:'Transporte', emo:'🚇'},
  {id:'compras',    nom:'Compras',    emo:'👕'},
  {id:'ocio',       nom:'Ocio',       emo:'🍺'},
  {id:'hogar',      nom:'Hogar',      emo:'🏠'},
  {id:'salud',      nom:'Gimnasio',   emo:'🏋'},
  {id:'viajes',     nom:'Viajes',     emo:'✈️'},
  {id:'otros',      nom:'Otros',      emo:'📦'},
];
export const cat = id => CATS.find(c => c.id === id) || CATS.at(-1);
const color = id => getComputedStyle(document.documentElement).getPropertyValue('--' + id).trim() || '#888';

/* ---------- Consultas ---------- */
export const esIngreso = g => g.tipo === 'ingreso';
export const delMes = off => {
  const a = inicioMes(off).getTime(), b = finMes(off).getTime();
  return datos.gastos.filter(g => g.t >= a && g.t <= b);
};
export const gastado = off => delMes(off).filter(g => !esIngreso(g)).reduce((s,g) => s + g.c, 0);
export const ingresado = off => delMes(off).filter(esIngreso).reduce((s,g) => s + g.c, 0);
export const presupuesto = () => ajuste('presupuesto') || 0;

/* ---------- Estado del módulo ---------- */
let sub = 'anadir', off = 0, filtro = null;
let buffer = '', catSel = 'comida', tipoSel = 'gasto', nota = '', fechaSel = null, editando = null;
let abierto = { nota:false, fecha:false };

export function irASub(s) { sub = s }

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
    sub = b.dataset.sub; pintar(vista);
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
  const fechaTxt = fechaSel
    ? new Date(fechaSel).toLocaleString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
    : 'Ahora';

  c.innerHTML = `
    <div class="cinta">
      <span>${nombreMes(0)} · <b class="num">${eur(t)}</b></span>
      <span>${presu ? (presu - t >= 0 ? `quedan ${eur0(presu-t)}` : `${eur0(t-presu)} de más`)
                    : `${delMes(0).length} movimiento${delMes(0).length===1?'':'s'}`}</span>
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
        ? `<input type="text" id="inNota" maxlength="60" placeholder="Nota" value="${escapar(nota)}">`
        : `<button data-x="nota" class="${nota?'puesto':''}">${nota ? '✎ '+escapar(nota) : 'Nota'}</button>`}
      ${abierto.fecha
        ? `<input type="datetime-local" id="inFecha" value="${paraInput(fechaSel || Date.now())}">`
        : `<button data-x="fecha" class="${fechaSel?'puesto':''}">${fechaTxt}</button>`}
    </div>
    <div class="cats" id="cats">
      ${CATS.map(x => `<button class="cat" data-id="${x.id}" aria-pressed="${x.id===catSel}"
        ${x.id===catSel ? `style="background:${color(x.id)}"` : ''}><span>${x.emo}</span>${x.nom}</button>`).join('')}
    </div>
    <div class="teclas" id="teclas">
      ${[1,2,3,4,5,6,7,8,9,',',0,'⌫'].map(k => `<button data-k="${k}">${k}</button>`).join('')}
    </div>
    <button class="principal ${tipoSel==='ingreso'?'verde':''}" id="guardar" ${valor()>0?'':'disabled'}>
      ${editando ? 'Guardar cambios' : tipoSel==='ingreso' ? 'Guardar ingreso' : 'Guardar gasto'}</button>`;

  if (editando) {
    c.querySelector('#edCaja').innerHTML =
      `<div class="editando"><span>Editando un movimiento</span>
       <button id="cancelarEd" style="padding:6px 12px">Cancelar</button></div>`;
    c.querySelector('#cancelarEd').onclick = () => { limpiar(); pintarAnadir(c) };
  }

  const iN = c.querySelector('#inNota');
  if (iN) { iN.oninput = e => nota = e.target.value;
            iN.onblur = () => { abierto.nota = false; pintarAnadir(c) }; iN.focus() }
  const iF = c.querySelector('#inFecha');
  if (iF) { iF.onchange = e => fechaSel = e.target.value ? new Date(e.target.value).getTime() : null;
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
    const campos = { c: imp, cat: catSel, n: nota.trim(), tipo: tipoSel };
    if (editando) {
      actualizar('gastos', editando, { ...campos, t: fechaSel || Date.now() });
      avisar('Movimiento actualizado');
    } else {
      anadir('gastos', { ...campos, t: fechaSel || Date.now() });
      avisar((tipoSel === 'ingreso' ? 'Ingreso de ' : 'Guardado ') + eur(imp));
    }
    limpiar(); pintarAnadir(c);
  };
}

function limpiar() {
  buffer = ''; catSel = 'comida'; tipoSel = 'gasto'; nota = ''; fechaSel = null; editando = null;
  abierto = { nota:false, fecha:false };
}
export function editarMovimiento(id) {
  const g = datos.gastos.find(x => x.id === id); if (!g) return;
  editando = id;
  buffer = g.c.toFixed(2).replace('.', ',').replace(/,00$/, '');
  catSel = g.cat; nota = g.n || ''; fechaSel = g.t; tipoSel = g.tipo === 'ingreso' ? 'ingreso' : 'gasto';
  abierto = { nota:false, fecha:false };
  sub = 'anadir';
}

/* ==========================================================================
   Submódulo: movimientos
   ========================================================================== */
function pintarLista(c) {
  const gs = delMes(off);
  const presentes = CATS.filter(x => gs.some(g => g.cat === x.id && !esIngreso(g)));
  if (filtro && !presentes.some(x => x.id === filtro)) filtro = null;

  c.innerHTML = `<div class="navmes" id="nav"></div>
    <div class="filtros" id="filtros"></div>
    <div id="cuerpo"></div>`;

  navMes(c.querySelector('#nav'), off,
    n => { off = n; pintarLista(c) },
    datos.gastos.length ? Math.min(...datos.gastos.map(g => g.t)) : Date.now());

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

  const vis = filtro ? gs.filter(g => g.cat === filtro) : gs;
  const cuerpo = c.querySelector('#cuerpo');
  if (!vis.length) {
    cuerpo.innerHTML = `<p class="vacio">${gs.length
      ? 'Nada en esta categoría este mes.'
      : 'Sin movimientos en ' + nombreMes(off).toLowerCase() + '.'}</p>`;
    return;
  }

  const hoy = dia();
  const dias = {};
  [...vis].sort((a,b) => b.t - a.t).forEach(g => (dias[dia(g.t)] ||= []).push(g));

  cuerpo.innerHTML = Object.entries(dias).map(([d, gs2]) => {
    const neto = gs2.reduce((s,g) => s + (esIngreso(g) ? g.c : -g.c), 0);
    const etq = d === hoy ? 'Hoy'
      : new Date(gs2[0].t).toLocaleDateString('es-ES',{weekday:'long', day:'numeric', month:'short'});
    return `<div class="dia-cab"><span>${etq}</span>
        <span class="num">${neto >= 0 ? '+' : ''}${eur(Math.abs(neto))}</span></div>
      <ul class="filas">${gs2.map(g => {
        const x = cat(g.cat), ing = esIngreso(g);
        return `<li data-id="${g.id}">
          <div class="punto" style="background:${ing ? color('ingreso') : color(x.id)}22">
            ${ing ? '↑' : x.emo}</div>
          <div class="txt"><b>${g.n ? escapar(g.n) : (ing ? 'Ingreso' : x.nom)}</b>
            <small>${g.n ? (ing ? 'Ingreso' : x.nom) + ' · ' : ''}${new Date(g.t)
              .toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</small></div>
          ${g.pend && nube ? '<div class="subir"></div>' : ''}
          <div class="imp num ${ing ? 'ingreso' : ''}">${ing ? '+' : ''}${eur(g.c)}</div>
          <button class="borrar" data-borrar="${g.id}" aria-label="Borrar">✕</button>
        </li>`;
      }).join('')}</ul>`;
  }).join('');

  cuerpo.onclick = e => {
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
function pintarMetricas(c) {
  c.innerHTML = `<div class="navmes" id="nav"></div><div id="cuerpo"></div>`;
  navMes(c.querySelector('#nav'), off,
    n => { off = n; pintarMetricas(c) },
    datos.gastos.length ? Math.min(...datos.gastos.map(g => g.t)) : Date.now());

  const gs = delMes(off);
  const cuerpo = c.querySelector('#cuerpo');
  if (!gs.length) {
    cuerpo.innerHTML = `<p class="vacio">Sin datos en ${nombreMes(off).toLowerCase()}.</p>`;
    return;
  }

  const total = gastado(off), entra = ingresado(off), presu = presupuesto();
  const prev = gastado(off - 1);
  const delta = prev > 0 ? ((total - prev) / prev) * 100 : null;
  const enCurso = off === 0;
  const diasMes = finMes(off).getDate();
  const diasPasados = enCurso ? new Date().getDate() : diasMes;
  const media = total / diasPasados;
  /* La proyección se calla los primeros días: con dos o tres datos es ruido. */
  const proyectable = !enCurso || diasPasados >= 7;

  const porDia = {};
  gs.filter(g => !esIngreso(g)).forEach(g => { const k = dia(g.t); porDia[k] = (porDia[k]||0) + g.c });
  const top = Object.entries(porDia).sort((a,b) => b[1]-a[1])[0];

  const porCat = CATS.map(x => ({...x, s: gs.filter(g => g.cat===x.id && !esIngreso(g))
    .reduce((s,g) => s+g.c, 0)})).filter(x => x.s > 0).sort((a,b) => b.s - a.s);

  cuerpo.innerHTML = `
    <div class="panel">
      <div class="granCifra num">${eur(total)}</div>
      <div class="delta">${delta === null ? 'Sin mes anterior con el que comparar'
        : (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta).toFixed(0) + '% respecto a ' +
          nombreMes(off-1).split(' ')[0].toLowerCase()}</div>
      ${presu ? `<div class="barra" style="margin-top:14px"><i class="${total>presu?'pasado':''}"
          style="width:${Math.min(total/presu,1)*100}%"></i></div>
        <div class="delta">${total <= presu
          ? `Te quedan ${eur0(presu-total)} de los ${eur0(presu)} del mes`
          : `Has pasado el presupuesto en ${eur0(total-presu)}`}</div>` : ''}
    </div>

    ${entra > 0 ? `<div class="rejilla">
      <div class="mini"><b class="num" style="color:var(--ingreso)">${eur0(entra)}</b><small>ingresos</small></div>
      <div class="mini"><b class="num" style="${entra-total<0?'color:var(--alerta)':''}">
        ${entra-total>=0?'+':''}${eur0(entra-total)}</b><small>balance del mes</small></div>
      <div class="mini"><b class="num">${entra > 0 ? Math.max(0,Math.round((1-total/entra)*100)) : 0}%</b>
        <small>de lo que entra, ahorrado</small></div>
      <div class="mini"><b class="num">${eur0(media)}</b><small>gasto al día</small></div>
    </div>` : `<div class="rejilla">
      <div class="mini"><b class="num">${eur0(media)}</b><small>al día de media</small></div>
      <div class="mini"><b class="num">${gs.length}</b><small>movimientos</small></div>
      <div class="mini"><b class="num">${eur0(top[1])}</b><small>el ${new Date(desdeClave(top[0]))
        .toLocaleDateString('es-ES',{day:'numeric',month:'short'})}, el día más caro</small></div>
      <div class="mini"><b class="num">${proyectable ? eur0(media*diasMes) : '—'}</b>
        <small>${enCurso ? (proyectable ? 'proyección a fin de mes' : 'proyección desde el día 7')
                         : 'gasto medio del mes'}</small></div>
    </div>`}

    <div class="panel">
      <div style="font-size:15px;color:var(--muted)">En qué se te va</div>
      ${porCat.map(x => `<div class="filaCat">
          <span>${x.emo} ${x.nom}</span><span class="num">${eur(x.s)}</span>
          <div class="barra"><i style="width:${(x.s/total)*100}%;background:${color(x.id)}"></i></div>
          <span class="pct num">${((x.s/total)*100).toFixed(0)}%</span>
        </div>`).join('')}
    </div>

    <div class="panel">
      <div style="font-size:15px;color:var(--muted)">Últimos seis meses</div>
      ${grafMeses()}
    </div>`;
}
const desdeClave = s => { const [a,m,d] = s.split('-').map(Number); return new Date(a, m-1, d) };

function grafMeses() {
  const serie = [];
  for (let i = 5; i >= 0; i--) {
    const o = off - i;
    serie.push({ etq: inicioMes(o).toLocaleDateString('es-ES',{month:'short'}).replace('.',''),
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
    ${serie.map(s => `<div style="flex:1;text-align:center;font-size:11px;line-height:1.5;
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
      listos.forEach(f => anadir('gastos', f));
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
      cat: CATS.some(x => x.id === catBruta) ? catBruta : adivinarCat(p[iN] || p[iC] || ''),
      n: (p[iN] || '').slice(0, 60),
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

const REGLAS = [
  [/mercadona|carrefour|lidl|aldi|dia |alcampo|super|frut|panader|restaurante|bar |cafe|cafeter|glovo|just eat|burger|pizza/i, 'comida'],
  [/renfe|metro|emt|uber|cabify|taxi|gasolin|repsol|cepsa|bp |parking|peaje|bicing|bus/i, 'transporte'],
  [/amazon|zara|decathlon|mediamarkt|corte ingles|primark|aliexpress|ikea/i, 'compras'],
  [/cine|netflix|spotify|hbo|disney|steam|teatro|concierto|museo|discoteca|pub/i, 'ocio'],
  [/alquiler|hipoteca|luz|endesa|iberdrola|naturgy|agua|gas |internet|movistar|vodafone|orange|comunidad/i, 'hogar'],
  [/gimnasio|gym|basic ?fit|fitness|crossfit|padel|pádel|piscina|fisio|farmacia|clinic|dentist|medic/i, 'salud'],
  [/booking|airbnb|hotel|hostal|ryanair|vueling|iberia|easyjet|aerolin|aeropuerto|vuelo|renfe ave|equipaje|maleta/i, 'viajes'],
];
const adivinarCat = txt => REGLAS.find(([re]) => re.test(txt))?.[1] || 'otros';
