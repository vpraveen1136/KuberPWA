import { replaceAllData, getAllData, saveMetaValues } from "./db.js";

const REQUIRED_SNAPSHOT_ARRAYS = [
  "cards",
  "categories",
  "budgets",
  "transactions",
  "emis",
  "statements",
  "payments",
  "wishlist"
];

export async function importFullBackupFile(file) {
  const text = await file.text();
  const backup = JSON.parse(text);
  const normalized = normalizeFullBackup(backup);
  normalized.meta.lastImportFileName = file.name || "Kuber backup";
  await replaceAllData(normalized);
  return summarizeData(normalized);
}

export function normalizeFullBackup(backup) {
  if (!backup || typeof backup !== "object") {
    throw new Error("This file is not a Kuber backup.");
  }
  if (!backup.snapshot || typeof backup.snapshot !== "object") {
    throw new Error("Missing Kuber snapshot.");
  }

  const snapshot = backup.snapshot;
  for (const key of REQUIRED_SNAPSHOT_ARRAYS) {
    if (!Array.isArray(snapshot[key])) {
      throw new Error(`Invalid backup: snapshot.${key} is missing.`);
    }
  }

  const statementFiles = normalizeStatementFiles(backup.statementFiles || []);
  const storedNames = new Set(statementFiles.map((file) => file.id));
  const statements = snapshot.statements.map((statement) => ({
    ...statement,
    id: requireID(statement.id, "statement"),
    totalDue: numberOrZero(statement.totalDue),
    minimumDue: numberOrZero(statement.minimumDue),
    hasStoredFile: storedNames.has(statement.storedFileName || statement.fileName)
  }));

  return {
    meta: {
      appName: "Kuber",
      schemaVersion: 1,
      importedBackupCreatedAt: backup.createdAt || null,
      sourceUpdatedAt: snapshot.updatedAt || null,
      lastImportedAt: new Date().toISOString(),
      lastBackupAt: backup.createdAt || null,
      hasUnexportedChanges: false,
      backupReminderDays: 7,
      reminderSettings: snapshot.reminderSettings || {
        isEnabled: false,
        daysBeforeDue: 2,
        hour: 9,
        minute: 0,
        backupReminderDays: 7
      }
    },
    cards: snapshot.cards.map((card) => ({
      ...card,
      id: requireID(card.id, "card"),
      statementDay: clampInt(card.statementDay, 1, 31, 1),
      paymentDueDay: clampInt(card.paymentDueDay, 1, 31, 20)
    })),
    categories: dedupeCategories(snapshot.categories),
    budgets: snapshot.budgets.map((budget) => ({
      ...budget,
      id: requireID(budget.id, "budget"),
      monthlyLimit: numberOrZero(budget.monthlyLimit)
    })),
    transactions: snapshot.transactions.map((tx) => ({
      ...tx,
      id: requireID(tx.id, "transaction"),
      category: tx.category || "General",
      amount: numberOrZero(tx.amount),
      refundedAmount: numberOrZero(tx.refundedAmount)
    })),
    emis: snapshot.emis.map((emi) => ({
      ...emi,
      id: requireID(emi.id, "EMI"),
      principalAmount: numberOrZero(emi.principalAmount),
      monthlyEMI: numberOrZero(emi.monthlyEMI),
      tenureMonths: clampInt(emi.tenureMonths, 1, 600, 1)
    })),
    statements,
    payments: snapshot.payments.map((payment) => ({
      ...payment,
      id: requireID(payment.id, "payment"),
      amount: numberOrZero(payment.amount)
    })),
    wishlist: snapshot.wishlist.map((item) => ({
      ...item,
      id: requireID(item.id, "wishlist item"),
      targetAmount: numberOrZero(item.targetAmount),
      savedAmount: numberOrZero(item.savedAmount)
    })),
    statementFiles
  };
}

export async function buildFullBackupExport() {
  const data = await getAllData();
  const createdAt = new Date().toISOString();
  return {
    createdAt,
    snapshot: {
      cards: data.cards,
      categories: data.categories,
      budgets: data.budgets,
      transactions: data.transactions,
      emis: data.emis,
      statements: data.statements.map(({ hasStoredFile, ...statement }) => statement),
      payments: data.payments,
      wishlist: data.wishlist,
      reminderSettings: data.meta.reminderSettings || {
        isEnabled: false,
        daysBeforeDue: 2,
        hour: 9,
        minute: 0,
        backupReminderDays: 7
      },
      lastFullBackupAt: createdAt,
      updatedAt: createdAt
    },
    statementFiles: data.statementFiles.map(({ id, byteSize, mimeType, ...file }) => file)
  };
}

export async function downloadFullBackup() {
  const backup = await buildFullBackupExport();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toLocaleDateString("en-CA");
  const fileName = `kuber-full-backup-${date}.json`;
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  await saveMetaValues({
    lastBackupAt: backup.createdAt,
    lastExportedAt: backup.createdAt,
    lastExportFileName: fileName,
    hasUnexportedChanges: false
  });
  return backup.createdAt;
}

export function summarizeData(data) {
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
    pdfBytes: data.statementFiles.reduce((sum, file) => sum + (file.byteSize || 0), 0)
  };
}

export function backupHealth(lastBackupAt, reminderDays = 7) {
  if (!lastBackupAt) {
    return {
      status: "missing",
      title: "No backup yet",
      detail: "Export a full backup after import so you can recover if Safari data is cleared."
    };
  }

  const last = new Date(lastBackupAt);
  if (Number.isNaN(last.getTime())) {
    return {
      status: "missing",
      title: "No backup yet",
      detail: "Export a full backup after import so you can recover if Safari data is cleared."
    };
  }

  const ageDays = Math.floor((Date.now() - last.getTime()) / 86400000);
  if (ageDays > reminderDays) {
    return {
      status: "overdue",
      title: "Backup overdue",
      detail: `Last backup was ${ageDays} day(s) ago. Your reminder target is ${reminderDays} days.`
    };
  }

  return {
    status: "safe",
    title: "Backup safe",
    detail: `Last backup was ${ageDays} day(s) ago.`
  };
}

function normalizeStatementFiles(files) {
  return files.map((file, index) => {
    const fileName = String(file.fileName || `statement-${index + 1}.pdf`);
    const base64Data = String(file.base64Data || "");
    return {
      id: fileName,
      fileName,
      base64Data,
      mimeType: mimeTypeForFile(fileName),
      byteSize: base64ByteSize(base64Data)
    };
  });
}

function requireID(id, label) {
  if (!id) throw new Error(`Invalid backup: missing ${label} ID.`);
  return String(id);
}

function dedupeCategories(categories) {
  const out = [];
  const seen = new Set();
  for (const category of categories.length ? categories : ["General"]) {
    const clean = String(category || "").trim() || "General";
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function base64ByteSize(base64) {
  const clean = base64.replace(/\s/g, "");
  if (!clean) return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function mimeTypeForFile(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}
