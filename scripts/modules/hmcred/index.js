/**
 * HM Finanças — Módulo: HMCRED (Módulo 5)
 * ============================================================
 * Sistema de crédito próprio do usuário.
 * Controla operações de empréstimos/crédito concedidos, limites e retorno.
 *
 * Melhorias:
 * - Cálculo automático do valor a receber com base em valor + taxa + meses
 * - Opção de retirada via cartão de crédito parcelado (sem juros)
 * - Botão para editar o capital/limite base (acréscimo)
 */

'use strict';

import { AuthService } from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, formatarData, parseMoeda } from '../../utils/formatters.js';
import { mostrarToast, gerarIdUnico, escapeHTML } from '../../utils/helpers.js';
import { injetarModalEdicaoHmCred, abrirModalEdicaoHmCred } from './editar.js';
import { criarHTMLBarraFiltros, registrarEventosFiltros, filtrarLista } from '../../utils/filtros.js';
import { Router } from '../../router.js';

/* ─────────────────────────────────────────────────────────────────────────────
   ESTADO DO MÓDULO
───────────────────────────────────────────────────────────────────────────── */
let estado = {
  configuracao: { limiteTotal: 0, capitalDisponivel: 0 },
  operacoes: [],
  cartoes: [],
  clientes: [],
  carregando: true
};
let unsubscribeOperacoes = null;
let unsubscribeCartoes = null;
let unsubscribeClientes = null;
let _container = null;

/* ─────────────────────────────────────────────────────────────────────────────
   FUNÇÕES DE SINCRONIZAÇÃO E FIRESTORE
───────────────────────────────────────────────────────────────────────────── */

/**
 * Atualiza o resumo de patrimônio (bloco HMCRED) com base nos dados atuais.
 * Usa capitalDisponivel (não limiteTotal) para refletir o capital líquido em caixa.
 * Quando dinheiro sai para operações/promissórias, o patrimônio cai corretamente.
 */
async function atualizarPatrimonioHmcred() {
  const resumoExistente = await FirestoreService.obter('patrimonio', 'resumo');
  const patrimonioDocs = resumoExistente.sucesso ? resumoExistente.dados : { hmcred: 0, dinheiro: 0, cartoes: 0 };
  
  // Patrimônio HMCRED = capital disponível em caixa (sobe quando recebe, cai quando empresta)
  patrimonioDocs.hmcred = estado.configuracao.capitalDisponivel || 0;

  await FirestoreService.salvar('patrimonio', 'resumo', patrimonioDocs);
}

/**
 * Salva a configuração atual de HMCRED (limites) no Firestore.
 */
async function salvarConfiguracao() {
  await FirestoreService.salvar('hmcred', 'configuracao', estado.configuracao);
  await atualizarPatrimonioHmcred();
}

/**
 * Calcula o capital emprestado (soma das operações que NÃO estão pagas).
 */
function calcularCapitalEmprestado() {
  return estado.operacoes
    .filter(op => op.status !== 'pago')
    .reduce((acc, op) => acc + (op.valorConcedido || 0), 0);
}

/* ─────────────────────────────────────────────────────────────────────────────
   AÇÕES DO USUÁRIO (CRUD)
───────────────────────────────────────────────────────────────────────────── */

/**
 * Configura um limite inicial para HMCRED (útil para o first-run).
 */
async function definirLimiteInicial(evento, container) {
  evento.preventDefault();
  const formData = new FormData(evento.target);
  const valorDigitado = formData.get('limiteTotal');
  const limite = parseMoeda(valorDigitado);

  if (limite <= 0) {
    mostrarToast({ tipo: 'warning', titulo: 'Valor inválido', mensagem: 'O limite deve ser maior que zero.' });
    return;
  }

  estado.configuracao = {
    limiteTotal: limite,
    capitalDisponivel: limite
  };

  await salvarConfiguracao();
  HmcredModule.renderHmcred(container); // Re-renderiza a tela principal
}

/**
 * Abre modal de edição do capital base (acréscimo/ajuste de limite).
 */
function abrirModalEditarCapital() {
  const modal = document.getElementById('modal-editar-capital');
  if (!modal) return;
  const toVal = (v) => (v || 0).toFixed(2).replace('.', ',');
  document.getElementById('editar-capital-limite').value    = toVal(estado.configuracao.limiteTotal);
  document.getElementById('editar-capital-disponivel').value = toVal(estado.configuracao.capitalDisponivel);
  modal.classList.add('open');
}

/**
 * Salva o ajuste manual do capital base.
 */
async function salvarEdicaoCapital(evento) {
  evento.preventDefault();
  const btn = evento.target.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;

  const novoLimite = parseMoeda(document.getElementById('editar-capital-limite').value);
  const novoDisponivel = parseMoeda(document.getElementById('editar-capital-disponivel').value);

  if (novoLimite <= 0) {
    mostrarToast({ tipo: 'warning', titulo: 'Valor inválido', mensagem: 'O limite total deve ser maior que zero.' });
    if (btn) btn.disabled = false;
    return;
  }

  estado.configuracao.limiteTotal = novoLimite;
  estado.configuracao.capitalDisponivel = novoDisponivel;

  await salvarConfiguracao();
  if (btn) btn.disabled = false;
  fecharModal('modal-editar-capital');
  mostrarToast({ tipo: 'success', titulo: 'Capital atualizado!', mensagem: 'Os valores do HMCRED foram ajustados.' });
}

/**
 * Salva uma nova operação de crédito no Firestore.
 * Tipo 'credito': empréstimo padrão com juros
 * Tipo 'retirada_cartao': retirada via cartão parcelado sem juros
 */
