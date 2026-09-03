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
import { escapeHTML } from '../../utils/helpers.js';
import { NotificacoesModule } from '../notificacoes/index.js';

/* ─────────────────────────────────────────────────────────────────────────────
   DADOS MOCKADOS
   Estrutura pensada para substituição direta por dados reais do Firestore.
   Cada campo corresponde a um documento ou agregação esperada no banco.
   Para substituir: buscar via FirestoreService e atribuir ao mesmo objeto.
───────────────────────────────────────────────────────────────────────────── */
// O Dashboard agora utiliza dados reais do Firestore.
// As movimentações recentes ficarão temporariamente vazias até a implementação
// do histórico consolidado (lançamentos) no módulo Dinheiro.


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
          <p class="tx-desc">${escapeHTML(tx.descricao)}</p>
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
 * Inicia a renderização do gráfico de evolução patrimonial real usando Chart.js
 * Busca os últimos 6 meses da coleção patrimonio_historico.
 */
async function renderizarGraficoReal() {
  const canvas = document.getElementById('chart-evolucao');
  if (!canvas) return;

  const res = await FirestoreService.listar('patrimonio_historico', { ordenarPor: 'mesAno', direcao: 'desc', maxLimite: 6 });
  
  let labels = [];
  let data = [];

  if (res.sucesso && res.dados.length > 0) {
    // A ordem vem desc (mais recente primeiro), precisamos reverter para o gráfico (mais antigo para mais recente)
    const historico = res.dados.reverse();
    labels = historico.map(h => {
      // mesAno é 'YYYY-MM'. Vamos exibir ex: 'Ago/26'
      const [ano, mes] = h.mesAno.split('-');
      const dataStr = new Date(ano, mes - 1, 1);
      return dataStr.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '').replace(' de ', '/');
    });
    data = historico.map(h => {
      return (h.hmcred || 0) + (h.dinheiro || 0) + (h.promissorias || 0) + (h.cartoes || 0);
    });
  } else {
    // Fallback se não houver dados ainda
    const mesAtual = new Date();
    labels = [mesAtual.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '').replace(' de ', '/')];
    const patAtual = document.querySelector('.card-clickable[data-nav="patrimonio"] .stat-card-value');
    const valorPatAtual = patAtual ? parseFloat(patAtual.textContent.replace(/[R$\s\.]/g, '').replace(',', '.')) : 0;
    data = [valorPatAtual || 0];
  }

  // Verifica se já existe um gráfico nesta canvas e destroi para evitar sobreposição
  if (window.myChartEvolucao) {
    window.myChartEvolucao.destroy();
  }

  const ctx = canvas.getContext('2d');
  
  // Apenas renderiza se o Chart.js estiver disponível (carregado do CDN)
  if (typeof Chart !== 'undefined') {
    window.myChartEvolucao = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Patrimônio',
          data: data,
          backgroundColor: '#d4af37',
          borderRadius: 4,
          barThickness: 'flex',
          maxBarThickness: 40
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => formatarMoeda(context.raw)
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => 'R$ ' + (value / 1000) + 'k'
            }
          }
        }
      }
    });
  }
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
   * Ponto de entrada do módulo Dashboard.
   * Chamado pelo router.js.
   *
   * Fluxo:
   *   1. Verifica se usuário está autenticado
   *   2. Busca saldo total (Módulo Dinheiro), patrimônio total, HMCRED e Promissórias
   *   3. Renderiza a estrutura do Dashboard com indicadores e skeleton loader
   *   4. Inicia listeners assíncronos para histórico de lançamentos e gráfico
   *
   * @param {HTMLElement} container - Onde a view será injetada
   */
  async renderDashboard(container) {
    // Tela de carregamento enquanto busca do Firestore
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-16);">
        <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
        <p style="color: var(--text-muted); margin-top: var(--space-4);">Carregando dashboard...</p>
      </div>
    `;

    // Variáveis locais para acumular dados do Firestore
    let promissoriasAtivas = 0;
    let lucroEstimado = 0;
    let promissoriasRes = { sucesso: false, dados: [] };

    // Buscar dados reais de Promissórias
    try {
      promissoriasRes = await FirestoreService.listar('promissorias');
      if (promissoriasRes.sucesso) {
        promissoriasRes.dados.forEach(p => {
          if (p.status !== 'recebida') {
            promissoriasAtivas += (p.valorInvestido || 0);
            lucroEstimado += (p.lucro || 0);
          }
        });
      }
    } catch (e) {
      console.warn('[Dashboard] Falha ao buscar promissórias:', e);
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

    // Gerar HTML da lista de movimentações recentes (vazia por enquanto até ter tabela de histórico)
    const movimentacoesHtml = '<p class="text-muted text-sm" style="padding: var(--space-4) 0;"><span class="material-symbols-outlined icon-sm" style="vertical-align: middle;">history</span> O histórico consolidado será implementado no próximo módulo.</p>';

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

    // Variações formatadas para os cards (temporariamente zero até implementarmos histórico)
    const varSaldo = 0;
    const varPatrimonio = 0;
    const varPromissorias = 0;
    const varRecebimentos = 0;

    // Obter dados adicionais do banco (com proteção contra falhas individuais)
    let resDinheiro   = { sucesso: false, dados: [] };
    let resPatrimonio = { sucesso: false, dados: null };
    let resHmcred     = { sucesso: false, dados: [] };

    try {
      [resDinheiro, resPatrimonio, resHmcred] = await Promise.all([
        FirestoreService.listar('dinheiro_contas'),
        FirestoreService.obter('patrimonio', 'resumo'),
        FirestoreService.listar('hmcred_operacoes')
      ]);
    } catch (e) {
      console.warn('[Dashboard] Falha ao buscar dados financeiros:', e);
    }

    let saldoTotal = 0;
    if (resDinheiro.sucesso) {
      saldoTotal = resDinheiro.dados.reduce((acc, c) => acc + (c.saldo || 0), 0);
    }

    let patrimonioTotal = 0;
    if (resPatrimonio.sucesso && resPatrimonio.dados) {
      const d = resPatrimonio.dados;
      patrimonioTotal = (d.hmcred || 0) + (d.dinheiro || 0) + (d.promissorias || 0) + (d.cartoes || 0);
    }

    let operacoesHmcred = 0;
    let recebimentosMes = 0;
    const mesAtual = new Date().getMonth();
    const anoAtual = new Date().getFullYear();

    if (resHmcred.sucesso) {
      resHmcred.dados.forEach(op => {
        if (op.status !== 'pago') {
          operacoesHmcred += (op.valorConcedido || 0);
        } else if (op.dataPagamento) {
          const dPag = new Date(op.dataPagamento);
          if (dPag.getMonth() === mesAtual && dPag.getFullYear() === anoAtual) {
            recebimentosMes += (op.valorReceber || 0);
          }
        }
      });
    }

    // Soma pagamentos de promissórias ao recebimento do mês
    if (promissoriasRes.sucesso) {
      promissoriasRes.dados.forEach(p => {
        if (p.status === 'recebida' && p.dataRecebimento) {
          const dPag = new Date(p.dataRecebimento);
          if (dPag.getMonth() === mesAtual && dPag.getFullYear() === anoAtual) {
            recebimentosMes += (p.valorInvestido + (p.lucroAcumulado || p.lucro || 0));
          }
        }
        if (p.pagosParcelas && p.pagosParcelas.length > 0) {
          p.pagosParcelas.forEach(parc => {
            if (parc.dataPagamento) {
              const dPag = new Date(parc.dataPagamento);
              if (dPag.getMonth() === mesAtual && dPag.getFullYear() === anoAtual) {
                recebimentosMes += (parc.parcela || 0);
              }
            }
          });
        }
        if (p.pagosJuros && p.pagosJuros.length > 0) {
          p.pagosJuros.forEach(j => {
            if (j.dataPagamento) {
              const dPag = new Date(j.dataPagamento);
              if (dPag.getMonth() === mesAtual && dPag.getFullYear() === anoAtual) {
                recebimentosMes += (j.valor || 0);
              }
            }
          });
        }
      });
    }

    let qteCobrancasVencidas = resumoNotificacoes.vencidas.quantidade || 0;
    let qteCobrancasAVencer = resumoNotificacoes.aVencer.quantidade || 0;
    
    const totalCobrancas = qteCobrancasVencidas + qteCobrancasAVencer;
    const subCobrancas = totalCobrancas > 0 ? `
      <span class="material-symbols-outlined icon-sm text-danger">error</span>
      <span class="text-danger">${qteCobrancasVencidas} vencida${qteCobrancasVencidas !== 1 ? 's' : ''}</span>
      · ${qteCobrancasAVencer} a vencer em 7 dias
    ` : '<span class="text-success"><span class="material-symbols-outlined icon-sm" style="vertical-align: middle;">check_circle</span> Nenhuma pendência próxima</span>';

    // ── INJETAR HTML NO CONTAINER ──────────────────────────────────────────
    container.innerHTML = `

      <!-- ══ CABEÇALHO DA PÁGINA ══════════════════════════════════════════ -->
      <div class="page-header dashboard-page-header">
        <div>
          <h2 class="page-title">${saudacao}, ${nomeAmigavel} 👋</h2>
          <p class="page-subtitle">Aqui está o resumo das suas finanças de hoje.</p>
        </div>
        <!-- Badge de modo demonstração removido -->
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
          valor: formatarMoeda(saldoTotal),
          icone: 'account_balance_wallet',
          classExtra: 'card-gold',
          classeValor: 'text-gold',
          subTexto: `Soma das contas de dinheiro`,
          rota: 'dinheiro',
        })}

        ${gerarStatCard({
          label: 'Patrimônio Total',
          valor: formatarMoeda(patrimonioTotal),
          icone: 'account_balance',
          classeIcone: 'background-color: var(--bg-hover); color: var(--text-primary);',
          subTexto: `Total consolidado`,
          rota: 'patrimonio',
        })}

        ${gerarStatCard({
          label: 'Em Promissórias',
          valor: formatarMoeda(promissoriasAtivas),
          icone: 'receipt_long',
          subTexto: `
            <span class="material-symbols-outlined icon-sm text-success">trending_up</span>
            Lucro esperado:
            <span class="text-success value-sensitive" style="margin-left: 4px;">
              ${formatarMoeda(lucroEstimado)}
            </span>
          `,
          rota: 'promissorias',
        })}

        ${gerarStatCard({
          label: 'Recebimentos no Mês',
          valor: formatarMoeda(recebimentosMes),
          icone: 'payments',
          classeIcone: 'background-color: var(--color-success-muted); color: var(--color-success);',
          subTexto: `Pagamentos recebidos (HMCRED e Promissórias)`,
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
          valor: formatarMoeda(operacoesHmcred),
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
              <div class="tx-list" id="lista-lancamentos-recentes" role="list" aria-label="Últimas movimentações">
                <p class="text-muted text-sm"><span class="material-symbols-outlined icon-sm spin">sync</span> Carregando histórico...</p>
              </div>
            </div>
          </div>

          <!-- Gráfico de Evolução do Patrimônio -->
          <div class="dashboard-section-header" style="margin-top: var(--space-8);">
            <h3 class="text-lg font-semibold">Evolução do Patrimônio</h3>
            <span class="badge badge-neutral">Últimos 6 meses</span>
          </div>

          <div class="card" id="card-grafico">
            <div class="card-body" style="height: 300px;">
              <canvas id="chart-evolucao" width="100%" height="250"></canvas>
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

          <!-- Card removido (Modo Demo desativado) -->

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
    // Inicia a renderização do gráfico real
    renderizarGraficoReal();

    // Listener para Lançamentos (Histórico Consolidado)
    if (window.unsubscribeLancamentosHist) {
      window.unsubscribeLancamentosHist();
    }
    
    window.unsubscribeLancamentosHist = FirestoreService.escutar('lancamentos_hist', (lancamentos) => {
      const listaContainer = document.getElementById('lista-lancamentos-recentes');
      if (!listaContainer) return;
      
      if (lancamentos.length === 0) {
        listaContainer.innerHTML = '<p class="text-muted text-sm text-center" style="margin: var(--space-4) 0;">Sem movimentações recentes.</p>';
        return;
      }
      
      listaContainer.innerHTML = lancamentos.map(tx => {
        // Mapear tipos do bd ('receita', 'despesa', etc)
        const itemMockado = {
          tipo: tx.tipo,
          descricao: tx.descricao,
          valor: tx.valor,
          data: tx.data || tx.criadoEm?.toDate()?.toISOString()?.split('T')[0] || new Date().toISOString().split('T')[0]
        };
        return gerarItemMovimentacao(itemMockado);
      }).join('');
    }, { ordenarPor: 'criadoEm', direcao: 'desc', maxLimite: 8 });

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
