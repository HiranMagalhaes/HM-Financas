/**
 * HM Finanças — Módulo: HMCRED (Módulo 5)
 * ============================================================
 * Sistema de crédito próprio do usuário.
 * Controla operações de empréstimos/crédito concedidos, limites e retorno.
 */

'use strict';

import { AuthService } from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, formatarData, parseMoeda } from '../../utils/formatters.js';
import { Router } from '../../router.js';

/* ─────────────────────────────────────────────────────────────────────────────
   ESTADO DO MÓDULO
───────────────────────────────────────────────────────────────────────────── */
let estado = {
  configuracao: { limiteTotal: 0, capitalDisponivel: 0 },
  operacoes: [],
  carregando: true
};
let unsubscribeOperacoes = null;

/* ─────────────────────────────────────────────────────────────────────────────
   FUNÇÕES DE SINCRONIZAÇÃO E FIRESTORE
───────────────────────────────────────────────────────────────────────────── */

/**
 * Atualiza o resumo de patrimônio (bloco HMCRED) com base nos dados atuais.
 * O valor do HMCRED no patrimônio é o capital emprestado (soma das operações abertas ou atrasadas)
 * mais o capital disponível em caixa (se considerarmos que o limite total é dinheiro vivo disponível).
 * Por regra de negócio simplificada: Patrimônio HMCRED = (Capital Emprestado + Capital Disponível)
 * Ou seja, igual ao Limite Total.
 */
async function atualizarPatrimonioHmcred() {
  const resumoExistente = await FirestoreService.obter('patrimonio', 'resumo');
  const patrimonioDocs = resumoExistente.sucesso ? resumoExistente.dados : { hmcred: 0, dinheiro: 0, cartoes: 0 };
  
  // Patrimônio HMCRED reflete o Limite Total (capital que o usuário separou para HMCRED)
  patrimonioDocs.hmcred = estado.configuracao.limiteTotal || 0;

  await FirestoreService.salvar('patrimonio', 'resumo', patrimonioDocs);
}

/**
 * Salva a configuração atual de HMCRED (limites) no Firestore.
 */
async function salvarConfiguracao() {
  await FirestoreService.salvar('hmcred', 'configuracao', estado.configuracao);
  await atualizarPatrimonioHmcred();
}

/**
 * Calcula o capital emprestado (soma das operações que NÃO estão pagas).
 */
function calcularCapitalEmprestado() {
  return estado.operacoes
    .filter(op => op.status !== 'pago')
    .reduce((acc, op) => acc + (op.valorConcedido || 0), 0);
}

/* ─────────────────────────────────────────────────────────────────────────────
   AÇÕES DO USUÁRIO (CRUD)
───────────────────────────────────────────────────────────────────────────── */

/**
 * Configura um limite inicial para HMCRED (útil para o first-run).
 */
async function definirLimiteInicial(evento, container) {
  evento.preventDefault();
  const formData = new FormData(evento.target);
  const valorDigitado = formData.get('limiteTotal');
  const limite = parseMoeda(valorDigitado);

  if (limite <= 0) {
    alert('O limite deve ser maior que zero.');
    return;
  }

  estado.configuracao = {
    limiteTotal: limite,
    capitalDisponivel: limite
  };

  await salvarConfiguracao();
  HmcredModule.renderHmcred(container); // Re-renderiza a tela principal
}

/**
 * Salva uma nova operação de crédito no Firestore.
 */
async function criarOperacao(evento) {
  evento.preventDefault();
  const form = evento.target;
  const formData = new FormData(form);

  const valorConcedido = parseMoeda(formData.get('valorConcedido'));
  const valorReceber = parseMoeda(formData.get('valorReceber'));

  if (valorConcedido > estado.configuracao.capitalDisponivel) {
    alert('Capital disponível insuficiente para essa operação.');
    return;
  }

  const novaOperacao = {
    destino: formData.get('destino'),
    valorConcedido,
    valorReceber,
    taxaJuros: parseFloat(formData.get('taxaJuros')) || 0,
    dataConcessao: formData.get('dataConcessao'),
    dataPrevista: formData.get('dataPrevista'),
    status: 'aberto' // 'aberto', 'pago', 'atrasado'
  };

  // Deduz do capital disponível
  estado.configuracao.capitalDisponivel -= valorConcedido;

  // Salvar a operação e a nova config (em paralelo se possível, mas faremos sequencial para garantir)
  const resOp = await FirestoreService.criar('hmcred_operacoes', novaOperacao);
  if (resOp.sucesso) {
    await salvarConfiguracao();
    fecharModal('modal-nova-operacao');
    form.reset();
  } else {
    alert('Erro ao salvar operação.');
    // Reverte o capital em caso de erro
    estado.configuracao.capitalDisponivel += valorConcedido;
  }
}

