/**
 * HM Finanças — Módulo: Promissórias (Módulo 8)
 * ============================================================
 * Gerenciamento de promissórias e investimentos em terceiros.
 */

'use strict';

import { AuthService }      from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, formatarData, parseMoeda } from '../../utils/formatters.js';
import { mostrarToast, calcularStatusVencimento } from '../../utils/helpers.js';

let estado = {
  promissorias: [],
  clientes: [],
  contasDinheiro: [], // Necessário para listar as origens quando "Dinheiro" é escolhido
  filtroStatus: 'ativas', // 'ativas' (pendente+atrasada), 'recebidas'
  carregando: true
};

let unsubscribePromissorias = null;
let unsubscribeClientes = null;
let unsubscribeDinheiro = null;

/* ─────────────────────────────────────────────────────────────────────────────
   REGRAS DE NEGÓCIO E SINCRONIZAÇÃO
───────────────────────────────────────────────────────────────────────────── */

/**
 * Retorna o status real da promissória considerando a data atual.
 */
function obterStatusReal(promissoria) {
  const statusVencimento = calcularStatusVencimento(promissoria.dataVencimento, promissoria.status);
  
  if (statusVencimento === 'hoje' || statusVencimento === 'amanha') return 'pendente';
  return statusVencimento;
}

/**
 * Recalcula o total em promissórias ativas/atrasadas de um cliente e salva.
 */
