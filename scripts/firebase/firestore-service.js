/**
 * HM Finanças — firestore-service.js
 * Serviço genérico de acesso ao Firestore.
 * Fornece operações CRUD padronizadas para todas as coleções do sistema.
 *
 * ESTRUTURA DAS COLEÇÕES NO FIRESTORE:
 *   /usuarios/{uid}/
 *     /promissorias/{id}
 *     /clientes/{id}
 *     /patrimonio/{id}
 *     /cartoes/{id}
 *     /configuracoes/dados   (documento único por usuário)
 *
 * REGRA DE SEGURANÇA:
 *   Cada usuário só acessa os dados sob seu próprio UID.
 *   As Firestore Security Rules devem reforçar isso no console do Firebase.
 *
 * PADRÃO DE RETORNO:
 *   Todas as funções retornam { sucesso: boolean, dados?: any, erro?: string }
 */

'use strict';

import { db, auth } from './firebase-init.js';
import { 
  collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const FirestoreService = {

  /* ─── REFERÊNCIA À COLEÇÃO DO USUÁRIO ────────────────────────────────── */

  /**
   * Retorna a referência à coleção de um módulo do usuário atual.
   * Exemplo: colecaoDoUsuario('promissorias') → /usuarios/{uid}/promissorias
   *
   * @param {string} colecao - Nome da coleção (ex: 'promissorias')
   * @returns {firebase.firestore.CollectionReference | null}
   */
  colecaoDoUsuario(colecaoNome) {
    const uid = auth?.currentUser?.uid;

    if (!db)  { console.warn('[Firestore] Banco não inicializado.'); return null; }
    if (!uid) { console.warn('[Firestore] Usuário não autenticado.'); return null; }

    return collection(db, 'usuarios', uid, colecaoNome);
  },

  /* ─── CRIAR DOCUMENTO ────────────────────────────────────────────────── */

  /**
   * Cria um novo documento em uma coleção.
   * O ID é gerado automaticamente pelo Firestore.
   * Adiciona timestamps de criação e atualização automaticamente.
   *
   * @param {string} colecao - Nome da coleção
   * @param {Object} dados - Dados do documento
   * @returns {Promise<{ sucesso: boolean, id?: string, erro?: string }>}
   */
  async criar(colecaoNome, dados) {
    const ref = this.colecaoDoUsuario(colecaoNome);
    if (!ref) return { sucesso: false, erro: 'Serviço indisponível.' };

    try {
      const agora = serverTimestamp();
      const docRef = await addDoc(ref, {
        ...dados,
        criadoEm:      agora,
        atualizadoEm:  agora,
      });
      return { sucesso: true, id: docRef.id };

    } catch (erro) {
      console.error(`[Firestore] Erro ao criar em "${colecaoNome}":`, erro);
      return { sucesso: false, erro: 'Não foi possível salvar os dados.' };
    }
  },

  /* ─── LER TODOS OS DOCUMENTOS ────────────────────────────────────────── */

  /**
   * Retorna todos os documentos de uma coleção.
   * Suporta ordenação e limite opcionais.
   *
   * @param {string} colecao - Nome da coleção
   * @param {Object} [opcoes]
   * @param {string} [opcoes.ordenarPor='criadoEm'] - Campo de ordenação
   * @param {'asc' | 'desc'} [opcoes.direcao='desc'] - Direção da ordenação
   * @param {number} [opcoes.limite] - Número máximo de documentos
   * @returns {Promise<{ sucesso: boolean, dados?: Object[], erro?: string }>}
   */
  async listar(colecaoNome, opcoes = {}) {
    const ref = this.colecaoDoUsuario(colecaoNome);
    if (!ref) return { sucesso: false, erro: 'Serviço indisponível.' };

    try {
      const { ordenarPor = 'criadoEm', direcao = 'desc', maxLimite } = opcoes;
      const restricoes = [orderBy(ordenarPor, direcao)];
      if (maxLimite) restricoes.push(limit(maxLimite));

      const q = query(ref, ...restricoes);
      const snapshot = await getDocs(q);
      const dados = snapshot.docs.map(documento => ({ id: documento.id, ...documento.data() }));
      return { sucesso: true, dados };

    } catch (erro) {
      console.error(`[Firestore] Erro ao listar "${colecaoNome}":`, erro);
      return { sucesso: false, erro: 'Não foi possível carregar os dados.' };
    }
  },

  /* ─── LER UM DOCUMENTO ───────────────────────────────────────────────── */

  /**
   * Retorna um documento específico pelo ID.
   *
   * @param {string} colecao
   * @param {string} id - ID do documento
   * @returns {Promise<{ sucesso: boolean, dados?: Object, erro?: string }>}
   */
  async obter(colecaoNome, id) {
    const ref = this.colecaoDoUsuario(colecaoNome);
    if (!ref) return { sucesso: false, erro: 'Serviço indisponível.' };

    try {
      const docRef = doc(ref, id);
      const documento = await getDoc(docRef);
      if (!documento.exists()) return { sucesso: false, erro: 'Documento não encontrado.' };
      return { sucesso: true, dados: { id: documento.id, ...documento.data() } };

    } catch (erro) {
      console.error(`[Firestore] Erro ao obter "${colecaoNome}/${id}":`, erro);
      return { sucesso: false, erro: 'Não foi possível carregar o documento.' };
    }
  },

  /* ─── ATUALIZAR DOCUMENTO ────────────────────────────────────────────── */

  /**
   * Atualiza campos de um documento existente (merge parcial).
   * Falha se o documento não existir.
   *
   * @param {string} colecaoNome
   * @param {string} id - ID do documento
   * @param {Object} dados - Campos a atualizar
   * @returns {Promise<{ sucesso: boolean, erro?: string }>}
   */
  async atualizar(colecaoNome, id, dados) {
    const ref = this.colecaoDoUsuario(colecaoNome);
    if (!ref) return { sucesso: false, erro: 'Serviço indisponível.' };

    try {
      const docRef = doc(ref, id);
      await updateDoc(docRef, {
        ...dados,
        atualizadoEm: serverTimestamp(),
      });
      return { sucesso: true };

    } catch (erro) {
      console.error(`[Firestore] Erro ao atualizar "${colecaoNome}/${id}":`, erro);
      return { sucesso: false, erro: 'Não foi possível atualizar os dados.' };
    }
  },

  /* ─── SALVAR / DEFINIR DOCUMENTO ─────────────────────────────────────── */

  /**
   * Salva um documento com ID específico. Se não existir, é criado.
   * Se já existir, é mesclado com os dados existentes (merge: true).
   * Útil para configurações únicas, ex: usuarios/{uid}/patrimonio/resumo
   *
   * @param {string} colecaoNome
   * @param {string} id - ID específico do documento
   * @param {Object} dados - Dados a salvar
   * @returns {Promise<{ sucesso: boolean, erro?: string }>}
   */
  async salvar(colecaoNome, id, dados) {
    const ref = this.colecaoDoUsuario(colecaoNome);
    if (!ref) return { sucesso: false, erro: 'Serviço indisponível.' };

    try {
      const docRef = doc(ref, id);
      await setDoc(docRef, {
        ...dados,
        atualizadoEm: serverTimestamp(),
      }, { merge: true });

      // Interceptador: Se for atualização do patrimônio, salva também no histórico mensal
      if (colecaoNome === 'patrimonio' && id === 'resumo') {
        const hoje = new Date();
        const mesAno = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        const refHistorico = this.colecaoDoUsuario('patrimonio_historico');
        if (refHistorico) {
          const docHistorico = doc(refHistorico, mesAno);
          await setDoc(docHistorico, {
            ...dados,
            mesAno,
            atualizadoEm: serverTimestamp()
          }, { merge: true });
        }
      }

      return { sucesso: true };

    } catch (erro) {
      console.error(`[Firestore] Erro ao salvar "${colecaoNome}/${id}":`, erro);
      return { sucesso: false, erro: 'Não foi possível salvar os dados.' };
    }
  },

  /* ─── EXCLUIR DOCUMENTO ──────────────────────────────────────────────── */

  /**
   * Exclui um documento pelo ID.
   * ATENÇÃO: Operação irreversível. Confirmar com o usuário antes de chamar.
   *
   * @param {string} colecao
   * @param {string} id - ID do documento
   * @returns {Promise<{ sucesso: boolean, erro?: string }>}
   */
  async excluir(colecaoNome, id) {
    const ref = this.colecaoDoUsuario(colecaoNome);
    if (!ref) return { sucesso: false, erro: 'Serviço indisponível.' };

    try {
      const docRef = doc(ref, id);
      await deleteDoc(docRef);
      return { sucesso: true };

    } catch (erro) {
      console.error(`[Firestore] Erro ao excluir "${colecaoNome}/${id}":`, erro);
      return { sucesso: false, erro: 'Não foi possível excluir o documento.' };
    }
  },

  /* ─── ESCUTA EM TEMPO REAL ───────────────────────────────────────────── */

  /**
   * Registra um listener em tempo real para uma coleção.
   * Chamado sempre que algum documento da coleção for modificado.
   *
   * @param {string} colecao
   * @param {function(Object[]): void} callback - Função chamada com os dados atualizados
   * @param {Object} [opcoes] - Mesmas opções do método listar()
   * @param {function(Error): void} [onErro] - Callback opcional chamado em caso de erro no listener
   * @returns {function} Função para cancelar o listener (unsubscribe)
   */
  escutar(colecaoNome, callback, opcoes = {}, onErro = null) {
    const ref = this.colecaoDoUsuario(colecaoNome);
    if (!ref) return () => {};

    const { ordenarPor = 'criadoEm', direcao = 'desc', maxLimite } = opcoes;
    const restricoes = [orderBy(ordenarPor, direcao)];
    if (maxLimite) restricoes.push(limit(maxLimite));

    const q = query(ref, ...restricoes);

    return onSnapshot(q, 
      (snapshot) => {
        const dados = snapshot.docs.map(documento => ({ id: documento.id, ...documento.data() }));
        callback(dados);
      },
      (erro) => {
        console.error(`[Firestore] Erro no listener de "${colecaoNome}":`, erro);
        if (typeof onErro === 'function') onErro(erro);
      }
    );
  },
};
