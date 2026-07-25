# Progresso do Projeto — HM Finanças

> Documento de acompanhamento do desenvolvimento.
> Atualizar ao final de cada módulo concluído.

---

## Status Atual

| Campo | Valor |
|---|---|
| **Módulo em andamento** | Módulo 3 — Dashboard Concluído |
| **Próximo módulo** | Módulo 4 — Patrimônio |
| **Última atualização** | 25/07/2026 |
| **Versão** | v1.2.0 |

---

## Histórico do Projeto

### 23/07/2026 — Início do projeto

- Projeto criado do zero com base no briefing aprovado
- Definida a stack oficial: HTML + CSS + JS + Firebase (plano Spark)
- Definida a identidade visual: tema escuro, dourado vibrante, Inter + Playfair Display
- Criado o repositório GitHub e estrutura inicial de pastas

---

## Módulo 1 — Estrutura Base ✅

### O que foi feito

- [x] `.gitignore` configurado corretamente (credenciais, node_modules, sistema)
- [x] `index.html` — ponto de entrada semântico com splash screen elegante
- [x] `styles/reset.css` — reset moderno e minimalista
- [x] `styles/variables.css` — sistema completo de design tokens (dark + light)
- [x] `styles/global.css` — tipografia, scrollbar, seleção, utilitários
- [x] `styles/layout.css` — splash screen, sidebar, header, main, responsividade
- [x] `styles/components.css` — botões, inputs, cards, badges, tabelas, modais, toasts
- [x] `styles/themes.css` — ajustes finos por tema e print
- [x] `scripts/app.js` — orquestrador principal com controle de tema e splash
- [x] `scripts/router.js` — roteador por hash com todas as rotas mapeadas
- [x] `scripts/utils/helpers.js` — funções auxiliares, toasts, DOM helpers
- [x] `scripts/utils/formatters.js` — formatação de moeda, data, CPF, telefone
- [x] `scripts/utils/validators.js` — validação de formulários e documentos
- [x] `scripts/firebase/firebase-config.example.js` — template seguro de configuração
- [x] `scripts/firebase/firebase-init.js` — inicialização com persistência offline
- [x] `scripts/firebase/auth-service.js` — login, logout, recuperação de senha
- [x] `scripts/firebase/firestore-service.js` — CRUD genérico com listeners em tempo real
- [x] Placeholders criados para todos os módulos JS em `scripts/modules/`
- [x] Placeholders criados para componentes em `components/`
- [x] Pastas de assets criadas (`icons/`, `images/`, `logos/`)
- [x] `docs/manual-do-projeto.md` — manual oficial do projeto
- [x] `docs/progresso-do-projeto.md` — este arquivo
- [x] `docs/estrutura-de-pastas.md` — guia de organização
- [x] `docs/regras-de-negocio-resumo.md` — regras de negócio aprovadas
- [x] `README.md` — documentação do GitHub profissional

---

## Módulo 2A — Autenticação e Sessão ✅

### O que foi feito

- [x] Tela de login elegante com formulário de e-mail e senha
- [x] Validação dos campos antes de enviar
- [x] Integração real com Firebase Authentication
- [x] Tela de cadastro de nova conta (e-mail, senha, confirmação)
- [x] Tela de recuperação de senha via e-mail
- [x] Mensagens de erro amigáveis em português (Toasts)
- [x] Redirecionamento dinâmico baseado em estado da sessão
- [x] Proteção de rotas (redireciona para login se não autenticado)
- [x] Logout funcional clicando no perfil do usuário
- [x] Refatoração completa para JavaScript nativo (ES Modules) com Firebase v10

---

## Módulo 3 — Dashboard ✅

### O que foi feito

- [x] **Módulo `scripts/modules/dashboard/index.js`** completamente reescrito e expandido
  - Lógica do módulo exportada como `DashboardModule` (mesmo padrão do `AuthModule`)
  - Saudação contextual ao usuário autenticado (Bom dia / Boa tarde / Boa noite)
  - Nome amigável extraído do `displayName` ou e-mail do Firebase
  - Dados mockados em objeto `mockDashboardData` bem estruturado e documentado
    (campos comentados com referência ao Firestore para futura integração)

