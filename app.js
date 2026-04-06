let STATE = {
  bootstrap: null,
  monthKey: '',
  dashboard: null,
  categories: [],
  fixedExpenses: [],
  cards: [],
  activeScreen: 'home',
  editingId: ''
};

document.addEventListener('DOMContentLoaded', function () {
  init();
});

async function init() {
  try {
    const data = await window.DB.getAppBootstrap();
    await onBootstrap(data);
  } catch (err) {
    showToast(err && err.message ? err.message : 'Erro inesperado.', 'error');
  }
}

async function onBootstrap(data) {
  STATE.bootstrap = data || {};
  STATE.monthKey = STATE.bootstrap.monthKey || currentMonthKey();

  if (STATE.bootstrap.accessStatus !== 'LIBERADO') return renderPending();

  await loadAll();
  await loadDashboard('home');
}

async function loadAll() {
  await loadCategories();
  await loadFixedExpenses();
  await loadCards();
}

async function loadCategories() {
  try {
    const res = await window.DB.getCategories();
    STATE.categories = (res && res.ok) ? (res.items || []) : [];
  } catch (err) {
    STATE.categories = [];
    showToast(err && err.message ? err.message : 'Erro ao carregar categorias.', 'error');
  }
}

async function loadFixedExpenses() {
  try {
    const res = await window.DB.getFixedExpenses();
    STATE.fixedExpenses = (res && res.ok) ? (res.items || []) : [];
  } catch (err) {
    STATE.fixedExpenses = [];
    showToast(err && err.message ? err.message : 'Erro ao carregar despesas fixas.', 'error');
  }
}

async function loadCards() {
  try {
    const res = await window.DB.getCards();
    STATE.cards = (res && res.ok) ? (res.items || []) : [];
  } catch (err) {
    STATE.cards = [];
    showToast(err && err.message ? err.message : 'Erro ao carregar cartões.', 'error');
  }
}

async function loadDashboard(targetScreen) {
  try {
    const res = await window.DB.getDashboardData(STATE.monthKey);

    if (!res || !res.ok) {
      showToast((res && res.message) || 'Erro ao carregar dados.', 'error');
      return;
    }

    STATE.dashboard = res;
    STATE.monthKey = res.monthKey || STATE.monthKey;

    if (targetScreen === 'transactions') return renderTransactions();
    if (targetScreen === 'fixed') return renderFixedExpenses();
    if (targetScreen === 'cards') return renderCards();
    if (targetScreen === 'categories') return renderCategories();
    renderHome();
  } catch (err) {
    showToast(err && err.message ? err.message : 'Erro ao carregar dados.', 'error');
  }
}

