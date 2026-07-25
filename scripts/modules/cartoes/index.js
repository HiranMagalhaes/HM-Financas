/**
 * HM Finanças — Módulo: Cartões (Módulo 6)
 * ============================================================
 * Gerenciamento de faturas e limites de cartões de crédito.
 */

'use strict';

import { AuthService } from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, parseMoeda } from '../../utils/formatters.js';
import { Router } from '../../router.js';

/* ─────────────────────────────────────────────────────────────────────────────
   ESTADO DO MÓDULO
───────────────────────────────────────────────────────────────────────────── */
let estado = {
  cartoes: [],
  carregando: true
};
let unsubscribeCartoes = null;

/* ─────────────────────────────────────────────────────────────────────────────
   FUNÇÕES DE SINCRONIZAÇÃO E FIRESTORE
───────────────────────────────────────────────────────────────────────────── */

/**
 * Recalcula o saldo total somando todos os cartões e sincroniza com o Firestore.
 * Patrimônio considera CARTÕES como PASSIVO, logo enviamos a soma das faturas (valor usado).
 */
async function sincronizarSaldos() {
  const limiteTotal = estado.cartoes.reduce((acc, c) => acc + (c.limiteTotal || 0), 0);
  const valorUsado = estado.cartoes.reduce((acc, c) => acc + (c.valorUsado || 0), 0);
  const limiteDisponivel = limiteTotal - valorUsado;

  // 1. Atualizar cache de cartoes_configuracao
  await FirestoreService.salvar('cartoes', 'configuracao', { limiteTotal, valorUsado, limiteDisponivel });

  // 2. Atualizar resumo do patrimônio
  const resumoExistente = await FirestoreService.obter('patrimonio', 'resumo');
  const patrimonioDocs = resumoExistente.sucesso ? resumoExistente.dados : { hmcred: 0, dinheiro: 0, cartoes: 0 };
  
  patrimonioDocs.cartoes = valorUsado; // Patrimônio foca na dívida (fatura atual)
  await FirestoreService.salvar('patrimonio', 'resumo', patrimonioDocs);
}

/* ─────────────────────────────────────────────────────────────────────────────
   AÇÕES DO USUÁRIO (CRUD)
───────────────────────────────────────────────────────────────────────────── */

/**
 * Cria um novo cartão de crédito.
 */
async function criarCartao(evento) {
  evento.preventDefault();
  const form = evento.target;
  const formData = new FormData(form);

  const limiteTotal = parseMoeda(formData.get('limiteTotal'));
  const valorUsado = parseMoeda(formData.get('valorUsado')) || 0;

  if (valorUsado > limiteTotal) {
    alert('A fatura atual não pode ser maior que o limite total do cartão.');
    return;
  }

  const novoCartao = {
    nome: formData.get('nome'),
    limiteTotal,
    valorUsado,
    diaVencimento: parseInt(formData.get('diaVencimento'), 10)
  };

  const res = await FirestoreService.criar('cartoes_lista', novoCartao);
  if (res.sucesso) {
    fecharModal('modal-novo-cartao');
    form.reset();
  } else {
    alert('Erro ao criar cartão.');
  }
}

/**
 * Exclui um cartão existente.
 */
async function excluirCartao(id) {
  if (!confirm('Tem certeza que deseja excluir este cartão? Sua dívida e limite desaparecerão do sistema.')) return;
  await FirestoreService.excluir('cartoes_lista', id);
}

/**
 * Prepara o modal para registrar um gasto ou pagamento no cartão.
 */
function abrirModalLancamento(idCartao, tipoAcao) {
  const cartao = estado.cartoes.find(c => c.id === idCartao);
  if (!cartao) return;

  document.getElementById('lancamento-cartao-id').value = cartao.id;
  document.getElementById('lancamento-cartao-nome').textContent = cartao.nome;
  document.getElementById('lancamento-cartao-tipo').value = tipoAcao;
  
  const tituloModal = document.getElementById('modal-lancamento-titulo');
  if (tipoAcao === 'gasto') {
    tituloModal.textContent = 'Registrar Gasto (Nova Compra)';
  } else {
    tituloModal.textContent = 'Pagar Fatura';
  }

  document.getElementById('modal-lancamento').classList.add('open');
}

/**
 * Efetua o lançamento em um cartão.
 */
