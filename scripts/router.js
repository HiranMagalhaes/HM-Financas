/**
 * HM Finanças — router.js
 * Sistema de roteamento simples baseado em hash (ex: #dashboard, #clientes).
 * Mapeia rotas para funções de renderização e atualiza a UI conforme a navegação.
 *
 * Uso:
 *   Router.init()       → inicializar ao carregar o app
 *   Router.navegar('dashboard') → navegar para uma rota específica
 */

'use strict';

/* ───────────────────────────────────────────────────────────────────────────
   MAPA DE ROTAS
   Cada rota possui: título da página, ícone e função de renderização.
   À medida que os módulos forem desenvolvidos, suas funções de render
   serão importadas e registradas aqui.
─────────────────────────────────────────────────────────────────────────── */

import { AuthModule } from './modules/auth/index.js';
import { DashboardModule } from './modules/dashboard/index.js';
import { AuthService } from './firebase/auth-service.js';

const APP_NAME = 'HM Finanças';

const ROTAS = {
  dashboard: {
    titulo: 'Dashboard',
    icone:  'dashboard',
    render: (container) => DashboardModule?.renderDashboard ? DashboardModule.renderDashboard(container) : renderEmConstrucao(container, 'dashboard'),
    privada: true,
  },
  patrimonio: {
    titulo: 'Patrimônio',
    icone:  'account_balance_wallet',
    render: renderEmConstrucao,
    privada: true,
  },
  dinheiro: {
    titulo: 'Dinheiro',
    icone:  'payments',
    render: renderEmConstrucao,
    privada: true,
  },
  cartoes: {
    titulo: 'Cartões',
    icone:  'credit_card',
    render: renderEmConstrucao,
    privada: true,
  },
  hmcred: {
    titulo: 'HMCRED',
    icone:  'local_atm',
    render: renderEmConstrucao,
    privada: true,
  },
  promissorias: {
    titulo: 'Promissórias',
    icone:  'receipt_long',
    render: renderEmConstrucao,
    privada: true,
  },
  clientes: {
    titulo: 'Clientes',
    icone:  'group',
    render: renderEmConstrucao,
    privada: true,
  },
  cobrancas: {
    titulo: 'Cobranças',
    icone:  'request_quote',
    render: renderEmConstrucao,
    privada: true,
  },
  notificacoes: {
    titulo: 'Notificações',
    icone:  'notifications',
    render: renderEmConstrucao,
    privada: true,
  },
  configuracoes: {
    titulo: 'Configurações',
    icone:  'settings',
    render: renderEmConstrucao,
    privada: true,
  },
  login: {
    titulo: 'Login',
    icone:  'login',
    render: (container) => AuthModule?.renderLogin(container),
    privada: false,
  },
  cadastro: {
    titulo: 'Criar Conta',
    icone:  'person_add',
    render: (container) => AuthModule?.renderCadastro(container),
    privada: false,
  },
  'recuperar-senha': {
    titulo: 'Recuperar Senha',
    icone:  'key',
    render: (container) => AuthModule?.renderRecuperarSenha(container),
    privada: false,
  },
};

/** Rota padrão quando nenhuma rota é especificada ou a rota não existe */
const ROTA_PADRAO = 'dashboard';