function renderHome() {
  STATE.activeScreen = 'home';
  const d = STATE.dashboard || { resumo: {}, lancamentos: [], controle: [] };
  const r = d.resumo || {};
  const controle = d.controle || [];

  const controleHtml = controle.length
    ? controle.map(function (item) {
        const isVirtual = isVirtualFixed(item.id);
        return '<div class="item">' +
          '<div class="row">' +
            '<div>' +
              '<div><strong>' + escapeHtml(item.descricao || '') + '</strong></div>' +
              '<div class="sub">' + escapeHtml(item.categoria || '') + ' • R$ ' + money(item.valor || 0) + '</div>' +
              '<div class="sub">' + escapeHtml(item.data || '') + (isVirtual ? ' • fixa' : '') + '</div>' +
            '</div>' +
            '<button class="btn small" onclick="markAsPaid(\'' + escapeHtml(item.id || '') + '\')">Marcar pago</button>' +
          '</div>' +
        '</div>';
      }).join('')
    : '<p class="muted">Sem pendências neste mês.</p>';

  setApp(
    '<div class="shell">' +
      '<div class="top">' +
        '<div><div class="brand">Finanças</div><div class="sub">' + escapeHtml((STATE.bootstrap.user || {}).nome || 'Usuário local') + '</div></div>' +
        '<div style="width:132px"><label class="label">Mês</label><input id="monthFilter" type="month" class="input" value="' + escapeHtml(STATE.monthKey) + '" onchange="changeMonth(\'home\')"></div>' +
      '</div>' +

      '<div class="card hero" style="position:relative;">' +
        '<div class="mini-title">Saldo do mês</div>' +
        '<div class="saldo">R$ ' + money(r.saldo || 0) + '</div>' +
        '<div class="sub">' + monthLabel(STATE.monthKey) + '</div>' +
        '<div style="position:absolute; right:12px; bottom:10px; font-size:11px; opacity:.8; text-align:right; line-height:1.3;">' +
          'desenvolvido por: <a href="mailto:adynivio@gmail.com" style="color:inherit; text-decoration:underline;">adynivio@gmail.com</a>' +
        '</div>' +
      '</div>' +

      '<div class="grid">' +
        '<div class="card"><div class="mini-title">Receitas</div><div class="metric success">R$ ' + money(r.receitas || 0) + '</div></div>' +
        '<div class="card"><div class="mini-title">Despesas</div><div class="metric danger-text">R$ ' + money(r.despesas || 0) + '</div></div>' +
        '<div class="card"><div class="mini-title">Lançamentos</div><div class="metric">' + Number(r.qtdLancamentos || 0) + '</div></div>' +
        '<div class="card"><div class="mini-title">Controle</div><div class="metric">' + Number(controle.length || 0) + '</div></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="row"><strong>Ações rápidas</strong><span class="pill">' + monthLabel(STATE.monthKey) + '</span></div>' +
        '<div class="spacer8"></div>' +
        '<div class="actions">' +
          '<button class="btn" onclick="renderTransactionForm()">Manual</button>' +
          '<button class="btn secondary" onclick="renderCardForm()">Cartão</button>' +
          '<button class="btn secondary" onclick="renderFixedForm()">Despesas fixas</button>' +
          '<button class="btn secondary" onclick="loadDashboard(\'transactions\')">Ver mês</button>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="row"><strong>Controle</strong><span class="pill">Pendências</span></div>' +
        controleHtml +
      '</div>' +

      '<button class="fab" onclick="renderTransactionForm()">+</button>' +
      nav('home') +
    '</div>'
  );
}

function renderTransactions() {
  STATE.activeScreen = 'transactions';

  const selectedMonth = String(STATE.monthKey || '').trim();
  const dashboard = STATE.dashboard || {};
  const source = Array.isArray(dashboard.lancamentos) ? dashboard.lancamentos : [];

  const list = source.filter(function (item) {
    const comp = String(item && item.competencia ? item.competencia : '').trim();
    const dataMonth = String(item && item.data ? item.data : '').trim().slice(0, 7);
    const itemMonth = comp || dataMonth;
    return itemMonth === selectedMonth;
  });

  const htmlList = list.length
    ? list.map(itemCardFull).join('')
    : '<p class="muted">Nenhum lançamento encontrado.</p>';

  setApp(
    '<div class="shell">' +
      '<div class="top">' +
        '<div><div class="brand">Lançamentos</div><div class="sub">' + monthLabel(selectedMonth) + '</div></div>' +
        '<div style="width:132px"><label class="label">Mês</label><input id="monthFilter" type="month" class="input" value="' + escapeHtml(selectedMonth) + '" onchange="changeMonth(\'transactions\')"></div>' +
      '</div>' +
      '<div class="card">' + htmlList + '</div>' +
      nav('transactions') +
    '</div>'
  );
}

function renderCards() {
  STATE.activeScreen = 'cards';
  const list = STATE.cards || [];

  const htmlList = list.length ? list.map(function (item) {
    return '<div class="item">' +
      '<div class="row">' +
        '<div>' +
          '<div><strong>' + escapeHtml(item.descricao || '') + '</strong></div>' +
          '<div class="sub">' + Number(item.parcelas || 1) + 'x • Compra: ' + escapeHtml(item.dataCompra || '') + '</div>' +
          '<div class="sub">1ª competência: ' + escapeHtml(item.primeiraCompetencia || '') + '</div>' +
        '</div>' +
        '<div><strong>R$ ' + money(item.valorTotal || 0) + '</strong></div>' +
      '</div>' +
    '</div>';
  }).join('') : '<p class="muted">Nenhuma compra no cartão cadastrada.</p>';

  setApp(
    '<div class="shell">' +
      '<div class="top"><div><div class="brand">Cartões</div><div class="sub">Compras à vista e parceladas</div></div></div>' +
      '<div class="card">' + htmlList + '</div>' +
      '<div class="card"><button class="btn" onclick="renderCardForm()">Nova compra no cartão</button></div>' +
      nav('cards') +
    '</div>'
  );
}

