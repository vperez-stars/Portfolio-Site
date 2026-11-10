// =====================================================================
// CHARTS: the charts people build themselves (their own dashboards, and
// Home) and AI answers shown as charts, drawn as plain SVG in the page's
// colors, so they follow each person's color scheme. Thin marks, a
// hairline grid, a tooltip on every mark (hover or keyboard focus), a
// table view for every chart, a click on a mark to list its tickets, and
// pictures (PNG / SVG) for downloads. The numbers come from
// /api/charts/data (charts.mjs on the server) or from the AI answer.
// Loaded before app.js, whose helpers (escapeHtml, API_BASE, ...) these
// functions use when they run.
// =====================================================================

const DONUT_SLICES = 6; // part-to-whole reads at a glance only up to about six
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CHART_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
// Each ticket type keeps its color in every chart that compares types
const ENTITY_SLOTS = { incident: 1, change_request: 2, sc_req_item: 3, sc_task: 4, change_approvals: 5, ritm_approvals: 7 };

// What the builder offers and how each ticket type is named (from /api/charts/catalog)
let chartCatalog = null;
let chartCatalogLoading = null;
function loadChartCatalog() {
    if (chartCatalog) return Promise.resolve(chartCatalog);
    if (!chartCatalogLoading) {
        chartCatalogLoading = (async () => {
            const response = await fetch(`${API_BASE}/api/charts/catalog`, { headers: authHeaders() });
            if (handleUnauthorized(response)) return null;
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
            chartCatalog = data;
            return data;
        })().finally(() => { chartCatalogLoading = null; });
    }
    return chartCatalogLoading;
}

// ---------------------------------------------------------------------
// Words: titles, descriptions and labels people read
// ---------------------------------------------------------------------

const isTimeField = field => /_(day|week|month)$/.test(field || '');

function fieldLabel(source, field) {
    const src = chartCatalog?.sources[source];
    const pair = src && [...src.fields, ...src.times].find(([key]) => key === field);
    return pair ? pair[1] : String(field || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

// "Team" -> "team", but "System (CI)" -> "system (CI)" and "SLA breached" stays
const lowerFirst = text => text.replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase());

// The Monday of an ISO week: 2026, 27 -> Jun 29, 2026
function isoWeekMonday(year, week) {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (week - 1) * 7);
    return monday;
}

