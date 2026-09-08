/* ==========================================================================
   Ajustes: sincronización, presupuesto, importación y copias.
   ========================================================================== */
import {
  datos, COLECCIONES, nube, ultimaSync, pendientes, ajuste,
  configurarNube, probarNube, marcarTodoPendiente, sincronizar,
  borrar, guardar, emitir, avisar, eur0, dia,
} from './nucleo.js';
import * as fin from './finanzas.js';

export function pintar(vista) {
  const n = pendientes();
  vista.innerHTML = `<div class="scroll">
    <div class="titulo">Ajustes</div>

    <div class="etiqueta">Sincronización</div>
    <div class="grupo">
      <label class="campo"><span>Dirección del Worker</span>
        <input id="cfgUrl" class="ancho" type="url" inputmode="url" autocapitalize="off"
          autocorrect="off" spellcheck="false" placeholder="https://…workers.dev"
          value="${nube?.url || ''}"></label>
      <label class="campo"><span>Clave</span>
        <input id="cfgClave" class="ancho" type="password" autocapitalize="off"
          autocorrect="off" spellcheck="false" placeholder="Tu clave secreta"
          value="${nube?.clave || ''}"></label>
      <button class="acento" id="cfgProbar">Guardar y comprobar</button>
      <button id="cfgAhora">Sincronizar ahora<span class="num">${n ? n + ' sin subir' : ''}</span></button>
      ${nube ? '<button class="rojo" id="cfgQuitar">Desconectar de la nube</button>' : ''}
    </div>
    <p class="estado" id="cfgEstado"></p>

    <div class="etiqueta">Presupuesto mensual</div>
    <div class="opciones" id="modoPresu" style="margin-top:8px">
      <button data-m="total" aria-pressed="${fin.modoPresu()==='total'}">Un tope total</button>
      <button data-m="categorias" aria-pressed="${fin.modoPresu()==='categorias'}">Por categoría</button>
    </div>
    <div id="cajaPresu"></div>

    <div class="etiqueta">Finanzas</div>
    <div class="grupo">
      <button id="gestCats">Gestionar categorías
        <span class="num">${fin.cats().length}</span></button>
      <button id="impCSV">Importar movimientos desde CSV</button>
    </div>

    <div class="etiqueta">Tus datos</div>
    <div class="grupo">
      <button id="expCSV">Exportar movimientos a CSV
        <span class="num">${datos.gastos.length}</span></button>
      <button id="expJSON">Descargar copia de seguridad
        <span class="num">${COLECCIONES.reduce((s,c) => s + datos[c].length, 0)} items</span></button>
      <button id="impJSON">Restaurar desde copia</button>
    </div>

    <div class="etiqueta">Zona de riesgo</div>
    <div class="grupo">
      <button class="rojo" id="borrarTodo">Borrar todos los datos</button>
    </div>

    <p class="pieNota">Con la sincronización activa tus datos viven en tu Worker y este dispositivo
      guarda una copia para funcionar sin cobertura. Sin ella, existen solo aquí.</p>
    <p class="pieNota">My-app v10 · ${window.matchMedia('(display-mode: standalone)').matches
      ? 'abierta desde el icono' : 'abierta en el navegador'}</p>
    <input type="file" id="ficheroJSON" accept="application/json" hidden>
  </div>`;

  const $ = s => vista.querySelector(s);
  estado($('#cfgEstado'));

  $('#cfgProbar').onclick = async () => {
    const url = $('#cfgUrl').value.trim().replace(/\/+$/, '');
    const clave = $('#cfgClave').value.trim();
    if (!/^https:\/\//.test(url)) return avisar('La dirección debe empezar por https://');
    if (!clave) return avisar('Falta la clave');
    try {
      await probarNube({ url, clave });
      configurarNube({ url, clave });
      marcarTodoPendiente();
      avisar('Conectado. Subiendo lo que tenías…');
      await sincronizar({ ruidoso: true });
      pintar(vista);
    } catch (e) {
      avisar(e.message === 'clave' ? 'La clave no es correcta'
           : e.message.startsWith('http') ? 'El servidor respondió ' + e.message.slice(5)
           : 'No se pudo conectar con esa dirección');
    }
  };
  $('#cfgAhora').onclick = () => nube
    ? sincronizar({ ruidoso: true }).then(() => pintar(vista))
    : avisar('Configura primero la dirección y la clave');
  $('#cfgQuitar')?.addEventListener('click', () => {
    if (!confirm('Este dispositivo dejará de sincronizar. Los datos que ya tienes aquí se conservan.')) return;
    configurarNube(null); pintar(vista); avisar('Desconectado');
  });

  function pintarPresu() {
    const caja = $('#cajaPresu');
    if (fin.modoPresu() === 'total') {
      caja.innerHTML = `<div class="grupo"><label>Límite del mes
        <span><input id="presu" type="number" inputmode="decimal" min="0" step="10"
          placeholder="Sin límite" value="${ajuste('presupuesto') || ''}"> €</span></label></div>
        <p class="pieNota">Un único tope para todo el gasto del mes.</p>`;
      caja.querySelector('#presu').onchange = e => {
        const v = Math.max(0, parseFloat(e.target.value) || 0);
        ajuste('presupuesto', v || null);
        emitir(); pintar(vista);
        avisar(v ? 'Presupuesto: ' + eur0(v) : 'Presupuesto desactivado');
      };
      return;
    }
    const topes = fin.presupuestos();
    caja.innerHTML = `<div class="grupo">
      ${fin.cats().map(c => `<label>${c.emo} ${c.nom}
        <span><input data-cat="${c.id}" type="number" inputmode="decimal" min="0" step="10"
          placeholder="—" value="${topes[c.id] || ''}"> €</span></label>`).join('')}
      </div>
      <p class="pieNota">Deja en blanco las que no quieras limitar.
        El tope del mes será la suma de las que definas:
        <b>${fin.presupuesto() ? eur0(fin.presupuesto()) : 'sin límite'}</b>.</p>`;
    caja.querySelectorAll('[data-cat]').forEach(inp => {
      inp.onchange = () => {
        const v = Math.max(0, parseFloat(inp.value) || 0);
        const nuevos = { ...fin.presupuestos() };
        v ? nuevos[inp.dataset.cat] = v : delete nuevos[inp.dataset.cat];
        ajuste('presupuestos', Object.keys(nuevos).length ? nuevos : null);
        emitir(); pintarPresu();
        avisar(v ? `${fin.cat(inp.dataset.cat).nom}: ${eur0(v)} al mes` : 'Límite quitado');
      };
    });
  }
  pintarPresu();
  $('#modoPresu').onclick = e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    ajuste('modoPresupuesto', b.dataset.m);
    emitir(); pintar(vista);
  };
  $('#gestCats').onclick = () => fin.hojaCategorias();
  $('#impCSV').onclick = () => fin.hojaImportarCSV();

  $('#expCSV').onclick = () => {
    if (!datos.gastos.length) return avisar('No hay nada que exportar');
    const filas = [...datos.gastos].sort((a,b) => a.t - b.t).map(g => {
      const d = new Date(g.t);
      return [d.toLocaleDateString('es-ES'),
              d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}),
              g.c.toFixed(2).replace('.', ','), fin.cat(g.cat).nom,
              '"' + (g.n || '').replace(/"/g,'""') + '"',
              g.tipo === 'ingreso' ? 'ingreso' : 'gasto'].join(';');
    });
    bajar('\ufefffecha;hora;importe;categoria;nota;tipo\n' + filas.join('\n'),
      `movimientos-${dia()}.csv`, 'text/csv;charset=utf-8');
  };
  $('#expJSON').onclick = () => {
    const copia = {};
    for (const c of COLECCIONES) copia[c] = datos[c].map(x => { const y = {...x}; delete y.pend; return y });
    bajar(JSON.stringify({ version: 4, fecha: Date.now(), ...copia }),
      `my-app-${dia()}.json`, 'application/json');
  };
  $('#impJSON').onclick = () => $('#ficheroJSON').click();
  $('#ficheroJSON').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const bruto = JSON.parse(await f.text());
      // Acepta tanto el formato nuevo como el array suelto de gastos de la versión anterior
      const copia = Array.isArray(bruto) ? { gastos: bruto } : bruto;
      let total = 0;
      for (const c of COLECCIONES) {
        if (!Array.isArray(copia[c])) continue;
        const vistos = new Set(datos[c].map(x => x.id));
        for (const it of copia[c]) {
          if (!it?.id || vistos.has(it.id)) continue;
          datos[c].push({ ...it, pend: !!nube });
          total++;
        }
      }
      guardar(); emitir(); sincronizar(); pintar(vista);
      avisar(total ? `Añadidos ${total} items` : 'Ya lo tenías todo');
    } catch { avisar('Ese archivo no es una copia válida') }
    e.target.value = '';
  };

  $('#borrarTodo').onclick = () => {
    const total = COLECCIONES.reduce((s,c) => s + datos[c].length, 0);
    if (!total) return avisar('Ya está vacío');
    if (!confirm(`Se borrarán ${total} items${nube ? ', aquí y en la nube' : ''}. No se puede deshacer.`)) return;
    for (const c of COLECCIONES) [...datos[c]].forEach(x => borrar(c, x.id));
    emitir(); pintar(vista); avisar('Todo borrado');
  };
}

function estado(el) {
  if (!nube) { el.textContent = 'Sin configurar: los datos solo existen en este dispositivo.'; return }
  const n = pendientes();
  const cuando = ultimaSync
    ? new Date(ultimaSync).toLocaleString('es-ES',
        {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})
    : 'nunca';
  el.textContent = `Última sincronización: ${cuando}.` +
    (n ? ` ${n} cambio${n===1?'':'s'} esperando a subir.` : '');
}

function bajar(txt, nombre, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: tipo }));
  a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
