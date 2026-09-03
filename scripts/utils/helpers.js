/**
 * HM Finanças — helpers.js
 * Funções auxiliares genéricas usadas em todo o sistema.
 * Não dependem de nenhum outro arquivo do projeto.
 */

'use strict';

/* ───────────────────────────────────────────────────────────────────────────
   MANIPULAÇÃO DO DOM
─────────────────────────────────────────────────────────────────────────── */

/**
 * Atalho para document.getElementById.
 * @param {string} id
 * @returns {HTMLElement | null}
 */
function $(id) {
  return document.getElementById(id);
}

/**
 * Atalho para document.querySelector.
 * @param {string} seletor
 * @returns {Element | null}
 */
function $q(seletor) {
  return document.querySelector(seletor);
}

/**
 * Atalho para document.querySelectorAll (retorna array real, não NodeList).
 * @param {string} seletor
 * @returns {Element[]}
 */
function $all(seletor) {
  return Array.from(document.querySelectorAll(seletor));
}


/* ───────────────────────────────────────────────────────────────────────────
   TOASTS (NOTIFICAÇÕES TEMPORÁRIAS)
─────────────────────────────────────────────────────────────────────────── */

/**
 * Exibe uma notificação temporária (toast) na tela.
 *
 * @param {Object} opcoes
 * @param {'success' | 'danger' | 'warning' | 'info'} opcoes.tipo - Tipo do toast
 * @param {string} opcoes.titulo - Título principal
 * @param {string} [opcoes.mensagem] - Detalhe adicional (opcional)
 * @param {number} [opcoes.duracao=4000] - Tempo de exibição em ms
 */
function mostrarToast({ tipo = 'info', titulo, mensagem = '', duracao = 4000 }) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // Mapa de ícones por tipo
  const icones = {
    success: 'check_circle',
    danger:  'error',
    warning: 'warning',
    info:    'info',
  };

  // Criar elemento do toast
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span class="material-symbols-outlined toast-icon filled">${icones[tipo] || 'info'}</span>
    <div class="toast-content">
      <p class="toast-title">${titulo}</p>
      ${mensagem ? `<p class="toast-message">${mensagem}</p>` : ''}
    </div>
    <button class="btn btn-ghost btn-icon" onclick="this.parentElement.remove()" aria-label="Fechar">
      <span class="material-symbols-outlined" style="font-size:18px;">close</span>
    </button>
  `;

  container.appendChild(toast);

  // Remover automaticamente após a duração configurada
  const timer = setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, duracao);

  // Cancelar timer se o usuário fechar manualmente
  toast.querySelector('button').addEventListener('click', () => clearTimeout(timer));
}

// Expor globalmente
export { mostrarToast };


/* ───────────────────────────────────────────────────────────────────────────
   UTILITÁRIOS GERAIS
─────────────────────────────────────────────────────────────────────────── */

/**
 * Gera um ID único baseado em timestamp + número aleatório.
 * Útil para criar IDs de documentos locais antes de salvar no Firestore.
 *
 * @returns {string} ID único (ex: "1721740800000_abc123")
 */
function gerarIdUnico() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Atrasa a execução por um tempo determinado (Promise).
 * Útil para simular carregamento ou aguardar animações.
 *
 * @param {number} ms - Milissegundos para aguardar
 * @returns {Promise<void>}
 */
function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retorna as iniciais de um nome completo (máximo 2 letras).
 * Usado nos avatares de usuário e clientes.
 *
 * @param {string} nome - Nome completo
 * @returns {string} Iniciais (ex: "João Silva" → "JS")
 */
function obterIniciais(nome) {
  if (!nome || typeof nome !== 'string') return '?';
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() || '')
    .join('');
}

/**
 * Verifica se um valor está vazio (null, undefined, string vazia ou espaços).
 *
 * @param {*} valor
 * @returns {boolean}
 */
function estaVazio(valor) {
  return valor === null || valor === undefined || String(valor).trim() === '';
}

/**
 * Copia texto para a área de transferência do sistema.
 *
 * @param {string} texto - Texto a copiar
 * @param {string} [mensagemSucesso] - Mensagem exibida no toast ao copiar
 * @returns {Promise<void>}
 */
async function copiarParaClipboard(texto, mensagemSucesso = 'Copiado para a área de transferência!') {
  try {
    await navigator.clipboard.writeText(texto);
    mostrarToast({ tipo: 'success', titulo: mensagemSucesso });
  } catch {
    mostrarToast({ tipo: 'danger', titulo: 'Não foi possível copiar o texto.' });
  }
}

/**
 * Debounce — atrasa a execução de uma função até que pare de ser chamada.
 * Útil para campos de busca em tempo real.
 *
 * @param {Function} fn - Função a executar
 * @param {number} delay - Delay em ms
 * @returns {Function} Função com debounce
 */
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Calcula o status real de uma data de vencimento (atrasada, hoje, amanha, pendente, ou status final como paga/recebida).
 * @param {string} dataVencimento - Data no formato 'AAAA-MM-DD'
 * @param {string} statusAtual - Status atual salvo no banco (ex: 'pendente', 'paga')
 * @param {string[]} statusResolvidos - Lista de status que não mudam (ex: ['paga', 'recebida'])
 * @returns {'atrasada'|'hoje'|'amanha'|'pendente'|string}
 */
function calcularStatusVencimento(dataVencimento, statusAtual, statusResolvidos = ['paga', 'recebida']) {
  if (statusResolvidos.includes(statusAtual)) {
    return statusAtual;
  }

  // Guard: data inválida ou ausente → trata como pendente sem data definida
  if (!dataVencimento || typeof dataVencimento !== 'string') {
    return 'pendente';
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const partes = dataVencimento.split('-');
  const vencimento = new Date(partes[0], partes[1] - 1, partes[2]);

  // Diferença em ms e depois dias
  const diffTime = vencimento.getTime() - hoje.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'atrasada';
  } else if (diffDays === 0) {
    return 'hoje';
  } else if (diffDays === 1) {
    return 'amanha';
  }

  return 'pendente';
}

/* ───────────────────────────────────────────────────────────────────────────
   SEGURANÇA — ESCAPE DE HTML
─────────────────────────────────────────────────────────────────────────── */

/**
 * Escapa caracteres especiais de HTML para evitar XSS ao inserir dados
 * do usuário/Firestore via innerHTML.
 *
 * Converte: & → &amp;  < → &lt;  > → &gt;  " → &quot;  ' → &#039;
 *
 * @param {*} texto - Valor a escapar (qualquer tipo é aceito)
 * @returns {string} Texto seguro para uso em innerHTML
 */
function escapeHTML(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export {
  $,
  $q,
  $all,
  gerarIdUnico,
  aguardar,
  obterIniciais,
  estaVazio,
  copiarParaClipboard,
  debounce,
  calcularStatusVencimento,
  escapeHTML,
};
