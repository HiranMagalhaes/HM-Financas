/**
 * HM Finanças — Módulo: Dinheiro (Módulo 6A)
 * ============================================================
 * Gerenciamento de contas correntes, poupança, caixa físico e
 * outros tipos de saldo do usuário.
 *
 * Fluxo principal:
 *   1. Carrega a tela com estado de loading
 *   2. Abre um listener em tempo real (onSnapshot) na coleção dinheiro_contas
 *   3. A cada mudança (criar/editar/excluir), recalcula o saldo total
 *   4. Salva o saldo total em dinheiro/configuracao e em patrimonio/resumo
 *   5. Re-renderiza a interface automaticamente
 *
 * Coleções Firestore utilizadas:
 *   /usuarios/{uid}/dinheiro_contas/{id}  → cada conta cadastrada
 *   /usuarios/{uid}/dinheiro/configuracao → saldo total consolidado
 *   /usuarios/{uid}/patrimonio/resumo     → atualizado para refletir no Patrimônio
 */

'use strict';

import { AuthService }      from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, parseMoeda } from '../../utils/formatters.js';
import { mostrarToast }     from '../../utils/helpers.js';

/* ─────────────────────────────────────────────────────────────────────────────
   ESTADO DO MÓDULO
   Armazena a lista de contas em memória para evitar consultas repetidas
   ao Firestore a cada ação do usuário.
───────────────────────────────────────────────────────────────────────────── */
let estado = {
  contas: [],      // Lista de contas carregadas do Firestore
  carregando: true // Indica se o carregamento inicial está em andamento
};

/** Referência para cancelar o listener de tempo real ao sair da tela */
let unsubscribeContas = null;

/* ─────────────────────────────────────────────────────────────────────────────
   FUNÇÕES DE SINCRONIZAÇÃO COM O PATRIMÔNIO
───────────────────────────────────────────────────────────────────────────── */

/**
 * Recalcula o saldo total de todas as contas e atualiza dois locais no Firestore:
 *   1. dinheiro/configuracao → cache de configuração do módulo Dinheiro
 *   2. patrimonio/resumo     → bloco "Dinheiro" na tela de Patrimônio
 *
 * Esta função é chamada automaticamente sempre que o listener detectar
 * qualquer mudança na coleção dinheiro_contas.
 */
async function sincronizarSaldos() {
  // Soma o saldo de todas as contas em memória
  const saldoTotal = estado.contas.reduce((acc, conta) => acc + (conta.saldo || 0), 0);

  // 1. Salva o saldo consolidado na configuração do módulo Dinheiro
  await FirestoreService.salvar('dinheiro', 'configuracao', { saldoTotal });

  // 2. Lê o resumo atual do Patrimônio para não sobrescrever hmcred e cartoes
  const resumoExistente = await FirestoreService.obter('patrimonio', 'resumo');
  const dadosPatrimonio = resumoExistente.sucesso
    ? resumoExistente.dados
    : { hmcred: 0, dinheiro: 0, cartoes: 0 };

  // Atualiza apenas o campo "dinheiro" no resumo do Patrimônio
  dadosPatrimonio.dinheiro = saldoTotal;
  await FirestoreService.salvar('patrimonio', 'resumo', dadosPatrimonio);
}

/* ─────────────────────────────────────────────────────────────────────────────
   AÇÕES DO USUÁRIO — CRUD
───────────────────────────────────────────────────────────────────────────── */

/**
 * Cria uma nova conta no Firestore a partir do formulário de criação.
 * Chamada pelo evento submit do form#form-nova-conta.
 *
 * @param {SubmitEvent} evento
 */
