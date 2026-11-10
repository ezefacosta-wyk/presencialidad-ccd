#!/usr/bin/env python3
"""
Servidor local de Turnos y Presencialidad · CCD.

Sirve la web y guarda todo en una base SQLite (un único archivo), sin
depender de servicios externos. Solo usa la biblioteca estándar de Python 3.9+,
así que funciona igual en Windows y en Linux sin instalar nada.

    python servidor.py                      # puerto 8080, en toda la red local
    python servidor.py --puerto 9000
    python servidor.py --cert cert.pem --key clave.pem   # con HTTPS

La primera vez que se abre la web pide crear el usuario del jefe de
departamento. La base queda en servidor/datos/ccd.db (cambiable con --db).
"""
import argparse
import hashlib
import json
import os
import re
import secrets
import sqlite3
import ssl
import sys
import tempfile
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

RAIZ_WEB = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
RANGO = {'jefe': 4, 'coordinador': 3, 'adjunto': 2, 'tecnico': 1}
GRUPOS = {'activo', 'pasivo', 'ausente'}
COOKIE = 'ccd_sesion'
DURACION_SESION = 30 * 24 * 3600
MAX_CUERPO = 3 * 1024 * 1024
ITERACIONES = 200_000
MIME = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon', '.json': 'application/json'}
# Solo se sirven los archivos de la web, nunca el servidor ni la base.
RUTA_ESTATICA = re.compile(r'^(index\.html|css/[\w.-]+|js/[\w.-]+|js/vendor/[\w.-]+)$')


class ErrorApi(Exception):
    def __init__(self, mensaje, estado=400):
        super().__init__(mensaje)
        self.estado = estado


def ahora_ms():
    return int(time.time() * 1000)


def hash_clave(clave, sal):
    return hashlib.pbkdf2_hmac('sha256', clave.encode('utf-8'), bytes.fromhex(sal), ITERACIONES).hex()


def turno_id(anio, mes, persona_id):
    return f'{anio}_{mes:02d}_{persona_id}'


def mes_siguiente(anio, mes):
    return (anio + 1, 1) if mes == 12 else (anio, mes + 1)


# ---------------------------------------------------------------------------
# Base de datos: colecciones de documentos JSON, como las usa la web.
# ---------------------------------------------------------------------------
class Base:
    def __init__(self, ruta):
        os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
        self.ruta = ruta
        self.lock = threading.RLock()
        self.cambio = threading.Condition(self.lock)
        self.con = sqlite3.connect(ruta, check_same_thread=False, isolation_level=None)
        self.con.execute('PRAGMA journal_mode=WAL')
        self.con.execute('PRAGMA foreign_keys=ON')
        self.con.executescript('''
            CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (col, id));
            CREATE TABLE IF NOT EXISTS usuarios (email TEXT PRIMARY KEY, persona_id TEXT NOT NULL UNIQUE, hash TEXT NOT NULL, sal TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sesiones (token TEXT PRIMARY KEY, email TEXT NOT NULL, expira INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
        ''')
        self.version = int(self.meta('version') or 0)

    # --- utilidades
    def meta(self, clave, valor=None):
        if valor is None:
            fila = self.con.execute('SELECT valor FROM meta WHERE clave=?', (clave,)).fetchone()
            return fila[0] if fila else None
        self.con.execute('INSERT INTO meta(clave, valor) VALUES(?, ?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor', (clave, str(valor)))

    def get(self, col, id_):
        fila = self.con.execute('SELECT data FROM docs WHERE col=? AND id=?', (col, id_)).fetchone()
        return json.loads(fila[0]) if fila else None

    def listar(self, col):
        return [{'id': i, **json.loads(d)} for i, d in self.con.execute('SELECT id, data FROM docs WHERE col=? ORDER BY id', (col,))]

    def poner(self, col, id_, obj, merge=True):
        if merge:
            previo = self.get(col, id_) or {}
            previo.update(obj)
            obj = previo
        obj.pop('id', None)
        self.con.execute('INSERT INTO docs(col, id, data) VALUES(?, ?, ?) ON CONFLICT(col, id) DO UPDATE SET data=excluded.data',
                         (col, id_, json.dumps(obj, ensure_ascii=False)))

    def quitar(self, col, id_):
        self.con.execute('DELETE FROM docs WHERE col=? AND id=?', (col, id_))

    def transaccion(self):
        return Transaccion(self)

    def esperar_cambio(self, desde, segundos=25):
        with self.cambio:
            self.cambio.wait_for(lambda: self.version != desde, timeout=segundos)
            return self.version


