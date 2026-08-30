export const BACKFILL_HEADERS = [
  "Description",
  "Category",
  "Amount",
  "Purchase Date",
  "Card (Name)",
  "Refund amount"
];

export function buildBackfillTemplateCSV() {
  return `${BACKFILL_HEADERS.join(",")}\n`;
}

export function parseTransactionCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const headers = rows[0].map((value) => normalizeHeader(value));
  const dataRows = rows.slice(1);

  const descriptionIndex = findHeader(headers, ["description", "details", "merchant"]);
  const categoryIndex = findHeader(headers, ["category"]);
  const amountIndex = findHeader(headers, ["amount", "value", "debit"]);
  const dateIndex = findHeader(headers, ["purchase date", "date", "transaction date"]);
  const cardIndex = findHeader(headers, ["card name", "card (name)", "card"]);
  const refundIndex = findHeader(headers, ["refund amount", "refund", "refunded amount"]);

  if (descriptionIndex < 0 || amountIndex < 0 || dateIndex < 0) {
    throw new Error("CSV must include Description, Amount, and Purchase Date columns.");
  }

  return dataRows
    .map((row) => ({
      title: clean(row[descriptionIndex]),
      category: categoryIndex >= 0 ? clean(row[categoryIndex]) || "General" : "General",
      amount: parseAmount(row[amountIndex]),
      date: parseDate(row[dateIndex]),
      cardName: cardIndex >= 0 ? clean(row[cardIndex]) : "",
      refundedAmount: refundIndex >= 0 ? parseAmount(row[refundIndex]) : 0
    }))
    .filter((row) => row.title && row.amount > 0 && row.date);
}

export function downloadTextFile(fileName, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "\"" && quoted && next === "\"") {
      cell += "\"";
      i += 1;
    } else if (ch === "\"") {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => clean(value))) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  row.push(cell);
  if (row.some((value) => clean(value))) rows.push(row);
  return rows;
}

function findHeader(headers, keys) {
  return headers.findIndex((header) => keys.some((key) => header.includes(key)));
}

function normalizeHeader(value) {
  return clean(value).toLowerCase();
}

function clean(value) {
  return String(value || "").replace(/^"|"$/g, "").trim();
}

function parseAmount(value) {
  const cleaned = clean(value)
    .replace(/,/g, "")
    .replace(/₹/g, "")
    .replace(/rs\.?/gi, "")
    .replace(/inr/gi, "")
    .replace(/\(([^)]+)\)/, "-$1")
    .trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

function parseDate(value) {
  const raw = clean(value);
  if (!raw) return null;
  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso;

  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const [, dd, mm, yyyy] = slash;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}
