/**
 * HM Finanças — Módulo: Patrimônio (Módulo 4)
 * ============================================================
 * Tela de visão consolidada do patrimônio do usuário.
 * Exibe a soma de HMCRED, Dinheiro e Cartões.
 * Permite edição manual dos valores via modal.
 */

'use strict';

import { AuthService } from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, parseMoeda } from '../../utils/formatters.js';
import { mostrarToast } from '../../utils/helpers.js';
import { Router } from '../../router.js';

/* ─────────────────────────────────────────────────────────────────────────────
   ESTADO DO MÓDULO
───────────────────────────────────────────────────────────────────────────── */
let unsubscribeListener = null;
let _container = null;

/* ─────────────────────────────────────────────────────────────────────────────
   FUNÇÕES AUXILIARES INTERNAS
───────────────────────────────────────────────────────────────────────────── */

/**
 * Gera o HTML de um card de estatística (reaproveitado do Dashboard).
 *
 * @param {object} opcoes - Configurações do card
 * @returns {string} HTML do card
 */
function gerarStatCard({ label, valor, icone, classExtra = '', classeValor = '', classeIcone = '', rota = '' }) {
  const atributoRota = rota ? `data-nav="${rota}" role="button" tabindex="0"` : '';
  const classeClicavel = rota ? 'card-clickable' : '';

  return `
    <div class="stat-card ${classExtra} ${classeClicavel}" ${atributoRota}>
      <div class="stat-card-header">
        <span class="stat-card-label">${label}</span>
        <div class="stat-card-icon" ${classeIcone ? `style="${classeIcone}"` : ''}>
          <span class="material-symbols-outlined">${icone}</span>
        </div>
      </div>
      <div class="stat-card-value ${classeValor} value-sensitive">${valor}</div>
    </div>
  `;
}

/**
 * Abre o modal de edição manual de patrimônio.
 * @param {object} resumo - Dados atuais do patrimônio
 */
function abrirModalEdicao(resumo) {
  const modal = document.getElementById('modal-editar-patrimonio');
  if (!modal) return;

  // Preenche os campos com os valores atuais
  const toVal = (v) => (v || 0).toFixed(2).replace('.', ',');
  document.getElementById('edit-pat-hmcred').value       = toVal(resumo.hmcred);
  document.getElementById('edit-pat-dinheiro').value     = toVal(resumo.dinheiro);
  document.getElementById('edit-pat-promissorias').value = toVal(resumo.promissorias);
  document.getElementById('edit-pat-cartoes').value      = toVal(resumo.cartoes);

  modal.classList.add('open');
}

/**
 * Salva os valores editados manualmente no Firestore.
 * @param {SubmitEvent} evento
 * @param {object} resumoAtual
 */
async function salvarEdicaoManual(evento, resumoAtual) {
  evento.preventDefault();
  const form = evento.target;
  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;

  const novoResumo = {
    ...resumoAtual,
    hmcred:       parseMoeda(document.getElementById('edit-pat-hmcred').value),
    dinheiro:     parseMoeda(document.getElementById('edit-pat-dinheiro').value),
    promissorias: parseMoeda(document.getElementById('edit-pat-promissorias').value),
    cartoes:      parseMoeda(document.getElementById('edit-pat-cartoes').value),
  };

  const res = await FirestoreService.salvar('patrimonio', 'resumo', novoResumo);

  if (btn) btn.disabled = false;

  if (res.sucesso) {
    document.getElementById('modal-editar-patrimonio').classList.remove('open');
    mostrarToast({ tipo: 'success', titulo: 'Patrimônio atualizado!', mensagem: 'Os valores foram salvos com sucesso.' });
    // Re-renderiza com os novos dados
    renderizarTelaPrincipal(_container, novoResumo);
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao salvar', mensagem: 'Não foi possível atualizar os valores.' });
  }
}

/**
 * Registra os eventos de interação da tela.
 *
 * @param {HTMLElement} container
 * @param {object} resumo
 */
function registrarEventos(container, resumo) {
  // Navegação pelos atalhos e cards
  container.querySelectorAll('[data-nav]').forEach(elemento => {
    const rota = elemento.getAttribute('data-nav');
    if (!rota) return;

    elemento.addEventListener('click', () => Router.navegar(rota));
    elemento.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        Router.navegar(rota);
      }
    });
  });

  // Botão de editar patrimônio
  const btnEditar = document.getElementById('btn-editar-patrimonio');
  if (btnEditar) {
    btnEditar.addEventListener('click', () => abrirModalEdicao(resumo));
  }

  // Formulário do modal de edição
  const formEditar = document.getElementById('form-editar-patrimonio');
  if (formEditar) {
    // Remove listener anterior antes de adicionar novo
    formEditar.onsubmit = null;
    formEditar.addEventListener('submit', (e) => salvarEdicaoManual(e, resumo));
  }

  // Fechar modal ao clicar fora
  const modal = document.getElementById('modal-editar-patrimonio');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }

  // Botão fechar modal
  const btnFechar = document.getElementById('btn-fechar-modal-patrimonio');
  if (btnFechar) {
    btnFechar.addEventListener('click', () => {
      document.getElementById('modal-editar-patrimonio').classList.remove('open');
    });
  }
}

