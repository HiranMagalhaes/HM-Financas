/**
 * HM Finanças — pwa-register.js
 * Script simples para verificar o suporte a Service Workers no navegador
 * e registrá-lo sem bloquear o carregamento do app principal.
 */

'use strict';

if ('serviceWorker' in navigator) {
  // Aguardamos o evento 'load' para garantir que o SW seja registrado 
  // apenas após a página estar totalmente carregada, priorizando a performance.
  window.addEventListener('load', async () => {
    try {
      // Registrando o Service Worker na raiz (./service-worker.js)
      // para que seu escopo (scope) cubra toda a aplicação.
      const registration = await navigator.serviceWorker.register('./service-worker.js');
      console.log('[PWA] Service Worker registrado com sucesso. Escopo:', registration.scope);
    } catch (erro) {
      // Se falhar (ex: por não estar em HTTPS ou localhost), apenas logamos.
      // O app continuará funcionando normalmente na web.
      console.error('[PWA] Falha ao registrar o Service Worker:', erro);
    }
  });
} else {
  console.log('[PWA] Navegador não suporta Service Workers.');
}
