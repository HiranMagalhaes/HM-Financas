/**
 * HM Finanças — app.js
 * Arquivo principal da aplicação.
 * Responsável por inicializar o sistema, controlar o tema, a splash screen
 * e orquestrar o carregamento das telas conforme a rota ativa.
 *
 * Ordem de execução:
 *   1. DOM pronto → inicializar tema
 *   2. (Futuro) Inicializar Firebase
 *   3. (Futuro) Verificar autenticação
 *   4. Esconder splash screen e renderizar a tela inicial
 */

'use strict';

import { Router } from './router.js';
import { inicializarFirebase } from './firebase/firebase-init.js';
import { AuthService } from './firebase/auth-service.js';
import { NotificacoesModule } from './modules/notificacoes/index.js';

/* ───────────────────────────────────────────────────────────────────────────
   CONSTANTES GLOBAIS DA APLICAÇÃO
─────────────────────────────────────────────────────────────────────────── */

/** Nome do projeto (usado em títulos de página) */
const APP_NAME = 'HM Finanças';

/** Versão atual do sistema */
const APP_VERSION = '1.0.0';

/** Chave no localStorage para persistir preferência de tema */
const THEME_KEY = 'hm-theme';

/** Tempo mínimo de exibição da splash screen (ms) — evita flash de tela */
const SPLASH_MIN_DURATION = 1800;


/* ───────────────────────────────────────────────────────────────────────────
   CONTROLE DE TEMA (ESCURO / CLARO)
─────────────────────────────────────────────────────────────────────────── */

/**
 * Aplica o tema informado ao elemento <html>.
 * O atributo data-theme é lido pelas variáveis CSS em variables.css.
 *
 * @param {'dark' | 'light'} tema - O tema a ser aplicado.
 */
function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  localStorage.setItem(THEME_KEY, tema);
}

/**
 * Retorna o tema salvo pelo usuário.
 * Se não houver preferência salva, usa a preferência do sistema operacional.
 *
 * @returns {'dark' | 'light'}
 */
function obterTemaSalvo() {
  const temaSalvo = localStorage.getItem(THEME_KEY);
  if (temaSalvo === 'light' || temaSalvo === 'dark') return temaSalvo;

  // Detectar preferência do sistema operacional
  const prefereSistemaEscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefereSistemaEscuro ? 'dark' : 'dark'; // Padrão sempre escuro
}

/**
 * Alterna entre tema escuro e claro.
 * Adiciona uma classe temporária para suavizar a transição visual.
 */
function alternarTema() {
  const temaAtual = document.documentElement.getAttribute('data-theme') || 'dark';
  const novoTema = temaAtual === 'dark' ? 'light' : 'dark';

  // Adiciona classe de transição suave
  document.documentElement.classList.add('theme-transitioning');
  aplicarTema(novoTema);

  // Remove a classe após a transição terminar
  setTimeout(() => {
    document.documentElement.classList.remove('theme-transitioning');
  }, 500);
}

// Exporta a função para uso global
export { alternarTema, aplicarTema };


/* ───────────────────────────────────────────────────────────────────────────
   CONTROLE DE VISIBILIDADE DE VALORES
─────────────────────────────────────────────────────────────────────────── */

const VISIBILITY_KEY = 'hm-values-hidden';

function aplicarVisibilidadeValores(isOculto) {
  if (isOculto) {
    document.body.classList.add('hide-values');
  } else {
    document.body.classList.remove('hide-values');
  }
  localStorage.setItem(VISIBILITY_KEY, isOculto ? 'true' : 'false');
}

function obterVisibilidadeSalva() {
  return localStorage.getItem(VISIBILITY_KEY) === 'true';
}

function alternarVisibilidadeValores() {
  const isOculto = document.body.classList.contains('hide-values');
  aplicarVisibilidadeValores(!isOculto);
}

// Exporta as funções de visibilidade para uso em Configurações e globais
export { aplicarVisibilidadeValores, alternarVisibilidadeValores, obterVisibilidadeSalva };

/* ───────────────────────────────────────────────────────────────────────────
   SPLASH SCREEN
─────────────────────────────────────────────────────────────────────────── */

/**
 * Esconde a splash screen com animação de fade out.
 * Após a animação, remove o elemento do DOM para liberar memória.
 */
