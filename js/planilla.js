// Lógica compartida entre la grilla de planificación y el PDF:
// columnas del mes, secciones de la planilla y cómputo de horas.
import { data, mesSiguiente } from './store.js';
import { SECCION_TECNICOS, SECCION_ROL } from './defaults.js';

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const DIAS3 = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
export const TOPE_HORAS = 144; // horas mensuales máximas según el CCT

export const tipo = (code) => data.tipos.find(t => t.id === code);
export const tiposOrdenados = () => [...data.tipos].sort((a, b) => (a.orden || 0) - (b.orden || 0));
export const areasOrdenadas = () => [...data.areas].sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre, 'es'));
export const esFeriado = (anio, mes, dia) => data.feriados.find(f => f.anio === anio && f.mes === mes && f.dia === dia) || null;

// Columnas: todos los días del mes + los primeros `diasExtra` del siguiente.
export function columnas(anio, mes) {
  const cols = [];
  const total = new Date(anio, mes, 0).getDate();
  for (let d = 1; d <= total; d++) cols.push(col(anio, mes, d, false));
  const extra = Math.max(0, Math.min(7, Number(data.config.diasExtra) || 0));
  const sig = mesSiguiente(anio, mes);
  for (let d = 1; d <= extra; d++) cols.push(col(sig.anio, sig.mes, d, true));
  return cols;
}
function col(anio, mes, dia, ext) {
  const dow = new Date(anio, mes - 1, dia).getDay();
  return { anio, mes, dia, ext, dow, finde: dow === 0 || dow === 6, feriado: esFeriado(anio, mes, dia) };
}

export const codigoEn = (personaId, c) => ((c.ext ? data.turnosSig : data.turnos)[personaId] || {})[c.dia] || null;

// Secciones de la planilla, en el orden del documento original:
// técnicos (agrupados por la etiqueta de su área), adjuntos, coordinadores y jefe.
export function secciones(areaFiltro = null) {
  const areas = areasOrdenadas();
  const idx = (id) => { const i = areas.findIndex(a => a.id === id); return i < 0 ? 999 : i; };
  const cmp = (a, b) => idx(a.areaId) - idx(b.areaId)
    || (num(a.orden) - num(b.orden))
    || a.nombre.localeCompare(b.nombre, 'es');
  const lista = [];
  const porEtiqueta = new Map();
  const agregar = (etiqueta, p) => {
    if (!porEtiqueta.has(etiqueta)) { const s = { etiqueta, personas: [] }; porEtiqueta.set(etiqueta, s); lista.push(s); }
    porEtiqueta.get(etiqueta).personas.push(p);
  };
  const gente = data.personas.filter(p => !areaFiltro || p.areaId === areaFiltro);
  gente.filter(p => p.rol === 'tecnico').sort(cmp).forEach(p => {
    const a = areas[idx(p.areaId)];
    agregar(((a && a.etiqueta) || SECCION_TECNICOS).toUpperCase(), p);
  });
  ['adjunto', 'coordinador', 'jefe'].forEach(rol => gente.filter(p => p.rol === rol).sort(cmp).forEach(p => agregar(SECCION_ROL[rol], p)));
  let ord = 0;
  lista.forEach(s => { s.filas = s.personas.map(p => ({ persona: p, ord: ++ord })); });
  return lista;
}
const num = (v) => (v === '' || v === null || v === undefined || isNaN(v) ? 999 : Number(v));

// Horas del mes en pantalla (las columnas del mes siguiente no suman).
export function horas(personaId) {
  let reales = 0, pasivas = 0;
  Object.values(data.turnos[personaId] || {}).forEach(code => {
    const t = tipo(code);
    if (!t) return;
    reales += Number(t.horas) || 0;
    pasivas += Number(t.horasPasivas) || 0;
  });
  return { reales, pasivas, totales: reales + pasivas };
}

// Color de texto legible sobre un fondo dado.
export function contraste(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#1B2A2E';
  const n = parseInt(m[1], 16);
  const l = (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.5 ? '#1B2A2E' : '#FFFFFF';
}

// "CANNA, HERNAN" -> "Hernan CANNA" (formato de la firma de la planilla)
export function nombreFirma(nombre) {
  if (!nombre || !nombre.includes(',')) return nombre || '';
  const [ap, nom] = nombre.split(',');
  const cap = nom.trim().toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase());
  return `${cap} ${ap.trim().toUpperCase()}`;
}
