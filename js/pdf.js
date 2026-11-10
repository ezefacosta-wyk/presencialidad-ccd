// Exporta la planilla de turnos a PDF con el formato de la planilla
// oficial: hoja Oficio apaisada, página 1 con la grilla y página 2 con
// el reglamento, la nomenclatura y los procedimientos.
import { data } from './store.js';
import * as P from './planilla.js';

let carga = null;
function cargarJsPDF() {
  if (window.jspdf) return Promise.resolve();
  if (!carga) {
    carga = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = new URL('./vendor/jspdf.umd.min.js', import.meta.url).href;
      s.onload = ok;
      s.onerror = () => { carga = null; mal(new Error('No se pudo cargar el generador de PDF.')); };
      document.head.appendChild(s);
    });
  }
  return carga;
}

const W = 1008, H = 612, M = 36;           // Oficio (legal) apaisado, en puntos
const NEGRO = '#000000', GRIS_LINEA = '#8C8C8C';
const AZUL = '#DDEBF7', GRIS_FINDE = '#A6A6A6', GRIS_VACIO = '#D9D9D9', AZUL_NOMENC = '#C6D9F1';

const rgb = (hex) => { const n = parseInt(String(hex).replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

export async function generarPDF(anio, mes) {
  await cargarJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'legal' });
  const cfg = data.config;

  // --- helpers de dibujo ---
  const caja = (x, y, w, h, fill, stroke = GRIS_LINEA, lw = 0.3) => {
    if (fill) doc.setFillColor(...rgb(fill));
    if (stroke) { doc.setDrawColor(...rgb(stroke)); doc.setLineWidth(lw); }
    doc.rect(x, y, w, h, fill && stroke ? 'FD' : fill ? 'F' : 'S');
  };
  const linea = (x1, y1, x2, y2, lw = 1, color = NEGRO) => {
    doc.setDrawColor(...rgb(color)); doc.setLineWidth(lw); doc.line(x1, y1, x2, y2);
  };
  const txt = (s, x, y, { size = 6, bold = false, font = 'times', align = 'center', color = NEGRO, maxW = 0 } = {}) => {
    doc.setFont(font, bold ? 'bold' : 'normal');
    let sz = size;
    doc.setFontSize(sz);
    if (maxW) while (sz > 3.5 && anchoTexto(doc, String(s)) > maxW) { sz -= 0.25; doc.setFontSize(sz); }
    doc.setTextColor(...rgb(color));
    doc.text(String(s), x, y, { align, baseline: 'middle' });
  };
  const logo = async (x, y, alto) => {
    const l = cfg.logo;
    if (!l || !l.src) return 0;
    const ancho = Math.min(300, alto * (l.w / l.h));
    const fmt = /^data:image\/png/.test(l.src) ? 'PNG' : 'JPEG';
    doc.addImage(l.src, fmt, x, y, ancho, ancho * (l.h / l.w));
    return ancho;
  };
  const firma = (nombre, yBase) => {
    const cx = W - M - 170;
    linea(cx - 70, yBase, cx + 70, yBase, 0.6);
    if (nombre) txt(nombre, cx, yBase + 9, { size: 9 });
  };

  // ================= PÁGINA 1: grilla =================
  const cols = P.columnas(anio, mes);
  const secs = P.secciones();
  const filas = secs.flatMap(s => s.filas.map((f, i) => ({ ...f, sec: s, primera: i === 0, ultima: i === s.filas.length - 1 })));
  const feriadosMes = data.feriados.filter(f => f.anio === anio && f.mes === mes).sort((a, b) => a.dia - b.dia);

  const wSec = 50, wOrd = 20, wNom = 118, wHor = 32;
  const wDia = (W - 2 * M - wSec - wOrd - wNom - 3 * wHor) / cols.length;
  const xSec = M, xOrd = xSec + wSec, xNom = xOrd + wOrd, xDias = xNom + wNom, xHor = xDias + wDia * cols.length, xFin = xHor + 3 * wHor;

  const cabecera = async () => {
    const hayLogo = !!(cfg.logo && cfg.logo.src);
    if (hayLogo) await logo(M + 6, 22, 52);
    const yT = hayLogo ? 92 : 40;
    txt(cfg.titulo || '', W / 2, yT, { size: 9, bold: true });
    txt(cfg.subtitulo || '', W / 2, yT + 10, { size: 9, bold: true });
    let y = yT + 17;
    caja(xSec, y, xFin - xSec, 11, null, NEGRO, 0.8);
    txt(`${P.MESES[mes - 1].toUpperCase()} ${anio}`, (xSec + xFin) / 2, y + 5.8, { size: 8.5, bold: true });
    y += 11;
    const h1 = 10, h2 = 10;
    caja(xOrd, y, wOrd, h1 + h2, AZUL); txt('Ord', xOrd + wOrd / 2, y + 10, { size: 5.5, bold: true });
    caja(xNom, y, wNom, h1 + h2, AZUL); txt('Apellido y Nombre', xNom + wNom / 2, y + 10, { size: 5.5, bold: true });
    cols.forEach((c, i) => {
      const x = xDias + i * wDia;
      const fondo = c.finde || c.feriado ? GRIS_FINDE : AZUL;
      caja(x, y, wDia, h1, fondo); txt(P.DIAS3[c.dow], x + wDia / 2, y + h1 / 2 + 0.3, { size: 5.2, bold: true, maxW: wDia - 1 });
      caja(x, y + h1, wDia, h2, fondo); txt(c.dia, x + wDia / 2, y + h1 + h2 / 2 + 0.3, { size: 5.2, bold: true });
    });
    ['REALES', 'PASIVAS', 'TOTALES'].forEach((s, i) => {
      const x = xHor + i * wHor;
      caja(x, y, wHor, h1 + h2, '#FFFFFF');
      txt('HORAS', x + wHor / 2, y + 7, { size: 5.3, bold: true });
      txt(s, x + wHor / 2, y + 13.5, { size: 5.3, bold: true });
    });
    // separaciones gruesas de la cabecera
    linea(xOrd, y, xFin, y, 0.8); linea(xOrd, y, xOrd, y + h1 + h2, 0.8);
    linea(xHor, y, xHor, y + h1 + h2, 0.8); linea(xFin, y - 11, xFin, y + h1 + h2, 0.8);
    return y + h1 + h2;
  };

  const reservaPie = 112;
  let yTop = await cabecera();
  let disponible = H - reservaPie - yTop;
  let altoFila = Math.max(9, Math.min(13.5, disponible / Math.max(1, filas.length)));
  const porPagina = Math.max(1, Math.floor(disponible / altoFila));

  for (let i0 = 0; i0 < filas.length; i0 += porPagina) {
    if (i0 > 0) { doc.addPage(); yTop = await cabecera(); }
    const tramo = filas.slice(i0, i0 + porPagina);
    let y = yTop;
    // grupos de la columna sección dentro de este tramo
    let grupoIni = 0;
    tramo.forEach((f, k) => {
      const p = f.persona;
      caja(xOrd, y, wOrd, altoFila, AZUL); txt(f.ord, xOrd + wOrd / 2, y + altoFila / 2, { size: 5.5, bold: true });
      caja(xNom, y, wNom, altoFila, AZUL); txt(p.nombre, xNom + wNom / 2, y + altoFila / 2, { size: 5.5, bold: true, maxW: wNom - 4 });
      cols.forEach((c, i) => {
        const x = xDias + i * wDia;
        const code = P.codigoEn(p.id, c);
        const t = code && P.tipo(code);
        const fondo = t ? t.color : (c.finde || c.feriado ? GRIS_FINDE : GRIS_VACIO);
        caja(x, y, wDia, altoFila, fondo, '#FFFFFF', 0.6);
        if (code) txt(code, x + wDia / 2, y + altoFila / 2 + 0.3, { size: 5.2, color: P.contraste(fondo), maxW: wDia - 1.5 });
      });
      const h = P.horas(p.id);
      [[h.reales, true], [h.pasivas, false], [h.totales, false]].forEach(([v, b], i) => {
        const x = xHor + i * wHor;
        caja(x, y, wHor, altoFila, '#FFFFFF');
        txt(v, x + wHor / 2, y + altoFila / 2, { size: 5.5, bold: b });
      });
      const finGrupo = f.ultima || k === tramo.length - 1;
      if (finGrupo) {
        const yIni = yTop + grupoIni * altoFila, alto = (k - grupoIni + 1) * altoFila;
        caja(xSec, yIni, wSec, alto, '#FFFFFF', NEGRO, 0.8);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.6);
        const lineas = doc.splitTextToSize(f.sec.etiqueta, wSec - 6);
        const lh = 6.4, y0 = yIni + alto / 2 - (lineas.length - 1) * lh / 2;
        lineas.forEach((l, j) => txt(l, xSec + wSec / 2, y0 + j * lh, { size: 5.6, font: 'helvetica' }));
        linea(xSec, yIni + alto, xFin, yIni + alto, 0.9);   // separador de sección
        grupoIni = k + 1;
      }
      y += altoFila;
    });
    // marco y divisiones verticales gruesas
    const yFin = yTop + tramo.length * altoFila;
    linea(xOrd, yTop, xOrd, yFin, 0.8);
    linea(xHor, yTop, xHor, yFin, 0.8);
    linea(xFin, yTop, xFin, yFin, 0.8);
    linea(xSec, yTop, xSec, yFin, 0.8);
  }

  // pie de la página 1: feriados del mes + firma + logo
  const yPie = H - reservaPie + 22;
  if (feriadosMes.length) {
    doc.setFont('times', 'normal'); doc.setFontSize(6.5);
    const ancho = 230;
    const lineas = feriadosMes.flatMap(f => doc.splitTextToSize(`${f.dia}. ${f.nombre || 'Feriado.'}`, ancho - 20));
    const alto = lineas.length * 8.5 + 16;
    caja(xNom + 70, yPie, ancho, alto, null, NEGRO, 0.8);
    lineas.forEach((l, j) => txt(l, xNom + 80, yPie + 12 + j * 8.5, { size: 6.5, align: 'left' }));
  }
  const jefe = data.personas.find(p => p.rol === 'jefe');
  firma(cfg.firma1 || (jefe ? P.nombreFirma(jefe.nombre) : ''), yPie + 30);
  if (cfg.logo && cfg.logo.src) await logo(M + 6, H - 52, 40);

  // ================= PÁGINA 2: reglamento y nomenclatura =================
  doc.addPage();
  let y = 22;
  if (cfg.logo && cfg.logo.src) { await logo(M + 6, y, 28); y += 36; } else { y = M; }

  const ancho = W - 2 * M;
  const TAM = 6, INTER = 8.2;
  // Reglamento, dentro de un recuadro
  const bloqueA = maquetar(doc, cfg.textoAntes || '', ancho - 8, TAM);
  if (bloqueA.length) {
    const alto = bloqueA.length * INTER + 6;
    caja(M, y, ancho, alto, null, NEGRO, 1);
    dibujar(doc, bloqueA, M + 4, y + 8, INTER, TAM);
    y += alto;
  }

  // Nomenclatura
  const tipos = P.tiposOrdenados();
  const wN = 24, wC = 18, wD = 150, wO = ancho - wN - wC - wD;
  const xN = M, xC = xN + wN, xD = xC + wC, xO = xD + wD;
  caja(xN, y, wN + wC, 12, '#FFFFFF', NEGRO, 0.6);
  caja(xD, y, wD, 12, '#FFFFFF', NEGRO, 0.6); txt('DETALLE', xD + wD / 2, y + 6.3, { size: 6, bold: true, font: 'helvetica' });
  caja(xO, y, wO, 12, '#FFFFFF', NEGRO, 0.6); txt('OBSERVACIONES', xO + wO / 2, y + 6.3, { size: 8.5 });
  y += 12;
  const yNom = y;
  doc.setFont('times', 'normal'); doc.setFontSize(6);
  tipos.forEach(t => {
    const obs = t.observacion ? doc.splitTextToSize(t.observacion, wO - 8) : [];
    const alto = Math.max(10.5, obs.length * 7 + 3.5);
    caja(xC, y, wC, alto, t.color, GRIS_LINEA, 0.3);
    txt(t.id, xC + wC / 2, y + alto / 2, { size: 5.5, color: P.contraste(t.color), maxW: wC - 2 });
    caja(xD, y, wD, alto, '#FFFFFF');
    txt(t.detalle || `${t.label} ${t.horario || ''}`.toUpperCase(), xD + wD / 2, y + alto / 2, { size: 5.8, font: 'helvetica', maxW: wD - 6 });
    caja(xO, y, wO, alto, '#FFFFFF');
    obs.forEach((l, j) => txt(l, xO + 4, y + alto / 2 - (obs.length - 1) * 3.5 + j * 7, { size: 6, align: 'left' }));
    y += alto;
  });
  caja(xN, yNom, wN, y - yNom, AZUL_NOMENC, GRIS_LINEA, 0.3);
  const letras = 'NOMENCLATURA'.split('');
  const pasoL = Math.min(8, (y - yNom - 6) / letras.length);
  letras.forEach((l, j) => txt(l, xN + wN / 2, yNom + (y - yNom) / 2 - (letras.length - 1) * pasoL / 2 + j * pasoL, { size: 6, font: 'helvetica' }));
  caja(M, yNom - 12, ancho, y - yNom + 12, null, NEGRO, 1);

  // Procedimientos
  y += 9;
  const bloqueB = maquetar(doc, cfg.textoDespues || '', ancho, TAM);
  y = dibujar(doc, bloqueB, M, y, INTER, TAM, () => { doc.addPage(); return M; });
  firma(cfg.firma2 || '', Math.min(H - 52, Math.max(y + 34, H - 110)));

  return doc;
}

