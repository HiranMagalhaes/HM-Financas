/**
 * HM Finanças — Módulo: Promissórias (Módulo 8)
 * ============================================================
 * Gerenciamento de promissórias e investimentos em terceiros.
 *
 * Modalidades de cobrança:
 *  1. Pagamento Único   — cliente paga tudo ao vencer (capital + juros totais)
 *  2. Amortização       — capital + juros mensais (prestação fixa, tabela SAC simplificada)
 *  3. Juros Mensais     — capital fixo, recebe apenas os juros todo mês
 *
 * Fórmula de juros (simples):
 *  valorTotal = capital + (capital × taxa% × meses)
 *  Ex: R$3.000 × 5% × 4 meses = R$150 × 4 = R$600 de juros → Total R$3.600
 */

'use strict';

import { AuthService }      from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, formatarData, parseMoeda } from '../../utils/formatters.js';
import { mostrarToast, calcularStatusVencimento } from '../../utils/helpers.js';

let estado = {
  promissorias: [],
  clientes: [],
  contasDinheiro: [],
  filtroStatus: 'ativas',
  carregando: true
};

let unsubscribePromissorias = null;
let unsubscribeClientes = null;
let unsubscribeDinheiro = null;

/* ─────────────────────────────────────────────────────────────────────────────
   REGRAS DE NEGÓCIO E SINCRONIZAÇÃO
───────────────────────────────────────────────────────────────────────────── */

function obterStatusReal(promissoria) {
  const statusVencimento = calcularStatusVencimento(promissoria.dataVencimento, promissoria.status);
  if (statusVencimento === 'hoje' || statusVencimento === 'amanha') return 'pendente';
  return statusVencimento;
}

