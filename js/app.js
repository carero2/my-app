/* ==========================================================================
   Arranque y navegación entre módulos.
   ========================================================================== */
import { alCambiar, sincronizar, ultimaSync } from './nucleo.js';
import * as hoy from './hoy.js';
import * as finanzas from './finanzas.js';
import * as habitos from './habitos.js';
import * as notas from './notas.js';
import * as ajustes from './ajustes.js';

const MODULOS = { hoy, finanzas, habitos, notas, ajustes };
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

/* Parámetros de URL, para los atajos:  ?ver=finanzas  ·  ?add=1  ·  ?cat=comida */
const p = new URLSearchParams(location.search);
if (p.has('add')) { finanzas.irASub('anadir'); actual = 'finanzas' }
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

if ('serviceWorker' in navigator)
  navigator.serviceWorker.register('sw.js').catch(() => {});
