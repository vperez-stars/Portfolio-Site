// =====================================================================
// TEAMS: the Team tab (teams.mjs on the server). Admins see every team -
// who's on it and in what role, its tickets and who has each one - and can
// put people on teams and move families between teams; "Not assigned yet"
// shows them every ticket nobody has, on a team or on none. A project manager
// sees their own team the same way and hands out its tickets. Everyone
// else sees who's on their team and the tickets assigned to them.
// "Resolved or closed" lists the tickets someone said they resolved or
// closed (admins: every team's; project managers: their team's), whose
// status they can change; admins also put things back before a presentation.
// Loaded before app.js, whose helpers these functions use when they run.
// =====================================================================

const TEAM_PAGE_SIZE = 50;
// The ticket list's headings, and what the server sorts every ticket by for each
const TEAM_TICKET_SORT_KEYS = { Ticket: 'number', Type: 'type', Summary: 'summary', State: 'state', Family: 'family', 'Assigned to': 'assignee' };
const TEAM_KINDS = [['INC', 'Incidents'], ['CHG', 'Changes'], ['RITM', 'Requests'], ['SCTASK', 'Catalog tasks']];
// Admins' "Not assigned yet" (in place of a team's id), and its list's headings, as above
const UNASSIGNED_VIEW = 'unassigned';
const UNASSIGNED_SORT_KEYS = { Ticket: 'number', Type: 'type', Summary: 'summary', State: 'state', Family: 'family', Team: 'team' };
// The Team tab's menus over a list, and what each sets in teamsView.filter
const TEAM_FILTERS = { 'team-filter-assignee': 'assignee', 'team-filter-kind': 'kind', 'team-filter-team': 'team' };

const teamsView = {
    data: null,     // GET /api/teams: { teams, roles, people?, unassigned? }
    teamId: null,   // the team showing, or UNASSIGNED_VIEW
    // assignee: a team's; team: "Not assigned yet"'s (a team's id, 'none' or '').
    // attention: '1' for only the tickets that need attention.
    // What's typed in the 🔍 box is the 'team-tickets' or 'unassigned-tickets' lookup (lookup.js)
    filter: { assignee: '', kind: '', team: '', attention: '' },
    offset: 0,
    run: 0,         // bumped on every load, so an answer for an older view is dropped
};

// Signing out: nothing of this person's team stays on the page
function resetTeams() {
    teamsView.data = null;
    teamsView.teamId = null;
    teamsView.filter = { assignee: '', kind: '', team: '', attention: '' };
    teamsView.offset = 0;
    teamsView.run += 1;
    pickerPeople.clear();
    document.getElementById('teams').innerHTML = '';
}

// -> the JSON answer, or null if the session ended; a refusal throws its message
async function teamsFetch(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    if (handleUnauthorized(response)) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'That didn\'t work. Please try again.');
    return data;
}

const currentTeam = () => teamsView.data?.teams.find(t => t.id === teamsView.teamId) || null;
const showingUnassigned = () => teamsView.teamId === UNASSIGNED_VIEW;
const howMany = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// Each team's people, for the boxes where their names are typed (picker.js)
function rememberPickerPeople(data) {
    for (const t of data.teams) setPickerPeople(t.id, t.members, data.roles);
}
const roleName = role => teamsView.data?.roles[role] || '';

async function loadTeams() {
    const box = document.getElementById('teams');
    if (!teamsView.data) box.innerHTML = '<p class="home-status">Loading your team…</p>';
    try {
        const data = await teamsFetch('/api/teams');
        if (!data) return;
        teamsView.data = data;
        rememberPickerPeople(data);
        if (showingUnassigned() ? !data.unassigned : !currentTeam()) {
            const mine = data.teams.find(t => t.id === currentAccess.team?.id) || data.teams[0];
            teamsView.teamId = mine ? mine.id : null;
        }
        renderTeams();
    } catch (err) {
        box.innerHTML = `<p class="home-status error">${escapeHtml(err.message)}</p>`;
        console.error(err);
    }
}

// After an assignment or a move: the counts again, keeping the ticket list as it is
async function refreshTeamCounts() {
    try {
        const data = await teamsFetch('/api/teams');
        if (!data) return;
        teamsView.data = data;
        rememberPickerPeople(data);
        const summary = document.getElementById('team-summary');
        if (summary && currentTeam()) {
            summary.innerHTML = teamSummaryHtml(currentTeam());
            restoreSorts(summary);
        }
        const nobody = document.getElementById('unassigned-summary');
        if (nobody && data.unassigned) nobody.innerHTML = unassignedSummaryHtml();
        const picker = document.getElementById('team-picker');
        if (picker) picker.innerHTML = teamPickerHtml();
        const presentation = document.getElementById('presentation-card');
        if (presentation) presentation.innerHTML = presentationHtml();
    } catch (err) {
        console.error('Could not refresh the team counts:', err);
    }
}

function youLine(team) {
    if (currentAccess.admin) return 'You\'re an admin: you see every team and every ticket, put people on teams, and move families between them. ' +
        'Not assigned yet shows every ticket nobody has, on a team or on none.';
    if (!team) return 'You\'re not on a team yet, so no tickets are assigned to you. An admin can add you to one.';
    if (currentAccess.role === 'project_manager') return `You're the project manager of ${team.name}: you see all of its tickets, hand them out, and see who's working on what.`;
    return `You're on ${team.name} as ${roleName(currentAccess.role).toLowerCase()}. You see the tickets assigned to you, ` +
        'and when you resolve or close one you can tell your project manager from its row.';
}

function renderTeams() {
    const { data } = teamsView;
    const team = currentTeam();
    const box = document.getElementById('teams');
    let html = `<div class="home-head"><h2 class="home-welcome">${currentAccess.admin ? 'Teams' : escapeHtml(team?.name || 'Your team')}</h2></div>` +
        `<p class="home-status">${escapeHtml(youLine(team))}</p>`;
    if (canSeeStatuses()) html += '<section class="team-card" id="ticket-statuses"><h3>Resolved or closed</h3><p class="home-status">Loading…</p></section>';
    if (currentAccess.admin) html += `<div class="team-picker" id="team-picker">${teamPickerHtml()}</div>`;
    if (showingUnassigned()) {
        html += unassignedCardHtml();
    } else if (team) {
        const manage = team.canManage;
        html += `<section class="team-card" id="team-summary">${teamSummaryHtml(team)}</section>` +
            `<section class="team-card">` +
            `<h3>${manage ? `${escapeHtml(team.name)}'s tickets` : 'My tickets'}</h3>` +
            `<div class="team-filters">` +
            (manage ? `<label>Who has it <select id="team-filter-assignee">${assigneeFilterOptions(team)}</select></label>` : '') +
            kindFilterHtml() + attentionFilterHtml() +
            `</div>` +
            // Any of the list's columns; the server looks through all of the team's tickets
            lookupBarHtml('team-tickets', Object.keys(TEAM_TICKET_SORT_KEYS), { mode: 'list' }) +
            (manage ? `<div class="team-bulk"><label><input type="checkbox" class="team-select-all"> Tick all on this page</label>` +
                `<span>Give the ticked tickets to</span> ${personPickerHtml(team.id, undefined, 'Give the ticked tickets to', { attrs: 'id="team-bulk-to"' })}` +
                `<button type="button" class="home-action" data-team-bulk>Assign</button></div>` : '') +
            `<div id="team-tickets"></div></section>`;
    }
    if (currentAccess.admin) html += familyCardHtml() + peopleCardHtml(data.people || []) + `<section class="team-card" id="presentation-card">${presentationHtml()}</section>`;
    box.innerHTML = html;
    restoreSorts(box);
    if (team || showingUnassigned()) loadTeamTickets();
    if (canSeeStatuses()) loadTicketStatuses();
}

