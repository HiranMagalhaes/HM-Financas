/**
 * HM Finanças — validators.js
 * Funções de validação de dados de entrada.
 * Usadas em formulários antes de enviar ao Firestore.
 *
 * Cada função retorna { valido: boolean, erro: string }.
 * "erro" é uma string vazia quando o dado é válido.
 */

'use strict';

/* ───────────────────────────────────────────────────────────────────────────
   VALIDAÇÕES BÁSICAS
─────────────────────────────────────────────────────────────────────────── */

/**
 * Verifica se o campo obrigatório foi preenchido.
 *
 * @param {*} valor
 * @param {string} [nomeCampo='Campo']
 * @returns {{ valido: boolean, erro: string }}
 */
function validarObrigatorio(valor, nomeCampo = 'Campo') {
  const vazio = valor === null || valor === undefined || String(valor).trim() === '';
  return {
    valido: !vazio,
    erro: vazio ? `${nomeCampo} é obrigatório.` : '',
  };
}

/**
 * Valida o comprimento mínimo e máximo de uma string.
 *
 * @param {string} valor
 * @param {number} min
 * @param {number} max
 * @param {string} [nomeCampo='Campo']
 * @returns {{ valido: boolean, erro: string }}
 */
function validarTamanho(valor, min, max, nomeCampo = 'Campo') {
  const tam = String(valor || '').trim().length;
  if (tam < min) return { valido: false, erro: `${nomeCampo} deve ter ao menos ${min} caracteres.` };
  if (tam > max) return { valido: false, erro: `${nomeCampo} deve ter no máximo ${max} caracteres.` };
  return { valido: true, erro: '' };
}


/* ───────────────────────────────────────────────────────────────────────────
   VALIDAÇÕES DE CONTA E AUTENTICAÇÃO
─────────────────────────────────────────────────────────────────────────── */

/**
 * Valida formato de e-mail.
 *
 * @param {string} email
 * @returns {{ valido: boolean, erro: string }}
 */
function validarEmail(email) {
  if (!email || String(email).trim() === '') {
    return { valido: false, erro: 'E-mail é obrigatório.' };
  }
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const valido = regex.test(String(email).trim());
  return {
    valido,
    erro: valido ? '' : 'Formato de e-mail inválido.',
  };
}

/**
 * Valida se a senha atende aos requisitos mínimos.
 * Requisitos: mínimo 6 caracteres (padrão Firebase Auth).
 *
 * @param {string} senha
 * @returns {{ valido: boolean, erro: string }}
 */
function validarSenha(senha) {
  if (!senha || String(senha).trim() === '') {
    return { valido: false, erro: 'Senha é obrigatória.' };
  }
  if (senha.length < 6) {
    return { valido: false, erro: 'A senha deve ter ao menos 6 caracteres.' };
  }
  return { valido: true, erro: '' };
}

/**
 * Valida se a senha de confirmação é igual à senha original.
 *
 * @param {string} senha
 * @param {string} confirmacao
 * @returns {{ valido: boolean, erro: string }}
 */
function validarConfirmacaoSenha(senha, confirmacao) {
  if (senha !== confirmacao) {
    return { valido: false, erro: 'As senhas não conferem.' };
  }
  return { valido: true, erro: '' };
}


/* ───────────────────────────────────────────────────────────────────────────
   VALIDAÇÕES FINANCEIRAS
─────────────────────────────────────────────────────────────────────────── */

/**
 * Valida se o valor monetário é um número positivo maior que zero.
 *
 * @param {number | string} valor
 * @param {string} [nomeCampo='Valor']
 * @returns {{ valido: boolean, erro: string }}
 */
function validarValorPositivo(valor, nomeCampo = 'Valor') {
  const num = parseFloat(String(valor).replace(',', '.'));
  if (isNaN(num)) return { valido: false, erro: `${nomeCampo} deve ser um número válido.` };
  if (num <= 0)   return { valido: false, erro: `${nomeCampo} deve ser maior que zero.` };
  return { valido: true, erro: '' };
}

/**
 * Valida se a taxa de juros está dentro do intervalo permitido.
 *
 * @param {number | string} taxa - Percentual (ex: 10 para 10%)
 * @param {number} [min=0]
 * @param {number} [max=100]
 * @returns {{ valido: boolean, erro: string }}
 */
function validarTaxaJuros(taxa, min = 0, max = 100) {
  const num = parseFloat(String(taxa).replace(',', '.'));
  if (isNaN(num)) return { valido: false, erro: 'Taxa de juros inválida.' };
  if (num < min)  return { valido: false, erro: `A taxa mínima é ${min}%.` };
  if (num > max)  return { valido: false, erro: `A taxa máxima é ${max}%.` };
  return { valido: true, erro: '' };
}

