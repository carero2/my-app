/* ==========================================================================
   Módulo Hábitos. Los submódulos son los grupos que define el usuario
   (trabajo, entrenamiento, sueño...).
   Tipos: sino (una casilla), cantidad (con objetivo) y crono (cronómetro).
   ========================================================================== */
import {
  datos, anadir, actualizar, borrar, restaurar, ajuste,
  dia, diaSuma, desdeDia, escapar,
  avisar, abrirHoja, cerrarHoja, emitir,
} from './nucleo.js';

export const TIPOS = {
  sino:     { nom:'Sí o no',      ayuda:'Una casilla que marcas al cumplirlo' },
  cantidad: { nom:'Cantidad',     ayuda:'Cuentas unidades hacia un objetivo' },
  crono:    { nom:'Cronómetro',   ayuda:'Mides el tiempo dedicado, tipo pomodoro' },
};
export const PALETA = ['#C7513F','#3E6FA8','#D98A2B','#4E8A5B','#7A5BA6','#8C8378'];

const activos = () => datos.habitos.filter(h => !h.archivado)
  .sort((a,b) => (a.orden ?? 0) - (b.orden ?? 0) || a.t - b.t);
export const grupos = () => [...new Set(activos().map(h => h.grupo || 'General'))];

const idReg = (hab, d) => `${hab}_${d}`;
/* Se busca por campos, no por id: así el id puede cambiar (al deshacer un
   borrado) sin que se pierda el registro del día. */
export const registro = (hab, d = dia()) => datos.registros.find(r => r.hab === hab && r.d === d);
export const valorDe = (hab, d = dia()) => registro(hab, d)?.v || 0;

/** Objetivo cumplido ese día. */
export function cumplido(h, d = dia()) {
  const v = valorDe(h.id, d);
  if (h.tipo === 'sino') return v >= 1;
  return v >= (h.objetivo || 1);
}
export function racha(h) {
  let n = 0, d = dia();
  if (!cumplido(h, d)) d = diaSuma(d, -1);      // el día en curso aún puede completarse
  while (cumplido(h, d)) { n++; d = diaSuma(d, -1) }
  return n;
}

function fijarValor(h, v) {
  const d = dia();
  const val = Math.max(0, Math.round(v * 100) / 100);
  const existente = registro(h.id, d);
  /* Desmarcar deja el registro a cero en lugar de borrarlo: un borrado
     dejaría lápida en el servidor y el día no se podría volver a marcar. */
  if (existente) actualizar('registros', existente.id, { v: val });
  else if (val > 0) anadir('registros', { id: idReg(h.id, d), hab: h.id, d, v: val });
}

/* ==========================================================================
   Cronómetro
   ========================================================================== */
export const cronoActivo = () => ajuste('crono');
let avisado = false;

export function arrancarCrono(h) {
  const actual = cronoActivo();
  if (actual && actual.hab !== h.id) {
    const otro = datos.habitos.find(x => x.id === actual.hab);
    pararCrono();
    avisar('Se paró ' + (otro?.nombre || 'el otro cronómetro'));
  }
  ajuste('crono', { hab: h.id, inicio: Date.now() });
  avisado = false;
  emitir();
}
export function pararCrono() {
  const c = cronoActivo();
  if (!c) return 0;
  const h = datos.habitos.find(x => x.id === c.hab);
  const mins = (Date.now() - c.inicio) / 60000;
  ajuste('crono', null);
  if (h && mins >= 0.1) fijarValor(h, valorDe(h.id) + mins);
  emitir();
  return mins;
}
export const minutosCrono = h => {
  const c = cronoActivo();
  return c && c.hab === h.id ? (Date.now() - c.inicio) / 60000 : 0;
};
const reloj = m => {
  const t = Math.max(0, Math.floor(m * 60));
  return `${String(Math.floor(t/3600) ? Math.floor(t/3600) + ':' : '').padStart(0)}` +
         `${String(Math.floor(t/60) % 60).padStart(2,'0')}:${String(t % 60).padStart(2,'0')}`;
};

