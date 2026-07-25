import { useState } from 'react';

interface Props { onBack: () => void; }

type Section = string | null;

interface FaqItem {
  q: string;
  a: string;
}

function SectionBlock({ id, title, icon, children, expanded, onToggle }: {
  id: string; title: string; icon: string; children: React.ReactNode;
  expanded: boolean; onToggle: () => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
        <span className="text-xl">{icon}</span>
        <span className="flex-1 font-bold text-gray-900 dark:text-gray-100">{title}</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-700 pt-4">{children}</div>}
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">{title}</h4>
      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">{children}</div>
    </div>
  );
}

function Metric({ name, formula, interpretation }: { name: string; formula: string; interpretation: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3 mb-2">
      <div className="font-mono text-xs text-blue-600 dark:text-blue-400 mb-1">{name}</div>
      <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono mb-1">Formula: {formula}</div>
      <div className="text-xs text-gray-700 dark:text-gray-300">{interpretation}</div>
    </div>
  );
}

function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="space-y-2 mt-3">
      {items.map((item, i) => (
        <details key={i} className="bg-gray-50 dark:bg-gray-750 rounded-xl overflow-hidden group">
          <summary className="px-4 py-2.5 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors list-none flex items-center justify-between">
            {item.q}
            <svg className="w-3.5 h-3.5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-4 pb-3 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

export default function HelpGuide({ onBack }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['overview']));

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Help Guide</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">How to interpret every feature in Analytical | Map News</p>
        </div>
      </div>

      {/* ═══ OVERVIEW ═══ */}
      <SectionBlock id="overview" title="Overview" icon="🗺️" expanded={expanded.has('overview')} onToggle={() => toggle('overview')}>
        <SubSection title="What is this tool?">
          <p>Analytical | Map News is a political news aggregation and market intelligence platform. It pulls from 52 RSS sources across the political spectrum, stores articles in a local database, and provides analytics tools to understand how news relates to financial markets.</p>
          <p><strong>Key capabilities:</strong> Cross-spectrum news search, left/right/center bias classification, sentiment analysis, stock price correlation, predictive intelligence (Janus), local GPU-powered AI, and SRS investment product analysis.</p>
        </SubSection>
        <SubSection title="Navigation">
          <p>Click the <strong>hamburger menu</strong> (☰) in the top-left to open the sidebar. Every feature is organized under category groups. Click a group to expand it, click a feature to navigate there. The back arrow (←) in the top-left of each page returns to the home screen.</p>
        </SubSection>
        <SubSection title="Ticker Search">
          <p>The global ticker search in the top-right corner works from a database of 5,000+ tickers across 36 exchanges. Type a symbol or company name, click a result to copy it to clipboard. Use copied tickers in Market Analytics, Correlation, Math, and other tools.</p>
        </SubSection>
      </SectionBlock>

      {/* ═══ NEWS & ANALYSIS ═══ */}
      <SectionBlock id="news" title="News & Analysis" icon="📰" expanded={expanded.has('news')} onToggle={() => toggle('news')}>
        <SubSection title="Daily Briefing">
          <p>A morning summary of the latest news landscape. Shows breaking stories, trending topics, source activity, and coverage gaps — all anchored to the most recent articles in the database.</p>
          <Faq items={[
            { q: 'Why does it show old dates?', a: 'The briefing anchors to the most recent article in the archive. If the GDELT archive hasn\'t been updated recently, it will show historical dates.' },
            { q: 'How is "breaking" determined?', a: 'Articles appearing across 3+ sources within a short time window are flagged as breaking.' },
          ]} />
        </SubSection>
        <SubSection title="Search">
          <p>Full-text search across all articles. Results are clustered into topics by keyword similarity. Each topic shows coverage from left, center, and right sources.</p>
          <Faq items={[
            { q: 'What do the column colors mean?', a: 'Left bias = blue, Center = gray, Right = red. Bias is determined by the source\'s known editorial leaning.' },
            { q: 'What is a blindspot?', a: 'A blindspot is a topic covered heavily by one side of the spectrum but ignored by others. The blindspot alert highlights these asymmetries.' },
          ]} />
        </SubSection>
        <SubSection title="Coverage Dashboard">
          <p>Shows overall source coverage statistics — how many articles each source contributes, publication frequency, and topic distribution. Use this to understand which sources are most active.</p>
        </SubSection>
        <SubSection title="Event Radar">
          <p>Detects emerging events by identifying clusters of related articles published within a short timeframe. Each event has a signal (BUY/SELL/HOLD), affected tickers, and a confidence score.</p>
          <Faq items={[
            { q: 'What does the signal mean?', a: 'BUY = positive sentiment event likely to boost markets. SELL = negative event likely to cause selling. HOLD = event is neutral or uncertain.' },
            { q: 'How are tickers selected?', a: 'Keywords in article titles and content are matched against a mapping of political/economic terms to stock tickers (e.g., "Fed" → financial sector, "tariff" → importers).' },
          ]} />
        </SubSection>
        <SubSection title="Timeline Explorer">
          <p>Visualizes topic evolution over time. See how coverage of a topic grows, peaks, and fades. Useful for identifying news cycles and sustained narratives.</p>
        </SubSection>
        <SubSection title="Bias Comparator">
          <p>Side-by-side comparison of how left, center, and right sources cover the same topic. Shows word frequency differences, sentiment divergence, and framing variations.</p>
        </SubSection>
        <SubSection title="News vs Price">
          <p>Overlays news article publication timestamps with stock price movements. Helps identify whether news events preceded, coincided with, or followed price changes.</p>
        </SubSection>
        <SubSection title="News Archive (GDELT)">
          <p>Downloads historical news articles from the GDELT DOC API v2. Go to <strong>News & Analysis → Data → News Archive</strong>. Set a date range and click Download. The API has a 5-second rate limit between requests.</p>
          <Faq items={[
            { q: 'What date range should I use?', a: 'GDELT rolling window is ~3 months. Start with the last 30 days for recent analysis, then expand as needed.' },
            { q: 'Why is download slow?', a: 'Each day requires a separate API call with a 5-second delay. 30 days ≈ 2.5 minutes. The download continues in the background.' },
          ]} />
        </SubSection>
        <SubSection title="Sentiment Analysis (7 tabs)">
          <p>Analyzes article tone, sentiment, and mood across multiple dimensions:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li><strong>Tone Timeline</strong> — Average article tone over time. Positive = optimistic coverage, Negative = pessimistic.</li>
            <li><strong>World Sentiment Map</strong> — Geographic sentiment by country mentioned in articles.</li>
            <li><strong>Source Bias Spectrum</strong> — Each source plotted on a left-right bias scale with average tone.</li>
            <li><strong>Sentiment Distribution</strong> — Histogram of article sentiment scores. A normal distribution suggests balanced coverage.</li>
            <li><strong>Mood Pulse</strong> — Real-time mood indicators (fear, greed, uncertainty, optimism) extracted from article language.</li>
            <li><strong>Sentiment Waves</strong> — Rolling sentiment averages showing emotional waves across the news cycle.</li>
            <li><strong>Left vs Right</strong> — Direct comparison of sentiment between left-leaning and right-leaning sources.</li>
          </ul>
        </SubSection>
      </SectionBlock>

      {/* ═══ MARKET ═══ */}
      <SectionBlock id="market" title="Market" icon="💰" expanded={expanded.has('market')} onToggle={() => toggle('market')}>
        <SubSection title="Stock Library">
          <p>Database of 5,000+ tickers across 36 exchanges (NYSE, NASDAQ, LSE, SGX, etc.). Click "Update All" to batch-download historical price data via Python yfinance. The download runs in batches of 50 tickers in parallel.</p>
          <Faq items={[
            { q: 'How long does the full download take?', a: '~8,000 tickers at 50/batch with ~3s per batch ≈ 8-10 minutes. You can close the page — it runs in the background.' },
            { q: 'What data is downloaded?', a: 'Daily OHLCV (Open, High, Low, Close, Volume) for up to 10 years of history.' },
          ]} />
        </SubSection>
        <SubSection title="Market Analytics">
          <p>10 tabs of market analysis:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li><strong>Top Movers</strong> — Biggest gainers/losers by percentage change</li>
            <li><strong>Volume Spikes</strong> — Stocks with unusual volume vs 20-day average (often signals news-driven activity)</li>
            <li><strong>Sector Performance</strong> — Returns grouped by sector</li>
            <li><strong>Market Heatmap</strong> — Visual representation of sector/index performance</li>
            <li><strong>Correlation Matrix</strong> — How different stocks move relative to each other</li>
            <li><strong>Risk Metrics</strong> — Volatility, max drawdown, Value at Risk (VaR)</li>
            <li><strong>Performance Ranking</strong> — Stocks ranked by risk-adjusted returns</li>
            <li><strong>Dividend Analysis</strong> — Yield, payout ratio, dividend growth</li>
            <li><strong>Earnings Calendar</strong> — Upcoming earnings dates and historical surprise data</li>
            <li><strong>Options Flow</strong> — Unusual options activity</li>
          </ul>
        </SubSection>
        <SubSection title="Watchlist">
          <p>Track specific tickers with real-time price updates. Add tickers from the global search or manually. Shows current price, daily change, and mini sparkline charts.</p>
        </SubSection>
      </SectionBlock>

      {/* ═══ CORRELATION ═══ */}
      <SectionBlock id="correlation" title="Correlation Engine" icon="🔗" expanded={expanded.has('correlation')} onToggle={() => toggle('correlation')}>
        <SubSection title="Ticker Analysis">
          <p>Analyzes correlation between a stock price and news coverage. Enter a ticker and time range to see how article volume and sentiment correlate with price movements.</p>
          <Metric name="Pearson Correlation (r)" formula="Σ[(x-x̄)(y-ȳ)] / √[Σ(x-x̄)² · Σ(y-ȳ)²]" interpretation="Range: -1 to +1. |r| > 0.3 suggests meaningful correlation. > 0.5 is strong. Negative means inverse relationship (e.g., bad news → price up)." />
          <Metric name="Granger Causality" formula="F-test on lagged values of X predicting Y" interpretation="Tests if news leads price (or vice versa). Low p-value (< 0.05) means one variable helps predict the other. Does NOT prove causation — only predictive power." />
        </SubSection>
        <SubSection title="Narrative Strength">
          <p>Measures how strongly a news narrative (topic/theme) correlates with market movements across multiple stocks simultaneously.</p>
        </SubSection>
        <SubSection title="Sector Heatmap">
          <p>Visual heatmap of correlation between sectors. Darker colors = stronger correlation. Helps identify which sectors move together (e.g., tech and communications often correlated).</p>
        </SubSection>
      </SectionBlock>

      {/* ═══ JANUS ═══ */}
      <SectionBlock id="janus" title="Janus Intelligence" icon="👁️" expanded={expanded.has('janus')} onToggle={() => toggle('janus')}>
        <SubSection title="What is Janus?">
          <p>Project Janus is a predictive intelligence engine named after the two-faced Roman god. It looks backward (historical patterns) and forward (predictive signals) simultaneously.</p>
        </SubSection>
        <SubSection title="Command Center">
          <p>Overview dashboard showing key intelligence metrics: news velocity, sentiment trends, topic momentum, and cross-source divergence alerts.</p>
        </SubSection>
        <SubSection title="Echo Chamber Detector">
          <p>Identifies when multiple sources repeat the same narrative without independent reporting. High echo chamber score = groupthink. Low score = diverse perspectives.</p>
          <Faq items={[
            { q: 'What does high echo chamber mean?', a: 'Many sources are using similar language/framing. This could indicate coordinated messaging, PR-driven news, or genuine consensus. Cross-reference with the Bias Comparator to check.' },
          ]} />
        </SubSection>
        <SubSection title="Volatility Radar">
          <p>Scans for news events that historically precede market volatility. Flags current conditions that match past high-volatility setups.</p>
        </SubSection>
        <SubSection title="Shockwave Backtester">
          <p>Simulates how past news shocks (e.g., unexpected policy announcements, geopolitical events) would have affected a portfolio. Uses historical price reactions to similar news patterns.</p>
        </SubSection>
        <SubSection title="Corporate Credibility">
          <p>Rates news sources on factual accuracy, correction frequency, and citation quality. Higher credibility = more reliable source.</p>
        </SubSection>
        <SubSection title="Deep Research">
          <p>AI-powered deep dive into a topic. Searches the archive, synthesizes multiple sources, and generates a research report with key findings, timelines, and sentiment analysis.</p>
        </SubSection>
      </SectionBlock>

      {/* ═══ LOCALGPU ═══ */}
      <SectionBlock id="localgpu" title="LocalGPU" icon="🖥️" expanded={expanded.has('localgpu')} onToggle={() => toggle('localgpu')}>
        <SubSection title="What is LocalGPU?">
          <p>LocalGPU runs AI inference locally using Ollama (LLM) and Python/CUDA (ML). No data leaves your machine. Requires Ollama running locally with models pulled (e.g., <code>ollama pull llama3</code>).</p>
        </SubSection>
        <SubSection title="GPU Monitor">
          <p>Real-time GPU utilization, memory usage, temperature, and power draw. Shows which models are loaded and inference speed.</p>
        </SubSection>
        <SubSection title="LLM Chat">
          <p>Chat interface with your local LLM. Ask questions about loaded news data, get summaries, or generate analysis. Responses are generated entirely on your machine.</p>
        </SubSection>
        <SubSection title="Sentiment Engine">
          <p>GPU-accelerated sentiment analysis that processes articles faster than the CPU-based version. Runs on CUDA when available, falls back to Ollama.</p>
        </SubSection>
        <SubSection title="Vector Clustering">
          <p>Embeds articles into high-dimensional vectors using a local embedding model, then clusters them by semantic similarity. Reveals hidden topic groupings that keyword-based clustering misses.</p>
        </SubSection>
        <SubSection title="GPU Analytics">
          <p>Bulk analytics powered by local GPU: batch sentiment, topic extraction, named entity recognition, and summarization across the entire archive.</p>
        </SubSection>
      </SectionBlock>

      {/* ═══ SMART ═══ */}
      <SectionBlock id="smart" title="Smart Analytics" icon="🧠" expanded={expanded.has('smart')} onToggle={() => toggle('smart')}>
        <SubSection title="Velocity Scanner">
          <p>Detects when news article volume for a topic accelerates abnormally. High velocity = breaking or trending topic.</p>
          <Metric name="Velocity Score" formula="(articles_last_hour / avg_articles_per_hour) - 1" interpretation="Score > 2 means 3x normal volume = major news event. Score > 5 = potential market-moving event." />
        </SubSection>
        <SubSection title="Price Impact Estimator">
          <p>Estimates the expected price impact of a news event based on historical precedents. Combines sentiment, source credibility, and topic relevance.</p>
          <Metric name="Abnormal Return (AR)" formula="actual_return - expected_return (based on market model)" interpretation="Positive AR = stock moved more than expected. Large AR with high confidence suggests the news caused the move." />
          <Metric name="Cumulative Abnormal Return (CAR)" formula="Σ AR over event window (e.g., -1 to +3 days)" interpretation="Total impact over several days. CAR > 2% is significant. Negative CAR after positive news = market already priced it in." />
        </SubSection>
        <SubSection title="Lead-Lag Analysis">
          <p>Determines whether news leads or lags price movements. A positive lead means news comes first; negative means price moves before the news breaks (possibly insider activity).</p>
          <Metric name="Lead-Lag Correlation" formula="Cross-correlation at different time offsets" interpretation="Peak at positive lag = news leads price (normal). Peak at negative lag = price leads news (unusual — possible information leakage)." />
          <Metric name="Signal Decay" formula="Correlation at t=0, t=1h, t=2h, ..." interpretation="How quickly the news-price signal fades. Fast decay (< 1 hour) = noise. Slow decay (> 4 hours) = meaningful signal." />
        </SubSection>
        <SubSection title="Heatmap">
          <p>Visual grid showing news velocity × price impact for multiple tickers. Darker/hotter cells = higher combined score. Use this to scan many stocks at once for opportunities.</p>
        </SubSection>
      </SectionBlock>

      {/* ═══ MATH ═══ */}
      <SectionBlock id="math" title="Math Tools (25 Analyses)" icon="🧮" expanded={expanded.has('math')} onToggle={() => toggle('math')}>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">All 25 analyses run entirely in the browser using stock price data. Enter a ticker to run any analysis.</p>

        <SubSection title="Regression (4)">
          <Metric name="Linear Regression" formula="y = α + βx + ε" interpretation="Fits a line to price data. Slope (β) = trend direction. R² = how well the line fits (> 0.7 is strong trend)." />
          <Metric name="Polynomial Regression" formula="y = a₀ + a₁x + a₂x² + ..." interpretation="Fits a curve. Useful for detecting acceleration/deceleration in trends. Watch for overfitting with high-degree polynomials." />
          <Metric name="Log-Log Regression" formula="log(y) = α + β·log(x)" interpretation="Measures elasticity. β > 1 = elastic (price changes faster than time). β < 1 = inelastic." />
          <Metric name="Residual Analysis" formula="ε = y_actual - y_predicted" interpretation="Random residuals = good model. Patterns in residuals = missing variable or non-linear relationship." />
        </SubSection>

        <SubSection title="Correlation (5)">
          <Metric name="Pearson (r)" formula="cov(X,Y) / (σ_X · σ_Y)" interpretation="Linear correlation. |r| > 0.3 = moderate, > 0.5 = strong, > 0.7 = very strong." />
          <Metric name="Spearman Rank" formula="Pearson on ranked data" interpretation="Non-linear monotonic correlation. More robust to outliers than Pearson." />
          <Metric name="Rolling Correlation" formula="Pearson over sliding window" interpretation="Shows how correlation changes over time. Divergence from historical norm = regime change." />
          <Metric name="Cross-Correlation" formula="Correlation at different time lags" interpretation="Identifies lead-lag relationships between two time series." />
          <Metric name="Correlation Matrix" formula="Pairwise Pearson for multiple assets" interpretation="Diagonal = 1 (self). Off-diagonal > 0.7 = assets move together. < -0.3 = hedge candidates." />
        </SubSection>

        <SubSection title="Distribution (3)">
          <Metric name="Histogram Analysis" formula="Frequency distribution of returns" interpretation="Normal distribution = predictable. Fat tails = higher crash risk. Skewed = asymmetric risk." />
          <Metric name="Normality Test" formula="Shapiro-Wilk / Jarque-Bera" interpretation="p-value > 0.05 = can assume normal. p < 0.05 = non-normal (use t-distribution or non-parametric tests)." />
          <Metric name="Value at Risk (VaR)" formula="Historical percentile or parametric" interpretation="95% VaR = 5% chance of losing more than this amount. 99% VaR = 1% chance." />
        </SubSection>

        <SubSection title="Volatility & Risk (4)">
          <Metric name="Historical Volatility" formula="σ of log returns × √252" interpretation="Annualized standard deviation. > 30% = high volatility. < 15% = low. Compare to benchmark." />
          <Metric name="Bollinger Bands" formula="SMA ± 2σ" interpretation="Price touching upper band = potentially overbought. Lower band = potentially oversold. Band width = volatility." />
          <Metric name="Max Drawdown" formula="max(peak - trough) / peak" interpretation="Worst loss from peak. -20% = correction, -30%+ = bear market territory." />
          <Metric name="Sharpe Ratio" formula="(R_p - R_f) / σ_p" interpretation="< 0 = losing money risk-free. 0-1 = poor. 1-2 = good. > 2 = excellent." />
        </SubSection>

        <SubSection title="Time Series (4)">
          <Metric name="ACF (Autocorrelation)" formula="Correlation of series with its own lags" interpretation="Significant spikes = momentum (positive ACF) or mean reversion (negative ACF). Decaying pattern = trending." />
          <Metric name="Hurst Exponent" formula="H = log(R/S) / log(n)" interpretation="H < 0.5 = mean-reverting (buy dips). H = 0.5 = random walk. H > 0.5 = trending (ride momentum)." />
          <Metric name="Stationarity Test" formula="Augmented Dickey-Fuller" interpretation="p < 0.05 = stationary (statistical properties stable). Non-stationary = structural breaks or trending." />
          <Metric name="Entropy" formula="Shannon entropy of return distribution" interpretation="High entropy = unpredictable (random). Low entropy = pattern exists. Decreasing entropy = becoming more predictable." />
        </SubSection>

        <SubSection title="Advanced (5)">
          <Metric name="Fourier Transform" formula="Decompose signal into frequency components" interpretation="Identifies dominant cycles. Strong low-frequency component = long-term trend. High-frequency = noise." />
          <Metric name="Z-Score" formula="(x - μ) / σ" interpretation="Z > 2 = overbought (2.2% probability). Z < -2 = oversold. Z > 3 = extreme (0.1% probability)." />
          <Metric name="Portfolio Optimization" formula="Max Sharpe via mean-variance" interpretation="Identifies optimal allocation to maximize risk-adjusted return. Compare actual vs optimal allocation." />
          <Metric name="Efficient Frontier" formula="Set of optimal portfolios" interpretation="Portfolios on the frontier offer maximum return for each risk level. Below frontier = suboptimal." />
          <Metric name="PCA" formula="Eigenvalue decomposition of covariance matrix" interpretation="First principal component = market factor (explains most variance). Higher components = specific factors." />
        </SubSection>
      </SectionBlock>

      {/* ═══ SRS ═══ */}
      <SectionBlock id="srs" title="SRS (Supplementary Retirement Scheme)" icon="🏦" expanded={expanded.has('srs')} onToggle={() => toggle('srs')}>
        <SubSection title="What is SRS?">
          <p>A Singapore government scheme that encourages retirement savings with tax benefits. You contribute up to S$15,300/year (citizens/PR), get a dollar-for-dollar tax deduction, and invest the funds in approved products. Withdrawals after age 62 are taxed at a concessionary rate (typically 0-2%).</p>
        </SubSection>
        <SubSection title="Fund Catalog">
          <p>60+ SRS-approved unit trust funds from 12 fund houses (Fidelity, Franklin, Schroder, etc.). Click any fund to see its NAV chart powered by Yahoo Finance. Use "Refresh from DBS" to scrape the latest fund list, then "Download NAV Data" to fetch historical prices for the Advisor.</p>
        </SubSection>
        <SubSection title="Dashboard (Portfolio)">
          <p>Track your simulated SRS portfolio. Set your cash balance, buy/sell holdings at specific prices, and monitor P&L.</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li><strong>Cash Balance</strong> — Editable. Click "Edit" to set your SRS cash allocation.</li>
            <li><strong>Buy</strong> — Enter ISIN, fund name, units, and price. The cost is deducted from cash.</li>
            <li><strong>Sell</strong> — Click "Sell" on a holding, confirm quantity and price. Cash is credited back.</li>
            <li><strong>P&L</strong> — Unrealized profit/loss based on current_price (set at transaction time).</li>
          </ul>
        </SubSection>
        <SubSection title="Signals">
          <p>Automated buy/sell signal engine that scans your portfolio. Click "Scan Now" to regenerate. Signal types:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li><strong>🟢 Idle Cash Buy</strong> — Cash earning 0.05% when T-Bills pay 3%+. Move idle cash to a better yield.</li>
            <li><strong>🟢 Momentum Buy</strong> — Golden cross (SMA20 crossed above SMA50) or RSI oversold (&lt; 30). Bullish signal.</li>
            <li><strong>🔴 Momentum Sell</strong> — Death cross (SMA20 crossed below SMA50) or RSI overbought (&gt; 70). Bearish signal.</li>
            <li><strong>🟢 Valuation Buy</strong> — Fund trading &gt; 2σ below 1-year mean. Statistically undervalued entry point.</li>
            <li><strong>🔴 Valuation Sell</strong> — Fund trading &gt; 2σ above 1-year mean. Statistically overvalued, consider taking profit.</li>
            <li><strong>🟡 Inflation Warning</strong> — Cash losing purchasing power to inflation (1.6%) vs base rate (0.05%).</li>
            <li><strong>🔴 Negative Real Return</strong> — Fund's 1-year return is below inflation. Losing purchasing power.</li>
            <li><strong>🔴 Low Sharpe Sell</strong> — Negative risk-adjusted return. Consider rotating to better-performing assets.</li>
            <li><strong>🟢 High Sharpe Buy</strong> — Sharpe &gt; 1. Strong risk-adjusted performer. Good candidate for more allocation.</li>
          </ul>
          <Metric name="Signal Strength" formula="0-100% (higher = more confident)" interpretation="Based on the magnitude of the underlying metric. 90%+ = very strong signal. 50-70% = moderate. < 50% = weak." />
        </SubSection>
        <SubSection title="Macro Rates">
          <p>Current Singapore macro-economic rates used by the signal engine:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li><strong>SRS Base Rate (0.05%)</strong> — What uninvested SRS cash earns. Essentially zero.</li>
            <li><strong>T-Bill Yields</strong> — Government risk-free rates. 6M and 1Y. Scraped from MAS.</li>
            <li><strong>SORA</strong> — Singapore Overnight Rate Average. Benchmark for SGD interest rates.</li>
            <li><strong>MAS Core Inflation</strong> — Monetary Authority of Singapore core inflation measure.</li>
            <li><strong>SSB Yields</strong> — Singapore Savings Bond yields for 1Y and 10Y tenors.</li>
            <li><strong>DBS Fixed Deposit</strong> — DBS bank fixed deposit rates for 6M and 12M.</li>
          </ul>
        </SubSection>
        <SubSection title="Advisor (Top 3 Buy)">
          <p>AI-powered fund recommendation engine. Analyzes all SRS funds with NAV data and ranks them by a composite score. The top 3 are displayed with detailed explanations.</p>
          <p className="font-medium text-gray-800 dark:text-gray-200 mt-2">Scoring Model (Growth-Oriented):</p>
          <div className="space-y-1.5 mt-1">
            <Metric name="Momentum (30%)" formula="1M return × 0.4 + 3M return × 0.6" interpretation="Weighted medium-term momentum. Higher = stronger recent performance. Growth-oriented weighting favors the 3-month trend over short-term noise." />
            <Metric name="Risk-Adjusted Return (25%)" formula="(Annualized Return - Risk-Free Rate) / Annualized Volatility" interpretation="Sharpe ratio normalized to 0-100. > 1.0 = top quartile. > 0.5 = decent. < 0 = losing money risk-free." />
            <Metric name="Trend Strength (20%)" formula="RSI(14) distance from 50 + SMA alignment bonus" interpretation="RSI near 50 = neutral trend. SMA20 > SMA50 = bullish alignment. Combined into a 0-100 score." />
            <Metric name="Valuation (15%)" formula="Inverted z-score vs 1-year mean" interpretation="Contrarian: funds trading below their historical average score higher (buy low). Above-average funds score lower." />
            <Metric name="Macro Fit (10%)" formula="1Y return - 6M T-Bill yield" interpretation="How much the fund beats the risk-free alternative. Positive = adds value above safe assets." />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2"><strong>Filters:</strong> Bonds and money market funds excluded (growth posture). Funds with negative returns AND negative momentum filtered out. Minimum 60 NAV data points required.</p>
        </SubSection>
      </SectionBlock>

      {/* ═══ ALERTS ═══ */}
      <SectionBlock id="alerts" title="Alerts & Watchlist" icon="🔔" expanded={expanded.has('alerts')} onToggle={() => toggle('alerts')}>
        <SubSection title="Alerts">
          <p>Set custom alerts based on news sentiment, article volume, or price thresholds. Alerts trigger when conditions are met and persist in the notification panel.</p>
        </SubSection>
        <SubSection title="Watchlist">
          <p>Track specific tickers with mini sparkline charts. Add tickers from the global search (copy to clipboard, then paste in Watchlist). Shows current price, daily change, and trend direction.</p>
        </SubSection>
      </SectionBlock>

      {/* ═══ SETTINGS ═══ */}
      <SectionBlock id="settings" title="Settings & Configuration" icon="⚙️" expanded={expanded.has('settings')} onToggle={() => toggle('settings')}>
        <SubSection title="General">
          <p>Theme (light/dark), default time range, and display preferences are saved to localStorage and persist across sessions.</p>
        </SubSection>
        <SubSection title="LLM Configuration">
          <p>Configure AI providers for Deep Research and LocalGPU features. Supported providers:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li><strong>OpenAI</strong> — GPT-4, GPT-4o, etc. Requires API key.</li>
            <li><strong>Anthropic</strong> — Claude 3.5, Claude 3. Requires API key.</li>
            <li><strong>Ollama</strong> — Local models. No API key needed. Default: localhost:11434.</li>
            <li><strong>OpenRouter</strong> — Multi-model gateway. Requires API key.</li>
            <li><strong>Together AI</strong> — Open-source models via API. Requires API key.</li>
            <li><strong>Custom</strong> — Any OpenAI-compatible endpoint.</li>
          </ul>
          <p className="mt-2">Use "Test Connection" to verify your configuration before using AI features.</p>
        </SubSection>
      </SectionBlock>

      {/* Footer */}
      <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500">
        Analytical | Map News — Built with 52 RSS sources, 5,000+ tickers, and zero tracking.
      </div>
    </div>
  );
}
