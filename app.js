(() => {
  'use strict';

  const { diffDocs, toItems, countWords } = window.ProofmarkDiff;

  const SAMPLE_O = `In this study we examined whether practicing retrieval was more effective then rereading for students learning new vocabulary. Participants were recruited online and were randomly assigned to one of two conditions. In the first condition students reread the word list three times, in the second condition they tested themselves on the words after reading them once.

Our results shows that the retrieval group remembered more words one week later. However the difference on the immediate test was small and was not statistically significant. We think this suggests that the benefits of retrieval practice may take time to appear, which is important for teachers to know about.`;

  const SAMPLE_E = `In this study, we examined whether retrieval practice was more effective than rereading for students learning new vocabulary. Participants were recruited online and randomly assigned to one of two conditions. In the first condition, students reread the word list three times; in the second, they tested themselves on the words after reading them once.

Our results show that the retrieval group remembered more words one week later. However, the difference on the immediate test was small and not statistically significant. These findings suggest that the benefits of retrieval practice may emerge only after a delay, a pattern with important implications for classroom instruction.`;

  const STORE = 'proofmark-texts-v1';
  const $ = id => document.getElementById(id);
  const origEl = $('orig'), editEl = $('edit'), prose = $('prose');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let items = [], hunks = [], current = -1, view = 'marked';
  let stats = { add: 0, rem: 0, words: 0 };

  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // Paragraph breaks inside a change show as a pilcrow. Deleted breaks only keep their real
  // line break when nothing replaces them, so a merged paragraph reads as merged.
  function marks(t, keepBreaks) {
    let s = esc(t).replace(/\n[^\S\n]*\n\s*/g, () => '<span class="pil" aria-hidden="true">¶</span>' + (keepBreaks ? '\n\n' : ''));
    if (!keepBreaks) s = s.replace(/\n/g, ' ');
    return s;
  }

  function hunkInner(h) {
    if (h.state === 'accepted') return h.ins ? `<span class="kept">${esc(h.ins)}</span>` : '<span class="caret" title="Removed">‸</span>';
    if (h.state === 'rejected') return h.del ? `<span class="kept">${esc(h.del)}</span>` : '<span class="caret" title="Not added">‸</span>';
    let s = '';
    if (h.del) s += `<del>${marks(h.del, !h.ins)}</del>`;
    if (h.ins) s += `<ins>${marks(h.ins, true)}</ins>`;
    return s;
  }
  const label = h => `Change ${h.i + 1}, ${h.state}`;
  const hunkHTML = h =>
    `<span class="hunk" role="button" tabindex="0" data-i="${h.i}" data-state="${h.state}" aria-label="${label(h)}">${hunkInner(h)}</span>`;

  // Undecided changes count as accepted.
  function finalText() {
    return items.map(it => it.type === 'eq' ? it.text : (it.state === 'rejected' ? it.del : it.ins)).join('');
  }

  function recompute() {
    const o = origEl.value, e = editEl.value;
    const ops = diffDocs(o, e);
    let add = 0, rem = 0;
    for (const [op, t] of ops) {
      if (op === 1) add += countWords(t);
      else if (op === -1) rem += countWords(t);
    }
    // Keep accept/reject decisions for changes that survive an edit to either text.
    const prev = new Map();
    for (const h of hunks) {
      const k = h.del + '\u0001' + h.ins;
      if (!prev.has(k)) prev.set(k, []);
      prev.get(k).push(h.state);
    }
    items = toItems(ops);
    hunks = items.filter(it => it.type === 'hunk');
    hunks.forEach((h, i) => {
      h.i = i;
      const q = prev.get(h.del + '\u0001' + h.ins);
      h.state = (q && q.shift()) || 'open';
    });
    if (current >= hunks.length) current = hunks.length - 1;
    if (current < 0 && hunks.length) current = 0;
    stats = { add, rem, words: countWords(o) };
    renderStats();
    render();
    renderReview();
  }

  function renderStats() {
    const { add, rem, words } = stats;
    $('sAdd').textContent = '+' + add;
    $('sDel').textContent = '−' + rem;
    const total = add + rem;
    const g = total ? Math.round(add / total * 5) : 0;
    const r = total ? 5 - g : 0;
    let sq = '';
    for (let i = 0; i < 5; i++) sq += `<span class="sq${i < g ? ' g' : i < g + r ? ' r' : ''}"></span>`;
    $('squares').innerHTML = sq;
    const both = origEl.value.trim() && editEl.value.trim();
    const kept = words ? Math.max(0, Math.round((words - rem) / words * 100)) : 0;
    $('meta').textContent = both ? `${plural(hunks.length, 'change')} · kept ${kept}% of your original words` : '';
    $('origCount').textContent = plural(words, 'word');
    $('editCount').textContent = plural(countWords(editEl.value), 'word');
  }

  function render() {
    if (!origEl.value.trim() || !editEl.value.trim()) {
      prose.innerHTML = '<p class="empty">Paste both versions above to see what changed.</p>';
      return;
    }
    if (view === 'clean') { prose.textContent = finalText(); return; }
    if (!hunks.length) {
      prose.innerHTML = '<p class="empty">No changes. The two versions match word for word.</p>';
      return;
    }
    prose.innerHTML = items.map(it => it.type === 'eq' ? esc(it.text) : hunkHTML(it)).join('');
    markCurrent();
  }

  function markCurrent() {
    prose.querySelectorAll('.hunk.is-current').forEach(el => el.classList.remove('is-current'));
    const el = prose.querySelector(`.hunk[data-i="${current}"]`);
    if (el) el.classList.add('is-current');
    return el;
  }

  function renderReview() {
    const n = hunks.length;
    $('review').hidden = view !== 'marked';
    const h = hunks[current];
    $('pos').textContent = n ? `Change ${current + 1} of ${n}` : 'No changes';
    const pill = $('pill');
    pill.hidden = !h;
    if (h) { pill.dataset.state = h.state; pill.textContent = h.state; }
    const c = { open: 0, accepted: 0, rejected: 0 };
    hunks.forEach(x => c[x.state]++);
    $('tally').textContent = n ? `${c.open} open · ${c.accepted} accepted · ${c.rejected} rejected` : '';
    for (const id of ['prev', 'next', 'acc', 'rej']) $(id).disabled = !n;
    $('accAll').disabled = !c.open;
    $('rejAll').disabled = !c.open;
    $('resetAll').disabled = !(c.accepted + c.rejected);
    const st = h ? h.state : 'open';
    const acc = $('acc'), rej = $('rej');
    acc.setAttribute('aria-pressed', String(st === 'accepted'));
    rej.setAttribute('aria-pressed', String(st === 'rejected'));
    acc.textContent = st === 'accepted' ? 'Accepted ✓' : 'Accept';
    rej.textContent = st === 'rejected' ? 'Rejected ✕' : 'Reject';
    $('copy').disabled = !(origEl.value.trim() || editEl.value.trim());
  }

  function updateHunk(i) {
    const h = hunks[i];
    const el = prose.querySelector(`.hunk[data-i="${i}"]`);
    if (!el) return;
    el.dataset.state = h.state;
    el.setAttribute('aria-label', label(h));
    el.innerHTML = hunkInner(h);
  }

  function show(i, focus) {
    if (!hunks.length) return;
    current = (i + hunks.length) % hunks.length;
    const el = markCurrent();
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      if (focus) el.focus({ preventScroll: true });
    }
    renderReview();
  }

  // Pressing Accept or Reject again on a decided change reopens it.
  // After a decision, jump to the next open change.
  function decide(state) {
    const h = hunks[current];
    if (!h) return;
    h.state = h.state === state ? 'open' : state;
    updateHunk(current);
    renderReview();
    if (h.state !== 'open') {
      for (let k = 1; k <= hunks.length; k++) {
        const j = (current + k) % hunks.length;
        if (hunks[j].state === 'open') { show(j, false); return; }
      }
    }
  }

  function bulk(fn) {
    hunks.forEach(fn);
    render();
    renderReview();
  }

  function setView(v) {
    view = v;
    $('vMarked').setAttribute('aria-pressed', String(v === 'marked'));
    $('vClean').setAttribute('aria-pressed', String(v === 'clean'));
    render();
    renderReview();
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ o: origEl.value, e: editEl.value })); } catch (_) { /* storage unavailable */ }
  }

  function updateBadge() {
    $('exampleBadge').hidden = !(origEl.value === SAMPLE_O && editEl.value === SAMPLE_E);
  }

  async function copyText(text, btn, idle) {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = idle; }, 1500);
    } catch (_) {
      const fb = $('fallback'), ta = $('fallbackText');
      fb.hidden = false;
      ta.value = text;
      ta.focus();
      ta.select();
    }
  }

  let timer = 0;
  function onInput() {
    $('fallback').hidden = true;
    updateBadge();
    save();
    clearTimeout(timer);
    timer = setTimeout(recompute, 220);
  }

  origEl.addEventListener('input', onInput);
  editEl.addEventListener('input', onInput);
  $('loadExample').addEventListener('click', () => {
    origEl.value = SAMPLE_O;
    editEl.value = SAMPLE_E;
    hunks = [];
    current = 0;
    onInput();
  });
  $('clearBoth').addEventListener('click', () => {
    origEl.value = '';
    editEl.value = '';
    hunks = [];
    current = -1;
    onInput();
    origEl.focus();
  });
  $('prev').addEventListener('click', () => show(current - 1, false));
  $('next').addEventListener('click', () => show(current + 1, false));
  $('acc').addEventListener('click', () => decide('accepted'));
  $('rej').addEventListener('click', () => decide('rejected'));
  $('accAll').addEventListener('click', () => bulk(h => { if (h.state === 'open') h.state = 'accepted'; }));
  $('rejAll').addEventListener('click', () => bulk(h => { if (h.state === 'open') h.state = 'rejected'; }));
  $('resetAll').addEventListener('click', () => bulk(h => { h.state = 'open'; }));
  $('vMarked').addEventListener('click', () => setView('marked'));
  $('vClean').addEventListener('click', () => setView('clean'));
  $('copy').addEventListener('click', () => copyText(finalText(), $('copy'), 'Copy result'));
  $('copyTip').addEventListener('click', () => copyText($('tipText').textContent, $('copyTip'), 'Copy instruction'));

  prose.addEventListener('click', e => {
    const el = e.target.closest('.hunk');
    if (!el) return;
    current = +el.dataset.i;
    markCurrent();
    renderReview();
  });
  prose.addEventListener('keydown', e => {
    const el = e.target.closest && e.target.closest('.hunk');
    if (el && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      current = +el.dataset.i;
      markCurrent();
      renderReview();
    }
  });

  // Keyboard review: J/N next, K/P previous, A accept, R reject (ignored while typing).
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('textarea, input, select')) return;
    if (view !== 'marked' || !hunks.length) return;
    const k = e.key.toLowerCase();
    if (k === 'j' || k === 'n') { e.preventDefault(); show(current + 1, true); }
    else if (k === 'k' || k === 'p') { e.preventDefault(); show(current - 1, true); }
    else if (k === 'a') { e.preventDefault(); decide('accepted'); }
    else if (k === 'r') { e.preventDefault(); decide('rejected'); }
  });

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (_) { /* storage unavailable */ }
  if (saved && (saved.o || saved.e)) {
    origEl.value = saved.o || '';
    editEl.value = saved.e || '';
  } else {
    origEl.value = SAMPLE_O;
    editEl.value = SAMPLE_E;
  }
  updateBadge();
  recompute();
})();
