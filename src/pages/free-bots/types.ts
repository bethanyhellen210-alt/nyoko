export type FreeBotAction = 'RUN' | 'LOAD';

/**
 * A free bot entry backed by a raw Blockly XML string.
 * Add entries via catalog.ts.
 */
export type FreeBot = {
    id: string;
    title: string;
    description: string;
    tags?: string[];
    /** Raw Blockly XML content for this bot. */
    xml: string;
};