function kindFilterHtml() {
    return `<label>Type <select id="team-filter-kind"><option value="">All types</option>` +
        TEAM_KINDS.map(([k, label]) => `<option value="${k}"${teamsView.filter.kind === k ? ' selected' : ''}>${label}</option>`).join('') +
        `</select></label>`;
}

// Only the tickets that need attention; its count comes with each load of the list
function attentionFilterHtml() {
    return `<div class="assigned-filter"><button type="button" class="home-action" id="team-attention-filter" data-team-attention aria-pressed="${teamsView.filter.attention === '1'}">Needs attention</button></div>`;
}

// Admins first get "Not assigned yet", then every team
function teamPickerHtml() {
    const u = teamsView.data.unassigned;
    const nobody = u
        ? `<button type="button" class="team-pick team-pick-nobody${showingUnassigned() ? ' active' : ''}${u.tickets ? ' waiting' : ''}" data-team-pick="${UNASSIGNED_VIEW}">` +
          `<span class="team-pick-name">📥 Not assigned yet</span>` +
          `<span class="team-pick-meta">${howMany(u.tickets, 'ticket', 'tickets')} · ${howMany(u.families, 'family', 'families')}` +
          `${u.noTeam.families ? ` · ${u.noTeam.families.toLocaleString()} on no team` : ''}</span></button>`
        : '';
    return nobody + teamsView.data.teams.map(t =>
        `<button type="button" class="team-pick${t.id === teamsView.teamId ? ' active' : ''}" data-team-pick="${t.id}">` +
        `<span class="team-pick-name">${escapeHtml(t.name)}${t.test ? ' <span class="team-test-tag">Test team</span>' : ''}</span>` +
        `<span class="team-pick-meta">${t.tickets.toLocaleString()} tickets · ${t.members.length} people</span></button>`).join('');
}

function loadCells(load) {
    if (!load) return TEAM_KINDS.map(() => '<td class="num">—</td>').join('') + '<td class="num">—</td>';
    return TEAM_KINDS.map(([k]) => `<td class="num">${load[k].toLocaleString()}</td>`).join('') +
        `<td class="num"><strong>${load.total.toLocaleString()}</strong></td>`;
}

// Who's on the team, in what role, and (for whoever manages it) how many of each type they have
function teamSummaryHtml(team) {
    const manage = team.canManage;
    const admin = currentAccess.admin;
    const unassigned = team.unassigned?.total || 0;
    const head = sortHeadHtml('team-members', 'Name') + sortHeadHtml('team-members', 'Role') +
        TEAM_KINDS.map(([, label]) => sortHeadHtml('team-members', label, label, 'num')).join('') + sortHeadHtml('team-members', 'Total', 'Total', 'num') +
        (manage ? '<th></th>' : '') + (admin ? sortHeadHtml('team-members', 'Team') : '');
    const rows = team.members.map(m =>
        `<tr${m.username === currentUsername ? ' class="team-you"' : ''}>` +
        `<td>${escapeHtml(m.name)}${m.username === currentUsername ? ' <span class="team-you-tag">you</span>' : ''}</td>` +
        `<td>${admin ? roleSelectHtml(`data-member-role="${m.id}"`, m.role) : escapeHtml(roleName(m.role))}</td>` +
        loadCells(m.load) +
        (manage ? `<td><button type="button" class="home-action" data-team-show="${m.id}">Their tickets</button></td>` : '') +
        (admin ? `<td><div class="team-member-team">${teamSelectHtml(`data-member-team="${m.id}"`, team.id, true, m.test)}` +
            `<button type="button" class="home-action danger" data-member-remove="${m.id}" title="Take ${escapeHtml(m.name)} off ${escapeHtml(team.name)} and away from their role">Remove from team</button></div></td>` : '') +
        '</tr>').join('');
    const unassignedRow = manage
        ? `<tr class="team-unassigned sort-pinned"><td>Not assigned yet</td><td>—</td>${loadCells(team.unassigned)}` +
          `<td><button type="button" class="home-action" data-team-show="none"${unassigned ? '' : ' disabled'}>Show them</button></td>${admin ? '<td></td>' : ''}</tr>`
        : '';
    return `<h3>${escapeHtml(team.name)}${team.test ? ' <span class="team-test-tag">Test team</span>' : ''}</h3>` +
        `<p class="home-status">${team.tickets.toLocaleString()} tickets in ${team.families.toLocaleString()} families · ${team.members.length} people` +
        (manage && unassigned ? ` · <strong>${unassigned.toLocaleString()} not assigned yet</strong>` : '') + '</p>' +
        (team.members.length
            ? `<div class="table-wrap"><table class="result-table team-table" data-sort-list="team-members"><thead><tr>${head}</tr></thead><tbody>${rows}${unassignedRow}</tbody></table></div>`
            : '<p class="home-status">Nobody is on this team yet.</p>');
}

function roleSelectHtml(attr, selected) {
    return `<select ${attr} aria-label="Role">` + Object.entries(teamsView.data.roles)
        .map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('') + '</select>';
}

// testOnly: for a test account, which may only join a test team
function teamSelectHtml(attr, selected, withNone, testOnly = false) {
    return `<select ${attr} aria-label="Team">` + (withNone ? `<option value="">No team</option>` : '') + teamsView.data.teams
        .filter(t => !testOnly || t.test)
        .map(t => `<option value="${t.id}"${t.id === selected ? ' selected' : ''}>${escapeHtml(t.name)}</option>`).join('') + '</select>';
}

function assigneeFilterOptions(team) {
    const f = teamsView.filter.assignee;
    return `<option value=""${f ? '' : ' selected'}>Everyone</option><option value="none"${f === 'none' ? ' selected' : ''}>Not assigned yet</option>` +
        team.members.map(m => `<option value="${m.id}"${String(m.id) === f ? ' selected' : ''}>${escapeHtml(m.name)}</option>`).join('');
}

