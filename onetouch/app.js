// =====================================================================
// SIGN IN: the server checks the credentials and hands back a session
// token, which every API call then sends as "Authorization: Bearer ..."
// =====================================================================

// The API lives on the same server that served this page, whether that's
// localhost:8000, this computer's network address, or a tunnel link. Only a
// page opened straight from disk (file://) has no server, so fall back then.
const API_BASE = location.protocol.startsWith('http') ? location.origin : 'http://localhost:8000';
const TOKEN_KEY = 'onetouch-session';

// sessionStorage can be blocked (private windows, strict settings)
function readToken() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function saveToken(token) {
    try {
        if (token) sessionStorage.setItem(TOKEN_KEY, token);
        else sessionStorage.removeItem(TOKEN_KEY);
    } catch { /* stays signed in until the page is reloaded */ }
}

let sessionTokenValue = readToken();

function authHeaders() {
    return sessionTokenValue ? { Authorization: `Bearer ${sessionTokenValue}` } : {};
}

function showLoginError(message) {
    document.getElementById('login-error').textContent = message || '';
}

// Signed in: the home page, with this person's starred tickets, layout, colors
// and notifications
function showApp(signedIn) {
    document.body.classList.toggle('signed-out', !signedIn);
    if (signedIn) {
        switchTab('home');
        loadStars();
        loadPreferences();
        startNotifications();
    } else if (!fillSignInLink()) {
        document.getElementById('login-email').focus();
    }
}

// A sign-in link (…/#user=jsmith&pass=secret) fills in the form, and the
// person still clicks the button. The part after "#" is never sent to the
// server (or the tunnel), and it is taken out of the address bar at once.
let signInLink = null;
function readSignInLink() {
    let details = location.hash.slice(1);
    // Some apps escape the "=" and "&" when they open a link (#user%3Djsmith%26pass%3D…)
    if (!/[=&]/.test(details) && /%3D/i.test(details)) {
        try { details = decodeURIComponent(details); } catch { /* read as it is */ }
    }
    const params = new URLSearchParams(details);
    if (!params.has('user')) return false;
    signInLink = { user: params.get('user') || '', pass: params.get('pass') || '' };
    history.replaceState(null, '', location.pathname + location.search);
    return true;
}
function fillSignInLink() {
    if (!signInLink || !document.body.classList.contains('signed-out')) return false;
    document.getElementById('login-email').value = signInLink.user;
    document.getElementById('login-password').value = signInLink.pass;
    // A link with just the username: the password is typed next
    document.getElementById(signInLink.pass ? 'login-btn' : 'login-password').focus();
    signInLink = null;
    showLoginError('');
    return true;
}
// Opened while someone is signed in in this tab: their session stays, and the
// form is filled in when they sign out
function signInLinkWhileSignedIn() {
    if (!signInLink || !currentUsername) return;
    const user = signInLink.user.trim().toLowerCase().replace(/@Demo Co.\.com$/, '');
    if (user === currentUsername) signInLink = null;
    else showToast(`That link signs in as ${user}. You're signed in as ${currentUsername}: sign out to use it.`);
}
window.addEventListener('hashchange', () => {
    if (!readSignInLink()) return;
    if (!fillSignInLink()) signInLinkWhileSignedIn();
});

// The signed-in person's name, shown in the header and the greetings
// (their display name, or their username if they don't have one)
let currentUserName = '';
let currentUsername = '';
// What this person may see and do (teams.mjs on the server):
// { admin, role, roleName, team: { id, name }, tickets, note }
const NO_ACCESS = { admin: false, role: null, roleName: null, team: null, tickets: 0, note: null };
let currentAccess = NO_ACCESS;

function setCurrentUser(user) {
    currentUserName = user ? (user.displayName || user.username || '') : '';
    currentUsername = user ? (user.username || '') : '';
    document.getElementById('user-name').textContent = currentUserName;
    if (!user) currentAccess = NO_ACCESS;
    else if (user.access) currentAccess = user.access;
    // The Team tab: admins, and anyone on a team
    document.getElementById('teams-tab').hidden = !(currentAccess.admin || currentAccess.team);
    // 🧊 Architecture: admins only (architecture.js; the server checks too)
    document.getElementById('architecture-tab').hidden = !(currentAccess.admin || currentAccess.demo);
    // Home's "Team families": project managers and admins
    document.getElementById('kpi-families-tab').hidden = !canSeeFamilies();
    // The 🔔 panel's "Email me these too" (notifications.js)
    paintEmailSetting(user ? user.email : null);
    renderGreetings();
    // Each person's home page opens on the search they used last
    if (currentUsername) setHomeMode(rememberedHomeMode());
}

// Just the first name: "Cassidy Sotelo" -> "Welcome, Cassidy!" on the home
// page and "Hello, Cassidy!" at the top of the chat
function renderGreetings() {
    const firstName = currentUserName.trim().split(/\s+/)[0];
    document.getElementById('home-welcome').textContent = firstName ? `Welcome, ${firstName}!` : 'Welcome!';
    const welcome = document.getElementById('welcome-msg');
    if (welcome) welcome.textContent = firstName ? `Hello, ${firstName}!` : 'Hello!';
}

// Who owns the stored session (after a reload, the name isn't known yet)
async function loadCurrentUser() {
    if (!sessionTokenValue) return;
    try {
        const response = await fetch(`${API_BASE}/api/me`, { headers: authHeaders() });
        if (handleUnauthorized(response)) return;
        if (response.ok) {
            setCurrentUser(await response.json());
            signInLinkWhileSignedIn();
        }
    } catch (err) {
        console.error('Could not load the signed-in user:', err);
    }
}

async function signIn() {
    const button = document.getElementById('login-btn');
    const passwordField = document.getElementById('login-password');
    showLoginError('');
    button.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('login-email').value,
                password: passwordField.value,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.token) {
            showLoginError(data.error || 'Sign-in failed. Please try again.');
            passwordField.value = '';
            passwordField.focus();
            return;
        }
        sessionTokenValue = data.token;
        saveToken(data.token);
        passwordField.value = '';
        clearChat();
        setCurrentUser(data);
        showApp(true);
        // What they may see, then their last chat (saved to their account)
        loadCurrentUser().then(resumeLatestChat);
    } catch (err) {
        showLoginError('Could not reach the OneTouch server. Please try again.');
        console.error(err);
    } finally {
        button.disabled = false;
    }
}

function signOut(message) {
    if (sessionTokenValue) {
        fetch(`${API_BASE}/api/logout`, { method: 'POST', headers: authHeaders() }).catch(() => {});
    }
    sessionTokenValue = null;
    saveToken(null);
    // The next person to sign in on this computer must not see this person's
    // chat, searches or stars
    toggleAssistant(false);
    clearChat();
    setCurrentUser(null);
    resetHome();
    resetTeams();
    resetNotifications();
    resetCustomizing();
    resetArchitecture();
    showLoginError(typeof message === 'string' ? message : '');
    showApp(false);
}

// An expired session (or a server restart) sends the user back to sign in
function handleUnauthorized(response) {
    if (response.status !== 401) return false;
    signOut('Your session has ended. Please sign in again.');
    return true;
}

// =====================================================================
// CONVERSATION MEMORY: the server keeps this session's questions and
// Claude's answers, so follow-ups ("same but for changes") work, and saves
// each chat to the person's account after every answer. "New chat" starts
// a fresh one; the old one stays under "Chat History", where reopening it
// shows its answers again and Claude remembers it.
// =====================================================================

const WELCOME_HTML = document.getElementById('chat-log').innerHTML;

// Bumped whenever the chat is cleared, so an answer still on its way for the
// old conversation is dropped instead of landing in the new one
let chatEpoch = 0;

// Back to just the greeting (with the signed-in person's name)
function clearChat() {
    chatEpoch += 1;
    document.getElementById('chat-log').innerHTML = WELCOME_HTML;
    forgetRemovedExports();
    toggleChatHistory(false);
    renderGreetings();
    updateChatControls();
}

// remove: also delete the chat from the history ("Delete chat")
async function resetConversation(remove = false) {
    if (!sessionTokenValue) return;
    try {
        const response = await fetch(`${API_BASE}/api/conversation/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ delete: remove }),
        });
        handleUnauthorized(response);
    } catch (err) {
        console.error('Could not reset the conversation:', err);
    }
}

async function newChat() {
    await resetConversation();
    clearChat();
    document.getElementById('user-prompt').focus();
}

// "Delete chat": after a confirmation, the questions and answers disappear,
// Claude forgets the conversation, it leaves the history, and the chat closes
async function deleteChat() {
    if (!document.querySelector('#chat-log .user-msg')) {
        toggleAssistant(false);
        return;
    }
    if (!confirm('Delete this chat? Its questions and answers disappear, it leaves your chat history, and the AI assistant forgets the conversation.')) return;
    clearChat();
    toggleAssistant(false);
    await resetConversation(true);
    showToast('Chat deleted');
}

// ---------------------------------------------------------------------
// CHAT HISTORY: the list over the chat, newest first. Opening one draws
// its answers again and Claude carries on with it.
// ---------------------------------------------------------------------

function chatHistoryOpen() {
    return !document.getElementById('chat-history').hidden;
}

function toggleChatHistory(open) {
    const box = document.getElementById('chat-history');
    const willOpen = typeof open === 'boolean' ? open : box.hidden;
    box.hidden = !willOpen;
    document.getElementById('chat-history-btn').setAttribute('aria-expanded', String(willOpen));
    if (willOpen) loadChatHistory();
}

function formatChatWhen(iso) {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
        ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

async function loadChatHistory() {
    const list = document.getElementById('chat-history-list');
    list.innerHTML = '<p class="home-status">Loading your chat history…</p>';
    try {
        const response = await fetch(`${API_BASE}/api/chats`, { headers: authHeaders() });
        if (handleUnauthorized(response)) return;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load your chat history.');
        if (!chatHistoryOpen()) return;
        list.innerHTML = data.chats.length
            ? data.chats.map(c => `
                <div class="chat-history-item${c.current ? ' current' : ''}">
                    <button type="button" class="chat-history-open" onclick="openSavedChat(${c.id})" title="${c.current ? 'This is the chat you have open' : 'Open this chat and carry on where you left off'}">
                        <span class="chat-history-title">${escapeHtml(c.title)}</span>
                        <span class="chat-history-meta">${c.current ? 'Open now · ' : ''}${c.questions} ${c.questions === 1 ? 'question' : 'questions'} · ${escapeHtml(formatChatWhen(c.updatedAt))}</span>
                    </button>
                    <button type="button" class="chat-history-delete" onclick="deleteSavedChat(${c.id})" title="Delete this chat" aria-label="Delete this chat">🗑</button>
                </div>`).join('')
            : '<p class="home-status">No saved chats yet. Each chat is saved here after its first answer.</p>';
    } catch (err) {
        list.innerHTML = `<p class="home-status error">${escapeHtml(err.message)}</p>`;
        console.error(err);
    }
}

// After a refresh or signing in: the chat they had last comes back, so
// nothing is lost (New chat starts a fresh one; this one stays in the history)
async function resumeLatestChat() {
    if (!sessionTokenValue || document.querySelector('#chat-log .user-msg')) return;
    try {
        const response = await fetch(`${API_BASE}/api/chats`, { headers: authHeaders() });
        if (!response.ok) return;
        const { chats } = await response.json();
        if (chats.length && !document.querySelector('#chat-log .user-msg')) await openSavedChat(chats[0].id, { quiet: true });
    } catch (err) {
        console.error('Could not reopen the last chat:', err);
    }
}

// Shows a saved chat's questions and answers, and Claude remembers it again.
// quiet: reopened by itself (after a refresh), so the cursor stays where it is.
async function openSavedChat(id, { quiet = false } = {}) {
    try {
        const response = await fetch(`${API_BASE}/api/chats/${id}/open`, { method: 'POST', headers: authHeaders() });
        if (handleUnauthorized(response)) return;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not open that chat.');
        clearChat();
        for (const entry of data.transcript) {
            appendMessage('user-msg', linkTicketsHtml(entry.question));
            const reply = entry.reply || {};
            showAnswer(entry.question, reply, reply.elapsedMs ? reply.elapsedMs / 1000 : null, { replay: true });
        }
        if (!quiet) document.getElementById('user-prompt').focus();
    } catch (err) {
        if (quiet) return console.error(err);
        showToast(err.message);
        loadChatHistory();
        console.error(err);
    }
}

async function deleteSavedChat(id) {
    if (!confirm('Delete this chat? It leaves your chat history and can\'t be brought back.')) return;
    try {
        const response = await fetch(`${API_BASE}/api/chats/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (handleUnauthorized(response)) return;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not delete that chat.');
        // The open chat was the one deleted: the screen starts over too
        if (data.current) {
            clearChat();
            toggleChatHistory(true);
        } else {
            loadChatHistory();
        }
        showToast('Chat deleted');
    } catch (err) {
        showToast(err.message);
        console.error(err);
    }
}

// The logo and the name "OneTouch": back to Home from anywhere, closing
// whatever is open on top (the chat, the dashboards drawer)
function goHome() {
    toggleAssistant(false);
    toggleDashboardDrawer(false);
    toggleThemePanel(false);
    switchTab('home');
    document.getElementById('home-view').scrollTop = 0;
}

// Pages: Home (the logo, or its button) and Dashboards; the page showing lights up.
// The AI assistant opens over either.
function switchTab(viewName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === viewName));
    document.querySelectorAll('.view-panel').forEach(panel => panel.classList.toggle('active', panel.id === `${viewName}-view`));
    // The first time someone sees Dashboards: its tour (customize.js)
    if (viewName === 'dashboard') loadDashboards().then(() => maybeStartTour('dashboards'));
    // The Team tab, fresh each time (assignments change)
    if (viewName === 'teams') loadTeams();
    // The 3D map only draws while it's showing
    if (viewName === 'architecture') showArchitecture();
    else hideArchitecture();
    // Stars and assignments may have changed elsewhere (the chat, a dashboard, another computer)
    if (viewName === 'home') showHomeMode(homeMode !== 'starred');
}

// =====================================================================
// AI ASSISTANT: the chat opens over the page from the "Ask Claude" bar in
// the header: a question typed there is asked in the chat, and with nothing
// typed the chat opens as it was. A click anywhere outside the chat (the
// header too) or Minimize closes it and keeps the conversation; Delete chat
// removes it.
// =====================================================================

function assistantOpen() {
    return document.getElementById('assistant-panel').classList.contains('open');
}

// Opens or closes the conversation (no argument: the opposite of now).
// refocus: closing from inside the chat puts the keys back in the header's bar
function toggleAssistant(open, { refocus = true } = {}) {
    const panel = document.getElementById('assistant-panel');
    const willOpen = typeof open === 'boolean' ? open : !assistantOpen();
    panel.classList.toggle('open', willOpen);
    document.getElementById('assistant-backdrop').classList.toggle('open', willOpen);
    document.getElementById('nav-ask-input').setAttribute('aria-expanded', String(willOpen));
    if (willOpen) {
        const chatLog = document.getElementById('chat-log');
        chatLog.scrollTop = chatLog.scrollHeight;
        document.getElementById('user-prompt').focus();
    } else if (refocus && panel.contains(document.activeElement)) {
        document.getElementById('nav-ask-input').focus();
    }
    updateChatControls();
}

// Asks a question as if typed into the chat, opening it to show the answer
function askAssistant(question) {
    toggleAssistant(true);
    document.getElementById('user-prompt').value = question;
    sendPrompt();
}

// The header's bar: a question is asked in the chat; nothing typed opens the chat as it was
function askFromHeader() {
    const input = document.getElementById('nav-ask-input');
    const question = input.value.trim();
    if (!question) {
        toggleAssistant(true);
        return;
    }
    input.value = '';
    askAssistant(question);
}

// The header's bar says how many questions the open conversation has
function updateChatControls() {
    const asked = document.querySelectorAll('#chat-log .user-msg').length;
    const count = document.getElementById('nav-ask-count');
    count.hidden = !asked;
    count.textContent = asked.toLocaleString();
    document.getElementById('nav-ask-btn').title = asked
        ? `Ask Claude. With nothing typed, this opens your chat (${asked.toLocaleString()} ${asked === 1 ? 'question' : 'questions'} so far)`
        : 'Ask Claude. With nothing typed, this opens the chat';
}

// A click anywhere outside the open chat closes it, the header included (its
// buttons still do their job in the same click). A window opened over the chat
// (a ticket, a chart's tickets) and the tour don't count as outside, nor do
// ♿ Accessibility's panel, 🎤 buttons and read-aloud controls (accessibility.js).
document.addEventListener('pointerdown', e => {
    if (!assistantOpen() || e.target.closest?.('#assistant-panel, dialog, #tour, #access-panel, .mic-btn, .a11y-ui')) return;
    toggleAssistant(false, { refocus: false });
}, true);

// "/" anywhere but in a box being typed in: to the header's Ask bar
document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || document.body.classList.contains('signed-out')) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]') || tourState) return;
    e.preventDefault();
    document.getElementById('nav-ask-input').focus();
});

// =====================================================================
// DASHBOARDS TAB: the Metabase dashboards made by scripts/metabase-setup.mjs,
// shown through the OneTouch server (so they work from any address)
// =====================================================================

// Every page the frame can show, by its public id: the drawer's dashboards,
// and the detail pages a click on a chart opens
const dashboardPages = { main: new Map(), details: new Map() };
let currentMainDashboard = null;
// A page is known by its signed address (/embed/dashboard/<token>), made for
// this person by the server; a click link names the page it opens instead
// (/onetouch/dashboard/<key>), and followDashboardFrame swaps in the address
const pageId = path => (String(path).match(/\/embed\/dashboard\/([\w-]+\.[\w-]+\.[\w-]+)/) || [])[1];
const linkedPageKey = path => (String(path).match(/^\/onetouch\/dashboard\/([\w-]+)$/) || [])[1];
const DASHBOARD_HINT = 'Click a bar, slice, number or blue value for details';

// The dashboard each person had open last ("my:<id>" for one of their own),
// saved to their account so it opens there next time, on any computer
function rememberedDashboard() {
    return prefs.dashboards.last || '';
}
function rememberDashboard(key) {
    if (prefs.dashboards.last === key || !sessionTokenValue || prefsLoadFailed) return;
    prefs.dashboards.last = key;
    savePreference('dashboards');
}

// How the frame shows a dashboard: no extra border or title (the toolbar
// above names it), and Metabase's dark look when OneTouch is dark
function frameHash() {
    return `#bordered=false&titled=false${document.documentElement.dataset.theme === 'dark' ? '&theme=night' : ''}`;
}

