// Capa de datos. Expone la misma interfaz para los dos modos:
//  - demo:     localStorage, sin login (selector "Ver como").
//  - firebase: Firestore + Firebase Authentication (Google).
import { firebaseConfig, MODO_DEMO } from './config.js';

// Clave corta -> nombre de colección
const COLS = { areas: 'areas', personas: 'personas', tipos: 'tiposTurno', feriados: 'feriados' };

export const data = { areas: [], personas: [], tipos: [], feriados: [], turnos: {} };
// estado: 'cargando' | 'anonimo' | 'sin-acceso' | 'ok'
export const sesion = { estado: 'cargando', usuario: null, email: null, error: null };

let onChange = () => {};
let periodo = { anio: 0, mes: 0 };
let backend = null;

export const nuevoId = () => Math.random().toString(36).slice(2, 10);
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
export const setTurno = (persona, dia, code) => backend.setTurno(persona, dia, code);
export const login = () => backend.login();
export const logout = () => backend.logout();
export const verComo = (personaId) => backend.verComo && backend.verComo(personaId);

// ---------------------------------------------------------------
// Datos de ejemplo (solo modo demo)
// ---------------------------------------------------------------
export const TIPOS_DEFAULT = [
  { id: 'TM', label: 'Turno mañana', horario: '07 a 15 h', grupo: 'activo', color: '#1F6F63', orden: 1 },
  { id: 'TT', label: 'Turno tarde', horario: '15 a 23 h', grupo: 'activo', color: '#2E5C8A', orden: 2 },
  { id: 'TN', label: 'Turno noche', horario: '23 a 07 h', grupo: 'activo', color: '#4A3F7A', orden: 3 },
  { id: 'TP', label: 'Turno pasivo', horario: 'Guardia pasiva', grupo: 'pasivo', color: '#B8862E', orden: 4 },
  { id: 'FR', label: 'Franco', horario: '', grupo: 'ausente', color: '#6B7280', orden: 5 },
  { id: 'V', label: 'Vacaciones', horario: '', grupo: 'ausente', color: '#C06A2B', orden: 6 },
  { id: 'L', label: 'Licencia', horario: '', grupo: 'ausente', color: '#7A5C99', orden: 7 }
];

function semilla(anio, mes) {
  const areas = [
    { id: 'redes', nombre: 'Redes', orden: 1 },
    { id: 'servidores', nombre: 'Servidores', orden: 2 },
    { id: 'monitoreo', nombre: 'Monitoreo', orden: 3 }
  ];
  const P = (id, nombre, rol, areaId) => ({ id, nombre, rol, areaId, email: '' });
  const personas = [
    P('j1', 'Marta Quiroga', 'jefe', null),
    P('r1', 'Diego Ferreyra', 'coordinador', 'redes'),
    P('r2', 'Paula Benítez', 'adjunto', 'redes'),
    P('r3', 'Nicolás Roldán', 'tecnico', 'redes'),
    P('r4', 'Lucía Méndez', 'tecnico', 'redes'),
    P('r5', 'Tomás Agüero', 'tecnico', 'redes'),
    P('s1', 'Carla Sosa', 'coordinador', 'servidores'),
    P('s2', 'Hernán Vidal', 'adjunto', 'servidores'),
    P('s3', 'Julieta Paz', 'tecnico', 'servidores'),
    P('s4', 'Matías Leiva', 'tecnico', 'servidores'),
    P('m1', 'Sergio Ibarra', 'coordinador', 'monitoreo'),
    P('m2', 'Ana Cabral', 'adjunto', 'monitoreo'),
    P('m3', 'Bruno Ortiz', 'tecnico', 'monitoreo'),
    P('m4', 'Rocío Luna', 'tecnico', 'monitoreo'),
    P('m5', 'Iván Ponce', 'tecnico', 'monitoreo')
  ];
  // Rotación de ejemplo para el mes en curso
  const turnos = {};
  const dias = new Date(anio, mes, 0).getDate();
  areas.forEach(a => {
    const gente = personas.filter(p => p.areaId === a.id);
    gente.forEach((p, i) => {
      const d = {};
      for (let dia = 1; dia <= dias; dia++) {
        const dow = new Date(anio, mes - 1, dia).getDay();
        const semana = Math.floor((dia - 1) / 7);
        const finde = dow === 0 || dow === 6;
        if (semana % gente.length === i) d[dia] = 'TP';
        else if (finde) continue;
        else if ((semana + 2) % gente.length === i && semana === 1) d[dia] = 'V';
        else d[dia] = (i + semana) % 3 === 1 ? 'TT' : 'TM';
      }
      turnos[turnoId(anio, mes, p.id)] = { anio, mes, personaId: p.id, areaId: a.id, dias: d };
    });
  });
  return { areas, personas, tipos: TIPOS_DEFAULT.map(t => ({ ...t })), feriados: [], turnos };
}

