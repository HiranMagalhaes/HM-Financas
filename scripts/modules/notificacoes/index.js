/**
 * HM Finanças — Módulo: Notificações (Módulo 9)
 * ============================================================
 * Agrega e exibe alertas de cobranças e promissórias que estão
 * vencidas ou vencendo amanhã. Controla também os badges do sistema.
 */

'use strict';

import { AuthService } from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, formatarData } from '../../utils/formatters.js';
import { calcularStatusVencimento } from '../../utils/helpers.js';

let estado = {
  cobrancas: [],
  promissorias: [],
  notificacoes: [], // A lista combinada e ordenada
  carregandoCobrancas: true,
  carregandoPromissorias: true
};

let unsubscribeCobrancas = null;
let unsubscribePromissorias = null;
let badgesHabilitados = false; // Controle para evitar loop ou múltiplas chamadas
let nativeNotificationsRequested = false;

/* ─────────────────────────────────────────────────────────────────────────────
   PROCESSAMENTO DE NOTIFICAÇÕES
───────────────────────────────────────────────────────────────────────────── */

/**
 * Processa as cobranças e promissórias em memória e monta a lista final de notificações.
 * Filtra apenas 'atrasada' e 'amanha' ou 'hoje'.
 */
function processarNotificacoes() {
  const lista = [];

  // 1. Processar Cobranças
  estado.cobrancas.forEach(cob => {
    const statusVenc = calcularStatusVencimento(cob.dataVencimento, cob.status);
    if (statusVenc === 'atrasada' || statusVenc === 'amanha' || statusVenc === 'hoje') {
      lista.push({
        idOriginal: cob.id,
        tipoOrigem: 'cobranca',
        tipoLabel: 'Cobrança',
        nomeCliente: cob.clienteNome || 'Cliente Desconhecido',
        valor: cob.valor || 0,
        dataVencimento: cob.dataVencimento,
        status: statusVenc
      });
    }
  });

  // 2. Processar Promissórias
  estado.promissorias.forEach(prom => {
    const statusVenc = calcularStatusVencimento(prom.dataVencimento, prom.status);
    if (statusVenc === 'atrasada' || statusVenc === 'amanha' || statusVenc === 'hoje') {
      lista.push({
        idOriginal: prom.id,
        tipoOrigem: 'promissoria',
        tipoLabel: 'Promissória',
        nomeCliente: prom.clienteNome || 'Cliente Desconhecido',
        valor: (prom.valorInvestido || 0) + (prom.lucro || 0),
        dataVencimento: prom.dataVencimento,
        status: statusVenc
      });
    }
  });

  // 3. Ordenação: Atrasadas > Hoje > Amanhã. Desempate: data mais antiga.
  lista.sort((a, b) => {
    const peso = { 'atrasada': 1, 'hoje': 2, 'amanha': 3 };
    if (peso[a.status] !== peso[b.status]) {
      return peso[a.status] - peso[b.status];
    }
    const dateA = new Date(a.dataVencimento);
    const dateB = new Date(b.dataVencimento);
    return dateA - dateB;
  });

  estado.notificacoes = lista;

  if (badgesHabilitados) {
    atualizarBadgeGlobal();
    
    // Atualiza o dashboard se estiver renderizado (via evento customizado ou chamada)
    // Uma forma simples é disparar um evento no window que o dashboard ouve
    window.dispatchEvent(new CustomEvent('notificacoes-atualizadas'));
    
    // Dispara notificações nativas se for a primeira carga
    if (!nativeNotificationsRequested && lista.length > 0) {
      nativeNotificationsRequested = true;
      dispararNotificacoesNativas(lista);
    }
  }
}

/**
 * Solicita permissão e dispara notificações nativas do navegador.
 */
function dispararNotificacoesNativas(lista) {
  if (!('Notification' in window)) return;

  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      const atrasadas = lista.filter(n => n.status === 'atrasada').length;
      const vencendo = lista.filter(n => n.status === 'hoje').length;

      if (atrasadas > 0 || vencendo > 0) {
        const title = 'HM Finanças - Alerta';
        let body = '';
        if (atrasadas > 0) body += `${atrasadas} pendência(s) vencida(s). `;
        if (vencendo > 0) body += `${vencendo} vencendo hoje.`;

        new Notification(title, {
          body,
          icon: '/assets/icons/icon-192.png',
          tag: 'hm-financas-alert', // impede que acumulem várias
          renotify: true
        });
      }
    }
  });
}

/**
 * Atualiza o indicador numérico (badge) no botão de notificações do header global.
 */
