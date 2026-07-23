# Regras de Negócio — Resumo HM Finanças

> Resumo das regras de negócio aprovadas para cada módulo do sistema.
> Este documento serve como referência durante o desenvolvimento.
> Regras podem ser expandidas, mas não alteradas sem aprovação.

---

## Login e Autenticação

- Autenticação exclusivamente por **e-mail e senha** (Firebase Auth)
- **Sem** provedores externos (Google, Facebook, etc.)
- Recuperação de senha via e-mail (link do Firebase)
- Sessão persistida automaticamente — usuário não precisa logar toda vez
- Usuário não autenticado é redirecionado para a tela de login automaticamente
- Somente um usuário administrador (sistema não tem múltiplos papéis por ora)
- Campos obrigatórios na tela de login: e-mail + senha
- Mensagens de erro em português, amigáveis e claras

---

## Dashboard

- Exibir **visão geral financeira** ao acessar o sistema após login
- Cards principais:
  - **Saldo Total** — soma de todo o patrimônio disponível
  - **Em Promissórias** — valor total emprestado em aberto
  - **Lucro Estimado** — lucro projetado com base nas taxas das promissórias
  - **Cobranças Pendentes** — quantidade de cobranças em aberto
- Atividades recentes (promissórias e movimentações mais recentes)
- O Dashboard não deve expor nomes de clientes em destaque público (privacidade)
- Atualização dos dados em tempo real via Firestore listeners

---

## Patrimônio

- O patrimônio total é dividido em três subcategorias:
  - **HMCRED** — crédito próprio disponível para emprestar
  - **Dinheiro** — dinheiro físico ou em conta disponível
  - **Cartões** — saldo disponível em cartões de crédito/débito
- O saldo total do patrimônio é a soma dessas três categorias
- Possibilidade de lançar entradas e saídas em cada categoria
- Histórico de movimentações por categoria

---

## HMCRED

- Representa o capital próprio disponível para empréstimos
- Ao emprestar via promissória, o valor é debitado do HMCRED
- Ao receber o pagamento, o valor retorna ao HMCRED (+ juros/lucro)
- Registrar: valor disponível, valor emprestado, valor a receber

---

## Dinheiro

- Dinheiro físico ou em conta corrente pessoal
- Registrar entradas (depósitos, recebimentos) e saídas (gastos, transferências)
- Histórico de movimentações com data e descrição
- Saldo exibido em tempo real

---

## Cartões

- Registrar cada cartão com: nome, limite total, limite disponível, data de fechamento
- Controlar gastos por cartão
- Exibir limite utilizado e disponível
- Não há integração com APIs bancárias — lançamentos manuais

---

## Promissórias

- Cada promissória representa um empréstimo realizado para um cliente
- Dados obrigatórios:
  - Cliente (nome ou referência)
  - Valor emprestado (principal)
  - Taxa de juros (% ao mês ou ao período)
  - Data de emissão
  - Data de vencimento
  - Parcelas (quantidade e valor)
- O sistema deve calcular automaticamente:
  - Valor total a receber (principal + juros)
  - Lucro estimado
  - Status da promissória (em aberto, paga, parcialmente paga, vencida)
- Status possíveis: **Em aberto** | **Paga** | **Parcial** | **Vencida** | **Renegociada**
- Ao registrar pagamento, atualizar o saldo do HMCRED automaticamente
- Histórico completo de pagamentos por promissória

---

## Clientes

- Cada cliente tem: nome, telefone (WhatsApp), CPF (opcional), observações
- Um cliente pode ter múltiplas promissórias
- Listagem de clientes com filtros (nome, status de dívida)
- Perfil do cliente com histórico de promissórias
- **Não expor dados de clientes** fora do contexto autenticado do sistema

---

## Cobranças

- O sistema deve facilitar o envio de cobranças por dois canais:
  - **PIX** — exibir chave PIX para o cliente copiar
  - **WhatsApp** — gerar link `wa.me/` com mensagem pré-formatada
- A mensagem de WhatsApp deve incluir: valor, data de vencimento e instrução de pagamento
- A mensagem não deve expor informações sensíveis desnecessárias
- Registro de cobranças enviadas com data e canal utilizado
- Marcar cobrança como enviada para controle

---

## Notificações

- **Horário fixo**: Notificações enviadas às **08:00** (configurável no futuro)
- **Foco no total**: A notificação deve informar o total de cobranças pendentes, não os nomes dos clientes
  - ✅ Correto: "Você tem 3 cobranças vencidas totalizando R$ 1.500,00."
  - ❌ Incorreto: "João Silva deve R$ 500,00. Maria Souza deve R$ 300,00..."
- Tipos de alertas:
  - Promissórias vencendo hoje
  - Promissórias já vencidas
  - Promissórias vencendo nos próximos 3 dias
- Notificações exibidas dentro do sistema (badge no ícone de sino)
- **Módulo 7**: Verificar viabilidade de notificações push via Service Worker

---

## Configurações

- Dados do usuário/conta: nome de exibição
- Preferências de tema: escuro / claro
- Chave PIX para uso nas cobranças
- Configurações de notificação (horário, ativar/desativar)
- Alterar senha (via Firebase Auth)
- (Futuro) Export de dados em formato CSV/PDF

---

## Observações Gerais

- **Privacidade**: O sistema é de uso privado. Nenhum dado é compartilhado publicamente.
- **Sem multi-usuário**: Por ora, apenas um usuário administrador.
- **Plano Spark**: Sem Firebase Storage ou Functions — usar apenas Auth + Firestore.
- **Offline**: Habilitar persistência local do Firestore para funcionamento com conexão instável.
- **Responsividade**: O sistema deve funcionar em desktop e mobile.
- **Acessibilidade**: Suporte básico a teclado e leitores de tela nos componentes principais.