/**
 * Renderiza o modal de edição manual de valores do patrimônio.
 * @returns {string} HTML do modal
 */
function renderizarModalEdicao() {
  return `
    <!-- Modal: Editar Patrimônio Manualmente -->
    <div class="modal-overlay" id="modal-editar-patrimonio" role="dialog" aria-modal="true" aria-labelledby="titulo-modal-patrimonio">
      <div class="modal" style="max-width: 480px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title" id="titulo-modal-patrimonio">
            <span class="material-symbols-outlined" style="vertical-align: middle; margin-right: 8px; color: var(--color-gold);">edit</span>
            Editar Valores do Patrimônio
          </h3>
          <button type="button" class="btn btn-ghost btn-icon" id="btn-fechar-modal-patrimonio" aria-label="Fechar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-editar-patrimonio" novalidate>
          <div class="modal-body">
            <div style="background-color: var(--color-info-muted); border: 1px solid var(--color-info-border, var(--border-default)); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); margin-bottom: var(--space-5); display: flex; align-items: flex-start; gap: var(--space-3);">
              <span class="material-symbols-outlined" style="color: var(--color-info); font-size: 20px; flex-shrink: 0; margin-top: 1px;">info</span>
              <p style="margin: 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5;">
                Ajuste manual dos valores. Use para corrigir ou acrescentar valores que não foram registrados pelos módulos individuais.
              </p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
              <div class="form-group">
                <label class="form-label" for="edit-pat-hmcred">
                  <span class="material-symbols-outlined icon-sm" style="color: var(--color-info); vertical-align: middle;"></span>
                  HMCRED (R$)
                </label>
                <input type="text" id="edit-pat-hmcred" class="form-input" inputmode="decimal" placeholder="0,00">
              </div>
              <div class="form-group">
                <label class="form-label" for="edit-pat-dinheiro">
                  <span class="material-symbols-outlined icon-sm" style="color: var(--color-success); vertical-align: middle;"></span>
                  Dinheiro (R$)
                </label>
                <input type="text" id="edit-pat-dinheiro" class="form-input" inputmode="decimal" placeholder="0,00">
              </div>
              <div class="form-group">
                <label class="form-label" for="edit-pat-promissorias">
                  <span class="material-symbols-outlined icon-sm" style="color: var(--text-primary); vertical-align: middle;"></span>
                  Promissórias (R$)
                </label>
                <input type="text" id="edit-pat-promissorias" class="form-input" inputmode="decimal" placeholder="0,00">
              </div>
              <div class="form-group">
                <label class="form-label" for="edit-pat-cartoes">
                  <span class="material-symbols-outlined icon-sm" style="color: var(--color-danger); vertical-align: middle;"></span>
                  Cartões / Faturas (R$)
                </label>
                <input type="text" id="edit-pat-cartoes" class="form-input" inputmode="decimal" placeholder="0,00">
                <small class="text-muted" style="display: block; margin-top: 4px;">Passivo — será subtraído do total.</small>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-cancelar-patrimonio"
                    onclick="document.getElementById('modal-editar-patrimonio').classList.remove('open')">
              Cancelar
            </button>
            <button type="submit" class="btn btn-primary">
              <span class="material-symbols-outlined">save</span>
              Salvar Valores
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/**
 * Renderiza o estado vazio caso o usuário não tenha nenhum dado de patrimônio.
 */
function renderizarEmptyState(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Patrimônio</h2>
        <p class="page-subtitle">Sua visão financeira consolidada.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="empty-state">
          <span class="material-symbols-outlined empty-state-icon">account_balance_wallet</span>
          <h3 class="empty-state-title">Seu patrimônio começa aqui</h3>
          <p class="empty-state-text">
            Você ainda não possui itens no seu patrimônio. 
            Comece registrando suas operações de crédito (HMCRED), contas bancárias ou cartões.
          </p>
          <div style="display: flex; gap: var(--space-4); justify-content: center; margin-top: var(--space-4);">
            <button class="btn btn-primary" onclick="window.location.hash='hmcred'">
              <span class="material-symbols-outlined">add</span>
              Ir para HMCRED
            </button>
            <button class="btn btn-secondary" onclick="window.location.hash='dashboard'">
              Voltar ao Início
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renderiza a tela principal com os dados de patrimônio.
 */
function renderizarTelaPrincipal(container, resumo) {
  _container = container;

  // Garantir que os totais existam
  const totalHmcred = resumo.hmcred || 0;
  const totalDinheiro = resumo.dinheiro || 0;
  const totalCartoes = resumo.cartoes || 0;
  const totalPromissorias = resumo.promissorias || 0;
  
  // Total consolidado (Ativos - Passivos). 
  // Dinheiro, HMCRED e Promissórias são ativos (positivos). Cartões (fatura) são passivos (negativos).
  const patrimonioTotal = totalHmcred + totalDinheiro + totalPromissorias - totalCartoes;

  container.innerHTML = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-4);">
      <div>
        <h2 class="page-title">Patrimônio</h2>
        <p class="page-subtitle">Sua visão financeira consolidada.</p>
      </div>
      <button class="btn btn-secondary" id="btn-editar-patrimonio" aria-label="Editar valores do patrimônio manualmente">
        <span class="material-symbols-outlined">edit</span>
        Editar Valores
      </button>
    </div>

    <div class="stats-grid" role="region" aria-label="Indicadores de Patrimônio">
      ${gerarStatCard({
        label: 'Patrimônio Total',
        valor: formatarMoeda(patrimonioTotal),
        icone: 'account_balance_wallet',
        classExtra: 'card-gold',
        classeValor: 'text-gold',
      })}

      ${gerarStatCard({
        label: 'HMCRED (Crédito próprio)',
        valor: formatarMoeda(totalHmcred),
        icone: 'local_atm',
        classeIcone: 'background-color: var(--color-info-muted); color: var(--color-info);',
        rota: 'hmcred'
      })}

      ${gerarStatCard({
        label: 'Dinheiro (Contas/Caixa)',
        valor: formatarMoeda(totalDinheiro),
        icone: 'payments',
        classeIcone: 'background-color: var(--color-success-muted); color: var(--color-success);',
        rota: 'dinheiro'
      })}

      ${gerarStatCard({
        label: 'Promissórias (Ativas)',
        valor: formatarMoeda(totalPromissorias),
        icone: 'receipt_long',
        classeIcone: 'background-color: var(--bg-hover); color: var(--text-primary);',
        rota: 'promissorias'
      })}

      ${gerarStatCard({
        label: 'Cartões (Faturas/Limite)',
        valor: formatarMoeda(totalCartoes),
        icone: 'credit_card',
        classeValor: 'text-danger',
        classeIcone: 'background-color: var(--color-danger-muted); color: var(--color-danger);',
        rota: 'cartoes'
      })}
    </div>

    <div class="dashboard-section-header" style="margin-top: var(--space-8);">
      <h3 class="text-lg font-semibold">Resumo de Ativos e Passivos</h3>
      <span class="badge badge-neutral">Sincronizado automaticamente</span>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="table-responsive">
          <table class="table" aria-label="Tabela de composição do patrimônio">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Origem</th>
                <th class="text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span class="badge badge-success">Ativo</span></td>
                <td>
                  <div style="display: flex; align-items: center; gap: var(--space-2);">
                    <span class="material-symbols-outlined text-info icon-sm">local_atm</span>
                    Capital em operações HMCRED
                  </div>
                </td>
                <td class="text-right value-sensitive text-info">${formatarMoeda(totalHmcred)}</td>
              </tr>
              <tr>
                <td><span class="badge badge-success">Ativo</span></td>
                <td>
                  <div style="display: flex; align-items: center; gap: var(--space-2);">
                    <span class="material-symbols-outlined text-success icon-sm">payments</span>
                    Saldo em Contas e Dinheiro
                  </div>
                </td>
                <td class="text-right value-sensitive text-success">${formatarMoeda(totalDinheiro)}</td>
              </tr>
              <tr>
                <td><span class="badge badge-success">Ativo</span></td>
                <td>
                  <div style="display: flex; align-items: center; gap: var(--space-2);">
                    <span class="material-symbols-outlined text-primary icon-sm">receipt_long</span>
                    Promissórias em Aberto
                  </div>
                </td>
                <td class="text-right value-sensitive text-primary">${formatarMoeda(totalPromissorias)}</td>
              </tr>
              <tr>
                <td><span class="badge badge-danger">Passivo</span></td>
                <td>
                  <div style="display: flex; align-items: center; gap: var(--space-2);">
                    <span class="material-symbols-outlined text-danger icon-sm">credit_card</span>
                    Faturas de Cartões de Crédito
                  </div>
                </td>
                <td class="text-right value-sensitive text-danger">− ${formatarMoeda(totalCartoes)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    ${renderizarModalEdicao()}
  `;

  registrarEventos(container, resumo);
}

/* ─────────────────────────────────────────────────────────────────────────────
   MÓDULO EXPORTADO
───────────────────────────────────────────────────────────────────────────── */
export const PatrimonioModule = {

  /**
   * Renderiza a tela de Patrimônio.
   *
   * @param {HTMLElement} container
   */
  async renderPatrimonio(container) {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    _container = container;

    // Estado de carregamento
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
        <p>Carregando patrimônio...</p>
      </div>
    `;

    // Desconectar listener anterior, se existir
    if (unsubscribeListener) {
      unsubscribeListener();
      unsubscribeListener = null;
    }

    // Tenta buscar o resumo inicial para ver se existe
    const res = await FirestoreService.obter('patrimonio', 'resumo');
    
    // Se falhou por não existir documento, mostra estado vazio ou inicia com zero
    if (!res.sucesso) {
      // Renderiza com valores zerados e permite edição manual para começar
      renderizarTelaPrincipal(container, { hmcred: 0, dinheiro: 0, cartoes: 0, promissorias: 0 });
      return;
    }

    // Se existe, renderiza a tela e depois anexa o listener para atualizar em tempo real
    renderizarTelaPrincipal(container, res.dados);
  }
};
