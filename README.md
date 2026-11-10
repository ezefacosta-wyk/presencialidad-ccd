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
y qué puede hacer cada rango.

Para verla: abrila con un servidor estático (`python3 -m http.server`) o
publicala en GitHub Pages (Settings → Pages → rama `main`, carpeta `/root`).

## Jerarquía y permisos

| Rango | Ve | Puede modificar |
|---|---|---|
| Jefe de departamento | Todo | Todo: áreas, tipos de turno, feriados, personal y turnos de cualquier área |
| Coordinador de área | Todo | Turnos de su área; alta/edición de adjuntos y técnicos de su área |
| Coordinador adjunto | Todo | Turnos de su área; alta/edición de técnicos de su área |
| Técnico | Todo | Nada (solo lectura) |

## Pantallas

- **Vista general** — calendario mensual de turnos del área elegida y,
  debajo, todo el personal separado por área para el día seleccionado:
  de turno, turno pasivo, franco/ausente y sin asignar.
- **Planificación** — grilla persona × día por área. Se elige un tipo de
  turno y se tocan las celdas para asignarlo.
- **Personal** — listado por área con rango y email de acceso.
- **Administración** (solo jefe) — áreas, tipos de turno y feriados.

## Estructura

```
index.html
css/style.css
js/config.js      configuración (Firebase / modo demo)
js/store.js       capa de datos: backend demo (localStorage) y backend Firebase
js/app.js         permisos, vistas y eventos
firestore.rules   reglas de seguridad que aplican la jerarquía en el servidor
```

### Modelo de datos (Firestore)

| Colección | Documento | Campos |
|---|---|---|
| `areas` | id | `nombre`, `orden` |
| `personas` | id | `nombre`, `email`, `rol` (`jefe`/`coordinador`/`adjunto`/`tecnico`), `areaId` |
| `usuarios` | email | `personaId`, `nombre`, `rol`, `areaId` — espejo de `personas`, lo leen las reglas |
| `tiposTurno` | código | `label`, `horario`, `grupo` (`activo`/`pasivo`/`ausente`), `color`, `orden` |
| `turnos` | `anio_mes_personaId` | `anio`, `mes`, `personaId`, `areaId`, `dias` (`{"5":"TM"}`) |
| `feriados` | `anio-mes-dia` | `anio`, `mes`, `dia`, `nombre` |

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

- Cargar las áreas, el personal y los tipos de turno reales.
- Módulo de presencialidad y costos mensuales (Racionamiento y Movilidad)
  heredado del proyecto anterior.
- Probar el backend Firebase y las reglas con un proyecto real.