// A page's own hash with OneTouch's look in it, keeping everything else it
// says (a detail page hides some of its filters there). Kept as written,
// because Metabase reads it without turning "+" into spaces.
function themedFrameHash(hash) {
    const options = hash.replace(/^#/, '').split('&').filter(o => o && !o.startsWith('theme='));
    if (document.documentElement.dataset.theme === 'dark') options.push('theme=night');
    return `#${options.join('&')}`;
}
const frameHashIsDark = hash => /(^#|&)theme=night(&|$)/.test(hash);

// Light <-> dark: the dashboard in the frame reloads in the matching look
function refreshDashboardTheme() {
    if (!frameHasPage()) return;
    try {
        const where = document.getElementById('dashboard-frame').contentWindow.location;
        where.replace(`${where.pathname}${where.search}${themedFrameHash(where.hash)}`);
        where.reload();
    } catch { /* not ours */ }
}

// Loads the drawer once; resolves true when the dashboards are there.
// Shared, so the tab and "Open in Dashboards" never load it twice.
let dashboardsLoading = null;
function loadDashboards() {
    if (!dashboardsLoading) {
        dashboardsLoading = buildDashboards().then(ok => {
            if (!ok) dashboardsLoading = null; // try again next time
            return ok;
        });
    }
    return dashboardsLoading;
}

async function buildDashboards() {
    const picker = document.getElementById('dashboard-picker');
    const message = document.getElementById('dashboard-message');
    try {
        const response = await fetch(`${API_BASE}/api/dashboards`, { headers: authHeaders() });
        if (handleUnauthorized(response)) return false;
        const { dashboards, details = [] } = await response.json();
        for (const d of dashboards) dashboardPages.main.set(pageId(d.path), d);
        for (const d of details) dashboardPages.details.set(pageId(d.path), d);
        // Each link is signed for this person and shows only their tickets: say which
        const whose = currentAccess.admin ? '' : currentAccess.role === 'project_manager' && currentAccess.team
            ? `Only ${currentAccess.team.name}'s tickets` : 'Only your tickets';
        document.getElementById('dashboard-hint').textContent = whose ? `${DASHBOARD_HINT} · ${whose}` : DASHBOARD_HINT;
        // Which team dashboards this person hid, and which one they had open
        await prefsReady;
        if (!dashboards.length && !prefs.dashboards.boards.length) {
            message.textContent = 'The live app also embeds Metabase dashboards here. This demo shows dashboards built in OneTouch itself: open ☰ Dashboards to pick one or build your own.';
            return false;
        }

        // The drawer: one heading per group, dashboards in the order the server lists them
        const groups = new Map();
        for (const d of dashboards) {
            if (!groups.has(d.group)) groups.set(d.group, []);
            groups.get(d.group).push(d);
        }
        picker.innerHTML = '';
        for (const [group, items] of groups) {
            const section = document.createElement('section');
            section.className = 'drawer-group';
            const heading = document.createElement('h3');
            heading.textContent = group;
            section.appendChild(heading);
            for (const d of items) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'dashboard-choice';
                button.dataset.key = d.key;
                button.innerHTML = '<span class="choice-check" aria-hidden="true"></span><span class="dashboard-choice-name"></span><span class="dashboard-choice-desc"></span>';
                button.querySelector('.dashboard-choice-name').textContent = d.name;
                button.querySelector('.dashboard-choice-desc').textContent = d.description || '';
                button.onclick = () => {
                    // "Show or hide team dashboards": a click shows or hides it in the list
                    if (drawerEditing) return toggleDashboardHidden(d.key);
                    showDashboard(d);
                    toggleDashboardDrawer(false);
                };
                section.appendChild(button);
            }
            picker.appendChild(section);
        }

        applyHiddenDashboards();

        const last = rememberedDashboard();
        if (last === 'families') { showFamilies(); return true; }
        if (last.startsWith('my:') && showBoard(last.slice(3))) return true;
        const remembered = dashboards.find(d => d.key === last && !isDashboardHidden(d.key));
        if (remembered) showDashboard(remembered);
        else showFirstDashboard();
        // First visit: open the drawer so people see everything that's there
        // (unless the Dashboards tour is about to show it to them)
        if (!last && (prefs.tour.dashboards || prefsLoadFailed)) toggleDashboardDrawer(true);
        return true;
    } catch (err) {
        message.textContent = 'Could not load the dashboards. Please try again.';
        console.error(err);
        return false;
    }
}

// The first team dashboard in this person's list; with every one hidden, a
// dashboard of their own, or a note saying how to bring the team ones back
function showFirstDashboard() {
    const visible = [...dashboardPages.main.values()].filter(d => !isDashboardHidden(d.key));
    if (visible.length) return showDashboard(visible[0]);
    if (prefs.dashboards.boards.length) return showBoard(prefs.dashboards.boards[0].id);
    hideBoard();
    document.getElementById('dashboard-frame').hidden = true;
    const message = document.getElementById('dashboard-message');
    message.textContent = 'Every team dashboard is hidden from your list. Open ☰ Dashboards and click "Show or hide team dashboards" ' +
        'to bring some back, or create a dashboard of your own.';
    message.hidden = false;
    setDashboardHeading('', '', '', false);
    document.getElementById('dashboard-hint').hidden = true;
}

// The record pages a ticket number can open (built by scripts/metabase-setup.mjs)
const RECORD_PAGES = { INC: 'incident-detail', CHG: 'change-detail', RITM: 'request-detail' };

// Home page -> that ticket's record in the Dashboards tab
async function openInDashboards(number) {
    toggleAssistant(false); // opened from a ticket inside the chat: show the page behind it
    switchTab('dashboard');
    if (!await loadDashboards()) return;
    const key = RECORD_PAGES[(number.match(/^[A-Z]+/) || [])[0]];
    const page = [...dashboardPages.details.values()].find(d => d.key === key);
    if (!page) return;
    toggleDashboardDrawer(false);
    const path = `${page.path}?number=${encodeURIComponent(number)}${frameHash()}`;
    if (currentBoardId || document.getElementById('dashboard-frame').hidden) {
        // One of their own dashboards is showing: back to the team dashboards, and
        // the record opens on top of one once it has loaded (so ← Back works)
        const visible = [...dashboardPages.main.values()].filter(d => !isDashboardHidden(d.key));
        showDashboard(visible.includes(currentMainDashboard) ? currentMainDashboard : visible[0] || [...dashboardPages.main.values()][0]);
        pendingFramePath = path;
    } else {
        openDashboardPath(path);
    }
}

// Moves the frame to a page the way a click inside it would, so ← Back
// returns to the dashboard underneath. A frame still loading its first
// dashboard moves once that has loaded.
let pendingFramePath = null;
function frameHasPage() {
    try {
        return Boolean(pageId(document.getElementById('dashboard-frame').contentWindow.location.pathname));
    } catch { return false; }
}
function openDashboardPath(path) {
    if (frameHasPage()) document.getElementById('dashboard-frame').contentWindow.location.assign(`${API_BASE}${path}`);
    else pendingFramePath = path;
}
document.getElementById('dashboard-frame').addEventListener('load', () => {
    if (!pendingFramePath || !frameHasPage()) return;
    const path = pendingFramePath;
    pendingFramePath = null;
    // Not during the load event itself: a page moved before it has finished
    // loading replaces its history entry, and ← Back would then leave OneTouch
    setTimeout(() => document.getElementById('dashboard-frame').contentWindow.location.assign(`${API_BASE}${path}`), 50);
});

function showDashboard(dashboard) {
    hideBoard();
    hideFamilies();
    showRecordFamily('');
    markCurrentDashboard(dashboard);
    const frame = document.getElementById('dashboard-frame');
    frame.src = `${API_BASE}${dashboard.path}${frameHash()}`;
    frame.hidden = false;
    document.getElementById('dashboard-message').hidden = true;
}

// A drawer dashboard is showing: name it, highlight it, remember it
function markCurrentDashboard(dashboard) {
    currentMainDashboard = dashboard;
    document.querySelectorAll('.dashboard-choice').forEach(b => {
        const on = b.dataset.key === dashboard.key;
        b.classList.toggle('active', on);
        if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    setDashboardHeading(dashboard.group, dashboard.name, dashboard.description || '', false);
    rememberDashboard(dashboard.key);
}

function setDashboardHeading(parent, name, description, onDetailPage) {
    document.getElementById('dashboard-current-group').textContent = parent;
    document.getElementById('dashboard-current-name').textContent = name;
    document.getElementById('dashboard-current-desc').textContent = description;
    document.getElementById('dashboard-back').hidden = !onDetailPage;
    document.getElementById('dashboard-hint').hidden = onDetailPage;
}

// "Team: INFRA-Cloud-Linux", or for a list "Incidents · Priority: P2 - High"
function detailPageLabel(detail, search) {
    const values = new URLSearchParams(search);
    const set = detail.params.map(p => [p.name, values.get(p.slug)]).filter(([, v]) => v);
    if (detail.params.length === 1) return `${detail.name}: ${set[0]?.[1] || ''}`;
    return set.length ? `${detail.name} · ${set.map(([n, v]) => `${n}: ${v}`).join(', ')}` : detail.name;
}

// Clicks inside a dashboard move the frame to a detail page without
// reloading it, so follow its address and keep the toolbar in step
let lastFrameAddress = '';
function followDashboardFrame() {
    const frame = document.getElementById('dashboard-frame');
    if (frame.hidden) return; // one of their own dashboards is showing
    let where;
    try { where = frame.contentWindow.location; } catch { return; } // not ours (yet)
    if (!where) return;
    // A click opened another page by name: swap in this person's signed address
    // for it, with the click's filters and OneTouch's look. replace(), so ← Back
    // returns to the page that was clicked.
    const linked = linkedPageKey(where.pathname);
    if (linked) {
        const target = [...dashboardPages.main.values(), ...dashboardPages.details.values()].find(d => d.key === linked);
        if (target) where.replace(`${API_BASE}${target.path}${where.search}${themedFrameHash(where.hash)}`);
        return;
    }
    // A click's link can't know OneTouch is dark, so its page opens light: put the
    // look back in place (no reload, and ← Back still returns to the page before)
    const id = pageId(where.pathname);
    if (id && frameHashIsDark(where.hash) !== (document.documentElement.dataset.theme === 'dark')) {
        where.replace(`${where.pathname}${where.search}${themedFrameHash(where.hash)}`);
        return;
    }
    if (where.href === lastFrameAddress) return;
    lastFrameAddress = where.href;

    const main = dashboardPages.main.get(id);
    const detail = dashboardPages.details.get(id);
    if (main) {
        if (main !== currentMainDashboard) markCurrentDashboard(main);
        else setDashboardHeading(main.group, main.name, main.description || '', false);
    } else if (detail) {
        // Every filter cleared (the × in the filter box): the page has nothing to
        // show, so go back to the dashboard it was opened from. replace(), so ← Back
        // doesn't return to the empty page.
        const values = new URLSearchParams(where.search);
        if (!detail.params.some(p => values.get(p.slug))) {
            const home = currentMainDashboard || [...dashboardPages.main.values()][0];
            if (home) {
                frame.contentWindow.location.replace(`${API_BASE}${home.path}${frameHash()}`);
                showToast(`No filters left, so you're back on ${home.name}`);
                return;
            }
        }
        setDashboardHeading(currentMainDashboard ? currentMainDashboard.name : '', detailPageLabel(detail, where.search), '', true);
    }

    // An incident, change or request record can be starred from the toolbar
    const star = document.getElementById('dashboard-star');
    const number = detail && detail.params.some(p => p.slug === 'number')
        ? String(new URLSearchParams(where.search).get('number') || '').toUpperCase() : '';
    star.hidden = !STARRABLE.test(number);
    if (!star.hidden) {
        star.dataset.star = number;
        paintStar(star);
    }
    // …and its parent, children and other linked tickets above it (families.js)
    showRecordFamily(star.hidden ? '' : number);
}
setInterval(followDashboardFrame, 400);
document.getElementById('dashboard-frame').addEventListener('load', followDashboardFrame);

// Follows a click inside the frame as it happens rather than at the next
// look, so a page that opened light turns dark before it is seen
document.getElementById('dashboard-frame').addEventListener('load', () => {
    try {
        const w = document.getElementById('dashboard-frame').contentWindow;
        if (w.oneTouchFollows) return;
        w.oneTouchFollows = true;
        const pushState = w.history.pushState;
        w.history.pushState = function (...args) {
            pushState.apply(this, args);
            queueMicrotask(followDashboardFrame);
        };
        w.addEventListener('popstate', () => setTimeout(followDashboardFrame));
    } catch { /* not ours */ }
});

function dashboardBack() {
    // Only from a detail page: on a drawer dashboard there is nothing to go back to
    // inside the frame, and history.back() would leave OneTouch's page instead
    if (document.getElementById('dashboard-back').hidden) return;
    document.getElementById('dashboard-frame').contentWindow.history.back();
}

// Opens or closes the drawer (no argument: the opposite of now)
function toggleDashboardDrawer(open) {
    const drawer = document.getElementById('dashboard-drawer');
    const toggle = document.getElementById('dashboard-drawer-toggle');
    const willOpen = typeof open === 'boolean' ? open : !drawer.classList.contains('open');
    drawer.classList.toggle('open', willOpen);
    document.getElementById('dashboard-backdrop').classList.toggle('open', willOpen);
    toggle.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) {
        (drawer.querySelector('.dashboard-choice.active') || drawer.querySelector('.dashboard-choice'))?.focus();
    } else if (drawer.contains(document.activeElement)) {
        toggle.focus();
    }
}

// Escape closes whatever is open on top: the colors panel, the conversation,
// then the drawer (a dialog such as the chart builder closes itself)
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (!document.getElementById('theme-panel').hidden) toggleThemePanel(false);
    else if (assistantOpen() && chatHistoryOpen()) toggleChatHistory(false);
    else if (assistantOpen()) toggleAssistant(false);
    else if (document.getElementById('dashboard-drawer').classList.contains('open')) toggleDashboardDrawer(false);
});