function esconderSplash() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;

  splash.classList.add('fade-out');

  // Remove o elemento após a transição CSS terminar
  setTimeout(() => {
    splash.remove();
  }, 500); // Deve ser igual ao --transition-slow em variables.css
}


/**
 * Renderiza o layout de autenticação (sem sidebar/header).
 * Injeta um container para a tela de login/cadastro.
 */
function renderizarLayoutAuth() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="auth-layout">
      <!-- O conteúdo específico (login, cadastro, etc) será injetado aqui pelo router -->
      <div id="main-content"></div>
    </div>
    <!-- Container de toasts (notificações temporárias) -->
    <div class="toast-container" id="toast-container" aria-live="polite" aria-atomic="true"></div>
  `;

  // Inicializar o roteador
  if (Router) {
    Router.init();
  }
}

/**
 * Renderiza o layout base da aplicação (sidebar + header + área de conteúdo).
 * Chamado para usuários autenticados.
 * Os módulos de tela substituem o conteúdo de #main-content conforme a rota.
 */
function renderizarLayoutBase(usuario) {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <!-- Layout principal: sidebar + header + conteúdo -->
    <div class="app-layout" id="app-layout">

      <!-- ── SIDEBAR ── -->
      <aside class="sidebar" id="sidebar" role="navigation" aria-label="Menu principal">

        <!-- Marca / Logo -->
        <div class="sidebar-brand">
          <div class="sidebar-brand-icon" aria-hidden="true">
            <span class="logo-hm">HM</span>
          </div>
          <span class="sidebar-brand-text">${APP_NAME}</span>
        </div>

        <!-- Navegação -->
        <nav class="sidebar-nav" id="sidebar-nav">

          <!-- Seção principal -->
          <p class="sidebar-section-label">Principal</p>
          <div class="nav-item active" data-route="dashboard" role="button" tabindex="0"
               aria-label="Dashboard" aria-current="page">
            <span class="material-symbols-outlined nav-icon">dashboard</span>
            <span class="nav-label">Dashboard</span>
          </div>

          <!-- Seção financeira -->
          <p class="sidebar-section-label" style="margin-top: var(--space-4)">Financeiro</p>

          <div class="nav-item" data-route="patrimonio" role="button" tabindex="0"
               aria-label="Patrimônio">
            <span class="material-symbols-outlined nav-icon">account_balance_wallet</span>
            <span class="nav-label">Patrimônio</span>
          </div>

          <div class="nav-item" data-route="dinheiro" role="button" tabindex="0"
               aria-label="Dinheiro">
            <span class="material-symbols-outlined nav-icon">payments</span>
            <span class="nav-label">Dinheiro</span>
          </div>

          <div class="nav-item" data-route="cartoes" role="button" tabindex="0"
               aria-label="Cartões">
            <span class="material-symbols-outlined nav-icon">credit_card</span>
            <span class="nav-label">Cartões</span>
          </div>

          <!-- Seção de crédito -->
          <p class="sidebar-section-label" style="margin-top: var(--space-4)">Crédito</p>

          <div class="nav-item" data-route="hmcred" role="button" tabindex="0"
               aria-label="HMCRED">
            <span class="material-symbols-outlined nav-icon">local_atm</span>
            <span class="nav-label">HMCRED</span>
          </div>

          <div class="nav-item" data-route="promissorias" role="button" tabindex="0"
               aria-label="Promissórias">
            <span class="material-symbols-outlined nav-icon">receipt_long</span>
            <span class="nav-label">Promissórias</span>
          </div>

          <div class="nav-item" data-route="clientes" role="button" tabindex="0"
               aria-label="Clientes">
            <span class="material-symbols-outlined nav-icon">group</span>
            <span class="nav-label">Clientes</span>
          </div>

          <div class="nav-item" data-route="cobrancas" role="button" tabindex="0"
               aria-label="Cobranças">
            <span class="material-symbols-outlined nav-icon">request_quote</span>
            <span class="nav-label">Cobranças</span>
          </div>

          <div class="nav-item" data-route="relatorio" role="button" tabindex="0"
               aria-label="Relatório">
            <span class="material-symbols-outlined nav-icon">bar_chart</span>
            <span class="nav-label">Relatório</span>
          </div>

          <!-- Seção de sistema -->
          <p class="sidebar-section-label" style="margin-top: var(--space-4)">Sistema</p>

          <div class="nav-item" data-route="notificacoes" role="button" tabindex="0"
               aria-label="Notificações">
            <span class="material-symbols-outlined nav-icon">notifications</span>
            <span class="nav-label">Notificações</span>
          </div>

          <div class="nav-item" data-route="configuracoes" role="button" tabindex="0"
               aria-label="Configurações">
            <span class="material-symbols-outlined nav-icon">settings</span>
            <span class="nav-label">Configurações</span>
          </div>

        </nav>

        <!-- Perfil do usuário -->
        <div class="sidebar-footer">
          <div class="sidebar-user" id="btn-perfil" role="button" tabindex="0"
               aria-label="Perfil do usuário" title="Clique para sair">
            <div class="user-avatar" id="user-avatar" aria-hidden="true">${usuario?.email ? usuario.email.charAt(0).toUpperCase() : 'U'}</div>
            <div class="user-info">
              <p class="user-name" id="user-name">${usuario?.email || 'Usuário'}</p>
              <p class="user-role">Administrador</p>
            </div>
          </div>
        </div>

      </aside><!-- /sidebar -->


      <!-- ── HEADER ── -->
      <header class="app-header" id="app-header" role="banner">
        <div class="header-left">
          <!-- Botão de toggle da sidebar (mobile / colapso) -->
          <button class="btn btn-ghost btn-icon" id="btn-toggle-sidebar"
                  aria-label="Alternar menu lateral" aria-expanded="true">
            <span class="material-symbols-outlined">menu</span>
          </button>
          <!-- Título da página atual (atualizado pelo router) -->
          <h1 class="header-title" id="header-title">Dashboard</h1>
        </div>

        <div class="header-right">
          <!-- Botão de alternância de visibilidade de valores -->
          <button class="btn btn-ghost btn-icon" id="btn-toggle-values"
                  aria-label="Alternar valores"
                  title="Ocultar/Exibir valores sensíveis">
            <span class="material-symbols-outlined" id="values-icon">visibility</span>
          </button>

          <!-- Botão de alternância de tema -->
          <button class="btn btn-ghost btn-icon" id="btn-toggle-tema"
                  aria-label="Alternar tema"
                  title="Alternar entre tema escuro e claro">
            <span class="material-symbols-outlined" id="tema-icon">dark_mode</span>
          </button>

          <!-- Botão de notificações -->
          <button class="btn btn-ghost btn-icon" id="btn-notificacoes"
                  aria-label="Notificações">
            <span class="material-symbols-outlined">notifications</span>
          </button>
        </div>
      </header><!-- /header -->


      <!-- ── CONTEÚDO PRINCIPAL ── -->
      <main class="app-main" id="app-main" role="main">
        <div class="page-container" id="main-content">
          <!-- Conteúdo injetado dinamicamente pelo router.js -->
        </div>
      </main>

    </div><!-- /#app-layout -->

    <!-- Container de toasts (notificações temporárias) -->
    <div class="toast-container" id="toast-container" aria-live="polite" aria-atomic="true"></div>
  `;

  // Registrar eventos de interação após injetar o HTML
  registrarEventosLayout();

  // Inicializar o roteador para renderizar a tela correta
  if (Router) {
    Router.init();
  }
}