/* Un solo temporizador para toda la app: refresca los relojes en pantalla. */
setInterval(() => {
  const c = cronoActivo();
  if (!c) return;
  const h = datos.habitos.find(x => x.id === c.hab);
  if (!h) { ajuste('crono', null); return }
  document.querySelectorAll(`[data-reloj="${h.id}"]`).forEach(el => {
    el.textContent = reloj(valorDe(h.id) + minutosCrono(h));
  });
  if (!avisado && h.objetivo && valorDe(h.id) + minutosCrono(h) >= h.objetivo) {
    avisado = true;
    navigator.vibrate?.([200, 100, 200]);
    avisar(`${h.nombre}: ${h.objetivo} min completados`,
      { texto:'Parar', alPulsar: () => { pararCrono(); avisar('Cronómetro parado') } });
  }
}, 1000);

/* ==========================================================================
   Tarjetas
   ========================================================================== */
export function tarjeta(h) {
  const v = valorDe(h.id);
  const enMarcha = cronoActivo()?.hab === h.id;
  const obj = h.objetivo || 0;
  const total = h.tipo === 'crono' ? v + minutosCrono(h) : v;
  const pct = obj ? Math.min(total / obj, 1) * 100 : (total > 0 ? 100 : 0);
  const col = h.color || PALETA[1];

  let control = '';
  if (h.tipo === 'sino') {
    control = `<button class="marca ${cumplido(h) ? 'hecho' : ''}" data-acc="sino" data-h="${h.id}"
      ${cumplido(h) ? `style="background:${col}"` : ''} aria-label="Marcar">✓</button>`;
  } else if (h.tipo === 'cantidad') {
    control = `<div class="contador">
      <button data-acc="menos" data-h="${h.id}" aria-label="Restar">−</button>
      <div class="valor num" data-acc="fijar" data-h="${h.id}">${redondo(v)}
        <small>${obj ? 'de ' + obj : ''} ${escapar(h.unidad || '')}</small></div>
      <button data-acc="mas" data-h="${h.id}" aria-label="Sumar">+</button></div>`;
  } else {
    control = `<div class="crono">
      <span class="reloj num" data-reloj="${h.id}">${reloj(total)}</span>
      <button class="play ${enMarcha ? 'marcha' : ''}" data-acc="crono" data-h="${h.id}"
        aria-label="${enMarcha ? 'Parar' : 'Empezar'}">${enMarcha ? '■' : '▶'}</button></div>`;
  }

  const r = racha(h);
  return `<div class="hab" data-hab="${h.id}">
    <div class="hab-cab">
      <div class="punto" style="background:${col}22;color:${col}">${h.emo || '•'}</div>
      <div class="hab-nom" data-acc="editar" data-h="${h.id}">
        <b>${escapar(h.nombre)}</b>
        <small>${escapar(h.grupo || 'General')}${obj ? ' · objetivo ' +
          (h.tipo === 'crono' ? obj + ' min' : obj + ' ' + escapar(h.unidad || '')) : ''}</small>
      </div>
      ${control}
    </div>
    ${obj || h.tipo !== 'sino' ? `<div class="barra"><i style="width:${pct}%;background:${col}"></i></div>` : ''}
    <div class="semana">${semana(h, col)}</div>
    ${r ? `<div class="racha">🔥 ${r} día${r === 1 ? '' : 's'} seguidos</div>` : ''}
  </div>`;
}
const redondo = n => Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',');

function semana(h, col) {
  const dias = ['D','L','M','X','J','V','S'];
  let salida = '';
  for (let i = 6; i >= 0; i--) {
    const d = diaSuma(dia(), -i);
    const v = valorDe(h.id, d);
    const obj = h.objetivo || 1;
    const pct = h.tipo === 'sino' ? (v >= 1 ? 1 : 0) : Math.min(v / obj, 1);
    salida += `<div><i style="${pct ? `background:${col};opacity:${0.25 + pct*0.75}` : ''}"></i>
      ${dias[desdeDia(d).getDay()]}</div>`;
  }
  return salida;
}

