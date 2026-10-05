/* ==========================================================================
   Arranque y navegación entre módulos.
   ========================================================================== */
import {
  alCambiar, alNavegar, sincronizar, ultimaSync, avisar, aplicarTema, aplicarDiscreto,
  datos, borrar, enLote, actualizar,
} from './nucleo.js';
import * as hoy from './hoy.js';
import * as finanzas from './finanzas.js';
import * as habitos from './habitos-ui.js';
import * as inversion from './inversiones-ui.js';
import * as ajustes from './ajustes.js';

const MODULOS = { hoy, finanzas, inversion, habitos, ajustes };
let actual = 'hoy';

export function ir(nombre) {
  if (!MODULOS[nombre]) return;
  actual = nombre;
  for (const id of Object.keys(MODULOS))
    document.getElementById('v-' + id).classList.toggle('on', id === nombre);
  document.querySelectorAll('#tabs button').forEach(b =>
    b.dataset.v === nombre ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  pintar();
  document.getElementById('v-' + nombre).scrollTop = 0;
}

function pintar() {
  const vista = document.getElementById('v-' + actual);
  actual === 'hoy' ? MODULOS.hoy.pintar(vista, ir) : MODULOS[actual].pintar(vista);
}

document.getElementById('tabs').onclick = e => {
  const b = e.target.closest('button');
  if (b) ir(b.dataset.v);
};

/* Cuando cambian los datos, se repinta lo que se está viendo. */
alCambiar(() => pintar());
/* Y cualquier módulo puede pedir que se cambie de pestaña. */
alNavegar(ir);

/* ---------- Retirada del módulo Notas (v21) ----------
   Se borran de verdad, con lápida, para que la baja viaje al Worker y no
   reaparezcan desde otro dispositivo. La colección sigue en COLECCIONES
   justo para eso. Sin bandera a propósito: si otro dispositivo que no se había
   actualizado vuelve a subir notas, la siguiente apertura las vuelve a tirar. */
if (datos.notas.length) enLote(() => [...datos.notas].forEach(n => borrar('notas', n.id)));

/* ---------- Retirada del modo «estimado» (v26) ----------
   Proyectar lo aportado a un interés fijo no era seguir una inversión, era
   simular una. Lo que proyecta ahora vive en el simulador, que no finge mirar
   tus datos. Los productos que estuvieran en ese modo pasan a valor a mano. */
{
  const viejos = datos.inversiones.filter(p => p.modo === 'estimado');
  if (viejos.length) enLote(() =>
    viejos.forEach(p => actualizar('inversiones', p.id, { modo: 'manual' })));
}

/* El tema elegido, antes de pintar nada, para que no haya un fogonazo claro. */
aplicarTema();
aplicarDiscreto();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => aplicarTema());

/* Las ocho categorías de siempre se crean la primera vez que se abre la app. */
finanzas.sembrarCategorias();
/* Los gastos fijos cuyo día ya ha llegado se registran solos. */
finanzas.generarFijos();

/* Parámetros de URL, para los atajos:  ?ver=finanzas  ·  ?add=1  ·  ?cat=comida */
const p = new URLSearchParams(location.search);
if (p.has('add')) { finanzas.irASub('anadir', { modulo: 'hoy' }); actual = 'finanzas' }
if (p.get('ver') && MODULOS[p.get('ver')]) actual = p.get('ver');
history.replaceState(null, '', location.pathname);

ir(actual);
sincronizar();

window.addEventListener('online', () => sincronizar());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    if (Date.now() - ultimaSync > 20000) sincronizar();
    pintar();   // por si ha cambiado el día mientras estaba en segundo plano
  }
});

/* ---------- Aviso de versión nueva ----------
   El service worker instala la versión nueva pero se queda esperando: no se
   cambia el código bajo los pies del usuario a mitad de un gasto. Cuando él
   acepta, se le da el relevo y la página se recarga una sola vez. */
if ('serviceWorker' in navigator) {
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return;
    recargando = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js').then(reg => {
    const ofrecer = sw => {
      if (!sw || !navigator.serviceWorker.controller) return;   // primera instalación
      avisar('Hay una versión nueva', { texto:'Recargar',
        alPulsar: () => sw.postMessage('relevo') });
    };
    if (reg.waiting) ofrecer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed') ofrecer(sw);
      });
    });
    /* Busca actualizaciones al abrir y cada vez que se vuelve a la app. */
    const mirar = () => reg.update().catch(() => {});
    mirar();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) mirar() });
  }).catch(() => {});
}