async function registrarLancamento(evento) {
  evento.preventDefault();
  const form = evento.target;
  const formData = new FormData(form);

  const idCartao = formData.get('cartaoId');
  const valor = parseMoeda(formData.get('valor'));
  const tipoAcao = formData.get('tipoAcao'); // 'gasto' ou 'pagamento'

  const cartao = estado.cartoes.find(c => c.id === idCartao);
  if (!cartao || valor <= 0) return;

  let novoValorUsado = cartao.valorUsado;

  if (tipoAcao === 'gasto') {
    const disponivel = cartao.limiteTotal - cartao.valorUsado;
    if (valor > disponivel) {
      alert('Limite insuficiente para esta compra.');
      return;
    }
    novoValorUsado += valor;
  } else if (tipoAcao === 'pagamento') {
    novoValorUsado -= valor;
    if (novoValorUsado < 0) novoValorUsado = 0;
  }

  await FirestoreService.atualizar('cartoes_lista', idCartao, { valorUsado: novoValorUsado });
  
  fecharModal('modal-lancamento');
  form.reset();
}

/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO
───────────────────────────────────────────────────────────────────────────── */

function renderizarModais() {
  return `
    <!-- Modal Novo Cartão -->
    <div class="modal" id="modal-novo-cartao">
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h3 class="modal-title">Novo Cartão de Crédito</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-novo-cartao').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-novo-cartao">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Nome do Cartão (ex: Nubank, Inter)</label>
              <input type="text" name="nome" class="form-input" required>
            </div>
            <div class="form-row" style="display: flex; gap: var(--space-4);">
              <div class="form-group" style="flex: 2;">
                <label class="form-label">Limite Total (R$)</label>
                <input type="text" name="limiteTotal" class="form-input" placeholder="0,00" required>
              </div>
              <div class="form-group" style="flex: 1;">
                <label class="form-label">Vencimento (Dia)</label>
                <input type="number" name="diaVencimento" class="form-input" min="1" max="31" placeholder="Ex: 10" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Fatura Atual Fechada/Aberta (R$)</label>
              <input type="text" name="valorUsado" class="form-input" placeholder="0,00">
              <small class="text-muted" style="display: block; margin-top: 4px;">Valor que já está gasto no cartão no momento.</small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-novo-cartao').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar Cartão</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal Lançamento (Gasto / Pagamento) -->
    <div class="modal" id="modal-lancamento">
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-lancamento-titulo">Registrar</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-lancamento').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-lancamento">
          <input type="hidden" name="cartaoId" id="lancamento-cartao-id">
          <input type="hidden" name="tipoAcao" id="lancamento-cartao-tipo">
          <div class="modal-body">
            <p style="margin-bottom: var(--space-4);">Cartão: <strong id="lancamento-cartao-nome"></strong></p>
            <div class="form-group">
              <label class="form-label">Valor (R$)</label>
              <input type="text" name="valor" class="form-input" placeholder="0,00" required>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-lancamento').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">Confirmar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderizarCartao(cartao) {
  const disponivel = cartao.limiteTotal - cartao.valorUsado;
  const porcentagemUso = cartao.limiteTotal > 0 ? (cartao.valorUsado / cartao.limiteTotal) * 100 : 0;
  
  // Define cor da barra de progresso baseado no uso
  let corBarra = 'var(--color-success)';
  if (porcentagemUso > 70) corBarra = 'var(--color-warning)';
  if (porcentagemUso > 90) corBarra = 'var(--color-danger)';

  return `
    <div class="card credit-card-item">
      <div class="card-body">
        
        <div class="credit-card-header" style="display: flex; justify-content: space-between; margin-bottom: var(--space-6);">
          <div>
            <h4 style="margin: 0; font-size: 1.125rem; font-weight: 600;">${cartao.nome}</h4>
            <span class="text-muted" style="font-size: 0.875rem;">Vence dia ${cartao.diaVencimento}</span>
          </div>
          <div style="display: flex; gap: var(--space-2);">
            <button class="btn btn-ghost btn-icon" title="Excluir" data-acao="excluir" data-id="${cartao.id}">
              <span class="material-symbols-outlined text-danger icon-sm">delete</span>
            </button>
          </div>
        </div>
        
        <div class="credit-card-balances" style="display: flex; justify-content: space-between; margin-bottom: var(--space-4);">
          <div>
            <p class="text-muted" style="margin: 0; font-size: 0.875rem;">Fatura Atual</p>
            <p class="value-sensitive text-danger" style="margin: 0; font-size: 1.5rem; font-weight: 600;">${formatarMoeda(cartao.valorUsado)}</p>
          </div>
          <div style="text-align: right;">
            <p class="text-muted" style="margin: 0; font-size: 0.875rem;">Limite Disponível</p>
            <p class="value-sensitive text-success" style="margin: 0; font-size: 1rem; font-weight: 600;">${formatarMoeda(disponivel)}</p>
          </div>
        </div>

        <div class="progress-bar-bg" style="width: 100%; height: 6px; background-color: var(--bg-body); border-radius: 4px; overflow: hidden; margin-bottom: var(--space-6);">
          <div class="progress-bar-fill" style="width: ${Math.min(porcentagemUso, 100)}%; height: 100%; background-color: ${corBarra}; transition: width 0.3s ease;"></div>
        </div>
        
        <div class="credit-card-actions" style="display: flex; gap: var(--space-2);">
          <button class="btn btn-primary" style="flex: 1;" data-acao="gasto" data-id="${cartao.id}">
            <span class="material-symbols-outlined icon-sm">shopping_cart</span> Gasto
          </button>
          <button class="btn btn-secondary" style="flex: 1;" data-acao="pagamento" data-id="${cartao.id}">
            <span class="material-symbols-outlined icon-sm">payments</span> Pagar Fatura
          </button>
        </div>

      </div>
    </div>
  `;
}

function renderizarTelaPrincipal(container) {
  const limiteTotal = estado.cartoes.reduce((acc, c) => acc + c.limiteTotal, 0);
  const valorUsado = estado.cartoes.reduce((acc, c) => acc + c.valorUsado, 0);
  const limiteDisponivel = limiteTotal - valorUsado;

  container.innerHTML = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <h2 class="page-title">Cartões de Crédito</h2>
        <p class="page-subtitle">Gestão de faturas e limites.</p>
      </div>
      <button class="btn btn-primary" onclick="document.getElementById('modal-novo-cartao').classList.add('open')">
        <span class="material-symbols-outlined">add</span>
        Novo Cartão
      </button>
    </div>

    <!-- Resumo Total -->
    <div class="stats-grid" role="region" aria-label="Resumo de Cartões">
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Limite Total (Todos)</span>
          <div class="stat-card-icon text-muted"><span class="material-symbols-outlined">credit_score</span></div>
        </div>
        <div class="stat-card-value value-sensitive">${formatarMoeda(limiteTotal)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Fatura Atual (Usado)</span>
          <div class="stat-card-icon" style="background-color: var(--color-danger-muted); color: var(--color-danger);">
            <span class="material-symbols-outlined">receipt_long</span>
          </div>
        </div>
        <div class="stat-card-value text-danger value-sensitive">${formatarMoeda(valorUsado)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Limite Disponível</span>
          <div class="stat-card-icon" style="background-color: var(--color-success-muted); color: var(--color-success);">
            <span class="material-symbols-outlined">verified</span>
          </div>
        </div>
        <div class="stat-card-value text-success value-sensitive">${formatarMoeda(limiteDisponivel)}</div>
      </div>
    </div>

    <div class="dashboard-section-header" style="margin-top: var(--space-8); margin-bottom: var(--space-4);">
      <h3 class="text-lg font-semibold">Meus Cartões</h3>
    </div>

    <!-- Lista de Cartões -->
    <div class="cartoes-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-4);">
      ${estado.cartoes.length === 0 ? `
        <div class="card" style="grid-column: 1 / -1;">
          <div class="card-body text-center" style="padding: 48px;">
            <p class="text-muted">Nenhum cartão cadastrado.</p>
            <button class="btn btn-ghost text-gold" style="margin-top: 16px;" onclick="document.getElementById('modal-novo-cartao').classList.add('open')">Cadastrar Primeiro Cartão</button>
          </div>
        </div>
      ` : estado.cartoes.map(renderizarCartao).join('')}
    </div>

    ${renderizarModais()}
  `;

  // Listeners Form
  const formNovoCartao = document.getElementById('form-novo-cartao');
  if (formNovoCartao) formNovoCartao.addEventListener('submit', criarCartao);

  const formLancamento = document.getElementById('form-lancamento');
  if (formLancamento) formLancamento.addEventListener('submit', registrarLancamento);

  // Listeners Ações Tabela
  container.querySelectorAll('[data-acao]').forEach(btn => {
    btn.addEventListener('click', () => {
      const acao = btn.getAttribute('data-acao');
      const id = btn.getAttribute('data-id');
      
      if (acao === 'gasto' || acao === 'pagamento') abrirModalLancamento(id, acao);
      if (acao === 'excluir') excluirCartao(id);
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
export const CartoesModule = {

  async renderCartoes(container) {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
        <p>Carregando cartões...</p>
      </div>
    `;

    if (unsubscribeCartoes) unsubscribeCartoes();

    // Listener detecta qualquer mudança na coleção (CRUD), recalcula
    // e atualiza a tela e o patrimônio/resumo de uma vez só.
    unsubscribeCartoes = FirestoreService.escutar('cartoes_lista', async (cartoes) => {
      estado.cartoes = cartoes;
      
      // Sincronizar saldos de forma reativa a cada mudança na lista
      await sincronizarSaldos();
      
      // Renderizar interface atualizada
      renderizarTelaPrincipal(container);
    }, { ordenarPor: 'nome', direcao: 'asc' });
  }
};
