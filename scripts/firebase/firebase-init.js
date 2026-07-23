/**
 * HM Finanças — firebase-init.js
 * Inicializa o Firebase com a configuração fornecida em firebase-config.js.
 * Expõe as instâncias de Auth e Firestore exportando-as.
 */

'use strict';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

let app, auth, db;

/**
 * Inicializa o app Firebase e exporta as instâncias de serviços.
 *
 * @returns {{ auth: import("firebase/auth").Auth, db: import("firebase/firestore").Firestore } | null}
 */
export function inicializarFirebase() {
  try {
    if (!firebaseConfig) {
      throw new Error('Configuração do Firebase não encontrada.');
    }

    if (!app) {
      app = initializeApp(firebaseConfig);
      console.log('[Firebase] App inicializado com sucesso.');
    }

    if (!auth) auth = getAuth(app);
    if (!db) {
      db = getFirestore(app);
      
      // Configurações do Firestore - persistência offline
      enableMultiTabIndexedDbPersistence(db)
        .then(() => console.log('[Firestore] Persistência local habilitada.'))
        .catch(err => {
          if (err.code === 'failed-precondition') {
            console.warn('[Firestore] Persistência indisponível: múltiplas abas abertas.');
          } else if (err.code === 'unimplemented') {
            console.warn('[Firestore] Persistência não suportada neste navegador.');
          }
        });
    }

    return { auth, db };
  } catch (erro) {
    console.error('[Firebase] Falha na inicialização:', erro.message);
    return null;
  }
}

export { auth, db };
