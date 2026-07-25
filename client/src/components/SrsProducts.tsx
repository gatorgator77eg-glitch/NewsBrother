import React, { useState, useEffect, useMemo, useCallback } from 'react';

interface SrsProduct {
  id: string;
  name: string;
  fundHouse: string;
  fundType: 'Equity' | 'Bond' | 'Multi Asset';
  category: string;
  isin?: string;
  riskLevel: 'Low' | 'Medium' | 'Medium-High' | 'High';
  minInvestment: string;
  description: string;
  fees: string;
  factsheetUrl?: string;
}

interface AdditionalProduct {
  category: string;
  description: string;
  riskLevel: string;
  minInvestment: string;
  fees: string;
}

interface SrsInfo {
  overview: {
    schemeName: string;
    operator: string;
    contributionCap: { citizenPR: number; foreigner: number; currency: string; resetDate: string };
    baseInterestRate: string;
    taxRelief: { description: string; maxRelief: string };
    withdrawalRules: {
      normalWithdrawal: { condition: string; taxTreatment: string; spreadingOption: string };
      earlyWithdrawal: { condition: string; penalty: string; taxTreatment: string };
      medicalGrounds: { taxTreatment: string };
      deathTerminalIllness: { taxExempt: string };
    };
    eligibleInvestments: string[];
    notEligible: string[];
    fees: { ssbApplication: string; accountCharges: string };
  };
  additionalProducts: AdditionalProduct[];
  fundHouses: string[];
  categories: string[];
}

interface ProductsResponse {
  total: number;
  products: SrsProduct[];
  fundHouses: string[];
  categories: string[];
  source: 'scraped' | 'hardcoded';
  lastRefreshed: string | null;
  scrapedFundCount: number;
}

const riskColor = (r: string) => {
  switch (r) {
    case 'Low': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
    case 'Medium': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
    case 'Medium-High': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
    case 'High': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
    default: return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
  }
};

const typeColor = (t: string) => {
  switch (t) {
    case 'Equity': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
    case 'Bond': return 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300';
    case 'Multi Asset': return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300';
    default: return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
  }
};

interface NavDataPoint { date: string; nav: number; }

function NavChart({ isin, fundName }: { isin: string; fundName: string }) {
  const [data, setData] = useState<NavDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('1y');
  const [source, setSource] = useState('');
  const [message, setMessage] = useState('');

  const loadNav = useCallback(async (p: string) => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`/api/srs/nav/${isin}?period=${p}`);
      const json = await res.json();
      setData(json.data || []);
      setSource(json.source || '');
      setMessage(json.message || '');
    } catch {
      setData([]);
      setMessage('Failed to fetch NAV data');
    }
    setLoading(false);
  }, [isin]);

  useEffect(() => { loadNav(period); }, [period, loadNav]);

  const chartW = 560;
  const chartH = 160;
  const padL = 50;
  const padR = 10;
  const padT = 10;
  const padB = 24;

  const minNav = data.length > 0 ? Math.min(...data.map(d => d.nav)) : 0;
  const maxNav = data.length > 0 ? Math.max(...data.map(d => d.nav)) : 1;
  const range = maxNav - minNav || 1;

  const xScale = (i: number) => padL + (data.length > 1 ? (i / (data.length - 1)) * (chartW - padL - padR) : (chartW - padL - padR) / 2);
  const yScale = (v: number) => padT + (1 - (v - minNav) / range) * (chartH - padT - padB);

  const linePath = data.length > 1
    ? data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(d.nav).toFixed(1)}`).join(' ')
    : data.length === 1
    ? `M${xScale(0).toFixed(1)},${yScale(data[0].nav).toFixed(1)}`
    : '';

  const areaPath = data.length > 1
    ? `${linePath} L${xScale(data.length - 1).toFixed(1)},${chartH - padB} L${xScale(0).toFixed(1)},${chartH - padB} Z`
    : '';

  const isUp = data.length >= 2 && data[data.length - 1].nav >= data[0].nav;
  const lineColor = isUp ? '#22c55e' : '#ef4444';
  const gradientId = `navGrad-${isin}`;

  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minNav + (range * i) / yTicks);

  const xLabelCount = Math.min(data.length, 6);
  const xLabelStep = data.length > 1 ? Math.floor((data.length - 1) / (xLabelCount - 1 || 1)) : 1;

  const periods = ['1m', '3m', '6m', '1y', '3y'];

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">NAV History</p>
        <div className="flex gap-1">
          {periods.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                period === p
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}>{p}</button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : data.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-xs text-gray-400">{message || 'No NAV data available for this fund'}</p>
          <p className="text-[10px] text-gray-400 mt-1">Fund may not be listed on Yahoo Finance</p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-3 mb-2">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{data[data.length - 1].nav.toFixed(4)}</span>
            {data.length >= 2 && (
              <span className={`text-xs font-medium ${isUp ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {isUp ? '+' : ''}{((data[data.length - 1].nav - data[0].nav) / data[0].nav * 100).toFixed(2)}%
              </span>
            )}
            <span className="text-[10px] text-gray-400">as of {data[data.length - 1].date}</span>
          </div>
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-32">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
                <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {yTickVals.map((v, i) => (
              <g key={i}>
                <line x1={padL} y1={yScale(v)} x2={chartW - padR} y2={yScale(v)} stroke="currentColor" className="text-gray-100 dark:text-gray-700" strokeWidth="0.5" />
                <text x={padL - 4} y={yScale(v) + 3} textAnchor="end" className="fill-gray-400 dark:fill-gray-500" fontSize="8">{v.toFixed(2)}</text>
              </g>
            ))}
            {data.map((d, i) => i % xLabelStep === 0 || i === data.length - 1 ? (
              <text key={i} x={xScale(i)} y={chartH - 6} textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" fontSize="7">
                {d.date.slice(5)}
              </text>
            ) : null)}
            {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
            {linePath && <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />}
          </svg>
          <p className="text-[10px] text-gray-400 mt-1">Source: Yahoo Finance ({source}) · {fundName}</p>
        </>
      )}
    </div>
  );
}

