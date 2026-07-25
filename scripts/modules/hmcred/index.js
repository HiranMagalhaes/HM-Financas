/**
 * HM Finanças — Módulo: HMCRED (Módulo 5)
 * ============================================================
 * Sistema de crédito próprio do usuário.
 * Controla capital disponível, capital emprestado, limite total
 * e operações de crédito individuais.
 *
 * COMO FUNCIONA:
 *   - O router.js chama HmcredModule.renderHmcred(container)
 *   - O módulo busca a configuração de limite/capital e as operações
 *     do Firestore para o usuário autenticado
 *   - Toda criação, edição ou exclusão atualiza o resumo do Patrimônio
 *     (usuarios/{uid}/patrimônio/resumo) automaticamente
 *
 * FIRESTORE (estrutura de dados):
 *
 *   1. usuarios/{uid}/hmcred/configuracao → {
 *        limiteTotal:     number,   ← capital máximo disponível para empréstimos
 *        capitalDisponivel: number, ← quanto resta para emprestar
 *        atualizadoEm:   timestamp
 *      }
 *
 *   2. usuarios/{uid}/hmcred/operacoes/{opId} → {
 *        nome:           string,   ← nome/identificação do devedor
 *        valor:          number,   ← valor concedido
 *        taxaJuros:      number,   ← taxa de juros (%, opcional; 0 = sem juros)
 *        totalAReceber:  number,   ← valor + juros calculado
 *        dataConcessao:  string,   ← 'AAAA-MM-DD'
 *        dataRetorno:    string,   ← data prevista de retorno ('AAAA-MM-DD')
 *        status:         string,   ← 'aberto' | 'pago' | 'atrasado'
 *        observacao:     string,   ← notas adicionais (opcional)
 *        criadoEm:       timestamp
 *        atualizadoEm:   timestamp
 *      }
 *
 * ATUALIZAÇÃO DO PATRIMÔNIO:
 *   - Sempre que uma operação é criada, editada ou excluída, recalcula
 *     o totalHmcred e salva em usuarios/{uid}/patrimônio/resumo
 *
 * PADRÃO SEGUIDO:
 *   - Mesmo padrão do módulo patrimônio/index.js
 *   - export const HmcredModule = { render...() {} }
 */

'use strict';

import { AuthService }              from '../../firebase/auth-service.js';
import { FirestoreService }         from '../../firebase/firestore-service.js';
import { salvarResumoPatrimonio }   from '../patrimonio/index.js';
import { formatarMoeda, formatarData } from '../../utils/formatters.js';
import { mostrarToast }             from '../../utils/helpers.js';

