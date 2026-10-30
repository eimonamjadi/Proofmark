const test = require('node:test');
const assert = require('node:assert/strict');
const { diffDocs, toItems, countWords } = require('../diff.js');

const build = (a, b) => toItems(diffDocs(a, b));
const apply = (items, pick) => items.map(it => (it.type === 'eq' ? it.text : pick(it))).join('');
const acceptAll = items => apply(items, h => h.ins);
const rejectAll = items => apply(items, h => h.del);
const hunks = items => items.filter(it => it.type === 'hunk');

test('accepting every change gives the edited text; rejecting gives the original', () => {
  const a = 'In this study we examined whether practicing retrieval was more effective then rereading.\n\nOur results shows a clear effect.';
  const b = 'In this study, we examined whether retrieval practice was more effective than rereading.\n\nOur results show a clear effect.';
  const items = build(a, b);
  assert.equal(acceptAll(items), b);
  assert.equal(rejectAll(items), a);
});

test('identical texts produce no changes', () => {
  const t = 'Nothing to see here.\n\nStill nothing.';
  assert.equal(hunks(build(t, t)).length, 0);
});

test('a single word swap is a single change', () => {
  const hs = hunks(build('The cat sat on the mat.', 'The dog sat on the mat.'));
  assert.equal(hs.length, 1);
  assert.deepEqual([hs[0].del, hs[0].ins], ['cat', 'dog']);
});

test('line wraps and extra spaces inside a paragraph are not changes', () => {
  const a = 'One two three\nfour five six.';
  const b = 'One two  three four five six.';
  assert.equal(hunks(build(a, b)).length, 0);
});

test('short unchanged words between two edits fold into one change', () => {
  const hs = hunks(build('We think it is good.', 'They said it was fine.'));
  assert.equal(hs.length, 1);
  assert.deepEqual([hs[0].del, hs[0].ins], ['We think it is good', 'They said it was fine']);
});

test('added and removed paragraphs carry their own paragraph break', () => {
  const a = 'First.\n\nSecond.';
  const b = 'Zero.\n\nFirst.\n\nSecond.\n\nThird.';
  const added = build(a, b);
  assert.equal(acceptAll(added), b);
  assert.equal(rejectAll(added), a);
  const removed = build(b, a);
  assert.equal(acceptAll(removed), a);
  assert.equal(rejectAll(removed), b);
});

test('empty inputs are handled', () => {
  assert.deepEqual(build('', ''), []);
  const items = build('', 'New text.');
  assert.equal(acceptAll(items), 'New text.');
  assert.equal(rejectAll(items), '');
});

test('word count treats contractions and hyphenated words as one word', () => {
  assert.equal(countWords("It's a cost-effective, well-known test."), 5);
});

test('a long, heavily rewritten document still finishes quickly', () => {
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const vocab = Array.from({ length: 400 }, (_, i) => 'w' + i);
  const para = n => Array.from({ length: n }, () => vocab[Math.floor(rand() * vocab.length)]).join(' ') + '.';
  const doc = () => Array.from({ length: 12 }, () => para(500)).join('\n\n');
  const a = doc(), b = doc();
  const t0 = Date.now();
  const items = build(a, b);
  const ms = Date.now() - t0;
  assert.equal(acceptAll(items), b);
  assert.equal(rejectAll(items), a);
  assert.ok(ms < 5000, `took ${ms} ms`);
});