class Transaccion:
    """Bloque atómico: BEGIN IMMEDIATE ... COMMIT, y avisa a quienes esperan cambios."""
    def __init__(self, base):
        self.base = base

    def __enter__(self):
        self.base.lock.acquire()
        self.base.con.execute('BEGIN IMMEDIATE')
        return self.base

    def __exit__(self, tipo, valor, tb):
        try:
            if tipo is None:
                self.base.version += 1
                self.base.meta('version', self.base.version)
                self.base.con.execute('COMMIT')
                self.base.cambio.notify_all()
            else:
                self.base.con.execute('ROLLBACK')
        finally:
            self.base.lock.release()
        return False


# ---------------------------------------------------------------------------
# Permisos (los mismos que muestra la web)
# ---------------------------------------------------------------------------
def es_jefe(yo):
    return yo['rol'] == 'jefe'


def coordina(yo, area_id):
    return yo['rol'] in ('coordinador', 'adjunto') and bool(area_id) and yo.get('areaId') == area_id


def rol_menor(yo, rol):
    return rol == 'tecnico' or (rol == 'adjunto' and yo['rol'] == 'coordinador')


def gestiona_persona(yo, p):
    return es_jefe(yo) or (coordina(yo, p.get('areaId')) and rol_menor(yo, p.get('rol')))


def carga_turnos(yo, p):
    return es_jefe(yo) or (coordina(yo, p.get('areaId')) and RANGO.get(p.get('rol'), 9) <= RANGO[yo['rol']])


