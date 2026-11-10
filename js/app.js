import { MODO_DEMO, NOMBRE_SISTEMA } from './config.js';
import * as store from './store.js';
const { data, sesion } = store;

// ---------------------------------------------------------------
// Constantes y utilidades
// ---------------------------------------------------------------
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Jerarquía: a mayor rango, más privilegios.
export const ROLES = {
  jefe: { label: 'Jefe de departamento', corto: 'Jefe', rango: 4 },
  coordinador: { label: 'Coordinador de área', corto: 'Coordinador', rango: 3 },
  adjunto: { label: 'Coordinador adjunto', corto: 'Adjunto', rango: 2 },
  tecnico: { label: 'Técnico', corto: 'Técnico', rango: 1 }
};
const GRUPOS = {
  activo: 'De turno',
  pasivo: 'Turno pasivo',
  ausente: 'Franco / ausente',
  libre: 'Sin asignar'
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iniciales = (n) => {
  const p = String(n).trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
};
const diasEnMes = (a, m) => new Date(a, m, 0).getDate();
const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------
// Estado de la interfaz
// ---------------------------------------------------------------
const hoy = new Date();
const ui = {
  tab: 'general',
  anio: hoy.getFullYear(),
  mes: hoy.getMonth() + 1,
  dia: hoy.getDate(),
  area: null,     // área seleccionada (calendario y planificación)
  pincel: null    // tipo de turno activo en la planificación ('' = borrar)
};

// ---------------------------------------------------------------
// Permisos (la interfaz los aplica; en Firebase además los exigen
// las reglas de firestore.rules)
// ---------------------------------------------------------------
const yo = () => sesion.usuario;
const esJefe = () => yo()?.rol === 'jefe';
const coordinaArea = (areaId) => esJefe() ||
  (['coordinador', 'adjunto'].includes(yo()?.rol) && !!areaId && yo().areaId === areaId);
const rolesAsignables = () => Object.keys(ROLES).filter(r => esJefe() || ROLES[r].rango < ROLES[yo().rol].rango);
const puedeEditarPersona = (p) => esJefe() || (coordinaArea(p.areaId) && ROLES[p.rol].rango < ROLES[yo().rol].rango);

// ---------------------------------------------------------------
// Selectores de datos
// ---------------------------------------------------------------
const areasOrdenadas = () => [...data.areas].sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre, 'es'));
const tiposOrdenados = () => [...data.tipos].sort((a, b) => (a.orden || 0) - (b.orden || 0));
const tipo = (code) => data.tipos.find(t => t.id === code);
const personasDe = (areaId) => data.personas
  .filter(p => (p.areaId || null) === areaId)
  .sort((a, b) => ROLES[b.rol].rango - ROLES[a.rol].rango || a.nombre.localeCompare(b.nombre, 'es'));
const turnoDe = (personaId, dia) => (data.turnos[personaId] || {})[dia] || null;
const feriado = (dia) => data.feriados.find(f => f.anio === ui.anio && f.mes === ui.mes && f.dia === dia);
const areaSel = () => data.areas.find(a => a.id === ui.area) || areasOrdenadas()[0] || null;
const grupoDe = (personaId, dia) => { const t = tipo(turnoDe(personaId, dia)); return t ? t.grupo : 'libre'; };

// ---------------------------------------------------------------
// Componentes chicos
// ---------------------------------------------------------------
const chipsAreas = () => `<div class="chips" role="tablist" aria-label="Área">${areasOrdenadas().map(a =>
  `<button class="chip-area${a.id === areaSel()?.id ? ' activa' : ''}" data-accion="area" data-id="${esc(a.id)}">${esc(a.nombre)}</button>`).join('')}</div>`;

const leyenda = () => `<div class="leyenda">${tiposOrdenados().map(t =>
  `<span class="leyenda-item"><span class="punto" style="background:${esc(t.color)}"></span><b>${esc(t.id)}</b> ${esc(t.label)}${t.horario ? ` <i>${esc(t.horario)}</i>` : ''}</span>`).join('')}</div>`;

