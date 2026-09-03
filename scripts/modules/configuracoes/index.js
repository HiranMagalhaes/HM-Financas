/**
 * HM Finanças — Módulo de Configurações
 * Gerencia preferências do usuário, dados da conta, segurança e informações sobre o app.
 */

'use strict';

import { AuthService } from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { alternarTema, aplicarVisibilidadeValores } from '../../app.js';
import { mostrarToast, escapeHTML } from '../../utils/helpers.js';
import { Router } from '../../router.js';

let preferenciasCarregadas = false;
let estadoPix = { chaves: [] };
let unsubscribePix = null;

/* ─────────────────────────────────────────────────────────────────────────────
   MÓDULO EXPORTADO
───────────────────────────────────────────────────────────────────────────── */
export const ConfiguracoesModule = {

  async renderConfiguracoes(container) {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) {
      Router.navegar('login');
      return;
    }

    // Estrutura Base
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Configurações</h2>
          <p class="page-subtitle">Gerencie sua conta e preferências do sistema</p>
        </div>
      </div>

      <div class="cards-grid" style="grid-template-columns: 1fr; gap: 1.5rem; max-width: 800px; margin-bottom: 2rem;">
        
        <!-- CHAVES PIX -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="card-title">Minhas Chaves PIX</h3>
            <button class="btn btn-primary btn-sm" id="btn-novo-pix">
              <span class="material-symbols-outlined icon-sm">add</span> Nova
            </button>
          </div>
          <div class="card-body">
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">
              Cadastre suas chaves para enviar rapidamente junto com as mensagens de cobrança.
            </p>
            <div id="lista-chaves-pix" style="display: flex; flex-direction: column; gap: 0.5rem;">
              <!-- Preenchido via JS -->
            </div>
          </div>
        </div>

        <!-- DADOS DA CONTA -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Dados da Conta</h3>
          </div>
          <div class="card-body">
            <form id="form-perfil">
              <div class="form-group">
                <label class="form-label" for="conf-email">E-mail</label>
                <input type="email" id="conf-email" class="form-control" value="${usuario.email}" disabled style="background-color: var(--bg-hover);">
              </div>
              <div class="form-group">
                <label class="form-label" for="conf-nome">Nome de Exibição</label>
                <input type="text" id="conf-nome" class="form-control" value="${usuario.displayName || ''}" placeholder="Seu nome">
              </div>
              <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <button type="submit" class="btn btn-primary" id="btn-salvar-perfil">Salvar Nome</button>
                <button type="button" class="btn btn-secondary" id="btn-recuperar-senha">Redefinir Senha</button>
              </div>
            </form>
          </div>
        </div>

        <!-- PREFERÊNCIAS -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Preferências</h3>
          </div>
          <div class="card-body">
            <div class="preferences-list" style="display: flex; flex-direction: column; gap: 1rem;">
              
              <!-- Tema -->
              <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
                <div>
                  <h4 style="margin: 0; font-size: 1rem; color: var(--text-color);">Tema Escuro</h4>
                  <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">Ativa o modo noturno no sistema</p>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="toggle-tema">
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <!-- Ocultar Valores -->
              <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
                <div>
                  <h4 style="margin: 0; font-size: 1rem; color: var(--text-color);">Ocultar valores por padrão</h4>
                  <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">Esconde saldos automaticamente ao entrar</p>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="toggle-valores">
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <!-- Notificações -->
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h4 style="margin: 0; font-size: 1rem; color: var(--text-color);">Notificações Internas</h4>
                  <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">Habilita o indicador de alertas (sino)</p>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="toggle-notificacoes" checked>
                  <span class="toggle-slider"></span>
                </label>
              </div>

            </div>
          </div>
        </div>

        <!-- SEGURANÇA -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Segurança</h3>
          </div>
          <div class="card-body">
            <p style="color: var(--text-muted); margin-bottom: 1rem; font-size: 0.9rem;">
              Encerre sua sessão neste dispositivo ou exclua sua conta permanentemente (esta ação não pode ser desfeita).
            </p>
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary" id="btn-logout">
                <span class="material-symbols-outlined icon-sm">logout</span> Sair da Conta
              </button>
              <button type="button" class="btn btn-danger" id="btn-excluir-conta" style="background-color: var(--danger-color); color: white; border: none;">
                <span class="material-symbols-outlined icon-sm">delete_forever</span> Excluir Conta
              </button>
            </div>
          </div>
        </div>

        <!-- SOBRE O APP -->
        <div class="card">
          <div class="card-body" style="text-align: center; padding: 2rem 1rem;">
            <h3 style="color: var(--gold-color); margin-bottom: 0.5rem;">HM Finanças</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">Versão 1.0.0</p>
            <p style="font-size: 0.9rem; max-width: 400px; margin: 0 auto; color: var(--text-color);">
              Sistema desenvolvido para organização financeira, controle de cartões, empréstimos e gestão de clientes.
            </p>
          </div>
        </div>

      </div>

      <!-- Modal Novo PIX -->
      <div class="modal-overlay" id="modal-novo-pix">
        <div class="modal" style="max-width: 400px; width: 100%;">
          <div class="modal-header">
            <h3 class="modal-title">Nova Chave PIX</h3>
            <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-novo-pix').classList.remove('open')">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <form id="form-novo-pix">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">Apelido <span class="required">*</span></label>
                <input type="text" name="apelido" class="form-input" placeholder="Ex: Nubank, Inter, Bradesco..." required>
              </div>
              <div class="form-group">
                <label class="form-label">Chave PIX <span class="required">*</span></label>
                <input type="text" name="chave" class="form-input" placeholder="CPF, Telefone, E-mail ou Aleatória" required>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-novo-pix').classList.remove('open')">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // 1. Carregar preferências do estado atual do DOM/LocalStorage
    const toggleTema = document.getElementById('toggle-tema');
    const toggleValores = document.getElementById('toggle-valores');
    const toggleNotificacoes = document.getElementById('toggle-notificacoes');

    const temaAtual = document.documentElement.getAttribute('data-theme') || 'light';
    const valoresOcultosAtual = document.body.classList.contains('hide-values');

    toggleTema.checked = (temaAtual === 'dark');
    toggleValores.checked = valoresOcultosAtual;

    // Buscar no banco para ver se há preferências salvas
    try {
      const prefsDB = await FirestoreService.obter('configuracoes', 'preferencias');
      if (prefsDB) {
        // Atualiza a interface com o que veio do banco, caso exista
        if (prefsDB.temaPreferido !== undefined) {
          toggleTema.checked = (prefsDB.temaPreferido === 'dark');
          // Aplica para corrigir caso localstorage estivesse divergente (ex: outro PC)
          if ((prefsDB.temaPreferido === 'dark') !== (temaAtual === 'dark')) {
            alternarTema();
          }
        }
        if (prefsDB.ocultarValoresPorPadrao !== undefined) {
          toggleValores.checked = prefsDB.ocultarValoresPorPadrao;
          if (prefsDB.ocultarValoresPorPadrao !== valoresOcultosAtual) {
            aplicarVisibilidadeValores(prefsDB.ocultarValoresPorPadrao);
          }
        }
        if (prefsDB.notificacoesAtivas !== undefined) {
          toggleNotificacoes.checked = prefsDB.notificacoesAtivas;
        }
      }
    } catch (e) {
      console.warn('Preferências ainda não criadas no Firestore ou erro ao buscar.', e);
    }

    preferenciasCarregadas = true;

    // Escutar coleção de PIX
    if (unsubscribePix) { unsubscribePix(); unsubscribePix = null; }
    unsubscribePix = FirestoreService.escutar(
      'pix_chaves',
      (chaves) => {
        estadoPix.chaves = chaves;
        this._renderizarListaPix(container);
      },
      { ordenarPor: 'apelido', direcao: 'asc' }
    );

    // 2. Registrar Eventos
    this._registrarEventos(container, usuario);
  },

  _renderizarListaPix(container) {
    const lista = container.querySelector('#lista-chaves-pix');
    if (!lista) return;

    if (estadoPix.chaves.length === 0) {
      lista.innerHTML = `<div style="text-align: center; padding: 1rem; color: var(--text-muted); background: var(--bg-overlay); border-radius: var(--radius-md);">Nenhuma chave PIX cadastrada.</div>`;
      return;
    }

    lista.innerHTML = estadoPix.chaves.map(pix => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--bg-overlay); border-radius: var(--radius-md); border: 1px solid var(--border-default);">
        <div>
          <div style="font-weight: var(--font-medium); color: var(--text-primary);">${escapeHTML(pix.apelido)}</div>
          <div style="font-size: var(--text-sm); color: var(--text-muted);">${escapeHTML(pix.chave)}</div>
        </div>
        <button class="btn btn-ghost btn-icon btn-excluir-pix" data-id="${pix.id}" title="Excluir">
          <span class="material-symbols-outlined" style="color: var(--color-danger);">delete</span>
        </button>
      </div>
    `).join('');
  },

  /**
   * Registra os eventos dos botões e formulários da tela.
   */
  _registrarEventos(container, usuario) {
    
    // -- PIX --
    const btnNovoPix = container.querySelector('#btn-novo-pix');
    const modalNovoPix = container.querySelector('#modal-novo-pix');
    const formNovoPix = container.querySelector('#form-novo-pix');

    if (btnNovoPix) {
      btnNovoPix.addEventListener('click', () => {
        modalNovoPix.classList.add('open');
      });
    }

    if (formNovoPix) {
      formNovoPix.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(formNovoPix);
        const btnSubmit = formNovoPix.querySelector('button[type="submit"]');
        
        const novaChave = {
          apelido: formData.get('apelido').trim(),
          chave: formData.get('chave').trim()
        };

        if (!novaChave.apelido || !novaChave.chave) return;

        btnSubmit.disabled = true;
        const res = await FirestoreService.criar('pix_chaves', novaChave);
        btnSubmit.disabled = false;

        if (res.sucesso) {
          modalNovoPix.classList.remove('open');
          formNovoPix.reset();
          mostrarToast({ tipo: 'success', titulo: 'Chave salva com sucesso!' });
        } else {
          mostrarToast({ tipo: 'danger', titulo: 'Erro ao salvar chave PIX.' });
        }
      });
    }

    if (!container.dataset.eventosRegistradosConfiguracoes) {
      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-excluir-pix');
        if (btn) {
          const id = btn.getAttribute('data-id');
          if (confirm('Deseja realmente excluir esta chave PIX?')) {
            const res = await FirestoreService.excluir('pix_chaves', id);
            if (res.sucesso) {
              mostrarToast({ tipo: 'success', titulo: 'Chave excluída.' });
            } else {
              mostrarToast({ tipo: 'danger', titulo: 'Erro ao excluir.' });
            }
          }
        }
      });
      container.dataset.eventosRegistradosConfiguracoes = 'true';
    }

    // -- Dados da Conta --
    const formPerfil = container.querySelector('#form-perfil');
    const btnRecuperar = container.querySelector('#btn-recuperar-senha');

    formPerfil.addEventListener('submit', async (e) => {
      e.preventDefault();
      const novoNome = container.querySelector('#conf-nome').value.trim();
      const btnSalvar = container.querySelector('#btn-salvar-perfil');
      
      btnSalvar.disabled = true;
      btnSalvar.textContent = 'Salvando...';

      const res = await AuthService.atualizarNomePerfil(novoNome);
      if (res.sucesso) {
        mostrarToast('Nome atualizado com sucesso!', 'success');
      } else {
        mostrarToast(res.erro, 'error');
      }

      btnSalvar.disabled = false;
      btnSalvar.textContent = 'Salvar Nome';
    });

    btnRecuperar.addEventListener('click', async () => {
      if (confirm(`Deseja enviar um e-mail de redefinição de senha para ${usuario.email}?`)) {
        const res = await AuthService.recuperarSenha(usuario.email);
        if (res.sucesso) {
          mostrarToast('E-mail de recuperação enviado! Verifique sua caixa de entrada.', 'success');
        } else {
          mostrarToast(res.erro, 'error');
        }
      }
    });

    // -- Preferências --
    const toggleTema = container.querySelector('#toggle-tema');
    const toggleValores = container.querySelector('#toggle-valores');
    const toggleNotificacoes = container.querySelector('#toggle-notificacoes');

    const salvarPreferencias = async () => {
      if (!preferenciasCarregadas) return;

      const prefs = {
        temaPreferido: toggleTema.checked ? 'dark' : 'light',
        ocultarValoresPorPadrao: toggleValores.checked,
        notificacoesAtivas: toggleNotificacoes.checked
      };

      try {
        await FirestoreService.salvar('configuracoes', 'preferencias', prefs);
      } catch (e) {
        console.error('Erro ao salvar preferências no Firestore', e);
      }
    };

    toggleTema.addEventListener('change', () => {
      alternarTema(); // A função já existente no app.js altera o localStorage e DOM
      salvarPreferencias();
    });

    toggleValores.addEventListener('change', (e) => {
      aplicarVisibilidadeValores(e.target.checked); // Aplica localStorage e DOM
      salvarPreferencias();
    });

    toggleNotificacoes.addEventListener('change', () => {
      salvarPreferencias();
      if (toggleNotificacoes.checked) {
        mostrarToast('Notificações ativadas. Você verá os alertas de cobranças.', 'success');
      } else {
        mostrarToast('Notificações desativadas.', 'success');
      }
    });

    // -- Segurança --
    const btnLogout = container.querySelector('#btn-logout');
    const btnExcluir = container.querySelector('#btn-excluir-conta');

    btnLogout.addEventListener('click', async () => {
      const res = await AuthService.logout();
      if (res.sucesso) {
        Router.navegar('login');
      } else {
        mostrarToast(res.erro, 'error');
      }
    });

    btnExcluir.addEventListener('click', async () => {
      const msg = 'ATENÇÃO: Você está prestes a excluir sua conta PERMANENTEMENTE.\\n\\nTodos os seus dados de clientes, cobranças, dinheiro e cartões serão apagados e não poderão ser recuperados.\\n\\nDeseja realmente excluir sua conta?';
      
      if (confirm(msg)) {
        // Dupla confirmação por segurança
        const confirmar = prompt('Para confirmar a exclusão, digite a palavra EXCLUIR em letras maiúsculas:');
        
        if (confirmar === 'EXCLUIR') {
          const res = await AuthService.excluirConta();
          
          if (res.sucesso) {
            mostrarToast('Conta excluída com sucesso.', 'success');
            // Como a conta foi excluída, o observer de auth vai redirecionar ou a gente força:
            Router.navegar('login');
          } else {
            mostrarToast(res.erro, 'error');
            if (res.reautenticar) {
              // Se pediu reautenticação, forçamos o logout
              AuthService.logout();
            }
          }
        } else if (confirmar !== null) {
          mostrarToast('Palavra de confirmação incorreta. A conta NÃO foi excluída.', 'error');
        }
      }
    });

  }
};
