import { formatarMoeda, formatarData } from '../../utils/formatters.js';
import { escapeHTML, calcularStatusVencimento } from '../../utils/helpers.js';
import { obterInfoPendencia } from '../promissorias/index.js';

export function renderizarRelatorioDetalhado(container, estado) {
  container.innerHTML = `
    <div class="card" style="margin-bottom: var(--space-6);">
      <div class="card-body">
        <h3 style="margin-top: 0; margin-bottom: var(--space-4);">Filtro de Período</h3>
        <div style="display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: flex-end;">
          <div class="form-group" style="flex: 1; min-width: 140px;">
            <label class="form-label">Data Início</label>
            <input type="date" id="rel-dt-inicio" class="form-input">
          </div>
          <div class="form-group" style="flex: 1; min-width: 140px;">
            <label class="form-label">Data Fim</label>
            <input type="date" id="rel-dt-fim" class="form-input">
          </div>
          <button class="btn btn-secondary" id="rel-btn-mes-atual" style="height: 42px;">Mês Atual</button>
          <button class="btn btn-primary" id="rel-btn-filtrar" style="height: 42px;">Filtrar</button>
        </div>
      </div>
    </div>
    
    <div id="rel-resultados">
      <div class="empty-state" style="padding: var(--space-8);">
        <span class="material-symbols-outlined empty-state-icon">filter_alt</span>
        <p class="empty-state-text">Selecione um período e clique em Filtrar.</p>
      </div>
    </div>
  `;

  document.getElementById('rel-btn-mes-atual').addEventListener('click', () => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    
    // Primeiro dia do mês
    document.getElementById('rel-dt-inicio').value = `${ano}-${mes}-01`;
    
    // Último dia do mês
    const ultimoDia = new Date(ano, hoje.getMonth() + 1, 0).getDate();
    document.getElementById('rel-dt-fim').value = `${ano}-${mes}-${ultimoDia}`;
    
    document.getElementById('rel-btn-filtrar').click();
  });

  document.getElementById('rel-btn-filtrar').addEventListener('click', () => {
    const inicio = document.getElementById('rel-dt-inicio').value;
    const fim = document.getElementById('rel-dt-fim').value;
    
    if (!inicio && !fim) {
      alert('Informe ao menos uma data para filtrar.');
      return;
    }
    
    const dtInicio = inicio ? new Date(inicio + 'T00:00:00') : new Date('2000-01-01T00:00:00');
    const dtFim = fim ? new Date(fim + 'T23:59:59') : new Date('2100-01-01T23:59:59');

    let totalReceber = 0;
    let devedores = [];

    // Promissórias
    estado.promissorias.forEach(prom => {
      if (prom.status === 'pago' || prom.status === 'recebida') return;
      const info = obterInfoPendencia(prom);
      if (info.dataVencimentoReal) {
        const dv = new Date(info.dataVencimentoReal + 'T12:00:00');
        if (dv >= dtInicio && dv <= dtFim) {
          totalReceber += info.valorPendente;
          devedores.push({
            clienteNome: prom.clienteNome,
            origem: 'Promissória',
            descricao: prom.descricao || 'Pagamento Único',
            valor: info.valorPendente,
            vencimento: info.dataVencimentoReal,
            status: info.statusReal
          });
        }
      }
    });

    // HmCred
    (estado.operacoes || []).forEach(op => {
      if (op.status === 'pago' || !op.listaParcelas) return;
      op.listaParcelas.forEach((parc, idx) => {
        if (parc.pago || !parc.vencimento) return;
        const dv = new Date(parc.vencimento + 'T12:00:00');
        if (dv >= dtInicio && dv <= dtFim) {
          totalReceber += parc.valor;
          const status = calcularStatusVencimento(parc.vencimento, 'pendente');
          devedores.push({
            clienteNome: op.clienteNome || op.destino,
            origem: 'HmCred',
            descricao: `Parcela ${idx+1}/${op.listaParcelas.length}`,
            valor: parc.valor,
            vencimento: parc.vencimento,
            status: status
          });
        }
      });
    });

    // Cobranças Avulsas
    estado.cobrancas.forEach(cob => {
      if (cob.status === 'paga' || !cob.dataVencimento) return;
      const dv = new Date(cob.dataVencimento + 'T12:00:00');
      if (dv >= dtInicio && dv <= dtFim) {
        totalReceber += cob.valor;
        const status = calcularStatusVencimento(cob.dataVencimento, 'pendente');
        devedores.push({
          clienteNome: cob.clienteNome || 'Desconhecido',
          origem: 'Avulso',
          descricao: cob.descricao,
          valor: cob.valor,
          vencimento: cob.dataVencimento,
          status: status
        });
      }
    });

    devedores.sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));

    let htmlTabela = '';
    if (devedores.length > 0) {
      htmlTabela = `
        <div class="card relatorio-impressao">
          <div class="card-body">
            <h3 style="margin-top: 0;">Lista de Valores a Receber (Devedores)</h3>
            <p class="text-muted">Período: ${inicio ? formatarData(inicio) : 'Sempre'} até ${fim ? formatarData(fim) : 'Sempre'}</p>
            <div style="margin-bottom: var(--space-4);">
              <span style="font-size: var(--text-lg); font-weight: bold; color: var(--color-success);">
                Total a Receber: ${formatarMoeda(totalReceber)}
              </span>
            </div>
            
            <div class="table-responsive">
              <table class="table">
                <thead>
                  <tr>
                    <th>Vencimento</th>
                    <th>Cliente</th>
                    <th>Origem</th>
                    <th>Descrição</th>
                    <th style="text-align: right;">Valor (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  ${devedores.map(d => `
                    <tr>
                      <td>
                        ${formatarData(d.vencimento)}<br>
                        <span class="badge" style="font-size:10px; background:${d.status === 'atrasada' ? 'var(--color-danger-muted)' : 'var(--bg-overlay)'}; color:${d.status === 'atrasada' ? 'var(--color-danger)' : 'var(--text-muted)'}">${d.status}</span>
                      </td>
                      <td style="font-weight: bold;">${escapeHTML(d.clienteNome)}</td>
                      <td><span class="badge badge-neutral">${d.origem}</span></td>
                      <td style="color: var(--text-muted); font-size: var(--text-sm);">${escapeHTML(d.descricao)}</td>
                      <td style="text-align: right; font-weight: bold;" class="value-sensitive">${formatarMoeda(d.valor)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            
            <div style="margin-top: var(--space-4); text-align: right;">
              <button class="btn btn-secondary" onclick="window.print()">
                <span class="material-symbols-outlined icon-sm">print</span> Imprimir Relatório
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      htmlTabela = `
        <div class="empty-state" style="padding: var(--space-8);">
          <span class="material-symbols-outlined empty-state-icon" style="color: var(--color-success);">check_circle</span>
          <p class="empty-state-text">Nenhum devedor encontrado neste período.</p>
        </div>
      `;
    }

    document.getElementById('rel-resultados').innerHTML = htmlTabela;
  });
  
  // Dispara Mês Atual por padrão
  document.getElementById('rel-btn-mes-atual').click();
}
