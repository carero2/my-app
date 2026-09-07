/* ==========================================================================
   Pestaña Hoy: lo que necesitas ver y tocar en el día en curso.
   ========================================================================== */
import { datos, eur, eur0, dia, nombreMes } from './nucleo.js';
import * as fin from './finanzas.js';
import * as hab from './habitos.js';

export function pintar(vista, ir) {
  const hoy = new Date();
  const gastoHoy = datos.gastos
    .filter(g => dia(g.t) === dia() && g.tipo !== 'ingreso')
    .reduce((s, g) => s + g.c, 0);
  const mes = fin.gastado(0), presu = fin.presupuesto();
  const lista = hab.activos();
  const hechos = lista.filter(h => hab.cumplido(h)).length;

  vista.innerHTML = `<div class="scroll">
    <div class="saludo">${saludo(hoy)}</div>
    <div class="subtitulo">${hoy.toLocaleDateString('es-ES',
      {weekday:'long', day:'numeric', month:'long'}).replace(/^./, m => m.toUpperCase())}</div>

    <button class="tarjetaAccion" id="irGasto">
      <span class="mas">+</span>
      <span class="txt"><b>Añadir gasto</b>
        <small>${gastoHoy ? 'Hoy llevas ' + eur(gastoHoy) : 'Nada registrado hoy'}</small></span>
    </button>

    <div class="panel">
      <div class="subtitulo" style="padding:0 0 6px">${nombreMes(0)}</div>
      <div class="granCifra num">${eur(mes)}</div>
      ${presu ? `<div class="barra" style="margin-top:12px">
          <i class="${mes>presu?'pasado':''}" style="width:${Math.min(mes/presu,1)*100}%"></i></div>
        <div class="delta">${mes <= presu ? `Te quedan ${eur0(presu-mes)} este mes`
          : `Has pasado el presupuesto en ${eur0(mes-presu)}`}</div>`
        : '<div class="delta">Sin presupuesto definido</div>'}
    </div>

    <div class="etiqueta">Hábitos${lista.length ? ` · ${hechos} de ${lista.length} cumplidos` : ''}</div>
    <div id="habHoy"></div>
  </div>`;

  vista.querySelector('#irGasto').onclick = () => { fin.irASub('anadir'); ir('finanzas') };

  const caja = vista.querySelector('#habHoy');
  if (!lista.length) {
    caja.innerHTML = `<p class="vacio">Sin hábitos todavía.
      <button id="crearHab">Crear uno</button></p>`;
    caja.querySelector('#crearHab').onclick = () => hab.hojaHabito(null);
    return;
  }
  caja.innerHTML = lista.map(hab.tarjeta).join('');
  hab.conectar(caja);
}

const saludo = d => {
  const h = d.getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
};
