import type { FreeBot } from './types';

const evenOddBot = `<?xml version="1.0" encoding="UTF-8"?>
<xml xmlns="https://developers.google.com/blockly/xml">
  <variables><variable id="stake">Stake</variable><variable id="multiplier">Martingale Multiplier</variable></variables>
  <block type="trade_definition" id="trade_definition" x="20" y="20">
    <statement name="TRADE_OPTIONS"><block type="trade_definition_market"><field name="MARKET_LIST">synthetic_index</field><field name="SUBMARKET_LIST">random_index</field><field name="SYMBOL_LIST">R_100</field><next><block type="trade_definition_tradetype"><field name="TRADETYPECAT_LIST">digits</field><field name="TRADETYPE_LIST">evenodd</field><next><block type="trade_definition_contracttype"><field name="TYPE_LIST">both</field><next><block type="trade_definition_candleinterval"><field name="CANDLEINTERVAL_LIST">60</field></block></next></block></next></block></next></block></statement>
    <statement name="INITIALIZATION"><block type="variables_set"><field name="VAR" id="stake">Stake</field><value name="VALUE"><block type="math_number"><field name="NUM">1</field></block></value><next><block type="variables_set"><field name="VAR" id="multiplier">Martingale Multiplier</field><value name="VALUE"><block type="math_number"><field name="NUM">2</field></block></value></next></block></next></block></statement>
    <statement name="SUBMARKET"><block type="trade_definition_tradeoptions"><mutation has_first_barrier="false" has_second_barrier="false"/><field name="DURATIONTYPE_LIST">t</field><value name="DURATION"><block type="math_number"><field name="NUM">1</field></block></value><value name="AMOUNT"><block type="variables_get"><field name="VAR" id="stake">Stake</field></block></value></block></statement>
  </block>
  <block type="before_purchase" x="520" y="20"><statement name="BEFOREPURCHASE_STACK"><block type="controls_if"><mutation else="1"/><value name="IF0"><block type="math_number_property"><mutation divisor_input="false"/><field name="PROPERTY">EVEN</field><value name="NUMBER_TO_CHECK"><block type="last_digit"/></value></block></value><statement name="DO0"><block type="purchase"><field name="PURCHASE_LIST">DIGITEVEN</field></block></statement><statement name="ELSE"><block type="purchase"><field name="PURCHASE_LIST">DIGITODD</field></block></statement></block></statement></block>
  <block type="after_purchase" x="520" y="220"><statement name="AFTERPURCHASE_STACK"><block type="controls_if"><mutation else="1"/><value name="IF0"><block type="contract_check_result"><field name="CHECK_RESULT">win</field></block></value><statement name="DO0"><block type="variables_set"><field name="VAR" id="stake">Stake</field><value name="VALUE"><block type="math_number"><field name="NUM">1</field></block></value></block></statement><statement name="ELSE"><block type="variables_set"><field name="VAR" id="stake">Stake</field><value name="VALUE"><block type="math_arithmetic"><field name="OP">MULTIPLY</field><value name="A"><block type="variables_get"><field name="VAR" id="stake">Stake</field></block></value><value name="B"><block type="variables_get"><field name="VAR" id="multiplier">Martingale Multiplier</field></block></value></block></value></block></statement><next><block type="trade_again"/></next></block></statement></block>
</xml>`;

const matchesBot = evenOddBot.replace(/evenodd/g, 'matchesdiffers').replace(/DIGITEVEN/g, 'DIGITMATCH').replace(/DIGITODD/g, 'DIGITDIFF').replace(/EVEN/g, 'ODD');
const overUnderBot = evenOddBot.replace(/evenodd/g, 'overunder').replace(/DIGITEVEN/g, 'DIGITOVER').replace(/DIGITODD/g, 'DIGITUNDER');
const parityBot = evenOddBot.replace(/R_100/g, '1HZ10V');

export const FREE_BOTS: FreeBot[] = [
    { id: 'free-even-odd', title: 'Even/Odd Starter', description: 'A clean parity bot with a small recovery multiplier.', tags: ['Digits', 'Even/Odd'], xml: evenOddBot },
    { id: 'free-matches-differs', title: 'Matches/Differs Starter', description: 'A simple matches and differs strategy for digit markets.', tags: ['Digits', 'Matches/Differs'], xml: matchesBot },
    { id: 'free-over-under', title: 'Over/Under Starter', description: 'A ready-to-load over and under digit strategy.', tags: ['Digits', 'Over/Under'], xml: overUnderBot },
    { id: 'free-1hz10v-parity', title: '1HZ10V Parity', description: 'The parity starter configured for Volatility 10 (1s).', tags: ['Synthetic', '1HZ10V'], xml: parityBot },
];