async function criarConta(evento) {
  evento.preventDefault();
  const form     = evento.target;
  const formData = new FormData(form);

  // Monta o objeto da nova conta com os dados do formulário
  const novaConta = {
    nome:  formData.get('nome').trim(),
    tipo:  formData.get('tipo'),
    saldo: parseMoeda(formData.get('saldoInicial'))
  };

  // Valida campos obrigatórios antes de enviar ao Firestore
  if (!novaConta.nome) {
    mostrarToast({ tipo: 'warning', titulo: 'Campo obrigatório', mensagem: 'Informe o nome da conta.' });
    return;
  }

  // Desabilita o botão de submit durante o envio para evitar duplicatas
  const btnSubmit = form.querySelector('button[type="submit"]');
  if (btnSubmit) btnSubmit.disabled = true;

  const res = await FirestoreService.criar('dinheiro_contas', novaConta);

  if (btnSubmit) btnSubmit.disabled = false;

  if (res.sucesso) {
    fecharModal('modal-nova-conta');
    form.reset();
    mostrarToast({ tipo: 'success', titulo: 'Conta criada!', mensagem: `"${novaConta.nome}" foi adicionada com sucesso.` });
    // O listener onSnapshot detecta a mudança e re-renderiza automaticamente
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao criar conta', mensagem: 'Tente novamente em instantes.' });
  }
}

/**
 * Preenche e abre o modal de edição para uma conta específica.
 * Carrega os dados atuais da conta nos campos do formulário.
 *
 * @param {string} id - ID do documento da conta no Firestore
 */
function abrirModalEdicao(id) {
  // Busca a conta na lista em memória (evita nova consulta ao Firestore)
  const conta = estado.contas.find(c => c.id === id);
  if (!conta) return;

  // Preenche os campos do modal de edição com os dados atuais
  document.getElementById('editar-conta-id').value          = conta.id;
  document.getElementById('editar-conta-nome').value        = conta.nome;
  document.getElementById('editar-conta-tipo').value        = conta.tipo;
  document.getElementById('editar-conta-saldo').value       = formatarMoeda(conta.saldo).replace('R$\u00a0', '').replace('R$ ', '');

  abrirModal('modal-editar-conta');
}

/**
 * Atualiza os dados de uma conta existente no Firestore.
 * Chamada pelo evento submit do form#form-editar-conta.
 *
 * @param {SubmitEvent} evento
 */
async function atualizarConta(evento) {
  evento.preventDefault();
  const form     = evento.target;
  const formData = new FormData(form);

  const id   = formData.get('contaId');
  const nome = formData.get('nome').trim();
  const tipo = formData.get('tipo');
  const saldo = parseMoeda(formData.get('saldo'));

  if (!id || !nome) {
    mostrarToast({ tipo: 'warning', titulo: 'Campo obrigatório', mensagem: 'Informe o nome da conta.' });
    return;
  }

  const btnSubmit = form.querySelector('button[type="submit"]');
  if (btnSubmit) btnSubmit.disabled = true;

  // Atualiza apenas os campos modificados (merge parcial via updateDoc)
  const res = await FirestoreService.atualizar('dinheiro_contas', id, { nome, tipo, saldo });

  if (btnSubmit) btnSubmit.disabled = false;

  if (res.sucesso) {
    fecharModal('modal-editar-conta');
    mostrarToast({ tipo: 'success', titulo: 'Conta atualizada!', mensagem: `"${nome}" foi salva com sucesso.` });
    // O listener onSnapshot detecta a mudança e re-renderiza automaticamente
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao atualizar', mensagem: 'Tente novamente em instantes.' });
  }
}

/**
 * Exclui uma conta do Firestore após confirmação do usuário.
 * O saldo removido é automaticamente recalculado no Patrimônio via sincronizarSaldos().
 *
 * @param {string} id - ID do documento da conta no Firestore
 */