// Asynchronous Chat Workflow Engine
async function sendPrompt() {
    const inputField = document.getElementById('user-prompt');
    const chatLog = document.getElementById('chat-log');
    const userPromptText = inputField.value.trim();
    console.log("User Prompt Text:", userPromptText);

    if (!userPromptText) return;

    // Append User message node to DOM bubble UI (its ticket numbers open those tickets)
    appendMessage('user-msg', linkTicketsHtml(userPromptText));
    inputField.value = '';

    // Shows each step while the answer is worked out, with a running clock
    const progress = startQueryProgress();
    const epoch = chatEpoch;

    try {
        // text/event-stream: the server reports each step as it happens
        const response = await fetch(`${API_BASE}/api/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...authHeaders() },
            body: JSON.stringify({ userPrompt: userPromptText })
        });

        if (handleUnauthorized(response)) {
            progress.finish();
            return;
        }

        const data = await readQueryResponse(response, stage => progress.step(stage));
        const seconds = progress.finish();
        if (epoch !== chatEpoch) return; // the chat was deleted or restarted meanwhile

        showAnswer(userPromptText, data, seconds);

    } catch (err) {
        progress.finish();
        if (epoch !== chatEpoch) return;
        appendMessage('ai-msg', `Could not reach the OneTouch server, or the answer was cut off. Please try again.`);
        console.error(err);
    }
}

// One answer in the chat. replay: drawn again from a saved chat, so it
// doesn't tell Claude about related tickets again or add to Ticket results.
function showAnswer(userPromptText, data, seconds, { replay = false } = {}) {
    // A new answer (not a saved chat drawn again): ♿ can read it aloud (accessibility.js)
    if (!replay) setTimeout(() => document.dispatchEvent(new CustomEvent('onetouch:answer')));
    if (data.memoryReset) {
        appendMessage('system-msg', 'This conversation got long, so Claude started fresh. Earlier questions are no longer remembered.');
    }

    if (data.error) {
        appendMessage('ai-msg', `Error: ${linkTicketsHtml(data.error)}`);
        return;
    }

    // About tickets they don't have permission to see: not answered (server.mjs)
    if (data.intent === 'denied') {
        appendMessage('ai-msg', `<div class="result-restricted">${linkTicketsHtml(data.message)}</div>` + answerTimingHtml(seconds, data.fromCache, data.offline));
        return;
    }

    // Clarification or unsupported question: show the explanation only
    if (data.intent === 'clarify' || data.intent === 'unsupported') {
        const message = data.message || 'I need a little more detail to run that.';
        const download = downloadBarHtml(registerExport({ title: 'OneTouch answer', question: userPromptText, tables: buildExportTables(data, message) }));
        appendMessage('ai-msg', `${linkTicketsHtml(message)}` + download + answerTimingHtml(seconds, data.fromCache, data.offline));
        return;
    }

    // Normal query: restate what was fetched, show the rows as a table,
    // and tuck the assumptions into a collapsible note underneath
    let html = `<div class="result-title">${linkTicketsHtml(data.message || 'Here is what I found:')}</div>`;
    // Not the full report: tickets they don't have permission to see match too
    if (data.restricted) html += `<div class="result-restricted">${linkTicketsHtml(data.restricted)}</div>`;
    // Nothing found anywhere: the server's explanation replaces the empty tables
    const explanationHtml = data.explanation
        ? `<div class="result-explanation">${linkTicketsHtml(data.explanation)}</div>` : '';
    let tablesHtml = '';
    if (data.rowsDropped) {
        // A long saved chat keeps only its newer answers' tables (chats.mjs)
        html += '<div class="result-explanation">This answer\'s tables were too large to keep in the chat history. Ask the question again to see them.</div>';
    } else if (data.explanation && data.allEmpty) {
        html += explanationHtml;
    } else if (data.combined) {
        // Counts across several ticket types: one table, one column per type
        tablesHtml = renderCombined(data.combined);
    } else if (data.sections && data.sections.length > 1) {
        // Lists across several ticket types: one titled table per type
        tablesHtml = data.sections.map(s =>
            `<div class="section-title">${escapeHtml(capitalize(nounFor(s.entity, 2)))}</div>` +
            renderResults(s.rows, s.entity)
        ).join('');
    } else {
        tablesHtml = renderResults(data.results || [], data.entity);
    }
    // Counts by one thing can also be shown as a chart (and back)
    const answer = { data, question: userPromptText, tablesHtml, view: 'table', model: tablesHtml ? answerChartModel(data, userPromptText) : null };
    if (tablesHtml) html += (answer.model ? answerViewsHtml(answer.model, data.chartable) : '') + `<div class="answer-view">${tablesHtml}</div>`;
    // Some ticket types found nothing: explain those under the tables
    if (data.explanation && !data.allEmpty && !data.rowsDropped) html += explanationHtml;

    if (data.assumptions && data.assumptions.length > 0) {
        html += `<details class="assumptions"><summary>How I read your question</summary><ul>` +
            data.assumptions.map(a => `<li>${linkTicketsHtml(a)}</li>`).join('') +
            `</ul></details>`;
    }

    // Not an admin: which tickets the answer could see (teams.mjs)
    if (data.visibility && !(data.explanation && data.allEmpty)) html += `<div class="result-visibility">${escapeHtml(data.visibility)}</div>`;

    // Star every ticket the answer lists, or all of one type
    html += starAllHtml(answerTicketNumbers(data));

    // Offer the same tables as a download in any of the export formats, and,
    // while a chart is showing, a picture of it (also placed in PDF, Word and Excel)
    const tables = data.rowsDropped ? [] : buildExportTables(data);
    if (tables.length) {
        html += downloadBarHtml(registerExport({
            title: data.message || 'One Touch results',
            question: userPromptText,
            tables,
            picture: answer.model ? () => answerPicture(answer) : undefined,
        }), 'Download as', { pictures: Boolean(answer.model) });
    }

    const answerId = appendMessage('ai-msg wide', html + answerTimingHtml(seconds, data.fromCache, data.offline));
    const answerEl = document.getElementById(answerId);
    answerEl._answer = answer;
    paintPictureOptions(answerEl);

    // Parent / child tickets and others linked to the ones in this answer, under it
    const primary = answerTicketNumbers(data);
    if (primary.length) showRelated(answerEl, primary, !replay);

    // The tickets in this answer pop up in Ticket results on Home
    if (!replay && data.shownTickets && data.shownTickets.length) ticketsShown(data.shownTickets);
}

// =====================================================================
// PROGRESS: what the server is doing with the question, step by step
// =====================================================================

// [while it runs, once it's done]
const QUERY_STEPS = {
    sending: ['Sending your question…', 'Sent your question'],
    understanding: ['Understanding your question…', 'Understood your question'],
    cached: ['Asked before: reusing that answer…', 'Reused the earlier answer (no AI wait)'],
    querying: ['Getting the data…', 'Got the data'],
    explaining: ['Nothing matched; working out why…', 'Worked out why'],
};

// A chat bubble listing finished steps (with how long each took) and the
// current one with a running clock. finish() removes it and returns the total seconds.
function startQueryProgress() {
    const started = performance.now();
    const steps = []; // { stage, at }
    const id = appendMessage('ai-msg query-progress', '');
    const bubble = document.getElementById(id);
    const secs = ms => `${(ms / 1000).toFixed(1)} s`;

    function render() {
        const now = performance.now();
        bubble.innerHTML = steps.map((s, i) => {
            const end = steps[i + 1] ? steps[i + 1].at : now;
            return i < steps.length - 1
                ? `<div class="progress-done">✓ ${escapeHtml(QUERY_STEPS[s.stage][1])} <span class="progress-time">${secs(end - s.at)}</span></div>`
                : `<div class="progress-current">${escapeHtml(QUERY_STEPS[s.stage][0])} <span class="progress-time">${secs(now - started)}</span></div>`;
        }).join('');
    }

    function step(stage) {
        if (!QUERY_STEPS[stage] || steps.some(s => s.stage === stage)) return;
        steps.push({ stage, at: performance.now() });
        render();
    }

    step('sending');
    const timer = setInterval(render, 100);
    return {
        step,
        finish() {
            clearInterval(timer);
            bubble.remove();
            updateChatControls();
            return (performance.now() - started) / 1000;
        },
    };
}

// The server's answer: server-sent events, a "progress" event per step and then
// the "result". A refusal before the question starts (e.g. a 400) is plain JSON.
async function readQueryResponse(response, onStep) {
    if (!(response.headers.get('Content-Type') || '').includes('text/event-stream')) {
        return response.json();
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;
    for (;;) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        // Events end with a blank line
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const name = (block.match(/^event: (.*)$/m) || [])[1];
            const data = (block.match(/^data: (.*)$/m) || [])[1];
            if (!data) continue;
            if (name === 'progress') onStep(JSON.parse(data).stage);
            else if (name === 'result') result = JSON.parse(data);
        }
        if (done) break;
    }
    if (!result) throw new Error('The answer was cut off.');
    return result;
}

// "Answered in 2.8 s", or for a repeated question "Answered in 0.2 s …"
// (nothing for a saved answer whose time wasn't kept). offline: the server
// is in DEMO_MODE=offline, which every answer says plainly.
function answerTimingHtml(seconds, fromCache, offline) {
    if (offline) {
        return fromCache
            ? '<div class="result-timing offline">🔌 Offline mode: a saved answer (Claude isn\'t being asked right now)</div>'
            : '<div class="result-timing offline">🔌 Offline mode: only questions asked before can be answered</div>';
    }
    if (seconds == null) return '';
    const time = `${seconds.toFixed(1)} s`;
    return fromCache
        ? `<div class="result-timing">Answered in ${time}: this question was asked before, so the AI step was skipped</div>`
        : `<div class="result-timing">Answered in ${time}</div>`;
}

// Escape text that came from the server or the model before inserting as HTML
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// =====================================================================
// RESULT RENDERING: rows from Cube -> readable table in plain English
// =====================================================================

// What one row of each table is called, for count headers and summaries
const ENTITY_NOUNS = {
    incident: ['incident', 'incidents'],
    change_request: ['change', 'changes'],
    change_approvals: ['change approval', 'change approvals'],
    sc_req_item: ['request', 'requests'],
    ritm_approvals: ['request approval', 'request approvals'],
    sc_task: ['task', 'tasks'],
};

// Column names that read badly when simply title-cased
const COLUMN_LABELS = {
    number: 'Ticket',
    short_description: 'Summary',
    description: 'Full Description',
    assignment_group: 'Assigned Team',
    owner_group: 'Owning Team',
    assigned_to: 'Assigned To',
    opened_by_group: 'Opened By Team',
    configuration_item: 'Server / System',
    contact_type: 'Reported Via',
    reassignment_count: 'Times Reassigned',
    reopen_count: 'Times Reopened',
    caused_by_change: 'Caused By Change',
    was_p1: 'Was Ever P1',
    on_hold_reason: 'On Hold Because',
    close_code: 'Close Result',
    close_notes: 'Close Notes',
    cause_code: 'Cause',
    sub_type: 'Change Category',
    type: 'Change Type',
    planned_start_date: 'Planned Start',
    planned_end_date: 'Planned End',
    planned_start_month: 'Planned Start Month',
    outage: 'Planned Outage',
    sap_impact: 'Affects ERP',
    sap_transport_required: 'ERP Transport Needed',
    process_failure: 'Process Failure',
    plant: 'Plant Change',
    plant_locations: 'Plants Affected',
    item: 'Catalog Item',
    requested_for: 'Requested For',
    opened_by: 'Opened By',
    request: 'Parent Order (REQ)',
    request_item: 'Parent Request (RITM)',
    parent: 'Parent Ticket',
    parent_incident: 'Parent Incident',
    problem: 'Problem Record',
    sla_flag: 'SLA Breached',
    active: 'Still Active',
    fulfilled_time: 'Fulfilled',
    kb_article: 'Knowledge Article',
    created_day: 'Day Created',
    created_week: 'Week Created',
    created_month: 'Month Created',
    opened_day: 'Day Opened',
    opened_week: 'Week Opened',
    opened_month: 'Month Opened',
    resolved_day: 'Day Resolved',
    resolved_month: 'Month Resolved',
    closed_day: 'Day Closed',
    closed_month: 'Month Closed',
};

// Columns whose values are long free text: shortened in tables, full on hover
const LONG_TEXT = new Set(['short_description', 'description', 'close_notes', 'work_notes',
    'comments_and_work_notes', 'additional_comments', 'change_plan', 'backout_plan',
    'verification_plan', 'purpose_of_change', 'approval_history']);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

function splitMember(member) {
    const dot = member.indexOf('.');
    return { cube: member.slice(0, dot), column: member.slice(dot + 1) };
}

function columnLabel(member) {
    const { cube, column } = splitMember(member);
    if (column === 'count') {
        const noun = (ENTITY_NOUNS[cube] || ['record', 'records'])[1];
        return `Number of ${noun[0].toUpperCase()}${noun.slice(1)}`;
    }
    if (COLUMN_LABELS[column]) return COLUMN_LABELS[column];
    return column.split('_')
        .map(w => ['sla', 'sap', 'ci', 'kb', 'id'].includes(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))
        .join(' ');
}

function formatValue(member, raw) {
    const { column } = splitMember(member);
    if (raw === null || raw === undefined || raw === '') return '—';
    const v = String(raw);

    if (column === 'count') return Number(v).toLocaleString();
    if (v === 'true') return 'Yes';
    if (v === 'false') return 'No';

    // "2026-08-14 08:44:55" -> "Aug 14, 2026, 8:44 AM"
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    if (m) {
        const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    // "2026-08-14" -> "Aug 14, 2026"
    m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    // "2026-08" -> "August 2026"
    m = v.match(/^(\d{4})-(\d{2})$/);
    if (m) return `${MONTHS[+m[2] - 1]} ${m[1]}`;
    // "2026-W33" -> "Week 33 of 2026"
    m = v.match(/^(\d{4})-W(\d{2})$/);
    if (m) return `Week ${+m[2]} of ${m[1]}`;

    return v;
}

// One table cell; long text is cut short with the full value on hover.
// A value shown differently from the data's (a date, a count) sorts by the data's.
function cellHtml(member, raw, truncate) {
    const { column } = splitMember(member);
    const text = formatValue(member, raw);
    const isNumber = column === 'count';
    const cls = isNumber ? ' class="num"' : '';
    if (truncate && LONG_TEXT.has(column) && text.length > 120) {
        return `<td${cls} title="${escapeHtml(text)}">${linkTicketsHtml(text.slice(0, 117))}…</td>`;
    }
    const sortAttr = raw !== null && raw !== undefined && String(raw) !== text ? ` data-sort="${escapeHtml(String(raw))}"` : '';
    // A ticket number opens that ticket (its record and family), with a star next to it
    return `<td${cls}${sortAttr}>${answerValueHtml(raw, text)}</td>`;
}

// A value that is a ticket number (a parent, a request, a change…): a link that
// opens that ticket's record and family, and its star. self: the record's own number.
function ticketValueHtml(raw, text, self = null) {
    const value = String(raw ?? '');
    if (/^(INC|CHG|RITM|SCTASK|REQ)\d{7}$/.test(value) && value !== self) {
        return `<button type="button" class="ticket-link" data-ticket="${escapeHtml(value)}" title="Open ${escapeHtml(value)}: its record and family">${escapeHtml(text)}</button>${starFor(raw)}`;
    }
    return `${escapeHtml(text)}${starFor(raw)}`;
}

// Text in the chat (a question someone typed, or Claude's answer), with every full
// ticket number in it, in any case ("inc0012345"), a button that opens that ticket
const TICKET_IN_TEXT = /\b(INC|CHG|RITM|SCTASK|REQ)\d{7}\b/gi;
function linkTicketsHtml(text) {
    return escapeHtml(text).replace(TICKET_IN_TEXT, typed => {
        const number = typed.toUpperCase();
        return `<button type="button" class="ticket-link in-text" data-ticket="${number}" title="Open ${number}: its record and family">${typed}</button>`;
    });
}

// A cell of an answer's table: a ticket number links (with its star) as above;
// text that mentions ticket numbers ("Duplicate of INC2400123") links each of them
function answerValueHtml(raw, text) {
    return OPENABLE.test(String(raw ?? '')) ? ticketValueHtml(raw, text) : linkTicketsHtml(text);
}

function renderResults(rows, entity) {
    if (!rows.length) {
        return `<p class="result-empty">No matching records were found for that question.</p>`;
    }
    const columns = Object.keys(rows[0]);
    const [singular, plural] = ENTITY_NOUNS[entity] || ['record', 'records'];

    // A single number ("how many open P1s") reads best as a sentence
    if (rows.length === 1 && columns.length === 1 && columns[0].endsWith('.count')) {
        const n = Number(rows[0][columns[0]]);
        return `<div class="result-big">${n.toLocaleString()} <span>${n === 1 ? singular : plural}</span></div>`;
    }

    // A single record with many fields (ticket lookup) reads best as a field/value card
    if (rows.length === 1 && columns.length > 4) {
        const body = columns.map(c => {
            const { column } = splitMember(c);
            const text = formatValue(c, rows[0][c]);
            const cls = LONG_TEXT.has(column) ? ' class="long"' : '';
            return `<tr><th>${escapeHtml(columnLabel(c))}</th><td${cls}>${answerValueHtml(rows[0][c], text)}</td></tr>`;
        }).join('');
        return `<div class="table-wrap"><table class="result-table detail"><tbody>${body}</tbody></table></div>`;
    }

    // Everything else: a normal table with a header row, sorted by a click on a
    // heading. A row with a ticket number opens, on click, into that ticket's
    // full record and related tickets.
    const head = columns.map(c => sortHeadHtml('', c, columnLabel(c), c.endsWith('.count') ? 'num' : '')).join('');
    const numberColumn = columns.find(c => c.endsWith('.number'));
    const body = rows.map(r => {
        const number = numberColumn && STARRABLE.test(String(r[numberColumn])) ? String(r[numberColumn]) : null;
        if (!number) return `<tr>${columns.map(c => cellHtml(c, r[c], true)).join('')}</tr>`;
        const cells = columns.map(c => c === numberColumn
            ? `<td class="ticket-cell" data-sort="${escapeHtml(number)}"><span class="expand-caret" aria-hidden="true">▸</span>${escapeHtml(number)}${starButtonHtml(number)}</td>`
            : cellHtml(c, r[c], true)).join('');
        return `<tr class="expandable" data-expand="${escapeHtml(number)}" tabindex="0" aria-expanded="false"` +
            ` title="Click to see ${escapeHtml(number)}'s full record and related tickets">${cells}</tr>`;
    }).join('');
    const caption = `${rows.length.toLocaleString()} ${rows.length === 1 ? 'row' : 'rows'}`;
    // A list of tickets can be looked up by any of its columns (lookup.js)
    const bar = numberColumn && rows.length >= 2 ? lookupBarHtml('', columns.map(columnLabel)) : '';

    return `<div class="result-caption">${caption}</div>` + bar +
        `<div class="table-wrap"><table class="result-table" data-sort-list=""><thead><tr>${head}</tr></thead>` +
        `<tbody>${body}</tbody></table></div>`;
}

function nounFor(entity, n) {
    const [singular, plural] = ENTITY_NOUNS[entity] || ['record', 'records'];
    return n === 1 ? singular : plural;
}

function capitalize(s) {
    return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// =====================================================================
// AI ANSWERS AS CHARTS: an answer that counts one ticket type by one thing
// (or compares ticket types) can be shown as columns, bars, a line, a donut
// and back to the table. One that is exactly a chart (chartable from the
// server) can be saved to Home or a dashboard, and a click on its chart
// lists the tickets behind a bar or slice.
// =====================================================================

const ANSWER_VIEW_NAMES = { table: 'Table', bar: 'Columns', hbar: 'Sideways bars', line: 'Line', area: 'Area', donut: 'Donut', stacked: 'Stacked columns' };
const STACKED_ICON = '<rect x="4" y="13" width="5" height="8" rx="1"/><rect x="4" y="6" width="5" height="6" rx="1" opacity="0.5"/><rect x="14" y="9" width="5" height="12" rx="1"/><rect x="14" y="3" width="5" height="5" rx="1" opacity="0.5"/>';
// More than this many categories: the biggest are drawn, the rest add up in a note
const MAX_ANSWER_BARS = 30;

// -> { kind: 'single', chart, data, views, drill } | { kind: 'series', chart, series, views } | null
function answerChartModel(data, question) {
    const title = data.message || question;
    const base = { id: 'answer', title, color: 'accent', size: 'large', status: 'all', filters: [], dates: { preset: 'all' } };
    const rows = data.results || [];
    // One ticket type counted by one field
    if (!data.combined && data.entity !== 'multiple' && rows.length >= 2) {
        const columns = Object.keys(rows[0]);
        const counts = columns.filter(c => c.endsWith('.count'));
        const fields = columns.filter(c => !c.endsWith('.count'));
        if (counts.length === 1 && fields.length === 1) {
            const field = splitMember(fields[0]).column;
            const time = isTimeField(field);
            const list = rows.map(r => ({ value: r[fields[0]] ?? null, count: Number(r[counts[0]]) || 0 }));
            const total = list.reduce((t, r) => t + r.count, 0);
            let other = null;
            if (time) list.sort((a, b) => String(a.value).localeCompare(String(b.value)));
            else if (list.length > MAX_ANSWER_BARS) {
                list.sort((a, b) => b.count - a.count);
                const rest = list.splice(MAX_ANSWER_BARS);
                other = { count: rest.reduce((t, r) => t + r.count, 0), groups: rest.length };
            }
            return {
                kind: 'single',
                chart: { ...base, source: data.entity, groupBy: field, display: time ? 'line' : 'bar', limit: list.length },
                data: { total, rows: list, other },
                views: time ? ['table', 'line', 'area', 'bar'] : ['table', 'bar', 'hbar', 'donut', 'line'],
                drill: data.chartable && !data.chartable.dropped.length ? data.chartable.chart : null,
            };
        }
    }
    const combined = data.combined;
    if (combined && combined.rows.length) {
        const { dimension, entities, totals } = combined;
        const name = e => capitalize(nounFor(e, 2));
        // A total per ticket type
        if (!dimension && entities.length >= 2) {
            return {
                kind: 'single',
                chart: { ...base, source: 'tickets', groupBy: 'ticket_type', display: 'bar', limit: entities.length },
                data: { total: totals.total, rows: entities.map(e => ({ value: name(e), count: totals.counts[e] || 0, slot: ENTITY_SLOTS[e] || 1 })), other: null },
                views: ['table', 'bar', 'hbar', 'donut'],
                drill: null,
            };
        }
        // Ticket types side by side, per week, team, ...
        if (dimension && combined.rows.length >= 2) {
            const time = isTimeField(splitMember(dimension).column);
            const ordered = time ? [...combined.rows].sort((a, b) => String(a.key).localeCompare(String(b.key))) : combined.rows;
            return {
                kind: 'series',
                time,
                chart: { ...base, groupLabel: columnLabel(dimension) },
                series: {
                    categories: ordered.map(r => ({ value: r.key, label: time ? periodLabel(dimension, r.key) : formatValue(dimension, r.key) })),
                    series: entities.map(e => ({ name: name(e), slot: ENTITY_SLOTS[e] || 1, values: ordered.map(r => r.counts[e] || 0) })),
                    total: totals.total,
                },
                views: time ? ['table', 'line', 'bar', 'stacked'] : ['table', 'bar', 'stacked', 'line'],
            };
        }
    }
    return null;
}

function answerViewsHtml(model, chartable) {
    const icon = view => {
        const svg = view === 'stacked' ? STACKED_ICON : (DISPLAY_CHOICES.find(([v]) => v === view) || [])[2] || '';
        return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">${svg}</svg>`;
    };
    const buttons = model.views.map(v => `<button type="button" class="view-btn${v === 'table' ? ' active' : ''}" data-answer-view="${v}" aria-pressed="${v === 'table'}">` +
        `${icon(v)}<span>${ANSWER_VIEW_NAMES[v]}</span></button>`).join('');
    const save = model.kind === 'single' && chartable
        ? '<button type="button" class="view-btn save" data-answer-save title="Put this on Home or one of your dashboards, as a chart that stays">📌 Save as a chart</button>' : '';
    // While a chart shows: its order (the table sorts by its own headings)
    const order = `<label class="answer-order" hidden>Order <select data-answer-order>` +
        answerOrderChoices(model).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('') + '</select></label>';
    return `<div class="answer-views" role="group" aria-label="Show this answer as"><span class="answer-views-label">Show as</span>${buttons}${save}${order}</div>`;
}

// The orders an answer's chart offers: as the answer had it, or ascending /
// descending by count (or a total, or one ticket type's) or by its groups
function answerOrderChoices(model) {
    const asAnswered = ['', 'As answered'];
    if (model.kind === 'single') return [asAnswered, ...chartOrderChoices(model.chart)];
    const group = model.chart.groupLabel;
    return [
        asAnswered,
        ['total:desc', 'Biggest total first'], ['total:asc', 'Smallest total first'],
        ...(model.time ? [['label:asc', 'Oldest first'], ['label:desc', 'Newest first']] : [['label:asc', `${group}, A to Z`], ['label:desc', `${group}, Z to A`]]),
        ...model.series.series.flatMap((x, k) => [[`s${k}:desc`, `Most ${x.name.toLowerCase()} first`], [`s${k}:asc`, `Fewest ${x.name.toLowerCase()} first`]]),
    ];
}

// The answer's numbers in the order picked for its chart -> { data } or { series }
function orderedAnswer(answer) {
    const model = answer.model;
    const [by, direction] = (answer.order || '').split(':');
    if (model.kind === 'series') return { series: by ? orderSeries(model.series, by, direction) : model.series };
    return { data: by ? { ...model.data, rows: orderChartRows(model.data.rows, by, direction) } : model.data };
}

function setAnswerView(el, view) {
    const answer = el._answer;
    if (!answer?.model || !answer.model.views.includes(view)) return;
    answer.view = view;
    el.querySelectorAll('[data-answer-view]').forEach(b => {
        const on = b.dataset.answerView === view;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
    });
    const box = el.querySelector('.answer-view');
    resizeWatcher.unobserve(box);
    box._drawn = null;
    box._pick = null;
    el.querySelector('.answer-order').hidden = view === 'table';
    if (view === 'table') {
        box.className = 'answer-view';
        box.innerHTML = answer.tablesHtml;
        refreshStarButtons();
    } else {
        box.className = 'answer-view tile-body answer-chart';
        const model = answer.model;
        const ordered = orderedAnswer(answer);
        if (model.kind === 'series') drawSeriesChart(box, model.chart, ordered.series, view);
        else drawChart(box, { ...model.chart, display: view }, ordered.data, false);
        // An answer that is exactly a chart: a click lists the tickets behind a mark
        if (model.drill) box._pick = row => openDrill({ chart: model.drill, value: row ? row.value : null, label: row ? groupLabel(model.drill, row.value, true) : '' });
        box.classList.toggle('drillable', Boolean(box._pick));
        if (model.data?.other) {
            box.insertAdjacentHTML('beforeend', `<p class="chart-note">${escapeHtml(`Showing the biggest ${model.data.rows.length}; the other ${model.data.other.groups.toLocaleString()} add up to ${model.data.other.count.toLocaleString()} (all of them are in the table).`)}</p>`);
        }
    }
    paintPictureOptions(el);
}

// The picture of the answer's chart, while one is showing
function answerPicture(answer) {
    if (!answer.model || answer.view === 'table') return null;
    const model = answer.model;
    const subtitle = `Question: ${answer.question}`;
    const ordered = orderedAnswer(answer);
    return model.kind === 'series'
        ? { chart: model.chart, series: ordered.series, display: answer.view, title: model.chart.title, subtitle }
        : { chart: { ...model.chart, display: answer.view }, data: ordered.data, title: model.chart.title, subtitle };
}

// "📌 Save as a chart": the chart builder, filled in from the answer, saving to Home or a dashboard
function saveAnswerChart(el) {
    const answer = el._answer;
    const chartable = answer?.data.chartable;
    if (!chartable) return;
    const display = ['bar', 'hbar', 'line', 'area', 'donut'].includes(answer.view) ? answer.view : chartable.chart.display;
    toggleAssistant(false);
    openBuilder({
        chart: { ...chartable.chart, id: newChartId(), title: '', display },
        note: chartable.dropped.length
            ? `From the answer. Not carried over, because a chart can't hold it: ${chartable.dropped.join('; ')}. The chart counts without it.`
            : 'From the answer: the same numbers. Change anything you like, then choose where to save it.',
        destination: true,
        onSave: saveChartTo,
    });
}

// Counts merged across ticket types (see combineResults in business_logic.mjs)
function renderCombined(combined) {
    const { dimension, entities, rows, totals } = combined;
    if (!rows.length) {
        return `<p class="result-empty">No matching tickets were found for that question.</p>`;
    }

    // No grouping: one row per ticket type, then the grand total
    if (!dimension) {
        const body = entities.map(e =>
            `<tr><td>${escapeHtml(capitalize(nounFor(e, 2)))}</td><td class="num">${(totals.counts[e] || 0).toLocaleString()}</td></tr>`
        ).join('');
        return `<div class="result-big">${totals.total.toLocaleString()} <span>${totals.total === 1 ? 'ticket' : 'tickets'}</span></div>` +
            `<div class="table-wrap"><table class="result-table" data-sort-list=""><thead><tr>${sortHeadHtml('', 'Ticket Type')}${sortHeadHtml('', 'Number of Tickets', 'Number of Tickets', 'num')}</tr></thead>` +
            `<tbody>${body}</tbody><tfoot><tr><td>Total</td><td class="num">${totals.total.toLocaleString()}</td></tr></tfoot></table></div>`;
    }

    // Grouped: the grouping column, one column per ticket type, and a total
    const typeHeads = entities.map(e => sortHeadHtml('', e, capitalize(nounFor(e, 2)), 'num')).join('');
    const head = `${sortHeadHtml('', dimension, columnLabel(dimension))}${typeHeads}${sortHeadHtml('', 'Total', 'Total', 'num')}`;
    const cell = n => `<td class="num">${n ? n.toLocaleString() : '—'}</td>`;
    const body = rows.map(r =>
        `<tr><td data-sort="${escapeHtml(String(r.key ?? ''))}">${escapeHtml(formatValue(dimension, r.key))}</td>${entities.map(e => cell(r.counts[e])).join('')}` +
        `<td class="num total">${r.total.toLocaleString()}</td></tr>`
    ).join('');
    const foot = `<tr><td>Total</td>${entities.map(e => cell(totals.counts[e])).join('')}<td class="num">${totals.total.toLocaleString()}</td></tr>`;

    return `<div class="result-caption">${rows.length.toLocaleString()} ${rows.length === 1 ? 'row' : 'rows'}</div>` +
        `<div class="table-wrap"><table class="result-table" data-sort-list=""><thead><tr>${head}</tr></thead>` +
        `<tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>`;
}

// =====================================================================
// DOWNLOADS: the tables above -> PDF, Word, Excel, CSV, text, RTF or an archive
// =====================================================================

// Download payloads waiting for a click, keyed by the id of their download bar
const exportPayloads = new Map();
let exportCounter = 0;

function registerExport(payload) {
    const id = 'export-' + (++exportCounter);
    exportPayloads.set(id, payload);
    return id;
}

// Downloads whose bar is gone (chat cleared, a newer search) are dropped
function forgetRemovedExports() {
    for (const id of exportPayloads.keys()) {
        if (!document.getElementById(id)) exportPayloads.delete(id);
    }
}

// Values as the user reads them, except counts stay real numbers so
// spreadsheets can sum them, and empty cells stay empty instead of "—"
function exportValue(member, raw) {
    if (raw === null || raw === undefined || raw === '') return '';
    if (splitMember(member).column === 'count') return Number(raw);
    return formatValue(member, raw);
}

// One result table in the export shape (mirrors renderResults, without truncation)
function exportTableFromRows(rows, title) {
    if (!rows || !rows.length) return null;
    const columns = Object.keys(rows[0]);

    // A single record is shown as a field/value card, so export it that way too
    if (rows.length === 1 && columns.length > 4) {
        return {
            title,
            columns: [{ label: 'Field' }, { label: 'Value' }],
            rows: columns.map(c => [columnLabel(c), String(exportValue(c, rows[0][c]))]),
            footer: null,
        };
    }
    return {
        title,
        columns: columns.map(c => ({ label: columnLabel(c), num: c.endsWith('.count') })),
        rows: rows.map(r => columns.map(c => exportValue(c, r[c]))),
        footer: null,
    };
}

// Mirrors renderCombined: one column per ticket type plus a total
function exportTableFromCombined(combined) {
    const { dimension, entities, rows, totals } = combined;
    if (!rows.length) return null;
    const typeLabel = e => capitalize(nounFor(e, 2));

    if (!dimension) {
        return {
            title: null,
            columns: [{ label: 'Ticket Type' }, { label: 'Number of Tickets', num: true }],
            rows: entities.map(e => [typeLabel(e), totals.counts[e] || 0]),
            footer: ['Total', totals.total],
        };
    }
    return {
        title: null,
        columns: [
            { label: columnLabel(dimension) },
            ...entities.map(e => ({ label: typeLabel(e), num: true })),
            { label: 'Total', num: true },
        ],
        rows: rows.map(r => [formatValue(dimension, r.key), ...entities.map(e => r.counts[e] || 0), r.total]),
        footer: ['Total', ...entities.map(e => totals.counts[e] || 0), totals.total],
    };
}

// Every kind of answer downloads: its tables, why something was empty, and how
// the question was read (notes: kept out of CSV files that have data). A
// text-only answer (a question back, or something the data can't answer)
// downloads as its text.
function buildExportTables(data, textAnswer = null) {
    let tables;
    if (textAnswer) {
        tables = [noteTable('Answer', 'Answer', [textAnswer])];
    } else if (data.combined) {
        tables = [exportTableFromCombined(data.combined)];
    } else if (data.sections && data.sections.length > 1) {
        tables = data.sections.map(s => exportTableFromRows(s.rows, capitalize(nounFor(s.entity, 2))));
    } else {
        tables = [exportTableFromRows(data.results || [], null)];
    }
    tables = tables.filter(Boolean);
    if (data.restricted) tables.push(noteTable('Not the full report', 'Permissions', [data.restricted]));
    if (data.explanation) {
        tables.push(noteTable(data.allEmpty ? 'Why nothing was found' : 'Why some of it is empty', 'Explanation', [data.explanation]));
    }
    if (data.assumptions && data.assumptions.length) {
        tables.push(noteTable('How I read your question', 'Assumption', data.assumptions));
    }
    return tables;
}

function noteTable(title, label, lines) {
    return { title, note: true, columns: [{ label }], rows: lines.map(l => [String(l)]), footer: null };
}

const EXPORT_OPTIONS = [
    ['Documents', [
        ['xlsx', 'Excel (.xlsx)'],
        ['csv', 'CSV (.csv)'],
        ['pdf', 'PDF (.pdf)'],
        ['docx', 'Word (.docx)'],
        ['rtf', 'Rich Text (.rtf)'],
        ['txt', 'Plain Text (.txt)'],
    ]],
    ['Archives (all formats above in one file)', [
        ['zip', 'ZIP (.zip)'],
        ['7z', '7-Zip (.7z)'],
    ]],
];

// Pictures of the chart (drawn in the browser by charts.js)
const PICTURE_FORMATS = ['png', 'svg'];
const PICTURE_OPTIONS = ['Picture of the chart', [['png', 'Picture (.png)'], ['svg', 'Picture, any size (.svg)']]];
// Formats that also carry the chart picture, when a chart is showing
const FORMATS_WITH_PICTURE = ['pdf', 'docx', 'xlsx', 'rtf', 'zip', '7z'];

// pictures: the result can be shown as a chart, so offer its picture too
function downloadBarHtml(exportId, label = 'Download as', { pictures = false } = {}) {
    const groups = pictures ? [EXPORT_OPTIONS[0], PICTURE_OPTIONS, ...EXPORT_OPTIONS.slice(1)] : EXPORT_OPTIONS;
    const options = groups.map(([group, items]) =>
        `<optgroup label="${escapeHtml(group)}">` +
        items.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('') +
        `</optgroup>`
    ).join('');
    return `<div class="download-bar" id="${exportId}">` +
        `<label for="${exportId}-format">${escapeHtml(label)}</label>` +
        `<select id="${exportId}-format">${options}</select>` +
        `<button type="button" onclick="downloadExport('${exportId}')">⬇ Download</button>` +
        `<span class="download-status" role="status"></span>` +
        (pictures ? '<span class="download-note" data-picture-note></span>' : '') +
        `</div>`;
}

// The picture choices work while a chart is showing; with the table showing,
// they say how to get one
function paintPictureOptions(container) {
    const bar = container.querySelector(':scope > .download-bar, .answer-download .download-bar, .tile-download .download-bar') || container.querySelector('.download-bar');
    if (!bar) return;
    const payload = exportPayloads.get(bar.id);
    const on = Boolean(payload?.picture?.());
    bar.querySelectorAll('option').forEach(o => {
        if (!PICTURE_FORMATS.includes(o.value)) return;
        o.disabled = !on;
        o.textContent = (o.value === 'png' ? 'Picture (.png)' : 'Picture, any size (.svg)') + (on ? '' : ' — show a chart first');
    });
    const select = bar.querySelector('select');
    if (!on && PICTURE_FORMATS.includes(select.value)) select.value = 'xlsx';
    const note = bar.querySelector('[data-picture-note]');
    if (note) note.textContent = on ? 'PDF, Word, Excel, RTF and archives include the chart.' : '';
}

// "one-touch-how-many-open-incidents-2026-10-22", like the server's file names
function pictureFileName(payload) {
    const slug = String(payload.question || payload.title || 'chart').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'chart';
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `one-touch-${slug}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function downloadExport(exportId) {
    const payload = exportPayloads.get(exportId);
    const bar = document.getElementById(exportId);
    if (!payload || !bar) return;

    const format = bar.querySelector('select').value;
    const button = bar.querySelector('button');
    const status = bar.querySelector('.download-status');
    button.disabled = true;
    status.className = 'download-status';
    status.textContent = `Preparing ${format.toUpperCase()} file…`;

    try {
        // The chart on screen, if any: its picture is drawn here, in the browser
        const picture = payload.picture ? payload.picture() : null;
        if (PICTURE_FORMATS.includes(format)) {
            if (!picture) throw new Error('Show the answer as a chart first, then download its picture.');
            status.textContent = `Downloaded ${await downloadPicture(picture, format, pictureFileName(payload))}`;
            return;
        }
        const chart = picture && FORMATS_WITH_PICTURE.includes(format) ? await picturePng(chartPicture(picture)) : null;
        const response = await fetch(`${API_BASE}/api/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            // The browser's time zone: the file's "Generated" time and date use it
            body: JSON.stringify({ ...payload, format, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, chart }),
        });
        if (handleUnauthorized(response)) {
            status.textContent = '';
            return;
        }
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `The server answered ${response.status}.`);
        }

        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="?([^";]+)"?/);
        const fileName = match ? match[1] : `one-touch-export.${format}`;

        // Hand the file to the browser through a temporary link
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        status.textContent = `Downloaded ${fileName}`;
    } catch (err) {
        status.className = 'download-status error';
        status.textContent = `${err.message}`;
        console.error(err);
    } finally {
        button.disabled = false;
    }
}

