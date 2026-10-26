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
                  </small>
                </div>
              </div>
              <div class="card-actions">
                <button class="small-btn" data-edit-goal="${esc(goal.id)}">Edit</button>
                <button class="small-btn delete" data-delete-goal="${esc(goal.id)}">×</button>
              </div>
            </div>

            <div class="goal-meta">
              <span>${money(goal.saved)} saved</span>
              <span>${money(goal.target)} target</span>
            </div>

            <div class="goal-progress">
              <span style="width:${percentage}%"></span>
            </div>

            <div class="goal-meta">
              <b>${done ? 'Goal reached!' : `${Math.round(percentage)}% complete`}</b>
              <span>${money(Math.max(0, goal.target - goal.saved))} to go</span>
            </div>

            <div class="goal-actions">
              <button class="secondary-btn" data-contribute-goal="${esc(goal.id)}">
                ＋ Add savings
              </button>
            </div>
          </article>
        `;
      }).join('')
    : emptyState('No goals yet. Create a savings goal to track your progress.');
}

function reportTransactions() {
  const now = new Date();
  const period = $('#reportPeriod').value;

  return state.transactions.filter(transaction => {
    const date = new Date(`${transaction.date}T12:00:00`);

    if (period === 'month') {
      return monthKey(transaction.date) === monthKey(todayISO());
    }

    if (period === 'lastMonth') {
      const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const key = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
      return monthKey(transaction.date) === key;
    }

    if (period === 'year') {
      return date.getFullYear() === now.getFullYear();
    }

    return true;
  });
}

function renderReports() {
  const transactions = reportTransactions();
  const currentTotals = totals(transactions);

  $('#reportIncome').textContent = money(currentTotals.income);
  $('#reportExpense').textContent = money(currentTotals.expense);
  $('#reportNet').textContent = money(currentTotals.net);
  $('#reportCount').textContent = transactions.length;

  const categories = {};

  transactions
    .filter(transaction => transaction.type === 'expense')
    .forEach(transaction => {
      categories[transaction.category] =
        (categories[transaction.category] || 0) + moneyNum(transaction.amount);
    });

  const ranked = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const max = ranked[0]?.[1] || 1;

  $('#reportCategories').innerHTML = ranked.length
    ? ranked.map(([category, value]) => `
        <div class="report-category-row">
          <span class="cat-label">
            ${(CATEGORY_META[category] || CATEGORY_META.Other).icon} ${esc(category)}
          </span>
          <div class="progress-track">
            <div class="progress-fill"
                 style="width:${value / max * 100}%;background:${(CATEGORY_META[category] || CATEGORY_META.Other).color}"></div>
          </div>
          <strong>${money(value)}</strong>
        </div>
      `).join('')
    : emptyState('No expense data for this period.');

  const now = new Date();

  const keys = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });

  const monthly = keys.map(key => {
    const monthTransactions = state.transactions.filter(
      transaction => monthKey(transaction.date) === key
    );

    return {
      income: sum(monthTransactions, transaction => transaction.type === 'income'),
      expense: sum(monthTransactions, transaction => transaction.type === 'expense')
    };
  });

  if (window.Chart) {
    if (reportChart) reportChart.destroy();

    reportChart = new Chart($('#reportChart'), {
      type: 'bar',
      data: {
        labels: keys.map(key =>
          new Date(`${key}-15T12:00:00`).toLocaleDateString(undefined, { month: 'short' })
        ),
        datasets: [
          {
            label: 'Income',
            data: monthly.map(item => item.income),
            backgroundColor: '#54d6a0',
            borderRadius: 4
          },
          {
            label: 'Expenses',
            data: monthly.map(item => item.expense),
            backgroundColor: '#9a83ff',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#b4bdce',
              boxWidth: 10,
              font: { size: 10 }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#9aa4b8' } },
          y: {
            beginAtZero: true,
            grid: { color: '#2a3141' },
            ticks: { color: '#9aa4b8', callback: compactMoney }
          }
        }
      }
    });

    $('#reportFallback').classList.add('hidden');
  }

  const top = ranked[0];
  const days = transactions.length
    ? new Set(transactions.map(transaction => transaction.date)).size
    : 0;

  const insights = [
    [
      '↗',
      'Net cash flow',
      `${currentTotals.net >= 0 ? 'You kept' : 'You spent more than you received'} ${money(Math.abs(currentTotals.net))} in the selected period.`
    ],
    [
      '◉',
      'Largest category',
      top
        ? `${top[0]} is your biggest expense category at ${money(top[1])}.`
        : 'Add expenses to discover your biggest category.'
    ],
    [
      '▦',
      'Activity',
      `${transactions.length} transaction${transactions.length === 1 ? '' : 's'} across ${days} active day${days === 1 ? '' : 's'} in this period.`
    ]
  ];

  $('#reportInsights').innerHTML = insights.map(item => `
    <div class="insight-card">
      <span>${item[0]}</span>
      <b>${item[1]}</b>
      <p>${item[2]}</p>
    </div>
  `).join('');
}

function renderSettings() {
  if (document.activeElement?.form?.id !== 'settingsForm') {
    $('#settingName').value = state.settings.name || '';
    $('#settingCurrency').value = state.settings.currency || 'INR';
    $('#settingOpening').value = moneyNum(state.settings.openingBalance);
  }
}

function openModal(title, content) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = content;
  $('#modalBackdrop').classList.remove('hidden');

  setTimeout(() => {
    $('#modalBody input:not([type=hidden]), #modalBody select')?.focus();
  }, 40);
}

function closeModal() {
  $('#modalBackdrop').classList.add('hidden');
  $('#modalBody').innerHTML = '';
}

function transactionForm(existing = {}) {
  const type = existing.type || 'expense';

  return `
    <form id="transactionForm">
      <div class="form-grid">
        <div class="form-field full">
          <label>Type</label>
          <div class="type-switch">
            <button type="button" data-form-type="expense"
              class="${type === 'expense' ? 'selected' : ''}">− Expense</button>
            <button type="button" data-form-type="income"
              class="${type === 'income' ? 'selected' : ''}">＋ Income</button>
          </div>
          <input type="hidden" id="txType" value="${type}">
        </div>

        <div class="form-field full">
          <label for="txTitle">Title *</label>
          <input id="txTitle" class="input-control" maxlength="80" required
            placeholder="e.g. Lunch with friends" value="${esc(existing.title || '')}">
        </div>

        <div class="form-field">
          <label for="txAmount">Amount *</label>
          <input id="txAmount" class="input-control" type="number"
            min="0.01" step="0.01" required placeholder="0.00"
            value="${existing.amount ?? ''}">
        </div>

        <div class="form-field">
          <label for="txDate">Date *</label>
          <input id="txDate" class="input-control" type="date" required
            value="${esc(existing.date || todayISO())}">
        </div>

        <div class="form-field">
          <label for="txCategory">Category *</label>
          <select id="txCategory" class="select-control">
            ${categoryOptions(type, existing.category || CATEGORIES[type][0])}
          </select>
        </div>

        <div class="form-field">
          <label for="txNote">Note (optional)</label>
          <input id="txNote" class="input-control" maxlength="160"
            placeholder="Add a short note" value="${esc(existing.note || '')}">
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="secondary-btn" data-cancel-modal>Cancel</button>
        <button class="primary-btn" type="submit">
          ${existing.id ? 'Save changes' : 'Save transaction'}
        </button>
      </div>
    </form>
  `;
}

function openTransactionModal(id = null) {
  const existing = id ? state.transactions.find(transaction => transaction.id === id) : null;

  openModal(
    existing ? 'Edit transaction' : 'Add transaction',
    transactionForm(existing || {})
  );

  $('#transactionForm').dataset.id = id || '';
}

function budgetForm(existing = {}) {
  const usedCategories = state.budgets
    .filter(budget => budget.id !== existing.id)
    .map(budget => budget.category);

  const options = CATEGORIES.expense.filter(category =>
    !usedCategories.includes(category) || category === existing.category
  );

  return `
    <form id="budgetForm">
      <div class="form-grid">
        <div class="form-field full">
          <label for="budgetCategory">Expense category *</label>
          <select id="budgetCategory" class="select-control" required>
            ${options.map(category => `
              <option ${category === existing.category ? 'selected' : ''}
                value="${esc(category)}">${esc(category)}</option>
            `).join('')}
          </select>
        </div>

        <div class="form-field full">
          <label for="budgetLimit">Monthly limit *</label>
          <input id="budgetLimit" class="input-control" type="number"
            min="0.01" step="0.01" required value="${existing.limit ?? ''}"
            placeholder="e.g. 2500">
        </div>
      </div>

      <p class="muted">Budget progress is calculated from expenses dated in the current month.</p>

      <div class="form-actions">
        <button type="button" class="secondary-btn" data-cancel-modal>Cancel</button>
        <button class="primary-btn" type="submit">
          ${existing.id ? 'Save budget' : 'Create budget'}
        </button>
      </div>
    </form>
  `;
}

function openBudgetModal(id = null) {
  const existing = id ? state.budgets.find(budget => budget.id === id) : null;

  openModal(
    existing ? 'Edit budget' : 'Create budget',
    budgetForm(existing || {})
  );

  $('#budgetForm').dataset.id = id || '';
}

function goalForm(existing = {}) {
  return `
    <form id="goalForm">
      <div class="form-grid">
        <div class="form-field full">
          <label for="goalName">Goal name *</label>
          <input id="goalName" class="input-control" maxlength="70" required
            placeholder="e.g. New laptop" value="${esc(existing.name || '')}">
        </div>

        <div class="form-field">
          <label for="goalTarget">Target amount *</label>
          <input id="goalTarget" class="input-control" type="number"
            min="0.01" step="0.01" required value="${existing.target ?? ''}"
            placeholder="e.g. 45000">
        </div>

        <div class="form-field">
          <label for="goalSavedInput">Already saved</label>
          <input id="goalSavedInput" class="input-control" type="number"
            min="0" step="0.01" value="${existing.saved ?? 0}">
        </div>

        <div class="form-field">
          <label for="goalDeadline">Target date (optional)</label>
          <input id="goalDeadline" class="input-control" type="date"
            value="${esc(existing.deadline || '')}">
        </div>

        <div class="form-field">
          <label for="goalIcon">Emoji (optional)</label>
          <input id="goalIcon" class="input-control" maxlength="8"
            value="${esc(existing.icon || '🎯')}" placeholder="🎯">
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="secondary-btn" data-cancel-modal>Cancel</button>
        <button class="primary-btn" type="submit">
          ${existing.id ? 'Save goal' : 'Create goal'}
        </button>
      </div>
    </form>
  `;
}

function openGoalModal(id = null) {
  const existing = id ? state.goals.find(goal => goal.id === id) : null;

  openModal(
    existing ? 'Edit savings goal' : 'Create savings goal',
    goalForm(existing || {})
  );

  $('#goalForm').dataset.id = id || '';
}

function openContributionModal(id) {
  const goal = state.goals.find(item => item.id === id);
  if (!goal) return;

  openModal('Add savings', `
    <form id="contributionForm" data-id="${esc(id)}">
      <p class="muted">
        Adding money to <b>${esc(goal.name)}</b>.
        Current saved amount: ${money(goal.saved)}.
      </p>

      <div class="form-field">
        <label for="contributionAmount">Contribution amount *</label>
        <input id="contributionAmount" class="input-control" type="number"
          min="0.01" step="0.01" required placeholder="0.00">
      </div>

      <div class="form-actions">
        <button type="button" class="secondary-btn" data-cancel-modal>Cancel</button>
        <button class="primary-btn" type="submit">Add savings</button>
      </div>
    </form>
  `);
}

function confirmDelete(message) {
  return window.confirm(message);
}

function deleteById(collection, id, label) {
  const index = state[collection].findIndex(item => item.id === id);
if (index < 0) return;

  if (!confirmDelete(`Delete this ${label}? This cannot be undone.`)) return;

  state[collection].splice(index, 1);
  saveState();
  renderAll();
  toast(`${label[0].toUpperCase() + label.slice(1)} deleted.`);
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadFile(name, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = name;

  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCSV() {
  const rows = [
    ['id', 'type', 'title', 'amount', 'currency', 'category', 'date', 'note'],
    ...state.transactions.map(transaction => [
      transaction.id,
      transaction.type,
      transaction.title,
      transaction.amount,
      state.settings.currency,
      transaction.category,
      transaction.date,
      transaction.note || ''
    ])
  ];
downloadFile(
    `pocketwise-transactions-${todayISO()}.csv`,
    '\ufeff' + rows.map(row => row.map(csvEscape).join(',')).join('\r\n'),
    'text/csv;charset=utf-8'
  );

  toast('CSV export downloaded.');
}

function exportBackup() {
  downloadFile(
    `pocketwise-backup-${todayISO()}.json`,
    JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2),
    'application/json'
  );

  toast('Backup downloaded.');
}

function importBackup(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

      if (
        !data ||
        !Array.isArray(data.transactions) ||
        !Array.isArray(data.budgets) ||
        !Array.isArray(data.goals) ||
        !data.settings
      ) {
        throw new Error('This does not look like a PocketWise backup.');
      }

      if (!confirmDelete(
        'Import this backup and replace the data currently stored in this browser?'
      )) {
        return;
      }

      state = {
        ...defaultState(),
        ...data,
        settings: { ...defaultState().settings, ...data.settings }
      };

      saveState();
      renderAll();
      toast('Backup restored successfully.');
    } catch (error) {
      toast(error.message || 'Could not read that backup file.', 'error');
    }

    $('#restoreInput').value = '';
  };

  reader.readAsText(file);
}
function initEvents() {
  $$('.nav-link[data-page]').forEach(button => {
    button.addEventListener('click', () => setPage(button.dataset.page));
  });

  $$('[data-go]').forEach(button => {
    button.addEventListener('click', () => setPage(button.dataset.go));
  });

  $('#menuBtn').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  $('#quickAddBtn').addEventListener('click', () => openTransactionModal());
  $('#addTransactionBtn').addEventListener('click', () => openTransactionModal());
  $('#addBudgetBtn').addEventListener('click', () => openBudgetModal());
  $('#addGoalBtn').addEventListener('click', () => openGoalModal());

  $('#closeModalBtn').addEventListener('click', closeModal);

  $('#modalBackdrop').addEventListener('click', event => {
    if (event.target === $('#modalBackdrop')) closeModal();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModal();
  });

  $('#dashboardPeriod').addEventListener('change', renderDashboard);

  [
    'transactionSearch',
    'typeFilter',
    'categoryFilter',
    'fromDateFilter',
    'toDateFilter'
  ].forEach(id => {
    const eventName = id === 'transactionSearch' ? 'input' : 'change';
    $('#' + id).addEventListener(eventName, renderTransactions);
  });

  $('#clearFiltersBtn').addEventListener('click', () => {
    $('#transactionSearch').value = '';
    $('#typeFilter').value = 'all';
    $('#categoryFilter').value = 'all';
    $('#fromDateFilter').value = '';
    $('#toDateFilter').value = '';

    renderTransactions();
  });

  $('#reportPeriod').addEventListener('change', renderReports);

  $('#settingsForm').addEventListener('submit', event => {
    event.preventDefault();

    state.settings.name = $('#settingName').value.trim() || 'Student';
    state.settings.currency = $('#settingCurrency').value;
    state.settings.openingBalance = Math.max(
      0,
      moneyNum($('#settingOpening').value)
    );

    saveState();
    renderAll();
    toast('Settings saved.');
  });

  $('#exportSideBtn').addEventListener('click', exportCSV);
  $('#exportReportBtn').addEventListener('click', exportCSV);
  $('#backupBtn').addEventListener('click', exportBackup);

  $('#restoreBtn').addEventListener('click', () => $('#restoreInput').click());

  $('#restoreInput').addEventListener('change', event => {
    importBackup(event.target.files[0]);
  });

  $('#clearDataBtn').addEventListener('click', () => {
    if (!confirmDelete(
      'This will permanently clear all PocketWise transactions, budgets, goals, and settings from this browser. Download a backup first if you need one. Continue?'
    )) {
      return;
    }

    state = defaultState();
    saveState();
    renderAll();
    setPage('dashboard');
    toast('All data cleared.');
  });

  $('#modalBody').addEventListener('click', event => {
    const typeButton = event.target.closest('[data-form-type]');

    if (typeButton) {
      const type = typeButton.dataset.formType;

      $('#txType').value = type;

      $$('[data-form-type]').forEach(button => {
        button.classList.toggle('selected', button.dataset.formType === type);
      });

      $('#txCategory').innerHTML = categoryOptions(type);
      return;
    }

    if (event.target.closest('[data-cancel-modal]')) {
      closeModal();
    }
  });

  document.addEventListener('click', event => {
    const editTransaction = event.target.closest('[data-edit-tx]');
    if (editTransaction) {
      openTransactionModal(editTransaction.dataset.editTx);
      return;
    }

    const deleteTransaction = event.target.closest('[data-delete-tx]');
    if (deleteTransaction) {
      deleteById('transactions', deleteTransaction.dataset.deleteTx, 'transaction');
      return;
    }

    const editBudget = event.target.closest('[data-edit-budget]');
    if (editBudget) {
      openBudgetModal(editBudget.dataset.editBudget);
      return;
    }

    const deleteBudget = event.target.closest('[data-delete-budget]');
    if (deleteBudget) {
      deleteById('budgets', deleteBudget.dataset.deleteBudget, 'budget');
      return;
    }

    const editGoal = event.target.closest('[data-edit-goal]');
    if (editGoal) {
      openGoalModal(editGoal.dataset.editGoal);
      return;
    }

    const deleteGoal = event.target.closest('[data-delete-goal]');
    if (deleteGoal) {
      deleteById('goals', deleteGoal.dataset.deleteGoal, 'savings goal');
      return;
    }

    const contributeGoal = event.target.closest('[data-contribute-goal]');
    if (contributeGoal) {
      openContributionModal(contributeGoal.dataset.contributeGoal);
    }
  });

  $('#modalBody').addEventListener('submit', event => {
    event.preventDefault();

    if (event.target.id === 'transactionForm') {
      const id = event.target.dataset.id;
      const type = $('#txType').value;
      const title = $('#txTitle').value.trim();
      const amount = Number($('#txAmount').value);
      const date = $('#txDate').value;
      const category = $('#txCategory').value;
      const note = $('#txNote').value.trim();

      if (!title || !Number.isFinite(amount) || amount <= 0 || !date) {
        toast('Please enter a title, valid positive amount, and date.', 'error');
        return;
      }

      const old = id
        ? state.transactions.find(transaction => transaction.id === id)
        : null;

      const item = {
        id: id || uid(),
        type,
        title,
        amount: Math.round(amount * 100) / 100,
        date,
        category,
        note,
        createdAt: old?.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      if (old) {
        const index = state.transactions.findIndex(transaction => transaction.id === id);
        state.transactions[index] = item;
      } else {
        state.transactions.push(item);
      }

      saveState();
      closeModal();
      renderAll();
      toast(old ? 'Transaction updated.' : 'Transaction saved.');
    }

    if (event.target.id === 'budgetForm') {
      const id = event.target.dataset.id;
      const category = $('#budgetCategory').value;
      const limit = Number($('#budgetLimit').value);

      if (!Number.isFinite(limit) || limit <= 0) {
        toast('Enter a budget limit greater than zero.', 'error');
        return;
      }

      if (state.budgets.some(budget =>
        budget.category === category && budget.id !== id
      )) {
        toast('A budget for this category already exists. Edit that one instead.', 'error');
        return;
      }

      const item = {
        id: id || uid(),
        category,
        limit: Math.round(limit * 100) / 100,
        updatedAt: Date.now()
      };

      if (id) {
        const index = state.budgets.findIndex(budget => budget.id === id);
        state.budgets[index] = item;
      } else {
        state.budgets.push(item);
      }

      saveState();
      closeModal();
      renderAll();
      toast(id ? 'Budget updated.' : 'Budget created.');
    }

    if (event.target.id === 'goalForm') {
      const id = event.target.dataset.id;
      const name = $('#goalName').value.trim();
      const target = Number($('#goalTarget').value);
      const saved = Number($('#goalSavedInput').value);
      const deadline = $('#goalDeadline').value;
      const icon = $('#goalIcon').value.trim() || '🎯';

      if (
        !name ||
        !Number.isFinite(target) ||
        target <= 0 ||
        !Number.isFinite(saved) ||
        saved < 0
      ) {
        toast('Enter a goal name, positive target, and non-negative saved amount.', 'error');
        return;
      }

      const item = {
        id: id || uid(),
        name,
        target: Math.round(target * 100) / 100,
        saved: Math.round(saved * 100) / 100,
        deadline,
        icon,
        updatedAt: Date.now()
      };

      if (id) {
        const index = state.goals.findIndex(goal => goal.id === id);
        state.goals[index] = item;
      } else {
        state.goals.push(item);
      }

      saveState();
      closeModal();
      renderAll();
      toast(id ? 'Goal updated.' : 'Goal created.');
    }

    if (event.target.id === 'contributionForm') {
      const goal = state.goals.find(
        item => item.id === event.target.dataset.id
      );

      const amount = Number($('#contributionAmount').value);

      if (!goal || !Number.isFinite(amount) || amount <= 0) {
        toast('Enter a contribution greater than zero.', 'error');
        return;
      }

      goal.saved = Math.round((moneyNum(goal.saved) + amount) * 100) / 100;
      goal.updatedAt = Date.now();

      saveState();
      closeModal();
      renderAll();
      toast('Savings contribution added.');
    }
  });
}

function init() {
  initEvents();
  $('#categoryFilter').innerHTML = allCategoryOptions();
  renderAll();

  if (!window.Chart) {
    $('#cashflowFallback').classList.remove('hidden');
    $('#categoryFallback').classList.remove('hidden');
    $('#reportFallback').classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', init);