// ---------------------------------------------------------------
// Backend demo (localStorage)
// ---------------------------------------------------------------
function demoBackend() {
  const KEY = 'ccd-demo-v1';
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
  if (!db) db = semilla(periodo.anio, periodo.mes);

  const persistir = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* sin storage */ } };
  const refrescar = () => {
    ['areas', 'personas', 'tipos', 'feriados'].forEach(k => { data[k] = db[k]; });
    data.turnos = {};
    Object.values(db.turnos).forEach(t => {
      if (t.anio === periodo.anio && t.mes === periodo.mes) data.turnos[t.personaId] = t.dias;
    });
    let uid = null;
    try { uid = localStorage.getItem('ccd-demo-user'); } catch (e) { /* sin storage */ }
    sesion.usuario = db.personas.find(p => p.id === uid) || db.personas.find(p => p.rol === 'jefe') || db.personas[0] || null;
    sesion.estado = 'ok';
    onChange();
  };
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
    setTurno(persona, dia, code) {
      const id = turnoId(periodo.anio, periodo.mes, persona.id);
      const t = db.turnos[id] || (db.turnos[id] = { ...periodo, personaId: persona.id, areaId: persona.areaId, dias: {} });
      if (code) t.dias[dia] = code; else delete t.dias[dia];
      persistir(); refrescar();
    },
    verComo(personaId) { try { localStorage.setItem('ccd-demo-user', personaId); } catch (e) { /* sin storage */ } refrescar(); },
    login() {}, logout() {}
  };
}

// ---------------------------------------------------------------
// Backend Firebase (Firestore + Auth con Google)
// ---------------------------------------------------------------
async function firebaseBackend() {
  const V = '10.13.0';
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`)
  ]);
  const app = initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  const auth = au.getAuth(app);
  let unsubs = [], unsubTurnos = null;
  const fallo = (e) => { sesion.error = e.message; onChange(); };

  function suscribirTurnos() {
    if (unsubTurnos) unsubTurnos();
    const q = fs.query(fs.collection(db, 'turnos'),
      fs.where('anio', '==', periodo.anio), fs.where('mes', '==', periodo.mes));
    unsubTurnos = fs.onSnapshot(q, snap => {
      data.turnos = {};
      snap.forEach(d => { data.turnos[d.data().personaId] = d.data().dias || {}; });
      onChange();
    }, fallo);
  }
  function suscribirTodo() {
    Object.entries(COLS).forEach(([k, col]) => {
      unsubs.push(fs.onSnapshot(fs.collection(db, col), snap => {
        data[k] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        onChange();
      }, fallo));
    });
    suscribirTurnos();
  }
  function cortar() {
    unsubs.forEach(u => u()); unsubs = [];
    if (unsubTurnos) { unsubTurnos(); unsubTurnos = null; }
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
    async setTurno(persona, dia, code) {
      try {
        const ref = fs.doc(db, 'turnos', turnoId(periodo.anio, periodo.mes, persona.id));
        await fs.setDoc(ref, {
          anio: periodo.anio, mes: periodo.mes, personaId: persona.id, areaId: persona.areaId,
          dias: { [dia]: code || fs.deleteField() }
        }, { merge: true });
      } catch (e) { fallo(e); }
    },
    login() { au.signInWithPopup(auth, new au.GoogleAuthProvider()).catch(fallo); },
    logout() { au.signOut(auth); }
  };
}
