/**
 * HM Finanças — firebase-config.example.js
 *
 * ATENÇÃO: Este arquivo é apenas um EXEMPLO de configuração.
 * NÃO copie este arquivo com as chaves reais para o repositório.
 *
 * COMO USAR:
 *   1. Faça uma cópia deste arquivo e renomeie para: firebase-config.js
 *   2. Preencha os campos abaixo com as chaves reais do seu projeto Firebase.
 *   3. O arquivo firebase-config.js está no .gitignore e NÃO será enviado ao GitHub.
 *   4. No index.html, descomente o script que carrega firebase-config.js.
 *
 * ONDE ENCONTRAR AS CHAVES:
 *   → Acesse: https://console.firebase.google.com
 *   → Selecione o projeto HM Finanças
 *   → Configurações do projeto (ícone de engrenagem)
 *   → Seção "Seus aplicativos" → Aplicativo Web
 *   → Copie o objeto firebaseConfig
 */

// Configuração do Firebase — preencher com os dados reais do projeto
const firebaseConfig = {
  apiKey:            "COLE_AQUI_SUA_API_KEY",
  authDomain:        "COLE_AQUI_SEU_AUTH_DOMAIN",       // ex: hm-financas.firebaseapp.com
  projectId:         "COLE_AQUI_SEU_PROJECT_ID",         // ex: hm-financas
  storageBucket:     "COLE_AQUI_SEU_STORAGE_BUCKET",    // ex: hm-financas.appspot.com
  messagingSenderId: "COLE_AQUI_SEU_MESSAGING_SENDER_ID",
  appId:             "COLE_AQUI_SEU_APP_ID",
};

// Exporta a configuração para ser usada em firebase-init.js
// (não usar 'export' pois não usamos módulos ES6 — a variável fica global via script tag)
window._firebaseConfig = firebaseConfig;