export async function exportarPDF(anio, mes) {
  const doc = await generarPDF(anio, mes);
  doc.save(`Planilla de Turnos - ${P.MESES[mes - 1].toUpperCase()} ${anio}.pdf`);
}

// ---------------------------------------------------------------
// Texto con **negrita** y __subrayado__, con ajuste de línea propio
// (jsPDF no mezcla estilos dentro de un mismo renglón).
// ---------------------------------------------------------------
function segmentos(linea) {
  const out = [];
  let b = false, u = false, ult = 0, m;
  const re = /(\*\*|__)/g;
  while ((m = re.exec(linea))) {
    if (m.index > ult) out.push({ t: linea.slice(ult, m.index), b, u });
    if (m[1] === '**') b = !b; else u = !u;
    ult = re.lastIndex;
  }
  if (ult < linea.length) out.push({ t: linea.slice(ult), b, u });
  return out;
}

// Ancho sin kerning: jsPDF lo descuenta al medir pero no al dibujar con las
// fuentes estándar, y las palabras quedarían pegadas.
const anchoTexto = (doc, s) => doc.getStringUnitWidth(s, { kerning: {} }) * doc.getFontSize() / doc.internal.scaleFactor;

function maquetar(doc, texto, maxW, tam) {
  const renglones = [];
  doc.setFontSize(tam);
  String(texto).split('\n').forEach(parrafo => {
    if (!parrafo.trim()) { renglones.push([]); return; }
    let actual = [], x = 0;
    segmentos(parrafo).forEach(seg => {
      seg.t.split(/(\s+)/).forEach(tok => {
        if (!tok) return;
        doc.setFont('times', seg.b ? 'bold' : 'normal');
        const esp = /^\s+$/.test(tok);
        const w = anchoTexto(doc, esp ? ' ' : tok);
        if (esp) { if (actual.length) { actual.push({ t: ' ', b: seg.b, u: seg.u, w }); x += w; } return; }
        if (x + w > maxW && actual.length) {
          while (actual.length && actual[actual.length - 1].t === ' ') actual.pop();
          renglones.push(actual); actual = []; x = 0;
        }
        actual.push({ t: tok, b: seg.b, u: seg.u, w }); x += w;
      });
    });
    while (actual.length && actual[actual.length - 1].t === ' ') actual.pop();
    renglones.push(actual);
  });
  return renglones;
}

function dibujar(doc, renglones, x0, y, inter, tam, nuevaPagina) {
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(tam);
  renglones.forEach(r => {
    if (nuevaPagina && y > H - M) y = nuevaPagina();
    if (!r.length) { y += inter * 0.5; return; }
    let x = x0;
    r.forEach(tok => {
      doc.setFont('times', tok.b ? 'bold' : 'normal');
      doc.text(tok.t, x, y, { baseline: 'middle' });
      if (tok.u && tok.t !== ' ') { doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3); doc.line(x, y + 2.4, x + tok.w, y + 2.4); }
      if (tok.u && tok.t === ' ') { doc.setLineWidth(0.3); doc.line(x, y + 2.4, x + tok.w, y + 2.4); }
      x += tok.w;
    });
    y += inter;
  });
  return y;
}
