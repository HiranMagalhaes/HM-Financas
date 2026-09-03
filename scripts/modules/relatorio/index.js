/**
 * HM Finanças — Módulo: Relatórios
 * ============================================================
 * Reconstrução completa com:
 *   - Comparativo Mensal (gráfico de barras SVG nativo + tabela)
 *   - Identificação de clientes com atraso recorrente
 *   - Gerador de Contrato/Recibo com impressão nativa (window.print())
 *
 * Não usa nenhuma biblioteca externa.
 */

'use strict';

import { AuthService }      from '../../firebase/auth-service.js';
import { FirestoreService } from '../../firebase/firestore-service.js';
import { formatarMoeda, formatarData } from '../../utils/formatters.js';
import { escapeHTML } from '../../utils/helpers.js';

/* ─────────────────────────────────────────────────────────────────────────────
   ESTADO DO MÓDULO
───────────────────────────────────────────────────────────────────────────── */

let estado = {
  cobrancas:    [],
  promissorias: [],
  operacoes:    [],
  clientes:     [],
  abaAtiva:     'comparativo', // 'comparativo' | 'contrato'
};

let unsubscribeCobrancas    = null;
let unsubscribePromissorias = null;
let unsubscribeOperacoes    = null;
let unsubscribeClientes     = null;

/* ─────────────────────────────────────────────────────────────────────────────
   CÁLCULOS DE COMPARATIVO MENSAL
───────────────────────────────────────────────────────────────────────────── */

/**
 * Gera um array dos últimos N meses no formato { ano, mes, label, chave }.
 * @param {number} quantidadeMeses - Quantidade de meses a exibir (máx 12)
 * @returns {Array}
 */
