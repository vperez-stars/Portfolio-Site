// =====================================================================
// TICKET FAMILIES: a page in the Dashboards tab, built into OneTouch (not
// Metabase), listing every family of one kind, biggest first: parent
// incidents and their children, bundle and child requests, requests and
// their tasks, orders, problem records, and changes with their incidents.
// A row opens to show the whole family. Any ticket number, parent or
// child, opens that ticket (its record, with its family first) in a window
// over the page, where its own parent and children open the same way.
// The lists come from /api/families (relations.mjs on the server).
// Also here: the family shown above a team dashboard's ticket record.
// Loaded before app.js, whose helpers these functions use when they run.
// =====================================================================

const FAMILY_KIND_INFO = {
    'parent-incident': {
        tab: 'Parent incidents', anchor: 'Parent', child: ['child incident', 'child incidents'],
        about: 'A parent (master) incident groups incidents raised for the same issue, such as several alerts or reports about one fault, so they are worked and resolved together.',
    },
    'bundle-request': {
        tab: 'Bundle requests', anchor: 'Parent', child: ['child request', 'child requests'],
        about: 'A bundle request is split into child requests, one for each part of the work (for example one per server to start or stop).',
    },
    'request-tasks': {
        tab: 'Requests and their tasks', anchor: 'Request', child: ['catalog task', 'catalog tasks'],
        about: 'Catalog tasks are the pieces of work that fulfil a request; each is done by a fulfilment team.',
    },
    order: {
        tab: 'Orders', anchor: 'Order', child: ['request', 'requests'],
        about: 'An order (REQ) holds the requests (RITMs) ordered at the same time. Orders with two or more requests are listed.',
    },
    problem: {
        tab: 'Problem records', anchor: 'Problem', child: ['linked ticket', 'linked tickets'],
        about: "Incidents and changes linked to the same problem record, the investigation into their shared root cause. The problem records themselves aren't in this export.",
    },
    'change-incident': {
        tab: 'Changes and incidents', anchor: 'Change', child: ['linked incident', 'linked incidents'],
        about: 'A change, and the incident it was raised to fix or the incidents that name it as their cause.',
    },
};
const FAMILIES_PAGE = 50;
const familiesState = { kind: 'parent-incident', loaded: 0, total: 0, summary: null, run: 0 };

// ---------------------------------------------------------------------
// Showing the page (from the ☰ Dashboards drawer)
// ---------------------------------------------------------------------

