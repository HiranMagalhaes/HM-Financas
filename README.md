# HM Finanças

> **Sistema Financeiro e de Crédito Pessoal**
> Controle completo de patrimônio, empréstimos, clientes e cobranças.

---

## Status do Projeto

| Módulo | Status |
|---|---|
| ✅ Módulo 1 — Estrutura Base | **Concluído** |
| ✅ Módulo 2A — Autenticação e Sessão | **Concluído** |
| 🔜 Módulo 2B — Dashboard Real | Próximo |
| ⏳ Módulo 3 — Patrimônio | Planejado |
| ⏳ Módulo 4 — Promissórias | Planejado |
| ⏳ Módulo 5 — Clientes e Cobranças | Planejado |
| ⏳ Módulo 6 — Notificações | Planejado |
| ⏳ Módulo 7 — Configurações | Planejado |

---

## Sobre o Projeto

O **HM Finanças** é um sistema web financeiro e de crédito desenvolvido em HTML, CSS e JavaScript puro, com backend em Firebase.

O sistema oferece:

- 💰 **Controle de patrimônio** — HMCRED, Dinheiro e Cartões
- 📄 **Gestão de promissórias** — empréstimos com cálculo de juros e status
- 👥 **Cadastro de clientes** — histórico de crédito por cliente
- 📱 **Cobranças** — via PIX e WhatsApp com mensagem pré-formatada
- 🔔 **Notificações** — alertas de vencimento às 08:00
- 🌙 **Tema escuro e claro** — interface premium com alternância de tema

---

## Identidade Visual

| Elemento | Detalhes |
|---|---|
| **Tema padrão** | Escuro — fundo `#0A0A0A` (preto/grafite) |
| **Cor de destaque** | Dourado `#C9A84C` — elegante e premium |
| **Cor de sucesso** | Verde `#2ECC71` — apenas para positivos e confirmações |
| **Cor de erro** | Vermelho `#E74C3C` |
| **Fonte de interface** | [Inter](https://fonts.google.com/specimen/Inter) |
| **Fonte da marca** | [Playfair Display](https://fonts.google.com/specimen/Playfair+Display) |
| **Ícones** | Material Symbols Outlined (Google) |

---

## Tecnologias Utilizadas

| Tecnologia | Uso |
|---|---|
| **HTML5** | Estrutura semântica |
| **CSS3 Vanilla** | Estilização com design tokens e variáveis |
| **JavaScript ES6+** | Arquitetura nativa (ES Modules) e lógica da aplicação |
| **Firebase Auth** | Autenticação (SDK Modular v10+) |
| **Firebase Firestore** | Banco de dados NoSQL (SDK Modular v10+) |
| **Firebase Hosting** | Hospedagem (plano Spark) |

> Este projeto não utiliza frameworks JavaScript (sem React, Vue, Angular, etc.)
> e não utiliza frameworks CSS (sem Tailwind, Bootstrap, etc.).

---

## Estrutura de Pastas

```
HM-Financas/
├── index.html              ← Ponto de entrada único
├── styles/                 ← CSS (reset, variáveis, layout, componentes)
├── scripts/
│   ├── app.js              ← Orquestrador principal
│   ├── router.js           ← Roteamento por hash
│   ├── utils/              ← Formatadores, validadores, helpers
│   ├── firebase/           ← Auth e Firestore services
│   └── modules/            ← Um diretório por módulo funcional
├── components/             ← Templates HTML reutilizáveis
├── pages/                  ← Páginas HTML estruturais
├── assets/                 ← Imagens, ícones, logos
└── docs/                   ← Documentação interna do projeto
```

---

## Como Rodar Localmente

Este projeto é HTML/CSS/JS puro — **não precisa de build ou instalação de dependências**.

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/SEU_USUARIO/HM-Financas.git
   cd HM-Financas
   ```

2. **Configure o Firebase** (veja a seção abaixo)

3. **Abra o projeto:**
   - Use a extensão [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) no VS Code, **ou**
   - Abra `index.html` diretamente no navegador

> **Nota:** Sem o Firebase configurado, o sistema roda em modo de demonstração (sem dados reais).

---

## Como Configurar o Firebase

1. Acesse o [Firebase Console](https://console.firebase.google.com)
2. Selecione (ou crie) o projeto **HM Finanças**
3. Ative os serviços: **Authentication** (e-mail/senha) e **Firestore**
4. Em **Configurações do projeto → Aplicativos Web**, copie o objeto `firebaseConfig`
5. No projeto, copie o arquivo de exemplo:
   ```
   scripts/firebase/firebase-config.example.js  →  scripts/firebase/firebase-config.js
   ```
6. Cole suas credenciais reais em `firebase-config.js`
7. No `index.html`, descomente os scripts do Firebase SDK e de configuração
8. Configure as **Firestore Security Rules**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /usuarios/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

> ⚠️ **O arquivo `firebase-config.js` está no `.gitignore`** e nunca deve ser commitado.

---

## Desenvolvimento por Módulos

O projeto é desenvolvido em módulos sequenciais com escopo definido:

| # | Módulo | Entregas principais |
|---|---|---|
| 1 | Estrutura Base | CSS, JS base, Firebase base, documentação |
| 2 | Login | Formulário de auth, Firebase Auth integrado |
| 3 | Dashboard | Painel com cards de resumo financeiro |
| 4 | Patrimônio | HMCRED, Dinheiro, Cartões |
| 5 | Promissórias | CRUD, cálculos, status, histórico |
| 6 | Clientes e Cobranças | Cadastro, PIX, WhatsApp |
| 7 | Notificações | Alertas às 08:00, badges de vencimento |
| 8 | Configurações | Perfil, tema, PIX, polimentos |

---

## Checklist do Módulo 1

- [x] `.gitignore` — credenciais e arquivos de SO excluídos
- [x] `index.html` — ponto de entrada semântico com splash screen
- [x] Sistema de design tokens completo (dark + light) em `variables.css`
- [x] Layout responsivo com sidebar, header e área de conteúdo
- [x] Biblioteca de componentes: botões, inputs, cards, badges, tabelas, modais, toasts
- [x] Suporte a alternância de tema (escuro/claro)
- [x] Roteador por hash com todas as rotas mapeadas
- [x] Utilitários: formatação de moeda, data, CPF; validação de formulários
- [x] Base do Firebase: configuração, inicialização, Auth service, Firestore service
- [x] Refatoração da arquitetura para **JavaScript Modular Nativo (ES Modules)**
- [x] Documentação interna completa em `docs/`
- [x] README profissional para o GitHub

---

## Próximos Passos

O **Módulo 2B** implementará:

1. Integração real do Dashboard com o Firestore
2. Cálculo de métricas e totalizadores
3. Skeleton loaders para estado de carregamento

---

## Observações do Projeto

- 🔒 Sistema de uso privado — não há área pública ou cadastro aberto
- 📱 Responsivo — funciona em desktop e mobile
- 💾 Persistência offline — Firestore cache local habilitado
- 🎨 Stack intencionalmente simples — HTML + CSS + JS puro + Firebase
- 📝 Todo código importante comentado em português do Brasil

---

*HM Finanças — Sistema Financeiro e de Crédito Pessoal*
