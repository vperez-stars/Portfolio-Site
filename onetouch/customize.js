// =====================================================================
// CUSTOMIZING: each person's color scheme, their Home page (which
// sections show, in what order, and charts of their own) and their own
// dashboards (the data each chart shows and how it's shown). Everything is
// saved to their account (prefs.mjs on the server), so it is the same after
// a refresh, signing out, a server restart, and on any computer.
// Loaded before app.js, whose helpers these functions use when they run.
// =====================================================================

// ---------------------------------------------------------------------
// Saved preferences: loaded at sign-in, each part saved as it changes
// ---------------------------------------------------------------------

// The default accent is the wheat gold of the sign-in page's photo
const THEME_DEFAULTS = { mode: 'light', accent: '#a06b1c', header: 'dark' };
const defaultHome = () => ({ blocks: [{ type: 'tickets' }] });
const defaultDashboards = () => ({ boards: [], hidden: [], last: '' });

// tour: which tours have been seen (done: Home's; dashboards: the Dashboards page's)
const defaultTour = () => ({ done: false, dashboards: false });

const prefs = { theme: { ...THEME_DEFAULTS }, home: defaultHome(), dashboards: defaultDashboards(), tour: defaultTour() };
let prefsReady = Promise.resolve();
// When loading failed, saving is off: it would replace what's saved with the defaults
let prefsLoadFailed = false;

const PART_NAMES = { theme: 'colors', home: 'Home page', dashboards: 'dashboards', tour: 'tour', access: 'accessibility settings' };

function loadPreferences() {
    const token = sessionTokenValue;
    prefsLoadFailed = false;
    // Home waits for this person's layout, but never for long
    const reveal = setTimeout(() => document.getElementById('home-blocks').classList.remove('waiting'), 3000);
    prefsReady = (async () => {
        try {
            const response = await fetch(`${API_BASE}/api/preferences`, { headers: authHeaders() });
            if (handleUnauthorized(response)) return;
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
            if (token !== sessionTokenValue) return; // signed out meanwhile
            const saved = data.preferences || {};
            prefs.theme = { ...THEME_DEFAULTS, ...saved.theme };
            // A section Home no longer has (the AI assistant's card, now the header's Ask bar) is left out
            prefs.home = Array.isArray(saved.home?.blocks)
                ? { ...saved.home, blocks: saved.home.blocks.filter(b => b?.type === 'chart' || HOME_SECTIONS[b?.type]) } : defaultHome();
            prefs.dashboards = { ...defaultDashboards(), ...saved.dashboards };
            prefs.tour = { done: saved.tour?.done === true, dashboards: saved.tour?.dashboards === true };
            // ♿ Accessibility keeps its own copy (accessibility.js); prefs.access is what's saved
            window.a11yAccountLoaded?.(saved.access);
        } catch (err) {
            prefsLoadFailed = true;
            console.error('Could not load the saved layout and colors:', err);
            showToast(`${err.message} Showing the defaults; refresh the page to try again.`, 'error');
        }
        applyTheme(prefs.theme);
        rememberTheme();
        paintThemePanel();
        renderHomeLayout();
        renderMyDashboards();
        clearTimeout(reveal);
        document.getElementById('home-blocks').classList.remove('waiting');
        if (!prefsLoadFailed && token === sessionTokenValue) afterPreferences();
    })();
    return prefsReady;
}