function obterUltimosMeses(quantidadeMeses = 6) {
  const meses = [];
  const hoje = new Date();
  for (let i = quantidadeMeses - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const ano = d.getFullYear();
    const mes = d.getMonth() + 1;
    const chave = `${ano}-${String(mes).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      .replace('.', '').replace(' de ', '/');
    meses.push({ ano, mes, chave, label });
  }
  return meses;
}

/**
 * Extrai o AAAA-MM de uma string de data AAAA-MM-DD ou Timestamp.
 * @param {string|object} data
 * @returns {string|null}
 */
function extrairMesAno(data) {
  if (!data) return null;
  if (typeof data === 'string') return data.substring(0, 7);
  if (data.toDate) return data.toDate().toISOString().substring(0, 7);
  return null;
}

/**
 * Calcula os dados mensais consolidados a partir do estado.
 * @param {Array} meses - Array retornado por obterUltimosMeses
 * @returns {Array} Array com { chave, label, recebido, atraso, emprestado }
 */
function calcularDadosMensais(meses) {
  return meses.map(({ chave, label }) => {
    let recebido   = 0; // Cobranças pagas no mês
    let atraso     = 0; // Cobranças em aberto cujo vencimento cai no mês
    let emprestado = 0; // Capital emprestado via HMCRED no mês

    estado.cobrancas.forEach(c => {
      const mesVenc = extrairMesAno(c.dataVencimento);
      if (mesVenc !== chave) return;
      if (c.status === 'paga') {
        recebido += c.valor || 0;
      } else {
        atraso += c.valor || 0;
      }
    });

    estado.operacoes.forEach(op => {
      const mesConc = extrairMesAno(op.dataConcessao);
      if (mesConc === chave) {
        emprestado += op.valorConcedido || 0;
      }
    });

    return { chave, label, recebido, atraso, emprestado };
  });
}

/**
 * Identifica clientes que aparecem com cobrança em atraso em 2 ou mais meses distintos.
 * Calculado a partir dos dados de cobrancas existentes, sem nova coleção.
 * @returns {Array} Array de { clienteNome, mesesAtraso, totalAtraso }
 */
function identificarClientesRecorrentes() {
  const mapa = new Map(); // clienteId -> { nome, meses: Set, total }

  estado.cobrancas.forEach(c => {
    if (c.status === 'paga') return;
    const mes = extrairMesAno(c.dataVencimento);
    if (!mes) return;

    const chave = c.clienteId || c.clienteNome || 'desconhecido';
    if (!mapa.has(chave)) {
      mapa.set(chave, { nome: c.clienteNome || 'Desconhecido', meses: new Set(), total: 0 });
    }
    mapa.get(chave).meses.add(mes);
    mapa.get(chave).total += c.valor || 0;
  });

  return Array.from(mapa.values())
    .filter(cl => cl.meses.size >= 2)
    .sort((a, b) => b.total - a.total);
}

/* ─────────────────────────────────────────────────────────────────────────────
   GRÁFICO DE BARRAS SVG NATIVO
───────────────────────────────────────────────────────────────────────────── */

/**
 * Gera o SVG do gráfico de barras agrupadas (Recebido / Atraso / Emprestado).
 * Sem nenhuma biblioteca externa.
 *
 * @param {Array} dados - Array retornado por calcularDadosMensais
 * @returns {string} HTML do elemento <svg>
 */
function gerarGraficoSVG(dados) {
  if (dados.length === 0) return '<p class="text-center text-muted">Sem dados para exibir.</p>';

  const larguraSVG    = 700;
  const alturaSVG     = 300;
  const paddingTop    = 20;
  const paddingBottom = 50;
  const paddingLeft   = 60;
  const paddingRight  = 20;

  const areaLargura = larguraSVG - paddingLeft - paddingRight;
  const areaAltura  = alturaSVG  - paddingTop - paddingBottom;

  const maxValor = Math.max(
    ...dados.flatMap(d => [d.recebido, d.atraso, d.emprestado]),
    1
  );

  const numMeses    = dados.length;
  const numBarrasPorMes = 3;
  const espacoGrupo = areaLargura / numMeses;
  const larguraBarra = Math.min(espacoGrupo / (numBarrasPorMes + 1), 30);

  const cores = {
    recebido:   '#4ade80', // verde
    atraso:     '#f87171', // vermelho
    emprestado: '#facc15', // amarelo/dourado
  };

  // Linhas de grade horizontais
  const numLinhas = 4;
  let linhasGrade = '';
  for (let i = 0; i <= numLinhas; i++) {
    const y = paddingTop + (areaAltura / numLinhas) * i;
    const valorLabel = formatarMoeda(maxValor * (1 - i / numLinhas));
    linhasGrade += `
      <line x1="${paddingLeft}" y1="${y}" x2="${larguraSVG - paddingRight}" y2="${y}"
            stroke="var(--border-default)" stroke-width="1" stroke-dasharray="4,4" opacity="0.5"/>
      <text x="${paddingLeft - 6}" y="${y + 4}" text-anchor="end"
            font-size="9" fill="var(--text-muted)">${valorLabel}</text>
    `;
  }

  // Barras e labels
  let barras = '';
  let labelsX = '';

  dados.forEach((d, idx) => {
    const xGrupo = paddingLeft + idx * espacoGrupo + espacoGrupo / 2;
    const xBase  = xGrupo - (numBarrasPorMes * larguraBarra) / 2;

    [
      { val: d.recebido,   cor: cores.recebido,   label: 'Recebido'   },
      { val: d.atraso,     cor: cores.atraso,     label: 'Em Atraso'  },
      { val: d.emprestado, cor: cores.emprestado, label: 'Emprestado' },
    ].forEach((barra, bi) => {
      const altBarra = (barra.val / maxValor) * areaAltura;
      const xBarra   = xBase + bi * larguraBarra;
      const yBarra   = paddingTop + areaAltura - altBarra;

      barras += `
        <rect x="${xBarra.toFixed(1)}" y="${yBarra.toFixed(1)}"
              width="${(larguraBarra - 2).toFixed(1)}" height="${altBarra.toFixed(1)}"
              fill="${barra.cor}" rx="2" opacity="0.85">
          <title>${barra.label}: ${formatarMoeda(barra.val)}</title>
        </rect>
      `;
    });

    // Label do mês no eixo X
    labelsX += `
      <text x="${xGrupo.toFixed(1)}" y="${alturaSVG - 10}"
            text-anchor="middle" font-size="11" fill="var(--text-muted)">${d.label}</text>
    `;
  });

  // Legenda
  const legenda = `
    <g transform="translate(${paddingLeft}, ${alturaSVG - 5})">
      <rect x="0" y="0" width="10" height="10" fill="${cores.recebido}" rx="2"/>
      <text x="13" y="9" font-size="10" fill="var(--text-secondary)">Recebido</text>
      <rect x="80" y="0" width="10" height="10" fill="${cores.atraso}" rx="2"/>
      <text x="93" y="9" font-size="10" fill="var(--text-secondary)">Em Atraso</text>
      <rect x="170" y="0" width="10" height="10" fill="${cores.emprestado}" rx="2"/>
      <text x="183" y="9" font-size="10" fill="var(--text-secondary)">Emprestado</text>
    </g>
  `;

  return `
    <svg viewBox="0 0 ${larguraSVG} ${alturaSVG}" role="img" aria-label="Gráfico comparativo mensal"
         style="width: 100%; max-width: ${larguraSVG}px; height: auto; overflow: visible;">
      ${linhasGrade}
      ${barras}
      ${labelsX}
      ${legenda}
    </svg>
  `;
}

/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO — COMPARATIVO MENSAL
───────────────────────────────────────────────────────────────────────────── */

function renderizarComparativo(container, quantidadeMeses) {
  const meses = obterUltimosMeses(quantidadeMeses);
  const dados = calcularDadosMensais(meses);
  const recorrentes = identificarClientesRecorrentes();

  // Totais globais
  const totalRecebido   = dados.reduce((a, d) => a + d.recebido,   0);
  const totalAtraso     = dados.reduce((a, d) => a + d.atraso,     0);
  const totalEmprestado = dados.reduce((a, d) => a + d.emprestado, 0);

  // Tabela de dados mensais
  const linhasTabela = dados.map(d => `
    <tr>
      <td style="font-weight: var(--font-medium);">${d.label}</td>
      <td class="value-sensitive text-success">${formatarMoeda(d.recebido)}</td>
      <td class="value-sensitive text-danger">${formatarMoeda(d.atraso)}</td>
      <td class="value-sensitive text-warning">${formatarMoeda(d.emprestado)}</td>
    </tr>
  `).join('');

  // Clientes recorrentes
  const secaoRecorrentes = recorrentes.length === 0
    ? `<p class="text-muted text-sm" style="padding: var(--space-4) 0;">Nenhum cliente com atraso em mais de um mês no período.</p>`
    : `
      <div style="display: grid; gap: var(--space-2); margin-top: var(--space-3);">
        ${recorrentes.map(cl => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-3); background: var(--color-danger-muted); border-radius: var(--radius-md); border-left: 3px solid var(--color-danger);">
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span class="material-symbols-outlined" style="font-size: 18px; color: var(--color-danger);">warning</span>
              <div>
                <p style="margin:0; font-weight: var(--font-semibold); font-size: var(--text-sm);">${escapeHTML(cl.nome)}</p>
                <p style="margin:0; font-size: var(--text-xs); color: var(--text-muted);">${cl.meses.size} meses distintos em atraso</p>
              </div>
            </div>
            <span class="value-sensitive" style="font-size: var(--text-sm); font-weight: var(--font-bold); color: var(--color-danger);">${formatarMoeda(cl.total)}</span>
          </div>
        `).join('')}
      </div>
    `;

  container.innerHTML = `
    <!-- KPIs do período -->
    <div class="stats-grid" style="margin-bottom: var(--space-6);">
      <div class="stat-card card-success">
        <div class="stat-card-header">
          <span class="stat-card-label">Recebido no Período</span>
          <div class="stat-card-icon" style="background-color: var(--color-success-muted); color: var(--color-success);">
            <span class="material-symbols-outlined">trending_up</span>
          </div>
        </div>
        <div class="stat-card-value text-success value-sensitive">${formatarMoeda(totalRecebido)}</div>
      </div>
      <div class="stat-card card-danger">
        <div class="stat-card-header">
          <span class="stat-card-label">Em Atraso (Total)</span>
          <div class="stat-card-icon" style="background-color: var(--color-danger-muted); color: var(--color-danger);">
            <span class="material-symbols-outlined">error</span>
          </div>
        </div>
        <div class="stat-card-value text-danger value-sensitive">${formatarMoeda(totalAtraso)}</div>
      </div>
      <div class="stat-card card-gold">
        <div class="stat-card-header">
          <span class="stat-card-label">Capital Emprestado</span>
          <div class="stat-card-icon" style="color: var(--color-gold);">
            <span class="material-symbols-outlined">account_balance</span>
          </div>
        </div>
        <div class="stat-card-value text-gold value-sensitive">${formatarMoeda(totalEmprestado)}</div>
      </div>
    </div>

    <!-- Gráfico SVG -->
    <div class="card" style="margin-bottom: var(--space-6);">
      <div class="card-body">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); flex-wrap: wrap; gap: var(--space-3);">
          <h3 style="margin:0; font-size: var(--text-base); font-weight: var(--font-semibold);">
            <span class="material-symbols-outlined icon-sm" style="vertical-align: middle; color: var(--color-gold);">bar_chart</span>
            Comparativo dos Últimos ${quantidadeMeses} Meses
          </h3>
          <div style="display: flex; gap: var(--space-2); align-items: center;">
            <select id="sel-periodo" class="form-input" style="padding: var(--space-2) var(--space-3); font-size: var(--text-sm); width: auto;">
              <option value="3"  ${quantidadeMeses === 3  ? 'selected' : ''}>3 meses</option>
              <option value="6"  ${quantidadeMeses === 6  ? 'selected' : ''}>6 meses</option>
              <option value="12" ${quantidadeMeses === 12 ? 'selected' : ''}>12 meses</option>
            </select>
            <button id="btn-imprimir-relatorio" class="btn btn-ghost btn-sm" style="display:flex; align-items:center; gap:4px;">
              <span class="material-symbols-outlined icon-sm">print</span>
              Imprimir
            </button>
          </div>
        </div>
        <div id="grafico-area" style="overflow-x: auto;">
          ${gerarGraficoSVG(dados)}
        </div>
      </div>
    </div>

    <!-- Tabela de dados -->
    <div class="card" style="margin-bottom: var(--space-6);">
      <div class="card-body">
        <h3 style="margin:0 0 var(--space-4) 0; font-size: var(--text-base); font-weight: var(--font-semibold);">
          Tabela Comparativa Mensal
        </h3>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Mês</th>
                <th>Recebido</th>
                <th>Em Atraso</th>
                <th>Capital Emprestado</th>
              </tr>
            </thead>
            <tbody>
              ${linhasTabela}
            </tbody>
            <tfoot style="font-weight: var(--font-bold);">
              <tr style="border-top: 2px solid var(--border-default);">
                <td>Total</td>
                <td class="value-sensitive text-success">${formatarMoeda(totalRecebido)}</td>
                <td class="value-sensitive text-danger">${formatarMoeda(totalAtraso)}</td>
                <td class="value-sensitive text-warning">${formatarMoeda(totalEmprestado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>

    <!-- Clientes recorrentes -->
    <div class="card">
      <div class="card-body">
        <h3 style="margin:0 0 var(--space-2) 0; font-size: var(--text-base); font-weight: var(--font-semibold);">
          <span class="material-symbols-outlined icon-sm" style="vertical-align: middle; color: var(--color-danger);">person_alert</span>
          Clientes com Atraso Recorrente
        </h3>
        <p style="font-size: var(--text-sm); color: var(--text-muted); margin-bottom: var(--space-3);">
          Clientes com cobranças em aberto em 2 ou mais meses distintos.
        </p>
        ${secaoRecorrentes}
      </div>
    </div>
  `;

  // Evento: mudar período
  const selPeriodo = container.querySelector('#sel-periodo');
  if (selPeriodo) {
    selPeriodo.addEventListener('change', () => {
      renderizarComparativo(container, parseInt(selPeriodo.value, 10));
    });
  }

  // Evento: imprimir relatório
  const btnImprimir = container.querySelector('#btn-imprimir-relatorio');
  if (btnImprimir) {
    btnImprimir.addEventListener('click', () => {
      document.title = 'Relatório — HM Finanças';
      window.print();
    });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO — GERADOR DE CONTRATO
───────────────────────────────────────────────────────────────────────────── */

function renderizarContrato(container) {
  // Monta lista de "pessoas" buscando em clientes + operações HMCRED + promissórias
  const pessoas = [];

  estado.clientes.forEach(c => {
    if (!pessoas.find(p => p.id === c.id)) {
      pessoas.push({ id: c.id, nome: c.nome, tipo: 'cliente' });
    }
  });

  estado.operacoes.forEach(op => {
    const chave = op.clienteId || op.destino;
    if (!pessoas.find(p => p.id === chave)) {
      pessoas.push({ id: chave, nome: op.destino || 'Desconhecido', tipo: 'operacao' });
    }
  });

  const opcoesSelect = pessoas
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map(p => `<option value="${p.id}">${escapeHTML(p.nome)}</option>`)
    .join('');

  container.innerHTML = `
    <div class="card" style="margin-bottom: var(--space-6);">
      <div class="card-body">
        <h3 style="margin:0 0 var(--space-4) 0; font-size: var(--text-base); font-weight: var(--font-semibold);">
          <span class="material-symbols-outlined icon-sm" style="vertical-align: middle; color: var(--color-gold);">description</span>
          Gerador de Contrato / Recibo
        </h3>

        <!-- Seleção de pessoa -->
        <div class="form-group">
          <label class="form-label">Selecionar Pessoa / Devedor</label>
          <select id="sel-pessoa-contrato" class="form-input form-select">
            <option value="">Escolha uma pessoa...</option>
            ${opcoesSelect}
          </select>
        </div>

        <!-- Seleção de operação -->
        <div class="form-group" id="grupo-sel-operacao" style="display:none;">
          <label class="form-label">Selecionar Operação</label>
          <select id="sel-operacao-contrato" class="form-input form-select">
            <option value="">Escolha a operação...</option>
          </select>
        </div>

        <button id="btn-gerar-contrato" class="btn btn-primary" style="margin-top: var(--space-2);">
          <span class="material-symbols-outlined icon-sm">description</span>
          Gerar Contrato
        </button>
      </div>
    </div>

    <!-- Área do contrato (oculta até gerar) -->
    <div id="area-contrato" style="display:none;">
      <div class="card" style="margin-bottom: var(--space-4);">
        <div class="card-body" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: var(--space-3);">
          <h3 style="margin:0;">Contrato Gerado</h3>
          <button id="btn-imprimir-contrato" class="btn btn-primary" style="display:flex; align-items:center; gap:6px;">
            <span class="material-symbols-outlined icon-sm">print</span>
            Imprimir / Salvar PDF
          </button>
        </div>
      </div>
      <div id="conteudo-contrato" class="contrato-impressao"></div>
    </div>
  `;

  // Preenche operações ao selecionar pessoa
  const selPessoa = container.querySelector('#sel-pessoa-contrato');
  const selOperacao = container.querySelector('#sel-operacao-contrato');
  const grupoSelOp = container.querySelector('#grupo-sel-operacao');

  if (selPessoa) {
    selPessoa.addEventListener('change', () => {
      const pessoaId = selPessoa.value;
      if (!pessoaId) {
        grupoSelOp.style.display = 'none';
        return;
      }

      // Busca operações HMCRED desta pessoa
      const opsHmcred = estado.operacoes.filter(
        op => (op.clienteId === pessoaId || op.destino === pessoaId) && op.status !== 'pago'
      );
      // Busca promissórias desta pessoa
      const opsProm = estado.promissorias.filter(
        p => p.clienteId === pessoaId && p.status !== 'recebida'
      );

      const opcoes = [
        ...opsHmcred.map(op => `<option value="hmcred-${op.id}">HMCRED — ${formatarMoeda(op.valorConcedido)} (${formatarData(op.dataPrevista)})</option>`),
        ...opsProm.map(p => `<option value="prom-${p.id}">Promissória — ${formatarMoeda(p.valorInvestido)} — ${p.descricao || ''}</option>`),
      ];

      if (opcoes.length === 0) {
        selOperacao.innerHTML = '<option value="">Nenhuma operação em aberto</option>';
        grupoSelOp.style.display = 'block';
      } else {
        selOperacao.innerHTML = '<option value="">Escolha a operação...</option>' + opcoes.join('');
        grupoSelOp.style.display = 'block';
      }
    });
  }

  // Gerar contrato
  const btnGerar = container.querySelector('#btn-gerar-contrato');
  if (btnGerar) {
    btnGerar.addEventListener('click', () => {
      const pessoaId = selPessoa?.value;
      const opId    = selOperacao?.value;

      if (!pessoaId) {
        alert('Selecione uma pessoa primeiro.');
        return;
      }

      const pessoa = pessoas.find(p => p.id === pessoaId);
      let nomeDevedor = pessoa?.nome || 'Devedor';
      let valorContrato = 0, condicoes = '', vencimento = '';

      if (opId?.startsWith('hmcred-')) {
        const idOp = opId.replace('hmcred-', '');
        const op = estado.operacoes.find(o => o.id === idOp);
        if (op) {
          valorContrato = op.valorConcedido;
          const taxa = op.taxaJuros ? `${op.taxaJuros}% a.m. (juros simples)` : 'sem juros';
          condicoes = `Taxa de juros: ${taxa}. Valor total a receber: ${formatarMoeda(op.valorReceber)}.`;
          vencimento = formatarData(op.dataPrevista);
        }
      } else if (opId?.startsWith('prom-')) {
        const idProm = opId.replace('prom-', '');
        const p = estado.promissorias.find(x => x.id === idProm);
        if (p) {
          valorContrato = p.valorInvestido;
          const modLabel = { unico: 'Pagamento Único', amortizacao: 'Amortização', juros_mensais: 'Juros Mensais' }[p.modalidade] || '';
          condicoes = `Modalidade: ${modLabel}. ${p.taxaMensal ? `Taxa: ${p.taxaMensal}%/mês.` : ''} Lucro estimado: ${formatarMoeda(p.lucro || 0)}.`;
          vencimento = formatarData(p.dataVencimento);
        }
      } else {
        // Pessoa selecionada mas sem operação específica — gera contrato genérico
        valorContrato = 0;
        condicoes = 'Conforme acordo entre as partes.';
        vencimento = '____/____/________';
      }

      const hoje = new Date().toLocaleDateString('pt-BR');

      const htmlContrato = `
        <div class="contrato-corpo" style="
          font-family: 'Georgia', serif;
          line-height: 1.8;
          color: #1a1a1a;
          background: white;
          padding: 40px 50px;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-default);
          max-width: 720px;
          margin: 0 auto;
        ">
          <div style="text-align:center; margin-bottom: 32px; border-bottom: 2px solid #000; padding-bottom: 16px;">
            <h2 style="margin:0; font-size: 20px; letter-spacing: 2px; text-transform: uppercase;">Declaração de Dívida</h2>
            <p style="margin:4px 0; font-size: 13px; color: #555;">Instrumento Particular</p>
          </div>

          <p style="text-align: justify; margin-bottom: 20px;">
            Eu, <strong>${escapeHTML(nomeDevedor)}</strong>, declaro que recebi a quantia de
            <strong>${formatarMoeda(valorContrato)}</strong>
            (${valorContrato > 0 ? 'conforme acordo formalizado' : 'conforme valor a ser preenchido'}),
            na presente data de <strong>${hoje}</strong>, e me comprometo a efetuar o pagamento integral
            até a data de <strong>${vencimento}</strong>.
          </p>

          <p style="text-align: justify; margin-bottom: 20px;">
            <strong>Condições:</strong> ${escapeHTML(condicoes)}
          </p>

          <p style="text-align: justify; margin-bottom: 32px;">
            O não pagamento na data acordada implicará na cobrança de juros de mora de 1% ao mês
            sobre o valor em aberto, além das demais penalidades previstas em lei.
          </p>

          <p style="margin-bottom: 8px;"><strong>Local e Data:</strong> _____________, ${hoje}</p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 60px;">
            <div style="text-align: center;">
              <div style="border-top: 1px solid #000; padding-top: 8px;">
                <p style="margin:0; font-size: 13px;"><strong>Credor</strong></p>
                <p style="margin:2px 0; font-size: 12px; color: #555;">Assinatura e CPF</p>
              </div>
            </div>
            <div style="text-align: center;">
              <div style="border-top: 1px solid #000; padding-top: 8px;">
                <p style="margin:0; font-size: 13px;"><strong>Devedor: ${escapeHTML(nomeDevedor)}</strong></p>
                <p style="margin:2px 0; font-size: 12px; color: #555;">Assinatura e CPF</p>
              </div>
            </div>
          </div>

          <p style="margin-top: 40px; font-size: 11px; color: #888; text-align: center;">
            Documento gerado pelo sistema HM Finanças em ${hoje}.
          </p>
        </div>
      `;

      const areaContrato = container.querySelector('#area-contrato');
      const conteudo = container.querySelector('#conteudo-contrato');
      if (conteudo) conteudo.innerHTML = htmlContrato;
      if (areaContrato) areaContrato.style.display = 'block';
      areaContrato?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Imprimir contrato
  const btnImprimir = container.querySelector('#btn-imprimir-contrato');
  if (btnImprimir) {
    btnImprimir.addEventListener('click', () => {
      document.title = 'Contrato — HM Finanças';
      window.print();
    });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   RENDERIZAÇÃO PRINCIPAL
───────────────────────────────────────────────────────────────────────────── */

function renderizarTelaPrincipal(container) {
  // Cabeçalho + abas (persistentes)
  container.innerHTML = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-4);">
      <div>
        <h2 class="page-title">Relatórios</h2>
        <p class="page-subtitle">Análises consolidadas e gerador de contratos.</p>
      </div>
    </div>

    <!-- Abas -->
    <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-6); background: var(--bg-overlay); padding: 4px; border-radius: var(--radius-md); max-width: 440px;">
      <button id="tab-comparativo" class="btn ${estado.abaAtiva === 'comparativo' ? 'btn-primary' : 'btn-ghost'}" style="flex:1;">
        <span class="material-symbols-outlined icon-sm">bar_chart</span>
        Comparativo
      </button>
      <button id="tab-contrato" class="btn ${estado.abaAtiva === 'contrato' ? 'btn-primary' : 'btn-ghost'}" style="flex:1;">
        <span class="material-symbols-outlined icon-sm">description</span>
        Contrato
      </button>
    </div>

    <!-- Área de conteúdo da aba ativa -->
    <div id="aba-conteudo"></div>
  `;

  // Renderiza aba ativa
  const abaConteudo = container.querySelector('#aba-conteudo');

  const renderizarAbaAtiva = () => {
    if (estado.abaAtiva === 'comparativo') {
      renderizarComparativo(abaConteudo, 6);
    } else {
      renderizarContrato(abaConteudo);
    }
  };

  renderizarAbaAtiva();

  // Troca de abas
  container.querySelector('#tab-comparativo')?.addEventListener('click', () => {
    estado.abaAtiva = 'comparativo';
    container.querySelector('#tab-comparativo').className = 'btn btn-primary';
    container.querySelector('#tab-contrato').className = 'btn btn-ghost';
    renderizarComparativo(abaConteudo, 6);
  });

  container.querySelector('#tab-contrato')?.addEventListener('click', () => {
    estado.abaAtiva = 'contrato';
    container.querySelector('#tab-comparativo').className = 'btn btn-ghost';
    container.querySelector('#tab-contrato').className = 'btn btn-primary';
    renderizarContrato(abaConteudo);
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   MÓDULO EXPORTADO
───────────────────────────────────────────────────────────────────────────── */

export const RelatorioModule = {

  async renderRelatorio(container) {
    const usuario = AuthService.obterUsuarioAtual();
    if (!usuario) return;

    // Loading
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-16);">
        <span class="material-symbols-outlined empty-state-icon" style="animation: spin 1s linear infinite;">sync</span>
        <p style="color: var(--text-muted); margin-top: var(--space-4);">Carregando relatórios...</p>
      </div>
    `;

    // Limpa listeners anteriores
    if (unsubscribeCobrancas)    { unsubscribeCobrancas();    unsubscribeCobrancas    = null; }
    if (unsubscribePromissorias) { unsubscribePromissorias(); unsubscribePromissorias = null; }
    if (unsubscribeOperacoes)    { unsubscribeOperacoes();    unsubscribeOperacoes    = null; }
    if (unsubscribeClientes)     { unsubscribeClientes();     unsubscribeClientes     = null; }

    let telaRendered = false;

    const reRender = () => {
      if (telaRendered) {
        // Apenas atualiza a aba ativa sem recriar cabeçalho
        const abaConteudo = container.querySelector('#aba-conteudo');
        if (abaConteudo) {
          if (estado.abaAtiva === 'comparativo') {
            const sel = abaConteudo.querySelector('#sel-periodo');
            const meses = sel ? parseInt(sel.value, 10) : 6;
            renderizarComparativo(abaConteudo, meses);
          } else {
            renderizarContrato(abaConteudo);
          }
        }
      }
    };

    const timeout = setTimeout(() => {
      if (!telaRendered) {
        telaRendered = true;
        renderizarTelaPrincipal(container);
      }
    }, 5000);

    unsubscribeClientes = FirestoreService.escutar('clientes', (dados) => {
      estado.clientes = dados;
      reRender();
    });

    unsubscribeOperacoes = FirestoreService.escutar('hmcred_operacoes', (dados) => {
      estado.operacoes = dados;
      reRender();
    });

    unsubscribePromissorias = FirestoreService.escutar('promissorias', (dados) => {
      estado.promissorias = dados;
      reRender();
    });

    unsubscribeCobrancas = FirestoreService.escutar(
      'cobrancas',
      (dados) => {
        clearTimeout(timeout);
        estado.cobrancas = dados;
        telaRendered = true;
        renderizarTelaPrincipal(container);
      },
      { ordenarPor: 'dataVencimento', direcao: 'asc' }
    );
  }
};
