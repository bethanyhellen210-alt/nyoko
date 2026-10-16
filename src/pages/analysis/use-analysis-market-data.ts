import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import { DIGIT_HISTORY_SIZE } from './digit-distribution';
import type { AnalysisCandle, AnalysisSymbol, AnalysisTick, MarketStatus, TimeframeOption } from './analysis-types';

type RawSymbol = {
    delay_amount?: number;
    display_name?: string;
    exchange_is_open?: boolean | number;
    is_trading_suspended?: boolean | number;
    market?: string;
    market_display_name?: string;
    pip?: number;
    pip_size?: number;
    submarket?: string;
    submarket_display_name?: string;
    symbol?: string;
    underlying_symbol?: string;
};

export const TICK_STALL_FLOOR_MS = 8000;
export const TICK_STALL_CEILING_MS = 45000;
export const FIRST_TICK_WAIT_MS = 30000;

export const TIMEFRAME_OPTIONS: TimeframeOption[] = [
    { granularity: 60, horizon: '1-3 candles', label: '1m' },
    { granularity: 300, horizon: '1-3 candles', label: '5m' },
    { granularity: 900, horizon: '1-2 candles', label: '15m' },
];

const getPipDecimals = (pip?: number) => {
    if (!pip) return 2;
    return Math.max(0, Math.min(8, String(pip).split('.')[1]?.length ?? 0));
};

const getLastDigit = (quote: number | string, pip?: number) => {
    const numericQuote = Number(quote);
    const quoteText = Number.isFinite(numericQuote) ? numericQuote.toFixed(getPipDecimals(pip)) : String(quote);
    const digits = quoteText.replace(/\D/g, '');
    return Number(digits[digits.length - 1] ?? 0);
};

export const parseTick = (raw: any, pip?: number): AnalysisTick => ({
    digit: getLastDigit(raw.quote, pip),
    epoch: Number(raw.epoch),
    quote: Number(raw.quote),
});

/** Fast markets recover after a short gap. Slow markets keep a wider gap so a quiet symbol is not resubscribed early. */
export const tickStallLimitMs = (lastGapMs: number, tickCount: number) => {
    if (tickCount < 2) return FIRST_TICK_WAIT_MS;
    const gap = Number.isFinite(lastGapMs) && lastGapMs > 0 ? lastGapMs : 2000;
    return Math.min(TICK_STALL_CEILING_MS, Math.max(TICK_STALL_FLOOR_MS, gap * 3));
};

export type TickPace = {
    lastGapMs: number;
    tickCount: number;
};

/** A gap longer than the learned pace is a stall, not a new pace. The first two ticks always set the pace. */
export const nextTickPace = (pace: TickPace, gapMs: number | null): TickPace => {
    if (gapMs == null) {
        return { lastGapMs: pace.lastGapMs, tickCount: Math.max(pace.tickCount, 1) };
    }
    const stalled = pace.tickCount >= 2 && gapMs > tickStallLimitMs(pace.lastGapMs, pace.tickCount);
    if (stalled) return pace;
    return {
        lastGapMs: pace.tickCount >= 1 ? gapMs : pace.lastGapMs,
        tickCount: pace.tickCount + 1,
    };
};

export const appendAnalysisTick = (ticks: AnalysisTick[], tick: AnalysisTick, limit = DIGIT_HISTORY_SIZE) => {
    if (!Number.isFinite(tick.epoch) || !Number.isFinite(tick.quote)) return ticks;
    const last = ticks[ticks.length - 1];
    if (last && last.epoch === tick.epoch && last.quote === tick.quote) return ticks;
    return [...ticks, tick].slice(-limit);
};

export const mergeTickHistory = (history: AnalysisTick[], current: AnalysisTick[], limit = DIGIT_HISTORY_SIZE) => {
    const newest = history.length ? history[history.length - 1].epoch : 0;
    const live = current.filter(tick => tick.epoch > newest);
    return [...history, ...live].slice(-limit);
};