// The team's tickets, or (admins) "Not assigned yet"'s.
// quiet: keep the list showing until the new one is ready (a heading was clicked)
async function loadTeamTickets(quiet = false) {
    const team = currentTeam();
    const nobody = showingUnassigned();
    const out = document.getElementById('team-tickets');
    if ((!team && !nobody) || !out) return;
    const list = nobody ? 'unassigned-tickets' : 'team-tickets';
    const run = ++teamsView.run;
    if (!quiet) out.innerHTML = '<p class="home-status">Loading tickets…</p>';
    const q = new URLSearchParams({ offset: teamsView.offset, limit: TEAM_PAGE_SIZE,
        ...sortQuery(list, nobody ? UNASSIGNED_SORT_KEYS : TEAM_TICKET_SORT_KEYS), ...lookupQuery(list) });
    for (const [key, value] of Object.entries(teamsView.filter)) if (value) q.set(key, value);
    try {
        const data = await teamsFetch(nobody ? `/api/teams/unassigned/tickets?${q}` : `/api/teams/${team.id}/tickets?${q}`);
        if (!data || run !== teamsView.run) return;
        out.innerHTML = nobody ? unassignedTicketsHtml(data) : teamTicketsHtml(team, data);
        setLookupCount(list, data.total, data.before ?? data.total);
        const attention = document.getElementById('team-attention-filter');
        if (attention && data.attention != null) attention.textContent = `Needs attention (${data.attention.toLocaleString()})`;
        const all = document.querySelector('#teams .team-select-all');
        if (all) all.checked = false;
    } catch (err) {
        if (run === teamsView.run) out.innerHTML = `<p class="home-status error">${escapeHtml(err.message)}</p>`;
        console.error(err);
    }
}

// A heading, or a lookup: every ticket that matches, sorted or looked through by the server, from the first page
pagedSorts['team-tickets'] = () => {
    teamsView.offset = 0;
    return loadTeamTickets(true);
};
pagedLookups['team-tickets'] = pagedSorts['team-tickets'];
pagedSorts['unassigned-tickets'] = pagedSorts['team-tickets'];
pagedLookups['unassigned-tickets'] = pagedSorts['team-tickets'];

// A ticket's number, type, summary and state (with what its project manager was told)
function ticketCellsHtml(t) {
    const n = escapeHtml(t.number);
    const summary = String(t.summary || '');
    return `<td class="ticket-cell"><button type="button" class="ticket-link" data-ticket="${n}" title="Open ${n}">${n}</button>${starButtonHtml(t.number)}${attentionFlagsHtml(t)}</td>` +
        `<td>${t.type ? escapeHtml(t.type) : blankHtml('Type', t)}</td>` +
        `<td${summary.length > 100 ? ` title="${escapeHtml(summary)}"` : ''}>${summary ? escapeHtml(summary.length > 100 ? `${summary.slice(0, 97)}…` : summary) : blankHtml('Summary', t)}</td>` +
        `<td>${t.state ? escapeHtml(t.state) : blankHtml('State', t)}${reportLineHtml(t.report)}</td>`;
}

function teamPagerHtml(data) {
    const first = teamsView.offset + 1;
    const last = teamsView.offset + data.tickets.length;
    return `<div class="team-pager"><span>${first.toLocaleString()}–${last.toLocaleString()} of ${data.total.toLocaleString()}</span>` +
        `<button type="button" class="home-action" data-team-page="-1"${teamsView.offset ? '' : ' disabled'}>← Previous</button>` +
        `<button type="button" class="home-action" data-team-page="1"${last < data.total ? '' : ' disabled'}>Next →</button></div>`;
}

function teamTicketsHtml(team, data) {
    if (!data.total) {
        return `<p class="home-status">${teamsView.filter.attention && !lookupActive('team-tickets') ? 'None of these tickets need attention.'
            : teamsView.filter.assignee || teamsView.filter.kind || lookupActive('team-tickets')
            ? 'No tickets match.' : team.canManage ? 'This team has no tickets.' : 'No tickets are assigned to you yet.'}</p>`;
    }
    const manage = team.canManage;
    const admin = currentAccess.admin;
    // Members tell their project manager when they've resolved or closed one (notifications.js)
    const tell = !manage && canTellManager();
    const rows = data.tickets.map(t => {
        const n = escapeHtml(t.number);
        const family = t.family.size > 1
            ? `${t.family.size.toLocaleString()} linked tickets` +
              (manage ? ` <button type="button" class="link-btn" data-family-give="${escapeHtml(t.family.id)}" data-family-size="${t.family.size}" title="Give all ${t.family.size.toLocaleString()} of them to one person">Give all…</button>` : '') +
              (admin ? ` <button type="button" class="link-btn" data-family-find="${n}" title="Move this family to another team">Move…</button>` : '')
            : 'On its own' + (admin ? ` <button type="button" class="link-btn" data-family-find="${n}" title="Move this ticket to another team">Move…</button>` : '');
        return `<tr${needsAttention(t) ? ' class="attention"' : ''}>` +
            (manage ? `<td class="select-cell"><input type="checkbox" class="team-select" value="${n}" aria-label="Tick ${n}"></td>` : '') +
            ticketCellsHtml(t) +
            `<td>${family}</td>` +
            `<td>${manage
                ? personPickerHtml(team.id, t.assignee?.id ?? null, `Who has ${t.number}`, { attrs: `data-number="${n}"` })
                : escapeHtml(t.assignee?.name || 'Not assigned')}</td>` +
            (tell ? `<td>${reportButtonHtml(t.number, t.report?.mine ? 'Tell them again…' : 'Resolved or closed?…')}</td>` : '') +
            '</tr>';
    }).join('');
    return ATTENTION_LEGEND_HTML + `<div class="table-wrap"><table class="result-table" data-sort-list="team-tickets"><thead><tr>` +
        (manage ? '<th class="select-cell"></th>' : '') +
        Object.keys(TEAM_TICKET_SORT_KEYS).map(label => sortHeadHtml('team-tickets', label)).join('') +
        (tell ? '<th>Tell your project manager</th>' : '') +
        `</tr></thead><tbody>${rows}</tbody></table></div>` + teamPagerHtml(data);
}

// Under a ticket's state: the latest time someone told the project manager
// they'd resolved or closed it (the state itself is the data's, unchanged)
function reportLineHtml(report) {
    if (!report) return '';
    const note = String(report.note || '');
    return `<div class="team-report"${note ? ` title="${escapeHtml(note)}"` : ''}>` +
        // An admin or project manager who set the status themselves (Resolved or closed)
        (report.mine ? (canSeeStatuses() ? `You set it to ${escapeHtml(report.status)}` : `You told your project manager you ${escapeHtml(report.status)} it`)
            : `${escapeHtml(report.by || 'Someone')} says it's ${escapeHtml(report.status)}`) +
        ` · ${escapeHtml(formatShownAt(report.at))}` +
        (note ? `<span class="team-report-note">“${escapeHtml(note.length > 80 ? `${note.slice(0, 77)}…` : note)}”</span>` : '') +
        '</div>';
}

