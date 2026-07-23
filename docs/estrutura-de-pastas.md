# Estrutura de Pastas — HM Finanças

> Guia de referência para organização dos arquivos do projeto.
> Sempre consultar este documento antes de criar arquivos novos.

---

## Árvore Completa

```
HM-Financas/
│
├── index.html                    ← Ponto de entrada único da aplicação
├── README.md                     ← Documentação pública do GitHub
├── .gitignore                    ← Arquivos ignorados pelo Git
│
├── assets/                       ← Recursos estáticos
│   ├── icons/                    ← Ícones SVG ou PNG customizados
│   ├── images/                   ← Imagens gerais (screenshots, fundos)
│   └── logos/                    ← Versões do logo HM Finanças
│
├── styles/                       ← Todo o CSS do sistema
│   ├── reset.css                 ← Reset moderno de estilos de navegador
│   ├── variables.css             ← Design tokens (cores, fontes, espaçamentos)
│   ├── global.css                ← Estilos base globais e utilitários
│   ├── layout.css                ← Estrutura: splash, sidebar, header, main
│   ├── components.css            ← Componentes reutilizáveis: botões, cards, etc.
│   └── themes.css                ← Ajustes finos por tema (dark/light) e print
│
├── scripts/                      ← Todo o JavaScript do sistema
│   ├── app.js                    ← Orquestrador principal (tema, splash, layout)
│   ├── router.js                 ← Roteamento por hash e renderização de telas
│   │
│   ├── utils/                    ← Utilitários genéricos (sem dependências externas)
│   │   ├── helpers.js            ← DOM helpers, toasts, clipboard, debounce
│   │   ├── formatters.js         ← Formatação de moeda, data, CPF, telefone
│   │   └── validators.js         ← Validação de formulários e documentos
│   │
│   ├── firebase/                 ← Integração exclusiva com Firebase
│   │   ├── firebase-config.example.js  ← Template de configuração (commitar)
│   │   ├── firebase-config.js          ← Configuração real (NÃO commitar — .gitignore)
│   │   ├── firebase-init.js            ← Inicialização do app Firebase
│   │   ├── auth-service.js             ← Login, logout, recuperação de senha
│   │   └── firestore-service.js        ← CRUD genérico para todas as coleções
│   │
│   └── modules/                  ← Um diretório por módulo funcional
│       ├── auth/                 ← Módulo de autenticação (login, logout)
│       ├── dashboard/            ← Módulo do painel principal
│       ├── patrimonio/           ← Módulo de patrimônio geral
│       ├── hmcred/               ← Módulo HMCRED (crédito próprio)
│       ├── dinheiro/             ← Módulo de dinheiro em caixa
│       ├── promissorias/         ← Módulo de promissórias e empréstimos
│       ├── cartoes/              ← Módulo de cartões
│       ├── clientes/             ← Módulo de gestão de clientes
│       ├── cobrancas/            ← Módulo de cobranças (PIX + WhatsApp)
│       ├── notificacoes/         ← Módulo de notificações automáticas
│       └── configuracoes/        ← Módulo de configurações do sistema
│
├── components/                   ← Templates HTML de componentes reutilizáveis
│   ├── sidebar.html              ← Sidebar lateral (referência/template)
│   ├── header.html               ← Header superior (referência/template)
│   ├── cards.html                ← Templates de cards
│   └── modals.html               ← Templates de modais
│
├── pages/                        ← Páginas HTML estruturais (referência)
│   ├── login.html                ← Estrutura da tela de login
│   └── dashboard.html            ← Estrutura da tela de dashboard
│
└── docs/                         ← Documentação interna do projeto
    ├── manual-do-projeto.md      ← Manual oficial: stack, visual, regras
    ├── progresso-do-projeto.md   ← Status e histórico de desenvolvimento
    ├── estrutura-de-pastas.md    ← Este arquivo
    └── regras-de-negocio-resumo.md ← Regras de negócio por módulo
```

---

## Responsabilidade de Cada Área

### `styles/`

| Arquivo | O que vai lá |
|---|---|
| `reset.css` | Apenas o reset. Nunca adicionar estilos de componentes aqui. |
| `variables.css` | Todos os tokens de design. Nunca usar cores hardcoded nos outros arquivos. |
| `global.css` | Estilos de elementos HTML nativos (body, h1–h6, a, hr). Utilitários CSS simples. |
| `layout.css` | Splash screen, grid do layout, sidebar, header, main. |
| `components.css` | Todos os componentes de UI reutilizáveis. Novos componentes aqui. |
| `themes.css` | Ajustes visuais finos que diferem entre dark e light. Estilos de print. |

### `scripts/`

| Arquivo | O que vai lá |
|---|---|
| `app.js` | Inicialização, controle de tema, splash screen, layout base. |
| `router.js` | Mapa de rotas, navegação por hash, atualização do menu ativo. |
| `utils/helpers.js` | Funções auxiliares genéricas sem dependência de outros módulos. |
| `utils/formatters.js` | Toda função de formatação de dados para exibição. |
| `utils/validators.js` | Toda função de validação de dados de entrada. |
| `firebase/*.js` | Exclusivo para integração com Firebase. Sem lógica de UI. |
| `modules/{nome}/` | Lógica específica de cada módulo funcional. |

---

## Onde Criar Novos Arquivos

| Tipo de arquivo | Onde colocar |
|---|---|
| Novo componente de UI (CSS) | Adicionar em `styles/components.css` |
| Nova variável de design | Adicionar em `styles/variables.css` |
| Nova função de formatação | Adicionar em `scripts/utils/formatters.js` |
| Nova função de validação | Adicionar em `scripts/utils/validators.js` |
| Novo módulo funcional | Criar pasta em `scripts/modules/{nome}/` |
| Novo serviço Firebase | Criar arquivo em `scripts/firebase/` |
| Novo template HTML | Adicionar em `components/` ou `pages/` |
| Imagem ou logo | Colocar na subpasta correta em `assets/` |
| Documentação interna | Adicionar ou atualizar arquivo em `docs/` |

---

## Regras de Nomeação

- **Arquivos**: `kebab-case` — ex: `auth-service.js`, `firestore-service.js`
- **IDs HTML**: `kebab-case` — ex: `id="btn-login"`, `id="form-nova-promissoria"`
- **Funções JS**: `camelCase` — ex: `formatarMoeda()`, `validarEmail()`
- **Objetos/serviços JS**: `PascalCase` — ex: `AuthService`, `FirestoreService`
- **Variáveis CSS**: `kebab-case` com prefixo semântico — ex: `--color-gold`, `--bg-surface`
- **Classes CSS**: `kebab-case` — ex: `.stat-card`, `.btn-primary`, `.form-input`