/**
 * Marca uma operação como paga e devolve o valor (com lucro) ao capital disponível.
 */
async function marcarComoPaga(id) {
  if (!confirm('Deseja marcar esta operação como PAGA?')) return;

  const operacao = estado.operacoes.find(op => op.id === id);
  if (!operacao || operacao.status === 'pago') return;

  // Atualiza operação
  await FirestoreService.atualizar('hmcred_operacoes', id, { status: 'pago', dataPagamento: new Date().toISOString() });

  // Devolve ao caixa o valor a receber (concedido + lucro)
  estado.configuracao.capitalDisponivel += operacao.valorReceber;
  // O limite total também cresce pelo lucro obtido (reinvestimento)
  const lucro = operacao.valorReceber - operacao.valorConcedido;
  estado.configuracao.limiteTotal += lucro;

  await salvarConfiguracao();
}

/**
 * Exclui uma operação. Se estava em aberto, estorna o valor concedido ao capital disponível.
 */
async function excluirOperacao(id) {
  if (!confirm('Atenção: Tem certeza que deseja excluir esta operação permanentemente?')) return;

  const operacao = estado.operacoes.find(op => op.id === id);
  if (!operacao) return;

  await FirestoreService.excluir('hmcred_operacoes', id);

  // Se não estava pago, estorna
  if (operacao.status !== 'pago') {
    estado.configuracao.capitalDisponivel += operacao.valorConcedido;
    await salvarConfiguracao();
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO
───────────────────────────────────────────────────────────────────────────── */

function renderizarModais() {
  return `
    <div class="modal" id="modal-nova-operacao">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">Nova Operação de Crédito</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-nova-operacao').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-nova-operacao">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Destino (Cliente / Nome)</label>
              <input type="text" name="destino" class="form-input" required>
            </div>
            <div class="form-row" style="display: flex; gap: var(--space-4);">
              <div class="form-group" style="flex: 1;">
                <label class="form-label">Valor Concedido (R$)</label>
                <input type="text" name="valorConcedido" class="form-input" placeholder="0,00" required>
              </div>
              <div class="form-group" style="flex: 1;">
                <label class="form-label">Taxa Juros (%)</label>
                <input type="number" step="0.01" name="taxaJuros" class="form-input" placeholder="Ex: 5">
              </div>
            </div>
            <div class="form-row" style="display: flex; gap: var(--space-4);">
              <div class="form-group" style="flex: 1;">
                <label class="form-label">Valor a Receber (R$)</label>
                <input type="text" name="valorReceber" class="form-input" placeholder="0,00" required>
              </div>
              <div class="form-group" style="flex: 1;">
                <label class="form-label">Data Concessão</label>
                <input type="date" name="dataConcessao" class="form-input" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Data Prevista p/ Retorno</label>
              <input type="date" name="dataPrevista" class="form-input" required>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-nova-operacao').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">Conceder Crédito</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderizarLinhaOperacao(op) {
  const badges = {
    aberto: '<span class="badge badge-warning">Em aberto</span>',
    pago: '<span class="badge badge-success">Pago</span>',
    atrasado: '<span class="badge badge-danger">Atrasado</span>',
  };

  return `
    <tr>
      <td>${op.destino}</td>
      <td class="value-sensitive">${formatarMoeda(op.valorConcedido)}</td>
      <td class="value-sensitive text-success">${formatarMoeda(op.valorReceber)}</td>
      <td>${formatarData(op.dataPrevista)}</td>
      <td>${badges[op.status] || op.status}</td>
      <td class="text-right">
        ${op.status !== 'pago' ? `
          <button class="btn btn-ghost btn-icon text-success" title="Marcar como paga" data-acao="pagar" data-id="${op.id}">
            <span class="material-symbols-outlined">check_circle</span>
          </button>
        ` : ''}
        <button class="btn btn-ghost btn-icon text-danger" title="Excluir operação" data-acao="excluir" data-id="${op.id}">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </td>
    </tr>
  `;
}

function renderizarTelaPrincipal(container) {
  // Tela de first-run (se limite total for zero)
  if (!estado.configuracao.limiteTotal || estado.configuracao.limiteTotal <= 0) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">HMCRED</h2>
          <p class="page-subtitle">Sistema de crédito próprio.</p>
        </div>
      </div>
      <div class="card" style="max-width: 500px; margin: 0 auto; text-align: center;">
        <div class="card-body">
          <span class="material-symbols-outlined text-info" style="font-size: 48px; margin-bottom: 16px;">local_atm</span>
          <h3>Defina seu capital inicial</h3>
          <p class="text-muted" style="margin-bottom: 24px;">Qual o montante total destinado para operações de HMCRED?</p>
          <form id="form-limite-inicial">
            <input type="text" name="limiteTotal" class="form-input" placeholder="R$ 0,00" required style="text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 16px;">
            <button type="submit" class="btn btn-primary" style="width: 100%;">Começar Operações</button>
          </form>
        </div>
      </div>
    `;
    const formLimite = document.getElementById('form-limite-inicial');
    formLimite.addEventListener('submit', (e) => definirLimiteInicial(e, container));
    return;
  }

  const capitalEmprestado = calcularCapitalEmprestado();

  // Tela Principal
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">HMCRED</h2>
        <p class="page-subtitle">Gestão de crédito e empréstimos.</p>
      </div>
      <button class="btn btn-primary" onclick="document.getElementById('modal-nova-operacao').classList.add('open')">
        <span class="material-symbols-outlined">add</span>
        Nova Operação
      </button>
    </div>

    <div class="stats-grid" role="region" aria-label="Indicadores HMCRED">
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Limite Total (Capital Base)</span>
          <div class="stat-card-icon text-muted"><span class="material-symbols-outlined">account_balance</span></div>
        </div>
        <div class="stat-card-value value-sensitive">${formatarMoeda(estado.configuracao.limiteTotal)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Capital Disponível</span>
          <div class="stat-card-icon" style="background-color: var(--color-success-muted); color: var(--color-success);">
            <span class="material-symbols-outlined">check_circle</span>
          </div>
        </div>
        <div class="stat-card-value text-success value-sensitive">${formatarMoeda(estado.configuracao.capitalDisponivel)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Capital Emprestado</span>
          <div class="stat-card-icon" style="background-color: var(--color-warning-muted); color: var(--color-warning);">
            <span class="material-symbols-outlined">outbound</span>
          </div>
        </div>
        <div class="stat-card-value text-warning value-sensitive">${formatarMoeda(capitalEmprestado)}</div>
      </div>
    </div>

    <div class="dashboard-section-header" style="margin-top: var(--space-8);">
      <h3 class="text-lg font-semibold">Operações de Crédito</h3>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Destino / Cliente</th>
              <th>Concedido</th>
              <th>A Receber</th>
              <th>Previsão</th>
              <th>Status</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${estado.operacoes.length === 0 ? `
              <tr><td colspan="6" class="text-center text-muted" style="padding: 24px;">Nenhuma operação registrada.</td></tr>
            ` : estado.operacoes.map(renderizarLinhaOperacao).join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${renderizarModais()}
  `;

  // Listeners do formulário modal
  const formNovaOp = document.getElementById('form-nova-operacao');
  if (formNovaOp) formNovaOp.addEventListener('submit', criarOperacao);

  // Listeners de ações da tabela (delegação de eventos)
  container.querySelectorAll('[data-acao]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const acao = btn.getAttribute('data-acao');
      const id = btn.getAttribute('data-id');
      if (acao === 'pagar') marcarComoPaga(id);
      if (acao === 'excluir') excluirOperacao(id);
    });
  });
}

function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

/* ─────────────────────────────────────────────────────────────────────────────
   MÓDULO EXPORTADO
───────────────────────────────────────────────────────────────────────────── */
export const HmcredModule = {

  async renderHmcred(container) {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
        <p>Carregando HMCRED...</p>
      </div>
    `;

    // Carregar configurações iniciais (uma única vez)
    const resConfig = await FirestoreService.obter('hmcred', 'configuracao');
    if (resConfig.sucesso) {
      estado.configuracao = resConfig.dados;
    }

    // Escutar operações em tempo real
    if (unsubscribeOperacoes) unsubscribeOperacoes();
    unsubscribeOperacoes = FirestoreService.escutar('hmcred_operacoes', (operacoes) => {
      estado.operacoes = operacoes;
      renderizarTelaPrincipal(container);
    }, { ordenarPor: 'dataPrevista', direcao: 'asc' });

    // Se estiver vazio (primeiro acesso) a tela já reage
    if (!resConfig.sucesso) {
      renderizarTelaPrincipal(container);
    }
  }
};
