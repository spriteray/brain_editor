const assert = require('node:assert/strict');
const { generateDebugTrace } = require('../src/domain/debug.ts');
const { behaviorTreeToXml } = require('../src/domain/xml.ts');
const { validateTree } = require('../src/domain/validate.ts');
const definitions = [
  ['SubTree', 'Decorator', 1, 1], ['Sequence', 'Composite', 1, '*'],
  ['ReactiveSelector', 'Composite', 1, '*'], ['EventGuard', 'Decorator', 1, 1],
  ['WaitEvent', 'Leaf', 0, 0], ['Noop', 'Leaf', 0, 0]
].map(([name, category, min, max]) => ({ name, cpp: name, category, construct: 'class', folder: '', displayName: name, children: { min, max }, params: ['EventGuard','WaitEvent'].includes(name) ? [{ name: 'eventType', type: 'int', order: 1 }] : name === 'SubTree' ? [{ name: 'name', type: 'string', order: 1 }] : [] }));
const node = (type, id, params = {}, children = []) => ({ type, id, params, children });
const wait = node('WaitEvent', 'wait', { eventType: '4294967295' });
const subtree = node('SubTree', 'sub', { name: 'test & subtree' }, [node('SubTree','nested',{name:'nested'},[wait])]);
const tree = { name: 'test', root: subtree };
assert.match(behaviorTreeToXml(tree, definitions), /<SubTree name="test &amp; subtree">/);
const runtime = behaviorTreeToXml(tree, definitions, true);
assert.doesNotMatch(runtime, /SubTree/);
assert.match(runtime, /<Leaf type="WaitEvent" eventType="4294967295"/);
assert.equal(validateTree(tree, definitions).length, 0);
assert.equal(generateDebugTrace(wait, definitions).at(-1).status, 'Running');
assert.equal(generateDebugTrace(wait, definitions, {}, [4294967295]).at(-1).status, 'Success');
const guarded = node('EventGuard', 'guard', {eventType:'7'}, [subtree]);
const trace = generateDebugTrace(guarded, definitions, {}, [7]);
assert.equal(trace.length, 1);
assert.equal(trace[0].status, 'Failure');
const selector = node('ReactiveSelector', 'reactive', {}, [node('Noop','high'), wait]);
assert.equal(generateDebugTrace(selector, definitions).length, 2);
assert.equal(generateDebugTrace(selector, definitions, {high:'Failure'}, [4294967295]).at(-1).status, 'Success');
assert.ok(validateTree({name:'bad',root:node('WaitEvent','bad',{eventType:'4294967296'})},definitions).some(item => item.level === 'error'));
assert.throws(() => behaviorTreeToXml({name:'bad',root:node('SubTree','bad')},definitions,true));
console.log('Behavior checks passed: subtree expansion, event wait/guard, reactive selection, uint32 validation.');
