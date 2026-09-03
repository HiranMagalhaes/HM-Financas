/**
 * HM Finanças — Módulo: Cobranças (Módulo 7B)
 * ============================================================
 * Gerenciamento de cobranças vinculadas aos clientes e painel de alertas unificado.
 */

'use strict';

import { AuthService }      from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, formatarData, parseMoeda } from '../../utils/formatters.js';
import { mostrarToast, calcularStatusVencimento, escapeHTML } from '../../utils/helpers.js';
import { criarHTMLBarraFiltros, registrarEventosFiltros, filtrarLista } from '../../utils/filtros.js';
import { obterInfoPendencia } from '../promissorias/index.js';

let estado = {
  cobrancas: [],
  clientes: [],
  hmcred: [],
  promissorias: [],
  pix: [],
  abaAtiva: 'alertas', // 'alertas', 'gerenciar'
  filtroStatus: 'todas', // 'todas', 'aberto', 'atrasadas', 'pagas'
  carregando: true,
  alertaParaWhatsapp: null
};

let unsubscribeCobrancas = null;
let unsubscribeClientes = null;
let unsubscribeHmcred = null;
let unsubscribePromissorias = null;
let unsubscribePix = null;

/* ─────────────────────────────────────────────────────────────────────────────
   REGRAS DE NEGÓCIO E SINCRONIZAÇÃO
───────────────────────────────────────────────────────────────────────────── */

function obterStatusReal(cobranca) {
  return calcularStatusVencimento(cobranca.dataVencimento, cobranca.status);
}

async function atualizarTotalCliente(clienteId) {
  const cobrancasDoCliente = estado.cobrancas.filter(cob => 
    cob.clienteId === clienteId && cob.status !== 'paga'
  );
  const total = cobrancasDoCliente.reduce((acc, cob) => acc + (cob.valor || 0), 0);
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

  const painelGerenciar = document.getElementById('painel-gerenciar');
  if (painelGerenciar) {
    renderListaGerenciar(painelGerenciar);
  }
}

// ── Lógica de Alertas Unificados ──