const pildora = (code) => {
  const t = tipo(code);
  if (!t) return '<span class="pildora vacia">Sin asignar</span>';
  return `<span class="pildora" style="--c:${esc(t.color)}">${esc(t.label)}${t.horario ? ` · ${esc(t.horario)}` : ''}</span>`;
};
const rolBadge = (rol) => rol === 'tecnico' ? '' : `<span class="rol rol-${rol}">${ROLES[rol].corto}</span>`;

// ---------------------------------------------------------------
// VISTA GENERAL
// ---------------------------------------------------------------
function calendario(area) {
  const gente = personasDe(area.id);
  const total = diasEnMes(ui.anio, ui.mes);
  const offset = (new Date(ui.anio, ui.mes - 1, 1).getDay() + 6) % 7; // lunes = 0
  const esMesActual = ui.anio === hoy.getFullYear() && ui.mes === hoy.getMonth() + 1;
  let celdas = '';
  for (let i = 0; i < offset; i++) celdas += '<div class="dia fuera"></div>';
  for (let d = 1; d <= total; d++) {
    const dow = new Date(ui.anio, ui.mes - 1, d).getDay();
    const fer = feriado(d);
    let fichas = '', ausentes = 0;
    gente.forEach(p => {
      const t = tipo(turnoDe(p.id, d));
      if (!t) return;
      if (t.grupo === 'ausente') { ausentes++; return; }
      fichas += `<span class="ficha${t.grupo === 'pasivo' ? ' pasivo' : ''}" style="--c:${esc(t.color)}" title="${esc(p.nombre)} — ${esc(t.label)}">${esc(iniciales(p.nombre))}<small>${esc(t.id)}</small></span>`;
    });
    const cls = ['dia', dow === 0 || dow === 6 ? 'finde' : '', fer ? 'feriado' : '',
      esMesActual && d === hoy.getDate() ? 'hoy' : '', d === ui.dia ? 'sel' : ''].filter(Boolean).join(' ');
    celdas += `<button class="${cls}" data-accion="dia" data-dia="${d}">
      <span class="dia-num">${d}</span>${fer ? `<span class="dia-fer">${esc(fer.nombre || 'Feriado')}</span>` : ''}
      <span class="fichas">${fichas}</span>${ausentes ? `<span class="dia-aus">${ausentes} ausente${ausentes > 1 ? 's' : ''}</span>` : ''}
    </button>`;
  }
  return `<div class="cal"><div class="cal-head">${DIAS_SEMANA.map(d => `<span>${d}</span>`).join('')}</div><div class="cal-grid">${celdas}</div></div>`;
}

function tarjetaArea(titulo, gente, areaId) {
  const porGrupo = { activo: [], pasivo: [], ausente: [], libre: [] };
  gente.forEach(p => porGrupo[grupoDe(p.id, ui.dia)].push(p));
  const bloques = Object.keys(GRUPOS).filter(g => porGrupo[g].length).map(g => `
    <div class="grupo grupo-${g}">
      <h4>${GRUPOS[g]} <span>${porGrupo[g].length}</span></h4>
      <ul>${porGrupo[g].map(p => `<li>
        <span class="avatar">${esc(iniciales(p.nombre))}</span>
        <span class="nombre">${esc(p.nombre)} ${rolBadge(p.rol)}</span>
        ${pildora(turnoDe(p.id, ui.dia))}
      </li>`).join('')}</ul>
    </div>`).join('');
  return `<article class="tarjeta${areaId && areaId === areaSel()?.id ? ' destacada' : ''}">
    <header><h3>${esc(titulo)}</h3>
      <span class="conteo"><b>${porGrupo.activo.length}</b> de turno · <b>${porGrupo.pasivo.length}</b> pasivo · ${gente.length} en total</span>
    </header>
    ${bloques || '<p class="vacio">Sin personal cargado.</p>'}
  </article>`;
}

