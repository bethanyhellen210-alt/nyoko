export type AnalysisCandle = {
    close: number;
    epoch: number;
    high: number;
    low: number;
    open: number;
};

export type AnalysisTick = {
    digit: number;
    epoch: number;
    quote: number;
};

export type AnalysisSymbol = {
    displayName: string;
    exchangeIsOpen: boolean;
    market: string;
    marketDisplayName: string;
    pip?: number;
    submarket: string;
    submarketDisplayName: string;
    symbol: string;
};

export type TimeframeOption = {
    granularity: number;
    horizon: string;
    label: string;
};

export type MarketStatus = 'idle' | 'loading' | 'live' | 'error';

export type OptionFamily = 'rise_fall' | 'matches_differs' | 'over_under' | 'even_odd';

export type IdeaDirection = 'rise' | 'fall' | 'matches' | 'differs' | 'over' | 'under' | 'even' | 'odd' | 'wait' | 'watch';

export type AnalysisIdea = {
    confidence: number;
    direction: IdeaDirection;
    horizon: string;
    id: string;
    invalidation: string;
    prediction?: string;
    price: number;
    reasons: string[];
    title: string;
};

export type DigitStats = {
    barrierCount: number;
    coldDigit: number;
    counts: number[];
    evenCount: number;
    hotDigit: number;
    lastDigit: number | null;
    oddCount: number;
    overCount: number;
    sampleSize: number;
    underCount: number;
};

export type AnalysisSnapshot = {
    digitStats: DigitStats | null;
    emaFast: number | null;
    emaSlow: number | null;
    ideas: AnalysisIdea[];
    lastPrice: number | null;
    momentum: number | null;
    optionFamily: OptionFamily;
    rangeRatio: number | null;
    rsi: number | null;
    trend: 'up' | 'down' | 'mixed';
    volatility: 'compressed' | 'stable' | 'expanding' | 'spike';
};