// Element Node Builder Helper
let messageCounter = 0;
function appendMessage(cssClass, text) {
    const chatLog = document.getElementById('chat-log');
    const msgBlock = document.createElement('div');
    // A counter, not Date.now(): two messages added in the same millisecond
    // would share an id and the loading bubble could remove the wrong one
    const uniqueId = 'msg-' + (++messageCounter);
    
    msgBlock.id = uniqueId;
    msgBlock.className = `msg ${cssClass}`;
    msgBlock.innerHTML = text;
    
    chatLog.appendChild(msgBlock);
    chatLog.scrollTop = chatLog.scrollHeight; // Keep log automatically scrolled to bottom
    updateChatControls();
    return uniqueId;
}

// =====================================================================
// STARRED TICKETS: kept with each person's account on the server, so they
// follow them to any computer. Any ticket number shown anywhere (search
// results, the assistant's tables, a dashboard record) can be starred.
// =====================================================================

const STARRABLE = /^(INC|CHG|RITM|SCTASK)\d{7}$/;
const starredTickets = new Map(); // number -> when it was starred, newest first
let starsLoading = null;

// Fetches this person's stars (again); everything already on screen is repainted
function loadStars() {
    if (!sessionTokenValue) return Promise.resolve();
    if (!starsLoading) {
        const token = sessionTokenValue;
        starsLoading = (async () => {
            try {
                const response = await fetch(`${API_BASE}/api/stars`, { headers: authHeaders() });
                if (handleUnauthorized(response)) return;
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
                if (token !== sessionTokenValue) return; // signed out meanwhile
                starredTickets.clear();
                for (const s of data.stars) starredTickets.set(s.number, s.starredAt);
                refreshStarButtons();
            } catch (err) {
                console.error('Could not load starred tickets:', err);
            } finally {
                starsLoading = null;
            }
        })();
    }
    return starsLoading;
}

function starFace(on, labelled) {
    return (on ? '★' : '☆') + (labelled ? (on ? ' Starred' : ' Star') : '');
}

function starButtonHtml(number, labelled = false) {
    const on = starredTickets.has(number);
    const label = `${on ? 'Unstar' : 'Star'} ${number}`;
    return `<button type="button" class="star-btn${labelled ? ' labelled' : ''}${on ? ' on' : ''}" data-star="${escapeHtml(number)}"` +
        ` aria-pressed="${on}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${starFace(on, labelled)}</button>`;
}

// A star after a value, if the value is a ticket number
function starFor(raw) {
    const value = String(raw ?? '');
    return STARRABLE.test(value) ? starButtonHtml(value) : '';
}

function paintStar(button) {
    const number = button.dataset.star;
    const on = starredTickets.has(number);
    const label = `${on ? 'Unstar' : 'Star'} ${number}`;
    button.textContent = starFace(on, button.classList.contains('labelled'));
    button.classList.toggle('on', on);
    button.setAttribute('aria-pressed', String(on));
    button.title = label;
    button.setAttribute('aria-label', label);
}

function refreshStarButtons() {
    document.querySelectorAll('.star-btn[data-star]').forEach(paintStar);
    document.querySelectorAll('.star-many').forEach(paintStarMany);
    document.getElementById('star-count').textContent = starredTickets.size.toLocaleString();
}

// ---------------------------------------------------------------------
// "Star all": every ticket in a list, or all of one type in it
// ---------------------------------------------------------------------

const KIND_NOUNS = { INC: ['incident', 'incidents'], CHG: ['change', 'changes'], RITM: ['request', 'requests'], SCTASK: ['catalog task', 'catalog tasks'] };
const kindOf = number => (number.match(/^[A-Z]+/) || [''])[0];

// The bar: "★ Star all 30 tickets", then one button per type when the list mixes
// types. Nothing for fewer than two tickets (each row has its own star).
function starAllHtml(numbers) {
    const list = [...new Set(numbers)].filter(n => STARRABLE.test(n));
    if (list.length < 2) return '';
    const byKind = new Map();
    for (const n of list) {
        if (!byKind.has(kindOf(n))) byKind.set(kindOf(n), []);
        byKind.get(kindOf(n)).push(n);
    }
    const buttons = [starManyButtonHtml(list, byKind.size === 1 ? kindOf(list[0]) : '')];
    if (byKind.size > 1) for (const [kind, nums] of byKind) buttons.push(starManyButtonHtml(nums, kind));
    return `<div class="star-all-bar">${buttons.join('')}</div>`;
}

// "28 changes", "1 incident", "30 tickets"
function starManyWhat(numbers, kind) {
    const nouns = KIND_NOUNS[kind] || ['ticket', 'tickets'];
    return `${numbers.length.toLocaleString()} ${nouns[numbers.length === 1 ? 0 : 1]}`;
}

// "★ Star all 28 changes", or once they all are, "✓ 28 changes starred"
function starManyState(numbers, kind) {
    const what = starManyWhat(numbers, kind);
    const done = numbers.every(n => starredTickets.has(n));
    return { done, text: done ? `✓ ${what} starred` : (numbers.length === 1 ? `★ Star ${what}` : `★ Star all ${what}`) };
}

// The numbers are ticket numbers (checked by starAllHtml), so they need no escaping
function starManyButtonHtml(numbers, kind) {
    const s = starManyState(numbers, kind);
    return `<button type="button" class="star-many" data-star-many="${numbers.join(',')}" data-kind="${kind}"${s.done ? ' disabled' : ''}>${escapeHtml(s.text)}</button>`;
}

function paintStarMany(button) {
    const s = starManyState(button.dataset.starMany.split(','), button.dataset.kind);
    button.textContent = s.text;
    button.disabled = s.done;
}

// Stars them in one request; the screen changes at once, and back if the server says no
async function starMany(numbers, what) {
    const toAdd = numbers.filter(n => STARRABLE.test(n) && !starredTickets.has(n));
    if (!toAdd.length) return;
    const now = new Date().toISOString();
    for (const n of toAdd) starredTickets.set(n, now);
    refreshStarButtons();
    try {
        const response = await fetch(`${API_BASE}/api/stars`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ numbers: toAdd }),
        });
        if (handleUnauthorized(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        const starred = new Set(data.starred);
        const leftOut = toAdd.filter(n => !starred.has(n));
        for (const n of leftOut) starredTickets.delete(n);
        refreshStarButtons();
        showToast(leftOut.length
            ? `Starred ${(toAdd.length - leftOut.length).toLocaleString()}; ${leftOut.length.toLocaleString()} more would pass the limit of 2,000 starred tickets. Unstar some first.`
            : `Starred ${what}`);
    } catch (err) {
        for (const n of toAdd) starredTickets.delete(n);
        refreshStarButtons();
        showToast(`${err.message}`, 'error');
    }
}

// The tickets an AI answer is about: its ticket-number column, not related
// numbers in other columns (e.g. a task's parent request)
function answerTicketNumbers(data) {
    const sections = data.sections && data.sections.length ? data.sections : [{ rows: data.results || [] }];
    const numbers = [];
    for (const s of sections) {
        for (const row of s.rows) {
            for (const [member, value] of Object.entries(row)) {
                if (member.endsWith('.number') && STARRABLE.test(String(value))) numbers.push(String(value));
            }
        }
    }
    return numbers;
}

// Changes on screen at once, and back again if the server says no
async function setStarred(number, on) {
    if (!STARRABLE.test(number) || starredTickets.has(number) === on) return true;
    const before = starredTickets.get(number);
    if (on) starredTickets.set(number, new Date().toISOString());
    else starredTickets.delete(number);
    refreshStarButtons();
    try {
        const response = await fetch(`${API_BASE}/api/stars/${encodeURIComponent(number)}`, {
            method: on ? 'PUT' : 'DELETE',
            headers: authHeaders(),
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `The server answered ${response.status}.`);
        }
        return true;
    } catch (err) {
        if (on) starredTickets.delete(number);
        else starredTickets.set(number, before);
        refreshStarButtons();
        showToast(`${err.message}`, 'error');
        return false;
    }
}

// A short message at the bottom of the screen; kind 'error' marks it as a failure
let toastTimer = null;
function showToast(message, kind) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        toast.setAttribute('role', 'status');
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    const isError = kind === 'error';
    toast.classList.toggle('toast-error', isError);
    toast.setAttribute('role', isError ? 'alert' : 'status');
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
}

// =====================================================================
// HOME PAGE: the latest ticket search from the search bar, and your
// starred tickets
// =====================================================================

const HOME_MODES = ['assigned', 'charts', 'families', 'results', 'starred'];
let homeMode = 'assigned';
// Each search bumps its counter, so an older, slower answer can't replace a newer one
const homeRuns = { assigned: 0, charts: 0, families: 0, results: 0, starred: 0 };
// "Team families" (family KPIs) is for project managers and admins
const canSeeFamilies = () => Boolean(currentAccess.admin || currentAccess.role === 'project_manager');

// The list each person had open last, remembered in this browser. (A new
// name when "Assigned to me" arrived, so everyone opens on it once.)
function homeModeKey() {
    return `onetouch-home-tab:${currentUsername}`;
}
function rememberedHomeMode() {
    try { return localStorage.getItem(homeModeKey()) || 'assigned'; } catch { return 'assigned'; }
}

// Loads the list that's showing (quiet: without a "Loading…")
function showHomeMode(quiet = false) {
    if (homeMode === 'starred') return showStarred(quiet);
    if (homeMode === 'assigned') return showAssigned(quiet);
    if (homeMode === 'charts') return showMyCharts(quiet);
    if (homeMode === 'families') return showFamilyKpis(quiet);
    return showTicketResults(quiet);
}