async function atualizarTotalCliente(clienteId) {
  const promissoriasDoCliente = estado.promissorias.filter(p => 
    p.clienteId === clienteId && p.status !== 'recebida'
  );
  
  // O que conta como dívida para o cliente? O valor total (investido + lucro).
  const total = promissoriasDoCliente.reduce((acc, p) => acc + (p.valorInvestido + p.lucro), 0);
  
  await FirestoreService.atualizar('clientes', clienteId, { promissoriasEmAberto: total });
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

  const origem = formData.get('origem'); // 'hmcred' ou 'dinheiro'
  const origemReferenciaId = formData.get('origemReferenciaId'); // ID da conta (se dinheiro)

  const novaPromissoria = {
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    descricao: formData.get('descricao').trim(),
    valorInvestido: parseMoeda(formData.get('valorInvestido')),
    lucro: parseMoeda(formData.get('lucro')),
    dataVencimento: formData.get('dataVencimento'),
    origem: origem,
    origemReferenciaId: origem === 'dinheiro' ? origemReferenciaId : null,
    status: 'pendente'
  };

  if (novaPromissoria.valorInvestido <= 0) {
    mostrarToast({ tipo: 'warning', titulo: 'Atenção', mensagem: 'O valor investido deve ser maior que zero.' });
    return;
  }
  if (origem === 'dinheiro' && !origemReferenciaId) {
    mostrarToast({ tipo: 'warning', titulo: 'Atenção', mensagem: 'Selecione a conta de origem do dinheiro.' });
    return;
  }

  const btnSubmit = form.querySelector('button[type="submit"]');
  if (btnSubmit) btnSubmit.disabled = true;

  // 1. Debitar da origem correspondente
  if (origem === 'hmcred') {
    const resConfig = await FirestoreService.obter('hmcred', 'configuracao');
    if (!resConfig.sucesso) {
      mostrarToast({ tipo: 'danger', titulo: 'Erro', mensagem: 'Não foi possível ler configurações do HMCRED.' });
      if (btnSubmit) btnSubmit.disabled = false;
      return;
    }
    const hmcredConfig = resConfig.dados;
    if (novaPromissoria.valorInvestido > hmcredConfig.capitalDisponivel) {
      mostrarToast({ tipo: 'warning', titulo: 'Saldo insuficiente', mensagem: 'Capital disponível no HMCRED é menor que o valor investido.' });
      if (btnSubmit) btnSubmit.disabled = false;
      return;
    }
    await FirestoreService.atualizar('hmcred', 'configuracao', {
      capitalDisponivel: hmcredConfig.capitalDisponivel - novaPromissoria.valorInvestido
    });
  } else if (origem === 'dinheiro') {
    const conta = estado.contasDinheiro.find(c => c.id === origemReferenciaId);
    if (!conta || novaPromissoria.valorInvestido > conta.saldo) {
      mostrarToast({ tipo: 'warning', titulo: 'Saldo insuficiente', mensagem: 'A conta selecionada não possui saldo suficiente.' });
      if (btnSubmit) btnSubmit.disabled = false;
      return;
    }
    await FirestoreService.atualizar('dinheiro_contas', origemReferenciaId, {
      saldo: conta.saldo - novaPromissoria.valorInvestido
    });
    // Atualiza também os totais do módulo Dinheiro e Patrimônio
    await sincronizarDinheiroExterno();
  }

  // 2. Criar a promissória
  const res = await FirestoreService.criar('promissorias', novaPromissoria);

  if (res.sucesso) {
    estado.promissorias.push({ id: res.id, ...novaPromissoria });
    await atualizarTotalCliente(cliente.id);
    await atualizarResumoPatrimonio();

    fecharModal('modal-nova-promissoria');
    form.reset();
    mostrarToast({ tipo: 'success', titulo: 'Promissória criada!', mensagem: `Vinculada a ${cliente.nome}.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao criar', mensagem: 'Houve um erro. O saldo da origem já pode ter sido descontado.' });
  }
  
  if (btnSubmit) btnSubmit.disabled = false;
}

async function excluirPromissoria(id, clienteId) {
  const promissoria = estado.promissorias.find(p => p.id === id);
  if (!promissoria) return;

  const confirmado = confirm('Deseja excluir esta promissória? Se estiver em aberto, o valor investido será devolvido à origem.');
  if (!confirmado) return;

  // Devolver dinheiro à origem SE não estava recebida
  if (promissoria.status !== 'recebida') {
    if (promissoria.origem === 'hmcred') {
      const resConfig = await FirestoreService.obter('hmcred', 'configuracao');
      if (resConfig.sucesso) {
        await FirestoreService.atualizar('hmcred', 'configuracao', {
          capitalDisponivel: resConfig.dados.capitalDisponivel + promissoria.valorInvestido
        });
      }
    } else if (promissoria.origem === 'dinheiro' && promissoria.origemReferenciaId) {
      const conta = estado.contasDinheiro.find(c => c.id === promissoria.origemReferenciaId);
      if (conta) {
        await FirestoreService.atualizar('dinheiro_contas', conta.id, {
          saldo: conta.saldo + promissoria.valorInvestido
        });
        await sincronizarDinheiroExterno();
      }
    }
  }

  const res = await FirestoreService.excluir('promissorias', id);
  if (res.sucesso) {
    estado.promissorias = estado.promissorias.filter(p => p.id !== id);
    await atualizarTotalCliente(clienteId);
    await atualizarResumoPatrimonio();
    mostrarToast({ tipo: 'success', titulo: 'Promissória excluída', mensagem: 'A operação foi desfeita.' });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao excluir', mensagem: 'Tente novamente.' });
  }
}

async function marcarComoRecebida(id, clienteId) {
  const promissoria = estado.promissorias.find(p => p.id === id);
  if (!promissoria || promissoria.status === 'recebida') return;

  const confirmado = confirm('Confirmar o recebimento desta promissória? O principal será devolvido à origem e o lucro será efetivado.');
  if (!confirmado) return;

  // Devolver APENAS O PRINCIPAL à origem correspondente
  if (promissoria.origem === 'hmcred') {
    const resConfig = await FirestoreService.obter('hmcred', 'configuracao');
    if (resConfig.sucesso) {
      await FirestoreService.atualizar('hmcred', 'configuracao', {
        capitalDisponivel: resConfig.dados.capitalDisponivel + promissoria.valorInvestido
      });
    }
  } else if (promissoria.origem === 'dinheiro' && promissoria.origemReferenciaId) {
    const conta = estado.contasDinheiro.find(c => c.id === promissoria.origemReferenciaId);
    if (conta) {
      await FirestoreService.atualizar('dinheiro_contas', conta.id, {
        saldo: conta.saldo + promissoria.valorInvestido
      });
      await sincronizarDinheiroExterno();
    }
  }

  // Marcar como recebida
  const res = await FirestoreService.atualizar('promissorias', id, { 
    status: 'recebida',
    dataRecebimento: new Date().toISOString()
  });

  if (res.sucesso) {
    promissoria.status = 'recebida';
    await atualizarTotalCliente(clienteId);
    await atualizarResumoPatrimonio();
    mostrarToast({ tipo: 'success', titulo: 'Recebimento Confirmado', mensagem: 'O lucro foi garantido!' });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao atualizar', mensagem: 'Tente novamente.' });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */

/**
 * Sincroniza o total de Dinheiro no Patrimônio quando abatemos ou adicionamos valor 
 * por fora do módulo Dinheiro (pois o listener dele pode não estar ativo).
 */
async function sincronizarDinheiroExterno() {
  const contasRes = await FirestoreService.listar('dinheiro_contas');
  if (contasRes.sucesso) {
    const contasAtualizadas = contasRes.dados;
    const saldoTotal = contasAtualizadas.reduce((acc, c) => acc + (c.saldo || 0), 0);

    await FirestoreService.salvar('dinheiro', 'configuracao', { saldoTotal });

    const resumoExistente = await FirestoreService.obter('patrimonio', 'resumo');
    const dadosPatrimonio = resumoExistente.sucesso ? resumoExistente.dados : {};
    dadosPatrimonio.dinheiro = saldoTotal;
    await FirestoreService.salvar('patrimonio', 'resumo', dadosPatrimonio);
  }
}

/**
 * Atualiza o Patrimônio (resumo.promissorias)
 */
async function atualizarResumoPatrimonio() {
  const resumoExistente = await FirestoreService.obter('patrimonio', 'resumo');
  const dadosPatrimonio = resumoExistente.sucesso ? resumoExistente.dados : {};
  
  // O valor investido em promissórias ativas conta como patrimônio
  const totalInvestidoAtivo = estado.promissorias
    .filter(p => p.status !== 'recebida')
    .reduce((acc, p) => acc + (p.valorInvestido || 0), 0);
    
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
  if (listaContainer) {
    atualizarLista(listaContainer.parentElement);
  }
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
   RENDERIZAÇÃO
───────────────────────────────────────────────────────────────────────────── */

function renderizarCardPromissoria(promissoria) {
  const statusReal = obterStatusReal(promissoria);
  
  let statusCor, statusBg, statusIcon;
  if (statusReal === 'recebida') {
    statusCor = 'var(--color-success)';
    statusBg = 'var(--color-success-muted)';
    statusIcon = 'check_circle';
  } else if (statusReal === 'atrasada') {
    statusCor = 'var(--color-danger)';
    statusBg = 'var(--color-danger-muted)';
    statusIcon = 'error';
  } else {
    statusCor = 'var(--color-gold)';
    statusBg = 'var(--bg-overlay)';
    statusIcon = 'schedule';
  }

  const nomeCliente = promissoria.clienteNome || 'Cliente Excluído';
  const labelOrigem = promissoria.origem === 'hmcred' ? 'HMCRED' : 'Conta Dinheiro';
  const valorTotal = promissoria.valorInvestido + promissoria.lucro;

  return `
    <div class="card" style="margin-bottom: var(--space-4);" role="article">
      <div class="card-body" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);">
        
        <div style="display: flex; align-items: center; gap: var(--space-4); flex: 1; min-width: 250px;">
          <div style="width: 48px; height: 48px; border-radius: var(--radius-md); background-color: ${statusBg}; color: ${statusCor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <span class="material-symbols-outlined" style="font-size: 24px;">${statusIcon}</span>
          </div>
          <div>
            <h4 style="margin: 0; font-size: var(--text-base); font-weight: var(--font-semibold); color: var(--text-primary);">${nomeCliente}</h4>
            <span style="font-size: var(--text-sm); color: var(--text-muted);">${promissoria.descricao || 'Promissória'}</span>
            <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
              <span class="badge badge-neutral" style="font-size: 10px;">Origem: ${labelOrigem}</span>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: var(--space-6); min-width: 150px; justify-content: flex-end; align-items: flex-end;">
          <div style="text-align: right;">
            <p style="margin: 0; font-size: var(--text-xs); color: var(--text-muted);">Principal / Lucro</p>
            <p class="value-sensitive" style="margin: 0; font-size: var(--text-sm); font-weight: var(--font-medium); color: var(--text-secondary);">
              ${formatarMoeda(promissoria.valorInvestido)} / <span class="text-success">+${formatarMoeda(promissoria.lucro)}</span>
            </p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-size: var(--text-xs); color: var(--text-muted);">Total (Venc: ${formatarData(promissoria.dataVencimento)})</p>
            <p class="value-sensitive" style="margin: 0; font-size: var(--text-lg); font-weight: var(--font-bold); color: ${statusCor};">
              ${formatarMoeda(valorTotal)}
            </p>
          </div>
        </div>

        <div style="display: flex; gap: var(--space-1); width: 100%; justify-content: flex-end; border-top: 1px solid var(--border-default); padding-top: var(--space-3); margin-top: var(--space-2);">
          ${statusReal !== 'recebida' ? `
            <button class="btn btn-ghost btn-sm" data-acao="receber" data-id="${promissoria.id}" data-cliente="${promissoria.clienteId}">
              <span class="material-symbols-outlined icon-sm" style="color: var(--color-success);">check_circle</span>
              <span style="font-size: var(--text-xs); font-weight: var(--font-medium);">Receber</span>
            </button>
          ` : ''}
          <button class="btn btn-ghost btn-icon" title="Excluir" data-acao="excluir" data-id="${promissoria.id}" data-cliente="${promissoria.clienteId}">
            <span class="material-symbols-outlined" style="color: var(--color-danger);">delete</span>
          </button>
        </div>

      </div>
    </div>
  `;
}

function renderizarEmptyState() {
  return `
    <div class="empty-state" style="padding: var(--space-16) var(--space-8);">
      <span class="material-symbols-outlined empty-state-icon">receipt_long</span>
      <h3 class="empty-state-title">Nenhuma Promissória</h3>
      <p class="empty-state-text">Crie sua primeira promissória para começar a gerenciar seus investimentos de terceiros.</p>
      ${estado.promissorias.length === 0 ? `
        <button class="btn btn-primary" onclick="document.getElementById('modal-nova-promissoria').classList.add('open')">
          <span class="material-symbols-outlined">add</span>
          Nova Promissória
        </button>
      ` : ''}
    </div>
  `;
}

function renderizarModais() {
  const opcoesClientes = estado.clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  const opcoesContas = estado.contasDinheiro.map(c => `<option value="${c.id}">${c.nome} (Saldo: ${formatarMoeda(c.saldo)})</option>`).join('');

  return `
    <!-- Modal: Nova Promissória -->
    <div class="modal-overlay" id="modal-nova-promissoria">
      <div class="modal" style="max-width: 500px; width: 100%;">
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

            <div class="form-group">
              <label class="form-label" for="nova-prom-cliente">Cliente <span class="required">*</span></label>
              <select id="nova-prom-cliente" name="clienteId" class="form-input form-select" required ${estado.clientes.length === 0 ? 'disabled' : ''}>
                <option value="">Selecione um cliente...</option>
                ${opcoesClientes}
              </select>
            </div>
            
            <div class="form-group">
              <label class="form-label" for="nova-prom-descricao">Descrição <span class="required">*</span></label>
              <input type="text" id="nova-prom-descricao" name="descricao" class="form-input" placeholder="Ex: Empréstimo Pessoal, Acordo, Venda..." required autocomplete="off" ${estado.clientes.length === 0 ? 'disabled' : ''}>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
              <div class="form-group">
                <label class="form-label" for="nova-prom-valor">Valor Investido (R$) <span class="required">*</span></label>
                <input type="text" id="nova-prom-valor" name="valorInvestido" class="form-input" placeholder="0,00" required inputmode="decimal" ${estado.clientes.length === 0 ? 'disabled' : ''}>
              </div>
              <div class="form-group">
                <label class="form-label" for="nova-prom-lucro">Lucro / Juros (R$) <span class="required">*</span></label>
                <input type="text" id="nova-prom-lucro" name="lucro" class="form-input" placeholder="0,00" required inputmode="decimal" ${estado.clientes.length === 0 ? 'disabled' : ''}>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="nova-prom-vencimento">Vencimento <span class="required">*</span></label>
              <input type="date" id="nova-prom-vencimento" name="dataVencimento" class="form-input" required ${estado.clientes.length === 0 ? 'disabled' : ''}>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
              <div class="form-group">
                <label class="form-label" for="nova-prom-origem">Origem do Recurso <span class="required">*</span></label>
                <select id="nova-prom-origem" name="origem" class="form-input form-select" required ${estado.clientes.length === 0 ? 'disabled' : ''}>
                  <option value="hmcred">HMCRED (Crédito Próprio)</option>
                  <option value="dinheiro">Dinheiro (Conta Bancária/Caixa)</option>
                </select>
              </div>
              <div class="form-group" id="grupo-origem-referencia" style="display: none;">
                <label class="form-label" for="nova-prom-origem-ref">Qual Conta? <span class="required">*</span></label>
                <select id="nova-prom-origem-ref" name="origemReferenciaId" class="form-input form-select" ${estado.clientes.length === 0 ? 'disabled' : ''}>
                  <option value="">Selecione...</option>
                  ${opcoesContas}
                </select>
              </div>
            </div>
            
            <div style="background-color: var(--bg-hover); padding: var(--space-3); border-radius: var(--radius-md); margin-top: var(--space-2);">
              <p class="text-sm text-muted">
                <span class="material-symbols-outlined icon-sm" style="vertical-align: middle;">info</span>
                O <strong>Valor Investido</strong> será descontado do saldo da origem selecionada e restituído quando for marcado como "Recebida".
              </p>
            </div>

          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-nova-promissoria').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary" ${estado.clientes.length === 0 ? 'disabled' : ''}>Gerar Promissória</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function atualizarLista(container) {
  let promFiltradas = estado.promissorias;

  if (estado.filtroStatus === 'ativas') {
    promFiltradas = promFiltradas.filter(p => p.status !== 'recebida');
  } else if (estado.filtroStatus === 'recebidas') {
    promFiltradas = promFiltradas.filter(p => p.status === 'recebida');
  }

  // Ordenação: Ativas mais antigas no topo, Recebidas mais recentes no topo.
  promFiltradas.sort((a, b) => {
    if (a.status === 'recebida' && b.status !== 'recebida') return 1;
    if (b.status === 'recebida' && a.status !== 'recebida') return -1;
    
    const dateA = new Date(a.dataVencimento);
    const dateB = new Date(b.dataVencimento);
    
    if (a.status === 'recebida') {
      return dateB - dateA; // mais recentes 1º
    } else {
      return dateA - dateB; // mais antigas 1º (vencendo logo/atrasadas)
    }
  });

  const listaContainer = container.querySelector('#promissorias-lista');
  if (listaContainer) {
    if (promFiltradas.length === 0) {
      listaContainer.innerHTML = renderizarEmptyState();
    } else {
      listaContainer.innerHTML = promFiltradas.map(renderizarCardPromissoria).join('');
    }
  }
}

function renderizarTelaPrincipal(container) {
  const kpis = {
    totalAtivas: 0,
    lucroEsperado: 0,
    lucroRealizado: 0
  };

  estado.promissorias.forEach(p => {
    if (p.status !== 'recebida') {
      kpis.totalAtivas += p.valorInvestido;
      kpis.lucroEsperado += p.lucro;
    } else {
      kpis.lucroRealizado += p.lucro;
    }
  });

  container.innerHTML = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-4);">
      <div>
        <h2 class="page-title">Promissórias</h2>
        <p class="page-subtitle">Investimentos em terceiros e lucros vinculados a origens.</p>
      </div>
      <button class="btn btn-primary" id="btn-nova-promissoria">
        <span class="material-symbols-outlined">add</span>
        Nova Promissória
      </button>
    </div>

    <div class="stats-grid" style="margin-bottom: var(--space-8);">
      <div class="stat-card card-gold">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm text-gold-muted" style="text-transform: uppercase;">Capital Investido (Ativas)</span>
          <div class="stat-card-icon" style="color: var(--color-gold);">
            <span class="material-symbols-outlined">account_balance</span>
          </div>
        </div>
        <div class="stat-card-value text-gold value-sensitive">${formatarMoeda(kpis.totalAtivas)}</div>
      </div>

      <div class="stat-card card-warning">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm text-warning-muted" style="text-transform: uppercase;">Lucro Estimado</span>
          <div class="stat-card-icon" style="background-color: var(--color-warning-muted); color: var(--color-warning);">
            <span class="material-symbols-outlined">trending_up</span>
          </div>
        </div>
        <div class="stat-card-value text-warning value-sensitive">${formatarMoeda(kpis.lucroEsperado)}</div>
      </div>

      <div class="stat-card card-success">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm text-success-muted" style="text-transform: uppercase;">Lucro Realizado (Recebidas)</span>
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

function registrarEventosTela(container) {
  const btnNova = document.getElementById('btn-nova-promissoria');
  if (btnNova) btnNova.addEventListener('click', () => abrirModal('modal-nova-promissoria'));

  const formNova = document.getElementById('form-nova-promissoria');
  if (formNova) formNova.addEventListener('submit', criarPromissoria);

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

  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => aplicarFiltro(e.target.dataset.status));
  });

  container.addEventListener('click', (e) => {
    let alvo = e.target;
    while (alvo && alvo !== container) {
      if (alvo.getAttribute && alvo.getAttribute('data-acao')) break;
      alvo = alvo.parentNode;
    }
    
    if (alvo && alvo.getAttribute) {
      const acao = alvo.getAttribute('data-acao');
      const id = alvo.getAttribute('data-id');
      const clienteId = alvo.getAttribute('data-cliente');
      
      if (acao === 'receber') marcarComoRecebida(id, clienteId);
      else if (acao === 'excluir') excluirPromissoria(id, clienteId);
      
      e.stopPropagation();
    }
  });

  container.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

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
    if (unsubscribeClientes) { unsubscribeClientes(); unsubscribeClientes = null; }
    if (unsubscribeDinheiro) { unsubscribeDinheiro(); unsubscribeDinheiro = null; }

    unsubscribeClientes = FirestoreService.escutar('clientes', (clientes) => {
      estado.clientes = clientes;
      if (estado.promissorias.length > 0) renderizarTelaPrincipal(container);
    });

    unsubscribeDinheiro = FirestoreService.escutar('dinheiro_contas', (contas) => {
      estado.contasDinheiro = contas;
    });

    unsubscribePromissorias = FirestoreService.escutar(
      'promissorias',
      (promissorias) => {
        estado.promissorias = promissorias;
        renderizarTelaPrincipal(container);
      },
      { ordenarPor: 'dataVencimento', direcao: 'asc' }
    );
  }
};