- [x] **6 Cards de estatísticas (KPIs)** com classes `value-sensitive`:
  - Saldo Disponível (com link para `/dinheiro`)
  - Patrimônio Total (com link para `/patrimonio`)
  - Em Promissórias — com lucro estimado (com link para `/promissorias`)
  - Recebimentos no Mês
  - Cobranças Pendentes — vencidas + a vencer em 7 dias (com link para `/cobrancas`)
  - Operações HMCRED (com link para `/hmcred`)

- [x] **Indicadores de variação** (% vs mês anterior) em cada card relevante

- [x] **Lista de últimas 6 movimentações** com ícone colorido por tipo (receita / despesa / transferência)

- [x] **Gráfico de barras CSS puro** (sem biblioteca) — evolução do patrimônio nos últimos 6 meses
  - Barra do mês atual destacada em dourado
  - Dados mockados, comentados para substituição por Firestore

- [x] **Lista de alertas recentes** com ícones por tipo (vencido / a vencer / info)
  - Data relativa (ex: "há 2 dias") via `formatarDataRelativa()`

- [x] **6 Botões de ação rápida** via `shortcut-grid` — Nova Promissória, Novo Cliente, Registrar Pgto, Transferência, HMCRED, Promissórias

- [x] **Card de modo demo** — aviso visual com badge "Modo Demo" no cabeçalho

- [x] **Botão ocultar/exibir valores** — funciona via classe `.hide-values` no body (já implementado em app.js)
  - Todos os valores monetários usam a classe `value-sensitive`

- [x] **Navegação pelos cards clicáveis** — cards com `data-nav` navigam via hash

- [x] **Acessibilidade** — atributos `aria-label`, `role`, `tabindex` nos elementos interativos

- [x] **Responsividade** — layout em coluna única no mobile via `.dashboard-grid` (media query já em components.css)

### Novos estilos adicionados em `styles/components.css`

- `.dashboard-section-header` — cabeçalho de seção com título + link "Ver tudo"
- `.dashboard-ver-mais` — link animado ao lado do título
- `.dashboard-page-header` — variante do page-header para o dashboard
- `.alerta-list`, `.alerta-item`, `.alerta-corpo`, `.alerta-texto` — lista de alertas
- `.grafico-container`, `.grafico-barras`, `.grafico-col`, `.grafico-barra-wrap` — gráfico
- `.grafico-barra`, `.grafico-barra.ativa`, `.grafico-label`, `.grafico-nota` — gráfico
- `.card-demo`, `.demo-info` — card de aviso de modo demo

### Nova utilidade adicionada em `styles/global.css`

- `.text-info` — classe de cor para texto azul (usada nos ícones de HMCRED)

---

## Módulo 4 — Patrimônio 🔜 (Próximo)

### Escopo planejado

- [ ] Cadastro e listagem de ativos patrimoniais (imóveis, veículos, investimentos, etc.)
- [ ] Cálculo automático do patrimônio total
- [ ] Integração real com Firestore (`coleção: patrimônio`)
- [ ] Filtros por categoria
- [ ] Edição e exclusão de ativos
- [ ] Visualização de evolução histórica

---

## Módulos Futuros (5–8)

- Módulo 5: Promissórias (CRUD, cálculos, status, vencimento)
- Módulo 6: Clientes e Cobranças (PIX + WhatsApp)
- Módulo 7: Notificações automáticas
- Módulo 8: Configurações e polimentos finais

---

## Próximos Passos Imediatos

1. ✅ Commit do Módulo 3 (Dashboard)
2. Definir a estrutura de dados do Firestore para `patrimônio`
3. Iniciar o Módulo 4 — Patrimônio
4. Futuramente: substituir `mockDashboardData` por chamadas reais ao `FirestoreService`
