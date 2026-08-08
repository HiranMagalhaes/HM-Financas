/**
 * HM Finanças — Módulo: HMCRED (Módulo 5)
 * ============================================================
 * Sistema de crédito próprio do usuário.
 * Controla operações de empréstimos/crédito concedidos, limites e retorno.
 *
 * Melhorias:
 * - Cálculo automático do valor a receber com base em valor + taxa + meses
 * - Opção de retirada via cartão de crédito parcelado (sem juros)
 * - Botão para editar o capital/limite base (acréscimo)
 */

'use strict';

import { AuthService } from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, formatarData, parseMoeda } from '../../utils/formatters.js';
import { mostrarToast } from '../../utils/helpers.js';
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
let _container = null;

/* ─────────────────────────────────────────────────────────────────────────────
   FUNÇÕES DE SINCRONIZAÇÃO E FIRESTORE
───────────────────────────────────────────────────────────────────────────── */

/**
 * Atualiza o resumo de patrimônio (bloco HMCRED) com base nos dados atuais.
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
    mostrarToast({ tipo: 'warning', titulo: 'Valor inválido', mensagem: 'O limite deve ser maior que zero.' });
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
 * Abre modal de edição do capital base (acréscimo/ajuste de limite).
 */
function abrirModalEditarCapital() {
  const modal = document.getElementById('modal-editar-capital');
  if (!modal) return;
  const toVal = (v) => (v || 0).toFixed(2).replace('.', ',');
  document.getElementById('editar-capital-limite').value    = toVal(estado.configuracao.limiteTotal);
  document.getElementById('editar-capital-disponivel').value = toVal(estado.configuracao.capitalDisponivel);
  modal.classList.add('open');
}

/**
 * Salva o ajuste manual do capital base.
 */
async function salvarEdicaoCapital(evento) {
  evento.preventDefault();
  const btn = evento.target.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;

  const novoLimite = parseMoeda(document.getElementById('editar-capital-limite').value);
  const novoDisponivel = parseMoeda(document.getElementById('editar-capital-disponivel').value);

  if (novoLimite <= 0) {
    mostrarToast({ tipo: 'warning', titulo: 'Valor inválido', mensagem: 'O limite total deve ser maior que zero.' });
    if (btn) btn.disabled = false;
    return;
  }

  estado.configuracao.limiteTotal = novoLimite;
  estado.configuracao.capitalDisponivel = novoDisponivel;

  await salvarConfiguracao();
  if (btn) btn.disabled = false;
  fecharModal('modal-editar-capital');
  mostrarToast({ tipo: 'success', titulo: 'Capital atualizado!', mensagem: 'Os valores do HMCRED foram ajustados.' });
}

/**
 * Salva uma nova operação de crédito no Firestore.
 * Tipo 'credito': empréstimo padrão com juros
 * Tipo 'retirada_cartao': retirada via cartão parcelado sem juros
 */