// '2026-07' -> 'Jul 2026', '2026-07-05' -> 'Jul 5', '2026-W27' -> 'Jun 29' (its Monday).
// long: the tooltip's fuller version.
function periodLabel(field, value, long = false) {
    let m;
    if ((m = String(value).match(/^(\d{4})-W(\d{2})$/))) {
        const d = isoWeekMonday(Number(m[1]), Number(m[2]));
        const day = `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
        return long ? `Week of ${day}, ${d.getUTCFullYear()}` : day;
    }
    if ((m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
        const day = `${SHORT_MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
        return long ? `${day}, ${m[1]}` : day;
    }
    if ((m = String(value).match(/^(\d{4})-(\d{2})$/))) return `${SHORT_MONTHS[Number(m[2]) - 1]} ${m[1]}`;
    return String(value);
}

function groupLabel(chart, value, long = false) {
    if (value === null || value === undefined) return '(Not set)';
    if (isTimeField(chart.groupBy)) return periodLabel(chart.groupBy, value, long);
    if (value === 'true') return 'Yes';
    if (value === 'false') return 'No';
    return String(value);
}

// "Open incidents by priority", "Requests by catalog item", "Closed changes"
function chartAutoTitle(chart) {
    const src = chartCatalog?.sources[chart.source];
    if (!src) return 'Chart';
    const what = chart.status === 'open' ? `Open ${src.many}` : chart.status === 'closed' ? `Closed ${src.many}` : src.label;
    if (!chart.groupBy || chart.display === 'number') return what;
    return `${what} by ${lowerFirst(fieldLabel(chart.source, chart.groupBy))}`;
}

function chartTitle(chart) {
    return chart.title || chartAutoTitle(chart);
}

// How a chart's groups are ordered: by their count ('count') or their own value
// ('label': A to Z, P1 first; over time, oldest first), ascending or descending.
// Charts saved before they had a direction keep the order they had (as
// charts.mjs sanitizeChart). -> { sort, direction }
function chartOrder(chart) {
    if (chart.direction === 'asc' || chart.direction === 'desc') return { sort: chart.sort === 'label' ? 'label' : 'count', direction: chart.direction };
    if (isTimeField(chart.groupBy) || chart.sort === 'label') return { sort: 'label', direction: 'asc' };
    return { sort: 'count', direction: 'desc' };
}

// The orders a grouped chart can have, as [value ('sort:direction'), what people read]
function chartOrderChoices(chart) {
    const field = fieldLabel(chart.source, chart.groupBy);
    return isTimeField(chart.groupBy)
        ? [['label:asc', 'Oldest first'], ['label:desc', 'Newest first'], ['count:desc', 'Biggest first'], ['count:asc', 'Smallest first']]
        : [['count:desc', 'Biggest first'], ['count:asc', 'Smallest first'],
            ['label:asc', `${field}, in order (A to Z, P1 first)`], ['label:desc', `${field}, reversed (Z to A)`]];
}

// Rows ({ value, count }) of a chart drawn in the page (an AI answer) in an
// order: by count, or by value with "(Not set)" last, ascending or descending
function orderChartRows(rows, sort, direction) {
    const sign = direction === 'desc' ? -1 : 1;
    const byValue = (a, b) => (a.value === null || b.value === null
        ? (a.value === null) - (b.value === null)
        : sign * sortCollator.compare(String(a.value), String(b.value)));
    return [...rows].sort(sort === 'label' ? byValue : (a, b) => sign * (a.count - b.count) || byValue(a, b));
}

const fmtDay = day => periodLabel('x_day', day, true);

function datesText(dates) {
    if (!dates || dates.preset === 'all') return '';
    if (dates.preset === 'custom') {
        if (dates.from && dates.to) return `Opened ${fmtDay(dates.from)} to ${fmtDay(dates.to)}`;
        if (dates.from) return `Opened on or after ${fmtDay(dates.from)}`;
        return dates.to ? `Opened on or before ${fmtDay(dates.to)}` : '';
    }
    return `Opened in the data's last ${dates.preset} days`;
}

const OP_TEXT = { equals: '', notEquals: ' is not', contains: ' contains' };

// Which tickets a chart counts, in words: "Open only · Priority: P1 - Critical · Opened Aug 3 – Sep 1, 2026"
function chartDescription(chart) {
    const src = chartCatalog?.sources[chart.source];
    const parts = [];
    if (chart.status === 'open') parts.push(`Open ${src ? src.many : ''} only (${src ? src.openStates.join(', ') : ''})`);
    if (chart.status === 'closed') parts.push(`Closed ${src ? src.many : ''} only`);
    for (const f of chart.filters || []) {
        const shown = f.values.slice(0, 3).map(v => f.op === 'contains' ? `"${v}"` : groupLabel({ groupBy: f.field }, v)).join(f.op === 'contains' ? ' or ' : ', ');
        parts.push(`${fieldLabel(chart.source, f.field)}${OP_TEXT[f.op] || ''}: ${shown}${f.values.length > 3 ? ` and ${f.values.length - 3} more` : ''}`);
    }
    const dates = datesText(chart.dates);
    if (dates) parts.push(dates);
    return parts.length ? parts.join(' · ') : `All ${src ? src.many : 'tickets'}`;
}

// A dashboard's filter row, in words: "Opened in the data's last 30 days · Team: INFRA-Cloud-Linux"
function scopeDescription(scope) {
    if (!scope) return '';
    const parts = [];
    const dates = datesText(scope.dates);
    if (dates) parts.push(dates);
    if (scope.teams?.length) parts.push(`Team: ${scope.teams.slice(0, 3).join(', ')}${scope.teams.length > 3 ? ` and ${scope.teams.length - 3} more` : ''}`);
    return parts.join(' · ');
}

// 0 / 950 / 1.2K / 12K / 1.5M
function compactNumber(n) {
    if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${+(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
    return String(n);
}

const share = (n, total) => `${((n / (total || 1)) * 100).toFixed(1)}%`;

// ---------------------------------------------------------------------
// Data: one request per distinct question, kept for the page's life
// (the data is a frozen export, so an answer never changes)
// ---------------------------------------------------------------------

const chartDataCache = new Map();

// What changes the numbers; how it looks (display, color, size) doesn't
function chartDataKey(chart, scope) {
    const { source, status, dates, filters, groupBy, limit } = chart;
    return JSON.stringify({ source, status, dates, filters, groupBy, limit, ...chartOrder(chart), scope: scope || null });
}

function fetchChartData(chart, scope = null) {
    const key = chartDataKey(chart, scope);
    if (!chartDataCache.has(key)) {
        const pending = (async () => {
            const response = await fetch(`${API_BASE}/api/charts/data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ chart, scope }),
            });
            if (handleUnauthorized(response)) return null;
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`);
            return data;
        })();
        chartDataCache.set(key, pending);
        pending.then(data => { if (!data) chartDataCache.delete(key); }, () => chartDataCache.delete(key));
        if (chartDataCache.size > 300) chartDataCache.delete(chartDataCache.keys().next().value);
    }
    return chartDataCache.get(key);
}

// ---------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------

const measureContext = document.createElement('canvas').getContext('2d');
function textWidth(text, size = 12, weight = 400) {
    measureContext.font = `${weight} ${size}px ${CHART_FONT}`;
    return measureContext.measureText(String(text)).width;
}

// The text, cut with "…" so it fits in `width` (labels never overflow their space)
function fitText(text, width, size = 12) {
    text = String(text);
    if (textWidth(text, size) <= width) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (textWidth(`${text.slice(0, mid)}…`, size) <= width) lo = mid; else hi = mid - 1;
    }
    return lo ? `${text.slice(0, lo)}…` : '';
}

// Round axis steps (1, 2, 5 x 10^n), from zero to just above the biggest value
function niceScale(max, target = 4) {
    if (max <= 0) return { top: 1, ticks: [0, 1] };
    const rough = max / target;
    const power = 10 ** Math.floor(Math.log10(rough));
    const n = rough / power;
    const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power);
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
    return { top, ticks };
}

// A single-series chart's color: the person's accent, or one of the chart colors
function seriesColor(chart) {
    return chart.color && chart.color !== 'accent' ? `var(--series-${chart.color})` : 'var(--accent)';
}

const r1 = n => Math.round(n * 10) / 10;

// A column with a rounded top and a square foot on the baseline
function columnPath(x, top, w, h, radius = 4) {
    const r = Math.min(radius, w / 2, h);
    return `M${r1(x)},${r1(top + h)}V${r1(top + r)}Q${r1(x)},${r1(top)} ${r1(x + r)},${r1(top)}H${r1(x + w - r)}` +
        `Q${r1(x + w)},${r1(top)} ${r1(x + w)},${r1(top + r)}V${r1(top + h)}Z`;
}
// A sideways bar with a rounded end
function barPath(x, y, w, h, radius = 4) {
    const r = Math.min(radius, h / 2, w);
    return `M${r1(x)},${r1(y)}H${r1(x + w - r)}Q${r1(x + w)},${r1(y)} ${r1(x + w)},${r1(y + r)}V${r1(y + h - r)}` +
        `Q${r1(x + w)},${r1(y + h)} ${r1(x + w - r)},${r1(y + h)}H${r1(x)}Z`;
}

// A mark's tooltip, and which row it is (for clicking through to its tickets)
function tipAttrs(chart, row, total, index) {
    return ` data-index="${index}" data-tip-value="${escapeHtml(`${row.count.toLocaleString()} (${share(row.count, total)})`)}"` +
        ` data-tip-label="${escapeHtml(row.label || groupLabel(chart, row.value, true))}"`;
}

function svgOpen(width, height, label, cls = '') {
    return `<svg class="chart-svg ${cls}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}">`;
}

// Hairline gridlines with their values at the left
function gridHtml(ticks, y, left, right) {
    return ticks.map(t => `<line class="chart-grid" x1="${left}" x2="${right}" y1="${r1(y(t))}" y2="${r1(y(t))}"/>` +
        `<text class="chart-tick" x="${left - 6}" y="${r1(y(t) + 4)}" text-anchor="end">${compactNumber(t)}</text>`).join('');
}

// Labels along the bottom: as many as fit, evenly spaced, each cut to its room
function xLabelsHtml(labels, xAt, room, baseY) {
    const every = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(room.total / 72))));
    return labels.map((label, i) => i % every ? '' :
        `<text class="chart-tick" x="${r1(xAt(i))}" y="${baseY}" text-anchor="middle">${escapeHtml(fitText(label, room.each * every - 6, 11))}</text>`).join('');
}

const tickWidth = ticks => Math.ceil(Math.max(...ticks.map(t => textWidth(compactNumber(t), 11)))) + 12;

// ---------------------------------------------------------------------
// One series (a count per category or per period)
// ---------------------------------------------------------------------

function chartHeight(chart) {
    return chart.size === 'small' ? 200 : 260;
}

