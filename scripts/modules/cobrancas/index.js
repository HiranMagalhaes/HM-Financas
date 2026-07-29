/**
 * HM Finanças — Módulo: Cobranças (Módulo 7B)
 * ============================================================
 * Gerenciamento de cobranças vinculadas aos clientes.
 */

'use strict';

import { AuthService }      from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, formatarData, parseMoeda } from '../../utils/formatters.js';
import { mostrarToast, calcularStatusVencimento } from '../../utils/helpers.js';

let estado = {
  cobrancas: [],
  clientes: [],
  filtroStatus: 'todas', // 'todas', 'aberto', 'atrasadas', 'pagas'
  carregando: true
};

let unsubscribeCobrancas = null;
let unsubscribeClientes = null;

/* ─────────────────────────────────────────────────────────────────────────────
   REGRAS DE NEGÓCIO E SINCRONIZAÇÃO
───────────────────────────────────────────────────────────────────────────── */

/**
 * Retorna o status real da cobrança considerando a data atual.
 */
function obterStatusReal(cobranca) {
  const statusVencimento = calcularStatusVencimento(cobranca.dataVencimento, cobranca.status);
  // Compatibilidade com o resto do código original do módulo de cobranças:
  // Se for 'hoje' ou 'amanha', ainda tratamos visualmente como 'pendente' aqui na lista principal de cobranças.
  // Apenas 'atrasada' ou 'paga' são status finais dessa view (a menos que a view mude para tratar 'amanha' diferente).
  if (statusVencimento === 'hoje' || statusVencimento === 'amanha') return 'pendente';
  return statusVencimento;
}

/**
 * Recalcula o total em aberto de um cliente específico e salva no Firestore.
 */
async function atualizarTotalCliente(clienteId) {
  // Pega todas as cobranças do cliente que não estão pagas
  const cobrancasDoCliente = estado.cobrancas.filter(cob => 
    cob.clienteId === clienteId && cob.status !== 'paga'
  );
  
  const total = cobrancasDoCliente.reduce((acc, cob) => acc + (cob.valor || 0), 0);
  
  // Atualiza o documento do cliente
  await FirestoreService.atualizar('clientes', clienteId, { cobrancasEmAberto: total });
}

/* ─────────────────────────────────────────────────────────────────────────────
   AÇÕES DO USUÁRIO — CRUD
───────────────────────────────────────────────────────────────────────────── */