function gerarAlertas() {
  let alertas = [];

  // 1. Cobranças Manuais
  estado.cobrancas.forEach(cob => {
    const statusReal = obterStatusReal(cob);
    if (statusReal === 'paga') return;
    if (statusReal === 'atrasada' || statusReal === 'hoje' || statusReal === 'amanha') {
      alertas.push({
        id: cob.id,
        modulo: 'Avulso',
        clienteId: cob.clienteId,
        clienteNome: cob.clienteNome || 'Desconhecido',
        descricao: cob.descricao,
        valor: cob.valor,
        dataVencimento: cob.dataVencimento,
        statusReal: statusReal,
        chavePix: cob.chavePix || null,
        icone: 'receipt_long'
      });
    }
  });

  // 2. HmCred Operações
  estado.hmcred.forEach(op => {
    if (op.status === 'pago' || !op.listaParcelas) return;
    op.listaParcelas.forEach((parc, idx) => {
      if (parc.pago || !parc.vencimento) return; // pula parcelas sem data
      const statusReal = calcularStatusVencimento(parc.vencimento, 'pendente');
      if (statusReal === 'atrasada' || statusReal === 'hoje' || statusReal === 'amanha') {
        alertas.push({
          id: `${op.id}_parc_${idx}`,
          modulo: 'HmCred',
          clienteId: op.clienteId,
          clienteNome: op.clienteNome || op.destino || 'Desconhecido',
          descricao: `HmCred - Parcela ${idx+1}/${op.listaParcelas.length}`,
          valor: parc.valor,
          dataVencimento: parc.vencimento,
          statusReal: statusReal,
          chavePix: null,
          icone: 'handshake'
        });
      }
    });
  });

  // 3. Promissórias
  estado.promissorias.forEach(prom => {
    if (prom.status === 'pago' || prom.status === 'recebida') return;

    if (prom.modalidade === 'amortizacao' && prom.cronograma && prom.cronograma.length > 0) {
      prom.cronograma.forEach((parc, idx) => {
        if (parc.pago || !parc.vencimento) return;
        const statusReal = calcularStatusVencimento(parc.vencimento, 'pendente');
        if (statusReal === 'atrasada' || statusReal === 'hoje' || statusReal === 'amanha') {
          alertas.push({
            id: `${prom.id}_parc_${idx}`,
            modulo: 'Promissória',
            clienteId: prom.clienteId,
            clienteNome: prom.clienteNome || 'Desconhecido',
            descricao: `Promissória - Parcela ${idx+1}`,
            valor: parc.valorParcela || parc.juros || 0,
            dataVencimento: parc.vencimento,
            statusReal: statusReal,
            chavePix: null,
            icone: 'description',
            valorCheio: (prom.capitalRestante || prom.valorInvestido || 0) + (prom.lucro || 0),
            isPromissoria: true
          });
        }
      });
    } else {
      // juros_mensais ou unico
      const info = obterInfoPendencia(prom);
      if (info.statusReal === 'atrasada' || info.statusReal === 'hoje' || info.statusReal === 'amanha') {
        const valorCheio = (prom.capitalRestante || prom.valorInvestido || 0) + (prom.lucro || 0);
        alertas.push({
          id: prom.id,
          modulo: 'Promissória',
          clienteId: prom.clienteId,
          clienteNome: prom.clienteNome || 'Desconhecido',
          descricao: prom.modalidade === 'juros_mensais' ? 'Promissória - Juros Mensal' : (prom.descricao || 'Promissória - Pagamento Único'),
          valor: info.valorPendente,
          dataVencimento: info.dataVencimentoReal,
          statusReal: info.statusReal,
          chavePix: null,
          icone: 'description',
          valorCheio: valorCheio,
          isPromissoria: true
        });
      }
    }
  });

  alertas.sort((a, b) => new Date(a.dataVencimento) - new Date(b.dataVencimento));
  return alertas;
}

function abrirModalWhatsapp(alertaId) {
  const alertas = gerarAlertas();
  const alerta = alertas.find(a => a.id === alertaId);
  if (!alerta) return;

  estado.alertaParaWhatsapp = alerta;
  
  const cliente = estado.clientes.find(c => c.id === alerta.clienteId);
  if (!cliente || !cliente.telefone) {
    mostrarToast({ tipo: 'warning', titulo: 'Telefone não encontrado', mensagem: 'O cliente vinculado não possui telefone cadastrado.' });
    return;
  }

  document.getElementById('modal-wa-cliente').textContent = cliente.nome;
  document.getElementById('modal-wa-valor').textContent = formatarMoeda(alerta.valor);
  document.getElementById('modal-wa-desc').textContent = alerta.descricao;
  
  const selectPix = document.getElementById('wa-pix-select');
  if (selectPix) {
    let htmlPix = `<option value="">Não enviar PIX</option>`;
    if (alerta.chavePix) {
      htmlPix += `<option value="${alerta.chavePix}" selected>Chave Padrão (${alerta.chavePix})</option>`;
    }
    estado.pix.forEach(p => {
      htmlPix += `<option value="${p.chave}">${p.apelido} - ${p.chave}</option>`;
    });
    selectPix.innerHTML = htmlPix;
  }

  abrirModal('modal-whatsapp');
}