// Shows one of Home's lists and loads it (quiet: refresh it without a "Loading…").
// keepDrill: a bar of My charts was clicked, so Assigned to me shows only its tickets
// (until Home's lists are switched again)
function setHomeMode(mode, quiet = false, { keepDrill = false } = {}) {
    const wanted = mode;
    if (!HOME_MODES.includes(mode) || (mode === 'families' && !canSeeFamilies())) mode = 'assigned';
    if (!keepDrill) assignedView.drill = null;
    homeMode = mode;
    document.querySelectorAll('.home-mode').forEach(b => {
        const on = b.dataset.mode === mode;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
    });
    for (const m of HOME_MODES) document.getElementById(`home-${m}`).hidden = m !== mode;
    // Not remembered when it fell back: a project manager's "Team families" is
    // asked for again once their access has loaded
    if (currentUsername && mode === wanted) {
        try { localStorage.setItem(homeModeKey(), mode); } catch { /* not remembered; that's fine */ }
    }
    showHomeMode(quiet);
}

// Signing out leaves nothing of this person's on the page
function resetHome() {
    for (const m of HOME_MODES) homeRuns[m] += 1;
    selections.results.clear();
    selections.starred.clear();
    latestShown = new Set();
    openedRecord = null;
    resetSorts();
    resetLookups();
    Object.assign(assignedView, { tickets: null, status: 'open', page: 0, drill: null });
    paintAssignedCount();
    document.getElementById('assigned-result').innerHTML = '';
    myChartsView.status = null;
    document.getElementById('my-charts-result').innerHTML = '';
    Object.assign(teamFamiliesView, { teamId: null, teams: null, status: 'open', linked: true, offset: 0, data: null });
    document.getElementById('kpi-families-count').hidden = true;
    document.getElementById('kpi-families-result').innerHTML = '';
    document.getElementById('ticket-results').innerHTML = NO_TICKET_RESULTS_HTML;
    document.getElementById('starred-result').innerHTML = '';
    starredTickets.clear();
    refreshStarButtons();
    setHomeMode('assigned');
    forgetRemovedExports();
}