// One number: the total
function numberHtml(chart, data) {
    const src = chartCatalog?.sources[chart.source];
    const noun = src ? (data.total === 1 ? src.one : src.many) : (data.total === 1 ? 'ticket' : 'tickets');
    const state = chart.status === 'open' ? 'open ' : chart.status === 'closed' ? 'closed ' : '';
    return `<div class="chart-stat" data-index="all" tabindex="0" data-tip-value="${data.total.toLocaleString()}" data-tip-label="${escapeHtml(state + noun)}">` +
        `<span class="chart-stat-value">${data.total.toLocaleString()}</span>` +
        `<span class="chart-stat-label">${escapeHtml(state + noun)}</span></div>`;
}

// Columns: categories or periods along the bottom
function columnsHtml(chart, data, width) {
    const rows = data.rows;
    const height = chartHeight(chart);
    const max = Math.max(...rows.map(r => r.count));
    const { top, ticks } = niceScale(max);
    const m = { top: 20, right: 8, bottom: 26, left: tickWidth(ticks) };
    const plotW = width - m.left - m.right, plotH = height - m.top - m.bottom;
    const band = plotW / rows.length;
    const barW = Math.max(2, Math.min(24, band * 0.7));
    const y = v => m.top + plotH - (v / top) * plotH;
    // Values on the caps when they fit; otherwise only the biggest is labeled
    const labelAll = rows.length <= 12 && rows.every(r => textWidth(r.count.toLocaleString(), 11) <= band + 2);
    const focusable = rows.length <= 40 ? ' tabindex="0"' : '';
    let html = svgOpen(width, height, chartTitle(chart)) + gridHtml(ticks, y, m.left, width - m.right);
    rows.forEach((row, i) => {
        const x = m.left + i * band + (band - barW) / 2;
        const h = y(0) - y(row.count);
        if (h > 0) html += `<path class="chart-mark" d="${columnPath(x, y(row.count), barW, h)}" style="fill:${seriesColor(chart)}"/>`;
        if (labelAll || (row.count === max && i === rows.findIndex(r => r.count === max))) {
            html += `<text class="chart-value" x="${r1(x + barW / 2)}" y="${r1(y(row.count) - 6)}" text-anchor="middle">${row.count.toLocaleString()}</text>`;
        }
        html += `<rect class="chart-hit" x="${r1(m.left + i * band)}" y="${m.top}" width="${r1(band)}" height="${plotH}"${focusable}${tipAttrs(chart, row, data.total, i)}/>`;
    });
    html += `<line class="chart-axis" x1="${m.left}" x2="${width - m.right}" y1="${r1(y(0))}" y2="${r1(y(0))}"/>`;
    html += xLabelsHtml(rows.map(r => groupLabel(chart, r.value)), i => m.left + i * band + band / 2, { total: plotW, each: band }, height - 8);
    return html + '</svg>';
}

// Sideways bars: long category names read best this way
function barsHtml(chart, data, width) {
    const rows = data.rows;
    const rowH = 28, barH = 16;
    const labels = rows.map(r => groupLabel(chart, r.value));
    const labelW = Math.min(width * 0.4, Math.max(...labels.map(l => textWidth(l, 12))) + 4);
    const valueW = Math.max(...rows.map(r => textWidth(r.count.toLocaleString(), 11))) + 10;
    const left = labelW + 10;
    const plotW = Math.max(20, width - left - valueW);
    const height = rows.length * rowH + 4;
    const max = Math.max(...rows.map(r => r.count)) || 1;
    let html = svgOpen(width, height, chartTitle(chart));
    rows.forEach((row, i) => {
        const y = i * rowH + (rowH - barH) / 2;
        const w = (row.count / max) * plotW;
        html += `<text class="chart-label" x="${r1(labelW)}" y="${r1(y + barH / 2 + 4)}" text-anchor="end">${escapeHtml(fitText(labels[i], labelW, 12))}</text>`;
        if (w > 0) html += `<path class="chart-mark" d="${barPath(left, y, w, barH)}" style="fill:${seriesColor(chart)}"/>`;
        html += `<text class="chart-value" x="${r1(left + w + 6)}" y="${r1(y + barH / 2 + 4)}">${row.count.toLocaleString()}</text>`;
        html += `<rect class="chart-hit" x="0" y="${i * rowH}" width="${width}" height="${rowH}" tabindex="0"${tipAttrs(chart, row, data.total, i)}/>`;
    });
    html += `<line class="chart-axis" x1="${left}" x2="${left}" y1="0" y2="${height}"/>`;
    return html + '</svg>';
}

// The crosshair a line chart's pointer (or arrow keys) moves from point to point
function crosshairHtml(m, plotW, plotH, y0, step, top, dots) {
    return `<line class="chart-cross" x1="0" x2="0" y1="${m.top}" y2="${r1(y0)}" visibility="hidden"/>` +
        dots.map(color => `<circle class="chart-dot chart-cross-dot" r="4" visibility="hidden" style="fill:${color}"/>`).join('') +
        `<rect class="chart-hit line-hit" data-index="line" x="${m.left - 6}" y="${m.top}" width="${plotW + 12}" height="${plotH}" tabindex="0"` +
        ` aria-label="Move along the line with the arrow keys" data-left="${m.left}" data-step="${r1(step)}" data-plot-h="${plotH}" data-top="${m.top}" data-max="${top}"/>`;
}

// A line (or a line over a light wash, for "area"): best over time
function lineHtml(chart, data, width, area) {
    const rows = data.rows;
    const height = chartHeight(chart);
    const { top, ticks } = niceScale(Math.max(...rows.map(r => r.count)));
    const m = { top: 22, right: 14, bottom: 26, left: tickWidth(ticks) };
    const plotW = width - m.left - m.right, plotH = height - m.top - m.bottom;
    const step = rows.length > 1 ? plotW / (rows.length - 1) : 0;
    const x = i => rows.length > 1 ? m.left + i * step : m.left + plotW / 2;
    const y = v => m.top + plotH - (v / top) * plotH;
    const color = seriesColor(chart);
    const points = rows.map((r, i) => `${r1(x(i))},${r1(y(r.count))}`);
    let html = svgOpen(width, height, chartTitle(chart)) + gridHtml(ticks, y, m.left, width - m.right);
    if (area && rows.length > 1) {
        html += `<path class="chart-area" d="M${points.join('L')}L${r1(x(rows.length - 1))},${r1(y(0))}L${r1(x(0))},${r1(y(0))}Z" style="fill:${color}"/>`;
    }
    html += `<line class="chart-axis" x1="${m.left}" x2="${width - m.right}" y1="${r1(y(0))}" y2="${r1(y(0))}"/>`;
    if (rows.length > 1) html += `<path class="chart-line" d="M${points.join('L')}" style="stroke:${color}"/>`;
    // Labeled: the peak and the latest value (not every point)
    const last = rows.length - 1;
    const peak = rows.reduce((best, r, i) => r.count > rows[best].count ? i : best, 0);
    for (const i of new Set([peak, last])) {
        const anchor = i === last ? 'end' : i === 0 ? 'start' : 'middle';
        html += `<text class="chart-value" x="${r1(i === last ? x(i) + 4 : x(i))}" y="${r1(y(rows[i].count) - 9)}" text-anchor="${anchor}">${rows[i].count.toLocaleString()}</text>`;
    }
    html += `<circle class="chart-dot" cx="${r1(x(last))}" cy="${r1(y(rows[last].count))}" r="4" style="fill:${color}"/>`;
    html += xLabelsHtml(rows.map(r => groupLabel(chart, r.value)), x, { total: plotW, each: Math.max(step, 1) }, height - 8);
    html += crosshairHtml(m, plotW, plotH, y(0), step, top, [color]);
    return html + '</svg>';
}

