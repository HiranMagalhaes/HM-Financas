/**
 * HM Finanças — Utilitário de Filtros de Busca
 * =============================================
 * Fornece funções reutilizáveis para criar barras de filtro (busca por texto +
 * intervalo de datas) nas telas de Clientes, Cobranças, Promissórias e HMCRED.
 *
 * USO:
 *   1. criarHTMLBarraFiltros({ prefixo, labelBusca }) — gera o bloco HTML
 *   2. registrarEventosFiltros(container, { prefixo, onFiltrar, delay }) — registra os eventos
 *   3. filtrarLista(lista, { campoTexto, termo, campoData, dataInicio, dataFim }) — filtra em memória
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   GERAÇÃO DE HTML
───────────────────────────────────────────────────────────────────────────── */

/**
 * Gera o HTML da barra de filtros com input de busca, dois date pickers e botão Limpar.
 *
 * @param {object} opcoes
 * @param {string} opcoes.prefixo     - Prefixo único para os IDs dos campos (evita conflito entre telas)
 * @param {string} opcoes.labelBusca  - Placeholder do campo de busca por texto
 * @returns {string} HTML da barra de filtros
 */
function criarHTMLBarraFiltros({ prefixo = 'filtro', labelBusca = 'Buscar por nome...' } = {}) {
  return `
    <div class="filtros-barra" style="
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      align-items: center;
      padding: var(--space-4);
      background: var(--bg-overlay);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-default);
      margin-bottom: var(--space-5);
    ">
      <!-- Campo de busca por texto -->
      <div style="display: flex; align-items: center; gap: var(--space-2); flex: 2; min-width: 180px; background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3);">
        <span class="material-symbols-outlined" style="font-size: 18px; color: var(--text-muted);">search</span>
        <input
          type="search"
          id="${prefixo}-busca"
          class="form-input"
          placeholder="${labelBusca}"
          style="border: none; background: transparent; padding: 0; font-size: var(--text-sm); outline: none; width: 100%;"
          autocomplete="off"
        >
      </div>

      <!-- Intervalo de datas -->
      <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
        <span style="font-size: var(--text-xs); color: var(--text-muted); white-space: nowrap;">De:</span>
        <input
          type="date"
          id="${prefixo}-data-inicio"
          class="form-input"
          style="font-size: var(--text-sm); padding: var(--space-2) var(--space-3); width: auto;"
        >
        <span style="font-size: var(--text-xs); color: var(--text-muted);">Até:</span>
        <input
          type="date"
          id="${prefixo}-data-fim"
          class="form-input"
          style="font-size: var(--text-sm); padding: var(--space-2) var(--space-3); width: auto;"
        >
      </div>

      <!-- Botão Limpar -->
      <button
        id="${prefixo}-limpar"
        class="btn btn-ghost btn-sm"
        type="button"
        style="display: flex; align-items: center; gap: var(--space-1); color: var(--text-muted); font-size: var(--text-sm);"
        title="Limpar filtros"
      >
        <span class="material-symbols-outlined" style="font-size: 16px;">filter_alt_off</span>
        Limpar
      </button>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────────────────────────
   REGISTRO DE EVENTOS
───────────────────────────────────────────────────────────────────────────── */

/**
 * Registra os eventos de input/change na barra de filtros e chama o callback
 * onFiltrar com os valores atuais. Aplica debounce no campo de texto.
 *
 * @param {HTMLElement} container - Elemento pai que contém os inputs do filtro
 * @param {object}      opcoes
 * @param {string}      opcoes.prefixo    - Mesmo prefixo usado em criarHTMLBarraFiltros
 * @param {Function}    opcoes.onFiltrar  - Callback ({ termo, dataInicio, dataFim }) => void
 * @param {number}      [opcoes.delay=300] - Delay de debounce em ms
 */
function registrarEventosFiltros(container, { prefixo = 'filtro', onFiltrar, delay = 300 } = {}) {
  const inputBusca   = container.querySelector(`#${prefixo}-busca`);
  const inputInicio  = container.querySelector(`#${prefixo}-data-inicio`);
  const inputFim     = container.querySelector(`#${prefixo}-data-fim`);
  const btnLimpar    = container.querySelector(`#${prefixo}-limpar`);

  if (!inputBusca || !inputInicio || !inputFim) return;

  // Função auxiliar que lê os valores atuais e dispara o callback
  const disparar = () => {
    if (typeof onFiltrar === 'function') {
      onFiltrar({
        termo:      inputBusca.value.trim().toLowerCase(),
        dataInicio: inputInicio.value || null,
        dataFim:    inputFim.value    || null,
      });
    }
  };

  // Debounce para o campo de busca de texto
  let timerDebounce = null;
  inputBusca.addEventListener('input', () => {
    clearTimeout(timerDebounce);
    timerDebounce = setTimeout(disparar, delay);
  });

  // Date pickers disparam imediatamente
  inputInicio.addEventListener('change', disparar);
  inputFim.addEventListener('change', disparar);

  // Botão Limpar: zera os campos e dispara
  if (btnLimpar) {
    btnLimpar.addEventListener('click', () => {
      inputBusca.value  = '';
      inputInicio.value = '';
      inputFim.value    = '';
      disparar();
    });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   FILTRAGEM EM MEMÓRIA
───────────────────────────────────────────────────────────────────────────── */

/**
 * Filtra uma lista de objetos pelo campo de texto e pelo intervalo de datas.
 * Ambos os filtros são opcionais (string vazia / null desabilita o filtro).
 *
 * @param {Array}   lista          - Array de objetos a filtrar
 * @param {object}  opcoes
 * @param {string}  opcoes.campoTexto  - Nome do campo de texto para busca (ex: 'nome', 'clienteNome')
 * @param {string}  opcoes.termo       - Termo digitado pelo usuário (já em minúsculas)
 * @param {string}  opcoes.campoData   - Nome do campo de data (ex: 'dataVencimento', 'dataConcessao')
 * @param {string|null} opcoes.dataInicio - Data início no formato 'AAAA-MM-DD'
 * @param {string|null} opcoes.dataFim   - Data fim no formato 'AAAA-MM-DD'
 * @returns {Array} Lista filtrada
 */
function filtrarLista(lista, { campoTexto = '', termo = '', campoData = '', dataInicio = null, dataFim = null } = {}) {
  return lista.filter(item => {
    // Filtro por texto
    if (termo && campoTexto) {
      const valorCampo = (item[campoTexto] || '').toString().toLowerCase();
      if (!valorCampo.includes(termo)) return false;
    }

    // Filtro por intervalo de data
    if (campoData && (dataInicio || dataFim)) {
      const valorData = item[campoData] || null;
      if (!valorData) return false; // Itens sem data são excluídos quando há filtro de data
      if (dataInicio && valorData < dataInicio) return false;
      if (dataFim   && valorData > dataFim)    return false;
    }

    return true;
  });
}

export { criarHTMLBarraFiltros, registrarEventosFiltros, filtrarLista };
