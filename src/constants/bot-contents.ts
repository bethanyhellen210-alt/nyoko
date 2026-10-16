type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    BOT_BUILDER: 1,
    CHART: 2,
    ANALYSIS: 3,
    TUTORIAL: 4,
    FREE_BOTS: 5,
    AUTO_TRADES: 6,
    TRADING_VIEW: 7,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-charts',
    'id-analysis',
    'id-tutorials',
    'id-free-bots',
    'id-auto-trades',
    'id-trading-view-page',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