// The donut's slices: at most six, the biggest, in the chart's order; the rest
// folded into "Other"
function donutParts(chart, data) {
    let parts = data.rows.map((r, i) => ({ ...r, label: groupLabel(chart, r.value), index: i }));
    let otherCount = data.other?.count || 0;
    let otherGroups = data.other?.groups || 0;
    if (parts.length + (otherCount ? 1 : 0) > DONUT_SLICES) {
        const kept = new Set([...parts].sort((a, b) => b.count - a.count).slice(0, DONUT_SLICES - 1));
        const folded = parts.filter(p => !kept.has(p));
        parts = parts.filter(p => kept.has(p));
        otherCount += folded.reduce((s, r) => s + r.count, 0);
        otherGroups += folded.length;
    }
    parts = parts.map((p, i) => ({ ...p, slot: p.slot || i + 1 }));
    if (otherCount) parts.push({ value: '__other', label: `Other (${otherGroups.toLocaleString()})`, count: otherCount, other: true, index: 'other' });
    return parts;
}

const donutFill = p => p.other ? 'var(--chart-other)' : `var(--series-${p.slot})`;

// Donut: share of the whole, at most six slices (the rest folds into "Other")
function donutHtml(chart, data, width) {
    const parts = donutParts(chart, data);
    const total = data.total || 1;
    const side = width >= 440;
    const size = Math.min(side ? 190 : 170, side ? width * 0.42 : width - 20);
    const r = size / 2, inner = r * 0.62, cx = r + 2, cy = r + 2;
    let angle = -Math.PI / 2;
    let slices = '';
    for (const p of parts) {
        const sweep = (p.count / total) * Math.PI * 2;
        if (sweep <= 0) continue;
        const tip = tipAttrs(chart, p, data.total, p.index);
        if (sweep >= Math.PI * 2 - 1e-6) {
            // One slice is everything: a full ring
            slices += `<path class="chart-mark slice" tabindex="0" d="M${cx},${cy - r}A${r},${r} 0 1 1 ${cx - 0.01},${cy - r}Z M${cx},${cy - inner}A${inner},${inner} 0 1 0 ${cx + 0.01},${cy - inner}Z" fill-rule="evenodd" style="fill:${donutFill(p)}"${tip}/>`;
            break;
        }
        const a0 = angle, a1 = angle + sweep;
        const large = sweep > Math.PI ? 1 : 0;
        const pt = (rad, a) => `${r1(cx + rad * Math.cos(a))},${r1(cy + rad * Math.sin(a))}`;
        slices += `<path class="chart-mark slice" tabindex="0" d="M${pt(r, a0)}A${r1(r)},${r1(r)} 0 ${large} 1 ${pt(r, a1)}L${pt(inner, a1)}A${r1(inner)},${r1(inner)} 0 ${large} 0 ${pt(inner, a0)}Z" style="fill:${donutFill(p)}"${tip}/>`;
        angle = a1;
    }
    const src = chartCatalog?.sources[chart.source];
    const svg = `<svg class="chart-svg donut" width="${size + 4}" height="${size + 4}" viewBox="0 0 ${size + 4} ${size + 4}" role="img" aria-label="${escapeHtml(chartTitle(chart))}">` +
        slices +
        `<text class="chart-donut-total" x="${cx}" y="${cy + 2}" text-anchor="middle">${data.total < 100000 ? data.total.toLocaleString() : compactNumber(data.total)}</text>` +
        `<text class="chart-tick" x="${cx}" y="${cy + 18}" text-anchor="middle">${escapeHtml(src ? src.many : 'tickets')}</text></svg>`;
    // The legend names every slice, with its number and share
    const legend = parts.map(p => `<li><span class="legend-key" style="background:${donutFill(p)}"></span>` +
        `<span class="legend-name" title="${escapeHtml(p.label)}">${escapeHtml(p.label)}</span>` +
        `<span class="legend-value">${p.count.toLocaleString()}</span>` +
        `<span class="legend-share">${share(p.count, total)}</span></li>`).join('');
    return `<div class="chart-donut${side ? ' side' : ''}">${svg}<ul class="chart-legend">${legend}</ul></div>`;
}

// The table view: every chart has one (and "Table" charts are only this).
// Its headings sort it ("Other" stays last); the chart's own order is its ⇅.
function chartTableHtml(chart, data) {
    const label = chart.groupBy ? fieldLabel(chart.source, chart.groupBy) : 'Tickets';
    const rows = data.rows.map(r => `<tr><td data-sort="${escapeHtml(String(r.value ?? ''))}">${escapeHtml(groupLabel(chart, r.value, true))}</td>` +
        `<td class="num">${r.count.toLocaleString()}</td><td class="num">${share(r.count, data.total)}</td></tr>`);
    if (data.other) {
        rows.push(`<tr class="chart-other-row sort-pinned"><td>Other (${data.other.groups.toLocaleString()} more)</td>` +
            `<td class="num">${data.other.count.toLocaleString()}</td><td class="num">${share(data.other.count, data.total)}</td></tr>`);
    }
    return `<div class="table-wrap chart-table"><table class="result-table" data-sort-list=""><thead><tr>${sortHeadHtml('', label)}` +
        `${sortHeadHtml('', 'Count', 'Count', 'num')}${sortHeadHtml('', 'Share', 'Share', 'num')}</tr></thead>` +
        `<tbody>${rows.join('')}</tbody><tfoot><tr><td>Total</td><td class="num">${data.total.toLocaleString()}</td><td class="num">100%</td></tr></tfoot></table></div>`;
}

