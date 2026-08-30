const DB_NAME = "kuber-local";
const DB_VERSION = 1;

export const STORE_NAMES = [
  "meta",
  "cards",
  "categories",
  "budgets",
  "transactions",
  "emis",
  "statements",
  "payments",
  "wishlist",
  "statementFiles"
];

export function openKuberDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function replaceAllData(payload) {
  const db = await openKuberDB();
  try {
    await transactionDone(db, STORE_NAMES, "readwrite", (stores) => {
      for (const store of stores.values()) store.clear();

      for (const [key, value] of Object.entries(payload.meta || {})) {
        stores.get("meta").put({ id: key, value });
      }

      putMany(stores.get("cards"), payload.cards);
      putMany(stores.get("categories"), (payload.categories || []).map((name) => ({ id: name, name })));
      putMany(stores.get("budgets"), payload.budgets);
      putMany(stores.get("transactions"), payload.transactions);
      putMany(stores.get("emis"), payload.emis);
      putMany(stores.get("statements"), payload.statements);
      putMany(stores.get("payments"), payload.payments);
      putMany(stores.get("wishlist"), payload.wishlist);
      putMany(stores.get("statementFiles"), payload.statementFiles);
    });
  } finally {
    db.close();
  }
}

export async function saveAllData(payload) {
  await replaceAllData({
    ...payload,
    meta: {
      ...(payload.meta || {}),
      updatedAt: new Date().toISOString(),
      hasUnexportedChanges: true
    }
  });
}

export async function getAllData() {
  const db = await openKuberDB();
  try {
    const result = {};
    await transactionDone(db, STORE_NAMES, "readonly", (stores) => {
      for (const name of STORE_NAMES) {
        result[name] = requestToPromise(stores.get(name).getAll());
      }
    });

    for (const name of STORE_NAMES) {
      result[name] = await result[name];
    }

    const meta = {};
    for (const row of result.meta || []) meta[row.id] = row.value;

    return {
      meta,
      cards: result.cards || [],
      categories: (result.categories || []).map((row) => row.name),
      budgets: result.budgets || [],
      transactions: result.transactions || [],
      emis: result.emis || [],
      statements: result.statements || [],
      payments: result.payments || [],
      wishlist: result.wishlist || [],
      statementFiles: result.statementFiles || []
    };
  } finally {
    db.close();
  }
}

export async function getCounts() {
  const data = await getAllData();
  return {
    cards: data.cards.length,
    categories: data.categories.length,
    budgets: data.budgets.length,
    transactions: data.transactions.length,
    emis: data.emis.length,
    statements: data.statements.length,
    payments: data.payments.length,
    wishlist: data.wishlist.length,
    statementFiles: data.statementFiles.length,
    lastBackupAt: data.meta.lastBackupAt || null,
    lastImportedAt: data.meta.lastImportedAt || null,
    lastExportedAt: data.meta.lastExportedAt || null,
    lastExportFileName: data.meta.lastExportFileName || null,
    importedBackupCreatedAt: data.meta.importedBackupCreatedAt || null,
    updatedAt: data.meta.updatedAt || null,
    hasUnexportedChanges: Boolean(data.meta.hasUnexportedChanges)
  };
}

export async function clearAllData() {
  const db = await openKuberDB();
  try {
    await transactionDone(db, STORE_NAMES, "readwrite", (stores) => {
      for (const store of stores.values()) store.clear();
    });
  } finally {
    db.close();
  }
}

export async function setMetaValue(id, value) {
  const db = await openKuberDB();
  try {
    await transactionDone(db, ["meta"], "readwrite", (stores) => {
      stores.get("meta").put({ id, value });
    });
  } finally {
    db.close();
  }
}

export async function addRecord(storeName, record) {
  if (!STORE_NAMES.includes(storeName)) {
    throw new Error(`Unknown store: ${storeName}`);
  }

  const db = await openKuberDB();
  try {
    await transactionDone(db, [storeName, "meta"], "readwrite", (stores) => {
      stores.get(storeName).put(record);
      stores.get("meta").put({ id: "updatedAt", value: new Date().toISOString() });
      stores.get("meta").put({ id: "hasUnexportedChanges", value: true });
    });
  } finally {
    db.close();
  }
}

export async function updateRecord(storeName, id, updater) {
  if (!STORE_NAMES.includes(storeName)) {
    throw new Error(`Unknown store: ${storeName}`);
  }

  const db = await openKuberDB();
  try {
    await transactionDone(db, [storeName, "meta"], "readwrite", (stores) => {
      const store = stores.get(storeName);
      const request = store.get(id);
      request.onsuccess = () => {
        const current = request.result;
        if (!current) return;
        const updated = typeof updater === "function" ? updater(current) : { ...current, ...updater };
        store.put(updated);
        markChanged(stores);
      };
    });
  } finally {
    db.close();
  }
}

export async function deleteRecord(storeName, id) {
  if (!STORE_NAMES.includes(storeName)) {
    throw new Error(`Unknown store: ${storeName}`);
  }

  const db = await openKuberDB();
  try {
    await transactionDone(db, [storeName, "meta"], "readwrite", (stores) => {
      stores.get(storeName).delete(id);
      markChanged(stores);
    });
  } finally {
    db.close();
  }
}

export async function saveMetaValues(values) {
  const db = await openKuberDB();
  try {
    await transactionDone(db, ["meta"], "readwrite", (stores) => {
      for (const [id, value] of Object.entries(values)) {
        stores.get("meta").put({ id, value });
      }
    });
  } finally {
    db.close();
  }
}

function putMany(store, rows = []) {
  for (const row of rows) store.put(row);
}

function markChanged(stores) {
  stores.get("meta").put({ id: "updatedAt", value: new Date().toISOString() });
  stores.get("meta").put({ id: "hasUnexportedChanges", value: true });
}

function transactionDone(db, storeNames, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = new Map(storeNames.map((name) => [name, tx.objectStore(name)]));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    work(stores);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
