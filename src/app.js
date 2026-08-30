import { backupHealth, downloadFullBackup, importFullBackupFile } from "./backup.js";
import { buildBackfillTemplateCSV, downloadTextFile, parseTransactionCSV } from "./csv.js";
import { addRecord, clearAllData, deleteRecord, getAllData, getCounts, saveAllData, updateRecord } from "./db.js";
import {
  addMonths,
  budgetAlerts,
  budgetsForMonth,
  budgetProgress,
  cardBreakdown,
  cashOutCurrentMonth,
  categoryBreakdown,
  categoryTrend,
  displayCard,
  dueSoon,
  financialYearCategorySpend,
  financialYearLabel,
  financialYearOptions,
  financialYearStartYear,
  forecastBudgets,
  emiDueOnMonth,
  formatDate,
  fromMonthInput,
  INR,
  lastInstallmentDate,
  monthInputValue,
  monthStart,
  netAmount,
  payableByCycleOnMonth,
  paymentRecommendation,
  purchaseDueDateForTransaction,
  remainingInstallments,
  sixMonthAverageSpend,
  spentThisMonth,
  spendingTrend,
  sameMonth,
  statementStatus
} from "./finance.js";

const APP_VERSION = "UX parity / v19";

const state = {
  tab: "dashboard",
  modal: null,
  destination: null,
  selectedMonth: monthInputValue(new Date()),
  selectedCardID: "",
  transactionSearch: "",
  transactionCardID: "",
  transactionCategory: "All",
  transactionFilterByMonth: false,
  transactionMonth: monthInputValue(new Date()),
  transactionFilterByRange: false,
  transactionDateFrom: dateInputValue(addDays(new Date(), -30)),
  transactionDateTo: dateInputValue(new Date()),
  statementCardID: "",
  budgetMonth: monthInputValue(new Date()),
  budgetCardID: "",
  analysisFYStartYear: financialYearStartYear(new Date()),
  analysisCategory: "",
  allocationHorizon: "3M",
  hiddenSpendingSeries: new Set(),
  hiddenPayableSeries: new Set(),
  settingsExpanded: {
    reminders: false,
    cards: false,
    categories: false,
    import: false
  },
  addPurchaseDraft: {},
  modalPayload: null,
  pdfURL: "",
  pdfTitle: "",
  counts: null,
  data: null,
  storageHealth: null,
  runtimeHealth: null,
  importStatus: "",
  isBusy: false
};

const app = document.querySelector("#app");

window.addEventListener("DOMContentLoaded", async () => {
  await registerServiceWorker();
  history.replaceState({ kuber: true }, "", location.href);
  await refreshState();
  render();
});

window.addEventListener("popstate", () => {
  if (state.modal || state.destination) {
    state.modal = null;
    state.modalPayload = null;
    state.destination = null;
    history.pushState({ kuber: true }, "", location.href);
    render();
  }
});

window.addEventListener("online", () => {
  state.runtimeHealth = runtimeHealthSnapshot();
  render();
});

window.addEventListener("offline", () => {
  state.runtimeHealth = runtimeHealthSnapshot();
  render();
});

async function refreshState() {
  state.counts = await getCounts();
  state.data = await getAllData();
  state.storageHealth = await storageHealthSnapshot(state.data);
  state.runtimeHealth = runtimeHealthSnapshot();
}

function render() {
  app.innerHTML = `
    <main class="phone-shell">
      <section class="screen">
        ${state.tab === "dashboard" ? dashboardTemplate() : moreTemplate()}
      </section>
      <nav class="tabbar" aria-label="Main navigation">
        ${tabButton("dashboard", "chart", "Dashboard")}
        <button class="tab-action" type="button" data-action="add-purchase" aria-label="Add purchase">
          <span class="action-icon">+</span>
          <span>Add</span>
        </button>
        ${tabButton("more", "grid", "More")}
      </nav>
      ${state.modal === "addPurchase" ? addPurchaseSheetTemplate() : ""}
      ${state.modal === "monthPicker" ? monthPickerSheetTemplate() : ""}
      ${state.modal === "cardPicker" ? cardPickerSheetTemplate() : ""}
      ${state.modal === "dashboardDetail" ? dashboardDetailSheetTemplate(state.modalPayload) : ""}
      ${state.modal === "confirm" ? confirmSheetTemplate(state.modalPayload) : ""}
      ${state.modal === "editTransaction" ? transactionEditorSheetTemplate(state.modalPayload) : ""}
      ${state.modal === "refundTransaction" ? refundSheetTemplate(state.modalPayload) : ""}
      ${state.modal === "convertEMI" ? convertEMISheetTemplate(state.modalPayload) : ""}
      ${state.modal === "editEMI" ? editEMISheetTemplate(state.modalPayload) : ""}
      ${state.modal === "budgetEditor" ? budgetEditorSheetTemplate(state.modalPayload) : ""}
      ${state.modal === "budgetForecast" ? budgetForecastSheetTemplate() : ""}
      ${state.modal === "cardEditor" ? cardEditorSheetTemplate(state.modalPayload) : ""}
      ${state.modal === "categoryEditor" ? categoryEditorSheetTemplate(state.modalPayload) : ""}
      ${state.modal === "wishEditor" ? wishEditorSheetTemplate(state.modalPayload) : ""}
      ${state.modal === "statementEditor" ? statementEditorSheetTemplate(state.modalPayload) : ""}
      ${state.modal === "statementPayments" ? statementPaymentsTemplate(state.modalPayload) : ""}
      ${state.modal === "paymentEditor" ? paymentEditorSheetTemplate(state.modalPayload) : ""}
      ${state.modal === "statementCSVImport" ? statementCSVImportSheetTemplate() : ""}
      ${state.modal === "resetData" ? resetDataSheetTemplate() : ""}
      ${state.modal === "pdfViewer" ? pdfViewerTemplate() : ""}
      ${state.destination ? destinationPanelTemplate(state.destination) : ""}
    </main>
  `;

  bindEvents();
}

function dashboardTemplate() {
  const data = state.data || emptyData();
  const counts = state.counts || {};
  const health = backupHealth(counts.lastBackupAt, 7);
  const selectedMonth = fromMonthInput(state.selectedMonth);
  const selectedCardID = state.selectedCardID || null;
  const spent = spentThisMonth(data.transactions, selectedMonth, selectedCardID);
  const emiDue = emiDueOnMonth(data.emis, selectedMonth, selectedCardID);
  const payable = payableByCycleOnMonth(data.transactions, data.emis, data.cards, selectedMonth, selectedCardID);
  const dueSoonItems = dueSoon(data.statements, data.payments, 7, selectedCardID);
  const recommendation = paymentRecommendation(data.statements, data.payments, selectedCardID);
  const cashOut = cashOutCurrentMonth(data.statements, data.payments, selectedMonth, selectedCardID);
  const alerts = budgetAlerts(data.transactions, data.budgets, selectedMonth, selectedCardID);
  const cardPoints = cardBreakdown(data.transactions, data.cards, selectedMonth);
  const categoryPoints = categoryBreakdown(data.transactions, selectedMonth, selectedCardID);
  const spendTrendSeries = cardMonthSeries(data.cards, data.transactions, selectedMonth, 6, selectedCardID, "spent");
  const payableTrendSeries = cardMonthSeries(data.cards, data.transactions, selectedMonth, 8, selectedCardID, "payable", data.payments, data.emis);
  const cardName = selectedCardID ? displayCard(data.cards.find((card) => card.id === selectedCardID)) : "All Cards";

  return `
    <div class="scroll-view">
      <header class="dashboard-header dashboard-month-card" data-month-swipe>
        <div>
          <p class="eyebrow">Kuber</p>
          <h1>Dashboard</h1>
        </div>
        <div class="ios-month-control" aria-label="Selected month">
          <button type="button" data-action="month-prev" aria-label="Previous month">‹</button>
          <button type="button" class="month-title-button" data-action="open-month-picker">${monthTitle(selectedMonth)} <span>⌄</span></button>
          <button type="button" data-action="month-next" aria-label="Next month">›</button>
        </div>
      </header>

      ${data.cards.length ? dashboardCardSelectorTemplate(cardName) : ""}

      <article class="card backup-card ${health.status}">
        <div class="card-leading-icon">${healthIcon(health.status)}</div>
        <div>
          <h2>${health.title}</h2>
          <p>${counts.hasUnexportedChanges ? "You have changes that are not exported yet. Create a full backup before clearing Safari data." : health.detail}</p>
        </div>
      </article>

      ${counts.cards ? `
        ${summaryGrid(spent, emiDue, payable, dueSoonItems[0])}
        ${dueSoonCardTemplate(dueSoonItems)}
        ${recommendationCardTemplate(recommendation)}
        ${cashOutCardTemplate(cashOut)}
        ${cardPaymentAllocationTemplate(data, selectedMonth, selectedCardID)}
        ${budgetAlertsTemplate(alerts)}
        ${seriesChartTemplate("Spending Trend", spendTrendSeries, state.hiddenSpendingSeries, "spending")}
        ${seriesChartTemplate("Future Payable Trend", payableTrendSeries, state.hiddenPayableSeries, "payable")}
        ${donutChartTemplate("Spending by Card", cardPoints, "card")}
        ${donutChartTemplate("Spending by Category", categoryPoints, "category")}
      ` : importPromptTemplate()}

      <section class="card">
        <div class="section-title">
          <h2>Migration Status</h2>
          <span>${counts.lastImportedAt ? "Imported" : "Waiting"}</span>
        </div>
        <div class="count-grid">
          ${countPill("Cards", counts.cards || 0)}
          ${countPill("Transactions", counts.transactions || 0)}
          ${countPill("Statements", counts.statements || 0)}
          ${countPill("PDFs", counts.statementFiles || 0)}
          ${countPill("EMIs", counts.emis || 0)}
          ${countPill("Budgets", counts.budgets || 0)}
        </div>
        ${state.importStatus ? `<p class="status-line">${state.importStatus}</p>` : ""}
      </section>

      <section class="card action-card">
        <button class="primary-button" type="button" data-action="choose-backup">Import Full Backup</button>
        <button class="secondary-button" type="button" data-action="export-backup" ${counts.cards ? "" : "disabled"}>Export Full Backup</button>
        <input id="backup-file" type="file" accept="application/json,.json" hidden>
      </section>
    </div>
  `;
}

function cardFilterTemplate(cards) {
  return `
    <div class="chip-row" aria-label="Card filter">
      <button class="filter-chip ${state.selectedCardID ? "" : "active"}" type="button" data-card-filter="">All Cards</button>
      ${cards.map((card) => `
        <button class="filter-chip ${state.selectedCardID === card.id ? "active" : ""}" type="button" data-card-filter="${escapeAttr(card.id)}">
          ${escapeHTML(card.nickname || displayCard(card))}
        </button>
      `).join("")}
    </div>
  `;
}

function dashboardCardSelectorTemplate(cardName) {
  return `
    <button class="dashboard-card-selector" type="button" data-action="open-card-picker">
      <span>${iconGlyph("card")}</span>
      <strong>${escapeHTML(cardName)}</strong>
      <em>⌄</em>
    </button>
  `;
}

function summaryGrid(spent, emiDue, payable, nextDue) {
  return `
    <section class="summary-grid">
      <button class="metric-card metric-button" type="button" data-dashboard-detail="spent">
        <span>Spent</span>
        <strong>${INR.format(spent)}</strong>
        <small>Selected month</small>
      </button>
      <button class="metric-card metric-button" type="button" data-dashboard-detail="emiDue">
        <span>EMI Due</span>
        <strong>${INR.format(emiDue)}</strong>
        <small>Installments</small>
      </button>
      <button class="metric-card metric-button" type="button" data-dashboard-detail="payable">
        <span>Payable</span>
        <strong>${INR.format(payable)}</strong>
        <small>Due in month</small>
      </button>
      <button class="metric-card metric-button" type="button" data-dashboard-detail="nextDue">
        <span>Next Due</span>
        <strong>${nextDue ? INR.format(nextDue.outstanding) : INR.format(0)}</strong>
        <small>${nextDue ? `${nextDue.cardType} · ${formatDate(nextDue.dueDate)}` : "No unpaid due found"}</small>
      </button>
    </section>
  `;
}

function recommendationCardTemplate(item) {
  return `
    <section class="card">
      <div class="section-title">
        <h2>Payment Recommendation</h2>
        <span>${item ? item.reason : "Clear"}</span>
      </div>
      ${item ? `
        <div class="amount-row">
          <div>
            <strong>${escapeHTML(item.cardType || "Statement")}</strong>
            <span>Due ${formatDate(item.dueDate)}</span>
          </div>
          <b>${INR.format(item.recommendedPayNow)}</b>
        </div>
      ` : `<p>No pending payment recommendation right now.</p>`}
    </section>
  `;
}

function cashOutCardTemplate(cashOut) {
  return `
    <section class="card">
      <div class="section-title">
        <h2>Cash-Out Forecast</h2>
        <span>${INR.format(cashOut.total)}</span>
      </div>
      <div class="count-grid">
        ${countPill("Statement Due", INR.format(cashOut.statementDue))}
        ${countPill("Paid", INR.format(cashOut.paidThisMonth))}
        ${countPill("Overdue", INR.format(cashOut.overdue))}
        ${countPill("Total", INR.format(cashOut.total))}
      </div>
    </section>
  `;
}

function dueSoonCardTemplate(items) {
  return `
    <section class="card">
      <div class="section-title">
        <h2>Due Soon</h2>
        <span>${items.length}</span>
      </div>
      ${items.length ? `
        <div class="compact-list">
          ${items.slice(0, 4).map((item) => `
            <div class="amount-row">
              <div>
                <strong>${escapeHTML(item.cardType || "Statement")}</strong>
                <span>${formatDate(item.dueDate)}</span>
              </div>
              <b>${INR.format(item.outstanding)}</b>
            </div>
          `).join("")}
        </div>
      ` : `<p>No statement due in next 7 days.</p>`}
    </section>
  `;
}

function cardPaymentAllocationTemplate(data, selectedMonth, selectedCardID) {
  const rows = cardPaymentAllocations(data, selectedMonth, state.allocationHorizon, selectedCardID);
  return `
    <section class="card">
      <div class="section-title split-title">
        <h2>Card Payment Allocation</h2>
        <div class="segmented-actions compact-segmented" role="group" aria-label="Allocation range">
          ${["3M", "6M", "FY"].map((range) => `<button type="button" class="${state.allocationHorizon === range ? "active" : ""}" data-allocation-horizon="${range}">${range}</button>`).join("")}
        </div>
      </div>
      ${rows.length ? rows.map((row) => `
        <div class="progress-row">
          <div class="progress-label">
            <strong>${escapeHTML(row.cardType)}</strong>
            <span>Paid ${INR.format(row.paid)} / Pending ${INR.format(row.pending)}</span>
          </div>
          <div class="progress-track"><i style="width:${row.totalDue > 0 ? Math.round((row.paid / row.totalDue) * 100) : 0}%"></i></div>
        </div>
      `).join("") : `<p>No statement data available.</p>`}
    </section>
  `;
}

function seriesChartTemplate(title, series, hiddenSet, kind) {
  const visible = series.filter((point) => !hiddenSet.has(point.cardID));
  const months = [...new Map(series.map((point) => [point.monthKey, point])).values()];
  const labels = [...new Map(series.map((point) => [point.cardID, point.cardLabel])).entries()];
  const max = Math.max(...visible.map((point) => point.amount), 1);
  const total = visible.reduce((sum, point) => sum + point.amount, 0);
  return `
    <section class="card">
      <div class="section-title">
        <h2>${title}</h2>
        <span>${visible.length ? INR.format(total) : "No data"}</span>
      </div>
      ${series.some((point) => point.amount > 0) ? `
        <div class="stacked-chart" style="--month-count:${months.length}">
          ${months.map((month) => {
            const monthPoints = visible.filter((point) => point.monthKey === month.monthKey && point.amount > 0);
            const monthTotal = monthPoints.reduce((sum, point) => sum + point.amount, 0);
            return `
              <div class="stacked-month">
                <small>${monthTotal ? INR.format(monthTotal) : ""}</small>
                <div class="stacked-bars">
                  ${monthPoints.map((point) => `<i style="height:${Math.max(4, Math.round((point.amount / max) * 100))}%; background:${seriesColor(point.cardID)}"></i>`).join("")}
                </div>
                <span>${escapeHTML(month.label)}</span>
              </div>
            `;
          }).join("")}
        </div>
        <div class="legend-row">
          ${labels.map(([cardID, label]) => `
            <button type="button" class="${hiddenSet.has(cardID) ? "muted" : ""}" data-series-toggle="${kind}" data-id="${escapeAttr(cardID)}">
              <i style="background:${seriesColor(cardID)}"></i>${escapeHTML(label)}
            </button>
          `).join("")}
        </div>
      ` : `<p>No data available for this view.</p>`}
    </section>
  `;
}

