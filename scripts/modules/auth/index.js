/**
 * HM Finanças — Módulo: auth
 * Lógica das telas de Login, Cadastro e Recuperação de Senha.
 */
'use strict';

import { AuthService } from '../../firebase/auth-service.js';
import { validarEmail, validarSenha, validarConfirmacaoSenha, exibirErrosFormulario } from '../../utils/validators.js';
import { mostrarToast } from '../../utils/helpers.js';

export const AuthModule = {
  
  // ─── LOGIN ─────────────────────────────────────────────────────────────
  
  renderLogin(container) {
    container.innerHTML = `
      <div class="auth-box">
        <div class="auth-header">
          <div class="auth-logo"><span class="logo-hm">HM</span></div>
          <h2 class="auth-title">Entrar</h2>
          <p class="auth-subtitle">Acesse o sistema financeiro</p>
        </div>
        
        <form id="form-login" novalidate>
          <div class="form-group">
            <label for="email" class="form-label">E-mail</label>
            <input type="email" id="email" name="email" class="form-input" placeholder="seu@email.com" autocomplete="username">
          </div>
          
          <div class="form-group">
            <label for="senha" class="form-label">Senha</label>
            <input type="password" id="senha" name="senha" class="form-input" placeholder="••••••••" autocomplete="current-password">
          </div>
          
          <div style="display: flex; justify-content: flex-end; margin-bottom: var(--space-6);">
            <a href="#recuperar-senha" class="text-gold" style="font-size: var(--text-sm); font-weight: var(--font-medium);">Esqueceu a senha?</a>
          </div>
          
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-bottom: var(--space-4);" id="btn-submit-login">
            <span class="material-symbols-outlined">login</span>
            Entrar
          </button>
          
          <button type="button" class="btn btn-secondary" style="width: 100%; margin-bottom: var(--space-6); background: white; color: black; border: 1px solid #ddd;" id="btn-google-login">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style="width: 18px; margin-right: 8px; vertical-align: middle;">
            Entrar com Google
          </button>
          
          <p style="text-align: center; font-size: var(--text-sm); color: var(--text-muted);">
            Não tem uma conta? <a href="#cadastro" class="text-gold" style="font-weight: var(--font-medium);">Criar conta</a>
          </p>
        </form>
      </div>
    `;

    const form = document.getElementById('form-login');
    const btnSubmit = document.getElementById('btn-submit-login');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = form.email.value;
      const senha = form.senha.value;
      
      // Validação
      const valEmail = validarEmail(email);
      const valSenha = validarSenha(senha);
      
      const temErros = !exibirErrosFormulario(form, {
        email: valEmail.erro,
        senha: valSenha.erro
      });
      
      if (temErros) return;
      
      // Estado de loading
      const textoOriginal = btnSubmit.innerHTML;
      btnSubmit.innerHTML = '<span class="material-symbols-outlined spinning">sync</span> Entrando...';
      btnSubmit.disabled = true;
      
      // Chamada Firebase
      const result = await AuthService.login(email, senha);
      
      if (result.sucesso) {
        mostrarToast('Login realizado com sucesso', 'success');
        // O roteador ouvirá a mudança de estado e fará o redirect na recarga de página ou mudando hash
        window.location.hash = 'dashboard';
        window.location.reload(); // Recarrega para inicializar com layout base
      } else {
        mostrarToast(result.erro, 'error');
        btnSubmit.innerHTML = textoOriginal;
        btnSubmit.disabled = false;
      }
    });

    const btnGoogle = document.getElementById('btn-google-login');
    btnGoogle.addEventListener('click', async () => {
      const textoOriginal = btnGoogle.innerHTML;
      btnGoogle.innerHTML = '<span class="material-symbols-outlined spinning">sync</span> Entrando...';
      btnGoogle.disabled = true;

      const result = await AuthService.loginComGoogle();
      if (result.sucesso) {
        mostrarToast('Login realizado com sucesso', 'success');
        window.location.hash = 'dashboard';
        window.location.reload();
      } else {
        mostrarToast(result.erro, 'error');
        btnGoogle.innerHTML = textoOriginal;
        btnGoogle.disabled = false;
      }
    });
  },

  // ─── CADASTRO ──────────────────────────────────────────────────────────
  
  renderCadastro(container) {
    container.innerHTML = `
      <div class="auth-box">
        <div class="auth-header">
          <div class="auth-logo"><span class="logo-hm">HM</span></div>
          <h2 class="auth-title">Criar Conta</h2>
          <p class="auth-subtitle">Crie seu acesso ao sistema</p>
        </div>
        
        <form id="form-cadastro" novalidate>
          <div class="form-group">
            <label for="email" class="form-label">E-mail</label>
            <input type="email" id="email" name="email" class="form-input" placeholder="seu@email.com" autocomplete="username">
          </div>
          
          <div class="form-group">
            <label for="senha" class="form-label">Senha</label>
            <input type="password" id="senha" name="senha" class="form-input" placeholder="Mínimo 6 caracteres" autocomplete="new-password">
          </div>
          
          <div class="form-group" style="margin-bottom: var(--space-6);">
            <label for="confirmaSenha" class="form-label">Confirmar Senha</label>
            <input type="password" id="confirmaSenha" name="confirmaSenha" class="form-input" placeholder="Repita a senha" autocomplete="new-password">
          </div>
          
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-bottom: var(--space-4);" id="btn-submit-cadastro">
            <span class="material-symbols-outlined">person_add</span>
            Criar Conta
          </button>
          
          <button type="button" class="btn btn-secondary" style="width: 100%; margin-bottom: var(--space-6); background: white; color: black; border: 1px solid #ddd;" id="btn-google-cadastro">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style="width: 18px; margin-right: 8px; vertical-align: middle;">
            Criar com Google
          </button>
          
          <p style="text-align: center; font-size: var(--text-sm); color: var(--text-muted);">
            Já tem uma conta? <a href="#login" class="text-gold" style="font-weight: var(--font-medium);">Fazer login</a>
          </p>
        </form>
      </div>
    `;

    const form = document.getElementById('form-cadastro');
    const btnSubmit = document.getElementById('btn-submit-cadastro');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = form.email.value;
      const senha = form.senha.value;
      const confirmaSenha = form.confirmaSenha.value;
      
      // Validação
      const valEmail = validarEmail(email);
      const valSenha = validarSenha(senha);
      const valConfirma = validarConfirmacaoSenha(senha, confirmaSenha);
      
      const temErros = !exibirErrosFormulario(form, {
        email: valEmail.erro,
        senha: valSenha.erro,
        confirmaSenha: valConfirma.erro
      });
      
      if (temErros) return;
      
      // Estado de loading
      const textoOriginal = btnSubmit.innerHTML;
      btnSubmit.innerHTML = '<span class="material-symbols-outlined spinning">sync</span> Criando...';
      btnSubmit.disabled = true;
      
      // Chamada Firebase
      const result = await AuthService.criarConta(email, senha);
      
      if (result.sucesso) {
        mostrarToast('Conta criada com sucesso!', 'success');
        window.location.hash = 'dashboard';
        window.location.reload();
      } else {
        mostrarToast(result.erro, 'error');
        btnSubmit.innerHTML = textoOriginal;
        btnSubmit.disabled = false;
      }
    });

    const btnGoogle = document.getElementById('btn-google-cadastro');
    btnGoogle.addEventListener('click', async () => {
      const textoOriginal = btnGoogle.innerHTML;
      btnGoogle.innerHTML = '<span class="material-symbols-outlined spinning">sync</span> Criando...';
      btnGoogle.disabled = true;

      const result = await AuthService.loginComGoogle(); // Google Auth handles both signup and login
      if (result.sucesso) {
        mostrarToast('Conta criada com sucesso!', 'success');
        window.location.hash = 'dashboard';
        window.location.reload();
      } else {
        mostrarToast(result.erro, 'error');
        btnGoogle.innerHTML = textoOriginal;
        btnGoogle.disabled = false;
      }
    });
  },

  // ─── RECUPERAR SENHA ───────────────────────────────────────────────────
  
  renderRecuperarSenha(container) {
    container.innerHTML = `
      <div class="auth-box">
        <div class="auth-header">
          <div class="auth-logo"><span class="logo-hm">HM</span></div>
          <h2 class="auth-title">Recuperar Senha</h2>
          <p class="auth-subtitle">Enviaremos um link para redefinir sua senha</p>
        </div>
        
        <form id="form-recuperar" novalidate>
          <div class="form-group" style="margin-bottom: var(--space-6);">
            <label for="email" class="form-label">E-mail</label>
            <input type="email" id="email" name="email" class="form-input" placeholder="seu@email.com">
          </div>
          
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-bottom: var(--space-6);" id="btn-submit-recuperar">
            <span class="material-symbols-outlined">send</span>
            Enviar Link
          </button>
          
          <p style="text-align: center; font-size: var(--text-sm); color: var(--text-muted);">
            Lembrou a senha? <a href="#login" class="text-gold" style="font-weight: var(--font-medium);">Voltar ao login</a>
          </p>
        </form>
      </div>
    `;

    const form = document.getElementById('form-recuperar');
    const btnSubmit = document.getElementById('btn-submit-recuperar');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = form.email.value;
      
      // Validação
      const valEmail = validarEmail(email);
      
      const temErros = !exibirErrosFormulario(form, { email: valEmail.erro });
      
      if (temErros) return;
      
      // Estado de loading
      const textoOriginal = btnSubmit.innerHTML;
      btnSubmit.innerHTML = '<span class="material-symbols-outlined spinning">sync</span> Enviando...';
      btnSubmit.disabled = true;
      
      // Chamada Firebase
      const result = await AuthService.recuperarSenha(email);
      
      if (result.sucesso) {
        mostrarToast('Link de recuperação enviado para o seu e-mail.', 'success');
        setTimeout(() => {
          window.location.hash = 'login';
        }, 2000);
      } else {
        mostrarToast(result.erro, 'error');
        btnSubmit.innerHTML = textoOriginal;
        btnSubmit.disabled = false;
      }
    });
  }

};
