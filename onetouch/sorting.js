// =====================================================================
// SORTING TABLES: every ticket list and table sorts by any of its columns.
// A click on a column's heading sorts by it in ascending order (smallest,
// oldest, A first); a second click, descending; a third, back to the list's
// own order. Empty cells stay at the bottom either way.
//
// Lists shown a page at a time (Assigned to me, Team families, the Team
// tab's tickets, the Families page) sort every one of their tickets, not
// just the page showing: they register in pagedSorts and draw themselves
// again (some ask the server). Every other table is sorted where it is.
// Charts have an order of their own (charts.js chartOrder).
// Loaded before app.js, whose helpers these functions use when they run.
// =====================================================================

// A list's sort while the page is open, by the list's name: { col, dir: 'asc' | 'desc' }
const listSorts = new Map();
// Lists shown a page at a time: the list's name (up to any ':') -> function (table),
// called once listSorts has the new sort, that sorts all of it and draws it again
const pagedSorts = {};

const sortCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

// "12", "1,234", "45.5%", "3 incidents" -> the number they start with; anything else -> null
function leadingNumber(value) {
    if (typeof value === 'number') return value;
    const m = /^-?\d[\d,]*(\.\d+)?/.exec(String(value));
    return m ? Number(m[0].replace(/,/g, '')) : null;
}

// a before b (negative), after (positive) or tied (0): numbers as numbers, text
// A to Z ('P2' before 'P10'); empty last whichever way the list is sorted
function compareSorted(a, b, dir) {
    const empty = v => v === null || v === undefined || v === '' || v === '—';
    if (empty(a) || empty(b)) return empty(a) - empty(b);
    const na = leadingNumber(a), nb = leadingNumber(b);
    const c = na !== null && nb !== null && na !== nb ? na - nb : sortCollator.compare(String(a), String(b));
    return dir === 'desc' ? -c : c;
}

// How much a ticket's KPIs need attention: each red one counts for more than
// any number of amber ones (as kpis.mjs attention). tones: ['bad', 'warn', …]
const kpiAttention = tones => tones.reduce((n, t) => n + (t === 'bad' ? 100 : t === 'warn' ? 1 : 0), 0);

// list: what a click does next (the column it's on, and which way)
function nextSort(sort, col) {
    if (sort?.col !== col) return { col, dir: 'asc' };
    return sort.dir === 'asc' ? { col, dir: 'desc' } : null;
}

function sortTitle(label, dir) {
    if (dir === 'asc') return `Sorted by ${label}, ascending. Click for descending`;
    if (dir === 'desc') return `Sorted by ${label}, descending. Click to go back to the list's own order`;
    return `Sort by ${label}, ascending`;
}

// A heading people can sort by. list: the table's list name, whose sort is kept
// while the page is open ('' for a table that forgets it when drawn again);
// col: what it sorts by (usually its label); cls: the cell's other classes
function sortHeadHtml(list, col, label = col, cls = '') {
    const sort = list ? listSorts.get(list) : null;
    const dir = sort?.col === col ? sort.dir : null;
    return `<th class="sortable${cls ? ` ${cls}` : ''}" data-sort-col="${escapeHtml(col)}" aria-sort="${dir ? `${dir}ending` : 'none'}">` +
        `<button type="button" class="sort-btn" title="${escapeHtml(sortTitle(label, dir))}">${escapeHtml(label)}` +
        '<span class="sort-arrow" aria-hidden="true"></span></button></th>';
}

// The headings' arrows and hints, for the sort a table now has
function paintSortHeads(table, sort) {
    for (const th of table.tHead?.rows[0]?.cells || []) {
        if (th.dataset.sortCol === undefined) continue;
        const dir = sort?.col === th.dataset.sortCol ? sort.dir : null;
        th.setAttribute('aria-sort', dir ? `${dir}ending` : 'none');
        const button = th.querySelector('.sort-btn');
        if (button) button.title = sortTitle(button.firstChild.textContent, dir);
    }
}

