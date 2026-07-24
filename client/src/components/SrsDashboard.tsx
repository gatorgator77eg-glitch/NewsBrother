import { useState, useEffect, useCallback } from 'react';
import {
  getSrsPortfolio, updateSrsCash, buySrsHolding, sellSrsHolding,
  getSrsTransactions, getSrsSignals, refreshSrsSignals, getSrsMacro,
  refreshSrsMacro,
} from '../api';

interface Props { onBack: () => void; }

type Tab = 'portfolio' | 'signals' | 'macro' | 'transactions';

interface Account {
  cash_balance: number;
  total_deposited: number;
  holdings_value: number;
  total_value: number;
  unrealized_pnl: number;
  total_return: number;
  return_pct: number;
}

interface Holding {
  id: number;
  product_id: string;
  product_name: string;
  product_type: string;
  quantity: number;
  average_cost: number;
  current_price: number;
  cost_basis: number;
  market_value: number;
  unrealized_pnl: number;
  pnl_pct: number;
}

interface Signal {
  id: number;
  signal_type: string;
  product_type: string;
  product_id: string;
  product_name: string;
  rationale: string;
  strength: number;
  target_amount: number;
  status: string;
  created_at: string;
}

interface Transaction {
  id: number;
  type: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  total_amount: number;
  created_at: string;
}

interface MacroRates {
  [key: string]: { value: number; date: string; source: string };
}

const SIGNAL_LABELS: Record<string, string> = {
  idle_cash_buy: 'Idle Cash',
  momentum_buy: 'Momentum',
  momentum_sell: 'Momentum',
  valuation_buy: 'Valuation',
  valuation_sell: 'Valuation',
  inflation_warning: 'Inflation',
  negative_real_return: 'Real Return',
  low_sharpe_sell: 'Sharpe',
  high_sharpe_buy: 'Sharpe',
};

const MACRO_LABELS: Record<string, string> = {
  srs_base_rate: 'SRS Base Rate',
  tbill_6m: '6M T-Bill Yield',
  tbill_1y: '1Y T-Bill Yield',
  sora_overnight: 'SORA Overnight',
  sora_1m: 'SORA 1M',
  sora_3m: 'SORA 3M',
  mas_core_inflation: 'MAS Core Inflation',
  cpi_all_items: 'CPI All Items',
  ssb_1y_ytm: 'SSB 1Y YTM',
  ssb_10y_ytm: 'SSB 10Y YTM',
  fd_6m_dbs: 'DBS FD 6M',
  fd_12m_dbs: 'DBS FD 12M',
};

function strengthColor(s: number): string {
  if (s >= 0.7) return 'text-red-400';
  if (s >= 0.4) return 'text-yellow-400';
  return 'text-green-400';
}

function signalIcon(s: string): string {
  if (s.includes('buy')) return '🟢';
  if (s.includes('sell')) return '🔴';
  return '🟡';
}