function donutChartTemplate(title, points, kind) {
  const total = points.reduce((sum, point) => sum + point.amount, 0);
  const stops = donutStops(points);
  return `
    <section class="card">
      <div class="section-title">
        <h2>${title}</h2>
        <span>${total ? INR.format(total) : "No data"}</span>
      </div>
      ${points.length ? `
        <div class="donut-wrap">
          <div class="donut-chart" style="background:${stops}"><span>${INR.format(total)}</span></div>
        </div>
        <div class="donut-list">
          ${points.map((point, index) => `
            <button type="button" class="donut-row" ${kind === "category" ? `data-category-detail="${escapeAttr(point.label)}"` : ""}>
              <i style="background:${seriesColor(point.label, index)}"></i>
              <span>${escapeHTML(point.label)}</span>
              <b>${INR.format(point.amount)}</b>
            </button>
          `).join("")}
        </div>
      ` : `<p>No transactions this month.</p>`}
    </section>
  `;
}

function budgetAlertsTemplate(alerts) {
  return `
    <section class="card">
      <div class="section-title">
        <h2>Budget Alerts</h2>
        <span>${alerts.length ? "Watch" : "OK"}</span>
      </div>
      ${alerts.length ? alerts.slice(0, 4).map((alert) => `
        <div class="progress-row ${alert.remaining < 0 ? "danger" : "warn"}">
          <div class="progress-label">
            <strong>${escapeHTML(alert.category)}</strong>
            <span>${INR.format(alert.spent)} / ${INR.format(alert.budget)}</span>
          </div>
          <div class="progress-track"><i style="width: ${Math.min(100, Math.round(alert.utilization * 100))}%"></i></div>
        </div>
      `).join("") : `<p>No budget alerts for the selected month.</p>`}
    </section>
  `;
}

function miniChartTemplate(title, points) {
  const positive = points.filter((point) => point.amount > 0);
  const max = Math.max(...points.map((point) => point.amount), 1);
  return `
    <section class="card">
      <div class="section-title">
        <h2>${title}</h2>
        <span>${positive.length ? INR.format(positive.reduce((sum, point) => sum + point.amount, 0)) : "No data"}</span>
      </div>
      ${positive.length ? `
        <div class="bar-chart">
          ${points.map((point) => `
            <div class="bar-column">
              <div class="bar-track">
                <i style="height:${Math.max(3, Math.round((point.amount / max) * 100))}%"></i>
              </div>
              <span>${escapeHTML(shortLabel(point.label))}</span>
            </div>
          `).join("")}
        </div>
      ` : `<p>No data available for this view.</p>`}
    </section>
  `;
}

function importPromptTemplate() {
  return `
    <section class="card empty-state">
      <h2>Import your iPhone backup</h2>
      <p>Select the Kuber full backup JSON. It stays on this device and is stored in Safari's IndexedDB.</p>
      <button class="primary-button" type="button" data-action="choose-backup">Choose Backup File</button>
    </section>
  `;
}

function moreTemplate() {
  const items = [
    ["budget", "Budget", "wallet"],
    ["transactions", "Transactions", "list"],
    ["statements", "Statements", "doc"],
    ["emis", "EMIs", "card"],
    ["backup", "Backup & Restore", "cloud"],
    ["spending", "Spending Analysis", "chart"],
    ["wishlist", "Wishlist", "spark"],
    ["settings", "Settings", "gear"]
  ];

  return `
    <div class="scroll-view">
      <header class="page-header">
        <h1>More</h1>
        <p>Your control center for records, plans, statements, wishlist and setup.</p>
      </header>
      <section class="more-grid">
        ${items.map(([id, title, icon]) => `
          <button class="more-card" type="button" data-destination="${id}">
            <span class="more-icon ${icon}">${iconGlyph(icon)}</span>
            <strong>${title}</strong>
          </button>
        `).join("")}
      </section>
    </div>
  `;
}