function renderFixedExpenses() {
  STATE.activeScreen = 'fixed';
  const list = STATE.fixedExpenses || [];
  const htmlList = list.length ? list.map(function (item) {
    return '<div class="item">' +
      '<div class="row">' +
        '<div>' +
          '<div><strong>' + escapeHtml(item.descricao || '') + '</strong></div>' +
          '<div class="sub">' + escapeHtml(item.categoria || '') + ' • dia ' + Number(item.diaVencimento || 1) + '</div>' +
        '</div>' +
        '<div><strong>R$ ' + money(item.valor || 0) + '</strong></div>' +
      '</div>' +
    '</div>';
  }).join('') : '<p class="muted">Nenhuma despesa fixa cadastrada.</p>';

  setApp(
    '<div class="shell">' +
      '<div class="top"><div><div class="brand">Despesas fixas</div><div class="sub">Cadastro recorrente mensal</div></div></div>' +
      '<div class="card">' + htmlList + '</div>' +
      '<div class="card"><button class="btn" onclick="renderFixedForm()">Nova despesa fixa</button></div>' +
      nav('fixed') +
    '</div>'
  );
}

function renderCategories() {
  STATE.activeScreen = 'categories';
  const list = STATE.categories || [];
  const htmlOptions = list.map(function (c) {
    return '<option>' + escapeHtml(c.nomeCategoria || '') + ' • ' + escapeHtml(c.tipo || '') + '</option>';
  }).join('');

  setApp(
    '<div class="shell">' +
      '<div class="card">' +
        '<h3>Categorias</h3>' +
        '<details class="collapse" open>' +
          '<summary>Ver categorias cadastradas (' + list.length + ')</summary>' +
          '<div class="spacer8"></div>' +
          '<select class="select" size="' + Math.min(Math.max(list.length, 3), 8) + '">' + htmlOptions + '</select>' +
        '</details>' +
      '</div>' +
      '<div class="card">' +
        '<h3>Nova categoria</h3>' +
        '<label class="label">Nome</label><input id="cNome" class="input">' +
        '<label class="label">Tipo</label>' +
        '<select id="cTipo" class="select"><option value="DESPESA">Despesa</option><option value="RECEITA">Receita</option><option value="AMBOS">Ambos</option></select>' +
        '<button class="btn" onclick="saveCategory(event)">Criar categoria</button>' +
      '</div>' +
      nav('categories') +
    '</div>'
  );
}

