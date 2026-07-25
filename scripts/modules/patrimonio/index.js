/**
 * HM Finanças — Módulo: Patrimônio (Módulo 4)
 * ============================================================
 * Visão consolidada de tudo que o usuário possui, dividida em
 * três blocos: HMCRED, Dinheiro e Cartões.
 *
 * COMO FUNCIONA:
 *   - O router.js chama PatrimonioModule.renderPatrimonio(container)
 *   - Este módulo busca o documento resumo do patrimônio no Firestore
 *     (usuarios/{uid}/patrimonio/resumo)
 *   - Se não houver dados ainda, exibe um estado vazio elegante
 *   - Os totais de HMCRED, Dinheiro e Cartões são buscados dinamicamente
 *     das subcoleções correspondentes
 *
 * FIRESTORE (estrutura de dados):
 *   usuarios/{uid}/patrimonio/resumo → {
 *     totalHmcred:   number,  ← capital total emprestado via HMCRED
 *     totalDinheiro: number,  ← saldo total em contas
 *     totalCartoes:  number,  ← valor total disponível nos cartões
 *     limiteCartoes: number,  ← limite total dos cartões
 *     atualizadoEm:  timestamp
 *   }
 *
 * PARA INTEGRAR COM MÓDULOS FUTUROS:
 *   - O módulo HMCRED atualiza totalHmcred ao salvar operações
 *   - O módulo Dinheiro atualiza totalDinheiro ao salvar contas
 *   - O módulo Cartões atualiza totalCartoes e limiteCartoes
 *   - Todos escrevem em usuarios/{uid}/patrimonio/resumo
 *
 * PADRÃO SEGUIDO:
 *   - Mesmo padrão do módulo dashboard/index.js
 *   - export const PatrimonioModule = { render...() {} }
 */

'use strict';

import { AuthService }       from '../../firebase/auth-service.js';
import { FirestoreService }  from '../../firebase/firestore-service.js';
import { formatarMoeda }     from '../../utils/formatters.js';