function addPurchaseSheetTemplate() {
  const data = state.data || emptyData();
  const cards = data.cards || [];
  const categories = data.categories?.length ? data.categories : ["General"];
  const draft = state.addPurchaseDraft || {};
  const today = draft.date || new Date().toISOString().slice(0, 10);
  const selectedCategory = draft.category || categories[0] || "General";
  const selectedCardID = draft.cardID || cards[0]?.id || "";

  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="add-purchase-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="add-purchase-title">Add Purchase</h2>
          <button type="submit" form="add-purchase-form" class="toolbar-button confirm" data-save-button disabled>Save</button>
        </header>

        <form id="add-purchase-form" class="form-list">
          ${cards.length ? `
            <label class="form-row">
              <span>Description</span>
              <input name="title" type="text" autocomplete="off" required placeholder="Purchase" value="${escapeAttr(draft.title || "")}">
            </label>
            <label class="form-row">
              <span>Category</span>
              <select name="category">
                ${categories.map((category) => `<option value="${escapeAttr(category)}" ${selectedCategory === category ? "selected" : ""}>${escapeHTML(category)}</option>`).join("")}
              </select>
            </label>
            <div class="inline-add-row">
              <input name="newCategory" type="text" autocomplete="off" placeholder="Add category">
              <button type="button" data-action="add-inline-category">Add</button>
            </div>
            <label class="form-row">
              <span>Amount</span>
              <input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required placeholder="0" value="${escapeAttr(draft.amount || "")}">
            </label>
            <label class="form-row">
              <span>Purchase Date</span>
              <input name="date" type="date" required value="${escapeAttr(today)}">
            </label>
            <label class="form-row">
              <span>Card</span>
              <select name="cardID">
                ${cards.map((card) => `<option value="${escapeAttr(card.id)}" ${selectedCardID === card.id ? "selected" : ""}>${escapeHTML(displayCard(card))}</option>`).join("")}
              </select>
            </label>
            <label class="form-row">
              <span>Notes</span>
              <input name="notes" type="text" autocomplete="off" placeholder="Optional" value="${escapeAttr(draft.notes || "")}">
            </label>
          ` : `
            <div class="form-empty">
              <strong>Please add a credit card first.</strong>
              <p>Cards will be managed from Settings in a later phase. Import your iPhone backup to start with existing cards.</p>
            </div>
          `}
        </form>
      </section>
    </div>
  `;
}

function monthPickerSheetTemplate() {
  const selected = fromMonthInput(state.selectedMonth);
  const year = selected.getFullYear();
  const months = Array.from({ length: 12 }, (_, index) => new Date(year, index, 1));
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet small-sheet" role="dialog" aria-modal="true" aria-labelledby="month-picker-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="month-picker-title">Pick Month</h2>
          <span></span>
        </header>
        <div class="picker-grid">
          <button type="button" data-month-choice="${monthInputValue(addMonths(selected, -12))}">‹ ${year - 1}</button>
          <strong>${year}</strong>
          <button type="button" data-month-choice="${monthInputValue(addMonths(selected, 12))}">${year + 1} ›</button>
          ${months.map((month) => `
            <button type="button" class="${sameMonth(month, selected) ? "active" : ""}" data-month-choice="${monthInputValue(month)}">${month.toLocaleDateString("en-IN", { month: "short" })}</button>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function cardPickerSheetTemplate() {
  const data = state.data || emptyData();
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet small-sheet" role="dialog" aria-modal="true" aria-labelledby="card-picker-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="card-picker-title">Choose Card</h2>
          <span></span>
        </header>
        <div class="choice-list">
          <button type="button" class="${state.selectedCardID ? "" : "active"}" data-card-choice="">All Cards</button>
          ${data.cards.map((card) => `
            <button type="button" class="${state.selectedCardID === card.id ? "active" : ""}" data-card-choice="${escapeAttr(card.id)}">${escapeHTML(displayCard(card))}</button>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function dashboardDetailSheetTemplate(payload) {
  if (!payload) return "";
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="dashboard-detail-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="dashboard-detail-title">${escapeHTML(payload.title)}</h2>
          <span></span>
        </header>
        <div class="sheet-list">
          ${payload.items.length ? payload.items.map(dashboardDetailRowTemplate).join("") : `<p class="list-empty">No records found.</p>`}
        </div>
      </section>
    </div>
  `;
}

function confirmSheetTemplate(payload) {
  if (!payload) return "";
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet confirm-sheet small-sheet" role="dialog" aria-modal="true" aria-labelledby="confirm-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="confirm-title">${escapeHTML(payload.title || "Confirm")}</h2>
          <button type="button" class="toolbar-button confirm danger-confirm" data-action="confirm-modal">${escapeHTML(payload.confirmLabel || "Delete")}</button>
        </header>
        <div class="confirm-body">
          <p>${escapeHTML(payload.message || "")}</p>
        </div>
      </section>
    </div>
  `;
}

function dashboardDetailRowTemplate(item) {
  return `
    <article class="record-row">
      <div class="record-main">
        <div class="record-title-line">
          <strong>${escapeHTML(item.title)}</strong>
          <b>${INR.format(item.amount)}</b>
        </div>
        <span>${escapeHTML(item.subtitle || "")}</span>
        ${item.meta ? `<span>${escapeHTML(item.meta)}</span>` : ""}
      </div>
    </article>
  `;
}

function destinationPanelTemplate(destination) {
  const config = destinationConfig(destination);
  return `
    <section class="panel-screen" role="dialog" aria-modal="true" aria-labelledby="panel-title">
      <header class="panel-nav">
        <button type="button" class="back-button" data-action="close-destination">‹ More</button>
        <h2 id="panel-title">${config.title}</h2>
        <span></span>
      </header>
      <div class="panel-content">
        ${config.body}
      </div>
    </section>
  `;
}

function destinationConfig(destination) {
  const data = state.data || emptyData();
  const counts = state.counts || {};
  const configs = {
    budget: {
      title: "Budget",
      body: budgetPanelTemplate()
    },
    transactions: {
      title: "Transactions",
      body: transactionsPanelTemplate()
    },
    statements: {
      title: "Statements",
      body: statementsPanelTemplate()
    },
    emis: {
      title: "EMI Plans",
      body: emiPanelTemplate()
    },
    backup: {
      title: "Backup & Restore",
      body: `
        ${backupPanelTemplate()}
      `
    },
    spending: {
      title: "Spending Analysis",
      body: spendingAnalysisTemplate()
    },
    wishlist: {
      title: "Wishlist",
      body: wishlistPanelTemplate()
    },
    settings: {
      title: "Settings",
      body: settingsPanelTemplate()
    }
  };

  return configs[destination] || configs.backup;
}

function emiPanelTemplate() {
  const data = state.data || emptyData();
  const plans = [...data.emis].sort((a, b) => new Date(a.firstInstallmentDate) - new Date(b.firstInstallmentDate));
  const selectedMonth = fromMonthInput(state.selectedMonth);
  const totalDue = emiDueOnMonth(data.emis, selectedMonth, null);
  return `
    <section class="card">
      <div class="section-title">
        <h2>EMI Plans</h2>
        <span>${INR.format(totalDue)}</span>
      </div>
      <div class="count-grid">
        ${countPill("Active Plans", plans.length)}
        ${countPill("This Month", INR.format(totalDue))}
      </div>
    </section>
    <div class="list-card">
      ${plans.length ? plans.map((plan) => emiRowTemplate(plan, data)).join("") : `<p class="list-empty">No EMI plans yet</p>`}
    </div>
  `;
}

function emiRowTemplate(plan, data) {
  const tx = data.transactions.find((item) => item.id === plan.transactionID);
  const selectedMonth = fromMonthInput(state.selectedMonth);
  return `
    <article class="record-row swipe-row" data-swipe-leading="emi:edit:${escapeAttr(plan.id)}" data-swipe-trailing="emi:revert:${escapeAttr(plan.id)}">
      <div class="record-main">
        <div class="record-title-line">
          <strong>${escapeHTML(tx?.title || "EMI Purchase")}</strong>
          <b>${INR.format(Number(plan.monthlyEMI || 0))}</b>
        </div>
        <span>${escapeHTML(plan.cardType || "Card")} · ${Number(plan.tenureMonths || 0)} months</span>
        <span>First: ${formatDate(plan.firstInstallmentDate)} · Last: ${formatDate(lastInstallmentDate(plan))}</span>
        <span>Remaining: ${remainingInstallments(plan, selectedMonth)} installment(s)</span>
        <div class="row-actions">
          <button type="button" data-emi-action="edit" data-id="${escapeAttr(plan.id)}">Edit</button>
          <button type="button" class="danger-text" data-emi-action="revert" data-id="${escapeAttr(plan.id)}">Revert EMI</button>
        </div>
      </div>
    </article>
  `;
}

function budgetPanelTemplate() {
  const data = state.data || emptyData();
  const month = fromMonthInput(state.budgetMonth);
  const cardID = state.budgetCardID || null;
  const rows = budgetProgress(data.transactions, data.budgets, month, cardID);
  const totalBudget = rows.reduce((sum, row) => sum + Number(row.monthlyLimit || 0), 0);
  const totalSpent = rows.reduce((sum, row) => sum + Number(row.spent || 0), 0);
  const remaining = totalBudget - totalSpent;
  return `
    <section class="card filter-card">
      <div class="section-title">
        <h2>Create Budget</h2>
        <button class="inline-button" type="button" data-budget-action="add">Create</button>
      </div>
      <div class="segmented-actions">
        <button type="button" data-budget-action="copy-previous">Copy Previous</button>
        <button type="button" data-budget-action="forecast">Smart Forecast</button>
      </div>
      <label class="form-row compact">
        <span>Month</span>
        <input type="month" data-control="budget-month" value="${escapeAttr(state.budgetMonth)}">
      </label>
      <label class="form-row compact">
        <span>Card</span>
        <select data-control="budget-card">
          <option value="">All Cards</option>
          ${data.cards.map((card) => `<option value="${escapeAttr(card.id)}" ${state.budgetCardID === card.id ? "selected" : ""}>${escapeHTML(displayCard(card))}</option>`).join("")}
        </select>
      </label>
    </section>
    <section class="card">
      <div class="section-title">
        <h2>Budgets</h2>
        <span>${rows.length}</span>
      </div>
      <div class="count-grid">
        ${countPill("Total Budget", INR.format(totalBudget))}
        ${countPill("Total Spent", INR.format(totalSpent))}
        ${countPill(remaining >= 0 ? "Remaining" : "Over", INR.format(Math.abs(remaining)))}
      </div>
    </section>
    <div class="list-card">
      ${rows.length ? rows.map(budgetRowTemplate).join("") : `<p class="list-empty">No budgets set for this month</p>`}
    </div>
  `;
}

function budgetForecastSheetTemplate() {
  const data = state.data || emptyData();
  const month = fromMonthInput(state.budgetMonth);
  const suggestions = forecastBudgets(data.transactions, data.categories, month);
  const existing = budgetsForMonth(data.budgets, month);
  const existingKeys = new Set(existing.map((budget) => String(budget.category || "").toLowerCase()));
  const newSuggestions = suggestions.filter((item) => !existingKeys.has(item.category.toLowerCase()));
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="budget-forecast-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="budget-forecast-title">Create Budget</h2>
          <button type="button" class="toolbar-button confirm" data-budget-action="apply-forecast" ${newSuggestions.length ? "" : "disabled"}>Apply</button>
        </header>
        <div class="form-list">
          <section class="card plain-card">
            <div class="section-title">
              <h2>${new Date(month).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2>
              <span>${newSuggestions.length} new</span>
            </div>
            <p>Suggestions use recent spend, six-month history, and trend projection. Existing category budgets for this month are left unchanged.</p>
          </section>
          <div class="list-card">
            ${newSuggestions.length ? newSuggestions.map(forecastRowTemplate).join("") : `<p class="list-empty">No new forecast suggestions available for this month.</p>`}
          </div>
        </div>
      </section>
    </div>
  `;
}

function forecastRowTemplate(item) {
  return `
    <article class="record-row">
      <div class="record-main">
        <div class="record-title-line">
          <strong>${escapeHTML(item.category)}</strong>
          <b>${INR.format(item.suggestedLimit)}</b>
        </div>
        <span>${item.confidence} confidence · ${item.monthsObserved} month(s) observed</span>
        <span>Recent ${INR.format(item.recentAverage)} · Trend ${INR.format(item.trendProjection)}</span>
      </div>
    </article>
  `;
}

function settingsPanelTemplate() {
  const data = state.data || emptyData();
  const runtime = state.runtimeHealth || runtimeHealthSnapshot();
  return `
    ${settingsSectionTemplate("reminders", "Notifications & Reminders", `
      <p>Browser notifications are limited in Safari PWAs. Backup reminders remain visible through Backup & Restore health.</p>
    `)}

    ${settingsSectionTemplate("cards", "Cards", `
      <div class="section-title inner-title">
        <h2>Credit Cards</h2>
        <button class="inline-button" type="button" data-settings-action="add-card">Add</button>
      </div>
      ${data.cards.length ? `<div class="settings-list">${data.cards.map(cardSettingsRowTemplate).join("")}</div>` : `<p>No cards added yet.</p>`}
    `)}

    ${settingsSectionTemplate("categories", "Categories", `
      <div class="inline-add-row">
        <input data-control="settings-new-category" type="text" autocomplete="off" placeholder="Add new category">
        <button type="button" data-settings-action="quick-add-category">Add</button>
      </div>
      ${data.categories.length ? `<div class="settings-list">${data.categories.map(categorySettingsRowTemplate).join("")}</div>` : `<p>No categories available.</p>`}
    `)}

    ${settingsSectionTemplate("import", "Backfill Import", `
      <p>Import past purchases from a CSV using Description, Category, Amount, Purchase Date, Card (Name), and Refund amount. Matching rows are skipped if imported again.</p>
      <button class="secondary-button" type="button" data-action="download-template">Download Template</button>
      <button class="primary-button" type="button" data-action="choose-backfill-csv">Import Backfill CSV</button>
      <input id="backfill-csv-file" type="file" accept=".csv,text/csv" hidden>
    `)}

    <section class="card">
      <div class="section-title">
        <h2>PWA Status</h2>
        <span>${escapeHTML(runtime.installLabel)}</span>
      </div>
      <div class="count-grid">
        ${countPill("Version", APP_VERSION)}
        ${countPill("Network", runtime.networkLabel)}
        ${countPill("Offline Cache", runtime.cacheLabel)}
        ${countPill("Mode", runtime.displayLabel)}
      </div>
      <p class="panel-note">${escapeHTML(runtime.message)}</p>
      ${runtime.canCheckUpdates ? `<button class="secondary-button" type="button" data-action="check-app-update">Check For Update</button>` : ""}
    </section>

    <section class="card">
      <div class="section-title">
        <h2>About</h2>
        <span>Kuber</span>
      </div>
      <p>Kuber tracks purchases, EMI conversions, monthly payable, and statement due dates. Data is stored locally on this device.</p>
    </section>
  `;
}

function settingsSectionTemplate(id, title, body) {
  const expanded = Boolean(state.settingsExpanded[id]);
  return `
    <section class="card collapsible-section">
      <button class="collapsible-header" type="button" data-settings-toggle="${escapeAttr(id)}">
        <span>${escapeHTML(title)}</span>
        <b>${expanded ? "⌃" : "⌄"}</b>
      </button>
      ${expanded ? `<div class="collapsible-body">${body}</div>` : ""}
    </section>
  `;
}

function spendingAnalysisTemplate() {
  const data = state.data || emptyData();
  const categories = data.categories?.length ? data.categories : ["General"];
  if (!state.analysisCategory || !categories.includes(state.analysisCategory)) {
    state.analysisCategory = categories[0] || "General";
  }
  const fyPoints = financialYearCategorySpend(data.transactions, Number(state.analysisFYStartYear));
  const avgPoints = sixMonthAverageSpend(data.transactions, new Date());
  const trendPoints = categoryTrend(data.transactions, state.analysisCategory, new Date(), 6);
  const fyTotal = fyPoints.reduce((sum, point) => sum + point.amount, 0);
  const avgTotal = avgPoints.reduce((sum, point) => sum + point.amount, 0);
  const trendTotal = trendPoints.reduce((sum, point) => sum + point.amount, 0);

  return `
    <section class="card filter-card">
      <label class="form-row compact">
        <span>Financial Year</span>
        <select data-control="analysis-fy">
          ${financialYearOptions(new Date()).map((year) => `
            <option value="${year}" ${Number(state.analysisFYStartYear) === year ? "selected" : ""}>${financialYearLabel(year)}</option>
          `).join("")}
        </select>
      </label>
      <label class="form-row compact">
        <span>Trend Category</span>
        <select data-control="analysis-category">
          ${categories.map((category) => `<option value="${escapeAttr(category)}" ${state.analysisCategory === category ? "selected" : ""}>${escapeHTML(category)}</option>`).join("")}
        </select>
      </label>
    </section>

    ${analysisChartTemplate("FY Category Spend", "Total expenditure by category", fyPoints, fyTotal)}
    ${analysisChartTemplate("6-Month Avg Spend", "Moving average of last 6 full months", avgPoints, avgTotal)}
    ${miniChartTemplate(`Spending Trend`, trendPoints)}
    <section class="card">
      <div class="section-title">
        <h2>${escapeHTML(state.analysisCategory)}</h2>
        <span>${INR.format(trendTotal)}</span>
      </div>
      <p>Last 6-month trend for this category.</p>
    </section>
  `;
}

function wishlistPanelTemplate() {
  const data = state.data || emptyData();
  const items = [...data.wishlist].sort((a, b) => {
    const priorityOrder = { High: 0, Medium: 1, Low: 2 };
    return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1)
      || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
  const totalTarget = items.reduce((sum, item) => sum + Number(item.targetAmount || 0), 0);
  const totalSaved = items.reduce((sum, item) => sum + Number(item.savedAmount || 0), 0);
  const groups = groupedWishlist(items);
  return `
    <section class="card">
      <div class="section-title">
        <h2>Wishlist</h2>
        <button class="inline-button" type="button" data-wish-action="add">Add</button>
      </div>
      <div class="count-grid">
        ${countPill("Wishes", items.length)}
        ${countPill("Saved", INR.format(totalSaved))}
        ${countPill("Target", INR.format(totalTarget))}
        ${countPill("Remaining", INR.format(Math.max(0, totalTarget - totalSaved)))}
      </div>
    </section>
    ${groups.length ? groups.map((group) => `
      <section class="wishlist-group">
        <h2>${escapeHTML(group.category)}</h2>
        <div class="list-card wishlist-list">
          ${group.items.map(wishRowTemplate).join("")}
        </div>
      </section>
    `).join("") : `<div class="list-card wishlist-list"><p class="list-empty">No wishlist items yet</p></div>`}
  `;
}

function wishRowTemplate(item) {
  const target = Number(item.targetAmount || 0);
  const saved = Number(item.savedAmount || 0);
  const progress = target > 0 ? Math.min(100, Math.max(0, Math.round((saved / target) * 100))) : 0;
  return `
    <article class="record-row wish-row swipe-row ${priorityClass(item.priority)}" data-swipe-leading="wish:edit:${escapeAttr(item.id)}" data-swipe-trailing="wish:delete:${escapeAttr(item.id)}">
      <div class="record-main">
        <div class="record-title-line">
          <strong>${escapeHTML(item.title || "Wish")}</strong>
          <b>${INR.format(target)}</b>
        </div>
        <span>${escapeHTML(item.category || "General")} · ${escapeHTML(item.priority || "Medium")} priority</span>
        <span>${INR.format(saved)} saved · ${INR.format(Math.max(0, target - saved))} remaining</span>
        <div class="progress-track statement-progress"><i style="width:${progress}%"></i></div>
        ${item.notes ? `<span>${escapeHTML(item.notes)}</span>` : ""}
        <div class="row-actions">
          <button type="button" data-wish-action="edit" data-id="${escapeAttr(item.id)}">Edit</button>
          <button type="button" class="danger-text" data-wish-action="delete" data-id="${escapeAttr(item.id)}">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function wishEditorSheetTemplate(item) {
  const data = state.data || emptyData();
  const isEdit = Boolean(item);
  const categories = data.categories?.length ? data.categories : ["General"];
  const selectedCategory = item?.category || categories[0] || "General";
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="wish-editor-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="wish-editor-title">${isEdit ? "Edit Wish" : "Add Wish"}</h2>
          <button type="submit" form="wish-editor-form" class="toolbar-button confirm">Save</button>
        </header>
        <form id="wish-editor-form" class="form-list">
          <label class="form-row">
            <span>Title</span>
            <input name="title" type="text" autocomplete="off" required value="${escapeAttr(item?.title || "")}">
          </label>
          <label class="form-row">
            <span>Category</span>
            <select name="category">
              ${categories.map((category) => `<option value="${escapeAttr(category)}" ${selectedCategory === category ? "selected" : ""}>${escapeHTML(category)}</option>`).join("")}
            </select>
          </label>
          <label class="form-row">
            <span>Target</span>
            <input name="targetAmount" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${escapeAttr(item?.targetAmount || "")}">
          </label>
          <label class="form-row">
            <span>Saved</span>
            <input name="savedAmount" type="number" inputmode="decimal" min="0" step="0.01" value="${escapeAttr(item?.savedAmount || 0)}">
          </label>
          <label class="form-row">
            <span>Priority</span>
            <select name="priority">
              ${["Low", "Medium", "High"].map((priority) => `<option value="${priority}" ${(item?.priority || "Medium") === priority ? "selected" : ""}>${priority}</option>`).join("")}
            </select>
          </label>
          <label class="form-row">
            <span>Notes</span>
            <input name="notes" type="text" autocomplete="off" value="${escapeAttr(item?.notes || "")}">
          </label>
        </form>
      </section>
    </div>
  `;
}

function analysisChartTemplate(title, subtitle, points, total) {
  return `
    <section class="card">
      <div class="section-title">
        <div>
          <h2>${title}</h2>
          <p>${subtitle}</p>
        </div>
        <span>${INR.format(total)}</span>
      </div>
      ${points.length ? `
        <div class="analysis-bars">
          ${points.slice(0, 10).map((point, index) => analysisBarRow(point, points[0]?.amount || 1, index)).join("")}
        </div>
      ` : `<p>No spending data available.</p>`}
    </section>
  `;
}

function analysisBarRow(point, maxAmount, index) {
  const width = Math.max(4, Math.round((point.amount / Math.max(maxAmount, 1)) * 100));
  return `
    <div class="analysis-row">
      <div class="analysis-row-top">
        <strong>${escapeHTML(point.label)}</strong>
        <span>${INR.format(point.amount)} · ${Math.round((point.percent || 0) * 100)}%</span>
      </div>
      <div class="analysis-track">
        <i class="tone-${index % 6}" style="width:${width}%"></i>
      </div>
    </div>
  `;
}

function cardSettingsRowTemplate(card) {
  const usage = cardUsage(card.id);
  return `
    <article class="settings-row">
      <button type="button" class="settings-main" data-settings-action="edit-card" data-id="${escapeAttr(card.id)}">
        <strong>${escapeHTML(displayCard(card))}</strong>
        <span>${escapeHTML(card.bankName || "Bank")} · Statement day ${card.statementDay || "-"} · Due day ${card.paymentDueDay || "-"}</span>
        <span>${usage.transactions} transactions · ${usage.statements} statements · ${usage.emis} EMIs</span>
      </button>
    </article>
  `;
}

function categorySettingsRowTemplate(category) {
  const isDefault = String(category).toLowerCase() === "general";
  return `
    <article class="settings-row">
      <div class="settings-main static">
        <strong>${escapeHTML(category)} ${isDefault ? `<em>Default</em>` : ""}</strong>
      </div>
      ${isDefault ? "" : `
        <div class="row-actions settings-actions">
          <button type="button" data-settings-action="edit-category" data-id="${escapeAttr(category)}">Edit</button>
          <button type="button" class="danger-text" data-settings-action="delete-category" data-id="${escapeAttr(category)}">Delete</button>
        </div>
      `}
    </article>
  `;
}

function cardEditorSheetTemplate(card) {
  const isEdit = Boolean(card);
  const statementDay = Number(card?.statementDay || 1);
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="card-editor-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="card-editor-title">${isEdit ? "Card Details" : "Add Credit Card"}</h2>
          <button type="submit" form="card-editor-form" class="toolbar-button confirm">Save</button>
        </header>
        <form id="card-editor-form" class="form-list">
          <label class="form-row">
            <span>Nickname</span>
            <input name="nickname" type="text" autocomplete="off" required value="${escapeAttr(card?.nickname || "")}">
          </label>
          <label class="form-row">
            <span>Bank</span>
            <input name="bankName" type="text" autocomplete="off" value="${escapeAttr(card?.bankName || "")}">
          </label>
          <label class="form-row">
            <span>Network</span>
            <input name="network" type="text" autocomplete="off" value="${escapeAttr(card?.network || "")}">
          </label>
          <label class="form-row">
            <span>Last 4</span>
            <input name="last4Digits" type="text" inputmode="numeric" maxlength="4" required value="${escapeAttr(card?.last4Digits || "")}">
          </label>
          <label class="form-row">
            <span>Statement Day</span>
            <input name="statementDay" type="number" inputmode="numeric" min="1" max="31" required value="${escapeAttr(statementDay)}">
          </label>
          <div class="form-row readonly-row">
            <span>Due Day</span>
            <strong>${autoDueDay(statementDay)}</strong>
          </div>
          <label class="form-row">
            <span>Notes</span>
            <input name="notes" type="text" autocomplete="off" value="${escapeAttr(card?.notes || "")}">
          </label>
          ${isEdit ? `
            <button type="button" class="destructive-button" data-settings-action="delete-card" data-id="${escapeAttr(card.id)}">Delete Card</button>
          ` : ""}
        </form>
      </section>
    </div>
  `;
}

function categoryEditorSheetTemplate(category) {
  const isEdit = Boolean(category);
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet small-sheet" role="dialog" aria-modal="true" aria-labelledby="category-editor-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="category-editor-title">${isEdit ? "Edit Category" : "Add Category"}</h2>
          <button type="submit" form="category-editor-form" class="toolbar-button confirm">Save</button>
        </header>
        <form id="category-editor-form" class="form-list">
          <label class="form-row">
            <span>Name</span>
            <input name="category" type="text" autocomplete="off" required value="${escapeAttr(category || "")}">
          </label>
        </form>
      </section>
    </div>
  `;
}

function budgetRowTemplate(row) {
  const pct = Math.min(100, Math.max(0, Math.round(Number(row.utilization || 0) * 100)));
  return `
    <article class="record-row swipe-row" data-long-press="budget:edit:${escapeAttr(row.id)}" data-swipe-leading="budget:edit:${escapeAttr(row.id)}" data-swipe-trailing="budget:delete:${escapeAttr(row.id)}">
      <div class="record-main">
        <div class="record-title-line">
          <strong>${escapeHTML(row.category || "Category")}</strong>
          <b>${INR.format(Number(row.monthlyLimit || 0))}</b>
        </div>
        <span>${INR.format(Number(row.spent || 0))} spent · ${INR.format(Math.abs(Number(row.remaining || 0)))} ${Number(row.remaining || 0) >= 0 ? "left" : "over"}</span>
        <div class="progress-track statement-progress ${Number(row.remaining || 0) < 0 ? "danger-track" : ""}"><i style="width:${pct}%"></i></div>
        <div class="row-actions">
          <button type="button" data-budget-action="edit" data-id="${escapeAttr(row.id)}">Edit</button>
          <button type="button" class="danger-text" data-budget-action="delete" data-id="${escapeAttr(row.id)}">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function transactionsPanelTemplate() {
  const data = state.data || emptyData();
  const rows = filteredTransactions(data);
  return `
    <section class="card filter-card">
      <label class="search-field">
        <span>${iconGlyph("search")}</span>
        <input type="search" data-control="transaction-search" value="${escapeAttr(state.transactionSearch)}" placeholder="Search by title or card">
      </label>
      <div class="form-row compact">
        <span>Card</span>
        <select data-control="transaction-card">
          <option value="">All Cards</option>
          ${data.cards.map((card) => `<option value="${escapeAttr(card.id)}" ${state.transactionCardID === card.id ? "selected" : ""}>${escapeHTML(displayCard(card))}</option>`).join("")}
        </select>
      </div>
      <div class="form-row compact">
        <span>Category</span>
        <select data-control="transaction-category">
          <option value="All">All</option>
          ${data.categories.map((category) => `<option value="${escapeAttr(category)}" ${state.transactionCategory === category ? "selected" : ""}>${escapeHTML(category)}</option>`).join("")}
        </select>
      </div>
      <label class="toggle-row">
        <span>Filter by month</span>
        <input type="checkbox" data-control="transaction-filter-month" ${state.transactionFilterByMonth ? "checked" : ""}>
      </label>
      ${state.transactionFilterByMonth ? `
        <div class="form-row compact">
          <span>Month</span>
          <input type="month" data-control="transaction-month" value="${escapeAttr(state.transactionMonth)}">
        </div>
      ` : ""}
      <label class="toggle-row">
        <span>Filter by date range</span>
        <input type="checkbox" data-control="transaction-filter-range" ${state.transactionFilterByRange ? "checked" : ""}>
      </label>
      ${state.transactionFilterByRange ? `
        <div class="form-row compact">
          <span>From</span>
          <input type="date" data-control="transaction-date-from" value="${escapeAttr(state.transactionDateFrom)}">
        </div>
        <div class="form-row compact">
          <span>To</span>
          <input type="date" data-control="transaction-date-to" value="${escapeAttr(state.transactionDateTo)}">
        </div>
      ` : ""}
    </section>
    <div class="list-card transaction-list">
      ${rows.length ? rows.map(transactionRowTemplate).join("") : `<p class="list-empty">No transactions found</p>`}
    </div>
  `;
}

function transactionRowTemplate(tx) {
  return `
    <article class="record-row swipe-row" data-swipe-leading="transaction:edit:${escapeAttr(tx.id)}" data-swipe-trailing="transaction:delete:${escapeAttr(tx.id)}">
      <div class="record-main">
        <div class="record-title-line">
          <strong>${escapeHTML(tx.title || "Purchase")}</strong>
          <b>${INR.format(netAmount(tx))}</b>
        </div>
        <span>${escapeHTML(tx.cardType || "Card")} · ${formatDate(tx.date)}</span>
        <span>Category: ${escapeHTML(tx.category || "General")}</span>
        ${Number(tx.refundedAmount || 0) > 0 ? `<span class="tone-warn">Refunded: ${INR.format(Number(tx.refundedAmount || 0))}</span>` : ""}
        <div class="row-actions">
          <button type="button" data-transaction-action="edit" data-id="${escapeAttr(tx.id)}">Edit</button>
          <button type="button" data-transaction-action="refund" data-id="${escapeAttr(tx.id)}">${Number(tx.refundedAmount || 0) > 0 ? "Update Refund" : "Refund"}</button>
          <button type="button" data-transaction-action="${tx.emiID ? "revert" : "emi"}" data-id="${escapeAttr(tx.id)}">${tx.emiID ? "Revert EMI" : "Convert To EMI"}</button>
          <button type="button" class="danger-text" data-transaction-action="delete" data-id="${escapeAttr(tx.id)}">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function statementsPanelTemplate() {
  const data = state.data || emptyData();
  const rows = filteredStatements(data);
  return `
    <section class="card statement-toolbar-card">
      <div class="section-title">
        <h2>Statements</h2>
        <button class="inline-button" type="button" data-statement-action="add">Upload</button>
      </div>
    </section>
    ${data.cards.length ? `
      <div class="chip-row panel-chips" aria-label="Statement card filter">
        <button class="filter-chip ${state.statementCardID ? "" : "active"}" type="button" data-statement-card="">All Cards</button>
        ${data.cards.map((card) => `
          <button class="filter-chip ${state.statementCardID === card.id ? "active" : ""}" type="button" data-statement-card="${escapeAttr(card.id)}">${escapeHTML(card.nickname || displayCard(card))}</button>
        `).join("")}
      </div>
    ` : ""}
    <div class="list-card statement-list">
      ${rows.length ? rows.map(statementRowTemplate).join("") : `<p class="list-empty">No statements uploaded</p>`}
    </div>
  `;
}

function statementRowTemplate(statement) {
  const data = state.data || emptyData();
  const status = statementStatus(statement, data.payments);
  const progress = Number(statement.totalDue || 0) > 0 ? Math.min(100, Math.round((status.paid / Number(statement.totalDue || 0)) * 100)) : 0;
  const file = data.statementFiles.find((candidate) => candidate.id === (statement.storedFileName || statement.fileName));
  return `
    <article class="record-row statement-row swipe-row ${status.tone}" data-swipe-leading="statement:edit:${escapeAttr(statement.id)}" data-swipe-trailing="statement:delete:${escapeAttr(statement.id)}">
      <div class="record-main">
        <div class="record-title-line">
          <strong>${escapeHTML(statement.cardType || "Statement")}</strong>
          <b>${INR.format(Number(statement.totalDue || 0))}</b>
        </div>
        <div class="statement-meta-line">
          <span>Due: ${formatDate(statement.dueDate)}</span>
          <em class="status-badge ${status.tone}">${status.label}</em>
        </div>
        <span>Minimum Due: ${INR.format(Number(statement.minimumDue || 0))}</span>
        <span>Paid: ${INR.format(status.paid)} · Balance: ${INR.format(status.outstanding)}</span>
        <div class="progress-track statement-progress"><i style="width:${progress}%"></i></div>
        <span>${escapeHTML(statement.fileName || "Statement file")}</span>
        <div class="row-actions">
          <button type="button" data-statement-action="payments" data-id="${escapeAttr(statement.id)}">Payments</button>
          <button type="button" data-statement-action="import-csv" data-id="${escapeAttr(statement.id)}">Import CSV</button>
          <button type="button" data-statement-action="edit" data-id="${escapeAttr(statement.id)}">Edit</button>
          <button type="button" data-statement-action="view" data-id="${escapeAttr(statement.id)}" ${file ? "" : "disabled"}>View</button>
          <button type="button" data-statement-action="download" data-id="${escapeAttr(statement.id)}" ${file ? "" : "disabled"}>Download</button>
          <button type="button" class="danger-text" data-statement-action="delete" data-id="${escapeAttr(statement.id)}">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function statementEditorSheetTemplate(statement) {
  const data = state.data || emptyData();
  const isEdit = Boolean(statement);
  const selectedCardID = statement?.cardID || data.cards[0]?.id || "";
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="statement-editor-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="statement-editor-title">${isEdit ? "Edit Statement" : "Upload Statement"}</h2>
          <button type="submit" form="statement-editor-form" class="toolbar-button confirm">Save</button>
        </header>
        <form id="statement-editor-form" class="form-list">
          ${data.cards.length ? `
            <label class="form-row">
              <span>Card</span>
              <select name="cardID">
                ${data.cards.map((card) => `<option value="${escapeAttr(card.id)}" ${selectedCardID === card.id ? "selected" : ""}>${escapeHTML(displayCard(card))}</option>`).join("")}
              </select>
            </label>
            <label class="form-row">
              <span>Statement Month</span>
              <input name="statementMonth" type="month" required value="${escapeAttr(statement ? monthInputValue(statement.statementMonth) : state.selectedMonth)}">
            </label>
            <label class="form-row">
              <span>Statement Date</span>
              <input name="statementDate" type="date" value="${escapeAttr(statement?.statementDate ? dateInputValue(statement.statementDate) : "")}">
            </label>
            <label class="form-row">
              <span>Due Date</span>
              <input name="dueDate" type="date" required value="${escapeAttr(statement ? dateInputValue(statement.dueDate) : dateInputValue(new Date()))}">
            </label>
            <label class="form-row">
              <span>Total Due</span>
              <input name="totalDue" type="number" inputmode="decimal" min="0" step="0.01" required value="${escapeAttr(statement?.totalDue ?? "")}">
            </label>
            <label class="form-row">
              <span>Minimum Due</span>
              <input name="minimumDue" type="number" inputmode="decimal" min="0" step="0.01" required value="${escapeAttr(statement?.minimumDue ?? "")}">
            </label>
            <label class="form-row file-row">
              <span>${isEdit ? "Replace File" : "File"}</span>
              <input name="statementFile" type="file" ${isEdit ? "" : "required"} accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg,.csv">
            </label>
            ${isEdit ? `<p class="form-hint">Current file: ${escapeHTML(statement.fileName || "Statement file")}</p>` : ""}
          ` : `
            <div class="form-empty">
              <strong>Please add a credit card first.</strong>
              <p>Cards can be added from Settings.</p>
            </div>
          `}
        </form>
      </section>
    </div>
  `;
}

function transactionEditorSheetTemplate(tx) {
  if (!tx) return "";
  const data = state.data || emptyData();
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="edit-transaction-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="edit-transaction-title">Edit Transaction</h2>
          <button type="submit" form="edit-transaction-form" class="toolbar-button confirm">Save</button>
        </header>
        <form id="edit-transaction-form" class="form-list">
          ${transactionFieldsTemplate(data, tx)}
        </form>
      </section>
    </div>
  `;
}

function transactionFieldsTemplate(data, tx) {
  const categories = data.categories?.length ? data.categories : ["General"];
  return `
    <label class="form-row">
      <span>Description</span>
      <input name="title" type="text" autocomplete="off" required value="${escapeAttr(tx.title || "")}">
    </label>
    <label class="form-row">
      <span>Category</span>
      <select name="category">
        ${categories.map((category) => `<option value="${escapeAttr(category)}" ${tx.category === category ? "selected" : ""}>${escapeHTML(category)}</option>`).join("")}
      </select>
    </label>
    <label class="form-row">
      <span>Amount</span>
      <input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${escapeAttr(tx.amount || "")}">
    </label>
    <label class="form-row">
      <span>Purchase Date</span>
      <input name="date" type="date" required value="${escapeAttr(dateInputValue(tx.date))}">
    </label>
    <label class="form-row">
      <span>Card</span>
      <select name="cardID">
        ${data.cards.map((card) => `<option value="${escapeAttr(card.id)}" ${tx.cardID === card.id ? "selected" : ""}>${escapeHTML(displayCard(card))}</option>`).join("")}
      </select>
    </label>
    <label class="form-row">
      <span>Notes</span>
      <input name="notes" type="text" autocomplete="off" value="${escapeAttr(tx.notes || "")}">
    </label>
  `;
}

function refundSheetTemplate(tx) {
  if (!tx) return "";
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet small-sheet" role="dialog" aria-modal="true" aria-labelledby="refund-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="refund-title">Record Refund</h2>
          <button type="submit" form="refund-form" class="toolbar-button confirm">Save</button>
        </header>
        <form id="refund-form" class="form-list">
          <div class="card plain-card">
            <h2>${escapeHTML(tx.title || "Purchase")}</h2>
            <p>${INR.format(Number(tx.amount || 0))}</p>
          </div>
          <label class="form-row">
            <span>Refund</span>
            <input name="refundedAmount" type="number" inputmode="decimal" min="0" step="0.01" value="${escapeAttr(tx.refundedAmount || 0)}">
          </label>
        </form>
      </section>
    </div>
  `;
}

function convertEMISheetTemplate(tx) {
  if (!tx) return "";
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="emi-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="emi-title">Convert To EMI</h2>
          <button type="submit" form="emi-form" class="toolbar-button confirm">Save</button>
        </header>
        <form id="emi-form" class="form-list">
          <div class="card plain-card">
            <h2>${escapeHTML(tx.title || "Purchase")}</h2>
            <p>${INR.format(netAmount(tx))}</p>
          </div>
          <label class="form-row">
            <span>Monthly EMI</span>
            <input name="monthlyEMI" type="number" inputmode="decimal" min="0.01" step="0.01" required>
          </label>
          <label class="form-row">
            <span>Tenure</span>
            <input name="tenureMonths" type="number" inputmode="numeric" min="2" max="60" required value="12">
          </label>
          <label class="form-row">
            <span>First Date</span>
            <input name="firstInstallmentDate" type="date" required value="${escapeAttr(dateInputValue(nextMonth))}">
          </label>
        </form>
      </section>
    </div>
  `;
}

function editEMISheetTemplate(plan) {
  if (!plan) return "";
  const data = state.data || emptyData();
  const tx = data.transactions.find((item) => item.id === plan.transactionID);
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="edit-emi-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="edit-emi-title">Edit EMI</h2>
          <button type="submit" form="edit-emi-form" class="toolbar-button confirm">Save</button>
        </header>
        <form id="edit-emi-form" class="form-list">
          <div class="card plain-card">
            <h2>${escapeHTML(tx?.title || "EMI Purchase")}</h2>
            <p>${INR.format(Number(plan.principalAmount || 0))}</p>
          </div>
          <label class="form-row">
            <span>Monthly EMI</span>
            <input name="monthlyEMI" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${escapeAttr(plan.monthlyEMI || "")}">
          </label>
          <label class="form-row">
            <span>Tenure</span>
            <input name="tenureMonths" type="number" inputmode="numeric" min="2" max="60" required value="${escapeAttr(plan.tenureMonths || 12)}">
          </label>
          <label class="form-row">
            <span>First Date</span>
            <input name="firstInstallmentDate" type="date" required value="${escapeAttr(dateInputValue(plan.firstInstallmentDate))}">
          </label>
          <div class="form-row readonly-row">
            <span>Last Installment</span>
            <strong data-emi-last-date>${formatDate(lastInstallmentDate(plan))}</strong>
          </div>
        </form>
      </section>
    </div>
  `;
}

function budgetEditorSheetTemplate(budget) {
  const data = state.data || emptyData();
  const isEdit = Boolean(budget);
  const selectedCategory = budget?.category || data.categories[0] || "General";
  const monthValue = budget ? monthInputValue(budget.month) : state.budgetMonth;
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="budget-editor-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="budget-editor-title">${isEdit ? "Edit Budget" : "Create Budget"}</h2>
          <button type="submit" form="budget-editor-form" class="toolbar-button confirm">Save</button>
        </header>
        <form id="budget-editor-form" class="form-list">
          <label class="form-row">
            <span>Month</span>
            <input name="month" type="month" required value="${escapeAttr(monthValue)}">
          </label>
          <label class="form-row">
            <span>Category</span>
            <select name="category">
              ${data.categories.map((category) => `<option value="${escapeAttr(category)}" ${selectedCategory === category ? "selected" : ""}>${escapeHTML(category)}</option>`).join("")}
            </select>
          </label>
          <label class="form-row">
            <span>Monthly Limit</span>
            <input name="monthlyLimit" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${escapeAttr(budget?.monthlyLimit || "")}">
          </label>
        </form>
      </section>
    </div>
  `;
}

function pdfViewerTemplate() {
  return `
    <section class="panel-screen pdf-screen" role="dialog" aria-modal="true" aria-labelledby="pdf-title">
      <header class="panel-nav">
        <button type="button" class="back-button" data-action="close-pdf">‹ Statements</button>
        <h2 id="pdf-title">${escapeHTML(state.pdfTitle || "Statement")}</h2>
        <button type="button" class="toolbar-button confirm" data-action="download-active-pdf">Open</button>
      </header>
      <div class="pdf-frame-wrap">
        <iframe class="pdf-frame" src="${escapeAttr(state.pdfURL)}" title="${escapeAttr(state.pdfTitle || "Statement PDF")}"></iframe>
      </div>
    </section>
  `;
}

function statementPaymentsTemplate(statement) {
  if (!statement) return "";
  const data = state.data || emptyData();
  const status = statementStatus(statement, data.payments);
  const payments = data.payments
    .filter((payment) => payment.statementID === statement.id)
    .sort((a, b) => new Date(b.paidDate) - new Date(a.paidDate));
  return `
    <section class="panel-screen payment-screen" role="dialog" aria-modal="true" aria-labelledby="payments-title">
      <header class="panel-nav">
        <button type="button" class="back-button" data-action="close-payment-panel">‹ Statements</button>
        <h2 id="payments-title">Payment History</h2>
        <span></span>
      </header>
      <div class="panel-content">
        <section class="card">
          <div class="section-title">
            <h2>${escapeHTML(statement.cardType || "Statement")}</h2>
            <span>${status.label}</span>
          </div>
          <div class="count-grid">
            ${countPill("Total Due", INR.format(Number(statement.totalDue || 0)))}
            ${countPill("Paid", INR.format(status.paid))}
            ${countPill("Balance", INR.format(status.outstanding))}
            ${countPill("Minimum", INR.format(Number(statement.minimumDue || 0)))}
          </div>
        </section>

        <section class="card filter-card">
          <div class="section-title">
            <h2>Add Payment</h2>
          </div>
          <form id="add-payment-form" class="embedded-form">
            <label class="form-row compact">
              <span>Amount</span>
              <input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required>
            </label>
            <label class="form-row compact">
              <span>Paid Date</span>
              <input name="paidDate" type="date" required value="${escapeAttr(dateInputValue(new Date()))}">
            </label>
            <label class="form-row compact">
              <span>Notes</span>
              <input name="notes" type="text" autocomplete="off">
            </label>
            <button class="primary-button" type="submit">Save Payment</button>
          </form>
        </section>

        <div class="list-card">
          ${payments.length ? payments.map(paymentRowTemplate).join("") : `<p class="list-empty">No payments recorded yet</p>`}
        </div>
      </div>
    </section>
  `;
}

function statementCSVImportSheetTemplate() {
  const statement = state.modalPayload;
  if (!statement) return "";
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet small-sheet" role="dialog" aria-modal="true" aria-labelledby="statement-csv-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="statement-csv-title">Import CSV</h2>
          <button type="submit" form="statement-csv-form" class="toolbar-button confirm">Import</button>
        </header>
        <form id="statement-csv-form" class="form-list">
          <div class="card plain-card">
            <h2>${escapeHTML(statement.cardType || "Statement")}</h2>
            <p>${formatDate(statement.statementMonth || statement.dueDate)}</p>
          </div>
          <label class="form-row file-row">
            <span>CSV File</span>
            <input name="statementCSV" type="file" accept=".csv,text/csv" required>
          </label>
          <p class="form-hint">Rows are attached to this statement and card. Required columns: Description, Amount, Purchase Date. Matching rows are skipped if imported again.</p>
        </form>
      </section>
    </div>
  `;
}

function paymentRowTemplate(payment) {
  return `
    <article class="record-row swipe-row" data-swipe-leading="payment:edit:${escapeAttr(payment.id)}" data-swipe-trailing="payment:delete:${escapeAttr(payment.id)}">
      <div class="record-main">
        <div class="record-title-line">
          <strong>${formatDate(payment.paidDate)}</strong>
          <b>${INR.format(Number(payment.amount || 0))}</b>
        </div>
        ${payment.notes ? `<span>${escapeHTML(payment.notes)}</span>` : `<span>No notes</span>`}
        <div class="row-actions">
          <button type="button" data-payment-action="edit" data-id="${escapeAttr(payment.id)}">Edit</button>
          <button type="button" class="danger-text" data-payment-action="delete" data-id="${escapeAttr(payment.id)}">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function paymentEditorSheetTemplate(payment) {
  if (!payment) return "";
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet small-sheet" role="dialog" aria-modal="true" aria-labelledby="payment-editor-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="payment-editor-title">Edit Payment</h2>
          <button type="submit" form="payment-editor-form" class="toolbar-button confirm">Save</button>
        </header>
        <form id="payment-editor-form" class="form-list">
          <label class="form-row">
            <span>Amount</span>
            <input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${escapeAttr(payment.amount || "")}">
          </label>
          <label class="form-row">
            <span>Paid Date</span>
            <input name="paidDate" type="date" required value="${escapeAttr(dateInputValue(payment.paidDate))}">
          </label>
          <label class="form-row">
            <span>Notes</span>
            <input name="notes" type="text" autocomplete="off" value="${escapeAttr(payment.notes || "")}">
          </label>
        </form>
      </section>
    </div>
  `;
}

function backupPanelTemplate() {
  const data = state.data || emptyData();
  const counts = state.counts || {};
  const storage = state.storageHealth || {};
  const integrity = migrationIntegrityReport(data);
  const health = backupHealth(counts.lastBackupAt, 7);
  const hasData = Boolean(counts.cards || counts.transactions || counts.statements || counts.statementFiles);
  return `
    <article class="card backup-card ${health.status}">
      <div class="card-leading-icon">${healthIcon(health.status)}</div>
      <div>
        <h2>${health.title}</h2>
        <p>${counts.hasUnexportedChanges ? "You have local changes that are not exported yet." : health.detail}</p>
      </div>
    </article>

    ${counts.hasUnexportedChanges ? `
      <section class="card warning-card">
        <h2>Backup Needed</h2>
        <p>Safari storage can be cleared by browser data cleanup or PWA removal. Export a full backup after important changes.</p>
      </section>
    ` : ""}

    <section class="card">
      <div class="section-title">
        <h2>Backup Status</h2>
        <span>7 days</span>
      </div>
      <div class="count-grid">
        ${countPill("Last Export", counts.lastExportedAt ? formatDate(counts.lastExportedAt) : "Never")}
        ${countPill("Last Import", counts.lastImportedAt ? formatDate(counts.lastImportedAt) : "Never")}
        ${countPill("PDFs", counts.statementFiles || 0)}
        ${countPill("Records", (counts.cards || 0) + (counts.transactions || 0) + (counts.statements || 0) + (counts.payments || 0))}
      </div>
      ${counts.lastExportFileName ? `<p class="panel-note">${escapeHTML(counts.lastExportFileName)}</p>` : ""}
    </section>

    <section class="card">
      <div class="section-title">
        <h2>Storage Health</h2>
        <span>${escapeHTML(storage.persistedLabel || "Checking")}</span>
      </div>
      <div class="count-grid">
        ${countPill("App Data", storage.backupSizeLabel || "Unknown")}
        ${countPill("Browser Used", storage.usageLabel || "Unavailable")}
        ${countPill("Browser Limit", storage.quotaLabel || "Unavailable")}
        ${countPill("Last Change", counts.updatedAt ? formatDate(counts.updatedAt) : "Never")}
      </div>
      ${storage.usagePercent !== null && storage.usagePercent !== undefined ? `
        <div class="storage-meter" aria-label="Browser storage used">
          <i style="width:${Math.min(100, Math.max(0, storage.usagePercent))}%"></i>
        </div>
      ` : ""}
      <p class="panel-note">${escapeHTML(storage.message || "Storage details are available only when the browser exposes them.")}</p>
      ${storage.canRequestPersistence ? `<button class="secondary-button" type="button" data-action="request-persistent-storage">Request Persistent Storage</button>` : ""}
    </section>

    <section class="card integrity-card ${integrity.issueCount ? "warning-card" : ""}">
      <div class="section-title">
        <h2>Migration Check</h2>
        <span>${integrity.issueCount ? `${integrity.issueCount} issue${integrity.issueCount === 1 ? "" : "s"}` : "Clean"}</span>
      </div>
      <div class="count-grid">
        ${countPill("Checked", integrity.checked)}
        ${countPill("Issues", integrity.issueCount)}
        ${countPill("Duplicates", integrity.duplicates)}
        ${countPill("Files", integrity.fileStatus)}
      </div>
      ${integrity.issues.length ? `
        <div class="integrity-list">
          ${integrity.issues.map((issue) => `<p>${escapeHTML(issue)}</p>`).join("")}
        </div>
      ` : `<p class="panel-note">Cards, transactions, statements, payments, EMI plans, and stored files look linked correctly.</p>`}
    </section>

    <section class="card action-card">
      <button class="primary-button" type="button" data-action="choose-backup">Import Full Backup</button>
      <button class="secondary-button" type="button" data-action="export-backup" ${hasData ? "" : "disabled"}>Export Full Backup</button>
      <input id="backup-file" type="file" accept="application/json,.json" hidden>
    </section>

    <section class="card danger-card">
      <div class="section-title">
        <h2>Local Data</h2>
        <span>Device only</span>
      </div>
      <p>Reset removes the PWA's local IndexedDB data on this browser. Your exported JSON backup files are not touched.</p>
      <button class="destructive-button" type="button" data-action="reset-local-data" ${hasData ? "" : "disabled"}>Reset Local Data</button>
    </section>
  `;
}

function resetDataSheetTemplate() {
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="bottom-sheet small-sheet" role="dialog" aria-modal="true" aria-labelledby="reset-title" data-sheet>
        <header class="sheet-toolbar">
          <button type="button" class="toolbar-button" data-action="close-modal">Cancel</button>
          <h2 id="reset-title">Reset Data</h2>
          <button type="submit" form="reset-data-form" class="toolbar-button confirm danger-confirm">Reset</button>
        </header>
        <form id="reset-data-form" class="form-list">
          <div class="card plain-card danger-card">
            <h2>Delete local PWA data?</h2>
            <p>This clears cards, transactions, statements, payments, budgets, EMIs, categories, and stored PDFs from this browser.</p>
          </div>
          <label class="form-row">
            <span>Type RESET</span>
            <input name="confirmText" type="text" autocomplete="off" required>
          </label>
        </form>
      </section>
    </div>
  `;
}

function panelSummary(title, rows, note) {
  return `
    <section class="card">
      <div class="section-title">
        <h2>${title}</h2>
        <span>Ready</span>
      </div>
      <div class="count-grid">
        ${rows.map(([label, value]) => countPill(label, value)).join("")}
      </div>
      <p class="panel-note">${note}</p>
    </section>
  `;
}

function tabButton(tab, icon, label) {
  return `
    <button class="tab-button ${state.tab === tab ? "active" : ""}" type="button" data-tab="${tab}">
      <span>${iconGlyph(icon)}</span>
      <span>${label}</span>
    </button>
  `;
}

function bindEvents() {
  app.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      state.destination = null;
      render();
    });
  });

  app.querySelectorAll("[data-destination]").forEach((button) => {
    button.addEventListener("click", () => {
      state.destination = button.dataset.destination;
      history.pushState({ kuber: true }, "", location.href);
      render();
    });
  });

  app.querySelector("[data-control='selected-month']")?.addEventListener("change", (event) => {
    state.selectedMonth = event.target.value || monthInputValue(new Date());
    render();
  });

  app.querySelector("[data-action='month-prev']")?.addEventListener("click", () => {
    shiftSelectedMonth(-1);
  });

  app.querySelector("[data-action='month-next']")?.addEventListener("click", () => {
    shiftSelectedMonth(1);
  });

  app.querySelector("[data-action='open-month-picker']")?.addEventListener("click", () => {
    state.modal = "monthPicker";
    history.pushState({ kuber: true }, "", location.href);
    render();
  });

  app.querySelector("[data-action='open-card-picker']")?.addEventListener("click", () => {
    state.modal = "cardPicker";
    history.pushState({ kuber: true }, "", location.href);
    render();
  });

  attachSwipe(app.querySelector("[data-month-swipe]"), {
    left: () => shiftSelectedMonth(1),
    right: () => shiftSelectedMonth(-1)
  });

  app.querySelectorAll("[data-card-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCardID = button.dataset.cardFilter || "";
      render();
    });
  });

  app.querySelectorAll("[data-month-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedMonth = button.dataset.monthChoice;
      state.modal = null;
      render();
    });
  });

  app.querySelectorAll("[data-card-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCardID = button.dataset.cardChoice || "";
      state.modal = null;
      render();
    });
  });

  app.querySelectorAll("[data-dashboard-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      state.modal = "dashboardDetail";
      state.modalPayload = dashboardDetailPayload(button.dataset.dashboardDetail);
      history.pushState({ kuber: true }, "", location.href);
      render();
    });
  });

  app.querySelectorAll("[data-category-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      state.modal = "dashboardDetail";
      state.modalPayload = dashboardCategoryDetailPayload(button.dataset.categoryDetail);
      history.pushState({ kuber: true }, "", location.href);
      render();
    });
  });

  app.querySelectorAll("[data-allocation-horizon]").forEach((button) => {
    button.addEventListener("click", () => {
      state.allocationHorizon = button.dataset.allocationHorizon;
      render();
    });
  });

  app.querySelectorAll("[data-series-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const set = button.dataset.seriesToggle === "payable" ? state.hiddenPayableSeries : state.hiddenSpendingSeries;
      if (set.has(button.dataset.id)) set.delete(button.dataset.id);
      else set.add(button.dataset.id);
      render();
    });
  });

  app.querySelector("[data-control='transaction-search']")?.addEventListener("input", (event) => {
    state.transactionSearch = event.target.value;
    render();
  });

  app.querySelector("[data-control='transaction-card']")?.addEventListener("change", (event) => {
    state.transactionCardID = event.target.value;
    render();
  });

  app.querySelector("[data-control='transaction-category']")?.addEventListener("change", (event) => {
    state.transactionCategory = event.target.value || "All";
    render();
  });

  app.querySelector("[data-control='transaction-filter-month']")?.addEventListener("change", (event) => {
    state.transactionFilterByMonth = event.target.checked;
    render();
  });

  app.querySelector("[data-control='transaction-month']")?.addEventListener("change", (event) => {
    state.transactionMonth = event.target.value || monthInputValue(new Date());
    render();
  });

  app.querySelector("[data-control='transaction-filter-range']")?.addEventListener("change", (event) => {
    state.transactionFilterByRange = event.target.checked;
    render();
  });

  app.querySelector("[data-control='transaction-date-from']")?.addEventListener("change", (event) => {
    state.transactionDateFrom = event.target.value || dateInputValue(addDays(new Date(), -30));
    render();
  });

  app.querySelector("[data-control='transaction-date-to']")?.addEventListener("change", (event) => {
    state.transactionDateTo = event.target.value || dateInputValue(new Date());
    render();
  });

  app.querySelectorAll("[data-statement-card]").forEach((button) => {
    button.addEventListener("click", () => {
      state.statementCardID = button.dataset.statementCard || "";
      render();
    });
  });

  app.querySelectorAll("[data-transaction-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleTransactionAction(button.dataset.transactionAction, button.dataset.id);
    });
  });

  app.querySelectorAll("[data-statement-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleStatementAction(button.dataset.statementAction, button.dataset.id);
    });
  });

  app.querySelectorAll("[data-payment-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handlePaymentAction(button.dataset.paymentAction, button.dataset.id);
    });
  });

  app.querySelectorAll("[data-emi-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleEMIAction(button.dataset.emiAction, button.dataset.id);
    });
  });

  app.querySelector("[data-control='budget-month']")?.addEventListener("change", (event) => {
    state.budgetMonth = event.target.value || monthInputValue(new Date());
    render();
  });

  app.querySelector("[data-control='budget-card']")?.addEventListener("change", (event) => {
    state.budgetCardID = event.target.value;
    render();
  });

  app.querySelectorAll("[data-budget-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleBudgetAction(button.dataset.budgetAction, button.dataset.id);
    });
  });

  app.querySelector("[data-control='analysis-fy']")?.addEventListener("change", (event) => {
    state.analysisFYStartYear = Number(event.target.value) || financialYearStartYear(new Date());
    render();
  });

  app.querySelector("[data-control='analysis-category']")?.addEventListener("change", (event) => {
    state.analysisCategory = event.target.value || "General";
    render();
  });

  app.querySelectorAll("[data-wish-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleWishAction(button.dataset.wishAction, button.dataset.id);
    });
  });

  app.querySelectorAll("[data-settings-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleSettingsAction(button.dataset.settingsAction, button.dataset.id);
    });
  });

  app.querySelectorAll("[data-settings-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.settingsToggle;
      state.settingsExpanded[key] = !state.settingsExpanded[key];
      render();
    });
  });

  app.querySelectorAll("[data-swipe-leading], [data-swipe-trailing]").forEach((row) => attachRowGestures(row));
  app.querySelectorAll("[data-sheet]").forEach((sheet) => attachSheetDismiss(sheet));

  app.querySelectorAll("[data-action='close-destination']").forEach((button) => {
    button.addEventListener("click", () => {
      state.destination = null;
      render();
    });
  });

  app.querySelectorAll("[data-action='choose-backup']").forEach((button) => {
    button.addEventListener("click", () => app.querySelector("#backup-file")?.click());
  });

  app.querySelector("[data-action='download-template']")?.addEventListener("click", () => {
    downloadTextFile("kuber-backfill-template.csv", buildBackfillTemplateCSV(), "text/csv");
    state.importStatus = "Backfill CSV template downloaded.";
    render();
  });

  app.querySelector("[data-action='choose-backfill-csv']")?.addEventListener("click", () => {
    app.querySelector("#backfill-csv-file")?.click();
  });

  app.querySelector("#backfill-csv-file")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await runBusy(async () => {
      const summary = await importBackfillCSVFile(file);
      state.importStatus = importSummaryText("backfill", summary);
      await refreshState();
    });
    render();
  });

  app.querySelector("#backup-file")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const counts = state.counts || {};
    const hasExistingData = Boolean(counts.cards || counts.transactions || counts.statements || counts.statementFiles);
    if (hasExistingData) {
      state.modal = "confirm";
      state.modalPayload = {
        title: "Import Full Backup?",
        message: "Importing a full backup will replace the local PWA data currently stored in this browser.",
        confirmLabel: "Import",
        onConfirm: async () => {
          const summary = await importFullBackupFile(file);
          state.importStatus = `Imported ${summary.cards} cards, ${summary.transactions} transactions, ${summary.statements} statements, and ${summary.statementFiles} PDFs.`;
        }
      };
      render();
      return;
    }
    await runBusy(async () => {
      const summary = await importFullBackupFile(file);
      state.importStatus = `Imported ${summary.cards} cards, ${summary.transactions} transactions, ${summary.statements} statements, and ${summary.statementFiles} PDFs.`;
      await refreshState();
    });
    render();
  });

  app.querySelector("[data-action='reset-local-data']")?.addEventListener("click", () => {
    state.modal = "resetData";
    history.pushState({ kuber: true }, "", location.href);
    render();
  });

  app.querySelector("[data-action='request-persistent-storage']")?.addEventListener("click", async () => {
    await runBusy(async () => {
      if (!navigator.storage?.persist) {
        state.importStatus = "This browser does not support persistent-storage requests.";
        return;
      }
      const granted = await navigator.storage.persist();
      state.importStatus = granted
        ? "Persistent storage accepted by this browser."
        : "Persistent storage was not granted. Continue using full backup exports.";
      await refreshState();
    });
    render();
  });

  app.querySelector("[data-action='check-app-update']")?.addEventListener("click", async () => {
    await runBusy(async () => {
      if (!navigator.serviceWorker) {
        state.importStatus = "Service worker updates are not available in this browser.";
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration("./");
      if (!registration) {
        state.importStatus = "Offline cache is not registered yet. Reload the app once.";
        return;
      }
      await registration.update();
      state.runtimeHealth = runtimeHealthSnapshot();
      state.importStatus = "Checked for app updates. Reload if Safari keeps showing an old screen.";
    });
    render();
  });

  app.querySelector("[data-action='export-backup']")?.addEventListener("click", async () => {
    await runBusy(async () => {
      const exportedAt = await downloadFullBackup();
      state.importStatus = `Full backup exported on ${formatDate(exportedAt)}.`;
      await refreshState();
    });
    render();
  });

  app.querySelector("[data-action='add-purchase']")?.addEventListener("click", () => {
    state.modal = "addPurchase";
    history.pushState({ kuber: true }, "", location.href);
    render();
  });

  app.querySelector("[data-action='add-inline-category']")?.addEventListener("click", async () => {
    const form = app.querySelector("#add-purchase-form");
    const input = form?.querySelector("[name='newCategory']");
    const clean = String(input?.value || "").trim();
    if (!clean) return;
    state.addPurchaseDraft = addPurchaseDraftFromForm(form);
    await runBusy(async () => {
      await addCategoryIfMissing(clean);
      await refreshState();
      state.importStatus = "Category added.";
    });
    state.addPurchaseDraft.category = clean;
    state.modal = "addPurchase";
    render();
  });

  app.querySelector("#add-purchase-form")?.addEventListener("input", (event) => {
    state.addPurchaseDraft = addPurchaseDraftFromForm(event.currentTarget);
    updateSaveButtonState("#add-purchase-form");
  });
  updateSaveButtonState("#add-purchase-form");

  app.querySelectorAll("[data-action='close-modal']").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target.closest("[data-sheet]") && !event.target.matches("[data-action='close-modal']")) return;
      if (state.modal === "addPurchase") state.addPurchaseDraft = {};
      state.modal = null;
      state.modalPayload = null;
      render();
    });
  });

  app.querySelector("[data-action='confirm-modal']")?.addEventListener("click", async () => {
    const action = state.modalPayload?.onConfirm;
    if (typeof action !== "function") return;
    await runBusy(async () => {
      await action();
      await refreshState();
      if (state.modal === "confirm") {
        state.modal = null;
        state.modalPayload = null;
      }
    });
    render();
  });

  app.querySelector("#add-purchase-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runBusy(async () => {
      await addPurchase({
        title: form.get("title"),
        category: form.get("category"),
        amount: form.get("amount"),
        date: form.get("date"),
        cardID: form.get("cardID"),
        notes: form.get("notes")
      });
      state.modal = null;
      state.addPurchaseDraft = {};
      state.importStatus = "Purchase saved. Export a backup when you are done updating data.";
      await refreshState();
    });
    render();
  });

  app.querySelector("#edit-transaction-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runBusy(async () => {
      await saveTransactionEdit(state.modalPayload?.id, form);
      state.modal = null;
      state.modalPayload = null;
      state.importStatus = "Transaction updated. Export a backup when you are done updating data.";
      await refreshState();
    });
    render();
  });

  app.querySelector("#refund-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runBusy(async () => {
      await updateRecord("transactions", state.modalPayload?.id, {
        refundedAmount: Math.max(0, Number(form.get("refundedAmount") || 0))
      });
      state.modal = null;
      state.modalPayload = null;
      state.importStatus = "Refund updated. Export a backup when you are done updating data.";
      await refreshState();
    });
    render();
  });

  app.querySelector("#emi-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runBusy(async () => {
      await convertTransactionToEMI(state.modalPayload, form);
      state.modal = null;
      state.modalPayload = null;
      state.importStatus = "EMI plan created. Export a backup when you are done updating data.";
      await refreshState();
    });
    render();
  });

  app.querySelector("#edit-emi-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runBusy(async () => {
      await saveEMIEdit(state.modalPayload?.id, form);
      state.modal = null;
      state.modalPayload = null;
      state.importStatus = "EMI plan updated. Export a backup when you are done updating data.";
      await refreshState();
    });
    render();
  });

  app.querySelector("#edit-emi-form")?.addEventListener("input", () => {
    updateEMILastDatePreview();
  });

  app.querySelector("#budget-editor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runBusy(async () => {
      await saveBudget(state.modalPayload?.id, form);
      state.modal = null;
      state.modalPayload = null;
      state.importStatus = "Budget saved. Export a backup when you are done updating data.";
      await refreshState();
    });
    render();
  });

  app.querySelector("#add-payment-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runBusy(async () => {
      await addStatementPayment(state.modalPayload?.id, form);
      const statementID = state.modalPayload?.id;
      await refreshState();
      state.modalPayload = state.data.statements.find((statement) => statement.id === statementID) || null;
      state.importStatus = "Payment saved. Export a backup when you are done updating data.";
    });
    render();
  });

  app.querySelector("#payment-editor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runBusy(async () => {
      const statementID = state.modalPayload?.statementID;
      await savePaymentEdit(state.modalPayload?.id, form);
      await refreshState();
      state.modal = "statementPayments";
      state.modalPayload = state.data.statements.find((statement) => statement.id === statementID) || null;
      state.importStatus = "Payment updated. Export a backup when you are done updating data.";
    });
    render();
  });

  app.querySelector("#statement-editor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runBusy(async () => {
      await saveStatement(state.modalPayload?.id, form);
      state.modal = null;
      state.modalPayload = null;
      state.importStatus = "Statement saved. Export a backup when you are done updating data.";
      await refreshState();
    });
    render();
  });

  app.querySelector("#statement-csv-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("statementCSV");
    if (!(file instanceof File) || !file.name) return;
    await runBusy(async () => {
      const statementID = state.modalPayload?.id;
      const summary = await importStatementCSVFile(state.modalPayload, file);
      await refreshState();
      state.modal = "statementPayments";
      state.modalPayload = state.data.statements.find((statement) => statement.id === statementID) || null;
      state.importStatus = importSummaryText("statement", summary);
    });
    render();
  });

  app.querySelector("#reset-data-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (String(form.get("confirmText") || "").trim() !== "RESET") {
      state.importStatus = "Reset cancelled. Confirmation text did not match.";
      state.modal = null;
      render();
      return;
    }
    await runBusy(async () => {
      await clearAllData();
      state.modal = null;
      state.modalPayload = null;
      state.destination = null;
      state.importStatus = "Local PWA data reset. Import a backup to restore.";
      await refreshState();
    });
    render();
  });

  app.querySelector("[data-action='close-payment-panel']")?.addEventListener("click", () => {
    state.modal = null;
    state.modalPayload = null;
    render();
  });

  app.querySelector("#card-editor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runBusy(async () => {
      await saveCard(state.modalPayload?.id, form);
      state.modal = null;
      state.modalPayload = null;
      state.importStatus = "Card saved. Export a backup when you are done updating data.";
      await refreshState();
    });
    render();
  });

  app.querySelector("#category-editor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runBusy(async () => {
      await saveCategory(state.modalPayload, form);
      state.modal = null;
      state.modalPayload = null;
      state.importStatus = "Category saved. Export a backup when you are done updating data.";
      await refreshState();
    });
    render();
  });

  app.querySelector("#wish-editor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runBusy(async () => {
      await saveWish(state.modalPayload?.id, form);
      state.modal = null;
      state.modalPayload = null;
      state.importStatus = "Wishlist item saved. Export a backup when you are done updating data.";
      await refreshState();
    });
    render();
  });

  app.querySelector("[data-action='close-pdf']")?.addEventListener("click", () => {
    closePDF();
    render();
  });

  app.querySelector("[data-action='download-active-pdf']")?.addEventListener("click", () => {
    if (!state.pdfURL) return;
    open(state.pdfURL, "_blank", "noopener");
  });
}

async function handleWishAction(action, id) {
  const data = state.data || emptyData();
  const item = data.wishlist.find((wish) => wish.id === id);

  if (action === "add") {
    state.modal = "wishEditor";
    state.modalPayload = null;
    render();
    return;
  }

  if (!item) return;

  if (action === "edit") {
    state.modal = "wishEditor";
    state.modalPayload = item;
    render();
    return;
  }

  if (action === "delete") {
    showConfirmation({
      title: "Delete Wish?",
      message: `Delete "${item.title || "this wishlist item"}"?`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        await deleteRecord("wishlist", item.id);
        state.importStatus = "Wishlist item deleted. Export a backup when you are done updating data.";
      }
    });
  }
}

async function handleSettingsAction(action, id) {
  const data = state.data || emptyData();

  if (action === "add-card") {
    state.modal = "cardEditor";
    state.modalPayload = null;
    render();
    return;
  }

  if (action === "edit-card") {
    const card = data.cards.find((item) => item.id === id);
    if (!card) return;
    state.modal = "cardEditor";
    state.modalPayload = card;
    render();
    return;
  }

  if (action === "delete-card") {
    await deleteCard(id);
    return;
  }

  if (action === "quick-add-category") {
    const clean = String(app.querySelector("[data-control='settings-new-category']")?.value || "").trim();
    if (!clean) return;
    await runBusy(async () => {
      await addCategoryIfMissing(clean);
      state.importStatus = "Category added. Export a backup when you are done updating data.";
      await refreshState();
    });
    render();
    return;
  }

  if (action === "add-category") {
    state.modal = "categoryEditor";
    state.modalPayload = null;
    render();
    return;
  }

  if (action === "edit-category") {
    state.modal = "categoryEditor";
    state.modalPayload = id;
    render();
    return;
  }

  if (action === "delete-category") {
    await deleteCategory(id);
  }
}

async function handleEMIAction(action, id) {
  const data = state.data || emptyData();
  const plan = data.emis.find((item) => item.id === id);
  if (!plan) return;

  if (action === "edit") {
    state.modal = "editEMI";
    state.modalPayload = plan;
    render();
    return;
  }

  if (action === "revert") {
    showConfirmation({
      title: "Revert EMI?",
      message: "This will remove EMI conversion and mark the original transaction as one-time purchase.",
      confirmLabel: "Revert",
      onConfirm: async () => {
        await deleteRecord("emis", plan.id);
        await updateRecord("transactions", plan.transactionID, (current) => {
          const { emiID, ...rest } = current;
          return rest;
        });
        state.importStatus = "EMI reverted. Export a backup when you are done updating data.";
      }
    });
  }
}

async function handleBudgetAction(action, id) {
  const data = state.data || emptyData();
  const budget = data.budgets.find((item) => item.id === id);

  if (action === "add") {
    state.modal = "budgetEditor";
    state.modalPayload = null;
    render();
    return;
  }

  if (action === "copy-previous") {
    await copyPreviousBudgets();
    return;
  }

  if (action === "forecast") {
    state.modal = "budgetForecast";
    render();
    return;
  }

  if (action === "apply-forecast") {
    await applyForecastBudgets();
    return;
  }

  if (!budget) return;

  if (action === "edit") {
    state.modal = "budgetEditor";
    state.modalPayload = budget;
    render();
    return;
  }

  if (action === "delete") {
    showConfirmation({
      title: "Delete Budget?",
      message: `Delete ${budget.category || "this"} budget?`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        await deleteRecord("budgets", budget.id);
        state.importStatus = "Budget deleted. Export a backup when you are done updating data.";
      }
    });
  }
}

async function handleTransactionAction(action, id) {
  const tx = (state.data || emptyData()).transactions.find((item) => item.id === id);
  if (!tx) return;

  if (action === "edit") {
    state.modal = "editTransaction";
    state.modalPayload = tx;
    render();
    return;
  }

  if (action === "refund") {
    state.modal = "refundTransaction";
    state.modalPayload = tx;
    render();
    return;
  }

  if (action === "emi") {
    state.modal = "convertEMI";
    state.modalPayload = tx;
    render();
    return;
  }

  if (action === "revert") {
    showConfirmation({
      title: "Revert EMI?",
      message: `This will remove EMI conversion for "${tx.title || "this purchase"}" and treat it as one-time purchase.`,
      confirmLabel: "Revert",
      onConfirm: async () => {
        if (tx.emiID) await deleteRecord("emis", tx.emiID);
        await updateRecord("transactions", tx.id, (current) => {
          const { emiID, ...rest } = current;
          return rest;
        });
        state.importStatus = "EMI reverted. Export a backup when you are done updating data.";
      }
    });
    return;
  }

  if (action === "delete") {
    showConfirmation({
      title: "Delete Transaction?",
      message: tx.emiID
        ? `Delete "${tx.title || "this transaction"}"? Linked EMI will also be removed.`
        : `Delete "${tx.title || "this transaction"}"?`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        if (tx.emiID) await deleteRecord("emis", tx.emiID);
        await deleteRecord("transactions", tx.id);
        state.importStatus = "Transaction deleted. Export a backup when you are done updating data.";
      }
    });
  }
}

async function handleStatementAction(action, id) {
  const data = state.data || emptyData();
  if (action === "add") {
    state.modal = "statementEditor";
    state.modalPayload = null;
    render();
    return;
  }
  const statement = data.statements.find((item) => item.id === id);
  if (!statement) return;
  if (action === "payments") {
    state.modal = "statementPayments";
    state.modalPayload = statement;
    render();
    return;
  }
  if (action === "import-csv") {
    state.modal = "statementCSVImport";
    state.modalPayload = statement;
    render();
    return;
  }
  if (action === "edit") {
    state.modal = "statementEditor";
    state.modalPayload = statement;
    render();
    return;
  }
  if (action === "delete") {
    showConfirmation({
      title: "Delete Statement?",
      message: "Related payments and its stored statement file will also be removed.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        await deleteStatement(statement.id);
        state.importStatus = "Statement deleted. Export a backup when you are done updating data.";
      }
    });
    return;
  }
  const file = data.statementFiles.find((candidate) => candidate.id === (statement.storedFileName || statement.fileName));
  if (!file) return;
  const url = objectURLForStatementFile(file);

  if (action === "view") {
    if (state.pdfURL) URL.revokeObjectURL(state.pdfURL);
    state.pdfURL = url;
    state.pdfTitle = statement.fileName || "Statement";
    state.modal = "pdfViewer";
    render();
    return;
  }

  if (action === "download") {
    downloadURL(url, statement.fileName || file.fileName || "statement.pdf");
  }
}

async function handlePaymentAction(action, id) {
  const data = state.data || emptyData();
  const payment = data.payments.find((item) => item.id === id);
  if (!payment) return;

  if (action === "edit") {
    state.modal = "paymentEditor";
    state.modalPayload = payment;
    render();
    return;
  }

  if (action === "delete") {
    showConfirmation({
      title: "Delete Payment?",
      message: `Delete payment of ${INR.format(Number(payment.amount || 0))}?`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const statementID = payment.statementID;
        await deleteRecord("payments", payment.id);
        await refreshState();
        state.modal = "statementPayments";
        state.modalPayload = state.data.statements.find((statement) => statement.id === statementID) || null;
        state.importStatus = "Payment deleted. Export a backup when you are done updating data.";
      }
    });
  }
}

async function saveTransactionEdit(id, form) {
  if (!id) throw new Error("Missing transaction.");
  const data = state.data || emptyData();
  const card = data.cards.find((candidate) => candidate.id === form.get("cardID"));
  if (!card) throw new Error("Choose a valid card.");
  const title = String(form.get("title") || "").trim();
  const amount = Number(form.get("amount"));
  if (!title) throw new Error("Description is required.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount.");

  await updateRecord("transactions", id, (current) => ({
    ...current,
    title,
    category: String(form.get("category") || "General"),
    amount,
    date: new Date(`${form.get("date")}T00:00:00`).toISOString(),
    cardID: card.id,
    cardType: displayCard(card),
    notes: String(form.get("notes") || "").trim()
  }));
}

async function convertTransactionToEMI(tx, form) {
  if (!tx) throw new Error("Missing transaction.");
  const monthlyEMI = Number(form.get("monthlyEMI"));
  const tenureMonths = Number.parseInt(form.get("tenureMonths"), 10);
  const firstInstallmentDate = new Date(`${form.get("firstInstallmentDate")}T00:00:00`).toISOString();
  if (!Number.isFinite(monthlyEMI) || monthlyEMI <= 0) throw new Error("Enter a valid EMI amount.");
  if (!Number.isFinite(tenureMonths) || tenureMonths < 2) throw new Error("Enter a valid tenure.");

  const plan = {
    id: crypto.randomUUID(),
    transactionID: tx.id,
    cardID: tx.cardID || null,
    cardType: tx.cardType || "Card",
    principalAmount: netAmount(tx),
    monthlyEMI,
    tenureMonths,
    firstInstallmentDate,
    createdAt: new Date().toISOString()
  };

  await addRecord("emis", plan);
  await updateRecord("transactions", tx.id, { ...tx, emiID: plan.id });
}

async function saveEMIEdit(id, form) {
  if (!id) throw new Error("Missing EMI plan.");
  const monthlyEMI = Number(form.get("monthlyEMI"));
  const tenureMonths = Number.parseInt(form.get("tenureMonths"), 10);
  const firstInstallmentDate = new Date(`${form.get("firstInstallmentDate")}T00:00:00`).toISOString();
  if (!Number.isFinite(monthlyEMI) || monthlyEMI <= 0) throw new Error("Enter a valid EMI amount.");
  if (!Number.isFinite(tenureMonths) || tenureMonths < 2) throw new Error("Enter a valid tenure.");

  await updateRecord("emis", id, (current) => ({
    ...current,
    monthlyEMI,
    tenureMonths,
    firstInstallmentDate
  }));
}

async function saveBudget(id, form) {
  const category = String(form.get("category") || "").trim();
  const monthlyLimit = Number(form.get("monthlyLimit"));
  const month = fromMonthInput(form.get("month")).toISOString();
  if (!category) throw new Error("Choose a category.");
  if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0) throw new Error("Enter a valid budget amount.");

  if (id) {
    await updateRecord("budgets", id, (current) => ({
      ...current,
      category,
      monthlyLimit,
      month
    }));
    return;
  }

  await addRecord("budgets", {
    id: crypto.randomUUID(),
    category,
    month,
    monthlyLimit,
    createdAt: new Date().toISOString()
  });
  state.budgetMonth = monthInputValue(month);
}

async function copyPreviousBudgets() {
  const data = await getAllData();
  const targetMonth = fromMonthInput(state.budgetMonth);
  const previous = budgetsForMonth(data.budgets, new Date(targetMonth.getFullYear(), targetMonth.getMonth() - 1, 1));
  if (!previous.length) {
    state.importStatus = "No previous-month budgets found to copy.";
    render();
    return;
  }

  const existingKeys = new Set(budgetsForMonth(data.budgets, targetMonth).map((budget) => budget.category.toLowerCase()));
  const copies = previous
    .filter((budget) => !existingKeys.has(String(budget.category || "").toLowerCase()))
    .map((budget) => ({
      id: crypto.randomUUID(),
      category: budget.category,
      month: targetMonth.toISOString(),
      monthlyLimit: Number(budget.monthlyLimit || 0),
      createdAt: new Date().toISOString()
    }));

  if (!copies.length) {
    state.importStatus = "This month already has those category budgets.";
    render();
    return;
  }

  data.budgets = [...data.budgets, ...copies];
  await saveAllData(data);
  state.importStatus = `Copied ${copies.length} budget(s) from previous month. Export a backup when you are done updating data.`;
  await refreshState();
  render();
}

async function applyForecastBudgets() {
  const data = await getAllData();
  const targetMonth = fromMonthInput(state.budgetMonth);
  const existingKeys = new Set(budgetsForMonth(data.budgets, targetMonth).map((budget) => budget.category.toLowerCase()));
  const suggestions = forecastBudgets(data.transactions, data.categories, targetMonth)
    .filter((item) => !existingKeys.has(item.category.toLowerCase()));

  if (!suggestions.length) {
    state.importStatus = "No new forecast budgets to apply.";
    state.modal = null;
    render();
    return;
  }

  data.budgets = [
    ...data.budgets,
    ...suggestions.map((item) => ({
      id: crypto.randomUUID(),
      category: item.category,
      month: targetMonth.toISOString(),
      monthlyLimit: item.suggestedLimit,
      createdAt: new Date().toISOString()
    }))
  ];
  await saveAllData(data);
  state.modal = null;
  state.modalPayload = null;
  state.importStatus = `Applied ${suggestions.length} forecast budget(s). Export a backup when you are done updating data.`;
  await refreshState();
  render();
}

async function addStatementPayment(statementID, form) {
  if (!statementID) throw new Error("Missing statement.");
  const amount = Number(form.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid payment amount.");
  await addRecord("payments", {
    id: crypto.randomUUID(),
    statementID,
    amount,
    paidDate: new Date(`${form.get("paidDate")}T00:00:00`).toISOString(),
    notes: String(form.get("notes") || "").trim(),
    createdAt: new Date().toISOString()
  });
}

async function saveStatement(id, form) {
  const data = await getAllData();
  const card = data.cards.find((candidate) => candidate.id === form.get("cardID"));
  if (!card) throw new Error("Choose a valid card.");

  const totalDue = Number(form.get("totalDue"));
  const minimumDue = Number(form.get("minimumDue"));
  if (!Number.isFinite(totalDue) || totalDue < 0) throw new Error("Enter a valid total due.");
  if (!Number.isFinite(minimumDue) || minimumDue < 0) throw new Error("Enter a valid minimum due.");

  const existing = id ? data.statements.find((statement) => statement.id === id) : null;
  const file = form.get("statementFile");
  const hasNewFile = file && typeof file === "object" && file.size > 0;
  if (!existing && !hasNewFile) throw new Error("Choose a statement file.");

  let fileName = existing?.fileName || "";
  let storedFileName = existing?.storedFileName || "";
  let nextFiles = data.statementFiles;

  if (hasNewFile) {
    const attachment = await fileToStatementAttachment(file);
    fileName = attachment.fileName;
    storedFileName = attachment.id;
    nextFiles = nextFiles.filter((candidate) => candidate.id !== existing?.storedFileName);
    nextFiles.push(attachment);
  }

  const statement = {
    id: existing?.id || crypto.randomUUID(),
    cardID: card.id,
    cardType: displayCard(card),
    statementMonth: fromMonthInput(form.get("statementMonth")).toISOString(),
    statementDate: form.get("statementDate") ? new Date(`${form.get("statementDate")}T00:00:00`).toISOString() : null,
    autoReadAttempted: existing?.autoReadAttempted || false,
    autoReadDetectedFieldCount: existing?.autoReadDetectedFieldCount || 0,
    dueDate: new Date(`${form.get("dueDate")}T00:00:00`).toISOString(),
    totalDue,
    minimumDue,
    fileName,
    storedFileName,
    hasStoredFile: true,
    createdAt: existing?.createdAt || new Date().toISOString()
  };

  data.statements = existing
    ? data.statements.map((item) => item.id === existing.id ? statement : item)
    : [...data.statements, statement];
  data.statementFiles = nextFiles;
  await saveAllData(data);
}

async function deleteStatement(id) {
  const data = await getAllData();
  const statement = data.statements.find((item) => item.id === id);
  data.statements = data.statements.filter((item) => item.id !== id);
  data.payments = data.payments.filter((payment) => payment.statementID !== id);
  if (statement?.storedFileName) {
    data.statementFiles = data.statementFiles.filter((file) => file.id !== statement.storedFileName);
  }
  await saveAllData(data);
}

async function savePaymentEdit(id, form) {
  if (!id) throw new Error("Missing payment.");
  const amount = Number(form.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid payment amount.");
  await updateRecord("payments", id, (current) => ({
    ...current,
    amount,
    paidDate: new Date(`${form.get("paidDate")}T00:00:00`).toISOString(),
    notes: String(form.get("notes") || "").trim()
  }));
}

async function saveCard(id, form) {
  const data = await getAllData();
  const nickname = String(form.get("nickname") || "").trim();
  const bankName = String(form.get("bankName") || "").trim();
  const network = String(form.get("network") || "").trim();
  const last4Digits = String(form.get("last4Digits") || "").replace(/\D/g, "").slice(-4);
  const statementDay = clampInt(form.get("statementDay"), 1, 31, 1);
  if (!nickname) throw new Error("Card nickname is required.");
  if (last4Digits.length < 4) throw new Error("Last 4 digits are required.");

  const updatedCard = {
    id: id || crypto.randomUUID(),
    nickname,
    bankName,
    network,
    last4Digits,
    statementDay,
    paymentDueDay: autoDueDay(statementDay),
    notes: String(form.get("notes") || "").trim(),
    createdAt: id ? data.cards.find((card) => card.id === id)?.createdAt || new Date().toISOString() : new Date().toISOString()
  };

  if (id) {
    data.cards = data.cards.map((card) => card.id === id ? updatedCard : card);
    const label = displayCard(updatedCard);
    data.transactions = data.transactions.map((tx) => tx.cardID === id ? { ...tx, cardType: label } : tx);
    data.statements = data.statements.map((statement) => statement.cardID === id ? { ...statement, cardType: label } : statement);
    data.emis = data.emis.map((emi) => emi.cardID === id ? { ...emi, cardType: label } : emi);
  } else {
    data.cards = [...data.cards, updatedCard];
  }

  await saveAllData(data);
}

async function deleteCard(id) {
  const data = await getAllData();
  const usage = cardUsage(id, data);
  if (usage.transactions || usage.statements || usage.emis) {
    state.importStatus = "This card cannot be deleted because it is already used.";
    state.modal = null;
    state.modalPayload = null;
    await refreshState();
    render();
    return;
  }
  const card = data.cards.find((item) => item.id === id);
  showConfirmation({
    title: "Delete Card?",
    message: `Delete ${card ? displayCard(card) : "this card"}?`,
    confirmLabel: "Delete",
    onConfirm: async () => {
      const fresh = await getAllData();
      fresh.cards = fresh.cards.filter((item) => item.id !== id);
      await saveAllData(fresh);
      state.importStatus = "Card deleted. Export a backup when you are done updating data.";
      state.modal = null;
      state.modalPayload = null;
    }
  });
}

async function saveCategory(oldName, form) {
  const data = await getAllData();
  const clean = String(form.get("category") || "").trim();
  if (!clean) throw new Error("Category name is required.");
  const exists = data.categories.some((category) => category.toLowerCase() === clean.toLowerCase() && category !== oldName);
  if (exists) throw new Error("That category already exists.");

  if (oldName) {
    data.categories = data.categories.map((category) => category === oldName ? clean : category);
    data.transactions = data.transactions.map((tx) => tx.category === oldName ? { ...tx, category: clean } : tx);
    data.budgets = data.budgets.map((budget) => budget.category === oldName ? { ...budget, category: clean } : budget);
  } else {
    data.categories = [...data.categories, clean];
  }

  data.categories = normalizedCategories(data.categories);
  await saveAllData(data);
}

async function deleteCategory(name) {
  if (!name || name.toLowerCase() === "general") return;
  showConfirmation({
    title: "Delete Category?",
    message: "Existing transactions move to General and matching budgets are removed.",
    confirmLabel: "Delete",
    onConfirm: async () => {
      const data = await getAllData();
      if (!data.categories.some((category) => category.toLowerCase() === "general")) {
        data.categories.push("General");
      }
      data.categories = data.categories.filter((category) => category !== name);
      data.transactions = data.transactions.map((tx) => tx.category === name ? { ...tx, category: "General" } : tx);
      data.budgets = data.budgets.filter((budget) => budget.category !== name);
      data.categories = normalizedCategories(data.categories);
      await saveAllData(data);
      state.importStatus = "Category deleted. Export a backup when you are done updating data.";
    }
  });
}

async function addCategoryIfMissing(name) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Category name is required.");
  const data = await getAllData();
  const exists = data.categories.some((category) => category.toLowerCase() === clean.toLowerCase());
  if (!exists) {
    data.categories = normalizedCategories([...data.categories, clean]);
    await saveAllData(data);
  }
}

async function saveWish(id, form) {
  const title = String(form.get("title") || "").trim();
  const category = String(form.get("category") || "General");
  const targetAmount = Number(form.get("targetAmount"));
  const savedAmount = Math.max(0, Number(form.get("savedAmount") || 0));
  const priority = String(form.get("priority") || "Medium");
  if (!title) throw new Error("Wish title is required.");
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) throw new Error("Enter a valid target amount.");

  const record = {
    id: id || crypto.randomUUID(),
    title,
    category,
    targetAmount,
    savedAmount,
    priority,
    notes: String(form.get("notes") || "").trim(),
    createdAt: id
      ? (state.data || emptyData()).wishlist.find((wish) => wish.id === id)?.createdAt || new Date().toISOString()
      : new Date().toISOString()
  };

  if (id) {
    await updateRecord("wishlist", id, record);
  } else {
    await addRecord("wishlist", record);
  }
}

async function addPurchase(values) {
  const data = state.data || emptyData();
  const card = data.cards.find((candidate) => candidate.id === values.cardID);
  if (!card) throw new Error("Choose a valid card.");

  const title = String(values.title || "").trim();
  const amount = Number(values.amount);
  if (!title) throw new Error("Description is required.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount.");

  const transaction = {
    id: crypto.randomUUID(),
    title,
    category: String(values.category || "General"),
    amount,
    refundedAmount: 0,
    date: new Date(`${values.date}T00:00:00`).toISOString(),
    cardID: card.id,
    cardType: displayCard(card),
    notes: String(values.notes || "").trim(),
    createdAt: new Date().toISOString()
  };

  await addRecord("transactions", transaction);
}

async function importBackfillCSVFile(file) {
  const rows = parseTransactionCSV(await file.text());
  if (!rows.length) throw new Error("No valid transaction rows found in this CSV.");
  const data = await getAllData();
  const summary = importTransactionRows(data, rows, {});
  await saveAllData(data);
  return summary;
}

async function importStatementCSVFile(statement, file) {
  if (!statement) throw new Error("Choose a statement first.");
  const rows = parseTransactionCSV(await file.text());
  if (!rows.length) throw new Error("No valid transaction rows found in this CSV.");
  const data = await getAllData();
  const freshStatement = data.statements.find((item) => item.id === statement.id);
  if (!freshStatement) throw new Error("Statement was not found.");
  const summary = importTransactionRows(data, rows, { statement: freshStatement });
  await saveAllData(data);
  return summary;
}

function importTransactionRows(data, rows, options) {
  const createdAt = new Date().toISOString();
  const categoryKeys = new Set((data.categories || []).map((category) => category.toLowerCase()));
  const existingKeys = new Set(data.transactions.map(transactionImportKey));
  let categoriesAdded = 0;
  let cardsAdded = 0;
  let duplicatesSkipped = 0;
  let imported = 0;
  let fallbackCard = null;

  rows.forEach((row) => {
    let card = null;
    if (options.statement) {
      card = data.cards.find((candidate) => candidate.id === options.statement.cardID) || null;
    } else {
      const result = row.cardName || !fallbackCard
        ? findOrCreateImportCard(data, row.cardName)
        : { card: fallbackCard, created: false };
      card = result.card;
      if (result.created) cardsAdded += 1;
      fallbackCard = card;
    }

    if (!card) {
      if (!fallbackCard) {
        const result = findOrCreateImportCard(data, "");
        fallbackCard = result.card;
        if (result.created) cardsAdded += 1;
      }
      card = fallbackCard;
    }

    const transaction = {
      id: crypto.randomUUID(),
      title: row.title,
      category: row.category || "General",
      amount: row.amount,
      refundedAmount: row.refundedAmount || 0,
      date: row.date.toISOString(),
      cardID: card.id,
      cardType: displayCard(card),
      statementID: options.statement?.id,
      notes: options.statement ? `Imported from ${options.statement.fileName || "statement CSV"}` : "Imported from backfill CSV",
      createdAt
    };
    const key = transactionImportKey(transaction);
    if (existingKeys.has(key)) {
      duplicatesSkipped += 1;
      return;
    }

    if (!categoryKeys.has(transaction.category.toLowerCase())) {
      data.categories.push(transaction.category);
      categoryKeys.add(transaction.category.toLowerCase());
      categoriesAdded += 1;
    }

    existingKeys.add(key);
    data.transactions.push(transaction);
    imported += 1;
  });

  data.categories = normalizedCategories(data.categories);
  return { transactions: imported, categories: categoriesAdded, cards: cardsAdded, duplicatesSkipped, rows: rows.length };
}

function importSummaryText(scope, summary) {
  const label = scope === "statement" ? "statement" : "backfill";
  const categoryWord = summary.categories === 1 ? "category" : "categories";
  const cardNote = summary.cards ? ` Created ${summary.cards} new card${summary.cards === 1 ? "" : "s"}.` : "";
  const duplicateNote = summary.duplicatesSkipped ? ` Skipped ${summary.duplicatesSkipped} duplicate row${summary.duplicatesSkipped === 1 ? "" : "s"}.` : "";
  return `Imported ${summary.transactions} ${label} transaction(s) and ${summary.categories} new ${categoryWord}.${cardNote}${duplicateNote}`;
}

function migrationIntegrityReport(data) {
  const cardIDs = new Set(data.cards.map((card) => card.id));
  const transactionIDs = new Set(data.transactions.map((tx) => tx.id));
  const statementIDs = new Set(data.statements.map((statement) => statement.id));
  const statementFileIDs = new Set(data.statementFiles.map((file) => file.id));
  const referencedFileIDs = new Set(data.statements.map((statement) => statement.storedFileName || statement.fileName).filter(Boolean));
  const issues = [];

  const transactionsMissingCards = data.transactions.filter((tx) => tx.cardID && !cardIDs.has(tx.cardID)).length;
  const statementsMissingCards = data.statements.filter((statement) => statement.cardID && !cardIDs.has(statement.cardID)).length;
  const paymentsMissingStatements = data.payments.filter((payment) => payment.statementID && !statementIDs.has(payment.statementID)).length;
  const emisMissingTransactions = data.emis.filter((emi) => emi.transactionID && !transactionIDs.has(emi.transactionID)).length;
  const emisMissingCards = data.emis.filter((emi) => emi.cardID && !cardIDs.has(emi.cardID)).length;
  const statementsMissingFiles = data.statements.filter((statement) => {
    const fileID = statement.storedFileName || statement.fileName;
    return fileID && !statementFileIDs.has(fileID);
  }).length;
  const unusedFiles = data.statementFiles.filter((file) => !referencedFileIDs.has(file.id)).length;
  const duplicateTransactions = duplicateTransactionCount(data.transactions);

  pushIssue(issues, transactionsMissingCards, "transaction(s) reference a missing card");
  pushIssue(issues, statementsMissingCards, "statement(s) reference a missing card");
  pushIssue(issues, paymentsMissingStatements, "payment(s) reference a missing statement");
  pushIssue(issues, emisMissingTransactions, "EMI plan(s) reference a missing transaction");
  pushIssue(issues, emisMissingCards, "EMI plan(s) reference a missing card");
  pushIssue(issues, statementsMissingFiles, "statement(s) reference a missing stored file");
  pushIssue(issues, unusedFiles, "stored file(s) are not linked to any statement");
  pushIssue(issues, duplicateTransactions, "transaction(s) look duplicated");

  const checked = data.cards.length + data.transactions.length + data.statements.length + data.payments.length + data.emis.length + data.statementFiles.length;
  const issueCount = transactionsMissingCards + statementsMissingCards + paymentsMissingStatements + emisMissingTransactions + emisMissingCards + statementsMissingFiles + unusedFiles + duplicateTransactions;
  const fileStatus = statementsMissingFiles ? "Missing" : unusedFiles ? "Unused" : "OK";

  return {
    checked,
    issueCount,
    duplicates: duplicateTransactions,
    fileStatus,
    issues
  };
}

function pushIssue(issues, count, label) {
  if (count > 0) issues.push(`${count} ${label}`);
}

function duplicateTransactionCount(transactions) {
  const seen = new Set();
  let duplicates = 0;
  transactions.forEach((tx) => {
    const key = transactionImportKey(tx);
    if (seen.has(key)) {
      duplicates += 1;
    } else {
      seen.add(key);
    }
  });
  return duplicates;
}

function transactionImportKey(tx) {
  return [
    String(tx.title || "").trim().toLowerCase(),
    Math.round(Number(tx.amount || 0) * 100),
    dateInputValue(tx.date),
    tx.cardID || "",
    tx.statementID || ""
  ].join("|");
}

function findOrCreateImportCard(data, rawName) {
  const name = String(rawName || "").trim();
  const normalizedName = name.toLowerCase();
  const existing = data.cards.find((card) => {
    const candidates = [card.nickname, displayCard(card), card.bankName, card.cardName, card.name]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    return normalizedName && candidates.some((candidate) => candidate === normalizedName || candidate.includes(normalizedName));
  });
  if (existing) return { card: existing, created: false };

  const statementDay = 1;
  const card = {
    id: crypto.randomUUID(),
    nickname: name || "Imported Card",
    bankName: "",
    network: "",
    last4: "",
    statementDay,
    paymentDueDay: autoDueDay(statementDay),
    createdAt: new Date().toISOString()
  };
  data.cards.push(card);
  return { card, created: true };
}

function dashboardDetailPayload(kind) {
  const data = state.data || emptyData();
  const month = fromMonthInput(state.selectedMonth);
  const cardID = state.selectedCardID || null;
  const titles = {
    spent: "Spent Transactions",
    emiDue: "EMI Due Details",
    payable: "Payable Details",
    nextDue: "Upcoming Statement Dues"
  };
  return {
    title: titles[kind] || "Details",
    items: dashboardDetailItems(data, kind, month, cardID)
  };
}

function dashboardCategoryDetailPayload(category) {
  const data = state.data || emptyData();
  const month = fromMonthInput(state.selectedMonth);
  const cardID = state.selectedCardID || null;
  const items = data.transactions
    .filter((tx) => sameMonth(tx.date, month) && (!cardID || tx.cardID === cardID) && String(tx.category || "General").toLowerCase() === String(category || "General").toLowerCase())
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((tx) => ({
      title: tx.title || "Purchase",
      amount: netAmount(tx),
      subtitle: `${tx.cardType || "Card"} · ${formatDate(tx.date)}`,
      meta: tx.notes || tx.category || "General"
    }));
  return { title: `${category} Transactions`, items };
}

function dashboardDetailItems(data, kind, month, cardID) {
  if (kind === "spent") {
    return data.transactions
      .filter((tx) => sameMonth(tx.date, month) && (!cardID || tx.cardID === cardID))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((tx) => ({
        title: tx.title || "Purchase",
        amount: netAmount(tx),
        subtitle: `${tx.cardType || "Card"} · ${formatDate(tx.date)}`,
        meta: tx.category || "General"
      }));
  }
  if (kind === "emiDue") {
    return data.emis
      .filter((plan) => (!cardID || plan.cardID === cardID) && emiDueForPlanOnMonth(plan, month) > 0)
      .map((plan) => {
        const tx = data.transactions.find((item) => item.id === plan.transactionID);
        return {
          title: tx?.title || "EMI Purchase",
          amount: Number(plan.monthlyEMI || 0),
          subtitle: `${plan.cardType || tx?.cardType || "Card"} · ${Number(plan.tenureMonths || 0)} months`,
          meta: `Remaining ${remainingInstallments(plan, month)}`
        };
      });
  }
  if (kind === "payable") {
    const oneTime = data.transactions
      .filter((tx) => !tx.emiID && (!cardID || tx.cardID === cardID))
      .map((tx) => ({ tx, dueDate: purchaseDueDateForTransaction(tx, data.cards) }))
      .filter(({ tx, dueDate }) => dueDate && sameMonth(dueDate, month) && netAmount(tx) > 0)
      .map(({ tx, dueDate }) => ({
        title: tx.title || "Purchase",
        amount: netAmount(tx),
        subtitle: `${tx.cardType || "Card"} · ${tx.category || "General"}`,
        meta: `Due ${formatDate(dueDate)}`,
        date: dueDate
      }));
    const emiRows = data.emis
      .filter((plan) => (!cardID || plan.cardID === cardID) && emiDueForPlanOnMonth(plan, month) > 0)
      .map((plan) => {
        const tx = data.transactions.find((item) => item.id === plan.transactionID);
        return {
          title: tx?.title || "EMI Purchase",
          amount: Number(plan.monthlyEMI || 0),
          subtitle: `${plan.cardType || tx?.cardType || "Card"} · ${tx?.category || "EMI"}`,
          meta: `Installment due`,
          date: month
        };
      });
    return [...oneTime, ...emiRows].sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  if (kind === "nextDue") {
    return dueSoon(data.statements, data.payments, 365, cardID).map((statement) => ({
      title: statement.cardType || "Statement",
      amount: statement.outstanding,
      subtitle: `Due ${formatDate(statement.dueDate)}`,
      meta: `Minimum ${INR.format(Number(statement.minimumDue || 0))}`
    }));
  }
  return [];
}

function cardPaymentAllocations(data, selectedMonth, horizon, cardID) {
  const { start, end } = allocationRange(selectedMonth, horizon);
  return data.cards
    .filter((card) => !cardID || card.id === cardID)
    .map((card) => {
      const statements = data.statements.filter((statement) => statement.cardID === card.id && new Date(statement.dueDate) >= start && new Date(statement.dueDate) < end);
      const totalDue = statements.reduce((sum, statement) => sum + Number(statement.totalDue || 0), 0);
      const statementIDs = new Set(statements.map((statement) => statement.id));
      const paid = data.payments
        .filter((payment) => statementIDs.has(payment.statementID))
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      return {
        cardType: displayCard(card),
        paid,
        pending: Math.max(0, totalDue - paid),
        totalDue
      };
    })
    .filter((row) => row.totalDue > 0 || row.paid > 0)
    .sort((a, b) => b.pending - a.pending);
}

function allocationRange(selectedMonth, horizon) {
  const start = monthStart(selectedMonth);
  if (horizon === "FY") {
    const year = financialYearStartYear(start);
    return { start: new Date(year, 3, 1), end: new Date(year + 1, 3, 1) };
  }
  const months = horizon === "6M" ? 6 : 3;
  return { start, end: addMonths(start, months) };
}

function cardMonthSeries(cards, rows, anchor, months, cardID, kind, payments = [], emis = []) {
  const start = kind === "payable" ? addMonths(anchor, -1) : addMonths(anchor, -(months - 1));
  const selectedCards = cards.filter((card) => !cardID || card.id === cardID);
  return Array.from({ length: months }, (_, monthIndex) => {
    const month = addMonths(start, monthIndex);
    return selectedCards.map((card) => ({
      monthKey: monthInputValue(month),
      label: month.toLocaleDateString("en-IN", { month: "short" }),
      cardID: card.id,
      cardLabel: displayCard(card),
      amount: kind === "payable"
        ? payableByCycleOnMonth(rows, emis, cards, month, card.id)
        : spentThisMonth(rows, month, card.id)
    }));
  }).flat();
}

function donutStops(points) {
  const total = points.reduce((sum, point) => sum + point.amount, 0);
  if (!total) return "rgba(100, 116, 139, 0.14)";
  let cursor = 0;
  return `conic-gradient(${points.map((point, index) => {
    const start = cursor;
    cursor += (point.amount / total) * 100;
    return `${seriesColor(point.label, index)} ${start}% ${cursor}%`;
  }).join(", ")})`;
}

function seriesColor(key, index = 0) {
  const palette = ["#0a66d8", "#16803c", "#c76712", "#c22b2b", "#7c3aed", "#0f766e", "#db2777", "#4f46e5"];
  const hash = String(key || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), index);
  return palette[Math.abs(hash) % palette.length];
}

function shiftSelectedMonth(delta) {
  const oldMonth = fromMonthInput(state.selectedMonth);
  state.selectedMonth = monthInputValue(addMonths(oldMonth, delta));
  render();
}

function monthTitle(date) {
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function emiDueForPlanOnMonth(plan, selectedMonth) {
  const first = monthStart(plan.firstInstallmentDate);
  const target = monthStart(selectedMonth);
  const monthsElapsed = (target.getFullYear() - first.getFullYear()) * 12 + target.getMonth() - first.getMonth();
  return monthsElapsed >= 0 && monthsElapsed < Number(plan.tenureMonths || 0) ? Number(plan.monthlyEMI || 0) : 0;
}

function filteredTransactions(data) {
  const query = state.transactionSearch.trim().toLowerCase();
  return [...data.transactions]
    .filter((tx) => {
      if (state.transactionCardID && tx.cardID !== state.transactionCardID) return false;
      if (state.transactionCategory !== "All" && tx.category !== state.transactionCategory) return false;
      if (state.transactionFilterByMonth && !sameMonth(tx.date, fromMonthInput(state.transactionMonth))) return false;
      if (state.transactionFilterByRange) {
        const date = new Date(tx.date);
        const from = startOfDay(state.transactionDateFrom);
        const to = addDays(startOfDay(state.transactionDateTo), 1);
        if (date < from || date >= to) return false;
      }
      if (!query) return true;
      return [tx.title, tx.cardType, tx.category].some((value) => String(value || "").toLowerCase().includes(query));
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function filteredStatements(data) {
  return [...data.statements]
    .filter((statement) => !state.statementCardID || statement.cardID === state.statementCardID)
    .sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));
}

function cardUsage(cardID, data = state.data || emptyData()) {
  return {
    transactions: data.transactions.filter((tx) => tx.cardID === cardID).length,
    statements: data.statements.filter((statement) => statement.cardID === cardID).length,
    emis: data.emis.filter((emi) => emi.cardID === cardID).length
  };
}

function objectURLForStatementFile(file) {
  const bytes = base64ToBytes(file.base64Data || "");
  const blob = new Blob([bytes], { type: file.mimeType || "application/pdf" });
  return URL.createObjectURL(blob);
}

async function fileToStatementAttachment(file) {
  const base64Data = await fileToBase64(file);
  const storedName = uniqueStoredFileName(file.name || "statement.pdf");
  return {
    id: storedName,
    fileName: file.name || storedName,
    base64Data,
    mimeType: file.type || mimeTypeForFile(file.name || storedName),
    byteSize: file.size || base64ByteSize(base64Data)
  };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function uniqueStoredFileName(fileName) {
  const safe = String(fileName || "statement.pdf").replace(/[^\w.\- ]+/g, "_");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${safe}`;
}

function base64ByteSize(base64) {
  const clean = String(base64 || "").replace(/\s/g, "");
  if (!clean) return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function mimeTypeForFile(fileName) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".csv")) return "text/csv";
  return "application/octet-stream";
}

function base64ToBytes(base64) {
  const raw = atob(String(base64 || "").replace(/\s/g, ""));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function downloadURL(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
}

function closePDF() {
  if (state.pdfURL) URL.revokeObjectURL(state.pdfURL);
  state.pdfURL = "";
  state.pdfTitle = "";
  state.modal = null;
}

async function storageHealthSnapshot(data) {
  const backupSize = estimateJSONBytes(data || emptyData());
  const fallback = {
    backupSizeLabel: formatBytes(backupSize),
    usageLabel: "Unavailable",
    quotaLabel: "Unavailable",
    usagePercent: null,
    persistedLabel: "Browser Managed",
    canRequestPersistence: Boolean(navigator.storage?.persist),
    message: "Safari may clear website data if browser data is cleared or the PWA is removed. Keep exporting full backups."
  };

  if (!navigator.storage) return fallback;

  let usage = null;
  let quota = null;
  let persisted = null;

  try {
    if (navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      usage = Number.isFinite(estimate.usage) ? estimate.usage : null;
      quota = Number.isFinite(estimate.quota) ? estimate.quota : null;
    }
  } catch {
    usage = null;
    quota = null;
  }

  try {
    persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
  } catch {
    persisted = null;
  }

  const usagePercent = usage !== null && quota ? Math.round((usage / quota) * 100) : null;
  const persistedLabel = persisted === true ? "Persistent" : persisted === false ? "Browser Managed" : "Unknown";
  const canRequestPersistence = persisted !== true && Boolean(navigator.storage.persist);
  const message = persisted === true
    ? "This browser says Kuber storage is persistent, but full backup exports are still the recovery file."
    : "This browser controls local storage cleanup. Export a full backup after important changes.";

  return {
    backupSizeLabel: formatBytes(backupSize),
    usageLabel: usage !== null ? formatBytes(usage) : "Unavailable",
    quotaLabel: quota !== null ? formatBytes(quota) : "Unavailable",
    usagePercent,
    persistedLabel,
    canRequestPersistence,
    message
  };
}

function runtimeHealthSnapshot() {
  const standalone = Boolean(window.navigator.standalone) || window.matchMedia?.("(display-mode: standalone)")?.matches;
  const online = navigator.onLine !== false;
  const hasServiceWorker = "serviceWorker" in navigator;
  const hasController = Boolean(navigator.serviceWorker?.controller);
  const hasCaches = "caches" in window;
  const installLabel = standalone ? "Installed" : "Browser";
  const displayLabel = standalone ? "Home Screen" : "Safari Tab";
  const networkLabel = online ? "Online" : "Offline";
  const cacheLabel = hasServiceWorker ? (hasController ? "Active" : "Registered") : hasCaches ? "Limited" : "Unavailable";
  const message = standalone
    ? "Kuber is running as an installed PWA. It still depends on this device's local browser storage and your exported backups."
    : "Open from the iPhone Home Screen after adding Kuber to get the closest app-like behavior.";

  return {
    installLabel,
    displayLabel,
    networkLabel,
    cacheLabel,
    canCheckUpdates: hasServiceWorker,
    message
  };
}

function estimateJSONBytes(value) {
  const text = JSON.stringify(value || {});
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function showConfirmation(payload) {
  state.modal = "confirm";
  state.modalPayload = payload;
  history.pushState({ kuber: true }, "", location.href);
  render();
}

function attachSwipe(element, handlers) {
  if (!element) return;
  let startX = 0;
  let startY = 0;
  element.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
  }, { passive: true });
  element.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) handlers.left?.();
    else handlers.right?.();
  }, { passive: true });
}