async function atualizarTotalCliente(clienteId) {
  // Busca direto do banco de dados para evitar duplicação em caso de disparo do listener local
  const promissoriasRes = await FirestoreService.listar('promissorias');
  if (promissoriasRes.sucesso) {
    const total = promissoriasRes.dados
      .filter(p => p.clienteId === clienteId && p.status !== 'recebida')
      .reduce((acc, p) => acc + (p.capitalRestante || p.valorInvestido || 0), 0);
    await FirestoreService.atualizar('clientes', clienteId, { promissoriasEmAberto: total });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   CÁLCULOS FINANCEIROS
───────────────────────────────────────────────────────────────────────────── */

/**
 * Calcula o valor total a receber com juros simples mensais.
 * Ex: R$3.000 × 5%/mês × 4 meses = R$3.600
 *
 * @param {number} capital - Valor emprestado
 * @param {number} taxaMensal - Taxa mensal em % (ex: 5 para 5%)
 * @param {number} meses - Número de meses
 * @returns {{ jurosTotal: number, valorFinal: number, jurosMensal: number }}
 */
function calcularJurosSimples(capital, taxaMensal, meses) {
  const jurosMensal = capital * (taxaMensal / 100);
  const jurosTotal  = jurosMensal * meses;
  const valorFinal  = capital + jurosTotal;
  return { jurosMensal, jurosTotal, valorFinal };
}

/**
 * Gera cronograma de amortização (SAC simplificado — prestação decrescente).
 * Cada mês: amortização fixa + juros sobre saldo devedor.
 *
 * @param {number} capital
 * @param {number} taxaMensal - em %
 * @param {number} meses
 * @returns {Array<{ mes, saldoInicial, amortizacao, juros, parcela, saldoFinal }>}
 */
function gerarCronogramaAmortizacao(capital, taxaMensal, meses) {
  const amortizacaoFix = capital / meses;
  const taxa = taxaMensal / 100;
  const cronograma = [];
  let saldo = capital;

  for (let m = 1; m <= meses; m++) {
    const juros   = saldo * taxa;
    const parcela = amortizacaoFix + juros;
    const saldoFinal = saldo - amortizacaoFix;
    cronograma.push({
      mes: m,
      saldoInicial: saldo,
      amortizacao: amortizacaoFix,
      juros,
      parcela,
      saldoFinal: Math.max(0, saldoFinal)
    });
    saldo = Math.max(0, saldoFinal);
  }
  return cronograma;
}

/* ─────────────────────────────────────────────────────────────────────────────
   AÇÕES DO USUÁRIO — CRUD
───────────────────────────────────────────────────────────────────────────── */

async function criarPromissoria(evento) {
  evento.preventDefault();
  const form     = evento.target;
  const formData = new FormData(form);

  const clienteId = formData.get('clienteId');
  const cliente = estado.clientes.find(c => c.id === clienteId);
  if (!cliente) return;

  const modalidade = formData.get('modalidade'); // 'unico', 'amortizacao', 'juros_mensais'
  const origem = formData.get('origem');
  const origemReferenciaId = formData.get('origemReferenciaId');

  const capital    = parseMoeda(formData.get('valorInvestido'));
  const taxaMensal = parseFloat(formData.get('taxaMensal')) || 0;
  const meses      = parseInt(formData.get('meses')) || 0;

  if (capital <= 0) {
    mostrarToast({ tipo: 'warning', titulo: 'Atenção', mensagem: 'O valor investido deve ser maior que zero.' });
    return;
  }

  if (modalidade !== 'unico' && (taxaMensal <= 0 || meses <= 0)) {
    mostrarToast({ tipo: 'warning', titulo: 'Atenção', mensagem: 'Informe a taxa de juros e o número de meses.' });
    return;
  }

  if (origem === 'dinheiro' && !origemReferenciaId) {
    mostrarToast({ tipo: 'warning', titulo: 'Atenção', mensagem: 'Selecione a conta de origem do dinheiro.' });
    return;
  }

  // Calcula valores conforme a modalidade
  let lucro = 0;
  let cronograma = null;
  let jurosMensal = 0;

  if (modalidade === 'unico') {
    // Sem juros configurados ou com taxa
    if (taxaMensal > 0 && meses > 0) {
      const calc = calcularJurosSimples(capital, taxaMensal, meses);
      lucro = calc.jurosTotal;
      jurosMensal = calc.jurosMensal;
    } else {
      lucro = parseMoeda(formData.get('lucroManual')) || 0;
    }
  } else if (modalidade === 'amortizacao') {
    cronograma = gerarCronogramaAmortizacao(capital, taxaMensal, meses);
    lucro = cronograma.reduce((acc, p) => acc + p.juros, 0);
    jurosMensal = cronograma[0]?.juros || 0;
  } else if (modalidade === 'juros_mensais') {
    jurosMensal = capital * (taxaMensal / 100);
    lucro = 0; // capital fica intacto; lucro acumulado conforme recebimentos
  }

  const novaPromissoria = {
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    descricao: formData.get('descricao').trim(),
    valorInvestido: capital,
    capitalRestante: capital,
    taxaMensal,
    meses,
    jurosMensal,
    lucro,
    modalidade,  // 'unico' | 'amortizacao' | 'juros_mensais'
    cronograma: cronograma || null,
    parcelaAtual: modalidade === 'amortizacao' ? 1 : null,
    pagosParcelas: [],       // Parcelas pagas (amortização)
    pagosJuros: [],          // Registros de juros mensais pagos (juros_mensais)
    lucroAcumulado: 0,       // Lucro realizado ao longo do tempo
    dataVencimento: formData.get('dataVencimento'),
    origem,
    origemReferenciaId: origem === 'dinheiro' ? origemReferenciaId : null,
    status: 'pendente'
  };

  const btnSubmit = form.querySelector('button[type="submit"]');
  if (btnSubmit) btnSubmit.disabled = true;

  // Debitar da origem
  if (origem === 'hmcred') {
    const resConfig = await FirestoreService.obter('hmcred', 'configuracao');
    if (!resConfig.sucesso) {
      mostrarToast({ tipo: 'danger', titulo: 'Erro', mensagem: 'Não foi possível ler configurações do HMCRED.' });
      if (btnSubmit) btnSubmit.disabled = false;
      return;
    }
    const hmcredConfig = resConfig.dados;
    if (capital > hmcredConfig.capitalDisponivel) {
      mostrarToast({ tipo: 'warning', titulo: 'Saldo insuficiente', mensagem: 'Capital disponível no HMCRED é menor que o valor investido.' });
      if (btnSubmit) btnSubmit.disabled = false;
      return;
    }
    await FirestoreService.atualizar('hmcred', 'configuracao', {
      capitalDisponivel: hmcredConfig.capitalDisponivel - capital
    });
  } else if (origem === 'dinheiro') {
    const conta = estado.contasDinheiro.find(c => c.id === origemReferenciaId);
    if (!conta || capital > conta.saldo) {
      mostrarToast({ tipo: 'warning', titulo: 'Saldo insuficiente', mensagem: 'A conta selecionada não possui saldo suficiente.' });
      if (btnSubmit) btnSubmit.disabled = false;
      return;
    }
    await FirestoreService.atualizar('dinheiro_contas', origemReferenciaId, {
      saldo: conta.saldo - capital
    });
    await sincronizarDinheiroExterno();
  }

  const res = await FirestoreService.criar('promissorias', novaPromissoria);

  if (res.sucesso) {
    await atualizarTotalCliente(cliente.id);
    
    // Registra o histórico da operação de crédito
    await FirestoreService.criar('lancamentos_hist', {
      modulo: 'promissorias',
      tipo: 'despesa', // Saiu dinheiro do usuário para o cliente
      valor: capital,
      descricao: `Nova Promissória: ${cliente.nome} (${nomeMod(modalidade)})`,
      data: new Date().toISOString().split('T')[0]
    });

    fecharModal('modal-nova-promissoria');
    form.reset();
    mostrarToast({ tipo: 'success', titulo: 'Promissória criada!', mensagem: `Vinculada a ${cliente.nome} — modalidade: ${nomeMod(modalidade)}.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao criar', mensagem: 'Houve um erro. O saldo da origem pode ter sido descontado.' });
  }

  if (btnSubmit) btnSubmit.disabled = false;
}

function nomeMod(mod) {
  const nomes = { unico: 'Pagamento Único', amortizacao: 'Amortização', juros_mensais: 'Juros Mensais' };
  return nomes[mod] || mod;
}

/**
 * Registra o recebimento total de uma promissória de pagamento único.
 * Devolve o capital + lucro à origem.
 */
async function receberPagamentoUnico(id, clienteId) {
  const p = estado.promissorias.find(x => x.id === id);
  if (!p || p.status === 'recebida') return;

  const valorTotal = p.valorInvestido + p.lucro;
  const confirmado = confirm(
    `Confirmar recebimento total de ${formatarMoeda(valorTotal)}?\n\n` +
    `Capital: ${formatarMoeda(p.valorInvestido)}\nJuros: ${formatarMoeda(p.lucro)}`
  );
  if (!confirmado) return;

  await devolverCapitalAOrigem(p, p.valorInvestido);

  const res = await FirestoreService.atualizar('promissorias', id, {
    status: 'recebida',
    lucroAcumulado: p.lucro,
    dataRecebimento: new Date().toISOString()
  });

  if (res.sucesso) {
    p.status = 'recebida';
    await atualizarTotalCliente(clienteId);

    // Registra recebimento no histórico
    await FirestoreService.criar('lancamentos_hist', {
      modulo: 'promissorias',
      tipo: 'receita', // Recebeu dinheiro de volta
      valor: valorTotal,
      descricao: `Recebimento Promissória: ${p.clienteNome}`,
      data: new Date().toISOString().split('T')[0]
    });

    mostrarToast({ tipo: 'success', titulo: 'Recebimento Confirmado!', mensagem: `${formatarMoeda(valorTotal)} recebidos.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao receber', mensagem: 'Não foi possível atualizar o banco.' });
  }
}

/**
 * Registra o pagamento de uma parcela de amortização.
 */
async function registrarParcelaAmortizacao(id, clienteId) {
  const p = estado.promissorias.find(x => x.id === id);
  if (!p || p.status === 'recebida' || p.modalidade !== 'amortizacao') return;

  const parcelaIdx = (p.parcelaAtual || 1) - 1;
  const parcelaCronograma = p.cronograma[parcelaIdx];
  if (!parcelaCronograma) return;

  const confirmado = confirm(
    `Registrar pagamento da Parcela ${parcelaCronograma.mes}/${p.meses}?\n\n` +
    `Amortização: ${formatarMoeda(parcelaCronograma.amortizacao)}\n` +
    `Juros: ${formatarMoeda(parcelaCronograma.juros)}\n` +
    `Valor da parcela: ${formatarMoeda(parcelaCronograma.parcela)}\n` +
    `Saldo após: ${formatarMoeda(parcelaCronograma.saldoFinal)}`
  );
  if (!confirmado) return;

  const novoCapital   = parcelaCronograma.saldoFinal;
  const novaParcelaAt = p.parcelaAtual + 1;
  const pagosParcelas = [...(p.pagosParcelas || []), {
    mes: parcelaCronograma.mes,
    amortizacao: parcelaCronograma.amortizacao,
    juros: parcelaCronograma.juros,
    parcela: parcelaCronograma.parcela,
    dataPagamento: new Date().toISOString()
  }];

  const lucroAcumulado = (p.lucroAcumulado || 0) + parcelaCronograma.juros;
  const isUltima = novaParcelaAt > p.meses;

  // Se foi a última parcela, encerrar promissória
  const atualizacao = {
    parcelaAtual: novaParcelaAt,
    capitalRestante: novoCapital,
    pagosParcelas,
    lucroAcumulado,
    ...(isUltima ? { status: 'recebida', dataRecebimento: new Date().toISOString() } : {})
  };

  // Devolve a amortização à origem
  await devolverCapitalAOrigem(p, parcelaCronograma.amortizacao);

  const res = await FirestoreService.atualizar('promissorias', id, atualizacao);

  if (res.sucesso) {
    await atualizarTotalCliente(clienteId);

    // Registra parcela no histórico
    await FirestoreService.criar('lancamentos_hist', {
      modulo: 'promissorias',
      tipo: 'receita',
      valor: parcelaCronograma.parcela,
      descricao: `Amortização (Parc ${parcelaCronograma.mes}/${p.meses}): ${p.clienteNome}`,
      data: new Date().toISOString().split('T')[0]
    });

    mostrarToast({ tipo: 'success', titulo: 'Parcela recebida!', mensagem: `Amortização de ${formatarMoeda(parcelaCronograma.parcela)} registrada.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao registrar', mensagem: 'Não foi possível atualizar o banco.' });
  }
}

/**
 * Registra o recebimento de juros mensais (modalidade juros_mensais).
 * O capital permanece intacto.
 */
async function registrarJurosMensais(id, clienteId) {
  const p = estado.promissorias.find(x => x.id === id);
  if (!p || p.status === 'recebida' || p.modalidade !== 'juros_mensais') return;

  const jurosMes = p.jurosMensal;
  const dataHoje  = new Date().toLocaleDateString('pt-BR');

  const confirmado = confirm(
    `Registrar recebimento de juros mensais de ${formatarMoeda(jurosMes)}?\n\n` +
    `Capital: ${formatarMoeda(p.valorInvestido)} (permanece intacto)\n` +
    `Taxa: ${p.taxaMensal}%/mês\n` +
    `Data: ${dataHoje}`
  );
  if (!confirmado) return;

  const pagosJuros = [...(p.pagosJuros || []), {
    valor: jurosMes,
    dataPagamento: new Date().toISOString()
  }];
  const lucroAcumulado = (p.lucroAcumulado || 0) + jurosMes;

  const res = await FirestoreService.atualizar('promissorias', id, {
    pagosJuros,
    lucroAcumulado,
    lucro: lucroAcumulado
  });

  if (res.sucesso) {
    p.pagosJuros = pagosJuros;
    p.lucroAcumulado = lucroAcumulado;
    p.lucro = lucroAcumulado;

    // Apenas registra o recebimento dos juros no histórico (não amortiza capital)
    await FirestoreService.criar('lancamentos_hist', {
      modulo: 'promissorias',
      tipo: 'receita',
      valor: jurosMes,
      descricao: `Pagamento Juros: ${p.clienteNome}`,
      data: new Date().toISOString().split('T')[0]
    });

    mostrarToast({
      tipo: 'success',
      titulo: 'Juros registrados!',
      mensagem: `${formatarMoeda(jurosMes)} recebidos. Lucro acumulado: ${formatarMoeda(lucroAcumulado)}.`
    });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao registrar', mensagem: 'Não foi possível atualizar o banco.' });
  }
}

/**
 * Encerra uma promissória de juros_mensais (quita o capital).
 */
async function quitarCapitalJurosMensais(id, clienteId) {
  const p = estado.promissorias.find(x => x.id === id);
  if (!p || p.status === 'recebida' || p.modalidade !== 'juros_mensais') return;

  const confirmado = confirm(
    `Confirmar recebimento do capital de ${formatarMoeda(p.valorInvestido)}?\n\n` +
    `Isso encerrará a promissória. Juros acumulados: ${formatarMoeda(p.lucroAcumulado || 0)}.`
  );
  if (!confirmado) return;

  await devolverCapitalAOrigem(p, p.valorInvestido);

  const res = await FirestoreService.atualizar('promissorias', id, {
    status: 'recebida',
    dataRecebimento: new Date().toISOString()
  });

  if (res.sucesso) {
    p.status = 'recebida';
    await atualizarTotalCliente(clienteId);

    // Registra quitação final do capital no histórico
    await FirestoreService.criar('lancamentos_hist', {
      modulo: 'promissorias',
      tipo: 'receita',
      valor: p.valorInvestido,
      descricao: `Quitação Capital: ${p.clienteNome}`,
      data: new Date().toISOString().split('T')[0]
    });

    mostrarToast({ tipo: 'success', titulo: 'Capital recebido!', mensagem: `Promissória encerrada. Lucro total: ${formatarMoeda(p.lucroAcumulado || 0)}.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao quitar', mensagem: 'Não foi possível atualizar o banco.' });
  }
}

async function excluirPromissoria(id, clienteId) {
  const promissoria = estado.promissorias.find(p => p.id === id);
  if (!promissoria) return;

  const confirmado = confirm('Deseja excluir esta promissória? Se estiver em aberto, o valor investido será devolvido à origem.');
  if (!confirmado) return;

  if (promissoria.status !== 'recebida') {
    await devolverCapitalAOrigem(promissoria, promissoria.capitalRestante || promissoria.valorInvestido);
  }

  const res = await FirestoreService.excluir('promissorias', id);
  if (res.sucesso) {
    estado.promissorias = estado.promissorias.filter(p => p.id !== id);
    await atualizarTotalCliente(clienteId);

    mostrarToast({ tipo: 'success', titulo: 'Promissória excluída', mensagem: 'A operação foi desfeita.' });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao excluir', mensagem: 'Tente novamente.' });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */

/**
 * Devolve um valor à origem da promissória (HMCRED ou conta Dinheiro).
 */
async function devolverCapitalAOrigem(promissoria, valor) {
  if (promissoria.origem === 'hmcred') {
    const resConfig = await FirestoreService.obter('hmcred', 'configuracao');
    if (resConfig.sucesso) {
      await FirestoreService.atualizar('hmcred', 'configuracao', {
        capitalDisponivel: resConfig.dados.capitalDisponivel + valor
      });
    }
  } else if (promissoria.origem === 'dinheiro' && promissoria.origemReferenciaId) {
    const conta = estado.contasDinheiro.find(c => c.id === promissoria.origemReferenciaId);
    if (conta) {
      await FirestoreService.atualizar('dinheiro_contas', conta.id, {
        saldo: conta.saldo + valor
      });
      await sincronizarDinheiroExterno();
    }
  }
}

async function sincronizarDinheiroExterno() {
  const contasRes = await FirestoreService.listar('dinheiro_contas');
  if (contasRes.sucesso) {
    const saldoTotal = contasRes.dados.reduce((acc, c) => acc + (c.saldo || 0), 0);
    await FirestoreService.salvar('dinheiro', 'configuracao', { saldoTotal });
    const resumoExistente = await FirestoreService.obter('patrimonio', 'resumo');
    const dadosPatrimonio = resumoExistente.sucesso ? resumoExistente.dados : {};
    dadosPatrimonio.dinheiro = saldoTotal;
    await FirestoreService.salvar('patrimonio', 'resumo', dadosPatrimonio);
  }
}

async function atualizarResumoPatrimonio() {
  const resumoExistente = await FirestoreService.obter('patrimonio', 'resumo');
  const dadosPatrimonio = resumoExistente.sucesso ? resumoExistente.dados : {};
  const totalInvestidoAtivo = estado.promissorias
    .filter(p => p.status !== 'recebida')
    .reduce((acc, p) => acc + (p.capitalRestante || p.valorInvestido || 0), 0);
  dadosPatrimonio.promissorias = totalInvestidoAtivo;
  await FirestoreService.salvar('patrimonio', 'resumo', dadosPatrimonio);
}

function aplicarFiltro(status) {
  estado.filtroStatus = status;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-ghost');
    if (btn.dataset.status === status) {
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-ghost');
    }
  });
  const listaContainer = document.getElementById('promissorias-lista');
  if (listaContainer) atualizarLista(listaContainer.parentElement);
}

function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO — CARD DA PROMISSÓRIA
───────────────────────────────────────────────────────────────────────────── */

function renderizarInfoModalidade(p) {
  if (p.modalidade === 'unico' || !p.modalidade) {
    const valorTotal = p.valorInvestido + p.lucro;
    return `
      <div style="display: flex; gap: var(--space-6); flex-wrap: wrap; margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border-default);">
        <div>
          <p style="margin:0; font-size: var(--text-xs); color: var(--text-muted);">Capital</p>
          <p class="value-sensitive" style="margin:0; font-weight: var(--font-semibold);">${formatarMoeda(p.valorInvestido)}</p>
        </div>
        <div>
          <p style="margin:0; font-size: var(--text-xs); color: var(--text-muted);">Juros totais</p>
          <p class="value-sensitive" style="margin:0; font-weight: var(--font-semibold); color: var(--color-success);">+${formatarMoeda(p.lucro)}</p>
        </div>
        <div>
          <p style="margin:0; font-size: var(--text-xs); color: var(--text-muted);">Total no vencimento</p>
          <p class="value-sensitive" style="margin:0; font-size: var(--text-lg); font-weight: var(--font-bold); color: var(--color-gold);">${formatarMoeda(valorTotal)}</p>
        </div>
      </div>
    `;
  }

  if (p.modalidade === 'amortizacao') {
    const parcelaAt = p.parcelaAtual || 1;
    const parcAtual = p.cronograma?.[parcelaAt - 1];
    return `
      <div style="margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border-default);">
        <div style="display: flex; gap: var(--space-6); flex-wrap: wrap; margin-bottom: var(--space-2);">
          <div>
            <p style="margin:0; font-size: var(--text-xs); color: var(--text-muted);">Capital Restante</p>
            <p class="value-sensitive" style="margin:0; font-weight: var(--font-bold); color: var(--color-warning);">${formatarMoeda(p.capitalRestante || p.valorInvestido)}</p>
          </div>
          <div>
            <p style="margin:0; font-size: var(--text-xs); color: var(--text-muted);">Parcela ${parcelaAt}/${p.meses}</p>
            <p class="value-sensitive" style="margin:0; font-weight: var(--font-bold); color: var(--color-info);">${parcAtual ? formatarMoeda(parcAtual.parcela) : '—'}</p>
          </div>
          <div>
            <p style="margin:0; font-size: var(--text-xs); color: var(--text-muted);">Lucro acumulado</p>
            <p class="value-sensitive" style="margin:0; font-weight: var(--font-semibold); color: var(--color-success);">+${formatarMoeda(p.lucroAcumulado || 0)}</p>
          </div>
        </div>
        <div style="background: var(--bg-overlay); border-radius: var(--radius-sm); height: 6px; overflow: hidden;">
          <div style="height: 100%; background: var(--color-info); width: ${Math.round(((p.pagosParcelas?.length || 0) / p.meses) * 100)}%; border-radius: var(--radius-sm); transition: width 0.3s;"></div>
        </div>
        <p style="margin: 4px 0 0; font-size: 11px; color: var(--text-muted);">${p.pagosParcelas?.length || 0} de ${p.meses} parcelas pagas</p>
      </div>
    `;
  }

  if (p.modalidade === 'juros_mensais') {
    const pagosCount = p.pagosJuros?.length || 0;
    return `
      <div style="margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border-default);">
        <div style="display: flex; gap: var(--space-6); flex-wrap: wrap;">
          <div>
            <p style="margin:0; font-size: var(--text-xs); color: var(--text-muted);">Capital (fixo)</p>
            <p class="value-sensitive" style="margin:0; font-weight: var(--font-bold);">${formatarMoeda(p.valorInvestido)}</p>
          </div>
          <div>
            <p style="margin:0; font-size: var(--text-xs); color: var(--text-muted);">Juros/mês (${p.taxaMensal}%)</p>
            <p class="value-sensitive" style="margin:0; font-weight: var(--font-bold); color: var(--color-success);">${formatarMoeda(p.jurosMensal)}/mês</p>
          </div>
          <div>
            <p style="margin:0; font-size: var(--text-xs); color: var(--text-muted);">Total recebido em juros</p>
            <p class="value-sensitive" style="margin:0; font-weight: var(--font-bold); color: var(--color-gold);">${formatarMoeda(p.lucroAcumulado || 0)}</p>
          </div>
          <div>
            <p style="margin:0; font-size: var(--text-xs); color: var(--text-muted);">Meses de juros pagos</p>
            <p style="margin:0; font-weight: var(--font-semibold);">${pagosCount} ${pagosCount === 1 ? 'mês' : 'meses'}</p>
          </div>
        </div>
      </div>
    `;
  }

  return '';
}

function renderizarBotoesAcao(p) {
  if (p.status === 'recebida') return '';

  const statusReal = obterStatusReal(p);
  const mod = p.modalidade || 'unico';

  let btns = '';

  if (mod === 'unico') {
    btns = `
      <button class="btn btn-sm" style="background: var(--color-success-muted); color: var(--color-success); border: 1px solid var(--color-success-border);"
              data-acao="receber-unico" data-id="${p.id}" data-cliente="${p.clienteId}">
        <span class="material-symbols-outlined icon-sm">payments</span>
        Receber Tudo (${formatarMoeda(p.valorInvestido + p.lucro)})
      </button>
    `;
  } else if (mod === 'amortizacao') {
    const parcelaIdx = (p.parcelaAtual || 1) - 1;
    const parcela = p.cronograma?.[parcelaIdx];
    btns = `
      <button class="btn btn-sm" style="background: var(--color-info-muted); color: var(--color-info); border: 1px solid var(--border-default);"
              data-acao="registrar-parcela" data-id="${p.id}" data-cliente="${p.clienteId}">
        <span class="material-symbols-outlined icon-sm">receipt</span>
        Pagar Parcela ${p.parcelaAtual || 1}/${p.meses} ${parcela ? `(${formatarMoeda(parcela.parcela)})` : ''}
      </button>
    `;
  } else if (mod === 'juros_mensais') {
    btns = `
      <button class="btn btn-sm" style="background: var(--color-success-muted); color: var(--color-success); border: 1px solid var(--color-success-border);"
              data-acao="registrar-juros" data-id="${p.id}" data-cliente="${p.clienteId}">
        <span class="material-symbols-outlined icon-sm">trending_up</span>
        Registrar Juros (${formatarMoeda(p.jurosMensal)}/mês)
      </button>
      <button class="btn btn-sm" style="background: var(--color-warning-muted); color: var(--color-warning); border: 1px solid var(--border-default);"
              data-acao="quitar-capital" data-id="${p.id}" data-cliente="${p.clienteId}">
        <span class="material-symbols-outlined icon-sm">account_balance</span>
        Receber Capital (${formatarMoeda(p.valorInvestido)})
      </button>
    `;
  }

  return btns;
}

function renderizarCardPromissoria(p) {
  const statusReal = obterStatusReal(p);

  let statusCor, statusBg, statusIcon;
  if (statusReal === 'recebida') {
    statusCor = 'var(--color-success)';
    statusBg  = 'var(--color-success-muted)';
    statusIcon = 'check_circle';
  } else if (statusReal === 'atrasada') {
    statusCor = 'var(--color-danger)';
    statusBg  = 'var(--color-danger-muted)';
    statusIcon = 'error';
  } else {
    statusCor = 'var(--color-gold)';
    statusBg  = 'var(--bg-overlay)';
    statusIcon = 'schedule';
  }

  const nomeCliente = p.clienteNome || 'Cliente Excluído';
  const labelOrigem = p.origem === 'hmcred' ? 'HMCRED' : 'Conta Dinheiro';
  const modLabel = { unico: 'Pagamento Único', amortizacao: 'Amortização', juros_mensais: 'Juros Mensais' }[p.modalidade] || 'Pagamento Único';

  const botoesAcao = renderizarBotoesAcao(p);

  return `
    <div class="card" style="margin-bottom: var(--space-4);" role="article">
      <div class="card-body">
        
        <div style="display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: var(--space-4);">
          <!-- Lado esquerdo: ícone + info -->
          <div style="display: flex; align-items: center; gap: var(--space-4); flex: 1; min-width: 220px;">
            <div style="width: 48px; height: 48px; border-radius: var(--radius-md); background-color: ${statusBg}; color: ${statusCor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <span class="material-symbols-outlined" style="font-size: 24px;">${statusIcon}</span>
            </div>
            <div>
              <h4 style="margin: 0; font-size: var(--text-base); font-weight: var(--font-semibold); color: var(--text-primary);">${nomeCliente}</h4>
              <span style="font-size: var(--text-sm); color: var(--text-muted);">${p.descricao || 'Promissória'}</span>
              <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                <span class="badge badge-neutral" style="font-size: 10px;">Origem: ${labelOrigem}</span>
                <span class="badge" style="font-size: 10px; background: var(--bg-overlay); color: var(--color-info);">${modLabel}</span>
                <span style="font-size: var(--text-xs); color: var(--text-muted);">Venc: ${formatarData(p.dataVencimento)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Info financeira por modalidade -->
        ${renderizarInfoModalidade(p)}

        <!-- Botões de ação -->
        ${botoesAcao ? `
          <div style="display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-default); justify-content: flex-end;">
            ${botoesAcao}
            <button class="btn btn-ghost btn-icon" title="Excluir" data-acao="excluir" data-id="${p.id}" data-cliente="${p.clienteId}">
              <span class="material-symbols-outlined" style="color: var(--color-danger);">delete</span>
            </button>
          </div>
        ` : `
          <div style="display: flex; justify-content: flex-end; margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border-default);">
            <button class="btn btn-ghost btn-icon" title="Excluir" data-acao="excluir" data-id="${p.id}" data-cliente="${p.clienteId}">
              <span class="material-symbols-outlined" style="color: var(--color-danger);">delete</span>
            </button>
          </div>
        `}

      </div>
    </div>
  `;
}

function renderizarEmptyState() {
  return `
    <div class="empty-state" style="padding: var(--space-16) var(--space-8);">
      <span class="material-symbols-outlined empty-state-icon">receipt_long</span>
      <h3 class="empty-state-title">Nenhuma Promissória</h3>
      <p class="empty-state-text">Crie sua primeira promissória para começar a gerenciar seus investimentos.</p>
      ${estado.promissorias.length === 0 ? `
        <button class="btn btn-primary" onclick="document.getElementById('modal-nova-promissoria').classList.add('open')">
          <span class="material-symbols-outlined">add</span>
          Nova Promissória
        </button>
      ` : ''}
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO — MODAL DE NOVA PROMISSÓRIA
───────────────────────────────────────────────────────────────────────────── */

function renderizarModais() {
  const opcoesClientes = estado.clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  const opcoesContas = estado.contasDinheiro.map(c => `<option value="${c.id}">${c.nome} (Saldo: ${formatarMoeda(c.saldo)})</option>`).join('');

  return `
    <!-- Modal: Nova Promissória -->
    <div class="modal-overlay" id="modal-nova-promissoria">
      <div class="modal" style="max-width: 560px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title">Nova Promissória</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-nova-promissoria').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-nova-promissoria" novalidate>
          <div class="modal-body">
            
            ${estado.clientes.length === 0 ? `
              <div style="background-color: var(--color-danger-muted); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
                <p style="color: var(--color-danger); font-size: var(--text-sm); display: flex; align-items: center; gap: 8px;">
                  <span class="material-symbols-outlined icon-sm">warning</span>
                  Você precisa cadastrar clientes primeiro (Menu Clientes).
                </p>
              </div>
            ` : ''}

            <!-- TABS: Modalidade de Cobrança -->
            <div style="margin-bottom: var(--space-5);">
              <label class="form-label">Modalidade de Cobrança <span class="required">*</span></label>
              <input type="hidden" name="modalidade" id="input-modalidade" value="unico">
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-2);">
                <button type="button" id="tab-mod-unico" class="btn btn-sm btn-primary"
                        onclick="promSelecionarModalidade('unico')" style="flex-direction: column; height: auto; padding: 10px 8px; gap: 4px;">
                  <span class="material-symbols-outlined" style="font-size: 22px;">payments</span>
                  <span style="font-size: 11px; font-weight: 600;">Pagamento</span>
                  <span style="font-size: 10px; opacity: 0.8;">Único</span>
                </button>
                <button type="button" id="tab-mod-amortizacao" class="btn btn-sm btn-ghost"
                        onclick="promSelecionarModalidade('amortizacao')" style="flex-direction: column; height: auto; padding: 10px 8px; gap: 4px;">
                  <span class="material-symbols-outlined" style="font-size: 22px;">receipt</span>
                  <span style="font-size: 11px; font-weight: 600;">Amortização</span>
                  <span style="font-size: 10px; opacity: 0.8;">Capital+Juros/mês</span>
                </button>
                <button type="button" id="tab-mod-juros" class="btn btn-sm btn-ghost"
                        onclick="promSelecionarModalidade('juros_mensais')" style="flex-direction: column; height: auto; padding: 10px 8px; gap: 4px;">
                  <span class="material-symbols-outlined" style="font-size: 22px;">trending_up</span>
                  <span style="font-size: 11px; font-weight: 600;">Juros Mensais</span>
                  <span style="font-size: 10px; opacity: 0.8;">Capital fixo</span>
                </button>
              </div>
              <!-- Descrição da modalidade selecionada -->
              <div id="desc-modalidade" style="margin-top: 8px; padding: 8px 10px; background: var(--bg-overlay); border-radius: var(--radius-sm); font-size: var(--text-xs); color: var(--text-muted);">
                <span class="material-symbols-outlined icon-sm" style="vertical-align: middle;"></span>
                O cliente paga tudo no vencimento: capital + juros totais acumulados.
              </div>
            </div>

            <!-- Cliente e Descrição -->
            <div class="form-group">
              <label class="form-label" for="nova-prom-cliente">Cliente <span class="required">*</span></label>
              <select id="nova-prom-cliente" name="clienteId" class="form-input form-select" required ${estado.clientes.length === 0 ? 'disabled' : ''}>
                <option value="">Selecione um cliente...</option>
                ${opcoesClientes}
              </select>
            </div>
            
            <div class="form-group">
              <label class="form-label" for="nova-prom-descricao">Descrição <span class="required">*</span></label>
              <input type="text" id="nova-prom-descricao" name="descricao" class="form-input"
                     placeholder="Ex: Empréstimo Pessoal, Acordo..." required autocomplete="off" ${estado.clientes.length === 0 ? 'disabled' : ''}>
            </div>

            <!-- Valores -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
              <div class="form-group">
                <label class="form-label" for="nova-prom-capital">Capital Emprestado (R$) <span class="required">*</span></label>
                <input type="text" id="nova-prom-capital" name="valorInvestido" class="form-input"
                       placeholder="0,00" required inputmode="decimal" ${estado.clientes.length === 0 ? 'disabled' : ''}>
              </div>
              <div class="form-group">
                <label class="form-label" for="nova-prom-taxa">Taxa Juros (%/mês)</label>
                <input type="number" step="0.01" id="nova-prom-taxa" name="taxaMensal" class="form-input"
                       placeholder="Ex: 5" min="0" ${estado.clientes.length === 0 ? 'disabled' : ''}>
              </div>
            </div>

            <!-- Meses / Lucro manual (pagamento único sem taxa) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
              <div class="form-group" id="grupo-meses">
                <label class="form-label" for="nova-prom-meses">Meses</label>
                <input type="number" id="nova-prom-meses" name="meses" class="form-input"
                       placeholder="Ex: 4" min="0" ${estado.clientes.length === 0 ? 'disabled' : ''}>
              </div>
              <div class="form-group" id="grupo-lucro-manual">
                <label class="form-label" for="nova-prom-lucro-manual">Lucro / Juros (R$) <small class="text-muted">(se não usar taxa)</small></label>
                <input type="text" id="nova-prom-lucro-manual" name="lucroManual" class="form-input"
                       placeholder="0,00" inputmode="decimal" ${estado.clientes.length === 0 ? 'disabled' : ''}>
              </div>
            </div>

            <!-- Preview do cálculo -->
            <div id="preview-calculo" style="display:none; background: var(--color-success-muted); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4);">
              <div id="preview-calculo-texto" style="font-size: var(--text-sm); color: var(--color-success); font-weight: var(--font-semibold);"></div>
            </div>

            <!-- Cronograma de amortização (aparece na modalidade amortização) -->
            <div id="tabela-amortizacao" style="display:none; margin-bottom: var(--space-4);">
              <label class="form-label">Cronograma de Parcelas (prévia)</label>
              <div id="tabela-amort-conteudo" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-default); border-radius: var(--radius-md); font-size: var(--text-xs);">
              </div>
            </div>

            <!-- Vencimento e Origem -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
              <div class="form-group">
                <label class="form-label" for="nova-prom-vencimento">Vencimento / Prazo <span class="required">*</span></label>
                <input type="date" id="nova-prom-vencimento" name="dataVencimento" class="form-input" required ${estado.clientes.length === 0 ? 'disabled' : ''}>
              </div>
              <div class="form-group">
                <label class="form-label" for="nova-prom-origem">Origem do Recurso <span class="required">*</span></label>
                <select id="nova-prom-origem" name="origem" class="form-input form-select" required ${estado.clientes.length === 0 ? 'disabled' : ''}>
                  <option value="hmcred">HMCRED (Crédito Próprio)</option>
                  <option value="dinheiro">Dinheiro (Conta Bancária/Caixa)</option>
                </select>
              </div>
            </div>

            <div class="form-group" id="grupo-origem-referencia" style="display: none;">
              <label class="form-label" for="nova-prom-origem-ref">Qual Conta? <span class="required">*</span></label>
              <select id="nova-prom-origem-ref" name="origemReferenciaId" class="form-input form-select">
                <option value="">Selecione...</option>
                ${opcoesContas}
              </select>
            </div>
            
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-nova-promissoria').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary" ${estado.clientes.length === 0 ? 'disabled' : ''}>
              <span class="material-symbols-outlined">receipt_long</span>
              Gerar Promissória
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO — LISTA E TELA PRINCIPAL
───────────────────────────────────────────────────────────────────────────── */

function atualizarLista(container) {
  let promFiltradas = estado.promissorias;

  if (estado.filtroStatus === 'ativas') {
    promFiltradas = promFiltradas.filter(p => p.status !== 'recebida');
  } else if (estado.filtroStatus === 'recebidas') {
    promFiltradas = promFiltradas.filter(p => p.status === 'recebida');
  }

  promFiltradas.sort((a, b) => {
    if (a.status === 'recebida' && b.status !== 'recebida') return 1;
    if (b.status === 'recebida' && a.status !== 'recebida') return -1;
    const dateA = new Date(a.dataVencimento);
    const dateB = new Date(b.dataVencimento);
    if (a.status === 'recebida') return dateB - dateA;
    return dateA - dateB;
  });

  const listaContainer = container.querySelector('#promissorias-lista');
  if (listaContainer) {
    listaContainer.innerHTML = promFiltradas.length === 0
      ? renderizarEmptyState()
      : promFiltradas.map(renderizarCardPromissoria).join('');
  }
}

function renderizarTelaPrincipal(container) {
  const kpis = { totalAtivas: 0, lucroEsperado: 0, lucroRealizado: 0 };

  estado.promissorias.forEach(p => {
    if (p.status !== 'recebida') {
      kpis.totalAtivas += p.capitalRestante || p.valorInvestido || 0;
      kpis.lucroEsperado += p.lucro || 0;
    } else {
      kpis.lucroRealizado += p.lucroAcumulado || p.lucro || 0;
    }
  });

  container.innerHTML = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-4);">
      <div>
        <h2 class="page-title">Promissórias</h2>
        <p class="page-subtitle">Investimentos em terceiros — 3 modalidades de cobrança.</p>
      </div>
      <button class="btn btn-primary" id="btn-nova-promissoria">
        <span class="material-symbols-outlined">add</span>
        Nova Promissória
      </button>
    </div>

    <div class="stats-grid" style="margin-bottom: var(--space-8);">
      <div class="stat-card card-gold">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm" style="text-transform: uppercase;">Capital Ativo</span>
          <div class="stat-card-icon" style="color: var(--color-gold);">
            <span class="material-symbols-outlined">account_balance</span>
          </div>
        </div>
        <div class="stat-card-value text-gold value-sensitive">${formatarMoeda(kpis.totalAtivas)}</div>
      </div>

      <div class="stat-card card-warning">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm" style="text-transform: uppercase;">Lucro Esperado</span>
          <div class="stat-card-icon" style="background-color: var(--color-warning-muted); color: var(--color-warning);">
            <span class="material-symbols-outlined">trending_up</span>
          </div>
        </div>
        <div class="stat-card-value text-warning value-sensitive">${formatarMoeda(kpis.lucroEsperado)}</div>
      </div>

      <div class="stat-card card-success">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm" style="text-transform: uppercase;">Lucro Realizado</span>
          <div class="stat-card-icon" style="background-color: var(--color-success-muted); color: var(--color-success);">
            <span class="material-symbols-outlined">check_circle</span>
          </div>
        </div>
        <div class="stat-card-value text-success value-sensitive">${formatarMoeda(kpis.lucroRealizado)}</div>
      </div>
    </div>

    <div class="dashboard-section-header" style="margin-bottom: var(--space-4); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-4);">
      <h3 class="text-lg font-semibold">Títulos Emitidos</h3>
      <div style="display: flex; gap: var(--space-2); background: var(--bg-overlay); padding: 4px; border-radius: var(--radius-md);">
        <button class="btn btn-sm ${estado.filtroStatus === 'ativas' ? 'btn-primary' : 'btn-ghost'} filter-btn" data-status="ativas">Ativas</button>
        <button class="btn btn-sm ${estado.filtroStatus === 'recebidas' ? 'btn-primary' : 'btn-ghost'} filter-btn" data-status="recebidas">Recebidas</button>
      </div>
    </div>

    <div id="promissorias-lista">
      <!-- Injetado -->
    </div>

    ${renderizarModais()}
  `;

  registrarEventosTela(container);
  atualizarLista(container);
}

/* ─────────────────────────────────────────────────────────────────────────────
   EVENTOS
───────────────────────────────────────────────────────────────────────────── */

function registrarEventosTela(container) {
  const btnNova = document.getElementById('btn-nova-promissoria');
  if (btnNova) btnNova.addEventListener('click', () => abrirModal('modal-nova-promissoria'));

  const formNova = document.getElementById('form-nova-promissoria');
  if (formNova) formNova.addEventListener('submit', criarPromissoria);

  // Expõe função de seleção de modalidade ao scope global (usada nos onclick inline)
  window.promSelecionarModalidade = (mod) => {
    document.getElementById('input-modalidade').value = mod;

    // Atualiza estilo dos botões de tabs
    ['unico', 'amortizacao', 'juros_mensais'].forEach(m => {
      const btn = document.getElementById(`tab-mod-${m === 'juros_mensais' ? 'juros' : m}`);
      if (btn) {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-ghost');
      }
    });
    const btnAtivo = document.getElementById(`tab-mod-${mod === 'juros_mensais' ? 'juros' : mod}`);
    if (btnAtivo) {
      btnAtivo.classList.remove('btn-ghost');
      btnAtivo.classList.add('btn-primary');
    }

    // Atualiza descrição da modalidade
    const descs = {
      unico: '💰 O cliente paga tudo no vencimento: capital + juros totais acumulados.',
      amortizacao: '📅 O cliente paga parcelas mensais: amortização do capital + juros sobre saldo devedor.',
      juros_mensais: '🔄 Capital fica fixo. Você recebe apenas os juros todo mês. Capital devolvido no encerramento.'
    };
    const descEl = document.getElementById('desc-modalidade');
    if (descEl) descEl.textContent = descs[mod] || '';

    // Mostrar/ocultar campo meses e lucro manual
    const grupoMeses = document.getElementById('grupo-meses');
    const grupoLucroManual = document.getElementById('grupo-lucro-manual');
    if (mod === 'unico') {
      if (grupoMeses) grupoMeses.style.display = 'block';
      if (grupoLucroManual) grupoLucroManual.style.display = 'block';
    } else {
      if (grupoMeses) grupoMeses.style.display = 'block';
      if (grupoLucroManual) grupoLucroManual.style.display = 'none';
    }

    // Recalcular preview
    recalcularPreview();
  };

  // Recalcula preview em tempo real
  function recalcularPreview() {
    const capital    = parseMoeda(document.getElementById('nova-prom-capital')?.value || '0');
    const taxa       = parseFloat(document.getElementById('nova-prom-taxa')?.value) || 0;
    const meses      = parseInt(document.getElementById('nova-prom-meses')?.value) || 0;
    const mod        = document.getElementById('input-modalidade')?.value || 'unico';
    const previewDiv = document.getElementById('preview-calculo');
    const previewTxt = document.getElementById('preview-calculo-texto');
    const tabelaDiv  = document.getElementById('tabela-amortizacao');
    const tabelaConteudo = document.getElementById('tabela-amort-conteudo');

    if (capital > 0 && taxa > 0 && meses > 0) {
      if (mod === 'unico') {
        const { jurosMensal, jurosTotal, valorFinal } = calcularJurosSimples(capital, taxa, meses);
        previewTxt.innerHTML = `
          ${formatarMoeda(capital)} × ${taxa}%/mês × ${meses} ${meses > 1 ? 'meses' : 'mês'}
          = Juros de <strong>${formatarMoeda(jurosTotal)}</strong>
          → <strong>Total a receber: ${formatarMoeda(valorFinal)}</strong>
          <br><small>(${formatarMoeda(jurosMensal)}/mês de juros)</small>
        `;
        previewDiv.style.display = 'block';
        if (tabelaDiv) tabelaDiv.style.display = 'none';

      } else if (mod === 'amortizacao') {
        const cronograma = gerarCronogramaAmortizacao(capital, taxa, meses);
        const totalPago = cronograma.reduce((a, p) => a + p.parcela, 0);
        const totalJuros = cronograma.reduce((a, p) => a + p.juros, 0);

        previewTxt.innerHTML = `
          Amortização de ${formatarMoeda(capital)} em ${meses} parcelas
          → Lucro total: <strong>${formatarMoeda(totalJuros)}</strong>
          | Total a receber: <strong>${formatarMoeda(totalPago)}</strong>
        `;
        previewDiv.style.display = 'block';

        // Tabela de amortização
        if (tabelaDiv && tabelaConteudo) {
          tabelaConteudo.innerHTML = `
            <table style="width:100%; border-collapse: collapse;">
              <thead>
                <tr style="background: var(--bg-hover);">
                  <th style="padding: 6px 8px; text-align: left;">Mês</th>
                  <th style="padding: 6px 8px; text-align: right;">Saldo Dev.</th>
                  <th style="padding: 6px 8px; text-align: right;">Amortiz.</th>
                  <th style="padding: 6px 8px; text-align: right;">Juros</th>
                  <th style="padding: 6px 8px; text-align: right; color: var(--color-info);">Parcela</th>
                </tr>
              </thead>
              <tbody>
                ${cronograma.map(r => `
                  <tr style="border-top: 1px solid var(--border-default);">
                    <td style="padding: 5px 8px;">${r.mes}</td>
                    <td style="padding: 5px 8px; text-align: right;">${formatarMoeda(r.saldoInicial)}</td>
                    <td style="padding: 5px 8px; text-align: right;">${formatarMoeda(r.amortizacao)}</td>
                    <td style="padding: 5px 8px; text-align: right; color: var(--color-success);">${formatarMoeda(r.juros)}</td>
                    <td style="padding: 5px 8px; text-align: right; color: var(--color-info); font-weight: 600;">${formatarMoeda(r.parcela)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          tabelaDiv.style.display = 'block';
        }

      } else if (mod === 'juros_mensais') {
        const jurosMensal = capital * (taxa / 100);
        previewTxt.innerHTML = `
          ${formatarMoeda(capital)} × ${taxa}%/mês
          = <strong>${formatarMoeda(jurosMensal)}/mês</strong> de juros
          <br><small>Capital permanece fixo. Recebe ${formatarMoeda(jurosMensal)} todo mês.</small>
        `;
        previewDiv.style.display = 'block';
        if (tabelaDiv) tabelaDiv.style.display = 'none';
      }
    } else {
      if (previewDiv) previewDiv.style.display = 'none';
      if (tabelaDiv)  tabelaDiv.style.display = 'none';
    }
  }

  // Inputs de cálculo
  ['nova-prom-capital', 'nova-prom-taxa', 'nova-prom-meses'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', recalcularPreview);
  });

  // Origem
  const selOrigem = document.getElementById('nova-prom-origem');
  const divContaRef = document.getElementById('grupo-origem-referencia');
  const selContaRef = document.getElementById('nova-prom-origem-ref');

  if (selOrigem && divContaRef && selContaRef) {
    selOrigem.addEventListener('change', () => {
      if (selOrigem.value === 'dinheiro') {
        divContaRef.style.display = 'block';
        selContaRef.required = true;
      } else {
        divContaRef.style.display = 'none';
        selContaRef.required = false;
        selContaRef.value = '';
      }
    });
  }

  // Filtros
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => aplicarFiltro(e.target.dataset.status));
  });

  // Delegação de eventos para ações nos cards
  container.addEventListener('click', (e) => {
    let alvo = e.target;
    while (alvo && alvo !== container) {
      if (alvo.getAttribute && alvo.getAttribute('data-acao')) break;
      alvo = alvo.parentNode;
    }

    if (alvo && alvo.getAttribute) {
      const acao      = alvo.getAttribute('data-acao');
      const id        = alvo.getAttribute('data-id');
      const clienteId = alvo.getAttribute('data-cliente');

      if (acao === 'receber-unico')     receberPagamentoUnico(id, clienteId);
      else if (acao === 'registrar-parcela') registrarParcelaAmortizacao(id, clienteId);
      else if (acao === 'registrar-juros')   registrarJurosMensais(id, clienteId);
      else if (acao === 'quitar-capital')    quitarCapitalJurosMensais(id, clienteId);
      else if (acao === 'excluir')           excluirPromissoria(id, clienteId);

      e.stopPropagation();
    }
  });

  // Fechar modais ao clicar fora
  container.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   MÓDULO EXPORTADO
───────────────────────────────────────────────────────────────────────────── */
export const PromissoriasModule = {
  async renderPromissorias(container) {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-16);">
        <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
        <p style="color: var(--text-muted); margin-top: var(--space-4);">Carregando promissórias...</p>
      </div>
    `;

    if (unsubscribePromissorias) { unsubscribePromissorias(); unsubscribePromissorias = null; }
    if (unsubscribeClientes)     { unsubscribeClientes();     unsubscribeClientes = null; }
    if (unsubscribeDinheiro)     { unsubscribeDinheiro();     unsubscribeDinheiro = null; }

    unsubscribeClientes = FirestoreService.escutar('clientes', (clientes) => {
      estado.clientes = clientes;
      if (estado.promissorias.length > 0) renderizarTelaPrincipal(container);
    });

    unsubscribeDinheiro = FirestoreService.escutar('dinheiro_contas', (contas) => {
      estado.contasDinheiro = contas;
    });

    unsubscribePromissorias = FirestoreService.escutar(
      'promissorias',
      async (promissorias) => {
        estado.promissorias = promissorias;
        await atualizarResumoPatrimonio(); // Mantém o patrimônio sempre atualizado (Item 6)
        renderizarTelaPrincipal(container);
      },
      { ordenarPor: 'dataVencimento', direcao: 'asc' }
    );
  }
};