function vistaGeneral() {
  const area = areaSel();
  if (!area) return '<p class="vacio">Todavía no hay áreas. El jefe de departamento puede crearlas en Administración.</p>';
  const fecha = new Date(ui.anio, ui.mes - 1, ui.dia);
  const jefatura = personasDe(null);
  const cuenta = (g) => data.personas.filter(p => grupoDe(p.id, ui.dia) === g).length;
  return `
  <section class="bloque">
    <div class="bloque-head"><h2>Turnos de ${esc(area.nombre)}</h2>${chipsAreas()}</div>
    ${leyenda()}
    ${calendario(area)}
    <p class="ayuda">Tocá un día para ver abajo el estado de todo el personal en esa fecha. Las fichas con borde punteado son turnos pasivos.</p>
  </section>
  <section class="bloque">
    <div class="bloque-head">
      <h2>Personal por área</h2>
      <span class="fecha-sel">${DIAS_LARGO[fecha.getDay()]} ${ui.dia} de ${MESES[ui.mes - 1].toLowerCase()}</span>
    </div>
    <div class="resumen">
      <div><b>${cuenta('activo')}</b><span>De turno</span></div>
      <div><b>${cuenta('pasivo')}</b><span>Turno pasivo</span></div>
      <div><b>${cuenta('ausente')}</b><span>Franco / ausente</span></div>
      <div><b>${cuenta('libre')}</b><span>Sin asignar</span></div>
    </div>
    <div class="tarjetas">
      ${areasOrdenadas().map(a => tarjetaArea(a.nombre, personasDe(a.id), a.id)).join('')}
      ${jefatura.length ? tarjetaArea('Jefatura', jefatura, null) : ''}
    </div>
  </section>`;
}

// ---------------------------------------------------------------
// PLANIFICACIÓN DE TURNOS
// ---------------------------------------------------------------
function vistaTurnos() {
  const area = areaSel();
  if (!area) return '<p class="vacio">Todavía no hay áreas.</p>';
  const editable = coordinaArea(area.id);
  const gente = personasDe(area.id);
  const total = diasEnMes(ui.anio, ui.mes);
  if (ui.pincel === null) ui.pincel = tiposOrdenados()[0]?.id ?? '';
  let head = '<th class="col-nombre">Persona</th>';
  for (let d = 1; d <= total; d++) {
    const dow = new Date(ui.anio, ui.mes - 1, d).getDay();
    head += `<th class="${dow === 0 || dow === 6 ? 'finde' : ''}${feriado(d) ? ' feriado' : ''}"><span>${DIAS_SEMANA[(dow + 6) % 7][0]}</span>${d}</th>`;
  }
  const filas = gente.map(p => {
    let tds = '';
    for (let d = 1; d <= total; d++) {
      const dow = new Date(ui.anio, ui.mes - 1, d).getDay();
      const t = tipo(turnoDe(p.id, d));
      tds += `<td class="${dow === 0 || dow === 6 ? 'finde' : ''}${feriado(d) ? ' feriado' : ''}">` +
        `<button class="celda${t ? ' llena' : ''}" ${t ? `style="--c:${esc(t.color)}"` : ''} data-accion="pintar" data-persona="${esc(p.id)}" data-dia="${d}" ` +
        `${editable ? '' : 'disabled'} aria-label="${esc(p.nombre)}, día ${d}${t ? ', ' + esc(t.label) : ''}">${t ? esc(t.id) : ''}</button></td>`;
    }
    return `<tr><th class="col-nombre">${esc(p.nombre)} ${rolBadge(p.rol)}</th>${tds}</tr>`;
  }).join('');
  const barra = editable ? `<div class="pinceles">
      <span class="pinceles-label">Asignar:</span>
      ${tiposOrdenados().map(t => `<button class="pincel${ui.pincel === t.id ? ' activo' : ''}" style="--c:${esc(t.color)}" data-accion="pincel" data-id="${esc(t.id)}"><b>${esc(t.id)}</b> ${esc(t.label)}</button>`).join('')}
      <button class="pincel borrar${ui.pincel === '' ? ' activo' : ''}" data-accion="pincel" data-id="">Borrar</button>
    </div>
    <p class="ayuda">Elegí un tipo de turno y tocá las celdas para asignarlo. Tocar una celda que ya tiene ese mismo tipo la deja vacía.</p>`
    : `<p class="aviso">Solo lectura: los turnos de ${esc(area.nombre)} los cargan su coordinador, su coordinador adjunto o el jefe de departamento.</p>`;
  return `<section class="bloque">
    <div class="bloque-head"><h2>Planificación · ${esc(area.nombre)}</h2>${chipsAreas()}</div>
    ${barra}
    ${gente.length ? `<div class="tabla-wrap"><table class="plan"><thead><tr>${head}</tr></thead><tbody>${filas}</tbody></table></div>`
      : '<p class="vacio">Esta área todavía no tiene personal asignado.</p>'}
  </section>`;
}