function attachRowGestures(row) {
  let pressTimer = null;
  attachSwipe(row, {
    left: () => runEncodedAction(row.dataset.swipeTrailing),
    right: () => runEncodedAction(row.dataset.swipeLeading)
  });
  if (row.dataset.longPress) {
    row.addEventListener("touchstart", () => {
      pressTimer = setTimeout(() => runEncodedAction(row.dataset.longPress), 520);
    }, { passive: true });
    row.addEventListener("touchmove", () => clearTimeout(pressTimer), { passive: true });
    row.addEventListener("touchend", () => clearTimeout(pressTimer), { passive: true });
    row.addEventListener("touchcancel", () => clearTimeout(pressTimer), { passive: true });
  }
}

function attachSheetDismiss(sheet) {
  let startY = 0;
  sheet.addEventListener("touchstart", (event) => {
    startY = event.touches[0].clientY;
  }, { passive: true });
  sheet.addEventListener("touchend", (event) => {
    const dy = event.changedTouches[0].clientY - startY;
    if (dy > 90) {
      state.modal = null;
      state.modalPayload = null;
      render();
    }
  }, { passive: true });
}

function updateSaveButtonState(selector) {
  const form = app.querySelector(selector);
  const button = form ? app.querySelector(`[form="${form.id}"][data-save-button]`) : null;
  if (!form || !button) return;
  button.disabled = !form.checkValidity();
}

