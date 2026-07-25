# Progresso do Projeto — HM Finanças

> Documento de acompanhamento do desenvolvimento.
> Atualizar ao final de cada módulo concluído.

---

## Status Atual

| Campo | Valor |
|---|---|
| **Módulo Atual** | Módulo 6 — Dinheiro e Cartões |
| **Status** | Início do planejamento do módulo de dinheiro em caixa, contas correntes e gerenciamento de faturas de cartões. |
| **Última Atualização** | Módulos 4 (Patrimônio) e 5 (HMCRED) concluídos, integrados ao Firestore. |

## Histórico de Implementação

### ✅ Etapa 0: Setup Inicial
- [x] Estrutura de pastas do front-end vanilla criada.
- [x] Variáveis CSS, reset e tipografia configurados.
- [x] Arquitetura de roteamento SPA baseada em Hash criada.

### ✅ Módulo 1: Autenticação Base e Layout Principal
- [x] Splash Screen com animações.
- [x] Tela de Login/Cadastro funcional usando Firebase Auth.
- [x] Sidebar responsiva e Cabeçalho global (`app.js`).
- [x] Proteção de rotas privadas no `router.js`.

### ✅ Módulo 2: Temas e Visibilidade
- [x] Suporte a Dark/Light mode com persistência no LocalStorage.
- [x] Alternância global para ocultar/exibir valores financeiros sensíveis (classe `.hide-values` e `.value-sensitive`).

### ✅ Módulo 3: Dashboard
- [x] Estrutura do `DashboardModule` (`scripts/modules/dashboard/index.js`).
- [x] Saudação ao usuário autenticado baseada no horário do dia.
- [x] Grid de 6 KPIs (Total, Patrimônio, Promissórias, Receber Mensal, Pagar, Capital Emprestado).
- [x] Tabela responsiva de últimas movimentações.
- [x] Botões de ação rápida.

### ✅ Módulo 4: Patrimônio
- [x] Visão consolidada (ativos e passivos).
- [x] Integração com `patrimonio/resumo` no Firestore.
- [x] Empty state elegante para novos usuários.

### ✅ Módulo 5: HMCRED
- [x] CRUD de operações de crédito (empréstimos próprios).
- [x] Regras de limites, capital disponível e capital emprestado.
- [x] Sincronização automática do valor total para o Patrimônio.
- [x] Regras de Segurança criadas no Firebase (`firestore.rules`).
