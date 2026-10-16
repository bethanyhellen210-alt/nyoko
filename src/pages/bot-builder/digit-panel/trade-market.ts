import { ApiHelpers } from '@/external/bot-skeleton';

export type TradeSymbolOption = {
    label: string;
    value: string;
};

export type TradeMarketSelection = {
    market: string;
    options: TradeSymbolOption[];
    submarket: string;
    symbol: string;
};

const EMPTY_SELECTION: TradeMarketSelection = {
    market: '',
    options: [],
    submarket: '',
    symbol: '',
};

const toOptions = (raw: unknown): TradeSymbolOption[] => {
    if (!Array.isArray(raw)) return [];
    return raw
        .map(option => ({
            label: String(option?.[0] || '').trim(),
            value: String(option?.[1] || '').trim(),
        }))
        .filter(option => option.value && option.value !== 'default');
};

const getMarketBlock = () => {
    const workspace = window.Blockly?.derivWorkspace;
    return workspace?.getTradeDefinitionBlock?.()?.getChildByType?.('trade_definition_market') || null;
};

/** Symbols that belong to the market and submarket chosen on the trade parameters block. */
export const readTradeMarket = (): TradeMarketSelection => {
    const block = getMarketBlock();
    if (!block?.getFieldValue) return EMPTY_SELECTION;

    const market = String(block.getFieldValue('MARKET_LIST') || '');
    const submarket = String(block.getFieldValue('SUBMARKET_LIST') || '');
    const symbol = String(block.getFieldValue('SYMBOL_LIST') || '');
    const helpers = ApiHelpers?.instance?.active_symbols;
    if (!helpers) return { market, options: [], submarket, symbol };

    const raw = submarket
        ? helpers.getSymbolDropdownOptions(submarket)
        : (helpers.getSubmarketDropdownOptions(market) || []).flatMap((option: [string, string]) =>
              helpers.getSymbolDropdownOptions(option?.[1])
          );

    return { market, options: toOptions(raw), submarket, symbol };
};

/** Writes the chosen symbol back onto the trade parameters block. */
export const applyTradeSymbol = (symbol: string) => {
    const block = getMarketBlock();
    if (!block?.setFieldValue || !symbol) return false;
    block.setFieldValue(symbol, 'SYMBOL_LIST');
    return true;
};
