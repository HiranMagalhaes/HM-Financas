/**
 * HM Finanças — Módulo: Cartões (Módulo 6B)
 * ============================================================
 * Gerenciamento de faturas e limites de cartões de crédito do usuário.
 *
 * Fluxo principal:
 *   1. Carrega a tela com estado de loading
 *   2. Abre um listener em tempo real (onSnapshot) na coleção cartoes_lista
 *   3. A cada mudança (criar/editar/excluir/gasto/pagamento), recalcula os totais
 *   4. Salva os totais em cartoes/configuracao e em patrimonio/resumo
 *   5. Re-renderiza a interface automaticamente
 *
 * Regra de negócio para o Patrimônio:
 *   - Cartões são PASSIVOS: entram como dívida (fatura atual usada)
 *   - patrimonio/resumo.cartoes = soma de valorUsado de todos os cartões
 *
 * Coleções Firestore utilizadas:
 *   /usuarios/{uid}/cartoes_lista/{id}    → cada cartão cadastrado
 *   /usuarios/{uid}/cartoes/configuracao  → totais consolidados
 *   /usuarios/{uid}/patrimonio/resumo     → atualizado para refletir no Patrimônio
 */

'use strict';

import { AuthService }      from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, parseMoeda } from '../../utils/formatters.js';
import { mostrarToast }     from '../../utils/helpers.js';

/* ─────────────────────────────────────────────────────────────────────────────
   ESTADO DO MÓDULO
   Armazena a lista de cartões em memória para evitar consultas repetidas.
───────────────────────────────────────────────────────────────────────────── */
let estado = {
  cartoes:    [],  // Lista de cartões carregados do Firestore
  carregando: true
};

/** Referência para cancelar o listener de tempo real ao sair da tela */
let unsubscribeCartoes = null;

/* ─────────────────────────────────────────────────────────────────────────────
   FUNÇÕES DE SINCRONIZAÇÃO COM O PATRIMÔNIO
───────────────────────────────────────────────────────────────────────────── */

/**
 * Recalcula os totais de todos os cartões e atualiza dois locais no Firestore:
 *   1. cartoes/configuracao → cache de configuração do módulo Cartões
 *   2. patrimonio/resumo    → bloco "Cartões" na tela de Patrimônio (como PASSIVO)
 *
 * Patrimônio foca na DÍVIDA ATUAL: usa valorUsado (fatura), não o limite total.
 * Chamada automaticamente sempre que o listener detectar alguma mudança.
 */
async function sincronizarSaldos() {
  // Soma os totais de todos os cartões em memória
  const limiteTotal    = estado.cartoes.reduce((acc, c) => acc + (c.limiteTotal || 0), 0);
  const valorUsado     = estado.cartoes.reduce((acc, c) => acc + (c.valorUsado  || 0), 0);
  const limiteDisponivel = limiteTotal - valorUsado;

  // 1. Salva o resumo consolidado na configuração do módulo Cartões
  await FirestoreService.salvar('cartoes', 'configuracao', {
    limiteTotal,
    valorUsado,
    limiteDisponivel
  });

  // 2. Lê o resumo atual do Patrimônio para não sobrescrever hmcred e dinheiro
  const resumoExistente = await FirestoreService.obter('patrimonio', 'resumo');
  const dadosPatrimonio = resumoExistente.sucesso
    ? resumoExistente.dados
    : { hmcred: 0, dinheiro: 0, cartoes: 0 };

  // Patrimônio registra apenas a DÍVIDA (fatura atual), não o limite
  dadosPatrimonio.cartoes = valorUsado;
  await FirestoreService.salvar('patrimonio', 'resumo', dadosPatrimonio);
}

/* ─────────────────────────────────────────────────────────────────────────────
   AÇÕES DO USUÁRIO — CRUD
───────────────────────────────────────────────────────────────────────────── */

/**
 * Cria um novo cartão de crédito no Firestore.
 * Chamada pelo evento submit do form#form-novo-cartao.
 *
 * @param {SubmitEvent} evento
 */