async function renderTransactionForm(item) {
  await loadCategories();
  const it = item || {};
  const options = buildCategorySelectOptions(it.categoria || '');
  const isVirtual = isVirtualFixed(it.id);

  setApp(
    '<div class="shell"><div class="card">' +
      '<h3>' + (it.id ? 'Editar lançamento' : 'Novo lançamento manual') + '</h3>' +
      (isVirtual ? '<div class="sub" style="margin-bottom:8px;">Você está editando uma despesa fixa deste mês. Ao salvar, ela será registrada em Lançamentos.</div>' : '') +
      '<input id="editId" type="hidden" value="' + escapeHtml(it.id || '') + '">' +

      '<label class="label">Data</label>' +
      '<input id="fData" type="date" class="input" value="' + escapeHtml(it.data || todayKey()) + '">' +

      '<label class="label">Tipo</label>' +
      '<select id="fTipo" class="select">' +
        optionTag('DESPESA', 'Despesa', (it.tipo || 'DESPESA') === 'DESPESA') +
        optionTag('RECEITA', 'Receita', (it.tipo || '') === 'RECEITA') +
      '</select>' +

      '<details class="collapse"><summary>Categorias</summary>' +
        '<div class="spacer8"></div>' +
        '<label class="label">Categoria</label>' +
        '<select id="fCategoria" class="select">' + options + '</select>' +
      '</details>' +

      '<label class="label">Descrição</label>' +
      '<input id="fDescricao" class="input" value="' + escapeHtml(it.descricao || '') + '" placeholder="Ex.: Mercado">' +

      '<label class="label">Valor</label>' +
      '<input id="fValor" class="input money" inputmode="numeric" value="' + formatMoneyInput(it.valor || '') + '" oninput="maskMoney(this)" placeholder="0,00">' +

      '<label class="label">Status</label>' +
      '<select id="fStatus" class="select">' +
        optionTag('PENDENTE', 'Pendente', normUpper(it.status || 'PENDENTE') === 'PENDENTE') +
        optionTag('PAGO', 'Pago', normUpper(it.status || '') === 'PAGO') +
      '</select>' +

      '<label class="label">Observação</label>' +
      '<textarea id="fObs" class="textarea">' + escapeHtml(it.observacao || '') + '</textarea>' +

      '<button class="btn" onclick="' + (it.id ? 'saveTransactionEdit(event)' : 'saveTransaction(event)') + '">' + (it.id ? 'Salvar alterações' : 'Salvar') + '</button>' +
      '<div class="form-actions-secondary">' +
        '<button class="btn secondary" onclick="loadDashboard(\'transactions\')">Voltar</button>' +
        '<button class="btn secondary" onclick="loadDashboard(\'home\')">Cancelar</button>' +
      '</div>' +
    '</div></div>'
  );
}

function renderCardForm() {
  setApp(
    '<div class="shell"><div class="card">' +
      '<h3>Compra no cartão</h3>' +

      '<label class="label">Descrição</label>' +
      '<input id="ccDescricao" class="input" placeholder="Ex.: Geladeira">' +

      '<label class="label">Valor total</label>' +
      '<input id="ccValorTotal" class="input money" inputmode="numeric" oninput="maskMoney(this)" placeholder="0,00">' +

      '<label class="label">Tipo da compra</label>' +
      '<select id="ccTipoCompra" class="select" onchange="toggleParcelas()">' +
        '<option value="AVISTA">À vista</option>' +
        '<option value="PARCELADO">Parcelado</option>' +
      '</select>' +

      '<div id="boxParcelas" style="display:none;">' +
        '<label class="label">Parcelas</label>' +
        '<input id="ccParcelas" type="number" class="input" value="2" min="2" max="36">' +
      '</div>' +

      '<label class="label">Data da compra</label>' +
      '<input id="ccDataCompra" type="date" class="input" value="' + todayKey() + '">' +

      '<label class="label">Primeira competência</label>' +
      '<input id="ccPrimeiraCompetencia" type="month" class="input" value="' + escapeHtml(STATE.monthKey) + '">' +

      '<label class="label">Observação</label>' +
      '<textarea id="ccObs" class="textarea"></textarea>' +

      '<button class="btn" onclick="saveCardPurchase(event)">Salvar compra</button>' +
      '<div class="form-actions-secondary">' +
        '<button class="btn secondary" onclick="renderCards()">Voltar</button>' +
        '<button class="btn secondary" onclick="loadDashboard(\'home\')">Cancelar</button>' +
      '</div>' +
    '</div></div>'
  );
}

