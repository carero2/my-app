/* ==========================================================================
   Módulo Notas. Cada nota tiene título, categoría y texto.
   Las categorías funcionan como en hábitos: las escribe el usuario y se
   convierten en los submódulos de la pestaña.
   ========================================================================== */
import {
  datos, anadir, actualizar, borrar, restaurar,
  escapar, avisar, abrirHoja, cerrarHoja, emitir,
} from './nucleo.js';

const porFecha = (a, b) => (b.m || b.t) - (a.m || a.t);
export const categorias = () =>
  [...new Set(datos.notas.map(n => n.cat || 'General'))].sort();

let catSel = null;

export function pintar(vista) {
  const cats = categorias();
  if (catSel && !cats.includes(catSel)) catSel = null;
  const lista = datos.notas.filter(n => !catSel || (n.cat || 'General') === catSel).sort(porFecha);

  vista.innerHTML = `<div class="scroll">
    <div class="segmentos">
      <button class="seg" data-c="" aria-pressed="${!catSel}">Todas</button>
      ${cats.map(c => `<button class="seg" data-c="${escapar(c)}"
        aria-pressed="${catSel === c}">${escapar(c)}</button>`).join('')}
      <button class="seg nuevo" data-c="+">+ Nota</button>
    </div>
    <div id="notasCuerpo"></div></div>`;

  vista.querySelector('.segmentos').onclick = e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    if (b.dataset.c === '+') return hojaNota(null);
    catSel = b.dataset.c || null;
    pintar(vista);
  };

  const cuerpo = vista.querySelector('#notasCuerpo');
  if (!lista.length) {
    cuerpo.innerHTML = `<p class="vacio">
      ${datos.notas.length ? 'No hay notas en esta categoría.' : 'Todavía no has escrito ninguna nota.'}
      <button id="crear">Escribir una</button></p>`;
    cuerpo.querySelector('#crear').onclick = () => hojaNota(null);
    return;
  }

  cuerpo.innerHTML = lista.map(n => `
    <div class="nota" data-id="${n.id}">
      <div class="nota-cab">
        <b>${escapar(n.titulo || 'Sin título')}</b>
        <span class="nota-cat">${escapar(n.cat || 'General')}</span>
      </div>
      ${n.texto ? `<p>${escapar(n.texto).replace(/\n/g, '<br>')}</p>` : ''}
      <small>${new Date(n.m || n.t).toLocaleDateString('es-ES',
        {day:'numeric', month:'short', year:'numeric'})}</small>
    </div>`).join('');

  cuerpo.onclick = e => {
    const caja = e.target.closest('[data-id]'); if (!caja) return;
    hojaNota(datos.notas.find(n => n.id === caja.dataset.id));
  };
}

export function hojaNota(n) {
  const nueva = !n;
  const d = n || { titulo:'', cat: catSel || '', texto:'' };
  abrirHoja(`
    <h3>${nueva ? 'Nueva nota' : 'Editar nota'}</h3>
    <label><span>Título</span><input id="nTit" maxlength="80" value="${escapar(d.titulo)}"
      placeholder="Título de la nota"></label>
    <label><span>Categoría</span>
      <input id="nCat" maxlength="24" list="listaCats" value="${escapar(d.cat)}"
        placeholder="Ideas, recetas, trabajo…">
      <datalist id="listaCats">${categorias().map(c =>
        `<option value="${escapar(c)}">`).join('')}</datalist></label>
    <label><span>Texto</span><textarea id="nTxt" placeholder="Escribe aquí…">${escapar(d.texto)}</textarea></label>
    <div class="fila">
      ${nueva ? '' : '<button class="mal" id="nBorrar">Borrar</button>'}
      <button id="nCancelar">Cancelar</button>
      <button class="ok" id="nOk">${nueva ? 'Crear' : 'Guardar'}</button>
    </div>`,
  caja => {
    const $ = s => caja.querySelector(s);
    if (nueva) $('#nTit').focus();
    $('#nCancelar').onclick = cerrarHoja;
    $('#nBorrar')?.addEventListener('click', () => {
      const it = borrar('notas', n.id);
      cerrarHoja(); emitir();
      avisar('Nota borrada',
        { texto:'Deshacer', alPulsar: () => { restaurar('notas', it); emitir() } });
    });
    $('#nOk').onclick = () => {
      const titulo = $('#nTit').value.trim();
      const texto  = $('#nTxt').value.trim();
      if (!titulo && !texto) return avisar('Escribe al menos un título o algo de texto');
      const campos = { titulo, texto, cat: $('#nCat').value.trim() || 'General', m: Date.now() };
      nueva ? anadir('notas', campos) : actualizar('notas', n.id, campos);
      cerrarHoja(); emitir();
      avisar(nueva ? 'Nota creada' : 'Nota guardada');
    };
  });
}
