import type { TFormData } from '../bot-builder/quick-strategy/types';
import type { AnalysisIdea, AnalysisSnapshot, IdeaDirection, OptionFamily } from './analysis-types';

export type SignalBotAction = 'LOAD' | 'RUN';

export type SignalBotStrategy =
    | 'MARTINGALE'
    | 'D_ALEMBERT'
    | 'REVERSE_MARTINGALE'
    | 'REVERSE_D_ALEMBERT'
    | 'OSCARS_GRIND'
    | 'STRATEGY_1_3_2_6';

type TSignalContract = {
    last_digit_prediction?: string;
    tradetype: string;
    type: string;
};

const SIGNAL_CONTRACTS_BY_DIRECTION: Partial<Record<IdeaDirection, TSignalContract>> = {
    differs: {
        tradetype: 'matchesdiffers',
        type: 'DIGITDIFF',
    },
    even: {
        last_digit_prediction: '0',
        tradetype: 'evenodd',
        type: 'DIGITEVEN',
    },
    fall: {
        tradetype: 'callput',
        type: 'PUT',
    },
    matches: {
        tradetype: 'matchesdiffers',
        type: 'DIGITMATCH',
    },
    odd: {
        last_digit_prediction: '1',
        tradetype: 'evenodd',
        type: 'DIGITODD',
    },
    over: {
        tradetype: 'overunder',
        type: 'DIGITOVER',
    },
    rise: {
        tradetype: 'callput',
        type: 'CALL',
    },
    under: {
        tradetype: 'overunder',
        type: 'DIGITUNDER',
    },
};

const clampDigit = (digit: number) => Math.max(0, Math.min(9, Math.round(digit)));

export const isActionableSignalDirection = (direction: IdeaDirection) =>
    Object.prototype.hasOwnProperty.call(SIGNAL_CONTRACTS_BY_DIRECTION, direction);

export const getSignalDigitPrediction = (idea: AnalysisIdea, fallback_digit = 0) => {
    const digit_match = idea.prediction?.match(/\d/);

    return digit_match ? digit_match[0] : String(clampDigit(fallback_digit));
};

export const getSignalContract = (idea: AnalysisIdea, fallback_digit = 0): TSignalContract | null => {
    const contract = SIGNAL_CONTRACTS_BY_DIRECTION[idea.direction];

    if (!contract) return null;

    const needs_prediction = ['differs', 'matches', 'over', 'under'].includes(idea.direction);

    return {
        ...contract,
        last_digit_prediction: needs_prediction
            ? getSignalDigitPrediction(idea, fallback_digit)
            : contract.last_digit_prediction,
    };
};

export const shouldBlockSignalBotRun = (snapshot: AnalysisSnapshot, use_volatility_guard: boolean) =>
    use_volatility_guard && snapshot.volatility === 'spike';

const SIGNAL_DIRECTIONS_BY_FAMILY: Record<OptionFamily, IdeaDirection[]> = {
    even_odd: ['even', 'odd'],
    matches_differs: ['matches', 'differs'],
    over_under: ['over', 'under'],
    rise_fall: ['rise', 'fall'],
};

const getTargetPrediction = (direction: IdeaDirection, snapshot: AnalysisSnapshot, over_under_barrier: number) => {
    switch (direction) {
        case 'differs':
            return `Differs ${snapshot.digitStats?.coldDigit ?? clampDigit(over_under_barrier)}`;
        case 'matches':
            return `Matches ${snapshot.digitStats?.hotDigit ?? clampDigit(over_under_barrier)}`;
        case 'over':
            return `Over ${clampDigit(over_under_barrier)}`;
        case 'under':
            return `Under ${clampDigit(over_under_barrier)}`;
        case 'even':
            return 'Even';
        case 'odd':
            return 'Odd';
        default:
            return undefined;
    }
};

export const getSignalBotTargets = (
    snapshot: AnalysisSnapshot,
    option_family: OptionFamily,
    over_under_barrier: number
): AnalysisIdea[] =>
    SIGNAL_DIRECTIONS_BY_FAMILY[option_family].map(direction => {
        const existing_idea = snapshot.ideas.find(idea => idea.direction === direction);

        if (existing_idea) return existing_idea;

        return {
            confidence: 50,
            direction,
            horizon: option_family === 'rise_fall' ? '5 ticks' : `${snapshot.digitStats?.sampleSize ?? 30} ticks`,
            id: `signal-bot-target-${direction}`,
            invalidation: 'Review live market conditions before running',
            prediction: getTargetPrediction(direction, snapshot, over_under_barrier),
            price: snapshot.lastPrice ?? 0,
            reasons: ['Manual signal bot action'],
            title: `${direction.charAt(0).toUpperCase()}${direction.slice(1)} bot`,
        };
    });

export const buildSignalBotFormData = ({
    action,
    idea,
    option_family,
    over_under_barrier,
    symbol,
}: {
    action: SignalBotAction;
    idea: AnalysisIdea;
    option_family: OptionFamily;
    over_under_barrier: number;
    symbol: string;
}): TFormData | null => {
    const contract = getSignalContract(idea, over_under_barrier);

    if (!contract) return null;

    return {
        action,
        boolean_max_stake: true,
        duration: '1',
        durationtype: 't',
        last_digit_prediction: contract.last_digit_prediction ?? String(clampDigit(over_under_barrier)),
        loss: '10',
        max_stake: '25',
        profit: '5',
        size: '2',
        stake: '1',
        symbol,
        tradetype: contract.tradetype,
        type: contract.type,
        unit: '1',
    };
};
