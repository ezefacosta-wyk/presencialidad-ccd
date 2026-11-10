// ============================================================
// CONFIGURACION
// ============================================================
// Mientras firebaseConfig.apiKey esté vacío, la web funciona en MODO DEMO:
// los datos se guardan solo en este navegador (localStorage) y arriba a la
// derecha aparece un selector "Ver como" para probar cada rol.
//
// Para pasar a producción, pegá acá el firebaseConfig de tu proyecto de
// Firebase (ver README.md, sección "Pasar a Firebase").
// ============================================================

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const MODO_DEMO = !firebaseConfig.apiKey;

// Nombre que se muestra en el encabezado.
export const NOMBRE_SISTEMA = "Turnos y Presencialidad · CCD";
