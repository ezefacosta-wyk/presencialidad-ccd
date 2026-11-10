// Valores iniciales tomados de la planilla de turnos del NOC.
// Todo se puede cambiar después desde Administración.

// grupo: 'activo' = de turno · 'pasivo' = guardia pasiva · 'ausente' = no presta servicio
// horas / horasPasivas: lo que suma cada día a "Horas reales" y "Horas pasivas".
// Los pasivos de semana (PAS, PCS) suman 6 h pasivas; los de fin de semana
// (PAF, PCF) suman 0 porque se compensan con franco.
export const TIPOS_DEFAULT = [
  { id: 'A', label: 'Turno Alpha', horario: '12 hs · 08 a 20 h', detalle: 'TURNO ALPHA 12HS. - 08 A 20HS', grupo: 'activo', horas: 12, horasPasivas: 0, color: '#87CEEB', observacion: '' },
  { id: 'B', label: 'Turno Bravo', horario: '6 hs', detalle: 'TURNO BRAVO 6HS.', grupo: 'activo', horas: 6, horasPasivas: 0, color: '#A9D08E', observacion: '' },
  { id: 'C', label: 'Turno Charlie', horario: '12 hs · 20 a 08 h', detalle: 'TURNO CHARLIE 12HS. - 20 A 08HS', grupo: 'activo', horas: 12, horasPasivas: 0, color: '#FFDAB9', observacion: '' },
  { id: 'PAS', label: 'Pasivo Alpha', horario: 'Semana', detalle: 'PASIVO ALPHA-SEMANA', grupo: 'pasivo', horas: 0, horasPasivas: 6, color: '#9BC2E6', observacion: 'Los PAS (pasivo Alpha semana) no corresponde franco.' },
  { id: 'PAF', label: 'Pasivo Alpha', horario: 'Fin de semana', detalle: 'PASIVO ALPHA-FIN DE SEMANA', grupo: 'pasivo', horas: 0, horasPasivas: 0, color: '#00BFE6', observacion: 'Los PAF (pasivo Alpha fin de semana) corresponde franco.' },
  { id: 'PCS', label: 'Pasivo Charlie', horario: 'Semana', detalle: 'PASIVO CHARLIE-SEMANA', grupo: 'pasivo', horas: 0, horasPasivas: 6, color: '#F4B084', observacion: 'Los PCS (pasivo charlie semana) no corresponde franco por pedido de los agentes sumando las horas de turno B.' },
  { id: 'PCF', label: 'Pasivo Charlie', horario: 'Fin de semana', detalle: 'PASIVO CHARLIE-FIN DE SEMANA', grupo: 'pasivo', horas: 0, horasPasivas: 0, color: '#C65911', observacion: 'Los PCF (pasivo charlie fin de semana) corresponde franco.' },
  { id: 'V', label: 'Vacaciones', horario: '', detalle: 'VACACIONES', grupo: 'ausente', horas: 0, horasPasivas: 0, color: '#FFFF00', observacion: 'La solicitud por licencia, debera ser presentada con una antelacion mínima de 45 dias, con resolución de 15 dias; (L.C.T.20.744 Art. 154 Epoca de Otorgamiento -Comunicación - CCT. Cap. 10 Vacaciones y Otras licencias-CCT, Cap 10 Vac y Otras Lic. Art 61, Licencias).' },
  { id: 'F', label: 'Franco', horario: '', detalle: 'FRANCO', grupo: 'ausente', horas: 0, horasPasivas: 0, color: '#FFFF00', observacion: 'Los días F (Franco), no son acumulativos, deberán ser percibidos en el mes en curso.' },
  { id: 'I', label: 'Instrucción', horario: '', detalle: 'INSTRUCCIÓN.', grupo: 'activo', horas: 6, horasPasivas: 0, color: '#FFFF00', observacion: 'INSTRUCCIÓN: El día de instrucción es obligatorio (presencial) - No se autorizan francos o ausencias - Turno CHARLIE (On Line), via Teams.' },
  { id: 'LR', label: 'ART', horario: '', detalle: 'ART', grupo: 'ausente', horas: 0, horasPasivas: 0, color: '#FF0000', observacion: 'Enfermedad - ART: Presentar los certificados correspondientes - Sin excepción' },
  { id: 'LF', label: 'Enfermedad familiar', horario: '', detalle: 'ENFERMEDAD FAMILIAR', grupo: 'ausente', horas: 0, horasPasivas: 0, color: '#FF0000', observacion: 'Enfermedad Familiar: Presentar el certificado correspondiente - Sin excepción' },
  { id: 'LE', label: 'Examen', horario: '', detalle: 'EXAMEN', grupo: 'ausente', horas: 0, horasPasivas: 0, color: '#FF0000', observacion: 'Examen: Presentar el certificado correspondiente - Sin excepción' },
  { id: 'LN', label: 'Paternidad / Maternidad', horario: '', detalle: 'PATERNIDAD / MATERNIDAD', grupo: 'ausente', horas: 0, horasPasivas: 0, color: '#FF0000', observacion: 'Paternidad / Maternidad: Presentar el certificado correspondiente - Sin excepción' }
].map((t, i) => ({ ...t, orden: i + 1 }));

