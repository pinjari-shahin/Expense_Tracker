import React, { useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  FileText,
  Plus,
  Trash2,
  WalletCards,
} from "lucide-react";
import { categories, seedTransactions } from "./data.js";
import { db, isFirebaseConfigured } from "./firebase.js";
import { currency, downloadText, isoToday, monthKey, toCsv } from "./utils.js";

const emptyForm = {
  type: "expense",
  title: "",
  category: "Food",
  amount: "",
  date: isoToday(),
};

export default function App() {
  const [transactions, setTransactions] = useState(seedTransactions);
  const [form, setForm] = useState(emptyForm);
  const [budget, setBudget] = useState(2600);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const transactionsQuery = query(
      collection(db, "transactions"),
      orderBy("date", "desc")
    );

    return onSnapshot(transactionsQuery, (snapshot) => {
      const next = snapshot.docs.map((entry) => ({
        id: entry.id,
        ...entry.data(),
      }));
      setTransactions(next);
    });
  }, []);

  const totals = useMemo(() => {
    const income = transactions
      .filter((item) => item.type === "income")
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const expense = transactions
      .filter((item) => item.type === "expense")
      .reduce((sum, item) => sum + Number(item.amount), 0);
    return {
      income,
      expense,
      balance: income - expense,
      budgetLeft: budget - expense,
      usage: budget ? Math.min(100, Math.round((expense / budget) * 100)) : 0,
    };
  }, [transactions, budget]);

  const monthly = useMemo(() => {
    const grouped = new Map();
    transactions.forEach((item) => {
      const key = monthKey(item.date);
      const current = grouped.get(key) || { income: 0, expense: 0 };
      current[item.type] += Number(item.amount);
      grouped.set(key, current);
    });
    return Array.from(grouped.entries()).reverse();
  }, [transactions]);

  const categorySpend = useMemo(() => {
    const grouped = new Map();
    transactions
      .filter((item) => item.type === "expense")
      .forEach((item) => {
        grouped.set(
          item.category,
          (grouped.get(item.category) || 0) + Number(item.amount)
        );
      });
    return Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  const insights = useMemo(() => {
    const topCategory = categorySpend[0];
    const savingsRate = totals.income
      ? Math.round((totals.balance / totals.income) * 100)
      : 0;

    return [
      topCategory
        ? `${topCategory[0]} is your largest expense category at ${currency(
            topCategory[1]
          )}.`
        : "Add expenses to unlock category insights.",
      totals.budgetLeft >= 0
        ? `${currency(totals.budgetLeft)} remains in this month's budget.`
        : `You are ${currency(Math.abs(totals.budgetLeft))} over budget.`,
      `Current savings rate is ${savingsRate}%.`,
    ];
  }, [categorySpend, totals]);

  async function handleSubmit(event) {
    event.preventDefault();
    const next = {
      ...form,
      amount: Number(form.amount),
      id: crypto.randomUUID(),
    };

    if (isFirebaseConfigured) {
      await addDoc(collection(db, "transactions"), {
        type: next.type,
        title: next.title,
        category: next.category,
        amount: next.amount,
        date: next.date,
      });
    } else {
      setTransactions((current) => [next, ...current]);
    }

    setForm(emptyForm);
    setStatus("Transaction added");
  }

  async function removeTransaction(id) {
    if (isFirebaseConfigured && !id.startsWith("seed-")) {
      await deleteDoc(doc(db, "transactions", id));
    } else {
      setTransactions((current) => current.filter((item) => item.id !== id));
    }
  }

  function exportCsv() {
    downloadText("expense-report.csv", toCsv(transactions), "text/csv");
  }

  function exportPdf() {
    const pdf = new jsPDF();
    pdf.setFontSize(18);
    pdf.text("Expense Tracker Report", 14, 18);
    pdf.setFontSize(11);
    pdf.text(`Income: ${currency(totals.income)}`, 14, 30);
    pdf.text(`Expenses: ${currency(totals.expense)}`, 74, 30);
    pdf.text(`Balance: ${currency(totals.balance)}`, 144, 30);
    autoTable(pdf, {
      startY: 40,
      head: [["Date", "Type", "Title", "Category", "Amount"]],
      body: transactions.map((item) => [
        item.date,
        item.type,
        item.title,
        item.category,
        currency(item.amount),
      ]),
    });
    pdf.save("expense-report.pdf");
  }
  const incomeExpenseData = {
    labels: ["Income", "Expenses"],
    datasets: [
      {
        data: [totals.income, totals.expense],
        backgroundColor: ["#ffb6c1", "mediumturquoise"],
        borderWidth: 0,
      },
    ],
  };

  const monthlyData = {
    labels: monthly.map(([label]) => label),
    datasets: [
      {
        label: "Income",
        data: monthly.map(([, value]) => value.income),
        borderColor: "#ffb6c1",
        backgroundColor: "rgba(255, 182, 193, 0.16)",
        tension: 0.35,
      },
      {
        label: "Expenses",
        data: monthly.map(([, value]) => value.expense),
        borderColor: "mediumturquoise",
        backgroundColor: "rgba(72, 209, 204, 0.16)",
        tension: 0.35,
      },
    ],
  };

  const categoryData = {
    labels: categorySpend.map(([label]) => label),
    datasets: [
      {
        label: "Spend",
        data: categorySpend.map(([, value]) => value),
        backgroundColor: ["#0d6efd", "#20c997", "#ffc107", "#d63384", "#6f42c1"],
        borderRadius: 6,
      },
    ],
  };

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Budget Insights</p>
          <h1>Expense Tracker</h1>
        </div>
        <div className="export-actions">
          <button type="button" onClick={exportCsv} title="Export CSV">
            <Download size={18} />
           CSV
          </button>
          <button type="button" onClick={exportPdf} title="Export PDF">
            <FileText size={18} />
            PDF
          </button>
        </div>
      </section>

      <section className="summary-grid">
        <Metric
          icon={<ArrowUpCircle />}
          label="Income"
          value={currency(totals.income)}
        />
        <Metric
          icon={<ArrowDownCircle />}
          label="Expenses"
          value={currency(totals.expense)}
        />
        <Metric
          icon={<WalletCards />}
          label="Balance"
          value={currency(totals.balance)}
        />
      </section>

      <section className="workspace-grid">
        <form className="panel transaction-form" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <h2>Add Transaction</h2>
            <span>{isFirebaseConfigured ? "Firebase sync" : "Local mode"}</span>
          </div>

          <label>
            Type
            <select
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({ ...current, type: event.target.value }))
              }
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>

          <label>
            Title
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Groceries, salary, rent..."
              required
            />
          </label>

          <div className="form-row">
            <label>
              Category
              <select
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
              >
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input
                type="number"
                min="1"
                step="0.01"
                value={form.amount}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
                required
              />
            </label>
          </div>

          <label>
            Date
            <input
              type="date"
              value={form.date}
              onChange={(event) =>
                setForm((current) => ({ ...current, date: event.target.value }))
              }
              required
            />
          </label>

          <button className="primary-action" type="submit">
            <Plus size={18} />
            Add
          </button>
          <p className="status-line">{status}</p>
        </form>

        <section className="panel budget-panel">
          <div className="panel-heading">
            <h2>Monthly Budget</h2>
            <strong>{currency(budget)}</strong>
          </div>
          <input
            className="budget-slider"
            type="range"
            min="500"
            max="10000"
            step="100"
            value={budget}
            onChange={(event) => setBudget(Number(event.target.value))}
          />
          <div className="progress-track">
            <span style={{ width: `${totals.usage}%` }} />
          </div>
          <p>
            {totals.usage}% used, {currency(totals.budgetLeft)} remaining
          </p>
          <div className="insight-list">
            {insights.map((insight) => (
              <p key={insight}>{insight}</p>
            ))}
          </div>
        </section>

        <section className="panel chart-panel">
          <div className="panel-heading">
            <h2>Income vs. Expense</h2>
          </div>
          <Doughnut data={incomeExpenseData} options={chartOptions} />
        </section>

        <section className="panel wide-panel">
          <div className="panel-heading">
            <h2>Monthly Report</h2>
          </div>
          <Line data={monthlyData} options={chartOptions} />
        </section>

        <section className="panel wide-panel">
          <div className="panel-heading">
            <h2>Category Spend</h2>
          </div>
          <Bar data={categoryData} options={chartOptions} />
        </section>

        <section className="panel table-panel">
          <div className="panel-heading">
            <h2>Transactions</h2>
            <span>{transactions.length} records</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((item) => (
                  <tr key={item.id}>
                    <td>{item.date}</td>
                    <td>{item.title}</td>
                    <td>{item.category}</td>
                    <td>
                      <span className={`type-pill ${item.type}`}>
                        {item.type}
                      </span>
                    </td>
                    <td>{currency(item.amount)}</td>
                    <td>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => removeTransaction(item.id)}
                        title="Delete transaction"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }) {
  return (
    <article className="metric-card">
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        boxWidth: 12,
        color: "#27313f",
        font: { family: "Inter, system-ui, sans-serif" },
      },
    },
  },
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: true, grid: { color: "#edf0f4" } },
  },
};
