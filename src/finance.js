export const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

export function monthStart(date = new Date()) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(date, count) {
  const d = monthStart(date);
  return new Date(d.getFullYear(), d.getMonth() + count, 1);
}

export function sameMonth(a, b) {
  const left = monthStart(a);
  const right = monthStart(b);
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

export function displayCard(card) {
  if (!card) return "Card";
  return `${card.nickname || "Card"} •••• ${card.last4Digits || "0000"}`;
}

export function netAmount(transaction) {
  return Math.max(0, Number(transaction.amount || 0) - Number(transaction.refundedAmount || 0));
}

export function filterByCard(rows, cardID) {
  if (!cardID) return rows;
  return rows.filter((row) => row.cardID === cardID);
}

export function spentThisMonth(transactions, selectedMonth = new Date(), cardID = null) {
  const target = monthStart(selectedMonth);
  return filterByCard(transactions, cardID).reduce((sum, tx) => {
    const date = new Date(tx.date);
    if (date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth()) {
      return sum + netAmount(tx);
    }
    return sum;
  }, 0);
}

export function totalPaidForStatement(payments, statementID) {
  return payments
    .filter((payment) => payment.statementID === statementID)
    .reduce((paymentSum, payment) => paymentSum + Number(payment.amount || 0), 0);
}

export function outstandingForStatement(statement, payments) {
  return Math.max(0, Number(statement.totalDue || 0) - totalPaidForStatement(payments, statement.id));
}

export function statementStatus(statement, payments) {
  const paid = totalPaidForStatement(payments, statement.id);
  const outstanding = outstandingForStatement(statement, payments);
  const total = Number(statement.totalDue || 0);
  if (outstanding <= 0 && total > 0) return { label: "Paid", tone: "paid", paid, outstanding };
  if (new Date(statement.dueDate) < new Date()) return { label: "Overdue", tone: "overdue", paid, outstanding };
  if (paid > 0) return { label: "Partial", tone: "partial", paid, outstanding };
  return { label: "Unpaid", tone: "unpaid", paid, outstanding };
}

export function totalOutstanding(statements, payments, cardID = null) {
  return filterByCard(statements, cardID).reduce((sum, statement) => {
    const paid = payments
      .filter((payment) => payment.statementID === statement.id)
      .reduce((paymentSum, payment) => paymentSum + Number(payment.amount || 0), 0);
    return sum + Math.max(0, Number(statement.totalDue || 0) - paid);
  }, 0);
}

export function nextDueStatement(statements, payments, cardID = null) {
  const now = new Date();
  return filterByCard(statements, cardID)
    .map((statement) => {
      return {
        ...statement,
        outstanding: outstandingForStatement(statement, payments)
      };
    })
    .filter((statement) => statement.outstanding > 0 && new Date(statement.dueDate) >= monthStart(now))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0] || null;
}

export function emiDueOnMonth(emis, selectedMonth = new Date(), cardID = null) {
  const target = monthStart(selectedMonth);
  return filterByCard(emis, cardID).reduce((sum, plan) => {
    const first = monthStart(plan.firstInstallmentDate);
    const monthsElapsed = (target.getFullYear() - first.getFullYear()) * 12 + target.getMonth() - first.getMonth();
    if (monthsElapsed >= 0 && monthsElapsed < Number(plan.tenureMonths || 0)) {
      return sum + Number(plan.monthlyEMI || 0);
    }
    return sum;
  }, 0);
}

export function installmentIndexForMonth(plan, selectedMonth = new Date()) {
  const target = monthStart(selectedMonth);
  const first = monthStart(plan.firstInstallmentDate);
  const monthsElapsed = (target.getFullYear() - first.getFullYear()) * 12 + target.getMonth() - first.getMonth();
  if (monthsElapsed < 0 || monthsElapsed >= Number(plan.tenureMonths || 0)) return null;
  return monthsElapsed;
}

export function remainingInstallments(plan, selectedMonth = new Date()) {
  const index = installmentIndexForMonth(plan, selectedMonth);
  if (index === null) return Number(plan.tenureMonths || 0);
  return Math.max(0, Number(plan.tenureMonths || 0) - index);
}

export function lastInstallmentDate(plan) {
  return addMonths(plan.firstInstallmentDate, Math.max(0, Number(plan.tenureMonths || 1) - 1));
}

export function payableOnMonth(statements, payments, selectedMonth = new Date(), cardID = null) {
  return filterByCard(statements, cardID)
    .filter((statement) => sameMonth(statement.dueDate, selectedMonth))
    .reduce((sum, statement) => sum + outstandingForStatement(statement, payments), 0);
}