async function renderFixedForm() {
  await loadCategories();
  setApp(
    '<div class="shell"><div class="card">' +
      '<h3>Despesas fixas</h3>' +

      '<details class="collapse">' +
        '<summary>Categorias</summary>' +
        '<div class="spacer8"></div>' +
        '<label class="label">Categoria</label>' +
        '<select id="fxCategoria" class="select">' + buildCategorySelectOptions('') + '</select>' +
      '</details>' +

      '<label class="label">Descrição</label>' +
      '<input id="fxDescricao" class="input" placeholder="Ex.: Internet">' +

      '<label class="label">Valor</label>' +
      '<input id="fxValor" class="input money" inputmode="numeric" oninput="maskMoney(this)" placeholder="0,00">' +

      '<label class="label">Dia de vencimento</label>' +
      '<input id="fxDia" type="number" min="1" max="28" class="input" value="10">' +

      '<label class="label">Observação</label>' +
      '<textarea id="fxObs" class="textarea"></textarea>' +

      '<button class="btn" onclick="saveFixedExpense(event)">Salvar despesa fixa</button>' +
      '<div class="form-actions-secondary">' +
        '<button class="btn secondary" onclick="renderFixedExpenses()">Voltar</button>' +
        '<button class="btn secondary" onclick="loadDashboard(\'home\')">Cancelar</button>' +
      '</div>' +
    '</div></div>'
  );
}

async function saveTransaction(event) {
  const btn = event.currentTarget;
  setButtonLoading(btn, true);

  try {
    const res = await window.DB.saveTransaction({
      data: valueOf('fData'),
      tipo: valueOf('fTipo'),
      descricao: valueOf('fDescricao'),
      categoria: valueOf('fCategoria'),
      valor: valueOf('fValor'),
      status: valueOf('fTipo') === 'RECEITA' ? 'PAGO' : 'PENDENTE',
      observacao: valueOf('fObs')
    });

    setButtonLoading(btn, false);
    showToast((res && res.message) || 'Processado.', res && res.ok ? 'success' : 'error');
    if (!res || !res.ok) return;

    await loadDashboard('transactions');
  } catch (err) {
    setButtonLoading(btn, false);
    showToast(err && err.message ? err.message : 'Erro ao salvar lançamento.', 'error');
  }
}

async function saveTransactionEdit(event) {
  const btn = event.currentTarget;
  setButtonLoading(btn, true);

  try {
    const res = await window.DB.updateTransaction({
      id: valueOf('editId'),
      data: valueOf('fData'),
      tipo: valueOf('fTipo'),
      descricao: valueOf('fDescricao'),
      categoria: valueOf('fCategoria'),
      valor: valueOf('fValor'),
      status: valueOf('fStatus'),
      observacao: valueOf('fObs')
    });

    setButtonLoading(btn, false);
    showToast((res && res.message) || 'Processado.', res && res.ok ? 'success' : 'error');
    if (!res || !res.ok) return;

    await loadDashboard('transactions');
  } catch (err) {
    setButtonLoading(btn, false);
    showToast(err && err.message ? err.message : 'Erro ao atualizar lançamento.', 'error');
  }
}

async function saveCardPurchase(event) {
  const btn = event.currentTarget;
  const originalText = btn ? btn.innerHTML : 'Salvar compra';

  if (btn) {
    btn.innerHTML = 'Salvando...';
    setButtonLoading(btn, true);
  }

  const payload = {
    descricao: valueOf('ccDescricao'),
    valorTotal: valueOf('ccValorTotal'),
    tipoCompra: valueOf('ccTipoCompra'),
    parcelas: valueOf('ccTipoCompra') === 'PARCELADO' ? valueOf('ccParcelas') : 1,
    dataCompra: valueOf('ccDataCompra'),
    primeiraCompetencia: valueOf('ccPrimeiraCompetencia'),
    observacao: valueOf('ccObs')
  };

  try {
    const res = await window.DB.saveCardPurchase(payload);

    if (!res || !res.ok) {
      if (btn) {
        setButtonLoading(btn, false);
        btn.innerHTML = originalText;
      }
      showToast((res && res.message) || 'Erro ao salvar compra.', 'error');
      return;
    }

    showToast((res && res.message) || 'Compra salva com sucesso.', 'success');
    await loadCards();

    if (btn) {
      setButtonLoading(btn, false);
      btn.innerHTML = originalText;
    }

    renderCards();
  } catch (err) {
    if (btn) {
      setButtonLoading(btn, false);
      btn.innerHTML = originalText;
    }
    showToast(err && err.message ? err.message : 'Erro ao salvar compra.', 'error');
  }
}