function showFamilies() {
    hideBoard();
    document.getElementById('dashboard-frame').hidden = true;
    document.getElementById('dashboard-message').hidden = true;
    document.getElementById('dashboard-star').hidden = true;
    document.getElementById('families-view').hidden = false;
    document.querySelectorAll('.dashboard-choice').forEach(b => {
        const on = b.dataset.builtin === 'families';
        b.classList.toggle('active', on);
        if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    setDashboardHeading('Built into OneTouch', 'Ticket families', 'Parent tickets and their children, from the links in the data', false);
    document.getElementById('dashboard-hint').hidden = true;
    rememberDashboard('families');
    if (!familiesState.loaded) loadFamilies();
}

function hideFamilies() {
    document.getElementById('families-view').hidden = true;
    document.querySelector('.dashboard-choice[data-builtin="families"]')?.classList.remove('active');
}

// Signing out: the next person starts fresh
function resetFamilies() {
    hideFamilies();
    showRecordFamily('');
    Object.assign(familiesState, { kind: 'parent-incident', loaded: 0, total: 0, summary: null, run: familiesState.run + 1 });
    document.getElementById('families-list').innerHTML = '';
    document.getElementById('families-kinds').innerHTML = '';
    document.getElementById('families-q').value = '';
}

async function familiesFetch(path) {
    const response = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
    if (handleUnauthorized(response)) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
    return data;
}

// The tabs: one per kind, with how many families it has
function paintFamilyKinds() {
    const summary = familiesState.summary || {};
    document.getElementById('families-kinds').innerHTML = Object.entries(FAMILY_KIND_INFO).map(([kind, info]) =>
        `<button type="button" class="family-kind${kind === familiesState.kind ? ' active' : ''}" data-family-kind="${kind}" aria-pressed="${kind === familiesState.kind}">` +
        `<span class="family-kind-name">${escapeHtml(info.tab)}</span>` +
        `<span class="family-kind-count">${summary[kind] ? summary[kind].families.toLocaleString() : '…'}</span></button>`).join('');
}

// One kind's families, biggest first (or sorted by a heading); more: the next page;
// quiet: keep the list showing until the new one is ready (a heading was clicked)
async function loadFamilies(more = false, quiet = false) {
    const run = more ? familiesState.run : ++familiesState.run;
    const list = document.getElementById('families-list');
    const kind = familiesState.kind;
    const info = FAMILY_KIND_INFO[kind];
    if (!more) {
        if (!quiet) list.innerHTML = '<p class="home-status">Loading the families…</p>';
        familiesState.loaded = 0;
    }
    try {
        if (!familiesState.summary) {
            const summary = await familiesFetch('/api/families');
            if (!summary) return;
            familiesState.summary = summary.kinds;
        }
        paintFamilyKinds();
        const q = new URLSearchParams({ ...sortQuery('families', FAMILY_SORT_KEYS), ...lookupQuery('families'), offset: familiesState.loaded, limit: FAMILIES_PAGE });
        const data = await familiesFetch(`/api/families/${kind}?${q}`);
        if (!data || run !== familiesState.run) return;
        familiesState.total = data.total;
        familiesState.loaded += data.families.length;
        const rows = familyRowsHtml(data.families, false);
        if (more) {
            list.querySelector('tbody').insertAdjacentHTML('beforeend', rows);
        } else {
            const counts = familiesState.summary[kind];
            const all = data.before ?? data.total;
            list.innerHTML = `<p class="families-about"><b>${all.toLocaleString()} ${escapeHtml(info.tab.toLowerCase())}</b>, ` +
                `holding ${counts.tickets.toLocaleString()} ${counts.tickets === 1 ? info.child[0] : info.child[1]}. ${escapeHtml(info.about)} ` +
                'Click a row to see the whole family, or any ticket number, parent or child, to open that ticket.</p>' +
                (!all ? `<p class="home-status">None of the tickets you can see are in ${escapeHtml(info.tab.toLowerCase())}.</p>`
                    : lookupBarHtml('families', FAMILY_HEADS, { mode: 'list', noun: 'families', count: { shown: data.total, total: all } }) +
                      (data.total ? familyTableHtml(rows, false) : '<p class="home-status">No families match what you typed. Change it, or press Escape in the box to see them all.</p>')) +
                '<div class="families-more"></div>';
        }
        paintFamiliesMore();
    } catch (err) {
        if (run === familiesState.run) list.innerHTML = `<p class="home-status error">${escapeHtml(err.message)}</p>`;
    }
}

function paintFamiliesMore() {
    const box = document.querySelector('#families-list .families-more');
    if (!box) return;
    if (!familiesState.total) { box.innerHTML = ''; return; }
    const left = familiesState.total - familiesState.loaded;
    box.innerHTML = `<span class="home-status">Showing ${familiesState.loaded.toLocaleString()} of ${familiesState.total.toLocaleString()}.</span>` +
        (left > 0 ? `<button type="button" class="home-action" data-families-more>Show ${Math.min(left, FAMILIES_PAGE).toLocaleString()} more</button>` : '');
}

const FAMILY_HEADS = ['Parent', 'Summary', 'State', 'Priority / Risk', 'Team', 'Opened', 'Family'];
// What the server sorts the list by for each heading (no sort: the biggest families first)
const FAMILY_SORT_KEYS = { Parent: 'parent', Summary: 'summary', State: 'state', 'Priority / Risk': 'level', Team: 'team', Opened: 'opened', Family: 'size' };

// list: 'families' for the page's list of one kind (sorted by the server), '' for others
function familyTableHtml(rowsHtml, withKind, list = 'families') {
    const heads = withKind ? ['Parent', 'Kind of family', ...FAMILY_HEADS.slice(1)] : FAMILY_HEADS;
    return `<div class="table-wrap families-table"><table class="result-table" data-sort-list="${list}"><thead><tr>${heads.map(h => sortHeadHtml(list, h)).join('')}</tr></thead>` +
        `<tbody>${rowsHtml}</tbody></table></div>`;
}

// One row per family: its parent (or order / problem / change), and how many it
// holds. Its columns are what the server made (relations.mjs familyRow): the
// parent's own, or, for an order, a problem record or a parent that isn't yours
// to see, those of the family's tickets you may see, which the row says.
function familyRowsHtml(families, withKind) {
    return families.map(f => {
        const kind = f.kind || familiesState.kind;
        const info = FAMILY_KIND_INFO[kind];
        const r = f.row || {};
        // A ticket opens; an order shows its requests; a problem record isn't in the data
        const anchor = /^PRB/.test(f.anchor)
            ? `<span class="family-anchor-text">${escapeHtml(f.anchor)}</span>`
            : `<button type="button" class="ticket-link" data-ticket="${escapeHtml(f.anchor)}" title="Open ${escapeHtml(f.anchor)}">${escapeHtml(f.anchor)}</button>${starFor(f.anchor)}`;
        // Something in every cell: what's there, or why there's nothing
        const cell = (label, text, sort = null) => (text
            ? `<td${sort === null ? '' : ` data-sort="${escapeHtml(String(sort))}"`}>${escapeHtml(text)}</td>`
            : `<td data-sort="">${blankHtml(label, r)}</td>`);
        const summary = String(r.summary || '');
        const made = r.from === 'members'
            ? `<div class="family-sub">${r.count
                ? `From its ${r.count.toLocaleString()} ${r.count === 1 ? info.child[0] : info.child[1]}${/^(PRB|REQ)/.test(f.anchor) ? '' : ' you can see'}`
                : 'None of its tickets are yours to see'}</div>` : '';
        const summaryCell = summary
            ? `<td${summary.length > 110 ? ` title="${escapeHtml(summary)}"` : ''}>${escapeHtml(summary.length > 110 ? `${summary.slice(0, 107)}…` : summary)}${made}</td>`
            : `<td data-sort="">${blankHtml('Summary', r)}${made}</td>`;
        const level = r.level && r.from === 'members' && r.count > 1 ? `${r.level} (highest)` : r.level;
        return `<tr class="family-row" data-kind="${kind}" data-anchor="${escapeHtml(f.anchor)}" tabindex="0" aria-expanded="false" title="Click to see the whole family">` +
            `<td class="ticket-cell" data-sort="${escapeHtml(f.anchor)}"><span class="expand-caret" aria-hidden="true">▸</span>${anchor}</td>` +
            (withKind ? `<td>${escapeHtml(info.tab)}</td>` : '') +
            summaryCell +
            cell('State', r.state) +
            cell('Priority / Risk', level, r.rank ?? '') +
            cell('Team', r.team) +
            cell('Opened', r.opened ? formatValue('ticket.opened', r.opened) : '', r.opened || '') +
            `<td class="family-size">${f.children.toLocaleString()} ${f.children === 1 ? info.child[0] : info.child[1]}</td></tr>`;
    }).join('');
}

// A row opens (or folds away) the whole family under it
async function toggleFamilyRow(row) {
    const next = row.nextElementSibling;
    if (next && next.classList.contains('row-detail')) {
        next.remove();
        row.classList.remove('expanded');
        row.setAttribute('aria-expanded', 'false');
        return;
    }
    const detail = document.createElement('tr');
    detail.className = 'row-detail';
    const cell = document.createElement('td');
    cell.colSpan = row.cells.length;
    cell.innerHTML = '<div class="row-detail-body"><button type="button" class="row-detail-close">▴ Close</button>' +
        '<div class="row-detail-content"><p class="home-status">Loading the family…</p></div></div>';
    detail.appendChild(cell);
    row.after(detail);
    row.classList.add('expanded');
    row.setAttribute('aria-expanded', 'true');
    const box = cell.querySelector('.row-detail-content');
    try {
        const data = await familiesFetch(`/api/families/${row.dataset.kind}/${encodeURIComponent(row.dataset.anchor)}`);
        if (!data || !box.isConnected) return;
        box.innerHTML = relatedHtml([data.family], new Set([row.dataset.anchor]));
        forgetRemovedExports();
    } catch (err) {
        if (box.isConnected) box.innerHTML = `<p class="home-status error">${escapeHtml(err.message)}</p>`;
    }
}

// "Find the families of a ticket": every family that ticket is in, whatever the kind
async function findFamilies(number) {
    const list = document.getElementById('families-list');
    const run = ++familiesState.run;
    number = number.trim().toUpperCase();
    if (!number) return loadFamilies();
    list.innerHTML = '<p class="home-status">Looking…</p>';
    try {
        const data = await familiesFetch(`/api/families/find?number=${encodeURIComponent(number)}`);
        if (!data || run !== familiesState.run) return;
        const back = '<button type="button" class="home-action" data-families-back>← All families</button>';
        const open = data.known ? ` <button type="button" class="home-action" data-ticket="${escapeHtml(data.number)}">Open ${escapeHtml(data.number)}</button>` : '';
        if (!data.known) {
            list.innerHTML = `<p class="families-about">${escapeHtml(notOpenedText(data.number, data.noAccess))} ${back}</p>`;
        } else if (!data.families.length) {
            list.innerHTML = `<p class="families-about">${escapeHtml(data.number)} has no parent, children or other linked tickets.${open} ${back}</p>`;
        } else {
            list.innerHTML = `<p class="families-about"><b>${escapeHtml(data.number)}</b> is in ${data.families.length} ${data.families.length === 1 ? 'family' : 'families'}.${open} ${back}</p>` +
                (data.families.length >= 2 ? lookupBarHtml('', ['Parent', 'Kind of family', ...FAMILY_HEADS.slice(1)], { noun: 'families' }) : '') +
                familyTableHtml(familyRowsHtml(data.families, true), true, '');
            // One family: open it straight away
            if (data.families.length === 1) toggleFamilyRow(list.querySelector('tr.family-row'));
        }
    } catch (err) {
        if (run === familiesState.run) list.innerHTML = `<p class="home-status error">${escapeHtml(err.message)}</p>`;
    }
}

const familiesView = document.getElementById('families-view');
familiesView.addEventListener('click', e => {
    // Any ticket number here opens in the ticket window, not on Home
    const ticket = e.target.closest('[data-ticket]');
    if (ticket) {
        e.stopPropagation();
        openTicketDialog(ticket.dataset.ticket);
        return;
    }
    const kind = e.target.closest('[data-family-kind]');
    if (kind) {
        familiesState.kind = kind.dataset.familyKind;
        document.getElementById('families-q').value = '';
        loadFamilies();
        return;
    }
    if (e.target.closest('[data-families-more]')) { loadFamilies(true); return; }
    if (e.target.closest('[data-families-back]')) { document.getElementById('families-q').value = ''; loadFamilies(); return; }
    const row = e.target.closest('tr.family-row');
    if (row && !e.target.closest('button, a, input, select, label')) toggleFamilyRow(row);
});
familiesView.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr.family-row')) {
        e.preventDefault();
        toggleFamilyRow(e.target);
    }
});
document.getElementById('families-find').addEventListener('submit', e => {
    e.preventDefault();
    findFamilies(document.getElementById('families-q').value);
});
// A heading of the list, or a lookup: every family of the kind, sorted or looked
// through by the server, from the first page
pagedSorts.families = () => loadFamilies(false, true);
pagedLookups.families = pagedSorts.families;