// The same numbers as a download table
function chartExportTable(chart, data) {
    return {
        title: null,
        columns: [{ label: chart.groupBy ? fieldLabel(chart.source, chart.groupBy) : 'Tickets' }, { label: 'Count', num: true }, { label: 'Share' }],
        rows: [...data.rows.map(r => [groupLabel(chart, r.value, true), r.count, share(r.count, data.total)]),
            ...(data.other ? [[`Other (${data.other.groups} more)`, data.other.count, share(data.other.count, data.total)]] : [])],
        footer: ['Total', data.total, '100%'],
    };
}

// ---------------------------------------------------------------------
// Several series: AI answers that compare ticket types (a count per type
// for each week, team, ...). series: { categories: [{ value, label }],
// series: [{ name, slot, values }], total }
// ---------------------------------------------------------------------

// The tooltip of one category: every series' value, then the total
function seriesTip(s, i) {
    const rows = s.series.map(x => [x.slot, x.name, x.values[i].toLocaleString()]);
    const sum = s.series.reduce((t, x) => t + x.values[i], 0);
    return ` data-index="${i}" data-tip-value="${escapeHtml(`${sum.toLocaleString()} in all`)}" data-tip-label="${escapeHtml(s.categories[i].label)}"` +
        ` data-tip-rows="${escapeHtml(JSON.stringify(rows))}"`;
}

// The legend above a chart of several series: a swatch (bars) or a short line (lines) per series
function seriesLegendHtml(s, lines) {
    return `<div class="chart-series-legend">${s.series.map(x =>
        `<span class="series-item"><span class="series-key${lines ? ' line' : ''}" style="background:var(--series-${x.slot})"></span>${escapeHtml(x.name)}</span>`).join('')}</div>`;
}

// Columns side by side (grouped) or on top of each other (stacked)
function seriesColumnsHtml(chart, s, width, stacked) {
    const n = s.series.length;
    const cats = s.categories;
    const height = 280;
    const sums = cats.map((_, i) => s.series.reduce((t, x) => t + x.values[i], 0));
    const max = stacked ? Math.max(...sums) : Math.max(...s.series.flatMap(x => x.values));
    const { top, ticks } = niceScale(max);
    const m = { top: 20, right: 8, bottom: 26, left: tickWidth(ticks) };
    const plotW = width - m.left - m.right, plotH = height - m.top - m.bottom;
    const band = plotW / cats.length;
    const y = v => m.top + plotH - (v / top) * plotH;
    let html = svgOpen(width, height, chartTitle(chart)) + gridHtml(ticks, y, m.left, width - m.right);
    cats.forEach((cat, i) => {
        if (stacked) {
            const barW = Math.max(3, Math.min(28, band * 0.6));
            const bx = m.left + i * band + (band - barW) / 2;
            let base = 0;
            const topIndex = s.series.map(one => one.values[i]).findLastIndex(v => v > 0);
            s.series.forEach((one, k) => {
                const v = one.values[i];
                if (v <= 0) return;
                // A 2px gap in the background color between stacked segments
                const h = y(base) - y(base + v) - (k === topIndex ? 0 : 2);
                if (h > 0) {
                    html += k === topIndex
                        ? `<path class="chart-mark" d="${columnPath(bx, y(base + v), barW, h)}" style="fill:var(--series-${one.slot})"/>`
                        : `<rect class="chart-mark" x="${r1(bx)}" y="${r1(y(base + v) + 2)}" width="${r1(barW)}" height="${r1(h)}" style="fill:var(--series-${one.slot})"/>`;
                }
                base += v;
            });
            if (cats.length <= 12) html += `<text class="chart-value" x="${r1(bx + barW / 2)}" y="${r1(y(sums[i]) - 6)}" text-anchor="middle">${sums[i].toLocaleString()}</text>`;
        } else {
            const barW = Math.max(2, Math.min(24, (band * 0.8 - 2 * (n - 1)) / n));
            const groupW = n * barW + 2 * (n - 1);
            const start = m.left + i * band + (band - groupW) / 2;
            s.series.forEach((x, k) => {
                const h = y(0) - y(x.values[i]);
                if (h > 0) html += `<path class="chart-mark" d="${columnPath(start + k * (barW + 2), y(x.values[i]), barW, h)}" style="fill:var(--series-${x.slot})"/>`;
            });
        }
        html += `<rect class="chart-hit" x="${r1(m.left + i * band)}" y="${m.top}" width="${r1(band)}" height="${plotH}"${cats.length <= 40 ? ' tabindex="0"' : ''}${seriesTip(s, i)}/>`;
    });
    html += `<line class="chart-axis" x1="${m.left}" x2="${width - m.right}" y1="${r1(y(0))}" y2="${r1(y(0))}"/>`;
    html += xLabelsHtml(cats.map(c => c.label), i => m.left + i * band + band / 2, { total: plotW, each: band }, height - 8);
    return seriesLegendHtml(s, false) + html + '</svg>';
}

// One line per series, with one crosshair that reads every series at once
function seriesLineHtml(chart, s, width) {
    const cats = s.categories;
    const height = 280;
    const { top, ticks } = niceScale(Math.max(...s.series.flatMap(x => x.values)));
    const m = { top: 22, right: 14, bottom: 26, left: tickWidth(ticks) };
    const plotW = width - m.left - m.right, plotH = height - m.top - m.bottom;
    const step = cats.length > 1 ? plotW / (cats.length - 1) : 0;
    const x = i => cats.length > 1 ? m.left + i * step : m.left + plotW / 2;
    const y = v => m.top + plotH - (v / top) * plotH;
    let html = svgOpen(width, height, chartTitle(chart)) + gridHtml(ticks, y, m.left, width - m.right);
    html += `<line class="chart-axis" x1="${m.left}" x2="${width - m.right}" y1="${r1(y(0))}" y2="${r1(y(0))}"/>`;
    for (const series of s.series) {
        const color = `var(--series-${series.slot})`;
        if (cats.length > 1) html += `<path class="chart-line" d="M${series.values.map((v, i) => `${r1(x(i))},${r1(y(v))}`).join('L')}" style="stroke:${color}"/>`;
        const last = cats.length - 1;
        html += `<circle class="chart-dot" cx="${r1(x(last))}" cy="${r1(y(series.values[last]))}" r="4" style="fill:${color}"/>`;
    }
    html += xLabelsHtml(cats.map(c => c.label), x, { total: plotW, each: Math.max(step, 1) }, height - 8);
    html += crosshairHtml(m, plotW, plotH, y(0), step, top, s.series.map(x => `var(--series-${x.slot})`));
    return seriesLegendHtml(s, true) + html + '</svg>';
}