async function excluirConta(id) {
  const conta = estado.contas.find(c => c.id === id);
  if (!conta) return;

  if (conta.saldo > 0) {
    mostrarToast({ tipo: 'danger', titulo: 'Ação não permitida', mensagem: 'Não é possível excluir uma conta que possui saldo. Zere o saldo antes de excluir.' });
    return;
  }

  const nomeConta = `"${conta.nome}"`;
  const confirmado = confirm(
    `Tem certeza que deseja excluir ${nomeConta} permanentemente?`
  );
  if (!confirmado) return;

  const res = await FirestoreService.excluir('dinheiro_contas', id);

  if (res.sucesso) {
    mostrarToast({ tipo: 'success', titulo: 'Conta excluída', mensagem: `${nomeConta} foi removida.` });
    // O listener onSnapshot detecta a remoção e re-renderiza automaticamente
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao excluir', mensagem: 'Tente novamente em instantes.' });
  }
}

/**
 * Preenche e abre o modal de lançamento (entrada ou saída) para uma conta.
 *
 * @param {string} idConta - ID da conta que receberá o lançamento
 */
function abrirModalLancamento(idConta) {
  const conta = estado.contas.find(c => c.id === idConta);
  if (!conta) return;

  // Preenche o hidden input e o nome visível da conta no modal
  document.getElementById('lancamento-conta-id').value       = conta.id;
  document.getElementById('lancamento-conta-nome').textContent = conta.nome;

  // Limpa o campo de valor e reseta para "entrada"
  const formLanc = document.getElementById('form-lancamento');
  if (formLanc) formLanc.reset();
  document.getElementById('lancamento-conta-id').value = conta.id;
  document.getElementById('lancamento-conta-nome').textContent = conta.nome;

  abrirModal('modal-lancamento');
}

/**
 * Atalho: abre o modal de lançamento já selecionado em modo "Entrada".
 * Chamado pelo botão "Adicionar" em cada card de conta.
 *
 * @param {string} idConta - ID da conta que receberá a entrada rápida
 */
function abrirModalEntradaRapida(idConta) {
  // Abre o modal normalmente
  abrirModalLancamento(idConta);

  // Após abrir, força seleção de "entrada" no radio button
  setTimeout(() => {
    const radioEntrada = document.querySelector('input[name="tipoLancamento"][value="entrada"]');
    if (radioEntrada) {
      radioEntrada.checked = true;
      radioEntrada.dispatchEvent(new Event('change'));
    }
  }, 50);
}

/**
 * Registra um lançamento (entrada ou saída) em uma conta.
 * Recalcula o saldo da conta e salva no Firestore.
 * Chamada pelo evento submit do form#form-lancamento.
 *
 * @param {SubmitEvent} evento
 */