function dispararWhatsapp(evento) {
  evento.preventDefault();
  const alerta = estado.alertaParaWhatsapp;
  if (!alerta) return;

  const form = evento.target;
  const formData = new FormData(form);
  const chavePixEscolhida = formData.get('chavePix');
  
  const cliente = estado.clientes.find(c => c.id === alerta.clienteId);
  const telefoneNum = cliente.telefone.replace(/\D/g, '');
  
  let texto = '';
  if (alerta.statusReal === 'atrasada') {
    texto = `Olá ${cliente.nome}, tudo bem? Notei que há um valor em aberto de *${formatarMoeda(alerta.valor)}* referente a "${alerta.descricao}" que venceu em *${formatarData(alerta.dataVencimento)}*. Podemos confirmar uma previsão de pagamento?`;
  } else {
    texto = `Olá ${cliente.nome}, tudo bem? Passando para lembrar do vencimento de *${formatarMoeda(alerta.valor)}* referente a "${alerta.descricao}" no dia *${formatarData(alerta.dataVencimento)}*.`;
  }
  
  if (chavePixEscolhida) {
    texto += `\n\nMinha chave PIX é: *${chavePixEscolhida}*`;
  }

  const url = `https://wa.me/55${telefoneNum}?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
  
  fecharModal('modal-whatsapp');
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

    <!-- Modal: Disparar WhatsApp -->
    <div class="modal-overlay" id="modal-whatsapp">
      <div class="modal" style="max-width: 440px; width: 100%;">
        <div class="modal-header">
          <h3 class="modal-title">Cobrar via WhatsApp</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-whatsapp').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-whatsapp">
          <div class="modal-body">
            <div style="background-color: var(--bg-overlay); padding: var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border-default); margin-bottom: var(--space-4);">
              <p style="margin: 0; font-size: var(--text-sm); color: var(--text-muted);">Cliente</p>
              <p style="margin: 0; font-size: var(--text-base); font-weight: var(--font-medium);" id="modal-wa-cliente">-</p>
              
              <div style="margin-top: 8px; display: flex; justify-content: space-between;">
                <div>
                  <p style="margin: 0; font-size: var(--text-xs); color: var(--text-muted);">Descrição</p>
                  <p style="margin: 0; font-size: var(--text-sm);" id="modal-wa-desc">-</p>
                </div>
                <div style="text-align: right;">
                  <p style="margin: 0; font-size: var(--text-xs); color: var(--text-muted);">Valor</p>
                  <p style="margin: 0; font-size: var(--text-base); font-weight: var(--font-bold); color: var(--color-danger);" id="modal-wa-valor">-</p>
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label" for="wa-pix-select">Selecione o PIX para envio</label>
              <select id="wa-pix-select" name="chavePix" class="form-input form-select">
                <!-- Injetado dinamicamente -->
              </select>
            </div>
            <p style="font-size: var(--text-xs); color: var(--text-muted);">Uma mensagem amigável com os dados da cobrança será preenchida automaticamente no WhatsApp.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-whatsapp').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-success" style="display:flex; align-items:center; gap:8px;">
              <span class="material-symbols-outlined icon-sm">send</span>
              Enviar Mensagem
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderListaAlertas(container) {
  const alertas = gerarAlertas();
  
  if (alertas.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-16) var(--space-8);">
        <span class="material-symbols-outlined empty-state-icon" style="color: var(--color-success);">check_circle</span>
        <h3 class="empty-state-title">Tudo em dia!</h3>
        <p class="empty-state-text">Nenhuma cobrança vencida ou vencendo nas próximas 24h.</p>
      </div>
    `;
    return;
  }

  const html = alertas.map(a => {
    let cor = a.statusReal === 'atrasada' ? 'var(--color-danger)' : 'var(--color-gold)';
    let bg = a.statusReal === 'atrasada' ? 'var(--color-danger-muted)' : 'var(--color-gold-muted)';
    let badgeTxt = a.statusReal === 'atrasada' ? 'Atrasada' : (a.statusReal === 'hoje' ? 'Hoje' : 'Amanhã');

    return `
      <div class="card" style="margin-bottom: var(--space-3); border-left: 4px solid ${cor};">
        <div class="card-body" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);">
          
          <div style="display: flex; align-items: center; gap: var(--space-3); flex: 1; min-width: 250px;">
            <div style="width: 40px; height: 40px; border-radius: var(--radius-md); background-color: ${bg}; color: ${cor}; display: flex; align-items: center; justify-content: center;">
              <span class="material-symbols-outlined">${a.icone}</span>
            </div>
            <div>
              <h4 style="margin: 0; font-size: var(--text-base); font-weight: var(--font-semibold);">${escapeHTML(a.clienteNome)}</h4>
              <span style="font-size: var(--text-sm); color: var(--text-muted);">${escapeHTML(a.descricao)}</span>
            </div>
          </div>

          <div style="text-align: right; min-width: 120px;">
            <span class="badge" style="background-color: ${bg}; color: ${cor}; font-size: 10px; margin-bottom: 4px;">${badgeTxt} - ${formatarData(a.dataVencimento)}</span>
            <p class="value-sensitive" style="margin: 0; font-size: var(--text-lg); font-weight: var(--font-bold); color: ${cor};">
              ${formatarMoeda(a.valor)}
            </p>
          </div>

          <div style="display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap;">
            ${a.isPromissoria && a.valorCheio ? `
              <details style="font-size: var(--text-xs); color: var(--text-muted); cursor: pointer; margin-right: var(--space-4);">
                <summary style="outline: none;">Ver detalhes</summary>
                <div style="margin-top: 4px; padding: 4px 8px; background: var(--bg-overlay); border-radius: var(--radius-sm);">
                  Valor Cheio (Capital + Juros): <strong class="value-sensitive">${formatarMoeda(a.valorCheio)}</strong>
                </div>
              </details>
            ` : ''}
            <button class="btn btn-success btn-sm" data-acao="alerta-whatsapp" data-id="${a.id}" style="display:flex; align-items:center; gap:4px;">
              <span class="material-symbols-outlined icon-sm">chat</span> Cobrar
            </button>
          </div>
          
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div style="margin-top: var(--space-4);">${html}</div>`;
}

function renderListaGerenciar(container) {
  let cobrancasFiltradas = estado.cobrancas;

  // Filtro de status (aba)
  if (estado.filtroStatus !== 'todas') {
    cobrancasFiltradas = cobrancasFiltradas.filter(c => {
      const statusReal = obterStatusReal(c);
      if (estado.filtroStatus === 'aberto') return statusReal === 'pendente' || statusReal === 'hoje' || statusReal === 'amanha';
      return statusReal === estado.filtroStatus;
    });
  }

  // Filtro de texto e data (barra de filtros)
  const inputBusca  = container.querySelector('#cobrancas-busca');
  const inputInicio = container.querySelector('#cobrancas-data-inicio');
  const inputFim    = container.querySelector('#cobrancas-data-fim');
  if (inputBusca || inputInicio || inputFim) {
    const termo     = inputBusca?.value.trim().toLowerCase() || '';
    const dataInicio = inputInicio?.value || null;
    const dataFim    = inputFim?.value    || null;
    cobrancasFiltradas = filtrarLista(cobrancasFiltradas, {
      campoTexto: 'clienteNome',
      termo,
      campoData: 'dataVencimento',
      dataInicio,
      dataFim,
    });
  }

  cobrancasFiltradas.sort((a, b) => {
    if (a.status === 'paga' && b.status !== 'paga') return 1;
    if (b.status === 'paga' && a.status !== 'paga') return -1;
    
    const dateA = new Date(a.dataVencimento);
    const dateB = new Date(b.dataVencimento);
    
    if (a.status === 'paga') return dateB - dateA;
    return dateA - dateB;
  });

  const listaContainer = container.querySelector('#cobrancas-lista');
  if (listaContainer) {
    if (cobrancasFiltradas.length === 0) {
      listaContainer.innerHTML = `
        <div class="empty-state" style="padding: var(--space-16) var(--space-8);">
          <span class="material-symbols-outlined empty-state-icon">receipt_long</span>
          <h3 class="empty-state-title">Nenhuma Cobrança</h3>
          <p class="empty-state-text">Nenhuma cobrança encontrada para este filtro.</p>
        </div>
      `;
    } else {
      listaContainer.innerHTML = cobrancasFiltradas.map(cobranca => {
        const statusReal = obterStatusReal(cobranca);
        let statusCor, statusBg, statusIcon, statusLabel;
        
        if (statusReal === 'paga') {
          statusCor = 'var(--color-success)'; statusBg = 'var(--color-success-muted)'; statusIcon = 'check_circle';
        } else if (statusReal === 'atrasada') {
          statusCor = 'var(--color-danger)'; statusBg = 'var(--color-danger-muted)'; statusIcon = 'error';
        } else {
          statusCor = 'var(--color-gold)'; statusBg = 'var(--bg-overlay)'; statusIcon = 'schedule';
        }
        
        const nomeCliente = cobranca.clienteNome || 'Cliente Excluído';

        return `
          <div class="card" style="margin-bottom: var(--space-4);">
            <div class="card-body" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);">
              
              <div style="display: flex; align-items: center; gap: var(--space-4); flex: 1; min-width: 250px;">
                <div style="width: 48px; height: 48px; border-radius: var(--radius-md); background-color: ${statusBg}; color: ${statusCor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <span class="material-symbols-outlined" style="font-size: 24px;">${statusIcon}</span>
                </div>
                <div>
                  <h4 style="margin: 0; font-size: var(--text-base); font-weight: var(--font-semibold); color: var(--text-primary);">${escapeHTML(nomeCliente)}</h4>
                  <span style="font-size: var(--text-sm); color: var(--text-muted);">${escapeHTML(cobranca.descricao) || 'Sem descrição'}</span>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: var(--space-6); min-width: 150px; justify-content: flex-end;">
                <div style="text-align: right;">
                  <p style="margin: 0; font-size: var(--text-xs); color: var(--text-muted);">Venc: ${formatarData(cobranca.dataVencimento)}</p>
                  <p class="value-sensitive" style="margin: 0; font-size: var(--text-lg); font-weight: var(--font-bold); color: ${statusCor};">
                    ${formatarMoeda(cobranca.valor)}
                  </p>
                </div>
              </div>

              <div style="display: flex; gap: var(--space-1); width: 100%; justify-content: flex-end; border-top: 1px solid var(--border-default); padding-top: var(--space-3); margin-top: var(--space-2);">
                ${statusReal !== 'paga' ? `
                  <button class="btn btn-ghost btn-sm" data-acao="pagar" data-id="${cobranca.id}" data-cliente="${cobranca.clienteId}">
                    <span class="material-symbols-outlined icon-sm" style="color: var(--color-success);">check_circle</span>
                    <span style="font-size: var(--text-xs); font-weight: var(--font-medium);">Receber</span>
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
      }).join('');
    }
  }
}

function atualizarListas() {
  const container = document.getElementById('app-main');
  if (!container) return;
  
  const painelAlertas = container.querySelector('#painel-alertas');
  const painelGerenciar = container.querySelector('#painel-gerenciar');
  
  if (!painelAlertas || !painelGerenciar) return;

  if (estado.abaAtiva === 'alertas') {
    painelAlertas.style.display = 'block';
    painelGerenciar.style.display = 'none';
    renderListaAlertas(painelAlertas);
  } else {
    painelAlertas.style.display = 'none';
    painelGerenciar.style.display = 'block';
    renderListaGerenciar(painelGerenciar);
  }
}

function selecionarAba(aba) {
  estado.abaAtiva = aba;
  
  const btnAlertas = document.getElementById('tab-alertas');
  const btnGerenciar = document.getElementById('tab-gerenciar');
  
  if (btnAlertas && btnGerenciar) {
    if (aba === 'alertas') {
      btnAlertas.classList.replace('btn-ghost', 'btn-primary');
      btnGerenciar.classList.replace('btn-primary', 'btn-ghost');
    } else {
      btnGerenciar.classList.replace('btn-ghost', 'btn-primary');
      btnAlertas.classList.replace('btn-primary', 'btn-ghost');
    }
  }
  
  atualizarListas();
}

function renderizarTelaPrincipal(container) {
  // ─ KPIs unificados: Cobranças Avulsas + HmCred + Promissórias ─
  const kpis = {
    totalReceber:    0,
    atrasadasValor:  0,
    atrasadasCount:  0,
    pagasValor:      0,
    pagasCount:      0
  };

  // 1. Cobranças Avulsas
  estado.cobrancas.forEach(c => {
    const statusReal = obterStatusReal(c);
    if (statusReal !== 'paga') {
      kpis.totalReceber += (c.valor || 0);
      if (statusReal === 'atrasada') {
        kpis.atrasadasCount++;
        kpis.atrasadasValor += (c.valor || 0);
      }
    } else {
      kpis.pagasCount++;
      kpis.pagasValor += (c.valor || 0);
    }
  });

  // 2. Parcelas HmCred
  estado.hmcred.forEach(op => {
    if (op.status === 'pago' || !op.listaParcelas) return;
    op.listaParcelas.forEach(parc => {
      if (parc.pago) {
        kpis.pagasCount++;
        kpis.pagasValor += (parc.valor || 0);
      } else {
        kpis.totalReceber += (parc.valor || 0);
        const statusReal = calcularStatusVencimento(parc.vencimento, 'pendente');
        if (statusReal === 'atrasada') {
          kpis.atrasadasCount++;
          kpis.atrasadasValor += (parc.valor || 0);
        }
      }
    });
  });

  // 3. Parcelas de Promissórias
  estado.promissorias.forEach(prom => {
    if (prom.status === 'pago' || !prom.cronograma) return;
    prom.cronograma.forEach(parc => {
      const valorParc = parc.valorParcela || parc.juros || 0;
      if (parc.pago) {
        kpis.pagasCount++;
        kpis.pagasValor += valorParc;
      } else {
        kpis.totalReceber += valorParc;
        const statusReal = calcularStatusVencimento(parc.vencimento, 'pendente');
        if (statusReal === 'atrasada') {
          kpis.atrasadasCount++;
          kpis.atrasadasValor += valorParc;
        }
      }
    });
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

    <div class="stats-grid" style="margin-bottom: var(--space-6);">
      <div class="stat-card card-gold">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm text-gold-muted">Total a Receber (Todos os módulos)</span>
          <div class="stat-card-icon" style="color: var(--color-gold);"><span class="material-symbols-outlined">account_balance_wallet</span></div>
        </div>
        <div class="stat-card-value text-gold value-sensitive">${formatarMoeda(kpis.totalReceber)}</div>
      </div>
      <div class="stat-card card-danger">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm text-danger-muted">Em Atraso <small style="font-weight:normal;">(${kpis.atrasadasCount} it${kpis.atrasadasCount === 1 ? 'em' : 'ens'})</small></span>
          <div class="stat-card-icon" style="background-color: var(--color-danger-muted); color: var(--color-danger);"><span class="material-symbols-outlined">error</span></div>
        </div>
        <div class="stat-card-value text-danger value-sensitive">${formatarMoeda(kpis.atrasadasValor)}</div>
      </div>
      <div class="stat-card card-success">
        <div class="stat-card-header">
          <span class="stat-card-label text-sm text-success-muted">Recebido <small style="font-weight:normal;">(${kpis.pagasCount} it${kpis.pagasCount === 1 ? 'em' : 'ens'})</small></span>
          <div class="stat-card-icon" style="background-color: var(--color-success-muted); color: var(--color-success);"><span class="material-symbols-outlined">check_circle</span></div>
        </div>
        <div class="stat-card-value text-success value-sensitive">${formatarMoeda(kpis.pagasValor)}</div>
      </div>
    </div>

    <!-- Navegação de Abas -->
    <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-4); background: var(--bg-overlay); padding: 4px; border-radius: var(--radius-md); max-width: 400px;">
      <button id="tab-alertas" class="btn ${estado.abaAtiva === 'alertas' ? 'btn-primary' : 'btn-ghost'}" style="flex: 1;" data-aba="alertas">
        <span class="material-symbols-outlined icon-sm">notifications_active</span> Alertas
      </button>
      <button id="tab-gerenciar" class="btn ${estado.abaAtiva === 'gerenciar' ? 'btn-primary' : 'btn-ghost'}" style="flex: 1;" data-aba="gerenciar">
        <span class="material-symbols-outlined icon-sm">list_alt</span> Gerenciar
      </button>
    </div>

    <!-- Painel 1: Alertas (Unificado) -->
    <div id="painel-alertas" style="display: ${estado.abaAtiva === 'alertas' ? 'block' : 'none'};">
      <h3 class="text-lg font-semibold" style="margin-bottom: var(--space-2);">Cobranças Urgentes</h3>
      <p style="color: var(--text-muted); font-size: var(--text-sm); margin-bottom: var(--space-4);">Exibindo itens vencidos ou que vencem hoje/amanhã de todos os módulos.</p>
      <!-- Lista injetada via JS -->
    </div>

    <!-- Painel 2: Gerenciar (Avulsas) -->
    <div id="painel-gerenciar" style="display: ${estado.abaAtiva === 'gerenciar' ? 'block' : 'none'};">
      <div class="dashboard-section-header" style="margin-bottom: var(--space-4); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-4);">
        <h3 class="text-lg font-semibold">Cobranças Avulsas</h3>
        
        <div style="display: flex; gap: var(--space-2); flex-wrap: wrap; background: var(--bg-overlay); padding: 4px; border-radius: var(--radius-md);">
          <button class="btn btn-sm ${estado.filtroStatus === 'todas' ? 'btn-primary' : 'btn-ghost'} filter-btn" data-status="todas">Todas</button>
          <button class="btn btn-sm ${estado.filtroStatus === 'aberto' ? 'btn-primary' : 'btn-ghost'} filter-btn" data-status="aberto">A Vencer</button>
          <button class="btn btn-sm ${estado.filtroStatus === 'atrasadas' ? 'btn-primary' : 'btn-ghost'} filter-btn" data-status="atrasadas">Atrasadas</button>
          <button class="btn btn-sm ${estado.filtroStatus === 'pagas' ? 'btn-primary' : 'btn-ghost'} filter-btn" data-status="pagas">Pagas</button>
        </div>
      </div>

      ${criarHTMLBarraFiltros({ prefixo: 'cobrancas', labelBusca: 'Buscar por cliente ou descrição...' })}

      <div id="cobrancas-lista">
        <!-- Lista injetada dinamicamente -->
      </div>
    </div>

    ${renderizarModais()}
  `;

  registrarEventosTela(container);
  atualizarListas();
}

function registrarEventosTela(container) {
  const btnNova = document.getElementById('btn-nova-cobranca');
  if (btnNova) btnNova.addEventListener('click', () => abrirModal('modal-nova-cobranca'));

  const formNova = document.getElementById('form-nova-cobranca');
  if (formNova) formNova.addEventListener('submit', criarCobranca);

  const formWa = document.getElementById('form-whatsapp');
  if (formWa) formWa.addEventListener('submit', dispararWhatsapp);

  const tabAlertas = document.getElementById('tab-alertas');
  if (tabAlertas) tabAlertas.addEventListener('click', () => selecionarAba('alertas'));
  
  const tabGerenciar = document.getElementById('tab-gerenciar');
  if (tabGerenciar) tabGerenciar.addEventListener('click', () => selecionarAba('gerenciar'));

  registrarEventosFiltros(container, {
    prefixo: 'cobrancas',
    onFiltrar: () => atualizarListas()
  });

  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const btnAlvo = e.target.closest('.filter-btn');
      if (btnAlvo && btnAlvo.dataset.status) {
        aplicarFiltro(btnAlvo.dataset.status);
      }
    });
  });

  if (!container.dataset.eventosRegistradosCobrancas) {
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
        
        if (acao === 'pagar') marcarComoPaga(id, clienteId);
        else if (acao === 'excluir') excluirCobranca(id, clienteId);
        else if (acao === 'pix') copiarPix(alvo.getAttribute('data-pix'));
        else if (acao === 'alerta-whatsapp') abrirModalWhatsapp(id);
        
        e.stopPropagation();
      }
    });

    container.dataset.eventosRegistradosCobrancas = 'true';
  }

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
        <p style="color: var(--text-muted); margin-top: var(--space-4);">Carregando painel...</p>
      </div>
    `;

    // Limpa listeners antigos
    if (unsubscribeCobrancas) { unsubscribeCobrancas(); unsubscribeCobrancas = null; }
    if (unsubscribeClientes) { unsubscribeClientes(); unsubscribeClientes = null; }
    if (unsubscribeHmcred) { unsubscribeHmcred(); unsubscribeHmcred = null; }
    if (unsubscribePromissorias) { unsubscribePromissorias(); unsubscribePromissorias = null; }
    if (unsubscribePix) { unsubscribePix(); unsubscribePix = null; }

    // Controla se a tela principal já foi renderizada ao menos uma vez
    let telaRendered = false;

    const reRender = () => {
      if (telaRendered) {
        // Tela já existe: atualiza apenas listas e KPIs sem reconstruir todo o DOM
        atualizarListas();
      }
      // Se a tela ainda não foi renderizada (cobrancas ainda não chegou),
      // os dados ficam em estado.* e serão usados quando renderizarTelaPrincipal for chamado
    };

    // Timeout de segurança: se após 6s o listener principal não retornou (ex: erro de permissão),
    // renderiza a tela com os dados disponíveis para evitar loading infinito.
    const timeoutFallback = setTimeout(() => {
      if (!telaRendered) {
        console.warn('[Cobranças] Timeout ao aguardar dados — renderizando tela com dados disponíveis.');
        telaRendered = true;
        renderizarTelaPrincipal(container);
      }
    }, 6000);

    unsubscribeClientes = FirestoreService.escutar('clientes',
      (dados) => { estado.clientes = dados; reRender(); },
      {},
      (erro) => { console.warn('[Cobranças] Erro listener clientes:', erro.message); reRender(); }
    );
    unsubscribeHmcred = FirestoreService.escutar('hmcred_operacoes',
      (dados) => { estado.hmcred = dados; reRender(); },
      {},
      (erro) => { console.warn('[Cobranças] Erro listener hmcred_operacoes:', erro.message); reRender(); }
    );
    unsubscribePromissorias = FirestoreService.escutar('promissorias',
      (dados) => { estado.promissorias = dados; reRender(); },
      {},
      (erro) => { console.warn('[Cobranças] Erro listener promissorias:', erro.message); reRender(); }
    );
    unsubscribePix = FirestoreService.escutar('pix_chaves',
      (dados) => { estado.pix = dados; reRender(); },
      {},
      (erro) => { console.warn('[Cobranças] Erro listener pix_chaves:', erro.message); reRender(); }
    );

    unsubscribeCobrancas = FirestoreService.escutar('cobrancas',
      (dados) => {
        clearTimeout(timeoutFallback);
        estado.cobrancas = dados;
        telaRendered = true;
        renderizarTelaPrincipal(container);
      },
      { ordenarPor: 'dataVencimento', direcao: 'asc' },
      (erro) => {
        clearTimeout(timeoutFallback);
        console.warn('[Cobranças] Erro listener cobrancas:', erro.message);
        if (!telaRendered) {
          telaRendered = true;
          renderizarTelaPrincipal(container);
        }
      }
    );
  }
};
