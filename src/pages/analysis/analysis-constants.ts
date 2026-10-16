export const DEFAULT_OVER_UNDER_BARRIER = 4;
export const DEFAULT_TICK_SAMPLE_SIZE = 100;
export const OVER_UNDER_BARRIER_OPTIONS = Array.from({ length: 10 }, (_, digit) => digit);
export const TICK_SAMPLE_OPTIONS = [30, 50, 100, 200, 500];
export const MAX_TICK_SAMPLE_SIZE = TICK_SAMPLE_OPTIONS[TICK_SAMPLE_OPTIONS.length - 1];
export const MIN_TICK_SAMPLE_SIZE = TICK_SAMPLE_OPTIONS[0];
