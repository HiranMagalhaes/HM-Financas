/**
 * HM Finanças — auth-service.js
 * Serviço de autenticação via Firebase Auth (e-mail e senha).
 * Centraliza todas as operações de login, logout e recuperação de senha.
 */

'use strict';

import { auth } from './firebase-init.js';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged,
  updateProfile,
  deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export const AuthService = {

  /* ─── ESTADO DO USUÁRIO ATUAL ─────────────────────────────────────────── */

  obterUsuarioAtual() {
    return auth ? auth.currentUser : null;
  },

  observarEstadoAuth(callback) {
    if (!auth) {
      console.warn('[AuthService] Firebase Auth não inicializado.');
      return () => {};
    }
    return onAuthStateChanged(auth, callback);
  },

  async verificarSessaoInicial() {
    if (!auth) return null;

    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe(); 
        resolve(user);
      });
    });
  },

  /* ─── LOGIN ───────────────────────────────────────────────────────────── */

  async login(email, senha) {
    if (!auth) return { sucesso: false, erro: 'Serviço de autenticação indisponível.' };

    try {
      const resultado = await signInWithEmailAndPassword(auth, email, senha);
      console.log('[AuthService] Login realizado:', resultado.user.email);
      return { sucesso: true, usuario: resultado.user };

    } catch (erro) {
      const mensagem = this._traduzirErroAuth(erro.code);
      console.error('[AuthService] Erro no login:', erro.code);
      return { sucesso: false, erro: mensagem };
    }
  },

  /* ─── CADASTRO ────────────────────────────────────────────────────────── */

  async criarConta(email, senha) {
    if (!auth) return { sucesso: false, erro: 'Serviço de autenticação indisponível.' };

    try {
      const resultado = await createUserWithEmailAndPassword(auth, email, senha);
      console.log('[AuthService] Conta criada:', resultado.user.email);
      return { sucesso: true, usuario: resultado.user };

    } catch (erro) {
      const mensagem = this._traduzirErroAuth(erro.code);
      console.error('[AuthService] Erro na criação de conta:', erro.code);
      return { sucesso: false, erro: mensagem };
    }
  },

  /* ─── LOGOUT ──────────────────────────────────────────────────────────── */

  async logout() {
    if (!auth) return { sucesso: false, erro: 'Serviço de autenticação indisponível.' };

    try {
      await signOut(auth);
      console.log('[AuthService] Logout realizado com sucesso.');
      return { sucesso: true };

    } catch (erro) {
      console.error('[AuthService] Erro no logout:', erro);
      return { sucesso: false, erro: 'Não foi possível fazer logout. Tente novamente.' };
    }
  },

  /* ─── RECUPERAÇÃO DE SENHA ────────────────────────────────────────────── */

  async recuperarSenha(email) {
    if (!auth) return { sucesso: false, erro: 'Serviço de autenticação indisponível.' };

    try {
      await sendPasswordResetEmail(auth, email);
      console.log('[AuthService] E-mail de recuperação enviado para:', email);
      return { sucesso: true };

    } catch (erro) {
      const mensagem = this._traduzirErroAuth(erro.code);
      console.error('[AuthService] Erro na recuperação de senha:', erro.code);
      return { sucesso: false, erro: mensagem };
    }
  },

  /* ─── GERENCIAMENTO DA CONTA ──────────────────────────────────────────── */

  async atualizarNomePerfil(nome) {
    if (!auth || !auth.currentUser) return { sucesso: false, erro: 'Usuário não autenticado.' };

    try {
      await updateProfile(auth.currentUser, { displayName: nome });
      console.log('[AuthService] Nome atualizado com sucesso:', nome);
      return { sucesso: true };
    } catch (erro) {
      console.error('[AuthService] Erro ao atualizar perfil:', erro);
      return { sucesso: false, erro: 'Erro ao atualizar o nome de perfil. Tente novamente.' };
    }
  },

  async excluirConta() {
    if (!auth || !auth.currentUser) return { sucesso: false, erro: 'Usuário não autenticado.' };

    try {
      await deleteUser(auth.currentUser);
      console.log('[AuthService] Conta excluída com sucesso.');
      return { sucesso: true };
    } catch (erro) {
      console.error('[AuthService] Erro ao excluir conta:', erro);
      
      // O erro auth/requires-recent-login é comum em exclusões, exigimos reautenticação
      if (erro.code === 'auth/requires-recent-login') {
        return { 
          sucesso: false, 
          erro: 'Sua sessão expirou por segurança. Saia da conta, faça login novamente e tente excluir.',
          reautenticar: true 
        };
      }
      
      return { sucesso: false, erro: 'Não foi possível excluir a conta. Tente novamente.' };
    }
  },

  /* ─── INTERNOS ────────────────────────────────────────────────────────── */

  _traduzirErroAuth(codigo) {
    const erros = {
      'auth/user-not-found':         'E-mail não cadastrado.',
      'auth/wrong-password':         'Senha incorreta.',
      'auth/invalid-credential':     'E-mail ou senha inválidos.',
      'auth/invalid-email':          'Formato de e-mail inválido.',
      'auth/user-disabled':          'Esta conta foi desativada.',
      'auth/too-many-requests':      'Muitas tentativas. Aguarde alguns minutos.',
      'auth/network-request-failed': 'Sem conexão com a internet.',
      'auth/email-already-in-use':   'Este e-mail já está cadastrado.',
      'auth/weak-password':          'A senha deve ter ao menos 6 caracteres.',
      'auth/operation-not-allowed':  'Método de autenticação não habilitado.',
    };
    return erros[codigo] || 'Ocorreu um erro inesperado. Tente novamente.';
  },
};