# ---------------------------------------------------------------------------
# Lógica de la API
# ---------------------------------------------------------------------------
class Api:
    def __init__(self, base):
        self.db = base
        self.fallos = {}  # ip -> [timestamps] de logins fallidos

    # --- sesión
    def usuario_de_token(self, token):
        if not token:
            return None
        with self.db.lock:
            fila = self.db.con.execute('SELECT s.email, s.expira, u.persona_id FROM sesiones s JOIN usuarios u ON u.email = s.email WHERE s.token=?', (token,)).fetchone()
            if not fila or fila[1] < time.time():
                return None
            p = self.db.get('personas', fila[2])
            if not p:
                return None
            return {'email': fila[0], 'id': fila[2], 'personaId': fila[2], 'nombre': p.get('nombre'), 'rol': p.get('rol'), 'areaId': p.get('areaId')}

    def inicializado(self):
        with self.db.lock:
            return self.db.con.execute('SELECT COUNT(*) FROM usuarios').fetchone()[0] > 0

    def crear_sesion(self, email):
        token = secrets.token_urlsafe(32)
        with self.db.lock:
            self.db.con.execute('DELETE FROM sesiones WHERE expira < ?', (int(time.time()),))
            self.db.con.execute('INSERT INTO sesiones(token, email, expira) VALUES(?, ?, ?)', (token, email, int(time.time()) + DURACION_SESION))
        return token

    def login(self, ip, cuerpo):
        recientes = [t for t in self.fallos.get(ip, []) if t > time.time() - 600]
        self.fallos[ip] = recientes
        if len(recientes) >= 10:
            raise ErrorApi('Demasiados intentos. Esperá unos minutos y probá de nuevo.', 429)
        email = str(cuerpo.get('email', '')).strip().lower()
        clave = str(cuerpo.get('clave', ''))
        with self.db.lock:
            fila = self.db.con.execute('SELECT hash, sal, persona_id FROM usuarios WHERE email=?', (email,)).fetchone()
        if not fila or not secrets.compare_digest(fila[0], hash_clave(clave, fila[1])) or not self.db.get('personas', fila[2]):
            recientes.append(time.time())
            raise ErrorApi('Email o contraseña incorrectos.', 401)
        return self.crear_sesion(email)

    def logout(self, token):
        with self.db.lock:
            self.db.con.execute('DELETE FROM sesiones WHERE token=?', (token,))

    def poner_clave(self, email, persona_id, clave):
        sal = secrets.token_hex(16)
        self.db.con.execute('INSERT INTO usuarios(email, persona_id, hash, sal) VALUES(?, ?, ?, ?) '
                            'ON CONFLICT(email) DO UPDATE SET persona_id=excluded.persona_id, hash=excluded.hash, sal=excluded.sal',
                            (email, persona_id, hash_clave(clave, sal), sal))

    # --- primera vez
    def inicializar(self, c):
        nombre = str(c.get('nombre', '')).strip()
        email = str(c.get('email', '')).strip().lower()
        clave = str(c.get('clave', ''))
        if not nombre or not re.match(r'^\S+@\S+\.\S+$', email):
            raise ErrorApi('Completá el nombre y un email válido.')
        if len(clave) < 6:
            raise ErrorApi('La contraseña debe tener al menos 6 caracteres.')
        with self.db.transaccion() as db:
            if db.con.execute('SELECT COUNT(*) FROM usuarios').fetchone()[0]:
                raise ErrorApi('El sistema ya fue inicializado.', 409)
            pid = secrets.token_hex(4)
            db.poner('personas', pid, {'nombre': nombre, 'rol': 'jefe', 'areaId': None, 'email': email, 'orden': None}, merge=False)
            for t in c.get('tipos') or []:
                if isinstance(t, dict) and t.get('id'):
                    db.poner('tipos', str(t['id'])[:4].upper(), t, merge=False)
            if isinstance(c.get('config'), dict):
                db.poner('config', 'planilla', c['config'], merge=False)
            self.poner_clave(email, pid, clave)
        return self.crear_sesion(email)

    # --- lectura
    def datos(self, yo, anio, mes):
        with self.db.lock:
            sig = mes_siguiente(anio, mes)
            turnos, turnos_sig = {}, {}
            for t in self.db.listar('turnos'):
                if t.get('anio') == anio and t.get('mes') == mes:
                    turnos[t['personaId']] = t.get('dias', {})
                elif (t.get('anio'), t.get('mes')) == sig:
                    turnos_sig[t['personaId']] = t.get('dias', {})
            return {
                'version': self.db.version,
                'yo': yo,
                'areas': self.db.listar('areas'),
                'personas': self.db.listar('personas'),
                'tipos': self.db.listar('tipos'),
                'feriados': self.db.listar('feriados'),
                'solicitudes': self.db.listar('solicitudes'),
                'config': self.db.get('config', 'planilla') or {},
                'turnos': turnos,
                'turnosSig': turnos_sig,
            }

    def codigo(self, persona_id, anio, mes, dia):
        t = self.db.get('turnos', turno_id(anio, mes, persona_id)) or {}
        return (t.get('dias') or {}).get(str(dia)) or None

    # --- escritura
    def guardar(self, yo, c):
        col, id_, obj = c.get('col'), str(c.get('id') or secrets.token_hex(4)), c.get('obj')
        if not isinstance(obj, dict):
            raise ErrorApi('Datos inválidos.')
        obj = {k: v for k, v in obj.items() if k != 'id'}
        with self.db.transaccion() as db:
            if col in ('areas', 'tipos', 'feriados'):
                if not es_jefe(yo):
                    raise ErrorApi('Solo el jefe de departamento puede modificar esto.', 403)
                if col == 'tipos':
                    id_ = id_.upper()[:4]
                    if obj.get('grupo') and obj['grupo'] not in GRUPOS:
                        raise ErrorApi('Grupo de turno inválido.')
                db.poner(col, id_, obj)
            elif col == 'personas':
                previa = db.get('personas', id_)
                nueva = {**(previa or {}), **obj}
                nueva['email'] = (previa or {}).get('email', '')  # el email se cambia con /api/usuario
                if nueva.get('rol') not in RANGO:
                    raise ErrorApi('Rango inválido.')
                if nueva['rol'] == 'jefe':
                    nueva['areaId'] = None
                elif not nueva.get('areaId') or not db.get('areas', nueva['areaId']):
                    raise ErrorApi('Elegí un área válida.')
                if (previa and not gestiona_persona(yo, previa)) or not gestiona_persona(yo, nueva):
                    raise ErrorApi('No tenés permiso para modificar a esta persona.', 403)
                db.poner('personas', id_, nueva, merge=False)
                if previa and previa.get('areaId') != nueva.get('areaId'):
                    for t in db.listar('turnos'):
                        if t.get('personaId') == id_:
                            db.poner('turnos', t['id'], {'areaId': nueva.get('areaId')})
            else:
                raise ErrorApi('Colección desconocida.')
        return {'id': id_}

    def borrar(self, yo, c):
        col, id_ = c.get('col'), str(c.get('id', ''))
        with self.db.transaccion() as db:
            if col in ('areas', 'tipos', 'feriados'):
                if not es_jefe(yo):
                    raise ErrorApi('Solo el jefe de departamento puede modificar esto.', 403)
                if col == 'areas' and any(p.get('areaId') == id_ for p in db.listar('personas')):
                    raise ErrorApi('El área todavía tiene personal asignado.')
                db.quitar(col, id_)
            elif col == 'personas':
                p = db.get('personas', id_)
                if not p:
                    return {}
                if not gestiona_persona(yo, p) or id_ == yo['id']:
                    raise ErrorApi('No tenés permiso para quitar a esta persona.', 403)
                db.quitar('personas', id_)
                for t in db.listar('turnos'):
                    if t.get('personaId') == id_:
                        db.quitar('turnos', t['id'])
                fila = db.con.execute('SELECT email FROM usuarios WHERE persona_id=?', (id_,)).fetchone()
                if fila:
                    db.con.execute('DELETE FROM sesiones WHERE email=?', (fila[0],))
                    db.con.execute('DELETE FROM usuarios WHERE email=?', (fila[0],))
            else:
                raise ErrorApi('Colección desconocida.')
        return {}

    def config(self, yo, c):
        if not es_jefe(yo):
            raise ErrorApi('Solo el jefe de departamento puede modificar la planilla.', 403)
        if not isinstance(c.get('obj'), dict):
            raise ErrorApi('Datos inválidos.')
        with self.db.transaccion() as db:
            db.poner('config', 'planilla', c['obj'])
        return {}

    def turno(self, yo, c):
        try:
            anio, mes, dia = int(c['anio']), int(c['mes']), int(c['dia'])
        except (KeyError, TypeError, ValueError):
            raise ErrorApi('Fecha inválida.')
        code = c.get('code') or None
        with self.db.transaccion() as db:
            p = db.get('personas', str(c.get('personaId')))
            if not p:
                raise ErrorApi('La persona no existe.')
            if not carga_turnos(yo, {**p, 'id': c.get('personaId')}):
                raise ErrorApi('No tenés permiso para cargar turnos de esta persona.', 403)
            if code and not db.get('tipos', code):
                raise ErrorApi('Tipo de turno inválido.')
            tid = turno_id(anio, mes, c['personaId'])
            t = db.get('turnos', tid) or {'anio': anio, 'mes': mes, 'personaId': c['personaId'], 'areaId': p.get('areaId'), 'dias': {}}
            if code:
                t['dias'][str(dia)] = code
            else:
                t['dias'].pop(str(dia), None)
            db.poner('turnos', tid, t, merge=False)
        return {}

    def usuario(self, yo, c):
        pid = str(c.get('personaId', ''))
        email = str(c.get('email', '')).strip().lower()
        clave = str(c.get('clave') or '')
        if not re.match(r'^\S+@\S+\.\S+$', email):
            raise ErrorApi('El email no es válido.')
        if clave and len(clave) < 6:
            raise ErrorApi('La contraseña debe tener al menos 6 caracteres.')
        with self.db.transaccion() as db:
            p = db.get('personas', pid)
            if not p:
                raise ErrorApi('La persona no existe.')
            if not gestiona_persona(yo, p) and not es_jefe(yo):
                raise ErrorApi('No tenés permiso para administrar el usuario de esta persona.', 403)
            otro = db.con.execute('SELECT persona_id FROM usuarios WHERE email=?', (email,)).fetchone()
            if otro and otro[0] != pid:
                raise ErrorApi('Ese email ya lo usa otra persona.')
            actual = db.con.execute('SELECT email, hash, sal FROM usuarios WHERE persona_id=?', (pid,)).fetchone()
            if not actual and not clave:
                raise ErrorApi('Ingresá una contraseña inicial para crear el usuario.')
            if actual and actual[0] != email:
                db.con.execute('DELETE FROM sesiones WHERE email=?', (actual[0],))
                db.con.execute('UPDATE usuarios SET email=? WHERE persona_id=?', (email, pid))
            if clave:
                db.con.execute('DELETE FROM sesiones WHERE email=?', (email,))
                self.poner_clave(email, pid, clave)
            db.poner('personas', pid, {'email': email})
        return {}

    def clave(self, yo, c):
        nueva = str(c.get('nueva', ''))
        if len(nueva) < 6:
            raise ErrorApi('La contraseña debe tener al menos 6 caracteres.')
        with self.db.transaccion():
            self.poner_clave(yo['email'], yo['id'], nueva)
        return {}

    # --- cambios de turno
    def nueva_solicitud(self, yo, c):
        para = str(c.get('paraId', ''))
        dias_in = c.get('dias')
        if not isinstance(dias_in, list) or not 1 <= len(dias_in) <= 2:
            raise ErrorApi('Días inválidos.')
        hoy = time.localtime()
        hoy_t = (hoy.tm_year, hoy.tm_mon, hoy.tm_mday)
        with self.db.transaccion() as db:
            if para == yo['id'] or not db.get('personas', para):
                raise ErrorApi('Elegí a otra persona.')
            dias = []
            for d in dias_in:
                try:
                    a, m, di = int(d['anio']), int(d['mes']), int(d['dia'])
                except (KeyError, TypeError, ValueError):
                    raise ErrorApi('Fecha inválida.')
                if (a, m, di) < hoy_t:
                    raise ErrorApi('No se pueden pedir cambios de días pasados.')
                # los turnos se toman de la base, no de lo que manda el navegador
                dias.append({'anio': a, 'mes': m, 'dia': di, 'de': self.codigo(yo['id'], a, m, di), 'para': self.codigo(para, a, m, di)})
            dias = [d for d in dias if d['de'] != d['para']]
            if not dias:
                raise ErrorApi('Tienen el mismo turno: no hay nada que cambiar.')
            sid = secrets.token_hex(6)
            db.poner('solicitudes', sid, {
                'deId': yo['id'], 'paraId': para, 'dias': dias, 'motivo': str(c.get('motivo', ''))[:500],
                'estado': 'pendiente', 'creada': ahora_ms(), 'respondida': None, 'resuelta': None, 'resueltaPorId': None, 'nota': ''
            }, merge=False)
        return {'id': sid}

    def supervisa(self, yo, s):
        de, para = self.db.get('personas', s.get('deId')), self.db.get('personas', s.get('paraId'))
        if not de or not para:
            return es_jefe(yo)
        return es_jefe(yo) or (carga_turnos(yo, de) and carga_turnos(yo, para))

    def aprueba(self, yo, s):
        return self.supervisa(yo, s) and (es_jefe(yo) or yo['id'] not in (s.get('deId'), s.get('paraId')))

    def estado_solicitud(self, yo, c):
        sid, estado = str(c.get('id', '')), c.get('estado')
        with self.db.transaccion() as db:
            s = db.get('solicitudes', sid)
            if not s:
                raise ErrorApi('La solicitud no existe.', 404)
            ahora = ahora_ms()
            if estado in ('aceptada', 'rechazada') and s['estado'] == 'pendiente' and s['paraId'] == yo['id']:
                cambios = {'estado': estado, 'respondida': ahora}
            elif estado == 'cancelada' and s['estado'] in ('pendiente', 'aceptada') and s['deId'] == yo['id']:
                cambios = {'estado': estado, 'resuelta': ahora}
            elif estado == 'denegada' and s['estado'] == 'aceptada' and self.aprueba(yo, s):
                cambios = {'estado': estado, 'resuelta': ahora, 'resueltaPorId': yo['id'], 'nota': str(c.get('nota', ''))[:500]}
            else:
                raise ErrorApi('No podés hacer eso con esta solicitud.', 403)
            db.poner('solicitudes', sid, cambios)
        return {}

    def aprobar(self, yo, c):
        sid = str(c.get('id', ''))
        with self.db.transaccion() as db:
            s = db.get('solicitudes', sid)
            if not s or s['estado'] != 'aceptada':
                raise ErrorApi('La solicitud no está esperando aprobación.')
            if not self.aprueba(yo, s):
                raise ErrorApi('No podés aprobar esta solicitud.', 403)
            pers = [db.get('personas', s['deId']), db.get('personas', s['paraId'])]
            if not all(pers):
                raise ErrorApi('Una de las personas ya no está en el sistema.')
            for d in s['dias']:
                if self.codigo(s['deId'], d['anio'], d['mes'], d['dia']) != d['de'] or self.codigo(s['paraId'], d['anio'], d['mes'], d['dia']) != d['para']:
                    raise ErrorApi('La planilla cambió desde que se pidió el cambio: alguno de los dos ya no tiene el turno que figura en la solicitud. Denegala y que se pida de nuevo.', 409)
            for d in s['dias']:
                for pid, p, code in ((s['deId'], pers[0], d['para']), (s['paraId'], pers[1], d['de'])):
                    tid = turno_id(d['anio'], d['mes'], pid)
                    t = db.get('turnos', tid) or {'anio': d['anio'], 'mes': d['mes'], 'personaId': pid, 'areaId': p.get('areaId'), 'dias': {}}
                    if code:
                        t['dias'][str(d['dia'])] = code
                    else:
                        t['dias'].pop(str(d['dia']), None)
                    db.poner('turnos', tid, t, merge=False)
            db.poner('solicitudes', sid, {'estado': 'aprobada', 'resuelta': ahora_ms(), 'resueltaPorId': yo['id']})
        return {}

    def respaldo(self):
        fd, ruta = tempfile.mkstemp(suffix='.db')
        os.close(fd)
        destino = sqlite3.connect(ruta)
        with self.db.lock:
            self.db.con.backup(destino)
        destino.close()
        with open(ruta, 'rb') as f:
            contenido = f.read()
        os.remove(ruta)
        return contenido


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
class Manejador(BaseHTTPRequestHandler):
    api: Api = None
    https = False
    server_version = 'CCD'
    sys_version = ''

    def log_message(self, formato, *args):
        if '/api/cambios' not in (self.path or ''):
            sys.stderr.write('%s - %s\n' % (self.address_string(), formato % args))

    # --- respuestas
    def enviar(self, estado, cuerpo, tipo='application/json; charset=utf-8', extra=None):
        datos = cuerpo if isinstance(cuerpo, bytes) else json.dumps(cuerpo, ensure_ascii=False).encode('utf-8')
        self.send_response(estado)
        self.send_header('Content-Type', tipo)
        self.send_header('Content-Length', str(len(datos)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-cache')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(datos)

    def cookie_sesion(self, token, borrar=False):
        partes = [f'{COOKIE}={"" if borrar else token}', 'Path=/', 'HttpOnly', 'SameSite=Strict',
                  f'Max-Age={0 if borrar else DURACION_SESION}']
        if self.https:
            partes.append('Secure')
        return {'Set-Cookie': '; '.join(partes)}

    def token(self):
        c = SimpleCookie(self.headers.get('Cookie', ''))
        return c[COOKIE].value if COOKIE in c else None

    def cuerpo(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_CUERPO:
            raise ErrorApi('Los datos son demasiado grandes.', 413)
        try:
            return json.loads(self.rfile.read(n) or b'{}')
        except json.JSONDecodeError:
            raise ErrorApi('Datos inválidos.')

    # --- GET
    def do_GET(self):
        url = urlparse(self.path)
        ruta = url.path
        try:
            if ruta.startswith('/api/'):
                return self.get_api(ruta[5:], parse_qs(url.query))
            archivo = 'index.html' if ruta in ('/', '') else ruta.lstrip('/')
            if not RUTA_ESTATICA.match(archivo) or '..' in archivo:
                return self.enviar(404, b'No encontrado', 'text/plain; charset=utf-8')
            completo = os.path.join(RAIZ_WEB, *archivo.split('/'))
            if not os.path.isfile(completo):
                return self.enviar(404, b'No encontrado', 'text/plain; charset=utf-8')
            with open(completo, 'rb') as f:
                contenido = f.read()
            self.enviar(200, contenido, MIME.get(os.path.splitext(archivo)[1], 'application/octet-stream'))
        except ErrorApi as e:
            self.enviar(e.estado, {'error': str(e)})
        except (BrokenPipeError, ConnectionResetError):
            pass

    def get_api(self, ruta, q):
        api = self.api
        yo = api.usuario_de_token(self.token())
        if ruta == 'sesion':
            return self.enviar(200, {'servidor': True, 'inicializado': api.inicializado(), 'usuario': yo})
        if not yo:
            raise ErrorApi('Tu sesión venció. Volvé a ingresar.', 401)
        if ruta == 'datos':
            try:
                anio, mes = int(q['anio'][0]), int(q['mes'][0])
            except (KeyError, ValueError):
                raise ErrorApi('Mes inválido.')
            return self.enviar(200, api.datos(yo, anio, mes))
        if ruta == 'cambios':
            desde = int((q.get('desde') or ['0'])[0])
            return self.enviar(200, {'version': api.db.esperar_cambio(desde)})
        if ruta == 'respaldo':
            if not es_jefe(yo):
                raise ErrorApi('Solo el jefe de departamento puede descargar el respaldo.', 403)
            nombre = time.strftime('ccd-respaldo-%Y%m%d-%H%M.db')
            return self.enviar(200, api.respaldo(), 'application/octet-stream',
                               {'Content-Disposition': f'attachment; filename="{nombre}"'})
        raise ErrorApi('No encontrado.', 404)

    # --- POST
    def do_POST(self):
        ruta = urlparse(self.path).path
        try:
            if not ruta.startswith('/api/'):
                raise ErrorApi('No encontrado.', 404)
            # Cabecera propia: un sitio ajeno no puede mandarla sin permiso (CORS).
            if self.headers.get('X-CCD') != '1':
                raise ErrorApi('Solicitud rechazada.', 403)
            self.post_api(ruta[5:], self.cuerpo())
        except ErrorApi as e:
            self.enviar(e.estado, {'error': str(e)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # noqa: BLE001 - se informa y se sigue atendiendo
            sys.stderr.write(f'Error en {ruta}: {e!r}\n')
            self.enviar(500, {'error': 'Error interno del servidor.'})

    def post_api(self, ruta, c):
        api = self.api
        if ruta == 'login':
            token = api.login(self.client_address[0], c)
            return self.enviar(200, {'usuario': api.usuario_de_token(token)}, extra=self.cookie_sesion(token))
        if ruta == 'inicializar':
            token = api.inicializar(c)
            return self.enviar(200, {'usuario': api.usuario_de_token(token)}, extra=self.cookie_sesion(token))
        if ruta == 'logout':
            api.logout(self.token())
            return self.enviar(200, {}, extra=self.cookie_sesion('', borrar=True))
        yo = api.usuario_de_token(self.token())
        if not yo:
            raise ErrorApi('Tu sesión venció. Volvé a ingresar.', 401)
        acciones = {
            'guardar': api.guardar, 'borrar': api.borrar, 'config': api.config, 'turno': api.turno,
            'usuario': api.usuario, 'clave': api.clave,
            'solicitudes/nueva': api.nueva_solicitud, 'solicitudes/estado': api.estado_solicitud,
            'solicitudes/aprobar': api.aprobar,
        }
        if ruta not in acciones:
            raise ErrorApi('No encontrado.', 404)
        self.enviar(200, acciones[ruta](yo, c) or {})


def main():
    ap = argparse.ArgumentParser(description='Servidor local de Turnos y Presencialidad · CCD')
    ap.add_argument('--puerto', type=int, default=8080)
    ap.add_argument('--host', default='0.0.0.0', help='0.0.0.0 = accesible desde la red local')
    ap.add_argument('--db', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'datos', 'ccd.db'))
    ap.add_argument('--cert', help='certificado PEM para servir por HTTPS')
    ap.add_argument('--key', help='clave privada PEM del certificado')
    args = ap.parse_args()

    Manejador.api = Api(Base(args.db))
    servidor = ThreadingHTTPServer((args.host, args.puerto), Manejador)
    servidor.daemon_threads = True
    esquema = 'http'
    if args.cert and args.key:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(args.cert, args.key)
        servidor.socket = ctx.wrap_socket(servidor.socket, server_side=True)
        Manejador.https = True
        esquema = 'https'
    print(f'Turnos y Presencialidad · CCD')
    print(f'  Base de datos: {os.path.abspath(args.db)}')
    print(f'  Abrí {esquema}://localhost:{args.puerto} (o la IP de esta PC desde otra máquina de la red)')
    print('  Ctrl+C para detener.')
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print('\nDetenido.')


if __name__ == '__main__':
    main()