// ---------------------------------------------------------------------
// THE TICKET WINDOW: one ticket's record, its family first, over the page.
// Its parent, children and other linked tickets open in the same window,
// and ← Back returns to the one before.
// ---------------------------------------------------------------------

const ticketTrail = [];
let ticketDialogRun = 0;

async function openTicketDialog(number, { back = false } = {}) {
    const dialog = document.getElementById('ticket-dialog');
    const body = document.getElementById('ticket-dialog-body');
    if (!back) ticketTrail.push(number);
    const run = ++ticketDialogRun;
    document.getElementById('ticket-dialog-title').textContent = number;
    document.getElementById('ticket-dialog-back').hidden = ticketTrail.length < 2;
    body.innerHTML = `<p class="home-status">Loading ${escapeHtml(number)}…</p>`;
    hideChartTip();
    if (!dialog.open) dialog.showModal();
    body.scrollTop = 0;
    // Opening a ticket counts as being shown it (like a ticket number on Home)
    if (STARRABLE.test(number)) {
        fetch(`${API_BASE}/api/seen-tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ numbers: [number] }),
        }).catch(err => console.error('Could not add the ticket to Ticket results:', err));
    }
    try {
        const data = await searchTickets(number, true);
        if (!data || run !== ticketDialogRun) return;
        if (!data.found.length) {
            body.innerHTML = `<p class="home-status">${escapeHtml(notOpenedText(number, data.noAccess))}</p>`;
        } else if (data.found.length === 1) {
            document.getElementById('ticket-dialog-title').textContent = `${data.found[0].type} ${number}`;
            body.innerHTML = ticketCardHtml(data.found[0], data.record);
            showRelated(body, [number], false, body.querySelector('.record-fields'));
        } else {
            // An order (REQ): the requests in it
            body.innerHTML = `<p class="home-status">${escapeHtml(number)} is an order of ${data.found.length} requests.</p>` + ticketTableHtml(data.found);
        }
        forgetRemovedExports();
    } catch (err) {
        if (run === ticketDialogRun) body.innerHTML = `<p class="home-status error">${escapeHtml(err.message)}</p>`;
    }
}

function ticketDialogBack() {
    ticketTrail.pop();
    const previous = ticketTrail[ticketTrail.length - 1];
    if (previous) openTicketDialog(previous, { back: true });
}

const ticketDialog = document.getElementById('ticket-dialog');
ticketDialog.addEventListener('click', e => {
    const ticket = e.target.closest('[data-ticket]');
    if (ticket) {
        e.stopPropagation();
        openTicketDialog(ticket.dataset.ticket);
        return;
    }
    // "Open in Dashboards": the window (and a chart's ticket list under it)
    // steps aside for the record page
    if (e.target.closest('[data-open-dashboard]')) {
        ticketDialog.close();
        document.getElementById('drill-dialog').close();
    }
});
ticketDialog.addEventListener('close', () => {
    ticketTrail.length = 0;
    ticketDialogRun += 1;
    document.getElementById('ticket-dialog-body').innerHTML = '';
});

// ---------------------------------------------------------------------
// A TICKET RECORD IN A TEAM DASHBOARD (an incident, change or request page
// in Metabase): its family above the page, from OneTouch. A ticket in it
// with a record page of its own opens there (← Back returns); a catalog
// task or an order opens in the ticket window.
// ---------------------------------------------------------------------

const recordFamily = { number: '', open: true, run: 0 };

// number: the record showing, or '' for any other page
async function showRecordFamily(number) {
    if (number === recordFamily.number) return;
    recordFamily.number = number;
    const run = ++recordFamily.run;
    const panel = document.getElementById('record-family');
    const summary = document.getElementById('record-family-summary');
    const body = document.getElementById('record-family-body');
    const toggle = document.getElementById('record-family-toggle');
    panel.hidden = !number;
    body.innerHTML = '';
    toggle.hidden = true;
    if (!number) return;
    summary.textContent = `Looking for ${number}'s parent, children and other linked tickets…`;
    try {
        const response = await fetch(`${API_BASE}/api/tickets/related`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ numbers: [number], conversation: false }),
        });
        if (handleUnauthorized(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        if (run !== recordFamily.run) return;
        if (!data.families.length) {
            summary.textContent = `${number} has no parent, child or other linked tickets.`;
            return;
        }
        summary.innerHTML = `<b>${escapeHtml(number)}'s family:</b> ${escapeHtml(data.families.map(f => f.title).join(' · '))}`;
        body.innerHTML = relatedHtml(data.families, new Set([number]));
        forgetRemovedExports();
        toggle.hidden = false;
        paintRecordFamily();
    } catch (err) {
        if (run === recordFamily.run) summary.textContent = `Couldn't look for ${number}'s family: ${err.message}`;
    }
}

// Shown or folded away; the choice holds for the next record too
function paintRecordFamily() {
    const toggle = document.getElementById('record-family-toggle');
    document.getElementById('record-family-body').hidden = !recordFamily.open;
    toggle.textContent = recordFamily.open ? 'Hide family ▴' : 'Show family ▾';
    toggle.setAttribute('aria-expanded', String(recordFamily.open));
}
document.getElementById('record-family-toggle').addEventListener('click', () => {
    recordFamily.open = !recordFamily.open;
    paintRecordFamily();
});

document.getElementById('record-family').addEventListener('click', e => {
    const ticket = e.target.closest('[data-ticket]');
    if (!ticket) return;
    e.stopPropagation();
    const number = ticket.dataset.ticket;
    if (RECORD_PAGES[(number.match(/^[A-Z]+/) || [])[0]]) openInDashboards(number);
    else openTicketDialog(number);
});
