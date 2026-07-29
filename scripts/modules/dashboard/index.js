/**
 * HM Finanças — Módulo: Dashboard (Módulo 3)
 * ============================================================
 * Tela principal pós-login do sistema.
 *
 * COMO FUNCIONA:
 *   - O router.js chama DashboardModule.renderDashboard(container)
 *     passando o elemento #main-content como container.
 *   - Este módulo injeta o HTML do Dashboard e registra os eventos
 *     de interação (atalhos, etc.).
 *   - Os dados são mockados em mockDashboardData para facilitar
 *     a futura substituição por dados reais do Firestore.
 *
 * PARA INTEGRAR COM FIRESTORE NO FUTURO:
 *   - Substitua os valores em mockDashboardData pelos resultados
 *     de chamadas ao FirestoreService.
 *   - A estrutura dos objetos já reflete os campos esperados.
 *
 * PADRÃO SEGUIDO:
 *   - Mesmo padrão do módulo auth/index.js:
 *     export const DashboardModule = { render...() {} }
 *   - Rota já registrada em router.js como 'dashboard'
 */

'use strict';

import { AuthService } from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, formatarData, formatarDataRelativa } from '../../utils/formatters.js';
import { NotificacoesModule } from '../notificacoes/index.js';

/* ─────────────────────────────────────────────────────────────────────────────
   DADOS MOCKADOS
   Estrutura pensada para substituição direta por dados reais do Firestore.
   Cada campo corresponde a um documento ou agregação esperada no banco.
   Para substituir: buscar via FirestoreService e atribuir ao mesmo objeto.
───────────────────────────────────────────────────────────────────────────── */
const mockDashboardData = {

  // Saldo disponível em caixa (Firestore: coleção 'caixa', campo 'saldo')
  saldoTotal: 15_430.50,

  // Patrimônio total (Firestore: soma dos documentos em 'patrimonio')
  patrimonio: 45_200.00,

  // Total em circulação em promissórias ativas
  // (Firestore: soma de 'promissorias' onde status == 'ativa')
  promissoriasAtivas: 12_500.00,

  // Lucro estimado das promissórias ativas (juros a receber)
  lucroEstimado: 2_350.00,

  // Total de operações de crédito (HMCRED) em aberto
  operacoesHmcred: 8_200.00,

  // Cobranças: quantidade vencida e a vencer nos próximos 7 dias
  cobrancas: {
    vencidas: 3,       // (Firestore: promissórias onde vencimento < hoje)
    aVencer7dias: 5,   // (Firestore: promissórias vencendo nos próximos 7 dias)
  },

  // Recebimentos no mês atual
  recebimentosMes: 4_200.00,

  // Indicadores de variação (em % em relação ao mês anterior)
  // Substituir futuramente com cálculo real
  variacoes: {
    saldo:      +2.5,
    patrimonio: +1.8,
    promissorias: +4.2,
    recebimentos: +12.0,
  },

  // Últimas movimentações (Firestore: coleção 'movimentacoes', ordenada por data desc, limit 6)
  movimentacoesRecentes: [
    { id: 1, tipo: 'receita',      descricao: 'Pgto João Silva – Parc. 3/6',  valor: 850.00,  data: '2026-07-24' },
    { id: 2, tipo: 'despesa',      descricao: 'Saque HMCRED – Marcos',         valor: 1_200.00, data: '2026-07-23' },
    { id: 3, tipo: 'receita',      descricao: 'Pgto Maria Santos – Parc. 1/3', valor: 450.00,  data: '2026-07-22' },
    { id: 4, tipo: 'transferencia',descricao: 'Depósito bancário',             valor: 5_000.00, data: '2026-07-21' },
    { id: 5, tipo: 'receita',      descricao: 'Pgto Carlos Mendes – Parc. 2/4',valor: 600.00,  data: '2026-07-20' },
    { id: 6, tipo: 'despesa',      descricao: 'Taxa administrativa',           valor: 85.00,   data: '2026-07-19' },
  ],

  // Alertas recentes (Substituído pelo NotificacoesModule)
  alertas: [],
};


