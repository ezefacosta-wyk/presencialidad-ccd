import { MODO_DEMO, NOMBRE_SISTEMA } from './config.js';
import { SECCION_TECNICOS } from './defaults.js';
import * as store from './store.js';
import * as P from './planilla.js';
const { data, sesion } = store;
const { MESES, tipo, tiposOrdenados, areasOrdenadas } = P;

// ---------------------------------------------------------------
// Constantes y utilidades
// ---------------------------------------------------------------
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Jerarquía: a mayor rango, más privilegios.
export const ROLES = {
  jefe: { label: 'Jefe de departamento', corto: 'Jefe', rango: 4 },
  coordinador: { label: 'Coordinador de área', corto: 'Coordinador', rango: 3 },
  adjunto: { label: 'Coordinador adjunto', corto: 'Adjunto', rango: 2 },
  tecnico: { label: 'Técnico', corto: 'Técnico', rango: 1 }
};
const GRUPOS = { activo: 'De turno', pasivo: 'Turno pasivo', ausente: 'Franco / ausente', libre: 'Sin asignar' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iniciales = (n) => {
  const p = String(n).replace(',', ' ').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
};
const diasEnMes = (a, m) => new Date(a, m, 0).getDate();
const $ = (sel) => document.querySelector(sel);
const colorVars = (hex) => `--c:${esc(hex)};--t:${P.contraste(hex)}`;

// ---------------------------------------------------------------
// Estado de la interfaz
// ---------------------------------------------------------------
const hoy = new Date();
const ui = {
  tab: 'general',
  anio: hoy.getFullYear(),
  mes: hoy.getMonth() + 1,
  dia: hoy.getDate(),
  area: null,       // área del calendario de la vista general
  areaPlan: null,   // filtro de la planilla (null = todo el departamento)
  pincel: null      // tipo de turno activo al planificar ('' = borrar)
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
// Turnos: en su área, de personas de su mismo rango o menor (un adjunto no
// cambia los turnos de su coordinador).
const puedeEditarTurnos = (p) => esJefe() || (coordinaArea(p.areaId) && ROLES[p.rol].rango <= ROLES[yo().rol].rango);
const puedeEditarPersona = (p) => esJefe() || (coordinaArea(p.areaId) && ROLES[p.rol].rango < ROLES[yo().rol].rango);

// ---------------------------------------------------------------
// Selectores de datos
// ---------------------------------------------------------------
const personasDe = (areaId) => data.personas
  .filter(p => (p.areaId || null) === areaId)
  .sort((a, b) => ROLES[b.rol].rango - ROLES[a.rol].rango || a.nombre.localeCompare(b.nombre, 'es'));
const turnoDe = (personaId, dia) => (data.turnos[personaId] || {})[dia] || null;
const feriado = (dia) => P.esFeriado(ui.anio, ui.mes, dia);
const areaSel = () => data.areas.find(a => a.id === ui.area) || areasOrdenadas()[0] || null;
const grupoDe = (personaId, dia) => { const t = tipo(turnoDe(personaId, dia)); return t ? t.grupo : 'libre'; };

// ---------------------------------------------------------------
// Componentes chicos
// ---------------------------------------------------------------
const chipsAreas = (accion, actual, conTodas) => `<div class="chips" role="tablist" aria-label="Área">
  ${conTodas ? `<button class="chip-area${actual === null ? ' activa' : ''}" data-accion="${accion}" data-id="">Todo el departamento</button>` : ''}
  ${areasOrdenadas().map(a => `<button class="chip-area${a.id === actual ? ' activa' : ''}" data-accion="${accion}" data-id="${esc(a.id)}">${esc(a.nombre)}</button>`).join('')}
</div>`;

const leyenda = () => `<div class="leyenda">${tiposOrdenados().map(t =>
  `<span class="leyenda-item"><span class="punto" style="background:${esc(t.color)}"></span><b>${esc(t.id)}</b> ${esc(t.label)}${t.horario ? ` <i>${esc(t.horario)}</i>` : ''}</span>`).join('')}</div>`;

const pildora = (code) => {
  const t = tipo(code);
  if (!t) return '<span class="pildora vacia">Sin asignar</span>';
  return `<span class="pildora" style="${colorVars(t.color)}">${esc(t.label)}${t.horario ? ` · ${esc(t.horario)}` : ''}</span>`;
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
      fichas += `<span class="ficha${t.grupo === 'pasivo' ? ' pasivo' : ''}" style="${colorVars(t.color)}" title="${esc(p.nombre)} — ${esc(t.label)}">${esc(iniciales(p.nombre))}<small>${esc(t.id)}</small></span>`;
    });
    const cls = ['dia', dow === 0 || dow === 6 ? 'finde' : '', fer ? 'feriado' : '',
      esMesActual && d === hoy.getDate() ? 'hoy' : '', d === ui.dia ? 'sel' : ''].filter(Boolean).join(' ');
    celdas += `<button class="${cls}" data-accion="dia" data-dia="${d}">
      <span class="dia-num">${d}</span>${fer ? `<span class="dia-fer">Feriado</span>` : ''}
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
  if (!area) return `<p class="vacio">Todavía no hay áreas. ${esJefe() ? 'Creálas en Administración.' : 'El jefe de departamento puede crearlas en Administración.'}</p>`;
  const fecha = new Date(ui.anio, ui.mes - 1, ui.dia);
  const fer = feriado(ui.dia);
  const jefatura = personasDe(null);
  const cuenta = (g) => data.personas.filter(p => grupoDe(p.id, ui.dia) === g).length;
  return `
  <section class="bloque">
    <div class="bloque-head"><h2>Turnos de ${esc(area.nombre)}</h2>${chipsAreas('area', area.id, false)}</div>
    ${leyenda()}
    ${calendario(area)}
    <p class="ayuda">Tocá un día para ver abajo el estado de todo el personal en esa fecha. Las fichas con borde punteado son turnos pasivos.</p>
  </section>
  <section class="bloque">
    <div class="bloque-head">
      <h2>Personal por área</h2>
      <span class="fecha-sel">${DIAS_LARGO[fecha.getDay()]} ${ui.dia} de ${MESES[ui.mes - 1].toLowerCase()}${fer ? ' · feriado' : ''}</span>
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
// PLANIFICACIÓN (grilla con el formato de la planilla oficial)
// ---------------------------------------------------------------
function vistaTurnos() {
  if (ui.areaPlan && !data.areas.some(a => a.id === ui.areaPlan)) ui.areaPlan = null;
  const cols = P.columnas(ui.anio, ui.mes);
  const secs = P.secciones(ui.areaPlan);
  const algunoEditable = data.personas.some(puedeEditarTurnos);
  if (ui.pincel === null) ui.pincel = tiposOrdenados()[0]?.id ?? '';
  const sig = store.mesSiguiente(ui.anio, ui.mes);

  const clsCol = (c) => [c.finde ? 'finde' : '', c.feriado ? 'feriado' : '', c.ext ? 'ext' : '', c.ext && c.dia === 1 ? 'ext-ini' : ''].filter(Boolean).join(' ');
  const titCol = (c) => c.feriado ? ` title="${esc(c.feriado.nombre || 'Feriado')}"` : c.ext ? ` title="${MESES[sig.mes - 1]} (mes siguiente)"` : '';
  const head1 = cols.map(c => `<th class="${clsCol(c)}"${titCol(c)}>${P.DIAS3[c.dow]}</th>`).join('');
  const head2 = cols.map(c => `<th class="${clsCol(c)}"${titCol(c)}>${c.dia}</th>`).join('');

  const cuerpo = secs.map(s => s.filas.map((f, i) => {
    const p = f.persona;
    const editable = puedeEditarTurnos(p);
    const h = P.horas(p.id);
    const celdas = cols.map(c => {
      const code = P.codigoEn(p.id, c);
      const t = code && tipo(code);
      return `<td class="${clsCol(c)}"><button class="pc${t ? ' llena' : ''}" ${t ? `style="${colorVars(t.color)}"` : ''} ` +
        `data-p="${esc(p.id)}" data-a="${c.anio}" data-m="${c.mes}" data-d="${c.dia}" data-c="${esc(code || '')}" ` +
        `${editable ? '' : 'disabled'} aria-label="${esc(p.nombre)}, ${c.dia}/${c.mes}${t ? ', ' + esc(t.label) : ''}">${esc(code || '')}</button></td>`;
    }).join('');
    return `<tr class="${i === 0 ? 'sec-ini' : ''}">
      ${i === 0 ? `<th class="p-sec" rowspan="${s.filas.length}">${esc(s.etiqueta)}</th>` : ''}
      <td class="p-ord">${f.ord}</td>
      <th class="p-nom">${esc(p.nombre)}</th>
      ${celdas}
      <td class="p-h p-real${h.reales > P.TOPE_HORAS ? ' excede' : ''}"${h.reales > P.TOPE_HORAS ? ` title="Supera las ${P.TOPE_HORAS} horas mensuales"` : ''}>${h.reales}</td>
      <td class="p-h">${h.pasivas}</td>
      <td class="p-h">${h.totales}</td>
    </tr>`;
  }).join('')).join('');

  const barra = algunoEditable ? `<div class="pinceles">
      <span class="pinceles-label">Asignar:</span>
      ${tiposOrdenados().map(t => `<button class="pincel${ui.pincel === t.id ? ' activo' : ''}" style="${colorVars(t.color)}" data-accion="pincel" data-id="${esc(t.id)}" title="${esc(t.label)}${t.horario ? ' · ' + esc(t.horario) : ''}"><b>${esc(t.id)}</b></button>`).join('')}
      <button class="pincel borrar${ui.pincel === '' ? ' activo' : ''}" data-accion="pincel" data-id="">Borrar</button>
      <span class="pincel-desc">${ui.pincel ? esc(tipo(ui.pincel)?.label || '') + (tipo(ui.pincel)?.horario ? ' · ' + esc(tipo(ui.pincel).horario) : '') : 'Vacía las celdas'}</span>
    </div>
    <p class="ayuda">Elegí un tipo y tocá las celdas, o mantené apretado el mouse y arrastrá para cargar varios días seguidos. Tocar una celda que ya tiene ese tipo la deja vacía.
    ${esJefe() ? '' : 'Solo podés modificar las filas de tu área con tu mismo rango o menor; el resto se ve atenuado.'}</p>`
    : `<p class="aviso">Solo lectura: la planilla la cargan los coordinadores, coordinadores adjuntos y el jefe de departamento.</p>`;

  return `<section class="bloque">
    <div class="bloque-head">
      <h2>Planilla de turnos · ${MESES[ui.mes - 1]} ${ui.anio}</h2>
      <button class="btn" data-accion="pdf" id="btnPdf">Exportar PDF</button>
    </div>
    <div class="bloque-sub">${chipsAreas('area-plan', ui.areaPlan, true)}</div>
    ${barra}
    ${secs.length ? `<div class="tabla-wrap"><table class="planilla">
      <thead>
        <tr><th class="p-sec" rowspan="2"></th><th class="p-ord" rowspan="2">Ord</th><th class="p-nom" rowspan="2">Apellido y Nombre</th>${head1}
          <th class="p-h" rowspan="2">Horas<br>reales</th><th class="p-h" rowspan="2">Horas<br>pasivas</th><th class="p-h" rowspan="2">Horas<br>totales</th></tr>
        <tr>${head2}</tr>
      </thead>
      <tbody>${cuerpo}</tbody>
    </table></div>
    <p class="ayuda">Las ${cols.filter(c => c.ext).length} columnas finales son los primeros días de ${MESES[sig.mes - 1].toLowerCase()} y no suman horas en este mes. Las horas reales que superan ${P.TOPE_HORAS} se marcan en rojo.</p>`
      : '<p class="vacio">Todavía no hay personal cargado.</p>'}
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
  p = p || { nombre: '', email: '', rol: 'tecnico', areaId: areaId || null, orden: '' };
  const roles = rolesAsignables();
  abrirModal(`
    <h3>${nueva ? 'Agregar persona' : 'Editar persona'}</h3>
    <label>Apellido y nombre<input name="nombre" required value="${esc(p.nombre)}" placeholder="APELLIDO, Nombre"></label>
    <label>Email de acceso (cuenta de Google)<input name="email" type="email" value="${esc(p.email || '')}" placeholder="opcional"></label>
    <div class="fila-2">
      <label>Rango<select name="rol">${roles.map(r => `<option value="${r}"${r === p.rol ? ' selected' : ''}>${ROLES[r].label}</option>`).join('')}</select></label>
      <label>Área<select name="areaId" ${esJefe() ? '' : 'disabled'}>
        <option value="">Jefatura (sin área)</option>
        ${areasOrdenadas().map(a => `<option value="${esc(a.id)}"${a.id === p.areaId ? ' selected' : ''}>${esc(a.nombre)}</option>`).join('')}
      </select></label>
    </div>
    <label>Posición dentro de su sección en la planilla<input name="orden" type="number" min="1" value="${esc(p.orden ?? '')}" placeholder="Vacío = orden alfabético"></label>
    <p class="form-error" hidden></p>
    <div class="modal-acciones">
      ${nueva ? '' : '<button type="button" class="btn peligro" data-accion="modal-borrar">Quitar</button>'}
      <button type="button" class="btn secundario" data-accion="cerrar-modal">Cancelar</button>
      <button class="btn">Guardar</button>
    </div>`, (f) => {
    const rol = f.rol.value;
    const area = esJefe() ? (f.areaId.value || null) : p.areaId;
    if (rol === 'jefe' && area) return 'El jefe de departamento no pertenece a un área: elegí "Jefatura".';
    if (rol !== 'jefe' && !area) return 'Elegí el área a la que pertenece.';
    store.guardar('personas', p.id, {
      nombre: f.nombre.value.trim(), email: f.email.value.trim().toLowerCase(), rol, areaId: area,
      orden: f.orden.value ? Number(f.orden.value) : null
    });
  }, () => store.borrar('personas', p.id));
}

// ---------------------------------------------------------------
// ADMINISTRACIÓN (solo jefe de departamento)
// ---------------------------------------------------------------
function vistaAdmin() {
  if (!esJefe()) return '<p class="aviso">Esta sección es solo para el jefe de departamento.</p>';
  const cfg = data.config;
  const feriados = data.feriados.filter(f => f.anio === ui.anio).sort((a, b) => a.mes - b.mes || a.dia - b.dia);
  const jefe = data.personas.find(p => p.rol === 'jefe');
  return `<section class="bloque">
    <div class="bloque-head"><h2>Administración</h2></div>
    <div class="tarjetas una">
      ${MODO_DEMO ? `<article class="tarjeta">
        <header><h3>Datos de ejemplo</h3><button class="btn chico peligro" data-accion="vaciar">Vaciar datos de ejemplo</button></header>
        <p class="vacio">Quita las áreas, las personas y los turnos de ejemplo para que armes tus propios grupos y rangos. Se conservan los tipos de turno, los feriados y los textos de la planilla.</p>
      </article>` : ''}

      <article class="tarjeta">
        <header><h3>Áreas</h3><button class="btn chico" data-accion="area-editar" data-id="">Agregar área</button></header>
        <table class="lista"><tbody>${areasOrdenadas().map(a => {
          const n = personasDe(a.id).length;
          return `<tr><td class="lista-nombre">${esc(a.nombre)}<small>${n} persona${n === 1 ? '' : 's'} · técnicos en la planilla como «${esc((a.etiqueta || SECCION_TECNICOS).toUpperCase())}»</small></td>
            <td class="acciones"><button class="btn-link" data-accion="area-editar" data-id="${esc(a.id)}">Editar</button></td></tr>`;
        }).join('') || '<tr><td class="vacio">Sin áreas.</td></tr>'}</tbody></table>
      </article>

      <article class="tarjeta">
        <header><h3>Tipos de turno</h3><button class="btn chico" data-accion="tipo-editar" data-id="">Agregar tipo</button></header>
        <table class="lista"><tbody>${tiposOrdenados().map(t => `<tr>
          <td><span class="pildora" style="${colorVars(t.color)}">${esc(t.id)}</span></td>
          <td class="lista-nombre">${esc(t.label)}${t.horario ? ` · ${esc(t.horario)}` : ''}<small>${GRUPOS[t.grupo]} · ${Number(t.horas) || 0} h reales · ${Number(t.horasPasivas) || 0} h pasivas</small></td>
          <td class="acciones"><button class="btn-link" data-accion="tipo-editar" data-id="${esc(t.id)}">Editar</button></td></tr>`).join('')}</tbody></table>
      </article>

      <article class="tarjeta">
        <header><h3>Planilla en PDF</h3></header>
        <form class="form-grid" data-form="config">
          <label>Título<input name="titulo" value="${esc(cfg.titulo)}"></label>
          <label>Subtítulo<input name="subtitulo" value="${esc(cfg.subtitulo)}"></label>
          <label>Días del mes siguiente al final<input name="diasExtra" type="number" min="0" max="7" value="${esc(cfg.diasExtra)}"></label>
          <span></span>
          <label>Firma de la página 1<input name="firma1" value="${esc(cfg.firma1)}" placeholder="${esc(jefe ? P.nombreFirma(jefe.nombre) : 'Nombre')} (jefe de departamento)"></label>
          <label>Firma de la página 2<input name="firma2" value="${esc(cfg.firma2)}" placeholder="Opcional"></label>
          <div class="logo-campo">
            <span class="campo-label">Logo del encabezado</span>
            ${cfg.logo && cfg.logo.src ? `<img src="${cfg.logo.src}" alt="Logo actual">` : '<span class="vacio">Sin logo</span>'}
            <label class="btn chico secundario">Elegir imagen<input type="file" accept="image/png,image/jpeg" id="logoInput" hidden></label>
            ${cfg.logo && cfg.logo.src ? '<button type="button" class="btn-link peligro" data-accion="quitar-logo">Quitar</button>' : ''}
          </div>
          <label class="ancho">Texto antes de la nomenclatura (recuadro de la página 2)<textarea name="textoAntes" rows="5">${esc(cfg.textoAntes)}</textarea></label>
          <label class="ancho">Texto después de la nomenclatura<textarea name="textoDespues" rows="10">${esc(cfg.textoDespues)}</textarea></label>
          <p class="ayuda ancho">En los textos podés usar **negrita** y __subrayado__. Cada renglón es un párrafo. La nomenclatura se arma sola con los tipos de turno y sus observaciones.</p>
          <div class="ancho"><button class="btn">Guardar planilla</button></div>
        </form>
      </article>

      <article class="tarjeta">
        <header><h3>Feriados de ${ui.anio}</h3></header>
        <form class="fila-form" data-form="feriado"><input name="fecha" type="date" required><input name="nombre" placeholder="Leyenda para la planilla (ej. Feriado trasladable — …)"><button class="btn chico">Agregar feriado</button></form>
        ${feriados.length ? `<table class="lista"><tbody>${feriados.map(f => `<tr>
          <td class="lista-nombre">${f.dia} de ${MESES[f.mes - 1].toLowerCase()}<small>${esc(f.nombre || 'Feriado')}</small></td>
          <td class="acciones"><button class="btn-link peligro" data-accion="borrar" data-col="feriados" data-id="${esc(f.id)}">Quitar</button></td></tr>`).join('')}</tbody></table>`
          : '<p class="vacio">No hay feriados cargados para este año.</p>'}
      </article>
    </div>
  </section>`;
}

function modalArea(a) {
  const nueva = !a;
  a = a || { nombre: '', etiqueta: '', orden: data.areas.length + 1 };
  const n = nueva ? 0 : personasDe(a.id).length;
  abrirModal(`
    <h3>${nueva ? 'Agregar área' : 'Editar área'}</h3>
    <label>Nombre<input name="nombre" required value="${esc(a.nombre)}"></label>
    <label>Sección de sus técnicos en la planilla<input name="etiqueta" value="${esc(a.etiqueta || '')}" placeholder="${SECCION_TECNICOS}"></label>
    <label>Orden<input name="orden" type="number" min="1" value="${esc(a.orden ?? '')}"></label>
    <p class="ayuda">Las áreas con la misma sección se agrupan juntas en la planilla, en este orden.</p>
    <p class="form-error" hidden></p>
    <div class="modal-acciones">
      ${nueva ? '' : `<button type="button" class="btn peligro" data-accion="modal-borrar" ${n ? 'disabled title="Reasigná su personal para poder quitarla"' : ''}>Quitar</button>`}
      <button type="button" class="btn secundario" data-accion="cerrar-modal">Cancelar</button>
      <button class="btn">Guardar</button>
    </div>`, (f) => {
    store.guardar('areas', a.id, { nombre: f.nombre.value.trim(), etiqueta: f.etiqueta.value.trim(), orden: Number(f.orden.value) || 0 });
  }, () => store.borrar('areas', a.id));
}

function modalTipo(t) {
  const nuevo = !t;
  t = t || { id: '', label: '', horario: '', detalle: '', grupo: 'activo', horas: 0, horasPasivas: 0, color: '#A9D08E', observacion: '' };
  abrirModal(`
    <h3>${nuevo ? 'Agregar tipo de turno' : `Editar tipo ${esc(t.id)}`}</h3>
    <div class="fila-2">
      <label>Código<input name="id" required maxlength="4" value="${esc(t.id)}" ${nuevo ? '' : 'readonly'}></label>
      <label>Color<input name="color" type="color" value="${esc(t.color)}"></label>
    </div>
    <div class="fila-2">
      <label>Nombre<input name="label" required value="${esc(t.label)}"></label>
      <label>Horario<input name="horario" value="${esc(t.horario || '')}" placeholder="Opcional"></label>
    </div>
    <label>Detalle en la nomenclatura del PDF<input name="detalle" value="${esc(t.detalle || '')}" placeholder="Ej. TURNO BRAVO 6HS."></label>
    <div class="fila-3">
      <label>Cuenta como<select name="grupo">${['activo', 'pasivo', 'ausente'].map(g => `<option value="${g}"${g === t.grupo ? ' selected' : ''}>${GRUPOS[g]}</option>`).join('')}</select></label>
      <label>Horas reales<input name="horas" type="number" min="0" step="0.5" value="${esc(t.horas ?? 0)}"></label>
      <label>Horas pasivas<input name="horasPasivas" type="number" min="0" step="0.5" value="${esc(t.horasPasivas ?? 0)}"></label>
    </div>
    <label>Observación en la nomenclatura<textarea name="observacion" rows="3">${esc(t.observacion || '')}</textarea></label>
    <p class="form-error" hidden></p>
    <div class="modal-acciones">
      ${nuevo ? '' : '<button type="button" class="btn peligro" data-accion="modal-borrar">Quitar</button>'}
      <button type="button" class="btn secundario" data-accion="cerrar-modal">Cancelar</button>
      <button class="btn">Guardar</button>
    </div>`, (f) => {
    const id = f.id.value.trim().toUpperCase();
    if (nuevo && data.tipos.some(x => x.id === id)) return `Ya existe un tipo con el código ${id}.`;
    store.guardar('tipos', id, {
      label: f.label.value.trim(), horario: f.horario.value.trim(), detalle: f.detalle.value.trim(),
      grupo: f.grupo.value, horas: Number(f.horas.value) || 0, horasPasivas: Number(f.horasPasivas.value) || 0,
      color: f.color.value, observacion: f.observacion.value.trim(),
      orden: nuevo ? Math.max(0, ...data.tipos.map(x => x.orden || 0)) + 1 : t.orden
    });
  }, () => store.borrar('tipos', t.id));
}

// Reduce la imagen antes de guardarla (Firestore admite hasta 1 MB por documento).
function leerLogo(file) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 700 / img.width, 220 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok({ src: c.toDataURL('image/png'), w: c.width, h: c.height });
    };
    img.onerror = () => mal(new Error('No se pudo leer la imagen.'));
    img.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------
// Modal y avisos
// ---------------------------------------------------------------
const modal = $('#modal');
let modalCtx = null;
function abrirModal(html, onSubmit, onBorrar) {
  modalCtx = { onSubmit, onBorrar };
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
  if (accion === 'modal-borrar' && modalCtx.onBorrar) { modalCtx.onBorrar(); modal.close(); }
});

let toastTimer = null;
function aviso(texto, error) {
  const t = $('#toast');
  t.textContent = texto;
  t.className = 'toast' + (error ? ' error' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

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

  // No repintar Administración mientras se escribe en un campo (perdería lo tipeado)
  if (ui.tab === 'admin' && app.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;

  // Conserva el scroll horizontal de la grilla al repintar
  const wrap = app.querySelector('.tabla-wrap');
  const scroll = wrap ? wrap.scrollLeft : 0;
  app.innerHTML = VISTAS[ui.tab]();
  const nuevo = app.querySelector('.tabla-wrap');
  if (nuevo) nuevo.scrollLeft = scroll;
}

// ---------------------------------------------------------------
// Pintado de la planilla: clic en una celda o arrastre con el mouse
// ---------------------------------------------------------------
let arrastre = null;
let ultimoFueMouse = false;
function pintar(el, code) {
  const p = data.personas.find(x => x.id === el.dataset.p);
  if (!p || !puedeEditarTurnos(p)) return;
  if ((el.dataset.c || null) === (code || null)) return;
  store.setTurno(p, Number(el.dataset.a), Number(el.dataset.m), Number(el.dataset.d), code);
}
const destino = (el) => (ui.pincel && ui.pincel !== (el.dataset.c || '') ? ui.pincel : null);
const claveCelda = (el) => `${el.dataset.p}|${el.dataset.a}|${el.dataset.m}|${el.dataset.d}`;

document.addEventListener('pointerdown', (e) => {
  ultimoFueMouse = e.pointerType === 'mouse';
  const el = e.target.closest('.pc');
  if (!el || el.disabled || !ultimoFueMouse || e.button !== 0) return;
  e.preventDefault();
  arrastre = { code: destino(el), ult: claveCelda(el) };
  pintar(el, arrastre.code);
});
document.addEventListener('pointermove', (e) => {
  if (!arrastre) return;
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.pc');
  if (!el || el.disabled) return;
  const k = claveCelda(el);
  if (k === arrastre.ult) return;
  arrastre.ult = k;
  pintar(el, arrastre.code);
});
document.addEventListener('pointerup', () => { arrastre = null; });

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
  if (document.activeElement) document.activeElement.blur();
  render();
});

document.addEventListener('change', async (e) => {
  if (e.target.id === 'verComo') { ui.area = null; ui.areaPlan = null; store.verComo(e.target.value); }
  if (e.target.id === 'logoInput' && e.target.files[0]) {
    try { store.guardarConfig({ logo: await leerLogo(e.target.files[0]) }); aviso('Logo actualizado.'); }
    catch (err) { aviso(err.message, true); }
  }
});

document.addEventListener('click', async (e) => {
  // Celdas de la planilla con teclado o pantalla táctil (el mouse pinta en pointerdown)
  const pc = e.target.closest('.pc');
  if (pc) {
    const porMouse = e.pointerType ? e.pointerType === 'mouse' : (ultimoFueMouse && e.detail > 0);
    if (!pc.disabled && !porMouse) pintar(pc, destino(pc));
    return;
  }
  const el = e.target.closest('[data-accion]');
  if (!el || modal.contains(el)) return;
  const d = el.dataset;
  switch (d.accion) {
    case 'area': ui.area = d.id; render(); break;
    case 'area-plan': ui.areaPlan = d.id || null; render(); break;
    case 'dia': ui.dia = Number(d.dia); render(); break;
    case 'pincel': ui.pincel = d.id; render(); break;
    case 'persona-nueva': modalPersona(null, d.area || null); break;
    case 'persona-editar': modalPersona(data.personas.find(x => x.id === d.id)); break;
    case 'area-editar': if (esJefe()) modalArea(data.areas.find(x => x.id === d.id)); break;
    case 'tipo-editar': if (esJefe()) modalTipo(data.tipos.find(x => x.id === d.id)); break;
    case 'borrar': if (esJefe()) store.borrar(d.col, d.id); break;
    case 'quitar-logo': if (esJefe()) store.guardarConfig({ logo: null }); break;
    case 'pdf': {
      el.disabled = true; el.textContent = 'Generando…';
      try { const m = await import('./pdf.js'); await m.exportarPDF(ui.anio, ui.mes); }
      catch (err) { aviso('No se pudo generar el PDF: ' + err.message, true); }
      el.disabled = false; el.textContent = 'Exportar PDF';
      break;
    }
    case 'vaciar':
      if (esJefe()) abrirModal(`<h3>Vaciar datos de ejemplo</h3>
        <p>Se van a quitar todas las áreas, personas y turnos cargados en este navegador. Quedás como único usuario, con rango de jefe de departamento. No se puede deshacer.</p>
        <div class="modal-acciones"><button type="button" class="btn secundario" data-accion="cerrar-modal">Cancelar</button><button class="btn">Vaciar</button></div>`,
        () => { ui.area = null; ui.areaPlan = null; store.vaciarDemo(); });
      break;
    case 'login': store.login(); break;
    case 'logout': store.logout(); break;
  }
});

document.addEventListener('submit', (e) => {
  const tipoForm = e.target.dataset.form;
  if (!tipoForm || !esJefe()) return;
  e.preventDefault();
  if (document.activeElement) document.activeElement.blur();
  const f = e.target.elements;
  if (tipoForm === 'feriado') {
    const [a, m, dd] = f.fecha.value.split('-').map(Number);
    store.guardar('feriados', `${a}-${m}-${dd}`, { anio: a, mes: m, dia: dd, nombre: f.nombre.value.trim() });
  } else if (tipoForm === 'config') {
    store.guardarConfig({
      titulo: f.titulo.value.trim(), subtitulo: f.subtitulo.value.trim(),
      diasExtra: Math.max(0, Math.min(7, Number(f.diasExtra.value) || 0)),
      firma1: f.firma1.value.trim(), firma2: f.firma2.value.trim(),
      textoAntes: f.textoAntes.value, textoDespues: f.textoDespues.value
    });
    aviso('Planilla guardada.');
  }
});

render();
store.iniciar(render, ui.anio, ui.mes).catch(err => { sesion.error = err.message; render(); });
