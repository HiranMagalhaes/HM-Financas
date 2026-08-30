/**
 * HM Finanças — scripts/modules/relatorio/index.js
 * Módulo de Relatórios — placeholder para implementação futura.
 */

'use strict';

import { AuthService } from '../../firebase/auth-service.js';

export const RelatorioModule = {

  /**
   * Ponto de entrada do módulo Relatório.
   * Chamado pelo router.js ao navegar para a rota #relatorio.
   *
   * @param {HTMLElement} container - Elemento #main-content do layout base
   */
  renderRelatorio(container) {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Relatórios</h2>
          <p class="page-subtitle">Análises consolidadas do sistema financeiro.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="empty-state" style="padding: var(--space-16) var(--space-8);">
            <span class="material-symbols-outlined empty-state-icon"
                  style="color: var(--color-gold);">
              bar_chart
            </span>
            <h3 class="empty-state-title">Relatórios em Breve</h3>
            <p class="empty-state-text">
              Este módulo está sendo desenvolvido e trará relatórios consolidados
              de todas as áreas do sistema — empréstimos, cartões, promissórias e cobranças.
            </p>
            <button class="btn btn-secondary" onclick="window.location.hash='dashboard'">
              <span class="material-symbols-outlined">arrow_back</span>
              Voltar ao Dashboard
            </button>
          </div>
        </div>
      </div>
    `;
  }
};