async function criarOperacao(evento) {
  evento.preventDefault();
  const form = evento.target;
  const formData = new FormData(form);

  const tipoOperacao = formData.get('tipoOperacao') || 'credito';
  const valorConcedido = parseMoeda(formData.get('valorConcedido'));
  const clienteId = formData.get('clienteId');
  const cliente = clienteId ? estado.clientes.find(c => c.id === clienteId) : null;

  if (valorConcedido <= 0) {
    mostrarToast({ tipo: 'warning', titulo: 'Valor inválido', mensagem: 'Informe um valor maior que zero.' });
    return;
  }

  // Valida capital disponível APENAS para crédito próprio (retirada_cartao usa o limite do cartão)
  if (tipoOperacao === 'credito' && valorConcedido > estado.configuracao.capitalDisponivel) {
    mostrarToast({ tipo: 'warning', titulo: 'Saldo insuficiente', mensagem: `Capital disponível: ${formatarMoeda(estado.configuracao.capitalDisponivel)}` });
    return;
  }

  let novaOperacao;

  if (tipoOperacao === 'retirada_cartao') {
    // Retirada via cartão: parcelado sem juros
    const parcelas = parseInt(formData.get('parcelas')) || 1;
    const valorParcela = valorConcedido / parcelas;
    const cartaoOrigemId = formData.get('cartaoOrigemId');

    if (!cartaoOrigemId) {
      mostrarToast({ tipo: 'warning', titulo: 'Atenção', mensagem: 'Selecione um cartão para a retirada.' });
      return;
    }

    const cartao = estado.cartoes.find(c => c.id === cartaoOrigemId);
    if (!cartao || (cartao.limiteTotal - (cartao.valorUsado || 0)) < valorConcedido) {
      mostrarToast({ tipo: 'warning', titulo: 'Limite insuficiente', mensagem: 'O cartão selecionado não tem limite suficiente.' });
      return;
    }

    // Gera parcelas usando o diaVencimento do cartão (não a data de concessão)
    const diaVenc = parseInt(cartao.diaVencimento, 10) || new Date().getDate();
    const dataConcessao = formData.get('dataConcessao');
    const parcelasGeradas = gerarListaParcelasCartao(diaVenc, parcelas, valorParcela, dataConcessao);

    novaOperacao = {
      destino: formData.get('destino'),
      valorConcedido,
      valorReceber: valorConcedido, // sem juros
      taxaJuros: 0,
      parcelas,
      valorParcela,
      cartaoOrigemId,
      cartaoOrigemNome: cartao.nome,
      dataConcessao: formData.get('dataConcessao'),
      dataPrevista: formData.get('dataPrevista'),
      tipoOperacao: 'retirada_cartao',
      status: 'aberto',
      clienteId: cliente ? cliente.id : null,
      clienteNome: cliente ? cliente.nome : null,
      listaParcelas: parcelasGeradas
    };
  } else {
    // Crédito padrão com juros
    const taxaJuros = parseFloat(formData.get('taxaJuros')) || 0;
    const meses = parseInt(formData.get('meses')) || 0;
    // Campo readonly não é enviado pelo FormData em todos os navegadores;
    // lê diretamente do DOM para garantir o valor calculado.
    const inputValorReceber = document.getElementById('op-valor-receber');
    let valorReceber = inputValorReceber ? parseMoeda(inputValorReceber.value) : parseMoeda(formData.get('valorReceber'));

    // Fallback: se valorReceber ainda for 0, recalcula a partir dos campos
    if (valorReceber <= 0 && meses > 0) {
      if (taxaJuros > 0) {
        // Com juros: aplica a taxa
        valorReceber = valorConcedido + (valorConcedido * (taxaJuros / 100) * meses);
      } else {
        // Sem juros: valor a receber = valor concedido
        valorReceber = valorConcedido;
      }
    }
    // Último recurso: se meses = 0 e valorReceber = 0, usa o valorConcedido
    if (valorReceber <= 0) {
      valorReceber = valorConcedido;
    }

    novaOperacao = {
      destino: formData.get('destino'),
      valorConcedido,
      valorReceber,
      taxaJuros,
      meses,
      dataConcessao: formData.get('dataConcessao'),
      dataPrevista: formData.get('dataPrevista'),
      tipoOperacao: 'credito',
      status: 'aberto',
      clienteId: cliente ? cliente.id : null,
      clienteNome: cliente ? cliente.nome : null,
      listaParcelas: gerarListaParcelas(formData.get('dataConcessao'), meses || 1, valorReceber / (meses || 1))
    };
  }

  const btnSubmit = form.querySelector('button[type="submit"]');
  if (btnSubmit) btnSubmit.disabled = true;

  // Deduz do capital disponível apenas se for crédito próprio
  if (tipoOperacao === 'credito') {
    estado.configuracao.capitalDisponivel -= valorConcedido;
  } else if (tipoOperacao === 'retirada_cartao') {
    // Debita do cartão
    const cartao = estado.cartoes.find(c => c.id === novaOperacao.cartaoOrigemId);
    if (cartao) {
      await FirestoreService.atualizar('cartoes_lista', cartao.id, {
        valorUsado: (cartao.valorUsado || 0) + valorConcedido
      });
    }
  }

  const resOp = await FirestoreService.criar('hmcred_operacoes', novaOperacao);
  if (resOp.sucesso) {
    if (tipoOperacao === 'credito') await salvarConfiguracao();
    
    // Registra a concessão no histórico
    await FirestoreService.criar('lancamentos_hist', {
      modulo: 'hmcred',
      tipo: 'despesa', // Dinheiro saiu do HMCRED/Cartão para o cliente
      valor: valorConcedido,
      descricao: `Crédito Concedido: ${novaOperacao.destino}`,
      categoria: 'HMCRED - Concessão',
      data: new Date().toISOString().split('T')[0]
    });

    fecharModal('modal-nova-operacao');
    form.reset();
    // Reseta tabs para crédito
    const tabCredito = document.getElementById('tab-credito');
    if (tabCredito) tabCredito.click();
    mostrarToast({ tipo: 'success', titulo: 'Operação registrada!', mensagem: `${formatarMoeda(valorConcedido)} concedido/retirado com sucesso.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao salvar', mensagem: 'Tente novamente.' });
    // Reverte o capital em caso de erro
    if (tipoOperacao === 'credito') {
      estado.configuracao.capitalDisponivel += valorConcedido;
    } else if (tipoOperacao === 'retirada_cartao') {
      const cartao = estado.cartoes.find(c => c.id === novaOperacao.cartaoOrigemId);
      if (cartao) {
        await FirestoreService.atualizar('cartoes_lista', cartao.id, {
          valorUsado: Math.max(0, (cartao.valorUsado || 0) - valorConcedido)
        });
      }
    }
  }

  if (btnSubmit) btnSubmit.disabled = false;
}

/**
 * Função auxiliar para gerar as parcelas de uma operação (Mês a Mês).
 */
function gerarListaParcelas(dataInicial, totalParcelas, valorPorParcela) {
  const parcelas = [];
  let dataAtual = new Date(dataInicial + 'T12:00:00Z');
  
  for (let i = 1; i <= totalParcelas; i++) {
    // Adiciona 1 mês para a primeira parcela (ou usa dataInicial para a vista? Vamos usar +1 mês como padrão)
    dataAtual.setMonth(dataAtual.getMonth() + 1);
    
    parcelas.push({
      id: gerarIdUnico() + '_' + i,
      numero: i,
      valor: valorPorParcela,
      vencimento: dataAtual.toISOString().split('T')[0],
      pago: false
    });
  }
  return parcelas;
}

/**
 * Gera parcelas para retirada via cartão, usando o diaVencimento do cartão.
 * A 1ª parcela vence no próximo mês (no dia de vencimento do cartão).
 */
function gerarListaParcelasCartao(diaVencimento, totalParcelas, valorPorParcela, dataConcessao) {
  const parcelas = [];
  const baseDate = dataConcessao ? new Date(dataConcessao + 'T12:00:00') : new Date();

  for (let i = 1; i <= totalParcelas; i++) {
    const venc = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, diaVencimento);
    const strAno = venc.getFullYear();
    const strMes = String(venc.getMonth() + 1).padStart(2, '0');
    const strDia = String(venc.getDate()).padStart(2, '0');

    parcelas.push({
      id: gerarIdUnico() + '_' + i,
      numero: i,
      valor: valorPorParcela,
      vencimento: `${strAno}-${strMes}-${strDia}`,
      pago: false
    });
  }
  return parcelas;
}

/**
 * Paga uma parcela individualmente.
 */
async function pagarParcela(idOperacao, idParcela) {
  const operacao = estado.operacoes.find(op => op.id === idOperacao);
  if (!operacao) return;

  // Garante que listaParcelas existe (migração retroativa)
  if (!operacao.listaParcelas) {
    operacao.listaParcelas = gerarListaParcelas(operacao.dataConcessao, operacao.parcelas || operacao.meses || 1, operacao.valorParcela || operacao.valorReceber);
  }

  const parcela = operacao.listaParcelas.find(p => p.id === idParcela);
  if (!parcela || parcela.pago) return;

  if (!confirm(`Deseja marcar a Parcela ${parcela.numero} (${formatarMoeda(parcela.valor)}) como paga?`)) return;

  parcela.pago = true;
  parcela.dataPagamento = new Date().toISOString();

  // Verifica se todas as parcelas foram pagas para fechar a operação
  const todasPagas = operacao.listaParcelas.every(p => p.pago);
  
  const updates = { listaParcelas: operacao.listaParcelas };
  if (todasPagas) {
    updates.status = 'pago';
    updates.dataPagamento = new Date().toISOString();
  }

  await FirestoreService.atualizar('hmcred_operacoes', idOperacao, updates);

  // Historico e capital
  if (operacao.tipoOperacao === 'credito') {
    estado.configuracao.capitalDisponivel += parcela.valor;
    
    // Lucro pro-rata? Aqui é complexo, o lucro foi total lá no marcarComoPaga.
    // Vamos adicionar o lucro proporcional ao pagar cada parcela?
    // Em marcarComoPaga antigo: lucro = operacao.valorReceber - operacao.valorConcedido
    const lucroTotal = operacao.valorReceber - operacao.valorConcedido;
    const lucroPorParcela = lucroTotal / (operacao.meses || 1);
    estado.configuracao.limiteTotal += lucroPorParcela;

    await salvarConfiguracao();

    await FirestoreService.criar('lancamentos_hist', {
      modulo: 'hmcred',
      tipo: 'receita',
      valor: parcela.valor,
      descricao: `Parc. ${parcela.numero} HMCRED: ${operacao.destino}`,
      categoria: 'HMCRED - Recebimento',
      data: new Date().toISOString().split('T')[0]
    });
  } else if (operacao.tipoOperacao === 'retirada_cartao') {
    // Retirada Cartão: devolve o valor da parcela ao limite do cartão de origem
    if (operacao.cartaoOrigemId) {
      const cartaoOrigem = estado.cartoes.find(c => c.id === operacao.cartaoOrigemId);
      if (cartaoOrigem) {
        const novoValorUsado = Math.max(0, (cartaoOrigem.valorUsado || 0) - parcela.valor);
        await FirestoreService.atualizar('cartoes_lista', cartaoOrigem.id, {
          valorUsado: novoValorUsado
        });
      }
    }

    await FirestoreService.criar('lancamentos_hist', {
      modulo: 'hmcred',
      tipo: 'receita',
      valor: parcela.valor,
      descricao: `Parc. ${parcela.numero} Cartão: ${operacao.destino}`,
      categoria: 'HMCRED - Retorno Cartão',
      data: new Date().toISOString().split('T')[0]
    });
  }

  mostrarToast({ tipo: 'success', titulo: 'Parcela paga!', mensagem: `A parcela ${parcela.numero} foi baixada.` });
  // O dashboard re-renderizará automaticamente
}

/**
 * Marca uma operação como paga e devolve o valor (com lucro) ao capital disponível.
 */
async function marcarComoPaga(id) {
  if (!confirm('Deseja marcar esta operação como PAGA?')) return;

  const operacao = estado.operacoes.find(op => op.id === id);
  if (!operacao || operacao.status === 'pago') return;

  // Atualiza operação
  await FirestoreService.atualizar('hmcred_operacoes', id, { status: 'pago', dataPagamento: new Date().toISOString() });

  if (operacao.tipoOperacao === 'credito') {
    // Devolve ao caixa o valor a receber (concedido + lucro)
    estado.configuracao.capitalDisponivel += operacao.valorReceber;
    // O limite total também cresce pelo lucro obtido (reinvestimento)
    const lucro = operacao.valorReceber - operacao.valorConcedido;
    estado.configuracao.limiteTotal += lucro;

    await salvarConfiguracao();

    // Registra o recebimento no histórico
    await FirestoreService.criar('lancamentos_hist', {
      modulo: 'hmcred',
      tipo: 'receita', // Dinheiro voltou com lucro
      valor: operacao.valorReceber,
      descricao: `Recebimento HMCRED: ${operacao.destino}`,
      categoria: 'HMCRED - Recebimento',
      data: new Date().toISOString().split('T')[0]
    });

    mostrarToast({ tipo: 'success', titulo: 'Operação paga!', mensagem: `${formatarMoeda(operacao.valorReceber)} devolvido ao capital HMCRED.` });
  } else if (operacao.tipoOperacao === 'retirada_cartao') {
    // Devolve o limite ao cartão de origem
    if (operacao.cartaoOrigemId) {
      const cartaoOrigem = estado.cartoes.find(c => c.id === operacao.cartaoOrigemId);
      if (cartaoOrigem) {
        // Calcula quanto falta devolver (desconta parcelas já pagas)
        const parcelasPagas = operacao.listaParcelas ? operacao.listaParcelas.filter(p => p.pago).length : 0;
        const valorJaDevolvido = parcelasPagas * (operacao.valorParcela || 0);
        const valorADevolver = Math.max(0, operacao.valorConcedido - valorJaDevolvido);
        if (valorADevolver > 0) {
          const novoValorUsado = Math.max(0, (cartaoOrigem.valorUsado || 0) - valorADevolver);
          await FirestoreService.atualizar('cartoes_lista', cartaoOrigem.id, {
            valorUsado: novoValorUsado
          });
        }
      }
    }

    // Registra o recebimento no histórico
    await FirestoreService.criar('lancamentos_hist', {
      modulo: 'hmcred',
      tipo: 'receita',
      valor: operacao.valorConcedido,
      descricao: `Recebimento Cartão: ${operacao.destino}`,
      categoria: 'HMCRED - Retorno Cartão',
      data: new Date().toISOString().split('T')[0]
    });

    mostrarToast({ tipo: 'success', titulo: 'Operação paga!', mensagem: `Retirada via cartão finalizada. Lembre-se de registrar a entrada na conta desejada (Dinheiro).` });
  }
}

/**
 * Exclui uma operação. Se estava em aberto, estorna o valor concedido ao capital disponível.
 */
async function excluirOperacao(id) {
  if (!confirm('Atenção: Tem certeza que deseja excluir esta operação permanentemente?')) return;

  const operacao = estado.operacoes.find(op => op.id === id);
  if (!operacao) return;

  await FirestoreService.excluir('hmcred_operacoes', id);

  // Se não estava pago, estorna
  if (operacao.status !== 'pago') {
    if (operacao.tipoOperacao === 'credito') {
      estado.configuracao.capitalDisponivel += operacao.valorConcedido;
      await salvarConfiguracao();
    } else if (operacao.tipoOperacao === 'retirada_cartao' && operacao.cartaoOrigemId) {
      // Estorna do limite do cartão
      const cartao = estado.cartoes.find(c => c.id === operacao.cartaoOrigemId);
      if (cartao) {
        await FirestoreService.atualizar('cartoes_lista', cartao.id, {
          valorUsado: Math.max(0, (cartao.valorUsado || 0) - operacao.valorConcedido)
        });
      }
    }
  }
  mostrarToast({ tipo: 'success', titulo: 'Operação excluída', mensagem: 'O valor foi estornado.' });
}

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITÁRIOS
───────────────────────────────────────────────────────────────────────────── */

function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO
───────────────────────────────────────────────────────────────────────────── */

function renderizarModais() {
  const opcoesCartoes = estado.cartoes.length > 0 
    ? estado.cartoes.map(c => {
        const limiteDisponivel = c.limiteTotal - (c.valorUsado || 0);
        return `<option value="${c.id}">${c.nome} (Livre: ${formatarMoeda(limiteDisponivel)})</option>`;
      }).join('')
    : '<option value="">Nenhum cartão cadastrado</option>';

  const opcoesClientes = estado.clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');

  return `
    <!-- ── Modal: Nova Operação ── -->
    <div class="modal-overlay" id="modal-nova-operacao" role="dialog" aria-modal="true">
      <div class="modal" style="max-width: 520px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title">Nova Operação de Crédito</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-nova-operacao').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-nova-operacao" novalidate>
          <input type="hidden" name="tipoOperacao" id="input-tipo-operacao" value="credito">
          <div class="modal-body">

            <!-- Tabs: Tipo de Operação -->
            <div style="display: flex; gap: var(--space-2); background: var(--bg-overlay); padding: 4px; border-radius: var(--radius-md); margin-bottom: var(--space-5);">
              <button type="button" id="tab-credito" class="btn btn-sm btn-primary" style="flex: 1;"
                      onclick="hmcredSelecionarTipoOp('credito')">
                <span class="material-symbols-outlined icon-sm">handshake</span>
                Crédito / Empréstimo
              </button>
              <button type="button" id="tab-cartao" class="btn btn-sm btn-ghost" style="flex: 1;"
                      onclick="hmcredSelecionarTipoOp('retirada_cartao')">
                <span class="material-symbols-outlined icon-sm">credit_card</span>
                Retirada via Cartão
              </button>
            </div>

            <!-- Campo: Cliente (Opcional) -->
            <div class="form-group">
              <label class="form-label" for="op-cliente">Vincular a Cliente (Opcional)</label>
              <select id="op-cliente" name="clienteId" class="form-input form-select">
                <option value="">Nenhum (Avulso)</option>
                ${opcoesClientes}
              </select>
            </div>

            <!-- Campo: Destino -->
            <div class="form-group">
              <label class="form-label" for="op-destino">Destino (Cliente / Finalidade) <span class="required">*</span></label>
              <input type="text" id="op-destino" name="destino" class="form-input" required autocomplete="off"
                     placeholder="Ex: João Silva, Investimento, Compra...">
            </div>

            <!-- Campo: Valor Concedido -->
            <div class="form-group">
              <label class="form-label" for="op-valor-concedido">Valor (R$) <span class="required">*</span></label>
              <input type="text" id="op-valor-concedido" name="valorConcedido" class="form-input"
                     placeholder="0,00" required inputmode="decimal">
              <small class="text-muted" style="display:block; margin-top: 4px;">
                Disponível: <strong class="text-success">${formatarMoeda(estado.configuracao.capitalDisponivel)}</strong>
              </small>
            </div>

            <!-- Seção Crédito com Juros -->
            <div id="secao-credito">
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-3);">
                <div class="form-group">
                  <label class="form-label" for="op-taxa-juros">Taxa Juros (%/mês)</label>
                  <input type="number" step="0.01" id="op-taxa-juros" name="taxaJuros" class="form-input"
                         placeholder="Ex: 5" min="0">
                </div>
                <div class="form-group">
                  <label class="form-label" for="op-meses">Meses</label>
                  <input type="number" id="op-meses" name="meses" class="form-input"
                         placeholder="Ex: 4" min="0">
                </div>
                <div class="form-group">
                  <label class="form-label" for="op-valor-receber">A Receber (R$)</label>
                  <input type="text" id="op-valor-receber" name="valorReceber" class="form-input"
                         placeholder="Calculado" inputmode="decimal" style="background-color: var(--bg-overlay); font-weight: var(--font-bold); color: var(--color-success);" readonly>
                </div>
              </div>
              <div id="preview-juros" style="display:none; background: var(--color-success-muted); border-radius: var(--radius-md); padding: var(--space-3); margin-bottom: var(--space-4); font-size: var(--text-sm);">
                <span class="material-symbols-outlined icon-sm" style="color: var(--color-success); vertical-align: middle;">trending_up</span>
                <span id="preview-juros-texto" style="color: var(--color-success); font-weight: var(--font-semibold);"></span>
              </div>
            </div>

            <!-- Seção Retirada via Cartão -->
            <div id="secao-cartao" style="display: none;">
              <div class="form-group">
                <label class="form-label" for="op-cartao">Cartão de Origem <span class="required">*</span></label>
                <select id="op-cartao" name="cartaoOrigemId" class="form-input form-select" ${estado.cartoes.length === 0 ? 'disabled' : ''}>
                  <option value="">Selecione um cartão...</option>
                  ${opcoesCartoes}
                </select>
                ${estado.cartoes.length === 0 ? '<small class="text-danger" style="display:block; margin-top:4px;">Nenhum cartão cadastrado no módulo Cartões.</small>' : ''}
              </div>
              <div class="form-group">
                <label class="form-label" for="op-parcelas">Número de Parcelas (sem juros)</label>
                <select id="op-parcelas" name="parcelas" class="form-input form-select">
                  ${Array.from({length: 12}, (_, i) => `<option value="${i+1}">${i+1}x (${i+1 === 1 ? 'à vista' : `${i+1} parcelas`})</option>`).join('')}
                </select>
              </div>
              <div id="preview-parcela" style="background: var(--color-info-muted); border-radius: var(--radius-md); padding: var(--space-3); margin-bottom: var(--space-4); font-size: var(--text-sm); display: none;">
                <span class="material-symbols-outlined icon-sm" style="color: var(--color-info); vertical-align: middle;">credit_card</span>
                <span id="preview-parcela-texto" style="color: var(--color-info); font-weight: var(--font-semibold);"></span>
              </div>
            </div>

            <!-- Datas -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
              <div class="form-group">
                <label class="form-label" for="op-data-concessao">Data de Concessão</label>
                <input type="date" id="op-data-concessao" name="dataConcessao" class="form-input" required>
              </div>
              <div class="form-group">
                <label class="form-label" for="op-data-prevista">Data Prevista p/ Retorno</label>
                <input type="date" id="op-data-prevista" name="dataPrevista" class="form-input" required>
              </div>
            </div>

          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-nova-operacao').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">
              <span class="material-symbols-outlined">check_circle</span>
              Confirmar Operação
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ── Modal: Editar Capital Base ── -->
    <div class="modal-overlay" id="modal-editar-capital" role="dialog" aria-modal="true">
      <div class="modal" style="max-width: 400px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title">Editar Capital HMCRED</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-editar-capital').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-editar-capital" novalidate>
          <div class="modal-body">
            <div style="background-color: var(--color-info-muted); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4); font-size: var(--text-sm); color: var(--text-secondary);">
              <span class="material-symbols-outlined icon-sm" style="vertical-align: middle;">info</span>
              Use para acrescentar capital ou corrigir os valores base do HMCRED.
            </div>
            <div class="form-group">
              <label class="form-label" for="editar-capital-limite">Limite Total (R$) <span class="required">*</span></label>
              <input type="text" id="editar-capital-limite" class="form-input" inputmode="decimal" placeholder="0,00">
            </div>
            <div class="form-group">
              <label class="form-label" for="editar-capital-disponivel">Capital Disponível (R$)</label>
              <input type="text" id="editar-capital-disponivel" class="form-input" inputmode="decimal" placeholder="0,00">
              <small class="text-muted" style="display: block; margin-top: 4px;">Quanto está livre para novas operações.</small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-editar-capital').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">
              <span class="material-symbols-outlined">save</span>
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderizarLinhaOperacao(op) {
  const badges = {
    aberto: '<span class="badge badge-warning">Em aberto</span>',
    pago: '<span class="badge badge-success">Pago</span>',
    atrasado: '<span class="badge badge-danger">Atrasado</span>',
  };

    const tipoLabel = op.tipoOperacao === 'retirada_cartao'
    ? `<span class="badge badge-neutral" style="font-size: 10px;">Cartão ${op.parcelas}x (${escapeHTML(op.cartaoOrigemNome) || '?'})</span>`
    : `<span class="badge badge-neutral" style="font-size: 10px;">${op.taxaJuros ? op.taxaJuros + '%/mês' : 'Crédito'}</span>`;

  // Linha extra com data de concessão visível na segunda linha do destino
  const dataConcessaoLabel = op.dataConcessao
    ? `<div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 2px;">
        <span class="material-symbols-outlined" style="font-size: 11px; vertical-align: middle;">event</span>
        Concedido em: <strong>${formatarData(op.dataConcessao)}</strong>
       </div>`
    : '';

  return `
    <tr>
      <td>
        <div>${escapeHTML(op.destino)}</div>
        ${tipoLabel}
        ${dataConcessaoLabel}
      </td>
      <td class="value-sensitive">${formatarMoeda(op.valorConcedido)}</td>
      <td class="value-sensitive text-success">${formatarMoeda(op.valorReceber)}</td>
      <td>${formatarData(op.dataPrevista)}</td>
      <td>${badges[op.status] || op.status}</td>
      <td class="text-right">
        <button class="btn btn-ghost btn-icon text-info" title="Ver Parcelas" onclick="document.getElementById('parcelas-${op.id}').style.display = document.getElementById('parcelas-${op.id}').style.display === 'none' ? 'table-row' : 'none'">
          <span class="material-symbols-outlined">expand_more</span>
        </button>
        ${op.status !== 'pago' ? `
          <button class="btn btn-ghost btn-icon text-success" title="Pagar operação total" data-acao="pagar" data-id="${op.id}">
            <span class="material-symbols-outlined">payments</span>
          </button>
        ` : ''}
        <button class="btn btn-ghost btn-icon text-info" title="Editar operação" data-acao="editar" data-id="${op.id}">
          <span class="material-symbols-outlined">edit</span>
        </button>
        <button class="btn btn-ghost btn-icon text-danger" title="Excluir operação" data-acao="excluir" data-id="${op.id}">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </td>
    </tr>
    <!-- Linha expansível das parcelas -->
    <tr id="parcelas-${op.id}" style="display: none; background: var(--bg-surface);">
      <td colspan="6" style="padding: var(--space-4); border-top: none;">
        <div style="background: var(--bg-base); border-radius: var(--radius-md); padding: var(--space-4); border: 1px solid var(--border-subtle);">
          <h4 style="margin-top: 0; margin-bottom: var(--space-3); font-size: var(--text-sm); color: var(--text-muted);">
            Parcelas da Operação
          </h4>
          <div style="display: grid; gap: var(--space-2);">
            ${op.listaParcelas ? op.listaParcelas.map(p => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-2) var(--space-3); background: var(--bg-surface); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                <div>
                  <span style="font-weight: var(--font-medium); margin-right: var(--space-2);">Parc. ${p.numero}</span>
                  <span class="value-sensitive text-success" style="font-weight: bold;">${formatarMoeda(p.valor)}</span>
                  <span style="color: var(--text-muted); font-size: var(--text-xs); margin-left: var(--space-2);">Vence em: ${formatarData(p.vencimento)}</span>
                </div>
                <div>
                  ${p.pago ? `
                    <span class="badge badge-success">Paga</span>
                  ` : `
                    <button class="btn btn-sm btn-ghost text-success" style="padding: 4px 8px;" data-acao="pagar-parcela" data-id-op="${op.id}" data-id-parc="${p.id}">
                      <span class="material-symbols-outlined icon-sm">check</span>
                      Dar Baixa
                    </button>
                  `}
                </div>
              </div>
            `).join('') : `
              <div style="text-align: center; color: var(--text-muted); padding: var(--space-2); font-size: var(--text-sm);">
                Parcelas não geradas para esta operação antiga. <button class="btn btn-sm btn-ghost text-info" onclick="gerarRetroativoEAtualizar('${op.id}')">Gerar agora</button>
              </div>
            `}
          </div>
        </div>
      </td>
    </tr>
  `;
}

/* ─────────────────────────────────────────────────────────────────────────────
   AGRUPAMENTO DE OPERAÇÕES POR DESTINO
───────────────────────────────────────────────────────────────────────────── */

/**
 * Agrupa as operações de crédito por destinatário.
 * Usa clienteId como chave (quando existir), caso contrário usa o texto de destino.
 * Dentro de cada grupo, ordena por dataConcessao (mais recente primeiro).
 *
 * @param {Array} operacoes - Lista de operações do estado
 * @returns {Array} Grupos no formato { chave, nomeDestino, totalConcedido, totalAReceber, operacoes[] }
 */
function agruparOperacoesPorDestino(operacoes) {
  const mapaGrupos = new Map();

  operacoes.forEach(op => {
    const chave = op.clienteId || op.destino || 'Desconhecido';
    if (!mapaGrupos.has(chave)) {
      mapaGrupos.set(chave, {
        chave,
        nomeDestino: op.destino || 'Desconhecido',
        totalConcedido: 0,
        totalAReceber: 0,
        operacoes: []
      });
    }
    const grupo = mapaGrupos.get(chave);
    grupo.totalConcedido += op.valorConcedido || 0;
    grupo.totalAReceber  += op.valorReceber || 0;
    grupo.operacoes.push(op);
  });

  // Ordena operações dentro de cada grupo: mais recentes primeiro
  mapaGrupos.forEach(grupo => {
    grupo.operacoes.sort((a, b) => {
      const dA = a.dataConcessao || a.criadoEm?.toDate?.()?.toISOString() || '';
      const dB = b.dataConcessao || b.criadoEm?.toDate?.()?.toISOString() || '';
      return dB.localeCompare(dA);
    });
  });

  return Array.from(mapaGrupos.values());
}

/**
 * Gera the HTML da linha de cabeçalho de um grupo de operações.
 *
 * @param {object} grupo - Grupo retornado por agruparOperacoesPorDestino
 * @returns {string} HTML da linha de cabeçalho
 */
function renderizarCabecalhoGrupo(grupo) {
  const opsAbertas = grupo.operacoes.filter(o => o.status !== 'pago').length;
  return `
    <tr style="background: var(--bg-overlay); border-top: 2px solid var(--border-default);">
      <td colspan="6" style="padding: var(--space-3) var(--space-4);">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2);">
          <div style="display: flex; align-items: center; gap: var(--space-2);">
            <span class="material-symbols-outlined" style="font-size: 18px; color: var(--color-gold);">person</span>
            <span style="font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--text-primary);">${escapeHTML(grupo.nomeDestino)}</span>
            <span class="badge badge-neutral" style="font-size: 10px;">${grupo.operacoes.length} operação${grupo.operacoes.length > 1 ? 'ões' : ''}</span>
            ${opsAbertas > 0 ? `<span class="badge badge-warning" style="font-size: 10px;">${opsAbertas} em aberto</span>` : '<span class="badge badge-success" style="font-size: 10px;">Tudo quitado</span>'}
          </div>
          <div style="display: flex; gap: var(--space-6); font-size: var(--text-xs);">
            <span>Concedido: <strong class="value-sensitive">${formatarMoeda(grupo.totalConcedido)}</strong></span>
            <span>A receber: <strong class="value-sensitive text-success">${formatarMoeda(grupo.totalAReceber)}</strong></span>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function renderizarTelaPrincipal(container) {
  _container = container;

  // Tela de first-run (se limite total for zero)
  if (!estado.configuracao.limiteTotal || estado.configuracao.limiteTotal <= 0) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">HMCRED</h2>
          <p class="page-subtitle">Sistema de crédito próprio.</p>
        </div>
      </div>
      <div class="card" style="max-width: 500px; margin: 0 auto; text-align: center;">
        <div class="card-body">
          <span class="material-symbols-outlined text-info" style="font-size: 48px; margin-bottom: 16px;">local_atm</span>
          <h3>Defina seu capital inicial</h3>
          <p class="text-muted" style="margin-bottom: 24px;">Qual o montante total destinado para operações de HMCRED?</p>
          <form id="form-limite-inicial">
            <input type="text" name="limiteTotal" class="form-input" placeholder="R$ 0,00" required
                   style="text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 16px;">
            <button type="submit" class="btn btn-primary" style="width: 100%;">Começar Operações</button>
          </form>
        </div>
      </div>
    `;
    const formLimite = document.getElementById('form-limite-inicial');
    formLimite.addEventListener('submit', (e) => definirLimiteInicial(e, container));
    return;
  }

  const capitalEmprestado = calcularCapitalEmprestado();

  // Tela Principal
  container.innerHTML = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-4);">
      <div>
        <h2 class="page-title">HMCRED</h2>
        <p class="page-subtitle">Gestão de crédito e empréstimos.</p>
      </div>
      <div style="display: flex; gap: var(--space-3);">
        <button class="btn btn-secondary" id="btn-editar-capital" aria-label="Editar capital base">
          <span class="material-symbols-outlined">edit</span>
          Editar Capital
        </button>
        <button class="btn btn-primary" id="btn-nova-operacao" aria-label="Nova operação">
          <span class="material-symbols-outlined">add</span>
          Nova Operação
        </button>
      </div>
    </div>

    <div class="stats-grid" role="region" aria-label="Indicadores HMCRED">
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Limite Total (Capital Base)</span>
          <div class="stat-card-icon text-muted"><span class="material-symbols-outlined">account_balance</span></div>
        </div>
        <div class="stat-card-value value-sensitive">${formatarMoeda(estado.configuracao.limiteTotal)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Capital Disponível</span>
          <div class="stat-card-icon" style="background-color: var(--color-success-muted); color: var(--color-success);">
            <span class="material-symbols-outlined">check_circle</span>
          </div>
        </div>
        <div class="stat-card-value text-success value-sensitive">${formatarMoeda(estado.configuracao.capitalDisponivel)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Capital Emprestado</span>
          <div class="stat-card-icon" style="background-color: var(--color-warning-muted); color: var(--color-warning);">
            <span class="material-symbols-outlined">outbound</span>
          </div>
        </div>
        <div class="stat-card-value text-warning value-sensitive">${formatarMoeda(capitalEmprestado)}</div>
      </div>
    </div>

    <div class="dashboard-section-header" style="margin-top: var(--space-8);">
      <h3 class="text-lg font-semibold">Operações de Crédito</h3>
    </div>
    ${criarHTMLBarraFiltros({ prefixo: 'hmcred', labelBusca: 'Buscar por destino ou cliente...' })}

    <div class="card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Destino / Cliente</th>
              <th>Concedido</th>
              <th>A Receber</th>
              <th>Previsão Retorno</th>
              <th>Status</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              // Aplica filtros de texto e data antes de agrupar
              const inputBusca  = document.querySelector('#hmcred-busca');
              const inputInicio = document.querySelector('#hmcred-data-inicio');
              const inputFim    = document.querySelector('#hmcred-data-fim');
              const termo      = inputBusca?.value.trim().toLowerCase() || '';
              const dataInicio = inputInicio?.value || null;
              const dataFim    = inputFim?.value    || null;
              const opsFiltradas = filtrarLista(estado.operacoes, {
                campoTexto: 'destino',
                termo,
                campoData: 'dataConcessao',
                dataInicio,
                dataFim,
              });
              if (opsFiltradas.length === 0) {
                return `<tr><td colspan="6" class="text-center text-muted" style="padding: 24px;">Nenhuma operação encontrada.</td></tr>`;
              }
              const grupos = agruparOperacoesPorDestino(opsFiltradas);
              return grupos.map(grupo =>
                renderizarCabecalhoGrupo(grupo) +
                grupo.operacoes.map(renderizarLinhaOperacao).join('')
              ).join('');
            })()}
          </tbody>
        </table>
      </div>
    </div>

    ${renderizarModais()}
  `;

  // Expõe a função de seleção de tipo ao escopo global para os onclick inline
  window.hmcredSelecionarTipoOp = (tipo) => {
    document.getElementById('input-tipo-operacao').value = tipo;
    const tabCredito = document.getElementById('tab-credito');
    const tabCartao  = document.getElementById('tab-cartao');
    const secCredito = document.getElementById('secao-credito');
    const secCartao  = document.getElementById('secao-cartao');

    if (tipo === 'credito') {
      tabCredito.classList.replace('btn-ghost', 'btn-primary');
      tabCartao.classList.replace('btn-primary', 'btn-ghost');
      secCredito.style.display = 'block';
      secCartao.style.display  = 'none';
    } else {
      tabCartao.classList.replace('btn-ghost', 'btn-primary');
      tabCredito.classList.replace('btn-primary', 'btn-ghost');
      secCartao.style.display  = 'block';
      secCredito.style.display = 'none';
    }
  };

  // Listeners de cálculo automático de juros
  const inpValor  = document.getElementById('op-valor-concedido');
  const inpTaxa   = document.getElementById('op-taxa-juros');
  const inpMeses  = document.getElementById('op-meses');
  const inpReceiv = document.getElementById('op-valor-receber');
  const preview   = document.getElementById('preview-juros');
  const previewTx = document.getElementById('preview-juros-texto');

  function recalcularJuros() {
    const valor = parseMoeda(inpValor.value);
    const taxa  = parseFloat(inpTaxa.value) || 0;
    const meses = parseInt(inpMeses.value) || 0;

    if (valor > 0 && meses > 0) {
      if (taxa > 0) {
        const jurosTotal = valor * (taxa / 100) * meses;
        const totalFinal = valor + jurosTotal;
        inpReceiv.value = totalFinal.toFixed(2).replace('.', ',');
        previewTx.textContent = `${formatarMoeda(valor)} × ${taxa}% × ${meses} mês${meses > 1 ? 'es' : ''} = Juros de ${formatarMoeda(jurosTotal)} → Total: ${formatarMoeda(totalFinal)}`;
        preview.style.display = 'block';
      } else {
        // Sem juros: valor a receber = valor concedido
        inpReceiv.value = valor.toFixed(2).replace('.', ',');
        preview.style.display = 'none';
      }
    } else {
      inpReceiv.value = '';
      preview.style.display = 'none';
    }
  }

  if (inpValor)  inpValor.addEventListener('input', recalcularJuros);
  if (inpTaxa)   inpTaxa.addEventListener('input', recalcularJuros);
  if (inpMeses)  inpMeses.addEventListener('input', recalcularJuros);

  // Preview de parcelas para retirada via cartão
  const inpParcelas    = document.getElementById('op-parcelas');
  const prevParcela    = document.getElementById('preview-parcela');
  const prevParcelaTx  = document.getElementById('preview-parcela-texto');

  function recalcularParcelas() {
    const valor    = parseMoeda(inpValor.value);
    const parcelas = parseInt(inpParcelas.value) || 1;
    if (valor > 0) {
      const valorParc = valor / parcelas;
      prevParcelaTx.textContent = `${parcelas}x de ${formatarMoeda(valorParc)} sem juros`;
      prevParcela.style.display = 'block';
    } else {
      prevParcela.style.display = 'none';
    }
  }

  if (inpValor)   inpValor.addEventListener('input', recalcularParcelas);
  if (inpParcelas) inpParcelas.addEventListener('change', recalcularParcelas);

  // Botão Nova Operação
  const btnNova = document.getElementById('btn-nova-operacao');
  if (btnNova) btnNova.addEventListener('click', () => abrirModal('modal-nova-operacao'));

  // Filtro de texto + data
  registrarEventosFiltros(container, {
    prefixo: 'hmcred',
    onFiltrar: () => renderizarTelaPrincipal(container)
  });

  // Botão Editar Capital
  const btnEditarCap = document.getElementById('btn-editar-capital');
  if (btnEditarCap) btnEditarCap.addEventListener('click', () => abrirModalEditarCapital());

  // Formulário nova operação
  const formNovaOp = document.getElementById('form-nova-operacao');
  if (formNovaOp) formNovaOp.addEventListener('submit', criarOperacao);

  // Formulário editar capital
  const formEditarCap = document.getElementById('form-editar-capital');
  if (formEditarCap) formEditarCap.addEventListener('submit', salvarEdicaoCapital);

  // Listeners de ações da tabela (delegação de eventos)
  container.querySelectorAll('[data-acao]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const acao = btn.getAttribute('data-acao');
      const id = btn.getAttribute('data-id') || btn.getAttribute('data-id-op');
      if (acao === 'excluir') {
        excluirOperacao(id);
      } else if (acao === 'pagar') {
        marcarComoPaga(id);
      } else if (acao === 'pagar-parcela') {
        const idParc = btn.getAttribute('data-id-parc');
        pagarParcela(id, idParc);
      } else if (acao === 'editar') {
        abrirModalEdicaoHmCred(id, estado);
      }
    });
  });

  // Anexa a função pro botão HTML string
  window.gerarRetroativoEAtualizar = async (idOp) => {
    const operacao = estado.operacoes.find(o => o.id === idOp);
    if (operacao && !operacao.listaParcelas) {
      operacao.listaParcelas = gerarListaParcelas(operacao.dataConcessao, operacao.parcelas || operacao.meses || 1, operacao.valorParcela || operacao.valorReceber);
      await FirestoreService.atualizar('hmcred_operacoes', idOp, { listaParcelas: operacao.listaParcelas });
      mostrarToast({tipo: 'success', titulo: 'Parcelas geradas', mensagem: 'Atualizado com sucesso.'});
    }
  };

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
export const HmcredModule = {

  async renderHmcred(container) {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    _container = container;

    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
        <p>Carregando HMCRED...</p>
      </div>
    `;

    // Carregar configurações iniciais (uma única vez)
    const resConfig = await FirestoreService.obter('hmcred', 'configuracao');
    
    injetarModalEdicaoHmCred(estado);
    
    if (resConfig.sucesso) {
      estado.configuracao = resConfig.dados;
    }

    // Escutar operações em tempo real
    if (unsubscribeOperacoes) unsubscribeOperacoes();
    unsubscribeOperacoes = FirestoreService.escutar('hmcred_operacoes', (operacoes) => {
      estado.operacoes = operacoes;
      // Não re-renderiza se o modal estiver aberto (evita resetar o estado do formulário)
      const modalAberto = document.getElementById('modal-nova-operacao')?.classList.contains('open');
      if (!modalAberto) renderizarTelaPrincipal(container);
    }, { ordenarPor: 'dataPrevista', direcao: 'asc' });

    // Escutar cartões em tempo real (apenas para manter o estado atualizado)
    if (unsubscribeCartoes) unsubscribeCartoes();
    unsubscribeCartoes = FirestoreService.escutar('cartoes_lista', (cartoes) => {
      estado.cartoes = cartoes;
      // Só re-renderiza se a rota ativa for hmcred (evita abrir a aba de cartões)
      const rotaAtual = window.location.hash.replace('#', '');
      if (rotaAtual !== 'hmcred') return;
      // Não re-renderiza se o modal estiver aberto
      const modalAberto = document.getElementById('modal-nova-operacao')?.classList.contains('open');
      if (!modalAberto) renderizarTelaPrincipal(container);
    });

    // Escutar clientes em tempo real
    if (unsubscribeClientes) unsubscribeClientes();
    unsubscribeClientes = FirestoreService.escutar('clientes', (clientes) => {
      estado.clientes = clientes;
      // Não re-renderiza se o modal estiver aberto
      const modalAberto = document.getElementById('modal-nova-operacao')?.classList.contains('open');
      if (!modalAberto) renderizarTelaPrincipal(container);
    });

    // Se estiver vazio (primeiro acesso) a tela já reage
    if (!resConfig.sucesso) {
      renderizarTelaPrincipal(container);
    }
  }
};
