/**
 * HM Finanças — formatters.js
 * Funções de formatação de dados para exibição na interface.
 * Cobre moeda, datas, percentuais, CPF/CNPJ e outros formatos do sistema.
 *
 * Todas as funções usam o locale pt-BR como padrão.
 */

'use strict';

/* ───────────────────────────────────────────────────────────────────────────
   MOEDA
─────────────────────────────────────────────────────────────────────────── */

/**
 * Formata um número como moeda brasileira (R$).
 * Exibe "R$ 0,00" para valores nulos/indefinidos.
 *
 * @param {number | null | undefined} valor
 * @param {boolean} [exibirSinal=false] - Se true, exibe + para valores positivos
 * @returns {string} Ex: "R$ 1.234,56"
 */
function formatarMoeda(valor, exibirSinal = false) {
  if (valor === null || valor === undefined || isNaN(valor)) {
    return 'R$ 0,00';
  }

  const formatado = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);

  if (exibirSinal && valor > 0) return `+${formatado}`;
  return formatado;
}

/**
 * Formata um número como moeda e aplica cor via classe CSS.
 * Retorna um span HTML colorido conforme o valor ser positivo ou negativo.
 *
 * @param {number} valor
 * @returns {string} HTML com span colorido
 */
function formatarMoedaColorida(valor) {
  const classe = valor >= 0 ? 'text-success' : 'text-danger';
  const sinal = valor > 0 ? '+' : '';
  return `<span class="${classe}">${sinal}${formatarMoeda(valor)}</span>`;
}

/**
 * Converte string de moeda formatada de volta para número.
 * Ex: "R$ 1.234,56" → 1234.56
 *
 * @param {string} texto
 * @returns {number}
 */
function parseMoeda(texto) {
  if (!texto) return 0;
  return parseFloat(
    texto
      .replace(/[R$\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
  ) || 0;
}


/* ───────────────────────────────────────────────────────────────────────────
   PERCENTUAL
─────────────────────────────────────────────────────────────────────────── */

/**
 * Formata um número como percentual.
 *
 * @param {number} valor - Ex: 2.5 para 2,50%
 * @param {number} [casasDecimais=2]
 * @returns {string} Ex: "2,50%"
 */
function formatarPercentual(valor, casasDecimais = 2) {
  if (valor === null || valor === undefined || isNaN(valor)) return '0,00%';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casasDecimais,
    maximumFractionDigits: casasDecimais,
  }).format(valor) + '%';
}


/* ───────────────────────────────────────────────────────────────────────────
   DATAS
─────────────────────────────────────────────────────────────────────────── */

/**
 * Formata uma data no padrão brasileiro DD/MM/AAAA.
 * Strings no formato "AAAA-MM-DD" são tratadas como datas locais para evitar
 * o deslocamento de fuso (UTC-3) que causaria exibição do dia anterior.
 *
 * @param {Date | string | number} data - Data a formatar
 * @returns {string} Ex: "23/07/2026"
 */
function formatarData(data) {
  if (!data) return '—';
  let d;
  // Strings "AAAA-MM-DD" (sem hora) são interpretadas pelo JS como UTC midnight.
  // No fuso UTC-3 (Brasília) isso resultaria no dia anterior. Parse manual corrige isso.
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
    const [ano, mes, dia] = data.split('-').map(Number);
    d = new Date(ano, mes - 1, dia);
  } else {
    d = new Date(data);
  }
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

/**
 * Formata data e hora no padrão brasileiro.
 *
 * @param {Date | string | number} data
 * @returns {string} Ex: "23/07/2026 às 14:30"
 */
function formatarDataHora(data) {
  if (!data) return '—';
  const d = new Date(data);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d).replace(',', ' às');
}

/**
 * Retorna a data em formato relativo ao momento atual.
 * Ex: "há 2 dias", "há 3 horas", "agora há pouco"
 *
 * @param {Date | string | number} data
 * @returns {string}
 */
function formatarDataRelativa(data) {
  if (!data) return '—';
  const d = new Date(data);
  if (isNaN(d.getTime())) return '—';

  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const agora = Date.now();
  const diff = d.getTime() - agora; // Negativo para o passado

  const segundos = diff / 1000;
  const minutos  = segundos / 60;
  const horas    = minutos / 60;
  const dias     = horas / 24;

  if (Math.abs(dias) >= 1)    return rtf.format(Math.round(dias), 'day');
  if (Math.abs(horas) >= 1)   return rtf.format(Math.round(horas), 'hour');
  if (Math.abs(minutos) >= 1) return rtf.format(Math.round(minutos), 'minute');
  return 'agora';
}

/**
 * Retorna a data atual formatada como AAAA-MM-DD.
 * Útil para preencher inputs do tipo date.
 *
 * @returns {string} Ex: "2026-07-23"
 */
function dataHojeISO() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Calcula a diferença em dias entre duas datas.
 * Valor negativo indica que a dataFinal já passou.
 *
 * @param {Date | string} dataInicio
 * @param {Date | string} dataFinal
 * @returns {number} Diferença em dias
 */
function diferencaEmDias(dataInicio, dataFinal) {
  const ms = new Date(dataFinal) - new Date(dataInicio);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}


/* ───────────────────────────────────────────────────────────────────────────
   DOCUMENTOS
─────────────────────────────────────────────────────────────────────────── */

/**
 * Formata um CPF (apenas números → máscara XXX.XXX.XXX-XX).
 *
 * @param {string} cpf - Apenas dígitos (11 caracteres)
 * @returns {string} CPF formatado ou string original se inválido
 */
function formatarCPF(cpf) {
  const digitos = String(cpf).replace(/\D/g, '');
  if (digitos.length !== 11) return cpf;
  return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Formata um telefone/celular brasileiro (apenas números → máscara).
 * Suporta 10 dígitos (fixo) e 11 dígitos (celular).
 *
 * @param {string} tel - Apenas dígitos
 * @returns {string} Telefone formatado
 */
function formatarTelefone(tel) {
  const digitos = String(tel).replace(/\D/g, '');
  if (digitos.length === 11) {
    return digitos.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (digitos.length === 10) {
    return digitos.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return tel;
}


/* ───────────────────────────────────────────────────────────────────────────
   NÚMEROS
─────────────────────────────────────────────────────────────────────────── */

/**
 * Formata um número com separador de milhar.
 *
 * @param {number} valor
 * @param {number} [casasDecimais=0]
 * @returns {string} Ex: "1.234" ou "1.234,56"
 */
function formatarNumero(valor, casasDecimais = 0) {
  if (isNaN(valor)) return '0';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casasDecimais,
    maximumFractionDigits: casasDecimais,
  }).format(valor);
}

/**
 * Abrevia valores monetários grandes para exibição compacta.
 * Ex: 1500000 → "R$ 1,5M" | 250000 → "R$ 250K"
 *
 * @param {number} valor
 * @returns {string}
 */
function formatarMoedaCompacta(valor) {
  if (Math.abs(valor) >= 1_000_000) {
    return `R$ ${(valor / 1_000_000).toFixed(1).replace('.', ',')}M`;
  }
  if (Math.abs(valor) >= 1_000) {
    return `R$ ${(valor / 1_000).toFixed(0)}K`;
  }
  return formatarMoeda(valor);
}


export {
  formatarMoeda,
  formatarMoedaColorida,
  parseMoeda,
  formatarPercentual,
  formatarData,
  formatarDataHora,
  formatarDataRelativa,
  dataHojeISO,
  diferencaEmDias,
  formatarCPF,
  formatarTelefone,
  formatarNumero,
  formatarMoedaCompacta,
};
