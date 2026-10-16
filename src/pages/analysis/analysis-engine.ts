import type {
    AnalysisCandle,
    AnalysisIdea,
    AnalysisSnapshot,
    AnalysisSymbol,
    AnalysisTick,
    DigitStats,
    OptionFamily,
    TimeframeOption,
} from './analysis-types';
import {
    DEFAULT_OVER_UNDER_BARRIER,
    DEFAULT_TICK_SAMPLE_SIZE,
    MAX_TICK_SAMPLE_SIZE,
    MIN_TICK_SAMPLE_SIZE,
} from './analysis-constants';

const formatPrice = (value: number | null, pip?: number) => {
    if (value === null || Number.isNaN(value)) return '-';

    const decimals = pip ? Math.max(0, Math.min(8, String(pip).split('.')[1]?.length ?? 2)) : 2;
    return value.toLocaleString(undefined, {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
    });
};

const calculateEma = (values: number[], period: number): number | null => {
    if (values.length < period) return null;

    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

    for (let index = period; index < values.length; index++) {
        ema = (values[index] - ema) * multiplier + ema;
    }

    return ema;
};

const calculateRsi = (values: number[], period = 14): number | null => {
    if (values.length <= period) return null;

    let gains = 0;
    let losses = 0;

    for (let index = values.length - period; index < values.length; index++) {
        const change = values[index] - values[index - 1];
        if (change >= 0) gains += change;
        else losses += Math.abs(change);
    }

    if (losses === 0) return 100;

    const relativeStrength = gains / period / (losses / period);
    return 100 - 100 / (1 + relativeStrength);
};

