/* ==========================================================================
   Ajustes: un índice corto. Cada entrada abre su propia hoja, para que la
   pantalla no mezcle la clave del Worker con nueve casillas de euros.
   ========================================================================== */
import {
  datos, COLECCIONES, nube, ultimaSync, pendientes, ajuste,
  configurarNube, probarNube, marcarTodoPendiente, sincronizar,
  borrar, guardar, enLote, emitir, avisar, eur0, dia,
  abrirHoja, cerrarHoja,
} from './nucleo.js';
import * as fin from './finanzas.js';

const VERSION = 'v13';

export function pintar(vista) {
  const n = pendientes();
  const items = COLECCIONES.reduce((s, c) => s + datos[c].length, 0);

  vista.innerHTML = `<div class="scroll">
    <div class="titulo">Ajustes</div>

    <div class="grupo indice" style="margin-top:16px">
      <button data-h="nube"><span>Sincronización</span>
        <small>${nube ? (n ? `${n} sin subir` : 'al día') : 'sin configurar'} ›</small></button>
      <button data-h="presu"><span>Presupuesto</span>
        <small>${resumenPresu()} ›</small></button>
      <button data-h="cats"><span>Categorías</span>
        <small>${fin.cats().length} ›</small></button>
      <button data-h="fijos"><span>Gastos fijos</span>
        <small>${datos.fijos.length || 'ninguno'} ›</small></button>
    </div>

    <div class="grupo indice">
      <button data-h="datos"><span>Datos y copias</span>
        <small>${items} items ›</small></button>
      <button data-h="acerca"><span>Acerca de</span>
        <small>${VERSION} ›</small></button>
    </div>

    <p class="estado">${estado()}</p>
    <input type="file" id="ficheroJSON" accept="application/json" hidden>
  </div>`;

  vista.querySelector('.scroll').addEventListener('click', e => {
    const b = e.target.closest('[data-h]'); if (!b) return;
    ({ nube: hojaNube, presu: hojaPresupuesto, cats: fin.hojaCategorias,
       fijos: fin.hojaFijos, datos: hojaDatos, acerca: hojaAcerca })[b.dataset.h](vista);
  });
  vista.querySelector('#ficheroJSON').onchange = e => importarCopia(e, vista);
}

const resumenPresu = () => {
  const mes = fin.presupuesto(), cuantas = Object.keys(fin.presupuestos()).length;
  if (!mes && !cuantas) return 'sin definir';
  return [mes ? eur0(mes) : null,
          cuantas ? `${cuantas} categoría${cuantas === 1 ? '' : 's'}` : null]
         .filter(Boolean).join(' · ');
};

function estado() {
  if (!nube) return 'Sin sincronización: los datos solo existen en este dispositivo.';
  const cuando = ultimaSync
    ? new Date(ultimaSync).toLocaleString('es-ES',
        {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})
    : 'nunca';
  const n = pendientes();
  return `Última sincronización: ${cuando}.` +
    (n ? ` ${n} cambio${n === 1 ? '' : 's'} esperando a subir.` : '');
}

/* ---------- Sincronización ---------- */
function hojaNube(vista) {
  abrirHoja(`
    <h3>Sincronización</h3>
    <p class="pieNota" style="padding:0 0 8px">${estado()}</p>
    <label><span>Dirección del Worker</span>
      <input id="cfgUrl" type="url" inputmode="url" autocapitalize="off" autocorrect="off"
        spellcheck="false" placeholder="https://…workers.dev" value="${nube?.url || ''}"></label>
    <label><span>Clave</span>
      <input id="cfgClave" type="password" autocapitalize="off" autocorrect="off"
        spellcheck="false" placeholder="Tu clave secreta" value="${nube?.clave || ''}"></label>
    <div class="opciones" style="margin-top:8px">
      <button id="verClave">Mostrar clave</button>
    </div>
    <div class="fila">
      <button id="cfgAhora">Sincronizar</button>
      <button class="ok" id="cfgProbar">Guardar y comprobar</button>
    </div>
    ${nube ? '<div class="fila"><button class="mal" id="cfgQuitar">Desconectar</button></div>' : ''}
    <p class="pieNota">Con la sincronización activa tus datos viven en tu Worker y este
      dispositivo guarda una copia para funcionar sin cobertura.</p>`,
  caja => {
    const $ = s => caja.querySelector(s);
    $('#verClave').onclick = () => {
      const i = $('#cfgClave');
      i.type = i.type === 'password' ? 'text' : 'password';
      $('#verClave').textContent = i.type === 'password' ? 'Mostrar clave' : 'Ocultar clave';
    };
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
        cerrarHoja(); pintar(vista);
      } catch (e) {
        avisar(e.message === 'clave' ? 'La clave no es correcta'
             : e.message.startsWith('http') ? 'El servidor respondió ' + e.message.slice(5)
             : 'No se pudo conectar con esa dirección');
      }
    };
    $('#cfgAhora').onclick = () => nube
      ? sincronizar({ ruidoso: true }).then(() => { cerrarHoja(); pintar(vista) })
      : avisar('Configura primero la dirección y la clave');
    $('#cfgQuitar')?.addEventListener('click', () => {
      if (!confirm('Este dispositivo dejará de sincronizar. Los datos que ya tienes se conservan.')) return;
      configurarNube(null); cerrarHoja(); pintar(vista); avisar('Desconectado');
    });
  });
}