/**
 * Registra os eventos de interação do layout base:
 * - Toggle da sidebar
 * - Toggle de tema
 * - Navegação pelos itens do menu
 */
function registrarEventosLayout() {
  // --- Toggle da sidebar ---
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const appLayout = document.getElementById('app-layout');
  const sidebar = document.getElementById('sidebar');

  if (btnToggleSidebar && appLayout) {
    btnToggleSidebar.addEventListener('click', () => {
      const estaRecolhida = appLayout.classList.toggle('sidebar-collapsed');
      btnToggleSidebar.setAttribute('aria-expanded', String(!estaRecolhida));

      // Em mobile, usa a classe 'open' na sidebar
      if (window.innerWidth <= 768) {
        appLayout.classList.remove('sidebar-collapsed');
        sidebar?.classList.toggle('open');
      }
    });
  }

  // --- Logout (Clique no perfil) ---
  const btnPerfil = document.getElementById('btn-perfil');
  if (btnPerfil) {
    btnPerfil.addEventListener('click', async () => {
      const confirmar = confirm('Deseja realmente sair?');
      if (confirmar && AuthService) {
        await AuthService.logout();
        window.location.reload(); // Recarrega para limpar estado e voltar pro login
      }
    });
    
    // Suporte a teclado
    btnPerfil.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btnPerfil.click();
      }
    });
  }

  // --- Toggle de tema ---
  const btnTema = document.getElementById('btn-toggle-tema');
  const temaIcon = document.getElementById('tema-icon');

  if (btnTema) {
    btnTema.addEventListener('click', () => {
      alternarTema();
      // Atualiza o ícone conforme o tema aplicado
      const temaAtual = document.documentElement.getAttribute('data-theme');
      if (temaIcon) {
        temaIcon.textContent = temaAtual === 'dark' ? 'dark_mode' : 'light_mode';
      }
    });
  }

  // --- Botão de Notificações (Sininho) ---
  const btnNotificacoes = document.getElementById('btn-notificacoes');
  if (btnNotificacoes) {
    btnNotificacoes.addEventListener('click', () => {
      if (Router) Router.navegar('notificacoes');
    });
  }

  // --- Toggle de Visibilidade de Valores ---
  const btnValues = document.getElementById('btn-toggle-values');
  const valuesIcon = document.getElementById('values-icon');

  if (btnValues) {
    // Definir estado inicial do ícone
    if (valuesIcon) {
      valuesIcon.textContent = document.body.classList.contains('hide-values') ? 'visibility_off' : 'visibility';
    }

    btnValues.addEventListener('click', () => {
      alternarVisibilidadeValores();
      if (valuesIcon) {
        valuesIcon.textContent = document.body.classList.contains('hide-values') ? 'visibility_off' : 'visibility';
      }
    });
  }

  // --- Navegação pelos itens do menu ---
  const navItems = document.querySelectorAll('.nav-item[data-route]');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const rota = item.getAttribute('data-route');
      if (rota && Router) {
        Router.navegar(rota);
      }
    });

    // Suporte a teclado (Enter / Espaço)
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });
  });
}


