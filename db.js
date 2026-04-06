const DB_NAME = 'financasDB';
const DB_VERSION = 1;

const STORES = {
  CONFIG: 'config',
  CATEGORIES: 'categories',
  FIXED: 'fixedExpenses',
  CARDS: 'cards',
  TRANSACTIONS: 'transactions'
};

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.CONFIG)) {
        db.createObjectStore(STORES.CONFIG, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
        const store = db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
        store.createIndex('by_user', 'userId', { unique: false });
        store.createIndex('by_name', 'nomeCategoria', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.FIXED)) {
        const store = db.createObjectStore(STORES.FIXED, { keyPath: 'id' });
        store.createIndex('by_user', 'userId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.CARDS)) {
        const store = db.createObjectStore(STORES.CARDS, { keyPath: 'id' });
        store.createIndex('by_user', 'userId', { unique: false });
        store.createIndex('by_date', 'dataCompra', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
        const store = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id' });
        store.createIndex('by_user', 'userId', { unique: false });
        store.createIndex('by_month', 'competencia', { unique: false });
        store.createIndex('by_status', 'status', { unique: false });
        store.createIndex('by_origin', ['origemTipo', 'origemId'], { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function tx(db, storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll(storeName) {
  const db = await openDB();
  const store = tx(db, storeName, 'readonly');
  return promisifyRequest(store.getAll());
}

async function getByKey(storeName, key) {
  const db = await openDB();
  const store = tx(db, storeName, 'readonly');
  return promisifyRequest(store.get(key));
}

async function put(storeName, value) {
  const db = await openDB();
  const store = tx(db, storeName, 'readwrite');
  return promisifyRequest(store.put(value));
}

async function add(storeName, value) {
  const db = await openDB();
  const store = tx(db, storeName, 'readwrite');
  return promisifyRequest(store.add(value));
}

async function remove(storeName, key) {
  const db = await openDB();
  const store = tx(db, storeName, 'readwrite');
  return promisifyRequest(store.delete(key));
}
function currentMonthKeyLocal() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureSeedData() {
  const bootstrap = await getByKey(STORES.CONFIG, 'bootstrap');

  if (!bootstrap) {
    await put(STORES.CONFIG, {
      key: 'bootstrap',
      appName: 'Finanças',
      adminEmail: '',
      email: '',
      accessStatus: 'LIBERADO',
      user: {
        email: '',
        userId: 'local-user',
        nome: 'Usuário local'
      }
    });
  }

  const categories = await getAll(STORES.CATEGORIES);
  if (!categories.length) {
    await add(STORES.CATEGORIES, { id: uid('CAT'), userId: 'local-user', nomeCategoria: 'Alimentação', tipo: 'DESPESA', ativa: 'SIM' });
    await add(STORES.CATEGORIES, { id: uid('CAT'), userId: 'local-user', nomeCategoria: 'Transporte', tipo: 'DESPESA', ativa: 'SIM' });
    await add(STORES.CATEGORIES, { id: uid('CAT'), userId: 'local-user', nomeCategoria: 'Moradia', tipo: 'DESPESA', ativa: 'SIM' });
    await add(STORES.CATEGORIES, { id: uid('CAT'), userId: 'local-user', nomeCategoria: 'Salário', tipo: 'RECEITA', ativa: 'SIM' });
  }
}
async function getAppBootstrapLocal() {
  await ensureSeedData();
  const bootstrap = await getByKey(STORES.CONFIG, 'bootstrap');

  return {
    ok: true,
    appName: bootstrap.appName || 'Finanças',
    adminEmail: bootstrap.adminEmail || '',
    email: bootstrap.email || '',
    accessStatus: bootstrap.accessStatus || 'LIBERADO',
    user: bootstrap.user || { userId: 'local-user', nome: 'Usuário local', email: '' },
    monthKey: currentMonthKeyLocal()
  };
}

async function getCategoriesLocal() {
  await ensureSeedData();
  const items = await getAll(STORES.CATEGORIES);
  const filtered = items
    .filter(item => item.ativa !== 'NAO' && item.userId === 'local-user')
    .sort((a, b) => String(a.nomeCategoria || '').localeCompare(String(b.nomeCategoria || '')));

  return { ok: true, items: filtered };
}

async function getFixedExpensesLocal() {
  const items = await getAll(STORES.FIXED);
  const filtered = items
    .filter(item => item.ativa !== 'NAO' && item.userId === 'local-user')
    .sort((a, b) => String(a.descricao || '').localeCompare(String(b.descricao || '')));

  return { ok: true, items: filtered };
}

async function getCardsLocal() {
  const items = await getAll(STORES.CARDS);
  const filtered = items
    .filter(item => item.userId === 'local-user')
    .sort((a, b) => String(b.dataCompra || '').localeCompare(String(a.dataCompra || '')));

  return { ok: true, items: filtered };

}
function normUpper(v) {
  return String(v || '').trim().toUpperCase();
}

function toMoneyNumber(value) {
  let s = String(value || '').trim();
  if (!s) return 0;
  s = s.replace(/[^\d,.-]/g, '');
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.indexOf(',') > -1) {
    s = s.replace(',', '.');
  }
  return Number(s || 0);
}

function formatDateKey(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    const d = value;
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  const s = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const p = s.split('/');
    return p[2] + '-' + p[1] + '-' + p[0];
  }

  return s;
}

function normalizeMonthKey(value) {
  const v = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(v) ? v : '';
}

function addMonthsToKey(monthKey, offset) {
  const parts = String(monthKey || '').split('-');
  const year = Number(parts[0] || 0);
  const month = Number(parts[1] || 1);

  if (!year || !month) return '';

  const base = new Date(year, month - 1, 1);
  base.setMonth(base.getMonth() + Number(offset || 0));

  return base.getFullYear() + '-' + String(base.getMonth() + 1).padStart(2, '0');
}

function sortDateKeyDesc(a, b) {
  return String(b || '').localeCompare(String(a || ''));
}

function sumBy(arr, fn) {
  return arr.reduce((sum, item) => sum + Number(fn(item) || 0), 0);
}

function parseVirtualFixedId(virtualId) {
  const parts = String(virtualId || '').split('|');
  if (parts.length !== 3) return { ok: false };
  if (parts[0] !== 'VFIXA') return { ok: false };

  return {
    ok: true,
    fixaId: String(parts[1] || '').trim(),
    monthKey: String(parts[2] || '').trim()
  };
}

function isVirtualFixedId(id) {
  return String(id || '').indexOf('VFIXA|') === 0;
}
async function getBootstrapUser() {
  const boot = await getAppBootstrapLocal();
  return (boot && boot.user) ? boot.user : { userId: 'local-user', nome: 'Usuário local', email: '' };
}

async function getTransactionsLocal() {
  const user = await getBootstrapUser();
  const items = await getAll(STORES.TRANSACTIONS);
  return items.filter(item => String(item.userId || '') === String(user.userId || ''));
}

async function findTransactionByIdLocal(id) {
  const items = await getTransactionsLocal();
  return items.find(item => String(item.id || '') === String(id || '')) || null;
}

async function findFixedExpenseByIdLocal(fixaId) {
  const user = await getBootstrapUser();
  const items = await getAll(STORES.FIXED);

  return items.find(item =>
    String(item.id || '') === String(fixaId || '') &&
    String(item.userId || '') === String(user.userId || '') &&
    normUpper(item.ativa || 'SIM') !== 'NAO'
  ) || null;
}

async function findRealFixedLaunchLocal(monthKey, fixaId) {
  const items = await getTransactionsLocal();

  return items.find(item =>
    String(item.competencia || '').trim() === String(monthKey || '').trim() &&
    normUpper(item.origemTipo || '') === 'FIXA' &&
    String(item.origemId || '').trim() === String(fixaId || '').trim()
  ) || null;
}
async function buildVirtualFixedEntriesForMonthLocal(monthKey, existingMonthLancs) {
  const user = await getBootstrapUser();
  const fixed = await getFixedExpensesLocal();
  const items = fixed.items || [];

  const existingFixedKeys = {};
  (existingMonthLancs || []).forEach(item => {
    const origemTipo = normUpper(item.origemTipo || '');
    const origemId = String(item.origemId || '').trim();

    if (origemTipo === 'FIXA' && origemId) {
      existingFixedKeys['FIXA|' + origemId] = true;
    }
  });

  return items
    .filter(fx =>
      String(fx.userId || '') === String(user.userId || '') &&
      normUpper(fx.ativa || 'SIM') !== 'NAO' &&
      !existingFixedKeys['FIXA|' + fx.id]
    )
    .map(fx => {
      const dia = Math.min(Math.max(Number(fx.diaVencimento || 1), 1), 28);

      return {
        id: 'VFIXA|' + fx.id + '|' + monthKey,
        userId: fx.userId,
        data: monthKey + '-' + String(dia).padStart(2, '0'),
        competencia: monthKey,
        tipo: 'DESPESA',
        descricao: fx.descricao,
        categoria: fx.categoria,
        valor: Number(fx.valor || 0),
        status: 'PENDENTE',
        origemTipo: 'FIXA',
        origemId: fx.id,
        parcelaInfo: '',
        observacao: fx.observacao || '',
        virtual: true
      };
    });
}
async function getDashboardDataLocal(monthKey) {
  const mk = normalizeMonthKey(monthKey) || currentMonthKeyLocal();
  const all = await getTransactionsLocal();

  const realMonthLancs = all.filter(item => {
    const comp = String(item.competencia || '').trim() || String(item.data || '').slice(0, 7);
    return comp === mk;
  });

  const virtualFixedLancs = await buildVirtualFixedEntriesForMonthLocal(mk, realMonthLancs);
  const monthLancs = realMonthLancs.concat(virtualFixedLancs);

  const receitas = sumBy(monthLancs, item =>
    normUpper(item.tipo || '') === 'RECEITA' ? Number(item.valor || 0) : 0
  );

  const despesas = sumBy(monthLancs, item =>
    normUpper(item.tipo || '') === 'DESPESA' ? Number(item.valor || 0) : 0
  );

  monthLancs.sort((a, b) => sortDateKeyDesc(a.data, b.data));

  const controle = monthLancs
    .filter(item =>
      normUpper(item.status || '') === 'PENDENTE' &&
      normUpper(item.tipo || '') === 'DESPESA'
    )
    .slice(0, 20);

  return {
    ok: true,
    monthKey: mk,
    resumo: {
      receitas,
      despesas,
      saldo: receitas - despesas,
      qtdLancamentos: monthLancs.length
    },
    lancamentos: monthLancs,
    controle
  };
}
async function saveCategoryLocal(payload) {
  const user = await getBootstrapUser();
  const nomeCategoria = String(payload.nomeCategoria || '').trim();
  const tipo = normUpper(payload.tipo || 'DESPESA');

  if (!nomeCategoria) {
    return { ok: false, message: 'Informe o nome da categoria.' };
  }

  await add(STORES.CATEGORIES, {
    id: uid('CAT'),
    userId: user.userId,
    nomeCategoria,
    tipo,
    ativa: 'SIM',
    criadoEm: nowIso(),
    atualizadoEm: nowIso()
  });

  return { ok: true, message: 'Categoria criada com sucesso.' };
}

async function saveFixedExpenseLocal(payload) {
  const user = await getBootstrapUser();
  const descricao = String(payload.descricao || '').trim();
  const categoria = String(payload.categoria || '').trim();
  const valor = toMoneyNumber(payload.valor);
  const diaVencimento = Math.min(Math.max(Number(payload.diaVencimento || 1), 1), 28);
  const observacao = String(payload.observacao || '').trim();

  if (!descricao || !categoria || !valor || !diaVencimento) {
    return { ok: false, message: 'Preencha os campos obrigatórios da despesa fixa.' };
  }

  await add(STORES.FIXED, {
    id: uid('FIX'),
    userId: user.userId,
    descricao,
    categoria,
    valor,
    diaVencimento,
    ativa: 'SIM',
    observacao,
    criadoEm: nowIso(),
    atualizadoEm: nowIso()
  });

  return { ok: true, message: 'Despesa fixa cadastrada com sucesso.' };
}

async function saveTransactionLocal(payload) {
  const user = await getBootstrapUser();
  const data = String(payload.data || '').trim();
  const competencia = String(data || '').slice(0, 7);
  const tipo = normUpper(payload.tipo || '');
  const descricao = String(payload.descricao || '').trim();
  const categoria = String(payload.categoria || '').trim();
  const valor = toMoneyNumber(payload.valor);
  const observacao = String(payload.observacao || '').trim();

  if (!data || !competencia || !tipo || !descricao || !categoria || !valor) {
    return { ok: false, message: 'Preencha os campos obrigatórios.' };
  }

  const statusInicial = tipo === 'RECEITA' ? 'PAGO' : 'PENDENTE';

  await add(STORES.TRANSACTIONS, {
    id: uid('LAN'),
    userId: user.userId,
    data,
    competencia,
    tipo,
    descricao,
    categoria,
    valor,
    status: statusInicial,
    origemTipo: 'MANUAL',
    origemId: '',
    parcelaInfo: '',
    observacao,
    criadoEm: nowIso(),
    atualizadoEm: nowIso()
  });

  return { ok: true, message: 'Lançamento salvo com sucesso.' };

}
async function updateTransactionLocal(payload) {
  const id = String(payload.id || '').trim();
  if (!id) return { ok: false, message: 'ID inválido.' };

  if (isVirtualFixedId(id)) {
    return materializeVirtualFixedAsPaidOrEditedLocal(payload);
  }

  const current = await findTransactionByIdLocal(id);
  if (!current) return { ok: false, message: 'Lançamento não encontrado.' };

  const newData = String(payload.data || current.data || '').trim();
  const newTipo = normUpper(payload.tipo || current.tipo || 'DESPESA');
  let newStatus = normUpper(payload.status || current.status || '');

  if (!newStatus) {
    newStatus = newTipo === 'RECEITA' ? 'PAGO' : 'PENDENTE';
  }

  const updated = {
    ...current,
    data: newData,
    competencia: String(newData || '').slice(0, 7),
    tipo: newTipo,
    descricao: String(payload.descricao ?? current.descricao ?? '').trim(),
    categoria: String(payload.categoria ?? current.categoria ?? '').trim(),
    valor: toMoneyNumber(payload.valor ?? current.valor ?? 0),
    status: newStatus,
    observacao: String(payload.observacao ?? current.observacao ?? '').trim(),
    atualizadoEm: nowIso()
  };

  await put(STORES.TRANSACTIONS, updated);
  return { ok: true, message: 'Lançamento atualizado.' };
}

async function updateTransactionStatusLocal(id, status) {
  const targetId = String(id || '').trim();
  if (!targetId) return { ok: false, message: 'ID inválido.' };

  if (isVirtualFixedId(targetId)) {
    return materializeVirtualFixedStatusLocal(targetId, status);
  }

  const current = await findTransactionByIdLocal(targetId);
  if (!current) return { ok: false, message: 'Lançamento não encontrado.' };

  current.status = normUpper(status || 'PENDENTE');
  current.atualizadoEm = nowIso();

  await put(STORES.TRANSACTIONS, current);
  return { ok: true, message: 'Status atualizado.' };
}

async function deleteTransactionLocal(id) {
  const targetId = String(id || '').trim();

  if (isVirtualFixedId(targetId)) {
    return { ok: true, message: 'Despesa fixa virtual removida apenas da visualização deste mês.' };
  }

  const current = await findTransactionByIdLocal(targetId);
  if (!current) return { ok: false, message: 'Lançamento não encontrado.' };

  await remove(STORES.TRANSACTIONS, targetId);
  return { ok: true, message: 'Lançamento excluído.' };
}
async function materializeVirtualFixedStatusLocal(virtualId, status) {
  const parsed = parseVirtualFixedId(virtualId);
  if (!parsed.ok) return { ok: false, message: 'ID virtual inválido.' };

  const fixa = await findFixedExpenseByIdLocal(parsed.fixaId);
  if (!fixa) return { ok: false, message: 'Despesa fixa não encontrada.' };

  const existing = await findRealFixedLaunchLocal(parsed.monthKey, parsed.fixaId);
  if (existing) {
    return updateTransactionStatusLocal(existing.id, status);
  }

  const dia = Math.min(Math.max(Number(fixa.diaVencimento || 1), 1), 28);
  const data = parsed.monthKey + '-' + String(dia).padStart(2, '0');

  await add(STORES.TRANSACTIONS, {
    id: uid('LAN'),
    userId: fixa.userId,
    data,
    competencia: parsed.monthKey,
    tipo: 'DESPESA',
    descricao: fixa.descricao,
    categoria: fixa.categoria,
    valor: Number(fixa.valor || 0),
    status: normUpper(status || 'PENDENTE'),
    origemTipo: 'FIXA',
    origemId: fixa.id,
    parcelaInfo: '',
    observacao: fixa.observacao || '',
    criadoEm: nowIso(),
    atualizadoEm: nowIso()
  });

  return { ok: true, message: 'Status atualizado.' };
}

async function materializeVirtualFixedAsPaidOrEditedLocal(payload) {
  const parsed = parseVirtualFixedId(payload.id);
  if (!parsed.ok) return { ok: false, message: 'ID virtual inválido.' };

  const existing = await findRealFixedLaunchLocal(parsed.monthKey, parsed.fixaId);
  if (existing) {
    payload.id = existing.id;
    return updateTransactionLocal(payload);
  }

  const fixa = await findFixedExpenseByIdLocal(parsed.fixaId);
  if (!fixa) return { ok: false, message: 'Despesa fixa não encontrada.' };

  const dia = Math.min(Math.max(Number(fixa.diaVencimento || 1), 1), 28);
  const data = String(payload.data || (parsed.monthKey + '-' + String(dia).padStart(2, '0'))).trim();
  const competencia = String(data || '').slice(0, 7);
  const tipo = normUpper(payload.tipo || 'DESPESA');
  const descricao = String(payload.descricao || fixa.descricao || '').trim();
  const categoria = String(payload.categoria || fixa.categoria || '').trim();
  const valor = toMoneyNumber(payload.valor || fixa.valor || 0);
  const status = normUpper(payload.status || 'PENDENTE');
  const observacao = String(payload.observacao || fixa.observacao || '').trim();

  await add(STORES.TRANSACTIONS, {
    id: uid('LAN'),
    userId: fixa.userId,
    data,
    competencia,
    tipo,
    descricao,
    categoria,
    valor,
    status,
    origemTipo: 'FIXA',
    origemId: fixa.id,
    parcelaInfo: '',
    observacao,
    criadoEm: nowIso(),
    atualizadoEm: nowIso()
  });

  return { ok: true, message: 'Lançamento atualizado.' };
}
async function saveCardPurchaseLocal(payload) {
  const user = await getBootstrapUser();

  const descricao = String(payload.descricao || '').trim();
  const categoria = 'Cartão';
  const valorTotal = toMoneyNumber(payload.valorTotal);
  const tipoCompra = normUpper(payload.tipoCompra || 'AVISTA');
  const parcelas = Math.max(1, Number(payload.parcelas || 1));
  const dataCompra = String(payload.dataCompra || '').trim();
  const primeiraCompetencia =
    normalizeMonthKey(payload.primeiraCompetencia) ||
    String(dataCompra || '').slice(0, 7);
  const observacao = String(payload.observacao || '').trim();

  if (!descricao || !valorTotal || !dataCompra || !primeiraCompetencia) {
    return { ok: false, message: 'Preencha os campos obrigatórios da compra.' };
  }

  const cardId = uid('CARD');
  const totalParcelas = (tipoCompra === 'PARCELADO' && parcelas > 1) ? parcelas : 1;

  await add(STORES.CARDS, {
    id: cardId,
    userId: user.userId,
    dataCompra,
    primeiraCompetencia,
    descricao,
    categoria,
    valorTotal,
    parcelas: totalParcelas,
    observacao,
    criadoEm: nowIso(),
    atualizadoEm: nowIso()
  });

  const valorTotalCentavos = Math.round(valorTotal * 100);
  const valorBaseCentavos = Math.floor(valorTotalCentavos / totalParcelas);
  let acumulado = 0;

  for (let i = 1; i <= totalParcelas; i++) {
    let valorParcelaCentavos = valorBaseCentavos;

    if (i < totalParcelas) {
      acumulado += valorParcelaCentavos;
    } else {
      valorParcelaCentavos = valorTotalCentavos - acumulado;
    }

    const competenciaParcela = addMonthsToKey(primeiraCompetencia, i - 1);
    const valorParcela = valorParcelaCentavos / 100;

    await add(STORES.TRANSACTIONS, {
      id: uid('LAN'),
      userId: user.userId,
      data: dataCompra,
      competencia: competenciaParcela,
      tipo: 'DESPESA',
      descricao,
      categoria,
      valor: valorParcela,
      status: 'PENDENTE',
      origemTipo: 'CARTAO',
      origemId: cardId,
      parcelaInfo: `${i}/${totalParcelas}`,
      observacao,
      criadoEm: nowIso(),
      atualizadoEm: nowIso()
    });
  }

  return { ok: true, message: 'Compra no cartão salva com sucesso.' };
}
window.DB = {
  getAppBootstrap: getAppBootstrapLocal,
  getDashboardData: getDashboardDataLocal,
  getCategories: getCategoriesLocal,
  getFixedExpenses: getFixedExpensesLocal,
  getCards: getCardsLocal,
  saveCategory: saveCategoryLocal,
  saveTransaction: saveTransactionLocal,
  updateTransaction: updateTransactionLocal,
  updateTransactionStatus: updateTransactionStatusLocal,
  deleteTransaction: deleteTransactionLocal,
  saveCardPurchase: saveCardPurchaseLocal,
  saveFixedExpense: saveFixedExpenseLocal
};
