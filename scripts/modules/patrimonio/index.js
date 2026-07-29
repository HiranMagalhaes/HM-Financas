/**
 * HM Finanças — Módulo: Patrimônio (Módulo 4)
 * ============================================================
 * Tela de visão consolidada do patrimônio do usuário.
 * Exibe a soma de HMCRED, Dinheiro e Cartões.
 */

'use strict';

import { AuthService } from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda } from '../../utils/formatters.js';
import { Router } from '../../router.js';

/* ─────────────────────────────────────────────────────────────────────────────
   ESTADO DO MÓDULO
───────────────────────────────────────────────────────────────────────────── */
let unsubscribeListener = null;

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
 * Registra os eventos de interação da tela.
 *
 * @param {HTMLElement} container
 */
function registrarEventos(container) {
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
  // Garantir que os totais existam
  const totalHmcred = resumo.hmcred || 0;
  const totalDinheiro = resumo.dinheiro || 0;
  const totalCartoes = resumo.cartoes || 0;
  const totalPromissorias = resumo.promissorias || 0;
  
  // Total consolidado (Ativos - Passivos). 
  // Dinheiro, HMCRED e Promissórias são ativos (positivos). Cartões (fatura) são passivos (negativos).
  const patrimonioTotal = totalHmcred + totalDinheiro + totalPromissorias - totalCartoes;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Patrimônio</h2>
        <p class="page-subtitle">Sua visão financeira consolidada.</p>
      </div>
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
  `;

  registrarEventos(container);
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
      // Como não existe, podemos oferecer a tela de "Começar" ou apenas renderizar 0
      renderizarEmptyState(container);
      return;
    }

    // Se existe, renderiza a tela e depois anexa o listener para atualizar em tempo real
    renderizarTelaPrincipal(container, res.dados);
  }
};