// name: who they go to, when the team showing isn't theirs ("Not assigned yet")
async function assign(numbers, assigneeId, name = null) {
    const data = await teamsFetch('/api/assignments', { method: 'PUT', body: JSON.stringify({ numbers, assigneeId }) });
    if (!data) return false;
    const who = assigneeId ? name || currentTeam()?.members.find(m => m.id === assigneeId)?.name : null;
    showToast(numbers.length === 1
        ? `${numbers[0]} ${who ? `is now ${who}'s` : 'is not assigned now'}`
        : `${data.changed.toLocaleString()} tickets ${who ? `given to ${who}` : 'unassigned'}`);
    refreshTeamCounts();
    return true;
}

// Every ticket of a family to one person (null: nobody), after asking, since
// some may be other people's now -> true if it was done
async function giveFamily(familyId, size, assigneeId, name) {
    const question = assigneeId === null
        ? `Take back all ${size.toLocaleString()} tickets in this family, so nobody has them?`
        : `Give all ${size.toLocaleString()} tickets in this family to ${name}? Any of them that are someone else's now go to ${name} too.`;
    if (!confirm(question)) return false;
    try {
        const data = await teamsFetch(`/api/ticket-families/${encodeURIComponent(familyId)}/assignee`, { method: 'PUT', body: JSON.stringify({ assigneeId }) });
        if (!data) return false;
        showToast(data.changed
            ? `${data.changed.toLocaleString()} ${data.changed === 1 ? 'ticket' : 'tickets'} ${assigneeId === null ? 'taken back' : `given to ${name}`}${data.changed < size ? ` (the other ${(size - data.changed).toLocaleString()} already were)` : ''}`
            : `They all ${assigneeId === null ? 'were unassigned' : `were ${name}'s`} already`);
        refreshTeamCounts();
        return true;
    } catch (err) {
        showToast(err.message);
        return false;
    }
}

// ---------------------------------------------------------------------
// Admins: moving a family (all the tickets linked to each other) to another team
// ---------------------------------------------------------------------

function familyCardHtml() {
    return `<section class="team-card"><h3>Move tickets to another team</h3>` +
        `<p class="home-status">Tickets linked to each other (a parent incident and its children, a request and its tasks, an order, ` +
        `a problem, a change and its incidents) are one family, and a family always belongs to one team. So moving a ticket moves its whole family.</p>` +
        `<div class="team-filters"><label>Any ticket in the family <input type="search" id="family-find" placeholder="e.g. INC2400123"></label>` +
        `<button type="button" class="home-action" data-family-lookup>Find its family</button></div>` +
        `<div id="family-found"></div></section>`;
}

async function findFamily(number) {
    const out = document.getElementById('family-found');
    const input = document.getElementById('family-find');
    if (number) input.value = number;
    const wanted = input.value.trim();
    if (!wanted) return;
    out.innerHTML = '<p class="home-status">Looking…</p>';
    input.closest('.team-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    try {
        const data = await teamsFetch(`/api/ticket-families?number=${encodeURIComponent(wanted)}`);
        if (!data) return;
        const f = data.family;
        const kinds = TEAM_KINDS.filter(([k]) => f.kinds[k]).map(([k, label]) => `${f.kinds[k].toLocaleString()} ${label.toLowerCase()}`).join(', ');
        out.innerHTML = `<p>${f.size === 1 ? `<strong>${escapeHtml(f.number)}</strong> isn't linked to any other ticket` : `<strong>${f.size.toLocaleString()} linked tickets</strong> (${kinds})`}, ` +
            `now with <strong>${escapeHtml(f.team?.name || 'no team')}</strong>.` +
            (f.size > 1 ? ` Includes ${f.sample.map(escapeHtml).join(', ')}${f.size > f.sample.length ? ', …' : ''}.` : '') + '</p>' +
            `<div class="team-filters"><label>Move to ${teamSelectHtml('id="family-move-to"', f.team?.id ?? null, false)}</label>` +
            `<button type="button" class="home-action" data-family-move="${escapeHtml(f.id)}">Move ${f.size === 1 ? 'it' : `all ${f.size.toLocaleString()}`}</button></div>` +
            `<p class="home-status">They become unassigned, for the new team's project manager to hand out.</p>` +
            (f.team ? `<div class="team-filters"><span>Or give ${f.size === 1 ? 'it' : `all ${f.size.toLocaleString()}`} to someone on ${escapeHtml(f.team.name)}</span>` +
                personPickerHtml(f.team.id, undefined, `Give the family to someone on ${f.team.name}`,
                    { placeholder: 'Type a name…', attrs: `data-family="${escapeHtml(f.id)}" data-family-size="${f.size}"` }) + '</div>' : '');
    } catch (err) {
        out.innerHTML = `<p class="home-status error">${escapeHtml(err.message)}</p>`;
    }
}

// done(text): says what happened (in the card, or a toast)
async function moveFamily(familyId, teamId, done) {
    const team = teamsView.data.teams.find(t => t.id === teamId);
    if (!team) { showToast('Choose the team to move it to first'); return; }
    try {
        const data = await teamsFetch(`/api/ticket-families/${encodeURIComponent(familyId)}/team`, { method: 'PUT', body: JSON.stringify({ teamId }) });
        if (!data) return;
        done(data.moved
            ? `✓ Moved ${data.moved.toLocaleString()} ${data.moved === 1 ? 'ticket' : 'tickets'} to ${team.name}. ${team.name}'s project manager can now hand them out.`
            : `That family is already ${team.name}'s.`);
        await refreshTeamCounts();
        loadTeamTickets(showingUnassigned());
    } catch (err) {
        showToast(err.message);
    }
}

// ---------------------------------------------------------------------
// Admins: "Not assigned yet": every ticket nobody has, on a team or on none,
// under a row for its family, where the family is moved or given out
// ---------------------------------------------------------------------

function unassignedSummaryHtml() {
    const u = teamsView.data.unassigned;
    if (!u.tickets) return 'Every ticket has someone. Nothing is waiting to be handed out.';
    const onTeams = u.tickets - u.noTeam.tickets;
    return `<strong>${howMany(u.tickets, 'ticket', 'tickets')} in ${howMany(u.families, 'family', 'families')}</strong> ${u.tickets === 1 ? 'has' : 'have'} nobody yet.` +
        (u.noTeam.tickets ? ` On no team: ${howMany(u.noTeam.tickets, 'ticket', 'tickets')} in ${howMany(u.noTeam.families, 'family', 'families')}. ` +
            'Move a family to a team, then give its tickets to someone on it.' : '') +
        (onTeams ? ` On a team: ${howMany(onTeams, 'ticket', 'tickets')}, for you or the team's project manager to hand out.` : '');
}

function unassignedCardHtml() {
    const f = teamsView.filter.team;
    const teamOptions = `<option value=""${f ? '' : ' selected'}>Any team, or none</option><option value="none"${f === 'none' ? ' selected' : ''}>No team</option>` +
        teamsView.data.teams.map(t => `<option value="${t.id}"${String(t.id) === f ? ' selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
    return `<section class="team-card"><h3>Not assigned yet</h3>` +
        `<p class="home-status" id="unassigned-summary">${unassignedSummaryHtml()}</p>` +
        `<div class="team-filters"><label>Team <select id="team-filter-team">${teamOptions}</select></label>${kindFilterHtml()}${attentionFilterHtml()}</div>` +
        // Any of the list's columns; the server looks through every ticket nobody has
        lookupBarHtml('unassigned-tickets', Object.keys(UNASSIGNED_SORT_KEYS), { mode: 'list' }) +
        `<div id="team-tickets"></div></section>`;
}

// "3 incidents, 1 change"
function familyKindsText(kinds) {
    return TEAM_KINDS.filter(([k]) => kinds[k]).map(([k]) => howMany(kinds[k], ...KIND_NOUNS[k])).join(', ');
}

// The row over a family's tickets: what it is, its team, and moving it or
// (on a team) giving all of it to one person
function familyGroupHtml(f) {
    const id = escapeHtml(f.id);
    const whole = f.size === 1 ? 'it' : `all ${f.size.toLocaleString()}`;
    const what = f.size > 1 ? `${howMany(f.size, 'linked ticket', 'linked tickets')}: ${familyKindsText(f.kinds)}` : 'On its own';
    const nobody = f.unassigned === f.size ? (f.size === 1 ? 'nobody has it' : 'nobody has any') : `${f.unassigned.toLocaleString()} not assigned`;
    const give = f.team && f.size > 1
        ? `<span>Give ${whole} to</span>` + personPickerHtml(f.team.id, undefined, `Give ${f.id}'s family to someone on ${f.team.name}`,
            { placeholder: 'Type a name…', attrs: `data-family="${id}" data-family-size="${f.size}"` })
        : '';
    const move = `<label>${give ? 'or move it to' : `Move ${whole} to`} <select data-group-move-to aria-label="Move ${id}'s family to">` +
        '<option value="">Choose a team…</option>' +
        teamsView.data.teams.filter(t => t.id !== f.team?.id)
            .map(t => `<option value="${t.id}">${escapeHtml(t.name)}${t.test ? ' (test team)' : ''}</option>`).join('') +
        `</select></label><button type="button" class="home-action" data-group-move="${id}" data-family-size="${f.size}" data-family-unassigned="${f.unassigned}">Move</button>`;
    return `<tr class="family-group"><td colspan="7"><div class="family-group-head">` +
        `<div class="family-group-what"><span><button type="button" class="ticket-link" data-ticket="${id}" title="Open ${id}: its record and family">${id}</button>` +
        (f.size > 1 && f.summary ? ` <span class="family-group-summary">${escapeHtml(f.summary.length > 90 ? `${f.summary.slice(0, 87)}…` : f.summary)}</span>` : '') + '</span>' +
        `<span class="family-group-meta">${what} · ${nobody} · ${f.team ? `on ${escapeHtml(f.team.name)}` : '<strong>on no team</strong>'}</span></div>` +
        `<div class="family-group-do">${give}${move}</div></div></td></tr>`;
}

function unassignedTicketsHtml(data) {
    if (!data.total) {
        return `<p class="home-status">${teamsView.filter.attention && !lookupActive('unassigned-tickets') ? 'None of these tickets need attention.'
            : teamsView.filter.team || teamsView.filter.kind || lookupActive('unassigned-tickets')
            ? 'No tickets match.' : '✓ Every ticket has someone.'}</p>`;
    }
    // In the list's own order a family's tickets come together, under its row;
    // sorted by a heading, each ticket says which family it's in and how to move it
    const grouped = !listSorts.get('unassigned-tickets');
    const families = new Map(data.families.map(f => [f.id, f]));
    let last = null;
    const rows = data.tickets.map(t => {
        const n = escapeHtml(t.number);
        const fid = escapeHtml(t.family.id);
        const head = grouped && t.family.id !== last ? familyGroupHtml(families.get(t.family.id)) : '';
        last = t.family.id;
        const family = (t.family.size > 1 ? `${fid} · ${t.family.size.toLocaleString()} linked tickets` : 'On its own') +
            (grouped ? '' : (t.team && t.family.size > 1
                ? ` <button type="button" class="link-btn" data-family-give="${fid}" data-family-size="${t.family.size}" data-family-team="${t.team.id}" title="Give all ${t.family.size.toLocaleString()} of them to one person">Give all…</button>`
                : '') + ` <button type="button" class="link-btn" data-family-find="${n}" title="Move this family to another team">Move…</button>`);
        return head + `<tr${needsAttention(t) ? ' class="attention"' : ''}>` + ticketCellsHtml(t) +
            `<td>${family}</td>` +
            `<td>${t.team ? escapeHtml(t.team.name) : '<span class="blank" title="This ticket\'s family isn\'t on any team yet">No team</span>'}</td>` +
            `<td>${t.team
                ? personPickerHtml(t.team.id, null, `Who has ${t.number}`, { attrs: `data-number="${n}"` })
                : '<span class="blank" title="Only someone on its family\'s team can have it">Move its family to a team first</span>'}</td>` +
            '</tr>';
    }).join('');
    return ATTENTION_LEGEND_HTML + `<div class="table-wrap"><table class="result-table" data-sort-list="unassigned-tickets"><thead><tr>` +
        Object.keys(UNASSIGNED_SORT_KEYS).map(label => sortHeadHtml('unassigned-tickets', label)).join('') +
        `<th>Give it to</th></tr></thead><tbody>${rows}</tbody></table></div>` + teamPagerHtml(data);
}

// ---------------------------------------------------------------------
// Admins: people on no team, and changing anyone's team or role
// ---------------------------------------------------------------------

function peopleCardHtml(people) {
    const rows = people.map(p => `<tr><td>${escapeHtml(p.name)}${p.test ? ' <span class="team-test-tag">Test account</span>' : ''}</td>` +
        `<td>${teamSelectHtml(`data-person-team="${p.id}"`, teamsView.teamId, false, p.test)}</td>` +
        `<td>${roleSelectHtml(`data-person-role="${p.id}"`, 'project_team')}</td>` +
        `<td><button type="button" class="home-action" data-person-add="${p.id}">Add</button></td></tr>`).join('');
    return `<section class="team-card"><h3>People on no team</h3>` +
        (people.length
            ? `<p class="home-status">They see no tickets until they're on a team and have tickets assigned. Test accounts can only join a test team.</p>` +
              `<div class="table-wrap"><table class="result-table team-table" data-sort-list=""><thead><tr>${['Name', 'Team', 'Role'].map(h => sortHeadHtml('', h)).join('')}<th></th></tr></thead><tbody>${rows}</tbody></table></div>`
            : '<p class="home-status">Everyone is on a team. (Admins, the warm-up account and the test accounts don\'t join one.)</p>') +
        '</section>';
}

// done: what the toast says, from the answer ({ unassigned })
async function setMembership(userId, teamId, role, done = () => 'Saved') {
    try {
        const data = await teamsFetch(`/api/teams/members/${userId}`, { method: 'PUT', body: JSON.stringify({ teamId, role }) });
        if (!data) return;
        showToast(done(data));
        await loadTeams();
    } catch (err) {
        showToast(err.message);
        loadTeams();
    }
}

// ---------------------------------------------------------------------
// ✅ RESOLVED OR CLOSED: the tickets someone said they resolved or closed
// (admins: every team's; project managers: their team's). Each one's menu
// changes its status; "Open" takes the status away. Only OneTouch's record
// changes: the ticket's data never does.
// ---------------------------------------------------------------------

const STATUS_NAMES = { resolved: 'Resolved', closed: 'Closed', open: 'Open (takes the status away)' };
const STATUS_HEADS = ['Ticket', 'Type', 'Summary', 'State in the data', 'Status', 'Changed by', 'When', 'Team', 'Assigned to'];
const canSeeStatuses = () => currentAccess.admin || currentAccess.role === 'project_manager';

async function loadTicketStatuses() {
    const box = document.getElementById('ticket-statuses');
    if (!box) return;
    try {
        const data = await teamsFetch('/api/ticket-statuses');
        if (!data || !box.isConnected) return;
        box.innerHTML = ticketStatusesHtml(data.tickets);
        restoreSorts(box);
        applyLookups(box);
    } catch (err) {
        if (box.isConnected) box.innerHTML = `<h3>Resolved or closed</h3><p class="home-status error">${escapeHtml(err.message)}</p>`;
    }
}

function ticketStatusesHtml(tickets) {
    const admin = currentAccess.admin;
    const heads = STATUS_HEADS.filter(h => admin || h !== 'Team');
    const where = admin ? 'on every team' : `on ${escapeHtml(currentAccess.team?.name || 'your team')}`;
    let html = '<h3>Resolved or closed</h3><p class="home-status">' + (tickets.length
        ? `${howMany(tickets.length, 'ticket', 'tickets')} ${where} that someone said they resolved or closed, newest first. Change one's status with its menu; ` +
          '"Open" takes the status away. Only OneTouch\'s record changes, never the ticket\'s data.'
        : `Nobody has said they resolved or closed a ticket ${where} yet. When someone does, it shows here.`) + '</p>';
    if (!tickets.length) return html;
    if (tickets.length >= 2) html += lookupBarHtml('ticket-statuses', heads);
    const rows = tickets.map(t => {
        const n = escapeHtml(t.number);
        const blank = { kind: kindOf(t.number) };
        return '<tr>' +
            `<td class="ticket-cell"><button type="button" class="ticket-link" data-ticket="${n}" title="Open ${n}">${n}</button>${starButtonHtml(t.number)}</td>` +
            `<td>${escapeHtml(t.type || capitalize(KIND_NOUNS[blank.kind]?.[0] || 'ticket'))}</td>` +
            `<td>${t.summary ? escapeHtml(t.summary) : blankHtml('Summary', blank)}</td>` +
            `<td>${t.state ? escapeHtml(t.state) : blankHtml('State', blank)}</td>` +
            `<td><span class="status-tag">${STATUS_NAMES[t.status]}</span>` +
            (t.note ? `<span class="team-report-note">“${escapeHtml(t.note)}”</span>` : '') + '</td>' +
            `<td>${escapeHtml(t.by || 'Someone')}</td>` +
            `<td data-sort="${escapeHtml(t.at)}">${escapeHtml(formatShownAt(t.at))}</td>` +
            (admin ? `<td>${t.team ? escapeHtml(t.team.name) : '<span class="blank">No team</span>'}</td>` : '') +
            `<td>${t.assignee ? escapeHtml(t.assignee.name) : '<span class="blank">Not assigned</span>'}</td>` +
            `<td><select data-status-change="${n}" aria-label="Change ${n}'s status">` +
            Object.entries(STATUS_NAMES).map(([s, name]) => `<option value="${s}"${s === t.status ? ' selected' : ''}>${name}</option>`).join('') +
            '</select></td></tr>';
    }).join('');
    return html + '<div class="table-wrap"><table class="result-table status-table" data-sort-list="ticket-statuses"><thead><tr>' +
        heads.map(h => sortHeadHtml('ticket-statuses', h)).join('') + `<th>Change it to</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// A ticket's menu changed: asks first before "Open" takes its status away
async function changeTicketStatus(select) {
    const number = select.dataset.statusChange;
    const status = select.value;
    const before = select.querySelector('option[selected]')?.value;
    if (status === before) return;
    if (status === 'open' && !confirm(`Set ${number} open again? Its status (${STATUS_NAMES[before]}) is taken away, as if nobody had said they ${before} it.`)) {
        select.value = before;
        return;
    }
    select.disabled = true;
    try {
        const data = await teamsFetch(`/api/ticket-statuses/${encodeURIComponent(number)}`, { method: 'PUT', body: JSON.stringify({ status }) });
        if (!data) return;
        showToast(status === 'open' ? `${number} is open again` : `${number} is ${STATUS_NAMES[status].toLowerCase()} now`);
        afterStatusChange();
    } catch (err) {
        select.value = before;
        select.disabled = false;
        showToast(`${err.message}`, 'error');
    }
}

// The list again, the team's tickets (they show a status under their state), and the counts
function afterStatusChange() {
    loadTicketStatuses();
    if (document.getElementById('team-tickets')) loadTeamTickets(true);
    if (currentAccess.admin) refreshTeamCounts();
}

// ---------------------------------------------------------------------
// 🎬 BEFORE A PRESENTATION (admins): every status undone, and the [Demo]
// tickets (db/demo-tickets.sql) back on no team with nobody, ready to move
// to a team and hand out live. The real tickets stay on their teams.
// ---------------------------------------------------------------------

function presentationHtml() {
    const p = teamsView.data?.presentation;
    if (!p) return '';
    const d = p.demo;
    const demo = !d.tickets ? 'There are no [Demo] tickets; db/demo-tickets.sql adds them.'
        : d.onTeam || d.assigned ? `${howMany(d.tickets, '[Demo] ticket', '[Demo] tickets')}: ${d.onTeam.toLocaleString()} on a team, ${d.assigned.toLocaleString()} assigned to someone.`
            : `The ${howMany(d.tickets, '[Demo] ticket is', '[Demo] tickets are')} on no team and assigned to nobody, ready to hand out.`;
    const statuses = p.statuses ? `${howMany(p.statuses, 'ticket has', 'tickets have')} a status (someone said they resolved or closed it).` : 'No ticket has a status.';
    return '<h3>Before a presentation</h3>' +
        '<p class="home-status">Puts things back the way a presentation starts. Every real ticket stays on its team, by family, as it is now.</p>' +
        '<ul class="presentation-steps">' +
        `<li><span>${escapeHtml(statuses)}</span><button type="button" class="home-action danger" data-undo-statuses="${p.statuses}"${p.statuses ? '' : ' disabled'}>↩ Undo every status</button></li>` +
        `<li><span>${escapeHtml(demo)}</span><button type="button" class="home-action danger" data-reset-demo="${d.tickets}"${d.tickets ? '' : ' disabled'}>🧹 Put the demo tickets back</button></li>` +
        '</ul>' + emailEveryoneHtml(p.email) + everyoneAdminHtml(p.everyoneAdmin);
}

// ✉️ Demo day: everyone with an address emailed, though MAIL_ONLY_TO in .env
// limits it the rest of the time (teams.mjs setEmailEveryone)
function emailEveryoneHtml(m) {
    if (!m) return '';
    let text, button = '';
    if (!m.enabled) text = 'Email is off on this server (no Brevo key), so nobody is emailed.';
    else if (!m.limited) text = `Everyone with an address is emailed (${howMany(m.people, 'person', 'people')}): nothing in .env limits it.`;
    else if (m.on) {
        text = `Everyone with an address is emailed (${howMany(m.people, 'person', 'people')}).`;
        button = m.canSwitch ? '<button type="button" class="home-action" data-email-everyone="off">Only email me again</button>' : '';
    } else {
        text = `Emails only go to ${m.onlyTo.length ? m.onlyTo.join(', ') : 'the test addresses'}. On demo day, email everyone with an address (${howMany(m.people, 'person', 'people')}).`;
        button = m.canSwitch ? `<button type="button" class="home-action danger" data-email-everyone="on" data-people="${m.people}">✉️ Email everyone</button>` : '';
    }
    if (m.enabled && m.limited && !m.canSwitch) button = '<span class="home-status">Only the permanent admins can switch this.</span>';
    return '<h3>Demo day</h3>' +
        `<ul class="presentation-steps"><li${m.on && m.limited ? ' class="everyone-admin-on"' : ''}><span>${escapeHtml(text)}</span>${button}</li></ul>`;
}

async function setEmailEveryone(on, people) {
    const question = on
        ? `Email everyone? From now on, each notification is also emailed to the person it's for: ${howMany(people, 'person has', 'people have')} an address. ` +
            'Notifications from before stay unsent. Switch it back after the demo.'
        : 'Only email the test addresses in .env again? Everyone else stops getting emails (their notifications still show under the 🔔).';
    if (!confirm(question)) return;
    try {
        const data = await teamsFetch('/api/email-everyone', { method: 'PUT', body: JSON.stringify({ on }) });
        if (!data) return;
        showToast(data.on ? `Everyone with an address is emailed now (${howMany(data.people, 'person', 'people')})` : 'Emails only go to the test addresses again');
        loadTeams();
    } catch (err) {
        showToast(`${err.message}`, 'error');
    }
}

// 👑 After the presentation: everyone an admin, so stakeholders can try every
// feature; only the permanent admins can switch it (teams.mjs setEveryoneAdmin)
function everyoneAdminHtml(e) {
    if (!e) return '';
    const text = e.on
        ? `Everyone is an admin: ${howMany(e.people, 'account sees', 'accounts see')} every ticket and every admin feature, and can make admin changes.`
        : `Only the permanent admins see everything. Make everyone an admin so stakeholders can try every feature (${howMany(e.people, 'account', 'accounts')}).`;
    const button = !e.canSwitch
        ? '<span class="home-status">Only the permanent admins can switch this back.</span>'
        : e.on
            ? `<button type="button" class="home-action" data-everyone-admin="off" data-people="${e.people}">Back to normal</button>`
            : `<button type="button" class="home-action danger" data-everyone-admin="on" data-people="${e.people}">👑 Make everyone an admin</button>`;
    return '<h3>After the presentation</h3>' +
        `<ul class="presentation-steps"><li${e.on ? ' class="everyone-admin-on"' : ''}><span>${escapeHtml(text)}</span>${button}</li></ul>`;
}

async function setEveryoneAdmin(on, people) {
    const question = on
        ? `Make everyone an admin? ${howMany(people, 'account', 'accounts')} will see every ticket, 🧊 Architecture and every admin card, and can move families, ` +
            'change teams and roles, assign any ticket and undo statuses, until you switch it back. People already signed in see the admin buttons when they reload the page.'
        : 'Back to normal? Everyone but the permanent admins goes back to seeing only their own tickets (project managers: their team\'s).';
    if (!confirm(question)) return;
    try {
        const data = await teamsFetch('/api/everyone-admin', { method: 'PUT', body: JSON.stringify({ on }) });
        if (!data) return;
        showToast(data.on ? `Everyone is an admin (${howMany(data.people, 'account', 'accounts')})` : 'Back to normal: only the permanent admins see everything');
        loadTeams();
    } catch (err) {
        showToast(`${err.message}`, 'error');
    }
}

async function undoAllStatuses(count) {
    if (!confirm(`Undo every status? The ${howMany(count, 'ticket', 'tickets')} someone said they resolved or closed go back to having no status, ` +
        'and the notifications that told project managers about them go too. This can\'t be undone.')) return;
    try {
        const data = await teamsFetch('/api/ticket-statuses/undo-all', { method: 'POST', body: '{}' });
        if (!data) return;
        showToast(`Undid the status of ${howMany(data.tickets, 'ticket', 'tickets')}`);
        afterStatusChange();
    } catch (err) {
        showToast(`${err.message}`, 'error');
    }
}

async function resetDemoTickets(count) {
    if (!confirm(`Put the ${howMany(count, '[Demo] ticket', '[Demo] tickets')} back? Their families go back on no team, nobody has them, ` +
        'and their statuses, notifications, stars and ticket results go. The real tickets aren\'t touched.')) return;
    try {
        const data = await teamsFetch('/api/demo-tickets/reset', { method: 'POST', body: '{}' });
        if (!data) return;
        showToast(`The ${howMany(data.tickets, '[Demo] ticket is', '[Demo] tickets are')} back on no team, assigned to nobody`);
        loadTeams();
    } catch (err) {
        showToast(`${err.message}`, 'error');
    }
}

// ---------------------------------------------------------------------
// Clicks and changes anywhere in the Team tab
// ---------------------------------------------------------------------

document.getElementById('teams-view').addEventListener('click', e => {
    const pick = e.target.closest('[data-team-pick]');
    if (pick) {
        teamsView.teamId = pick.dataset.teamPick === UNASSIGNED_VIEW ? UNASSIGNED_VIEW : Number(pick.dataset.teamPick);
        teamsView.filter = { assignee: '', kind: '', team: '', attention: '' };
        listLookups.delete('team-tickets');
        listLookups.delete('unassigned-tickets');
        teamsView.offset = 0;
        renderTeams();
        return;
    }
    const show = e.target.closest('[data-team-show]');
    if (show) {
        teamsView.filter.assignee = show.dataset.teamShow;
        teamsView.offset = 0;
        const select = document.getElementById('team-filter-assignee');
        if (select) select.value = teamsView.filter.assignee;
        loadTeamTickets();
        document.getElementById('team-tickets').closest('.team-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    const attention = e.target.closest('[data-team-attention]');
    if (attention) {
        teamsView.filter.attention = teamsView.filter.attention ? '' : '1';
        attention.setAttribute('aria-pressed', String(Boolean(teamsView.filter.attention)));
        teamsView.offset = 0;
        loadTeamTickets();
        return;
    }
    const page = e.target.closest('[data-team-page]');
    if (page) {
        teamsView.offset = Math.max(0, teamsView.offset + Number(page.dataset.teamPage) * TEAM_PAGE_SIZE);
        loadTeamTickets();
        return;
    }
    if (e.target.closest('[data-team-bulk]')) {
        const numbers = [...document.querySelectorAll('#team-tickets .team-select:checked')].map(b => b.value);
        if (!numbers.length) { showToast('Tick some tickets first'); return; }
        const to = pickerCurrent(document.getElementById('team-bulk-to'));
        if (to === undefined) { showToast('Type the name of who gets them (or "Not assigned") first'); return; }
        assign(numbers, to).then(ok => { if (ok) loadTeamTickets(); }).catch(err => showToast(err.message));
        return;
    }
    // "Give all…": a box to type who gets the whole family, in place of the link
    const give = e.target.closest('[data-family-give]');
    if (give) {
        give.outerHTML = personPickerHtml(Number(give.dataset.familyTeam) || teamsView.teamId, undefined, `Give all ${give.dataset.familySize} tickets in this family to`,
            { placeholder: 'Give all to…', attrs: `data-family="${escapeHtml(give.dataset.familyGive)}" data-family-size="${give.dataset.familySize}"` });
        return;
    }
    const find = e.target.closest('[data-family-find]');
    if (find) { findFamily(find.dataset.familyFind); return; }
    if (e.target.closest('[data-family-lookup]')) { findFamily(); return; }
    const move = e.target.closest('[data-family-move]');
    if (move) {
        moveFamily(move.dataset.familyMove, Number(document.getElementById('family-move-to').value), text => {
            document.getElementById('family-found').innerHTML = `<p class="home-status">${escapeHtml(text)}</p>`;
        });
        return;
    }
    // A family's row in "Not assigned yet": the team picked beside it. Asks first
    // when some of its tickets are people's now, since they'd lose them.
    const groupMove = e.target.closest('[data-group-move]');
    if (groupMove) {
        const select = groupMove.closest('.family-group-do').querySelector('[data-group-move-to]');
        const team = teamsView.data.teams.find(t => t.id === Number(select.value));
        if (!team) { showToast('Choose the team to move it to first'); select.focus(); return; }
        const size = Number(groupMove.dataset.familySize);
        const held = size - Number(groupMove.dataset.familyUnassigned);
        if (held && !confirm(`Move all ${size.toLocaleString()} tickets in this family to ${team.name}? ` +
            `The ${held.toLocaleString()} that people have now become unassigned too, for ${team.name}'s project manager to hand out.`)) return;
        moveFamily(groupMove.dataset.groupMove, team.id, showToast);
        return;
    }
    const remove = e.target.closest('[data-member-remove]');
    if (remove) {
        const team = currentTeam();
        const member = team?.members.find(m => m.id === Number(remove.dataset.memberRemove));
        if (!member) return;
        const held = member.load?.total || 0;
        if (!confirm(`Take ${member.name} off ${team.name}? They stop being its ${roleName(member.role).toLowerCase()} and stop seeing its tickets.` +
            (held ? ` Their ${held.toLocaleString()} ${held === 1 ? 'ticket stays' : 'tickets stay'} with ${team.name}, unassigned, for its project manager to hand out.` : ''))) return;
        setMembership(member.id, null, null, data => `${member.name} is off ${team.name}` +
            (data.unassigned ? `; ${data.unassigned.toLocaleString()} ${data.unassigned === 1 ? 'ticket is' : 'tickets are'} unassigned now` : ''));
        return;
    }
    const add = e.target.closest('[data-person-add]');
    if (add) {
        const id = add.dataset.personAdd;
        const row = add.closest('tr');
        setMembership(Number(id), Number(row.querySelector('[data-person-team]').value), row.querySelector('[data-person-role]').value);
        return;
    }
    const undo = e.target.closest('[data-undo-statuses]');
    if (undo) { undoAllStatuses(Number(undo.dataset.undoStatuses)); return; }
    const demo = e.target.closest('[data-reset-demo]');
    if (demo) { resetDemoTickets(Number(demo.dataset.resetDemo)); return; }
    const everyone = e.target.closest('[data-everyone-admin]');
    if (everyone) { setEveryoneAdmin(everyone.dataset.everyoneAdmin === 'on', Number(everyone.dataset.people)); return; }
    const email = e.target.closest('[data-email-everyone]');
    if (email) setEmailEveryone(email.dataset.emailEveryone === 'on', Number(email.dataset.people));
});

// A name picked in a ticket's box gives it to them; in a family's, the whole family
document.getElementById('teams-view').addEventListener('personpick', e => {
    const picker = e.target;
    const { id, previous, name } = e.detail;
    if (picker.dataset.number) {
        assign([picker.dataset.number], id, name)
            // "Not assigned yet" lists only tickets nobody has, so it goes from there
            .then(ok => { if (!ok) setPickerValue(picker, previous); else if (showingUnassigned()) loadTeamTickets(true); })
            .catch(err => { setPickerValue(picker, previous); showToast(err.message); });
    } else if (picker.dataset.family) {
        giveFamily(picker.dataset.family, Number(picker.dataset.familySize), id, name).then(done => {
            if (!done) setPickerValue(picker, undefined);
            loadTeamTickets(true);
        });
    }
});

document.getElementById('teams-view').addEventListener('change', e => {
    const t = e.target;
    if (TEAM_FILTERS[t.id]) {
        teamsView.filter[TEAM_FILTERS[t.id]] = t.value;
        teamsView.offset = 0;
        loadTeamTickets();
    } else if (t.dataset.statusChange) {
        changeTicketStatus(t);
    } else if (t.classList.contains('team-select-all')) {
        for (const box of document.querySelectorAll('#team-tickets .team-select')) box.checked = t.checked;
    } else if (t.dataset.memberRole) {
        const row = t.closest('tr');
        setMembership(Number(t.dataset.memberRole), Number(row.querySelector('[data-member-team]').value) || null, t.value);
    } else if (t.dataset.memberTeam !== undefined) {
        const row = t.closest('tr');
        const name = row.cells[0].textContent.replace(/\s*you$/, '');
        const leaving = t.value ? `move ${name} to ${t.options[t.selectedIndex].text}` : `take ${name} off the team`;
        if (!confirm(`Do you want to ${leaving}? Their tickets stay with this team, unassigned, for its project manager to hand out.`)) {
            t.value = String(teamsView.teamId);
            return;
        }
        setMembership(Number(t.dataset.memberTeam), t.value ? Number(t.value) : null, row.querySelector('[data-member-role]').value);
    }
});

document.getElementById('teams-view').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'family-find') findFamily();
});
