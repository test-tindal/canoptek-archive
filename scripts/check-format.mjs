import assert from 'node:assert/strict';
import {formatRuleMarkdown,ruleNameSort} from '../src/ruleFormatting.mjs';

assert.equal(
 formatRuleMarkdown('Before:\n- First\n- Second\nAfter the list.'),
 'Before:\n- First\n- Second\n\nAfter the list.'
);
assert.equal(
 formatRuleMarkdown('A rule:\n▪ Choice A\n▪ Choice B\nAdditional effect.'),
 'A rule:\n- Choice A\n- Choice B\n\nAdditional effect.'
);
assert.equal(
 formatRuleMarkdown('1. First\n2. Second\nClosing statement.'),
 '1. First\n2. Second\n\nClosing statement.'
);
assert.equal(
 formatRuleMarkdown('- Part 1\n  wrapped continuation\n- Part 2\n\nEnd'),
 '- Part 1\n  wrapped continuation\n- Part 2\n\nEnd'
);
assert.equal(
 formatRuleMarkdown('**[LANCE]**\n***Example:*** A rule.'),
 '**[LANCE]**\n***Example:*** A rule.'
);
assert.deepEqual([{name:'Zeta'},{name:'alpha'},{name:'Beta'}].sort(ruleNameSort).map(x=>x.name),['alpha','Beta','Zeta']);
console.log('PASS: Markdown list separation, unicode bullets, bold formatting and alphabetical rule sorting');