/* ---------- Presupuesto ---------- */
function hojaPresupuesto(vista) {
  const pinta = () => {
    const mes = fin.presupuesto(), suma = fin.sumaTopes();
    abrirHoja(`
      <h3>Presupuesto</h3>
      <label><span>Presupuesto del mes</span>
        <input id="presu" type="number" inputmode="decimal" min="0" step="10"
          placeholder="Sin límite" value="${mes || ''}"></label>
      <p class="pieNota" style="padding:6px 2px 0">Tope para todo el gasto mensual. Opcional.</p>

      <label style="margin-top:18px"><span>Límite por categoría</span></label>
      <div class="grupo">
        ${fin.cats().map(c => `<label>${c.emo} ${c.nom}
          <span><input data-cat="${c.id}" type="number" inputmode="decimal" min="0" step="10"
            placeholder="—" value="${fin.presupuestos()[c.id] || ''}"> €</span></label>`).join('')}
      </div>
      <p class="pieNota">Las que dejes en blanco se miden sobre
        ${mes ? 'el presupuesto del mes' : 'el gasto total'}.
        ${suma ? `Suma de los límites: <b${mes && suma > mes ? ' class="rojo"' : ''}>${eur0(suma)}</b>${
          mes ? ` de ${eur0(mes)}${suma > mes ? ', por encima del presupuesto' : ''}` : ''}.` : ''}</p>
      <div class="fila"><button class="ok" id="pCerrar">Listo</button></div>`,
    caja => {
      caja.querySelector('#pCerrar').onclick = () => { cerrarHoja(); pintar(vista) };
      caja.querySelector('#presu').onchange = e => {
        const v = Math.max(0, parseFloat(e.target.value) || 0);
        ajuste('presupuesto', v || null);
        emitir(); pinta();
        avisar(v ? 'Presupuesto del mes: ' + eur0(v) : 'Presupuesto desactivado');
      };
      caja.querySelectorAll('[data-cat]').forEach(inp => {
        inp.onchange = () => {
          const v = Math.max(0, parseFloat(inp.value) || 0);
          const nuevos = { ...fin.presupuestos() };
          v ? nuevos[inp.dataset.cat] = v : delete nuevos[inp.dataset.cat];
          ajuste('presupuestos', Object.keys(nuevos).length ? nuevos : null);
          emitir(); pinta();
          avisar(v ? `${fin.cat(inp.dataset.cat).nom}: ${eur0(v)} al mes` : 'Límite quitado');
        };
      });
    });
  };
  pinta();
}

