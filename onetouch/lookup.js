// =====================================================================
// LOOKING UP TICKETS: every ticket list has a box above it (🔍 Look up…)
// that finds its tickets by anything its columns show, in every column or
// in the one picked next to the box. Every word typed must appear (each in
// any column, or all in the picked one); "words in quotes" stay together;
// case doesn't matter. Escape empties the box.
//
// A list drawn whole is looked up where it is: the rows that don't match
// hide. Lists shown a page at a time (Assigned to me, Team families, a
// family's tickets, the Team tab's tickets, the Families page) look through
// all of their tickets: they register in pagedLookups and draw themselves
// again (some ask the server, which looks up the same way: tickets.mjs
// lookupMatches).
// Loaded before app.js, whose helpers these functions use when they run.
// =====================================================================

// A list's lookup while the page is open, by the list's name: { q, col }
const listLookups = new Map();
// Lists that draw themselves again: the list's name (up to any ':') -> function (list),
// called once listLookups has the new lookup; it may return a promise
const pagedLookups = {};
const LOOKUP_MAX_LENGTH = 100; // what the server reads (tickets.mjs)
const LOOKUP_DELAY = 250;      // ms after the last key before a list is drawn again
let lookupTimer = null;
let lookupTyping = null;       // the list whose box was being typed in when it was drawn again

// 'p2 "service desk"' -> ['p2', 'service desk'] (as tickets.mjs lookupTerms)
function lookupTerms(q) {
    const text = String(q ?? '').slice(0, LOOKUP_MAX_LENGTH).toLowerCase();
    const terms = [];
    for (const [, phrase, word] of text.matchAll(/"([^"]*)"?|(\S+)/g)) {
        const term = (phrase ?? word ?? '').replace(/\s+/g, ' ').trim();
        if (term) terms.push(term);
    }
    return terms;
}

// texts: what each column looked in shows. Every term must be in one of them.
function textsMatch(texts, terms) {
    const values = texts.map(v => String(v ?? '').toLowerCase().replace(/\s+/g, ' '));
    return terms.every(term => values.some(v => v.includes(term)));
}

const lookupFor = list => (list && listLookups.get(list)) || { q: '', col: '' };
const lookupActive = list => lookupTerms(lookupFor(list).q).length > 0;

// What a server-paged list adds to its request: q and col while something is typed
function lookupQuery(list) {
    const { q, col } = lookupFor(list);
    return lookupTerms(q).length ? { q: q.trim().slice(0, LOOKUP_MAX_LENGTH), ...(col ? { col } : {}) } : {};
}

// "12 of 340 tickets", "None of the 340 tickets match"; nothing while nothing is typed
function lookupCountText(shown, total, noun, active) {
    if (!active) return '';
    if (!shown) return `None of the ${total.toLocaleString()} ${noun} match`;
    return shown === total ? `All ${total.toLocaleString()} ${noun} match` : `${shown.toLocaleString()} of ${total.toLocaleString()} ${noun}`;
}