// ---------------------------------------------------------------
// PERSONAL
// ---------------------------------------------------------------
function tablaPersonal(titulo, gente, areaId) {
  const puedeAgregar = areaId ? coordinaArea(areaId) : esJefe();
  return `<article class="tarjeta">
    <header><h3>${esc(titulo)}</h3>
      ${puedeAgregar ? `<button class="btn chico" data-accion="persona-nueva" data-area="${esc(areaId || '')}">Agregar persona</button>` : ''}
    </header>
    ${gente.length ? `<table class="lista"><tbody>${gente.map(p => `<tr>
      <td><span class="avatar">${esc(iniciales(p.nombre))}</span></td>
      <td class="lista-nombre">${esc(p.nombre)}<small>${esc(p.email || 'Sin usuario asociado')}</small></td>
      <td><span class="rol rol-${p.rol}">${ROLES[p.rol].label}</span></td>
      <td class="acciones">${puedeEditarPersona(p) ? `<button class="btn-link" data-accion="persona-editar" data-id="${esc(p.id)}">Editar</button>` : ''}</td>
    </tr>`).join('')}</tbody></table>` : '<p class="vacio">Sin personal cargado.</p>'}
  </article>`;
}

function vistaPersonal() {
  return `<section class="bloque">
    <div class="bloque-head"><h2>Personal</h2>
      <span class="fecha-sel">${data.personas.length} personas · ${data.areas.length} áreas</span></div>
    <div class="tarjetas una">
      ${tablaPersonal('Jefatura', personasDe(null), null)}
      ${areasOrdenadas().map(a => tablaPersonal(a.nombre, personasDe(a.id), a.id)).join('')}
    </div>
  </section>`;
}

