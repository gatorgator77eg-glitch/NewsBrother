import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';

const log = createLogger({ module: 'srs' });
export const srsRoutes = Router();

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
  dividendPolicy?: string;
}

interface SrsCategory {
  id: string;
  label: string;
  description: string;
  products: SrsProduct[];
}

const SRS_OVERVIEW = {
  schemeName: 'Supplementary Retirement Scheme (SRS)',
  operator: 'DBS Bank',
  contributionCap: {
    citizenPR: 15300,
    foreigner: 35700,
    currency: 'SGD',
    resetDate: '1 January (annually)',
  },
  baseInterestRate: '0.05% p.a. (on uninvested cash)',
  taxRelief: {
    description: 'Contributions are 100% deductible from taxable income',
    maxRelief: 'Up to S$15,300/year (citizens/PRs)',
  },
  withdrawalRules: {
    normalWithdrawal: {
      condition: 'At or after statutory retirement age prevailing at first contribution (currently 63, rising to 64 from 1 Jul 2026)',
      taxTreatment: '50% of withdrawal amount is taxable',
      spreadingOption: 'Can spread withdrawals over up to 10 years',
    },
    earlyWithdrawal: {
      condition: 'Before statutory retirement age',
      penalty: '5% penalty on withdrawal amount',
      taxTreatment: '100% of withdrawal amount is fully taxable',
    },
    medicalGrounds: {
      taxTreatment: '50% taxable (same as normal withdrawal)',
    },
    deathTerminalIllness: {
      taxExempt: 'First S$400,000 of SRS funds can be tax-exempt',
    },
  },
  eligibleInvestments: [
    'Unit Trusts / Mutual Funds',
    'Exchange Traded Funds (ETFs)',
    'Singapore-listed Shares & REITs',
    'Bonds & Fixed Deposits',
    'Singapore Savings Bonds (SSBs)',
    'Singapore Government Securities (SGS)',
    'Regular Savings Plans',
    'Robo-advisory Portfolios',
    'Single Premium Endowment & Insurance Plans',
  ],
  notEligible: ['Direct property', 'Cryptocurrency'],
  fees: {
    ssbApplication: 'S$2 per transaction',
    accountCharges: 'All SRS account transaction charges waived until further notice',
  },
};