const isDerivedSymbol = (symbol: RawSymbol) => {
    const market = (symbol.market || '').toLowerCase();
    const marketDisplayName = (symbol.market_display_name || '').toLowerCase();
    const symbolCode = symbol.underlying_symbol || symbol.symbol || '';

    return (
        market === 'synthetic_index' ||
        marketDisplayName.includes('derived') ||
        symbolCode.startsWith('R_') ||
        symbolCode.startsWith('1HZ') ||
        symbolCode.startsWith('JD')
    );
};

const normalizeSymbol = (symbol: RawSymbol): AnalysisSymbol | null => {
    const symbolCode = symbol.underlying_symbol || symbol.symbol;
    if (!symbolCode) return null;

    return {
        displayName: symbol.display_name || symbolCode,
        exchangeIsOpen: Boolean(symbol.exchange_is_open) && !symbol.is_trading_suspended,
        market: symbol.market || '',
        marketDisplayName: symbol.market_display_name || 'Market',
        pip: symbol.pip ?? symbol.pip_size,
        submarket: symbol.submarket || '',
        submarketDisplayName: symbol.submarket_display_name || '',
        symbol: symbolCode,
    };
};

export const waitForChartApi = async () => {
    if (!chart_api.api) {
        await chart_api.init();
    }

    const api = chart_api.api as any;
    if (!api?.connection || api.connection.readyState === WebSocket.OPEN) {
        return api;
    }

    if (api.connection.readyState > WebSocket.OPEN) {
        await chart_api.init(true);
        return chart_api.api as any;
    }

    await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            api.connection.removeEventListener('open', onOpen);
            reject(new Error('Market data connection timeout'));
        }, 10000);

        const onOpen = () => {
            window.clearTimeout(timeout);
            resolve();
        };

        api.connection.addEventListener('open', onOpen, { once: true });
    });

    return chart_api.api as any;
};

const fetchTicks = async (symbol: string, pip?: number): Promise<AnalysisTick[]> => {
    const api = await waitForChartApi();
    const response = await api.send({
        count: DIGIT_HISTORY_SIZE,
        end: 'latest',
        style: 'ticks',
        ticks_history: symbol,
    });

    const prices = response?.history?.prices || [];
    const times = response?.history?.times || [];

    return prices
        .map((quote: number | string, index: number) => parseTick({ epoch: times[index], quote }, pip))
        .filter((tick: AnalysisTick) => Number.isFinite(tick.quote) && Number.isFinite(tick.epoch));
};

const withTimeout = async <T>(work: Promise<T>, ms = 15000): Promise<T> => {
    let timer = 0;
    try {
        return await Promise.race([
            work,
            new Promise<T>((_, reject) => {
                timer = window.setTimeout(() => reject(new Error('Market data timed out')), ms);
            }),
        ]);
    } finally {
        window.clearTimeout(timer);
    }
};

const forgotTickStream = (data: { echo_req?: { forget_all?: string | string[] }; msg_type?: string }) => {
    if (data?.msg_type !== 'forget_all') return false;
    const target = data.echo_req?.forget_all;
    if (Array.isArray(target)) return target.includes('ticks');
    return target === 'ticks';
};

export const subscribeToTicks = async (
    symbol: string,
    getPip: () => number | undefined,
    onTick: (tick: AnalysisTick) => void,
    onInterrupted?: () => void
) => {
    const api = await waitForChartApi();
    let subscriptionId = '';

    const messageSubscription = api.onMessage()?.subscribe(({ data }: { data: any }) => {
        if (forgotTickStream(data)) {
            onInterrupted?.();
            return;
        }
        if (data?.msg_type !== 'tick' || data.tick?.symbol !== symbol) return;
        onTick(parseTick(data.tick, getPip()));
    });

    const response = await api.send({
        subscribe: 1,
        ticks: symbol,
    });

    if (response?.error) {
        messageSubscription?.unsubscribe?.();
        throw new Error(response.error.message || 'Unable to subscribe to ticks');
    }

    subscriptionId = response?.subscription?.id || response?.tick?.id || '';

    if (response?.tick?.symbol === symbol || response?.tick?.quote != null) {
        onTick(parseTick(response.tick, getPip()));
    }

    return () => {
        messageSubscription?.unsubscribe?.();
        if (subscriptionId) {
            api.forget(subscriptionId).catch((error: unknown) => {
                console.warn('[Analysis] Failed to forget tick subscription:', error);
            });
        }
    };
};

