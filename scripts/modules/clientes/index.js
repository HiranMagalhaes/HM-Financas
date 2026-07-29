/**
 * HM Finanças — Módulo: Clientes (Módulo 7A)
 * ============================================================
 * Gerenciamento de clientes/devedores.
 */

'use strict';

import { AuthService }      from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, formatarData } from '../../utils/formatters.js';
import { mostrarToast }     from '../../utils/helpers.js';

let estado = {
  clientes: [],
  cobrancas: [], // para histórico do cliente
  carregando: true
};

let unsubscribeClientes = null;
let unsubscribeCobrancas = null;

/* ─────────────────────────────────────────────────────────────────────────────
   AÇÕES DO USUÁRIO — CRUD
───────────────────────────────────────────────────────────────────────────── */

async function criarCliente(evento) {
  evento.preventDefault();
  const form     = evento.target;
  const formData = new FormData(form);

  const novoCliente = {
    nome:  formData.get('nome').trim(),
    telefone:  formData.get('telefone').trim(),
    observacao:  formData.get('observacao').trim(),
    cobrancasEmAberto: 0,
    promissoriasEmAberto: 0
  };

  if (!novoCliente.nome) {
    mostrarToast({ tipo: 'warning', titulo: 'Campo obrigatório', mensagem: 'Informe o nome do cliente.' });
    return;
  }

  const btnSubmit = form.querySelector('button[type="submit"]');
  if (btnSubmit) btnSubmit.disabled = true;

  const res = await FirestoreService.criar('clientes', novoCliente);

  if (btnSubmit) btnSubmit.disabled = false;

  if (res.sucesso) {
    fecharModal('modal-novo-cliente');
    form.reset();
    mostrarToast({ tipo: 'success', titulo: 'Cliente cadastrado!', mensagem: `"${novoCliente.nome}" adicionado com sucesso.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao cadastrar', mensagem: 'Tente novamente em instantes.' });
  }
}

function abrirModalEdicao(id) {
  const cliente = estado.clientes.find(c => c.id === id);
  if (!cliente) return;

  document.getElementById('editar-cliente-id').value = cliente.id;
  document.getElementById('editar-cliente-nome').value = cliente.nome;
  document.getElementById('editar-cliente-telefone').value = cliente.telefone || '';
  document.getElementById('editar-cliente-observacao').value = cliente.observacao || '';

  abrirModal('modal-editar-cliente');
}

async function atualizarCliente(evento) {
  evento.preventDefault();
  const form     = evento.target;
  const formData = new FormData(form);

  const id = formData.get('clienteId');
  const nome = formData.get('nome').trim();
  const telefone = formData.get('telefone').trim();
  const observacao = formData.get('observacao').trim();

  if (!id || !nome) {
    mostrarToast({ tipo: 'warning', titulo: 'Campo obrigatório', mensagem: 'Informe o nome do cliente.' });
    return;
  }

  const btnSubmit = form.querySelector('button[type="submit"]');
  if (btnSubmit) btnSubmit.disabled = true;

  const res = await FirestoreService.atualizar('clientes', id, { nome, telefone, observacao });

  if (btnSubmit) btnSubmit.disabled = false;

  if (res.sucesso) {
    fecharModal('modal-editar-cliente');
    mostrarToast({ tipo: 'success', titulo: 'Cliente atualizado!', mensagem: `Dados salvos com sucesso.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao atualizar', mensagem: 'Tente novamente em instantes.' });
  }
}

async function excluirCliente(id) {
  const cliente = estado.clientes.find(c => c.id === id);
  const nomeCliente = cliente ? `"${cliente.nome}"` : 'este cliente';
  const emAberto = (cliente.cobrancasEmAberto || 0) + (cliente.promissoriasEmAberto || 0);

  if (emAberto > 0) {
    mostrarToast({ tipo: 'danger', titulo: 'Ação não permitida', mensagem: `Não é possível excluir cliente com saldo em aberto.` });
    return;
  }

  // Verifica se há cobranças vinculadas (mesmo pagas)
  const temCobranca = estado.cobrancas.some(cob => cob.clienteId === id);
  if (temCobranca) {
    const confirmado = confirm(`O cliente ${nomeCliente} possui histórico de cobranças. Excluir apagará o vínculo, mas as cobranças ficarão órfãs. Deseja continuar?`);
    if (!confirmado) return;
  } else {
    const confirmado = confirm(`Tem certeza que deseja excluir ${nomeCliente} permanentemente?`);
    if (!confirmado) return;
  }

  const res = await FirestoreService.excluir('clientes', id);

  if (res.sucesso) {
    mostrarToast({ tipo: 'success', titulo: 'Cliente excluído', mensagem: `${nomeCliente} removido.` });
  } else {
    mostrarToast({ tipo: 'danger', titulo: 'Erro ao excluir', mensagem: 'Tente novamente em instantes.' });
  }
}

function abrirDetalhesCliente(id) {
  const cliente = estado.clientes.find(c => c.id === id);
  if (!cliente) return;

  const cobrancasCliente = estado.cobrancas
    .filter(cob => cob.clienteId === id)
    .sort((a, b) => new Date(b.criadoEm?.toDate?.() || 0) - new Date(a.criadoEm?.toDate?.() || 0));

  const detalhesNome = document.getElementById('detalhes-cliente-nome');
  const detalhesEmAberto = document.getElementById('detalhes-cliente-em-aberto');
  const detalhesTelefone = document.getElementById('detalhes-cliente-telefone');
  const detalhesObs = document.getElementById('detalhes-cliente-obs');
  const listaHistorico = document.getElementById('detalhes-cliente-historico');

  const emAberto = (cliente.cobrancasEmAberto || 0) + (cliente.promissoriasEmAberto || 0);

  if (detalhesNome) detalhesNome.textContent = cliente.nome;
  if (detalhesEmAberto) detalhesEmAberto.textContent = formatarMoeda(emAberto);
  if (detalhesTelefone) detalhesTelefone.textContent = cliente.telefone || 'Não informado';
  if (detalhesObs) detalhesObs.textContent = cliente.observacao || 'Nenhuma observação.';

  if (listaHistorico) {
    if (cobrancasCliente.length === 0) {
      listaHistorico.innerHTML = '<p class="text-muted text-sm text-center" style="padding: var(--space-4);">Nenhum histórico de cobranças.</p>';
    } else {
      listaHistorico.innerHTML = cobrancasCliente.map(cob => {
        let statusCor = 'text-warning';
        let statusIcon = 'schedule';
        if (cob.status === 'paga') { statusCor = 'text-success'; statusIcon = 'check_circle'; }
        else if (cob.status === 'atrasada') { statusCor = 'text-danger'; statusIcon = 'error'; }
        
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-3); border-bottom: 1px solid var(--border-default);">
            <div>
              <p style="font-size: var(--text-sm); font-weight: var(--font-medium); color: var(--text-primary);">${cob.descricao || 'Cobrança'}</p>
              <p style="font-size: var(--text-xs); color: var(--text-muted);">Venc: ${formatarData(cob.dataVencimento)}</p>
            </div>
            <div style="text-align: right;">
              <p class="value-sensitive" style="font-size: var(--text-sm); font-weight: var(--font-bold); color: var(--text-primary);">${formatarMoeda(cob.valor)}</p>
              <p class="${statusCor}" style="font-size: var(--text-xs); display: flex; align-items: center; gap: 4px; justify-content: flex-end;">
                <span class="material-symbols-outlined icon-sm">${statusIcon}</span>
                ${cob.status.toUpperCase()}
              </p>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  abrirModal('modal-detalhes-cliente');
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

function renderizarCardCliente(cliente) {
  return `
    <div class="card" style="margin-bottom: var(--space-4);" role="article" aria-label="Cliente: ${cliente.nome}">
      <div class="card-body" style="display: flex; align-items: center; justify-content: space-between; gap: var(--space-4);">
        <div style="display: flex; align-items: center; gap: var(--space-4); cursor: pointer; flex: 1;" data-acao="detalhes" data-id="${cliente.id}">
          <div style="width: 48px; height: 48px; border-radius: 50%; background-color: var(--bg-overlay); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <span class="material-symbols-outlined" style="font-size: 24px;">person</span>
          </div>
          <div>
            <h4 style="margin: 0; font-size: var(--text-base); font-weight: var(--font-semibold); color: var(--text-primary);">${cliente.nome}</h4>
            <span style="font-size: var(--text-sm); color: var(--text-muted);">${cliente.telefone || 'Sem telefone'}</span>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-6);">
          <div style="text-align: right;">
            <p style="margin: 0; font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase;">Em Aberto</p>
            <p class="value-sensitive" style="margin: 0; font-size: var(--text-base); font-weight: var(--font-bold); color: ${(cliente.cobrancasEmAberto || 0) + (cliente.promissoriasEmAberto || 0) > 0 ? 'var(--color-gold)' : 'var(--text-muted)'};">
              ${formatarMoeda((cliente.cobrancasEmAberto || 0) + (cliente.promissoriasEmAberto || 0))}
            </p>
          </div>
          <div style="display: flex; gap: var(--space-1);">
            <button class="btn btn-ghost btn-icon" title="Editar cliente" data-acao="editar" data-id="${cliente.id}" aria-label="Editar cliente ${cliente.nome}">
              <span class="material-symbols-outlined" style="color: var(--color-info);">edit</span>
            </button>
            <button class="btn btn-ghost btn-icon" title="Excluir cliente" data-acao="excluir" data-id="${cliente.id}" aria-label="Excluir cliente ${cliente.nome}">
              <span class="material-symbols-outlined" style="color: var(--color-danger);">delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderizarEmptyState() {
  return `
    <div class="empty-state" style="padding: var(--space-16) var(--space-8);">
      <span class="material-symbols-outlined empty-state-icon">group_off</span>
      <h3 class="empty-state-title">Nenhum cliente cadastrado</h3>
      <p class="empty-state-text">
        Adicione seu primeiro cliente para começar a controlar os recebimentos.
      </p>
      <button class="btn btn-primary" onclick="document.getElementById('modal-novo-cliente').classList.add('open')">
        <span class="material-symbols-outlined">person_add</span>
        Cadastrar Cliente
      </button>
    </div>
  `;
}

function renderizarModais() {
  return `
    <!-- Modal: Novo Cliente -->
    <div class="modal-overlay" id="modal-novo-cliente">
      <div class="modal" style="max-width: 440px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title">Novo Cliente</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-novo-cliente').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-novo-cliente" novalidate>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="novo-cliente-nome">Nome <span class="required">*</span></label>
              <input type="text" id="novo-cliente-nome" name="nome" class="form-input" required autocomplete="off">
            </div>
            <div class="form-group">
              <label class="form-label" for="novo-cliente-telefone">Telefone (WhatsApp)</label>
              <input type="text" id="novo-cliente-telefone" name="telefone" class="form-input" placeholder="Ex: 11999999999">
            </div>
            <div class="form-group">
              <label class="form-label" for="novo-cliente-observacao">Observações</label>
              <textarea id="novo-cliente-observacao" name="observacao" class="form-input" rows="3"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-novo-cliente').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal: Editar Cliente -->
    <div class="modal-overlay" id="modal-editar-cliente">
      <div class="modal" style="max-width: 440px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title">Editar Cliente</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-editar-cliente').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-editar-cliente" novalidate>
          <input type="hidden" name="clienteId" id="editar-cliente-id">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="editar-cliente-nome">Nome <span class="required">*</span></label>
              <input type="text" id="editar-cliente-nome" name="nome" class="form-input" required autocomplete="off">
            </div>
            <div class="form-group">
              <label class="form-label" for="editar-cliente-telefone">Telefone (WhatsApp)</label>
              <input type="text" id="editar-cliente-telefone" name="telefone" class="form-input">
            </div>
            <div class="form-group">
              <label class="form-label" for="editar-cliente-observacao">Observações</label>
              <textarea id="editar-cliente-observacao" name="observacao" class="form-input" rows="3"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-editar-cliente').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar Alterações</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal: Detalhes do Cliente -->
    <div class="modal-overlay" id="modal-detalhes-cliente">
      <div class="modal" style="max-width: 500px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title">Detalhes do Cliente</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-detalhes-cliente').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="modal-body">
          <div style="background-color: var(--bg-overlay); padding: var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
            <h4 id="detalhes-cliente-nome" style="font-size: var(--text-lg); margin-bottom: var(--space-1); color: var(--text-primary);"></h4>
            <p style="font-size: var(--text-sm); color: var(--text-muted); display: flex; align-items: center; gap: 4px; margin-bottom: var(--space-2);">
              <span class="material-symbols-outlined icon-sm">phone</span>
              <span id="detalhes-cliente-telefone"></span>
            </p>
            <p style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-4);" id="detalhes-cliente-obs"></p>
            <div style="border-top: 1px solid var(--border-default); padding-top: var(--space-3); text-align: center;">
              <p style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase;">Total em Aberto</p>
              <p id="detalhes-cliente-em-aberto" class="value-sensitive" style="font-size: var(--text-2xl); font-weight: var(--font-bold); color: var(--color-gold);"></p>
            </div>
          </div>
          
          <h5 style="font-size: var(--text-base); margin-bottom: var(--space-2); color: var(--text-primary);">Histórico de Cobranças</h5>
          <div id="detalhes-cliente-historico" style="max-height: 250px; overflow-y: auto; background-color: var(--bg-hover); border-radius: var(--radius-md);">
            <!-- Preenchido via JS -->
          </div>
        </div>
      </div>
    </div>
  `;
}

function atualizarLista(container) {
  const inputBusca = container.querySelector('#busca-cliente');
  const termo = inputBusca ? inputBusca.value.toLowerCase() : '';
  
  const clientesFiltrados = estado.clientes.filter(c => c.nome.toLowerCase().includes(termo));
  
  const listaContainer = container.querySelector('#clientes-lista');
  if (listaContainer) {
    if (clientesFiltrados.length === 0) {
      if (termo) {
        listaContainer.innerHTML = '<p class="text-center text-muted" style="padding: 2rem;">Nenhum cliente encontrado com esse nome.</p>';
      } else {
        listaContainer.innerHTML = renderizarEmptyState();
      }
    } else {
      listaContainer.innerHTML = clientesFiltrados.map(renderizarCardCliente).join('');
    }
  }
}

function renderizarTelaPrincipal(container) {
  const totalReceber = estado.clientes.reduce((acc, c) => acc + ((c.cobrancasEmAberto || 0) + (c.promissoriasEmAberto || 0)), 0);
  
  container.innerHTML = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-4);">
      <div>
        <h2 class="page-title">Clientes</h2>
        <p class="page-subtitle">Gerencie seus clientes e acompanhe valores a receber.</p>
      </div>
      <button class="btn btn-primary" id="btn-novo-cliente">
        <span class="material-symbols-outlined">person_add</span>
        Novo Cliente
      </button>
    </div>

    <div class="card card-gold" style="margin-bottom: var(--space-8); position: relative; overflow: hidden;">
      <div class="card-body" style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-8);">
        <div>
          <p style="color: rgba(255,255,255,0.6); font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: var(--space-2);">
            Total em Aberto (Todos os Clientes)
          </p>
          <h2 class="value-sensitive" style="margin: 0; font-size: var(--text-4xl); font-weight: var(--font-bold); color: var(--color-gold); line-height: 1; font-family: var(--font-display);">
            ${formatarMoeda(totalReceber)}
          </h2>
          <p style="margin-top: var(--space-2); font-size: var(--text-sm); color: rgba(255,255,255,0.5);">
            ${estado.clientes.length} cliente${estado.clientes.length !== 1 ? 's' : ''} cadastrado${estado.clientes.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style="opacity: 0.12; pointer-events: none; user-select: none;">
          <span class="material-symbols-outlined" style="font-size: 120px; color: var(--color-gold);">group</span>
        </div>
      </div>
    </div>

    <div class="dashboard-section-header" style="margin-bottom: var(--space-4); display: flex; justify-content: space-between; align-items: center;">
      <h3 class="text-lg font-semibold">Meus Clientes</h3>
      <input type="text" id="busca-cliente" class="form-input" placeholder="Buscar por nome..." style="max-width: 250px;">
    </div>

    <div id="clientes-lista">
      <!-- Lista injetada dinamicamente -->
    </div>

    ${renderizarModais()}
  `;

  registrarEventosTela(container);
  atualizarLista(container);
}

function registrarEventosTela(container) {
  const btnNovo = document.getElementById('btn-novo-cliente');
  if (btnNovo) btnNovo.addEventListener('click', () => abrirModal('modal-novo-cliente'));

  const formNovo = document.getElementById('form-novo-cliente');
  if (formNovo) formNovo.addEventListener('submit', criarCliente);

  const formEditar = document.getElementById('form-editar-cliente');
  if (formEditar) formEditar.addEventListener('submit', atualizarCliente);
  
  const inputBusca = document.getElementById('busca-cliente');
  if (inputBusca) inputBusca.addEventListener('input', () => atualizarLista(container));

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
      
      if (acao === 'detalhes') abrirDetalhesCliente(id);
      else if (acao === 'editar') abrirModalEdicao(id);
      else if (acao === 'excluir') excluirCliente(id);
      
      e.stopPropagation();
    }
  });

  container.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

export const ClientesModule = {
  async renderClientes(container) {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-16);">
        <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
        <p style="color: var(--text-muted); margin-top: var(--space-4);">Carregando clientes...</p>
      </div>
    `;

    if (unsubscribeClientes) { unsubscribeClientes(); unsubscribeClientes = null; }
    if (unsubscribeCobrancas) { unsubscribeCobrancas(); unsubscribeCobrancas = null; }

    unsubscribeCobrancas = FirestoreService.escutar(
      'cobrancas',
      (cobrancas) => {
        estado.cobrancas = cobrancas;
      }
    );

    unsubscribeClientes = FirestoreService.escutar(
      'clientes',
      (clientes) => {
        estado.clientes = clientes;
        renderizarTelaPrincipal(container);
      },
      { ordenarPor: 'nome', direcao: 'asc' }
    );
  }
};