function modalPersona(p, areaId) {
  const nueva = !p;
  p = p || { nombre: '', email: '', rol: 'tecnico', areaId: areaId || null };
  const roles = rolesAsignables();
  abrirModal(`
    <h3>${nueva ? 'Agregar persona' : 'Editar persona'}</h3>
    <label>Nombre y apellido<input name="nombre" required value="${esc(p.nombre)}"></label>
    <label>Email de acceso (cuenta de Google)<input name="email" type="email" value="${esc(p.email || '')}" placeholder="opcional"></label>
    <label>Rango<select name="rol">${roles.map(r => `<option value="${r}"${r === p.rol ? ' selected' : ''}>${ROLES[r].label}</option>`).join('')}</select></label>
    <label>Área<select name="areaId" ${esJefe() ? '' : 'disabled'}>
      <option value="">Jefatura (sin área)</option>
      ${areasOrdenadas().map(a => `<option value="${esc(a.id)}"${a.id === p.areaId ? ' selected' : ''}>${esc(a.nombre)}</option>`).join('')}
    </select></label>
    <p class="form-error" hidden></p>
    <div class="modal-acciones">
      ${nueva ? '' : '<button type="button" class="btn peligro" data-accion="persona-borrar">Quitar</button>'}
      <button type="button" class="btn secundario" data-accion="cerrar-modal">Cancelar</button>
      <button class="btn">Guardar</button>
    </div>`, (f) => {
    const rol = f.rol.value;
    const area = esJefe() ? (f.areaId.value || null) : p.areaId;
    if (rol === 'jefe' && area) return 'El jefe de departamento no pertenece a un área: elegí "Jefatura".';
    if (rol !== 'jefe' && !area) return 'Elegí el área a la que pertenece.';
    store.guardar('personas', p.id, { nombre: f.nombre.value.trim(), email: f.email.value.trim().toLowerCase(), rol, areaId: area });
  }, p.id);
}

// ---------------------------------------------------------------
// ADMINISTRACIÓN (solo jefe de departamento)
// ---------------------------------------------------------------
function vistaAdmin() {
  if (!esJefe()) return '<p class="aviso">Esta sección es solo para el jefe de departamento.</p>';
  const feriados = data.feriados.filter(f => f.anio === ui.anio).sort((a, b) => a.mes - b.mes || a.dia - b.dia);
  return `<section class="bloque">
    <div class="bloque-head"><h2>Administración</h2></div>
    <div class="tarjetas una">
      <article class="tarjeta">
        <header><h3>Áreas</h3></header>
        <form class="fila-form" data-form="area"><input name="nombre" placeholder="Nombre del área" required><button class="btn chico">Agregar área</button></form>
        <table class="lista"><tbody>${areasOrdenadas().map(a => {
          const n = personasDe(a.id).length;
          return `<tr><td class="lista-nombre">${esc(a.nombre)}<small>${n} persona${n === 1 ? '' : 's'}</small></td>
            <td class="acciones">${n ? '<small>Reasigná su personal para poder quitarla</small>' : `<button class="btn-link peligro" data-accion="borrar" data-col="areas" data-id="${esc(a.id)}">Quitar</button>`}</td></tr>`;
        }).join('')}</tbody></table>
      </article>
      <article class="tarjeta">
        <header><h3>Tipos de turno</h3></header>
        <form class="fila-form" data-form="tipo">
          <input name="id" placeholder="Código (ej. TM)" maxlength="4" required>
          <input name="label" placeholder="Nombre" required>
          <input name="horario" placeholder="Horario (opcional)">
          <select name="grupo" aria-label="Cuenta como">
            <option value="activo">De turno</option><option value="pasivo">Turno pasivo</option><option value="ausente">Franco / ausente</option>
          </select>
          <input name="color" type="color" value="#1F6F63" aria-label="Color">
          <button class="btn chico">Agregar tipo</button>
        </form>
        <table class="lista"><tbody>${tiposOrdenados().map(t => `<tr>
          <td><span class="pildora" style="--c:${esc(t.color)}">${esc(t.id)}</span></td>
          <td class="lista-nombre">${esc(t.label)}<small>${esc(t.horario || 'Sin horario')} · ${GRUPOS[t.grupo]}</small></td>
          <td class="acciones"><button class="btn-link peligro" data-accion="borrar" data-col="tipos" data-id="${esc(t.id)}">Quitar</button></td></tr>`).join('')}</tbody></table>
      </article>
      <article class="tarjeta">
        <header><h3>Feriados de ${ui.anio}</h3></header>
        <form class="fila-form" data-form="feriado"><input name="fecha" type="date" required><input name="nombre" placeholder="Nombre (opcional)"><button class="btn chico">Agregar feriado</button></form>
        ${feriados.length ? `<table class="lista"><tbody>${feriados.map(f => `<tr>
          <td class="lista-nombre">${f.dia} de ${MESES[f.mes - 1].toLowerCase()}<small>${esc(f.nombre || 'Feriado')}</small></td>
          <td class="acciones"><button class="btn-link peligro" data-accion="borrar" data-col="feriados" data-id="${esc(f.id)}">Quitar</button></td></tr>`).join('')}</tbody></table>`
          : '<p class="vacio">No hay feriados cargados para este año.</p>'}
      </article>
    </div>
  </section>`;
}