/** Conecta los clics de un contenedor que muestre tarjetas de hábitos. */
export function conectar(contenedor, repintar) {
  contenedor.onclick = e => {
    const b = e.target.closest('[data-acc]'); if (!b) return;
    const h = datos.habitos.find(x => x.id === b.dataset.h); if (!h) return;
    const v = valorDe(h.id);

    if (b.dataset.acc === 'sino')  { fijarValor(h, v >= 1 ? 0 : 1); navigator.vibrate?.(12) }
    if (b.dataset.acc === 'mas')   { fijarValor(h, v + (h.paso || 1)); navigator.vibrate?.(8) }
    if (b.dataset.acc === 'menos') { fijarValor(h, v - (h.paso || 1)); navigator.vibrate?.(8) }
    if (b.dataset.acc === 'fijar') return hojaValor(h);
    if (b.dataset.acc === 'crono') {
      if (cronoActivo()?.hab === h.id) { const m = pararCrono();
        avisar(`Sumados ${Math.round(m)} min a ${h.nombre}`) }
      else arrancarCrono(h);
    }
    if (b.dataset.acc === 'editar') return hojaHabito(h);
    repintar?.();
  };
}

/* ==========================================================================
   Vista principal del módulo
   ========================================================================== */
let grupoSel = null;

export function pintar(vista) {
  const gs = grupos();
  if (grupoSel && !gs.includes(grupoSel)) grupoSel = null;

  vista.innerHTML = `<div class="scroll">
    <div class="segmentos">
      <button class="seg" data-g="" aria-pressed="${!grupoSel}">Todos</button>
      ${gs.map(g => `<button class="seg" data-g="${escapar(g)}"
        aria-pressed="${grupoSel===g}">${escapar(g)}</button>`).join('')}
      <button class="seg" data-g="+" style="font-weight:600">+ Hábito</button>
    </div>
    <div id="habCuerpo"></div></div>`;

  vista.querySelector('.segmentos').onclick = e => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    if (b.dataset.g === '+') return hojaHabito(null);
    grupoSel = b.dataset.g || null;
    pintar(vista);
  };

  const cuerpo = vista.querySelector('#habCuerpo');
  const lista = activos().filter(h => !grupoSel || (h.grupo || 'General') === grupoSel);

  if (!lista.length) {
    cuerpo.innerHTML = `<p class="vacio">
      ${datos.habitos.length ? 'No hay hábitos en este grupo.' : 'Todavía no has creado ningún hábito.'}
      <button id="crear">Crear el primero</button></p>`;
    cuerpo.querySelector('#crear').onclick = () => hojaHabito(null);
    return;
  }
  cuerpo.innerHTML = lista.map(tarjeta).join('');
  conectar(cuerpo, () => pintar(vista));
}

/* ==========================================================================
   Hojas de edición
   ========================================================================== */
function hojaValor(h) {
  abrirHoja(`<h3>${escapar(h.nombre)}</h3>
    <label><span>Valor de hoy${h.unidad ? ' en ' + escapar(h.unidad) : ''}</span>
      <input id="vVal" type="number" inputmode="decimal" step="any" min="0" value="${valorDe(h.id)}"></label>
    <div class="fila"><button id="vCancelar">Cancelar</button>
      <button class="ok" id="vOk">Guardar</button></div>`,
  caja => {
    caja.querySelector('#vVal').focus();
    caja.querySelector('#vCancelar').onclick = cerrarHoja;
    caja.querySelector('#vOk').onclick = () => {
      fijarValor(h, parseFloat(caja.querySelector('#vVal').value) || 0);
      cerrarHoja(); emitir();
    };
  });
}