function addPurchaseDraftFromForm(form) {
  if (!form) return {};
  const data = new FormData(form);
  return {
    title: String(data.get("title") || ""),
    category: String(data.get("category") || ""),
    amount: String(data.get("amount") || ""),
    date: String(data.get("date") || ""),
    cardID: String(data.get("cardID") || ""),
    notes: String(data.get("notes") || "")
  };
}

async function runEncodedAction(encoded) {
  if (!encoded) return;
  const [scope, action, ...idParts] = encoded.split(":");
  const id = idParts.join(":");
  if (scope === "transaction") await handleTransactionAction(action, id);
  if (scope === "budget") await handleBudgetAction(action, id);
  if (scope === "emi") await handleEMIAction(action, id);
  if (scope === "wish") await handleWishAction(action, id);
  if (scope === "statement") await handleStatementAction(action, id);
  if (scope === "payment") await handlePaymentAction(action, id);
}

function updateEMILastDatePreview() {
  const form = app.querySelector("#edit-emi-form");
  const output = form?.querySelector("[data-emi-last-date]");
  if (!form || !output) return;
  const data = new FormData(form);
  const tenureMonths = Number.parseInt(data.get("tenureMonths"), 10);
  const firstInstallmentDate = new Date(`${data.get("firstInstallmentDate")}T00:00:00`);
  if (!Number.isFinite(tenureMonths) || Number.isNaN(firstInstallmentDate.getTime())) return;
  output.textContent = formatDate(addMonths(firstInstallmentDate, Math.max(0, tenureMonths - 1)));
}

