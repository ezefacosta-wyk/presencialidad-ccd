// Capa de datos. Expone la misma interfaz para los dos modos:
//  - demo:     localStorage, sin login (selector "Ver como").
//  - firebase: Firestore + Firebase Authentication (Google).
import { firebaseConfig, MODO_DEMO } from './config.js';
import { TIPOS_DEFAULT, CONFIG_DEFAULT } from './defaults.js';

// Clave corta -> nombre de colección
const COLS = { areas: 'areas', personas: 'personas', tipos: 'tiposTurno', feriados: 'feriados' };

export const data = {
  areas: [], personas: [], tipos: [], feriados: [],
  config: { ...CONFIG_DEFAULT },
  turnos: {},     // mes en pantalla:  { personaId: { "5": "B", ... } }
  turnosSig: {},  // mes siguiente (para las columnas extra de la planilla)
  solicitudes: [] // pedidos de cambio de turno
};
// estado: 'cargando' | 'anonimo' | 'sin-acceso' | 'ok'
export const sesion = { estado: 'cargando', usuario: null, email: null, error: null };

let onChange = () => {};
let periodo = { anio: 0, mes: 0 };
let backend = null;

export const nuevoId = () => Math.random().toString(36).slice(2, 10);
export const mesSiguiente = (anio, mes) => (mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 });
export const CLAVE_DEMO = 'demo1234';
const turnoId = (anio, mes, personaId) => `${anio}_${String(mes).padStart(2, '0')}_${personaId}`;

export async function iniciar(cb, anio, mes) {
  onChange = cb;
  periodo = { anio, mes };
  backend = MODO_DEMO ? demoBackend() : await firebaseBackend();
  backend.iniciar();
}
export function setPeriodo(anio, mes) { periodo = { anio, mes }; backend.periodo(); }
export const guardar = (col, id, obj) => backend.guardar(col, id || nuevoId(), obj);
export const borrar = (col, id) => backend.borrar(col, id);
export const guardarConfig = (obj) => backend.guardarConfig(obj);
// anio/mes explícitos: la planilla también edita los primeros días del mes siguiente.
export const setTurno = (persona, anio, mes, dia, code) => backend.setTurno(persona, anio, mes, dia, code);
// Cuentas. Todas devuelven una promesa con un mensaje de error o null.
export const login = (email, clave) => backend.login(email, clave);
export const loginGoogle = () => backend.loginGoogle && backend.loginGoogle();
export const logout = () => backend.logout();
export const recuperarClave = (email) => backend.recuperarClave(email);
export const cambiarClave = (nueva) => backend.cambiarClave(nueva);
export const crearUsuario = (persona, email, clave) => backend.crearUsuario(persona, email, clave);
// Cambios de turno
export const crearSolicitud = (obj) => backend.guardarSolicitud(nuevoId(), obj);
export const actualizarSolicitud = (id, cambios) => backend.guardarSolicitud(id, cambios);
export const aprobarSolicitud = (sol, cambios) => backend.aprobarSolicitud(sol, cambios);
export const vaciarDemo = () => backend.vaciar && backend.vaciar();
export const verComo = (personaId) => backend.verComo && backend.verComo(personaId);

