# Estrutura de Pastas — HM Finanças

> Documento de referência rápida para localização de arquivos.

```
HM-Financas/
│
├── index.html                    ← Ponto de entrada único da aplicação
├── manifest.json                 ← ✅ PWA: Manifesto Web App (cores, nome, ícones)
├── service-worker.js             ← ✅ PWA: Lógica de cache offline (Network First)
├── README.md                     ← Documentação pública do GitHub
├── .gitignore                    ← Arquivos ignorados pelo Git (ex: firebase-config.js)
├── firestore.rules               ← Regras de segurança de banco de dados do Firebase Firestore
│
├── docs/                         ← Documentação do projeto
│   ├── progresso-do-projeto.md   ← Checklist de módulos concluídos e pendentes
│   ├── estrutura-de-pastas.md    ← Este arquivo
│   ├── manual-do-projeto.md      ← Manual técnico e de negócio do sistema
│   └── regras-de-negocio-resumo.md ← Regras de negócio resumidas por módulo
│
├── assets/                       ← Arquivos estáticos
│   ├── images/                   ← Ícones, logos, imagens de splash screen
│   └── fonts/                    ← Fontes locais (se necessário)
│
├── styles/                       ← Estilos CSS (Vanilla)
│   ├── reset.css                 ← Reset de margens, paddings, box-sizing
│   ├── variables.css             ← Tokens de design (cores, tipografia, espaçamentos, z-index)
│   ├── global.css                ← Estilos base, scrollbar, text-selection, utilitários
│   ├── layout.css                ← Splash screen, app-layout, sidebar, header, main-content
│   ├── components.css            ← Botões, cards, tabelas, forms, modais, badges, cartão físico
│   └── themes.css                ← Variáveis específicas para temas dark/light, print
│
├── scripts/                      ← Lógica em JavaScript puro
│   ├── app.js                    ← Inicialização, controle de tema, splash screen, setup layout
│   ├── router.js                 ← Roteador vanilla SPA baseado em Hash (#/)
│   ├── pwa-register.js           ← ✅ PWA: Registro seguro do Service Worker
│   │
│   ├── firebase/                 ← Integração com Firebase
│   │   ├── firebase-config.js    ← (NÃO COMITADO) Credenciais e inicialização do SDK
│   │   ├── firebase-init.js      ← Lógica de instanciar Auth, Firestore, etc
│   │   ├── auth-service.js       ← Métodos de login, logout, observer de estado
│   │   └── firestore-service.js  ← Métodos genéricos de CRUD no Firestore
│   │
│   ├── modules/                  ← Módulos da aplicação (cada pasta é uma tela/funcionalidade)
│   │   ├── auth/
│   │   │   └── index.js          ← ✅ Módulo 1 — Login, Cadastro, Recuperar Senha
│   │   ├── dashboard/
│   │   │   └── index.js          ← ✅ Módulo 3 — Dashboard com KPIs, movimentações, alertas
│   │   ├── patrimonio/
│   │   │   └── index.js          ← ✅ Módulo 4 — Visão consolidada (Ativos e Passivos)
│   │   ├── hmcred/
│   │   │   └── index.js          ← ✅ Módulo 5 — Crédito próprio (HMCRED)
│   │   ├── dinheiro/
│   │   │   └── index.js          ← ✅ Módulo 6A — Saldos: CRUD completo de contas + lançamentos
│   │   ├── cartoes/
│   │   │   └── index.js          ← ✅ Módulo 6B — Cartões: CRUD completo + visual de cartão físico
│   │   ├── promissorias/         
│   │   │   └── index.js          ← ✅ Módulo 8 — Gestão de promissórias
│   │   ├── clientes/
│   │   │   └── index.js          ← ✅ Módulo 7A — CRUD de clientes e total em aberto
│   │   ├── cobrancas/
│   │   │   └── index.js          ← ✅ Módulo 7B — Gestão de recebimentos, PIX e WhatsApp
│   │   ├── notificacoes/         
│   │   │   └── index.js          ← ✅ Módulo 9 — Agregação de alertas
│   │   ├── configuracoes/        
│   │   │   └── index.js          ← ✅ Módulo 10 — Preferências, Conta e Segurança
│   │
│   ├── utils/                    ← Funções auxiliares (Helpers)
│   │   ├── formatters.js         ← Máscaras de CPF, moeda, telefone, datas
│   │   ├── validators.js         ← Lógica de validação de formulários
│   │   └── helpers.js            ← Toasts, manipulação genérica de DOM
```

## Estrutura de Dados no Firestore

```
/usuarios/{uid}/
│
├── patrimonio/
│   └── resumo              → { hmcred, dinheiro, cartoes, atualizadoEm }
│
├── hmcred/
│   └── configuracao        → { limiteTotal, capitalDisponivel }
├── hmcred_operacoes/
│   └── {id}                → { destino, valorConcedido, valorReceber, taxaJuros, status, ... }
│
├── dinheiro/
│   └── configuracao        → { saldoTotal }
├── dinheiro_contas/
│   └── {id}                → { nome, tipo, saldo, criadoEm, atualizadoEm }
│
├── cartoes/
│   └── configuracao        → { limiteTotal, valorUsado, limiteDisponivel }
├── configuracoes/
│   └── preferencias        → { temaPreferido, ocultarValoresPorPadrao, notificacoesAtivas }
```

## Convenções Importantes

- **Coleções**: Sempre em snake_case, sem acento (ex: `dinheiro_contas`, `cartoes_lista`)
- **Documentos únicos por módulo**: Sempre com ID `configuracao` (ex: `dinheiro/configuracao`)
- **FirestoreService**: Todas as coleções ficam sob `/usuarios/{uid}/` — o serviço resolve isso automaticamente
- **Listener em tempo real**: Todos os módulos CRUD usam `FirestoreService.escutar()` (onSnapshot)
- **Sincronização de Patrimônio**: Sempre via `salvar('patrimonio', 'resumo', {...})` com merge