const SRS_PRODUCTS: SrsProduct[] = [
  // ── Aberdeen ──────────────────────────────────────────────────────────
  {
    id: 'aberdeen-indonesia-equity',
    name: 'Aberdeen Indonesia Equity Fund',
    fundHouse: 'Aberdeen Asset Management',
    fundType: 'Equity',
    category: 'Asia Pacific',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Focuses on equity securities of companies domiciled in or deriving significant revenue from Indonesia.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'aberdeen-pacific-equity',
    name: 'Aberdeen Pacific Equity Fund',
    fundHouse: 'Aberdeen Asset Management',
    fundType: 'Equity',
    category: 'Asia Pacific',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in equity securities across the Asia Pacific region, excluding Japan.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'aberdeen-thailand-equity',
    name: 'Aberdeen Thailand Equity Fund',
    fundHouse: 'Aberdeen Asset Management',
    fundType: 'Equity',
    category: 'Asia Pacific',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests primarily in equity securities of companies listed on the Stock Exchange of Thailand.',
    fees: '1.50% p.a. management fee',
  },

  // ── Allianz ───────────────────────────────────────────────────────────
  {
    id: 'allianz-us-equity',
    name: 'Allianz US Equity Fund',
    fundHouse: 'Allianz Global Investors',
    fundType: 'Equity',
    category: 'US',
    isin: 'LU0417517546',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Provides exposure to US equity markets through active stock selection.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'allianz-asian-hy-bond',
    name: 'Allianz Dynamic Asian High Yield Bond',
    fundHouse: 'Allianz Global Investors',
    fundType: 'Bond',
    category: 'Asia Pacific',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'Invests in high yield bonds issued by Asian entities, seeking attractive income with dynamic risk management.',
    fees: '0.85% p.a. management fee',
  },
  {
    id: 'allianz-floating-rate',
    name: 'Allianz Global Floating Rate Notes Plus',
    fundHouse: 'Allianz Global Investors',
    fundType: 'Bond',
    category: 'Global',
    isin: 'LU1846563374',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Invests in floating rate notes globally, providing income with lower interest rate sensitivity.',
    fees: '0.65% p.a. management fee',
  },

  // ── Deutsche/DWS ──────────────────────────────────────────────────────
  {
    id: 'dws-asia-premier',
    name: 'DWS Asia Premier Trust',
    fundHouse: 'Deutsche Asset Management',
    fundType: 'Equity',
    category: 'Asia Pacific',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in a diversified portfolio of equity and equity-related securities across Asia.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'dws-china-equity',
    name: 'DWS China Equity Fund',
    fundHouse: 'Deutsche Asset Management',
    fundType: 'Equity',
    category: 'China',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Concentrated exposure to Chinese equity markets including A-shares and H-shares.',
    fees: '1.75% p.a. management fee',
  },
  {
    id: 'dws-lion-bond',
    name: 'DWS Lion Bond Fund',
    fundHouse: 'Deutsche Asset Management',
    fundType: 'Bond',
    category: 'Asia Pacific',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Invests in fixed income securities across Asian bond markets.',
    fees: '0.75% p.a. management fee',
  },

  // ── Fidelity ──────────────────────────────────────────────────────────
  {
    id: 'fidelity-america',
    name: 'Fidelity Funds - America Fund',
    fundHouse: 'Fidelity Worldwide Investment',
    fundType: 'Equity',
    category: 'US',
    isin: 'LU0251142724',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests primarily in securities of companies domiciled in, or deriving the majority of their revenues from, the United States.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'fidelity-emerging-markets',
    name: 'Fidelity Funds - Emerging Markets Fund',
    fundHouse: 'Fidelity Worldwide Investment',
    fundType: 'Equity',
    category: 'Emerging Markets',
    isin: 'LU0251143458',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in companies located in emerging market countries worldwide.',
    fees: '1.75% p.a. management fee',
  },
  {
    id: 'fidelity-global-dividend',
    name: 'Fidelity Funds - Global Dividend Fund',
    fundHouse: 'Fidelity Worldwide Investment',
    fundType: 'Equity',
    category: 'Global',
    isin: 'LU0731783394',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'Focuses on global companies with strong dividend histories, seeking both income and capital growth.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'fidelity-global-multi-asset',
    name: 'Fidelity Funds - Global Multi Asset Income Fund',
    fundHouse: 'Fidelity Worldwide Investment',
    fundType: 'Multi Asset',
    category: 'Global',
    isin: 'LU0905234570',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Invests across multiple asset classes globally to generate income with moderate risk.',
    fees: '1.00% p.a. management fee',
  },
  {
    id: 'fidelity-asia-focus',
    name: 'Fidelity Funds - Asia Focus Fund',
    fundHouse: 'Fidelity Worldwide Investment',
    fundType: 'Equity',
    category: 'Asia Pacific',
    isin: 'LU0251144936',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Concentrated portfolio of high-conviction Asian equity holdings.',
    fees: '1.50% p.a. management fee',
  },

  // ── First State / Stewart Investors ───────────────────────────────────
  {
    id: 'firststate-asia-opportunities',
    name: 'First State Asia Opportunities Fund',
    fundHouse: 'First State Investments',
    fundType: 'Equity',
    category: 'Asia Pacific',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in companies across Asia that the manager believes are well-positioned for long-term growth.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'firststate-asian-growth',
    name: 'First State Asian Growth Fund',
    fundHouse: 'First State Investments',
    fundType: 'Equity',
    category: 'Asia Pacific',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Seeks long-term capital growth by investing in growth-oriented companies across Asia.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'firststate-bridge',
    name: 'First State Bridge Fund',
    fundHouse: 'First State Investments',
    fundType: 'Equity',
    category: 'Asia Pacific',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'A balanced strategy investing across Asian equity and fixed income markets.',
    fees: '1.25% p.a. management fee',
  },
  {
    id: 'firststate-dividend-advantage',
    name: 'First State Dividend Advantage Fund',
    fundHouse: 'First State Investments',
    fundType: 'Equity',
    category: 'Asia Pacific',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in Asian companies with attractive and sustainable dividend yields.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'firststate-worldwide-leaders',
    name: 'Stewart Investors Worldwide Leaders Fund',
    fundHouse: 'First State Investments',
    fundType: 'Equity',
    category: 'Global',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'Invests in companies globally that are leaders in their respective industries.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'firststate-global-balanced',
    name: 'First State Global Balanced Fund',
    fundHouse: 'First State Investments',
    fundType: 'Multi Asset',
    category: 'Global',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Balanced allocation across global equities and fixed income for moderate risk-return profile.',
    fees: '1.25% p.a. management fee',
  },
  {
    id: 'firststate-regional-china',
    name: 'First State Regional China Fund',
    fundHouse: 'First State Investments',
    fundType: 'Equity',
    category: 'China',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Concentrated exposure to companies across Greater China region.',
    fees: '1.75% p.a. management fee',
  },
  {
    id: 'firststate-regional-india',
    name: 'Stewart First State Regional India Fund',
    fundHouse: 'First State Investments',
    fundType: 'Equity',
    category: 'India',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in companies domiciled in or deriving significant revenue from India.',
    fees: '1.75% p.a. management fee',
  },
  {
    id: 'firststate-singapore-growth',
    name: 'First State Singapore Growth Fund',
    fundHouse: 'First State Investments',
    fundType: 'Equity',
    category: 'Singapore',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'Invests in Singapore-listed companies with strong growth potential.',
    fees: '1.50% p.a. management fee',
  },

  // ── Fullerton ─────────────────────────────────────────────────────────
  {
    id: 'fullerton-asia-income',
    name: 'Fullerton Asia Income Return Fund',
    fundHouse: 'Fullerton Fund Management',
    fundType: 'Multi Asset',
    category: 'Asia Pacific',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Seeks regular income through a diversified portfolio of Asian income-generating assets.',
    fees: '1.00% p.a. management fee',
  },
  {
    id: 'fullerton-usd-income',
    name: 'Fullerton USD Income Fund',
    fundHouse: 'Fullerton Fund Management',
    fundType: 'Bond',
    category: 'Global',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Invests in USD-denominated bonds seeking consistent income generation.',
    fees: '0.75% p.a. management fee',
  },

  // ── Legg Mason ────────────────────────────────────────────────────────
  {
    id: 'legg-mason-sea',
    name: 'Legg Mason Martin Currie SEA Fund',
    fundHouse: 'Legg Mason Asset Management',
    fundType: 'Equity',
    category: 'Southeast Asia',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in equities across Southeast Asian markets including Singapore, Malaysia, Thailand, and Indonesia.',
    fees: '1.50% p.a. management fee',
  },

  // ── Manulife ──────────────────────────────────────────────────────────
  {
    id: 'manulife-sgd-income',
    name: 'Manulife SGD Income Fund',
    fundHouse: 'Manulife Asset Management',
    fundType: 'Bond',
    category: 'Singapore',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Invests in SGD-denominated bonds and fixed income securities for stable income.',
    fees: '0.80% p.a. management fee',
  },
  {
    id: 'manulife-apac-reit',
    name: 'Manulife GF Asia Pacific REIT Fund',
    fundHouse: 'Manulife Global Fund',
    fundType: 'Equity',
    category: 'REITs',
    isin: 'LU1867151877',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'Invests in Asia Pacific REITs offering exposure to real estate assets and rental income yields.',
    fees: '1.25% p.a. management fee',
  },

  // ── Nikko AM ──────────────────────────────────────────────────────────
  {
    id: 'nikko-eight-portfolio',
    name: 'Nikko AM Eight Portfolio Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Multi Asset',
    category: 'Global',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Diversified multi-asset fund investing across eight asset classes for balanced returns.',
    fees: '1.00% p.a. management fee',
  },
  {
    id: 'nikko-asean-equity',
    name: 'Nikko AM ASEAN Equity Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Equity',
    category: 'Southeast Asia',
    isin: 'SG9999014484',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in equities across ASEAN member countries for regional growth exposure.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'nikko-sg-fixed-income',
    name: 'Nikko AM Horizon Singapore Fixed Income Enhanced Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Bond',
    category: 'Singapore',
    riskLevel: 'Low',
    minInvestment: 'S$1,000',
    description: 'Invests in Singapore government and corporate bonds for stable, predictable income.',
    fees: '0.50% p.a. management fee',
  },
  {
    id: 'nikko-sg-dividend',
    name: 'Nikko AM Singapore Dividend Equity Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Equity',
    category: 'Singapore',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'Focuses on high-dividend-yielding Singapore-listed stocks for income generation.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'nikko-global-dividend',
    name: 'Nikko AM Global Dividend Equity Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Equity',
    category: 'Global',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'Invests in global companies with strong and sustainable dividend payment histories.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'nikko-japan-dividend',
    name: 'Nikko AM Japan Dividend Equity Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Equity',
    category: 'Japan',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in Japanese equities with attractive dividend yields.',
    fees: '1.75% p.a. management fee',
  },
  {
    id: 'nikko-asia-bond',
    name: 'Nikko AM Shenton Asia Bond Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Bond',
    category: 'Asia Pacific',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Invests in investment-grade bonds issued across Asian markets.',
    fees: '0.75% p.a. management fee',
  },
  {
    id: 'nikko-asia-dividend',
    name: 'Nikko AM Shenton Asia Dividend Equity Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Equity',
    category: 'Asia Pacific',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in high-dividend equities across Asian markets.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'nikko-asia-pacific',
    name: 'Nikko AM Shenton Asia Pacific Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Equity',
    category: 'Asia Pacific',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Broad Asia Pacific equity exposure across developed and emerging markets in the region.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'nikko-emerging-enterprise',
    name: 'Nikko AM Shenton Emerging Enterprise Discovery Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Equity',
    category: 'Emerging Markets',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Targets small and mid-cap companies in emerging markets with high growth potential.',
    fees: '1.75% p.a. management fee',
  },
  {
    id: 'nikko-global-property',
    name: 'Nikko AM Shenton Global Property Securities Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Equity',
    category: 'REITs',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'Invests in global real estate investment trusts and property companies.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'nikko-shenton-income',
    name: 'Nikko AM Shenton Income Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Bond',
    category: 'Global',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Seeks regular income by investing in a diversified portfolio of global fixed income instruments.',
    fees: '0.80% p.a. management fee',
  },
  {
    id: 'nikko-japan',
    name: 'Nikko AM Shenton Japan Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Equity',
    category: 'Japan',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in Japanese equities focusing on companies with strong fundamentals.',
    fees: '1.75% p.a. management fee',
  },
  {
    id: 'nikko-short-term-bond',
    name: 'Nikko AM Shenton Short Term Bond Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Bond',
    category: 'Global',
    riskLevel: 'Low',
    minInvestment: 'S$1,000',
    description: 'Invests in short-duration bonds globally for low volatility and capital preservation.',
    fees: '0.50% p.a. management fee',
  },
  {
    id: 'nikko-thrift',
    name: 'Nikko AM Shenton Thrift Fund',
    fundHouse: 'Nikko Asset Management',
    fundType: 'Equity',
    category: 'Asia Pacific',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Long-standing Asia equity fund investing in value-oriented companies across the region.',
    fees: '1.50% p.a. management fee',
  },

  // ── Schroder ──────────────────────────────────────────────────────────
  {
    id: 'schroder-asian-equity-yield',
    name: 'Schroder Asian Equity Yield Fund',
    fundHouse: 'Schroder Investment Management',
    fundType: 'Equity',
    category: 'Asia Pacific',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in Asian equities with attractive dividend yields for income and growth.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'schroder-asian-growth',
    name: 'Schroder Asian Growth Fund',
    fundHouse: 'Schroder Investment Management',
    fundType: 'Equity',
    category: 'Asia Pacific',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Seeks long-term capital appreciation through investing in growth companies across Asia.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'schroder-asian-income',
    name: 'Schroder Asian Income Fund',
    fundHouse: 'Schroder Investment Management',
    fundType: 'Multi Asset',
    category: 'Asia Pacific',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'Generates income from a diversified portfolio of Asian equities and income-generating instruments.',
    fees: '1.25% p.a. management fee',
  },
  {
    id: 'schroder-asian-ig-credit',
    name: 'Schroder Asian Investment Grade Credit Class A Fund',
    fundHouse: 'Schroder Investment Management',
    fundType: 'Bond',
    category: 'Asia Pacific',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Invests in investment-grade credit instruments across Asian fixed income markets.',
    fees: '0.75% p.a. management fee',
  },
  {
    id: 'schroder-bric',
    name: 'Schroder BRIC Fund',
    fundHouse: 'Schroder Investment Management',
    fundType: 'Equity',
    category: 'Emerging Markets',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Focuses on equities in Brazil, Russia, India, and China — the four major emerging economies.',
    fees: '1.75% p.a. management fee',
  },
  {
    id: 'schroder-china-opportunities',
    name: 'Schroder China Opportunities Fund',
    fundHouse: 'Schroder Investment Management',
    fundType: 'Equity',
    category: 'China',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Identifies undervalued companies in China with potential for significant upside.',
    fees: '1.75% p.a. management fee',
  },
  {
    id: 'schroder-emerging-market',
    name: 'Schroder Emerging Market Fund',
    fundHouse: 'Schroder Investment Management',
    fundType: 'Equity',
    category: 'Emerging Markets',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Broad exposure to equity markets across emerging economies worldwide.',
    fees: '1.75% p.a. management fee',
  },
  {
    id: 'schroder-global-credit-income',
    name: 'Schroder ISF - Global Credit Income',
    fundHouse: 'Schroder Investment Management',
    fundType: 'Bond',
    category: 'Global',
    isin: 'LU1514168886',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Seeks to generate income from global investment-grade and high yield credit markets.',
    fees: '0.80% p.a. management fee',
  },
  {
    id: 'schroder-sg-trust',
    name: 'Schroder Singapore Trust',
    fundHouse: 'Schroder Investment Management',
    fundType: 'Equity',
    category: 'Singapore',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'Invests in a diversified portfolio of Singapore-listed equities for long-term growth.',
    fees: '1.50% p.a. management fee',
  },

  // ── Templeton / Franklin ──────────────────────────────────────────────
  {
    id: 'franklin-high-yield',
    name: 'Franklin High Yield Fund',
    fundHouse: 'Franklin Templeton',
    fundType: 'Bond',
    category: 'Global',
    isin: 'LU0323421593',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'Invests in high yield bonds globally seeking attractive income returns.',
    fees: '0.90% p.a. management fee',
  },
  {
    id: 'franklin-income',
    name: 'Franklin Income Fund',
    fundHouse: 'Franklin Templeton',
    fundType: 'Bond',
    category: 'Global',
    isin: 'LU0320765646',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Seeks high current income with capital appreciation through a diversified global fixed income portfolio.',
    fees: '0.85% p.a. management fee',
  },
  {
    id: 'franklin-india',
    name: 'Franklin India Fund',
    fundHouse: 'Franklin Templeton',
    fundType: 'Equity',
    category: 'India',
    isin: 'LU0536402901',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in Indian equities across market capitalizations for long-term growth.',
    fees: '1.75% p.a. management fee',
  },
  {
    id: 'franklin-mutual-beacon',
    name: 'Franklin Mutual Beacon Fund',
    fundHouse: 'Franklin Templeton',
    fundType: 'Equity',
    category: 'Global',
    isin: 'LU0320765489',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'A globally diversified equity fund focusing on companies with sustainable competitive advantages.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'franklin-us-opportunities',
    name: 'Franklin US Opportunities Fund',
    fundHouse: 'Franklin Templeton',
    fundType: 'Equity',
    category: 'US',
    isin: 'LU0320765059',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests primarily in US equities across sectors, targeting companies with above-average growth potential.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'franklin-asian-growth',
    name: 'Franklin Asian Growth Fund',
    fundHouse: 'Franklin Templeton',
    fundType: 'Equity',
    category: 'Asia Pacific',
    isin: 'LU0320764755',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Seeks capital appreciation by investing in equity securities of Asian companies.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'franklin-china',
    name: 'Franklin China Fund',
    fundHouse: 'Franklin Templeton',
    fundType: 'Equity',
    category: 'China',
    isin: 'LU0320764599',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in Chinese equities seeking long-term growth in the world\'s second largest economy.',
    fees: '1.75% p.a. management fee',
  },
  {
    id: 'franklin-global-balanced',
    name: 'Franklin Global Balanced Fund',
    fundHouse: 'Franklin Templeton',
    fundType: 'Multi Asset',
    category: 'Global',
    isin: 'LU0310800965',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Balanced allocation across global equities and fixed income for moderate risk-return.',
    fees: '1.00% p.a. management fee',
  },
  {
    id: 'franklin-global-bond',
    name: 'Franklin Global Bond Fund',
    fundHouse: 'Franklin Templeton',
    fundType: 'Bond',
    category: 'Global',
    isin: 'LU0320763948',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Invests in a diversified portfolio of government and corporate bonds globally.',
    fees: '0.75% p.a. management fee',
  },
  {
    id: 'franklin-global-equity-income',
    name: 'Franklin Global Equity Income Fund',
    fundHouse: 'Franklin Templeton',
    fundType: 'Equity',
    category: 'Global',
    isin: 'LU0310799852',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'Invests in global equities selected for their dividend income and capital growth potential.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'franklin-global-fund',
    name: 'Franklin Global Fund',
    fundHouse: 'Franklin Templeton',
    fundType: 'Equity',
    category: 'Global',
    isin: 'LU0310800379',
    riskLevel: 'Medium-High',
    minInvestment: 'S$1,000',
    description: 'Broad global equity exposure across developed and emerging markets.',
    fees: '1.50% p.a. management fee',
  },
  {
    id: 'franklin-global-total-return',
    name: 'Franklin Global Total Return Fund',
    fundHouse: 'Franklin Templeton',
    fundType: 'Bond',
    category: 'Global',
    isin: 'LU0320764169',
    riskLevel: 'Medium',
    minInvestment: 'S$1,000',
    description: 'Seeks maximum total return from global fixed income across interest rate and credit markets.',
    fees: '0.85% p.a. management fee',
  },
  {
    id: 'franklin-latin-america',
    name: 'Franklin Latin America Fund',
    fundHouse: 'Franklin Templeton',
    fundType: 'Equity',
    category: 'Latin America',
    isin: 'LU0320763518',
    riskLevel: 'High',
    minInvestment: 'S$1,000',
    description: 'Invests in Latin American equities targeting long-term growth in the region.',
    fees: '1.75% p.a. management fee',
  },
];