// The box over a list. list: its name, whose lookup is kept while the page is open
// ('' forgets it when the list is drawn again). labels: the columns it can look in.
// mode: 'rows' (every row is on the page) or 'list' (pagedLookups draws it again).
// count: { shown, total } for a 'list' box.
function lookupBarHtml(list, labels, { mode = 'rows', count = null, noun = 'tickets' } = {}) {
    const { q, col } = lookupFor(list);
    const options = `<option value="">every column</option>` +
        labels.map(label => `<option value="${escapeHtml(label)}"${label === col ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
    return `<div class="lookup-bar" role="search" data-lookup="${escapeHtml(list)}" data-lookup-mode="${mode}" data-noun="${escapeHtml(noun)}">` +
        '<span class="lookup-icon" aria-hidden="true">🔍</span>' +
        `<input type="search" class="lookup-input" value="${escapeHtml(q)}" maxlength="${LOOKUP_MAX_LENGTH}" placeholder="Look up ${escapeHtml(noun)}…"` +
        ` aria-label="Look up ${escapeHtml(noun)} in this list" title='Every word must appear; "words in quotes" stay together' autocomplete="off" spellcheck="false">` +
        `<label class="lookup-in">in <select class="lookup-col" aria-label="Which column to look in">${options}</select></label>` +
        `<span class="lookup-count" aria-live="polite">${count ? escapeHtml(lookupCountText(count.shown, count.total, noun, lookupTerms(q).length > 0)) : ''}</span></div>`;
}

// A box outside the part of the page its list draws again (the Team tab's): its count
function setLookupCount(list, shown, total) {
    const bar = document.querySelector(`.lookup-bar[data-lookup="${CSS.escape(list)}"]`);
    if (bar) bar.querySelector('.lookup-count').textContent = lookupCountText(shown, total, bar.dataset.noun, lookupActive(list));
}

// For a list the page holds and draws a page at a time: the tickets its lookup
// keeps. columns: [label, …] as its table's; textOf(column, ticket): what that column shows.
function lookedUpTickets(tickets, list, columns, textOf) {
    const { q, col } = lookupFor(list);
    const terms = lookupTerms(q);
    if (!terms.length) return tickets;
    const looked = col ? columns.filter(([label]) => label === col) : columns;
    return tickets.filter(t => textsMatch(looked.map(c => textOf(c, t)), terms));
}

// What a cell shows, for looking it up: its full text when it was cut short, and a
// date as the data writes it too
function cellLookupText(cell) {
    if (!cell) return '';
    const sort = cell.dataset.sort || '';
    return `${cell.getAttribute('title') || cell.textContent}${/^\d{4}-\d{2}-\d{2}/.test(sort) ? ` ${sort}` : ''}`;
}

// A list drawn whole: hides the rows that don't match (a row opened to show more
// goes with its row), and shows how many do
function filterTableRows(bar) {
    const table = bar.nextElementSibling?.querySelector('table');
    const body = table?.tBodies[0];
    if (!body) return;
    const terms = lookupTerms(bar.querySelector('.lookup-input').value);
    const col = bar.querySelector('.lookup-col').value;
    const labels = new Set([...bar.querySelectorAll('.lookup-col option')].map(o => o.value).filter(Boolean));
    const heads = [...table.tHead.rows[0].cells].map(th => th.textContent.trim());
    const columns = heads.map((label, i) => ((col ? label === col : labels.has(label)) ? i : -1)).filter(i => i >= 0);
    let shown = 0, total = 0, match = true;
    for (const row of body.rows) {
        if (row.classList.contains('row-detail')) { row.classList.toggle('lookup-miss', !match); continue; }
        if (row.classList.contains('sort-pinned')) continue;
        total += 1;
        match = !terms.length || textsMatch(columns.map(i => cellLookupText(row.cells[i])), terms);
        row.classList.toggle('lookup-miss', !match);
        if (match) shown += 1;
    }
    table.classList.toggle('looking', terms.length > 0);
    bar.querySelector('.lookup-count').textContent = lookupCountText(shown, total, bar.dataset.noun, terms.length > 0);
    // For a list with tick boxes, whose "tick all" ticks only what shows
    bar.dispatchEvent(new CustomEvent('lookedup', { bubbles: true }));
}

// Lists drawn again whole (a refresh): looked up the way they were
function applyLookups(root) {
    for (const bar of root.querySelectorAll('.lookup-bar[data-lookup-mode="rows"]')) {
        if (bar.querySelector('.lookup-input').value.trim()) filterTableRows(bar);
    }
}

// A row the lookup is showing (selecting "all" ticks only those)
const lookupShows = row => !row.classList.contains('lookup-miss');

// A list drawn again while its box was being typed in: the new box gets the
// keys, unless the person has gone on to something else meanwhile
function restoreLookupFocus() {
    const list = lookupTyping;
    lookupTyping = null;
    if (list === null) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const input = document.querySelector(`.lookup-bar[data-lookup="${CSS.escape(list)}"] .lookup-input`);
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
}

function runLookup(bar) {
    const list = bar.dataset.lookup;
    const q = bar.querySelector('.lookup-input').value;
    const col = bar.querySelector('.lookup-col').value;
    const had = lookupActive(list);
    if (list) {
        if (q.trim() || col) listLookups.set(list, { q, col });
        else listLookups.delete(list);
    }
    if (bar.dataset.lookupMode === 'rows') return filterTableRows(bar);
    // Only the column changed, with nothing typed: the list stays as it is
    if (!had && !lookupTerms(q).length) return;
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(() => {
        const redraw = pagedLookups[list.split(':')[0]];
        if (!redraw) return;
        lookupTyping = document.activeElement?.closest?.('.lookup-bar')?.dataset.lookup === list ? list : null;
        Promise.resolve(redraw(list)).finally(restoreLookupFocus);
    }, LOOKUP_DELAY);
}

// Signing out: the next person starts with every list whole
function resetLookups() {
    clearTimeout(lookupTimer);
    listLookups.clear();
    lookupTyping = null;
}

document.addEventListener('input', e => {
    if (e.target.matches?.('.lookup-input')) runLookup(e.target.closest('.lookup-bar'));
});
document.addEventListener('change', e => {
    if (e.target.matches?.('.lookup-col')) runLookup(e.target.closest('.lookup-bar'));
});
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !e.target.matches?.('.lookup-input') || !e.target.value) return;
    // Empties the box, and doesn't close the window the list is in (or the chat: app.js
    // listens on the document too, after this file)
    e.preventDefault();
    e.stopImmediatePropagation();
    e.target.value = '';
    runLookup(e.target.closest('.lookup-bar'));
});
