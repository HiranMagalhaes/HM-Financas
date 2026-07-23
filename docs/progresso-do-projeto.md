# Progresso do Projeto — HM Finanças

> Documento de acompanhamento do desenvolvimento.
> Atualizar ao final de cada módulo concluído.

---

## Status Atual

| Campo | Valor |
|---|---|
| **Módulo em andamento** | Módulo 2A — Concluído |
| **Próximo módulo** | Módulo 2B — Dashboard Real |
| **Última atualização** | 23/07/2026 |
| **Versão** | v1.1.0 |

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
- [x] Placeholders criados para páginas em `pages/`
- [x] Placeholders criados para componentes em `components/`
- [x] Pastas de assets criadas (`icons/`, `images/`, `logos/`)
- [x] `docs/manual-do-projeto.md` — manual oficial do projeto
- [x] `docs/progresso-do-projeto.md` — este arquivo
- [x] `docs/estrutura-de-pastas.md` — guia de organização
- [x] `docs/regras-de-negocio-resumo.md` — regras de negócio aprovadas
- [x] `README.md` — documentação do GitHub profissional

### O que NÃO foi implementado (escopo de módulos futuros)

- [ ] Tela de login completa com formulário
- [ ] Autenticação real com Firebase (conexão ativa)
- [ ] Dashboard com dados reais
- [ ] CRUD de qualquer entidade (clientes, promissórias, etc.)
- [ ] Cálculo de promissórias e lucro
- [ ] Integração com WhatsApp para cobranças
- [ ] Sistema de relatórios
- [ ] Configurações do sistema

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
- [x] Injeção de módulos via script tags no `index.html` (Refatorado)
- [x] Refatoração completa da arquitetura para JavaScript nativo (ES Modules) com importações modulares do Firebase v10/v12

---

## Módulo 2B — Dashboard (Dados Reais) 🔜

### Escopo planejado

- [ ] Integração real das métricas do Dashboard via Firestore
- [ ] Listagem de atividades recentes
- [ ] Criação de skeleton loaders para o Dashboard
- [ ] Ajustes finos no módulo Dashboard

---

## Módulos Futuros (3–8)

- Módulo 3: Patrimônio (HMCRED, Dinheiro, Cartões)
- Módulo 4: Promissórias (CRUD, cálculos, status)
- Módulo 5: Clientes e Cobranças (PIX + WhatsApp)
- Módulo 6: Notificações automáticas
- Módulo 7: Configurações e polimentos finais

---

## Próximos Passos Imediatos

1. Fazer o commit com as mudanças do Módulo 2A
2. Iniciar o Módulo 2B (Dashboard Real)
3. Definir regras e campos exatos que farão parte do sumário financeiro no Firestore.