async function saveFixedExpense(event) {
  const btn = event.currentTarget;
  setButtonLoading(btn, true);

  try {
    const res = await window.DB.saveFixedExpense({
      descricao: valueOf('fxDescricao'),
      categoria: valueOf('fxCategoria'),
      valor: valueOf('fxValor'),
      diaVencimento: valueOf('fxDia'),
      observacao: valueOf('fxObs')
    });

    setButtonLoading(btn, false);
    showToast((res && res.message) || 'Processado.', res && res.ok ? 'success' : 'error');
    if (!res || !res.ok) return;

    await loadAll();
    await loadDashboard('fixed');
  } catch (err) {
    setButtonLoading(btn, false);
    showToast(err && err.message ? err.message : 'Erro ao salvar despesa fixa.', 'error');
  }
}

async function saveCategory(event) {
  const btn = event.currentTarget;
  setButtonLoading(btn, true);

  try {
    const res = await window.DB.saveCategory({
      nomeCategoria: valueOf('cNome'),
      tipo: valueOf('cTipo')
    });

    setButtonLoading(btn, false);

    if (!res || !res.ok) {
      return showToast((res && res.message) || 'Erro ao criar categoria.', 'error');
    }

    showToast('Categoria criada com sucesso.', 'success');
    await loadCategories();
    renderCategories();
  } catch (err) {
    setButtonLoading(btn, false);
    showToast(err && err.message ? err.message : 'Erro ao criar categoria.', 'error');
  }
}

async function markAsPaid(id) {
  try {
    const res = await window.DB.updateTransactionStatus(id, 'PAGO');
    showToast((res && res.message) || 'Processado.', res && res.ok ? 'success' : 'error');
    if (!res || !res.ok) return;
    await loadDashboard('home');
  } catch (err) {
    showToast(err && err.message ? err.message : 'Erro ao atualizar status.', 'error');
  }
}

function editTransaction(id) {
  const list = ((STATE.dashboard || {}).lancamentos || []);
  const item = list.find(function (x) {
    return String(x.id || '') === String(id || '');
  });

  if (!item) return showToast('Lançamento não encontrado.', 'error');
  renderTransactionForm(item);
}

async function confirmDelete(id) {
  if (isVirtualFixed(id)) {
    return showToast('Essa despesa fixa é virtual neste mês. Para removê-la, altere ou desative em Fixas.', 'error');
  }

  if (!confirm('Excluir este lançamento?')) return;

  try {
    const res = await window.DB.deleteTransaction(id);
    showToast((res && res.message) || 'Ação concluída.', res && res.ok ? 'success' : 'error');
    if (!res || !res.ok) return;
    await loadDashboard('transactions');
  } catch (err) {
    showToast(err && err.message ? err.message : 'Erro ao excluir lançamento.', 'error');
  }
}

function changeMonth(target) {
  const el = document.getElementById('monthFilter');
  STATE.monthKey = el && el.value ? String(el.value).trim() : currentMonthKey();
  loadDashboard(target || STATE.activeScreen || 'home');
}