export const loadSymbols = async (): Promise<AnalysisSymbol[]> => {
    let rawSymbols = api_base.active_symbols;

    if (!rawSymbols?.length) {
        await (api_base.active_symbols_promise || api_base.getActiveSymbols());
        rawSymbols = api_base.active_symbols;
    }

    if (!rawSymbols?.length) {
        rawSymbols = (await api_base.getActiveSymbols()) || [];
    }

    return rawSymbols
        .filter(isDerivedSymbol)
        .map(normalizeSymbol)
        .filter((symbol): symbol is AnalysisSymbol => Boolean(symbol))
        .sort((left, right) => {
            if (left.exchangeIsOpen !== right.exchangeIsOpen) return left.exchangeIsOpen ? -1 : 1;
            return left.displayName.localeCompare(right.displayName);
        });
};

export const useAnalysisMarketData = () => {
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [selectedSymbol, setSelectedSymbol] = useState('');
    const [status, setStatus] = useState<MarketStatus>('idle');
    const [symbols, setSymbols] = useState<AnalysisSymbol[]>([]);
    const [ticks, setTicks] = useState<AnalysisTick[]>([]);
    const [timeframe, setTimeframe] = useState<TimeframeOption>(TIMEFRAME_OPTIONS[0]);
    const [refreshIndex, setRefreshIndex] = useState(0);
    const mountedRef = useRef(true);
    const pipRef = useRef<number | undefined>(undefined);
    const historyKeyRef = useRef('');

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const initSymbols = async () => {
            try {
                const nextSymbols = await loadSymbols();
                if (cancelled || !mountedRef.current) return;

                setSymbols(nextSymbols);

                if (!selectedSymbol && nextSymbols.length) {
                    const preferredSymbol =
                        nextSymbols.find(symbol => symbol.exchangeIsOpen && symbol.symbol === '1HZ50V') ||
                        nextSymbols.find(symbol => symbol.exchangeIsOpen && symbol.symbol === '1HZ75V') ||
                        nextSymbols.find(symbol => symbol.exchangeIsOpen && symbol.symbol === 'R_100') ||
                        nextSymbols.find(symbol => symbol.exchangeIsOpen) ||
                        nextSymbols[0];

                    setSelectedSymbol(preferredSymbol.symbol);
                }
            } catch (loadError) {
                if (cancelled || !mountedRef.current) return;
                setError(loadError instanceof Error ? loadError.message : 'Unable to load markets');
                setStatus('error');
            }
        };

        initSymbols();

        return () => {
            cancelled = true;
        };
    }, [selectedSymbol]);

    const selectedSymbolInfo = useMemo(
        () => symbols.find(symbol => symbol.symbol === selectedSymbol) || null,
        [selectedSymbol, symbols]
    );
    pipRef.current = selectedSymbolInfo?.pip;

    useEffect(() => {
        const pip = selectedSymbolInfo?.pip;
        if (!selectedSymbol || pip == null) return undefined;
        const historyKey = `${selectedSymbol}:${pip}`;
        if (historyKeyRef.current === historyKey) return undefined;

        let cancelled = false;
        historyKeyRef.current = historyKey;
        fetchTicks(selectedSymbol, pip)
            .then(history => {
                if (cancelled || !mountedRef.current) return;
                setTicks(current => mergeTickHistory(history, current));
                setLastUpdated(Date.now());
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [selectedSymbol, selectedSymbolInfo?.pip]);

    useEffect(() => {
        if (!selectedSymbol) return undefined;

        let stopped = false;
        let generation = 0;
        let restarting = false;
        let boundApi: { connection?: { readyState?: number } } | null = null;
        let cleanupTicks: (() => void) | undefined;
        let lastTickAt: number | null = null;
        let pace: TickPace = { lastGapMs: 0, tickCount: 0 };
        let subscribedAt = 0;
        let forgetTimer = 0;
        let pendingRestart = false;
        const startedAt = Date.now();
        const symbol = selectedSymbol;
        const pip = pipRef.current;
        historyKeyRef.current = `${symbol}:${pip ?? 'na'}`;

        const noteTick = (tick: AnalysisTick) => {
            if (stopped || !mountedRef.current) return;
            const now = Date.now();
            pace = nextTickPace(pace, lastTickAt == null ? null : now - lastTickAt);
            lastTickAt = now;
            setTicks(current => appendAnalysisTick(current, tick));
            setLastUpdated(now);
            setStatus('live');
            setError('');
        };

        const attachTicks = async () => {
            if (stopped) return;
            if (restarting) {
                pendingRestart = true;
                return;
            }
            restarting = true;
            pendingRestart = false;
            const gen = ++generation;
            const previous = cleanupTicks;
            cleanupTicks = undefined;
            previous?.();

            try {
                const api = await waitForChartApi();
                if (stopped || gen !== generation) return;
                boundApi = api;
                const subscribePromise = subscribeToTicks(symbol, () => pipRef.current, noteTick, () => {
                    if (stopped || gen !== generation) return;
                    window.clearTimeout(forgetTimer);
                    forgetTimer = window.setTimeout(() => {
                        void attachTicks();
                    }, 400);
                });
                let cleanup: () => void;
                try {
                    cleanup = await withTimeout(subscribePromise);
                } catch (subscribeError) {
                    void subscribePromise.then(lateCleanup => lateCleanup()).catch(() => undefined);
                    throw subscribeError;
                }
                if (stopped || gen !== generation) {
                    cleanup();
                    return;
                }
                cleanupTicks = cleanup;
                subscribedAt = Date.now();
            } catch (streamError) {
                if (stopped || gen !== generation || !mountedRef.current) return;
                setError(streamError instanceof Error ? streamError.message : 'Unable to stream market data');
                setStatus('error');
            } finally {
                if (gen === generation) {
                    restarting = false;
                    if (pendingRestart && !stopped) {
                        pendingRestart = false;
                        void attachTicks();
                    }
                }
            }
        };

        const startStream = async () => {
            setStatus('loading');
            setError('');
            setTicks([]);
            setLastUpdated(null);

            try {
                const requestKey = `${symbol}:${pip ?? 'na'}`;
                const history = await withTimeout(fetchTicks(symbol, pip));
                if (!stopped && mountedRef.current && historyKeyRef.current === requestKey) {
                    setTicks(current => mergeTickHistory(history, current));
                    setLastUpdated(Date.now());
                    setStatus(history.length ? 'live' : 'loading');
                }
            } catch (streamError) {
                if (!stopped && mountedRef.current) {
                    setError(streamError instanceof Error ? streamError.message : 'Unable to stream market data');
                    setStatus('error');
                }
            }

            await attachTicks();
        };

        void startStream();

        const timer = window.setInterval(() => {
            if (stopped || restarting) return;
            if (!subscribedAt) {
                if (Date.now() - startedAt >= 15000) void attachTicks();
                return;
            }
            const api = chart_api.api as { connection?: { readyState?: number } } | undefined;
            const readyState = api?.connection?.readyState;
            if (readyState === WebSocket.CONNECTING) return;
            const socketOpen = readyState === WebSocket.OPEN;
            const apiChanged = Boolean(boundApi) && api !== boundApi;
            const quietFor = lastTickAt == null ? Date.now() - subscribedAt : Date.now() - lastTickAt;
            const stalled = quietFor >= tickStallLimitMs(pace.lastGapMs, pace.tickCount);
            if (!socketOpen || apiChanged || stalled) {
                void attachTicks();
            }
        }, 2000);

        return () => {
            stopped = true;
            generation += 1;
            window.clearInterval(timer);
            window.clearTimeout(forgetTimer);
            cleanupTicks?.();
        };
    }, [refreshIndex, selectedSymbol]);

    const refresh = useCallback(() => {
        setRefreshIndex(index => index + 1);
    }, []);

    return {
        candles: [] as AnalysisCandle[],
        error,
        lastUpdated,
        refresh,
        selectedSymbol,
        selectedSymbolInfo,
        setSelectedSymbol,
        setTimeframe,
        status,
        symbols,
        ticks,
        timeframe,
    };
};
