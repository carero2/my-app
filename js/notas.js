/* ==========================================================================
   Módulo Notas. Cada nota tiene título, categoría y texto.
   Las categorías funcionan como en hábitos: las escribe el usuario y se
   convierten en los submódulos de la pestaña.
   ========================================================================== */
import {
  datos, anadir, actualizar, borrar, restaurar, ajuste,
  escapar, avisar, abrirHoja, cerrarHoja, emitir,
} from './nucleo.js';

/* Cada categoría tiene su color, fijado la primera vez que se crea.
   Se copia también en cada nota para que viaje en la sincronización. */
export const PALETA = ['#4E8A5B','#7A5BA6','#D98A2B','#3E6FA8','#C7513F','#8C8378'];
export function colorCat(c) {
  const mapa = ajuste('coloresNota') || {};
  if (mapa[c]) return mapa[c];
  const heredado = datos.notas.find(n => (n.cat || 'General') === c && n.color)?.color;
  const usados = new Set(Object.values(mapa));
  const col = heredado || PALETA.find(x => !usados.has(x)) ||
              PALETA[Object.keys(mapa).length % PALETA.length];
  ajuste('coloresNota', { ...mapa, [c]: col });
  return col;
}
export function fijarColorCat(c, col) {
  ajuste('coloresNota', { ...(ajuste('coloresNota') || {}), [c]: col });
  datos.notas.filter(n => (n.cat || 'General') === c && n.color !== col)
    .forEach(n => actualizar('notas', n.id, { color: col }));
}

const porFecha = (a, b) => (b.m || b.t) - (a.m || a.t);
export const categorias = () =>
  [...new Set(datos.notas.map(n => n.cat || 'General'))].sort();

let catSel = null;

export function pintar(vista) {
  const cats = categorias();
  if (catSel && !cats.includes(catSel)) catSel = null;
  const lista = datos.notas.filter(n => !catSel || (n.cat || 'General') === catSel).sort(porFecha);

  vista.innerHTML = `<div class="scroll">
    <div class="segmentos envuelve">
      <button class="seg" data-c="" aria-pressed="${!catSel}">Todas</button>
      ${cats.map(c => { const col = colorCat(c); return `<button class="seg" data-c="${escapar(c)}"
        aria-pressed="${catSel === c}" style="${catSel === c
          ? `background:${col};border-color:transparent;color:#fff`
          : `border-color:${col}66`}"><i class="pinta" style="background:${col}"></i>${escapar(c)}</button>` }).join('')}
    </div>
    <div class="acciones"><button class="accion nuevo" data-c="+">+ Nota</button></div>
    <div id="notasCuerpo"></div></div>`;

  vista.querySelector('.scroll').addEventListener('click', e => {
    const b = e.target.closest('.seg[data-c], .accion[data-c]'); if (!b) return;
    if (b.dataset.c === '+') return hojaNota(null);
    catSel = b.dataset.c || null;
    pintar(vista);
  });

  const cuerpo = vista.querySelector('#notasCuerpo');
  if (!lista.length) {
    cuerpo.innerHTML = `<p class="vacio">
      ${datos.notas.length ? 'No hay notas en esta categoría.' : 'Todavía no has escrito ninguna nota.'}
      <button id="crear">Escribir una</button></p>`;
    cuerpo.querySelector('#crear').onclick = () => hojaNota(null);
    return;
  }

  cuerpo.innerHTML = lista.map(n => `
    <div class="nota" data-id="${n.id}" style="border-left-color:${colorCat(n.cat || 'General')}">
      <div class="nota-cab">
        <b>${escapar(n.titulo || 'Sin título')}</b>
        <span class="nota-cat" style="background:${colorCat(n.cat || 'General')}1f;
          color:${colorCat(n.cat || 'General')}">${escapar(n.cat || 'General')}</span>
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
    <label><span>Color de la categoría</span></label>
    <div class="colores" id="nCol"></div>
    <p class="pieNota" id="nColNota" style="padding:6px 2px 0"></p>
    <label><span>Texto</span><textarea id="nTxt" placeholder="Escribe aquí…">${escapar(d.texto)}</textarea></label>
    <div class="fila">
      ${nueva ? '' : '<button class="mal" id="nBorrar">Borrar</button>'}
      <button id="nCancelar">Cancelar</button>
      <button class="ok" id="nOk">${nueva ? 'Crear' : 'Guardar'}</button>
    </div>`,
  caja => {
    const $ = s => caja.querySelector(s);
    let color = null;
    const catActual = () => $('#nCat').value.trim() || 'General';
    const existe = () => categorias().includes(catActual());
    const siguiente = () => {
      const usados = new Set(Object.values(ajuste('coloresNota') || {}));
      return PALETA.find(x => !usados.has(x)) || PALETA[0];
    };
    const pintarColor = () => {
      const actual = color || (existe() ? colorCat(catActual()) : null) || siguiente();
      $('#nCol').innerHTML = PALETA.map(c => `<button data-c="${c}" style="background:${c}"
        aria-pressed="${c === actual}" aria-label="Color"></button>`).join('');
      $('#nColNota').textContent = existe()
        ? `El color es de toda la categoría «${catActual()}».`
        : `Categoría nueva: este color quedará asociado a «${catActual()}».`;
    };
    pintarColor();
    $('#nCat').oninput = () => { color = null; pintarColor() };
    $('#nCol').onclick = e => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      color = b.dataset.c; pintarColor();
    };
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
      const cat = catActual();
      const col = color || (existe() ? colorCat(cat) : siguiente());
      fijarColorCat(cat, col);
      const campos = { titulo, texto, cat, color: col, m: Date.now() };
      nueva ? anadir('notas', campos) : actualizar('notas', n.id, campos);
      cerrarHoja(); emitir();
      avisar(nueva ? 'Nota creada' : 'Nota guardada');
    };
  });
}