function atualizarBadgeGlobal() {
  const btnIcon = document.querySelector('#btn-notificacoes');
  if (!btnIcon) return;

  const total = estado.notificacoes.length;

  let badge = btnIcon.querySelector('.badge-icon');
  if (total > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'badge-icon';
      badge.style.position = 'absolute';
      badge.style.top = '4px';
      badge.style.right = '4px';
      badge.style.backgroundColor = 'var(--color-danger)';
      badge.style.color = '#fff';
      badge.style.fontSize = '10px';
      badge.style.fontWeight = 'bold';
      badge.style.borderRadius = '12px';
      badge.style.padding = '2px 6px';
      badge.style.lineHeight = '1';
      btnIcon.style.position = 'relative';
      btnIcon.appendChild(badge);
    }
    badge.textContent = total > 99 ? '99+' : total;
  } else {
    if (badge) badge.remove();
  }
}


/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO DA TELA (ÁREA INTERNA)
───────────────────────────────────────────────────────────────────────────── */

function renderizarCardNotificacao(notificacao) {
  let statusCor, statusBg, statusIcon, labelUrgencia;

  if (notificacao.status === 'atrasada') {
    statusCor = 'var(--color-danger)';
    statusBg = 'var(--color-danger-muted)';
    statusIcon = 'error';
    labelUrgencia = 'Vencida';
  } else if (notificacao.status === 'hoje') {
    statusCor = 'var(--color-warning)';
    statusBg = 'var(--color-warning-muted)';
    statusIcon = 'warning';
    labelUrgencia = 'Vence Hoje';
  } else {
    statusCor = 'var(--color-gold)';
    statusBg = 'var(--bg-overlay)';
    statusIcon = 'schedule';
    labelUrgencia = 'Vence Amanhã';
  }

  const rotaDestino = notificacao.tipoOrigem === 'cobranca' ? 'cobrancas' : 'promissorias';

  return `
    <div class="card" style="margin-bottom: var(--space-4);" role="article">
      <div class="card-body" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);">
        
        <div style="display: flex; align-items: center; gap: var(--space-4); flex: 1; min-width: 250px;">
          <div style="width: 48px; height: 48px; border-radius: var(--radius-md); background-color: ${statusBg}; color: ${statusCor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <span class="material-symbols-outlined" style="font-size: 24px;">${statusIcon}</span>
          </div>
          <div>
            <h4 style="margin: 0; font-size: var(--text-base); font-weight: var(--font-semibold); color: var(--text-primary);">${notificacao.nomeCliente}</h4>
            <span style="font-size: var(--text-sm); color: var(--text-muted);">${notificacao.tipoLabel} · <strong style="color:${statusCor}">${labelUrgencia}</strong></span>
          </div>
        </div>

        <div style="display: flex; gap: var(--space-6); min-width: 150px; justify-content: flex-end; align-items: flex-end;">
          <div style="text-align: right;">
            <p style="margin: 0; font-size: var(--text-xs); color: var(--text-muted);">Vencimento</p>
            <p style="margin: 0; font-size: var(--text-sm); font-weight: var(--font-medium); color: var(--text-secondary);">
              ${formatarData(notificacao.dataVencimento)}
            </p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-size: var(--text-xs); color: var(--text-muted);">Valor</p>
            <p class="value-sensitive" style="margin: 0; font-size: var(--text-lg); font-weight: var(--font-bold); color: ${statusCor};">
              ${formatarMoeda(notificacao.valor)}
            </p>
          </div>
        </div>

        <div style="display: flex; gap: var(--space-1); width: 100%; justify-content: flex-end; border-top: 1px solid var(--border-default); padding-top: var(--space-3); margin-top: var(--space-2);">
          <button class="btn btn-ghost btn-sm" onclick="window.location.hash = '${rotaDestino}'">
            <span class="material-symbols-outlined icon-sm">arrow_forward</span>
            <span style="font-size: var(--text-xs); font-weight: var(--font-medium);">Ir para ${notificacao.tipoLabel}</span>
          </button>
        </div>

      </div>
    </div>
  `;
}