export function hojaHabito(h) {
  const nuevo = !h;
  const d = h || { nombre:'', grupo: grupoSel || '', tipo:'sino', objetivo:'', unidad:'',
                   emo:'•', color: PALETA[1], paso: 1 };
  abrirHoja(`
    <h3>${nuevo ? 'Nuevo hábito' : 'Editar hábito'}</h3>
    <label><span>Nombre</span><input id="hNom" maxlength="40" value="${escapar(d.nombre)}"
      placeholder="Leer, entrenar, dormir…"></label>
    <label><span>Grupo (será una pestaña dentro de Hábitos)</span>
      <input id="hGrupo" maxlength="24" list="listaGrupos" value="${escapar(d.grupo)}"
        placeholder="Trabajo, entrenamiento, sueño…">
      <datalist id="listaGrupos">${grupos().map(g => `<option value="${escapar(g)}">`).join('')}</datalist></label>
    <label><span>Emoji</span><input id="hEmo" maxlength="2" value="${escapar(d.emo || '•')}"></label>
    <label><span>Tipo</span></label>
    <div class="opciones" id="hTipos">
      ${Object.entries(TIPOS).map(([id,t]) => `<button data-t="${id}"
        aria-pressed="${d.tipo===id}">${t.nom}</button>`).join('')}
    </div>
    <p class="pieNota" id="hAyuda" style="padding:6px 2px 0">${TIPOS[d.tipo].ayuda}</p>
    <div id="hExtra"></div>
    <label><span>Color</span></label>
    <div class="colores" id="hCol">${PALETA.map(c => `<button data-c="${c}"
      style="background:${c}" aria-pressed="${d.color===c}" aria-label="Color"></button>`).join('')}</div>
    <div class="fila">
      ${nuevo ? '' : '<button class="mal" id="hBorrar">Borrar</button>'}
      <button id="hCancelar">Cancelar</button>
      <button class="ok" id="hOk">${nuevo ? 'Crear' : 'Guardar'}</button>
    </div>`,
  caja => {
    let tipo = d.tipo, color = d.color || PALETA[1];

    const pintarExtra = () => {
      caja.querySelector('#hAyuda').textContent = TIPOS[tipo].ayuda;
      caja.querySelector('#hExtra').innerHTML = tipo === 'sino' ? '' : `
        <label><span>${tipo === 'crono' ? 'Objetivo diario en minutos' : 'Objetivo diario'}</span>
          <input id="hObj" type="number" inputmode="numeric" min="0" step="any"
            value="${d.objetivo || ''}" placeholder="${tipo === 'crono' ? '25' : '10'}"></label>
        ${tipo === 'cantidad' ? `
        <label><span>Unidad</span><input id="hUni" maxlength="14" value="${escapar(d.unidad || '')}"
          placeholder="páginas, vasos, km…"></label>
        <label><span>Cuánto suma cada toque</span><input id="hPaso" type="number" min="0.1" step="any"
          value="${d.paso || 1}"></label>` : ''}`;
    };
    pintarExtra();

    caja.querySelector('#hTipos').onclick = e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      tipo = b.dataset.t;
      caja.querySelectorAll('#hTipos button').forEach(x =>
        x.setAttribute('aria-pressed', x.dataset.t === tipo));
      pintarExtra();
    };
    caja.querySelector('#hCol').onclick = e => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      color = b.dataset.c;
      caja.querySelectorAll('#hCol button').forEach(x =>
        x.setAttribute('aria-pressed', x.dataset.c === color));
    };
    caja.querySelector('#hCancelar').onclick = cerrarHoja;
    caja.querySelector('#hBorrar')?.addEventListener('click', () => {
      const regs = datos.registros.filter(r => r.hab === h.id);
      const it = borrar('habitos', h.id);
      regs.forEach(r => borrar('registros', r.id));
      cerrarHoja(); emitir();
      avisar('Hábito borrado', { texto:'Deshacer', alPulsar: () => {
        restaurar('habitos', it); regs.forEach(r => restaurar('registros', r)); emitir();
      }});
    });
    caja.querySelector('#hOk').onclick = () => {
      const nombre = caja.querySelector('#hNom').value.trim();
      if (!nombre) return avisar('Ponle un nombre');
      const campos = {
        nombre, tipo, color,
        grupo: caja.querySelector('#hGrupo').value.trim() || 'General',
        emo: caja.querySelector('#hEmo').value.trim() || '•',
        objetivo: parseFloat(caja.querySelector('#hObj')?.value) || 0,
        unidad: caja.querySelector('#hUni')?.value.trim() || '',
        paso: parseFloat(caja.querySelector('#hPaso')?.value) || 1,
      };
      if (nuevo) { anadir('habitos', { ...campos, orden: datos.habitos.length }); avisar('Hábito creado') }
      else { actualizar('habitos', h.id, campos); avisar('Hábito actualizado') }
      cerrarHoja(); emitir();
    };
  });
}