async function registrarLancamento(evento) {
  evento.preventDefault();
  const form     = evento.target;
  const formData = new FormData(form);

  const idConta        = formData.get('contaId');
  const valor          = parseMoeda(formData.get('valor'));
  const tipoLancamento = formData.get('tipoLancamento'); // 'entrada' ou 'saida'

  // Validações básicas antes de prosseguir
  const conta = estado.contas.find(c => c.id === idConta);
  if (!conta) return;
  if (valor <= 0) {
    mostrarToast({ tipo: 'warning', titulo: 'Valor inválido', mensagem: 'Informe um valor maior que zero.' });
    return;
  }

  // Calcula o novo saldo: positivo para entrada, negativo para saída
  const variacao  = tipoLancamento === 'entrada' ? valor : -valor;
  const novoSaldo = conta.saldo + variacao;

  // Impede que o saldo fique negativo (opcional, mas previne inconsistências)
  if (novoSaldo < 0) {
    mostrarToast({
      tipo: 'warning',
      titulo: 'Saldo insuficiente',
      mensagem: `Saldo atual: ${formatarMoeda(conta.saldo)}. A saída excede o disponível.`
    });
    return;
  }

  const btnSubmit = form.querySelector('button[type="submit"]');
  if (btnSubmit) btnSubmit.disabled = true;

  // Atualiza apenas o campo saldo no documento da conta
  const res = await FirestoreService.atualizar('dinheiro_contas', idConta, { saldo: novoSaldo });

  if (btnSubmit) btnSubmit.disabled = false;

  if (res.sucesso) {
    fecharModal('modal-lancamento');
    form.reset();
    const labelTipo = tipoLancamento === 'entrada' ? 'Entrada registrada!' : 'Saída registrada!';
    mostrarToast({ tipo: 'success', titulo: labelTipo, mensagem: `${formatarMoeda(valor)} em "${conta.nome}".` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro no lançamento', mensagem: 'Tente novamente em instantes.' });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITÁRIOS DE MODAL
───────────────────────────────────────────────────────────────────────────── */

/**
 * Abre um modal pelo ID, adicionando a classe CSS 'open'.
 * @param {string} id - ID do elemento modal-overlay
 */
function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

/**
 * Fecha um modal pelo ID, removendo a classe CSS 'open'.
 * @param {string} id - ID do elemento modal-overlay
 */
function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO — COMPONENTES HTML
───────────────────────────────────────────────────────────────────────────── */

/**
 * Mapeia o tipo da conta para o ícone do Material Symbols correspondente.
 */
const ICONES_TIPO = {
  corrente: 'account_balance',
  poupanca: 'savings',
  caixa:    'payments',
  outro:    'trending_up'
};

/**
 * Mapeia o tipo da conta para um label legível em português.
 */
const LABELS_TIPO = {
  corrente: 'Conta Corrente',
  poupanca: 'Poupança',
  caixa:    'Caixa Físico',
  outro:    'Outros / Investimentos'
};

/**
 * Gera o HTML de um card de conta individual.
 * Cada card mostra: ícone do tipo, nome, tipo, saldo e botões de ação.
 *
 * @param {Object} conta - Dados da conta ({id, nome, tipo, saldo})
 * @returns {string} HTML do card
 */
function renderizarCardConta(conta) {
  const icone     = ICONES_TIPO[conta.tipo] || 'account_balance_wallet';
  const labelTipo = LABELS_TIPO[conta.tipo] || conta.tipo;

  return `
    <div class="card conta-card" style="margin-bottom: var(--space-4);" role="article" aria-label="Conta: ${conta.nome}">
      <div class="card-body" style="display: flex; align-items: center; justify-content: space-between; gap: var(--space-4);">

        <!-- Ícone e informações da conta -->
        <div style="display: flex; align-items: center; gap: var(--space-4);">
          <div style="
            width: 52px; height: 52px; border-radius: var(--radius-lg);
            background-color: var(--color-success-muted);
            color: var(--color-success);
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;">
            <span class="material-symbols-outlined" style="font-size: 26px;">${icone}</span>
          </div>
          <div>
            <h4 style="margin: 0; font-size: var(--text-base); font-weight: var(--font-semibold); color: var(--text-primary);">${conta.nome}</h4>
            <span style="font-size: var(--text-sm); color: var(--text-muted);">${labelTipo}</span>
          </div>
        </div>

        <!-- Saldo e botões de ação -->
        <div style="display: flex; align-items: center; gap: var(--space-6);">
          <div style="text-align: right;">
            <p style="margin: 0; font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em;">Saldo Atual</p>
            <p class="value-sensitive" style="margin: 0; font-size: var(--text-xl); font-weight: var(--font-bold); color: var(--color-success);">
              ${formatarMoeda(conta.saldo)}
            </p>
          </div>

          <!-- Botões de ação para cada conta -->
          <div style="display: flex; gap: var(--space-2); align-items: center;">
            <button class="btn btn-sm" style="background-color: var(--color-success-muted); color: var(--color-success); border: 1px solid var(--color-success-border); gap: 4px; display: flex; align-items: center;"
                    title="Adicionar valor" data-acao="entrada-rapida" data-id="${conta.id}" aria-label="Adicionar valor em ${conta.nome}">
              <span class="material-symbols-outlined" style="font-size: 16px;">add_circle</span>
              Adicionar
            </button>
            <button class="btn btn-ghost btn-icon" title="Registrar movimentação (entrada/saída)" data-acao="movimentar" data-id="${conta.id}" aria-label="Registrar movimentação em ${conta.nome}">
              <span class="material-symbols-outlined" style="color: var(--color-info);">sync_alt</span>
            </button>
            <button class="btn btn-ghost btn-icon" title="Editar conta" data-acao="editar" data-id="${conta.id}" aria-label="Editar conta ${conta.nome}">
              <span class="material-symbols-outlined" style="color: var(--color-gold);">edit</span>
            </button>
            <button class="btn btn-ghost btn-icon" title="Excluir conta" data-acao="excluir" data-id="${conta.id}" aria-label="Excluir conta ${conta.nome}">
              <span class="material-symbols-outlined" style="color: var(--color-danger);">delete</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  `;
}

/**
 * Gera o HTML do estado vazio — exibido quando o usuário não tem nenhuma conta.
 * Segue o padrão visual do restante da aplicação.
 *
 * @returns {string} HTML do empty state
 */
function renderizarEmptyState() {
  return `
    <div class="empty-state" style="padding: var(--space-16) var(--space-8);">
      <span class="material-symbols-outlined empty-state-icon">account_balance</span>
      <h3 class="empty-state-title">Nenhuma conta cadastrada</h3>
      <p class="empty-state-text">
        Adicione sua primeira conta para começar a controlar seu saldo.<br>
        Pode ser uma conta bancária, poupança, caixa físico ou investimento.
      </p>
      <button class="btn btn-primary" onclick="document.getElementById('modal-nova-conta').classList.add('open')">
        <span class="material-symbols-outlined">add</span>
        Adicionar Primeira Conta
      </button>
    </div>
  `;
}

/**
 * Gera o HTML de todos os modais da tela Dinheiro:
 *   - Modal de nova conta
 *   - Modal de edição de conta (NOVO)
 *   - Modal de lançamento (entrada/saída)
 *
 * @returns {string} HTML dos modais
 */
function renderizarModais() {
  return `
    <!-- ── Modal: Nova Conta ── -->
    <div class="modal-overlay" id="modal-nova-conta" role="dialog" aria-modal="true" aria-labelledby="titulo-modal-nova-conta">
      <div class="modal" style="max-width: 440px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title" id="titulo-modal-nova-conta">Nova Conta</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-nova-conta').classList.remove('open')" aria-label="Fechar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-nova-conta" novalidate>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="nova-conta-nome">Nome da Conta <span class="required">*</span></label>
              <input type="text" id="nova-conta-nome" name="nome" class="form-input"
                     placeholder="Ex: Nubank, Caixa Físico, Inter..." required autocomplete="off">
            </div>
            <div class="form-group">
              <label class="form-label" for="nova-conta-tipo">Tipo de Conta</label>
              <select id="nova-conta-tipo" name="tipo" class="form-input form-select">
                <option value="corrente">Conta Corrente</option>
                <option value="poupanca">Poupança</option>
                <option value="caixa">Caixa Físico</option>
                <option value="outro">Outros / Investimentos</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="nova-conta-saldo">Saldo Inicial (R$)</label>
              <input type="text" id="nova-conta-saldo" name="saldoInicial" class="form-input"
                     placeholder="0,00" inputmode="decimal">
              <small class="text-muted" style="display: block; margin-top: 4px;">
                Deixe em branco ou zero para começar do zero.
              </small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-nova-conta').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">
              <span class="material-symbols-outlined">save</span>
              Salvar Conta
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ── Modal: Editar Conta (NOVO) ── -->
    <div class="modal-overlay" id="modal-editar-conta" role="dialog" aria-modal="true" aria-labelledby="titulo-modal-editar-conta">
      <div class="modal" style="max-width: 440px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title" id="titulo-modal-editar-conta">Editar Conta</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-editar-conta').classList.remove('open')" aria-label="Fechar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-editar-conta" novalidate>
          <!-- Campo oculto para armazenar o ID da conta em edição -->
          <input type="hidden" name="contaId" id="editar-conta-id">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="editar-conta-nome">Nome da Conta <span class="required">*</span></label>
              <input type="text" id="editar-conta-nome" name="nome" class="form-input" required autocomplete="off">
            </div>
            <div class="form-group">
              <label class="form-label" for="editar-conta-tipo">Tipo de Conta</label>
              <select id="editar-conta-tipo" name="tipo" class="form-input form-select">
                <option value="corrente">Conta Corrente</option>
                <option value="poupanca">Poupança</option>
                <option value="caixa">Caixa Físico</option>
                <option value="outro">Outros / Investimentos</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="editar-conta-saldo">Saldo Atual (R$)</label>
              <input type="text" id="editar-conta-saldo" name="saldo" class="form-input" inputmode="decimal">
              <small class="text-muted" style="display: block; margin-top: 4px;">
                Ajuste manual do saldo. Para movimentações do dia a dia, use o botão ↕.
              </small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-editar-conta').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">
              <span class="material-symbols-outlined">save</span>
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ── Modal: Registrar Movimentação (Entrada / Saída) ── -->
    <div class="modal-overlay" id="modal-lancamento" role="dialog" aria-modal="true" aria-labelledby="titulo-modal-lancamento">
      <div class="modal" style="max-width: 420px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title" id="titulo-modal-lancamento">Registrar Movimentação</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-lancamento').classList.remove('open')" aria-label="Fechar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-lancamento" novalidate>
          <!-- Campo oculto para o ID da conta que receberá o lançamento -->
          <input type="hidden" name="contaId" id="lancamento-conta-id">
          <div class="modal-body">
            <!-- Exibe o nome da conta selecionada para contexto -->
            <div style="
              background-color: var(--bg-overlay);
              border: 1px solid var(--border-default);
              border-radius: var(--radius-md);
              padding: var(--space-3) var(--space-4);
              margin-bottom: var(--space-5);
              display: flex; align-items: center; gap: var(--space-3);">
              <span class="material-symbols-outlined" style="color: var(--color-gold); font-size: 20px;">account_balance</span>
              <span style="color: var(--text-secondary); font-size: var(--text-sm);">Conta: </span>
              <strong id="lancamento-conta-nome" style="color: var(--text-primary);"></strong>
            </div>

            <!-- Seletor de tipo: Entrada ou Saída -->
            <div class="form-group">
              <label class="form-label">Tipo de Movimentação</label>
              <div style="display: flex; gap: var(--space-3);">
                <label class="lancamento-tipo-btn" style="
                  flex: 1; display: flex; align-items: center; justify-content: center;
                  gap: var(--space-2); padding: var(--space-3); border-radius: var(--radius-md);
                  border: 1px solid var(--color-success-border); background-color: var(--color-success-muted);
                  color: var(--color-success); cursor: pointer; font-weight: var(--font-semibold);
                  font-size: var(--text-sm);">
                  <input type="radio" name="tipoLancamento" value="entrada" checked style="display: none;">
                  <span class="material-symbols-outlined" style="font-size: 20px;">add_circle</span>
                  Entrada (+)
                </label>
                <label class="lancamento-tipo-btn" style="
                  flex: 1; display: flex; align-items: center; justify-content: center;
                  gap: var(--space-2); padding: var(--space-3); border-radius: var(--radius-md);
                  border: 1px solid var(--border-default); background-color: transparent;
                  color: var(--text-secondary); cursor: pointer; font-weight: var(--font-semibold);
                  font-size: var(--text-sm);">
                  <input type="radio" name="tipoLancamento" value="saida" style="display: none;">
                  <span class="material-symbols-outlined" style="font-size: 20px;">remove_circle</span>
                  Saída (-)
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="lancamento-valor">Valor (R$) <span class="required">*</span></label>
              <input type="text" id="lancamento-valor" name="valor" class="form-input"
                     placeholder="0,00" required inputmode="decimal"
                     style="font-size: var(--text-xl); text-align: center; font-weight: var(--font-bold);">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-lancamento').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">
              <span class="material-symbols-outlined">check_circle</span>
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/**
 * Renderiza a tela principal do módulo Dinheiro.
 * Monta o header, o card de saldo total, a lista de contas e os modais.
 *
 * @param {HTMLElement} container - Elemento #main-content onde o conteúdo será injetado
 */
function renderizarTelaPrincipal(container) {
  // Calcula o saldo total somando todas as contas em memória
  const saldoTotal = estado.contas.reduce((acc, c) => acc + (c.saldo || 0), 0);

  container.innerHTML = `
    <!-- Cabeçalho da página com título e botão de nova conta -->
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-4);">
      <div>
        <h2 class="page-title">Dinheiro</h2>
        <p class="page-subtitle">Saldos em contas bancárias, poupanças e espécie.</p>
      </div>
      <button class="btn btn-primary" id="btn-nova-conta" aria-label="Adicionar nova conta">
        <span class="material-symbols-outlined">add</span>
        Nova Conta
      </button>
    </div>

    <!-- Card de Saldo Consolidado -->
    <div class="card card-gold" style="margin-bottom: var(--space-8); position: relative; overflow: hidden;">
      <div class="card-body" style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-8);">
        <div>
          <p style="color: rgba(255,255,255,0.6); font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: var(--space-2);">
            Saldo Consolidado Geral
          </p>
          <h2 class="value-sensitive" style="margin: 0; font-size: var(--text-4xl); font-weight: var(--font-bold); color: var(--color-gold); line-height: 1; font-family: var(--font-display);">
            ${formatarMoeda(saldoTotal)}
          </h2>
          <p style="margin-top: var(--space-2); font-size: var(--text-sm); color: rgba(255,255,255,0.5);">
            ${estado.contas.length} conta${estado.contas.length !== 1 ? 's' : ''} cadastrada${estado.contas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <!-- Ícone decorativo de fundo -->
        <div style="opacity: 0.12; pointer-events: none; user-select: none;">
          <span class="material-symbols-outlined" style="font-size: 120px; color: var(--color-gold);">account_balance</span>
        </div>
      </div>
    </div>

    <!-- Seção de lista de contas -->
    <div class="dashboard-section-header" style="margin-bottom: var(--space-4);">
      <h3 class="text-lg font-semibold">Minhas Contas</h3>
      <span class="badge badge-neutral">Atualização em tempo real</span>
    </div>

    <!-- Lista dinâmica: contas ou empty state -->
    <div id="contas-lista">
      ${estado.contas.length === 0
        ? renderizarEmptyState()
        : estado.contas.map(renderizarCardConta).join('')
      }
    </div>

    <!-- Modais da tela Dinheiro -->
    ${renderizarModais()}
  `;

  // Registra todos os eventos da tela após injetar o HTML
  registrarEventosTela(container);
}

/**
 * Registra todos os event listeners da tela Dinheiro após a renderização.
 * Centralizado aqui para facilitar manutenção e evitar duplicações.
 *
 * @param {HTMLElement} container - Elemento pai que contém os elementos da tela
 */
function registrarEventosTela(container) {
  // Botão "Nova Conta" → abre modal de criação
  const btnNovaConta = document.getElementById('btn-nova-conta');
  if (btnNovaConta) btnNovaConta.addEventListener('click', () => abrirModal('modal-nova-conta'));

  // Formulário de criação de conta
  const formNovaConta = document.getElementById('form-nova-conta');
  if (formNovaConta) formNovaConta.addEventListener('submit', criarConta);

  // Formulário de edição de conta
  const formEditarConta = document.getElementById('form-editar-conta');
  if (formEditarConta) formEditarConta.addEventListener('submit', atualizarConta);

  // Formulário de lançamento (entrada/saída)
  const formLancamento = document.getElementById('form-lancamento');
  if (formLancamento) formLancamento.addEventListener('submit', registrarLancamento);

  // Delegação de eventos para os botões de ação em cada card de conta
  // (usar delegação evita re-registrar eventos a cada re-render)
  container.querySelectorAll('[data-acao]').forEach(btn => {
    btn.addEventListener('click', () => {
      const acao = btn.getAttribute('data-acao');
      const id   = btn.getAttribute('data-id');

      if (acao === 'movimentar')    abrirModalLancamento(id);
      if (acao === 'editar')         abrirModalEdicao(id);
      if (acao === 'excluir')        excluirConta(id);
      if (acao === 'entrada-rapida') abrirModalEntradaRapida(id);
    });
  });

  // Estilo visual nos radio buttons de tipo de lançamento
  const lancamentoBtns = container.querySelectorAll('.lancamento-tipo-btn');
  lancamentoBtns.forEach(label => {
    const radio = label.querySelector('input[type="radio"]');
    if (!radio) return;
    radio.addEventListener('change', () => {
      // Remove estilo ativo de todos os botões
      lancamentoBtns.forEach(l => {
        l.style.borderColor      = 'var(--border-default)';
        l.style.backgroundColor  = 'transparent';
        l.style.color            = 'var(--text-secondary)';
      });
      // Aplica estilo ativo no botão selecionado
      const corAtiva = radio.value === 'entrada' ? 'var(--color-success)' : 'var(--color-danger)';
      const bgAtiva  = radio.value === 'entrada' ? 'var(--color-success-muted)' : 'var(--color-danger-muted)';
      const borderAtiva = radio.value === 'entrada' ? 'var(--color-success-border)' : 'var(--color-danger-border)';
      label.style.borderColor     = borderAtiva;
      label.style.backgroundColor = bgAtiva;
      label.style.color           = corAtiva;
    });
  });

  // Fechar modais ao clicar fora (no overlay)
  container.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   MÓDULO EXPORTADO
   Expõe apenas o que o router.js precisa: a função renderDinheiro()
───────────────────────────────────────────────────────────────────────────── */
export const DinheiroModule = {

  /**
   * Ponto de entrada do módulo Dinheiro.
   * Chamado pelo router.js ao navegar para a rota #dinheiro.
   *
   * Fluxo:
   *   1. Verifica se o usuário está autenticado (proteção extra além do router)
   *   2. Exibe estado de carregamento
   *   3. Cancela o listener anterior (se existir, para evitar vazamento de memória)
   *   4. Abre novo listener em tempo real na coleção dinheiro_contas
   *   5. A cada mudança: sincroniza o Patrimônio e re-renderiza a interface
   *
   * @param {HTMLElement} container - Elemento #main-content do layout base
   */
  async renderDinheiro(container) {
    // Verificação de segurança: só prossegue se houver usuário autenticado
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    // Estado de loading enquanto o Firebase responde
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-16);">
        <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
        <p style="color: var(--text-muted); margin-top: var(--space-4);">Carregando contas...</p>
      </div>
    `;

    // Cancela listener anterior para evitar múltiplos listeners ativos ao navegar
    if (unsubscribeContas) {
      unsubscribeContas();
      unsubscribeContas = null;
    }

    // Abre listener em tempo real: qualquer mudança na coleção aciona o callback
    unsubscribeContas = FirestoreService.escutar(
      'dinheiro_contas',
      async (contas) => {
        // Atualiza a lista em memória com os dados mais recentes do Firestore
        estado.contas = contas;

        // Recalcula e persiste o saldo total no Patrimônio
        await sincronizarSaldos();

        // Re-renderiza a interface com os dados atualizados
        renderizarTelaPrincipal(container);
      },
      { ordenarPor: 'nome', direcao: 'asc' } // Ordenação alfabética pelo nome da conta
    );
  }
};