// -> { found, notFound, noAccess (the not-found ones that are someone else's),
// ignored, tooMany, record? }, or null if the session ended
async function searchTickets(text, record = false) {
    const response = await fetch(`${API_BASE}/api/tickets/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ text, record }),
    });
    if (handleUnauthorized(response)) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
    return data;
}

// The columns of every ticket list; the getters give the text people read
const TICKET_COLUMNS = [
    ['Ticket', t => t.number],
    ['Type', t => t.type],
    ['Summary', t => t.summary],
    ['State', t => t.state],
    ['Priority / Risk', t => t.level],
    ['Team', t => t.team],
    ['Assigned To / Requested For', t => t.person],
    ['Opened', t => t.opened ? formatValue('ticket.opened', t.opened) : ''],
];
const STARRED_COLUMN = ['Starred', t => formatStarredAt(starredTickets.get(t.number))];

// What a column sorts by where that isn't the text people read (sorting.js):
// dates as the data writes them, Priority / Risk by how urgent, a family by
// its size, KPIs by how much needs attention
const TICKET_SORT_VALUES = {
    Ticket: t => t.number,
    Parent: t => t.parent || '',
    'Priority / Risk': t => (t.level ? levelRank(t) : ''),
    Opened: t => t.opened || '',
    Shown: t => t.shownAt || '',
    Starred: t => starredTickets.get(t.number) || '',
    Family: t => Math.max(0, ...(t.families || []).map(f => f.size)) || '',
    'Assigned to': t => t.assignee || '',
    KPIs: t => (t.kpis ? kpiAttention(t.kpis.map(k => k.tone)) : t.attention ?? ''),
};
const ticketSortValue = ([label, get]) => TICKET_SORT_VALUES[label] || get;
// Columns of buttons, with nothing to sort by or look up
const UNSORTED_COLUMNS = new Set(['Tell your project manager']);

// What a list shows where a ticket has nothing, so no cell is left blank, and
// (on hover) why. tickets.mjs blankText gives the server the same words.
const BLANK_WHY = {
    'No priority': 'Requests and catalog tasks have no priority or risk in ServiceNow',
    'No team (no catalog tasks)': 'A request\'s team is the team doing its catalog tasks, and this request has none',
    'Not assigned': 'Nobody was assigned this ticket in ServiceNow',
    'No parent': 'This ticket has no parent ticket',
    'Not linked': 'This ticket isn\'t linked to any other ticket',
    'No summary': 'The export has no summary for this ticket',
    'No KPIs': 'None of the KPIs apply to this ticket',
    'Not recorded': 'The export has nothing here for this ticket',
};
function blankText(label, t) {
    if (t.missing) return '';
    const requestOrTask = t.kind === 'RITM' || t.kind === 'SCTASK';
    if (label === 'Priority / Risk') return requestOrTask ? 'No priority' : 'Not recorded';
    if (label === 'Team') return t.kind === 'RITM' ? 'No team (no catalog tasks)' : 'Not recorded';
    if (label === 'Assigned To / Requested For') return t.kind === 'INC' || t.kind === 'SCTASK' ? 'Not assigned' : 'Not recorded';
    if (label === 'Summary') return 'No summary';
    if (label === 'Parent') return 'No parent';
    if (label === 'Family') return 'Not linked';
    if (label === 'KPIs') return 'No KPIs';
    return 'Not recorded';
}
function blankHtml(label, t) {
    const text = blankText(label, t);
    return text ? `<span class="blank" title="${escapeHtml(BLANK_WHY[text] || '')}">${escapeHtml(text)}</span>` : '—';
}

// What a ticket's column shows, for looking it up (lookup.js): its text (or what
// shows in its place), a date as the data writes it too, its KPIs' words
function ticketLookupText([label, get], t) {
    if (label === 'KPIs') return t.kpis ? t.kpis.map(k => `${k.label} ${k.value}`).join(' · ') : t.kpiText || blankText(label, t);
    const text = String(get(t) || '') || blankText(label, t);
    return label === 'Opened' && t.opened ? `${text} ${t.opened}` : text;
}
// The columns a list can be looked up by
const lookupColumns = columns => columns.filter(([label]) => !UNSORTED_COLUMNS.has(label));

// How urgent a ticket is, as Assigned to me is ordered (tickets.mjs priorityRank):
// an incident's priority, a change's risk; 5 for requests and tasks
function levelRank(t) {
    const kind = t.kind || String(t.number).match(/^[A-Z]+/)?.[0];
    if (kind === 'INC') return Number((/^P([1-4])\b/.exec(t.level) || [])[1]) || 5;
    if (kind === 'CHG') return { High: 2, Medium: 3, Low: 4, Standard: 4 }[t.level] ?? 5;
    return 5;
}

// Each ticket's parent and the families it is in (relations.mjs ticketLinks),
// in Ticket results and Starred tickets. The third item draws the cell: the
// parent and each family's anchor open that ticket's record, with its related tickets.
const OPENABLE = /^(INC|CHG|RITM|SCTASK|REQ)\d{7}$/;
const LINK_COLUMNS = [
    ['Parent', t => t.parent || '', t => (t.parent && OPENABLE.test(t.parent)
        ? `<button type="button" class="ticket-link" data-ticket="${escapeHtml(t.parent)}" title="Open ${escapeHtml(t.parent)}">${escapeHtml(t.parent)}</button>`
        : t.parent ? escapeHtml(t.parent) : blankHtml('Parent', t))],
    ['Family', t => (t.families || []).map(f => `${f.name} (${f.size} ${f.size === 1 ? 'ticket' : 'tickets'})`).join('; '),
        t => ((t.families || []).length ? t.families.map(familyChipHtml).join('') : blankHtml('Family', t))],
];

// "Parent incident INC2400123 · 6": opens the anchor's record and its related tickets
function familyChipHtml(f) {
    const label = escapeHtml(`${f.name} · ${f.size.toLocaleString()}`);
    const size = `${f.size.toLocaleString()} ${f.size === 1 ? 'ticket' : 'tickets'} in this family`;
    return OPENABLE.test(f.anchor)
        ? `<button type="button" class="family-chip" data-ticket="${escapeHtml(f.anchor)}" title="${size}. Click to open ${escapeHtml(f.anchor)} and see the family">${label}</button>`
        : `<span class="family-chip" title="${size}. The problem record itself isn't in this export">${label}</span>`;
}

// The list columns with Parent and Family after the summary
const withLinks = extra => [...TICKET_COLUMNS.slice(0, 3), ...LINK_COLUMNS, ...TICKET_COLUMNS.slice(3), ...extra];

function formatStarredAt(iso) {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime())
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

// Ticket numbers open the ticket; every row has a star. Rows whose number is
// in `highlight` (e.g. the latest answer's tickets) get `highlightClass`.
// select: the list's name ('results', 'starred'): each row gets a checkbox,
// and the header's ticks them all.
// sort: the list's name, so a click on a heading sorts it and the sort stays
// while the page is open (the tickets come in that sort); '': sorts, but
// forgets it when drawn again; false: no sorting (sorting.js)
// lookup: a 🔍 box over a list of two or more, keeping what's typed while the page
// is open under that name ('': forgets it when drawn again); false: no box, for
// a list that looks itself up (lookup.js)
// Every cell shows something: where a ticket has nothing, it says why (blankText).
function ticketTableHtml(tickets, columns = TICKET_COLUMNS, highlight = new Set(), highlightClass = 'fresh', { select = null, rowClass = null, sort = '', lookup = '' } = {}) {
    const sortable = sort !== false;
    if (sort) tickets = sortedTickets(tickets, sort, columns, ticketSortValue);
    const bar = lookup !== false && tickets.length >= 2 ? lookupBarHtml(lookup, lookupColumns(columns).map(([label]) => label)) : '';
    const head = (select ? `<th class="select-cell"><input type="checkbox" class="select-all" data-select-list="${select}" aria-label="Select all"></th>` : '') +
        columns.map(([label]) => (sortable && !UNSORTED_COLUMNS.has(label) ? sortHeadHtml(sort, label) : `<th>${escapeHtml(label)}</th>`)).join('');
    const body = tickets.map((t, i) => {
        const cls = [highlight.has(t.number) ? highlightClass : '', needsAttention(t) ? 'attention' : '', rowClass ? rowClass(t, i) : ''].filter(Boolean).join(' ');
        return (cls ? `<tr class="${cls}">` : '<tr>') +
        (select ? `<td class="select-cell"><input type="checkbox" class="row-select" data-select-list="${select}" value="${escapeHtml(t.number)}" aria-label="Select ${escapeHtml(t.number)}"></td>` : '') +
        columns.map(([label, get, html], i) => {
        const by = sortable && TICKET_SORT_VALUES[label];
        const sortAttr = by ? ` data-sort="${escapeHtml(String(by(t) ?? ''))}"` : '';
        if (i === 0) {
            return `<td class="ticket-cell"${sortAttr}><button type="button" class="ticket-link" data-ticket="${escapeHtml(t.number)}"` +
                ` title="Open ${escapeHtml(t.number)}">${escapeHtml(t.number)}</button>${starButtonHtml(t.number)}${attentionFlagsHtml(t)}</td>`;
        }
        if (html) return `<td class="${label === 'Family' ? 'family-cell' : label === 'KPIs' ? 'kpi-cell' : 'parent-cell'}"${sortAttr}>${html(t)}</td>`;
        const text = String(get(t) || '');
        // Empty sorts last, whatever it says in its place
        if (!text) return `<td data-sort="">${blankHtml(label, t)}</td>`;
        if (label === 'Summary' && text.length > 120) {
            return `<td title="${escapeHtml(text)}">${escapeHtml(text.slice(0, 117))}…</td>`;
        }
        return `<td${sortAttr}>${escapeHtml(text)}</td>`;
    }).join('') + '</tr>';
    }).join('');
    return bar + `<div class="table-wrap"><table class="result-table"${sortable ? ` data-sort-list="${escapeHtml(sort)}"` : ''}>` +
        `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function ticketDownloadHtml(tickets, title, columns = TICKET_COLUMNS) {
    return downloadBarHtml(registerExport({
        title,
        tables: [{
            title: null,
            columns: columns.map(([label]) => ({ label })),
            rows: tickets.map(t => columns.map(([, get]) => String(get(t) || ''))),
            footer: null,
        }],
    }));
}

// One ticket: its heading, a star, a link to its dashboard record, telling
// your project manager you're done with it (notifications.js), and every field it has
function ticketCardHtml(t, record) {
    // Its Metabase record page (signed for this person, so it shows only their tickets)
    const dashboardButton = RECORD_PAGES[t.kind]
        ? `<button type="button" class="home-action" data-open-dashboard="${escapeHtml(t.number)}">Open in Dashboards ↗</button>` : '';
    let html = `<div class="ticket-head">` +
        `<span class="ticket-type">${escapeHtml(t.type)}</span>` +
        `<span class="ticket-number">${escapeHtml(t.number)}</span>` +
        starButtonHtml(t.number, true) + dashboardButton + reportButtonHtml(t.number) +
        `</div>` +
        (t.summary ? `<div class="ticket-summary">${escapeHtml(t.summary)}</div>` : '') +
        // A summary row below shows them already; a full record has no such row
        (record ? attentionFlagsHtml(t) : '');

    if (!record) return html + ticketTableHtml([t], TICKET_COLUMNS, new Set(), 'fresh', { sort: false }) + ticketDownloadHtml([t], t.number);

    const fields = Object.entries(record.fields);
    const body = fields.map(([member, value]) => {
        const cls = LONG_TEXT.has(splitMember(member).column) ? ' class="long"' : '';
        return `<tr><th>${escapeHtml(columnLabel(member))}</th><td${cls}>${ticketValueHtml(value, formatValue(member, value), t.number)}</td></tr>`;
    }).join('');
    // Its family (parent, children, …) goes above this, once found (showRelated)
    html += '<div class="record-fields"><div class="record-fields-title">Full record</div>';
    html += `<div class="table-wrap tall"><table class="result-table detail"><tbody>${body}</tbody></table></div>`;
    html += downloadBarHtml(registerExport({
        title: `${t.type} ${t.number}`,
        tables: [{
            title: null,
            columns: [{ label: 'Field' }, { label: 'Value' }],
            rows: fields.map(([member, value]) => [columnLabel(member), String(exportValue(member, value))]),
            footer: null,
        }],
    }));
    return html + '</div>';
}


// Runs one search into one result box, showing progress and errors there.
// quiet: keep what's showing until the new content is ready (background refresh).
async function runHomeSearch(mode, outId, work, quiet = false) {
    const run = ++homeRuns[mode];
    const out = document.getElementById(outId);
    if (!quiet) out.innerHTML = '<p class="home-status">Loading…</p>';
    try {
        const html = await work();
        if (run !== homeRuns[mode] || html === null) return;
        out.innerHTML = html;
        applyLookups(out);
    } catch (err) {
        if (run !== homeRuns[mode]) return;
        out.innerHTML = `<p class="home-status error">${escapeHtml(err.message)}</p>`;
        console.error(err);
    }
    forgetRemovedExports();
}

// =====================================================================
// ASSIGNED TO ME: the tickets assigned to this person in OneTouch (by their
// project manager or an admin), highest priority first, then oldest
// (tickets.mjs ticketsByPriority). Open ones to start with; closed or all at
// a click, 50 to a page.
// =====================================================================

const ASSIGNED_PAGE = 50;
const ASSIGNED_STATUSES = [['open', 'Open'], ['attention', 'Needs attention'], ['closed', 'Closed'], ['all', 'All']];
// drill: a bar or slice clicked in "My charts" ({ label, test }): only its tickets
const assignedView = { tickets: null, status: 'open', page: 0, drill: null };
const ASSIGNED_COLUMNS = [
    ['Ticket', t => t.number],
    ['Type', t => t.type],
    ['Summary', t => t.summary],
    ['State', t => t.state],
    ['Priority / Risk', t => t.level],
    ['Opened', t => t.opened ? formatValue('ticket.opened', t.opened) : ''],
];

// The tab's count: how many open tickets are waiting
function paintAssignedCount() {
    const count = document.getElementById('assigned-count');
    const open = assignedView.tickets ? assignedView.tickets.filter(t => t.open).length : 0;
    count.hidden = !assignedView.tickets;
    count.textContent = open.toLocaleString();
    count.title = `${open.toLocaleString()} open`;
}

// The tickets assigned to this person (also what "My charts" draws) -> true, or
// false if the session ended
async function loadAssignedTickets() {
    const token = sessionTokenValue;
    const response = await fetch(`${API_BASE}/api/my-tickets`, { headers: authHeaders() });
    // Signed out (and maybe someone else in) meanwhile: these aren't theirs to show
    if (token !== sessionTokenValue) return false;
    if (handleUnauthorized(response)) return false;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
    assignedView.tickets = data.tickets;
    paintAssignedCount();
    return true;
}

function showAssigned(quiet = false) {
    if (!sessionTokenValue) return;
    return runHomeSearch('assigned', 'assigned-result', async () => ((await loadAssignedTickets()) ? assignedHtml() : null), quiet)
        .then(() => fillTicketKpis(document.getElementById('assigned-result')));
}

function assignedHtml() {
    const all = assignedView.tickets || [];
    if (!all.length) {
        return `<p class="home-status">${currentAccess.team
            ? 'No tickets are assigned to you yet. Your project manager hands them out on the Team tab, and 🔔 tells you when they do.'
            : 'No tickets are assigned to you. You get some once you\'re on a team and your project manager or an admin assigns them to you.'}</p>`;
    }
    const counts = { open: all.filter(t => t.open).length, attention: all.filter(needsAttention).length, all: all.length };
    counts.closed = counts.all - counts.open;
    const { status } = assignedView;
    // Each ticket's KPIs (filled in once the page is drawn, fillTicketKpis; sorted by
    // the server's count of what needs attention); members can tell their project
    // manager they've resolved or closed one (notifications.js)
    const columns = [...ASSIGNED_COLUMNS, KPI_COLUMN,
        ...(canTellManager() ? [['Tell your project manager', () => '', t => reportButtonHtml(t.number, 'Resolved or closed?…')]] : [])];
    const { drill } = assignedView;
    const inStatus = status === 'all' ? all : status === 'attention' ? all.filter(needsAttention) : all.filter(t => t.open === (status === 'open'));
    const listed = drill ? inStatus.filter(drill.test) : inStatus;
    // Looked up and sorted by a heading: all of them, before they're cut into pages
    const matched = lookedUpTickets(listed, 'assigned', lookupColumns(columns), ticketLookupText);
    const shown = sortedTickets(matched, 'assigned', columns, ticketSortValue);
    const pages = Math.max(1, Math.ceil(shown.length / ASSIGNED_PAGE));
    assignedView.page = Math.min(Math.max(assignedView.page, 0), pages - 1);
    const first = assignedView.page * ASSIGNED_PAGE;
    const page = shown.slice(first, first + ASSIGNED_PAGE);

    const filter = '<div class="assigned-filter" role="group" aria-label="Which tickets">' + ASSIGNED_STATUSES.map(([key, label]) =>
        `<button type="button" class="home-action" data-assigned-status="${key}" aria-pressed="${status === key}">${label} (${counts[key].toLocaleString()})</button>`).join('') + '</div>';
    const which = status === 'all' ? '' : status === 'attention' ? 'highlighted ' : `${status} `;
    const sort = listSorts.get('assigned');
    const order = sort
        ? `sorted by ${sort.col}, ${sort.dir === 'asc' ? 'ascending' : 'descending'} (click its heading again to change that). `
        : 'highest priority first, then oldest. Incidents go by priority and changes by risk. Requests and catalog tasks have no priority, so they come after those. ' +
          'Click any heading to sort by it. ';
    const head = '<div class="results-head">' +
        `<p class="home-status">${listed.length.toLocaleString()} ${which}${listed.length === 1 ? 'ticket' : 'tickets'} assigned to you, ${order}</p>` + filter + '</div>' +
        (drill ? `<div class="drill-chip" role="status">Only the ones in <b>${escapeHtml(drill.label)}</b>, from My charts ` +
            '<button type="button" class="home-action" data-assigned-drill-clear>✕ Show them all</button></div>' : '');
    if (!listed.length) {
        return head + `<p class="home-status">${drill ? `None ${which}in ${escapeHtml(drill.label)}.` : status === 'attention' ? 'None of your tickets need attention.' : `None ${status === 'open' ? 'open: you\'re all caught up.' : 'closed yet.'}`}</p>`;
    }
    const bar = lookupBarHtml('assigned', lookupColumns(columns).map(([label]) => label),
        { mode: 'list', count: { shown: shown.length, total: listed.length } });
    if (!shown.length) return head + bar + '<p class="home-status">No tickets match what you typed. Change it, or press Escape in the box to see them all.</p>';

    const pager = pages > 1
        ? `<div class="team-pager"><span>${(first + 1).toLocaleString()}–${(first + page.length).toLocaleString()} of ${shown.length.toLocaleString()}</span>` +
          `<button type="button" class="home-action" data-assigned-page="-1"${assignedView.page ? '' : ' disabled'}>← Previous</button>` +
          `<button type="button" class="home-action" data-assigned-page="1"${assignedView.page < pages - 1 ? '' : ' disabled'}>Next →</button></div>`
        : '';
    return head + bar + ATTENTION_LEGEND_HTML + KPI_LEGEND_HTML + ticketTableHtml(page, columns, new Set(), 'fresh', { sort: 'assigned', lookup: false }) + pager +
        ticketDownloadHtml(shown, `Assigned to me (${status === 'all' ? 'all' : status})`, ASSIGNED_COLUMNS);
}

// Drawn again from what's loaded
function redrawAssigned() {
    const out = document.getElementById('assigned-result');
    out.innerHTML = assignedHtml();
    forgetRemovedExports();
    fillTicketKpis(out);
    return out;
}

// A heading, or a lookup: every ticket sorted or looked through, from the first page
pagedSorts.assigned = () => {
    assignedView.page = 0;
    redrawAssigned();
};
pagedLookups.assigned = pagedSorts.assigned;

// Open / closed / all, the pages, and back from a chart's bar to them all
document.getElementById('assigned-result').addEventListener('click', e => {
    if (e.target.closest('[data-assigned-drill-clear]')) {
        assignedView.drill = null;
        assignedView.page = 0;
        redrawAssigned();
        return;
    }
    const status = e.target.closest('[data-assigned-status]');
    const page = e.target.closest('[data-assigned-page]');
    if (!status && !page) return;
    if (status) {
        assignedView.status = status.dataset.assignedStatus;
        assignedView.page = 0;
    } else {
        assignedView.page += Number(page.dataset.assignedPage);
    }
    const out = redrawAssigned();
    if (page) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// =====================================================================
// MY CHARTS (Home): the tickets assigned to this person, drawn: by type,
// state, priority or risk, how their KPIs look, when they were opened, and
// the ServiceNow team that worked them. Open ones, closed ones or all, from
// the same list as "Assigned to me" (charts.js draws them). A click on a bar
// or slice shows those tickets there.
// =====================================================================

const myChartsView = { status: null }; // null: the open ones if there are any, else all

const KPI_TONES = [['bad', 'Needs attention', 8], ['warn', 'Keep an eye on it', 4], ['good', 'On track', 3]];
// How a ticket's KPIs look, as one word: its worst (kpis.mjs attention: each red counts 100, each amber 1)
function kpiToneOf(t) {
    if (t.attention === null || t.attention === undefined) return 'No KPIs';
    return t.attention >= 100 ? 'Needs attention' : t.attention >= 1 ? 'Keep an eye on it' : 'On track';
}

// "2026-08-14 08:44:55" -> its ISO week, "2026-W33" (charts.js names it by its Monday)
function isoWeekOf(raw) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw || ''));
    if (!m) return '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // that week's Thursday decides its year
    const week = Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Every week (or month, for a long stretch) from the first ticket opened to the
// last, so a quiet one shows as a gap -> { field, periods, of(ticket) }
function openedPeriods(tickets) {
    const days = tickets.map(t => String(t.opened || '').slice(0, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    if (!days.length) return { field: 'opened_week', periods: [], of: () => '' };
    const [first, last] = [days[0], days.at(-1)];
    const weeks = [];
    const [, fy, fw] = isoWeekOf(first).match(/^(\d{4})-W(\d{2})$/);
    const [, ly, lw] = isoWeekOf(last).match(/^(\d{4})-W(\d{2})$/);
    const end = isoWeekMonday(Number(ly), Number(lw));
    for (const d = isoWeekMonday(Number(fy), Number(fw)); d <= end; d.setUTCDate(d.getUTCDate() + 7)) weeks.push(isoWeekOf(d.toISOString()));
    if (weeks.length <= 26) return { field: 'opened_week', periods: weeks, of: t => isoWeekOf(t.opened) };
    const months = [];
    for (let y = Number(first.slice(0, 4)), m = Number(first.slice(5, 7)); `${y}-${String(m).padStart(2, '0')}` <= last.slice(0, 7); m === 12 ? (y += 1, m = 1) : (m += 1)) {
        months.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    return { field: 'opened_month', periods: months, of: t => String(t.opened || '').slice(0, 7) };
}

// Each chart: what it groups the tickets by (value), how it's drawn, its order,
// the colors of its groups, and how the list names its bar when one is clicked
const MY_CHARTS = [
    { key: 'type', title: 'By type', display: 'donut', value: t => t.type, slots: { Incident: 1, Change: 2, Request: 3, 'Catalog task': 4 }, drill: v => `Type: ${v}` },
    { key: 'state', title: 'By state', display: 'hbar', value: t => t.state || 'Not recorded', drill: v => `State: ${v}` },
    { key: 'level', title: 'By priority or risk', display: 'bar', value: t => t.level || blankText('Priority / Risk', t),
        order: (a, b) => a.rank - b.rank || sortCollator.compare(a.value, b.value), drill: v => `Priority or risk: ${v}`,
        sub: 'Incidents have a priority and changes a risk; requests and catalog tasks have neither.' },
    { key: 'kpis', title: 'How their KPIs look', display: 'donut', value: kpiToneOf, drill: v => `KPIs: ${v}`,
        slots: Object.fromEntries(KPI_TONES.map(([, label, slot]) => [label, slot])), order: (a, b) => a.rank - b.rank,
        sub: 'By each ticket\'s worst KPI: red needs attention, amber keep an eye on it, green on track.' },
    { key: 'opened', title: 'When they were opened', display: 'bar', time: true, drill: v => `Opened ${v}` },
    { key: 'team', title: 'By ServiceNow team', display: 'hbar', value: t => t.team || blankText('Team', t), limit: 10, drill: v => `ServiceNow team: ${v}`,
        sub: 'The assignment group that worked each ticket in ServiceNow (a request\'s is the team of its catalog tasks).' },
];

// One chart's numbers, as charts.js draws them: { rows: [{ value, count, slot }], total, other }
function myChartData(def, tickets, periods) {
    const valueOf = def.time ? periods.of : def.value;
    const counts = new Map(def.time ? periods.periods.map(p => [p, 0]) : []);
    const rank = new Map();
    for (const t of tickets) {
        const v = valueOf(t);
        if (!v) continue;
        counts.set(v, (counts.get(v) || 0) + 1);
        if (def.key === 'level') rank.set(v, Math.min(rank.get(v) ?? 9, t.level ? levelRank(t) : 9));
    }
    if (def.key === 'kpis') KPI_TONES.forEach(([, label], i) => rank.set(label, i));
    let rows = [...counts].map(([value, count]) => ({ value, count, rank: rank.get(value) ?? 9, ...(def.slots?.[value] ? { slot: def.slots[value] } : {}) }));
    // Tickets without KPIs: a grey slice
    if (def.key === 'kpis') rows.forEach(r => { if (r.value === 'No KPIs') r.other = true; });
    if (!def.time) rows.sort(def.order || ((a, b) => b.count - a.count || sortCollator.compare(a.value, b.value)));
    let other = null;
    if (def.limit && rows.length > def.limit) {
        const rest = rows.slice(def.limit);
        other = { count: rest.reduce((n, r) => n + r.count, 0), groups: rest.length };
        rows = rows.slice(0, def.limit);
    }
    return { rows, total: tickets.length, other };
}

function myChartsTickets() {
    const all = assignedView.tickets || [];
    if (!myChartsView.status) myChartsView.status = all.some(t => t.open) ? 'open' : 'all';
    const { status } = myChartsView;
    return status === 'all' ? all : all.filter(t => t.open === (status === 'open'));
}

function myChartsHtml() {
    const all = assignedView.tickets || [];
    if (!all.length) {
        return `<p class="home-status">${currentAccess.team
            ? 'No tickets are assigned to you yet, so there is nothing to draw. Your project manager hands them out on the Team tab.'
            : 'No tickets are assigned to you, so there is nothing to draw. You get some once you\'re on a team and your project manager or an admin assigns them to you.'}</p>`;
    }
    const tickets = myChartsTickets();
    const { status } = myChartsView;
    const counts = { open: all.filter(t => t.open).length, all: all.length };
    counts.closed = counts.all - counts.open;
    const filter = '<div class="assigned-filter" role="group" aria-label="Which tickets to draw">' + ASSIGNED_STATUSES.map(([key, label]) =>
        `<button type="button" class="home-action" data-mycharts-status="${key}" aria-pressed="${status === key}">${label} (${counts[key].toLocaleString()})</button>`).join('') + '</div>';
    const which = status === 'all' ? '' : `${status} `;
    const head = '<div class="results-head">' +
        `<p class="home-status">The ${tickets.length.toLocaleString()} ${which}${tickets.length === 1 ? 'ticket' : 'tickets'} assigned to you, in charts. ` +
        'Hover a bar or slice for its numbers, or click it to list those tickets in Assigned to me.</p>' + filter + '</div>';
    if (!tickets.length) return head + `<p class="home-status">None ${status === 'open' ? 'open: you\'re all caught up.' : 'closed yet.'}</p>`;
    return head + '<div class="tile-grid my-charts">' + MY_CHARTS.map(def =>
        `<article class="chart-tile size-medium" data-my-chart="${def.key}">` +
        `<div class="tile-head"><div class="tile-titles"><h3 class="tile-title">${escapeHtml(def.title)}</h3>` +
        (def.sub ? `<p class="tile-sub">${escapeHtml(def.sub)}</p>` : '') + '</div>' +
        '<div class="tile-actions"><button type="button" class="tile-btn" data-my-chart-table aria-pressed="false" title="Show as a table" aria-label="Show as a table">▦</button></div></div>' +
        '<div class="tile-body drillable"></div><p class="chart-note" hidden></p></article>').join('') + '</div>';
}

// Draws each chart into its box (once the boxes are on the page, so they have a width)
function drawMyCharts() {
    const out = document.getElementById('my-charts-result');
    const tickets = myChartsTickets();
    const periods = openedPeriods(tickets);
    for (const tile of out.querySelectorAll('[data-my-chart]')) {
        const def = MY_CHARTS.find(d => d.key === tile.dataset.myChart);
        const chart = { id: `my-${def.key}`, title: def.title, groupBy: def.time ? periods.field : def.key, display: def.display, size: 'medium', color: 'accent' };
        const data = myChartData(def, tickets, periods);
        const body = tile.querySelector('.tile-body');
        drawChart(body, chart, data, tile._asTable || false);
        body._pick = row => row && showMyChartTickets(def, row.value, groupLabel(chart, row.value, true), periods);
        const note = tile.querySelector('.chart-note');
        note.textContent = tile._asTable ? '' : chartNote(chart, data);
        note.hidden = !note.textContent;
    }
}

// A bar or slice: Assigned to me, showing only its tickets
function showMyChartTickets(def, value, label, periods) {
    const valueOf = def.time ? periods.of : def.value;
    assignedView.drill = { label: def.drill(def.time ? `in ${label.replace(/^Week of/, 'the week of')}` : label), test: t => valueOf(t) === value };
    assignedView.status = myChartsView.status;
    assignedView.page = 0;
    setHomeMode('assigned', false, { keepDrill: true });
    document.getElementById('home-assigned').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showMyCharts(quiet = false) {
    if (!sessionTokenValue) return;
    return runHomeSearch('charts', 'my-charts-result', async () => ((await loadAssignedTickets()) ? myChartsHtml() : null), quiet)
        .then(() => { if (homeMode === 'charts') drawMyCharts(); });
}

document.getElementById('my-charts-result').addEventListener('click', e => {
    const status = e.target.closest('[data-mycharts-status]');
    if (status) {
        myChartsView.status = status.dataset.mychartsStatus;
        document.getElementById('my-charts-result').innerHTML = myChartsHtml();
        drawMyCharts();
        return;
    }
    const table = e.target.closest('[data-my-chart-table]');
    if (table) {
        const tile = table.closest('[data-my-chart]');
        tile._asTable = !tile._asTable;
        table.setAttribute('aria-pressed', String(tile._asTable));
        table.title = tile._asTable ? 'Show the chart' : 'Show as a table';
        table.setAttribute('aria-label', table.title);
        drawMyCharts();
    }
});

// =====================================================================
// KPIs (kpis.mjs): each ticket's in "Assigned to me", each family's (and its
// tickets') in a project manager's "Team families". Green: on track; amber:
// keep an eye on it; red: needs attention. Hovering one says what it means.
// =====================================================================

const KPI_LEGEND_HTML = '<p class="kpi-legend">KPIs: <span class="kpi kpi-good">on track</span><span class="kpi kpi-warn">keep an eye on it</span>' +
    '<span class="kpi kpi-bad">needs attention</span> · hover one for what it means. Ages count to the end of the data, not today.</p>';
// A table column whose cells fillTicketKpis fills in
const KPI_COLUMN = ['KPIs', () => '', t => `<div data-kpis="${escapeHtml(t.number)}"><span class="kpi-none">Loading…</span></div>`];

function kpiChipsHtml(list) {
    if (!list?.length) return `<span class="kpi-none" title="${escapeHtml(BLANK_WHY['No KPIs'])}">No KPIs</span>`;
    return '<div class="kpi-list">' + list.map(k => `<span class="kpi kpi-${['good', 'warn', 'bad'].includes(k.tone) ? k.tone : 'info'}"` +
        `${k.detail ? ` title="${escapeHtml(k.detail)}"` : ''}>${escapeHtml(k.label)} <b>${escapeHtml(k.value)}</b></span>`).join('') + '</div>';
}

// Open tickets that need attention (kpis.mjs attentionFlagger): every ticket list
// highlights the row and says why under its number
const needsAttention = t => Boolean(t.flags?.length);
const attentionFlagsHtml = t => (needsAttention(t) ? `<div class="attention-flags">${kpiChipsHtml(t.flags)}</div>` : '');
const ATTENTION_LEGEND_HTML = '<p class="attention-legend">Highlighted tickets need attention: overdue (past their planned end, SLA breached, ' +
    'or open longer than 95 in 100 finished ones like them took), no update for a week, or not assigned. ' +
    'Closed tickets, and ones someone said they resolved or closed, aren\'t highlighted. Hover one for why.</p>';

// Fills the KPI cells in a container ([data-kpis="<number>"]) for the tickets showing
async function fillTicketKpis(container) {
    const cells = [...container.querySelectorAll('[data-kpis]')];
    if (!cells.length) return;
    try {
        const response = await fetch(`${API_BASE}/api/kpis/tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ numbers: cells.map(c => c.dataset.kpis) }),
        });
        if (handleUnauthorized(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        for (const cell of cells) if (cell.isConnected) cell.innerHTML = kpiChipsHtml(data.kpis[cell.dataset.kpis]);
    } catch (err) {
        console.error('Could not load the KPIs:', err);
        for (const cell of cells) if (cell.isConnected) cell.innerHTML = '<span class="kpi-none">KPIs unavailable</span>';
    }
}

// ---------------------------------------------------------------------
// TEAM FAMILIES (project managers and admins): the team's families, those
// with open tickets first, by their most urgent open ticket and then their
// oldest; each with its KPIs, and its tickets' at a click
// ---------------------------------------------------------------------

const FAMILY_PAGE = 25;
const FAMILY_TICKETS_SHOWN = 50;
const KIND_LABELS = { INC: ['incident', 'incidents'], CHG: ['change', 'changes'], RITM: ['request', 'requests'], SCTASK: ['catalog task', 'catalog tasks'] };
const teamFamiliesView = { teamId: null, teams: null, status: 'open', linked: true, offset: 0, data: null };
// What the server sorts the families by for each heading (no sort: the most urgent first)
const TEAM_FAMILY_SORT_KEYS = { Family: 'family', Tickets: 'size', KPIs: 'kpis' };
// The columns the server can look the families up by (server.mjs)
const TEAM_FAMILY_LOOKUP_COLUMNS = ['Family', 'Tickets', 'KPIs'];

function showFamilyKpis(quiet = false) {
    if (!sessionTokenValue || !canSeeFamilies()) return;
    return runHomeSearch('families', 'kpi-families-result', async () => {
        // Admins can look at any team; a project manager sees their own. Their
        // people are the names that can be typed to give a family to (picker.js).
        if (!teamFamiliesView.teams) {
            const r = await fetch(`${API_BASE}/api/teams`, { headers: authHeaders() });
            if (handleUnauthorized(r)) return null;
            const t = await r.json().catch(() => ({}));
            teamFamiliesView.teams = (t.teams || []).map(team => ({ id: team.id, name: team.name }));
            if (t.teams) rememberPickerPeople(t);
        }
        const teamId = teamFamiliesView.teamId || currentAccess.team?.id || teamFamiliesView.teams?.[0]?.id;
        if (!teamId) return '<p class="home-status">You\'re not on a team, so there are no families to show.</p>';
        const q = new URLSearchParams({
            team: teamId, status: teamFamiliesView.status, linked: teamFamiliesView.linked ? 1 : 0, offset: teamFamiliesView.offset, limit: FAMILY_PAGE,
            ...sortQuery('team-families', TEAM_FAMILY_SORT_KEYS), ...lookupQuery('team-families'),
        });
        const token = sessionTokenValue;
        const response = await fetch(`${API_BASE}/api/kpis/families?${q}`, { headers: authHeaders() });
        if (token !== sessionTokenValue) return null; // signed out meanwhile: not for whoever is here now
        if (handleUnauthorized(response)) return null;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        teamFamiliesView.data = data;
        teamFamiliesView.teamId = data.teamId;
        const count = document.getElementById('kpi-families-count');
        count.textContent = data.counts.open.toLocaleString();
        count.title = `${data.counts.open.toLocaleString()} with open tickets`;
        count.hidden = false;
        return familiesHtml();
    }, quiet);
}

function familiesHtml() {
    const { data, status, linked } = teamFamiliesView;
    const teamName = teamFamiliesView.teams?.find(t => t.id === data.teamId)?.name || currentAccess.team?.name || 'Your team';
    const which = status === 'open' ? 'with open tickets' : '';
    const sized = linked ? 'linked ' : '';
    const filter = '<div class="assigned-filter" role="group" aria-label="Which families">' +
        [['open', 'Needs attention', data.counts.open], ['all', 'All', data.counts.all]].map(([key, label, n]) =>
            `<button type="button" class="home-action" data-families-status="${key}" aria-pressed="${status === key}">${label} (${n.toLocaleString()})</button>`).join('') + '</div>';
    const teamPick = currentAccess.admin && teamFamiliesView.teams?.length
        ? `<label>Team <select data-families-team>${teamFamiliesView.teams.map(t => `<option value="${t.id}"${t.id === data.teamId ? ' selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}</select></label>`
        : '';
    const sort = listSorts.get('team-families');
    const order = sort
        ? `sorted by ${sort.col === 'KPIs' ? 'how many KPIs need attention' : sort.col}, ${sort.dir === 'asc' ? 'ascending' : 'descending'}`
        : 'the most urgent first (the highest-priority open ticket, then the oldest)';
    const all = data.before ?? data.total;
    const head = '<div class="results-head">' +
        `<p class="home-status">${escapeHtml(teamName)}: ${all.toLocaleString()} ${sized}${all === 1 ? 'family' : 'families'} ${which}, ` +
        `${order}. A family is tickets linked to each other, which always stay with one team. ` +
        'Open one to see each of its tickets\' KPIs and who has it, or type a name to give someone all of its tickets.</p>' +
        `<div class="families-controls">${filter}<label><input type="checkbox" data-families-linked${linked ? ' checked' : ''}> Only linked families (2 or more tickets)</label>${teamPick}</div>` +
        '</div>';
    if (!all) return head + `<p class="home-status">${status === 'open' ? 'No families with open tickets: all caught up.' : 'No families.'}</p>`;
    const bar = lookupBarHtml('team-families', TEAM_FAMILY_LOOKUP_COLUMNS, { mode: 'list', noun: 'families', count: { shown: data.total, total: all } });
    if (!data.families.length) return head + bar + '<p class="home-status">No families match what you typed. Change it, or press Escape in the box to see them all.</p>';
    const rows = data.families.map(f => {
        const id = escapeHtml(f.id);
        const summary = String(f.ticket?.summary || '');
        const kinds = Object.entries(f.kinds).map(([k, n]) => `${n} ${KIND_LABELS[k][n === 1 ? 0 : 1]}`).join(', ');
        return `<tr data-family-row="${id}">` +
            `<td class="ticket-cell" data-sort="${id}"><button type="button" class="ticket-link" data-ticket="${id}" title="Open ${id}">${id}</button>${starButtonHtml(f.id)}` +
            (summary ? `<div class="family-sub"${summary.length > 90 ? ` title="${escapeHtml(summary)}"` : ''}>${escapeHtml(summary.length > 90 ? `${summary.slice(0, 87)}…` : summary)}</div>` : '') + '</td>' +
            `<td><strong>${f.size.toLocaleString()}</strong> ${f.size === 1 ? 'ticket' : 'tickets'}<div class="family-kinds">${escapeHtml(kinds)}</div></td>` +
            `<td class="kpi-cell">${kpiChipsHtml(f.kpis)}</td>` +
            `<td>${personPickerHtml(data.teamId, undefined, `Give all ${f.size.toLocaleString()} tickets of family ${f.id} to`,
                { placeholder: 'Type a name…', attrs: `data-family="${id}" data-family-size="${f.size}"` })}</td>` +
            `<td><button type="button" class="home-action" data-family-open="${id}" aria-expanded="false">Its tickets</button></td></tr>`;
    }).join('');
    const first = teamFamiliesView.offset + 1;
    const last = teamFamiliesView.offset + data.families.length;
    const pager = data.total > FAMILY_PAGE
        ? `<div class="team-pager"><span>${first.toLocaleString()}–${last.toLocaleString()} of ${data.total.toLocaleString()}</span>` +
          `<button type="button" class="home-action" data-families-page="-1"${teamFamiliesView.offset ? '' : ' disabled'}>← Previous</button>` +
          `<button type="button" class="home-action" data-families-page="1"${last < data.total ? '' : ' disabled'}>Next →</button></div>`
        : '';
    return head + bar + KPI_LEGEND_HTML + '<div class="table-wrap"><table class="result-table" data-sort-list="team-families"><thead><tr>' +
        sortHeadHtml('team-families', 'Family', 'Family (its first ticket)') + sortHeadHtml('team-families', 'Tickets') + sortHeadHtml('team-families', 'KPIs') +
        '<th>Give it all to</th><th></th></tr></thead>' + `<tbody>${rows}</tbody></table></div>` + pager;
}

// A heading, or a lookup: every family of the team sorted or looked through by the server, from the first page
pagedSorts['team-families'] = () => {
    teamFamiliesView.offset = 0;
    return showFamilyKpis(true);
};
pagedLookups['team-families'] = pagedSorts['team-families'];

const FAMILY_TICKET_COLUMNS = [
    ['Ticket', t => t.number],
    ['Type', t => t.type],
    ['Summary', t => t.summary],
    ['State', t => t.state],
    ['Priority / Risk', t => t.level],
    ['Assigned to', t => t.assignee || 'Not assigned yet'],
    ['KPIs', () => '', t => kpiChipsHtml(t.kpis)],
];

// A family's tickets, each with who has it and its KPIs, in a row under the family
async function toggleFamilyTickets(button) {
    const row = button.closest('tr');
    const open = row.nextElementSibling?.classList.contains('row-detail');
    if (open) {
        row.nextElementSibling.remove();
        button.setAttribute('aria-expanded', 'false');
        button.textContent = 'Its tickets';
        return;
    }
    button.setAttribute('aria-expanded', 'true');
    button.textContent = 'Hide its tickets';
    row.insertAdjacentHTML('afterend', `<tr class="row-detail"><td colspan="5"><div class="family-tickets"><p class="home-status">Loading its tickets…</p></div></td></tr>`);
    const box = row.nextElementSibling.querySelector('.family-tickets');
    try {
        const response = await fetch(`${API_BASE}/api/kpis/families/${encodeURIComponent(button.dataset.familyOpen)}`, { headers: authHeaders() });
        if (handleUnauthorized(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        if (!box.isConnected) return;
        // In the server's order: open ones first, then the most urgent, then the oldest
        Object.assign(box, { familyId: data.id, familyTickets: data.tickets, showAll: false });
        drawFamilyTickets(box);
    } catch (err) {
        if (box.isConnected) box.innerHTML = `<p class="home-status error">${escapeHtml(err.message)}</p>`;
    }
}

// A family's tickets, the first FAMILY_TICKETS_SHOWN (or all of them), in the
// sort of its own headings and looked up by its own box; each family keeps both
function drawFamilyTickets(box) {
    const list = `family:${box.familyId}`;
    const all = box.familyTickets;
    const tickets = sortedTickets(lookedUpTickets(all, list, FAMILY_TICKET_COLUMNS, ticketLookupText), list, FAMILY_TICKET_COLUMNS, ticketSortValue);
    const drawn = box.showAll ? tickets : tickets.slice(0, FAMILY_TICKETS_SHOWN);
    const bar = all.length >= 2
        ? lookupBarHtml(list, FAMILY_TICKET_COLUMNS.map(([label]) => label), { mode: 'list', count: { shown: tickets.length, total: all.length } }) : '';
    box.innerHTML = `<h4>${all.length.toLocaleString()} ${all.length === 1 ? 'ticket' : 'tickets'} in this family</h4>` + bar +
        (tickets.length
            ? ticketTableHtml(drawn, FAMILY_TICKET_COLUMNS, new Set(), 'fresh', { sort: list, lookup: false }) +
              (drawn.length < tickets.length ? `<p class="home-status">Showing ${drawn.length} of ${tickets.length.toLocaleString()}. ` +
                  `<button type="button" class="link-btn" data-family-all>Show all ${tickets.length.toLocaleString()}</button></p>` : '')
            : '<p class="home-status">None of its tickets match what you typed.</p>');
}
pagedSorts.family = table => drawFamilyTickets(table.closest('.family-tickets'));
pagedLookups.family = list => {
    const box = document.querySelector(`.lookup-bar[data-lookup="${CSS.escape(list)}"]`)?.closest('.family-tickets');
    if (box) drawFamilyTickets(box);
};

document.getElementById('kpi-families-result').addEventListener('click', e => {
    const status = e.target.closest('[data-families-status]');
    const page = e.target.closest('[data-families-page]');
    const open = e.target.closest('[data-family-open]');
    const all = e.target.closest('[data-family-all]');
    if (open) { toggleFamilyTickets(open); return; }
    if (all) {
        const box = all.closest('.family-tickets');
        box.showAll = true;
        drawFamilyTickets(box);
        return;
    }
    if (!status && !page) return;
    if (status) {
        teamFamiliesView.status = status.dataset.familiesStatus;
        teamFamiliesView.offset = 0;
    } else {
        teamFamiliesView.offset = Math.max(0, teamFamiliesView.offset + Number(page.dataset.familiesPage) * FAMILY_PAGE);
    }
    showFamilyKpis(true).then(() => { if (page) document.getElementById('kpi-families-result').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
});

// A name typed for a family: all of its tickets go to them (teams.js giveFamily), then the KPIs again
document.getElementById('kpi-families-result').addEventListener('personpick', e => {
    const picker = e.target;
    giveFamily(picker.dataset.family, Number(picker.dataset.familySize), e.detail.id, e.detail.name)
        .then(done => (done ? showFamilyKpis(true) : setPickerValue(picker, undefined)));
});

document.getElementById('kpi-families-result').addEventListener('change', e => {
    if (e.target.matches('[data-families-linked]')) teamFamiliesView.linked = e.target.checked;
    else if (e.target.matches('[data-families-team]')) teamFamiliesView.teamId = Number(e.target.value);
    else return;
    teamFamiliesView.offset = 0;
    showFamilyKpis(true);
});

// =====================================================================
// TICKET RESULTS: every ticket the person has been shown, newest first: the
// tickets in the AI assistant's answers (the server records them as it
// answers) and records they opened. Kept with their account, so the list is
// there after a refresh, signing out, or on another computer.
// =====================================================================

const NO_TICKET_RESULTS_HTML = '<p class="home-status">Tickets in the AI assistant\'s answers show up here automatically, ' +
    'and stay here after you refresh or sign out. Click a ticket number to see its full record.</p>';

let latestShown = new Set(); // the latest answer's tickets, highlighted in the list
let openedRecord = null;     // a ticket whose full record is showing instead of the list

const SHOWN_COLUMNS = [
    ['Shown', t => formatShownAt(t.shownAt)],
    ['From', t => t.question || 'Opened from a ticket number'],
];

// "Oct 22, 1:05 PM"
function formatShownAt(iso) {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime())
        ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

// The list (or the record someone opened). quiet: refresh without a "Loading…".
function showTicketResults(quiet = false) {
    const out = document.getElementById('ticket-results');
    if (!sessionTokenValue) { out.innerHTML = NO_TICKET_RESULTS_HTML; return; }
    if (openedRecord) return showOpenedRecord(openedRecord);
    return runHomeSearch('results', 'ticket-results', async () => {
        const response = await fetch(`${API_BASE}/api/seen-tickets`, { headers: authHeaders() });
        if (handleUnauthorized(response)) return null;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        const tickets = data.tickets || [];
        if (!tickets.length) return NO_TICKET_RESULTS_HTML;
        const columns = withLinks(SHOWN_COLUMNS);
        const fresh = tickets.filter(t => latestShown.has(t.number)).length;
        return '<div class="results-head">' +
            `<p class="home-status">${tickets.length.toLocaleString()} ${tickets.length === 1 ? 'ticket' : 'tickets'} shown to you, newest first. ` +
            (fresh ? `<span class="fresh-key">Highlighted: the ${fresh.toLocaleString()} from your latest question.</span> ` : '') +
            'Click a ticket number to see its full record, or its parent or family to see those.</p>' +
            `<button type="button" class="home-action danger" onclick="clearTicketResults(${tickets.length})">🧹 Clear ticket results</button></div>` +
            starAllHtml(tickets.map(t => t.number)) + selectBarHtml('results') +
            ticketTableHtml(tickets, columns, latestShown, 'fresh', { select: 'results', sort: 'results', lookup: 'results' }) + ticketDownloadHtml(tickets, 'Ticket results', columns);
    }, quiet).then(() => paintSelection('results'));
}

// Why a ticket number didn't open: someone else's ticket (the server lists it in
// noAccess: in the data, but not one this person may see), or not in the data
function notOpenedText(number, noAccess) {
    return (noAccess || []).includes(number)
        ? `You don't have permission to see ${number}. Only whoever it's assigned to, its team's project manager and admins can open it.`
        : `${number} is not in the data.`;
}

// A ticket number someone clicked: its full record, with the way back to the list.
// Opening it counts as being shown, so it joins the list.
function openTicketRecord(number) {
    openedRecord = number;
    toggleAssistant(false); // clicked inside the chat (e.g. in a related family): show Home
    switchTab('home');
    setHomeMode('results');
    if (STARRABLE.test(number)) {
        fetch(`${API_BASE}/api/seen-tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ numbers: [number] }),
        }).catch(err => console.error('Could not add the ticket to Ticket results:', err));
    }
    document.getElementById('home-view').scrollTop = 0;
}

async function showOpenedRecord(number) {
    await runHomeSearch('results', 'ticket-results', async () => {
        const data = await searchTickets(number, true);
        if (!data) return null;
        const back = '<div class="home-actions"><button type="button" class="home-action" onclick="closeTicketRecord()">← All ticket results</button></div>';
        if (!data.found.length) return back + `<p class="home-status">${escapeHtml(notOpenedText(number, data.noAccess))}</p>`;
        if (data.found.length === 1) return back + ticketCardHtml(data.found[0], data.record);
        return back + ticketTableHtml(data.found);
    });
    // Its parent / child tickets and other linked ones, above its fields
    const out = document.getElementById('ticket-results');
    if (openedRecord === number && out.querySelector('.ticket-head')) showRelated(out, [number], false, out.querySelector('.record-fields'));
}

// =====================================================================
// RELATED TICKETS: the families the server finds from the links in the data
// (parent / child incidents, bundle and child requests, an order's requests,
// a request's tasks, a change and its incidents, a problem record), with what
// the members share and where they differ
// =====================================================================

const FAMILY_COLUMNS = [
    ['Ticket', t => t.number],
    ['Role', t => t.role],
    ['Summary', t => t.summary],
    ['State', t => t.state],
    ['Priority / Risk', t => t.level],
    ['Team', t => t.team],
    ['Opened', t => t.opened ? formatValue('ticket.opened', t.opened) : ''],
];

// "Team INFRA-Cloud-Linux (3), INFRA-Cloud-Linux (3)", "Opened Sep 1, 1:07 AM to 1:18 AM"
function familyFact(fact) {
    if (fact.range) return `${formatValue('ticket.opened', fact.range[0])} to ${formatValue('ticket.opened', fact.range[1])}`;
    if (fact.note) return fact.note;
    if (fact.values) {
        return fact.values.map(v => `${v.value} (${v.count.toLocaleString()})`).join(', ') + (fact.others ? `, and ${fact.others.toLocaleString()} more` : '');
    }
    const value = fact.field === 'Opened' ? formatValue('ticket.opened', fact.value) : String(fact.value);
    return value.length > 100 ? `${value.slice(0, 97)}…` : value;
}

const FAMILY_MEMBERS_SHOWN = 25; // listed on screen; downloads hold every member
const FAMILY_EXPORT_COLUMNS = [...FAMILY_COLUMNS.slice(0, 2), ['Type', t => t.type], ...FAMILY_COLUMNS.slice(2)];

// A family as download tables: every member, then what they share and where they differ.
// Titles start with what the table is and the family's anchor number, because
// Excel cuts worksheet names at 31 characters ("Members of PRB0001234 (96 tick…").
function familyExportTables(f) {
    return [
        {
            title: `Members of ${f.anchor} (${f.title})`,
            columns: FAMILY_EXPORT_COLUMNS.map(([label]) => ({ label })),
            rows: f.members.map(t => FAMILY_EXPORT_COLUMNS.map(([, get]) => String(get(t) || ''))),
            footer: null,
        },
        {
            title: `Same or different in ${f.anchor} (${f.title})`,
            columns: [{ label: 'Field' }, { label: 'Same or different' }, { label: 'Value' }],
            rows: [
                ...f.same.map(fact => [fact.field, `Same in all ${f.total.toLocaleString()}`, familyFact(fact)]),
                ...f.differ.map(fact => [fact.field, 'Different', familyFact(fact)]),
            ],
            footer: null,
        },
    ].filter(table => table.rows.length);
}

// "Related to INC2400123", or "Related to INC1, INC2, INC3 and 4 more"
function relatedToLabel(focus) {
    const list = [...focus];
    return `Related to ${list.slice(0, 3).join(', ')}${list.length > 3 ? ` and ${list.length - 3} more` : ''}`;
}

// `focus`: the tickets the question or record was about, marked in each family.
// inChat: under an answer, where every ticket number in the notes opens that ticket
function relatedHtml(families, focus, inChat = false) {
    const text = inChat ? linkTicketsHtml : escapeHtml;
    const about = relatedToLabel(focus);
    // Several families: one file with all of them, besides each family's own
    const all = families.length > 1
        ? downloadBarHtml(registerExport({ title: `Related tickets: ${families.length} families`, question: about, tables: families.flatMap(familyExportTables) }),
            `Download all ${families.length} families as`)
        : '';
    const single = focus.size === 1 ? [...focus][0] : null;
    const heading = single ? `${single}'s family: parent, children and other linked tickets` : 'Related tickets';
    return `<div class="related"><div class="related-title">${text(heading)}</div>` + all + families.map(f => {
        const facts = list => list.map(fact => `<span class="fact"><b>${escapeHtml(fact.field)}:</b> ${text(familyFact(fact))}</span>`).join('');
        const same = f.same.length
            ? `<div class="family-line"><span class="same-label">Same in all ${f.total.toLocaleString()}</span>${facts(f.same)}</div>` : '';
        const differ = f.differ.length
            ? `<div class="family-line"><span class="differ-label">Different</span>${facts(f.differ)}</div>` : '';
        // The parent (or the order, request, change…) first, then the ticket(s) asked about
        const members = [...f.members].sort((a, b) => ((b.number === f.anchor) - (a.number === f.anchor)) || (focus.has(b.number) - focus.has(a.number)));
        const extra = members.length - FAMILY_MEMBERS_SHOWN;
        const more = extra > 0
            ? `<button type="button" class="home-action family-show-all" data-show-all>Show all ${members.length.toLocaleString()}</button>` : '';
        const where = single ? familyRoleLine(f, single) : '';
        const download = downloadBarHtml(registerExport({ title: f.title, question: about, tables: familyExportTables(f) }), 'Download this family as');
        return `<section class="family${extra > 0 ? ' collapsed' : ''}"><div class="family-title">${text(f.title)}</div>` +
            (where ? `<p class="family-where">${text(where)}</p>` : '') +
            `<p class="family-why">${text(f.why)}</p>${same}${differ}` +
            ticketTableHtml(members, FAMILY_COLUMNS, focus, 'focus', { rowClass: (t, i) => i >= FAMILY_MEMBERS_SHOWN ? 'more-member' : '' }) +
            more + download + '</section>';
    }).join('') + '</div>';
}

// Where one ticket sits in a family: "INC2400123 is a child incident. Its parent is
// INC2400123 (the first row), and it has 4 other child incidents."
function familyRoleLine(f, number) {
    const me = f.members.find(m => m.number === number);
    if (!me) return '';
    const count = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
    const kids = f.members.filter(m => ['Child', 'Child request', 'Task'].includes(m.role)).length;
    switch (f.kind) {
        case 'parent-incident':
            return number === f.anchor
                ? `${number} is the parent incident. Its ${count(kids, 'child incident is', 'child incidents are')} listed under it.`
                : `${number} is a child incident. Its parent is ${f.anchor} (the first row)${kids > 1 ? `, which has ${count(kids - 1, 'other child incident', 'other child incidents')}` : ''}.`;
        case 'bundle-request':
            return number === f.anchor
                ? `${number} is a bundle request. Its ${count(kids, 'child request is', 'child requests are')} listed under it.`
                : `${number} is a child request. Its parent is bundle request ${f.anchor} (the first row)${kids > 1 ? `, which has ${count(kids - 1, 'other child request', 'other child requests')}` : ''}.`;
        case 'request-tasks':
            return number === f.anchor
                ? `${number} is fulfilled by ${count(kids, 'catalog task', 'catalog tasks')}, listed under it.`
                : `${number} is a catalog task of request ${f.anchor} (the first row)${kids > 1 ? `, which has ${count(kids - 1, 'other task', 'other tasks')}` : ''}.`;
        case 'order':
            return `${number} was ordered together with ${count(f.total - 1, 'other request', 'other requests')} in order ${f.anchor}.`;
        case 'problem':
            return `${number} is one of ${count(f.total, 'ticket', 'tickets')} linked to problem ${f.anchor}.`;
        case 'change-incident':
            if (number === f.anchor) return `${number} is the change; the incidents it fixes or caused are listed under it.`;
            return me.role === 'Incident it fixes'
                ? `${number} is the incident that change ${f.anchor} (the first row) was raised to fix.`
                : `${number} was caused by change ${f.anchor} (the first row).`;
        default:
            return '';
    }
}

// Adds "Related tickets" to the end of `container` (an AI answer, or a record on
// Home) once the server has looked; nothing at all if there are none.
// conversation: true also tells the AI about them with the next question.
// before: put it above this element (a record's fields) instead of at the end;
// there, a ticket with no family says so
async function showRelated(container, numbers, conversation, before = null) {
    const slot = document.createElement('div');
    slot.className = 'related-slot';
    slot.innerHTML = `<p class="related-loading">${before ? 'Looking for its parent, children and other linked tickets…' : 'Looking for related tickets…'}</p>`;
    if (before) before.before(slot); else container.appendChild(slot);
    try {
        const response = await fetch(`${API_BASE}/api/tickets/related`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ numbers, conversation }),
        });
        if (handleUnauthorized(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        if (!slot.isConnected) return; // the chat was cleared, or another record opened
        if (!data.families.length) {
            if (before) slot.innerHTML = '<p class="related-none">No parent, child or other linked tickets.</p>';
            else slot.remove();
            return;
        }
        const chatLog = document.getElementById('chat-log');
        slot.innerHTML = relatedHtml(data.families, new Set(numbers), chatLog.contains(slot));
        // Keep the newest answer in view, as the chat does for new messages
        if (chatLog.contains(slot) && chatLog.lastElementChild === container) chatLog.scrollTop = chatLog.scrollHeight;
    } catch (err) {
        slot.remove();
        console.error('Could not look for related tickets:', err);
    }
}

function closeTicketRecord() {
    openedRecord = null;
    showTicketResults();
}

// "Clear ticket results": after a confirmation, the whole list goes, on every
// computer. Stars are separate and stay; new answers fill the list again.
async function clearTicketResults(count) {
    const what = `${count.toLocaleString()} ${count === 1 ? 'ticket' : 'tickets'}`;
    if (!confirm(`Clear your ticket results? The list of ${what} is emptied on every computer you use. Your starred tickets stay starred.`)) return;
    try {
        const response = await fetch(`${API_BASE}/api/seen-tickets`, { method: 'DELETE', headers: authHeaders() });
        if (handleUnauthorized(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        latestShown = new Set();
        openedRecord = null;
        await showTicketResults();
        showToast('Ticket results cleared');
    } catch (err) {
        showToast(`${err.message}`, 'error');
    }
}

// An AI answer showed these tickets (the server has already saved them): they
// go to the top of Ticket results, highlighted, and Home shows that list
function ticketsShown(numbers) {
    latestShown = new Set(numbers);
    openedRecord = null;
    setHomeMode('results', true);
    showToast(`${numbers.length.toLocaleString()} ${numbers.length === 1 ? 'ticket' : 'tickets'} from this answer ${numbers.length === 1 ? 'is' : 'are'} now in Ticket results on Home`);
}

// Newest star first. Unstarring here leaves the row (with an empty star) until
// the list is opened again, so a slip of the mouse is easy to undo.
function showStarred(quiet = false) {
    return runHomeSearch('starred', 'starred-result', async () => {
        const response = await fetch(`${API_BASE}/api/stars?details=1`, { headers: authHeaders() });
        if (handleUnauthorized(response)) return null;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        starredTickets.clear();
        for (const s of data.stars) starredTickets.set(s.number, s.starredAt);
        refreshStarButtons();
        const numbers = data.stars.map(s => s.number);
        if (!numbers.length) {
            return '<p class="home-status">No starred tickets yet. Click ☆ next to any ticket number: in your ticket results, ' +
                'in the AI assistant\'s answers, or on an incident, change or request record in Dashboards. ' +
                'Your stars are saved to your account, so they are here on any computer you sign in from.</p>';
        }
        const columns = withLinks([STARRED_COLUMN]);
        const missing = (data.noAccess?.length
            ? `<p class="home-status">You don't have permission to see these any more (they're no longer yours): ${escapeHtml(data.noAccess.join(', '))}</p>` : '') +
            (data.notFound.length ? `<p class="home-status">Not in the data any more: ${escapeHtml(data.notFound.join(', '))}</p>` : '');
        return '<div class="results-head">' +
            `<p class="home-status">${numbers.length.toLocaleString()} starred ${numbers.length === 1 ? 'ticket' : 'tickets'}, newest first. ` +
            'Tick tickets to unstar several at once.</p>' +
            `<button type="button" class="home-action danger" onclick="unstarAll()">☆ Unstar all</button></div>` +
            unstarByIssueHtml(data.tickets) + selectBarHtml('starred') +
            ticketTableHtml(data.tickets, columns, new Set(), 'fresh', { select: 'starred', sort: 'starred', lookup: 'starred' }) + missing + ticketDownloadHtml(data.tickets, 'Starred tickets', columns);
    }, quiet).then(() => paintSelection('starred'));
}

// "Unstar by issue": starred tickets that share a family (the same parent
// incident, problem, change, order, bundle or request), one button per family
function unstarByIssueHtml(tickets) {
    const groups = new Map();
    for (const t of tickets) {
        for (const f of t.families || []) {
            if (!groups.has(f.key)) groups.set(f.key, { name: f.name, numbers: [] });
            groups.get(f.key).numbers.push(t.number);
        }
    }
    const shared = [...groups.values()].filter(g => g.numbers.length >= 2).sort((a, b) => b.numbers.length - a.numbers.length);
    if (!shared.length) return '';
    const shown = shared.slice(0, 10);
    // The numbers are ticket numbers (from the server's list), so they need no escaping
    return '<div class="issue-bar"><span class="issue-label">Unstar by issue:</span>' +
        shown.map(g => `<button type="button" class="issue-unstar" data-unstar-many="${g.numbers.join(',')}" data-what="${escapeHtml(g.name)}">` +
            `☆ Unstar the ${g.numbers.length} in ${escapeHtml(g.name)}</button>`).join('') +
        (shared.length > shown.length ? `<span class="issue-more">and ${(shared.length - shown.length).toLocaleString()} more issues</span>` : '') + '</div>';
}

// ---------------------------------------------------------------------
// Selecting tickets in Ticket results or Starred tickets: tick rows (Shift
// ticks a range, the header's checkbox ticks all), then remove them from
// the list or unstar them, in one go
// ---------------------------------------------------------------------

const selections = { results: new Set(), starred: new Set() };
const lastTicked = { results: null, starred: null };
const LIST_BOXES = { results: 'ticket-results', starred: 'starred-result' };

// The bar over a list: what's ticked, then 💬 ask the AI about them, the list's own
// action (remove / unstar), unstar and remove, and clear the ticks
function selectBarHtml(list) {
    return `<div class="select-bar" data-select-bar="${list}"><span class="select-count" aria-live="polite"></span>` +
        `<button type="button" class="home-action" data-ask-open="${list}" aria-expanded="false" disabled></button>` +
        `<button type="button" class="home-action danger" data-selected-action="${list}" disabled></button>` +
        `<button type="button" class="home-action danger" data-selected-both="${list}" disabled title="Unstar the ticked tickets and remove them from Ticket results"></button>` +
        `<button type="button" class="home-action" data-select-none="${list}" disabled>Clear selection</button></div>` +
        askBoxHtml(list);
}

// 💬 A question about the ticked tickets, asked in the chat with their numbers
const ASK_SUGGESTIONS = [
    'What do these tickets have in common?',
    'Which of these are still open?',
    'Who is working on these, and in which teams?',
    'Show me the full details of these tickets',
];
const MAX_ASK_TICKETS = 100;

function askBoxHtml(list) {
    return `<div class="ask-selected" data-ask-box="${list}" hidden>` +
        `<div class="ask-selected-row"><input type="text" class="ask-selected-input" data-ask-input="${list}" maxlength="300"` +
        ` placeholder="Ask anything about the ticked tickets…" aria-label="Your question about the ticked tickets">` +
        `<button type="button" class="primary-btn" data-ask-go="${list}">Ask</button></div>` +
        `<div class="ask-suggestions">${ASK_SUGGESTIONS.map(q => `<button type="button" class="ask-chip" data-ask-suggest="${list}" data-question="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('')}</div></div>`;
}

// The ticked tickets, in the list's order
function tickedInOrder(list) {
    return [...document.getElementById(LIST_BOXES[list]).querySelectorAll('.row-select:checked')].map(b => b.value);
}

function askAboutTicked(list, question) {
    const numbers = tickedInOrder(list);
    question = String(question || '').trim();
    if (!numbers.length || !question) return;
    if (numbers.length > MAX_ASK_TICKETS) {
        showToast(`Ask about up to ${MAX_ASK_TICKETS} tickets at a time; ${numbers.length.toLocaleString()} are ticked.`);
        return;
    }
    askAssistant(`About ${numbers.length === 1 ? 'ticket' : 'tickets'} ${numbers.join(', ')}: ${question}`);
}

// The ticks, the header checkbox and the bar, from the list's selection
function paintSelection(list) {
    const out = document.getElementById(LIST_BOXES[list]);
    const boxes = [...out.querySelectorAll('.row-select')];
    const present = new Set(boxes.map(b => b.value));
    for (const n of [...selections[list]]) if (!present.has(n)) selections[list].delete(n);
    for (const box of boxes) {
        box.checked = selections[list].has(box.value);
        box.closest('tr').classList.toggle('selected', box.checked);
    }
    const n = selections[list].size;
    const all = out.querySelector('.select-all');
    if (all) {
        // Ticked "all": every ticket the lookup is showing
        const showing = boxes.filter(b => lookupShows(b.closest('tr')));
        const ticked = showing.filter(b => b.checked).length;
        all.checked = ticked > 0 && ticked === showing.length;
        all.indeterminate = n > 0 && !all.checked;
    }
    const bar = out.querySelector('.select-bar');
    if (!bar) return;
    bar.querySelector('.select-count').textContent = n ? `${n.toLocaleString()} selected`
        : list === 'results' ? 'Tick tickets to remove them from this list.' : 'Tick tickets to unstar them together.';
    const count = n ? ` ${n.toLocaleString()}` : '';
    const action = bar.querySelector('[data-selected-action]');
    action.disabled = !n;
    action.textContent = list === 'results' ? `✕ Remove${count} from Ticket results` : (n ? `☆ Unstar${count}` : '☆ Unstar selected');
    const both = bar.querySelector('[data-selected-both]');
    both.disabled = !n;
    both.textContent = `☆ Unstar and ✕ remove${count} from Ticket results`;
    const ask = bar.querySelector('[data-ask-open]');
    ask.disabled = !n;
    ask.textContent = n ? `💬 Ask the AI about${count}` : '💬 Ask the AI about them';
    if (!n) {
        out.querySelector('.ask-selected').hidden = true;
        ask.setAttribute('aria-expanded', 'false');
    }
    bar.querySelector('[data-select-none]').disabled = !n;
}

document.addEventListener('click', e => {
    const box = e.target.closest?.('.row-select, .select-all');
    if (box) {
        const list = box.dataset.selectList;
        // The rows the lookup is showing (all of them when nothing is typed)
        const boxes = [...document.getElementById(LIST_BOXES[list]).querySelectorAll('.row-select')].filter(b => lookupShows(b.closest('tr')));
        if (box.classList.contains('select-all')) {
            for (const b of boxes) box.checked ? selections[list].add(b.value) : selections[list].delete(b.value);
        } else {
            // Shift: every row between the last one ticked and this one takes this one's tick
            const i = boxes.indexOf(box);
            const from = e.shiftKey && lastTicked[list] !== null ? Math.min(lastTicked[list], i) : i;
            const to = e.shiftKey && lastTicked[list] !== null ? Math.max(lastTicked[list], i) : i;
            for (const b of boxes.slice(from, to + 1)) box.checked ? selections[list].add(b.value) : selections[list].delete(b.value);
            lastTicked[list] = i;
        }
        paintSelection(list);
        return;
    }
    const none = e.target.closest?.('[data-select-none]');
    if (none) {
        selections[none.dataset.selectNone].clear();
        paintSelection(none.dataset.selectNone);
        return;
    }
    const both = e.target.closest?.('[data-selected-both]');
    if (both) {
        unstarAndRemove(tickedInOrder(both.dataset.selectedBoth));
        return;
    }
    const askOpen = e.target.closest?.('[data-ask-open]');
    if (askOpen) {
        const box = document.querySelector(`[data-ask-box="${askOpen.dataset.askOpen}"]`);
        box.hidden = !box.hidden;
        askOpen.setAttribute('aria-expanded', String(!box.hidden));
        if (!box.hidden) box.querySelector('input').focus();
        return;
    }
    const askGo = e.target.closest?.('[data-ask-go]');
    if (askGo) {
        askAboutTicked(askGo.dataset.askGo, document.querySelector(`[data-ask-input="${askGo.dataset.askGo}"]`).value);
        return;
    }
    const suggestion = e.target.closest?.('[data-ask-suggest]');
    if (suggestion) {
        askAboutTicked(suggestion.dataset.askSuggest, suggestion.dataset.question);
        return;
    }
    const act = e.target.closest?.('[data-selected-action]');
    if (act) {
        const list = act.dataset.selectedAction;
        const numbers = [...selections[list]];
        if (list === 'results') removeFromResults(numbers);
        else unstarMany(numbers, `${numbers.length.toLocaleString()} ${numbers.length === 1 ? 'ticket' : 'tickets'}`);
        return;
    }
    const issue = e.target.closest?.('[data-unstar-many]');
    if (issue) {
        const numbers = issue.dataset.unstarMany.split(',');
        unstarMany(numbers, `the ${numbers.length} in ${issue.dataset.what}`);
    }
});

// A lookup in Ticket results or Starred tickets: the header's tick box follows what shows
document.addEventListener('lookedup', e => {
    for (const [list, id] of Object.entries(LIST_BOXES)) if (e.target.closest(`#${id}`)) paintSelection(list);
});

// Enter in the question box asks
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches?.('[data-ask-input]')) {
        e.preventDefault();
        askAboutTicked(e.target.dataset.askInput, e.target.value);
    }
});

// The ticked tickets leave Ticket results (on every computer); their stars stay.
// quiet: no list refresh or note (unstarAndRemove does both itself). -> true when done
async function removeFromResults(numbers, { quiet = false } = {}) {
    if (!numbers.length) return false;
    const total = document.querySelectorAll('#ticket-results .row-select').length;
    if (!quiet && numbers.length === total && !confirm(`Remove all ${total.toLocaleString()} tickets from your ticket results? Your starred tickets stay starred.`)) return false;
    try {
        const response = await fetch(`${API_BASE}/api/seen-tickets/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ numbers }),
        });
        if (handleUnauthorized(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        for (const n of numbers) {
            selections.results.delete(n);
            latestShown.delete(n);
        }
        if (quiet) return true;
        await showTicketResults(true);
        showToast(`Removed ${numbers.length.toLocaleString()} ${numbers.length === 1 ? 'ticket' : 'tickets'} from Ticket results`);
        return true;
    } catch (err) {
        showToast(`${err.message}`, 'error');
        return false;
    }
}

// "Unstar and remove from Ticket results": both, for the ticked tickets, after asking
async function unstarAndRemove(numbers) {
    if (!numbers.length) return;
    const what = `${numbers.length.toLocaleString()} ${numbers.length === 1 ? 'ticket' : 'tickets'}`;
    if (!confirm(`Unstar ${what} and remove ${numbers.length === 1 ? 'it' : 'them'} from your Ticket results?`)) return;
    const unstarred = numbers.some(n => starredTickets.has(n)) ? await unstarMany(numbers, what, { quiet: true }) : true;
    const removed = await removeFromResults(numbers, { quiet: true });
    for (const n of numbers) selections.starred.delete(n);
    if (homeMode === 'starred') await showStarred(true); else await showTicketResults(true);
    if (unstarred && removed) showToast(`☆ Unstarred ${what} and removed ${numbers.length === 1 ? 'it' : 'them'} from Ticket results`);
}

// Unstars many in one request; the screen changes at once, and back if the server says no.
// quiet: no list refresh or note. -> true when done
async function unstarMany(numbers, what, { quiet = false } = {}) {
    const toRemove = numbers.filter(n => starredTickets.has(n));
    if (!toRemove.length) return true;
    const before = new Map(toRemove.map(n => [n, starredTickets.get(n)]));
    for (const n of toRemove) starredTickets.delete(n);
    refreshStarButtons();
    try {
        const response = await fetch(`${API_BASE}/api/stars/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ numbers: toRemove }),
        });
        if (handleUnauthorized(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        for (const n of toRemove) selections.starred.delete(n);
        if (quiet) return true;
        if (homeMode === 'starred') await showStarred(true);
        showToast(`☆ Unstarred ${what}`);
        return true;
    } catch (err) {
        for (const [n, at] of before) starredTickets.set(n, at);
        refreshStarButtons();
        showToast(`${err.message}`, 'error');
        return false;
    }
}

function unstarAll() {
    const count = starredTickets.size;
    if (!count || !confirm(`Unstar all ${count.toLocaleString()} starred ${count === 1 ? 'ticket' : 'tickets'}? This can't be undone.`)) return;
    unstarMany([...starredTickets.keys()], `all ${count.toLocaleString()} ${count === 1 ? 'ticket' : 'tickets'}`);
}

// One listener for every star, ticket link and record button, wherever it was drawn
document.addEventListener('click', e => {
    const star = e.target.closest('.star-btn[data-star]');
    if (star) { setStarred(star.dataset.star, !starredTickets.has(star.dataset.star)); return; }

    const many = e.target.closest('.star-many');
    if (many) {
        const numbers = many.dataset.starMany.split(',');
        starMany(numbers, starManyWhat(numbers, many.dataset.kind));
        return;
    }

    const ticket = e.target.closest('[data-ticket]');
    if (ticket) { openTicketRecord(ticket.dataset.ticket); return; }

    const showAll = e.target.closest('[data-show-all]');
    if (showAll) {
        showAll.closest('.family').classList.remove('collapsed');
        showAll.remove();
        return;
    }

    const view = e.target.closest('[data-answer-view]');
    if (view) { setAnswerView(view.closest('.msg'), view.dataset.answerView); return; }
    const saveChart = e.target.closest('[data-answer-save]');
    if (saveChart) { saveAnswerChart(saveChart.closest('.msg')); return; }

    const record = e.target.closest('[data-open-dashboard]');
    if (record) { openInDashboards(record.dataset.openDashboard); return; }

    const close = e.target.closest('.row-detail-close');
    if (close) { toggleTicketRow(close.closest('tr.row-detail').previousElementSibling); return; }

    // A ticket's row in an AI answer: open (or fold away) its full record and
    // related tickets. Buttons and menus inside the row keep their own jobs.
    const row = e.target.closest('tr.expandable');
    if (row && !e.target.closest('button, a, select, input, label')) toggleTicketRow(row);
});

// The same from the keyboard: Enter or Space on a focused ticket row
document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('tr.expandable')) {
        e.preventDefault();
        toggleTicketRow(e.target);
    }
});

// An answer's chart in another order
document.addEventListener('change', e => {
    if (!e.target.matches('[data-answer-order]')) return;
    const el = e.target.closest('.msg');
    el._answer.order = e.target.value;
    setAnswerView(el, el._answer.view);
});

// =====================================================================
// TICKET ROWS IN AI ANSWERS: a click opens a detailed view under the row:
// the ticket's full record, then its related tickets (families)
// =====================================================================

function toggleTicketRow(row) {
    const open = row.nextElementSibling;
    if (open && open.classList.contains('row-detail')) {
        open.remove();
        row.classList.remove('expanded');
        row.setAttribute('aria-expanded', 'false');
        return;
    }
    const number = row.dataset.expand;
    const detail = document.createElement('tr');
    detail.className = 'row-detail';
    const cell = document.createElement('td');
    cell.colSpan = row.cells.length;
    cell.innerHTML = `<div class="row-detail-body"><button type="button" class="row-detail-close">▴ Close</button>` +
        `<div class="row-detail-content"><p class="home-status">Loading ${escapeHtml(number)}…</p></div></div>`;
    detail.appendChild(cell);
    row.after(detail);
    row.classList.add('expanded');
    row.setAttribute('aria-expanded', 'true');
    loadTicketDetail(cell.querySelector('.row-detail-content'), number);
}

async function loadTicketDetail(box, number) {
    try {
        const data = await searchTickets(number, true);
        if (!data || !box.isConnected) return;
        if (!data.found.length) {
            box.innerHTML = `<p class="home-status">${escapeHtml(notOpenedText(number, data.noAccess))}</p>`;
            return;
        }
        box.innerHTML = ticketCardHtml(data.found[0], data.record);
        showRelated(box, [number], false, box.querySelector('.record-fields'));
    } catch (err) {
        if (box.isConnected) box.innerHTML = `<p class="home-status error">${escapeHtml(err.message)}</p>`;
        console.error(err);
    }
}

// =====================================================================
// START: a token from earlier in this tab skips the sign-in page; if it
// has expired, the first API call returns 401 and brings the page back
// =====================================================================

document.getElementById('ticket-results').innerHTML = NO_TICKET_RESULTS_HTML;
buildThemePanel();
buildBuilder();
buildBoardFilters();
renderHomeLayout();
renderMyDashboards();
readSignInLink();
showApp(Boolean(sessionTokenValue));

// A reload brings back the chat this person had last (it's saved to their account)
if (sessionTokenValue) loadCurrentUser().then(resumeLatestChat);