// ---------------------------------------------------------------
// Datos de ejemplo (solo modo demo). Nombres inventados.
// ---------------------------------------------------------------
function semilla(anio, mes) {
  const areas = [
    { id: 'noc', nombre: 'NOC', etiqueta: 'NOC TURNO TEC/OP.', orden: 1 },
    { id: 'redes', nombre: 'Redes', etiqueta: '', orden: 2 },
    { id: 'servidores', nombre: 'Servidores', etiqueta: '', orden: 3 },
    { id: 'monitoreo', nombre: 'Monitoreo', etiqueta: '', orden: 4 }
  ];
  const P = (id, nombre, rol, areaId) => ({ id, nombre, rol, areaId, email: emailDemo(nombre) });
  const personas = [
    P('j1', 'QUIROGA, Marta', 'jefe', null),
    P('n1', 'ALMADA, Rubén', 'tecnico', 'noc'),
    P('n2', 'BAIGORRIA, Elsa', 'tecnico', 'noc'),
    P('n3', 'CORVALÁN, Darío', 'tecnico', 'noc'),
    P('n4', 'DOMÍNGUEZ, Inés', 'tecnico', 'noc'),
    P('n5', 'ESCOBAR, Fabián', 'tecnico', 'noc'),
    P('n6', 'FUNES, Graciela', 'tecnico', 'noc'),
    P('r1', 'FERREYRA, Diego', 'coordinador', 'redes'),
    P('r2', 'BENÍTEZ, Paula', 'adjunto', 'redes'),
    P('r3', 'ROLDÁN, Nicolás', 'tecnico', 'redes'),
    P('r4', 'MÉNDEZ, Lucía', 'tecnico', 'redes'),
    P('s1', 'SOSA, Carla', 'coordinador', 'servidores'),
    P('s2', 'VIDAL, Hernán', 'adjunto', 'servidores'),
    P('s3', 'PAZ, Julieta', 'tecnico', 'servidores'),
    P('m1', 'IBARRA, Sergio', 'coordinador', 'monitoreo'),
    P('m2', 'CABRAL, Ana', 'adjunto', 'monitoreo'),
    P('m3', 'ORTIZ, Bruno', 'tecnico', 'monitoreo'),
    P('m4', 'LUNA, Rocío', 'tecnico', 'monitoreo')
  ];
  const feriados = [
    { id: '2026-11-23', anio: 2026, mes: 11, dia: 23, nombre: 'Feriado trasladable — Día de la Soberanía Nacional (20/11).' },
    { id: '2026-12-8', anio: 2026, mes: 12, dia: 8, nombre: 'Inmaculada Concepción de María.' },
    { id: '2026-12-25', anio: 2026, mes: 12, dia: 25, nombre: 'Navidad.' }
  ];
  const turnos = {};
  const sig = mesSiguiente(anio, mes);
  [[anio, mes], [sig.anio, sig.mes]].forEach(([a, m]) => rotacion(a, m, personas, feriados, turnos));
  const claves = Object.fromEntries(personas.map(p => [p.email, CLAVE_DEMO]));
  const db = { areas, personas, tipos: TIPOS_DEFAULT.map(t => ({ ...t })), feriados, config: { ...CONFIG_DEFAULT }, turnos, claves, solicitudes: [] };
  solicitudesEjemplo(db);
  return db;
}
const emailDemo = (nombre) => nombre.split(',')[0].normalize('NFD').replace(/[^A-Za-z]/g, '').toLowerCase() + '@ccd.demo';

// Algunas solicitudes para mostrar el circuito completo
function solicitudesEjemplo(db) {
  const cod = (pid, a, m, d) => ((Object.values(db.turnos).find(t => t.personaId === pid && t.anio === a && t.mes === m) || {}).dias || {})[d] || null;
  const fechas = [];
  const h = new Date(); h.setHours(0, 0, 0, 0);
  for (let i = 4; i < 45; i++) { const f = new Date(h); f.setDate(h.getDate() + i); fechas.push(f); }
  const buscar = (deId, paraId, saltar = 0) => {
    const ok = fechas.filter(f => {
      const a = f.getFullYear(), m = f.getMonth() + 1, d = f.getDate();
      const x = cod(deId, a, m, d), y = cod(paraId, a, m, d);
      return x !== y && x !== null && y !== null && db.turnos[turnoId(a, m, deId)];
    });
    const f = ok[saltar];
    if (!f) return null;
    const a = f.getFullYear(), m = f.getMonth() + 1, d = f.getDate();
    return [{ anio: a, mes: m, dia: d, de: cod(deId, a, m, d), para: cod(paraId, a, m, d) }];
  };
  const ahora = Date.now();
  [
    ['r3', 'r4', 'aceptada', 'Turno médico programado.', 0],
    ['m3', 'm4', 'pendiente', 'Trámite personal.', 1],
    ['s3', 'r3', 'pendiente', '', 2]
  ].forEach(([de, para, estado, motivo, k]) => {
    const dias = buscar(de, para, k);
    if (dias) db.solicitudes.push({ id: 'ej' + k, deId: de, paraId: para, dias, motivo, estado, creada: ahora - (k + 1) * 36e5, respondida: estado === 'aceptada' ? ahora - 18e5 : null });
  });
}