// One save at a time per part; changes made meanwhile go in one more save
const prefSaves = {};
function savePreference(part) {
    if (prefsLoadFailed) {
        showToast(`Your ${PART_NAMES[part]} can't be saved because your settings didn't load. Refresh the page to try again.`);
        return Promise.resolve(false);
    }
    const state = prefSaves[part] || (prefSaves[part] = { running: null, again: false });
    if (state.running) {
        state.again = true;
        return state.running;
    }
    const token = sessionTokenValue;
    state.running = (async () => {
        do {
            state.again = false;
            if (!token || token !== sessionTokenValue) return false;
            try {
                const response = await fetch(`${API_BASE}/api/preferences/${part}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', ...authHeaders() },
                    body: JSON.stringify({ value: prefs[part] }),
                });
                if (handleUnauthorized(response)) return false;
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
            } catch (err) {
                showToast(`Your ${PART_NAMES[part]} could not be saved: ${err.message}`, 'error');
                return false;
            }
        } while (state.again);
        return true;
    })().finally(() => { state.running = null; });
    return state.running;
}

// For changes that come in a stream (dragging the custom color)
const saveTimers = {};
function savePreferenceSoon(part, delay = 500) {
    clearTimeout(saveTimers[part]);
    saveTimers[part] = setTimeout(() => savePreference(part), delay);
}

const newChartId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// A chart with every setting filled in (the server checks them again)
function chartWithDefaults(c) {
    return {
        id: newChartId(), title: '', status: 'all', dates: { preset: 'all' }, filters: [], groupBy: '',
        display: c.groupBy ? 'bar' : 'number', limit: 10, sort: 'count', size: 'medium', color: 'accent', ...c,
    };
}

// Signing out leaves nothing of this person's on the page
function resetCustomizing() {
    Object.values(saveTimers).forEach(clearTimeout);
    for (const state of Object.values(prefSaves)) state.again = false;
    prefs.theme = { ...THEME_DEFAULTS };
    prefs.home = defaultHome();
    prefs.dashboards = defaultDashboards();
    prefs.tour = defaultTour();
    // ♿ settings stay with this browser (the sign-in page uses them too); only reading and dictation stop
    window.a11ySignedOut?.();
    prefsReady = Promise.resolve();
    prefsLoadFailed = false;
    teamValuesLoading = null; // the Team filter's choices come from this person's tickets
    sharedBoards.clear();
    closeTour(false);
    document.getElementById('bf-team-pop').hidden = true;
    document.getElementById('bf-team-list').innerHTML = '';
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close('cancel');
    applyTheme(prefs.theme);
    try { localStorage.removeItem(THEME_CACHE_KEY); } catch { /* nothing kept */ }
    toggleThemePanel(false);
    toggleHomeEditing(false);
    toggleDrawerEditing(false);
    hideBoard();
    resetFamilies();
    renderHomeLayout();
    renderMyDashboards();
    document.getElementById('home-blocks').classList.add('waiting');
    dashboardsLoading = null; // the next person's dashboards open where they left them
    // The team dashboards' links are signed for this person: none stay behind for whoever signs in next
    dashboardPages.main.clear();
    dashboardPages.details.clear();
    currentMainDashboard = null;
    document.getElementById('dashboard-picker').innerHTML = '';
    document.getElementById('drawer-customize').hidden = false;
    const frame = document.getElementById('dashboard-frame');
    frame.hidden = true;
    frame.src = 'about:blank';
    document.getElementById('dashboard-message').textContent = 'Loading dashboards…';
}

// ---------------------------------------------------------------------
// COLOR SCHEME: light, dark or the computer's setting; an accent color
// (buttons, the lit page button, charts); and the header's color
// ---------------------------------------------------------------------

const ACCENT_CHOICES = [
    ['#a06b1c', 'Wheat gold'], ['#10a37f', 'Green'], ['#2a78d6', 'Blue'], ['#6250d6', 'Violet'], ['#d55181', 'Pink'],
    ['#e34948', 'Red'], ['#eb6834', 'Orange'], ['#0f8a8a', 'Teal'], ['#4a5568', 'Slate'],
];
const THEME_MODES = [['light', '☀️ Light'], ['dark', '🌙 Dark'], ['system', '💻 Match my computer']];
const HEADER_STYLES = [['dark', 'Dark'], ['accent', 'Accent color'], ['light', 'Same as the page']];
// This browser's copy of the last scheme, so a reload doesn't flash the
// default colors before the account's arrive (read by index.html's head)
const THEME_CACHE_KEY = 'onetouch-theme';
const systemDark = matchMedia('(prefers-color-scheme: dark)');

// White text on the accent when it reads well enough (3:1, like the default
// green), otherwise near-black: a pale custom color still has readable buttons
function readableOn(hex) {
    const channel = i => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    return 1.05 / (luminance + 0.05) >= 3 ? '#ffffff' : '#1a202c';
}

function applyTheme(theme) {
    const t = { ...THEME_DEFAULTS, ...theme };
    const root = document.documentElement;
    const wasDark = root.dataset.theme === 'dark';
    const dark = t.mode === 'dark' || (t.mode === 'system' && systemDark.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.header = t.header;
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--on-accent', readableOn(t.accent));
    // The Metabase dashboards have their own light and dark looks
    if (wasDark !== dark) refreshDashboardTheme();
}
systemDark.addEventListener('change', () => applyTheme(prefs.theme));

function rememberTheme() {
    try {
        localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ ...prefs.theme, onAccent: readableOn(prefs.theme.accent) }));
    } catch { /* the default colors show briefly on a reload; that's fine */ }
}

function setTheme(change, gradual = false) {
    prefs.theme = { ...prefs.theme, ...change };
    applyTheme(prefs.theme);
    rememberTheme();
    paintThemePanel();
    if (gradual) savePreferenceSoon('theme');
    else savePreference('theme');
}

function resetTheme() {
    setTheme({ ...THEME_DEFAULTS });
    showToast('Colors are back to the default');
}

// The 🎨 Colors panel under the header
function buildThemePanel() {
    const radios = (name, choices) => choices.map(([value, label]) =>
        `<label class="choice-pill"><input type="radio" name="${name}" value="${value}"><span>${escapeHtml(label)}</span></label>`).join('');
    document.getElementById('theme-modes').innerHTML = radios('theme-mode', THEME_MODES);
    document.getElementById('theme-headers').innerHTML = radios('theme-header', HEADER_STYLES);
    document.getElementById('theme-accents').innerHTML = ACCENT_CHOICES.map(([hex, name]) =>
        `<label class="swatch" title="${escapeHtml(name)}"><input type="radio" name="theme-accent" value="${hex}" aria-label="${escapeHtml(name)}">` +
        `<span style="background:${hex}"></span></label>`).join('');
    const panel = document.getElementById('theme-panel');
    panel.addEventListener('change', e => {
        if (e.target.name === 'theme-mode') setTheme({ mode: e.target.value });
        if (e.target.name === 'theme-header') setTheme({ header: e.target.value });
        if (e.target.name === 'theme-accent') setTheme({ accent: e.target.value });
    });
    document.getElementById('theme-custom').addEventListener('input', e => setTheme({ accent: e.target.value.toLowerCase() }, true));
    paintThemePanel();
}

function paintThemePanel() {
    const t = prefs.theme;
    document.querySelectorAll('#theme-panel input[name="theme-mode"]').forEach(r => { r.checked = r.value === t.mode; });
    document.querySelectorAll('#theme-panel input[name="theme-header"]').forEach(r => { r.checked = r.value === t.header; });
    document.querySelectorAll('#theme-panel input[name="theme-accent"]').forEach(r => { r.checked = r.value === t.accent; });
    const custom = document.getElementById('theme-custom');
    if (custom && document.activeElement !== custom) custom.value = t.accent;
    const isPreset = ACCENT_CHOICES.some(([hex]) => hex === t.accent);
    custom?.closest('.swatch-custom')?.classList.toggle('on', !isPreset);
}

function toggleThemePanel(open) {
    const panel = document.getElementById('theme-panel');
    const button = document.getElementById('theme-btn');
    const willOpen = typeof open === 'boolean' ? open : panel.hidden;
    panel.hidden = !willOpen;
    button.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) panel.querySelector('input:checked, input')?.focus();
    else if (panel.contains(document.activeElement)) button.focus();
}

// A click outside the panel closes it
document.addEventListener('pointerdown', e => {
    const panel = document.getElementById('theme-panel');
    if (!panel.hidden && !panel.contains(e.target) && !e.target.closest('#theme-btn')) toggleThemePanel(false);
});

// ---------------------------------------------------------------------
// A small "name it" box (new dashboard, rename)
// ---------------------------------------------------------------------

function askText({ title, label, value = '', action = 'Save' }) {
    const dialog = document.getElementById('ask-dialog');
    const input = document.getElementById('ask-input');
    dialog.querySelector('.ask-title').textContent = title;
    dialog.querySelector('.ask-label').textContent = label;
    document.getElementById('ask-ok').textContent = action;
    input.value = value;
    dialog.returnValue = '';
    dialog.showModal();
    input.select();
    return new Promise(resolve => {
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok' ? input.value.replace(/\s+/g, ' ').trim() : null), { once: true });
    });
}

// ---------------------------------------------------------------------
// CHART TILES: one chart, its title, what it counts, and its buttons
// ---------------------------------------------------------------------

const TILE_BUTTONS = {
    table: ['▦', 'Show as a table'],
    download: ['⤓', 'Download this chart'],
    edit: ['✎', 'Edit this chart'],
    earlier: ['◀', 'Move earlier'],
    later: ['▶', 'Move later'],
    pin: ['📌', 'Add a copy to Home'],
    remove: ['🗑', 'Remove this chart'],
};
// sort: ⇅, a menu of the chart's orders (ascending or descending, by count or by its groups)
const HOME_TILE_BUTTONS = ['table', 'sort', 'download', 'edit', 'earlier', 'later', 'remove'];
const BOARD_TILE_BUTTONS = ['table', 'sort', 'download', 'edit', 'earlier', 'later', 'pin', 'remove'];
// Charts on someone else's shared dashboard: look (in any order), don't touch
const SHARED_TILE_BUTTONS = ['table', 'sort'];

function tileHtml(chart, buttons, extraClass = '') {
    const actions = buttons.map(a => (a === 'sort'
        ? '<label class="tile-btn tile-sort" title="Order" hidden><span aria-hidden="true">⇅</span><select data-tile-sort aria-label="Order of this chart"></select></label>'
        : `<button type="button" class="tile-btn" data-tile-action="${a}" title="${TILE_BUTTONS[a][1]}" aria-label="${TILE_BUTTONS[a][1]}">${TILE_BUTTONS[a][0]}</button>`)).join('');
    return `<article class="chart-tile size-${chart.size} ${extraClass}" data-chart-id="${escapeHtml(chart.id)}">` +
        `<div class="tile-head"><div class="tile-titles"><h3 class="tile-title"></h3><p class="tile-sub"></p></div>` +
        (actions ? `<div class="tile-actions">${actions}</div>` : '') + `</div>` +
        `<div class="tile-body"><p class="chart-loading">Loading…</p></div><p class="chart-note" hidden></p></article>`;
}

// Fetches (or reuses) the chart's numbers and draws it. While new numbers
// load, the old drawing stays, dimmed, instead of jumping to "Loading…".
// scope: the dashboard's filter row (dates, teams), applied on top of the chart's own.
// A click on a bar, slice, point or the number lists the tickets behind it.
async function fillTile(tile, chart, asTable = tile._asTable || false, scope = tile._scope || null) {
    const body = tile.querySelector('.tile-body');
    const run = (body._run || 0) + 1;
    body._run = run;
    tile._asTable = asTable;
    tile._scope = scope;
    tile._chart = chart;
    if (body._drawn) body.classList.add('refreshing');
    try {
        await loadChartCatalog();
        if (body._run !== run) return;
        tile.querySelector('.tile-title').textContent = chartTitle(chart);
        tile.querySelector('.tile-sub').textContent = chartDescription(chart);
        paintTileSort(tile, chart);
        const data = await fetchChartData(chart, scope);
        if (!data || body._run !== run || !tile.isConnected) return;
        tile._data = data;
        drawChart(body, chart, data, asTable);
        body._pick = tile.classList.contains('preview') ? null
            : row => openDrill({ chart, scope, value: row ? row.value : null, label: row ? groupLabel(chart, row.value, true) : '' });
        body.classList.toggle('drillable', Boolean(body._pick) && !asTable);
        const note = tile.querySelector('.chart-note');
        note.textContent = [asTable ? '' : chartNote(chart, data),
            data.skipped?.includes('team') ? "The dashboard's Team filter doesn't apply here: requests have no team." : ''].filter(Boolean).join(' ');
        note.hidden = !note.textContent;
        if (tile.querySelector('.tile-download')) showTileDownload(tile, true);
        const tableButton = tile.querySelector('[data-tile-action="table"]');
        if (tableButton) {
            tableButton.hidden = chart.display === 'table' || chart.display === 'number' || !chart.groupBy;
            tableButton.setAttribute('aria-pressed', String(asTable));
            tableButton.title = asTable ? 'Show the chart' : 'Show as a table';
            tableButton.setAttribute('aria-label', tableButton.title);
        }
    } catch (err) {
        if (body._run !== run) return;
        body._drawn = null;
        body.innerHTML = `<p class="chart-empty error">${escapeHtml(err.message)}</p>`;
        console.error(err);
    } finally {
        if (body._run === run) body.classList.remove('refreshing');
    }
}

// ⇅: the chart's order, picked from its menu (only for charts with groups)
function paintTileSort(tile, chart) {
    const pick = tile.querySelector('[data-tile-sort]');
    if (!pick) return;
    const box = pick.closest('.tile-sort');
    box.hidden = !chart.groupBy || chart.display === 'number';
    if (box.hidden) return;
    const { sort, direction } = chartOrder(chart);
    const choices = chartOrderChoices(chart);
    const current = `${sort}:${direction}`;
    pick.innerHTML = choices.map(([value, label]) => `<option value="${value}"${value === current ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
    box.title = `Order: ${choices.find(([value]) => value === current)?.[1] || ''}`;
}

// A new order from ⇅: your own chart keeps it; a shared dashboard's chart
// changes only on this page
document.addEventListener('change', e => {
    if (!e.target.matches('[data-tile-sort]')) return;
    const tile = e.target.closest('.chart-tile');
    const [sort, direction] = e.target.value.split(':');
    const chart = { ...tile._chart, sort, direction };
    const { where, list, index } = tilePlace(tile);
    if (tile.querySelector('[data-tile-action="edit"]') && index >= 0) {
        if (where === 'home') list[index] = { ...list[index], chart };
        else list[index] = chart;
        savePreference(where === 'home' ? 'home' : 'dashboards');
        if (where === 'board') updateShareSoon(currentBoard());
    }
    fillTile(tile, chart);
});

// The list a tile belongs to: Home's sections, or the open dashboard's charts
function tilePlace(tile) {
    if (tile.closest('#home-blocks')) {
        const list = prefs.home.blocks;
        return { where: 'home', list, index: list.findIndex(b => b.chart?.id === tile.dataset.chartId), chartOf: b => b.chart };
    }
    const board = currentBoard();
    const list = board ? board.charts : [];
    return { where: 'board', list, index: list.findIndex(c => c.id === tile.dataset.chartId), chartOf: c => c };
}

function savePlace(where) {
    if (where === 'home') {
        renderHomeLayout();
        savePreference('home');
    } else {
        renderBoard();
        renderMyDashboards();
        savePreference('dashboards');
        updateShareSoon(currentBoard());
    }
}

// ⤓ under a chart: its numbers in any download format, and (while the chart,
// not its table, is showing) its picture, also placed in PDF, Word and Excel
function showTileDownload(tile, show) {
    tile.querySelector('.tile-download')?.remove();
    tile.querySelector('[data-tile-action="download"]')?.setAttribute('aria-pressed', String(show));
    if (!show || !tile._data) return;
    const chart = tile._chart;
    const subtitle = [chartDescription(chart), scopeDescription(tile._scope)].filter(Boolean).join(' · ');
    const exportId = registerExport({
        title: chartTitle(chart),
        tables: [chartExportTable(chart, tile._data), noteTable('What this chart counts', 'Counts', [subtitle])],
        picture: () => tile._asTable || chart.display === 'table' || !tile._data ? null : { chart, data: tile._data, title: chartTitle(chart), subtitle },
    });
    tile.insertAdjacentHTML('beforeend', `<div class="tile-download">${downloadBarHtml(exportId, 'Download as', { pictures: chart.display !== 'table' })}</div>`);
    paintPictureOptions(tile.querySelector('.tile-download'));
}

function tileAction(tile, action) {
    // These work on any chart, including a shared dashboard's preview
    if (action === 'table') return tile._chart && fillTile(tile, tile._chart, !tile._asTable);
    if (action === 'download') return showTileDownload(tile, !tile.querySelector('.tile-download'));
    const { where, list, index, chartOf } = tilePlace(tile);
    if (index < 0) return;
    const chart = chartOf(list[index]);
    if (action === 'edit') {
        openBuilder({
            chart,
            scope: where === 'board' ? boardScope(currentBoard()) : null,
            onSave: updated => {
                if (where === 'home') list[index] = { type: 'chart', chart: updated };
                else list[index] = updated;
                savePlace(where);
            },
        });
    } else if (action === 'earlier' || action === 'later') {
        const to = index + (action === 'earlier' ? -1 : 1);
        if (to < 0 || to >= list.length) return;
        [list[index], list[to]] = [list[to], list[index]];
        savePlace(where);
        // Keep the keyboard on the chart that moved
        document.querySelector(`.chart-tile[data-chart-id="${CSS.escape(chart.id)}"] [data-tile-action="${action}"]`)?.focus();
    } else if (action === 'pin') {
        prefs.home.blocks.push({ type: 'chart', chart: { ...structuredClone(chart), id: newChartId() } });
        renderHomeLayout();
        savePreference('home');
        showToast(`"${chartTitle(chart)}" is now on your Home page too`);
    } else if (action === 'remove') {
        if (!confirm(`Remove the chart "${chartTitle(chart)}"?`)) return;
        list.splice(index, 1);
        savePlace(where);
        showToast('Chart removed');
    }
}

document.addEventListener('click', e => {
    const button = e.target.closest('[data-tile-action]');
    if (button) tileAction(button.closest('.chart-tile'), button.dataset.tileAction);
});

// ---------------------------------------------------------------------
// HOME LAYOUT: your tickets, dashboard shortcuts and your own charts, in the
// order you choose; "Customize Home" edits it. (The AI assistant is the Ask
// bar in the header, on every page.)
// ---------------------------------------------------------------------

const HOME_SECTIONS = {
    tickets: 'Your tickets',
    shortcuts: 'Your dashboards',
};

function renderHomeLayout() {
    const container = document.getElementById('home-blocks');
    const sections = new Map([...container.querySelectorAll(':scope > [data-block]')].map(el => [el.dataset.block, el]));
    container.querySelectorAll(':scope > .chart-tile').forEach(tile => tile.remove());
    const blocks = prefs.home.blocks;
    blocks.forEach((block, i) => {
        let el;
        if (block.type === 'chart') {
            container.insertAdjacentHTML('beforeend', tileHtml(block.chart, HOME_TILE_BUTTONS, 'home-block'));
            el = container.lastElementChild;
            fillTile(el, block.chart);
        } else {
            el = sections.get(block.type);
            if (!el) return;
            el.hidden = false;
            container.appendChild(el);
            addSectionBar(el);
            el.querySelector('[data-block-action="up"]').disabled = i === 0;
            el.querySelector('[data-block-action="down"]').disabled = i === blocks.length - 1;
        }
    });
    for (const [type, el] of sections) {
        if (!blocks.some(b => b.type === type)) el.hidden = true;
    }
    // Hidden sections can be added back while customizing
    const missing = Object.keys(HOME_SECTIONS).filter(type => !blocks.some(b => b.type === type));
    document.getElementById('home-add-back').innerHTML = missing.map(type =>
        `<button type="button" class="home-action" data-add-section="${type}">＋ ${escapeHtml(HOME_SECTIONS[type])}</button>`).join('');
    const empty = document.getElementById('home-empty');
    empty.hidden = blocks.length > 0;
    renderShortcuts();
}

// Each section's bar while customizing: its name, move up / down, hide
function addSectionBar(section) {
    if (section.querySelector(':scope > .block-bar')) return;
    section.insertAdjacentHTML('afterbegin', `<div class="block-bar"><span class="block-name">${escapeHtml(HOME_SECTIONS[section.dataset.block])}</span>` +
        '<button type="button" class="home-action" data-block-action="up">▲ Move up</button>' +
        '<button type="button" class="home-action" data-block-action="down">▼ Move down</button>' +
        '<button type="button" class="home-action" data-block-action="hide">Hide</button></div>');
}

function toggleHomeEditing(on) {
    const home = document.getElementById('home');
    const editing = typeof on === 'boolean' ? on : !home.classList.contains('editing');
    home.classList.toggle('editing', editing);
    document.getElementById('home-edit-bar').hidden = !editing;
    const button = document.getElementById('customize-home-btn');
    button.setAttribute('aria-pressed', String(editing));
    button.textContent = editing ? '✓ Done' : '✏️ Customize Home';
}

function addHomeChart() {
    openBuilder({
        onSave: chart => {
            prefs.home.blocks.push({ type: 'chart', chart });
            renderHomeLayout();
            savePreference('home');
            document.querySelector(`#home-blocks .chart-tile[data-chart-id="${CSS.escape(chart.id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        },
    });
}

function resetHomeLayout() {
    if (!confirm('Reset Home? The sections go back to the default order, and the charts you added to Home are removed. Your dashboards are not affected.')) return;
    prefs.home = defaultHome();
    renderHomeLayout();
    savePreference('home');
    showToast('Home is back to the default');
}

document.addEventListener('click', e => {
    const action = e.target.closest('[data-block-action]');
    if (action) {
        const type = action.closest('[data-block]').dataset.block;
        const blocks = prefs.home.blocks;
        const index = blocks.findIndex(b => b.type === type);
        if (index < 0) return;
        const what = action.dataset.blockAction;
        if (what === 'hide') {
            blocks.splice(index, 1);
            showToast(`${HOME_SECTIONS[type]} is hidden. Add it back from Customize Home.`);
        } else {
            const to = index + (what === 'up' ? -1 : 1);
            if (to < 0 || to >= blocks.length) return;
            [blocks[index], blocks[to]] = [blocks[to], blocks[index]];
        }
        renderHomeLayout();
        savePreference('home');
        if (what !== 'hide') document.querySelector(`[data-block="${type}"] [data-block-action="${what}"]:not(:disabled)`)?.focus();
        return;
    }
    const add = e.target.closest('[data-add-section]');
    if (add) {
        prefs.home.blocks.push({ type: add.dataset.addSection });
        renderHomeLayout();
        savePreference('home');
    }
});

// The "Your dashboards" section: one button per dashboard of your own
function renderShortcuts() {
    const list = document.getElementById('home-shortcuts');
    const boards = prefs.dashboards.boards;
    list.innerHTML = boards.map(b => `<button type="button" class="shortcut" data-open-board="${escapeHtml(b.id)}">` +
        `<span class="shortcut-name">${escapeHtml(b.name)}</span><span class="shortcut-desc">${chartCount(b.charts.length)}</span></button>`).join('') +
        '<button type="button" class="shortcut new" onclick="newBoard()"><span class="shortcut-name">＋ New dashboard</span><span class="shortcut-desc">Pick the data and how it\'s shown</span></button>' +
        '<button type="button" class="shortcut" onclick="switchTab(\'dashboard\')"><span class="shortcut-name">📈 Team dashboards</span><span class="shortcut-desc">The shared Metabase dashboards</span></button>';
}

const chartCount = n => `${n} ${n === 1 ? 'chart' : 'charts'}`;

// ---------------------------------------------------------------------
// MY DASHBOARDS: dashboards each person builds from their own charts,
// listed at the top of the Dashboards drawer
// ---------------------------------------------------------------------

let currentBoardId = null;

function currentBoard() {
    return prefs.dashboards.boards.find(b => b.id === currentBoardId) || null;
}

// The drawer's "My dashboards" list (and Home's shortcuts)
function renderMyDashboards() {
    const list = document.getElementById('my-dashboards-list');
    const boards = prefs.dashboards.boards;
    list.innerHTML = boards.length
        ? boards.map(b => `<button type="button" class="dashboard-choice${b.id === currentBoardId ? ' active' : ''}" data-board="${escapeHtml(b.id)}"${b.id === currentBoardId ? ' aria-current="page"' : ''}>` +
            `<span class="dashboard-choice-name">${escapeHtml(b.name)}</span><span class="dashboard-choice-desc">${chartCount(b.charts.length)}</span></button>`).join('')
        : '<p class="drawer-note">Build a dashboard of your own: choose the data each chart shows and how it\'s drawn.</p>';
    renderShortcuts();
}

function showBoard(id) {
    const board = prefs.dashboards.boards.find(b => b.id === id);
    if (!board) return false;
    hideFamilies();
    currentBoardId = id;
    document.getElementById('dashboard-frame').hidden = true;
    document.getElementById('dashboard-message').hidden = true;
    document.getElementById('dashboard-star').hidden = true;
    document.getElementById('board-view').hidden = false;
    document.querySelectorAll('.dashboard-choice').forEach(b => {
        const on = b.dataset.board === id;
        b.classList.toggle('active', on);
        if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    rememberDashboard(`my:${id}`);
    renderBoard();
    return true;
}

// Back to the team dashboards' frame
function hideBoard() {
    currentBoardId = null;
    document.getElementById('board-view').hidden = true;
    document.querySelectorAll('.dashboard-choice[data-board]').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
}

// From Home's shortcuts
async function openBoard(id) {
    toggleAssistant(false);
    switchTab('dashboard');
    await loadDashboards();
    showBoard(id);
}

function renderBoard() {
    const board = currentBoard();
    if (!board) return;
    setDashboardHeading('My dashboards', board.name, chartCount(board.charts.length), false);
    document.getElementById('dashboard-hint').hidden = true;
    paintBoardFilters();
    paintShareButton();
    const grid = document.getElementById('board-grid');
    if (!board.charts.length) {
        grid.innerHTML = '<div class="board-empty"><p class="board-empty-title">This dashboard has no charts yet.</p>' +
            '<p>Add a chart and choose what it counts (incidents, changes, requests or tasks), which ones, how to group them, and how to draw it. Or start from a ready-made set and change it from there.</p>' +
            '<div class="board-empty-actions"><button type="button" class="primary-btn" onclick="addBoardChart()">＋ Add a chart</button>' +
            '<button type="button" class="home-action" onclick="addSuggestedCharts()">✨ Add suggested charts</button></div></div>';
        return;
    }
    grid.innerHTML = board.charts.map(c => tileHtml(c, BOARD_TILE_BUTTONS)).join('');
    grid.querySelectorAll('.chart-tile').forEach((tile, i) => fillTile(tile, board.charts[i], false, boardScope(board)));
}

const emptyScope = () => ({ dates: { preset: 'all' }, teams: [] });

// The dashboard's filter row, or null when it filters nothing (so the charts
// share their numbers with the same charts elsewhere)
function boardScope(board) {
    const scope = board?.scope;
    return scope && (scope.dates?.preset !== 'all' || scope.teams?.length) ? scope : null;
}

const SUGGESTED_CHARTS = [
    { source: 'incident', status: 'open', display: 'number', size: 'small' },
    { source: 'change_request', status: 'open', display: 'number', size: 'small' },
    { source: 'sc_task', status: 'open', display: 'number', size: 'small' },
    { source: 'incident', groupBy: 'created_day', display: 'area', size: 'large' },
    { source: 'incident', status: 'open', groupBy: 'priority', sort: 'label', display: 'bar' },
    { source: 'change_request', groupBy: 'risk', display: 'donut' },
    { source: 'sc_req_item', groupBy: 'item', display: 'hbar' },
    { source: 'sc_task', status: 'open', groupBy: 'assignment_group', display: 'hbar', color: '7' },
];

function addSuggestedCharts() {
    const board = currentBoard();
    if (!board) return;
    board.charts.push(...SUGGESTED_CHARTS.map(chartWithDefaults));
    savePlace('board');
}

async function newBoard() {
    if (prefs.dashboards.boards.length >= 20) {
        showToast('You can have up to 20 dashboards of your own. Delete one first.');
        return;
    }
    const name = await askText({ title: 'New dashboard', label: 'Name', value: `My dashboard ${prefs.dashboards.boards.length + 1}`, action: 'Create' });
    if (!name) return;
    const board = { id: newChartId(), name: name.slice(0, 60), charts: [], scope: emptyScope() };
    prefs.dashboards.boards.push(board);
    savePreference('dashboards');
    renderMyDashboards();
    toggleAssistant(false);
    switchTab('dashboard');
    await loadDashboards();
    toggleDashboardDrawer(false);
    showBoard(board.id);
}

async function renameBoard() {
    const board = currentBoard();
    if (!board) return;
    const name = await askText({ title: 'Rename dashboard', label: 'Name', value: board.name });
    if (!name) return;
    board.name = name.slice(0, 60);
    savePlace('board');
}

function deleteBoard() {
    const board = currentBoard();
    if (!board || !confirm(`Delete the dashboard "${board.name}" and its ${chartCount(board.charts.length)}? This can't be undone.`)) return;
    prefs.dashboards.boards = prefs.dashboards.boards.filter(b => b !== board);
    hideBoard();
    renderMyDashboards();
    savePreference('dashboards');
    // Its link stops working too
    if (sharedBoards.has(board.id)) stopSharing(board, true);
    showToast(`Deleted "${board.name}"`);
    showFirstDashboard();
}

function addBoardChart() {
    const board = currentBoard();
    if (!board) return;
    if (board.charts.length >= 30) {
        showToast('A dashboard can hold up to 30 charts. Remove one or start another dashboard.');
        return;
    }
    openBuilder({
        scope: boardScope(board),
        onSave: chart => {
            board.charts.push(chart);
            savePlace('board');
            document.querySelector(`#board-grid .chart-tile[data-chart-id="${CSS.escape(chart.id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        },
    });
}

document.addEventListener('click', e => {
    const choice = e.target.closest('[data-board]');
    if (choice && choice.closest('#my-dashboards-list')) {
        showBoard(choice.dataset.board);
        toggleDashboardDrawer(false);
        return;
    }
    const shortcut = e.target.closest('[data-open-board]');
    if (shortcut) openBoard(shortcut.dataset.openBoard);
});

// ---------------------------------------------------------------------
// Team dashboards each person hides from their drawer ("Show or hide")
// ---------------------------------------------------------------------

let drawerEditing = false;

const isDashboardHidden = key => prefs.dashboards.hidden.includes(key);

function applyHiddenDashboards() {
    document.querySelectorAll('#dashboard-picker .dashboard-choice').forEach(b => {
        const hidden = isDashboardHidden(b.dataset.key);
        b.classList.toggle('is-hidden', hidden);
        b.hidden = hidden && !drawerEditing;
        b.title = drawerEditing ? (hidden ? 'Hidden: click to show it in your list' : 'Shown: click to hide it from your list') : '';
        if (drawerEditing) b.setAttribute('aria-pressed', String(!hidden)); else b.removeAttribute('aria-pressed');
    });
    document.querySelectorAll('#dashboard-picker .drawer-group').forEach(g => {
        g.hidden = !drawerEditing && [...g.querySelectorAll('.dashboard-choice')].every(b => b.hidden);
    });
    const count = prefs.dashboards.hidden.length;
    document.getElementById('drawer-hidden-note').textContent = !drawerEditing && count
        ? `${count} team ${count === 1 ? 'dashboard is' : 'dashboards are'} hidden.` : '';
}

function toggleDrawerEditing(on) {
    drawerEditing = typeof on === 'boolean' ? on : !drawerEditing;
    document.getElementById('dashboard-drawer').classList.toggle('editing', drawerEditing);
    const button = document.getElementById('drawer-customize');
    button.textContent = drawerEditing ? '✓ Done' : '👁 Show or hide team dashboards';
    button.setAttribute('aria-pressed', String(drawerEditing));
    applyHiddenDashboards();
}

function toggleDashboardHidden(key) {
    const hidden = prefs.dashboards.hidden;
    prefs.dashboards.hidden = hidden.includes(key) ? hidden.filter(k => k !== key) : [...hidden, key];
    applyHiddenDashboards();
    savePreference('dashboards');
}

// ---------------------------------------------------------------------
// THE CHART BUILDER: what to count, which ones, grouped by what, and how
// it's drawn, with a live preview
// ---------------------------------------------------------------------

const DISPLAY_CHOICES = [
    ['bar', 'Columns', '<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="6" width="4" height="15" rx="1"/><rect x="17" y="9" width="4" height="12" rx="1"/>'],
    ['hbar', 'Sideways bars', '<rect x="3" y="3" width="15" height="4" rx="1"/><rect x="3" y="10" width="10" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/>'],
    ['line', 'Line', '<polyline points="3,18 9,11 14,14 21,5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'],
    ['area', 'Area', '<path d="M3,18 L9,11 L14,14 L21,5 L21,21 L3,21Z" opacity="0.35"/><polyline points="3,18 9,11 14,14 21,5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'],
    ['donut', 'Donut', '<path d="M12 3a9 9 0 1 1-9 9h4.5A4.5 4.5 0 1 0 12 7.5Z"/><path d="M3 12a9 9 0 0 1 9-9v4.5A4.5 4.5 0 0 0 7.5 12Z" opacity="0.45"/>'],
    ['table', 'Table', '<rect x="3" y="4" width="18" height="3" rx="1"/><rect x="3" y="10" width="18" height="2" rx="1" opacity="0.6"/><rect x="3" y="15" width="18" height="2" rx="1" opacity="0.6"/>'],
    ['number', 'One number', '<text x="12" y="17" text-anchor="middle" font-size="13" font-weight="700" font-family="sans-serif">123</text>'],
];
const COLOR_CHOICES = [['accent', 'Your accent color'], ...['Blue', 'Orange', 'Aqua', 'Yellow', 'Pink', 'Green', 'Violet', 'Red'].map((name, i) => [String(i + 1), name])];
const DATE_CHOICES = [['all', 'Any time'], ['7', 'In the last 7 days of the data'], ['30', 'In the last 30 days of the data'], ['90', 'In the last 90 days of the data'], ['custom', 'Between two dates…']];
const LIMIT_CHOICES = [5, 10, 15, 20, 30, 50];
const MAX_CHART_FILTERS = 6;

let builder = null; // { draft, onSave }
const filterValueCache = new Map();

function loadFilterValues(source, field) {
    const key = `${source}.${field}`;
    if (!filterValueCache.has(key)) {
        const pending = (async () => {
            const response = await fetch(`${API_BASE}/api/charts/values`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ source, field }),
            });
            if (handleUnauthorized(response)) return [];
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
            return data.values;
        })();
        filterValueCache.set(key, pending);
        pending.catch(() => filterValueCache.delete(key));
    }
    return filterValueCache.get(key);
}

// The builder's fixed choices, drawn once
function buildBuilder() {
    const radios = (name, choices, cls = 'choice-pill') => choices.map(([value, label]) =>
        `<label class="${cls}"><input type="radio" name="${name}" value="${value}"><span>${escapeHtml(label)}</span></label>`).join('');
    document.getElementById('b-status').innerHTML = radios('b-status', [['all', 'All'], ['open', 'Open only'], ['closed', 'Closed only']]);
    document.getElementById('b-dates').innerHTML = DATE_CHOICES.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('');
    document.getElementById('b-limit').innerHTML = LIMIT_CHOICES.map(n => `<option value="${n}">Top ${n}</option>`).join('');
    document.getElementById('b-display').innerHTML = DISPLAY_CHOICES.map(([value, label, icon]) =>
        `<label class="display-choice"><input type="radio" name="b-display" value="${value}">` +
        `<span><svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">${icon}</svg>${escapeHtml(label)}</span></label>`).join('');
    document.getElementById('b-colors').innerHTML = COLOR_CHOICES.map(([value, name]) =>
        `<label class="swatch" title="${escapeHtml(name)}"><input type="radio" name="b-color" value="${value}" aria-label="${escapeHtml(name)}">` +
        `<span style="background:${value === 'accent' ? 'var(--accent)' : `var(--series-${value})`}"></span></label>`).join('');
    document.getElementById('b-sizes').innerHTML = radios('b-size', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Wide']]);

    const form = document.getElementById('builder-form');
    form.addEventListener('input', builderInput);
    form.addEventListener('change', builderInput);
    form.addEventListener('submit', e => {
        e.preventDefault();
        saveBuilder();
    });
    // Enter in the choices' search box searches; it doesn't save the chart
    form.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.matches('.filter-search')) e.preventDefault();
    });
    document.getElementById('b-add-filter').addEventListener('click', () => {
        const src = chartCatalog.sources[builder.draft.source];
        const used = new Set(builder.draft.filters.map(f => f.field));
        const field = src.fields.find(([key]) => !used.has(key));
        if (!field || builder.draft.filters.length >= MAX_CHART_FILTERS) return;
        builder.draft.filters.push({ field: field[0], op: 'equals', values: [] });
        paintFilters();
        document.querySelector('#b-filters .filter-row:last-child select')?.focus();
    });
    document.getElementById('b-filters').addEventListener('click', e => {
        const remove = e.target.closest('[data-remove-filter]');
        if (!remove) return;
        builder.draft.filters.splice(Number(remove.dataset.removeFilter), 1);
        paintFilters();
        previewSoon();
    });
}

// chart: the chart to edit (or to start from); scope: the dashboard's filter row,
// shown in the preview; destination: ask where to save (Home, a dashboard, a new one);
// note: a line at the top (e.g. what didn't carry over from an AI answer)
let lastDestination = 'home';
async function openBuilder({ chart = null, onSave, scope = null, destination = false, note = '' }) {
    try {
        if (!await loadChartCatalog()) return;
    } catch (err) {
        showToast(`${err.message}`, 'error');
        return;
    }
    const editing = Boolean(chart) && !destination;
    builder = {
        draft: structuredClone(chart || chartWithDefaults({ source: 'incident', groupBy: 'priority', sort: 'label', display: 'bar' })),
        onSave,
        scope,
        destination,
    };
    builder.draft.filters = builder.draft.filters.map(f => ({ ...f, op: f.op || 'equals', values: [...f.values] }));
    document.getElementById('builder-title').textContent = editing ? 'Edit chart' : destination ? 'Save as a chart' : 'Add a chart';
    document.getElementById('b-save').textContent = editing ? 'Save changes' : destination ? 'Save chart' : 'Add chart';
    const noteBox = document.getElementById('b-note');
    noteBox.textContent = note;
    noteBox.hidden = !note;
    const scopeNote = document.getElementById('b-scope-note');
    scopeNote.textContent = scope ? `The dashboard's filters apply too: ${scopeDescription(scope)}.` : '';
    scopeNote.hidden = !scope;
    const dest = document.getElementById('b-dest');
    document.getElementById('b-dest-row').hidden = !destination;
    if (destination) {
        dest.innerHTML = '<option value="home">My Home page</option>' +
            prefs.dashboards.boards.map(b => `<option value="${escapeHtml(b.id)}">Dashboard: ${escapeHtml(b.name)}</option>`).join('') +
            '<option value="new">＋ A new dashboard…</option>';
        dest.value = [...dest.options].some(o => o.value === lastDestination) ? lastDestination : 'home';
    }
    document.getElementById('b-source').innerHTML = Object.entries(chartCatalog.sources)
        .map(([key, s]) => `<option value="${key}">${escapeHtml(s.label)}</option>`).join('');
    paintBuilder();
    document.getElementById('chart-builder').showModal();
    document.getElementById('b-source').focus();
    previewSoon(0);
}

function closeBuilder() {
    document.getElementById('chart-builder').close();
}

// The form, from the draft
function paintBuilder() {
    const d = builder.draft;
    const src = chartCatalog.sources[d.source];
    document.getElementById('b-title').value = d.title;
    document.getElementById('b-source').value = d.source;
    document.querySelectorAll('input[name="b-status"]').forEach(r => { r.checked = r.value === d.status; });
    document.getElementById('b-status-note').textContent = `Open = ${src.openStates.join(', ')}. Closed = ${src.closedStates.join(', ')}.`;
    document.getElementById('b-dates').value = d.dates.preset;
    const from = document.getElementById('b-from'), to = document.getElementById('b-to');
    for (const input of [from, to]) { input.min = src.days.first; input.max = src.days.last; }
    from.value = d.dates.from || '';
    to.value = d.dates.to || '';
    document.getElementById('b-range').hidden = d.dates.preset !== 'custom';
    document.getElementById('b-dates-note').textContent = `This data covers ${fmtDay(src.days.first)} to ${fmtDay(src.days.last)}.`;
    document.getElementById('b-group').innerHTML =
        `<option value="">Nothing: show one total</option>` +
        `<optgroup label="Group by">${src.fields.map(([k, l]) => `<option value="${k}">${escapeHtml(l)}</option>`).join('')}</optgroup>` +
        `<optgroup label="Over time">${src.times.map(([k, l]) => `<option value="${k}">${escapeHtml(l)}</option>`).join('')}</optgroup>`;
    document.getElementById('b-group').value = d.groupBy;
    document.getElementById('b-limit').value = String(d.limit);
    document.querySelectorAll('input[name="b-size"]').forEach(r => { r.checked = r.value === d.size; });
    document.querySelectorAll('input[name="b-color"]').forEach(r => { r.checked = r.value === d.color; });
    paintFilters();
    paintDisplay();
}

// The parts that depend on the grouping and the drawing
function paintDisplay() {
    const d = builder.draft;
    const grouped = Boolean(d.groupBy);
    if (!grouped) d.display = 'number';
    document.querySelectorAll('input[name="b-display"]').forEach(r => {
        r.checked = r.value === d.display;
        r.disabled = !grouped && r.value !== 'number';
    });
    document.getElementById('b-display-note').textContent = grouped
        ? (isTimeField(d.groupBy) && ['bar', 'hbar', 'donut'].includes(d.display) ? 'Tip: Line or Area shows a trend over time best.' : '')
        : 'Choose something to group by to draw a chart; with nothing to group by, the chart is one number.';
    // Top N: only for categories (time always shows every period). Order: either
    // way, by count or by the groups (over time: oldest or newest first)
    document.getElementById('b-cut').hidden = !grouped || d.display === 'number';
    document.getElementById('b-limit-wrap').hidden = isTimeField(d.groupBy);
    if (grouped) {
        const { sort, direction } = chartOrder(d);
        document.getElementById('b-sort').innerHTML = chartOrderChoices(d)
            .map(([value, label]) => `<option value="${value}"${value === `${sort}:${direction}` ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
    }
    document.getElementById('b-color-row').hidden = !['bar', 'hbar', 'line', 'area'].includes(d.display);
    document.getElementById('b-title').placeholder = `${chartAutoTitle(d)} (automatic)`;
}

async function paintFilters() {
    const d = builder.draft;
    const src = chartCatalog.sources[d.source];
    const box = document.getElementById('b-filters');
    box.innerHTML = d.filters.map((f, i) => {
        const others = new Set(d.filters.filter((_, j) => j !== i).map(g => g.field));
        const options = src.fields.filter(([k]) => !others.has(k)).map(([k, l]) => `<option value="${k}"${k === f.field ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('');
        const ops = FILTER_OP_CHOICES.map(([v, l]) => `<option value="${v}"${v === f.op ? ' selected' : ''}>${l}</option>`).join('');
        // "contains": words to type; "is" / "is not": choices to tick
        const values = f.op === 'contains'
            ? `<input type="text" class="filter-text" data-filter-text="${i}" value="${escapeHtml(f.values.join(', '))}" placeholder="A word or two, e.g. WINTEL (commas for more than one)" aria-label="Words to look for">`
            : `<input type="search" class="filter-search" data-filter-search="${i}" placeholder="Search the choices…" aria-label="Search the choices">` +
              `<div class="filter-values" data-filter-values="${i}"><p class="chart-loading">Loading choices…</p></div>`;
        return `<div class="filter-row" data-filter="${i}"><div class="filter-top">` +
            `<label class="filter-field"><span>Only where</span><select data-filter-field="${i}">${options}</select></label>` +
            `<label class="filter-field filter-op"><span>Match</span><select data-filter-op="${i}">${ops}</select></label>` +
            `<span class="filter-count" data-filter-count="${i}"></span>` +
            `<button type="button" class="tile-btn" data-remove-filter="${i}" title="Remove this condition" aria-label="Remove this condition">✕</button></div>` +
            values + '</div>';
    }).join('');
    document.getElementById('b-add-filter').hidden = d.filters.length >= Math.min(MAX_CHART_FILTERS, src.fields.length);
    d.filters.forEach((f, i) => f.op === 'contains' ? paintFilterCount(i) : paintFilterValues(i));
}

const FILTER_OP_CHOICES = [['equals', 'is one of'], ['notEquals', 'is none of'], ['contains', 'contains']];

async function paintFilterValues(i) {
    const d = builder.draft;
    const f = d.filters[i];
    const box = document.querySelector(`[data-filter-values="${i}"]`);
    if (!f || !box) return;
    try {
        const values = await loadFilterValues(d.source, f.field);
        if (builder?.draft !== d || d.filters[i] !== f || !box.isConnected) return;
        const search = (document.querySelector(`[data-filter-search="${i}"]`)?.value || '').trim().toLowerCase();
        const chosen = new Set(f.values);
        // Chosen ones first, then the rest by how common they are
        const list = [...values.filter(v => chosen.has(v.value)), ...values.filter(v => !chosen.has(v.value))]
            .filter(v => !search || v.value.toLowerCase().includes(search));
        const shown = list.slice(0, 100);
        box.innerHTML = shown.map(v => `<label class="filter-value"><input type="checkbox" data-filter-value="${i}" value="${escapeHtml(v.value)}"${chosen.has(v.value) ? ' checked' : ''}>` +
            `<span class="filter-value-name">${escapeHtml(groupLabel({ groupBy: f.field }, v.value))}</span><span class="filter-value-count">${v.count.toLocaleString()}</span></label>`).join('') +
            (list.length > shown.length ? `<p class="filter-more">${(list.length - shown.length).toLocaleString()} more: search to find them</p>` : '') +
            (!list.length ? '<p class="filter-more">Nothing matches that search.</p>' : '');
        paintFilterCount(i);
    } catch (err) {
        box.innerHTML = `<p class="chart-empty error">${escapeHtml(err.message)}</p>`;
    }
}

function paintFilterCount(i) {
    const f = builder.draft.filters[i];
    const count = document.querySelector(`[data-filter-count="${i}"]`);
    if (!f || !count) return;
    if (f.op === 'contains') count.textContent = f.values.length ? '' : 'Type a word';
    else count.textContent = f.values.length ? `${f.values.length} chosen` : 'Pick one or more';
}

// Every change in the form updates the draft, the dependent parts, and the preview
function builderInput(e) {
    const t = e.target;
    const d = builder?.draft;
    if (!d) return;
    if (t.id === 'b-title') { d.title = t.value; previewSoon(); return; }
    if (t.matches('.filter-search')) { if (e.type === 'input') paintFilterValues(Number(t.dataset.filterSearch)); return; }
    if (t.matches('[data-filter-text]')) {
        const f = d.filters[Number(t.dataset.filterText)];
        f.values = t.value.split(',').map(v => v.trim()).filter(Boolean).slice(0, 10);
        paintFilterCount(Number(t.dataset.filterText));
        previewSoon(500);
        return;
    }
    if (t.id === 'b-dest') { lastDestination = t.value; return; }
    if (e.type === 'input' && t.type !== 'color' && t.type !== 'date') return; // selects and radios: on change
    if (t.id === 'b-source') {
        d.source = t.value;
        const src = chartCatalog.sources[d.source];
        if (![...src.fields, ...src.times].some(([k]) => k === d.groupBy)) d.groupBy = src.fields[0][0];
        d.filters = []; // the fields differ between ticket types
        paintBuilder();
    } else if (t.name === 'b-status') {
        d.status = t.value;
        paintDisplay();
    } else if (t.id === 'b-dates') {
        d.dates = t.value === 'custom' ? { preset: 'custom', from: document.getElementById('b-from').value, to: document.getElementById('b-to').value } : { preset: t.value };
        document.getElementById('b-range').hidden = t.value !== 'custom';
    } else if (t.id === 'b-from' || t.id === 'b-to') {
        d.dates = { preset: 'custom', from: document.getElementById('b-from').value, to: document.getElementById('b-to').value };
    } else if (t.matches('[data-filter-field]')) {
        const f = d.filters[Number(t.dataset.filterField)];
        d.filters[Number(t.dataset.filterField)] = { field: t.value, op: f.op === 'contains' ? 'contains' : f.op, values: [] };
        paintFilters();
    } else if (t.matches('[data-filter-op]')) {
        const f = d.filters[Number(t.dataset.filterOp)];
        // Ticked choices carry over between "is" and "is not"; typed words don't
        if ((f.op === 'contains') !== (t.value === 'contains')) f.values = [];
        f.op = t.value;
        paintFilters();
    } else if (t.matches('[data-filter-value]')) {
        const f = d.filters[Number(t.dataset.filterValue)];
        f.values = t.checked ? [...f.values, t.value] : f.values.filter(v => v !== t.value);
        paintFilterCount(Number(t.dataset.filterValue));
    } else if (t.id === 'b-group') {
        const wasGrouped = Boolean(d.groupBy);
        const wasTime = isTimeField(d.groupBy);
        d.groupBy = t.value;
        if (d.groupBy && !wasGrouped) d.display = isTimeField(d.groupBy) ? 'line' : 'bar';
        else if (isTimeField(d.groupBy) && ['hbar', 'donut'].includes(d.display)) d.display = 'line';
        // From categories to time or back: the usual order for it (oldest first; biggest first)
        if (isTimeField(d.groupBy) !== wasTime) Object.assign(d, isTimeField(d.groupBy) ? { sort: 'label', direction: 'asc' } : { sort: 'count', direction: 'desc' });
        paintDisplay();
    } else if (t.name === 'b-display') {
        d.display = t.value;
        paintDisplay();
    } else if (t.id === 'b-limit') {
        d.limit = Number(t.value);
    } else if (t.id === 'b-sort') {
        [d.sort, d.direction] = t.value.split(':');
    } else if (t.name === 'b-color') {
        d.color = t.value;
    } else if (t.name === 'b-size') {
        d.size = t.value;
    } else {
        return;
    }
    previewSoon();
}

// The chart as it will be saved (conditions with nothing chosen are left out)
function builderChart() {
    const d = builder.draft;
    return { ...d, title: d.title.replace(/\s+/g, ' ').trim().slice(0, 80), filters: d.filters.filter(f => f.values.length).map(f => ({ ...f })) };
}

let previewTimer = null;
function previewSoon(delay = 250) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, delay);
}

function renderPreview() {
    if (!builder) return;
    const chart = builderChart();
    const box = document.getElementById('b-preview');
    let tile = box.querySelector('.chart-tile');
    if (!tile || !tile.classList.contains(`size-${chart.size}`)) {
        box.innerHTML = tileHtml(chart, [], 'preview');
        tile = box.querySelector('.chart-tile');
    }
    fillTile(tile, chart, false, builder.scope);
}

function saveBuilder() {
    if (!builder) return;
    const chart = builderChart();
    const { onSave, destination } = builder;
    const dest = document.getElementById('b-dest').value;
    if (destination) lastDestination = dest;
    closeBuilder();
    onSave(chart, destination ? dest : undefined);
}

document.getElementById('chart-builder').addEventListener('close', () => {
    builder = null;
    clearTimeout(previewTimer);
    document.getElementById('b-preview').innerHTML = '';
    hideChartTip();
});

// Once this person's preferences are in: which of their dashboards are
// shared, then a shared link they opened, or else the first-visit tour
async function afterPreferences() {
    await loadShares();
    if (!await openSharedLink()) maybeStartTour();
}

// ---------------------------------------------------------------------
// A DASHBOARD'S FILTER ROW: when the tickets were opened, and which teams,
// for every chart on it at once (on top of each chart's own choices).
// Saved with the dashboard.
// ---------------------------------------------------------------------

// The Team filter's choices: the ServiceNow teams in this person's tickets, busiest
// first. (Not "loadTeams": that's the Team tab's, in teams.js, and the page's
// scripts share one scope, so the later one would replace this.)
let teamValuesLoading = null;
function loadTeamValues() {
    if (!teamValuesLoading) {
        teamValuesLoading = (async () => {
            const response = await fetch(`${API_BASE}/api/charts/teams`, { headers: authHeaders() });
            if (handleUnauthorized(response)) return [];
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
            return data.values;
        })();
        teamValuesLoading.catch(() => { teamValuesLoading = null; });
    }
    return teamValuesLoading;
}

function buildBoardFilters() {
    document.getElementById('bf-dates').innerHTML = DATE_CHOICES.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('');
    const pop = document.getElementById('bf-team-pop');
    const button = document.getElementById('bf-team-btn');
    document.getElementById('bf-dates').addEventListener('change', e => {
        const board = currentBoard();
        setBoardScope({ dates: e.target.value === 'custom' ? { preset: 'custom', from: board?.scope?.dates?.from || '', to: board?.scope?.dates?.to || '' } : { preset: e.target.value } });
    });
    for (const id of ['bf-from', 'bf-to']) {
        document.getElementById(id).addEventListener('change', () => setBoardScope({
            dates: { preset: 'custom', from: document.getElementById('bf-from').value, to: document.getElementById('bf-to').value },
        }));
    }
    button.addEventListener('click', () => {
        pop.hidden = !pop.hidden;
        button.setAttribute('aria-expanded', String(!pop.hidden));
        if (!pop.hidden) {
            paintTeamList();
            document.getElementById('bf-team-search').focus();
        }
    });
    document.getElementById('bf-team-search').addEventListener('input', paintTeamList);
    document.getElementById('bf-team-list').addEventListener('change', e => {
        const board = currentBoard();
        if (!board || !e.target.matches('input[type="checkbox"]')) return;
        const teams = board.scope?.teams || [];
        if (teams.length >= 30 && e.target.checked) {
            e.target.checked = false;
            showToast('Up to 30 teams at once.');
            return;
        }
        setBoardScope({ teams: e.target.checked ? [...teams, e.target.value] : teams.filter(t => t !== e.target.value) }, false);
    });
    document.getElementById('bf-team-clear').addEventListener('click', () => { setBoardScope({ teams: [] }); paintTeamList(); });
    document.getElementById('bf-team-done').addEventListener('click', () => { pop.hidden = true; button.setAttribute('aria-expanded', 'false'); button.focus(); });
    document.getElementById('bf-clear').addEventListener('click', () => setBoardScope(emptyScope()));
    // A click elsewhere closes the team list
    document.addEventListener('pointerdown', e => {
        if (!pop.hidden && !pop.contains(e.target) && e.target !== button) {
            pop.hidden = true;
            button.setAttribute('aria-expanded', 'false');
        }
    });
}

function paintBoardFilters() {
    const board = currentBoard();
    if (!board) return;
    const scope = { ...emptyScope(), ...board.scope };
    document.getElementById('bf-dates').value = scope.dates.preset;
    document.getElementById('bf-range').hidden = scope.dates.preset !== 'custom';
    const from = document.getElementById('bf-from'), to = document.getElementById('bf-to');
    from.value = scope.dates.from || '';
    to.value = scope.dates.to || '';
    if (chartCatalog) {
        const days = Object.values(chartCatalog.sources).map(s => s.days);
        for (const input of [from, to]) {
            input.min = days.map(d => d.first).sort()[0];
            input.max = days.map(d => d.last).sort().at(-1);
        }
    }
    const teams = scope.teams;
    document.getElementById('bf-team-btn').textContent = teams.length ? `Team: ${teams.length === 1 ? teams[0] : `${teams.length} teams`} ▾` : 'Team: any ▾';
    document.getElementById('bf-team-btn').classList.toggle('on', teams.length > 0);
    document.getElementById('bf-clear').hidden = !boardScope(board);
}

// repaint: also redraw the team list (not while someone is ticking boxes in it)
function setBoardScope(change, repaint = true) {
    const board = currentBoard();
    if (!board) return;
    board.scope = { ...emptyScope(), ...board.scope, ...change };
    paintBoardFilters();
    if (repaint && !document.getElementById('bf-team-pop').hidden) paintTeamList();
    refreshBoardTilesSoon();
    savePreference('dashboards');
    updateShareSoon(board);
}

// Every chart on the dashboard, again with the new filters (keeping its drawing, dimmed, meanwhile)
let boardRefreshTimer = null;
function refreshBoardTilesSoon() {
    clearTimeout(boardRefreshTimer);
    boardRefreshTimer = setTimeout(() => {
        const board = currentBoard();
        if (!board) return;
        document.querySelectorAll('#board-grid .chart-tile').forEach((tile, i) => {
            if (board.charts[i]) fillTile(tile, board.charts[i], tile._asTable, boardScope(board));
        });
    }, 300);
}

async function paintTeamList() {
    const list = document.getElementById('bf-team-list');
    const board = currentBoard();
    if (!board) return;
    try {
        if (!list.children.length) list.innerHTML = '<p class="chart-loading">Loading teams…</p>';
        const values = await loadTeamValues();
        const search = document.getElementById('bf-team-search').value.trim().toLowerCase();
        const chosen = new Set(board.scope?.teams || []);
        const all = [...values.filter(v => chosen.has(v.value)), ...values.filter(v => !chosen.has(v.value))]
            .filter(v => !search || v.value.toLowerCase().includes(search));
        const shown = all.slice(0, 100);
        list.innerHTML = shown.map(v => `<label class="filter-value"><input type="checkbox" value="${escapeHtml(v.value)}"${chosen.has(v.value) ? ' checked' : ''}>` +
            `<span class="filter-value-name">${escapeHtml(v.value)}</span><span class="filter-value-count">${v.count.toLocaleString()}</span></label>`).join('') +
            (all.length > shown.length ? `<p class="filter-more">${(all.length - shown.length).toLocaleString()} more: search to find them</p>` : '') +
            (!all.length ? '<p class="filter-more">No team matches that search.</p>' : '');
    } catch (err) {
        list.innerHTML = `<p class="chart-empty error">${escapeHtml(err.message)}</p>`;
    }
}

// ---------------------------------------------------------------------
// THE TICKETS BEHIND A CHART: a click on a bar, slice, point or number
// lists them (the newest 200), with stars, records and a download
// ---------------------------------------------------------------------

let drillRun = 0;
async function openDrill({ chart, scope = null, value = null, label = '' }) {
    const dialog = document.getElementById('drill-dialog');
    const body = document.getElementById('drill-body');
    const run = ++drillRun;
    // The chart's name and description need the builder's catalog (an AI answer may not have loaded it)
    try { await loadChartCatalog(); } catch { /* the plain names below still work */ }
    const title = label ? `${chartTitle(chart)}: ${label}` : chartTitle(chart);
    document.getElementById('drill-title').textContent = title;
    body.innerHTML = '<p class="home-status">Loading the tickets…</p>';
    hideChartTip();
    if (!dialog.open) dialog.showModal();
    try {
        const response = await fetch(`${API_BASE}/api/charts/tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ chart, scope, value }),
        });
        if (handleUnauthorized(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        if (run !== drillRun || !dialog.open) return;
        const what = [chartDescription(chart), scopeDescription(scope)].filter(Boolean).join(' · ');
        const tickets = data.tickets;
        const count = `${data.total.toLocaleString()} ${data.total === 1 ? 'ticket' : 'tickets'}`;
        body.innerHTML = `<p class="drill-what">${escapeHtml(what)}</p>` +
            `<p class="home-status">${count}${data.total > tickets.length ? `; the newest ${tickets.length.toLocaleString()} are listed (the download has them too)` : ''}. ` +
            'Click a ticket number to open it, with its parent, children and other linked tickets.</p>' +
            starAllHtml(tickets.map(t => t.number)) + ticketTableHtml(tickets) + ticketDownloadHtml(tickets, title);
    } catch (err) {
        if (run === drillRun) body.innerHTML = `<p class="home-status error">${escapeHtml(err.message)}</p>`;
    }
}

// A ticket in the list opens in the ticket window over it, its family first
// (families.js), and closing that returns to the list. Its dashboard page
// closes the list.
document.getElementById('drill-dialog').addEventListener('click', e => {
    const ticket = e.target.closest('[data-ticket]');
    if (ticket) {
        e.stopPropagation();
        openTicketDialog(ticket.dataset.ticket);
        return;
    }
    if (e.target.closest('[data-open-dashboard]')) e.currentTarget.close();
});

// ---------------------------------------------------------------------
// SAVING A CHART somewhere: from an AI answer ("Save as a chart")
// ---------------------------------------------------------------------

// dest: 'home', a dashboard's id, or 'new' (asks for a name)
async function saveChartTo(chart, dest) {
    if (dest === 'home') {
        prefs.home.blocks.push({ type: 'chart', chart });
        renderHomeLayout();
        savePreference('home');
        showToast(`"${chartTitle(chart)}" is saved on your Home page`);
        return;
    }
    let board = prefs.dashboards.boards.find(b => b.id === dest);
    if (!board) {
        if (prefs.dashboards.boards.length >= 20) {
            showToast('You can have up to 20 dashboards of your own. Delete one first.');
            return;
        }
        const name = await askText({ title: 'New dashboard', label: 'Name', value: `My dashboard ${prefs.dashboards.boards.length + 1}`, action: 'Create' });
        if (!name) return;
        board = { id: newChartId(), name: name.slice(0, 60), charts: [], scope: emptyScope() };
        prefs.dashboards.boards.push(board);
    }
    if (board.charts.length >= 30) {
        showToast(`"${board.name}" already has 30 charts. Remove one or choose another dashboard.`);
        return;
    }
    board.charts.push(chart);
    renderMyDashboards();
    if (currentBoardId === board.id) renderBoard();
    savePreference('dashboards');
    updateShareSoon(board);
    showToast(`"${chartTitle(chart)}" is saved on your dashboard "${board.name}"`);
}

// ---------------------------------------------------------------------
// SHARING A DASHBOARD: a link (shares.mjs) that shows a copy of it to
// anyone signed in, who can add the copy to their own dashboards
// ---------------------------------------------------------------------

const sharedBoards = new Map(); // dashboard id -> its link's token

async function loadShares() {
    try {
        const response = await fetch(`${API_BASE}/api/shares`, { headers: authHeaders() });
        if (handleUnauthorized(response) || !response.ok) return;
        const data = await response.json();
        sharedBoards.clear();
        for (const s of data.shares) sharedBoards.set(s.boardId, s.token);
        paintShareButton();
    } catch (err) {
        console.error('Could not load shared dashboards:', err);
    }
}

function shareLink(token) {
    return `${location.origin}${location.pathname}#share=${token}`;
}

function paintShareButton() {
    const board = currentBoard();
    const button = document.getElementById('board-share-btn');
    const shared = Boolean(board && sharedBoards.has(board.id));
    button.textContent = shared ? '🔗 Shared' : '🔗 Share';
    button.classList.toggle('on', shared);
}

// Shares the dashboard, or updates what its link shows -> the token
async function putShare(board, quiet = false) {
    try {
        const response = await fetch(`${API_BASE}/api/shares`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ board }),
        });
        if (handleUnauthorized(response)) return null;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
        sharedBoards.set(board.id, data.token);
        paintShareButton();
        return data.token;
    } catch (err) {
        if (!quiet) showToast(`${err.message}`, 'error');
        return null;
    }
}

// A shared dashboard that changes: its link shows the change (a moment later)
let shareTimer = null;
function updateShareSoon(board) {
    if (!board || !sharedBoards.has(board.id)) return;
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => putShare(board, true), 800);
}

async function shareCurrentBoard() {
    const board = currentBoard();
    if (!board) return;
    if (!board.charts.length) {
        showToast('Add a chart to this dashboard before sharing it.');
        return;
    }
    const token = await putShare(board);
    if (!token) return;
    const dialog = document.getElementById('share-dialog');
    document.getElementById('share-title').textContent = `Share "${board.name}"`;
    document.getElementById('share-link').value = shareLink(token);
    document.getElementById('share-stop').onclick = () => stopSharing(board);
    dialog.showModal();
    document.getElementById('share-link').select();
}

async function copyShareLink() {
    const input = document.getElementById('share-link');
    input.select();
    try {
        await navigator.clipboard.writeText(input.value);
    } catch {
        document.execCommand('copy');
    }
    showToast('Link copied. Paste it into an email or chat.');
}

// quiet: the dashboard was deleted (its own toast says so)
async function stopSharing(board, quiet = false) {
    const token = sharedBoards.get(board.id);
    if (!token) return;
    if (!quiet && !confirm(`Stop sharing "${board.name}"? Its link stops working. Copies people already added stay theirs.`)) return;
    try {
        const response = await fetch(`${API_BASE}/api/shares/${encodeURIComponent(token)}`, { method: 'DELETE', headers: authHeaders() });
        if (handleUnauthorized(response)) return;
        if (!response.ok && response.status !== 404) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `The server answered ${response.status}.`);
        }
        sharedBoards.delete(board.id);
        paintShareButton();
        document.getElementById('share-dialog').close();
        if (!quiet) showToast(`"${board.name}" is no longer shared`);
    } catch (err) {
        showToast(`${err.message}`, 'error');
    }
}

// A link like …/#share=<token>: show that dashboard, with "Add to my dashboards".
// -> true if there was one to show
async function openSharedLink() {
    const match = location.hash.match(/^#share=([A-Za-z0-9_-]{22})$/);
    if (!match || !sessionTokenValue) return false;
    history.replaceState(null, '', location.pathname + location.search);
    try {
        const response = await fetch(`${API_BASE}/api/shares/${match[1]}`, { headers: authHeaders() });
        if (handleUnauthorized(response)) return true;
        const share = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(share.error || `The server answered ${response.status}.`);
        await loadChartCatalog();
        const dialog = document.getElementById('shared-dialog');
        document.getElementById('shared-title').textContent = share.mine ? `Your shared dashboard "${share.name}"` : `${share.owner} shared "${share.name}" with you`;
        const when = new Date(share.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        const filters = scopeDescription(share.scope);
        document.getElementById('shared-about').textContent = `${chartCount(share.charts.length)}, last changed ${when}.` +
            (filters ? ` Filters for every chart: ${filters}.` : '') +
            (share.mine ? ' This is the link to one of your own dashboards; this is what others see.' : ' Click a bar or slice to see its tickets.');
        const grid = document.getElementById('shared-grid');
        grid.innerHTML = share.charts.map(c => tileHtml(c, SHARED_TILE_BUTTONS)).join('');
        const add = document.getElementById('shared-add');
        add.hidden = share.mine;
        add.onclick = () => addSharedCopy(share);
        dialog.showModal();
        const scope = share.scope && (share.scope.dates?.preset !== 'all' || share.scope.teams?.length) ? share.scope : null;
        grid.querySelectorAll('.chart-tile').forEach((tile, i) => fillTile(tile, share.charts[i], false, scope));
    } catch (err) {
        showToast(`${err.message}`, 'error');
    }
    return true;
}

async function addSharedCopy(share) {
    if (prefs.dashboards.boards.length >= 20) {
        showToast('You can have up to 20 dashboards of your own. Delete one first.');
        return;
    }
    const taken = new Set(prefs.dashboards.boards.map(b => b.name));
    let name = share.name;
    for (let n = 2; taken.has(name); n++) name = `${share.name} (${n})`;
    const board = {
        id: newChartId(),
        name: name.slice(0, 60),
        charts: share.charts.map(c => ({ ...c, id: newChartId() })),
        scope: { ...emptyScope(), ...share.scope },
    };
    prefs.dashboards.boards.push(board);
    savePreference('dashboards');
    renderMyDashboards();
    document.getElementById('shared-dialog').close();
    switchTab('dashboard');
    await loadDashboards();
    showBoard(board.id);
    showToast(`Added "${board.name}" to your dashboards. It's your copy: change it however you like.`);
}

window.addEventListener('hashchange', () => {
    if (sessionTokenValue && !document.body.classList.contains('signed-out')) openSharedLink();
});

// ---------------------------------------------------------------------
// THE TOURS: a few steps pointing at the main parts of a page. Home's
// shows on the first visit, the Dashboards page's the first time that page
// is opened; each once per person (saved to their account), and again
// from that page's "❔ Tour"
// ---------------------------------------------------------------------

const TOUR_STEPS = [
    { target: '.tab-navigation', title: 'Home and Dashboards',
        text: 'OneTouch has two pages. The one you are on lights up. The OneTouch logo also brings you back Home from anywhere.' },
    { target: '#nav-ask', title: 'Ask anything about the data',
        text: 'Type a question in plain English here, on any page, like "How many open incidents are there by priority?", and press Enter. Claude answers in a chat over the page, with tables you can switch to a chart, download (also as a picture), or save to a dashboard. With nothing typed, the button opens your chat; a click anywhere outside the chat closes it. Press / to jump here.' },
    { target: '[data-block="tickets"]', title: 'Your tickets',
        text: 'The tickets assigned to you, as a list and in charts (My charts), and every ticket the AI assistant shows you in Ticket results. Click ☆ to star one. Every list has a 🔍 box to look up its tickets by any of its columns.' },
    { target: '#customize-home-btn', title: 'Make Home yours',
        text: 'Move or hide these sections, and add charts of your own.' },
    { target: '.tab-btn[data-tab="dashboard"]', title: 'Dashboards: the team\'s and yours',
        text: 'The team dashboards, plus ones you build: ☰ Dashboards, then ＋ New dashboard. Click any bar or slice to see its tickets, filter a whole dashboard by team or date, and share it with a link. It has its own short tour the first time you open it.' },
    { target: '#theme-btn', title: 'Your colors',
        text: 'Light or dark, your own accent color, and the header\'s color. "Tour" on Home shows this tour again.' },
];

// drawer: the step is inside the ☰ Dashboards drawer (open it) or not (close it).
// Steps whose part isn't showing are left out (the team dashboard's frame on
// one of your own dashboards, for example).
const DASHBOARDS_TOUR_STEPS = [
    { target: '#dashboard-drawer-toggle', drawer: false, title: 'Every dashboard in one list',
        text: 'Click ☰ Dashboards for the list: pages built into OneTouch, dashboards of your own, and the team dashboards. This page opens on the one you had open last.' },
    { target: '.builtin-dashboards', drawer: true, title: 'Ticket families',
        text: 'Every parent ticket and its children, from the links in the data. Click any ticket, parent or child, to open it with its family.' },
    { target: '.my-dashboards', drawer: true, title: 'Dashboards of your own',
        text: '＋ New dashboard starts one: choose what each chart counts and how it is drawn, filter the whole dashboard by team or dates, and share it with a link. Nobody else sees it until you share it.' },
    { target: '#dashboard-picker .drawer-group', drawer: true, title: 'The team dashboards',
        text: 'Incidents, problems, changes and requests, grouped by area (scroll the list for the rest). Everyone has the same ones.' },
    { target: '#drawer-customize', drawer: true, title: 'Only the ones you use',
        text: 'Untick the team dashboards you don\'t need and they leave your list (nobody else\'s). They come back the same way.' },
    { target: '#dashboard-frame', drawer: false, title: 'Click for details',
        text: 'Click a bar, slice, number or blue value to open a page with its details, and ← Back to return. A ticket\'s record shows its parent, children and other linked tickets above it.' },
    { target: '#board-view .board-bar', drawer: false, title: 'Your dashboard',
        text: 'Add charts, share it with a link, rename or delete it. Click a bar or slice to list its tickets.' },
    { target: '#dashboard-tour-btn', drawer: false, title: 'This tour again',
        text: 'Tour shows this tour again any time. Home has its own, under Tour there.' },
];

// Each tour: its steps, its page, and its flag in prefs.tour
const TOURS = {
    home: { steps: TOUR_STEPS, view: 'home', seen: 'done' },
    dashboards: { steps: DASHBOARDS_TOUR_STEPS, view: 'dashboard', seen: 'dashboards' },
};

let tourState = null; // { name, steps, index, opener }

// A tour not seen yet starts once its page is showing, unless something else
// is open (it waits for the next visit then)
function maybeStartTour(name = 'home') {
    const tour = TOURS[name];
    if (prefs.tour[tour.seen] || prefsLoadFailed || tourState) return;
    setTimeout(() => {
        const ready = !prefs.tour[tour.seen] && !tourState && !document.body.classList.contains('signed-out') && !document.querySelector('dialog[open]') &&
            document.getElementById(`${tour.view}-view`).classList.contains('active') && !assistantOpen();
        if (ready) startTour(name);
    }, 600);
}

function startTour(name = 'home') {
    const tour = TOURS[name];
    if (name === 'home') toggleHomeEditing(false);
    else toggleDrawerEditing(false);
    toggleThemePanel(false);
    toggleAssistant(false);
    if (!document.getElementById(`${tour.view}-view`).classList.contains('active')) switchTab(tour.view);
    const steps = tour.steps.filter(s => {
        const el = document.querySelector(s.target);
        return el && el.getClientRects().length > 0;
    });
    if (!steps.length) return;
    tourState = { name, steps, index: 0, opener: document.activeElement };
    document.getElementById('tour').hidden = false;
    showTourStep();
}

function showTourStep() {
    if (!tourState) return;
    const { steps, index } = tourState;
    const step = steps[index];
    // Open or close the drawer for this step; point once it has slid
    const drawer = document.getElementById('dashboard-drawer');
    if ('drawer' in step && step.drawer !== drawer.classList.contains('open')) {
        toggleDashboardDrawer(step.drawer);
        setTimeout(() => { if (tourState?.steps === steps && tourState.index === index) showTourStep(); }, 250);
        return;
    }
    const target = document.querySelector(step.target);
    if (!target) return closeTour();
    target.scrollIntoView({ block: 'nearest' });
    const r = target.getBoundingClientRect();
    const pad = 6;
    const spot = document.getElementById('tour-spot');
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    document.getElementById('tour-step').textContent = `${index + 1} of ${steps.length}`;
    document.getElementById('tour-title').textContent = step.title;
    document.getElementById('tour-text').textContent = step.text;
    document.getElementById('tour-back').disabled = index === 0;
    document.getElementById('tour-next').textContent = index === steps.length - 1 ? 'Done' : 'Next';
    // The card goes under what it points at, or above when there's no room
    // below, or inside its top when it fills the page (a dashboard)
    const card = document.getElementById('tour-card');
    const h = card.offsetHeight, w = card.offsetWidth;
    const below = r.bottom + pad + 12;
    const above = r.top - pad - 12 - h;
    const top = below + h < innerHeight - 8 ? below : above >= 8 ? above : Math.max(8, Math.min(r.top + 16, innerHeight - h - 8));
    card.style.top = `${top}px`;
    card.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
    document.getElementById('tour-next').focus();
}

function tourMove(delta) {
    if (!tourState) return;
    const next = tourState.index + delta;
    if (next >= tourState.steps.length) return closeTour();
    tourState.index = Math.max(0, next);
    showTourStep();
}

// save: remember it was seen (Skip and Done both count)
function closeTour(save = true) {
    const opener = tourState?.opener;
    const name = tourState?.name;
    tourState = null;
    document.getElementById('tour').hidden = true;
    if (!name) return;
    const seen = TOURS[name].seen;
    if (save && !prefs.tour[seen]) {
        prefs.tour = { ...prefs.tour, [seen]: true };
        savePreference('tour');
    }
    if (opener && opener.isConnected) opener.focus();
}

// Escape skips; Tab stays on the tour's buttons; the card follows a resized window
document.addEventListener('keydown', e => {
    if (!tourState) return;
    if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        closeTour();
    } else if (e.key === 'Tab') {
        const buttons = [...document.querySelectorAll('#tour-card button:not(:disabled)')];
        const i = buttons.indexOf(document.activeElement);
        e.preventDefault();
        buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
});
window.addEventListener('resize', () => { if (tourState) showTourStep(); });
