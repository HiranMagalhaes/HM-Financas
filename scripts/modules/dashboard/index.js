/**
 * HM Finanças — Módulo: dashboard
 * Lógica da tela inicial (Dashboard).
 */
'use strict';

import { AuthService } from '../../firebase/auth-service.js';

export const DashboardModule = {
  
  /**
   * Renderiza a tela do Dashboard.
   *
   * @param {HTMLElement} container - Elemento onde renderizar o conteúdo
   */
  renderDashboard(container) {
    const usuario = AuthService.obterUsuarioAtual();
    const email = usuario?.email || '';
    const nomeAmigavel = email.split('@')[0] || 'Usuário';

    container.innerHTML = `
      <!-- Cabeçalho da página -->
      <div class="page-header">
        <div>
          <h2 class="page-title">Visão Geral</h2>
          <p class="page-subtitle">Bem-vindo, ${nomeAmigavel} — seu painel financeiro.</p>
        </div>
      </div>
  
      <!-- Cards de estatísticas -->
      <div class="stats-grid" id="stats-grid">
  
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Saldo Total</span>
            <div class="stat-card-icon">
              <span class="material-symbols-outlined">account_balance_wallet</span>
            </div>
          </div>
          <div class="stat-card-value text-gold">R$ —</div>
          <div class="stat-card-sub">
            <span class="material-symbols-outlined icon-sm">schedule</span>
            Carregando dados...
          </div>
        </div>
  
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Em Promissórias</span>
            <div class="stat-card-icon">
              <span class="material-symbols-outlined">receipt_long</span>
            </div>
          </div>
          <div class="stat-card-value">R$ —</div>
          <div class="stat-card-sub">
            <span class="material-symbols-outlined icon-sm">schedule</span>
            Carregando dados...
          </div>
        </div>
  
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Lucro Estimado</span>
            <div class="stat-card-icon" style="background-color: var(--color-success-muted); color: var(--color-success);">
              <span class="material-symbols-outlined">trending_up</span>
            </div>
          </div>
          <div class="stat-card-value text-success">R$ —</div>
          <div class="stat-card-sub">
            <span class="material-symbols-outlined icon-sm">schedule</span>
            Carregando dados...
          </div>
        </div>
  
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Cobranças Pendentes</span>
            <div class="stat-card-icon" style="background-color: var(--color-danger-muted); color: var(--color-danger);">
              <span class="material-symbols-outlined">warning</span>
            </div>
          </div>
          <div class="stat-card-value text-danger">—</div>
          <div class="stat-card-sub">
            <span class="material-symbols-outlined icon-sm">schedule</span>
            Carregando dados...
          </div>
        </div>
  
      </div><!-- /.stats-grid -->
  
      <!-- Aviso de módulo em desenvolvimento -->
      <div class="card" style="margin-top: var(--space-6);">
        <div class="card-body">
          <div class="empty-state" style="padding: var(--space-10);">
            <span class="material-symbols-outlined empty-state-icon">construction</span>
            <h3 class="empty-state-title">Módulo 2B (Dashboard) em breve</h3>
            <p class="empty-state-text">
              A autenticação (Módulo 2A) foi implementada.
              O Dashboard completo com dados reais será implementado na próxima etapa.
            </p>
            <span class="badge badge-gold">
              <span class="material-symbols-outlined icon-sm">check_circle</span>
              Módulo 2A — Concluído
            </span>
          </div>
        </div>
      </div>
    `;
  }
};