function itemCardFull(item) {
  const isDesp = String(item.tipo || '').toUpperCase() === 'DESPESA';
  const isVirtual = isVirtualFixed(item.id);

  return '<div class="item">' +
    '<div class="row">' +
      '<div>' +
        '<div><strong>' + escapeHtml(item.descricao || '') + '</strong></div>' +
        '<div class="sub">' + escapeHtml(item.categoria || '') + (item.parcelaInfo ? ' • ' + escapeHtml(item.parcelaInfo) : '') + '</div>' +
        '<div class="sub">' + escapeHtml(item.data || '') + ' • ' + escapeHtml(item.status || '') + (item.origemTipo ? ' • ' + escapeHtml(item.origemTipo) : '') + (isVirtual ? ' • virtual' : '') + '</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div class="' + (isDesp ? 'danger-text' : 'success') + '"><strong>R$ ' + money(item.valor) + '</strong></div>' +
        '<div class="spacer8"></div>' +
        '<div class="actions-inline">' +
          '<button class="btn secondary small" onclick="editTransaction(\'' + escapeHtml(item.id || '') + '\')">Editar</button>' +
          '<button class="btn danger small" onclick="confirmDelete(\'' + escapeHtml(item.id || '') + '\')">' + (isVirtual ? 'Não excluir' : 'Excluir') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function buildCategorySelectOptions(selected) {
  if (!STATE.categories || !STATE.categories.length) {
    return '<option value="">Cadastre uma categoria primeiro</option>';
  }

  return STATE.categories.map(function (c) {
    const name = String(c.nomeCategoria || '');
    return '<option value="' + escapeHtml(name) + '"' + (name === selected ? ' selected' : '') + '>' + escapeHtml(name) + '</option>';
  }).join('');
}

function toggleParcelas() {
  const box = document.getElementById('boxParcelas');
  if (box) {
    box.style.display = valueOf('ccTipoCompra') === 'PARCELADO' ? 'block' : 'none';
  }
}

function maskMoney(el) {
  const digits = String(el.value || '').replace(/\D/g, '');
  const n = Number(digits || 0) / 100;

  if (!digits) {
    el.value = '';
    return;
  }

  el.value = n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatMoneyInput(v) {
  if (v === '' || v === null || typeof v === 'undefined') return '';
  const n = Number(String(v).replace(',', '.'));
  if (isNaN(n)) return '';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function optionTag(value, label, selected) {
  return '<option value="' + escapeHtml(value) + '"' + (selected ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
}

function nav(active) {
  STATE.activeScreen = active;
  return '<nav class="nav nav-5">' +
    '<button class="' + (active === 'home' ? 'active' : '') + '" onclick="loadDashboard(\'home\')"><span class="ico">🏠</span><span>Início</span></button>' +
    '<button class="' + (active === 'transactions' ? 'active' : '') + '" onclick="loadDashboard(\'transactions\')"><span class="ico">💸</span><span>Lançamentos</span></button>' +
    '<button class="' + (active === 'cards' ? 'active' : '') + '" onclick="renderCards()"><span class="ico">💳</span><span>Cartões</span></button>' +
    '<button class="' + (active === 'fixed' ? 'active' : '') + '" onclick="renderFixedExpenses()"><span class="ico">📌</span><span>Fixas</span></button>' +
    '<button class="' + (active === 'categories' ? 'active' : '') + '" onclick="renderCategories()"><span class="ico">🗂️</span><span>Categorias</span></button>' +
  '</nav>';
}

function renderNoEmail() {
  setApp('<div class="shell"><div class="card center"><h2>Não foi possível identificar seu Gmail</h2></div></div>');
}

function renderPending() {
  setApp('<div class="shell"><div class="card center"><h2>Acesso não liberado</h2></div></div>');
}

function setButtonLoading(el, loading) {
  if (!el) return;

  if (loading) {
    el.classList.add('loading');
    el.setAttribute('disabled', 'disabled');
  } else {
    el.classList.remove('loading');
    el.removeAttribute('disabled');
  }
}

function setApp(html) {
  document.getElementById('app').innerHTML = '<div class="screen-enter">' + html + '</div>';
}

function valueOf(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function money(v) {
  return Number(v || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function currentMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function normUpper(v) {
  return String(v || '').trim().toUpperCase();
}

function monthLabel(key) {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const parts = String(key || '').split('-');
  return (meses[(Number(parts[1] || 1) - 1)] || '') + ' de ' + (parts[0] || '');
}

function isVirtualFixed(id) {
  return String(id || '').indexOf('VFIXA|') === 0;
}

function showToast(message, type) {
  const root = document.getElementById('toast-root');
  if (!root) return;

  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'success');
  el.textContent = message || 'Ok';
  root.appendChild(el);

  setTimeout(function () {
    el.classList.add('show');
  }, 20);

  setTimeout(function () {
    el.classList.remove('show');
    setTimeout(function () {
      el.remove();
    }, 220);
  }, 2200);
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}