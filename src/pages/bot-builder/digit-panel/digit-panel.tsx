import { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { localize } from '@deriv-com/translations';
import { observer } from 'mobx-react-lite';
import { formatAnalysisPrice } from '@/pages/analysis/analysis-engine';
import {
    computeDigitDistribution,
    DEFAULT_DIGIT_TICKS,
    DIGIT_TICK_OPTIONS,
    OVER_DIGIT,
    UNDER_DIGIT,
} from '@/pages/analysis/digit-distribution';
import { useAnalysisMarketData } from '@/pages/analysis/use-analysis-market-data';
import { applyTradeSymbol, readTradeMarket, type TradeMarketSelection } from './trade-market';
import './digit-panel.scss';

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const splitPrice = (price: string) => {
    const match = price.match(/^(.*?)(\d)$/);
    if (!match) return { body: price, last: '' };
    return { body: match[1], last: match[2] };
};

const sameSelection = (left: TradeMarketSelection, right: TradeMarketSelection) =>
    left.market === right.market &&
    left.submarket === right.submarket &&
    left.symbol === right.symbol &&
    left.options.length === right.options.length &&
    left.options.every((option, index) => option.value === right.options[index]?.value);

const DigitPanel = () => {
    const [tickSampleSize, setTickSampleSize] = useState(DEFAULT_DIGIT_TICKS);
    const [trade, setTrade] = useState<TradeMarketSelection>(() => readTradeMarket());
    const { error, selectedSymbol, selectedSymbolInfo, setSelectedSymbol, status, ticks } = useAnalysisMarketData();

    useEffect(() => {
        const refresh = () => {
            const next = readTradeMarket();
            setTrade(current => (sameSelection(current, next) ? current : next));
        };
        refresh();
        const workspace = window.Blockly?.derivWorkspace;
        if (!workspace?.addChangeListener) return undefined;
        workspace.addChangeListener(refresh);
        return () => workspace.removeChangeListener(refresh);
    }, []);

    useEffect(() => {
        if (trade.symbol && trade.symbol !== selectedSymbol) {
            setSelectedSymbol(trade.symbol);
        }
    }, [selectedSymbol, setSelectedSymbol, trade.symbol]);

    const board = useMemo(() => computeDigitDistribution(ticks, tickSampleSize), [tickSampleSize, ticks]);
    const priceText = status === 'loading' ? '…' : formatAnalysisPrice(board.lastPrice, selectedSymbolInfo?.pip);
    const price = splitPrice(priceText);
    const selectedOption = trade.options.find(option => option.value === (trade.symbol || selectedSymbol));
    const marketName = selectedOption?.label || selectedSymbolInfo?.displayName || trade.symbol || '—';
    const symbolCode = trade.symbol || selectedSymbol || '—';

    const chooseSymbol = (symbol: string) => {
        applyTradeSymbol(symbol);
        setSelectedSymbol(symbol);
        setTrade(current => ({ ...current, symbol }));
    };

    return (
        <section className='digit-panel' aria-label={localize('Digit Distribution')}>
            <header className='digit-panel__header'>
                <div>
                    <p className='digit-panel__kicker'>{localize('Live analysis')}</p>
                    <h2 className='digit-panel__title'>{localize('Digit Distribution')}</h2>
                </div>
                <div className='digit-panel__header-actions'>
                    <label className='digit-panel__ticks' htmlFor='digit-panel-ticks'>
                        <span>{localize('Ticks')}</span>
                        <select
                            id='digit-panel-ticks'
                            value={tickSampleSize}
                            onChange={event => setTickSampleSize(Number(event.target.value))}
                        >
                            {DIGIT_TICK_OPTIONS.map(sampleSize => (
                                <option key={sampleSize} value={sampleSize}>
                                    {sampleSize}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </header>

            <div className='digit-panel__body'>
                <div className='digit-panel__summary'>
                    <label className='digit-panel__market' htmlFor='digit-panel-market'>
                        <span className='digit-panel__eyebrow'>{localize('Selected market')}</span>
                        <select
                            id='digit-panel-market'
                            className='digit-panel__market-select'
                            value={symbolCode === '—' ? '' : symbolCode}
                            onChange={event => chooseSymbol(event.target.value)}
                        >
                            {!trade.options.some(option => option.value === symbolCode) && symbolCode !== '—' ? (
                                <option value={symbolCode}>{marketName}</option>
                            ) : null}
                            {trade.options.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <strong className='digit-panel__code'>{symbolCode}</strong>
                    </label>
                    <div className='digit-panel__price'>
                        <span className='digit-panel__eyebrow'>{localize('Current price')}</span>
                        <strong className='digit-panel__price-value'>
                            <span>{price.body}</span>
                            {price.last ? <span className='digit-panel__price-last'>{price.last}</span> : null}
                        </strong>
                    </div>
                </div>

                {error ? <p className='digit-panel__error'>{error}</p> : null}

                <div className='digit-panel__grid' role='list' aria-label={localize('Digit percentages')}>
                    {board.percents.map((percent, digit) => {
                        const isCurrent = digit === board.lastDigit;
                        const isHot = digit === board.hotDigit && !isCurrent;
                        const isSecond = digit === board.secondHotDigit;
                        const isCold =
                            digit === board.coldDigit && !isCurrent && digit !== board.hotDigit && !isSecond;
                        return (
                            <div
                                key={digit}
                                role='listitem'
                                className={classNames('digit-panel__cell', {
                                    'digit-panel__cell--current': isCurrent,
                                    'digit-panel__cell--hot': isHot,
                                    'digit-panel__cell--second': isSecond,
                                    'digit-panel__cell--cold': isCold,
                                })}
                            >
                                <span className='digit-panel__bubble'>
                                    <span className='digit-panel__digit'>{digit}</span>
                                    <span className='digit-panel__percent'>{formatPercent(percent)}</span>
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className='digit-panel__recent' aria-label={localize('Latest digits')}>
                    {board.recentDigits.map((digit, index) => (
                        <span
                            key={`${digit}-${index}`}
                            className={classNames('digit-panel__chip', {
                                'digit-panel__chip--even': digit % 2 === 0,
                                'digit-panel__chip--odd': digit % 2 === 1,
                                'digit-panel__chip--latest': index === board.recentDigits.length - 1,
                            })}
                        >
                            {digit}
                        </span>
                    ))}
                </div>

                <div className='digit-panel__bars'>
                    <SplitBar left={localize('Even')} right={localize('Odd')} leftPercent={board.evenPercent} rightPercent={board.oddPercent} />
                    <SplitBar left={localize('Rise')} right={localize('Fall')} leftPercent={board.risePercent} rightPercent={board.fallPercent} />
                    <SplitBar
                        left={`${localize('Over')} ${OVER_DIGIT}`}
                        right={`${localize('Under')} ${UNDER_DIGIT}`}
                        leftPercent={board.overPercent}
                        rightPercent={board.underPercent}
                    />
                </div>
            </div>
        </section>
    );
};

const SplitBar = ({
    left,
    right,
    leftPercent,
    rightPercent,
}: {
    left: string;
    leftPercent: number;
    right: string;
    rightPercent: number;
}) => (
    <div className='digit-panel__split'>
        <div className='digit-panel__split-labels'>
            <span>
                {left} {formatPercent(leftPercent)}
            </span>
            <span>
                {right} {formatPercent(rightPercent)}
            </span>
        </div>
        <div className='digit-panel__track' aria-hidden='true'>
            <span className='digit-panel__track-left' style={{ width: `${leftPercent}%` }} />
            <span className='digit-panel__track-right' style={{ width: `${rightPercent}%` }} />
        </div>
    </div>
);

export default observer(DigitPanel);