/**
 * Valida se a data informada é uma data válida e não está no passado
 * (útil para datas de vencimento).
 *
 * @param {string} dataStr - Data no formato AAAA-MM-DD
 * @param {boolean} [permitirPassado=true]
 * @returns {{ valido: boolean, erro: string }}
 */
function validarData(dataStr, permitirPassado = true) {
  if (!dataStr) return { valido: false, erro: 'Data é obrigatória.' };

  const data = new Date(dataStr + 'T00:00:00');
  if (isNaN(data.getTime())) return { valido: false, erro: 'Data inválida.' };

  if (!permitirPassado) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (data < hoje) return { valido: false, erro: 'A data não pode ser anterior a hoje.' };
  }

  return { valido: true, erro: '' };
}


/* ───────────────────────────────────────────────────────────────────────────
   VALIDAÇÕES DE DOCUMENTOS
─────────────────────────────────────────────────────────────────────────── */

/**
 * Valida CPF brasileiro (aceita com ou sem formatação).
 * Verifica dígitos verificadores conforme algoritmo oficial.
 *
 * @param {string} cpf
 * @returns {{ valido: boolean, erro: string }}
 */
function validarCPF(cpf) {
  const digitos = String(cpf).replace(/\D/g, '');

  if (digitos.length !== 11) {
    return { valido: false, erro: 'CPF deve ter 11 dígitos.' };
  }

  // Rejeitar CPFs com todos os dígitos iguais (ex: 111.111.111-11)
  if (/^(\d)\1+$/.test(digitos)) {
    return { valido: false, erro: 'CPF inválido.' };
  }

  // Validar dígito verificador
  const calcDigito = (slice, peso) =>
    11 - ((slice.reduce((acc, d, i) => acc + d * (peso - i), 0) % 11) || 0) % 11;

  const nums = digitos.split('').map(Number);
  const d1 = calcDigito(nums.slice(0, 9), 10);
  const d2 = calcDigito(nums.slice(0, 10), 11);

  const valido = d1 === nums[9] && d2 === nums[10];
  return { valido, erro: valido ? '' : 'CPF inválido.' };
}

/**
 * Valida telefone brasileiro (aceita com ou sem formatação).
 * Aceita fixo (10 dígitos) e celular (11 dígitos).
 *
 * @param {string} tel
 * @returns {{ valido: boolean, erro: string }}
 */
function validarTelefone(tel) {
  const digitos = String(tel).replace(/\D/g, '');
  const valido = digitos.length === 10 || digitos.length === 11;
  return {
    valido,
    erro: valido ? '' : 'Telefone deve ter 10 ou 11 dígitos.',
  };
}


/* ───────────────────────────────────────────────────────────────────────────
   VALIDAÇÃO DE FORMULÁRIO COMPLETO
─────────────────────────────────────────────────────────────────────────── */

/**
 * Exibe ou remove mensagens de erro nos campos de um formulário.
 * Procura por elementos com a classe "form-input" e seus grupos "form-group".
 *
 * @param {HTMLFormElement} form - Elemento do formulário
 * @param {Object} erros - Mapa de { nomeCampo: 'mensagem de erro' }
 * @returns {boolean} true se o formulário for válido (sem erros)
 */
function exibirErrosFormulario(form, erros) {
  let formularioValido = true;

  // Limpar erros anteriores
  form.querySelectorAll('.form-input.error').forEach(el => {
    el.classList.remove('error');
  });
  form.querySelectorAll('.form-error').forEach(el => el.remove());

  // Exibir novos erros
  for (const [campo, mensagem] of Object.entries(erros)) {
    if (!mensagem) continue;

    formularioValido = false;
    const input = form.querySelector(`[name="${campo}"], #${campo}`);
    if (!input) continue;

    input.classList.add('error');
    const erroEl = document.createElement('p');
    erroEl.className = 'form-error';
    erroEl.innerHTML = `
      <span class="material-symbols-outlined icon-sm">error</span>
      ${mensagem}
    `;
    input.closest('.form-group')?.appendChild(erroEl) ?? input.after(erroEl);
  }

  return formularioValido;
}

export {
  validarObrigatorio,
  validarTamanho,
  validarEmail,
  validarSenha,
  validarConfirmacaoSenha,
  validarValorPositivo,
  validarTaxaJuros,
  validarData,
  validarCPF,
  validarTelefone,
  exibirErrosFormulario,
};