function seriesTableHtml(chart, s) {
    const head = sortHeadHtml('', 'group', chart.groupLabel || '') + s.series.map(x => sortHeadHtml('', x.name, x.name, 'num')).join('') + sortHeadHtml('', 'Total', 'Total', 'num');
    const body = s.categories.map((c, i) => `<tr><td data-sort="${escapeHtml(String(c.value ?? ''))}">${escapeHtml(c.label)}</td>${s.series.map(x => `<td class="num">${x.values[i].toLocaleString()}</td>`).join('')}` +
        `<td class="num">${s.series.reduce((t, x) => t + x.values[i], 0).toLocaleString()}</td></tr>`).join('');
    return `<div class="table-wrap chart-table"><table class="result-table" data-sort-list=""><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// A chart of several series in an order: 'label' (its categories' own), 'total',
// or 's<k>' (the k-th series' values), ascending or descending
function orderSeries(s, by, direction) {
    const sign = direction === 'desc' ? -1 : 1;
    const value = i => (by === 'total' ? s.series.reduce((t, x) => t + x.values[i], 0) : by === 'label' ? null : s.series[Number(by.slice(1))]?.values[i] ?? 0);
    const label = (i, j) => sortCollator.compare(String(s.categories[i].value ?? ''), String(s.categories[j].value ?? ''));
    const order = s.categories.map((_, i) => i).sort((i, j) => (by === 'label' ? sign * label(i, j) : sign * (value(i) - value(j)) || label(i, j)));
    return {
        ...s,
        categories: order.map(i => s.categories[i]),
        series: s.series.map(x => ({ ...x, values: order.map(i => x.values[i]) })),
    };
}

// ---------------------------------------------------------------------
// Drawing a chart into its box (again when the box changes width)
// ---------------------------------------------------------------------

const resizeWatcher = new ResizeObserver(entries => {
    for (const entry of entries) {
        const box = entry.target;
        const drawn = box._drawn;
        if (!drawn || !box.clientWidth || drawn.asTable || ['table', 'number'].includes(drawn.display)) continue;
        if (Math.abs(box.clientWidth - drawn.width) <= 4) continue;
        if (drawn.series) drawSeriesChart(box, drawn.chart, drawn.series, drawn.display);
        else drawChart(box, drawn.chart, drawn.data, false);
    }
});

// asTable: the table view instead of the chart
function drawChart(box, chart, data, asTable) {
    const width = Math.max(Math.floor(box.clientWidth) || 0, 220);
    const display = asTable ? 'table' : (chart.groupBy ? chart.display : 'number');
    box._drawn = { chart, data, asTable, width, display };
    resizeWatcher.observe(box);
    if (!data.total) {
        box.innerHTML = '<p class="chart-empty">No tickets match these choices.</p>';
        return;
    }
    if (display === 'number') box.innerHTML = numberHtml(chart, data);
    else if (display === 'table') box.innerHTML = chartTableHtml(chart, data);
    else if (display === 'hbar') box.innerHTML = barsHtml(chart, data, width);
    else if (display === 'line' || display === 'area') box.innerHTML = lineHtml(chart, data, width, display === 'area');
    else if (display === 'donut') box.innerHTML = donutHtml(chart, data, width);
    else box.innerHTML = columnsHtml(chart, data, width);
}

// display: 'bar' (side by side), 'stacked', 'line' or 'table'
function drawSeriesChart(box, chart, series, display) {
    const width = Math.max(Math.floor(box.clientWidth) || 0, 220);
    box._drawn = { chart, series, width, display };
    resizeWatcher.observe(box);
    if (display === 'table') box.innerHTML = seriesTableHtml(chart, series);
    else if (display === 'line') box.innerHTML = seriesLineHtml(chart, series, width);
    else box.innerHTML = seriesColumnsHtml(chart, series, width, display === 'stacked');
}

// What isn't drawn: "Showing the top 10 of 105; the other 95 add up to 9,860"
// (donuts and tables show it themselves)
function chartNote(chart, data) {
    if (!data.other || ['donut', 'table', 'number'].includes(chart.display) || !chart.groupBy) return '';
    const all = data.rows.length + data.other.groups;
    return `Showing the top ${data.rows.length} of ${all.toLocaleString()}; the other ${data.other.groups.toLocaleString()} add up to ${data.other.count.toLocaleString()}.`;
}

// ---------------------------------------------------------------------
// Clicking a mark: a box with a _pick function (a dashboard chart, or an AI
// answer that is an exact chart) lists the tickets behind it
// ---------------------------------------------------------------------

function pickedRow(mark) {
    const box = mark.closest('.tile-body');
    const drawn = box?._drawn;
    if (!drawn || !box._pick || drawn.series) return null;
    const index = mark.dataset.index;
    if (index === 'all') return { box, row: null };
    if (index === 'other') return null;
    const i = index === 'line' ? mark._index : Number(index);
    const row = drawn.data.rows[i];
    return row ? { box, row } : null;
}

document.addEventListener('click', e => {
    const mark = e.target.closest?.('[data-index]');
    if (!mark) return;
    // A tap on a line (no pointer moved over it first): the point nearest the tap
    if (mark.classList.contains('line-hit')) moveCrosshair(mark, lineIndexAt(mark, e.clientX));
    const picked = pickedRow(mark);
    if (picked) picked.box._pick(picked.row);
});
document.addEventListener('keydown', e => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches?.('[data-index]')) return;
    const picked = pickedRow(e.target);
    if (!picked) return;
    e.preventDefault();
    picked.box._pick(picked.row);
});

// ---------------------------------------------------------------------
// The tooltip: one for the whole page, filled with textContent
// ---------------------------------------------------------------------

function chartTip() {
    let tip = document.getElementById('chart-tip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'chart-tip';
        tip.className = 'chart-tip';
        tip.innerHTML = '<strong></strong><span class="tip-label"></span><div class="tip-rows"></div><span class="tip-hint"></span>';
        document.body.appendChild(tip);
    }
    return tip;
}

// rows: [[series slot, name, value]] for charts of several series
function showChartTip(value, label, x, y, { rows = [], hint = '' } = {}) {
    const tip = chartTip();
    tip.querySelector('strong').textContent = value;
    tip.querySelector('.tip-label').textContent = label;
    const list = tip.querySelector('.tip-rows');
    list.replaceChildren(...rows.map(([slot, name, v]) => {
        const row = document.createElement('div');
        row.className = 'tip-row';
        const key = document.createElement('span');
        key.className = 'tip-key';
        key.style.background = `var(--series-${Number(slot) || 1})`;
        const nameEl = document.createElement('span');
        nameEl.textContent = name;
        const valueEl = document.createElement('b');
        valueEl.textContent = v;
        row.append(key, nameEl, valueEl);
        return row;
    }));
    tip.querySelector('.tip-hint').textContent = hint;
    tip.classList.add('show');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - w - 8))}px`;
    tip.style.top = `${y - h - 12 < 8 ? y + 18 : y - h - 12}px`;
}