// Textos y opciones del PDF. En los textos: **negrita** y __subrayado__.
export const CONFIG_DEFAULT = {
  titulo: 'LISTA/PLANILLA DE TURNOS/NOC',
  subtitulo: 'CENTRO DE COMUNICACIONES DIGITALES',
  diasExtra: 2,          // días del mes siguiente que se muestran al final
  firma1: '',            // vacío = nombre del jefe de departamento
  firma2: '',
  logo: null,            // { src: dataURL, w, h }
  textoAntes: '**Reglamento Interno:** La presente planilla o lista de turnos, como, así tambien, la Orgánica estructural y funcional del CECODI, se encuentran sujetas a modificaciones, de acuerdo a lo establecido en el C.C.T. Artículo 11 - FACULTADES DE LA EMPRESA: Facultad de organización y reglamentaria, las cuales deben ser ejercidas de manera tal que no importe un ejercicio abusivo de los mismos y deben ejerserce de forma razonable atendiendo el ejercicio funcional a fin de lograr la finalidad de la Empresa. La Empresa se reserva para si la potestad de dirección y control de la empresa, comprende el derecho de emitir directivas al personal, organizar y distribuir el trabajo a su personal como así tambien funcones de vigilancia y control, las que deberan ser ejercidas en orden funcional a los fines de la empresa sin perjuicio a los derechos personales y patrimoniales del trabajador/a. Articulo 38 - PAUSAS DURANTE LA JORNADA DE TRABAJO: Los ciclos de trabajo y descanso de las dependencias Técnicas de los Servicios de Navegación Aérea -CNS- estarán determinadas por EANA S.E. segun las necesidades de cada servicio en particular y de cada dependecia, no pudiendo en ningun modo superar las 144 horas mensuales convenidas para jornada laboral en el presente convenio.',
  textoDespues: [
    '**Autorizaciones y Responsabilidades:** El Jefe de la Dep. CECODI es el único responsable de autorizar al personal que forma parte del Grupo Laboral C.N.S.E. CECODI en los casos de: permisos por día no laborable, cambios de turno, cambio de pasivos y licencias.',
    'Adicionalmente, deberá registrar la actividad del personal y notificar a RR. HH.',
    '**Jornada Laboral y Turnos:** La jornada laboral diaria para todo el personal comprendido en el presente CCT será como máximo de 8 horas y de 144 horas mensuales, de las cuales la empresa podrá destinar 24 horas a cursos de instrucción, capacitación y otras actividades.',
    'Después del horario de actividad (Turno B), los coordinadores realizan turno pasivo de atención telefónica en modalidad remota. Cualquier actuación debe ser registrada por los agentes en el MDA, incluyendo la gestión del ticket en modo colaboración.',
    'La presente lista/planilla de turnos, se encuentra sujeta a modificaciones por razones técnicas/operativas, sanitarias, etc. Articulo 36 - Jornada Máxima - Excepciones.',
    '',
    '**Procedimientos y Solicitudes:**',
    '__Permisos y Días Personales:__ El personal deberá solicitar el día por medio de correo electrónico, justificando el motivo o la circunstancia. Esta solicitud, ya sea para un día personal o un trámite, debe realizarse con una antelación mínima de 72 horas y está sujeta a aprobación.',
    '__Cambios de Turno:__ El personal deberá confeccionar y presentar el formulario correspondiente, el cual será visado por los coordinadores de Área. Este cambio no estará autorizado hasta que sea firmado por el Jefe de la Dep. CECODI. Los cambios de turno (A, B, C, PAS, PAF, PCS y PCF) deben ser presentados con una antelación mínima de 72 horas, según lo establecido en el C.C.T. Cap7 Jornadas de Trabajo, Artículo 39 Cambio de Turno.',
    '__Activación PC/PA:__ Esta modalidad (Pasivo Charlie Alpha) se activará únicamente por enfermedad, accidente o alerta sanitaria. Es obligatorio presentar el **CERTIFICADO MÉDICO** correspondiente sin excepción.',
    '__Licencias:__ Para solicitar cualquier licencia, el empleado debe presentar el formulario y toda la documentación de respaldo, como los certificados médicos correspondientes.',
    'Según el punto 1 del apartado B del convenio, se aconseja iniciar el trámite de solicitud entre el 1 y el 15 de cada mes. Esto es para evitar conflictos con la programación de turnos, ya que la lista se presenta entre el 20 y el 25 de cada mes. Si un empleado solicita la licencia fuera de este período, será su responsabilidad conseguir los cambios de turno necesarios.',
    '__Ausentismo y Notificaciones:__ Las llegadas tarde y ausencias del puesto de trabajo sin autorización se consideran ausentismo. Se debe notificar previamente cualquier ausencia para que pueda ser considerada "con aviso".',
    '',
    '**Otras Cláusulas:** El pago/cómputo por racionamiento, es por actividad presencial.'
  ].join('\n')
};

// Etiquetas de sección de la planilla por rango. Los técnicos usan la
// etiqueta de su área (si tiene) o "TÉCNICOS DE ÁREA".
export const SECCION_TECNICOS = 'TÉCNICOS DE ÁREA.';
export const SECCION_ROL = { adjunto: 'COOR. ADJ. DE ÁREA.', coordinador: 'COOR. DE ÁREA.', jefe: 'JEFE' };
