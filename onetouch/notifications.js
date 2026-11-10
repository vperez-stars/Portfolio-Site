// =====================================================================
// NOTIFICATIONS: the 🔔 in the header (notifications.mjs on the server):
// tickets someone gave you, a family moved to the team you're the project
// manager of, and someone on your team saying they resolved or closed a
// ticket. Checked every minute while signed in; opening the list marks
// them read. Each can be cleared off the list, or all of them at once.
// Also the box for telling your project manager you resolved or closed a
// ticket, from a ticket's record and the Team tab.
// Loaded before app.js, whose helpers these functions use when they run.
// =====================================================================

const NOTIFY_CHECK_MS = 60 * 1000;
// How many of a notification's tickets are listed before "and N more"
const NOTIFY_SHOWN_NUMBERS = 8;
// The tickets a member can report on (not orders: they aren't assigned to anyone)
const REPORTABLE = /^(INC|CHG|RITM|SCTASK)\d{7}$/;

const notifyState = {
    items: [],      // the newest ones, newest first
    unread: 0,
    newestId: null, // the newest one seen so far (null: not checked yet), so only later ones pop up
    timer: null,
    run: 0,         // bumped on sign-out, so a check still on its way is dropped
    cleared: new Set(), // ids cleared here, kept off the list even if a check started before the server heard
    clearedUpTo: 0,     // "Clear all": every id up to this one, likewise
};

// Signing out: nothing of this person's stays on the page
function resetNotifications() {
    clearInterval(notifyState.timer);
    Object.assign(notifyState, { items: [], unread: 0, newestId: null, timer: null, run: notifyState.run + 1, cleared: new Set(), clearedUpTo: 0 });
    toggleNotifications(false);
    paintNotifyCount();
    document.getElementById('notify-list').innerHTML = '';
}

// Signed in: check now and every minute
function startNotifications() {
    resetNotifications();
    checkNotifications();
    notifyState.timer = setInterval(checkNotifications, NOTIFY_CHECK_MS);
}

async function checkNotifications() {
    if (!sessionTokenValue) return;
    const run = notifyState.run;
    try {
        const response = await fetch(`${API_BASE}/api/notifications`, { headers: authHeaders() });
        if (handleUnauthorized(response) || !response.ok || run !== notifyState.run) return;
        const data = await response.json();
        if (run !== notifyState.run) return;
        const listed = data.notifications.filter(n => n.id > notifyState.clearedUpTo && !notifyState.cleared.has(n.id));
        // New since the last check (none on the first one: the count says enough)
        const fresh = notifyState.newestId === null ? [] : listed.filter(n => n.id > notifyState.newestId && !n.read);
        notifyState.items = listed;
        notifyState.unread = data.unread;
        notifyState.newestId = Math.max(notifyState.newestId ?? 0, ...listed.map(n => n.id));
        paintNotifyCount();
        if (notificationsOpen()) {
            renderNotifications();
            markNotificationsRead();
        }
        if (fresh.length) showToast(fresh.length === 1 ? `${notificationText(fresh[0])}` : `${fresh.length} new notifications`);
        // New tickets for them: Home's "Assigned to me" catches up if it's showing
        if (fresh.some(n => n.kind === 'assigned') && homeMode === 'assigned'
            && document.getElementById('home-view').classList.contains('active')) showAssigned(true);
    } catch (err) {
        console.error('Could not check notifications:', err);
    }
}

function paintNotifyCount() {
    const count = document.getElementById('notify-count');
    const button = document.getElementById('notify-btn');
    count.hidden = !notifyState.unread;
    count.textContent = notifyState.unread > 99 ? '99+' : String(notifyState.unread);
    button.setAttribute('aria-label', notifyState.unread ? `Notifications (${notifyState.unread} new)` : 'Notifications');
}

function notificationsOpen() {
    return !document.getElementById('notify-panel').hidden;
}

function toggleNotifications(open) {
    const panel = document.getElementById('notify-panel');
    const button = document.getElementById('notify-btn');
    const willOpen = typeof open === 'boolean' ? open : panel.hidden;
    panel.hidden = !willOpen;
    button.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) {
        toggleThemePanel(false);
        renderNotifications();
        markNotificationsRead();
        panel.querySelector('.drawer-close').focus();
    } else if (panel.contains(document.activeElement)) {
        button.focus();
    }
}