// ---------------------------------------------------------------
// Modal
// ---------------------------------------------------------------
const modal = $('#modal');
let modalCtx = null;
function abrirModal(html, onSubmit, id) {
  modalCtx = { onSubmit, id };
  modal.innerHTML = `<form method="dialog" class="modal-form">${html}</form>`;
  modal.showModal();
}
modal.addEventListener('submit', (e) => {
  e.preventDefault();
  const error = modalCtx.onSubmit(e.target.elements);
  if (error) { const p = modal.querySelector('.form-error'); p.textContent = error; p.hidden = false; return; }
  modal.close();
});
modal.addEventListener('click', (e) => {
  const accion = e.target.closest('[data-accion]')?.dataset.accion;
  if (accion === 'cerrar-modal') modal.close();
  if (accion === 'persona-borrar') { store.borrar('personas', modalCtx.id); modal.close(); }
});

// ---------------------------------------------------------------
// Render general
// ---------------------------------------------------------------
const VISTAS = { general: vistaGeneral, turnos: vistaTurnos, personal: vistaPersonal, admin: vistaAdmin };

function renderSesion() {
  const caja = $('#sesion');
  if (sesion.estado !== 'ok') { caja.innerHTML = ''; return; }
  const u = yo();
  const area = data.areas.find(a => a.id === u.areaId);
  const quien = `<span class="sesion-rol">${ROLES[u.rol].label}${area ? ' · ' + esc(area.nombre) : ''}</span>`;
  caja.innerHTML = MODO_DEMO
    ? `<label class="ver-como">Ver como
        <select id="verComo">${[null, ...areasOrdenadas().map(a => a.id)].map(aid => {
          const g = personasDe(aid);
          if (!g.length) return '';
          const nombre = aid ? data.areas.find(a => a.id === aid).nombre : 'Jefatura';
          return `<optgroup label="${esc(nombre)}">${g.map(p => `<option value="${esc(p.id)}"${p.id === u.id ? ' selected' : ''}>${esc(p.nombre)} — ${ROLES[p.rol].corto}</option>`).join('')}</optgroup>`;
        }).join('')}</select></label>${quien}`
    : `<span class="sesion-nombre">${esc(u.nombre)}</span>${quien}<button class="btn-link claro" data-accion="logout">Salir</button>`;
}

