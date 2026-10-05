/* ==========================================================================
   Pestaña Hoy: lo que necesitas ver y tocar en el día en curso.
   ========================================================================== */
import { datos, eur, eur0, eurN, eurN0, dia, nombreCiclo, rangoCiclo, vacio } from './nucleo.js';
import * as fin from './finanzas.js';
import * as hab from './habitos.js';
import * as habUI from './habitos-ui.js';

export function pintar(vista, ir) {
  const hoy = new Date();
  const gastoHoy = datos.gastos
    .filter(g => dia(g.t) === dia() && g.tipo !== 'ingreso')
    .reduce((s, g) => s + g.c, 0);
  const mes = fin.gastado(0), presu = fin.presupuesto();
  /* Solo lo del día: los semanales y mensuales viven en su pestaña. */
  const lista = hab.activos().filter(h => (h.frec || 'dia') === 'dia' && hab.toca(h));
  const delDia = lista.filter(hab.cuentaHoy);
  const hechos = delDia.filter(h => hab.cumplido(h)).length;
  const porCategorizar = fin.sinCategoria();
  const pendientesRev = fin.porRevisar();

  vista.innerHTML = `<div class="scroll">
    <div class="saludo">${saludo(hoy)}</div>
    <div class="subtitulo">${hoy.toLocaleDateString('es-ES',
      {weekday:'long', day:'numeric', month:'long'}).replace(/^./, m => m.toUpperCase())}</div>

    <button class="tarjetaAccion" id="irGasto">
      <span class="mas">+</span>
      <span class="txt"><b>Añadir gasto</b>
        <small>${gastoHoy ? 'Hoy llevas ' + eurN(gastoHoy) : 'Nada registrado hoy'}</small></span>
    </button>

    ${pendientesRev.length ? `<button class="tarjetaAccion pendiente" id="irRevisar">
      <span class="mas">½</span>
      <span class="txt"><b>Revisar ${pendientesRev.length} gasto${
        pendientesRev.length === 1 ? '' : 's'}</b>
        <small>Compartido${pendientesRev.length === 1 ? '' : 's'} · tu parte: ${
          eurN(pendientesRev.reduce((t, g) => t + g.c, 0))}</small></span>
    </button>` : ''}

    ${porCategorizar.length ? `<button class="tarjetaAccion pendiente" id="irSinCat">
      <span class="mas">❓</span>
      <span class="txt"><b>Categorizar ${porCategorizar.length} movimiento${
        porCategorizar.length === 1 ? '' : 's'}</b>
        <small>${eur(porCategorizar.reduce((t, g) => t + g.c, 0))} sin categoría</small></span>
    </button>` : ''}

    <div class="panel">
      <div class="subtitulo" style="padding:0 0 6px">${nombreCiclo(0)}${
        rangoCiclo(0) ? ` · ${rangoCiclo(0)}` : ''}</div>
      <div class="granCifra num">${eur(mes)}</div>
      ${presu ? `<div class="barra" style="margin-top:12px">
          <i class="${mes>presu?'pasado':''}" style="width:${Math.min(mes/presu,1)*100}%"></i></div>
        <div class="delta">${mes <= presu ? `Te quedan ${eurN0(presu-mes)} este mes`
          : `Has pasado el presupuesto en ${eur0(mes-presu)}`}</div>`
        : '<div class="delta">Sin presupuesto definido</div>'}
      ${fin.excedidas().length ? `<div class="delta rojo">${fin.excedidas()
        .map(c => c.emo + ' ' + c.nom).join(', ')} por encima del límite</div>` : ''}
    </div>

    <div class="etiqueta">Hábitos${delDia.length ? ` · ${hechos} de ${delDia.length} hoy` : ''}</div>
    <div id="habHoy"></div>
  </div>`;

  vista.querySelector('#irGasto').onclick = () => {
    fin.irASub('anadir', { modulo: 'hoy' }); ir('finanzas');
  };
  vista.querySelector('#irRevisar')?.addEventListener('click', () => {
    fin.verPorRevisar(); ir('finanzas');
  });
  vista.querySelector('#irSinCat')?.addEventListener('click', () => {
    fin.verSinCategoria(); ir('finanzas');
  });

  const caja = vista.querySelector('#habHoy');
  if (!lista.length) {
    caja.innerHTML = vacio({
      titulo: 'Aquí verás lo que toca hoy',
      cuerpo: 'Cada hábito que crees con periodicidad diaria aparecerá en esta lista, '
            + 'listo para marcar.',
      accion: 'Crear mi primer hábito'
    });
    caja.querySelector('[data-vacio]').onclick = () => habUI.hojaHabito(null);
    return;
  }
  caja.innerHTML = lista.map(habUI.tarjeta).join('');
  habUI.conectar(caja);
}

const saludo = d => {
  const h = d.getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
};