function hideChartTip() {
    document.getElementById('chart-tip')?.classList.remove('show');
}

const DRILL_HINT = 'Click to see these tickets';

function markTip(mark, x, y) {
    mark.classList.add('hover');
    const drillable = mark.closest('.tile-body')?._pick && mark.dataset.index !== 'other' && !mark.dataset.tipRows;
    showChartTip(mark.dataset.tipValue, mark.dataset.tipLabel, x, y, {
        rows: mark.dataset.tipRows ? JSON.parse(mark.dataset.tipRows) : [],
        hint: drillable ? DRILL_HINT : '',
    });
}

// Where along a line chart the crosshair is: the pointer's nearest point, or a key press
function moveCrosshair(hit, index) {
    const svg = hit.ownerSVGElement;
    const box = svg.closest('.tile-body');
    const drawn = box?._drawn;
    if (!drawn) return;
    const series = drawn.series ? drawn.series.series : [{ values: drawn.data.rows.map(r => r.count) }];
    const count = series[0].values.length;
    index = Math.max(0, Math.min(count - 1, index));
    hit._index = index;
    const left = Number(hit.dataset.left), step = Number(hit.dataset.step);
    const top = Number(hit.dataset.top), plotH = Number(hit.dataset.plotH), max = Number(hit.dataset.max);
    const x = count > 1 ? left + index * step : left + (Number(hit.getAttribute('width')) - 12) / 2;
    const cross = svg.querySelector('.chart-cross');
    cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
    const dots = svg.querySelectorAll('.chart-cross-dot');
    series.forEach((s, k) => {
        dots[k]?.setAttribute('cx', x);
        dots[k]?.setAttribute('cy', top + plotH - (s.values[index] / max) * plotH);
        dots[k]?.setAttribute('visibility', 'visible');
    });
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / Number(svg.getAttribute('width'));
    const highest = Math.max(...series.map(s => s.values[index]));
    const y = top + plotH - (highest / max) * plotH;
    if (drawn.series) {
        const s = drawn.series;
        showChartTip(`${s.series.reduce((t, x) => t + x.values[index], 0).toLocaleString()} in all`, s.categories[index].label,
            rect.left + x * scale, rect.top + y * scale, { rows: s.series.map(x => [x.slot, x.name, x.values[index].toLocaleString()]) });
    } else {
        const row = drawn.data.rows[index];
        showChartTip(`${row.count.toLocaleString()} (${share(row.count, drawn.data.total)})`, groupLabel(drawn.chart, row.value, true),
            rect.left + x * scale, rect.top + y * scale, { hint: box._pick ? DRILL_HINT : '' });
    }
}

function hideCrosshair(svg) {
    svg?.querySelectorAll('.chart-cross, .chart-cross-dot').forEach(el => el.setAttribute('visibility', 'hidden'));
}

// The point of a line chart nearest to a pointer position
function lineIndexAt(hit, clientX) {
    const svg = hit.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / Number(svg.getAttribute('width'));
    const step = Number(hit.dataset.step) || 1;
    return Math.round(((clientX - rect.left) / scale - Number(hit.dataset.left)) / step);
}

document.addEventListener('pointermove', e => {
    const hit = e.target.closest?.('.line-hit');
    if (hit) {
        moveCrosshair(hit, lineIndexAt(hit, e.clientX));
        return;
    }
    const mark = e.target.closest?.('[data-tip-value]');
    if (mark) markTip(mark, e.clientX, e.clientY);
});
document.addEventListener('pointerout', e => {
    const mark = e.target.closest?.('[data-tip-value], .line-hit');
    if (!mark) return;
    mark.classList.remove('hover');
    if (mark.classList.contains('line-hit')) hideCrosshair(mark.ownerSVGElement);
    hideChartTip();
});
document.addEventListener('focusin', e => {
    if (e.target.classList?.contains('line-hit')) {
        const drawn = e.target.ownerSVGElement.closest('.tile-body')?._drawn;
        const count = drawn ? (drawn.series ? drawn.series.categories.length : drawn.data.rows.length) : 1;
        moveCrosshair(e.target, e.target._index ?? count - 1);
        return;
    }
    const mark = e.target.closest?.('[data-tip-value]');
    if (mark) {
        const r = mark.getBoundingClientRect();
        markTip(mark, r.left + r.width / 2, r.top);
    }
});
document.addEventListener('focusout', e => {
    if (e.target.closest?.('[data-tip-value], .line-hit')) {
        e.target.classList.remove('hover');
        if (e.target.classList.contains('line-hit')) hideCrosshair(e.target.ownerSVGElement);
        hideChartTip();
    }
});
document.addEventListener('keydown', e => {
    if (!e.target.classList?.contains('line-hit') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const drawn = e.target.ownerSVGElement.closest('.tile-body')?._drawn;
    const count = drawn ? (drawn.series ? drawn.series.categories.length : drawn.data.rows.length) : 1;
    const now = e.target._index ?? count - 1;
    moveCrosshair(e.target, e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 : now + (e.key === 'ArrowLeft' ? -1 : 1));
});
// A scrolled page leaves the tooltip behind, so it goes
document.addEventListener('scroll', hideChartTip, true);

// ---------------------------------------------------------------------
// PICTURES: a chart as a standalone SVG or PNG, always on white (for
// documents and slides), with its title, what it counts, and its legend.
// The chart is drawn off screen at a fixed width, then every color and
// font is written into the SVG, so the file needs no stylesheet.
// spec: { chart, data } (one series) or { chart, series, display } (several);
// title, subtitle
// ---------------------------------------------------------------------

const PICTURE_WIDTH = 960;
const PICTURE_PAD = 24;
const PICTURE_STYLES = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linejoin',
    'stroke-linecap', 'opacity', 'font-size', 'font-weight', 'font-family', 'font-variant-numeric'];

// Copies the computed look of every element into the copy, then drops what only works on screen
function standaloneSvg(svg) {
    const copy = svg.cloneNode(true);
    const from = [svg, ...svg.querySelectorAll('*')];
    const to = [copy, ...copy.querySelectorAll('*')];
    from.forEach((el, i) => {
        const cs = getComputedStyle(el);
        to[i].setAttribute('style', PICTURE_STYLES.map(p => `${p}:${cs.getPropertyValue(p)}`).join(';'));
        for (const attr of ['class', 'tabindex', 'role', 'aria-label']) to[i].removeAttribute(attr);
        for (const attr of [...to[i].attributes]) if (attr.name.startsWith('data-')) to[i].removeAttribute(attr.name);
    });
    copy.querySelectorAll('rect[style*="fill-opacity:0"], line[visibility="hidden"], circle[visibility="hidden"]').forEach(el => el.remove());
    return copy;
}

