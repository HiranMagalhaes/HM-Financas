import { FirestoreService } from '../../firebase/firestore-service.js';
import { mostrarToast } from '../../utils/helpers.js';

export function injetarModalEdicaoHmCred(estado) {
  if (document.getElementById('modal-editar-hmcred')) return;

  const html = `
    <div class="modal-overlay" id="modal-editar-hmcred" role="dialog" aria-modal="true">
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h3 class="modal-title">Editar Operação HM Cred</h3>
          <button type="button" class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-editar-hmcred').classList.remove('open')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form id="form-editar-hmcred" novalidate>
          <input type="hidden" id="edit-hmcred-id">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Destino / Cliente</label>
              <input type="text" id="edit-hmcred-destino" class="form-input" required>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-editar-hmcred').classList.remove('open')">Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);

  document.getElementById('form-editar-hmcred').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-hmcred-id').value;
    const destino = document.getElementById('edit-hmcred-destino').value;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const res = await FirestoreService.atualizar('hmcred_operacoes', id, {
      destino,
      clienteNome: destino // Sincroniza se usar ambos
    });

    btn.disabled = false;

    if (res.sucesso) {
      document.getElementById('modal-editar-hmcred').classList.remove('open');
      mostrarToast({ tipo: 'success', titulo: 'Atualizado', mensagem: 'Operação salva.' });
    } else {
      mostrarToast({ tipo: 'danger', titulo: 'Erro', mensagem: 'Falha ao salvar edições.' });
    }
  });
}

export function abrirModalEdicaoHmCred(id, estado) {
  const op = estado.operacoes.find(o => o.id === id);
  if (!op) return;
  document.getElementById('edit-hmcred-id').value = op.id;
  document.getElementById('edit-hmcred-destino').value = op.destino || op.clienteNome || '';
  document.getElementById('modal-editar-hmcred').classList.add('open');
}