// Seen: the count goes, but they stay highlighted until the list is next drawn
async function markNotificationsRead() {
    if (!notifyState.unread) return;
    notifyState.unread = 0;
    paintNotifyCount();
    try {
        const response = await fetch(`${API_BASE}/api/notifications/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({}),
        });
        handleUnauthorized(response);
    } catch (err) {
        console.error('Could not mark the notifications read:', err);
    }
}

// ---------------------------------------------------------------------
// ✉️ Email me these too: the 🔔's notifications by email as well (mail.mjs
// on the server), to the address an admin put on file for this person
// ---------------------------------------------------------------------

let emailSetting = null; // { address, on, enabled } from /api/me; null when signed out

// email: from /api/me (undefined: keep what's there, e.g. right after signing in)
function paintEmailSetting(email) {
    if (email !== undefined) emailSetting = email;
    const box = document.getElementById('notify-email');
    const e = emailSetting;
    box.hidden = !e;
    if (!e) return;
    const input = document.getElementById('notify-email-on');
    input.checked = Boolean(e.address && e.on);
    input.disabled = !e.address;
    document.getElementById('notify-email-to').textContent = !e.address ? 'There\'s no email address on file for you. An admin can add one.'
        : !e.enabled ? `They'll go to ${e.address} once email is set up on this server.`
        : e.on ? `Each one is emailed to ${e.address}.` : `Off. They'd go to ${e.address}.`;
}

document.getElementById('notify-email-on').addEventListener('change', async e => {
    const on = e.target.checked;
    try {
        const response = await fetch(`${API_BASE}/api/me/email`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ on }),
        });
        if (handleUnauthorized(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        paintEmailSetting(data.email);
        showToast(on ? `Your notifications will be emailed to ${data.email.address} too` : 'No more notification emails; they still show here');
    } catch (err) {
        paintEmailSetting();
        showToast(`${err.message}`, 'error');
    }
});

// One notification in words. html: ticket numbers become links, the rest is escaped.
function notificationText(n, html = false) {
    const text = html ? escapeHtml : String;
    const ticket = number => html ? `<button type="button" class="link-btn" data-ticket="${escapeHtml(number)}">${escapeHtml(number)}</button>` : number;
    const d = n.detail || {};
    const who = text(n.actor || 'Someone');
    const count = d.count || n.numbers.length;
    if (n.kind === 'assigned') {
        const on = d.team ? ` on ${text(d.team)}` : '';
        // A whole family at once
        if (d.family && d.size > 1) return `${who} gave you the family of ${d.size.toLocaleString()} linked tickets around ${ticket(d.family)}${on}.`;
        return `${who} gave you ${count === 1 ? ticket(n.numbers[0]) : `${count.toLocaleString()} tickets`}${on}.`;
    }
    if (n.kind === 'family') {
        // A ticket from ServiceNow linked two families: the smaller one joined the bigger one's team
        if (d.source === 'servicenow') {
            return `A new link from ServiceNow brought ${count === 1 ? ticket(n.numbers[0]) : `${count.toLocaleString()} linked tickets`} into a family on ${text(d.team)}. ` +
                `${count === 1 ? 'It isn\'t' : 'They aren\'t'} assigned to anyone yet.`;
        }
        return count === 1
            ? `${who} moved ${ticket(n.numbers[0])} to ${text(d.team)}. It isn't assigned to anyone yet.`
            : `${who} moved a family of ${count.toLocaleString()} linked tickets to ${text(d.team)}. They aren't assigned to anyone yet.`;
    }
    if (n.kind === 'report') return `${who} says they ${text(d.status)} ${ticket(n.numbers[0])}.`;
    if (n.kind === 'issue') return `${who} reported a problem: ${text(d.label)}.`;
    return `${who} sent you a notification.`;
}

function renderNotifications() {
    const list = document.getElementById('notify-list');
    document.getElementById('notify-clear-all').hidden = !notifyState.items.length;
    if (!notifyState.items.length) {
        list.innerHTML = '<p class="home-status">No notifications. You\'ll hear here when someone gives you tickets. Project managers also hear when a family ' +
            'of tickets is moved to their team, and when someone on it says they resolved or closed a ticket.</p>';
        return;
    }
    list.innerHTML = '<ul class="notify-items">' + notifyState.items.map(n => {
        const d = n.detail || {};
        const count = d.count || n.numbers.length;
        const shown = count > 1 ? n.numbers.slice(0, NOTIFY_SHOWN_NUMBERS) : [];
        const more = count - shown.length;
        return `<li class="notify-item${n.read ? '' : ' unread'}" data-notify-id="${n.id}">` +
            `<div class="notify-text">${notificationText(n, true)}</div>` +
            (d.note ? `<blockquote class="notify-note">${escapeHtml(d.note)}</blockquote>` : '') +
            (shown.length ? `<div class="notify-tickets">${shown.map(number =>
                `<button type="button" class="link-btn" data-ticket="${escapeHtml(number)}">${escapeHtml(number)}</button>`).join(', ')}` +
                (more > 0 ? ` and ${more.toLocaleString()} more` : '') + '</div>' : '') +
            `<div class="notify-foot"><span>${escapeHtml(formatShownAt(n.at))}</span><span class="notify-foot-actions">` +
            (n.kind === 'issue' ? '<button type="button" class="link-btn" data-notify-reports>See the reports</button>'
                : n.kind === 'report' ? '' : '<button type="button" class="link-btn" data-notify-team>Open the Team tab</button>') +
            `<button type="button" class="notify-clear" data-notify-clear="${n.id}" aria-label="Clear this notification">Clear</button>` +
            '</span></div></li>';
    }).join('') + '</ul>';
}

// Takes notifications off the list at once, and off the server's; they come
// back if that fails. ids: some of them, or null: all of them, up to the
// newest showing (one that arrives meanwhile isn't cleared unseen)
async function clearNotifications(ids) {
    const upTo = ids ? null : Math.max(...notifyState.items.map(n => n.id));
    const gone = new Set(ids || notifyState.items.map(n => n.id));
    const before = { cleared: new Set(notifyState.cleared), clearedUpTo: notifyState.clearedUpTo };
    if (ids) ids.forEach(id => notifyState.cleared.add(id));
    else notifyState.clearedUpTo = Math.max(notifyState.clearedUpTo, upTo);
    notifyState.items = notifyState.items.filter(n => !gone.has(n.id));
    renderNotifications();
    try {
        const response = await fetch(`${API_BASE}/api/notifications/clear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(ids ? { ids } : { upTo }),
        });
        if (handleUnauthorized(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
    } catch (err) {
        Object.assign(notifyState, before);
        showToast(`${err.message}`, 'error');
        checkNotifications(); // the list as the server has it
    }
}

function clearAllNotifications() {
    if (!notifyState.items.length) return;
    if (!confirm('Clear all your notifications? They leave this list for good.')) return;
    clearNotifications(null);
    document.querySelector('#notify-panel .drawer-close').focus();
}

document.getElementById('notify-panel').addEventListener('click', e => {
    // One notification's Clear: the keys go to the next one's, or the one before
    const clear = e.target.closest('[data-notify-clear]');
    if (clear) {
        const item = clear.closest('.notify-item');
        const next = item.nextElementSibling?.dataset.notifyId || item.previousElementSibling?.dataset.notifyId;
        clearNotifications([Number(clear.dataset.notifyClear)]);
        (document.querySelector(`#notify-list [data-notify-clear="${next}"]`) || document.querySelector('#notify-panel .drawer-close')).focus();
        return;
    }
    // A ticket number: app.js's click listener opens it; the list gets out of the way
    if (e.target.closest('[data-ticket]')) { toggleNotifications(false); return; }
    if (e.target.closest('[data-notify-reports]')) {
        toggleNotifications(false);
        showArchitectureReports();
        return;
    }
    if (e.target.closest('[data-notify-team]')) {
        toggleNotifications(false);
        switchTab('teams');
    }
});

// A click outside the list closes it
document.addEventListener('pointerdown', e => {
    const panel = document.getElementById('notify-panel');
    if (!panel.hidden && !panel.contains(e.target) && !e.target.closest('#notify-btn')) toggleNotifications(false);
});

// Back to this tab after a while: check straight away
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && notifyState.timer) checkNotifications();
});

