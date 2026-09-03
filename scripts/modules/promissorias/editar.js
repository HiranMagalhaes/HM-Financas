import { FirestoreService } from '../../firebase/firestore-service.js';
import { mostrarToast } from '../../utils/helpers.js';

export function injetarModalEdicaoPromissoria(estado) {
  if (document.getElementById('modal-editar-promissoria')) return;

  const html = `
    <div class="modal-overlay" id="modal-editar-promissoria" role="dialog" aria-modal="true">
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h3 class="modal-title">Editar Promissória</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-editar-promissoria').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-editar-promissoria" novalidate>
          <input type="hidden" id="edit-prom-id">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Descrição</label>
              <input type="text" id="edit-prom-desc" class="form-input" required>
            </div>
            <div class="form-group">
              <label class="form-label">Data de Vencimento Base</label>
              <input type="date" id="edit-prom-venc" class="form-input" required>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-editar-promissoria').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);

  document.getElementById('form-editar-promissoria').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-prom-id').value;
    const descricao = document.getElementById('edit-prom-desc').value;
    const dataVencimento = document.getElementById('edit-prom-venc').value;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const res = await FirestoreService.atualizar('promissorias', id, {
      descricao,
      dataVencimento
    });

    btn.disabled = false;

    if (res.sucesso) {
      document.getElementById('modal-editar-promissoria').classList.remove('open');
      mostrarToast({ tipo: 'success', titulo: 'Atualizado', mensagem: 'Dados da promissória salvos.' });
    } else {
      mostrarToast({ tipo: 'danger', titulo: 'Erro', mensagem: 'Falha ao salvar edições.' });
    }
  });
}

export function abrirModalEdicaoPromissoria(id, estado) {
  const prom = estado.promissorias.find(p => p.id === id);
  if (!prom) return;
  document.getElementById('edit-prom-id').value = prom.id;
  document.getElementById('edit-prom-desc').value = prom.descricao || '';
  document.getElementById('edit-prom-venc').value = prom.dataVencimento || '';
  document.getElementById('modal-editar-promissoria').classList.add('open');
}
