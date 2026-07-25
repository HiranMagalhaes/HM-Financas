/**
 * HM Finanças — Módulo: Dinheiro (Módulo 6)
 * ============================================================
 * Gerenciamento de contas correntes, poupança, caixa físico, etc.
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
  contas: [],
  carregando: true
};
let unsubscribeContas = null;

/* ─────────────────────────────────────────────────────────────────────────────
   FUNÇÕES DE SINCRONIZAÇÃO E FIRESTORE
───────────────────────────────────────────────────────────────────────────── */

/**
 * Recalcula o saldo total somando todas as contas e sincroniza com o Firestore.
 */
async function sincronizarSaldos() {
  const saldoTotal = estado.contas.reduce((acc, conta) => acc + (conta.saldo || 0), 0);

  // 1. Atualizar cache de dinheiro_configuracao
  await FirestoreService.salvar('dinheiro', 'configuracao', { saldoTotal });

  // 2. Atualizar resumo do patrimônio
  const resumoExistente = await FirestoreService.obter('patrimonio', 'resumo');
  const patrimonioDocs = resumoExistente.sucesso ? resumoExistente.dados : { hmcred: 0, dinheiro: 0, cartoes: 0 };
  
  patrimonioDocs.dinheiro = saldoTotal;
  await FirestoreService.salvar('patrimonio', 'resumo', patrimonioDocs);
}

/* ─────────────────────────────────────────────────────────────────────────────
   AÇÕES DO USUÁRIO (CRUD)
───────────────────────────────────────────────────────────────────────────── */

/**
 * Cria uma nova conta.
 */
async function criarConta(evento) {
  evento.preventDefault();
  const form = evento.target;
  const formData = new FormData(form);

  const novaConta = {
    nome: formData.get('nome'),
    tipo: formData.get('tipo'), // 'caixa', 'corrente', 'poupanca', 'outro'
    saldo: parseMoeda(formData.get('saldoInicial'))
  };

  const res = await FirestoreService.criar('dinheiro_contas', novaConta);
  if (res.sucesso) {
    fecharModal('modal-nova-conta');
    form.reset();
    // Nota: A lista local de contas será atualizada automaticamente via onSnapshot (escutar),
    // mas o cálculo de patrimônio deve ser acionado lá no listener ou aqui.
    // Como a atualização de saldo total depende de recalcular a lista toda,
    // garantiremos isso no callback do listener.
  } else {
    alert('Erro ao criar conta.');
  }
}

/**
 * Exclui uma conta existente.
 */
async function excluirConta(id) {
  if (!confirm('Tem certeza que deseja excluir esta conta permanentemente? O saldo será removido do seu patrimônio.')) return;
  await FirestoreService.excluir('dinheiro_contas', id);
}

/**
 * Prepara o modal de lançamento (entrada/saída).
 */
function abrirModalLancamento(idConta) {
  const conta = estado.contas.find(c => c.id === idConta);
  if (!conta) return;

  document.getElementById('lancamento-conta-id').value = conta.id;
  document.getElementById('lancamento-conta-nome').textContent = conta.nome;
  document.getElementById('modal-lancamento').classList.add('open');
}

/**
 * Efetua o lançamento em uma conta.
 */
async function registrarLancamento(evento) {
  evento.preventDefault();
  const form = evento.target;
  const formData = new FormData(form);

  const idConta = formData.get('contaId');
  const valor = parseMoeda(formData.get('valor'));
  const tipoLancamento = formData.get('tipoLancamento'); // 'entrada' ou 'saida'

  const conta = estado.contas.find(c => c.id === idConta);
  if (!conta || valor <= 0) return;

  const variacao = tipoLancamento === 'entrada' ? valor : -valor;
  const novoSaldo = conta.saldo + variacao;

  await FirestoreService.atualizar('dinheiro_contas', idConta, { saldo: novoSaldo });
  
  fecharModal('modal-lancamento');
  form.reset();
}

/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO
───────────────────────────────────────────────────────────────────────────── */