/* ───────────────────────────────────────────────────────────────────────────
   INICIALIZAÇÃO DO APLICATIVO
─────────────────────────────────────────────────────────────────────────── */

/**
 * Função principal de inicialização.
 * Executada quando o DOM está completamente carregado.
 */
async function inicializarApp() {
  console.log(`[${APP_NAME}] Inicializando v${APP_VERSION}...`);

  // 1. Aplicar tema salvo (antes de qualquer renderização)
  aplicarTema(obterTemaSalvo());

  // 1.b. Aplicar visibilidade de valores
  aplicarVisibilidadeValores(obterVisibilidadeSalva());

  // 2. Registrar tempo de início para controlar duração mínima da splash
  const inicio = Date.now();

  try {
    // 3. Inicializar Firebase (o script _firebaseInit será invocado)
    const firebaseContext = inicializarFirebase();
    if (!firebaseContext) {
      console.error('[HM Finanças] Não foi possível carregar os serviços base do Firebase.');
    }
    
    // 4. Verificar autenticação
    let usuario = null;
    if (AuthService) {
      usuario = await AuthService.verificarSessaoInicial();
    }

    // 4.b. Forçar refresh do token JWT para garantir que o Firestore
    //      tenha credenciais válidas antes de iniciar os listeners.
    //      Sem isso, ocorre race condition com enableMultiTabIndexedDbPersistence:
    //      auth.currentUser existe, mas o token ainda não foi validado pelo Firestore.
    if (usuario) {
      try {
        await usuario.getIdToken(true);
      } catch (e) {
        console.warn('[HM Finanças] Não foi possível atualizar o token de auth:', e.message);
      }
    }

    // 5. Renderizar o layout adequado
    if (usuario) {
      renderizarLayoutBase(usuario);
      NotificacoesModule.iniciarMonitoramentoBadges();
    } else {
      renderizarLayoutAuth();
    }

  } catch (erro) {
    console.error('[HM Finanças] Erro na inicialização:', erro);
    // TODO: Exibir tela de erro amigável
  } finally {
    // 6. Garantir que a splash ficou visível pelo tempo mínimo
    const tempoDecorrido = Date.now() - inicio;
    const aguardar = Math.max(0, SPLASH_MIN_DURATION - tempoDecorrido);

    setTimeout(esconderSplash, aguardar);
  }
}

/* Aguardar o DOM estar pronto antes de inicializar */
document.addEventListener('DOMContentLoaded', inicializarApp);