const ADDITIONAL_PRODUCTS = [
  {
    category: 'Singapore Savings Bonds (SSBs)',
    description: 'Government-backed bonds with step-up interest, redeemable monthly with no penalty. Min S$500, max S$200,000.',
    riskLevel: 'Low',
    minInvestment: 'S$500',
    fees: 'S$2 per application/redemption',
  },
  {
    category: 'SGX-Listed ETFs & REITs',
    description: 'Buy SGX-listed ETFs (e.g., STI ETF) and REITs via DBS Vickers SRS account. Includes hundreds of Singapore-listed securities.',
    riskLevel: 'Medium to High',
    minInvestment: '1 lot (varies)',
    fees: 'DBS Vickers brokerage fees apply',
  },
  {
    category: 'SGX-Listed Stocks',
    description: 'Invest in Singapore-listed equities using SRS funds through a linked DBS Vickers account.',
    riskLevel: 'High',
    minInvestment: '1 lot (varies)',
    fees: 'DBS Vickers brokerage fees apply',
  },
  {
    category: 'Fixed Deposits',
    description: 'DBS fixed deposits in SGD and foreign currencies. Low risk, guaranteed returns for a fixed tenor.',
    riskLevel: 'Low',
    minInvestment: 'S$1,000',
    fees: 'None',
  },
  {
    category: 'Singapore Government Securities (SGS)',
    description: 'Government bonds and T-bills issued by MAS. Safe, government-backed instruments.',
    riskLevel: 'Low',
    minInvestment: 'S$1,000 (T-bills), S$500 (SSBs)',
    fees: 'S$2 for SSBs',
  },
  {
    category: 'DBS digiWealth / digiPortfolio',
    description: 'Robo-advisory through DBS digibank app. CIO Insights Funds curated by DBS Chief Investment Office. Auto-rebalancing portfolios.',
    riskLevel: 'Low to High',
    minInvestment: 'S$100',
    fees: '0.75% p.a. advisory fee',
  },
  {
    category: 'Single Premium Endowment Plans',
    description: 'Insurance savings plans accepting SRS funds. Lump-sum premium with guaranteed + projected returns over 2-10 years.',
    riskLevel: 'Low',
    minInvestment: 'S$10,000',
    fees: 'Included in plan pricing',
  },
];