async function criarCobranca(evento) {
  evento.preventDefault();
  const form     = evento.target;
  const formData = new FormData(form);

  const clienteId = formData.get('clienteId');
  const cliente = estado.clientes.find(c => c.id === clienteId);

  if (!cliente) {
    mostrarToast({ tipo: 'warning', titulo: 'Atenção', mensagem: 'Selecione um cliente válido.' });
    return;
  }

  const novaCobranca = {
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    valor: parseMoeda(formData.get('valor')),
    descricao: formData.get('descricao').trim(),
    dataVencimento: formData.get('dataVencimento'),
    status: 'pendente',
    chavePix: formData.get('chavePix').trim() || null
  };

  if (novaCobranca.valor <= 0) {
    mostrarToast({ tipo: 'warning', titulo: 'Valor inválido', mensagem: 'O valor da cobrança deve ser maior que zero.' });
    return;
  }

  const btnSubmit = form.querySelector('button[type="submit"]');
  if (btnSubmit) btnSubmit.disabled = true;

  const res = await FirestoreService.criar('cobrancas', novaCobranca);

  if (res.sucesso) {
    // Para atualizar o total do cliente, nós já temos a cobrança criada, 
    // mas o onSnapshot vai atualizar 'estado.cobrancas'.
    // Uma forma segura de atualizar o total é ler o cliente novamente ou somar em memória.
    // Como o Firestore pode demorar uns ms para notificar o onSnapshot,
    // faremos a adição na memória temporariamente para o cálculo exato:
    estado.cobrancas.push({ id: res.id, ...novaCobranca });
    await atualizarTotalCliente(cliente.id);

    fecharModal('modal-nova-cobranca');
    form.reset();
    mostrarToast({ tipo: 'success', titulo: 'Cobrança criada!', mensagem: `Vinculada a ${cliente.nome}.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao criar', mensagem: 'Tente novamente.' });
  }
  
  if (btnSubmit) btnSubmit.disabled = false;
}

async function excluirCobranca(id, clienteId) {
  const confirmado = confirm('Deseja realmente excluir esta cobrança permanentemente?');
  if (!confirmado) return;

  const res = await FirestoreService.excluir('cobrancas', id);

  if (res.sucesso) {
    // Remove da memória local para o cálculo imediato
    estado.cobrancas = estado.cobrancas.filter(c => c.id !== id);
    await atualizarTotalCliente(clienteId);
    mostrarToast({ tipo: 'success', titulo: 'Cobrança excluída', mensagem: 'A cobrança foi removida.' });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao excluir', mensagem: 'Tente novamente.' });
  }
}

async function marcarComoPaga(id, clienteId) {
  const confirmado = confirm('Confirmar o recebimento desta cobrança?');
  if (!confirmado) return;

  const res = await FirestoreService.atualizar('cobrancas', id, { 
    status: 'paga',
    dataPagamento: new Date().toISOString()
  });

  if (res.sucesso) {
    // Atualiza localmente para cálculo
    const cob = estado.cobrancas.find(c => c.id === id);
    if (cob) cob.status = 'paga';
    await atualizarTotalCliente(clienteId);
    
    mostrarToast({ tipo: 'success', titulo: 'Cobrança Paga', mensagem: 'O recebimento foi confirmado!' });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao atualizar', mensagem: 'Tente novamente.' });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   AÇÕES RÁPIDAS
───────────────────────────────────────────────────────────────────────────── */

function copiarPix(chavePix) {
  if (!chavePix) {
    mostrarToast({ tipo: 'warning', titulo: 'Chave não encontrada', mensagem: 'Nenhuma chave PIX cadastrada nesta cobrança.' });
    return;
  }
  navigator.clipboard.writeText(chavePix).then(() => {
    mostrarToast({ tipo: 'success', titulo: 'Chave PIX copiada!', mensagem: chavePix });
  }).catch(() => {
    mostrarToast({ tipo: 'danger', titulo: 'Erro', mensagem: 'Não foi possível copiar.' });
  });
}

function enviarWhatsApp(cobranca) {
  const cliente = estado.clientes.find(c => c.id === cobranca.clienteId);
  if (!cliente || !cliente.telefone) {
    mostrarToast({ tipo: 'warning', titulo: 'Telefone não encontrado', mensagem: 'O cliente vinculado não possui telefone cadastrado.' });
    return;
  }

  // Remove caracteres não numéricos
  const telefoneNum = cliente.telefone.replace(/\D/g, '');
  
  const statusReal = obterStatusReal(cobranca);
  let texto = '';
  
  if (statusReal === 'atrasada') {
    texto = `Olá ${cliente.nome}, tudo bem? Notei que há um valor em aberto de *${formatarMoeda(cobranca.valor)}* referente a "${cobranca.descricao}" que venceu em *${formatarData(cobranca.dataVencimento)}*. Podemos confirmar uma previsão de pagamento?`;
  } else {
    texto = `Olá ${cliente.nome}, tudo bem? Passando para lembrar do vencimento de *${formatarMoeda(cobranca.valor)}* referente a "${cobranca.descricao}" no dia *${formatarData(cobranca.dataVencimento)}*.`;
  }
  
  if (cobranca.chavePix) {
    texto += `\n\nMinha chave PIX é: *${cobranca.chavePix}*`;
  }

  const url = `https://wa.me/55${telefoneNum}?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
}

function aplicarFiltro(status) {
  estado.filtroStatus = status;
  
  // Atualiza botões
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-ghost');
    if (btn.dataset.status === status) {
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-ghost');
    }
  });

  const container = document.getElementById('app-main'); // usar um escopo maior se não achar
  const listaContainer = document.getElementById('cobrancas-lista');
  if (listaContainer) {
    atualizarLista(listaContainer.parentElement);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITÁRIOS
───────────────────────────────────────────────────────────────────────────── */

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

function renderizarCardCobranca(cobranca) {
  const statusReal = obterStatusReal(cobranca);
  
  let statusCor, statusBg, statusIcon, statusLabel;
  
  if (statusReal === 'paga') {
    statusCor = 'var(--color-success)';
    statusBg = 'var(--color-success-muted)';
    statusIcon = 'check_circle';
    statusLabel = 'Paga';
  } else if (statusReal === 'atrasada') {
    statusCor = 'var(--color-danger)';
    statusBg = 'var(--color-danger-muted)';
    statusIcon = 'error';
    statusLabel = 'Atrasada';
  } else {
    statusCor = 'var(--color-gold)';
    statusBg = 'var(--bg-overlay)';
    statusIcon = 'schedule';
    statusLabel = 'A Vencer';
  }

  // Verifica se o cliente foi deletado
  const nomeCliente = cobranca.clienteNome || 'Cliente Excluído';

  return `
    <div class="card" style="margin-bottom: var(--space-4);" role="article">
      <div class="card-body" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);">
        
        <!-- Info Principal -->
        <div style="display: flex; align-items: center; gap: var(--space-4); flex: 1; min-width: 250px;">
          <div style="width: 48px; height: 48px; border-radius: var(--radius-md); background-color: ${statusBg}; color: ${statusCor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <span class="material-symbols-outlined" style="font-size: 24px;">${statusIcon}</span>
          </div>
          <div>
            <h4 style="margin: 0; font-size: var(--text-base); font-weight: var(--font-semibold); color: var(--text-primary);">${nomeCliente}</h4>
            <span style="font-size: var(--text-sm); color: var(--text-muted);">${cobranca.descricao || 'Sem descrição'}</span>
          </div>
        </div>

        <!-- Valores e Status -->
        <div style="display: flex; align-items: center; gap: var(--space-6); min-width: 150px; justify-content: flex-end;">
          <div style="text-align: right;">
            <p style="margin: 0; font-size: var(--text-xs); color: var(--text-muted);">Venc: ${formatarData(cobranca.dataVencimento)}</p>
            <p class="value-sensitive" style="margin: 0; font-size: var(--text-lg); font-weight: var(--font-bold); color: ${statusCor};">
              ${formatarMoeda(cobranca.valor)}
            </p>
          </div>
        </div>

        <!-- Ações -->
        <div style="display: flex; gap: var(--space-1); width: 100%; justify-content: flex-end; border-top: 1px solid var(--border-default); padding-top: var(--space-3); margin-top: var(--space-2);">
          ${statusReal !== 'paga' ? `
            <button class="btn btn-ghost btn-sm" data-acao="pagar" data-id="${cobranca.id}" data-cliente="${cobranca.clienteId}">
              <span class="material-symbols-outlined icon-sm" style="color: var(--color-success);">check_circle</span>
              <span style="font-size: var(--text-xs); font-weight: var(--font-medium);">Receber</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-acao="whatsapp" data-id="${cobranca.id}">
              <span class="material-symbols-outlined icon-sm" style="color: var(--color-success);">chat</span>
              <span style="font-size: var(--text-xs); font-weight: var(--font-medium);">Cobrar</span>
            </button>
          ` : ''}
          ${cobranca.chavePix ? `
            <button class="btn btn-ghost btn-icon" title="Copiar PIX" data-acao="pix" data-pix="${cobranca.chavePix}">
              <span class="material-symbols-outlined" style="color: var(--color-info);">pix</span>
            </button>
          ` : ''}
          <button class="btn btn-ghost btn-icon" title="Excluir" data-acao="excluir" data-id="${cobranca.id}" data-cliente="${cobranca.clienteId}">
            <span class="material-symbols-outlined" style="color: var(--color-danger);">delete</span>
          </button>
        </div>

      </div>
    </div>
  `;
}

function renderizarEmptyState() {
  let texto = 'Nenhuma cobrança encontrada para este filtro.';
  if (estado.cobrancas.length === 0) {
    texto = 'Você ainda não possui cobranças cadastradas. Crie sua primeira cobrança para acompanhar seus recebimentos.';
  }

  return `
    <div class="empty-state" style="padding: var(--space-16) var(--space-8);">
      <span class="material-symbols-outlined empty-state-icon">receipt_long</span>
      <h3 class="empty-state-title">Nenhuma Cobrança</h3>
      <p class="empty-state-text">${texto}</p>
      ${estado.cobrancas.length === 0 ? `
        <button class="btn btn-primary" onclick="document.getElementById('modal-nova-cobranca').classList.add('open')">
          <span class="material-symbols-outlined">add</span>
          Nova Cobrança
        </button>
      ` : ''}
    </div>
  `;
}

function renderizarModais() {
  const opcoesClientes = estado.clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');

  return `
    <!-- Modal: Nova Cobrança -->
    <div class="modal-overlay" id="modal-nova-cobranca">
      <div class="modal" style="max-width: 440px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title">Nova Cobrança</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-nova-cobranca').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-nova-cobranca" novalidate>
          <div class="modal-body">
            
            ${estado.clientes.length === 0 ? `
              <div style="background-color: var(--color-danger-muted); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
                <p style="color: var(--color-danger); font-size: var(--text-sm); display: flex; align-items: center; gap: 8px;">
                  <span class="material-symbols-outlined icon-sm">warning</span>
                  Você precisa cadastrar clientes antes de gerar cobranças.
                </p>
              </div>
            ` : ''}

            <div class="form-group">
              <label class="form-label" for="nova-cob-cliente">Cliente <span class="required">*</span></label>
              <select id="nova-cob-cliente" name="clienteId" class="form-input form-select" required ${estado.clientes.length === 0 ? 'disabled' : ''}>
                <option value="">Selecione um cliente...</option>
                ${opcoesClientes}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="nova-cob-descricao">Descrição / Origem <span class="required">*</span></label>
              <input type="text" id="nova-cob-descricao" name="descricao" class="form-input" placeholder="Ex: Parcela 1/3, Serviço de Web..." required autocomplete="off" ${estado.clientes.length === 0 ? 'disabled' : ''}>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
              <div class="form-group">
                <label class="form-label" for="nova-cob-valor">Valor (R$) <span class="required">*</span></label>
                <input type="text" id="nova-cob-valor" name="valor" class="form-input" placeholder="0,00" required inputmode="decimal" ${estado.clientes.length === 0 ? 'disabled' : ''}>
              </div>
              <div class="form-group">
                <label class="form-label" for="nova-cob-vencimento">Vencimento <span class="required">*</span></label>
                <input type="date" id="nova-cob-vencimento" name="dataVencimento" class="form-input" required ${estado.clientes.length === 0 ? 'disabled' : ''}>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="nova-cob-pix">Chave PIX (Opcional)</label>
              <input type="text" id="nova-cob-pix" name="chavePix" class="form-input" placeholder="Telefone, CPF, E-mail ou Aleatória" ${estado.clientes.length === 0 ? 'disabled' : ''}>
              <small class="text-muted" style="display: block; margin-top: 4px;">Usada para enviar rapidamente via WhatsApp.</small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-nova-cobranca').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary" ${estado.clientes.length === 0 ? 'disabled' : ''}>Criar Cobrança</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function atualizarLista(container) {
  let cobrancasFiltradas = estado.cobrancas;

  // Aplica filtro de status
  if (estado.filtroStatus !== 'todas') {
    cobrancasFiltradas = cobrancasFiltradas.filter(c => {
      const statusReal = obterStatusReal(c);
      if (estado.filtroStatus === 'aberto') return statusReal === 'pendente';
      return statusReal === estado.filtroStatus;
    });
  }

  // Ordenação: Pendentes/Atrasadas (mais antigas primeiro), Pagas (mais recentes primeiro)
  cobrancasFiltradas.sort((a, b) => {
    if (a.status === 'paga' && b.status !== 'paga') return 1;
    if (b.status === 'paga' && a.status !== 'paga') return -1;
    
    const dateA = new Date(a.dataVencimento);
    const dateB = new Date(b.dataVencimento);
    
    if (a.status === 'paga') {
      // Pagas mais recentes no topo
      return dateB - dateA;
    } else {
      // A vencer/Atrasadas mais antigas no topo (maior urgência)
      return dateA - dateB;
    }
  });

  const listaContainer = container.querySelector('#cobrancas-lista');
  if (listaContainer) {
    if (cobrancasFiltradas.length === 0) {
      listaContainer.innerHTML = renderizarEmptyState();
    } else {
      listaContainer.innerHTML = cobrancasFiltradas.map(renderizarCardCobranca).join('');
    }
  }
}

function renderizarTelaPrincipal(container) {
  // Cálculos para os KPIs
  const kpis = {
    totalReceber: 0,
    atrasadasCount: 0,
    atrasadasValor: 0,
    pagasValor: 0,
    pagasCount: 0
  };

  estado.cobrancas.forEach(c => {
    const statusReal = obterStatusReal(c);
    if (statusReal === 'pendente' || statusReal === 'atrasada') {
      kpis.totalReceber += (c.valor || 0);
    }
    if (statusReal === 'atrasada') {
      kpis.atrasadasCount++;
      kpis.atrasadasValor += (c.valor || 0);
    }
    if (statusReal === 'paga') {
      kpis.pagasCount++;
      kpis.pagasValor += (c.valor || 0);
    }
  });

  container.innerHTML = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-4);">
      <div>
        <h2 class="page-title">Cobranças</h2>
        <p class="page-subtitle">Acompanhe vencimentos e realize cobranças.</p>
      </div>
      <button class="btn btn-primary" id="btn-nova-cobranca">
        <span class="material-symbols-outlined">add</span>
        Nova Cobrança
      </button>
    </div>

    <!-- Grid de KPIs -->
    <div class="stats-grid" style="margin-bottom: var(--space-8);">
      <div class="stat-card card-gold">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm text-gold-muted" style="text-transform: uppercase;">Total a Receber</span>
          <div class="stat-card-icon" style="color: var(--color-gold);">
            <span class="material-symbols-outlined">account_balance_wallet</span>
          </div>
        </div>
        <div class="stat-card-value text-gold value-sensitive">${formatarMoeda(kpis.totalReceber)}</div>
      </div>

      <div class="stat-card card-danger">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm text-danger-muted" style="text-transform: uppercase;">Em Atraso</span>
          <div class="stat-card-icon" style="background-color: var(--color-danger-muted); color: var(--color-danger);">
            <span class="material-symbols-outlined">error</span>
          </div>
        </div>
        <div class="stat-card-value text-danger value-sensitive">${formatarMoeda(kpis.atrasadasValor)}</div>
        <div class="stat-card-sub text-danger">${kpis.atrasadasCount} cobrança${kpis.atrasadasCount !== 1 ? 's' : ''}</div>
      </div>

      <div class="stat-card card-success">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm text-success-muted" style="text-transform: uppercase;">Recebidas Geral</span>
          <div class="stat-card-icon" style="background-color: var(--color-success-muted); color: var(--color-success);">
            <span class="material-symbols-outlined">check_circle</span>
          </div>
        </div>
        <div class="stat-card-value text-success value-sensitive">${formatarMoeda(kpis.pagasValor)}</div>
        <div class="stat-card-sub text-success">${kpis.pagasCount} cobrança${kpis.pagasCount !== 1 ? 's' : ''}</div>
      </div>
    </div>

    <!-- Filtros e Lista -->
    <div class="dashboard-section-header" style="margin-bottom: var(--space-4); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-4);">
      <h3 class="text-lg font-semibold">Lista de Cobranças</h3>
      
      <div style="display: flex; gap: var(--space-2); flex-wrap: wrap; background: var(--bg-overlay); padding: 4px; border-radius: var(--radius-md);">
        <button class="btn btn-sm ${estado.filtroStatus === 'todas' ? 'btn-primary' : 'btn-ghost'} filter-btn" data-status="todas">Todas</button>
        <button class="btn btn-sm ${estado.filtroStatus === 'aberto' ? 'btn-primary' : 'btn-ghost'} filter-btn" data-status="aberto">A Vencer</button>
        <button class="btn btn-sm ${estado.filtroStatus === 'atrasadas' ? 'btn-primary' : 'btn-ghost'} filter-btn" data-status="atrasadas">Atrasadas</button>
        <button class="btn btn-sm ${estado.filtroStatus === 'pagas' ? 'btn-primary' : 'btn-ghost'} filter-btn" data-status="pagas">Pagas</button>
      </div>
    </div>

    <div id="cobrancas-lista">
      <!-- Lista injetada dinamicamente -->
    </div>

    ${renderizarModais()}
  `;

  registrarEventosTela(container);
  atualizarLista(container);
}

function registrarEventosTela(container) {
  const btnNova = document.getElementById('btn-nova-cobranca');
  if (btnNova) btnNova.addEventListener('click', () => abrirModal('modal-nova-cobranca'));

  const formNova = document.getElementById('form-nova-cobranca');
  if (formNova) formNova.addEventListener('submit', criarCobranca);

  // Filtros
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      aplicarFiltro(e.target.dataset.status);
    });
  });

  // Delegação
  container.addEventListener('click', (e) => {
    let alvo = e.target;
    while (alvo && alvo !== container) {
      if (alvo.getAttribute && alvo.getAttribute('data-acao')) {
        break;
      }
      alvo = alvo.parentNode;
    }
    
    if (alvo && alvo.getAttribute) {
      const acao = alvo.getAttribute('data-acao');
      const id = alvo.getAttribute('data-id');
      const clienteId = alvo.getAttribute('data-cliente');
      
      if (acao === 'pagar') marcarComoPaga(id, clienteId);
      else if (acao === 'excluir') excluirCobranca(id, clienteId);
      else if (acao === 'pix') copiarPix(alvo.getAttribute('data-pix'));
      else if (acao === 'whatsapp') {
        const cob = estado.cobrancas.find(c => c.id === id);
        if (cob) enviarWhatsApp(cob);
      }
      
      e.stopPropagation();
    }
  });

  container.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

export const CobrancasModule = {
  async renderCobrancas(container) {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-16);">
        <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
        <p style="color: var(--text-muted); margin-top: var(--space-4);">Carregando cobranças...</p>
      </div>
    `;

    if (unsubscribeCobrancas) { unsubscribeCobrancas(); unsubscribeCobrancas = null; }
    if (unsubscribeClientes) { unsubscribeClientes(); unsubscribeClientes = null; }

    // Escuta clientes (para nome nos cards e select do modal)
    unsubscribeClientes = FirestoreService.escutar(
      'clientes',
      (clientes) => {
        estado.clientes = clientes;
        // Se cobrancas já carregaram, re-renderiza para atualizar modal
        if (estado.cobrancas.length > 0) {
          renderizarTelaPrincipal(container);
        }
      }
    );

    // Escuta cobranças
    unsubscribeCobrancas = FirestoreService.escutar(
      'cobrancas',
      (cobrancas) => {
        estado.cobrancas = cobrancas;
        renderizarTelaPrincipal(container);
      },
      { ordenarPor: 'dataVencimento', direcao: 'asc' }
    );
  }
};