function renderizarModais() {
  return `
    <!-- Modal Nova Conta -->
    <div class="modal" id="modal-nova-conta">
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h3 class="modal-title">Nova Conta</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-nova-conta').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-nova-conta">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Nome da Conta (ex: Nubank, Caixa Físico)</label>
              <input type="text" name="nome" class="form-input" required>
            </div>
            <div class="form-group">
              <label class="form-label">Tipo</label>
              <select name="tipo" class="form-input" required>
                <option value="corrente">Conta Corrente</option>
                <option value="poupanca">Poupança</option>
                <option value="caixa">Caixa Físico</option>
                <option value="outro">Outros Investimentos</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Saldo Inicial (R$)</label>
              <input type="text" name="saldoInicial" class="form-input" placeholder="0,00" required>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-nova-conta').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar Conta</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal Lançamento (Ajuste de Saldo) -->
    <div class="modal" id="modal-lancamento">
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h3 class="modal-title">Registrar Movimentação</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-lancamento').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-lancamento">
          <input type="hidden" name="contaId" id="lancamento-conta-id">
          <div class="modal-body">
            <p style="margin-bottom: var(--space-4);">Conta: <strong id="lancamento-conta-nome"></strong></p>
            <div class="form-group">
              <label class="form-label">Tipo de Movimentação</label>
              <div style="display: flex; gap: var(--space-4);">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input type="radio" name="tipoLancamento" value="entrada" checked> Entrada (+ R$)
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input type="radio" name="tipoLancamento" value="saida"> Saída (- R$)
                </label>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Valor (R$)</label>
              <input type="text" name="valor" class="form-input" placeholder="0,00" required>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-lancamento').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">Registrar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderizarCardConta(conta) {
  const icones = {
    corrente: 'account_balance',
    poupanca: 'savings',
    caixa: 'payments',
    outro: 'trending_up'
  };
  const icone = icones[conta.tipo] || 'account_balance_wallet';

  return `
    <div class="card" style="margin-bottom: var(--space-4);">
      <div class="card-body" style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: var(--space-4);">
          <div style="width: 48px; height: 48px; border-radius: 8px; background-color: var(--color-success-muted); color: var(--color-success); display: flex; align-items: center; justify-content: center;">
            <span class="material-symbols-outlined">${icone}</span>
          </div>
          <div>
            <h4 style="margin: 0; font-size: 1rem; font-weight: 500;">${conta.nome}</h4>
            <span class="text-muted" style="font-size: 0.875rem; text-transform: capitalize;">${conta.tipo}</span>
          </div>
        </div>
        
        <div style="text-align: right; display: flex; align-items: center; gap: var(--space-6);">
          <div>
            <p class="text-muted" style="margin: 0; font-size: 0.875rem;">Saldo Atual</p>
            <p class="value-sensitive text-success" style="margin: 0; font-size: 1.25rem; font-weight: 600;">${formatarMoeda(conta.saldo)}</p>
          </div>
          
          <div style="display: flex; gap: var(--space-2);">
            <button class="btn btn-ghost btn-icon" title="Nova movimentação" data-acao="movimentar" data-id="${conta.id}">
              <span class="material-symbols-outlined text-info">sync_alt</span>
            </button>
            <button class="btn btn-ghost btn-icon" title="Excluir conta" data-acao="excluir" data-id="${conta.id}">
              <span class="material-symbols-outlined text-danger">delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderizarTelaPrincipal(container) {
  const saldoTotal = estado.contas.reduce((acc, c) => acc + c.saldo, 0);

  container.innerHTML = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <h2 class="page-title">Dinheiro</h2>
        <p class="page-subtitle">Saldos em contas correntes e espécie.</p>
      </div>
      <button class="btn btn-primary" onclick="document.getElementById('modal-nova-conta').classList.add('open')">
        <span class="material-symbols-outlined">add</span>
        Nova Conta
      </button>
    </div>

    <!-- Resumo Total -->
    <div class="card card-gold" style="margin-bottom: var(--space-8);">
      <div class="card-body" style="display: flex; align-items: center; gap: var(--space-4);">
        <div style="flex: 1;">
          <p class="text-muted" style="color: rgba(255,255,255,0.7) !important; margin-bottom: var(--space-2);">Saldo Consolidado Geral</p>
          <h2 class="value-sensitive" style="margin: 0; font-size: 2.5rem; color: var(--color-gold);">${formatarMoeda(saldoTotal)}</h2>
        </div>
        <div style="opacity: 0.2;">
          <span class="material-symbols-outlined" style="font-size: 80px;">account_balance</span>
        </div>
      </div>
    </div>

    <div class="dashboard-section-header" style="margin-bottom: var(--space-4);">
      <h3 class="text-lg font-semibold">Minhas Contas</h3>
    </div>

    <!-- Lista de Contas -->
    <div class="contas-list">
      ${estado.contas.length === 0 ? `
        <div class="card">
          <div class="card-body text-center" style="padding: 48px;">
            <p class="text-muted">Nenhuma conta cadastrada.</p>
            <button class="btn btn-ghost text-gold" style="margin-top: 16px;" onclick="document.getElementById('modal-nova-conta').classList.add('open')">Cadastrar Primeira Conta</button>
          </div>
        </div>
      ` : estado.contas.map(renderizarCardConta).join('')}
    </div>

    ${renderizarModais()}
  `;

  // Listeners Form
  const formNovaConta = document.getElementById('form-nova-conta');
  if (formNovaConta) formNovaConta.addEventListener('submit', criarConta);

  const formLancamento = document.getElementById('form-lancamento');
  if (formLancamento) formLancamento.addEventListener('submit', registrarLancamento);

  // Listeners Ações Tabela
  container.querySelectorAll('[data-acao]').forEach(btn => {
    btn.addEventListener('click', () => {
      const acao = btn.getAttribute('data-acao');
      const id = btn.getAttribute('data-id');
      
      if (acao === 'movimentar') abrirModalLancamento(id);
      if (acao === 'excluir') excluirConta(id);
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
export const DinheiroModule = {

  async renderDinheiro(container) {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
        <p>Carregando contas...</p>
      </div>
    `;

    if (unsubscribeContas) unsubscribeContas();

    // Quando o listener detecta qualquer mudança na coleção (CRUD), nós recalculamos
    // o total e atualizamos a tela e o patrimônio/resumo de uma vez só.
    unsubscribeContas = FirestoreService.escutar('dinheiro_contas', async (contas) => {
      estado.contas = contas;
      
      // Sincronizar saldos de forma reativa a cada mudança na lista
      await sincronizarSaldos();
      
      // Renderizar interface atualizada
      renderizarTelaPrincipal(container);
    }, { ordenarPor: 'nome', direcao: 'asc' });
  }
};