// Importa funções do Firestore para leitura/escrita direta do documento único
import {
  getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';


/* ─────────────────────────────────────────────────────────────────────────────
   FUNÇÕES DE ACESSO AO FIRESTORE
   Separadas aqui para facilitar reutilização pelos módulos futuros.
───────────────────────────────────────────────────────────────────────────── */

/**
 * Busca o documento de resumo do patrimônio do usuário autenticado.
 * Retorna null se o documento ainda não existir.
 *
 * @returns {Promise<object|null>} Dados do resumo ou null se não existir
 */
async function buscarResumoPatrimonio() {
  // Acessa: usuarios/{uid}/patrimonio/resumo
  const refResumo = FirestoreService.docDoUsuario('patrimonio', 'resumo');
  if (!refResumo) return null;

  try {
    const snap = await getDoc(refResumo);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (erro) {
    console.error('[Patrimônio] Erro ao buscar resumo:', erro);
    return null;
  }
}

/**
 * Salva (cria ou substitui) o documento de resumo do patrimônio.
 * Chamado pelos módulos HMCRED, Dinheiro e Cartões ao atualizar valores.
 * Também exportado para uso externo por esses módulos.
 *
 * @param {object} dados - Campos a salvar/atualizar no resumo
 * @returns {Promise<boolean>} true se salvou com sucesso
 */
export async function salvarResumoPatrimonio(dados) {
  // Acessa: usuarios/{uid}/patrimonio/resumo
  const refResumo = FirestoreService.docDoUsuario('patrimonio', 'resumo');
  if (!refResumo) return false;

  try {
    // merge: true → preserva campos existentes não informados
    await setDoc(refResumo, {
      ...dados,
      atualizadoEm: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (erro) {
    console.error('[Patrimônio] Erro ao salvar resumo:', erro);
    return false;
  }
}


/* ─────────────────────────────────────────────────────────────────────────────
   FUNÇÕES AUXILIARES INTERNAS DE RENDERIZAÇÃO
───────────────────────────────────────────────────────────────────────────── */

/**
 * Gera o HTML do estado de carregamento (skeleton) enquanto busca dados.
 *
 * @returns {string} HTML do skeleton de carregamento
 */
function gerarHtmlCarregando() {
  return `
    <div class="page-header">
      <div>
        <h2 class="page-title">Patrimônio</h2>
        <p class="page-subtitle">Carregando seus dados...</p>
      </div>
    </div>
    <div class="stats-grid">
      ${Array(4).fill('<div class="stat-card skeleton-card"></div>').join('')}
    </div>
  `;
}

/**
 * Gera o HTML do estado vazio — quando o usuário não tem dados cadastrados.
 * Exibe uma mensagem amigável e um botão de chamada para ação.
 *
 * @returns {string} HTML do estado vazio
 */
function gerarHtmlVazio() {
  return `
    <div class="page-header">
      <div>
        <h2 class="page-title">Patrimônio</h2>
        <p class="page-subtitle">Visão consolidada dos seus ativos.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="empty-state">
          <span class="material-symbols-outlined empty-state-icon"
                aria-hidden="true">account_balance_wallet</span>
          <h3 class="empty-state-title">Nenhum dado cadastrado ainda</h3>
          <p class="empty-state-text">
            Seu patrimônio consolidado aparecerá aqui assim que você
            cadastrar operações nos módulos HMCRED, Dinheiro e Cartões.
          </p>
          <div style="display:flex; gap: var(--space-3); flex-wrap: wrap; justify-content: center;">
            <button class="btn btn-primary" data-nav="hmcred">
              <span class="material-symbols-outlined" aria-hidden="true">local_atm</span>
              Começar pelo HMCRED
            </button>
            <button class="btn btn-secondary" data-nav="dinheiro">
              <span class="material-symbols-outlined" aria-hidden="true">payments</span>
              Cadastrar Dinheiro
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Gera o HTML de um card de patrimônio por bloco (HMCRED, Dinheiro, Cartões).
 *
 * @param {object} opcoes
 * @param {string} opcoes.label       - Título do card
 * @param {string} opcoes.valor       - Valor formatado a exibir
 * @param {string} opcoes.icone       - Ícone Material Symbols
 * @param {string} [opcoes.subTexto]  - Texto secundário (percentual, limite, etc.)
 * @param {string} [opcoes.rota]      - Rota de navegação ao clicar
 * @param {string} [opcoes.classeExtra] - Classe extra no card
 * @param {string} [opcoes.classeValor] - Classe de cor no valor
 * @param {string} [opcoes.estiloIcone] - Estilos inline do ícone
 * @returns {string} HTML do card
 */
function gerarCardPatrimonio({ label, valor, icone, subTexto = '', rota = '', classeExtra = '', classeValor = '', estiloIcone = '' }) {
  // Se tiver rota, o card fica clicável e navegável
  const atributoRota    = rota ? `data-nav="${rota}" role="button" tabindex="0"` : '';
  const classeClicavel  = rota ? 'card-clickable' : '';

  return `
    <div class="stat-card ${classeExtra} ${classeClicavel}" ${atributoRota}>
      <div class="stat-card-header">
        <span class="stat-card-label">${label}</span>
        <div class="stat-card-icon" ${estiloIcone ? `style="${estiloIcone}"` : ''}>
          <span class="material-symbols-outlined" aria-hidden="true">${icone}</span>
        </div>
      </div>

      <!-- value-sensitive: mascarado quando o usuário ativa "Ocultar Valores" -->
      <div class="stat-card-value ${classeValor} value-sensitive"
           aria-label="${label}: ${valor}">${valor}</div>

      ${subTexto ? `<div class="stat-card-sub">${subTexto}</div>` : ''}
    </div>
  `;
}

/**
 * Gera o HTML da lista de blocos do patrimônio (HMCRED, Dinheiro, Cartões).
 * Exibe um item por bloco com nome, ícone e valor.
 *
 * @param {object} resumo - Dados do documento resumo do Firestore
 * @returns {string} HTML da lista
 */
function gerarListaPatrimonio(resumo) {
  // Cada item da lista representa um bloco do patrimônio
  const itens = [
    {
      icone: 'local_atm',
      label: 'HMCRED — Crédito Próprio',
      tipo:  'Capital emprestado',
      valor: resumo.totalHmcred  || 0,
      rota:  'hmcred',
      cor:   '--color-info',
    },
    {
      icone: 'payments',
      label: 'Dinheiro em Caixa',
      tipo:  'Saldo disponível',
      valor: resumo.totalDinheiro || 0,
      rota:  'dinheiro',
      cor:   '--color-success',
    },
    {
      icone: 'credit_card',
      label: 'Cartões',
      tipo:  `Limite disponível: ${formatarMoeda((resumo.limiteCartoes || 0) - (resumo.totalCartoes || 0))}`,
      valor: resumo.totalCartoes  || 0,
      rota:  'cartoes',
      cor:   '--color-gold',
    },
  ];

  const linhasHtml = itens.map(item => `
    <tr class="patrimonio-row" data-nav="${item.rota}"
        role="button" tabindex="0"
        aria-label="Ir para ${item.label}">
      <td>
        <div class="patrimonio-item-info">
          <div class="tx-icon" style="background-color: rgba(var(${item.cor}-rgb, 52,152,219), 0.1); color: var(${item.cor});">
            <span class="material-symbols-outlined" aria-hidden="true">${item.icone}</span>
          </div>
          <div>
            <p class="tx-desc">${item.label}</p>
            <p class="tx-date">${item.tipo}</p>
          </div>
        </div>
      </td>
      <td class="text-right">
        <span class="value-sensitive font-semibold">${formatarMoeda(item.valor)}</span>
      </td>
      <td class="text-right" style="width: 32px;">
        <span class="material-symbols-outlined text-muted icon-sm"
              aria-hidden="true">chevron_right</span>
      </td>
    </tr>
  `).join('');

  return `
    <div class="table-container">
      <table class="table" aria-label="Detalhamento do patrimônio por bloco">
        <thead>
          <tr>
            <th>Bloco</th>
            <th class="text-right">Valor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${linhasHtml}</tbody>
      </table>
    </div>
  `;
}

/**
 * Gera o HTML completo da tela de patrimônio com dados reais.
 *
 * @param {object} resumo    - Dados vindos do Firestore
 * @param {string} nomeUsuario - Nome amigável do usuário logado
 * @returns {string} HTML completo da tela
 */
function gerarHtmlPatrimonio(resumo, nomeUsuario) {
  // Calcular total geral somando os três blocos
  const totalGeral = (resumo.totalHmcred || 0)
                   + (resumo.totalDinheiro || 0)
                   + (resumo.totalCartoes  || 0);

  // Percentual de cada bloco em relação ao total (para subtexto dos cards)
  const pctHmcred   = totalGeral > 0 ? ((resumo.totalHmcred  || 0) / totalGeral * 100).toFixed(1) : '0.0';
  const pctDinheiro = totalGeral > 0 ? ((resumo.totalDinheiro || 0) / totalGeral * 100).toFixed(1) : '0.0';
  const pctCartoes  = totalGeral > 0 ? ((resumo.totalCartoes  || 0) / totalGeral * 100).toFixed(1) : '0.0';

  // Limite disponível no cartão (limite total menos valor usado)
  const limiteDisponivel = (resumo.limiteCartoes || 0) - (resumo.totalCartoes || 0);

  return `
    <!-- ══ CABEÇALHO DA PÁGINA ═══════════════════════════════════════════ -->
    <div class="page-header dashboard-page-header">
      <div>
        <h2 class="page-title">Patrimônio</h2>
        <p class="page-subtitle">Visão consolidada de todos os seus ativos.</p>
      </div>
      <div class="badge badge-gold">
        <span class="material-symbols-outlined icon-sm" aria-hidden="true">account_balance</span>
        Consolidado
      </div>
    </div>

    <!-- ══ CARDS DE KPIs ════════════════════════════════════════════════ -->
    <div class="stats-grid" role="region" aria-label="Resumo do patrimônio">

      <!-- Card do Total Geral (destaque dourado) -->
      ${gerarCardPatrimonio({
        label:       'Total Geral',
        valor:       formatarMoeda(totalGeral),
        icone:       'account_balance_wallet',
        classeExtra: 'card-gold',
        classeValor: 'text-gold',
        subTexto:    `
          <span class="material-symbols-outlined icon-sm text-gold" aria-hidden="true">info</span>
          Soma de HMCRED + Dinheiro + Cartões
        `,
      })}

      <!-- Card do HMCRED -->
      ${gerarCardPatrimonio({
        label:       'HMCRED',
        valor:       formatarMoeda(resumo.totalHmcred || 0),
        icone:       'local_atm',
        estiloIcone: 'background-color: var(--color-info-muted); color: var(--color-info);',
        subTexto:    `
          <span class="material-symbols-outlined icon-sm" aria-hidden="true">pie_chart</span>
          ${pctHmcred}% do total · Capital emprestado
        `,
        rota:        'hmcred',
      })}

      <!-- Card do Dinheiro -->
      ${gerarCardPatrimonio({
        label:       'Dinheiro',
        valor:       formatarMoeda(resumo.totalDinheiro || 0),
        icone:       'payments',
        estiloIcone: 'background-color: var(--color-success-muted); color: var(--color-success);',
        subTexto:    `
          <span class="material-symbols-outlined icon-sm" aria-hidden="true">pie_chart</span>
          ${pctDinheiro}% do total · Saldo em contas
        `,
        rota:        'dinheiro',
      })}

      <!-- Card dos Cartões (limite total + limite disponível) -->
      ${gerarCardPatrimonio({
        label:       'Cartões',
        valor:       formatarMoeda(resumo.totalCartoes || 0),
        icone:       'credit_card',
        estiloIcone: 'background-color: var(--color-gold-muted); color: var(--color-gold);',
        subTexto:    `
          <span class="material-symbols-outlined icon-sm text-success" aria-hidden="true">credit_score</span>
          Limite disponível:
          <span class="text-success value-sensitive">${formatarMoeda(limiteDisponivel)}</span>
        `,
        rota:        'cartoes',
      })}

    </div><!-- /.stats-grid -->


    <!-- ══ TABELA DE DETALHAMENTO ════════════════════════════════════════ -->
    <div class="dashboard-section-header" style="margin-top: var(--space-8);">
      <h3 class="text-lg font-semibold">Detalhamento por Bloco</h3>
      <span class="badge badge-neutral">
        <span class="material-symbols-outlined icon-sm" aria-hidden="true">table_chart</span>
        ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
      </span>
    </div>

    ${gerarListaPatrimonio(resumo)}


    <!-- ══ AVISO SOBRE ATUALIZAÇÃO ══════════════════════════════════════ -->
    <div class="card card-demo" style="margin-top: var(--space-6);">
      <div class="card-body">
        <div class="demo-info">
          <span class="material-symbols-outlined text-gold" aria-hidden="true">sync</span>
          <div>
            <h4 class="text-sm font-semibold text-gold">Dados sincronizados</h4>
            <p class="text-xs text-muted" style="margin-top: var(--space-1); line-height: 1.5;">
              Os valores são atualizados automaticamente sempre que você
              cadastrar ou alterar operações nos módulos HMCRED, Dinheiro e Cartões.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}


/* ─────────────────────────────────────────────────────────────────────────────
   MÓDULO EXPORTADO
   O roteador chama PatrimonioModule.renderPatrimonio(container).
───────────────────────────────────────────────────────────────────────────── */
export const PatrimonioModule = {

  /**
   * Referência para o container atual (usada para re-renderizar após mudanças).
   * @type {HTMLElement|null}
   */
  _container: null,

  /**
   * Renderiza a tela de Patrimônio completa.
   *
   * @param {HTMLElement} container - Elemento #main-content onde injetar o HTML.
   */
  async renderPatrimonio(container) {
    // Guarda referência ao container para possível re-renderização futura
    this._container = container;

    // Confirmar que o usuário está autenticado (a proteção de rota já faz isso,
    // mas verificamos novamente para obter os dados do usuário)
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) {
      // Não deve chegar aqui, pois o router já redireciona, mas por segurança:
      window.location.hash = 'login';
      return;
    }

    // Exibir estado de carregamento enquanto busca dados do Firestore
    container.innerHTML = gerarHtmlCarregando();

    // Buscar dados reais do Firestore
    const resumo = await buscarResumoPatrimonio();

    // Se não houver dados, exibir estado vazio
    if (!resumo) {
      container.innerHTML = gerarHtmlVazio();
      this._registrarEventos(container);
      return;
    }

    // Extrair nome amigável do usuário para exibição (igual ao Dashboard)
    const nomeUsuario = usuario.displayName
      || usuario.email?.split('@')[0]
      || 'Usuário';

    // Injetar HTML completo com dados reais
    container.innerHTML = gerarHtmlPatrimonio(resumo, nomeUsuario);

    // Registrar eventos de interação
    this._registrarEventos(container);
  },

  /**
   * Registra eventos de interação da tela de Patrimônio.
   * Mesmo padrão do Dashboard: elementos com [data-nav] navegam para a rota.
   *
   * @param {HTMLElement} container
   */
  _registrarEventos(container) {
    // Navegar ao clicar em cards ou botões com atributo data-nav
    container.querySelectorAll('[data-nav]').forEach(elemento => {
      const rota = elemento.getAttribute('data-nav');
      if (!rota) return;

      // Navegação por clique
      elemento.addEventListener('click', () => {
        window.location.hash = rota;
      });

      // Navegação por teclado (acessibilidade)
      elemento.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.location.hash = rota;
        }
      });
    });

    // Navegação nas linhas da tabela (patrimônio-row)
    container.querySelectorAll('.patrimonio-row[data-nav]').forEach(linha => {
      linha.style.cursor = 'pointer';
    });
  },
};