/* ───────────────────────────────────────────────────────────────────────────
   OBJETO PÚBLICO DO ROTEADOR
─────────────────────────────────────────────────────────────────────────── */
const Router = {

  /** Rota atualmente ativa */
  rotaAtual: null,

  /**
   * Inicializa o roteador.
   * Lê o hash da URL atual e renderiza a tela correspondente.
   * Registra listener para mudanças de hash (botão voltar/avançar do browser).
   */
  init() {
    // Ouvir mudanças de hash da URL
    window.addEventListener('hashchange', () => {
      const rota = this._obterRotaDaURL();
      this._renderizarRota(rota);
    });

    // Renderizar a rota inicial
    const rotaInicial = this._obterRotaDaURL();
    this._renderizarRota(rotaInicial);
  },

  /**
   * Navega para a rota informada.
   * Atualiza o hash da URL, o que dispara o evento 'hashchange'.
   *
   * @param {string} rota - Nome da rota (ex: 'dashboard', 'clientes')
   */
  navegar(rota) {
    window.location.hash = rota;
  },

  /**
   * Lê a rota da URL atual (do hash).
   * Retorna a rota padrão se o hash estiver vazio ou for inválido.
   *
   * @returns {string} Nome da rota válida
   */
  _obterRotaDaURL() {
    const hash = window.location.hash.replace('#', '').trim();
    return ROTAS[hash] ? hash : ROTA_PADRAO;
  },

  /**
   * Renderiza a tela correspondente à rota informada.
   * Aplica proteção de rota com base no estado de autenticação.
   *
   * @param {string} rota - Nome da rota
   */
  _renderizarRota(rota) {
    const config = ROTAS[rota] || ROTAS[ROTA_PADRAO];

    // --- PROTEÇÃO DE ROTAS ---
    const usuario = AuthService?.obterUsuarioAtual();
    
    // Se rota for privada e não houver usuário -> login
    if (config.privada && !usuario) {
      console.log(`[Router] Acesso negado a '${rota}'. Redirecionando para login.`);
      this.navegar('login');
      return; // A navegação irá disparar um novo _renderizarRota
    }
    
    // Se rota for pública (ex: login, cadastro) e houver usuário -> dashboard
    if (!config.privada && usuario) {
      console.log(`[Router] Usuário já autenticado. Redirecionando para dashboard.`);
      this.navegar('dashboard');
      return;
    }

    this.rotaAtual = rota;

    // Atualizar título da aba do navegador
    document.title = `${config.titulo} — ${APP_NAME}`;

    // Atualizar título no header (apenas no layout base)
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) headerTitle.textContent = config.titulo;

    // Atualizar item ativo na sidebar (apenas no layout base)
    this._atualizarNavAtivo(rota);

    // Renderizar o conteúdo da página
    const mainContent = document.getElementById('main-content');
    if (mainContent && typeof config.render === 'function') {
      config.render(mainContent, rota);
    }

    // Rolar para o topo da página
    const appMain = document.getElementById('app-main');
    if (appMain) appMain.scrollTop = 0;

    // Fechar sidebar em mobile após navegar
    if (window.innerWidth <= 768) {
      const sidebar = document.getElementById('sidebar');
      sidebar?.classList.remove('open');
    }
  },

  /**
   * Atualiza o estado ativo dos itens de navegação na sidebar.
   *
   * @param {string} rotaAtiva - Nome da rota ativa
   */
  _atualizarNavAtivo(rotaAtiva) {
    const navItems = document.querySelectorAll('.nav-item[data-route]');
    navItems.forEach(item => {
      const eAtivo = item.getAttribute('data-route') === rotaAtiva;
      item.classList.toggle('active', eAtivo);
      item.setAttribute('aria-current', eAtivo ? 'page' : 'false');
    });
  },
};

export { Router };


/* ───────────────────────────────────────────────────────────────────────────
   FUNÇÕES DE RENDERIZAÇÃO DAS TELAS
   Cada módulo terá seu próprio arquivo em scripts/modules/.
   Por ora, usamos funções placeholder para a estrutura base.
─────────────────────────────────────────────────────────────────────────── */



/**
 * Renderiza uma tela genérica de "Em construção" para módulos ainda não implementados.
 *
 * @param {HTMLElement} container - Elemento onde renderizar o conteúdo
 * @param {string} rota - Nome da rota (para personalizar a mensagem)
 */
function renderEmConstrucao(container, rota) {
  const config = ROTAS[rota] || {};

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">${config.titulo || 'Página'}</h2>
        <p class="page-subtitle">Este módulo ainda está em desenvolvimento.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="empty-state">
          <span class="material-symbols-outlined empty-state-icon">
            ${config.icone || 'construction'}
          </span>
          <h3 class="empty-state-title">${config.titulo || 'Módulo'} em breve</h3>
          <p class="empty-state-text">
            Este módulo está planejado e será implementado nas próximas etapas do desenvolvimento.
            A estrutura base já está preparada.
          </p>
          <button class="btn btn-secondary" onclick="Router.navegar('dashboard')">
            <span class="material-symbols-outlined">arrow_back</span>
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    </div>
  `;
}