export default function SrsDashboard({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('portfolio');
  const [account, setAccount] = useState<Account | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [macro, setMacro] = useState<MacroRates>({});
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [macroRefreshing, setMacroRefreshing] = useState(false);

  // Buy form
  const [buyIsin, setBuyIsin] = useState('');
  const [buyName, setBuyName] = useState('');
  const [buyQty, setBuyQty] = useState('');
  const [buyPrice, setBuyPrice] = useState('');

  // Sell form
  const [sellId, setSellId] = useState<number | null>(null);
  const [sellQty, setSellQty] = useState('');
  const [sellPrice, setSellPrice] = useState('');

  // Cash edit
  const [cashEdit, setCashEdit] = useState('');
  const [editingCash, setEditingCash] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([
        getSrsPortfolio(),
        getSrsTransactions(20),
      ]);
      setAccount(p.account);
      setHoldings(p.holdings || []);
      setTransactions(t.transactions || []);
    } catch {}
    setLoading(false);
  }, []);

  const loadSignals = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([getSrsSignals(), getSrsMacro()]);
      setSignals(s.signals || []);
      setMacro(m.rates || {});
    } catch {}
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (tab === 'signals') loadSignals(); }, [tab, loadSignals]);

  const handleRefreshSignals = async () => {
    setRefreshing(true);
    try {
      const result = await refreshSrsSignals();
      setSignals(result.signals || []);
    } catch {}
    setRefreshing(false);
  };

  const handleRefreshMacro = async () => {
    setMacroRefreshing(true);
    try {
      await refreshSrsMacro();
      const m = await getSrsMacro();
      setMacro(m.rates || {});
    } catch {}
    setMacroRefreshing(false);
  };

  const handleBuy = async () => {
    if (!buyIsin || !buyName || !buyQty || !buyPrice) return;
    await buySrsHolding(buyIsin, buyName, parseFloat(buyQty), parseFloat(buyPrice));
    setBuyIsin(''); setBuyName(''); setBuyQty(''); setBuyPrice('');
    loadData();
  };

  const handleSell = async () => {
    if (sellId === null || !sellQty || !sellPrice) return;
    await sellSrsHolding(sellId, parseFloat(sellQty), parseFloat(sellPrice));
    setSellId(null); setSellQty(''); setSellPrice('');
    loadData();
  };

  const handleCashUpdate = async () => {
    const val = parseFloat(cashEdit);
    if (isNaN(val) || val < 0) return;
    await updateSrsCash(val);
    setEditingCash(false);
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const totalValue = (account?.total_value || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">SRS Decision Engine</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Portfolio management, buy/sell signals & macro rates</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total SRS Value</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">S${totalValue.toFixed(0)}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Cash Balance</div>
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400">S${(account?.cash_balance || 0).toFixed(0)}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Portfolio Value</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">S${(account?.holdings_value || 0).toFixed(0)}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">P&L</div>
          <div className={`text-xl font-bold ${(account?.unrealized_pnl || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {(account?.unrealized_pnl || 0) >= 0 ? '+' : ''}S${(account?.unrealized_pnl || 0).toFixed(0)}
            <span className="text-sm ml-1">({(account?.return_pct || 0).toFixed(1)}%)</span>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {(['portfolio', 'signals', 'macro', 'transactions'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {t === 'portfolio' ? '💼 Portfolio' : t === 'signals' ? '⚡ Signals' : t === 'macro' ? '🌍 Macro' : '📜 Transactions'}
          </button>
        ))}
      </div>

      {/* ── Portfolio Tab ─────────────────────────────────────── */}
      {tab === 'portfolio' && (
        <div className="space-y-4">
          {/* Cash Balance */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Cash Balance</h3>
              {editingCash ? (
                <div className="flex gap-2">
                  <input type="number" value={cashEdit} onChange={e => setCashEdit(e.target.value)}
                    className="w-32 px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                  <button onClick={handleCashUpdate} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm">Save</button>
                  <button onClick={() => setEditingCash(false)} className="px-3 py-1 text-gray-500 text-sm">Cancel</button>
                </div>
              ) : (
                <button onClick={() => { setCashEdit(String(account?.cash_balance || 0)); setEditingCash(true); }}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
              )}
            </div>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">S${(account?.cash_balance || 0).toFixed(2)}</div>
          </div>

          {/* Buy Form */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Buy / Add Holding</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <input type="text" placeholder="ISIN" value={buyIsin} onChange={e => setBuyIsin(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
              <input type="text" placeholder="Fund Name" value={buyName} onChange={e => setBuyName(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
              <input type="number" placeholder="Units" value={buyQty} onChange={e => setBuyQty(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
              <input type="number" placeholder="Price per unit" value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
              <button onClick={handleBuy}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
                Buy
              </button>
            </div>
          </div>

          {/* Holdings Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Holdings ({holdings.length})</h3>
            </div>
            {holdings.length === 0 ? (
              <div className="p-8 text-center text-gray-400 dark:text-gray-500">No holdings yet. Use the buy form above to add positions.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-750">
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                      <th className="px-4 py-2">Fund</th>
                      <th className="px-4 py-2 text-right">Units</th>
                      <th className="px-4 py-2 text-right">Avg Price</th>
                      <th className="px-4 py-2 text-right">Current</th>
                      <th className="px-4 py-2 text-right">Cost</th>
                      <th className="px-4 py-2 text-right">Value</th>
                      <th className="px-4 py-2 text-right">P&L</th>
                      <th className="px-4 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {holdings.map(h => (
                      <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">{h.product_name}</div>
                          <div className="text-[10px] text-gray-400">{h.product_id}</div>
                        </td>
                        <td className="px-4 py-2 text-right">{h.quantity}</td>
                        <td className="px-4 py-2 text-right">{h.average_cost.toFixed(4)}</td>
                        <td className="px-4 py-2 text-right">{h.current_price.toFixed(4)}</td>
                        <td className="px-4 py-2 text-right">S${h.cost_basis.toFixed(0)}</td>
                        <td className="px-4 py-2 text-right">S${h.market_value.toFixed(0)}</td>
                        <td className={`px-4 py-2 text-right font-medium ${h.unrealized_pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {h.unrealized_pnl >= 0 ? '+' : ''}S${h.unrealized_pnl.toFixed(0)} ({h.pnl_pct.toFixed(1)}%)
                        </td>
                        <td className="px-4 py-2 text-right">
                          {sellId === h.id ? (
                            <div className="flex gap-1">
                              <input type="number" placeholder="Qty" value={sellQty} onChange={e => setSellQty(e.target.value)}
                                className="w-16 px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-900 dark:text-gray-100" />
                              <input type="number" placeholder="Price" value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                                className="w-16 px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-900 dark:text-gray-100" />
                              <button onClick={handleSell} className="text-[10px] px-1.5 py-0.5 bg-red-600 text-white rounded">OK</button>
                              <button onClick={() => setSellId(null)} className="text-[10px] px-1.5 py-0.5 text-gray-400">X</button>
                            </div>
                          ) : (
                            <button onClick={() => { setSellId(h.id); setSellQty(String(h.quantity)); setSellPrice(String(h.current_price)); }}
                              className="text-[10px] px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-200">
                              Sell
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Signals Tab ──────────────────────────────────────── */}
      {tab === 'signals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Active Signals ({signals.length})</h3>
            <button onClick={handleRefreshSignals} disabled={refreshing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              {refreshing ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : '⚡'}
              {refreshing ? 'Scanning...' : 'Scan Now'}
            </button>
          </div>

          {signals.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center shadow-sm">
              <div className="text-3xl mb-3">⚡</div>
              <p className="text-gray-500 dark:text-gray-400">No active signals. Click "Scan Now" to run the engine.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {signals.map(s => (
                <div key={s.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border-l-4"
                  style={{ borderLeftColor: s.signal_type.includes('buy') ? '#22c55e' : s.signal_type.includes('sell') ? '#ef4444' : '#eab308' }}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{signalIcon(s.signal_type)}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {SIGNAL_LABELS[s.signal_type] || s.signal_type}
                          </span>
                          <span className={`text-xs font-medium ${strengthColor(s.strength)}`}>
                            {(s.strength * 100).toFixed(0)}% strength
                          </span>
                        </div>
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mt-1">{s.product_name}</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{s.rationale}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400">
                        {new Date(s.created_at).toLocaleDateString()}
                      </div>
                      {s.target_amount > 0 && (
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">
                          S${s.target_amount.toFixed(0)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Macro Tab ────────────────────────────────────────── */}
      {tab === 'macro' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Macro Environment</h3>
            <button onClick={handleRefreshMacro} disabled={macroRefreshing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              {macroRefreshing ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : '🔄'}
              {macroRefreshing ? 'Scraping...' : 'Refresh'}
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(MACRO_LABELS).map(([key, label]) => {
              const rate = macro[key];
              return (
                <div key={key} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {rate ? `${rate.value.toFixed(2)}%` : '—'}
                  </div>
                  {rate && (
                    <div className="text-[10px] text-gray-400 mt-1">
                      {rate.source} · {rate.date}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Transactions Tab ─────────────────────────────────── */}
      {tab === 'transactions' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Transaction History</h3>
          </div>
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-gray-400 dark:text-gray-500">No transactions yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-750">
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Fund</th>
                    <th className="px-4 py-2 text-right">Units</th>
                    <th className="px-4 py-2 text-right">Price</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-4 py-2 text-xs text-gray-500">{new Date(tx.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tx.type === 'buy' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                          {tx.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs">{tx.product_name}</td>
                      <td className="px-4 py-2 text-right">{tx.quantity}</td>
                      <td className="px-4 py-2 text-right">{tx.price.toFixed(4)}</td>
                      <td className="px-4 py-2 text-right font-medium">S${tx.total_amount.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
