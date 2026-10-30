/*
 * Proofmark diff engine.
 *
 * Works in two passes so prose diffs stay readable:
 *   1. Align paragraphs (Myers diff on whitespace-normalized paragraphs).
 *   2. Word-diff each changed paragraph against its counterpart.
 * Whitespace inside a paragraph (extra spaces, hard line wraps) never counts as a change,
 * and short unchanged gaps between two edits are folded into one change.
 *
 * Loads as a plain browser script (exposes window.ProofmarkDiff) and as a CommonJS module for tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ProofmarkDiff = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // A token is a whitespace run, a word (letters/digits, allowing inner ' ’ -), or one other character.
  const TOKEN = /\s+|[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*|[^\s]/gu;
  const WORD = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;
  const PARA = /\n[^\S\n]*\n/;
  // Unchanged text this small between two changes gets merged into a single change.
  const SMALL = /^\s*(?:[\p{L}\p{N}]{1,3}|\p{P}{1,2})?\s*$/u;
  // Above this many token edits in one paragraph, show the paragraph as fully replaced.
  const WORD_EDIT_CAP = 2500;

  function tokenize(s) { return s.match(TOKEN) || []; }
  function countWords(s) { return (s.match(WORD) || []).length; }
  function tokKey(t) { return /^\s+$/.test(t) ? (PARA.test(t) ? '¶' : ' ') : t; }
  function paraKey(u) { return u.replace(/\s+/g, ' '); }

  // Myers O(ND) diff on key arrays. Returns [[op, ia, ib]] (op: 0 equal, -1 delete, 1 insert),
  // or null if the edit distance exceeds cap.
  function myers(A, B, cap) {
    const N = A.length, M = B.length;
    if (!N) return B.map((_, j) => [1, -1, j]);
    if (!M) return A.map((_, i) => [-1, i, -1]);
    const max = N + M, off = max + 1;
    const V = new Int32Array(2 * max + 3);
    const trace = [];
    let done = false;
    for (let d = 0; d <= max; d++) {
      if (d > cap) return null;
      for (let k = -d; k <= d; k += 2) {
        let x = (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) ? V[off + k + 1] : V[off + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && A[x] === B[y]) { x++; y++; }
        V[off + k] = x;
        if (x >= N && y >= M) { done = true; break; }
      }
      const snap = new Int32Array(2 * d + 1);
      for (let k = -d; k <= d; k++) snap[k + d] = V[off + k];
      trace.push(snap);
      if (done) break;
    }
    let x = N, y = M;
    const ops = [];
    for (let d = trace.length - 1; d > 0; d--) {
      const P = trace[d - 1];
      const g = kk => P[kk + d - 1];
      const k = x - y;
      const pk = (k === -d || (k !== d && g(k - 1) < g(k + 1))) ? k + 1 : k - 1;
      const px = g(pk), py = px - pk;
      while (x > px && y > py) { ops.push([0, x - 1, y - 1]); x--; y--; }
      if (pk === k + 1) { ops.push([1, -1, y - 1]); y--; }
      else { ops.push([-1, x - 1, -1]); x--; }
    }
    while (x > 0 && y > 0) { ops.push([0, x - 1, y - 1]); x--; y--; }
    return ops.reverse();
  }

  // Diff two item arrays, comparing by keys. Equal runs take the edited side's text.
  function diffSeq(a, b, ka, kb, cap) {
    let s = 0;
    while (s < ka.length && s < kb.length && ka[s] === kb[s]) s++;
    let ea = ka.length, eb = kb.length;
    while (ea > s && eb > s && ka[ea - 1] === kb[eb - 1]) { ea--; eb--; }
    const mid = myers(ka.slice(s, ea), kb.slice(s, eb), cap);
    if (!mid) return null;
    const out = [];
    for (let j = 0; j < s; j++) out.push([0, b[j]]);
    for (const [op, i, j] of mid) out.push(op === 0 ? [0, b[s + j]] : op === -1 ? [-1, a[s + i]] : [1, b[s + j]]);
    for (let j = eb; j < b.length; j++) out.push([0, b[j]]);
    return out;
  }

  function wordDiff(a, b) {
    const ta = tokenize(a), tb = tokenize(b);
    const r = diffSeq(ta, tb, ta.map(tokKey), tb.map(tokKey), WORD_EDIT_CAP);
    return r || [[-1, a], [1, b]];
  }

  // Split text into paragraph units. Every paragraph after the first carries its leading
  // blank line, so an added or removed paragraph brings its own separator with it.
  function units(s) {
    const t = s.replace(/\r\n?/g, '\n').trim();
    if (!t) return [];
    return t.split(/\n[^\S\n]*\n\s*/).map((p, i) => (i ? '\n\n' : '') + p.replace(/\s+$/, ''));
  }

  // Full document diff. Returns [[op, text]] with op 0 (equal), -1 (deleted), 1 (inserted).
  function diffDocs(a, b) {
    const A = units(a), B = units(b);
    const pops = diffSeq(A, B, A.map(paraKey), B.map(paraKey), Infinity);
    const ops = [];
    let dA = [], dB = [];
    const push = arr => { for (const o of arr) ops.push(o); };
    const flush = () => {
      if (dA.length && dB.length) {
        // Same number of changed paragraphs on both sides: pair them up one to one.
        if (dA.length === dB.length) dA.forEach((p, i) => push(wordDiff(p, dB[i])));
        else push(wordDiff(dA.join(''), dB.join('')));
      } else if (dA.length) ops.push([-1, dA.join('')]);
      else if (dB.length) ops.push([1, dB.join('')]);
      dA = []; dB = [];
    };
    for (const [op, u] of pops) {
      if (op === 0) { flush(); ops.push([0, u]); }
      else if (op === -1) dA.push(u);
      else dB.push(u);
    }
    flush();
    return ops;
  }

  // Group ops into {type:'eq', text} runs and {type:'hunk', del, ins} changes,
  // folding tiny unchanged gaps between two changes into one change.
  function toItems(ops) {
    const raw = [];
    let h = null;
    for (const [op, t] of ops) {
      if (op === 0) {
        h = null;
        const last = raw[raw.length - 1];
        if (last && last.type === 'eq') last.text += t; else raw.push({ type: 'eq', text: t });
      } else {
        if (!h) { h = { type: 'hunk', del: '', ins: '' }; raw.push(h); }
        if (op === -1) h.del += t; else h.ins += t;
      }
    }
    const res = [];
    for (let i = 0; i < raw.length; i++) {
      const it = raw[i], prev = res[res.length - 1], nx = raw[i + 1];
      if (it.type === 'eq' && prev && prev.type === 'hunk' && nx && nx.type === 'hunk' &&
          !PARA.test(it.text) && SMALL.test(it.text)) {
        prev.del += it.text + nx.del;
        prev.ins += it.text + nx.ins;
        i++;
        continue;
      }
      res.push(it);
    }
    return res;
  }

  return { tokenize, countWords, units, diffDocs, toItems };
});