function render() {
  $('#titulo').textContent = NOMBRE_SISTEMA;
  $('#periodLabel').textContent = `${MESES[ui.mes - 1]} ${ui.anio}`;
  const estado = $('#statusLine');
  estado.className = 'status-line' + (sesion.error ? ' error' : '');
  estado.textContent = sesion.error ? 'Error: ' + sesion.error
    : MODO_DEMO ? 'Modo demo · los cambios quedan solo en este navegador'
    : sesion.estado === 'ok' ? 'Conectado' : 'Conectando…';
  renderSesion();

  const app = $('#app');
  const nav = $('#tabNav');
  if (sesion.estado !== 'ok') {
    nav.hidden = true;
    app.innerHTML = sesion.estado === 'cargando' ? '<p class="vacio">Cargando…</p>'
      : sesion.estado === 'anonimo' ? `<div class="acceso"><h2>Ingresar</h2><p>Entrá con tu cuenta de Google institucional para ver los turnos.</p><button class="btn" data-accion="login">Ingresar con Google</button></div>`
      : `<div class="acceso"><h2>Sin acceso</h2><p>La cuenta <b>${esc(sesion.email)}</b> no está dada de alta. Pedile a tu coordinador o al jefe de departamento que te agregue en Personal con este email.</p><button class="btn secundario" data-accion="logout">Usar otra cuenta</button></div>`;
    return;
  }
  nav.hidden = false;
  nav.querySelector('[data-tab="admin"]').hidden = !esJefe();
  if (ui.tab === 'admin' && !esJefe()) ui.tab = 'general';
  if (!data.areas.some(a => a.id === ui.area)) ui.area = (yo().areaId && data.areas.some(a => a.id === yo().areaId)) ? yo().areaId : areasOrdenadas()[0]?.id || null;
  nav.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === ui.tab));

  // Conserva el scroll horizontal de la grilla al repintar
  const wrap = app.querySelector('.tabla-wrap');
  const scroll = wrap ? wrap.scrollLeft : 0;
  app.innerHTML = VISTAS[ui.tab]();
  const nuevo = app.querySelector('.tabla-wrap');
  if (nuevo) nuevo.scrollLeft = scroll;
}

// ---------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------
function cambiarMes(delta) {
  let m = ui.mes + delta, a = ui.anio;
  if (m < 1) { m = 12; a--; }
  if (m > 12) { m = 1; a++; }
  ui.mes = m; ui.anio = a;
  const actual = a === hoy.getFullYear() && m === hoy.getMonth() + 1;
  ui.dia = actual ? hoy.getDate() : 1;
  store.setPeriodo(a, m);
  render();
}
$('#prevMonthBtn').addEventListener('click', () => cambiarMes(-1));
$('#nextMonthBtn').addEventListener('click', () => cambiarMes(1));

$('#tabNav').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  ui.tab = b.dataset.tab;
  render();
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'verComo') { ui.area = null; store.verComo(e.target.value); }
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-accion]');
  if (!el || modal.contains(el)) return;
  const d = el.dataset;
  switch (d.accion) {
    case 'area': ui.area = d.id; render(); break;
    case 'dia': ui.dia = Number(d.dia); render(); break;
    case 'pincel': ui.pincel = d.id; render(); break;
    case 'pintar': {
      const p = data.personas.find(x => x.id === d.persona);
      if (!p || !coordinaArea(p.areaId)) return;
      const actual = turnoDe(p.id, d.dia);
      store.setTurno(p, Number(d.dia), ui.pincel && ui.pincel !== actual ? ui.pincel : null);
      break;
    }
    case 'persona-nueva': modalPersona(null, d.area || null); break;
    case 'persona-editar': modalPersona(data.personas.find(x => x.id === d.id)); break;
    case 'borrar': if (esJefe()) store.borrar(d.col, d.id); break;
    case 'login': store.login(); break;
    case 'logout': store.logout(); break;
  }
});

document.addEventListener('submit', (e) => {
  const tipoForm = e.target.dataset.form;
  if (!tipoForm || !esJefe()) return;
  e.preventDefault();
  const f = e.target.elements;
  if (tipoForm === 'area') {
    store.guardar('areas', null, { nombre: f.nombre.value.trim(), orden: data.areas.length + 1 });
  } else if (tipoForm === 'tipo') {
    store.guardar('tipos', f.id.value.trim().toUpperCase(), {
      label: f.label.value.trim(), horario: f.horario.value.trim(), grupo: f.grupo.value,
      color: f.color.value, orden: data.tipos.length + 1
    });
  } else if (tipoForm === 'feriado') {
    const [a, m, dd] = f.fecha.value.split('-').map(Number);
    store.guardar('feriados', `${a}-${m}-${dd}`, { anio: a, mes: m, dia: dd, nombre: f.nombre.value.trim() });
  }
});

render();
store.iniciar(render, ui.anio, ui.mes).catch(err => { sesion.error = err.message; render(); });
