# Estrutura de Pastas — HM Finanças

> Documento de referência rápida para localização de arquivos.

```
HM-Financas/
│
├── index.html                    ← Ponto de entrada único da aplicação
├── README.md                     ← Documentação pública do GitHub
├── .gitignore                    ← Arquivos ignorados pelo Git (ex: firebase-config.js)
├── firestore.rules               ← Regras de segurança de banco de dados do Firebase Firestore
│
├── docs/                         ← Documentação do projeto
│   ├── briefing.md               ← Documento original com os requisitos do cliente
│   ├── progresso-do-projeto.md   ← Checklist de módulos concluídos e pendentes
│   └── estrutura-de-pastas.md    ← Este arquivo
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
│   ├── components.css            ← Botões, cards, tabelas, forms, modais, badges
│   └── themes.css                ← Variáveis específicas para temas dark/light, print
│
├── scripts/                      ← Lógica em JavaScript puro
│   ├── app.js                    ← Inicialização, controle de tema, splash screen, setup layout
│   ├── router.js                 ← Roteador vanilla SPA baseado em Hash (#/)
│   │
│   ├── firebase/                 ← Integração com Firebase
│   │   ├── firebase-config.js    ← (NÃO COMITADO) Credenciais e inicialização do SDK
│   │   ├── firebase-init.js      ← Lógica de instanciar Auth, Firestore, etc
│   │   ├── auth-service.js       ← Métodos de login, logout, observer de estado
│   │   └── firestore-service.js  ← Métodos genéricos de CRUD no Firestore
│   │
│   ├── modules/                  ← Módulos da aplicação (cada pasta é uma tela/funcionalidade)
│   │   ├── auth/
│   │   │   └── index.js          ← ✅ Módulo 2A — Login, Cadastro, Recuperar Senha
│   │   ├── dashboard/
│   │   │   └── index.js          ← ✅ Módulo 3 — Dashboard com KPIs, movimentações, alertas
│   │   ├── patrimonio/
│   │   │   └── index.js          ← ✅ Módulo 4 — Visão consolidada (Ativos e Passivos)
│   │   ├── hmcred/
│   │   │   └── index.js          ← ✅ Módulo 5 — Crédito próprio (HMCRED)
│   │   ├── dinheiro/             ← Módulo futuro
│   │   ├── promissorias/         ← Módulo futuro
│   │   ├── cartoes/              ← Módulo futuro
│   │   ├── clientes/             ← Módulo futuro
│   │   ├── cobrancas/            ← Módulo futuro
│   │   └── configuracoes/        ← Módulo futuro
│   │
│   ├── utils/                    ← Funções auxiliares (Helpers)
│   │   ├── formatters.js         ← Máscaras de CPF, moeda, telefone, datas
│   │   ├── validators.js         ← Lógica de validação de formulários
│   │   └── helpers.js            ← Toasts, manipulação genérica de DOM
```