function getFundHouses(): string[] {
  const houses = new Set(SRS_PRODUCTS.map(p => p.fundHouse));
  return Array.from(houses).sort();
}

function getCategories(): string[] {
  const cats = new Set(SRS_PRODUCTS.map(p => p.category));
  return Array.from(cats).sort();
}

// ── GET /api/srs/info — SRS scheme overview ──────────────────────────────
srsRoutes.get('/info', (_req: Request, res: Response) => {
  try {
    res.json({
      overview: SRS_OVERVIEW,
      additionalProducts: ADDITIONAL_PRODUCTS,
      fundHouses: getFundHouses(),
      categories: getCategories(),
    });
  } catch (err: any) {
    log.error('Failed to fetch SRS info', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch SRS info' });
  }
});

// ── GET /api/srs/products — Product catalog with filters ─────────────────
srsRoutes.get('/products', (req: Request, res: Response) => {
  try {
    const { q, fundHouse, type, category, riskLevel } = req.query;

    let filtered = [...SRS_PRODUCTS];

    if (q && typeof q === 'string') {
      const lower = q.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.fundHouse.toLowerCase().includes(lower) ||
        p.category.toLowerCase().includes(lower) ||
        p.description.toLowerCase().includes(lower)
      );
    }

    if (fundHouse && typeof fundHouse === 'string') {
      filtered = filtered.filter(p => p.fundHouse === fundHouse);
    }

    if (type && typeof type === 'string') {
      filtered = filtered.filter(p => p.fundType === type);
    }

    if (category && typeof category === 'string') {
      filtered = filtered.filter(p => p.category === category);
    }

    if (riskLevel && typeof riskLevel === 'string') {
      filtered = filtered.filter(p => p.riskLevel === riskLevel);
    }

    res.json({
      total: filtered.length,
      products: filtered,
      fundHouses: getFundHouses(),
      categories: getCategories(),
    });
  } catch (err: any) {
    log.error('Failed to fetch SRS products', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch SRS products' });
  }
});