// ---------------------------------------------------------------------
// Telling your project manager you resolved or closed a ticket. Only a
// notification for them: the ticket's data doesn't change.
// ---------------------------------------------------------------------

let reportNumber = null;

// Anyone on a team except its project manager (and admins, who have none)
function canTellManager() {
    return Boolean(currentAccess.team) && !currentAccess.admin && currentAccess.role !== 'project_manager';
}

// The button, for a ticket's record (app.js) and the Team tab (teams.js)
function reportButtonHtml(number, label = '✅ Tell my project manager') {
    if (!canTellManager() || !REPORTABLE.test(number)) return '';
    return `<button type="button" class="home-action" data-report="${escapeHtml(number)}">${escapeHtml(label)}</button>`;
}

function openReportDialog(number) {
    const dialog = document.getElementById('report-dialog');
    reportNumber = number;
    document.getElementById('report-ticket').textContent = `${number}: did you resolve it or close it? Your project manager hears about it.`;
    document.getElementById('report-status').value = 'resolved';
    document.getElementById('report-note').value = '';
    document.getElementById('report-error').hidden = true;
    dialog.showModal();
    document.getElementById('report-status').focus();
}

document.querySelector('#report-dialog form').addEventListener('submit', async e => {
    e.preventDefault();
    const number = reportNumber;
    const status = document.getElementById('report-status').value;
    const send = document.getElementById('report-send');
    const error = document.getElementById('report-error');
    send.disabled = true;
    error.hidden = true;
    try {
        const response = await fetch(`${API_BASE}/api/tickets/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ number, status, note: document.getElementById('report-note').value }),
        });
        if (handleUnauthorized(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'That didn\'t work. Please try again.');
        document.getElementById('report-dialog').close();
        const names = data.told.length > 1 ? `${data.told.slice(0, -1).join(', ')} and ${data.told.at(-1)}` : data.told[0];
        showToast(`✓ Told ${names} that you ${status} ${number}`);
        // The Team tab shows it next to the ticket
        if (document.getElementById('teams-view').classList.contains('active')) loadTeamTickets();
        // Someone said it's done, so it's no longer highlighted
        else if (homeMode === 'assigned' && document.getElementById('home-view').classList.contains('active')) showAssigned(true);
    } catch (err) {
        error.textContent = `${err.message}`;
        error.hidden = false;
    } finally {
        send.disabled = false;
    }
});

document.addEventListener('click', e => {
    const report = e.target.closest('[data-report]');
    if (report) openReportDialog(report.dataset.report);
});

// ---------------------------------------------------------------------
// 🚩 Reporting a problem to the admins (issues.mjs on the server). They're
// told under the 🔔 and by email, and read it on the 🧊 Architecture page.
// ---------------------------------------------------------------------

function openIssueDialog() {
    document.getElementById('issue-category').value = 'broken';
    document.getElementById('issue-message').value = '';
    document.getElementById('issue-error').hidden = true;
    document.getElementById('issue-dialog').showModal();
    document.getElementById('issue-category').focus();
}

document.querySelector('#issue-dialog form').addEventListener('submit', async e => {
    e.preventDefault();
    const send = document.getElementById('issue-send');
    const error = document.getElementById('issue-error');
    // Which page they were on when it went wrong; the chat opens over the others
    const page = assistantOpen() ? 'chat' : (document.querySelector('.view-panel.active')?.id || '').replace(/-view$/, '');
    send.disabled = true;
    error.hidden = true;
    try {
        const response = await fetch(`${API_BASE}/api/issues`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ category: document.getElementById('issue-category').value, message: document.getElementById('issue-message').value, page }),
        });
        if (handleUnauthorized(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'That didn\'t send. Please try again.');
        document.getElementById('issue-dialog').close();
        showToast('✓ Your report went to the admins. Thank you.');
    } catch (err) {
        error.textContent = `${err.message}`;
        error.hidden = false;
    } finally {
        send.disabled = false;
    }
});