async function criarOperacao(evento) {
  evento.preventDefault();
  const form = evento.target;
  const formData = new FormData(form);

  const tipoOperacao = formData.get('tipoOperacao') || 'credito';
  const valorConcedido = parseMoeda(formData.get('valorConcedido'));

  if (valorConcedido > estado.configuracao.capitalDisponivel) {
    mostrarToast({ tipo: 'warning', titulo: 'Saldo insuficiente', mensagem: `Capital disponível: ${formatarMoeda(estado.configuracao.capitalDisponivel)}` });
    return;
  }

  if (valorConcedido <= 0) {
    mostrarToast({ tipo: 'warning', titulo: 'Valor inválido', mensagem: 'Informe um valor maior que zero.' });
    return;
  }

  let novaOperacao;

  if (tipoOperacao === 'retirada_cartao') {
    // Retirada via cartão: parcelado sem juros
    const parcelas = parseInt(formData.get('parcelas')) || 1;
    const valorParcela = valorConcedido / parcelas;

    novaOperacao = {
      destino: formData.get('destino'),
      valorConcedido,
      valorReceber: valorConcedido, // sem juros
      taxaJuros: 0,
      parcelas,
      valorParcela,
      dataConcessao: formData.get('dataConcessao'),
      dataPrevista: formData.get('dataPrevista'),
      tipoOperacao: 'retirada_cartao',
      status: 'aberto'
    };
  } else {
    // Crédito padrão com juros
    const taxaJuros = parseFloat(formData.get('taxaJuros')) || 0;
    const meses = parseInt(formData.get('meses')) || 0;
    let valorReceber = parseMoeda(formData.get('valorReceber'));

    // Se não digitou o valor a receber mas informou taxa e meses, recalcula
    if (valorReceber <= 0 && taxaJuros > 0 && meses > 0) {
      valorReceber = valorConcedido + (valorConcedido * (taxaJuros / 100) * meses);
    }

    novaOperacao = {
      destino: formData.get('destino'),
      valorConcedido,
      valorReceber,
      taxaJuros,
      meses,
      dataConcessao: formData.get('dataConcessao'),
      dataPrevista: formData.get('dataPrevista'),
      tipoOperacao: 'credito',
      status: 'aberto'
    };
  }

  const btnSubmit = form.querySelector('button[type="submit"]');
  if (btnSubmit) btnSubmit.disabled = true;

  // Deduz do capital disponível
  estado.configuracao.capitalDisponivel -= valorConcedido;

  const resOp = await FirestoreService.criar('hmcred_operacoes', novaOperacao);
  if (resOp.sucesso) {
    await salvarConfiguracao();
    fecharModal('modal-nova-operacao');
    form.reset();
    // Reseta tabs para crédito
    const tabCredito = document.getElementById('tab-credito');
    if (tabCredito) tabCredito.click();
    mostrarToast({ tipo: 'success', titulo: 'Operação registrada!', mensagem: `${formatarMoeda(valorConcedido)} concedido/retirado com sucesso.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao salvar', mensagem: 'Tente novamente.' });
    // Reverte o capital em caso de erro
    estado.configuracao.capitalDisponivel += valorConcedido;
  }

  if (btnSubmit) btnSubmit.disabled = false;
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
  mostrarToast({ tipo: 'success', titulo: 'Operação paga!', mensagem: `${formatarMoeda(operacao.valorReceber)} devolvido ao capital.` });
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
  mostrarToast({ tipo: 'success', titulo: 'Operação excluída', mensagem: 'O valor foi estornado ao capital.' });
}

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITÁRIOS
───────────────────────────────────────────────────────────────────────────── */

function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO
───────────────────────────────────────────────────────────────────────────── */

function renderizarModais() {
  return `
    <!-- ── Modal: Nova Operação ── -->
    <div class="modal-overlay" id="modal-nova-operacao" role="dialog" aria-modal="true">
      <div class="modal" style="max-width: 520px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title">Nova Operação de Crédito</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-nova-operacao').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-nova-operacao" novalidate>
          <input type="hidden" name="tipoOperacao" id="input-tipo-operacao" value="credito">
          <div class="modal-body">

            <!-- Tabs: Tipo de Operação -->
            <div style="display: flex; gap: var(--space-2); background: var(--bg-overlay); padding: 4px; border-radius: var(--radius-md); margin-bottom: var(--space-5);">
              <button type="button" id="tab-credito" class="btn btn-sm btn-primary" style="flex: 1;"
                      onclick="hmcredSelecionarTipoOp('credito')">
                <span class="material-symbols-outlined icon-sm">handshake</span>
                Crédito / Empréstimo
              </button>
              <button type="button" id="tab-cartao" class="btn btn-sm btn-ghost" style="flex: 1;"
                      onclick="hmcredSelecionarTipoOp('retirada_cartao')">
                <span class="material-symbols-outlined icon-sm">credit_card</span>
                Retirada via Cartão
              </button>
            </div>

            <!-- Campo: Destino -->
            <div class="form-group">
              <label class="form-label" for="op-destino">Destino (Cliente / Finalidade) <span class="required">*</span></label>
              <input type="text" id="op-destino" name="destino" class="form-input" required autocomplete="off"
                     placeholder="Ex: João Silva, Investimento, Compra...">
            </div>

            <!-- Campo: Valor Concedido -->
            <div class="form-group">
              <label class="form-label" for="op-valor-concedido">Valor (R$) <span class="required">*</span></label>
              <input type="text" id="op-valor-concedido" name="valorConcedido" class="form-input"
                     placeholder="0,00" required inputmode="decimal">
              <small class="text-muted" style="display:block; margin-top: 4px;">
                Disponível: <strong class="text-success">${formatarMoeda(estado.configuracao.capitalDisponivel)}</strong>
              </small>
            </div>

            <!-- Seção Crédito com Juros -->
            <div id="secao-credito">
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-3);">
                <div class="form-group">
                  <label class="form-label" for="op-taxa-juros">Taxa Juros (%/mês)</label>
                  <input type="number" step="0.01" id="op-taxa-juros" name="taxaJuros" class="form-input"
                         placeholder="Ex: 5" min="0">
                </div>
                <div class="form-group">
                  <label class="form-label" for="op-meses">Meses</label>
                  <input type="number" id="op-meses" name="meses" class="form-input"
                         placeholder="Ex: 4" min="0">
                </div>
                <div class="form-group">
                  <label class="form-label" for="op-valor-receber">A Receber (R$)</label>
                  <input type="text" id="op-valor-receber" name="valorReceber" class="form-input"
                         placeholder="Calculado" inputmode="decimal" style="background-color: var(--bg-overlay); font-weight: var(--font-bold); color: var(--color-success);" readonly>
                </div>
              </div>
              <div id="preview-juros" style="display:none; background: var(--color-success-muted); border-radius: var(--radius-md); padding: var(--space-3); margin-bottom: var(--space-4); font-size: var(--text-sm);">
                <span class="material-symbols-outlined icon-sm" style="color: var(--color-success); vertical-align: middle;"></span>
                <span id="preview-juros-texto" style="color: var(--color-success); font-weight: var(--font-semibold);"></span>
              </div>
            </div>

            <!-- Seção Retirada via Cartão -->
            <div id="secao-cartao" style="display: none;">
              <div class="form-group">
                <label class="form-label" for="op-parcelas">Número de Parcelas (sem juros)</label>
                <select id="op-parcelas" name="parcelas" class="form-input form-select">
                  ${Array.from({length: 12}, (_, i) => `<option value="${i+1}">${i+1}x (${i+1 === 1 ? 'à vista' : `${i+1} parcelas`})</option>`).join('')}
                </select>
              </div>
              <div id="preview-parcela" style="background: var(--color-info-muted); border-radius: var(--radius-md); padding: var(--space-3); margin-bottom: var(--space-4); font-size: var(--text-sm); display: none;">
                <span class="material-symbols-outlined icon-sm" style="color: var(--color-info); vertical-align: middle;"></span>
                <span id="preview-parcela-texto" style="color: var(--color-info); font-weight: var(--font-semibold);"></span>
              </div>
            </div>

            <!-- Datas -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
              <div class="form-group">
                <label class="form-label" for="op-data-concessao">Data de Concessão</label>
                <input type="date" id="op-data-concessao" name="dataConcessao" class="form-input" required>
              </div>
              <div class="form-group">
                <label class="form-label" for="op-data-prevista">Data Prevista p/ Retorno</label>
                <input type="date" id="op-data-prevista" name="dataPrevista" class="form-input" required>
              </div>
            </div>

          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-nova-operacao').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">
              <span class="material-symbols-outlined">check_circle</span>
              Confirmar Operação
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ── Modal: Editar Capital Base ── -->
    <div class="modal-overlay" id="modal-editar-capital" role="dialog" aria-modal="true">
      <div class="modal" style="max-width: 400px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title">Editar Capital HMCRED</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-editar-capital').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-editar-capital" novalidate>
          <div class="modal-body">
            <div style="background-color: var(--color-info-muted); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4); font-size: var(--text-sm); color: var(--text-secondary);">
              <span class="material-symbols-outlined icon-sm" style="vertical-align: middle;"></span>
              Use para acrescentar capital ou corrigir os valores base do HMCRED.
            </div>
            <div class="form-group">
              <label class="form-label" for="editar-capital-limite">Limite Total (R$) <span class="required">*</span></label>
              <input type="text" id="editar-capital-limite" class="form-input" inputmode="decimal" placeholder="0,00">
            </div>
            <div class="form-group">
              <label class="form-label" for="editar-capital-disponivel">Capital Disponível (R$)</label>
              <input type="text" id="editar-capital-disponivel" class="form-input" inputmode="decimal" placeholder="0,00">
              <small class="text-muted" style="display: block; margin-top: 4px;">Quanto está livre para novas operações.</small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-editar-capital').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">
              <span class="material-symbols-outlined">save</span>
              Salvar
            </button>
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

  const tipoLabel = op.tipoOperacao === 'retirada_cartao'
    ? `<span class="badge badge-neutral" style="font-size: 10px;">Cartão ${op.parcelas}x</span>`
    : `<span class="badge badge-neutral" style="font-size: 10px;">${op.taxaJuros ? op.taxaJuros + '%/mês' : 'Crédito'}</span>`;

  return `
    <tr>
      <td>
        <div>${op.destino}</div>
        ${tipoLabel}
      </td>
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
  _container = container;

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
            <input type="text" name="limiteTotal" class="form-input" placeholder="R$ 0,00" required
                   style="text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 16px;">
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
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-4);">
      <div>
        <h2 class="page-title">HMCRED</h2>
        <p class="page-subtitle">Gestão de crédito e empréstimos.</p>
      </div>
      <div style="display: flex; gap: var(--space-3);">
        <button class="btn btn-secondary" id="btn-editar-capital" aria-label="Editar capital base">
          <span class="material-symbols-outlined">edit</span>
          Editar Capital
        </button>
        <button class="btn btn-primary" id="btn-nova-operacao" aria-label="Nova operação">
          <span class="material-symbols-outlined">add</span>
          Nova Operação
        </button>
      </div>
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

  // Expõe a função de seleção de tipo ao escopo global para os onclick inline
  window.hmcredSelecionarTipoOp = (tipo) => {
    document.getElementById('input-tipo-operacao').value = tipo;
    const tabCredito = document.getElementById('tab-credito');
    const tabCartao  = document.getElementById('tab-cartao');
    const secCredito = document.getElementById('secao-credito');
    const secCartao  = document.getElementById('secao-cartao');

    if (tipo === 'credito') {
      tabCredito.classList.replace('btn-ghost', 'btn-primary');
      tabCartao.classList.replace('btn-primary', 'btn-ghost');
      secCredito.style.display = 'block';
      secCartao.style.display  = 'none';
    } else {
      tabCartao.classList.replace('btn-ghost', 'btn-primary');
      tabCredito.classList.replace('btn-primary', 'btn-ghost');
      secCartao.style.display  = 'block';
      secCredito.style.display = 'none';
    }
  };

  // Listeners de cálculo automático de juros
  const inpValor  = document.getElementById('op-valor-concedido');
  const inpTaxa   = document.getElementById('op-taxa-juros');
  const inpMeses  = document.getElementById('op-meses');
  const inpReceiv = document.getElementById('op-valor-receber');
  const preview   = document.getElementById('preview-juros');
  const previewTx = document.getElementById('preview-juros-texto');

  function recalcularJuros() {
    const valor = parseMoeda(inpValor.value);
    const taxa  = parseFloat(inpTaxa.value) || 0;
    const meses = parseInt(inpMeses.value) || 0;

    if (valor > 0 && taxa > 0 && meses > 0) {
      const jurosTotal = valor * (taxa / 100) * meses;
      const totalFinal = valor + jurosTotal;
      inpReceiv.value = totalFinal.toFixed(2).replace('.', ',');
      previewTx.textContent = `${formatarMoeda(valor)} × ${taxa}% × ${meses} mês${meses > 1 ? 'es' : ''} = Juros de ${formatarMoeda(jurosTotal)} → Total: ${formatarMoeda(totalFinal)}`;
      preview.style.display = 'block';
    } else {
      inpReceiv.value = '';
      preview.style.display = 'none';
    }
  }

  if (inpValor)  inpValor.addEventListener('input', recalcularJuros);
  if (inpTaxa)   inpTaxa.addEventListener('input', recalcularJuros);
  if (inpMeses)  inpMeses.addEventListener('input', recalcularJuros);

  // Preview de parcelas para retirada via cartão
  const inpParcelas    = document.getElementById('op-parcelas');
  const prevParcela    = document.getElementById('preview-parcela');
  const prevParcelaTx  = document.getElementById('preview-parcela-texto');

  function recalcularParcelas() {
    const valor    = parseMoeda(inpValor.value);
    const parcelas = parseInt(inpParcelas.value) || 1;
    if (valor > 0) {
      const valorParc = valor / parcelas;
      prevParcelaTx.textContent = `${parcelas}x de ${formatarMoeda(valorParc)} sem juros`;
      prevParcela.style.display = 'block';
    } else {
      prevParcela.style.display = 'none';
    }
  }

  if (inpValor)   inpValor.addEventListener('input', recalcularParcelas);
  if (inpParcelas) inpParcelas.addEventListener('change', recalcularParcelas);

  // Botão Nova Operação
  const btnNova = document.getElementById('btn-nova-operacao');
  if (btnNova) btnNova.addEventListener('click', () => abrirModal('modal-nova-operacao'));

  // Botão Editar Capital
  const btnEditarCap = document.getElementById('btn-editar-capital');
  if (btnEditarCap) btnEditarCap.addEventListener('click', () => abrirModalEditarCapital());

  // Formulário nova operação
  const formNovaOp = document.getElementById('form-nova-operacao');
  if (formNovaOp) formNovaOp.addEventListener('submit', criarOperacao);

  // Formulário editar capital
  const formEditarCap = document.getElementById('form-editar-capital');
  if (formEditarCap) formEditarCap.addEventListener('submit', salvarEdicaoCapital);

  // Listeners de ações da tabela (delegação de eventos)
  container.querySelectorAll('[data-acao]').forEach(btn => {
    btn.addEventListener('click', () => {
      const acao = btn.getAttribute('data-acao');
      const id   = btn.getAttribute('data-id');
      if (acao === 'pagar')  marcarComoPaga(id);
      if (acao === 'excluir') excluirOperacao(id);
    });
  });

  // Fechar modais ao clicar fora
  container.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   MÓDULO EXPORTADO
───────────────────────────────────────────────────────────────────────────── */
export const HmcredModule = {

  async renderHmcred(container) {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    _container = container;

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