// Rotación de ejemplo parecida a la planilla: el NOC rota A/C cada 3 días,
// el resto hace B de lunes a viernes con pasivos (PCS/PCF técnicos,
// PAS/PAF adjuntos) repartidos en rueda.
function rotacion(anio, mes, personas, feriados, turnos) {
  const dias = new Date(anio, mes, 0).getDate();
  const base = Math.floor(Date.UTC(anio, mes - 1, 1) / 864e5);
  const esFeriado = (d) => feriados.some(f => f.anio === anio && f.mes === mes && f.dia === d);
  const noc = personas.filter(p => p.areaId === 'noc');
  const tec = personas.filter(p => p.rol === 'tecnico' && p.areaId !== 'noc');
  const adj = personas.filter(p => p.rol === 'adjunto');
  const out = Object.fromEntries(personas.map(p => [p.id, {}]));
  for (let d = 1; d <= dias; d++) {
    const n = base + d - 1;
    const dow = new Date(anio, mes - 1, d).getDay();
    const finde = dow === 0 || dow === 6;
    noc.forEach((p, i) => { if ((n + i) % 3 === 0) out[p.id][d] = i < 3 ? 'A' : 'C'; });
    personas.filter(p => p.areaId !== 'noc').forEach(p => { if (!finde && !esFeriado(d)) out[p.id][d] = 'B'; });
    if (!finde) {
      out[tec[n % tec.length].id][d] = 'PCS';
      out[adj[n % adj.length].id][d] = 'PAS';
    } else {
      out[tec[(n + 2) % tec.length].id][d] = 'PCF';
      out[adj[(n + 1) % adj.length].id][d] = 'PAF';
    }
  }
  // Algunas vacaciones para que se vea variedad
  const vac = (id, desde, hasta) => { for (let d = desde; d <= Math.min(hasta, dias); d++) out[id][d] = 'V'; };
  if (mes % 2 === 1) { vac('n4', 16, 22); vac('m4', 23, dias); } else { vac('r4', 9, 13); vac('n2', 1, 4); }
  personas.forEach(p => {
    turnos[turnoId(anio, mes, p.id)] = { anio, mes, personaId: p.id, areaId: p.areaId, dias: out[p.id] };
  });
}

const CAMBIO_DESACTUALIZADO = 'La planilla cambió desde que se pidió el cambio: alguno de los dos ya no tiene el turno que figura en la solicitud. Denegala y que se pida de nuevo.';

const ERRORES_AUTH = {
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/wrong-password': 'Email o contraseña incorrectos.',
  'auth/user-not-found': 'Email o contraseña incorrectos.',
  'auth/invalid-email': 'El email no es válido.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos y probá de nuevo.',
  'auth/requires-recent-login': 'Por seguridad, salí y volvé a ingresar antes de cambiar la contraseña.',
  'auth/operation-not-allowed': 'Falta habilitar el ingreso con email y contraseña en Firebase Authentication.',
  'auth/popup-closed-by-user': null
};
const mensajeAuth = (e) => (e && e.code in ERRORES_AUTH) ? ERRORES_AUTH[e.code] : (e && e.message) || 'Error desconocido.';