/* ─────────────────────────────────────────────────────────────────────────────
   FUNÇÕES AUXILIARES INTERNAS
   Funções privadas do módulo, não exportadas.
───────────────────────────────────────────────────────────────────────────── */

/**
 * Gera o HTML de um card de estatística (stat-card).
 *
 * @param {object} opcoes - Configurações do card
 * @param {string}  opcoes.label       - Título do card (ex: "Saldo Disponível")
 * @param {string}  opcoes.valor       - Valor formatado (ex: "R$ 15.430,50")
 * @param {string}  opcoes.icone       - Nome do ícone Material Symbols
 * @param {string}  [opcoes.classExtra]  - Classe extra no card (ex: "card-gold")
 * @param {string}  [opcoes.classeValor] - Classe de cor no valor (ex: "text-gold")
 * @param {string}  [opcoes.classeIcone] - Estilos inline do container do ícone
 * @param {string}  [opcoes.subTexto]    - Texto de rodapé do card
 * @param {string}  [opcoes.rota]        - Rota de navegação ao clicar (opcional)
 * @returns {string} HTML do card
 */
function gerarStatCard({ label, valor, icone, classExtra = '', classeValor = '', classeIcone = '', subTexto = '', rota = '' }) {
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
      ${subTexto ? `<div class="stat-card-sub">${subTexto}</div>` : ''}
    </div>
  `;
}

/**
 * Gera o HTML de um item da lista de movimentações recentes.
 *
 * @param {object} tx - Objeto de movimentação
 * @param {string} tx.tipo       - 'receita' | 'despesa' | 'transferencia'
 * @param {string} tx.descricao  - Descrição da movimentação
 * @param {number} tx.valor      - Valor numérico
 * @param {string} tx.data       - Data no formato 'AAAA-MM-DD'
 * @returns {string} HTML do item
 */
function gerarItemMovimentacao(tx) {
  // Define ícone conforme o tipo de movimentação
  const iconeMap = {
    receita:      'arrow_downward',
    despesa:      'arrow_upward',
    transferencia:'swap_horiz',
  };
  const icone = iconeMap[tx.tipo] || 'sync_alt';

  // Prefixo de sinal para exibição do valor
  const prefixo = tx.tipo === 'despesa' ? '−' : (tx.tipo === 'receita' ? '+' : '');

  return `
    <div class="tx-item">
      <div class="tx-info">
        <div class="tx-icon ${tx.tipo}" aria-hidden="true">
          <span class="material-symbols-outlined">${icone}</span>
        </div>
        <div>
          <p class="tx-desc">${tx.descricao}</p>
          <p class="tx-date">${formatarData(tx.data)}</p>
        </div>
      </div>
      <div class="tx-value ${tx.tipo} value-sensitive" aria-label="${formatarMoeda(tx.valor)}">
        ${prefixo} ${formatarMoeda(tx.valor)}
      </div>
    </div>
  `;
}

/**
 * Gera o HTML de um item de alerta consolidado (sem nomes).
 *
 * @param {object} alerta
 * @param {string} alerta.tipo   - 'vencido' | 'avencer' | 'info'
 * @param {string} alerta.texto  - Mensagem do alerta
 * @param {string} alerta.sub    - Subtexto (ex: valor formatado)
 * @returns {string} HTML do item de alerta
 */
function gerarItemAlerta(alerta) {
  const configTipo = {
    vencido: { icone: 'error',        cor: 'text-danger',  label: 'Vencido' },
    avencer: { icone: 'schedule',     cor: 'text-warning', label: 'A vencer' },
    info:    { icone: 'info',         cor: 'text-gold',    label: 'Info' },
  };
  const config = configTipo[alerta.tipo] || configTipo.info;

  return `
    <div class="alerta-item" style="padding: var(--space-3) 0; border-bottom: 1px solid var(--border-default); display: flex; align-items: center; gap: var(--space-3);">
      <span class="material-symbols-outlined ${config.cor} icon-sm" aria-hidden="true">${config.icone}</span>
      <div class="alerta-corpo" style="flex: 1;">
        <p class="alerta-texto" style="margin: 0; font-size: var(--text-sm); font-weight: var(--font-medium);">${alerta.texto}</p>
        <p class="tx-date" style="margin: 0; font-size: var(--text-xs); color: var(--text-muted);">${alerta.sub}</p>
      </div>
    </div>
  `;
}

/**
 * Gera o HTML do mini-gráfico de barras simulado (sem biblioteca externa).
 * Representa a evolução do patrimônio nos últimos 6 meses.
 * Substituir por gráfico real (Chart.js ou canvas) quando integrar Firestore.
 *
 * @returns {string} HTML do gráfico placeholder
 */
function gerarGraficoPlaceholder() {
  // Dados fictícios de evolução (em R$) — substituir com dados reais
  const dados = [
    { mes: 'Fev', valor: 38_000 },
    { mes: 'Mar', valor: 39_500 },
    { mes: 'Abr', valor: 38_800 },
    { mes: 'Mai', valor: 41_200 },
    { mes: 'Jun', valor: 43_700 },
    { mes: 'Jul', valor: 45_200 },
  ];

  const maximo = Math.max(...dados.map(d => d.valor));

  // Gera cada barra como percentual da altura máxima
  const barras = dados.map((d, i) => {
    const altura = Math.round((d.valor / maximo) * 100);
    const isUltimo = i === dados.length - 1;
    return `
      <div class="grafico-col">
        <div class="grafico-barra-wrap">
          <div class="grafico-barra ${isUltimo ? 'ativa' : ''}"
               style="height: ${altura}%"
               title="${d.mes}: ${formatarMoeda(d.valor)}">
          </div>
        </div>
        <span class="grafico-label">${d.mes}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="grafico-container" aria-label="Gráfico de evolução do patrimônio (dados mockados)">
      <div class="grafico-barras">
        ${barras}
      </div>
      <p class="grafico-nota">
        <span class="material-symbols-outlined icon-sm text-muted">info</span>
        Dados simulados · Integração com Firestore nos próximos módulos
      </p>
    </div>
  `;
}

/**
 * Gera o HTML de um botão de ação rápida.
 *
 * @param {string} icone   - Nome do ícone Material Symbols
 * @param {string} label   - Texto do botão
 * @param {string} rota    - Hash de destino (ex: 'promissorias')
 * @param {string} cor     - Classe de cor do ícone (ex: 'text-gold')
 * @returns {string} HTML do botão
 */
function gerarAtalho(icone, label, rota, cor = '') {
  return `
    <button class="shortcut-btn" data-nav="${rota}"
            aria-label="Ir para ${label}">
      <span class="material-symbols-outlined ${cor}" style="font-size: 28px;" aria-hidden="true">${icone}</span>
      <span>${label}</span>
    </button>
  `;
}


/* ─────────────────────────────────────────────────────────────────────────────
   MÓDULO EXPORTADO
   O roteador (router.js) chama DashboardModule.renderDashboard(container).
───────────────────────────────────────────────────────────────────────────── */

let handleNotificacoesAtualizadas = null;

export const DashboardModule = {

  /**
   * Renderiza a tela completa do Dashboard.
   *
   * @param {HTMLElement} container - Elemento #main-content onde injetar o HTML.
   *
   * PARA ALTERAR: edite as seções marcadas com comentários específicos.
   * Cada bloco HTML é gerado por uma função auxiliar acima.
   */
  async renderDashboard(container) {
    // Tela de carregamento enquanto busca do Firestore
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-16);">
        <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
        <p style="color: var(--text-muted); margin-top: var(--space-4);">Carregando dashboard...</p>
      </div>
    `;

    // Buscar dados reais de Promissórias
    const promissoriasRes = await FirestoreService.listar('promissorias');
    if (promissoriasRes.sucesso) {
      let promissoriasAtivas = 0;
      let lucroEstimado = 0;
      
      promissoriasRes.dados.forEach(p => {
        if (p.status !== 'recebida') {
          promissoriasAtivas += (p.valorInvestido || 0);
          lucroEstimado += (p.lucro || 0);
        }
      });
      
      mockDashboardData.promissoriasAtivas = promissoriasAtivas;
      mockDashboardData.lucroEstimado = lucroEstimado;
    }

    // Obter dados do usuário autenticado via AuthService
    const usuario = AuthService.obterUsuarioAtual();
    const email = usuario?.email || '';

    // Extrair nome amigável do e-mail (parte antes do @)
    // Futuro: usar displayName do perfil Firebase quando disponível
    const nomeAmigavel = usuario?.displayName
      || email.split('@')[0]
      || 'Usuário';

    // Hora atual para saudação contextual (Bom dia / Boa tarde / Boa noite)
    const hora = new Date().getHours();
    let saudacao = 'Bom dia';
    if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
    else if (hora >= 18) saudacao = 'Boa noite';

    // Gerar HTML da lista de movimentações recentes
    const movimentacoesHtml = mockDashboardData.movimentacoesRecentes.length > 0
      ? mockDashboardData.movimentacoesRecentes.map(gerarItemMovimentacao).join('')
      : '<p class="text-muted text-sm" style="padding: var(--space-4) 0;">Nenhuma movimentação recente.</p>';

    // Obter resumo de notificações
    const resumoNotificacoes = NotificacoesModule.obterResumoDashboard();
    let alertasHtml = '';

    if (resumoNotificacoes.carregando) {
      alertasHtml = '<p class="text-muted text-sm">Carregando alertas...</p>';
    } else if (resumoNotificacoes.totalPendencias === 0) {
      alertasHtml = '<p class="text-success text-sm"><span class="material-symbols-outlined icon-sm" style="vertical-align: middle;">check_circle</span> Tudo em dia!</p>';
    } else {
      const listaAlertasConsolidados = [];
      if (resumoNotificacoes.vencidas.quantidade > 0) {
        listaAlertasConsolidados.push({
          tipo: 'vencido',
          texto: `${resumoNotificacoes.vencidas.quantidade} pendência${resumoNotificacoes.vencidas.quantidade > 1 ? 's' : ''} em atraso`,
          sub: `Valor total: ${formatarMoeda(resumoNotificacoes.vencidas.valor)}`
        });
      }
      if (resumoNotificacoes.aVencer.quantidade > 0) {
        listaAlertasConsolidados.push({
          tipo: 'avencer',
          texto: `${resumoNotificacoes.aVencer.quantidade} pendência${resumoNotificacoes.aVencer.quantidade > 1 ? 's' : ''} vencendo hoje/amanhã`,
          sub: `Valor total: ${formatarMoeda(resumoNotificacoes.aVencer.valor)}`
        });
      }
      alertasHtml = listaAlertasConsolidados.map(gerarItemAlerta).join('');
    }

    // Variações formatadas para os cards
    const varSaldo = mockDashboardData.variacoes.saldo;
    const varPatrimonio = mockDashboardData.variacoes.patrimonio;
    const varPromissorias = mockDashboardData.variacoes.promissorias;
    const varRecebimentos = mockDashboardData.variacoes.recebimentos;

    // Atualizar dados de cobranças pendentes baseando-se nas notificações, se disponíveis
    let qteCobrancasVencidas = mockDashboardData.cobrancas.vencidas;
    let qteCobrancasAVencer = mockDashboardData.cobrancas.aVencer7dias;
    // O Dashboard original usava aVencer7dias. Para simplificar, manteremos o mock aqui, 
    // mas o card de Alertas já está puxando do NotificacoesModule.
    
    const totalCobrancas = qteCobrancasVencidas + qteCobrancasAVencer;
    const subCobrancas = `
      <span class="material-symbols-outlined icon-sm text-danger">error</span>
      <span class="text-danger">${qteCobrancasVencidas} vencida${qteCobrancasVencidas !== 1 ? 's' : ''}</span>
      · ${qteCobrancasAVencer} a vencer em 7 dias
    `;

    // ── INJETAR HTML NO CONTAINER ──────────────────────────────────────────
    container.innerHTML = `

      <!-- ══ CABEÇALHO DA PÁGINA ══════════════════════════════════════════ -->
      <div class="page-header dashboard-page-header">
        <div>
          <h2 class="page-title">${saudacao}, ${nomeAmigavel} 👋</h2>
          <p class="page-subtitle">Aqui está o resumo das suas finanças de hoje.</p>
        </div>
        <!-- Badge de modo demonstração -->
        <div class="badge badge-gold" title="Os dados são simulados e serão substituídos por dados reais do Firestore">
          <span class="material-symbols-outlined icon-sm">science</span>
          Modo Demo
        </div>
      </div>

      <!-- ══ CARDS PRINCIPAIS (STATS) ═════════════════════════════════════ -->
      <!--
        Cada card corresponde a um KPI principal do sistema.
        A classe 'value-sensitive' faz o valor ser mascarado
        quando o usuário ativa o botão de ocultar valores (ver app.js).
      -->
      <div class="stats-grid" id="stats-grid" role="region" aria-label="Indicadores financeiros">

        ${gerarStatCard({
          label: 'Saldo Disponível',
          valor: formatarMoeda(mockDashboardData.saldoTotal),
          icone: 'account_balance_wallet',
          classExtra: 'card-gold',
          classeValor: 'text-gold',
          subTexto: `
            <span class="material-symbols-outlined icon-sm ${varSaldo >= 0 ? 'text-success' : 'text-danger'}">
              ${varSaldo >= 0 ? 'trending_up' : 'trending_down'}
            </span>
            <span class="${varSaldo >= 0 ? 'text-success' : 'text-danger'}">
              ${varSaldo >= 0 ? '+' : ''}${varSaldo}%
            </span>
            em relação ao mês anterior
          `,
          rota: 'dinheiro',
        })}

        ${gerarStatCard({
          label: 'Patrimônio Total',
          valor: formatarMoeda(mockDashboardData.patrimonio),
          icone: 'account_balance',
          classeIcone: 'background-color: var(--bg-hover); color: var(--text-primary);',
          subTexto: `
            <span class="material-symbols-outlined icon-sm ${varPatrimonio >= 0 ? 'text-success' : 'text-danger'}">
              ${varPatrimonio >= 0 ? 'trending_up' : 'trending_down'}
            </span>
            <span class="${varPatrimonio >= 0 ? 'text-success' : 'text-danger'}">
              ${varPatrimonio >= 0 ? '+' : ''}${varPatrimonio}%
            </span>
            neste mês
          `,
          rota: 'patrimonio',
        })}

        ${gerarStatCard({
          label: 'Em Promissórias',
          valor: formatarMoeda(mockDashboardData.promissoriasAtivas),
          icone: 'receipt_long',
          subTexto: `
            <span class="material-symbols-outlined icon-sm text-success">trending_up</span>
            Lucro estimado:
            <span class="text-success value-sensitive" style="margin-left: 4px;">
              ${formatarMoeda(mockDashboardData.lucroEstimado)}
            </span>
          `,
          rota: 'promissorias',
        })}

        ${gerarStatCard({
          label: 'Recebimentos no Mês',
          valor: formatarMoeda(mockDashboardData.recebimentosMes),
          icone: 'payments',
          classeIcone: 'background-color: var(--color-success-muted); color: var(--color-success);',
          subTexto: `
            <span class="material-symbols-outlined icon-sm ${varRecebimentos >= 0 ? 'text-success' : 'text-danger'}">
              ${varRecebimentos >= 0 ? 'arrow_upward' : 'arrow_downward'}
            </span>
            <span class="${varRecebimentos >= 0 ? 'text-success' : 'text-danger'}">
              ${varRecebimentos >= 0 ? '+' : ''}${varRecebimentos}%
            </span>
            vs. mês anterior
          `,
        })}

        ${gerarStatCard({
          label: 'Cobranças Pendentes',
          valor: String(totalCobrancas),
          icone: 'warning',
          classeIcone: 'background-color: var(--color-danger-muted); color: var(--color-danger);',
          classeValor: 'text-danger',
          subTexto: subCobrancas,
          rota: 'cobrancas',
        })}

        ${gerarStatCard({
          label: 'Operações HMCRED',
          valor: formatarMoeda(mockDashboardData.operacoesHmcred),
          icone: 'local_atm',
          classeIcone: 'background-color: var(--color-info-muted); color: var(--color-info);',
          subTexto: `
            <span class="material-symbols-outlined icon-sm">people</span>
            Crédito próprio em circulação
          `,
          rota: 'hmcred',
        })}

      </div><!-- /.stats-grid -->


      <!-- ══ ÁREA DE CONTEÚDO INFERIOR ════════════════════════════════════ -->
      <div class="dashboard-grid" id="dashboard-grid">

        <!-- ── COLUNA ESQUERDA: Movimentações + Gráfico ──────────────────── -->
        <div class="dashboard-col" id="dashboard-col-esquerda">

          <!-- Movimentações Recentes -->
          <div class="dashboard-section-header">
            <h3 class="text-lg font-semibold">Movimentações Recentes</h3>
            <a href="#cobrancas" class="text-gold text-sm font-medium dashboard-ver-mais" aria-label="Ver extrato completo">
              Ver tudo
              <span class="material-symbols-outlined icon-sm" aria-hidden="true">arrow_forward</span>
            </a>
          </div>

          <div class="card" id="card-movimentacoes">
            <div class="card-body" style="padding: var(--space-4) var(--space-6);">
              <div class="tx-list" role="list" aria-label="Últimas movimentações">
                ${movimentacoesHtml}
              </div>
            </div>
          </div>

          <!-- Gráfico de Evolução do Patrimônio -->
          <div class="dashboard-section-header" style="margin-top: var(--space-8);">
            <h3 class="text-lg font-semibold">Evolução do Patrimônio</h3>
            <span class="badge badge-neutral">Últimos 6 meses</span>
          </div>

          <div class="card" id="card-grafico">
            <div class="card-body">
              ${gerarGraficoPlaceholder()}
            </div>
          </div>

        </div><!-- /dashboard-col-esquerda -->


        <!-- ── COLUNA DIREITA: Alertas + Ações Rápidas + Info ────────────── -->
        <div class="dashboard-col" id="dashboard-col-direita">

          <!-- Alertas Recentes -->
          <div class="dashboard-section-header">
            <h3 class="text-lg font-semibold">Alertas Recentes</h3>
            <a href="#notificacoes" class="text-gold text-sm font-medium dashboard-ver-mais" aria-label="Ver todas as notificações">
              Ver tudo
              <span class="material-symbols-outlined icon-sm" aria-hidden="true">arrow_forward</span>
            </a>
          </div>

          <div class="card" id="card-alertas">
            <div class="card-body" style="padding: var(--space-4) var(--space-6);">
              <div class="alerta-list" role="list" aria-label="Alertas recentes">
                ${alertasHtml}
              </div>
            </div>
          </div>

          <!-- Ações Rápidas -->
          <div class="dashboard-section-header" style="margin-top: var(--space-6);">
            <h3 class="text-lg font-semibold">Ações Rápidas</h3>
          </div>

          <div class="shortcut-grid" id="shortcut-grid" role="group" aria-label="Ações rápidas">
            ${gerarAtalho('post_add',    'Nova Promissória', 'promissorias', 'text-gold')}
            ${gerarAtalho('person_add',  'Novo Cliente',     'clientes',     '')}
            ${gerarAtalho('payments',    'Registrar Pgto',   'cobrancas',    'text-success')}
            ${gerarAtalho('swap_horiz',  'Transferência',    'dinheiro',     'text-info')}
            ${gerarAtalho('local_atm',   'HMCRED',           'hmcred',       '')}
            ${gerarAtalho('receipt_long','Promissórias',     'promissorias', '')}
          </div>

          <!-- Card de Aviso: Modo Demo -->
          <div class="card card-demo" id="card-demo" style="margin-top: var(--space-6);">
            <div class="card-body">
              <div class="demo-info">
                <span class="material-symbols-outlined text-gold" aria-hidden="true">science</span>
                <div>
                  <h4 class="text-sm font-semibold text-gold">Modo Demonstração</h4>
                  <p class="text-xs text-muted" style="margin-top: var(--space-1); line-height: 1.5;">
                    Os dados exibidos neste painel são <strong>simulados</strong> (mockados)
                    para demonstrar a estrutura visual. A integração real com o Firestore
                    ocorrerá nos próximos módulos.
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div><!-- /dashboard-col-direita -->

      </div><!-- /.dashboard-grid -->
    `;

    // Registrar eventos de interação após injetar o HTML
    this._registrarEventos(container);
  },


  /**
   * Registra os eventos de interação da tela do Dashboard.
   * Chamado internamente após renderDashboard injetar o HTML.
   *
   * PARA ALTERAR: adicione novos event listeners neste método.
   *
   * @param {HTMLElement} container - O container do Dashboard
   */
  _registrarEventos(container) {
    // ── Navegação pelos atalhos rápidos e cards clicáveis ────────────────
    // Todos os elementos com [data-nav] navegam para a rota especificada
    container.querySelectorAll('[data-nav]').forEach(elemento => {
      const rota = elemento.getAttribute('data-nav');
      if (!rota) return;

      // Clique
      elemento.addEventListener('click', () => {
        window.location.hash = rota;
      });

      // Suporte a teclado (Enter / Espaço)
      elemento.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.location.hash = rota;
        }
      });
    });
    
    // Atualiza o dashboard se as notificações carregarem depois do dashboard
    if (handleNotificacoesAtualizadas) {
      window.removeEventListener('notificacoes-atualizadas', handleNotificacoesAtualizadas);
    }
    
    handleNotificacoesAtualizadas = () => {
      // Evitar re-renderizar a tela toda e causar piscar excessivo, apenas atualiza o html do card
      const cardBody = container.querySelector('#card-alertas .alerta-list');
      if (cardBody) {
        const resumo = NotificacoesModule.obterResumoDashboard();
        if (!resumo.carregando) {
          if (resumo.totalPendencias === 0) {
            cardBody.innerHTML = '<p class="text-success text-sm"><span class="material-symbols-outlined icon-sm" style="vertical-align: middle;">check_circle</span> Tudo em dia!</p>';
          } else {
            const lista = [];
            if (resumo.vencidas.quantidade > 0) {
              lista.push({
                tipo: 'vencido',
                texto: `${resumo.vencidas.quantidade} pendência${resumo.vencidas.quantidade > 1 ? 's' : ''} em atraso`,
                sub: `Valor total: ${formatarMoeda(resumo.vencidas.valor)}`
              });
            }
            if (resumo.aVencer.quantidade > 0) {
              lista.push({
                tipo: 'avencer',
                texto: `${resumo.aVencer.quantidade} pendência${resumo.aVencer.quantidade > 1 ? 's' : ''} vencendo hoje/amanhã`,
                sub: `Valor total: ${formatarMoeda(resumo.aVencer.valor)}`
              });
            }
            cardBody.innerHTML = lista.map(gerarItemAlerta).join('');
          }
        }
      }
    };
    
    window.addEventListener('notificacoes-atualizadas', handleNotificacoesAtualizadas);
  },
};