export default function SrsProducts({ onBack }: { onBack: () => void }) {
  const [info, setInfo] = useState<SrsInfo | null>(null);
  const [products, setProducts] = useState<SrsProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterFundHouse, setFilterFundHouse] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterRisk, setFilterRisk] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'additional'>('overview');
  const [dataSource, setDataSource] = useState<'scraped' | 'hardcoded'>('hardcoded');
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [scrapedFundCount, setScrapedFundCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [navRefreshing, setNavRefreshing] = useState(false);
  const [navStatus, setNavStatus] = useState<string | null>(null);
  const [selectedFund, setSelectedFund] = useState<{ isin: string; name: string } | null>(null);

  const loadProducts = () => {
    fetch('/api/srs/products').then(r => r.json()).then((prodData: ProductsResponse) => {
      setProducts(prodData.products);
      setDataSource(prodData.source);
      setLastRefreshed(prodData.lastRefreshed);
      setScrapedFundCount(prodData.scrapedFundCount);
    }).catch(() => {});
  };

  useEffect(() => {
    Promise.all([
      fetch('/api/srs/info').then(r => r.json()),
      fetch('/api/srs/products').then(r => r.json()),
    ]).then(([infoData, prodData]) => {
      setInfo(infoData);
      setProducts(prodData.products);
      setDataSource(prodData.source);
      setLastRefreshed(prodData.lastRefreshed);
      setScrapedFundCount(prodData.scrapedFundCount);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/srs/refresh', { method: 'POST' });
      if (res.ok) {
        loadProducts();
      }
    } catch {}
    setRefreshing(false);
  };

  const handleNavRefresh = async () => {
    setNavRefreshing(true);
    setNavStatus(null);
    try {
      const res = await fetch('/api/srs/nav/refresh', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setNavStatus(`Error: ${data.error || 'Server error'}`);
      } else if (data.totalIsins === 0) {
        setNavStatus('No funds with ISINs found. Click "Refresh from DBS" first to scrape the fund list.');
      } else {
        setNavStatus(`NAV download started for ${data.totalIsins} funds. This runs in the background — check the server logs for progress.`);
      }
    } catch (err: any) {
      setNavStatus(`Failed: ${err.message || 'Network error'}`);
    }
    setNavRefreshing(false);
  };

  const filtered = useMemo(() => {
    let result = [...products];
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.fundHouse.toLowerCase().includes(lower) ||
        p.category.toLowerCase().includes(lower) ||
        p.description.toLowerCase().includes(lower)
      );
    }
    if (filterFundHouse) result = result.filter(p => p.fundHouse === filterFundHouse);
    if (filterType) result = result.filter(p => p.fundType === filterType);
    if (filterCategory) result = result.filter(p => p.category === filterCategory);
    if (filterRisk) result = result.filter(p => p.riskLevel === filterRisk);
    return result;
  }, [products, search, filterFundHouse, filterType, filterCategory, filterRisk]);

  const fundHouses = useMemo(() => Array.from(new Set(products.map(p => p.fundHouse))).sort(), [products]);
  const categories = useMemo(() => Array.from(new Set(products.map(p => p.category))).sort(), [products]);

  const stats = useMemo(() => ({
    total: products.length,
    equity: products.filter(p => p.fundType === 'Equity').length,
    bond: products.filter(p => p.fundType === 'Bond').length,
    multiAsset: products.filter(p => p.fundType === 'Multi Asset').length,
    houses: fundHouses.length,
  }), [products, fundHouses]);

  const clearFilters = () => {
    setSearch('');
    setFilterFundHouse('');
    setFilterType('');
    setFilterCategory('');
    setFilterRisk('');
  };

  const hasFilters = search || filterFundHouse || filterType || filterCategory || filterRisk;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">SRS Investment Products</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            DBS Supplementary Retirement Scheme — Product Catalog
            {dataSource === 'scraped' && scrapedFundCount > 0 && (
              <span className="ml-2 text-green-600 dark:text-green-400">
                ({scrapedFundCount} funds from DBS)
              </span>
            )}
            {lastRefreshed && (
              <span className="ml-2 text-gray-400 dark:text-gray-500">
                Updated {new Date(lastRefreshed).toLocaleString()}
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleNavRefresh}
            disabled={navRefreshing}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
          >
            {navRefreshing ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin h-3 w-3 border-2 border-green-500 border-t-transparent rounded-full" />
                Downloading NAV...
              </span>
            ) : 'Download NAV Data'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
          >
            {refreshing ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full" />
                Scraping...
              </span>
            ) : 'Refresh from DBS'}
          </button>
        </div>
      </div>

      {navStatus && (
        <div className={`rounded-xl px-4 py-2.5 text-sm mb-4 ${
          navStatus.startsWith('Error') || navStatus.startsWith('Failed')
            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
            : navStatus.startsWith('No funds')
              ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'
              : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
        }`}>
          {navStatus}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {(['overview', 'products', 'additional'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {tab === 'overview' ? 'Scheme Overview' : tab === 'products' ? 'Fund Catalog' : 'Other Products'}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ──────────────────────────────────────────────── */}
      {activeTab === 'overview' && info && (
        <div className="space-y-6">
          {/* Contribution Limits */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Contribution Limits (2026)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">S$15,300</p>
                <p className="text-xs text-gray-500 mt-1">Singapore Citizens & PRs</p>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-center">
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">S$35,700</p>
                <p className="text-xs text-gray-500 mt-1">Foreigners</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-gray-600 dark:text-gray-300">0.05%</p>
                <p className="text-xs text-gray-500 mt-1">Base Interest (uninvested)</p>
              </div>
            </div>
          </div>

          {/* Tax Benefits */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Tax Benefits</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <span className="text-green-500 text-lg mt-0.5">✓</span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">100% Tax Relief on Contributions</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Every dollar contributed to SRS is fully deductible from your taxable income. For a S$120K earner, maxing out SRS saves S$3,366/year.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <span className="text-green-500 text-lg mt-0.5">✓</span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Tax-Free Investment Returns</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">All capital gains, dividends, and interest earned on SRS investments are completely tax-free.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <span className="text-green-500 text-lg mt-0.5">✓</span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">50% Tax on Withdrawals</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Only 50% of withdrawals after retirement age are taxable. Can spread over 10 years to further reduce tax impact.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Withdrawal Rules */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Withdrawal Rules</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Normal (at/after retirement age)</p>
                <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <li>• 50% of withdrawal amount is taxable</li>
                  <li>• Can spread withdrawals over up to 10 years</li>
                  <li>• Retirement age: 63 (rising to 64 from 1 Jul 2026)</li>
                </ul>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Early (before retirement age)</p>
                <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <li>• 100% of withdrawal is fully taxable</li>
                  <li>• Additional 5% penalty on top</li>
                  <li>• Only exception: medical grounds (50% taxable, no penalty)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Product Catalog Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl text-center">
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
                <p className="text-xs text-gray-500 mt-1">Total Funds</p>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-center">
                <p className="text-xl font-bold text-purple-600 dark:text-purple-400">{stats.equity}</p>
                <p className="text-xs text-gray-500 mt-1">Equity</p>
              </div>
              <div className="p-3 bg-teal-50 dark:bg-teal-900/20 rounded-xl text-center">
                <p className="text-xl font-bold text-teal-600 dark:text-teal-400">{stats.bond}</p>
                <p className="text-xs text-gray-500 mt-1">Bond</p>
              </div>
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-center">
                <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{stats.multiAsset}</p>
                <p className="text-xs text-gray-500 mt-1">Multi Asset</p>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-center">
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats.houses}</p>
                <p className="text-xs text-gray-500 mt-1">Fund Houses</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Products Tab ──────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search funds by name, house, category..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <select value={filterFundHouse} onChange={e => setFilterFundHouse(e.target.value)}
                className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100">
                <option value="">All Fund Houses</option>
                {fundHouses.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100">
                <option value="">All Types</option>
                <option value="Equity">Equity</option>
                <option value="Bond">Bond</option>
                <option value="Multi Asset">Multi Asset</option>
              </select>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}
                className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100">
                <option value="">All Risk Levels</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="Medium-High">Medium-High</option>
                <option value="High">High</option>
              </select>
            </div>
            {hasFilters && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Showing {filtered.length} of {products.length} funds</p>
                <button onClick={clearFilters} className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">Clear filters</button>
              </div>
            )}
          </div>

          {/* Product Cards */}
          <div className="space-y-2">
            {filtered.map(p => (
              <React.Fragment key={p.id}>
                {selectedFund?.isin === p.isin && (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden border border-blue-200 dark:border-blue-800">
                    <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Price Evolution — {selectedFund?.name}</h3>
                        <p className="text-[10px] text-gray-400 font-mono">{selectedFund?.isin}</p>
                      </div>
                      <button onClick={() => setSelectedFund(null)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <div className="px-5 py-3">
                      <NavChart isin={selectedFund!.isin} fundName={selectedFund!.name} />
                    </div>
                  </div>
                )}
                <div
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  className="w-full text-left p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{p.name}</h3>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColor(p.fundType)}`}>{p.fundType}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${riskColor(p.riskLevel)}`}>{p.riskLevel}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{p.fundHouse}</span>
                        <span>·</span>
                        <span>{p.category}</span>
                        {p.isin && <><span>·</span><span className="font-mono">{p.isin}</span></>}
                      </div>
                    </div>
                    {p.isin && (
                      <button onClick={(e) => { e.stopPropagation(); setSelectedFund(selectedFund?.isin === p.isin ? null : { isin: p.isin!, name: p.name }); }}
                        className={`px-2 py-1 text-[10px] rounded-lg font-medium transition-colors flex-shrink-0 ${
                          selectedFund?.isin === p.isin
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400'
                        }`}>
                        Price
                      </button>
                    )}
                    <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expandedId === p.id ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </button>
                {expandedId === p.id && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">{p.description}</p>
                    <div className="flex flex-wrap gap-4 text-xs">
                      <div><span className="text-gray-500">Min Investment:</span> <span className="font-medium text-gray-900 dark:text-gray-100">{p.minInvestment}</span></div>
                      <div><span className="text-gray-500">Fees:</span> <span className="font-medium text-gray-900 dark:text-gray-100">{p.fees}</span></div>
                      {p.factsheetUrl && (
                        <a href={p.factsheetUrl} target="_blank" rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline">
                          View Factsheet
                        </a>
                      )}
                    </div>
                  </div>
                )}
                </div>
              </React.Fragment>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm">No funds match your filters</p>
                {hasFilters && <button onClick={clearFilters} className="text-xs text-blue-500 mt-2 hover:underline">Clear all filters</button>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Additional Products Tab ───────────────────────────────────── */}
      {activeTab === 'additional' && info && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Other SRS-Eligible Products at DBS</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">Beyond unit trust funds, DBS offers these additional SRS investment options.</p>
            <div className="space-y-3">
              {info.additionalProducts.map((p, i) => (
                <div key={i} className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{p.category}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${riskColor(p.riskLevel)}`}>{p.riskLevel} risk</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{p.description}</p>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>Min: <span className="font-medium text-gray-900 dark:text-gray-100">{p.minInvestment}</span></span>
                    <span>Fees: <span className="font-medium text-gray-900 dark:text-gray-100">{p.fees}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Not Eligible for SRS</h2>
            <div className="flex gap-3">
              {info.overview.notEligible.map(item => (
                <span key={item} className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium">{item}</span>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Useful Links</h2>
            <div className="space-y-2">
              <a href="https://www.dbs.com.sg/personal/investments/srs-and-cpf/supplementary-retirement-scheme" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <span className="text-blue-500">🔗</span>
                <span className="text-sm text-blue-600 dark:text-blue-400">DBS SRS Account Portal</span>
              </a>
              <a href="https://www.dbs.com.sg/treasures/srs-funds.page" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <span className="text-blue-500">🔗</span>
                <span className="text-sm text-blue-600 dark:text-blue-400">DBS Treasures — Full SRS Fund List</span>
              </a>
              <a href="https://www.mof.gov.sg/news-resources/supplementary-retirement-scheme" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <span className="text-blue-500">🔗</span>
                <span className="text-sm text-blue-600 dark:text-blue-400">MOF — Official SRS Guidelines</span>
              </a>
              <a href="https://www.dbs.com.sg/personal/landing/srs-calculator/index.html" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <span className="text-blue-500">🔗</span>
                <span className="text-sm text-blue-600 dark:text-blue-400">DBS SRS Tax Savings Calculator</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