// ---------------------------------------------------------------
// Backend demo (localStorage)
// ---------------------------------------------------------------
function demoBackend() {
  const KEY = 'ccd-demo-v4';
  let db = null;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* sin storage */ }
  if (!db) db = semilla(periodo.anio, periodo.mes);

  const persistir = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* sin storage */ } };
  const delMes = (a, m) => {
    const r = {};
    Object.values(db.turnos).forEach(t => { if (t.anio === a && t.mes === m) r[t.personaId] = t.dias; });
    return r;
  };
  const refrescar = () => {
    ['areas', 'personas', 'tipos', 'feriados', 'solicitudes'].forEach(k => { data[k] = db[k] || []; });
    data.config = { ...CONFIG_DEFAULT, ...(db.config || {}) };
    const sig = mesSiguiente(periodo.anio, periodo.mes);
    data.turnos = delMes(periodo.anio, periodo.mes);
    data.turnosSig = delMes(sig.anio, sig.mes);
    let uid = null;
    try { uid = localStorage.getItem('ccd-demo-user'); } catch (e) { /* sin storage */ }
    sesion.usuario = uid === SALIO ? null : db.personas.find(p => p.id === uid) || db.personas.find(p => p.rol === 'jefe') || db.personas[0] || null;
    sesion.email = sesion.usuario ? sesion.usuario.email : null;
    sesion.estado = sesion.usuario ? 'ok' : 'anonimo';
    onChange();
  };
  const SALIO = '__salio__';
  const usuario = (id) => { try { localStorage.setItem('ccd-demo-user', id); } catch (e) { /* sin storage */ } };
  if (!db.claves) db.claves = {};
  if (!db.solicitudes) db.solicitudes = [];
  return {
    iniciar() { persistir(); refrescar(); },
    periodo: refrescar,
    guardar(col, id, obj) {
      const i = db[col].findIndex(x => x.id === id);
      if (i >= 0) db[col][i] = { ...db[col][i], ...obj }; else db[col].push({ id, ...obj });
      if (col === 'personas') Object.values(db.turnos).forEach(t => { if (t.personaId === id) t.areaId = obj.areaId; });
      persistir(); refrescar();
    },
    borrar(col, id) {
      db[col] = db[col].filter(x => x.id !== id);
      if (col === 'personas') Object.keys(db.turnos).forEach(k => { if (db.turnos[k].personaId === id) delete db.turnos[k]; });
      persistir(); refrescar();
    },
    guardarConfig(obj) { db.config = { ...(db.config || {}), ...obj }; persistir(); refrescar(); },
    setTurno(persona, anio, mes, dia, code) {
      const id = turnoId(anio, mes, persona.id);
      const t = db.turnos[id] || (db.turnos[id] = { anio, mes, personaId: persona.id, areaId: persona.areaId, dias: {} });
      if (code) t.dias[dia] = code; else delete t.dias[dia];
      persistir(); refrescar();
    },
    vaciar() {
      db = {
        areas: [], feriados: db.feriados, turnos: {}, tipos: db.tipos, config: db.config, solicitudes: [],
        personas: [{ id: 'jefe', nombre: 'JEFE, de departamento', rol: 'jefe', areaId: null, email: 'jefe@ccd.demo' }],
        claves: { 'jefe@ccd.demo': CLAVE_DEMO }
      };
      try { localStorage.removeItem('ccd-demo-user'); } catch (e) { /* sin storage */ }
      persistir(); refrescar();
    },
    verComo(personaId) { usuario(personaId); refrescar(); },
    async login(email, clave) {
      email = (email || '').trim().toLowerCase();
      const p = db.personas.find(x => x.email === email);
      if (!p || db.claves[email] !== clave) return 'Email o contraseña incorrectos.';
      usuario(p.id); refrescar(); return null;
    },
    logout() { usuario(SALIO); refrescar(); },
    async recuperarClave() { return `En el modo demo todas las cuentas de ejemplo usan la contraseña ${CLAVE_DEMO}.`; },
    async cambiarClave(nueva) {
      if (!nueva || nueva.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
      db.claves[sesion.usuario.email] = nueva; persistir(); return null;
    },
    async crearUsuario(persona, email, clave) {
      email = (email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return 'El email no es válido.';
      if (db.personas.some(x => x.email === email && x.id !== persona.id)) return 'Ese email ya lo usa otra persona.';
      if (clave && clave.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
      const p = db.personas.find(x => x.id === persona.id);
      if (p.email && p.email !== email) delete db.claves[p.email];
      p.email = email;
      if (clave) db.claves[email] = clave;
      persistir(); refrescar(); return null;
    },
    async guardarSolicitud(id, obj) {
      const i = db.solicitudes.findIndex(x => x.id === id);
      if (i >= 0) db.solicitudes[i] = { ...db.solicitudes[i], ...obj }; else db.solicitudes.push({ id, ...obj });
      persistir(); refrescar(); return null;
    },
    async aprobarSolicitud(sol, cambios) {
      const pers = [sol.deId, sol.paraId].map(id => db.personas.find(p => p.id === id));
      if (pers.some(p => !p)) return 'Una de las personas ya no está en el sistema.';
      const leer = (p, d) => ((db.turnos[turnoId(d.anio, d.mes, p.id)] || {}).dias || {})[d.dia] || null;
      if (sol.dias.some(d => leer(pers[0], d) !== d.de || leer(pers[1], d) !== d.para)) return CAMBIO_DESACTUALIZADO;
      sol.dias.forEach(d => {
        [[pers[0], d.para], [pers[1], d.de]].forEach(([p, code]) => {
          const id = turnoId(d.anio, d.mes, p.id);
          const t = db.turnos[id] || (db.turnos[id] = { anio: d.anio, mes: d.mes, personaId: p.id, areaId: p.areaId, dias: {} });
          if (code) t.dias[d.dia] = code; else delete t.dias[d.dia];
        });
      });
      Object.assign(db.solicitudes.find(x => x.id === sol.id), cambios);
      persistir(); refrescar(); return null;
    }
  };
}

// ---------------------------------------------------------------
// Backend Firebase (Firestore + Auth con Google)
// ---------------------------------------------------------------
async function firebaseBackend() {
  const V = '10.13.0';
  const [{ initializeApp, deleteApp }, fs, au] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`)
  ]);
  const app = initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  const auth = au.getAuth(app);
  let unsubs = [], unsubTurnos = [];
  const fallo = (e) => { sesion.error = e.message; onChange(); };

  function suscribirTurnos() {
    unsubTurnos.forEach(u => u());
    const sig = mesSiguiente(periodo.anio, periodo.mes);
    unsubTurnos = [['turnos', periodo], ['turnosSig', sig]].map(([clave, p]) => {
      const q = fs.query(fs.collection(db, 'turnos'), fs.where('anio', '==', p.anio), fs.where('mes', '==', p.mes));
      return fs.onSnapshot(q, snap => {
        const r = {};
        snap.forEach(d => { r[d.data().personaId] = d.data().dias || {}; });
        data[clave] = r;
        onChange();
      }, fallo);
    });
  }
  function suscribirTodo() {
    Object.entries(COLS).forEach(([k, col]) => {
      unsubs.push(fs.onSnapshot(fs.collection(db, col), snap => {
        data[k] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        onChange();
      }, fallo));
    });
    unsubs.push(fs.onSnapshot(fs.collection(db, 'solicitudes'), snap => {
      data.solicitudes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onChange();
    }, fallo));
    unsubs.push(fs.onSnapshot(fs.doc(db, 'config', 'planilla'), snap => {
      data.config = { ...CONFIG_DEFAULT, ...(snap.exists() ? snap.data() : {}) };
      onChange();
    }, fallo));
    suscribirTurnos();
  }
  function cortar() {
    unsubs.forEach(u => u()); unsubs = [];
    unsubTurnos.forEach(u => u()); unsubTurnos = [];
  }

  return {
    iniciar() {
      au.onAuthStateChanged(auth, async (user) => {
        cortar();
        if (!user) { sesion.estado = 'anonimo'; sesion.usuario = null; onChange(); return; }
        sesion.email = (user.email || '').toLowerCase();
        try {
          const snap = await fs.getDoc(fs.doc(db, 'usuarios', sesion.email));
          if (!snap.exists()) { sesion.estado = 'sin-acceso'; onChange(); return; }
          const u = snap.data();
          sesion.usuario = { id: u.personaId || null, nombre: u.nombre || user.displayName || sesion.email, rol: u.rol, areaId: u.areaId || null };
          sesion.estado = 'ok';
          suscribirTodo();
        } catch (e) { sesion.estado = 'sin-acceso'; sesion.error = e.message; }
        onChange();
      });
    },
    periodo: suscribirTurnos,
    async guardar(col, id, obj) {
      try {
        const batch = fs.writeBatch(db);
        batch.set(fs.doc(db, COLS[col], id), obj, { merge: true });
        if (col === 'personas') {
          // Espejo en /usuarios/{email}: es lo que leen las reglas de seguridad.
          const previa = data.personas.find(p => p.id === id);
          const email = (obj.email || '').toLowerCase();
          if (previa && previa.email && previa.email !== email) batch.delete(fs.doc(db, 'usuarios', previa.email));
          if (email) batch.set(fs.doc(db, 'usuarios', email), { personaId: id, nombre: obj.nombre, rol: obj.rol, areaId: obj.areaId || null });
        }
        await batch.commit();
      } catch (e) { fallo(e); }
    },
    async borrar(col, id) {
      try {
        const batch = fs.writeBatch(db);
        batch.delete(fs.doc(db, COLS[col], id));
        if (col === 'personas') {
          const p = data.personas.find(x => x.id === id);
          if (p && p.email) batch.delete(fs.doc(db, 'usuarios', p.email));
        }
        await batch.commit();
      } catch (e) { fallo(e); }
    },
    async guardarConfig(obj) {
      try { await fs.setDoc(fs.doc(db, 'config', 'planilla'), obj, { merge: true }); } catch (e) { fallo(e); }
    },
    async setTurno(persona, anio, mes, dia, code) {
      try {
        const ref = fs.doc(db, 'turnos', turnoId(anio, mes, persona.id));
        await fs.setDoc(ref, {
          anio, mes, personaId: persona.id, areaId: persona.areaId,
          dias: { [dia]: code || fs.deleteField() }
        }, { merge: true });
      } catch (e) { fallo(e); }
    },
    async login(email, clave) {
      try { await au.signInWithEmailAndPassword(auth, (email || '').trim().toLowerCase(), clave); return null; }
      catch (e) { return mensajeAuth(e); }
    },
    async loginGoogle() {
      try { await au.signInWithPopup(auth, new au.GoogleAuthProvider()); return null; }
      catch (e) { return mensajeAuth(e); }
    },
    logout() { au.signOut(auth); },
    async recuperarClave(email) {
      try { await au.sendPasswordResetEmail(auth, (email || '').trim().toLowerCase()); return null; }
      catch (e) { return mensajeAuth(e); }
    },
    async cambiarClave(nueva) {
      try { await au.updatePassword(auth.currentUser, nueva); return null; }
      catch (e) { return mensajeAuth(e); }
    },
    // Crea la cuenta con una instancia secundaria de Firebase para no cerrar
    // la sesión de quien la está creando.
    async crearUsuario(persona, email, clave) {
      email = (email || '').trim().toLowerCase();
      if (clave) {
        const app2 = initializeApp(firebaseConfig, 'alta-' + Date.now());
        try {
          const a2 = au.getAuth(app2);
          await au.createUserWithEmailAndPassword(a2, email, clave);
          await au.signOut(a2);
        } catch (e) {
          if (e.code !== 'auth/email-already-in-use') return mensajeAuth(e);
        } finally { deleteApp(app2); }
      }
      const { id, ...resto } = persona;
      await this.guardar('personas', id, { ...resto, email });
      return null;
    },
    async guardarSolicitud(id, obj) {
      try { await fs.setDoc(fs.doc(db, 'solicitudes', id), obj, { merge: true }); return null; }
      catch (e) { return e.message; }
    },
    // Aplica el intercambio en la planilla y marca la solicitud como aprobada,
    // todo junto, verificando que los turnos no hayan cambiado.
    async aprobarSolicitud(sol, cambios) {
      const pers = [sol.deId, sol.paraId].map(id => data.personas.find(p => p.id === id));
      if (pers.some(p => !p)) return 'Una de las personas ya no está en el sistema.';
      try {
        return await fs.runTransaction(db, async (tx) => {
          const refs = {};
          sol.dias.forEach(d => pers.forEach(p => { const k = turnoId(d.anio, d.mes, p.id); refs[k] = fs.doc(db, 'turnos', k); }));
          const snaps = {};
          for (const [k, ref] of Object.entries(refs)) snaps[k] = await tx.get(ref);
          const leer = (p, d) => { const sn = snaps[turnoId(d.anio, d.mes, p.id)]; return sn.exists() ? ((sn.data().dias || {})[d.dia] || null) : null; };
          if (sol.dias.some(d => leer(pers[0], d) !== d.de || leer(pers[1], d) !== d.para)) return CAMBIO_DESACTUALIZADO;
          sol.dias.forEach(d => {
            [[pers[0], d.para], [pers[1], d.de]].forEach(([p, code]) => {
              tx.set(refs[turnoId(d.anio, d.mes, p.id)], {
                anio: d.anio, mes: d.mes, personaId: p.id, areaId: p.areaId,
                dias: { [d.dia]: code || fs.deleteField() }
              }, { merge: true });
            });
          });
          tx.update(fs.doc(db, 'solicitudes', sol.id), cambios);
          return null;
        });
      } catch (e) { return e.message; }
    }
  };
}