// What a cell sorts by: its data-sort (a date, a rank…) if it has one, how much
// its KPIs need attention, the choice in its menu, or else its text
function cellSortValue(cell) {
    if (!cell) return '';
    if (cell.dataset.sort !== undefined) return cell.dataset.sort;
    const chips = cell.querySelectorAll('.kpi');
    if (chips.length) return kpiAttention([...chips].map(c => (c.classList.contains('kpi-bad') ? 'bad' : c.classList.contains('kpi-warn') ? 'warn' : '')));
    const select = cell.querySelector('select');
    if (select) return select.selectedOptions[0]?.text || '';
    return cell.textContent.trim();
}

// Sorts a table's rows where they are (sort null: back to how they came).
// A row opened to show more (a .row-detail row under it) moves with it;
// .sort-pinned rows ("Other", "Not assigned yet") stay at the bottom; a long
// family that shows only its first rows (.more-member) still shows the first ones.
function sortTableRows(table, sort) {
    const body = table.tBodies[0];
    if (!body) return;
    const groups = [], pinned = [];
    for (const row of [...body.rows]) {
        if (row.classList.contains('row-detail') && groups.length) groups.at(-1).rows.push(row);
        else if (row.classList.contains('sort-pinned')) pinned.push(row);
        else {
            row.dataset.sortAt ??= String(groups.length); // its place as drawn, for going back
            groups.push({ rows: [row], at: Number(row.dataset.sortAt) });
        }
    }
    const head = sort && [...table.tHead.rows[0].cells].find(th => th.dataset.sortCol === sort.col);
    if (head) for (const g of groups) g.value = cellSortValue(g.rows[0].cells[head.cellIndex]);
    groups.sort((a, b) => (head ? compareSorted(a.value, b.value, sort.dir) : 0) || a.at - b.at);
    const hidden = groups.filter(g => g.rows[0].classList.contains('more-member')).length;
    if (hidden) groups.forEach((g, k) => g.rows[0].classList.toggle('more-member', k >= groups.length - hidden));
    body.append(...groups.flatMap(g => g.rows), ...pinned);
    paintSortHeads(table, sort);
}

// A table drawn again (a refresh): sorted the way it was, if its list keeps its sort
function restoreSorts(root) {
    for (const table of root.querySelectorAll('table[data-sort-list]')) {
        const sort = listSorts.get(table.dataset.sortList);
        if (sort && !pagedSorts[table.dataset.sortList.split(':')[0]]) sortTableRows(table, sort);
    }
}

// A list of tickets in its list's sort. columns: the table's ([label, get]);
// sortValue(column) says what each ticket sorts by in that column.
function sortedTickets(tickets, list, columns, sortValue) {
    const sort = listSorts.get(list);
    const column = sort && columns.find(([label]) => label === sort.col);
    if (!column) return tickets;
    const value = sortValue(column);
    return tickets.map((t, i) => ({ t, i, v: value(t) }))
        .sort((a, b) => compareSorted(a.v, b.v, sort.dir) || a.i - b.i)
        .map(x => x.t);
}

// The query string a server-sorted list adds: &sort=<its key for the column>&dir=…
function sortQuery(list, keys) {
    const sort = listSorts.get(list);
    return sort && keys[sort.col] ? { sort: keys[sort.col], dir: sort.dir } : {};
}

// Signing out: the next person starts with every list in its own order
function resetSorts() {
    listSorts.clear();
}

document.addEventListener('click', e => {
    const button = e.target.closest('.sort-btn');
    if (!button) return;
    const th = button.closest('th');
    const table = th.closest('table');
    const list = table.dataset.sortList || '';
    const sort = nextSort(list ? listSorts.get(list) : table._sort, th.dataset.sortCol);
    table._sort = sort;
    if (list) {
        if (sort) listSorts.set(list, sort);
        else listSorts.delete(list);
    }
    const paged = list && pagedSorts[list.split(':')[0]];
    if (paged) paged(table);
    else sortTableRows(table, sort);
});