/* ---------- Datos y copias ---------- */
function hojaDatos(vista) {
  const items = COLECCIONES.reduce((s, c) => s + datos[c].length, 0);
  abrirHoja(`
    <h3>Datos y copias</h3>
    <div class="grupo indice">
      <button id="expJSON"><span>Descargar copia de seguridad</span><small>${items} items</small></button>
      <button id="impJSON"><span>Restaurar desde copia</span><small>añade lo que falte</small></button>
    </div>
    <div class="grupo indice">
      <button id="expCSV"><span>Exportar movimientos a CSV</span>
        <small>${datos.gastos.length}</small></button>
      <button id="impCSV"><span>Importar movimientos desde CSV</span><small>›</small></button>
    </div>
    <p class="pieNota">La copia incluye movimientos, hábitos, registros, notas, categorías y
      gastos fijos. Guárdala en iCloud Drive de vez en cuando, uses o no la sincronización.</p>
    <div class="grupo indice" style="margin-top:20px">
      <button class="rojo" id="borrarTodo"><span>Borrar todos los datos</span><small>›</small></button>
    </div>
    <div class="fila"><button id="dCerrar">Cerrar</button></div>`,
  caja => {
    const $ = s => caja.querySelector(s);
    $('#dCerrar').onclick = cerrarHoja;
    $('#impCSV').onclick = () => { cerrarHoja(); fin.hojaImportarCSV() };
    $('#impJSON').onclick = () => document.getElementById('ficheroJSON').click();

    $('#expCSV').onclick = () => {
      if (!datos.gastos.length) return avisar('No hay nada que exportar');
      const filas = [...datos.gastos].sort((a,b) => a.t - b.t).map(g => {
        const d = new Date(g.t);
        return [d.toLocaleDateString('es-ES'),
                d.toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'}),
                g.c.toFixed(2).replace('.', ','), fin.cat(g.cat).nom,
                '"' + (g.n || '').replace(/"/g, '""') + '"',
                g.tipo === 'ingreso' ? 'ingreso' : 'gasto'].join(';');
      });
      bajar('\ufefffecha;hora;importe;categoria;nota;tipo\n' + filas.join('\n'),
        `movimientos-${dia()}.csv`, 'text/csv;charset=utf-8');
    };
    $('#expJSON').onclick = () => {
      const copia = { app:'my-app', version: VERSION, fecha: Date.now() };
      for (const c of COLECCIONES)
        copia[c] = datos[c].map(x => { const y = {...x}; delete y.pend; return y });
      bajar(JSON.stringify(copia), `my-app-${dia()}.json`, 'application/json');
    };
    $('#borrarTodo').onclick = () => {
      if (!items) return avisar('Ya está vacío');
      if (!confirm(`Se borrarán ${items} items${nube ? ', aquí y en la nube' : ''}. No se puede deshacer.`)) return;
      enLote(() => { for (const c of COLECCIONES) [...datos[c]].forEach(x => borrar(c, x.id)) });
      ajuste('catsSembradas', null);
      fin.sembrarCategorias();
      cerrarHoja(); pintar(vista); avisar('Todo borrado');
    };
  });
}

async function importarCopia(e, vista) {
  const f = e.target.files[0]; if (!f) return;
  try {
    const bruto = JSON.parse(await f.text());
    const copia = Array.isArray(bruto) ? { gastos: bruto } : bruto;
    let total = 0;
    enLote(() => {
      for (const c of COLECCIONES) {
        if (!Array.isArray(copia[c])) continue;
        const vistos = new Set(datos[c].map(x => x.id));
        for (const it of copia[c]) {
          if (!it?.id || vistos.has(it.id)) continue;
          datos[c].push({ ...it, pend: !!nube });
          vistos.add(it.id);
          total++;
        }
      }
      guardar();
    });
    emitir(); sincronizar(); cerrarHoja(); pintar(vista);
    avisar(total ? `Añadidos ${total} items` : 'Ya lo tenías todo');
  } catch { avisar('Ese archivo no es una copia válida') }
  e.target.value = '';
}

/* ---------- Acerca de ---------- */
function hojaAcerca() {
  const instalada = window.matchMedia('(display-mode: standalone)').matches;
  abrirHoja(`
    <h3>My-app ${VERSION}</h3>
    <p class="pieNota" style="padding:0">
      Abierta ${instalada ? 'desde el icono de la pantalla de inicio' : 'en el navegador'}.<br>
      ${COLECCIONES.map(c => `${datos[c].length} ${c}`).join(' · ')}
    </p>
    <p class="pieNota">Los datos se guardan en este dispositivo y, si has configurado la
      sincronización, también en tu Worker. Nada pasa por GitHub: allí solo está el código.</p>
    <div class="fila"><button class="ok" id="aCerrar">Cerrar</button></div>`,
  caja => { caja.querySelector('#aCerrar').onclick = cerrarHoja });
}

function bajar(txt, nombre, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: tipo }));
  a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