async function criarCartao(evento) {
  evento.preventDefault();
  const form     = evento.target;
  const formData = new FormData(form);

  const nome         = formData.get('nome').trim();
  const limiteTotal  = parseMoeda(formData.get('limiteTotal'));
  const valorUsado   = parseMoeda(formData.get('valorUsado')) || 0;
  const diaVencimento = parseInt(formData.get('diaVencimento'), 10);

  // Validações antes de enviar
  if (!nome) {
    mostrarToast({ tipo: 'warning', titulo: 'Campo obrigatório', mensagem: 'Informe o nome do cartão.' });
    return;
  }
  if (limiteTotal <= 0) {
    mostrarToast({ tipo: 'warning', titulo: 'Limite inválido', mensagem: 'O limite total deve ser maior que zero.' });
    return;
  }
  if (valorUsado > limiteTotal) {
    mostrarToast({ tipo: 'warning', titulo: 'Fatura excede o limite', mensagem: 'A fatura atual não pode ser maior que o limite total.' });
    return;
  }
  if (!diaVencimento || diaVencimento < 1 || diaVencimento > 31) {
    mostrarToast({ tipo: 'warning', titulo: 'Dia inválido', mensagem: 'Informe um dia de vencimento entre 1 e 31.' });
    return;
  }

  const novoCartao = { nome, limiteTotal, valorUsado, diaVencimento };

  const btnSubmit = form.querySelector('button[type="submit"]');
  if (btnSubmit) btnSubmit.disabled = true;

  const res = await FirestoreService.criar('cartoes_lista', novoCartao);

  if (btnSubmit) btnSubmit.disabled = false;

  if (res.sucesso) {
    fecharModal('modal-novo-cartao');
    form.reset();
    mostrarToast({ tipo: 'success', titulo: 'Cartão adicionado!', mensagem: `"${nome}" foi cadastrado com sucesso.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao criar cartão', mensagem: 'Tente novamente em instantes.' });
  }
}

/**
 * Preenche e abre o modal de edição para um cartão específico.
 * Carrega os dados atuais nos campos do formulário de edição.
 *
 * @param {string} id - ID do documento do cartão no Firestore
 */
function abrirModalEdicao(id) {
  // Busca o cartão na lista em memória para preencher o formulário
  const cartao = estado.cartoes.find(c => c.id === id);
  if (!cartao) return;

  document.getElementById('editar-cartao-id').value          = cartao.id;
  document.getElementById('editar-cartao-nome').value        = cartao.nome;
  document.getElementById('editar-cartao-limite').value      = formatarMoeda(cartao.limiteTotal).replace('R$\u00a0', '').replace('R$ ', '');
  document.getElementById('editar-cartao-vencimento').value  = cartao.diaVencimento;

  abrirModal('modal-editar-cartao');
}

/**
 * Atualiza os dados de um cartão existente no Firestore.
 * Chamada pelo evento submit do form#form-editar-cartao.
 *
 * @param {SubmitEvent} evento
 */
async function atualizarCartao(evento) {
  evento.preventDefault();
  const form     = evento.target;
  const formData = new FormData(form);

  const id            = formData.get('cartaoId');
  const nome          = formData.get('nome').trim();
  const limiteTotal   = parseMoeda(formData.get('limiteTotal'));
  const diaVencimento = parseInt(formData.get('diaVencimento'), 10);

  if (!id || !nome) {
    mostrarToast({ tipo: 'warning', titulo: 'Campo obrigatório', mensagem: 'Informe o nome do cartão.' });
    return;
  }
  if (limiteTotal <= 0) {
    mostrarToast({ tipo: 'warning', titulo: 'Limite inválido', mensagem: 'O limite total deve ser maior que zero.' });
    return;
  }

  const btnSubmit = form.querySelector('button[type="submit"]');
  if (btnSubmit) btnSubmit.disabled = true;

  // Atualiza somente os campos editáveis — mantém valorUsado intacto
  const res = await FirestoreService.atualizar('cartoes_lista', id, { nome, limiteTotal, diaVencimento });

  if (btnSubmit) btnSubmit.disabled = false;

  if (res.sucesso) {
    fecharModal('modal-editar-cartao');
    mostrarToast({ tipo: 'success', titulo: 'Cartão atualizado!', mensagem: `"${nome}" foi salvo com sucesso.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao atualizar', mensagem: 'Tente novamente em instantes.' });
  }
}

/**
 * Exclui um cartão do Firestore após confirmação do usuário.
 * O limite e a fatura removidos são recalculados automaticamente no Patrimônio.
 *
 * @param {string} id - ID do documento do cartão no Firestore
 */
async function excluirCartao(id) {
  const cartao = estado.cartoes.find(c => c.id === id);
  const nomeCartao = cartao ? `"${cartao.nome}"` : 'este cartão';

  const confirmado = confirm(
    `Tem certeza que deseja excluir ${nomeCartao} permanentemente?\n\nSua dívida e limite serão removidos do sistema.`
  );
  if (!confirmado) return;

  const res = await FirestoreService.excluir('cartoes_lista', id);

  if (res.sucesso) {
    mostrarToast({ tipo: 'success', titulo: 'Cartão excluído', mensagem: `${nomeCartao} foi removido.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao excluir', mensagem: 'Tente novamente em instantes.' });
  }
}

/**
 * Preenche e abre o modal de lançamento para um cartão.
 * Funciona tanto para registrar um GASTO quanto para pagar a FATURA.
 *
 * @param {string} idCartao - ID do cartão que receberá o lançamento
 * @param {'gasto' | 'pagamento'} tipoAcao - Tipo da operação
 */
function abrirModalLancamento(idCartao, tipoAcao) {
  const cartao = estado.cartoes.find(c => c.id === idCartao);
  if (!cartao) return;

  // Preenche os campos de contexto no modal
  document.getElementById('lancamento-cartao-id').value            = cartao.id;
  document.getElementById('lancamento-cartao-nome').textContent    = cartao.nome;
  document.getElementById('lancamento-cartao-tipo').value          = tipoAcao;

  // Limpa campo de valor ao reabrir
  const inputValor = document.getElementById('lancamento-valor-cartao');
  if (inputValor) inputValor.value = '';

  // Personaliza o título e o ícone do modal conforme o tipo de ação
  const tituloModal = document.getElementById('modal-lancamento-cartao-titulo');
  const iconeModal  = document.getElementById('modal-lancamento-cartao-icone');
  const btnConfirmar = document.getElementById('btn-confirmar-lancamento-cartao');

  if (tipoAcao === 'gasto') {
    if (tituloModal) tituloModal.textContent  = 'Registrar Gasto (Nova Compra)';
    if (iconeModal)  iconeModal.textContent   = 'shopping_cart';
    if (btnConfirmar) btnConfirmar.textContent = 'Registrar Gasto';
    if (btnConfirmar) btnConfirmar.style.background = 'var(--gradient-gold)';
  } else {
    if (tituloModal) tituloModal.textContent  = 'Pagar Fatura';
    if (iconeModal)  iconeModal.textContent   = 'payments';
    if (btnConfirmar) btnConfirmar.textContent = 'Confirmar Pagamento';
    if (btnConfirmar) btnConfirmar.style.background = 'var(--color-success)';
  }

  // Exibe saldo disponível como contexto
  const disponivel = cartao.limiteTotal - cartao.valorUsado;
  const infoExtra = document.getElementById('lancamento-cartao-info');
  if (infoExtra) {
    if (tipoAcao === 'gasto') {
      infoExtra.innerHTML = `Limite disponível: <strong style="color: var(--color-success);">${formatarMoeda(disponivel)}</strong>`;
    } else {
      infoExtra.innerHTML = `Fatura atual: <strong style="color: var(--color-danger);">${formatarMoeda(cartao.valorUsado)}</strong>`;
    }
  }

  abrirModal('modal-lancamento-cartao');
}

/**
 * Efetua um lançamento em um cartão (gasto ou pagamento de fatura).
 * Recalcula o valorUsado e persiste no Firestore.
 * Chamada pelo evento submit do form#form-lancamento-cartao.
 *
 * @param {SubmitEvent} evento
 */
async function registrarLancamento(evento) {
  evento.preventDefault();
  const form     = evento.target;
  const formData = new FormData(form);

  const idCartao  = formData.get('cartaoId');
  const valor     = parseMoeda(formData.get('valor'));
  const tipoAcao  = formData.get('tipoAcao'); // 'gasto' ou 'pagamento'

  const cartao = estado.cartoes.find(c => c.id === idCartao);
  if (!cartao) return;

  if (valor <= 0) {
    mostrarToast({ tipo: 'warning', titulo: 'Valor inválido', mensagem: 'Informe um valor maior que zero.' });
    return;
  }

  let novoValorUsado = cartao.valorUsado;

  if (tipoAcao === 'gasto') {
    // Verifica se há limite disponível para o gasto
    const disponivel = cartao.limiteTotal - cartao.valorUsado;
    if (valor > disponivel) {
      mostrarToast({
        tipo: 'warning',
        titulo: 'Limite insuficiente',
        mensagem: `Disponível: ${formatarMoeda(disponivel)}. Valor excede o limite.`
      });
      return;
    }
    novoValorUsado += valor; // Gasto aumenta a fatura
  } else if (tipoAcao === 'pagamento') {
    novoValorUsado -= valor; // Pagamento reduz a fatura
    if (novoValorUsado < 0) novoValorUsado = 0; // Fatura não pode ser negativa
  }

  const btnSubmit = form.querySelector('button[type="submit"]');
  if (btnSubmit) btnSubmit.disabled = true;

  const res = await FirestoreService.atualizar('cartoes_lista', idCartao, { valorUsado: novoValorUsado });

  if (btnSubmit) btnSubmit.disabled = false;

  if (res.sucesso) {
    fecharModal('modal-lancamento-cartao');
    form.reset();
    const labelTipo = tipoAcao === 'gasto' ? 'Gasto registrado!' : 'Pagamento realizado!';
    const detalhes  = tipoAcao === 'gasto'
      ? `${formatarMoeda(valor)} adicionado à fatura de "${cartao.nome}".`
      : `${formatarMoeda(valor)} pago na fatura de "${cartao.nome}".`;
    mostrarToast({ tipo: 'success', titulo: labelTipo, mensagem: detalhes });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro no lançamento', mensagem: 'Tente novamente em instantes.' });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITÁRIOS DE MODAL
───────────────────────────────────────────────────────────────────────────── */

/**
 * Abre um modal pelo ID.
 * @param {string} id
 */
function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

/**
 * Fecha um modal pelo ID.
 * @param {string} id
 */
function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO — COMPONENTES HTML
───────────────────────────────────────────────────────────────────────────── */

/**
 * Gera o HTML visual de um cartão de crédito com aparência de cartão físico estilizado.
 * Inclui: nome, dia de vencimento, barra de uso do limite e botões de ação.
 *
 * Design inspirado em cartões físicos premium (gradiente escuro, chip decorativo).
 *
 * @param {Object} cartao - Dados do cartão ({id, nome, limiteTotal, valorUsado, diaVencimento})
 * @returns {string} HTML do card
 */
function renderizarCartao(cartao) {
  const disponivel       = cartao.limiteTotal - cartao.valorUsado;
  const porcentagemUso   = cartao.limiteTotal > 0
    ? (cartao.valorUsado / cartao.limiteTotal) * 100
    : 0;

  // Define a cor da barra de progresso conforme o nível de uso do limite
  let corBarra = 'var(--color-success)';
  if (porcentagemUso > 60) corBarra = 'var(--color-warning)';
  if (porcentagemUso > 85) corBarra = 'var(--color-danger)';

  // Label do vencimento
  const labelVenc = cartao.diaVencimento
    ? `Vence dia ${cartao.diaVencimento}`
    : 'Sem vencimento';

  return `
    <div class="credit-card-wrapper" role="article" aria-label="Cartão: ${cartao.nome}">

      <!-- Face do Cartão Físico Estilizado -->
      <div class="credit-card-visual">
        <!-- Chip decorativo -->
        <div class="cc-chip" aria-hidden="true">
          <div class="cc-chip-inner"></div>
        </div>

        <!-- Nome do cartão e vencimento -->
        <div class="cc-top-row">
          <span class="cc-issuer">HM Finanças</span>
          <span class="cc-venc">${labelVenc}</span>
        </div>

        <!-- Número decorativo de cartão -->
        <div class="cc-number" aria-hidden="true">
          <span>••••</span><span>••••</span><span>••••</span><span>••••</span>
        </div>

        <!-- Nome do portador e limite -->
        <div class="cc-bottom-row">
          <div>
            <p class="cc-label">Portador</p>
            <p class="cc-value">${cartao.nome.toUpperCase()}</p>
          </div>
          <div style="text-align: right;">
            <p class="cc-label">Limite Total</p>
            <p class="cc-value value-sensitive">${formatarMoeda(cartao.limiteTotal)}</p>
          </div>
        </div>

        <!-- Logo decorativo -->
        <div class="cc-logo-area" aria-hidden="true">
          <span class="material-symbols-outlined" style="font-size: 32px; opacity: 0.8;">credit_card</span>
        </div>
      </div>

      <!-- Painel de Controle do Cartão -->
      <div class="card" style="border-radius: 0 0 var(--radius-xl) var(--radius-xl); border-top: none;">
        <div class="card-body">

          <!-- Linha de valores: Fatura vs Disponível -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-4);">
            <div>
              <p style="margin: 0; font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em;">Fatura Atual</p>
              <p class="value-sensitive" style="margin: 0; font-size: var(--text-xl); font-weight: var(--font-bold); color: var(--color-danger);">
                ${formatarMoeda(cartao.valorUsado)}
              </p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0; font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em;">Disponível</p>
              <p class="value-sensitive" style="margin: 0; font-size: var(--text-lg); font-weight: var(--font-semibold); color: var(--color-success);">
                ${formatarMoeda(disponivel)}
              </p>
            </div>
          </div>

          <!-- Barra de uso do limite -->
          <div style="margin-bottom: var(--space-5);">
            <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-2);">
              <span style="font-size: var(--text-xs); color: var(--text-muted);">Uso do limite</span>
              <span style="font-size: var(--text-xs); font-weight: var(--font-semibold); color: ${corBarra};">
                ${porcentagemUso.toFixed(1)}%
              </span>
            </div>
            <div style="width: 100%; height: 6px; background-color: var(--bg-hover); border-radius: var(--radius-full); overflow: hidden;">
              <div style="
                width: ${Math.min(porcentagemUso, 100)}%;
                height: 100%;
                background-color: ${corBarra};
                border-radius: var(--radius-full);
                transition: width 0.5s ease;
              "></div>
            </div>
          </div>

          <!-- Botões de Ação -->
          <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-3);">
            <button class="btn btn-primary" style="flex: 1;" data-acao="gasto" data-id="${cartao.id}" aria-label="Registrar gasto em ${cartao.nome}">
              <span class="material-symbols-outlined icon-sm">shopping_cart</span>
              Registrar Gasto
            </button>
            <button class="btn btn-secondary" style="flex: 1;" data-acao="pagamento" data-id="${cartao.id}" aria-label="Pagar fatura de ${cartao.nome}">
              <span class="material-symbols-outlined icon-sm">payments</span>
              Pagar Fatura
            </button>
          </div>

          <!-- Botões secundários: Editar e Excluir -->
          <div style="display: flex; gap: var(--space-2); justify-content: flex-end;">
            <button class="btn btn-ghost btn-sm" data-acao="editar" data-id="${cartao.id}" aria-label="Editar cartão ${cartao.nome}">
              <span class="material-symbols-outlined icon-sm" style="color: var(--color-gold);">edit</span>
              Editar
            </button>
            <button class="btn btn-ghost btn-sm" data-acao="excluir" data-id="${cartao.id}" aria-label="Excluir cartão ${cartao.nome}">
              <span class="material-symbols-outlined icon-sm" style="color: var(--color-danger);">delete</span>
              Excluir
            </button>
          </div>

        </div>
      </div>

    </div>
  `;
}

/**
 * Gera o HTML do empty state elegante — exibido quando não há cartões cadastrados.
 *
 * @returns {string} HTML do empty state
 */
function renderizarEmptyState() {
  return `
    <div class="empty-state" style="padding: var(--space-16) var(--space-8); grid-column: 1 / -1;">
      <span class="material-symbols-outlined empty-state-icon">credit_card</span>
      <h3 class="empty-state-title">Nenhum cartão cadastrado</h3>
      <p class="empty-state-text">
        Adicione seus cartões de crédito para controlar faturas e limites.<br>
        Mantenha tudo sob controle em um só lugar.
      </p>
      <button class="btn btn-primary" onclick="document.getElementById('modal-novo-cartao').classList.add('open')">
        <span class="material-symbols-outlined">add</span>
        Adicionar Primeiro Cartão
      </button>
    </div>
  `;
}

/**
 * Gera o HTML de todos os modais da tela Cartões:
 *   - Modal de novo cartão
 *   - Modal de edição de cartão (NOVO)
 *   - Modal de lançamento (gasto / pagamento)
 *
 * @returns {string} HTML dos modais
 */
function renderizarModais() {
  return `
    <!-- ── Modal: Novo Cartão ── -->
    <div class="modal-overlay" id="modal-novo-cartao" role="dialog" aria-modal="true" aria-labelledby="titulo-modal-novo-cartao">
      <div class="modal" style="max-width: 460px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title" id="titulo-modal-novo-cartao">Novo Cartão de Crédito</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-novo-cartao').classList.remove('open')" aria-label="Fechar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-novo-cartao" novalidate>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="novo-cartao-nome">Nome do Cartão <span class="required">*</span></label>
              <input type="text" id="novo-cartao-nome" name="nome" class="form-input"
                     placeholder="Ex: Nubank, Inter, Itaú Gold..." required autocomplete="off">
            </div>
            <div style="display: flex; gap: var(--space-4);">
              <div class="form-group" style="flex: 2;">
                <label class="form-label" for="novo-cartao-limite">Limite Total (R$) <span class="required">*</span></label>
                <input type="text" id="novo-cartao-limite" name="limiteTotal" class="form-input"
                       placeholder="0,00" required inputmode="decimal">
              </div>
              <div class="form-group" style="flex: 1;">
                <label class="form-label" for="novo-cartao-vencimento">Vence Dia <span class="required">*</span></label>
                <input type="number" id="novo-cartao-vencimento" name="diaVencimento" class="form-input"
                       min="1" max="31" placeholder="Ex: 10" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="novo-cartao-fatura">Fatura Atual (R$)</label>
              <input type="text" id="novo-cartao-fatura" name="valorUsado" class="form-input"
                     placeholder="0,00" inputmode="decimal">
              <small class="text-muted" style="display: block; margin-top: 4px;">
                Valor já gasto/em aberto no momento do cadastro. Deixe em branco se for zero.
              </small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-novo-cartao').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">
              <span class="material-symbols-outlined">save</span>
              Salvar Cartão
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ── Modal: Editar Cartão (NOVO) ── -->
    <div class="modal-overlay" id="modal-editar-cartao" role="dialog" aria-modal="true" aria-labelledby="titulo-modal-editar-cartao">
      <div class="modal" style="max-width: 460px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title" id="titulo-modal-editar-cartao">Editar Cartão</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-editar-cartao').classList.remove('open')" aria-label="Fechar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-editar-cartao" novalidate>
          <!-- ID oculto do cartão em edição -->
          <input type="hidden" name="cartaoId" id="editar-cartao-id">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="editar-cartao-nome">Nome do Cartão <span class="required">*</span></label>
              <input type="text" id="editar-cartao-nome" name="nome" class="form-input" required autocomplete="off">
            </div>
            <div style="display: flex; gap: var(--space-4);">
              <div class="form-group" style="flex: 2;">
                <label class="form-label" for="editar-cartao-limite">Limite Total (R$) <span class="required">*</span></label>
                <input type="text" id="editar-cartao-limite" name="limiteTotal" class="form-input"
                       required inputmode="decimal">
              </div>
              <div class="form-group" style="flex: 1;">
                <label class="form-label" for="editar-cartao-vencimento">Vence Dia</label>
                <input type="number" id="editar-cartao-vencimento" name="diaVencimento" class="form-input"
                       min="1" max="31">
              </div>
            </div>
            <div style="
              background-color: var(--color-warning-muted);
              border: 1px solid var(--color-warning);
              border-radius: var(--radius-md);
              padding: var(--space-3) var(--space-4);
              display: flex; gap: var(--space-2); align-items: flex-start;">
              <span class="material-symbols-outlined" style="color: var(--color-warning); font-size: 18px; flex-shrink: 0;">info</span>
              <small style="color: var(--color-warning); font-size: var(--text-xs);">
                A edição altera nome, limite e vencimento. Para ajustar a fatura, use os botões "Registrar Gasto" ou "Pagar Fatura".
              </small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-editar-cartao').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">
              <span class="material-symbols-outlined">save</span>
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ── Modal: Lançamento (Gasto / Pagamento) ── -->
    <div class="modal-overlay" id="modal-lancamento-cartao" role="dialog" aria-modal="true" aria-labelledby="modal-lancamento-cartao-titulo">
      <div class="modal" style="max-width: 400px; width: 100%;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: var(--space-2);">
            <span class="material-symbols-outlined" id="modal-lancamento-cartao-icone" style="color: var(--color-gold);">shopping_cart</span>
            <h3 class="modal-title" id="modal-lancamento-cartao-titulo">Registrar Gasto</h3>
          </div>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-lancamento-cartao').classList.remove('open')" aria-label="Fechar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-lancamento-cartao" novalidate>
          <!-- Campos ocultos: ID do cartão e tipo da ação -->
          <input type="hidden" name="cartaoId" id="lancamento-cartao-id">
          <input type="hidden" name="tipoAcao" id="lancamento-cartao-tipo">
          <div class="modal-body">
            <!-- Contexto: nome do cartão e saldo disponível/fatura -->
            <div style="
              background-color: var(--bg-overlay);
              border: 1px solid var(--border-default);
              border-radius: var(--radius-md);
              padding: var(--space-3) var(--space-4);
              margin-bottom: var(--space-5);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: var(--space-2);">
                  <span class="material-symbols-outlined" style="color: var(--color-gold); font-size: 18px;">credit_card</span>
                  <span style="font-size: var(--text-sm); color: var(--text-secondary);">Cartão: </span>
                  <strong id="lancamento-cartao-nome" style="color: var(--text-primary); font-size: var(--text-sm);"></strong>
                </div>
              </div>
              <p id="lancamento-cartao-info" style="margin: var(--space-2) 0 0; font-size: var(--text-sm); color: var(--text-muted);"></p>
            </div>

            <!-- Campo de valor em destaque -->
            <div class="form-group">
              <label class="form-label" for="lancamento-valor-cartao">Valor (R$) <span class="required">*</span></label>
              <input type="text" id="lancamento-valor-cartao" name="valor" class="form-input"
                     placeholder="0,00" required inputmode="decimal"
                     style="font-size: var(--text-2xl); text-align: center; font-weight: var(--font-bold);">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-lancamento-cartao').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="btn-confirmar-lancamento-cartao">
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/**
 * Renderiza a tela principal do módulo Cartões.
 * Monta o header, os cards de totais, a grade de cartões e os modais.
 *
 * @param {HTMLElement} container - Elemento #main-content onde o conteúdo é injetado
 */
function renderizarTelaPrincipal(container) {
  // Calcula totais a partir da lista em memória
  const limiteTotal      = estado.cartoes.reduce((acc, c) => acc + (c.limiteTotal || 0), 0);
  const valorUsado       = estado.cartoes.reduce((acc, c) => acc + (c.valorUsado  || 0), 0);
  const limiteDisponivel = limiteTotal - valorUsado;

  container.innerHTML = `
    <!-- Cabeçalho da página -->
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-4);">
      <div>
        <h2 class="page-title">Cartões de Crédito</h2>
        <p class="page-subtitle">Gerencie faturas, limites e gastos dos seus cartões.</p>
      </div>
      <button class="btn btn-primary" id="btn-novo-cartao" aria-label="Adicionar novo cartão">
        <span class="material-symbols-outlined">add</span>
        Novo Cartão
      </button>
    </div>

    <!-- Cards de totais consolidados -->
    <div class="stats-grid" role="region" aria-label="Resumo de Cartões" style="margin-bottom: var(--space-8);">

      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Limite Total</span>
          <div class="stat-card-icon">
            <span class="material-symbols-outlined">credit_score</span>
          </div>
        </div>
        <div class="stat-card-value value-sensitive">${formatarMoeda(limiteTotal)}</div>
        <div class="stat-card-sub">
          <span class="material-symbols-outlined" style="font-size: 14px;">info</span>
          Soma de todos os limites
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Fatura Atual (Total)</span>
          <div class="stat-card-icon" style="background-color: var(--color-danger-muted); color: var(--color-danger);">
            <span class="material-symbols-outlined">receipt_long</span>
          </div>
        </div>
        <div class="stat-card-value text-danger value-sensitive">${formatarMoeda(valorUsado)}</div>
        <div class="stat-card-sub">
          <span class="material-symbols-outlined" style="font-size: 14px;">trending_up</span>
          Total em aberto/usado
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Limite Disponível</span>
          <div class="stat-card-icon" style="background-color: var(--color-success-muted); color: var(--color-success);">
            <span class="material-symbols-outlined">verified</span>
          </div>
        </div>
        <div class="stat-card-value text-success value-sensitive">${formatarMoeda(limiteDisponivel)}</div>
        <div class="stat-card-sub">
          <span class="material-symbols-outlined" style="font-size: 14px;">check_circle</span>
          Disponível para uso
        </div>
      </div>

    </div>

    <!-- Seção da lista de cartões -->
    <div class="dashboard-section-header" style="margin-bottom: var(--space-6);">
      <h3 class="text-lg font-semibold">Meus Cartões</h3>
      <span class="badge badge-neutral">Atualização em tempo real</span>
    </div>

    <!-- Grade de cartões ou empty state -->
    <div id="cartoes-grade" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--space-6);">
      ${estado.cartoes.length === 0
        ? renderizarEmptyState()
        : estado.cartoes.map(renderizarCartao).join('')
      }
    </div>

    <!-- Modais da tela Cartões -->
    ${renderizarModais()}
  `;

  // Registra todos os eventos após injetar o HTML no DOM
  registrarEventosTela(container);
}

/**
 * Registra todos os event listeners da tela Cartões após a renderização.
 *
 * @param {HTMLElement} container - Elemento pai da tela
 */
function registrarEventosTela(container) {
  // Botão "Novo Cartão" → abre modal de criação
  const btnNovoCartao = document.getElementById('btn-novo-cartao');
  if (btnNovoCartao) btnNovoCartao.addEventListener('click', () => abrirModal('modal-novo-cartao'));

  // Formulário de criação de cartão
  const formNovoCartao = document.getElementById('form-novo-cartao');
  if (formNovoCartao) formNovoCartao.addEventListener('submit', criarCartao);

  // Formulário de edição de cartão
  const formEditarCartao = document.getElementById('form-editar-cartao');
  if (formEditarCartao) formEditarCartao.addEventListener('submit', atualizarCartao);

  // Formulário de lançamento (gasto / pagamento)
  const formLancamento = document.getElementById('form-lancamento-cartao');
  if (formLancamento) formLancamento.addEventListener('submit', registrarLancamento);

  // Delegação de eventos para botões de ação em cada card de cartão
  container.querySelectorAll('[data-acao]').forEach(btn => {
    btn.addEventListener('click', () => {
      const acao = btn.getAttribute('data-acao');
      const id   = btn.getAttribute('data-id');

      if (acao === 'gasto'    ) abrirModalLancamento(id, 'gasto');
      if (acao === 'pagamento') abrirModalLancamento(id, 'pagamento');
      if (acao === 'editar'   ) abrirModalEdicao(id);
      if (acao === 'excluir'  ) excluirCartao(id);
    });
  });

  // Fechar modais ao clicar no overlay externo
  container.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   MÓDULO EXPORTADO
   Expõe apenas o que o router.js precisa: a função renderCartoes()
───────────────────────────────────────────────────────────────────────────── */
export const CartoesModule = {

  /**
   * Ponto de entrada do módulo Cartões.
   * Chamado pelo router.js ao navegar para a rota #cartoes.
   *
   * Fluxo:
   *   1. Verifica autenticação do usuário
   *   2. Exibe estado de carregamento
   *   3. Cancela o listener anterior (evita vazamento de memória)
   *   4. Abre novo listener em tempo real na coleção cartoes_lista
   *   5. A cada mudança: sincroniza o Patrimônio e re-renderiza a interface
   *
   * @param {HTMLElement} container - Elemento #main-content do layout base
   */
  async renderCartoes(container) {
    // Verificação extra de segurança além da proteção do router
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    // Exibe loading enquanto o Firestore responde
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-16);">
        <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
        <p style="color: var(--text-muted); margin-top: var(--space-4);">Carregando cartões...</p>
      </div>
    `;

    // Cancela listener anterior para evitar múltiplos listeners ativos
    if (unsubscribeCartoes) {
      unsubscribeCartoes();
      unsubscribeCartoes = null;
    }

    // Listener em tempo real: qualquer mudança na coleção aciona o callback
    unsubscribeCartoes = FirestoreService.escutar(
      'cartoes_lista',
      async (cartoes) => {
        // Atualiza lista em memória com os dados do Firestore
        estado.cartoes = cartoes;

        // Recalcula totais e persiste no Patrimônio
        await sincronizarSaldos();

        // Re-renderiza a interface
        renderizarTelaPrincipal(container);
      },
      { ordenarPor: 'nome', direcao: 'asc' } // Ordenação alfabética
    );
  }
};