// Importa funções do Firestore necessárias para doc único (configuração)
import {
  getDoc, setDoc, serverTimestamp, collection, doc, addDoc, getDocs, updateDoc, deleteDoc, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { db, auth } from '../../firebase/firebase-init.js';


/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTES DO MÓDULO
───────────────────────────────────────────────────────────────────────────── */

/** ID do documento único de configuração dentro da coleção hmcred */
const DOC_CONFIGURACAO = 'configuracao';

/** ID da subcoleção de operações dentro da coleção hmcred */
const SUBCOL_OPERACOES = 'operacoes';

/** Configuração padrão quando o usuário ainda não definiu limite */
const CONFIG_PADRAO = {
  limiteTotal:       0,
  capitalDisponivel: 0,
};


/* ─────────────────────────────────────────────────────────────────────────────
   FUNÇÕES DE ACESSO AO FIRESTORE
   Isoladas aqui para facilitar testes e reutilização.
───────────────────────────────────────────────────────────────────────────── */

/**
 * Retorna a referência à coleção raiz do HMCRED do usuário.
 * Caminho: usuarios/{uid}/hmcred
 *
 * @returns {import("firebase/firestore").CollectionReference | null}
 */
function colecaoHmcred() {
  const uid = auth?.currentUser?.uid;
  if (!db || !uid) return null;
  return collection(db, 'usuarios', uid, 'hmcred');
}

/**
 * Retorna a referência ao documento único de configuração.
 * Caminho: usuarios/{uid}/hmcred/configuracao
 *
 * @returns {import("firebase/firestore").DocumentReference | null}
 */
function docConfiguracao() {
  const uid = auth?.currentUser?.uid;
  if (!db || !uid) return null;
  return doc(db, 'usuarios', uid, 'hmcred', DOC_CONFIGURACAO);
}

/**
 * Retorna a referência à subcoleção de operações.
 * Caminho: usuarios/{uid}/hmcred/operacoes
 *
 * @returns {import("firebase/firestore").CollectionReference | null}
 */
function colecaoOperacoes() {
  const uid = auth?.currentUser?.uid;
  if (!db || !uid) return null;
  return collection(db, 'usuarios', uid, 'hmcred', SUBCOL_OPERACOES);  // Não existe como subcoleção direta, usar subcolection via doc pai
}

/**
 * Busca a configuração de limite e capital disponível.
 * Retorna CONFIG_PADRAO se ainda não houver configuração salva.
 *
 * @returns {Promise<object>} Dados da configuração
 */
async function buscarConfiguracao() {
  const ref = docConfiguracao();
  if (!ref) return { ...CONFIG_PADRAO };

  try {
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : { ...CONFIG_PADRAO };
  } catch (erro) {
    console.error('[HMCRED] Erro ao buscar configuração:', erro);
    return { ...CONFIG_PADRAO };
  }
}

/**
 * Salva (cria ou atualiza) a configuração de limite e capital.
 *
 * @param {object} dados - { limiteTotal, capitalDisponivel }
 * @returns {Promise<boolean>}
 */
async function salvarConfiguracao(dados) {
  const ref = docConfiguracao();
  if (!ref) return false;

  try {
    await setDoc(ref, { ...dados, atualizadoEm: serverTimestamp() }, { merge: true });
    return true;
  } catch (erro) {
    console.error('[HMCRED] Erro ao salvar configuração:', erro);
    return false;
  }
}

/**
 * Busca todas as operações de crédito do usuário, ordenadas por data de concessão.
 *
 * @returns {Promise<object[]>} Array de operações
 */
async function buscarOperacoes() {
  const uid = auth?.currentUser?.uid;
  if (!db || !uid) return [];

  try {
    // Acessa a subcoleção: usuarios/{uid}/hmcred/operacoes
    const colRef = collection(db, 'usuarios', uid, 'hmcred', DOC_CONFIGURACAO, SUBCOL_OPERACOES);
    const q = query(colRef, orderBy('criadoEm', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (erro) {
    console.error('[HMCRED] Erro ao buscar operações:', erro);
    return [];
  }
}

/**
 * Retorna a referência à subcoleção de operações do usuário autenticado.
 * Caminho: usuarios/{uid}/hmcred/configuracao/operacoes
 *
 * Nota: usamos 'configuracao' como documento pai da subcoleção de operações
 * para manter a modelagem simples em uma única coleção 'hmcred'.
 *
 * @returns {import("firebase/firestore").CollectionReference | null}
 */
function refOperacoes() {
  const uid = auth?.currentUser?.uid;
  if (!db || !uid) return null;
  return collection(db, 'usuarios', uid, 'hmcred', DOC_CONFIGURACAO, SUBCOL_OPERACOES);
}

/**
 * Cria uma nova operação de crédito.
 *
 * @param {object} operacao - Dados da operação
 * @returns {Promise<{ sucesso: boolean, id?: string, erro?: string }>}
 */
async function criarOperacao(operacao) {
  const ref = refOperacoes();
  if (!ref) return { sucesso: false, erro: 'Serviço indisponível.' };

  try {
    const agora = serverTimestamp();
    const docRef = await addDoc(ref, {
      ...operacao,
      status:       operacao.status || 'aberto',
      criadoEm:     agora,
      atualizadoEm: agora,
    });
    return { sucesso: true, id: docRef.id };
  } catch (erro) {
    console.error('[HMCRED] Erro ao criar operação:', erro);
    return { sucesso: false, erro: 'Não foi possível salvar a operação.' };
  }
}

/**
 * Atualiza campos de uma operação existente.
 *
 * @param {string} id - ID do documento da operação
 * @param {object} dados - Campos a atualizar
 * @returns {Promise<boolean>}
 */
async function atualizarOperacao(id, dados) {
  const ref = refOperacoes();
  if (!ref) return false;

  try {
    const docRef = doc(ref, id);
    await updateDoc(docRef, { ...dados, atualizadoEm: serverTimestamp() });
    return true;
  } catch (erro) {
    console.error('[HMCRED] Erro ao atualizar operação:', erro);
    return false;
  }
}

/**
 * Exclui uma operação de crédito.
 *
 * @param {string} id - ID do documento da operação
 * @returns {Promise<boolean>}
 */
async function excluirOperacao(id) {
  const ref = refOperacoes();
  if (!ref) return false;

  try {
    const docRef = doc(ref, id);
    await deleteDoc(docRef);
    return true;
  } catch (erro) {
    console.error('[HMCRED] Erro ao excluir operação:', erro);
    return false;
  }
}

/**
 * Recalcula o totalHmcred (soma das operações em aberto e atrasadas)
 * e atualiza o resumo do Patrimônio no Firestore.
 * Chamado após qualquer criação, edição ou exclusão de operação.
 *
 * @param {object[]} operacoes - Lista atual de operações
 */
async function atualizarPatrimonio(operacoes) {
  // Soma apenas operações em aberto ou atrasadas (não pagas)
  const totalHmcred = operacoes
    .filter(op => op.status === 'aberto' || op.status === 'atrasado')
    .reduce((soma, op) => soma + (op.valor || 0), 0);

  // Salva no documento resumo do Patrimônio
  await salvarResumoPatrimonio({ totalHmcred });
  console.log('[HMCRED] Patrimônio atualizado. totalHmcred:', totalHmcred);
}


/* ─────────────────────────────────────────────────────────────────────────────
   FUNÇÕES AUXILIARES DE RENDERIZAÇÃO HTML
───────────────────────────────────────────────────────────────────────────── */

/**
 * Retorna o HTML do badge de status de uma operação.
 *
 * @param {'aberto'|'pago'|'atrasado'} status
 * @returns {string} HTML do badge
 */
function gerarBadgeStatus(status) {
  const config = {
    aberto:   { icone: 'schedule',      texto: 'Em aberto', classe: 'status-aberto'   },
    pago:     { icone: 'check_circle',  texto: 'Pago',      classe: 'status-pago'     },
    atrasado: { icone: 'error',         texto: 'Atrasado',  classe: 'status-atrasado' },
  };
  const c = config[status] || config.aberto;

  return `
    <span class="status-badge ${c.classe}">
      <span class="material-symbols-outlined icon-sm" aria-hidden="true">${c.icone}</span>
      ${c.texto}
    </span>
  `;
}

/**
 * Gera o HTML de uma linha da tabela de operações HMCRED.
 *
 * @param {object} op - Dados da operação
 * @returns {string} HTML da linha
 */
function gerarLinhaOperacao(op) {
  // Verifica se a operação está atrasada com base na data de retorno
  const hoje       = new Date().toISOString().split('T')[0];
  const atrasado   = op.status === 'aberto' && op.dataRetorno && op.dataRetorno < hoje;
  const statusReal = atrasado ? 'atrasado' : op.status;

  return `
    <tr data-op-id="${op.id}">
      <td>
        <div class="patrimonio-item-info">
          <div class="tx-icon ${statusReal === 'pago' ? 'receita' : statusReal === 'atrasado' ? 'despesa' : ''}"
               style="${statusReal === 'aberto' ? 'background-color: var(--color-gold-muted); color: var(--color-gold);' : ''}">
            <span class="material-symbols-outlined" aria-hidden="true">person</span>
          </div>
          <div>
            <p class="tx-desc">${op.nome}</p>
            <p class="tx-date">Concedido em ${formatarData(op.dataConcessao)}</p>
          </div>
        </div>
      </td>
      <td>
        <!-- Taxa de juros da operação (0 = sem juros) -->
        <span class="text-muted text-sm">${op.taxaJuros ? `${op.taxaJuros}% a.m.` : 'Sem juros'}</span>
      </td>
      <td>
        <span class="text-sm">
          ${op.dataRetorno ? formatarData(op.dataRetorno) : '—'}
          ${atrasado ? '<span class="material-symbols-outlined icon-sm text-danger" title="Atrasado">warning</span>' : ''}
        </span>
      </td>
      <td class="text-right">
        <!-- Valor total a receber (principal + juros) -->
        <span class="value-sensitive font-semibold">
          ${formatarMoeda(op.totalAReceber || op.valor || 0)}
        </span>
        ${op.totalAReceber && op.totalAReceber !== op.valor ? `
          <br><span class="text-xs text-muted value-sensitive">
            Principal: ${formatarMoeda(op.valor)}
          </span>
        ` : ''}
      </td>
      <td>${gerarBadgeStatus(statusReal)}</td>
      <td>
        <!-- Ações: aparecem ao hover no desktop, sempre visíveis no mobile -->
        <div class="op-actions">
          ${statusReal !== 'pago' ? `
            <button class="btn btn-ghost btn-icon btn-sm btn-marcar-pago"
                    data-op-id="${op.id}"
                    title="Marcar como pago"
                    aria-label="Marcar operação de ${op.nome} como paga">
              <span class="material-symbols-outlined icon-sm text-success">check_circle</span>
            </button>
          ` : ''}
          <button class="btn btn-ghost btn-icon btn-sm btn-editar-op"
                  data-op-id="${op.id}"
                  title="Editar operação"
                  aria-label="Editar operação de ${op.nome}">
            <span class="material-symbols-outlined icon-sm">edit</span>
          </button>
          <button class="btn btn-ghost btn-icon btn-sm btn-excluir-op"
                  data-op-id="${op.id}"
                  title="Excluir operação"
                  aria-label="Excluir operação de ${op.nome}">
            <span class="material-symbols-outlined icon-sm text-danger">delete</span>
          </button>
        </div>
      </td>
    </tr>
  `;
}

/**
 * Gera o HTML do formulário de nova operação de crédito (dentro de um modal).
 *
 * @param {object|null} op - Dados da operação para edição (null = nova operação)
 * @returns {string} HTML do formulário
 */
function gerarFormularioOperacao(op = null) {
  const edicao = op !== null;

  return `
    <div class="modal-overlay open" id="modal-operacao" role="dialog"
         aria-modal="true" aria-labelledby="modal-op-titulo">
      <div class="modal">

        <div class="modal-header">
          <h2 class="modal-title" id="modal-op-titulo">
            ${edicao ? 'Editar Operação' : 'Nova Operação de Crédito'}
          </h2>
          <button class="btn btn-ghost btn-icon" id="btn-fechar-modal"
                  aria-label="Fechar modal">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="modal-body">
          <form id="form-operacao" novalidate>

            <!-- Campo obrigatório: nome/identificação do devedor -->
            <div class="form-group">
              <label class="form-label" for="op-nome">
                Nome / Identificação <span class="required">*</span>
              </label>
              <input type="text" id="op-nome" name="nome"
                     class="form-input"
                     placeholder="Ex: João da Silva"
                     value="${edicao ? op.nome : ''}"
                     required maxlength="100" />
            </div>

            <!-- Linha: Valor + Taxa de Juros -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">

              <!-- Campo obrigatório: valor concedido -->
              <div class="form-group">
                <label class="form-label" for="op-valor">
                  Valor Concedido (R$) <span class="required">*</span>
                </label>
                <input type="number" id="op-valor" name="valor"
                       class="form-input"
                       placeholder="0,00"
                       value="${edicao ? op.valor : ''}"
                       min="0.01" step="0.01" required />
              </div>

              <!-- Campo opcional: taxa de juros mensal -->
              <div class="form-group">
                <label class="form-label" for="op-juros">
                  Taxa de Juros (% a.m.)
                </label>
                <input type="number" id="op-juros" name="taxaJuros"
                       class="form-input"
                       placeholder="0"
                       value="${edicao ? (op.taxaJuros || 0) : 0}"
                       min="0" step="0.01" />
              </div>

            </div>

            <!-- Linha: Data de Concessão + Data de Retorno -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">

              <!-- Campo obrigatório: data da concessão -->
              <div class="form-group">
                <label class="form-label" for="op-data-concessao">
                  Data de Concessão <span class="required">*</span>
                </label>
                <input type="date" id="op-data-concessao" name="dataConcessao"
                       class="form-input"
                       value="${edicao ? op.dataConcessao : new Date().toISOString().split('T')[0]}"
                       required />
              </div>

              <!-- Campo obrigatório: data prevista de retorno -->
              <div class="form-group">
                <label class="form-label" for="op-data-retorno">
                  Data Prevista de Retorno <span class="required">*</span>
                </label>
                <input type="date" id="op-data-retorno" name="dataRetorno"
                       class="form-input"
                       value="${edicao ? op.dataRetorno : ''}"
                       required />
              </div>

            </div>

            <!-- Campo opcional: observações -->
            <div class="form-group">
              <label class="form-label" for="op-observacao">Observações</label>
              <textarea id="op-observacao" name="observacao"
                        class="form-input form-textarea"
                        placeholder="Notas adicionais sobre esta operação..."
                        rows="2">${edicao ? (op.observacao || '') : ''}</textarea>
            </div>

            <!-- Prévia do total a receber (calculado dinamicamente via JS) -->
            <div class="card" id="previa-total" style="background-color: var(--bg-overlay); border-color: var(--border-subtle); padding: 0;">
              <div class="card-body" style="padding: var(--space-4);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span class="text-sm text-muted">Total a receber (estimado):</span>
                  <span class="font-semibold text-gold" id="total-a-receber">R$ 0,00</span>
                </div>
              </div>
            </div>

          </form><!-- /#form-operacao -->
        </div><!-- /.modal-body -->

        <div class="modal-footer">
          <button class="btn btn-ghost" id="btn-cancelar-modal">Cancelar</button>
          <button class="btn btn-primary" id="btn-salvar-operacao"
                  ${edicao ? `data-op-id="${op.id}"` : ''}>
            <span class="material-symbols-outlined" aria-hidden="true">
              ${edicao ? 'save' : 'add_circle'}
            </span>
            ${edicao ? 'Salvar Alterações' : 'Criar Operação'}
          </button>
        </div>

      </div><!-- /.modal -->
    </div><!-- /.modal-overlay -->
  `;
}

/**
 * Gera o HTML do formulário de configuração de limite do HMCRED.
 *
 * @param {object} config - Configuração atual
 * @returns {string} HTML do formulário de configuração
 */
function gerarFormularioConfiguracao(config) {
  return `
    <div class="modal-overlay open" id="modal-configuracao" role="dialog"
         aria-modal="true" aria-labelledby="modal-config-titulo">
      <div class="modal">

        <div class="modal-header">
          <h2 class="modal-title" id="modal-config-titulo">Configurar Limite HMCRED</h2>
          <button class="btn btn-ghost btn-icon" id="btn-fechar-modal-config"
                  aria-label="Fechar modal">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="modal-body">
          <p class="text-sm text-muted" style="margin-bottom: var(--space-6);">
            Defina o capital total que você disponibiliza para o HMCRED.
            O capital disponível será calculado automaticamente
            conforme você criar operações de crédito.
          </p>
          <form id="form-configuracao" novalidate>
            <div class="form-group">
              <label class="form-label" for="config-limite">
                Limite Total (R$) <span class="required">*</span>
              </label>
              <input type="number" id="config-limite" name="limiteTotal"
                     class="form-input"
                     placeholder="0,00"
                     value="${config.limiteTotal || 0}"
                     min="0" step="0.01" required />
              <span class="text-xs text-muted">
                Capital disponível atual: ${formatarMoeda(config.capitalDisponivel || 0)}
              </span>
            </div>
          </form>
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" id="btn-cancelar-config">Cancelar</button>
          <button class="btn btn-primary" id="btn-salvar-config">
            <span class="material-symbols-outlined" aria-hidden="true">save</span>
            Salvar Configuração
          </button>
        </div>

      </div>
    </div>
  `;
}


/* ─────────────────────────────────────────────────────────────────────────────
   MÓDULO EXPORTADO
───────────────────────────────────────────────────────────────────────────── */
export const HmcredModule = {

  /**
   * Cache das operações atuais (usado para recalcular patrimônio sem nova busca).
   * @type {object[]}
   */
  _operacoes: [],

  /**
   * Cache da configuração atual (limite e capital disponível).
   * @type {object}
   */
  _config: { ...CONFIG_PADRAO },

  /**
   * Referência ao container atual (para re-renderizar após ações CRUD).
   * @type {HTMLElement|null}
   */
  _container: null,

  /**
   * Renderiza a tela completa do HMCRED.
   *
   * @param {HTMLElement} container - Elemento #main-content onde injetar o HTML
   */
  async renderHmcred(container) {
    this._container = container;

    // Confirmar autenticação (proteção extra; o router já garante)
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) { window.location.hash = 'login'; return; }

    // Exibir skeleton enquanto carrega
    container.innerHTML = `
      <div class="page-header">
        <h2 class="page-title">HMCRED</h2>
        <p class="page-subtitle">Carregando...</p>
      </div>
      <div class="stats-grid">
        ${Array(3).fill('<div class="stat-card skeleton-card"></div>').join('')}
      </div>
    `;

    // Buscar configuração e operações em paralelo
    const [config, operacoes] = await Promise.all([
      buscarConfiguracao(),
      this._buscarTodasOperacoes(),
    ]);

    // Guardar em cache interno
    this._config    = config;
    this._operacoes = operacoes;

    // Renderizar tela completa
    this._renderizarTela(container, config, operacoes);
  },

  /**
   * Busca todas as operações de crédito do usuário.
   * Usa a função interna isolada.
   *
   * @returns {Promise<object[]>}
   */
  async _buscarTodasOperacoes() {
    const uid = auth?.currentUser?.uid;
    if (!db || !uid) return [];

    try {
      // Caminho: usuarios/{uid}/hmcred/configuracao/operacoes
      const ref = collection(db, 'usuarios', uid, 'hmcred', DOC_CONFIGURACAO, SUBCOL_OPERACOES);
      const q   = query(ref, orderBy('criadoEm', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (erro) {
      console.error('[HMCRED] Erro ao buscar operações:', erro);
      return [];
    }
  },

  /**
   * Renderiza o HTML completo da tela HMCRED com os dados fornecidos.
   * Separado do método de carregamento para facilitar re-renderização.
   *
   * @param {HTMLElement} container
   * @param {object}    config    - Configuração (limite e capital disponível)
   * @param {object[]}  operacoes - Lista de operações
   */
  _renderizarTela(container, config, operacoes) {
    // Calcular capital emprestado: soma das operações em aberto/atrasadas
    const capitalEmprestado = operacoes
      .filter(op => op.status === 'aberto' || op.status === 'atrasado')
      .reduce((soma, op) => soma + (op.valor || 0), 0);

    // Capital disponível real = limite total - capital emprestado
    const capitalDisponivel = Math.max(0, (config.limiteTotal || 0) - capitalEmprestado);

    // Contar por status para os cards
    const qtdAberto   = operacoes.filter(op => op.status === 'aberto'  ).length;
    const qtdAtrasado = operacoes.filter(op => op.status === 'atrasado').length;
    const qtdPago     = operacoes.filter(op => op.status === 'pago'    ).length;

    // Gerar HTML da tabela ou estado vazio
    const tabelaHtml = operacoes.length > 0
      ? `
        <div class="table-container">
          <table class="table" aria-label="Lista de operações HMCRED">
            <thead>
              <tr>
                <th>Devedor</th>
                <th>Juros</th>
                <th>Retorno</th>
                <th class="text-right">Total a Receber</th>
                <th>Status</th>
                <th style="width: 120px;">Ações</th>
              </tr>
            </thead>
            <tbody id="tabela-operacoes">
              ${operacoes.map(op => gerarLinhaOperacao(op)).join('')}
            </tbody>
          </table>
        </div>
      `
      : `
        <div class="card">
          <div class="card-body">
            <div class="empty-state">
              <span class="material-symbols-outlined empty-state-icon" aria-hidden="true">local_atm</span>
              <h3 class="empty-state-title">Nenhuma operação cadastrada</h3>
              <p class="empty-state-text">
                Crie sua primeira operação de crédito para começar a controlar
                seu capital emprestado.
              </p>
              <button class="btn btn-primary" id="btn-nova-op-empty">
                <span class="material-symbols-outlined" aria-hidden="true">add_circle</span>
                Criar Primeira Operação
              </button>
            </div>
          </div>
        </div>
      `;

    container.innerHTML = `
      <!-- ══ CABEÇALHO ════════════════════════════════════════════════════ -->
      <div class="page-header dashboard-page-header">
        <div>
          <h2 class="page-title">HMCRED</h2>
          <p class="page-subtitle">Sistema de crédito próprio — controle de capital e operações.</p>
        </div>
        <div style="display: flex; gap: var(--space-3);">
          <button class="btn btn-secondary btn-sm" id="btn-configurar">
            <span class="material-symbols-outlined" aria-hidden="true">settings</span>
            Configurar Limite
          </button>
          <button class="btn btn-primary btn-sm" id="btn-nova-op">
            <span class="material-symbols-outlined" aria-hidden="true">add_circle</span>
            Nova Operação
          </button>
        </div>
      </div>

      <!-- ══ CARDS DE KPIs ════════════════════════════════════════════════ -->
      <div class="stats-grid" role="region" aria-label="Indicadores HMCRED">

        <!-- Limite Total -->
        <div class="stat-card hmcred-config-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Limite Total</span>
            <div class="stat-card-icon" style="background-color: var(--color-gold-muted); color: var(--color-gold);">
              <span class="material-symbols-outlined" aria-hidden="true">account_balance</span>
            </div>
          </div>
          <div class="stat-card-value text-gold value-sensitive">${formatarMoeda(config.limiteTotal || 0)}</div>
          <div class="stat-card-sub">
            <span class="material-symbols-outlined icon-sm" aria-hidden="true">info</span>
            Capital total disponibilizado para HMCRED
          </div>
        </div>

        <!-- Capital Disponível -->
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Capital Disponível</span>
            <div class="stat-card-icon" style="background-color: var(--color-success-muted); color: var(--color-success);">
              <span class="material-symbols-outlined" aria-hidden="true">savings</span>
            </div>
          </div>
          <div class="stat-card-value text-success value-sensitive">${formatarMoeda(capitalDisponivel)}</div>
          <div class="stat-card-sub">
            <span class="material-symbols-outlined icon-sm text-success" aria-hidden="true">check_circle</span>
            Disponível para novas operações
          </div>
        </div>

        <!-- Capital Emprestado -->
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Capital Emprestado</span>
            <div class="stat-card-icon" style="background-color: var(--color-danger-muted); color: var(--color-danger);">
              <span class="material-symbols-outlined" aria-hidden="true">payments</span>
            </div>
          </div>
          <div class="stat-card-value value-sensitive">${formatarMoeda(capitalEmprestado)}</div>
          <div class="stat-card-sub">
            <!-- Resumo por status -->
            ${qtdAberto   > 0 ? `<span class="badge badge-gold"   >${qtdAberto} em aberto</span>`   : ''}
            ${qtdAtrasado > 0 ? `<span class="badge badge-danger" >${qtdAtrasado} atrasada${qtdAtrasado > 1 ? 's' : ''}</span>` : ''}
            ${qtdPago     > 0 ? `<span class="badge badge-success">${qtdPago} paga${qtdPago > 1 ? 's' : ''}</span>`     : ''}
            ${operacoes.length === 0 ? '<span class="text-muted">Sem operações</span>' : ''}
          </div>
        </div>

      </div><!-- /.stats-grid -->

      <!-- ══ TABELA DE OPERAÇÕES ══════════════════════════════════════════ -->
      <div class="dashboard-section-header" style="margin-top: var(--space-8);">
        <h3 class="text-lg font-semibold">Operações de Crédito</h3>
        <span class="badge badge-neutral">
          ${operacoes.length} operaç${operacoes.length !== 1 ? 'ões' : 'ão'}
        </span>
      </div>

      ${tabelaHtml}
    `;

    // Registrar eventos de interação após injetar o HTML
    this._registrarEventos(container, operacoes);
  },

  /**
   * Registra todos os eventos de interação da tela HMCRED.
   * Inclui: criar operação, editar, marcar como pago, excluir e configurar limite.
   *
   * @param {HTMLElement} container
   * @param {object[]}   operacoes - Lista de operações para lookup durante ações
   */
  _registrarEventos(container, operacoes) {
    // ── Botões de abrir modal de nova operação ──────────────────────────
    const abrirModalNova = () => this._abrirModalOperacao(null);

    container.querySelector('#btn-nova-op')?.addEventListener('click', abrirModalNova);
    container.querySelector('#btn-nova-op-empty')?.addEventListener('click', abrirModalNova);

    // ── Botão de configuração de limite ──────────────────────────────────
    container.querySelector('#btn-configurar')?.addEventListener('click', () => {
      this._abrirModalConfiguracao();
    });

    // ── Botões de ação nas linhas da tabela ──────────────────────────────
    // Usar delegação de eventos no container para capturar todos os botões
    container.addEventListener('click', async (e) => {

      // Botão: marcar operação como paga
      const btnPago = e.target.closest('.btn-marcar-pago');
      if (btnPago) {
        const opId = btnPago.getAttribute('data-op-id');
        await this._marcarComoPago(opId);
        return;
      }

      // Botão: editar operação
      const btnEditar = e.target.closest('.btn-editar-op');
      if (btnEditar) {
        const opId = btnEditar.getAttribute('data-op-id');
        const op   = this._operacoes.find(o => o.id === opId);
        if (op) this._abrirModalOperacao(op);
        return;
      }

      // Botão: excluir operação
      const btnExcluir = e.target.closest('.btn-excluir-op');
      if (btnExcluir) {
        const opId = btnExcluir.getAttribute('data-op-id');
        await this._confirmarExclusao(opId);
        return;
      }
    });
  },

  /**
   * Abre o modal de criação ou edição de operação.
   * Injeta o formulário no body e registra seus eventos.
   *
   * @param {object|null} op - null para nova operação; objeto para editar
   */
  _abrirModalOperacao(op = null) {
    // Injetar modal no body (fora do container principal)
    const modalWrapper = document.createElement('div');
    modalWrapper.id = 'modal-wrapper';
    modalWrapper.innerHTML = gerarFormularioOperacao(op);
    document.body.appendChild(modalWrapper);

    // Atualizar prévia do total a receber conforme usuário digita
    const inputValor  = document.getElementById('op-valor');
    const inputJuros  = document.getElementById('op-juros');
    const spanTotal   = document.getElementById('total-a-receber');

    const calcularTotal = () => {
      const valor = parseFloat(inputValor?.value || 0);
      const juros = parseFloat(inputJuros?.value || 0);
      // Cálculo simples: valor * (1 + juros/100)
      const total = juros > 0 ? valor * (1 + juros / 100) : valor;
      if (spanTotal) spanTotal.textContent = formatarMoeda(total);
    };

    inputValor?.addEventListener('input', calcularTotal);
    inputJuros?.addEventListener('input', calcularTotal);
    // Calcular prévia inicial (útil na edição)
    calcularTotal();

    // ── Fechar modal ────────────────────────────────────────────────────
    const fecharModal = () => modalWrapper.remove();
    document.getElementById('btn-fechar-modal')?.addEventListener('click', fecharModal);
    document.getElementById('btn-cancelar-modal')?.addEventListener('click', fecharModal);

    // Fechar ao clicar fora do modal
    document.getElementById('modal-operacao')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-operacao') fecharModal();
    });

    // ── Salvar operação ─────────────────────────────────────────────────
    document.getElementById('btn-salvar-operacao')?.addEventListener('click', async () => {
      await this._salvarOperacao(op?.id || null, fecharModal);
    });
  },

  /**
   * Valida e salva uma operação (criação ou edição).
   *
   * @param {string|null} opId     - null para criar; ID para editar
   * @param {function}    fecharFn - Função para fechar o modal após sucesso
   */
  async _salvarOperacao(opId, fecharFn) {
    // Coletar dados do formulário
    const nome         = document.getElementById('op-nome')?.value.trim();
    const valor        = parseFloat(document.getElementById('op-valor')?.value || 0);
    const taxaJuros    = parseFloat(document.getElementById('op-juros')?.value || 0);
    const dataConcessao = document.getElementById('op-data-concessao')?.value;
    const dataRetorno   = document.getElementById('op-data-retorno')?.value;
    const observacao   = document.getElementById('op-observacao')?.value.trim();

    // Validações básicas antes de salvar
    if (!nome) {
      mostrarToast({ tipo: 'danger', titulo: 'Campo obrigatório', mensagem: 'Informe o nome do devedor.' });
      return;
    }
    if (!valor || valor <= 0) {
      mostrarToast({ tipo: 'danger', titulo: 'Valor inválido', mensagem: 'Informe um valor maior que zero.' });
      return;
    }
    if (!dataConcessao) {
      mostrarToast({ tipo: 'danger', titulo: 'Campo obrigatório', mensagem: 'Informe a data de concessão.' });
      return;
    }
    if (!dataRetorno) {
      mostrarToast({ tipo: 'danger', titulo: 'Campo obrigatório', mensagem: 'Informe a data prevista de retorno.' });
      return;
    }

    // Verificar se há capital disponível (apenas em novas operações)
    if (!opId) {
      const capitalDisponivel = Math.max(0, (this._config.limiteTotal || 0) - this._capitalEmprestado());
      if (valor > capitalDisponivel) {
        mostrarToast({ tipo: 'danger', titulo: 'Capital insuficiente',
          mensagem: `Disponível: ${formatarMoeda(capitalDisponivel)}. Ajuste o valor ou aumente o limite.` });
        return;
      }
    }

    // Calcular total a receber com juros
    const totalAReceber = taxaJuros > 0
      ? parseFloat((valor * (1 + taxaJuros / 100)).toFixed(2))
      : valor;

    const dadosOperacao = {
      nome,
      valor,
      taxaJuros,
      totalAReceber,
      dataConcessao,
      dataRetorno,
      observacao: observacao || '',
    };

    // Desabilitar botão para evitar duplo clique
    const btnSalvar = document.getElementById('btn-salvar-operacao');
    if (btnSalvar) btnSalvar.disabled = true;

    let sucesso;
    if (opId) {
      // Edição: atualizar documento existente
      sucesso = await atualizarOperacao(opId, dadosOperacao);
    } else {
      // Criação: novo documento
      const resultado = await criarOperacao(dadosOperacao);
      sucesso = resultado.sucesso;
    }

    if (sucesso) {
      mostrarToast({ tipo: 'success', titulo: opId ? 'Operação atualizada!' : 'Operação criada!',
        mensagem: `${nome} — ${formatarMoeda(totalAReceber)}` });

      fecharFn(); // Fechar modal

      // Re-buscar operações e re-renderizar a tela
      await this._atualizarTela();
    } else {
      mostrarToast({ tipo: 'danger', titulo: 'Erro ao salvar', mensagem: 'Não foi possível salvar a operação. Tente novamente.' });
      if (btnSalvar) btnSalvar.disabled = false;
    }
  },

  /**
   * Calcula o capital total emprestado com base no cache interno de operações.
   *
   * @returns {number}
   */
  _capitalEmprestado() {
    return this._operacoes
      .filter(op => op.status === 'aberto' || op.status === 'atrasado')
      .reduce((soma, op) => soma + (op.valor || 0), 0);
  },

  /**
   * Marca uma operação como paga e atualiza o patrimônio.
   *
   * @param {string} opId - ID da operação
   */
  async _marcarComoPago(opId) {
    const op = this._operacoes.find(o => o.id === opId);
    if (!op) return;

    const confirmar = confirm(`Confirmar recebimento de ${formatarMoeda(op.totalAReceber || op.valor)} de "${op.nome}"?`);
    if (!confirmar) return;

    const sucesso = await atualizarOperacao(opId, { status: 'pago' });

    if (sucesso) {
      mostrarToast({ tipo: 'success', titulo: 'Pagamento registrado!', mensagem: `${op.nome} — ${formatarMoeda(op.totalAReceber || op.valor)}` });
      await this._atualizarTela();
    } else {
      mostrarToast({ tipo: 'danger', titulo: 'Erro', mensagem: 'Não foi possível atualizar o status. Tente novamente.' });
    }
  },

  /**
   * Exibe confirmação e exclui uma operação de crédito.
   *
   * @param {string} opId - ID da operação
   */
  async _confirmarExclusao(opId) {
    const op = this._operacoes.find(o => o.id === opId);
    if (!op) return;

    const confirmar = confirm(`Excluir a operação de "${op.nome}" (${formatarMoeda(op.valor)})?\n\nEsta ação não pode ser desfeita.`);
    if (!confirmar) return;

    const sucesso = await excluirOperacao(opId);

    if (sucesso) {
      mostrarToast({ tipo: 'success', titulo: 'Operação excluída', mensagem: `Operação de ${op.nome} removida.` });
      await this._atualizarTela();
    } else {
      mostrarToast({ tipo: 'danger', titulo: 'Erro', mensagem: 'Não foi possível excluir a operação. Tente novamente.' });
    }
  },

  /**
   * Abre o modal de configuração do limite HMCRED.
   */
  _abrirModalConfiguracao() {
    const modalWrapper = document.createElement('div');
    modalWrapper.id = 'modal-config-wrapper';
    modalWrapper.innerHTML = gerarFormularioConfiguracao(this._config);
    document.body.appendChild(modalWrapper);

    const fecharModal = () => modalWrapper.remove();

    document.getElementById('btn-fechar-modal-config')?.addEventListener('click', fecharModal);
    document.getElementById('btn-cancelar-config')?.addEventListener('click', fecharModal);

    document.getElementById('modal-configuracao')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-configuracao') fecharModal();
    });

    // Salvar nova configuração de limite
    document.getElementById('btn-salvar-config')?.addEventListener('click', async () => {
      const limiteTotal = parseFloat(document.getElementById('config-limite')?.value || 0);

      if (limiteTotal < 0) {
        mostrarToast({ tipo: 'danger', titulo: 'Valor inválido', mensagem: 'O limite não pode ser negativo.' });
        return;
      }

      // Recalcular capital disponível com base no novo limite
      const capitalDisponivel = Math.max(0, limiteTotal - this._capitalEmprestado());

      const sucesso = await salvarConfiguracao({ limiteTotal, capitalDisponivel });

      if (sucesso) {
        this._config.limiteTotal = limiteTotal;
        this._config.capitalDisponivel = capitalDisponivel;

        mostrarToast({ tipo: 'success', titulo: 'Limite atualizado!', mensagem: `Novo limite: ${formatarMoeda(limiteTotal)}` });
        fecharModal();

        // Re-renderizar tela com nova configuração
        await this._atualizarTela();
      } else {
        mostrarToast({ tipo: 'danger', titulo: 'Erro', mensagem: 'Não foi possível salvar a configuração.' });
      }
    });
  },

  /**
   * Re-busca os dados do Firestore e re-renderiza a tela inteira.
   * Chamado após qualquer operação CRUD ou alteração de configuração.
   */
  async _atualizarTela() {
    if (!this._container) return;

    // Re-buscar dados atualizados
    const [config, operacoes] = await Promise.all([
      buscarConfiguracao(),
      this._buscarTodasOperacoes(),
    ]);

    // Atualizar cache interno
    this._config    = config;
    this._operacoes = operacoes;

    // Atualizar resumo de patrimônio com novo total HMCRED
    await atualizarPatrimonio(operacoes);

    // Re-renderizar a tela
    this._renderizarTela(this._container, config, operacoes);
  },
};
