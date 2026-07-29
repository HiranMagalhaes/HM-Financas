# Progresso do Projeto — HM Finanças

> Documento de acompanhamento do desenvolvimento.
> Atualizar ao final de cada módulo concluído.

---

## Status Atual

| Campo | Valor |
|---|---|
| **Módulo Atual** | Módulo 9 — Notificações |
| **Status** | Finalizado Módulo 9. Notificações e alertas globais implementados. |
| **Última Atualização** | Módulo 9 (Notificações) concluído com agregação de vencimentos de cobranças e promissórias. |

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
- [x] Cards clicáveis que navegam para Dinheiro, Cartões e HMCRED.
- [x] Empty state elegante para novos usuários.

### ✅ Módulo 5: HMCRED
- [x] CRUD de operações de crédito (empréstimos próprios).
- [x] Regras de limites, capital disponível e capital emprestado.
- [x] Sincronização automática do valor total para o Patrimônio.
- [x] Regras de Segurança criadas no Firebase (`firestore.rules`).

### ✅ Módulo 6A: Dinheiro (revisado e finalizado)
- [x] CRUD completo: criar, editar e excluir contas (corrente, poupança, caixa, outros).
- [x] Modal de **edição** de conta (nome, tipo e saldo).
- [x] Lançamentos de entrada e saída com validação de saldo insuficiente.
- [x] Card visual de saldo consolidado com ícone decorativo.
- [x] Lista de contas com ícone por tipo, saldo e botões de ação.
- [x] Empty state elegante com ícone e CTA.
- [x] Toasts de sucesso/erro em todas as operações (substituiu alert() nativo).
- [x] Sincronização automática em tempo real com `patrimonio/resumo.dinheiro`.
- [x] Listener onSnapshot — interface atualiza automaticamente sem reload.
- [x] Comentários em português do Brasil em todo o código.

### ✅ Módulo 6B: Cartões (revisado e finalizado)
- [x] CRUD completo: criar, editar e excluir cartões de crédito.
- [x] Modal de **edição** de cartão (nome, limite e vencimento).
- [x] Registrar gasto e pagar fatura com validações de limite.
- [x] Cards de totais: Limite Total, Fatura Atual, Limite Disponível.
- [x] Visual de **cartão físico estilizado** (`.credit-card-visual`): gradiente azul escuro premium, chip dourado decorativo, número fictício, portador e limite.
- [x] Barra de progresso do uso de limite com cores dinâmicas (verde → amarelo → vermelho).
- [x] Empty state elegante com ícone e CTA.
- [x] Toasts de sucesso/erro em todas as operações.
- [x] Sincronização automática em tempo real com `patrimonio/resumo.cartoes`.
- [x] Listener onSnapshot — interface atualiza automaticamente sem reload.
- [x] Comentários em português do Brasil em todo o código.

### ✅ Estilos CSS (components.css) — Módulo 6
- [x] Novos componentes: `.credit-card-wrapper`, `.credit-card-visual`.
- [x] Chip decorativo: `.cc-chip`, `.cc-chip-inner`.
- [x] Tipografia do cartão: `.cc-top-row`, `.cc-bottom-row`, `.cc-number`, `.cc-label`, `.cc-value`.
- [x] Efeito hover com elevação e glow dourado.

### ✅ Segurança Firestore — Módulo 6
- [x] Regra existente `{document=**}` já cobre dinheiro e cartões implicitamente.
- [x] Comentários explícitos adicionados ao `firestore.rules` listando todas as coleções do Módulo 6.
- [x] Garantia: nenhum acesso sem autenticação, cada usuário só acessa seus próprios dados.

---

### ✅ Módulo 7: Clientes e Cobranças
- [x] CRUD de clientes com busca por nome.
- [x] CRUD de cobranças vinculadas a clientes.
- [x] Status automático e manual de cobrança: Pendente, Atrasada, Paga.
- [x] Visão detalhada do cliente (modal com histórico e total em aberto).
- [x] Recálculo automático do valor em aberto do cliente ao alterar cobranças.
- [x] Dashboard de cobranças: KPIs de Total a Receber, Atrasadas e Recebidas.
- [x] Funcionalidade de copiar chave PIX e gerar mensagem pré-preenchida no WhatsApp.
- [x] Comentários no `firestore.rules` (coleções já protegidas pela regra curinga).

---

### ✅ Módulo 8: Promissórias
- [x] CRUD de Promissórias.
- [x] Sincronização do valor investido e lucro estimado.
- [x] Cálculo automático de status usando `obterStatusReal`.

### ✅ Módulo 9: Notificações
- [x] Refatoração de `obterStatusReal` para `calcularStatusVencimento` genérico (`helpers.js`).
- [x] Listener em tempo real sobre coleções `cobrancas` e `promissorias`.
- [x] Tela de Notificações com KPIs agregados (Total Vencido, Vencendo Hoje/Amanhã) e lista detalhada.
- [x] Badge global no ícone de notificações (`app.js`).
- [x] Resumo de notificações no card "Alertas Recentes" do Dashboard (sem exposição de nomes de clientes na tela inicial).

---

## Próximos Passos — Módulo 10: Configurações

### Sugestões para a implementação:
- Ajustes de perfil do usuário.
- Preferências de notificações e sistema.