const average = (values: number[]) => {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const getRangeRatio = (candles: AnalysisCandle[]) => {
    if (candles.length < 30) return null;

    const ranges = candles.map(candle => Math.max(0, candle.high - candle.low));
    const recent = average(ranges.slice(-10));
    const baseline = average(ranges.slice(-30, -10));

    if (!recent || !baseline) return null;
    return recent / baseline;
};

const classifyVolatility = (rangeRatio: number | null): AnalysisSnapshot['volatility'] => {
    if (rangeRatio === null) return 'stable';
    if (rangeRatio >= 1.75) return 'spike';
    if (rangeRatio >= 1.18) return 'expanding';
    if (rangeRatio <= 0.72) return 'compressed';
    return 'stable';
};

const clampConfidence = (value: number) => Math.max(35, Math.min(88, Math.round(value)));

const toPercent = (value: number, sampleSize: number) => (sampleSize ? Math.round((value / sampleSize) * 100) : 0);

const clampDigitBarrier = (barrier: number) => Math.max(0, Math.min(9, Math.round(barrier)));

const clampTickSampleSize = (sampleSize: number) =>
    Math.max(MIN_TICK_SAMPLE_SIZE, Math.min(MAX_TICK_SAMPLE_SIZE, Math.round(sampleSize)));

const buildIdea = ({
    direction,
    title,
    confidence,
    reasons,
    invalidation,
    prediction,
    price,
    horizon,
}: {
    confidence: number;
    direction: AnalysisIdea['direction'];
    horizon: string;
    invalidation: string;
    prediction?: string;
    price: number;
    reasons: string[];
    title: string;
}): AnalysisIdea => ({
    confidence: clampConfidence(confidence),
    direction,
    horizon,
    id: `${direction}-${title}-${prediction ?? ''}-${price}`,
    invalidation,
    prediction,
    price,
    reasons,
    title,
});

const getDigitStats = (ticks: AnalysisTick[], tickSampleSize: number, overUnderBarrier: number): DigitStats | null => {
    const barrier = clampDigitBarrier(overUnderBarrier);
    const sample = ticks.slice(-clampTickSampleSize(tickSampleSize));
    if (!sample.length) return null;

    const counts = Array(10).fill(0);
    sample.forEach(tick => {
        if (Number.isInteger(tick.digit) && tick.digit >= 0 && tick.digit <= 9) {
            counts[tick.digit] += 1;
        }
    });

    const evenCount = counts[0] + counts[2] + counts[4] + counts[6] + counts[8];
    const oddCount = counts[1] + counts[3] + counts[5] + counts[7] + counts[9];
    const underCount = counts.slice(0, barrier).reduce((sum, count) => sum + count, 0);
    const overCount = counts.slice(barrier + 1).reduce((sum, count) => sum + count, 0);
    const barrierCount = counts[barrier];
    const hotDigit = counts.reduce((hotIndex, count, index) => (count > counts[hotIndex] ? index : hotIndex), 0);
    const coldDigit = counts.reduce((coldIndex, count, index) => (count < counts[coldIndex] ? index : coldIndex), 0);
    const lastDigit = sample[sample.length - 1]?.digit ?? null;

    return {
        barrierCount,
        coldDigit,
        counts,
        evenCount,
        hotDigit,
        lastDigit,
        oddCount,
        overCount,
        sampleSize: sample.length,
        underCount,
    };
};

const buildWaitingSnapshot = ({
    candles,
    digitStats,
    lastPrice,
    optionFamily,
    timeframe,
}: {
    candles: AnalysisCandle[];
    digitStats: DigitStats | null;
    lastPrice: number | null;
    optionFamily: OptionFamily;
    timeframe: TimeframeOption;
}): Pick<AnalysisSnapshot, 'digitStats' | 'ideas' | 'lastPrice' | 'optionFamily'> => ({
    digitStats,
    ideas: [
        {
            confidence: 40,
            direction: 'wait',
            horizon: optionFamily === 'rise_fall' ? timeframe.horizon : `${Math.max(20, digitStats?.sampleSize ?? 0)} ticks`,
            id: 'warming-up',
            invalidation: 'Needs more live derived-market data',
            price: lastPrice ?? candles[candles.length - 1]?.close ?? 0,
            reasons: ['Market data loading'],
            title: 'Waiting for a usable sample',
        },
    ],
    lastPrice,
    optionFamily,
});

const buildRiseFallIdeas = ({
    emaFast,
    emaSlow,
    lastPrice,
    momentum,
    rangeRatio,
    rsi,
    timeframe,
    trend,
    volatility,
    pip,
}: {
    emaFast: number;
    emaSlow: number;
    lastPrice: number;
    momentum: number;
    pip?: number;
    rangeRatio: number | null;
    rsi: number;
    timeframe: TimeframeOption;
    trend: AnalysisSnapshot['trend'];
    volatility: AnalysisSnapshot['volatility'];
}) => {
    const ideas: AnalysisIdea[] = [];
    const formattedFast = formatPrice(emaFast, pip);
    const formattedSlow = formatPrice(emaSlow, pip);

    if (volatility === 'spike') {
        ideas.push(
            buildIdea({
                confidence: 58,
                direction: 'wait',
                horizon: timeframe.horizon,
                invalidation: 'Range normalises below recent average',
                price: lastPrice,
                reasons: ['Range spike', `RSI ${Math.round(rsi)}`, `EMA 9 ${formattedFast}`],
                title: 'Wait before Rise/Fall',
            })
        );
    }

    if (trend === 'up' && momentum > 0 && rsi < 70 && volatility !== 'spike') {
        ideas.push(
            buildIdea({
                confidence: 62 + (rsi > 45 && rsi < 62 ? 10 : 0) + (volatility === 'stable' ? 6 : 0),
                direction: 'rise',
                horizon: timeframe.horizon,
                invalidation: `Close below EMA 21 (${formattedSlow})`,
                price: lastPrice,
                reasons: ['EMA 9 above EMA 21', 'Positive momentum', `RSI ${Math.round(rsi)}`],
                title: 'Rise idea',
            })
        );
    }

    if (trend === 'down' && momentum < 0 && rsi > 30 && volatility !== 'spike') {
        ideas.push(
            buildIdea({
                confidence: 62 + (rsi > 38 && rsi < 55 ? 10 : 0) + (volatility === 'stable' ? 6 : 0),
                direction: 'fall',
                horizon: timeframe.horizon,
                invalidation: `Close above EMA 21 (${formattedSlow})`,
                price: lastPrice,
                reasons: ['EMA 9 below EMA 21', 'Negative momentum', `RSI ${Math.round(rsi)}`],
                title: 'Fall idea',
            })
        );
    }

    if (volatility === 'compressed' && rangeRatio !== null && Math.abs(emaFast - emaSlow) / lastPrice < 0.0015) {
        ideas.push(
            buildIdea({
                confidence: 55,
                direction: 'watch',
                horizon: timeframe.horizon,
                invalidation: 'No candle expansion',
                price: lastPrice,
                reasons: ['Compressed range', 'EMA lines converging', `Last price ${formatPrice(lastPrice, pip)}`],
                title: 'Rise/Fall breakout watch',
            })
        );
    }

    if (!ideas.length) {
        ideas.push(
            buildIdea({
                confidence: 48,
                direction: 'wait',
                horizon: timeframe.horizon,
                invalidation: 'Trend and momentum align',
                price: lastPrice,
                reasons: [`Trend ${trend}`, `RSI ${Math.round(rsi)}`, `EMA 9 ${formattedFast}`],
                title: 'No clean Rise/Fall idea',
            })
        );
    }

    return ideas;
};

const buildDigitIdeas = ({
    overUnderBarrier,
    digitStats,
    lastPrice,
    optionFamily,
}: {
    digitStats: DigitStats;
    lastPrice: number;
    optionFamily: OptionFamily;
    overUnderBarrier: number;
}) => {
    const sampleSize = digitStats.sampleSize;
    const horizon = `${sampleSize} ticks`;
    const ideas: AnalysisIdea[] = [];
    const coldCount = digitStats.counts[digitStats.coldDigit];
    const hotCount = digitStats.counts[digitStats.hotDigit];
    const barrier = clampDigitBarrier(overUnderBarrier);

    if (sampleSize < MIN_TICK_SAMPLE_SIZE) {
        return [
            buildIdea({
                confidence: 40,
                direction: 'wait',
                horizon,
                invalidation: `At least ${MIN_TICK_SAMPLE_SIZE} ticks collected`,
                price: lastPrice,
                reasons: [`Sample ${sampleSize} ticks`],
                title: 'Waiting for digit sample',
            }),
        ];
    }

    if (optionFamily === 'even_odd') {
        const evenPercent = toPercent(digitStats.evenCount, sampleSize);
        const oddPercent = toPercent(digitStats.oddCount, sampleSize);
        const isEven = digitStats.evenCount >= digitStats.oddCount;
        const spread = Math.abs(evenPercent - oddPercent);

        if (spread < 6) {
            return [
                buildIdea({
                    confidence: 45,
                    direction: 'wait',
                    horizon,
                    invalidation: 'Even/Odd spread widens beyond 6%',
                    price: lastPrice,
                    reasons: [`Even ${evenPercent}%`, `Odd ${oddPercent}%`, `Last digit ${digitStats.lastDigit}`],
                    title: 'Even/Odd balanced',
                }),
            ];
        }

        ideas.push(
            buildIdea({
                confidence: 52 + spread,
                direction: isEven ? 'even' : 'odd',
                horizon,
                invalidation: 'Digit parity returns to balance',
                prediction: isEven ? 'Even' : 'Odd',
                price: lastPrice,
                reasons: [`Even ${evenPercent}%`, `Odd ${oddPercent}%`, `Last digit ${digitStats.lastDigit}`],
                title: isEven ? 'Even idea' : 'Odd idea',
            })
        );
    }

    if (optionFamily === 'over_under') {
        const overPercent = toPercent(digitStats.overCount, sampleSize);
        const underPercent = toPercent(digitStats.underCount, sampleSize);
        const barrierPercent = toPercent(digitStats.barrierCount, sampleSize);
        const isOver = digitStats.overCount >= digitStats.underCount;
        const spread = Math.abs(overPercent - underPercent);

        if (spread < 6) {
            return [
                buildIdea({
                    confidence: 45,
                    direction: 'wait',
                    horizon,
                    invalidation: 'Over/Under spread widens beyond 6%',
                    price: lastPrice,
                    reasons: [
                        `Digits > ${barrier}: ${overPercent}%`,
                        `Digits < ${barrier}: ${underPercent}%`,
                        `Digit = ${barrier}: ${barrierPercent}%`,
                    ],
                    title: 'Over/Under balanced',
                }),
            ];
        }

        ideas.push(
            buildIdea({
                confidence: 52 + spread,
                direction: isOver ? 'over' : 'under',
                horizon,
                invalidation: `Digit distribution returns to balance around barrier ${barrier}`,
                prediction: isOver ? `Over ${barrier}` : `Under ${barrier}`,
                price: lastPrice,
                reasons: [
                    `Digits > ${barrier}: ${overPercent}%`,
                    `Digits < ${barrier}: ${underPercent}%`,
                    `Last digit ${digitStats.lastDigit}`,
                ],
                title: isOver ? `Digit Over ${barrier} idea` : `Digit Under ${barrier} idea`,
            })
        );
    }

    if (optionFamily === 'matches_differs') {
        const coldPercent = toPercent(coldCount, sampleSize);
        const hotPercent = toPercent(hotCount, sampleSize);

        ideas.push(
            buildIdea({
                confidence: 62 + Math.max(0, 10 - coldPercent),
                direction: 'differs',
                horizon,
                invalidation: `Digit ${digitStats.coldDigit} starts repeating`,
                prediction: `Differs ${digitStats.coldDigit}`,
                price: lastPrice,
                reasons: [
                    `Cold digit ${digitStats.coldDigit}: ${coldPercent}%`,
                    `Hot digit ${digitStats.hotDigit}: ${hotPercent}%`,
                    `Last digit ${digitStats.lastDigit}`,
                ],
                title: `Differs from ${digitStats.coldDigit} idea`,
            })
        );

        if (hotPercent >= 15) {
            ideas.push(
                buildIdea({
                    confidence: 40 + hotPercent,
                    direction: 'matches',
                    horizon,
                    invalidation: `Digit ${digitStats.hotDigit} cools below 12%`,
                    prediction: `Matches ${digitStats.hotDigit}`,
                    price: lastPrice,
                    reasons: [`Hot digit ${digitStats.hotDigit}: ${hotPercent}%`, `Sample ${sampleSize} ticks`],
                    title: `Matches ${digitStats.hotDigit} watch`,
                })
            );
        }
    }

    return ideas;
};

export const generateAnalysisSnapshot = (
    candles: AnalysisCandle[],
    ticks: AnalysisTick[],
    symbol: AnalysisSymbol | null,
    timeframe: TimeframeOption,
    optionFamily: OptionFamily,
    tickSampleSize = DEFAULT_TICK_SAMPLE_SIZE,
    overUnderBarrier = DEFAULT_OVER_UNDER_BARRIER
): AnalysisSnapshot => {
    const closes = candles.map(candle => candle.close);
    const lastCandle = candles[candles.length - 1];
    const lastTick = ticks[ticks.length - 1];
    const lastPrice = lastTick?.quote ?? lastCandle?.close ?? null;
    const emaFast = calculateEma(closes, 9);
    const emaSlow = calculateEma(closes, 21);
    const rsi = calculateRsi(closes);
    const momentum = closes.length > 8 ? closes[closes.length - 1] - closes[closes.length - 8] : null;
    const rangeRatio = getRangeRatio(candles);
    const volatility = classifyVolatility(rangeRatio);
    const digitStats = getDigitStats(ticks, tickSampleSize, overUnderBarrier);
    const pip = symbol?.pip;

    const trend =
        emaFast !== null && emaSlow !== null && lastPrice !== null
            ? emaFast > emaSlow && lastPrice > emaFast
                ? 'up'
                : emaFast < emaSlow && lastPrice < emaFast
                  ? 'down'
                  : 'mixed'
            : 'mixed';

    const needsCandleData =
        optionFamily === 'rise_fall' &&
        (!lastCandle || lastPrice === null || emaFast === null || emaSlow === null || rsi === null || momentum === null);
    const needsTickData = optionFamily !== 'rise_fall' && (!digitStats || lastPrice === null);

    if (needsCandleData || needsTickData) {
        const waiting = buildWaitingSnapshot({ candles, digitStats, lastPrice, optionFamily, timeframe });

        return {
            ...waiting,
            emaFast,
            emaSlow,
            momentum,
            rangeRatio,
            rsi,
            trend,
            volatility,
        };
    }

    const ideas =
        optionFamily === 'rise_fall'
            ? buildRiseFallIdeas({
                  emaFast: emaFast as number,
                  emaSlow: emaSlow as number,
                  lastPrice: lastPrice as number,
                  momentum: momentum as number,
                  pip,
                  rangeRatio,
                  rsi: rsi as number,
                  timeframe,
                  trend,
                  volatility,
              })
            : buildDigitIdeas({
                  digitStats: digitStats as DigitStats,
                  lastPrice: lastPrice as number,
                  optionFamily,
                  overUnderBarrier,
              });

    return {
        digitStats,
        emaFast,
        emaSlow,
        ideas,
        lastPrice,
        momentum,
        optionFamily,
        rangeRatio,
        rsi,
        trend,
        volatility,
    };
};

export const formatAnalysisPrice = formatPrice;
