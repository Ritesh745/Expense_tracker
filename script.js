'use strict';

const STORAGE_KEY = 'pocketwise_student_tracker_v1';

const CATEGORIES = {
  expense: ['Food', 'Transport', 'Education', 'Shopping', 'Entertainment', 'Bills', 'Health', 'Personal care', 'Other'],
  income: ['Allowance', 'Salary', 'Scholarship', 'Freelance', 'Gift', 'Refund', 'Other']
};

const CATEGORY_META = {
  Food: { icon: '🍜', color: '#a18aff' },
  Transport: { icon: '🚌', color: '#63c9f2' },
  Education: { icon: '📚', color: '#f4b860' },
  Shopping: { icon: '🛍️', color: '#ff8da1' },
  Entertainment: { icon: '🎮', color: '#66d6aa' },
  Bills: { icon: '🧾', color: '#9aa9ff' },
  Health: { icon: '🩺', color: '#f38bce' },
  'Personal care': { icon: '🧴', color: '#d6a0ff' },
  Other: { icon: '✦', color: '#8d99aa' },
  Allowance: { icon: '💸', color: '#64d8a4' },
  Salary: { icon: '💼', color: '#64d8a4' },
  Scholarship: { icon: '🎓', color: '#64d8a4' },
  Freelance: { icon: '💻', color: '#64d8a4' },
  Gift: { icon: '🎁', color: '#64d8a4' },
  Refund: { icon: '↩️', color: '#64d8a4' }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const uid = () => (
  window.crypto && window.crypto.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`
);

const todayISO = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const monthKey = date => String(date || '').slice(0, 7);
const moneyNum = value => Number.isFinite(Number(value)) ? Number(value) : 0;

let state = loadState();
let cashflowChart = null;
let categoryChart = null;
let reportChart = null;
let currentPage = 'dashboard';

function defaultState() {
  return {
    version: 1,
    settings: {
      name: 'Student',
      currency: 'INR',
      openingBalance: 0
    },
    transactions: [],
    budgets: [],
    goals: []
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return defaultState();

    const parsed = JSON.parse(saved);
    const defaults = defaultState();

    return {
      ...defaults,
      ...parsed,
      settings: { ...defaults.settings, ...(parsed.settings || {}) },
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : []
    };
  } catch (error) {
    console.error('Could not load PocketWise data:', error);
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error(error);
    toast('Could not save data. Your browser storage may be full.', 'error');
    return false;
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function money(value) {
  const currency = state.settings.currency || 'INR';

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(moneyNum(value));
  } catch {
    return `${currency} ${moneyNum(value).toFixed(2)}`;
  }
}

function toast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type === 'error' ? 'error' : ''}`;
  item.textContent = message;

  $('#toastRegion').append(item);
  setTimeout(() => item.remove(), 3200);
}

function dateLabel(value) {
  if (!value) return 'No date';

  const date = new Date(`${value}T12:00:00`);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
}

function currentMonthTransactions() {
  const key = monthKey(todayISO());
  return state.transactions.filter(t => monthKey(t.date) === key);
}

function sum(items, predicate) {
  return items.reduce(
    (total, item) => total + (predicate(item) ? moneyNum(item.amount) : 0),
    0
  );
}

function spentForCategory(category, month = monthKey(todayISO())) {
  return sum(
    state.transactions,
    t => t.type === 'expense' &&
      t.category === category &&
      monthKey(t.date) === month
  );
}

function totals(items) {
  const income = sum(items, t => t.type === 'income');
  const expense = sum(items, t => t.type === 'expense');

  return { income, expense, net: income - expense };
}

function transactionIcon(transaction) {
  return (CATEGORY_META[transaction.category] || CATEGORY_META.Other).icon;
}

function emptyState(message) {
  return `<div class="empty-state">${esc(message)}</div>`;
}

function categoryOptions(type, selected = '') {
  return (CATEGORIES[type] || CATEGORIES.expense)
    .map(category => `
      <option value="${esc(category)}" ${category === selected ? 'selected' : ''}>
        ${esc(category)}
      </option>
    `)
    .join('');
}

function allCategoryOptions(selected = 'all') {
  const all = [...new Set([...CATEGORIES.expense, ...CATEGORIES.income])];

  return `<option value="all">All categories</option>` +
    all.map(category => `
      <option value="${esc(category)}" ${category === selected ? 'selected' : ''}>
        ${esc(category)}
      </option>
    `).join('');
}

function setPage(page) {
  if (!$('#page-' + page)) return;

  currentPage = page;

  $$('.page').forEach(element => {
    element.classList.toggle('active', element.id === `page-${page}`);
  });

  $$('.nav-link[data-page]').forEach(element => {
    element.classList.toggle('active', element.dataset.page === page);
  });

  const titles = {
    dashboard: 'Dashboard',
    transactions: 'Transactions',
    budgets: 'Budgets',
    savings: 'Savings goals',
    reports: 'Reports',
    settings: 'Settings'
  };

  $('#pageTitle').textContent = titles[page] || 'Dashboard';
  $('#sidebar').classList.remove('open');

  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAll() {
  $('#headerDate').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  $('#welcomeTitle').textContent =
    `${state.settings.name ? `Hello, ${state.settings.name}` : 'Hello'} 👋`;

  renderDashboard();
  renderTransactions();
  renderBudgets();
  renderGoals();
  renderReports();
  renderSettings();
}

function transactionsForDashboard() {
  return $('#dashboardPeriod')?.value === 'all'
    ? state.transactions
    : currentMonthTransactions();
}

function renderDashboard() {
  const transactions = transactionsForDashboard();
  const currentTotals = totals(transactions);
  const balance = moneyNum(state.settings.openingBalance) +
    totals(state.transactions).net;

  $('#statBalance').textContent = money(balance);
  $('#statIncome').textContent = money(currentTotals.income);
  $('#statExpense').textContent = money(currentTotals.expense);

  $('#statSavingsRate').textContent = currentTotals.income > 0
    ? `${Math.round(
        (currentTotals.income - currentTotals.expense) /
        currentTotals.income * 100
      )}%`
    : '0%';

  $('#balanceCaption').textContent = 'Opening balance + all recorded activity';

  $('#expenseCaption').textContent =
    $('#dashboardPeriod').value === 'all'
      ? 'All recorded expenses'
      : 'This month';

  const recent = [...state.transactions]
    .sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') ||
      (b.createdAt || 0) - (a.createdAt || 0)
    )
    .slice(0, 5);

  $('#recentTransactions').innerHTML = recent.length
    ? recent.map(transactionRow).join('')
    : emptyState('No transactions yet. Add your first one to get started.');

  renderDashboardBudgets();
  renderDashboardGoals();
  renderCharts();
}

function transactionRow(transaction) {
  return `
    <div class="transaction-row">
      <div class="transaction-icon">${transactionIcon(transaction)}</div>
      <div class="transaction-main">
        <b>${esc(transaction.title)}</b>
        <small>${esc(transaction.category)} · ${dateLabel(transaction.date)}</small>
      </div>
      <span class="amount ${transaction.type}">
        ${transaction.type === 'income' ? '+' : '−'}${money(transaction.amount)}
      </span>
    </div>
  `;
}

function renderDashboardBudgets() {
  const budgets = state.budgets.slice(0, 4);

  $('#dashboardBudgets').innerHTML = budgets.length
    ? budgets.map(budget => {
        const spent = spentForCategory(budget.category);
        const percentage = budget.limit > 0
          ? Math.min(100, spent / budget.limit * 100)
          : 0;

        return `
          <div>
            <div class="mini-progress-head">
              <b>${esc(budget.category)}</b>
              <span>${money(spent)} / ${money(budget.limit)}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill ${percentage > 90 ? '' : 'green-fill'}"
                   style="width:${percentage}%"></div>
            </div>
          </div>
        `;
      }).join('')
    : emptyState('No budgets yet. Create a limit for a spending category.');
}

function renderDashboardGoals() {
  const goals = state.goals.slice(0, 3);

  $('#dashboardGoals').innerHTML = goals.length
    ? goals.map(goal => {
        const percentage = goal.target > 0
          ? Math.min(100, goal.saved / goal.target * 100)
          : 0;

        return `
          <div>
            <div class="mini-progress-head">
              <b>${esc(goal.name)}</b>
              <span>${Math.round(percentage)}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill green-fill" style="width:${percentage}%"></div>
            </div>
          </div>
        `;
      }).join('')
    : emptyState('No savings goals yet. Add something you are saving for.');
}

function compactMoney(value) {
  const number = Number(value) || 0;

  if (number >= 100000) return `${(number / 100000).toFixed(1)}L`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}k`;

  return number;
}

function renderCharts() {
  const transactions = transactionsForDashboard();
  const byMonth = {};

  transactions.forEach(transaction => {
    const key = monthKey(transaction.date);
    if (!key) return;

    byMonth[key] ||= { income: 0, expense: 0 };
    byMonth[key][transaction.type] += moneyNum(transaction.amount);
  });

  let keys = Object.keys(byMonth).sort().slice(-6);

  if (!keys.length) {
    const now = new Date();

    keys = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    });
  }

  const labels = keys.map(key =>
    new Date(`${key}-15T12:00:00`).toLocaleDateString(undefined, { month: 'short' })
  );

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#9aa4b8', font: { size: 10 } }
      },
      y: {
        grid: { color: '#2a3141' },
        ticks: {
          color: '#9aa4b8',
          font: { size: 10 },
          callback: value => compactMoney(value)
        }
      }
    }
  };

  if (!window.Chart) {
    $('#cashflowFallback').classList.remove('hidden');
    $('#categoryFallback').classList.remove('hidden');
    return;
  }

  if (cashflowChart) cashflowChart.destroy();

  cashflowChart = new Chart($('#cashflowChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: keys.map(key => byMonth[key]?.income || 0),
          backgroundColor: '#54d6a0',
          borderRadius: 5
        },
        {
          label: 'Expenses',
          data: keys.map(key => byMonth[key]?.expense || 0),
          backgroundColor: '#9a83ff',
          borderRadius: 5
        }
      ]
    },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: { ...commonOptions.scales.y, beginAtZero: true }
      }
    }
  });

  const expenses = transactions
    .filter(transaction => transaction.type === 'expense')
    .reduce((result, transaction) => {
      result[transaction.category] =
        (result[transaction.category] || 0) + moneyNum(transaction.amount);
      return result;
    }, {});

  const categories = Object.entries(expenses)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (categoryChart) {
    categoryChart.destroy();
    categoryChart = null;
  }

  if (categories.length) {
    categoryChart = new Chart($('#categoryChart'), {
      type: 'doughnut',
      data: {
        labels: categories.map(item => item[0]),
        datasets: [{
          data: categories.map(item => item[1]),
          backgroundColor: categories.map(item =>
            (CATEGORY_META[item[0]] || CATEGORY_META.Other).color
          ),
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: { legend: { display: false } }
      }
    });

    $('#categoryFallback').classList.add('hidden');
  } else {
    $('#categoryFallback').classList.remove('hidden');
  }

  $('#categoryLegend').innerHTML = categories.map(([name, value]) => `
    <div class="legend-item">
      <i class="legend-dot"
         style="background:${(CATEGORY_META[name] || CATEGORY_META.Other).color}"></i>
      <span>${esc(name)}</span>
      <b>${money(value)}</b>
    </div>
  `).join('');
}

function renderTransactions() {
  const categoryFilter = $('#categoryFilter');
  const currentCategory = categoryFilter.value || 'all';

  categoryFilter.innerHTML = allCategoryOptions(currentCategory);

  const query = $('#transactionSearch').value.trim().toLowerCase();
  const type = $('#typeFilter').value;
  const category = categoryFilter.value;
  const from = $('#fromDateFilter').value;
  const to = $('#toDateFilter').value;

  const filtered = [...state.transactions]
    .filter(transaction =>
      (type === 'all' || transaction.type === type) &&
      (category === 'all' || transaction.category === category) &&
      (!from || transaction.date >= from) &&
      (!to || transaction.date <= to) &&
      (!query || `${transaction.title} ${transaction.category} ${transaction.note || ''}`
        .toLowerCase().includes(query))
    )
    .sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') ||
      (b.createdAt || 0) - (a.createdAt || 0)
    );

  const total = totals(filtered);

  $('#transactionSummary').textContent =
    `${filtered.length} transaction${filtered.length === 1 ? '' : 's'} · ` +
    `Income ${money(total.income)} · Expenses ${money(total.expense)}`;

  $('#transactionsTable').innerHTML = filtered.length
    ? `
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>DESCRIPTION</th>
              <th>DATE</th>
              <th>TYPE</th>
              <th>AMOUNT</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(transaction => `
              <tr>
                <td>
                  <span class="table-title">${esc(transaction.title)}</span>
                  <span class="table-sub">
                    ${esc(transaction.category)}
                    ${transaction.note ? ' · ' + esc(transaction.note) : ''}
                  </span>
                </td>
                <td>${dateLabel(transaction.date)}</td>
                <td>
                  ${transaction.type === 'income'
                    ? '<span class="amount income">Income</span>'
                    : '<span class="amount expense">Expense</span>'}
                </td>
                <td class="amount ${transaction.type}">
                  ${transaction.type === 'income' ? '+' : '−'}${money(transaction.amount)}
                </td>
                <td>
                  <div class="row-actions">
                    <button class="small-btn" data-edit-tx="${esc(transaction.id)}">Edit</button>
                    <button class="small-btn delete" data-delete-tx="${esc(transaction.id)}">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
    : emptyState('No transactions match these filters.');
}

function renderBudgets() {
  const spent = state.budgets.reduce(
    (total, budget) => total + spentForCategory(budget.category), 0
  );

  const limit = state.budgets.reduce(
    (total, budget) => total + moneyNum(budget.limit), 0
  );

  $('#budgetTotal').textContent = money(limit);
  $('#budgetSpent').textContent = money(spent);
  $('#budgetRemaining').textContent = money(limit - spent);

  $('#budgetsList').innerHTML = state.budgets.length
    ? state.budgets.map(budget => {
        const used = spentForCategory(budget.category);
        const percentage = budget.limit > 0 ? used / budget.limit * 100 : 0;
        const over = used > budget.limit;

        return `
          <article class="budget-card">
            <div class="budget-card-top">
              <div class="item-title">
                <div class="transaction-icon">
                  ${(CATEGORY_META[budget.category] || CATEGORY_META.Other).icon}
                </div>
                <div>
                  <b>${esc(budget.category)}</b>
                  <small>Monthly spending limit</small>
                </div>
              </div>
              <div class="card-actions">
                <button class="small-btn" data-edit-budget="${esc(budget.id)}">Edit</button>
                <button class="small-btn delete" data-delete-budget="${esc(budget.id)}">×</button>
              </div>
            </div>

            <div class="budget-numbers">
              <b>${money(used)} <span>spent</span></b>
              <span>Limit ${money(budget.limit)}</span>
            </div>

            <div class="progress-track">
              <div class="progress-fill ${over ? '' : 'green-fill'}"
                   style="width:${Math.min(100, percentage)}%;${over ? 'background:var(--red)' : ''}"></div>
            </div>

            <p class="${over ? 'budget-warning' : 'muted'}">
              ${over
                ? `Over budget by ${money(used - budget.limit)}`
                : `${money(budget.limit - used)} remaining · ${Math.round(percentage)}% used`}
            </p>
          </article>
        `;
      }).join('')
    : emptyState('No budgets created yet. Use “Create budget” to set a limit.');
}

function renderGoals() {
  const target = state.goals.reduce((total, goal) => total + moneyNum(goal.target), 0);
  const saved = state.goals.reduce((total, goal) => total + moneyNum(goal.saved), 0);

  $('#goalTotal').textContent = money(target);
  $('#goalSaved').textContent = money(saved);
  $('#goalRemaining').textContent = money(Math.max(0, target - saved));

  $('#goalsList').innerHTML = state.goals.length
    ? state.goals.map(goal => {
        const percentage = goal.target > 0
          ? Math.min(100, goal.saved / goal.target * 100)
          : 0;

        const done = percentage >= 100;

        return `
          <article class="goal-card">
            <div class="goal-card-top">
              <div class="item-title">
                <div class="transaction-icon">${esc(goal.icon || '🎯')}</div>
                <div>
                  <b>${esc(goal.name)}</b>
                  <small>
                    ${goal.deadline
                      ? `Target date: ${dateLabel(goal.deadline)}`
                      : 'No target date set'}
          