async function runBusy(work) {
  if (state.isBusy) return;
  state.isBusy = true;
  try {
    await work();
  } catch (error) {
    state.importStatus = error?.message || "Something went wrong.";
  } finally {
    state.isBusy = false;
  }
}

function countPill(label, value) {
  return `
    <div class="count-pill">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>
  `;
}

function shortLabel(value) {
  const text = String(value || "");
  return text.length > 9 ? `${text.slice(0, 8)}…` : text;
}

function dateInputValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function startOfDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date(0);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(value, days) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function autoDueDay(statementDay) {
  const normalized = Math.max(1, Math.min(31, Number(statementDay || 1)));
  return ((normalized + 19 - 1) % 31) + 1;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizedCategories(categories) {
  const seen = new Set();
  const out = [];
  for (const category of categories) {
    const clean = String(category || "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  if (!seen.has("general")) out.unshift("General");
  return out.sort((a, b) => a.localeCompare(b));
}

function priorityClass(priority) {
  return `priority-${String(priority || "Medium").toLowerCase()}`;
}

function healthIcon(status) {
  if (status === "safe") return "✓";
  if (status === "overdue") return "!";
  return "•";
}

function iconGlyph(icon) {
  const icons = {
    chart: "▥",
    grid: "▦",
    wallet: "▣",
    list: "☰",
    doc: "□",
    card: "▭",
    cloud: "☁",
    spark: "✦",
    gear: "⚙",
    search: "⌕"
  };
  return icons[icon] || "•";
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function emptyData() {
  return {
    cards: [],
    categories: [],
    budgets: [],
    transactions: [],
    emis: [],
    statements: [],
    payments: [],
    wishlist: [],
    statementFiles: []
  };
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch {
    // The app still works without offline caching, especially from local files.
  }
}
