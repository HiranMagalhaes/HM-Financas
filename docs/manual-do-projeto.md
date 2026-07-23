# Manual do Projeto — HM Finanças

> Documento de referência oficial para o desenvolvimento e manutenção do sistema.
> Todos os desenvolvedores devem ler e seguir este documento.

---

## 1. Visão Geral

**HM Finanças** é um sistema financeiro e de crédito pessoal desenvolvido como aplicação web.
O objetivo é fornecer uma plataforma elegante, funcional e segura para controle de:

- Patrimônio pessoal (dinheiro, cartões, HMCRED)
- Empréstimos via promissórias
- Gestão de clientes e cobranças
- Notificações e alertas financeiros

O sistema é de uso privado, acessado via navegador, e utiliza Firebase como backend.

---

## 2. Identidade Visual Oficial

| Elemento | Valor |
|---|---|
| **Tema padrão** | Escuro (dark) |
| **Fundo principal** | `#0A0A0A` — preto/grafite |
| **Cor de destaque** | `#C9A84C` — dourado vibrante |
| **Cor de sucesso** | `#2ECC71` — verde esmeralda |
| **Cor de erro** | `#E74C3C` — vermelho |
| **Fonte de interface** | Inter (Google Fonts) |
| **Fonte da marca** | Playfair Display (Google Fonts) |
| **Tema claro** | Fundo `#F4F4F6`, dourado suave `#B8922A` |

### Regras de identidade visual

- ✅ Dourado como cor principal de destaque (botões, bordas ativas, ícones em destaque)
- ✅ Verde apenas para sucesso, confirmação e valores positivos
- ✅ Vermelho apenas para erros, alertas críticos e valores negativos
- ✅ Interface premium: hierarquia visual clara, espaçamento generoso, tipografia elegante
- ❌ Não usar cores genéricas (azul padrão, vermelho puro, verde puro sem contexto)
- ❌ Não exagerar em efeitos visuais — sobriedade é premium
- ❌ Não trocar a identidade visual sem aprovação explícita

---

## 3. Tecnologias Oficiais do Projeto

| Tecnologia | Papel |
|---|---|
| **HTML5** | Estrutura semântica das páginas |
| **CSS3 (Vanilla)** | Estilização — sem frameworks CSS |
| **JavaScript (Vanilla ES6+)** | Lógica da aplicação — sem frameworks JS |
| **Firebase Authentication** | Login por e-mail e senha |
| **Firebase Firestore** | Banco de dados em tempo real |
| **Firebase Hosting** | Hospedagem (plano Spark) |
| **Google Fonts** | Inter + Playfair Display |
| **Material Symbols** | Ícones da interface |

### Regra absoluta de stack

> **Não trocar a stack sem autorização explícita do responsável pelo projeto.**
> Este projeto não usa React, Vue, Angular, TypeScript, Tailwind, Flutter, ou qualquer outro framework.
> Qualquer sugestão de mudança de tecnologia deve ser discutida e aprovada antes de implementar.

---

## 4. Regra Obrigatória de Comentários

Todo código importante deve ter comentários em **português do Brasil**, de forma simples e objetiva.

### O que comentar obrigatoriamente

- Toda função pública (parâmetros, retorno, propósito)
- Todo bloco de lógica não óbvia
- Todo arquivo (cabeçalho explicando o papel do arquivo)
- Toda variável de configuração importante
- Todo `TODO`, `FIXME` ou `HACK`

### Exemplo de comentário correto

```javascript
/**
 * Formata um valor numérico como moeda brasileira (R$).
 * Retorna "R$ 0,00" para valores nulos ou inválidos.
 *
 * @param {number} valor
 * @returns {string}
 */
function formatarMoeda(valor) { ... }
```

### O que NÃO fazer

```javascript
// formata moeda
function fmt(v) { ... }  // ❌ Nome inespecífico, sem JSDoc
```

---

## 5. Padrão de Organização de Arquivos

```
HM-Financas/
  index.html          ← Ponto de entrada único
  styles/             ← Todo CSS do sistema
  scripts/            ← Todo JavaScript do sistema
    utils/            ← Funções auxiliares genéricas
    firebase/         ← Integração com Firebase
    modules/          ← Um subdiretório por módulo funcional
  components/         ← Templates HTML de componentes reutilizáveis
  pages/              ← Páginas HTML estruturais
  assets/             ← Imagens, ícones, logos
  docs/               ← Documentação interna
```

### Regras de organização

- Um arquivo por responsabilidade — sem misturar estilos com scripts
- Utilitários genéricos ficam em `scripts/utils/` — nunca embutidos em módulos
- Lógica de Firebase fica exclusivamente em `scripts/firebase/`
- Módulos novos sempre em `scripts/modules/{nome}/`
- Nunca criar arquivos soltos na raiz (exceto `index.html`, `README.md`, `.gitignore`)

---

## 6. Desenvolvimento por Módulos

O projeto é desenvolvido em módulos sequenciais e incrementais.
Cada módulo tem escopo definido e aprovado antes de iniciar.

| Módulo | Escopo |
|---|---|
| **Módulo 1** | Estrutura base, CSS, JS, Firebase base, documentação |
| **Módulo 2** | Tela de login e autenticação completa |
| **Módulo 3** | Dashboard com visão geral financeira |
| **Módulo 4** | Patrimônio: HMCRED, Dinheiro, Cartões |
| **Módulo 5** | Promissórias: CRUD, cálculos e status |
| **Módulo 6** | Clientes e Cobranças |
| **Módulo 7** | Notificações automáticas |
| **Módulo 8** | Configurações e refinamentos finais |

### Regra de escopo

> Nunca implementar funcionalidades de módulos futuros no módulo atual.
> Isso garante entregas organizadas, revisáveis e sem débito técnico.

---

## 7. Regra de Consistência Visual

- Toda nova tela deve respeitar o sistema de design tokens em `styles/variables.css`
- Nunca usar cores ou tamanhos hardcoded — sempre usar variáveis CSS
- Todo novo componente deve ser adicionado a `styles/components.css`
- Nunca criar estilos inline no JavaScript ou HTML (exceto ajustes mínimos e justificados)

---

## 8. Regra de Segurança

- O arquivo `firebase-config.js` está no `.gitignore` e nunca deve ser commitado
- Usar sempre `firebase-config.example.js` como template para novos desenvolvedores
- As Firestore Security Rules devem garantir isolamento por usuário (`/usuarios/{uid}/`)
- Nunca expor dados de um usuário para outro