function renderizarTelaPrincipal(container) {
  let qteVencidas = 0;
  let valorVencidas = 0;
  let qteAVencer = 0;
  let valorAVencer = 0;

  estado.notificacoes.forEach(n => {
    if (n.status === 'atrasada') {
      qteVencidas++;
      valorVencidas += n.valor;
    } else {
      qteAVencer++;
      valorAVencer += n.valor;
    }
  });

  const emptyState = `
    <div class="empty-state" style="padding: var(--space-16) var(--space-8);">
      <span class="material-symbols-outlined empty-state-icon" style="color: var(--color-success);">done_all</span>
      <h3 class="empty-state-title">Tudo em dia!</h3>
      <p class="empty-state-text">Você não possui cobranças ou promissórias atrasadas ou vencendo em breve.</p>
    </div>
  `;

  container.innerHTML = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-4);">
      <div>
        <h2 class="page-title">Notificações</h2>
        <p class="page-subtitle">Acompanhe vencimentos e pendências que precisam de atenção.</p>
      </div>
    </div>

    <!-- Grid de KPIs -->
    <div class="stats-grid" style="margin-bottom: var(--space-8);">
      <div class="stat-card card-danger">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm text-danger-muted" style="text-transform: uppercase;">Total Vencido</span>
          <div class="stat-card-icon" style="background-color: var(--color-danger-muted); color: var(--color-danger);">
            <span class="material-symbols-outlined">error</span>
          </div>
        </div>
        <div class="stat-card-value text-danger value-sensitive">${formatarMoeda(valorVencidas)}</div>
        <div class="stat-card-sub text-danger">${qteVencidas} pendência${qteVencidas !== 1 ? 's' : ''}</div>
      </div>

      <div class="stat-card card-warning">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm text-warning-muted" style="text-transform: uppercase;">Vencendo Hoje/Amanhã</span>
          <div class="stat-card-icon" style="background-color: var(--color-warning-muted); color: var(--color-warning);">
            <span class="material-symbols-outlined">schedule</span>
          </div>
        </div>
        <div class="stat-card-value text-warning value-sensitive">${formatarMoeda(valorAVencer)}</div>
        <div class="stat-card-sub text-warning">${qteAVencer} aviso${qteAVencer !== 1 ? 's' : ''}</div>
      </div>
    </div>

    <div class="dashboard-section-header" style="margin-bottom: var(--space-4);">
      <h3 class="text-lg font-semibold">Lista de Alertas</h3>
    </div>

    <div id="notificacoes-lista">
      ${estado.notificacoes.length > 0 ? estado.notificacoes.map(renderizarCardNotificacao).join('') : emptyState}
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────────────────────────
   MÓDULO EXPORTADO
───────────────────────────────────────────────────────────────────────────── */
export const NotificacoesModule = {
  
  /**
   * Inicia o monitoramento em background para alimentar os badges globais
   * e os alertas do dashboard.
   */
  iniciarMonitoramentoBadges() {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    if (!badgesHabilitados) {
      badgesHabilitados = true;
      
      unsubscribeCobrancas = FirestoreService.escutar('cobrancas', (dados) => {
        estado.cobrancas = dados;
        estado.carregandoCobrancas = false;
        processarNotificacoes();
      });

      unsubscribePromissorias = FirestoreService.escutar('promissorias', (dados) => {
        estado.promissorias = dados;
        estado.carregandoPromissorias = false;
        processarNotificacoes();
      });
    }
  },

  /**
   * Retorna os dados consolidados das notificações. Útil para o Dashboard renderizar
   * cards sem nomes explícitos.
   */
  obterResumoDashboard() {
    let qteVencidas = 0;
    let valorVencidas = 0;
    let qteAVencer = 0;
    let valorAVencer = 0;

    estado.notificacoes.forEach(n => {
      if (n.status === 'atrasada') {
        qteVencidas++;
        valorVencidas += n.valor;
      } else {
        qteAVencer++;
        valorAVencer += n.valor;
      }
    });

    return {
      carregando: estado.carregandoCobrancas || estado.carregandoPromissorias,
      totalPendencias: estado.notificacoes.length,
      vencidas: { quantidade: qteVencidas, valor: valorVencidas },
      aVencer: { quantidade: qteAVencer, valor: valorAVencer }
    };
  },

  /**
   * Renderiza a tela completa de notificações.
   */
  async renderNotificacoes(container) {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    this.iniciarMonitoramentoBadges();

    if (estado.carregandoCobrancas || estado.carregandoPromissorias) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-16);">
          <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
          <p style="color: var(--text-muted); margin-top: var(--space-4);">Buscando alertas...</p>
        </div>
      `;
      
      const checkInterval = setInterval(() => {
        if (!estado.carregandoCobrancas && !estado.carregandoPromissorias) {
          clearInterval(checkInterval);
          if (window.location.hash === '#notificacoes') {
            renderizarTelaPrincipal(container);
          }
        }
      }, 100);
      return;
    }

    renderizarTelaPrincipal(container);
  }
};
