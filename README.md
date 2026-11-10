# Turnos y Presencialidad · CCD

Sistema web para organizar los turnos del departamento por área, con
jerarquía de personal y permisos por rango. Es la evolución del
[Registro de Presencialidad](https://github.com/ezefacosta-wyk/racionamientos):
misma tecnología (HTML/CSS/JS sin build, GitHub Pages, Firebase) y misma
línea visual, con mucho más alcance.

## Estado actual: estructura y diseño (modo demo)

Mientras `js/config.js` no tenga un `firebaseConfig`, la web corre en
**modo demo**: usa áreas, personas y turnos de ejemplo, guarda los cambios
solo en el navegador y muestra un selector **Ver como** para probar qué ve
y qué puede hacer cada rango. En Administración hay un botón para vaciar
los datos de ejemplo y empezar a armar las áreas y los rangos propios.

Para verla: abrila con un servidor estático (`python3 -m http.server`) o
publicala en GitHub Pages (Settings → Pages → rama `main`, carpeta `/root`).

## Jerarquía y permisos

| Rango | Ve | Puede modificar |
|---|---|---|
| Jefe de departamento | Todo | Todo: áreas, tipos de turno, feriados, personal y turnos de cualquier área |
| Coordinador de área | Todo | Turnos de su área (de coordinadores, adjuntos y técnicos); alta/edición de adjuntos y técnicos de su área |
| Coordinador adjunto | Todo | Turnos de su área (de adjuntos y técnicos); alta/edición de técnicos de su área |
| Técnico | Todo | Nada (solo lectura) |

## Pantallas

- **Vista general** — calendario mensual de turnos del área elegida y,
  debajo, todo el personal separado por área para el día seleccionado:
  de turno, turno pasivo, franco/ausente y sin asignar.
- **Planificación** — la planilla completa del departamento con el mismo
  formato que la planilla oficial: secciones (NOC, técnicos de área,
  coordinadores adjuntos, coordinadores, jefe), Ord, días del mes más los
  primeros días del mes siguiente, y horas reales / pasivas / totales
  calculadas solas. Se elige un tipo de turno y se toca o arrastra sobre las
  celdas. **Exportar PDF** genera la planilla en hoja Oficio apaisada, con la
  página de reglamento y nomenclatura.
- **Personal** — listado por área con rango y email de acceso.
- **Administración** (solo jefe) — áreas (y su sección en la planilla), tipos
  de turno (color, horas y observación), textos/logo/firmas del PDF y feriados.

## Estructura

```
index.html
css/style.css
js/config.js      configuración (Firebase / modo demo)
js/store.js       capa de datos: backend demo (localStorage) y backend Firebase
js/defaults.js    tipos de turno y textos de la planilla por defecto
js/planilla.js    columnas, secciones y cómputo de horas (pantalla y PDF)
js/pdf.js         exportación a PDF (usa jsPDF, incluido en js/vendor)
js/app.js         permisos, vistas y eventos
firestore.rules   reglas de seguridad que aplican la jerarquía en el servidor
```

### Modelo de datos (Firestore)

| Colección | Documento | Campos |
|---|---|---|
| `areas` | id | `nombre`, `etiqueta` (sección de sus técnicos en la planilla), `orden` |
| `personas` | id | `nombre`, `email`, `rol` (`jefe`/`coordinador`/`adjunto`/`tecnico`), `areaId`, `orden` |
| `usuarios` | email | `personaId`, `nombre`, `rol`, `areaId` — espejo de `personas`, lo leen las reglas |
| `tiposTurno` | código | `label`, `horario`, `detalle`, `grupo` (`activo`/`pasivo`/`ausente`), `horas`, `horasPasivas`, `color`, `observacion`, `orden` |
| `turnos` | `anio_mes_personaId` | `anio`, `mes`, `personaId`, `areaId`, `dias` (`{"5":"TM"}`) |
| `feriados` | `anio-mes-dia` | `anio`, `mes`, `dia`, `nombre` (leyenda que sale en el PDF) |
| `config` | `planilla` | `titulo`, `subtitulo`, `diasExtra`, `firma1`, `firma2`, `logo`, `textoAntes`, `textoDespues` |

### Cómputo de horas

Cada tipo de turno define cuántas horas reales y pasivas suma por día
(A y C: 12 reales · B: 6 reales · PAS y PCS: 6 pasivas · PAF y PCF: 0,
porque se compensan con franco). Solo suman los días del mes; las columnas
del mes siguiente son informativas.

## Pasar a Firebase

A diferencia del proyecto anterior, acá hay login: los permisos por rango
no se pueden garantizar con un código compartido.

1. Crear un proyecto en Firebase, con **Firestore** y **Authentication →
   Google** habilitados. En Authentication → Settings → Dominios
   autorizados, agregar `ezefacosta-wyk.github.io`.
2. Pegar el `firebaseConfig` en `js/config.js`.
3. Publicar `firestore.rules` en la pestaña Reglas de Firestore.
4. Crear a mano el primer usuario: documento `/usuarios/<email en minúsculas>`
   con `{ rol: "jefe", nombre: "..." }`. Desde ahí, el resto del personal
   se da de alta en la pestaña Personal cargando su email de Google.

El backend Firebase ya está escrito en `js/store.js` pero todavía no se
probó contra un proyecto real.

## Pendiente

- Cargar las áreas y el personal reales (los tipos de turno ya son los de la planilla del NOC).
- Módulo de presencialidad y costos mensuales (Racionamiento y Movilidad)
  heredado del proyecto anterior.
- Probar el backend Firebase y las reglas con un proyecto real.