const xmlText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// -> { svg: text, width, height }
function chartPicture(spec) {
    const host = document.createElement('div');
    host.className = 'picture-host';
    host.innerHTML = '<div class="tile-body"></div>';
    document.body.appendChild(host);
    const body = host.firstChild;
    const W = PICTURE_WIDTH, inner = W - 2 * PICTURE_PAD;
    const color = name => getComputedStyle(host).getPropertyValue(name).trim();
    try {
        const parts = [];
        let y = PICTURE_PAD;
        parts.push(`<text x="${PICTURE_PAD}" y="${y + 18}" style="font-size:18px;font-weight:700;fill:${color('--text')};font-family:${CHART_FONT.replace(/"/g, "'")}">${xmlText(fitText(spec.title || 'Chart', inner, 18))}</text>`);
        y += 30;
        if (spec.subtitle) {
            parts.push(`<text x="${PICTURE_PAD}" y="${y + 12}" style="font-size:12px;fill:${color('--muted')};font-family:${CHART_FONT.replace(/"/g, "'")}">${xmlText(fitText(spec.subtitle, inner, 12))}</text>`);
            y += 24;
        }
        y += 6;
        const textStyle = (size, c, weight = 400) => `font-size:${size}px;font-weight:${weight};fill:${c};font-family:${CHART_FONT.replace(/"/g, "'")}`;

        if (spec.series) {
            // Legend row, then the chart
            let x = PICTURE_PAD;
            for (const s of spec.series.series) {
                const key = spec.display === 'line'
                    ? `<rect x="${x}" y="${y + 6}" width="14" height="3" rx="1.5" style="fill:${color(`--series-${s.slot}`)}"/>`
                    : `<rect x="${x}" y="${y + 1}" width="12" height="12" rx="3" style="fill:${color(`--series-${s.slot}`)}"/>`;
                parts.push(key + `<text x="${x + 18}" y="${y + 11}" style="${textStyle(12, color('--text-2'))}">${xmlText(s.name)}</text>`);
                x += 18 + textWidth(s.name, 12) + 18;
            }
            y += 24;
            drawSeriesChart(body, spec.chart, spec.series, spec.display);
            const svg = body.querySelector('svg');
            parts.push(`<g transform="translate(${PICTURE_PAD},${y})">${new XMLSerializer().serializeToString(standaloneSvg(svg))}</g>`);
            y += Number(svg.getAttribute('height'));
        } else if (spec.chart.display === 'number' || !spec.chart.groupBy) {
            drawChart(body, spec.chart, spec.data, false);
            const label = body.querySelector('.chart-stat-label')?.textContent || '';
            parts.push(`<text x="${PICTURE_PAD}" y="${y + 52}" style="${textStyle(56, color('--text'), 700)}">${spec.data.total.toLocaleString()}</text>`);
            parts.push(`<text x="${PICTURE_PAD}" y="${y + 80}" style="${textStyle(16, color('--muted'))}">${xmlText(label)}</text>`);
            y += 92;
        } else if (spec.chart.display === 'donut') {
            drawChart(body, spec.chart, spec.data, false);
            const svg = body.querySelector('svg');
            const size = Number(svg.getAttribute('height'));
            parts.push(`<g transform="translate(${PICTURE_PAD},${y})">${new XMLSerializer().serializeToString(standaloneSvg(svg))}</g>`);
            // The legend beside it: swatch, name, number, share
            const items = donutParts(spec.chart, spec.data);
            const lx = PICTURE_PAD + size + 32;
            const nameW = inner - size - 32 - 150;
            items.forEach((p, i) => {
                const ly = y + 14 + i * 24;
                const fill = p.other ? color('--chart-other') : color(`--series-${p.slot}`);
                parts.push(`<rect x="${lx}" y="${ly - 10}" width="12" height="12" rx="3" style="fill:${fill}"/>` +
                    `<text x="${lx + 20}" y="${ly}" style="${textStyle(13, color('--text-2'))}">${xmlText(fitText(p.label, nameW, 13))}</text>` +
                    `<text x="${lx + 20 + nameW + 80}" y="${ly}" text-anchor="end" style="${textStyle(13, color('--text'), 600)}">${p.count.toLocaleString()}</text>` +
                    `<text x="${lx + 20 + nameW + 140}" y="${ly}" text-anchor="end" style="${textStyle(13, color('--muted'))}">${share(p.count, spec.data.total)}</text>`);
            });
            y += Math.max(size, items.length * 24 + 8);
        } else {
            drawChart(body, spec.chart, spec.data, false);
            const svg = body.querySelector('svg');
            parts.push(`<g transform="translate(${PICTURE_PAD},${y})">${new XMLSerializer().serializeToString(standaloneSvg(svg))}</g>`);
            y += Number(svg.getAttribute('height'));
            const note = spec.data && chartNote(spec.chart, spec.data);
            if (note) {
                parts.push(`<text x="${PICTURE_PAD}" y="${y + 20}" style="${textStyle(11, color('--muted'))}">${xmlText(note)}</text>`);
                y += 24;
            }
        }
        y += 14;
        const stamp = `OneTouch · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        parts.push(`<text x="${W - PICTURE_PAD}" y="${y + 6}" text-anchor="end" style="${textStyle(10, color('--faint'))}">${xmlText(stamp)}</text>`);
        const height = Math.ceil(y + PICTURE_PAD);
        const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">` +
            `<rect width="${W}" height="${height}" style="fill:${color('--panel-bg')}"/>${parts.join('')}</svg>`;
        return { svg: svgText, width: W, height };
    } finally {
        resizeWatcher.unobserve(body);
        host.remove();
    }
}

// -> { png: data URL, width, height } (drawn at twice the size, for sharp printing)
async function picturePng(picture) {
    const url = URL.createObjectURL(new Blob([picture.svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
        const img = new Image();
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('The chart could not be turned into a picture.')); img.src = url; });
        const canvas = document.createElement('canvas');
        canvas.width = picture.width * 2;
        canvas.height = picture.height * 2;
        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, picture.width, picture.height);
        return { png: canvas.toDataURL('image/png'), width: picture.width, height: picture.height };
    } finally {
        URL.revokeObjectURL(url);
    }
}

// Saves the picture as name.png or name.svg
async function downloadPicture(spec, format, name) {
    const picture = chartPicture(spec);
    const blob = format === 'svg'
        ? new Blob([picture.svg], { type: 'image/svg+xml;charset=utf-8' })
        : await (await fetch((await picturePng(picture)).png)).blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return `${name}.${format}`;
}