export function dueSoon(statements, payments, days = 10, cardID = null) {
  const now = new Date();
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days + 1);
  return filterByCard(statements, cardID)
    .map((statement) => ({
      ...statement,
      outstanding: outstandingForStatement(statement, payments)
    }))
    .filter((statement) => {
      const due = new Date(statement.dueDate);
      return statement.outstanding > 0 && due >= now && due < until;
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

export function overdueStatements(statements, payments, cardID = null) {
  const today = new Date();
  return filterByCard(statements, cardID)
    .map((statement) => ({
      ...statement,
      outstanding: outstandingForStatement(statement, payments)
    }))
    .filter((statement) => statement.outstanding > 0 && new Date(statement.dueDate) < today)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

export function cashOutCurrentMonth(statements, payments, selectedMonth = new Date(), cardID = null) {
  const statementDue = payableOnMonth(statements, payments, selectedMonth, cardID);
  const paidThisMonth = payments.reduce((sum, payment) => {
    if (!sameMonth(payment.paidDate, selectedMonth)) return sum;
    const statement = statements.find((candidate) => candidate.id === payment.statementID);
    if (cardID && statement?.cardID !== cardID) return sum;
    return sum + Number(payment.amount || 0);
  }, 0);
  const overdue = overdueStatements(statements, payments, cardID).reduce((sum, statement) => sum + statement.outstanding, 0);
  return {
    statementDue,
    paidThisMonth,
    overdue,
    total: statementDue + paidThisMonth + overdue
  };
}

export function paymentRecommendation(statements, payments, cardID = null) {
  const overdue = overdueStatements(statements, payments, cardID)[0];
  if (overdue) {
    return {
      ...overdue,
      recommendedPayNow: overdue.outstanding,
      reason: "Overdue statement"
    };
  }

  const next = nextDueStatement(statements, payments, cardID);
  if (!next) return null;
  const minimumDueRemaining = Math.max(0, Number(next.minimumDue || 0) - totalPaidForStatement(payments, next.id));
  return {
    ...next,
    recommendedPayNow: minimumDueRemaining > 0 ? minimumDueRemaining : next.outstanding,
    reason: minimumDueRemaining > 0 ? "Minimum due pending" : "Next unpaid statement"
  };
}

export function budgetAlerts(transactions, budgets, selectedMonth = new Date(), cardID = null) {
  const targetBudgets = budgets.filter((budget) => sameMonth(budget.month, selectedMonth));
  return targetBudgets
    .map((budget) => {
      const spent = filterByCard(transactions, cardID)
        .filter((tx) => sameMonth(tx.date, selectedMonth) && String(tx.category || "").toLowerCase() === String(budget.category || "").toLowerCase())
        .reduce((sum, tx) => sum + netAmount(tx), 0);
      const limit = Number(budget.monthlyLimit || 0);
      return {
        category: budget.category,
        spent,
        budget: limit,
        remaining: limit - spent,
        utilization: limit > 0 ? spent / limit : 0
      };
    })
    .filter((item) => item.utilization >= 0.8)
    .sort((a, b) => b.utilization - a.utilization);
}

export function budgetProgress(transactions, budgets, selectedMonth = new Date(), cardID = null) {
  return budgets
    .filter((budget) => sameMonth(budget.month, selectedMonth))
    .map((budget) => {
      const spent = filterByCard(transactions, cardID)
        .filter((tx) => sameMonth(tx.date, selectedMonth) && String(tx.category || "").toLowerCase() === String(budget.category || "").toLowerCase())
        .reduce((sum, tx) => sum + netAmount(tx), 0);
      const limit = Number(budget.monthlyLimit || 0);
      return {
        ...budget,
        spent,
        remaining: limit - spent,
        utilization: limit > 0 ? spent / limit : 0
      };
    })
    .sort((a, b) => String(a.category || "").localeCompare(String(b.category || "")));
}

export function budgetsForMonth(budgets, selectedMonth = new Date()) {
  return budgets
    .filter((budget) => sameMonth(budget.month, selectedMonth))
    .sort((a, b) => String(a.category || "").localeCompare(String(b.category || "")));
}

export function previousMonthBudgets(budgets, selectedMonth = new Date()) {
  return budgetsForMonth(budgets, addMonths(selectedMonth, -1));
}

export function forecastBudgets(transactions, categories, targetMonth = new Date()) {
  const target = monthStart(targetMonth);
  const suggestions = [];
  const uniqueCategories = [...new Set((categories.length ? categories : ["General"]).map((category) => String(category || "General")))];

  for (const category of uniqueCategories) {
    const monthly = [];
    for (let offset = 1; offset <= 12; offset += 1) {
      const month = addMonths(target, -offset);
      const amount = transactions
        .filter((tx) => sameMonth(tx.date, month) && String(tx.category || "General").toLowerCase() === category.toLowerCase())
        .reduce((sum, tx) => sum + netAmount(tx), 0);
      if (amount > 0) monthly.unshift(amount);
    }

    if (!monthly.length) continue;

    const recent = monthly.slice(-3);
    const recentAverage = average(recent);
    const seasonalAverage = monthly.length >= 6 ? average(monthly.slice(-6)) : null;
    const trendProjection = linearProjection(monthly);
    const blended = [
      recentAverage * 0.5,
      (seasonalAverage ?? recentAverage) * 0.3,
      trendProjection * 0.2
    ].reduce((sum, value) => sum + value, 0);
    const suggestedLimit = roundBudgetAmount(Math.max(recentAverage, blended));
    suggestions.push({
      category,
      suggestedLimit,
      recentAverage,
      seasonalAverage,
      trendProjection,
      monthsObserved: monthly.length,
      confidence: forecastConfidence(monthly)
    });
  }

  return suggestions
    .filter((item) => item.suggestedLimit > 0)
    .sort((a, b) => b.suggestedLimit - a.suggestedLimit);
}

function forecastConfidence(values) {
  if (values.length < 3) return "Low";
  if (values.length >= 6 && coefficientOfVariation(values) < 0.55) return "High";
  return "Medium";
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function linearProjection(values) {
  if (values.length < 2) return values[0] || 0;
  const n = values.length;
  const xs = values.map((_, index) => index + 1);
  const xMean = average(xs);
  const yMean = average(values);
  const numerator = values.reduce((sum, value, index) => sum + (xs[index] - xMean) * (value - yMean), 0);
  const denominator = xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;
  return Math.max(0, intercept + slope * (n + 1));
}

function coefficientOfVariation(values) {
  const mean = average(values);
  if (mean <= 0 || values.length < 2) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function roundBudgetAmount(amount) {
  if (amount <= 0) return 0;
  let step = 500;
  if (amount < 1000) step = 50;
  else if (amount < 5000) step = 100;
  else if (amount < 20000) step = 250;
  return Math.max(step, Math.round(amount / step) * step);
}

export function cardBreakdown(transactions, cards, selectedMonth = new Date()) {
  return cards
    .map((card) => ({
      label: displayCard(card),
      amount: spentThisMonth(transactions, selectedMonth, card.id)
    }))
    .filter((point) => point.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function categoryBreakdown(transactions, selectedMonth = new Date(), cardID = null) {
  const totals = new Map();
  for (const tx of filterByCard(transactions, cardID)) {
    if (!sameMonth(tx.date, selectedMonth)) continue;
    const category = tx.category || "General";
    totals.set(category, (totals.get(category) || 0) + netAmount(tx));
  }
  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .filter((point) => point.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function payableTrend(statements, payments, anchor = new Date(), months = 6, cardID = null) {
  const start = addMonths(anchor, -(months - 1));
  return Array.from({ length: months }, (_, index) => {
    const month = addMonths(start, index);
    return {
      label: new Intl.DateTimeFormat("en-IN", { month: "short" }).format(month),
      amount: payableOnMonth(statements, payments, month, cardID)
    };
  });
}

export function spendingTrend(transactions, anchor = new Date(), months = 6, cardID = null) {
  const start = addMonths(anchor, -(months - 1));
  return Array.from({ length: months }, (_, index) => {
    const month = addMonths(start, index);
    return {
      label: new Intl.DateTimeFormat("en-IN", { month: "short" }).format(month),
      amount: spentThisMonth(transactions, month, cardID)
    };
  });
}

export function financialYearStartYear(date = new Date()) {
  const d = new Date(date);
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

export function financialYearOptions(date = new Date()) {
  const current = financialYearStartYear(date);
  return Array.from({ length: 7 }, (_, index) => current - 5 + index);
}

export function financialYearLabel(year) {
  return `FY ${year}-${String((year + 1) % 100).padStart(2, "0")}`;
}

export function categorySpendBetween(transactions, startDate, endDate, divisor = null) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totals = new Map();
  for (const tx of transactions) {
    const date = new Date(tx.date);
    if (date < start || date >= end) continue;
    const category = tx.category || "General";
    totals.set(category, (totals.get(category) || 0) + netAmount(tx));
  }
  const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0);
  return [...totals.entries()]
    .map(([label, amount]) => {
      const adjusted = divisor ? amount / divisor : amount;
      return {
        label,
        amount: adjusted,
        percent: total > 0 ? amount / total : 0
      };
    })
    .filter((point) => point.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function financialYearCategorySpend(transactions, startYear) {
  const start = new Date(startYear, 3, 1);
  const end = new Date(startYear + 1, 3, 1);
  return categorySpendBetween(transactions, start, end);
}

export function sixMonthAverageSpend(transactions, anchor = new Date()) {
  const current = monthStart(anchor);
  const start = addMonths(current, -6);
  return categorySpendBetween(transactions, start, current, 6);
}

export function categoryTrend(transactions, category, anchor = new Date(), months = 12) {
  const start = addMonths(anchor, -(months - 1));
  return Array.from({ length: months }, (_, index) => {
    const month = addMonths(start, index);
    return {
      label: new Intl.DateTimeFormat("en-IN", { month: "short" }).format(month),
      amount: transactions
        .filter((tx) => sameMonth(tx.date, month) && String(tx.category || "General") === category)
        .reduce((sum, tx) => sum + netAmount(tx), 0)
    };
  });
}

export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function monthInputValue(date = new Date()) {
  const d = monthStart(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function fromMonthInput(value) {
  if (!value) return monthStart(new Date());
  const [year, month] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month) return monthStart(new Date());
  return new Date(year, month - 1, 1);
}
