# Turnos y Presencialidad · CCD

Sistema web para organizar los turnos del departamento por área, con
jerarquía de personal, permisos por rango, cambios de turno entre compañeros
y exportación de la planilla a PDF. Es la evolución del
[Registro de Presencialidad](https://github.com/ezefacosta-wyk/racionamientos).

Funciona de dos maneras, y la página elige sola:

- **Servidor local** (uso real): un programa en Python guarda todo en una base
  SQLite en una PC de la red; los demás entran desde el navegador. No depende
  de ningún servicio externo.
- **Modo demo**: si la página se abre desde otro lado (por ejemplo GitHub
  Pages), usa datos de ejemplo guardados solo en ese navegador, con un
  selector **Ver como** para probar cada rango. Cada persona de ejemplo tiene
  el usuario `apellido@ccd.demo` y la contraseña `demo1234`.

## Usar con el servidor local

Requisito: **Python 3.9 o superior** (en Windows, al instalarlo marcar
«Add python.exe to PATH»). No hace falta instalar nada más.

1. Descargar o clonar este repositorio en la PC que va a hacer de servidor.
2. Iniciar el servidor:
   - Windows: doble clic en `iniciar-servidor.bat`
   - Linux: `./iniciar-servidor.sh`
3. Abrir `http://localhost:8080` en esa PC. La primera vez pide crear el
   usuario del jefe de departamento.
4. Los demás entran desde su navegador con `http://<IP-de-esa-PC>:8080`.
   Si no conectan, hay que permitir el puerto 8080 en el firewall de esa PC.

Opciones: `--puerto 9000`, `--db ruta/a/otra.db`, `--host 127.0.0.1` (solo
esa PC) y `--cert cert.pem --key clave.pem` para servir por HTTPS.

**Datos y respaldo.** Todo queda en un único archivo:
`servidor/datos/ccd.db`. El jefe puede descargar una copia desde
Administración → Respaldo. Para restaurar, se detiene el servidor y se
reemplaza ese archivo. La base no se sube a GitHub (está en `.gitignore`).

**Contraseñas.** Se guardan con hash (PBKDF2-SHA256), nunca en texto. No hay
envío de emails: si alguien olvida la suya, su coordinador o el jefe le
asigna una nueva desde Personal. Sin `--cert`, el tráfico va sin cifrar
dentro de la red local.

**Seguridad.** El servidor verifica todos los permisos por su cuenta (no
alcanza con modificar la página para saltearlos), solo sirve los archivos de
la web y limita los intentos de ingreso fallidos.

## Jerarquía y permisos

| Rango | Ve | Puede modificar |
|---|---|---|
| Jefe de departamento | Todo | Todo: áreas, tipos de turno, feriados, textos del PDF, personal, usuarios y turnos de cualquier área |
| Coordinador de área | Todo | Turnos de su área (de coordinadores, adjuntos y técnicos); alta/edición de adjuntos y técnicos de su área y sus usuarios |
| Coordinador adjunto | Todo | Turnos de su área (de adjuntos y técnicos); alta/edición de técnicos de su área y sus usuarios |
| Técnico | Todo | Nada en la planilla; puede pedir, aceptar y rechazar cambios de turno |

Cada persona cambia su propia contraseña desde **Contraseña**, arriba a la
derecha.

## Pantallas

- **Vista general** — calendario mensual del área elegida con el nombre
  completo de quienes están de turno o de pasivo cada día y, debajo, todo el
  personal separado por área para el día seleccionado. Tocar un nombre abre
  la opción **Solicitar cambio de turno**.
- **Planificación** — la planilla completa del departamento con el formato
  de la planilla oficial: secciones (NOC, técnicos de área, coordinadores
  adjuntos, coordinadores, jefe), Ord, días del mes más los primeros días
  del mes siguiente, y horas reales / pasivas / totales calculadas solas. Se
  elige un tipo de turno y se toca o arrastra sobre las celdas.
  **Exportar PDF** genera la planilla en hoja Oficio apaisada, con la página
  de reglamento y nomenclatura.
- **Cambios de turno** — circuito de 3 pasos: la persona pide el cambio a un
  compañero (el mismo día o a cambio de un turno suyo de otro día), el
  compañero acepta o rechaza, y un coordinador/adjunto con permiso sobre los
  turnos de ambos, o el jefe, lo aprueba. Al aprobarse, el intercambio se
  aplica solo en la planilla (si la planilla cambió entretanto, no se
  aplica). Avisa cuando faltan menos de 72 h, como pide el reglamento.
- **Personal** — listado por área con rango y usuario; alta de personas y
  de sus usuarios (email y contraseña inicial).
- **Administración** (solo jefe) — respaldo, áreas (y su sección en la
  planilla), tipos de turno (color, horas y observación), textos/logo/firmas
  del PDF y feriados.

Los cambios que hace cualquiera aparecen en las demás pantallas abiertas en
unos segundos, sin recargar.

## Estructura

```
index.html
css/style.css
js/config.js         nombre del sistema
js/store.js          capa de datos: servidor local o modo demo (localStorage)
js/defaults.js       tipos de turno y textos de la planilla por defecto
js/planilla.js       columnas, secciones y cómputo de horas (pantalla y PDF)
js/pdf.js            exportación a PDF (usa jsPDF, incluido en js/vendor)
js/app.js            permisos, vistas y eventos
servidor/servidor.py servidor HTTP + API + SQLite (solo biblioteca estándar)
iniciar-servidor.bat / iniciar-servidor.sh
```

### Base de datos

SQLite con estas tablas:

| Tabla | Contenido |
|---|---|
| `docs` | Documentos JSON por colección (`areas`, `personas`, `tipos`, `feriados`, `turnos`, `solicitudes`, `config`) |
| `usuarios` | `email`, `persona_id`, `hash` y `sal` de la contraseña |
| `sesiones` | Sesiones abiertas (cookie `HttpOnly`, 30 días) |
| `meta` | Número de versión de los datos (para avisar cambios en vivo) |

Documentos principales:

| Colección | Id | Campos |
|---|---|---|
| `areas` | id | `nombre`, `etiqueta` (sección de sus técnicos en la planilla), `orden` |
| `personas` | id | `nombre`, `email`, `rol` (`jefe`/`coordinador`/`adjunto`/`tecnico`), `areaId`, `orden` |
| `tipos` | código | `label`, `horario`, `detalle`, `grupo` (`activo`/`pasivo`/`ausente`), `horas`, `horasPasivas`, `color`, `observacion`, `orden` |
| `turnos` | `anio_mes_personaId` | `anio`, `mes`, `personaId`, `areaId`, `dias` (`{"5":"TM"}`) |
| `feriados` | `anio-mes-dia` | `anio`, `mes`, `dia`, `nombre` (leyenda que sale en el PDF) |
| `solicitudes` | id | `deId`, `paraId`, `dias` (`[{anio, mes, dia, de, para}]`), `motivo`, `estado` (`pendiente`/`aceptada`/`rechazada`/`cancelada`/`aprobada`/`denegada`), `creada`, `respondida`, `resuelta`, `resueltaPorId`, `nota` |
| `config` | `planilla` | `titulo`, `subtitulo`, `diasExtra`, `firma1`, `firma2`, `logo`, `textoAntes`, `textoDespues` |

### Cómputo de horas

Cada tipo de turno define cuántas horas reales y pasivas suma por día
(A y C: 12 reales · B: 6 reales · PAS y PCS: 6 pasivas · PAF y PCF: 0,
porque se compensan con franco). Solo suman los días del mes; las columnas
del mes siguiente son informativas.

## Pendiente

- Módulo de presencialidad y costos mensuales (Racionamiento y Movilidad)
  heredado del proyecto anterior.
