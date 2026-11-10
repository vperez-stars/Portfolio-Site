// =====================================================================
// ONETOUCH STATIC DEMO: a stand-in for the OneTouch server, in the browser.
//
// Loaded before the app's own scripts, it answers every /api/... request the
// page makes, so the real front end runs unchanged on a static host (GitHub
// Pages). Every ticket, team, person, site and system here is generated from
// a fixed seed: nothing comes from a real ServiceNow export.
//
// The AI assistant is a scripted stand-in: a small rule-based reader of the
// question that produces the same reply format the real server sends after
// Claude has turned the question into a Cube query.
// =====================================================================
(function () {
    'use strict';

    // ---------------------------------------------------------------
    // Random but repeatable
    // ---------------------------------------------------------------
    function mulberry32(a) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    const rand = mulberry32(424242);
    const pick = list => list[Math.floor(rand() * list.length)];
    const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
    const chance = p => rand() < p;
    function weighted(pairs) {
        const total = pairs.reduce((s, p) => s + p[1], 0);
        let r = rand() * total;
        for (const [value, w] of pairs) { if ((r -= w) <= 0) return value; }
        return pairs[pairs.length - 1][0];
    }
    const expo = mean => -Math.log(1 - rand()) * mean;

    // ---------------------------------------------------------------
    // Time: the data runs for 90 days up to "now" (rounded to the hour)
    // ---------------------------------------------------------------
    const HOUR = 3600e3, DAY = 24 * HOUR;
    const NOW = Math.floor(Date.now() / HOUR) * HOUR;
    const START = NOW - 90 * DAY;
    const pad = n => String(n).padStart(2, '0');
    const fmt = ms => {
        if (ms == null) return null;
        const d = new Date(ms);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    const dayOf = ms => (ms == null ? null : fmt(ms).slice(0, 10));
    const monthOf = ms => (ms == null ? null : fmt(ms).slice(0, 7));
    function weekOf(ms) {
        if (ms == null) return null;
        const d = new Date(ms);
        const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = t.getUTCDay() || 7;
        t.setUTCDate(t.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
        const week = Math.ceil(((t - yearStart) / DAY + 1) / 7);
        return `${t.getUTCFullYear()}-W${pad(week)}`;
    }
    const parseTime = s => (s ? new Date(s.replace(' ', 'T')).getTime() : null);
    // A moment in the data, more of them on weekdays and in working hours
    function randomMoment(from = START, to = NOW) {
        for (;;) {
            const t = from + rand() * (to - from);
            const d = new Date(t);
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            const h = d.getHours();
            const p = (weekend ? 0.35 : 1) * (h >= 7 && h <= 18 ? 1 : 0.3);
            if (rand() < p) return Math.floor(t / 1000) * 1000;
        }
    }

    // ---------------------------------------------------------------
    // The fictional company: Demo Co., a manufacturer with plants,
    // distribution centers and a cloud estate
    // ---------------------------------------------------------------
    const FIRST = ['Avery', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Jamie', 'Drew', 'Quinn', 'Reese', 'Skyler', 'Rowan', 'Elena', 'Marcus', 'Priya', 'Samuel', 'Dana', 'Omar', 'Lena', 'Victor', 'Nadia', 'Theo', 'Grace', 'Hector', 'Ines', 'Kofi', 'Mei', 'Ravi', 'Sofia', 'Tomas', 'Yara', 'Zane', 'Alma', 'Bruno', 'Clara', 'Diego', 'Erin', 'Felix', 'Gwen', 'Hugo', 'Iris', 'Jonah', 'Kira', 'Liam', 'Maya', 'Noel', 'Olive', 'Pablo', 'Rosa', 'Seth'];
    const LAST = ['Avery', 'Bennett', 'Castillo', 'Dalton', 'Ellison', 'Fischer', 'Garcia', 'Hayes', 'Ibarra', 'Jensen', 'Kowalski', 'Lindqvist', 'Moreno', 'Nakamura', 'Okafor', 'Petrov', 'Quintero', 'Ramirez', 'Sato', 'Tran', 'Underwood', 'Vasquez', 'Whitfield', 'Xu', 'Yilmaz', 'Zimmer', 'Abbott', 'Brennan', 'Chandra', 'Duarte', 'Ekwueme', 'Foster', 'Gallagher', 'Holm', 'Iqbal', 'Juarez', 'Keller', 'Lowe', 'Mbeki', 'Novak'];
    const usedNames = new Set();
    function newPerson() {
        for (;;) {
            const name = `${pick(FIRST)} ${pick(LAST)}`;
            if (!usedNames.has(name)) { usedNames.add(name); return name; }
        }
    }

    const LOCATIONS = [
        ['Headquarters', 16], ['Riverside Plant', 14], ['Hillcrest Plant', 11], ['Bayview Plant', 9], ['Northgate Plant', 6],
        ['Eastgate Distribution Center', 7], ['Westfield Distribution Center', 6], ['Cloud - East Region', 12],
        ['Cloud - West Region', 8], ['Remote Worker', 7], ['Regional Sales Office', 4],
    ];
    const PLANTS = ['Riverside Plant', 'Hillcrest Plant', 'Bayview Plant', 'Northgate Plant'];

    // The ServiceNow assignment groups, each with its people and its systems
    const GROUPS = {
        'SD-ServiceDesk-L1': { w: 17, cis: ['M365-EXCHANGE-ONLINE', 'VPN-GLOBALPROTECT', 'TEAMS-VOICE', 'AD-DOMAIN-PRD'] },
        'INFRA-Cloud-Windows': { w: 14, cis: ['WIN-APP-PRD-014', 'WIN-FS-PRD-007', 'WIN-APP-PRD-022', 'WIN-RDS-PRD-003', 'WIN-APP-QA-031'] },
        'INFRA-Cloud-Linux': { w: 8, cis: ['LNX-WEB-PRD-012', 'LNX-API-PRD-004', 'LNX-ETL-PRD-002', 'LNX-WEB-QA-019'] },
        'ERP-Basis': { w: 10, cis: ['ERP-PRD-APP01', 'ERP-PRD-DB01', 'ERP-QAS-APP01', 'ERP-PRD-BATCH'] },
        'ERP-Security': { w: 6, cis: ['ERP-PRD-APP01', 'ERP-GRC-PRD'] },
        'NOC-Monitoring': { w: 9, cis: ['FW-EDGE-HQ-01', 'SW-CORE-RIV-02', 'RTR-WAN-BAY-01', 'SW-CORE-HIL-01'] },
        'EUS-Field-Support': { w: 8, cis: ['LAPTOP-FLEET', 'DOCK-STATION', 'BADGE-PRINTER', 'CONF-ROOM-AV'] },
        'EUS-Remote-Support': { w: 6, cis: ['VDI-POOL-A', 'VDI-POOL-B', 'INTUNE-MDM'] },
        'NET-Data-Network': { w: 5, cis: ['WIFI-CTRL-01', 'SW-CORE-RIV-02', 'SDWAN-EDGE'] },
        'DB-SQL-Platform': { w: 5, cis: ['SQL-CLU-PRD-03', 'SQL-CLU-PRD-05', 'SQL-RPT-PRD-01'] },
        'MES-Plant-Systems': { w: 6, cis: ['MES-RIV-LINE3', 'MES-HIL-LINE1', 'MES-BAY-LINE2', 'PKG-LABELER-L4'] },
        'IAM-Access-Mgmt': { w: 5, cis: ['ENTRA-ID', 'MFA-SERVICE', 'PAM-VAULT'] },
    };
    const GROUP_NAMES = Object.keys(GROUPS);
    for (const g of GROUP_NAMES) GROUPS[g].people = Array.from({ length: between(5, 9) }, newPerson);

    // What incidents are about: [group, category, subcategory, summary(ci, loc)]
    const INCIDENT_KINDS = [
        ['INFRA-Cloud-Windows', 'Hardware', 'Server', (ci) => `${ci} : CPU utilization above 95% for 15 minutes`],
        ['INFRA-Cloud-Windows', 'Hardware', 'Server', (ci) => `Disk space low on ${ci} (D: drive ${between(90, 99)}% used)`],
        ['INFRA-Cloud-Windows', 'Hardware', 'Server', (ci) => `${ci} not responding to ping`],
        ['INFRA-Cloud-Windows', 'Software/Configuration', 'Operating System', (ci) => `Windows service stopped on ${ci}`],
        ['INFRA-Cloud-Linux', 'Hardware', 'Server', (ci) => `${ci} : memory used ${between(90, 99)}%`],
        ['INFRA-Cloud-Linux', 'Hardware', 'Server', (ci) => `Filesystem /var above 90% on ${ci}`],
        ['ERP-Basis', 'Business Services', 'ERP', () => `ERP batch job ${pick(['FI_CLOSE', 'MM_REPL', 'SD_BILLING', 'PP_MRP'])}_${between(10, 99)} failed`],
        ['ERP-Basis', 'Business Services', 'ERP', () => 'Long running dialog process on ERP production'],
        ['ERP-Basis', 'Business Services', 'ERP', () => 'ERP transport stuck in the import queue'],
        ['ERP-Security', 'Security', 'Access', () => `User needs a role in the ERP ${pick(['finance', 'purchasing', 'warehouse', 'sales'])} module`],
        ['ERP-Security', 'Security', 'Access', () => 'ERP account locked after password attempts'],
        ['NOC-Monitoring', 'Network', 'Connectivity', (ci) => `Node down alert triggered on ${ci}`],
        ['NOC-Monitoring', 'Network', 'Connectivity', (ci) => `Interface flapping on ${ci}`],
        ['NOC-Monitoring', 'Network', 'Connectivity', (ci) => `High latency to ${ci} from monitoring`],
        ['SD-ServiceDesk-L1', 'Inquiry / Help', 'Password', () => 'Password reset request'],
        ['SD-ServiceDesk-L1', 'Inquiry / Help', 'How-to', () => 'Unable to connect to VPN from home'],
        ['SD-ServiceDesk-L1', 'Email', 'Outlook', () => 'Outlook keeps asking for credentials'],
        ['SD-ServiceDesk-L1', 'Telephony', 'Teams', () => 'Teams calls dropping after a few minutes'],
        ['EUS-Field-Support', 'Hardware', 'Laptop', (ci, loc) => `Laptop will not power on at ${loc}`],
        ['EUS-Field-Support', 'Hardware', 'Peripheral', () => 'Docking station not detecting monitors'],
        ['EUS-Field-Support', 'Printing', 'Printer', (ci, loc) => `Badge printer jammed at ${loc}`],
        ['EUS-Remote-Support', 'Software/Configuration', 'VDI', (ci) => `${ci} session freezes at sign-in`],
        ['EUS-Remote-Support', 'Software/Configuration', 'Application', () => 'Install of approved software failed'],
        ['NET-Data-Network', 'Network', 'Wi-Fi', (ci, loc) => `Wi-Fi drops in the ${loc} warehouse`],
        ['NET-Data-Network', 'Network', 'Connectivity', (ci, loc) => `Slow network at ${loc}`],
        ['DB-SQL-Platform', 'Database', 'SQL Server', (ci) => `${ci} : SQL Agent job failed`],
        ['DB-SQL-Platform', 'Database', 'SQL Server', (ci) => `Database backup missed on ${ci}`],
        ['MES-Plant-Systems', 'Hardware', 'Printer', (ci, loc) => `Line ${between(1, 6)} labeler offline at ${loc}`],
        ['MES-Plant-Systems', 'Business Services', 'MES', (ci, loc) => `MES screen frozen on packaging line ${between(1, 6)} at ${loc}`],
        ['MES-Plant-Systems', 'Hardware', 'Scanner', (ci, loc) => `Scanner not reading pallet labels at ${loc}`],
        ['IAM-Access-Mgmt', 'Security', 'MFA', () => 'MFA enrollment does not complete'],
        ['IAM-Access-Mgmt', 'Security', 'Access', () => 'Shared mailbox access not working'],
    ];
    const kindsByGroup = {};
    for (const k of INCIDENT_KINDS) (kindsByGroup[k[0]] ||= []).push(k);

    const PRIORITIES = [['P1 - Critical', 0.4], ['P2 - High', 3], ['P3 - Average', 70], ['P4 - Low', 26.6]];
    const IMPACT = { 'P1 - Critical': '1 - Enterprise', 'P2 - High': '2 - Site/Dept', 'P3 - Average': '3 - Multiple Users', 'P4 - Low': '4 - Single User' };
    const URGENCY = { 'P1 - Critical': '1 - High', 'P2 - High': '1 - High', 'P3 - Average': '2 - Medium', 'P4 - Low': '3 - Low' };
    const RESOLVE_HOURS = { 'P1 - Critical': 4, 'P2 - High': 10, 'P3 - Average': 30, 'P4 - Low': 70 };
    const CONTACT = [['Monitoring', 34], ['Self-service', 24], ['Phone', 16], ['Email', 12], ['Chat', 10], ['Walk-in', 4]];
    const CLOSE_CODES = [['Solved (Permanently)', 55], ['Solved (Work Around)', 15], ['Closed/Resolved by Caller', 12], ['Not Solved (Not Reproducible)', 8], ['Duplicate', 5], ['Solved Remotely', 5]];
    const CAUSES = [['Configuration', 22], ['Capacity', 18], ['Hardware failure', 14], ['Software defect', 14], ['User error', 12], ['Network', 9], ['Change related', 5], ['Unknown', 6]];
    const HOLD = [['Awaiting Caller', 45], ['Awaiting Vendor', 25], ['Awaiting Change', 18], ['Awaiting Problem', 12]];

    const OPEN = {
        incident: ['New', 'In Progress', 'On Hold'],
        change_request: ['Pending', 'Pre-approve', 'Review', 'Build and Test', 'Work in Progress'],
        sc_req_item: ['Open', 'Pending'],
        sc_task: ['Open', 'Pending', 'Work in Progress'],
    };
    const CLOSED = {
        incident: ['Resolved', 'Closed'],
        change_request: ['Closed', 'Canceled'],
        sc_req_item: ['Fulfilled', 'Closed Complete', 'Closed Cancelled', 'Closed Incomplete', 'Closed Rejected'],
        sc_task: ['Closed Complete', 'Closed Cancelled', 'Closed Incomplete'],
    };
    function openChance(ageMs) {
        const d = ageMs / DAY;
        return d < 2 ? 0.7 : d < 7 ? 0.25 : d < 30 ? 0.06 : 0.015;
    }

    // ---------------------------------------------------------------
    // Generating the tickets
    // ---------------------------------------------------------------
    const T = { incident: [], change_request: [], sc_req_item: [], sc_task: [] };
    const byNumber = new Map();
    let incN = 2400100, chgN = 3100100, ritmN = 612100, taskN = 801100, reqN = 590100;
    const num = (prefix, n) => prefix + String(n).padStart(7, '0');
    const groupPick = () => weighted(GROUP_NAMES.map(g => [g, GROUPS[g].w]));
    const addTimes = (r, field, ms) => {
        r[`${field}_day`] = dayOf(ms); r[`${field}_week`] = weekOf(ms); r[`${field}_month`] = monthOf(ms);
    };

    function makeIncident({ created, group, kind, ci, loc, priority, parent = null, open = null, summary = null }) {
        group ||= groupPick();
        kind ||= pick(kindsByGroup[group]);
        ci ||= pick(GROUPS[group].cis);
        loc ||= (group === 'MES-Plant-Systems' ? pick(PLANTS) : weighted(LOCATIONS));
        priority ||= weighted(PRIORITIES);
        const isOpen = open ?? chance(openChance(NOW - created));
        const resolvedAt = isOpen ? null : Math.min(NOW - HOUR, created + Math.max(0.3, expo(RESOLVE_HOURS[priority])) * HOUR);
        const closedAt = resolvedAt && NOW - resolvedAt > 3 * DAY ? resolvedAt + 3 * DAY : null;
        const state = isOpen ? weighted([['New', 25], ['In Progress', 55], ['On Hold', 20]]) : closedAt ? 'Closed' : 'Resolved';
        const contact = kind[1] === 'Network' || /alert|CPU|Disk|memory|Filesystem|job failed|backup/i.test(kind[3].toString()) ? 'Monitoring' : weighted(CONTACT);
        const person = isOpen && state === 'New' && chance(0.5) ? null : pick(GROUPS[group].people);
        const updated = isOpen ? Math.min(NOW, created + rand() * (NOW - created)) : (closedAt || resolvedAt);
        const r = {
            number: num('INC', incN += between(1, 3)),
            created: fmt(created), updated: fmt(updated), resolved: fmt(resolvedAt), closed: fmt(closedAt),
            priority, impact: IMPACT[priority], urgency: URGENCY[priority], state,
            on_hold_reason: state === 'On Hold' ? weighted(HOLD) : null,
            short_description: summary || kind[3](ci, loc),
            description: null,
            category: kind[1], subcategory: kind[2], assignment_group: group, assigned_to: person,
            affected_user: `${pick(FIRST)} ${pick(LAST)}`, location: loc, configuration_item: ci, contact_type: contact,
            close_code: isOpen ? null : weighted(CLOSE_CODES), close_notes: null,
            cause_code: isOpen ? null : weighted(CAUSES),
            reassignment_count: String(weighted([[0, 60], [1, 25], [2, 10], [3, 3], [4, 2]])),
            reopen_count: String(isOpen ? 0 : weighted([[0, 95], [1, 5]])),
            caused_by_change: null, parent_incident: parent, problem: null,
            was_p1: String(priority === 'P1 - Critical' || chance(0.002)),
            opened_by_group: contact === 'Monitoring' ? 'NOC-Monitoring' : 'SD-ServiceDesk-L1',
            work_notes: null, sla_breached: String(!isOpen && (resolvedAt - created) > RESOLVE_HOURS[priority] * 3 * HOUR),
        };
        r.description = `${r.short_description}. Reported via ${contact.toLowerCase()} for ${loc}.`;
        if (!isOpen) r.close_notes = pick(['Restarted the service and confirmed with the user.', 'Cleared space and added monitoring.', 'Applied the vendor fix.', 'Reset the account and verified sign-in.', 'Replaced the faulty part.', 'Could not reproduce; user confirmed it works now.']);
        if (person) r.work_notes = `${fmt(updated)} - ${person} (Work notes)\n${pick(['Looking into it now.', 'Waiting on the vendor engineer.', 'Escalated to the platform team.', 'Applied a workaround; monitoring.'])}`;
        addTimes(r, 'created', created);
        r.resolved_day = dayOf(resolvedAt); r.resolved_month = monthOf(resolvedAt);
        T.incident.push(r); byNumber.set(r.number, { cube: 'incident', r });
        return r;
    }

    // Incidents, day by day
    for (let d = START; d < NOW; d += DAY) {
        const weekday = ![0, 6].includes(new Date(d).getDay());
        const n = weekday ? between(34, 52) : between(10, 18);
        for (let i = 0; i < n; i++) makeIncident({ created: randomMoment(d, Math.min(d + DAY, NOW)) });
    }
    T.incident.sort((a, b) => a.created.localeCompare(b.created));
    // Renumber in time order so numbers grow with time
    incN = 2400100;
    for (const r of T.incident) { byNumber.delete(r.number); r.number = num('INC', incN += between(1, 3)); byNumber.set(r.number, { cube: 'incident', r }); }

    // Parent incidents: one fault, many alerts or calls
    const parents = [];
    for (let i = 0; i < 45; i++) {
        const group = pick(['NOC-Monitoring', 'INFRA-Cloud-Windows', 'MES-Plant-Systems', 'NET-Data-Network', 'ERP-Basis', 'SD-ServiceDesk-L1']);
        const kind = pick(kindsByGroup[group]);
        const created = randomMoment();
        const ci = pick(GROUPS[group].cis);
        const loc = group === 'MES-Plant-Systems' ? pick(PLANTS) : weighted(LOCATIONS);
        const priority = weighted([['P1 - Critical', 8], ['P2 - High', 40], ['P3 - Average', 52]]);
        const open = NOW - created < 2 * DAY ? chance(0.7) : chance(0.04);
        const parent = makeIncident({ created, group, kind, ci, loc, priority, open });
        parents.push(parent);
        const kids = weighted([[2, 30], [3, 25], [4, 15], [6, 12], [9, 10], [15, 5], [28, 3]]);
        for (let k = 0; k < kids; k++) {
            // Each child reports the same fault, in the caller's or the monitor's words
            const summary = chance(0.6) ? parent.short_description : pick([`Re: ${parent.short_description}`, `Also affected: ${parent.short_description}`, `Repeat alert - ${parent.short_description}`]);
            makeIncident({ created: created + between(-50, 90) * 60e3, group, kind, ci, loc, priority: chance(0.7) ? 'P3 - Average' : 'P4 - Low', parent: parent.number, open: open && chance(0.8), summary });
        }
    }

    // Changes
    const CHANGE_KINDS = [
        ['INFRA-Cloud-Windows', 'Patching', (ci, env) => `Monthly Windows patching - ${env} - ${between(4, 70)} servers`],
        ['INFRA-Cloud-Windows', 'Server provisioning', () => `Server provisioning || ${between(1, 4)} server(s) for ${pick(['reporting', 'ERP interfaces', 'plant historian', 'file share'])}`],
        ['INFRA-Cloud-Linux', 'Patching', (ci, env) => `Linux kernel patching - ${env}`],
        ['INFRA-Cloud-Linux', 'Configuration', (ci) => `Increase memory on ${ci}`],
        ['ERP-Basis', 'Application release', () => `Deploy ERP release ${between(24, 27)}.${between(1, 12)}`],
        ['ERP-Basis', 'Configuration', () => 'ERP kernel upgrade on application servers'],
        ['ERP-Security', 'Configuration', () => 'Update ERP role design for finance close'],
        ['NET-Data-Network', 'Firewall rule', () => `Firewall rule for ${pick(['supplier EDI', 'payroll', 'MES to ERP', 'carrier tracking'])} integration`],
        ['NET-Data-Network', 'Configuration', (ci) => `Upgrade firmware on ${ci}`],
        ['NOC-Monitoring', 'Configuration', () => 'Tune alert thresholds for core switches'],
        ['DB-SQL-Platform', 'Patching', (ci) => `SQL Server cumulative update on ${ci}`],
        ['DB-SQL-Platform', 'Decommission', (ci) => `Decommission ${ci}`],
        ['MES-Plant-Systems', 'Application release', (ci, env, loc) => `MES update for packaging lines at ${pick(PLANTS)}`],
        ['IAM-Access-Mgmt', 'Certificate renewal', () => `Renew SSL certificate for ${pick(['the intranet', 'the supplier portal', 'SSO', 'the API gateway'])}`],
        ['EUS-Remote-Support', 'Configuration', () => 'New VDI golden image rollout'],
    ];
    const changes = [];
    for (let i = 0; i < 520; i++) {
        const k = pick(CHANGE_KINDS);
        const group = k[0];
        const created = randomMoment();
        const type = weighted([['Standard', 55], ['Normal', 38], ['Emergency', 7]]);
        const env = weighted([['Production', 60], ['Non-Production', 25], ['QA', 15]]);
        const ci = pick(GROUPS[group].cis);
        const lead = type === 'Emergency' ? rand() * 0.5 * DAY : (0.5 + expo(7)) * DAY;
        const start = created + lead;
        const end = start + between(1, 8) * HOUR;
        let state, close = null, failure = null, approval;
        if (end < NOW - DAY && chance(0.95)) {
            state = chance(0.94) ? 'Closed' : 'Canceled';
            approval = state === 'Canceled' && chance(0.4) ? 'Rejected' : 'Approved';
            if (state === 'Closed') {
                close = weighted([['Successful', 88], ['Successful with issues', 7], ['Unsuccessful', 5]]);
                if (close === 'Unsuccessful') failure = pick(['Implementation error', 'Insufficient testing', 'Rolled back - vendor issue', 'Ran out of window']);
            }
        } else {
            state = start > NOW ? weighted([['Pending', 20], ['Pre-approve', 15], ['Review', 35], ['Build and Test', 15], ['Work in Progress', 15]]) : weighted([['Work in Progress', 50], ['Review', 50]]);
            approval = weighted([['Requested', 40], ['Approved', 50], ['Not Yet Requested', 10]]);
        }
        const risk = type === 'Standard' ? weighted([['Low', 60], ['Standard', 40]]) : weighted([['High', 18], ['Medium', 55], ['Low', 27]]);
        const r = {
            number: '', created: fmt(created), short_description: k[2](ci, env), risk, state, type, sub_type: k[1],
            owner_group: group, approval, environment: env, close_code: close, failure_code: failure,
            outage: String(env === 'Production' && chance(0.18)), configuration_item: ci,
            requested_by: pick(GROUPS[group].people), planned_start_date: fmt(start), planned_end_date: fmt(end),
            planned_start_month: monthOf(start),
        };
        addTimes(r, 'created', created);
        changes.push(r);
    }
    changes.sort((a, b) => a.created.localeCompare(b.created));
    for (const r of changes) { r.number = num('CHG', chgN += between(1, 4)); T.change_request.push(r); byNumber.set(r.number, { cube: 'change_request', r }); }
    // Some incidents were caused by a change that went wrong
    for (const c of changes.filter(c => c.close_code && c.close_code !== 'Successful')) {
        const after = T.incident.filter(i => i.assignment_group === c.owner_group && i.created > c.planned_start_date && i.created < fmt(parseTime(c.planned_start_date) + 2 * DAY) && !i.parent_incident);
        for (const i of after.slice(0, between(1, 3))) { i.caused_by_change = c.number; i.cause_code = i.cause_code ? 'Change related' : null; }
    }

    // Requests (RITMs) inside orders (REQs), each with its catalog tasks
    const ITEMS = [
        ['New laptop', [['EUS-Field-Support', 'Image and ship laptop'], ['IAM-Access-Mgmt', 'Enroll device in MDM']], 14],
        ['Software install', [['EUS-Remote-Support', 'Package and push software']], 16],
        ['VDI - pool access', [['EUS-Remote-Support', 'Add user to VDI pool']], 10],
        ['Shared mailbox access', [['IAM-Access-Mgmt', 'Grant mailbox permissions']], 10],
        ['ERP role access', [['ERP-Security', 'Assign ERP role'], ['ERP-Security', 'Confirm segregation of duties']], 12],
        ['New hire setup', [['IAM-Access-Mgmt', 'Create account'], ['EUS-Field-Support', 'Prepare equipment'], ['SD-ServiceDesk-L1', 'Day-one welcome call']], 7],
        ['Mobile phone', [['EUS-Field-Support', 'Order and activate phone']], 6],
        ['Monitor / peripherals', [['EUS-Field-Support', 'Deliver peripherals']], 8],
        ['VPN access', [['NET-Data-Network', 'Add user to VPN group']], 6],
        ['Server provisioning', [['INFRA-Cloud-Windows', 'Build server'], ['DB-SQL-Platform', 'Install SQL instance']], 4],
        ['Firewall rule request', [['NET-Data-Network', 'Implement firewall rule']], 4],
        ['Distribution list change', [['SD-ServiceDesk-L1', 'Update distribution list']], 3],
    ];
    const ritms = [];
    for (let i = 0; i < 1900; i++) {
        const item = weighted(ITEMS.map(it => [it, it[2]]));
        const opened = randomMoment();
        const isOpen = chance(Math.min(0.9, openChance(NOW - opened) * 2.2));
        const needsApproval = ['ERP role access', 'New laptop', 'Server provisioning', 'Firewall rule request', 'Mobile phone'].includes(item[0]);
        let state, stage, approval, closed = null;
        if (isOpen) {
            approval = needsApproval ? weighted([['Requested', 45], ['Approved', 55]]) : 'Approved';
            state = approval === 'Requested' ? 'Pending' : weighted([['Open', 70], ['Pending', 30]]);
            stage = approval === 'Requested' ? 'Waiting for Approval' : 'Fulfillment';
        } else {
            closed = Math.min(NOW - HOUR, opened + (0.2 + expo(3)) * DAY);
            state = weighted([['Closed Complete', 70], ['Fulfilled', 14], ['Closed Cancelled', 8], ['Closed Incomplete', 4], ['Closed Rejected', 4]]);
            approval = state === 'Closed Rejected' ? 'Rejected' : 'Approved';
            stage = state === 'Closed Cancelled' ? 'Request Cancelled' : state === 'Closed Rejected' ? 'Request Rejected' : 'Completed';
        }
        const who = `${pick(FIRST)} ${pick(LAST)}`;
        const r = {
            number: '', short_description: `${item[0]} for ${who}`, item: item[0], state, stage, approval,
            requested_for: who, opened_by: chance(0.8) ? who : `${pick(FIRST)} ${pick(LAST)}`,
            opened: fmt(opened), closed: fmt(closed), request: '', location: weighted(LOCATIONS),
            _tasks: item[1], _openedMs: opened, _closedMs: closed,
        };
        addTimes(r, 'opened', opened);
        r.closed_month = monthOf(closed);
        ritms.push(r);
    }
    ritms.sort((a, b) => a.opened.localeCompare(b.opened));
    let order = null, left = 0;
    for (const r of ritms) {
        if (!left) { order = num('REQ', reqN += between(1, 3)); left = weighted([[1, 75], [2, 18], [3, 7]]); }
        left -= 1;
        r.number = num('RITM', ritmN += between(1, 3));
        r.request = order;
        T.sc_req_item.push(r); byNumber.set(r.number, { cube: 'sc_req_item', r });
        // Its catalog tasks, one after another
        let at = r._openedMs + between(5, 120) * 60e3;
        r._tasks.forEach(([group, what], i) => {
            const last = i === r._tasks.length - 1;
            const done = r._closedMs ? true : r.stage === 'Waiting for Approval' ? null : !last && chance(0.6);
            if (done === null && i > 0) return; // still waiting for approval: only the first task exists, and it waits
            const closedAt = done ? Math.min(r._closedMs || NOW - HOUR, at + expo(1.2) * DAY) : null;
            const t = {
                number: num('SCTASK', taskN += between(1, 3)), short_description: `${what} - ${r.item}`,
                state: done ? (r.state === 'Closed Cancelled' ? 'Closed Cancelled' : r.state === 'Closed Incomplete' ? 'Closed Incomplete' : 'Closed Complete')
                    : done === null ? 'Pending' : weighted([['Open', 45], ['Work in Progress', 40], ['Pending', 15]]),
                assignment_group: group, assigned_to: chance(0.85) ? pick(GROUPS[group].people) : null,
                created: fmt(at), closed: fmt(closedAt), sla_flag: String(chance(0.08)),
                request_item: r.number, request: r.request, item: r.item,
            };
            addTimes(t, 'created', at);
            T.sc_task.push(t); byNumber.set(t.number, { cube: 'sc_task', r: t });
            at = (closedAt || at) + between(10, 600) * 60e3;
        });
    }
    T.sc_task.sort((a, b) => a.number.localeCompare(b.number));
    for (const r of T.sc_req_item) { delete r._tasks; delete r._openedMs; delete r._closedMs; }

    // ---------------------------------------------------------------
    // How each kind of ticket is summed up (tickets.mjs TICKET_KINDS)
    // ---------------------------------------------------------------
    const KINDS = {
        INC: { cube: 'incident', label: 'Incident', f: { summary: 'short_description', state: 'state', level: 'priority', team: 'assignment_group', person: 'assigned_to', opened: 'created', parent: 'parent_incident' } },
        CHG: { cube: 'change_request', label: 'Change', f: { summary: 'short_description', state: 'state', level: 'risk', team: 'owner_group', person: 'requested_by', opened: 'created' } },
        RITM: { cube: 'sc_req_item', label: 'Request', f: { summary: 'short_description', state: 'state', person: 'requested_for', opened: 'opened', parent: 'request' } },
        SCTASK: { cube: 'sc_task', label: 'Catalog task', f: { summary: 'short_description', state: 'state', team: 'assignment_group', person: 'assigned_to', opened: 'created', parent: 'request_item' } },
    };
    const CUBE_KIND = { incident: 'INC', change_request: 'CHG', sc_req_item: 'RITM', sc_task: 'SCTASK' };
    const kindOf = number => (number.match(/^[A-Z]+/) || [''])[0];
    const tasksOf = new Map();
    for (const t of T.sc_task) { if (!tasksOf.has(t.request_item)) tasksOf.set(t.request_item, []); tasksOf.get(t.request_item).push(t); }
    const childrenOf = new Map();
    for (const i of T.incident) if (i.parent_incident) { if (!childrenOf.has(i.parent_incident)) childrenOf.set(i.parent_incident, []); childrenOf.get(i.parent_incident).push(i); }

    function summaryOf(number) {
        const hit = byNumber.get(number);
        if (!hit) return null;
        const kind = kindOf(number);
        const { f, label } = KINDS[kind];
        const r = hit.r;
        let team = f.team ? r[f.team] : null;
        if (kind === 'RITM') team = [...new Set((tasksOf.get(number) || []).map(t => t.assignment_group))].join(', ') || null;
        return {
            number, kind, type: label, summary: r[f.summary] || '', state: r[f.state] || '',
            level: f.level ? r[f.level] || '' : '', team: team || '', person: (f.person && r[f.person]) || '',
            opened: r[f.opened] || '', parent: (f.parent && r[f.parent]) || '',
        };
    }
    const isOpenTicket = s => OPEN[KINDS[s.kind].cube].includes(s.state);
    const RANK = { 'P1 - Critical': 1, 'P2 - High': 2, 'P3 - Average': 3, 'P4 - Low': 4, High: 2, Medium: 3, Low: 4, Standard: 4 };
    const rankOf = s => RANK[s.level] || 5;

    // ---------------------------------------------------------------
    // KPIs (kpis.mjs, simplified)
    // ---------------------------------------------------------------
    function duration(ms) {
        const h = Math.abs(ms) / HOUR;
        if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
        if (h < 48) return `${h.toFixed(1)} h`;
        return `${(h / 24).toFixed(1)} days`;
    }
    const kpi = (key, label, value, tone, detail) => ({ key, label, value: String(value), tone, detail });
    function ticketKpis(number) {
        const hit = byNumber.get(number);
        if (!hit) return null;
        const r = hit.r, kind = kindOf(number), list = [];
        if (kind === 'INC') {
            const created = parseTime(r.created), typical = RESOLVE_HOURS[r.priority] * HOUR;
            if (OPEN.incident.includes(r.state)) {
                const age = NOW - created;
                list.push(kpi('age', 'Open for', duration(age), age > typical * 2 ? 'bad' : age > typical ? 'warn' : 'good', `A ${r.priority.slice(0, 2)} incident is typically resolved in ${duration(typical)}.`));
                const idle = NOW - parseTime(r.updated);
                list.push(kpi('idle', 'Last update', `${duration(idle)} ago`, idle > 7 * DAY ? 'bad' : idle > 2 * DAY ? 'warn' : 'good', 'Time since anyone last updated it. A week or more without an update usually means it is stuck.'));
            } else {
                const took = parseTime(r.resolved) - created;
                list.push(kpi('took', 'Resolved in', duration(took), took > typical * 2 ? 'warn' : 'good', `A ${r.priority.slice(0, 2)} incident is typically resolved in ${duration(typical)}.`));
            }
            const re = Number(r.reassignment_count);
            list.push(kpi('reassigned', 'Reassigned', `${re}×`, re >= 3 ? 'bad' : re ? 'info' : 'good', 'How many times it was passed to another team. 3 or more usually means it was routed to the wrong team.'));
            list.push(kpi('reopened', 'Reopened', `${r.reopen_count}×`, r.reopen_count !== '0' ? 'warn' : 'good', 'Reopened after it was resolved: the first fix didn\'t hold.'));
            list.push(kpi('sla', 'SLA', r.sla_breached === 'true' ? 'breached' : 'no breach recorded', r.sla_breached === 'true' ? 'bad' : 'good', 'Whether its resolution target was missed.'));
        } else if (kind === 'CHG') {
            const created = parseTime(r.created), start = parseTime(r.planned_start_date), end = parseTime(r.planned_end_date);
            const open = OPEN.change_request.includes(r.state);
            if (open) list.push(kpi('age', 'Open for', duration(NOW - created), 'info', 'Since it was raised.'));
            const lead = start - created;
            list.push(kpi('lead', 'Raised', `${duration(lead)} ahead`, lead < 2 * DAY ? 'warn' : 'good', 'How far ahead of its planned start it was raised. Typical: 8.0 days. Under 2 days is short notice for approval.'));
            list.push(kpi('window', 'Window', duration(end - start), 'info', 'How long the planned change window is.'));
            if (open && start > NOW && start - NOW < 7 * DAY) list.push(kpi('upcoming', 'Starts in', duration(start - NOW), 'info', 'Planned to start within the next week.'));
            if (open && end < NOW) list.push(kpi('overdue', 'Overdue by', duration(NOW - end), 'bad', 'Still open after its planned end.'));
            if (open) list.push(kpi('approval', 'Approval', r.approval === 'Approved' ? 'approved' : 'waiting', r.approval === 'Approved' ? 'good' : 'warn', 'Whether the change has been approved.'));
            if (!open && r.close_code) list.push(kpi('outcome', 'Outcome', r.close_code, r.close_code === 'Successful' ? 'good' : r.close_code === 'Unsuccessful' ? 'bad' : 'warn', 'How the change went.'));
            if (r.outage === 'true') list.push(kpi('outage', 'Needs', 'an outage', 'warn', 'The service is down while the change is carried out.'));
        } else if (kind === 'RITM') {
            const opened = parseTime(r.opened);
            const open = OPEN.sc_req_item.includes(r.state);
            const age = (open ? NOW : parseTime(r.closed)) - opened;
            list.push(kpi('age', open ? 'Open for' : 'Fulfilled in', duration(age), age > 10 * DAY ? 'bad' : age > 4 * DAY ? 'warn' : 'good', 'A request is typically fulfilled in 3.0 days.'));
            if (open) list.push(kpi('approval', 'Approval', r.approval === 'Approved' ? 'approved' : 'waiting', r.approval === 'Approved' ? 'good' : 'warn', 'Whether the request has been approved.'));
            const tasks = tasksOf.get(number) || [];
            const done = tasks.filter(t => CLOSED.sc_task.includes(t.state)).length;
            list.push(kpi('tasks', 'Tasks done', `${done} of ${tasks.length}`, done === tasks.length ? 'good' : 'info', 'Its catalog tasks that are closed.'));
        } else {
            const created = parseTime(r.created);
            const open = OPEN.sc_task.includes(r.state);
            const age = (open ? NOW : parseTime(r.closed)) - created;
            list.push(kpi('age', open ? 'Open for' : 'Done in', duration(age), age > 7 * DAY ? 'bad' : age > 3 * DAY ? 'warn' : 'good', 'A catalog task is typically done in 1.2 days.'));
            list.push(kpi('sla', 'SLA', r.sla_flag === 'true' ? 'breached' : 'on track', r.sla_flag === 'true' ? 'bad' : 'good', 'Whether its fulfilment target was missed.'));
        }
        return list;
    }
    const attention = list => list.reduce((n, k) => n + (k.tone === 'bad' ? 100 : k.tone === 'warn' ? 1 : 0), 0);
    function flagsOf(s) {
        const flags = [];
        if (s.kind === 'CHG' && isOpenTicket(s)) {
            const r = byNumber.get(s.number).r;
            const end = parseTime(r.planned_end_date);
            if (end < NOW) flags.push({ key: 'overdue', label: 'Overdue by', value: duration(NOW - end), tone: 'bad', detail: 'Still open after its planned end.' });
        }
        return flags;
    }
    const withFlags = list => list.map(s => ({ ...s, flags: flagsOf(s) }));

    // ---------------------------------------------------------------
    // Families: linked tickets worked together (parent incident and its
    // children; a request and its catalog tasks; everything else alone)
    // ---------------------------------------------------------------
    const familyOf = new Map(); // number -> family id
    const families = new Map(); // id -> { id, members: [numbers], teamId, kind }
    function addFamily(id, members, kind) {
        families.set(id, { id, members, kind, teamId: null });
        for (const m of members) familyOf.set(m, id);
    }
    for (const p of parents) addFamily(p.number, [p.number, ...(childrenOf.get(p.number) || []).map(c => c.number)], 'parent-incident');
    for (const r of T.sc_req_item) addFamily(r.number, [r.number, ...(tasksOf.get(r.number) || []).map(t => t.number)], 'request-tasks');
    for (const n of byNumber.keys()) if (!familyOf.has(n)) addFamily(n, [n], 'single');

    // ---------------------------------------------------------------
    // OneTouch teams and the person signed in (a project manager)
    // ---------------------------------------------------------------
    const ROLES = { project_manager: 'Project manager', process_excellence: 'Process excellence', project_team: 'Project team member' };
    const ME = { id: 1, username: 'demo.user', displayName: 'Jordan Avery' };
    const TEAM = { id: 1, name: 'Platform Operations' };
    const MEMBERS = [
        { id: 1, username: 'demo.user', name: 'Jordan Avery', role: 'project_manager' },
        { id: 2, username: 'pnatarajan', name: 'Priya Natarajan', role: 'process_excellence' },
        { id: 3, username: 'ebell', name: 'Elena Bell', role: 'project_team' },
        { id: 4, username: 'sokafor', name: 'Samuel Okafor', role: 'project_team' },
        { id: 5, username: 'dwhitfield', name: 'Dana Whitfield', role: 'project_team' },
        { id: 6, username: 'mtran', name: 'Marcus Tran', role: 'project_team' },
    ];
    const TEAM_GROUPS = ['INFRA-Cloud-Windows', 'INFRA-Cloud-Linux', 'DB-SQL-Platform'];
    const assignee = new Map(); // number -> member id
    const teamCutoff = fmt(NOW - 45 * DAY);
    for (const f of families.values()) {
        const first = summaryOf(f.id);
        const groups = f.members.map(n => summaryOf(n).team).join(',');
        if (first.opened < teamCutoff || !TEAM_GROUPS.some(g => groups.includes(g))) continue;
        f.teamId = TEAM.id;
        // Most families are given to one person; a few wait for the project manager
        const who = chance(0.14) ? null : weighted([[1, 6], [3, 26], [4, 26], [5, 22], [6, 20]]);
        for (const n of f.members) if (who) assignee.set(n, who);
    }
    // The project manager signed in works a few open families too, one of each kind where there is one
    {
        const open = [...families.values()].filter(f => f.teamId === TEAM.id && isOpenTicket(summaryOf(f.id)));
        const mine = [];
        for (const k of ['INC', 'CHG', 'RITM', 'INC', 'CHG', 'SCTASK', 'INC']) {
            const f = open.find(x => kindOf(x.id) === k && !mine.includes(x));
            if (f) mine.push(f);
        }
        for (const f of mine) for (const n of f.members) assignee.set(n, ME.id);
    }
    const teamFamilies = () => [...families.values()].filter(f => f.teamId === TEAM.id);
    const teamNumbers = () => teamFamilies().flatMap(f => f.members);
    const memberName = id => MEMBERS.find(m => m.id === id)?.name || null;

    // ---------------------------------------------------------------
    // What this browser remembers (preferences, stars, results), with
    // the starting dashboards everyone sees first
    // ---------------------------------------------------------------
    const STORE_KEY = 'onetouch-demo-v1';
    const store = (() => {
        try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || {}; } catch { return {}; }
    })();
    const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* this tab only */ } };
    const chart = (c) => ({ id: Math.random().toString(36).slice(2, 10), title: '', status: 'all', dates: { preset: 'all' }, filters: [], groupBy: '', display: 'bar', limit: 10, sort: 'count', direction: 'desc', size: 'medium', color: 'accent', ...c });
    const scope = () => ({ dates: { preset: 'all' }, teams: [] });
    const STARTING_DASHBOARDS = {
        boards: [
            {
                id: 'svcdesk', name: 'Service Desk Overview', scope: scope(), charts: [
                    chart({ title: 'Open incidents', source: 'incident', status: 'open', display: 'number', size: 'small' }),
                    chart({ title: 'Open changes', source: 'change_request', status: 'open', display: 'number', size: 'small', color: '2' }),
                    chart({ title: 'Open requests', source: 'sc_req_item', status: 'open', display: 'number', size: 'small', color: '3' }),
                    chart({ title: 'Open catalog tasks', source: 'sc_task', status: 'open', display: 'number', size: 'small', color: '4' }),
                    chart({ title: 'Incidents opened per week', source: 'incident', groupBy: 'created_week', display: 'line', sort: 'label', direction: 'asc', size: 'large', limit: 20 }),
                    chart({ title: 'Open incidents by priority', source: 'incident', status: 'open', groupBy: 'priority', display: 'donut', color: '1' }),
                    chart({ title: 'Busiest teams (open incidents)', source: 'incident', status: 'open', groupBy: 'assignment_group', display: 'hbar', color: '5' }),
                    chart({ title: 'How incidents are reported', source: 'incident', groupBy: 'contact_type', display: 'donut', color: '6' }),
                    chart({ title: 'Incidents by site', source: 'incident', groupBy: 'location', display: 'hbar', color: '2' }),
                ],
            },
            {
                id: 'changes', name: 'Change Management', scope: scope(), charts: [
                    chart({ title: 'Changes by type', source: 'change_request', groupBy: 'type', display: 'donut' }),
                    chart({ title: 'Changes by risk', source: 'change_request', groupBy: 'risk', display: 'bar', color: '3' }),
                    chart({ title: 'Change outcomes', source: 'change_request', status: 'closed', groupBy: 'close_code', display: 'donut', color: '4' }),
                    chart({ title: 'Changes planned per month', source: 'change_request', groupBy: 'planned_start_month', display: 'bar', sort: 'label', direction: 'asc', size: 'large', color: '5' }),
                    chart({ title: 'Teams owning the most changes', source: 'change_request', groupBy: 'owner_group', display: 'hbar', color: '6' }),
                ],
            },
            {
                id: 'requests', name: 'Requests & Fulfilment', scope: scope(), charts: [
                    chart({ title: 'Most requested catalog items', source: 'sc_req_item', groupBy: 'item', display: 'hbar', size: 'large' }),
                    chart({ title: 'Open requests by stage', source: 'sc_req_item', status: 'open', groupBy: 'stage', display: 'donut', color: '2' }),
                    chart({ title: 'Catalog tasks past SLA', source: 'sc_task', groupBy: 'sla_flag', display: 'donut', color: '7' }),
                    chart({ title: 'Requests opened per week', source: 'sc_req_item', groupBy: 'opened_week', display: 'line', sort: 'label', direction: 'asc', size: 'large', limit: 20, color: '3' }),
                ],
            },
        ],
        hidden: [], last: '',
    };
    store.preferences ||= { dashboards: STARTING_DASHBOARDS, tour: { done: false, dashboards: false } };
    store.stars ||= [];
    store.seen ||= [];
    store.notifications ||= [
        { id: 3, kind: 'assigned', actor: 'Priya Natarajan', numbers: [...assignee].filter(([, id]) => id === 1).map(([n]) => n).slice(0, 3), detail: { team: TEAM.name }, at: new Date(NOW - 2 * HOUR).toISOString(), read: false },
        { id: 2, kind: 'report', actor: 'Elena Bell', numbers: [[...assignee].find(([, id]) => id === 3)?.[0]].filter(Boolean), detail: { status: 'resolved' }, at: new Date(NOW - 6 * HOUR).toISOString(), read: false },
        { id: 1, kind: 'family', actor: 'Priya Natarajan', numbers: teamFamilies().find(f => f.members.length > 3)?.members || [], detail: { team: TEAM.name, count: teamFamilies().find(f => f.members.length > 3)?.members.length || 0 }, at: new Date(NOW - 26 * HOUR).toISOString(), read: true },
    ];
    store.reports ||= {};
    store.assignments ||= {};
    for (const [n, id] of Object.entries(store.assignments)) { if (id) assignee.set(n, id); else assignee.delete(n); }
    save();

    // ---------------------------------------------------------------
    // Charts (charts.mjs): the catalog and the chart engine
    // ---------------------------------------------------------------
    const SOURCES = {
        incident: {
            label: 'Incidents', one: 'incident', many: 'incidents', opened: 'created',
            fields: [['priority', 'Priority'], ['state', 'State'], ['category', 'Category'], ['subcategory', 'Subcategory'], ['assignment_group', 'Team'], ['assigned_to', 'Assigned to'], ['contact_type', 'How it was reported'], ['location', 'Location'], ['configuration_item', 'System (CI)'], ['impact', 'Impact'], ['urgency', 'Urgency'], ['close_code', 'How it was closed'], ['cause_code', 'Cause'], ['on_hold_reason', 'On-hold reason'], ['was_p1', 'Was ever P1']],
            times: [['created_day', 'Day opened'], ['created_week', 'Week opened'], ['created_month', 'Month opened'], ['resolved_day', 'Day resolved'], ['resolved_month', 'Month resolved']],
            team: 'assignment_group',
        },
        change_request: {
            label: 'Changes', one: 'change', many: 'changes', opened: 'created',
            fields: [['risk', 'Risk'], ['state', 'State'], ['type', 'Type'], ['sub_type', 'Sub-type'], ['owner_group', 'Team'], ['approval', 'Approval'], ['environment', 'Environment'], ['close_code', 'Outcome'], ['failure_code', 'Failure reason'], ['outage', 'Outage'], ['configuration_item', 'System (CI)'], ['requested_by', 'Requested by']],
            times: [['created_day', 'Day opened'], ['created_week', 'Week opened'], ['created_month', 'Month opened'], ['planned_start_month', 'Month planned to start']],
            team: 'owner_group',
        },
        sc_req_item: {
            label: 'Requests', one: 'request', many: 'requests', opened: 'opened',
            fields: [['item', 'Catalog item'], ['state', 'State'], ['stage', 'Stage'], ['approval', 'Approval'], ['location', 'Location']],
            times: [['opened_day', 'Day opened'], ['opened_week', 'Week opened'], ['opened_month', 'Month opened'], ['closed_month', 'Month closed']],
            team: null,
        },
        sc_task: {
            label: 'Catalog tasks', one: 'catalog task', many: 'catalog tasks', opened: 'created',
            fields: [['state', 'State'], ['assignment_group', 'Team'], ['assigned_to', 'Assigned to'], ['item', 'Catalog item'], ['sla_flag', 'SLA breached']],
            times: [['created_day', 'Day opened'], ['created_week', 'Week opened'], ['created_month', 'Month opened']],
            team: 'assignment_group',
        },
    };
    const FIRST_DAY = dayOf(START), LAST_DAY = dayOf(NOW);
    function catalog() {
        const sources = {};
        for (const [k, s] of Object.entries(SOURCES)) {
            sources[k] = { label: s.label, one: s.one, many: s.many, fields: s.fields, times: s.times, openStates: OPEN[k], closedStates: CLOSED[k], hasTeam: Boolean(s.team), days: { first: FIRST_DAY, last: LAST_DAY } };
        }
        return { sources };
    }
    const shiftDay = (day, n) => dayOf(parseTime(`${day} 12:00:00`) + n * DAY);
    function chartRows(c, sc) {
        const src = SOURCES[c.source];
        let rows = T[c.source];
        if (c.status === 'open') rows = rows.filter(r => OPEN[c.source].includes(r.state));
        if (c.status === 'closed') rows = rows.filter(r => CLOSED[c.source].includes(r.state));
        for (const f of c.filters || []) {
            const vals = (f.values || []).map(String);
            if (f.op === 'notEquals') rows = rows.filter(r => !vals.includes(String(r[f.field])));
            else if (f.op === 'contains') rows = rows.filter(r => vals.some(v => String(r[f.field] || '').toLowerCase().includes(v.toLowerCase())));
            else rows = rows.filter(r => vals.includes(String(r[f.field])));
        }
        for (const dates of [c.dates, sc && sc.dates]) {
            if (!dates || dates.preset === 'all') continue;
            const day = r => String(r[src.opened]).slice(0, 10);
            if (dates.preset === 'custom') {
                if (dates.from) rows = rows.filter(r => day(r) >= dates.from);
                if (dates.to) rows = rows.filter(r => day(r) <= dates.to);
            } else {
                const from = shiftDay(LAST_DAY, -(Number(dates.preset) - 1));
                rows = rows.filter(r => day(r) >= from);
            }
        }
        if (sc && sc.teams && sc.teams.length && src.team) rows = rows.filter(r => sc.teams.includes(r[src.team]));
        return rows;
    }
    const valueOf = (r, field) => {
        const v = r[field];
        return v == null || v === '' ? null : String(v);
    };
    function chartData(c, sc) {
        const src = SOURCES[c.source];
        const rows = chartRows(c, sc);
        const base = { chart: c, days: { first: FIRST_DAY, last: LAST_DAY }, skipped: [] };
        if (!c.groupBy) return { ...base, total: rows.length, rows: [], other: null };
        const isTime = src.times.some(t => t[0] === c.groupBy);
        const counts = new Map();
        for (const r of rows) {
            const v = valueOf(r, c.groupBy);
            if (isTime && v === null) continue;
            counts.set(v, (counts.get(v) || 0) + 1);
        }
        let groups = [...counts].map(([value, count]) => ({ value, count }));
        const total = groups.reduce((s, g) => s + g.count, 0);
        const sign = c.direction === 'desc' ? -1 : 1;
        const byLabel = (a, b) => String(a.value ?? '~').localeCompare(String(b.value ?? '~'), undefined, { numeric: true });
        if (isTime) {
            groups.sort(byLabel);
            if (c.sort !== 'label' || c.direction === 'desc') groups = c.sort === 'label' ? groups.reverse() : groups;
            return { ...base, total, rows: groups, other: null };
        }
        groups.sort((a, b) => b.count - a.count);
        const limit = c.limit || 10;
        const top = groups.slice(0, limit), rest = groups.slice(limit);
        top.sort(c.sort === 'label' ? (a, b) => sign * byLabel(a, b) : (a, b) => sign * (a.count - b.count) || byLabel(a, b));
        return { ...base, total, rows: top, other: rest.length ? { count: rest.reduce((s, g) => s + g.count, 0), groups: rest.length } : null };
    }
    function chartTickets(c, value, sc) {
        let rows = chartRows(c, sc);
        if (c.groupBy) rows = rows.filter(r => valueOf(r, c.groupBy) === (value === null ? null : String(value)));
        const src = SOURCES[c.source];
        rows = [...rows].sort((a, b) => String(b[src.opened]).localeCompare(String(a[src.opened])));
        return { chart: c, total: rows.length, tickets: rows.slice(0, 200).map(r => summaryOf(r.number)) };
    }
    function chartValues(source, field) {
        const counts = new Map();
        for (const r of T[source] || []) {
            const v = valueOf(r, field);
            if (v !== null) counts.set(v, (counts.get(v) || 0) + 1);
        }
        return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
    }
    function teamValues() {
        const counts = new Map();
        for (const [src, s] of Object.entries(SOURCES)) {
            if (!s.team) continue;
            for (const r of T[src]) if (r[s.team]) counts.set(r[s.team], (counts.get(r[s.team]) || 0) + 1);
        }
        return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
    }

    // ---------------------------------------------------------------
    // Ticket search, full records and related tickets
    // ---------------------------------------------------------------
    const TICKET_PATTERN = /\b(INC|CHG|RITM|SCTASK|REQ)?[\s-]?(\d{7})\b/gi;
    function findTickets(text) {
        const found = [], notFound = [], seen = new Set();
        for (const [, prefix, digits] of String(text).matchAll(TICKET_PATTERN)) {
            const candidates = prefix ? [prefix.toUpperCase() + digits] : ['INC', 'CHG', 'RITM', 'SCTASK', 'REQ'].map(p => p + digits);
            let hit = false;
            for (const n of candidates) {
                if (n.startsWith('REQ')) {
                    for (const r of T.sc_req_item.filter(x => x.request === n)) if (!seen.has(r.number)) { seen.add(r.number); found.push(summaryOf(r.number)); hit = true; }
                } else if (byNumber.has(n) && !seen.has(n)) { seen.add(n); found.push(summaryOf(n)); hit = true; }
            }
            if (!hit) notFound.push(prefix ? prefix.toUpperCase() + digits : digits);
        }
        const ignored = String(text).replace(TICKET_PATTERN, ' ').split(/[\s,;|]+/).filter(w => /[a-z0-9]/i.test(w)).slice(0, 20);
        return { found, notFound, ignored, tooMany: false, noAccess: [] };
    }
    function recordOf(number) {
        const hit = byNumber.get(number);
        if (!hit) return null;
        const fields = {};
        for (const [k, v] of Object.entries(hit.r)) {
            if (k.startsWith('_') || /_(day|week|month)$/.test(k) || k === 'sla_breached') continue;
            fields[`${hit.cube}.${k}`] = v;
        }
        return { cube: hit.cube, fields };
    }
    function member(number, role) {
        const s = summaryOf(number);
        return { number, kind: s.kind, type: s.type, role, summary: s.summary, state: s.state, level: s.level, team: s.team, opened: s.opened, missing: false };
    }
    function relatedFamily(kind, anchor, touched = 1) {
        let members, title, why, same;
        if (kind === 'parent-incident') {
            const kids = childrenOf.get(anchor) || [];
            members = [member(anchor, 'Parent'), ...kids.map(k => member(k.number, 'Child'))];
            title = `Parent incident ${anchor} and its ${kids.length} child incident${kids.length === 1 ? '' : 's'}`;
            why = `${anchor} is a parent (master) incident: it groups incidents raised for the same issue, such as several alerts or reports about one fault, so they are worked and resolved together.`;
            const p = byNumber.get(anchor).r;
            same = [{ field: 'Team', value: p.assignment_group }, { field: 'Server / system', value: p.configuration_item }, { field: 'Subcategory', value: p.subcategory }, { field: 'Location', value: p.location }];
        } else if (kind === 'request-tasks') {
            const tasks = tasksOf.get(anchor) || [];
            members = [member(anchor, 'Request'), ...tasks.map(t => member(t.number, 'Catalog task'))];
            title = `Request ${anchor} and its ${tasks.length} catalog task${tasks.length === 1 ? '' : 's'}`;
            why = `${anchor} is a request; its catalog tasks are the pieces of work different teams do to fulfil it.`;
            same = [{ field: 'Catalog item', value: byNumber.get(anchor).r.item }];
        } else if (kind === 'change-incident') {
            const incs = T.incident.filter(i => i.caused_by_change === anchor);
            members = [member(anchor, 'Change'), ...incs.map(i => member(i.number, 'Caused incident'))];
            title = `Change ${anchor} and the ${incs.length} incident${incs.length === 1 ? '' : 's'} it caused`;
            why = `These incidents are recorded as caused by change ${anchor}.`;
            same = [{ field: 'Team', value: byNumber.get(anchor).r.owner_group }];
        } else return null;
        const states = new Map();
        for (const m of members) states.set(m.state, (states.get(m.state) || 0) + 1);
        const differ = [{ field: 'State', values: [...states].map(([value, count]) => ({ value, count })), others: 0 }, { field: 'Summary', note: 'each one is different' }];
        return { kind, anchor, title, why, touched, total: members.length, members, same, differ };
    }
    function familiesTouching(number) {
        const out = [];
        const hit = byNumber.get(number);
        if (!hit) return out;
        const r = hit.r;
        if (hit.cube === 'incident') {
            if (childrenOf.has(number)) out.push(['parent-incident', number]);
            if (r.parent_incident) out.push(['parent-incident', r.parent_incident]);
            if (r.caused_by_change) out.push(['change-incident', r.caused_by_change]);
        } else if (hit.cube === 'change_request') {
            if (T.incident.some(i => i.caused_by_change === number)) out.push(['change-incident', number]);
        } else if (hit.cube === 'sc_req_item') {
            if ((tasksOf.get(number) || []).length > 1) out.push(['request-tasks', number]);
        } else if (hit.cube === 'sc_task') {
            if ((tasksOf.get(r.request_item) || []).length > 1) out.push(['request-tasks', r.request_item]);
        }
        return out;
    }
    function related(numbers) {
        const map = new Map();
        for (const n of numbers) for (const [kind, anchor] of familiesTouching(n)) {
            const key = `${kind}:${anchor}`;
            map.set(key, { kind, anchor, touched: (map.get(key)?.touched || 0) + 1 });
        }
        return [...map.values()].slice(0, 12).map(f => relatedFamily(f.kind, f.anchor, f.touched)).filter(Boolean);
    }
    function familyKinds() {
        const parentsList = [...childrenOf.keys()];
        const reqFams = T.sc_req_item.filter(r => (tasksOf.get(r.number) || []).length > 1);
        const chgFams = [...new Set(T.incident.map(i => i.caused_by_change).filter(Boolean))];
        return {
            'parent-incident': parentsList.map(a => ({ anchor: a, size: 1 + childrenOf.get(a).length })),
            'request-tasks': reqFams.map(r => ({ anchor: r.number, size: 1 + tasksOf.get(r.number).length })),
            'change-incident': chgFams.map(a => ({ anchor: a, size: 1 + T.incident.filter(i => i.caused_by_change === a).length })),
        };
    }
    function familyRow(anchor) {
        const s = summaryOf(anchor);
        return { kind: s.kind, summary: s.summary, state: s.state, level: s.level, rank: rankOf(s), team: s.team, opened: s.opened, count: 1, from: 'anchor' };
    }

    // ---------------------------------------------------------------
    // The AI assistant's stand-in: question -> the server's reply format
    // ---------------------------------------------------------------
    const NOUNS = { incident: 'incidents', change_request: 'changes', sc_req_item: 'requests', sc_task: 'catalog tasks' };
    const DETAIL_DIMS = {
        incident: ['number', 'created', 'priority', 'state', 'short_description', 'assignment_group', 'category', 'location'],
        change_request: ['number', 'created', 'type', 'risk', 'state', 'approval', 'short_description', 'owner_group', 'planned_start_date'],
        sc_req_item: ['number', 'opened', 'item', 'state', 'stage', 'approval', 'requested_for', 'location'],
        sc_task: ['number', 'created', 'item', 'state', 'assignment_group', 'assigned_to', 'sla_flag', 'request_item'],
    };
    // Words that pick what to count by: [regex, field per cube]
    const GROUP_WORDS = [
        [/\bpriorit/, { incident: 'priority' }],
        [/\brisk/, { change_request: 'risk' }],
        [/\b(state|status)/, { incident: 'state', change_request: 'state', sc_req_item: 'state', sc_task: 'state' }],
        [/\bsub-?categor/, { incident: 'subcategory' }],
        [/\bcategor/, { incident: 'category' }],
        [/\b(team|group|assignment group)s?\b/, { incident: 'assignment_group', change_request: 'owner_group', sc_task: 'assignment_group' }],
        [/\b(location|site|plant)s?\b/, { incident: 'location', sc_req_item: 'location' }],
        [/\b(channel|reported|contact)/, { incident: 'contact_type' }],
        [/\bcause/, { incident: 'cause_code' }],
        [/\bclose code|\bclosed? (with|as)/, { incident: 'close_code', change_request: 'close_code' }],
        [/\bon[- ]hold reason|\bon hold\b.*\bby\b/, { incident: 'on_hold_reason' }],
        [/\bimpact/, { incident: 'impact' }],
        [/\b(server|system|ci|configuration item)s?\b/, { incident: 'configuration_item', change_request: 'configuration_item' }],
        [/\btype\b/, { change_request: 'type' }],
        [/\benvironment/, { change_request: 'environment' }],
        [/\b(outcome|successful|failure code)/, { change_request: 'close_code' }],
        [/\bapprov/, { change_request: 'approval', sc_req_item: 'approval' }],
        [/\b(catalog )?items?\b|\bmost requested/, { sc_req_item: 'item', sc_task: 'item' }],
        [/\bstage/, { sc_req_item: 'stage' }],
        [/\b(who|people|person|assignee)/, { incident: 'assigned_to', sc_task: 'assigned_to', change_request: 'requested_by' }],
    ];
    const TIME_WORDS = [
        [/\b(each|per|by) day\b|\bdaily\b/, 'day'],
        [/\b(each|per|by) week\b|\bweekly\b/, 'week'],
        [/\b(each|per|by) month\b|\bmonthly\b/, 'month'],
    ];
    const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const lower = s => String(s).toLowerCase();

    function readQuestion(question) {
        const q = lower(question).replace(/[?!.]+$/, '');
        const out = { entities: [], filters: [], assumptions: [], groupBy: null, time: null, list: false, dateFrom: null, dateTo: null, dateText: '' };
        // Which kinds of ticket
        if (/catalog tasks?|sctask|\btasks?\b/.test(q)) out.entities.push('sc_task');
        if (/\bincidents?\b|\binc\b|\bp[1-4]s?\b|\boutages?\b/.test(q)) out.entities.push('incident');
        if (/\bchanges?\b|\bchg\b/.test(q)) out.entities.push('change_request');
        if (/\brequests?\b|\britm\b|\border/.test(q) && !/catalog tasks?/.test(q.replace(/requests? and/, ''))) out.entities.push('sc_req_item');
        if (/\btickets?\b|\beverything\b|\ball work\b/.test(q) && !out.entities.length) out.entities.push('incident', 'change_request', 'sc_req_item', 'sc_task');
        out.named = out.entities.length > 0;
        if (!out.entities.length) { out.entities.push('incident'); out.assumptions.push('No ticket type was named, so incidents are counted'); }
        out.entities = [...new Set(out.entities)];

        // Open or closed
        if (/\b(open|still|active|unresolved|backlog|outstanding|sitting)\b/.test(q)) { out.status = 'open'; out.assumptions.push('\'open\' = each ticket type\'s open states (for incidents: New, In Progress or On Hold)'); }
        else if (/\b(closed|resolved|done|completed|finished)\b/.test(q) && !/\bresolved each\b|\bclosed each\b/.test(q)) { out.status = 'closed'; out.assumptions.push('\'closed\' = each ticket type\'s closed or resolved states'); }

        // Priority, risk, type, approvals, SLA
        const p = q.match(/\bp([1-4])\b(?:\s*(?:and|or|,)\s*p([1-4])\b)?/);
        if (p) {
            const names = { 1: 'P1 - Critical', 2: 'P2 - High', 3: 'P3 - Average', 4: 'P4 - Low' };
            out.filters.push({ cube: 'incident', field: 'priority', values: [names[p[1]], ...(p[2] ? [names[p[2]]] : [])] });
            out.assumptions.push(`'p${p[1]}${p[2] ? ` and p${p[2]}` : ''}' = priority ${names[p[1]]}${p[2] ? ` or ${names[p[2]]}` : ''}`);
        }
        if (/\bhigh[- ]risk\b/.test(q)) out.filters.push({ cube: 'change_request', field: 'risk', values: ['High'] });
        if (/\bemergency\b/.test(q)) out.filters.push({ cube: 'change_request', field: 'type', values: ['Emergency'] });
        if (/\bstandard changes?\b/.test(q)) out.filters.push({ cube: 'change_request', field: 'type', values: ['Standard'] });
        if (/\bnormal changes?\b/.test(q)) out.filters.push({ cube: 'change_request', field: 'type', values: ['Normal'] });
        if (/\bunsuccessful|\bfailed changes?\b/.test(q)) out.filters.push({ cube: 'change_request', field: 'close_code', values: ['Unsuccessful'] });
        if (/\b(waiting|pending) (for )?approval\b/.test(q)) {
            out.filters.push({ cube: 'change_request', field: 'approval', values: ['Requested'] }, { cube: 'sc_req_item', field: 'approval', values: ['Requested'] });
            out.status = 'open';
        }
        if (/\b(breach|sla)/.test(q)) {
            out.filters.push({ cube: 'sc_task', field: 'sla_flag', values: ['true'] }, { cube: 'incident', field: 'sla_breached', values: ['true'] });
            out.assumptions.push('\'breached SLA\' = the SLA breached flag is set');
        }
        if (/\bon hold\b/.test(q)) out.filters.push({ cube: 'incident', field: 'state', values: ['On Hold'] });
        if (/\breopened\b/.test(q)) out.filters.push({ cube: 'incident', field: 'reopen_count', values: ['1', '2', '3'] });
        if (/\b(caused by a change|change[- ]related)\b/.test(q)) out.filters.push({ cube: 'incident', field: 'caused_by_change', op: 'set' });
        if (/\bproduction\b/.test(q)) out.filters.push({ cube: 'change_request', field: 'environment', values: ['Production'] });
        if (/\boutages?\b/.test(q) && out.entities.includes('change_request')) out.filters.push({ cube: 'change_request', field: 'outage', values: ['true'] });
        if (/\bmonitoring\b/.test(q) && !/\bnoc\b/.test(q)) out.filters.push({ cube: 'incident', field: 'contact_type', values: ['Monitoring'] });

        // A team, site or catalog item named in the question
        for (const g of GROUP_NAMES) {
            const short = lower(g).split('-').slice(-1)[0];
            if (q.includes(lower(g)) || (short.length > 4 && new RegExp(`\\b${short}\\b`).test(q) && /team|group/.test(q))) {
                out.filters.push({ cube: 'incident', field: 'assignment_group', values: [g] }, { cube: 'change_request', field: 'owner_group', values: [g] }, { cube: 'sc_task', field: 'assignment_group', values: [g] });
                out.assumptions.push(`'${short}' = the ${g} team`);
                break;
            }
        }
        for (const [loc] of LOCATIONS) {
            const short = lower(loc).split(' ')[0];
            if (q.includes(lower(loc)) || (short.length > 4 && new RegExp(`\\b${short}\\b`).test(q))) {
                out.filters.push({ cube: 'incident', field: 'location', values: [loc] }, { cube: 'sc_req_item', field: 'location', values: [loc] });
                out.assumptions.push(`'${short}' = location ${loc}`);
                break;
            }
        }
        for (const it of ITEMS) {
            if (q.includes(lower(it[0]))) { out.filters.push({ cube: 'sc_req_item', field: 'item', values: [it[0]] }, { cube: 'sc_task', field: 'item', values: [it[0]] }); break; }
        }

        // When
        const lastN = q.match(/\b(?:last|past) (\d+) days?\b/);
        if (lastN) { out.dateFrom = shiftDay(LAST_DAY, -(Number(lastN[1]) - 1)); out.dateText = `in the last ${lastN[1]} days`; }
        else if (/\b(this|past|last) week\b/.test(q)) { out.dateFrom = shiftDay(LAST_DAY, -6); out.dateText = 'in the last 7 days'; }
        else if (/\b(today)\b/.test(q)) { out.dateFrom = LAST_DAY; out.dateText = 'today'; }
        else if (/\bthis month\b/.test(q)) { out.dateFrom = LAST_DAY.slice(0, 8) + '01'; out.dateText = 'this month'; }
        else if (/\blast month\b/.test(q)) {
            const d = new Date(NOW); d.setDate(1); d.setMonth(d.getMonth() - 1);
            const m = monthOf(d.getTime()); out.dateFrom = `${m}-01`; out.dateTo = `${m}-31`; out.dateText = `in ${MONTHS[d.getMonth()][0].toUpperCase() + MONTHS[d.getMonth()].slice(1)}`;
        } else {
            const mi = MONTHS.findIndex(m => new RegExp(`\\b${m}\\b`).test(q));
            if (mi >= 0) {
                const year = (q.match(/\b(20\d\d)\b/) || [])[1] || (mi <= new Date(NOW).getMonth() ? new Date(NOW).getFullYear() : new Date(NOW).getFullYear() - 1);
                const m = `${year}-${pad(mi + 1)}`;
                out.dateFrom = `${m}-01`; out.dateTo = `${m}-31`; out.dateText = `in ${MONTHS[mi][0].toUpperCase() + MONTHS[mi].slice(1)} ${year}`;
            }
        }
        if (out.dateFrom) out.assumptions.push(`'${out.dateText.replace(/^in /, '')}' = opened from ${out.dateFrom}${out.dateTo ? ` through ${out.dateTo > LAST_DAY ? LAST_DAY : out.dateTo}` : ''}`);

        // Counted by a time period, or by a field
        for (const [re, unit] of TIME_WORDS) if (re.test(q)) out.time = unit;
        // "tickets of each type": one count per kind of ticket, not changes by their type
        const ticketTypes = out.entities.length > 1 && /\btypes?\b/.test(q);
        if (!out.time) {
            for (const [re, fields] of GROUP_WORDS) {
                if (!re.test(q)) continue;
                // "the p1 incidents" names a priority; it doesn't ask to count by it
                if (re.source.includes('priorit') && !/\b(by|each|per|which|breakdown|split)\b/.test(q)) continue;
                if (re.source.includes('type') && ticketTypes) continue;
                if (out.entities.some(e => fields[e])) {
                    out.groupBy = fields;
                    // Across ticket types: only the ones that have that field
                    const without = out.entities.filter(e => !fields[e]);
                    if (without.length && out.entities.length > 1) {
                        out.entities = out.entities.filter(e => fields[e]);
                        out.assumptions.push(`${without.map(e => NOUNS[e][0].toUpperCase() + NOUNS[e].slice(1)).join(' and ')} were left out because they have no such column`);
                    }
                    break;
                }
            }
            if (out.groupBy && !/\b(by|each|per|which|what|most|top|breakdown|split|common|busiest|who)\b/.test(q)) out.groupBy = null;
        }
        out.list = !out.groupBy && !out.time && (/\b(list|show|which|what are the|give me|display|find)\b/.test(q) && !/\bhow many\b/.test(q));
        out.top = Number((q.match(/\btop (\d+)\b/) || [])[1]) || null;
        return out;
    }

    function rowsFor(entity, plan) {
        let rows = T[entity];
        if (plan.status === 'open') rows = rows.filter(r => OPEN[entity].includes(r.state));
        if (plan.status === 'closed') rows = rows.filter(r => CLOSED[entity].includes(r.state));
        for (const f of plan.filters.filter(f => f.cube === entity)) {
            rows = f.op === 'set' ? rows.filter(r => r[f.field]) : rows.filter(r => f.values.includes(String(r[f.field])));
        }
        const opened = SOURCES[entity].opened;
        if (plan.dateFrom) rows = rows.filter(r => r[opened].slice(0, 10) >= plan.dateFrom);
        if (plan.dateTo) rows = rows.filter(r => r[opened].slice(0, 10) <= plan.dateTo);
        return rows;
    }
    const cubeFilters = (entity, plan) => {
        const out = [];
        if (plan.status) out.push({ member: `${entity}.state`, operator: 'equals', values: plan.status === 'open' ? OPEN[entity] : CLOSED[entity] });
        for (const f of plan.filters.filter(f => f.cube === entity)) out.push(f.op === 'set' ? { member: `${entity}.${f.field}`, operator: 'set' } : { member: `${entity}.${f.field}`, operator: 'equals', values: f.values });
        const opened = SOURCES[entity].opened;
        if (plan.dateFrom) out.push({ member: `${entity}.${opened}`, operator: 'gte', values: [plan.dateFrom] });
        if (plan.dateTo) out.push({ member: `${entity}.${opened}`, operator: 'lte', values: [plan.dateTo] });
        return out;
    };

    function answer(question) {
        const q = lower(question);
        const base = { intent: 'query', memoryReset: false, restricted: null, visibility: null, combined: null, explanation: null, allEmpty: false, shownTickets: [], chartable: null, fromCache: false, offline: false };

        if (/^(hi|hello|hey|thanks|thank you)\b/.test(q.trim())) {
            return { ...base, intent: 'clarify', message: 'Hi! Ask me about the ticket data, for example "how many open incidents are there by priority" or "list the emergency changes".', assumptions: [], sections: [], results: [] };
        }
        // One ticket by its number, or its family
        const numbers = [...question.matchAll(/\b(INC|CHG|RITM|SCTASK|REQ)\s?-?(\d{7})\b/gi)].map(m => m[1].toUpperCase() + m[2]);
        if (numbers.length) {
            const n = numbers[0];
            const kind = kindOf(n);
            if (/child|children/.test(q) && kind === 'INC') {
                const kids = childrenOf.get(n) || [];
                const rows = kids.map(k => pickDims('incident', k));
                return { ...base, entity: 'incident', message: `Child incidents of ${n}.`, assumptions: [`Child incidents are the ones whose parent incident is ${n}`], aiInterpretation: [{ entity: 'incident', cubeQuery: { dimensions: DETAIL_DIMS.incident.map(d => `incident.${d}`), filters: [{ member: 'incident.parent_incident', operator: 'equals', values: [n] }] } }], results: rows, sections: [{ entity: 'incident', rows }], shownTickets: kids.map(k => k.number), allEmpty: !rows.length, explanation: rows.length ? null : `${n} has no child incidents in this data.` };
            }
            if (/tasks?/.test(q) && kind === 'RITM') {
                const tasks = tasksOf.get(n) || [];
                const rows = tasks.map(t => pickDims('sc_task', t));
                return { ...base, entity: 'sc_task', message: `Catalog tasks for ${n}.`, assumptions: [`Catalog tasks whose parent request is ${n}`], aiInterpretation: [{ entity: 'sc_task', cubeQuery: { dimensions: DETAIL_DIMS.sc_task.map(d => `sc_task.${d}`), filters: [{ member: 'sc_task.request_item', operator: 'equals', values: [n] }] } }], results: rows, sections: [{ entity: 'sc_task', rows }], shownTickets: tasks.map(t => t.number), allEmpty: !rows.length, explanation: rows.length ? null : `${n} has no catalog tasks.` };
            }
            if (kind === 'REQ') {
                const ritmsIn = T.sc_req_item.filter(r => r.request === n);
                const rows = ritmsIn.map(r => pickDims('sc_req_item', r));
                return { ...base, entity: 'sc_req_item', message: `Requests in order ${n}.`, assumptions: ['An order (REQ) holds one or more requests (RITM)'], aiInterpretation: [], results: rows, sections: [{ entity: 'sc_req_item', rows }], shownTickets: ritmsIn.map(r => r.number), allEmpty: !rows.length, explanation: rows.length ? null : `There is no order ${n} in this data.` };
            }
            const hit = byNumber.get(n);
            const entity = KINDS[kind].cube;
            const rec = hit ? recordOf(n).fields : null;
            const rows = rec ? [rec] : [];
            return { ...base, entity, message: `Full details for ${KINDS[kind].label.toLowerCase()} ${n}.`, assumptions: [`Ticket numbers are matched in upper case, so ${lower(n)} was read as ${n}`], aiInterpretation: [{ entity, cubeQuery: { dimensions: Object.keys(rec || {}), filters: [{ member: `${entity}.number`, operator: 'equals', values: [n] }], limit: 1 } }], results: rows, sections: [{ entity, rows }], shownTickets: rec ? [n] : [], allEmpty: !rec, explanation: rec ? null : `There is no ${KINDS[kind].label.toLowerCase()} ${n} in this demo's data. Ticket numbers here start around ${T[entity][0].number}.` };
        }

        const plan = readQuestion(question);
        // Nothing about tickets in it: say what can be asked instead of guessing
        if (!plan.named && !plan.groupBy && !plan.time && !plan.filters.length && !plan.status && !plan.dateFrom) {
            return {
                ...base, intent: 'unsupported', assumptions: [], sections: [], results: [],
                message: 'I can only answer questions about the ticket data: incidents, changes, requests and catalog tasks. ' +
                    'For example: "How many open incidents are there by priority?", "Which teams have the most open tickets?" or "List the emergency changes".',
            };
        }
        const sections = [], interpretation = [];
        for (const entity of plan.entities) {
            let rows = rowsFor(entity, plan);
            const filters = cubeFilters(entity, plan);
            const opened = SOURCES[entity].opened;
            if (plan.time) {
                const dim = `${opened}_${plan.time}`;
                const counts = new Map();
                for (const r of rows) counts.set(r[dim], (counts.get(r[dim]) || 0) + 1);
                const out = [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([v, n]) => ({ [`${entity}.${dim}`]: v, [`${entity}.count`]: String(n) }));
                sections.push({ entity, rows: out, groupBy: dim });
                interpretation.push({ entity, cubeQuery: { measures: [`${entity}.count`], dimensions: [`${entity}.${dim}`], filters, order: { [`${entity}.${dim}`]: 'asc' } } });
            } else if (plan.groupBy && plan.groupBy[entity]) {
                const field = plan.groupBy[entity];
                const counts = new Map();
                for (const r of rows) { const v = r[field] ?? '(Not set)'; counts.set(v, (counts.get(v) || 0) + 1); }
                let out = [...counts].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ [`${entity}.${field}`]: v, [`${entity}.count`]: String(n) }));
                const limit = plan.top || (counts.size > 15 ? 10 : null);
                if (limit) out = out.slice(0, limit);
                sections.push({ entity, rows: out, groupBy: field });
                interpretation.push({ entity, cubeQuery: { measures: [`${entity}.count`], dimensions: [`${entity}.${field}`], filters, order: { [`${entity}.count`]: 'desc' }, ...(limit ? { limit } : {}) } });
            } else if (plan.list) {
                rows = [...rows].sort((a, b) => b[opened].localeCompare(a[opened])).slice(0, plan.top || 50);
                sections.push({ entity, rows: rows.map(r => pickDims(entity, r)) });
                interpretation.push({ entity, cubeQuery: { dimensions: DETAIL_DIMS[entity].map(d => `${entity}.${d}`), filters, order: { [`${entity}.${opened}`]: 'desc' }, limit: plan.top || 50 } });
            } else {
                sections.push({ entity, rows: [{ [`${entity}.count`]: String(rows.length) }] });
                interpretation.push({ entity, cubeQuery: { measures: [`${entity}.count`], filters } });
            }
        }

        const what = plan.entities.length > 1 ? 'tickets' : NOUNS[plan.entities[0]];
        const statusWord = plan.status ? `${plan.status} ` : '';
        const when = plan.dateText ? ` ${plan.dateText}` : '';
        const fieldLabel = s => {
            if (!s.groupBy) return '';
            const src = SOURCES[s.entity];
            const hit = [...src.fields, ...src.times].find(f => f[0] === s.groupBy);
            return (hit ? hit[1] : s.groupBy.replace(/_/g, ' ')).toLowerCase();
        };
        let message;
        if (plan.time) message = `Count of ${statusWord}${what}${when}, by ${plan.time}.`;
        else if (plan.groupBy) message = `Count of ${statusWord}${what}${when}, grouped by ${fieldLabel(sections[0])}${plan.top ? ` (top ${plan.top})` : ''}.`;
        else if (plan.list) message = `List of ${statusWord}${what}${when}, newest first.`;
        else message = `Number of ${statusWord}${what}${when}.`;

        const reply = { ...base, entity: plan.entities.length > 1 ? 'multiple' : plan.entities[0], message, assumptions: plan.assumptions, aiInterpretation: interpretation, sections, results: [] };
        if (sections.length === 1) reply.results = sections[0].rows;
        // Counts across several ticket types: one table, a column per type
        if (sections.length > 1 && (plan.time || !plan.list)) {
            const keyOf = s => (r => (s.groupBy ? String(r[`${s.entity}.${s.groupBy}`]) : ''));
            const keys = [];
            const rowsBy = new Map();
            for (const s of sections) for (const r of s.rows) {
                const k = keyOf(s)(r);
                if (!rowsBy.has(k)) { rowsBy.set(k, { key: k, counts: {}, total: 0 }); keys.push(k); }
                const n = Number(r[`${s.entity}.count`]) || 0;
                rowsBy.get(k).counts[s.entity] = n; rowsBy.get(k).total += n;
            }
            let rows = keys.map(k => rowsBy.get(k));
            if (plan.time) rows.sort((a, b) => a.key.localeCompare(b.key));
            else if (sections[0].groupBy) rows = rows.sort((a, b) => b.total - a.total).slice(0, plan.top || 10);
            const totals = { counts: {}, total: 0 };
            for (const r of rows) for (const [e, n] of Object.entries(r.counts)) { totals.counts[e] = (totals.counts[e] || 0) + n; totals.total += n; }
            // The grouping column is named like the first type's (e.g. incident.assignment_group)
            const dimension = sections[0].groupBy ? `${sections[0].entity}.${sections[0].groupBy}` : null;
            reply.combined = { dimension, entities: sections.map(s => s.entity), rows, totals };
        }
        reply.sections = sections.map(({ entity, rows }) => ({ entity, rows }));
        const empty = sections.every(s => !s.rows.length || (s.rows.length === 1 && s.rows[0][`${s.entity}.count`] === '0'));
        if (empty) {
            reply.allEmpty = true;
            reply.explanation = `Nothing in this demo's data matches that. The data covers ${FIRST_DAY} to ${LAST_DAY}; try fewer conditions, such as dropping the date or the open/closed filter.`;
        }
        reply.shownTickets = sections.flatMap(s => s.rows.map(r => r[`${s.entity}.number`]).filter(Boolean)).slice(0, 200);
        // Counts by one thing can be added to a dashboard as a chart
        if (sections.length === 1 && sections[0].groupBy && !empty) {
            const s = sections[0];
            const isTime = Boolean(plan.time);
            const filters = plan.filters.filter(f => f.cube === s.entity && f.op !== 'set' && SOURCES[s.entity].fields.some(x => x[0] === f.field)).map(f => ({ field: f.field, op: 'equals', values: f.values }));
            reply.chartable = {
                chart: { id: Math.random().toString(36).slice(2, 14), title: '', source: s.entity, status: plan.status || 'all', dates: plan.dateFrom ? { preset: 'custom', from: plan.dateFrom, to: plan.dateTo && plan.dateTo < LAST_DAY ? plan.dateTo : LAST_DAY } : { preset: 'all' }, filters, groupBy: s.groupBy, display: isTime ? 'line' : 'bar', limit: 10, sort: isTime ? 'label' : 'count', direction: isTime ? 'asc' : 'desc', size: 'medium', color: 'accent' },
                dropped: [],
            };
        }
        return reply;
    }
    function pickDims(entity, r) {
        const o = {};
        for (const d of DETAIL_DIMS[entity]) o[`${entity}.${d}`] = r[d] ?? null;
        return o;
    }

    // ---------------------------------------------------------------
    // Team tab and KPIs for the project manager
    // ---------------------------------------------------------------
    function loadOf(userId) {
        const load = { INC: 0, CHG: 0, RITM: 0, SCTASK: 0, total: 0 };
        for (const n of teamNumbers()) {
            if ((assignee.get(n) || null) !== userId) continue;
            load[kindOf(n)] += 1; load.total += 1;
        }
        return load;
    }
    function listTeams() {
        const fams = teamFamilies();
        return {
            roles: ROLES,
            teams: [{
                id: TEAM.id, name: TEAM.name, test: false, families: fams.length, tickets: fams.reduce((s, f) => s + f.members.length, 0),
                canManage: true, unassigned: loadOf(null),
                members: MEMBERS.map(m => ({ id: m.id, username: m.username, name: m.name, role: m.role, test: false, load: loadOf(m.id) })),
            }],
        };
    }
    function sortBy(list, valueOf, dir) {
        const sign = dir === 'desc' ? -1 : 1;
        return [...list].sort((a, b) => {
            const x = valueOf(a), y = valueOf(b);
            if (x == null && y == null) return 0;
            if (x == null) return 1;
            if (y == null) return -1;
            return sign * (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }));
        });
    }
    function lookupFilter(params, textsOf) {
        const q = lower(params.get('q') || '').trim();
        if (!q) return () => true;
        const col = params.get('col');
        const words = q.split(/\s+/);
        return row => {
            const texts = textsOf(row);
            const hay = lower(col && texts[col] != null ? texts[col] : Object.values(texts).join(' '));
            return words.every(w => hay.includes(w));
        };
    }
    function teamTickets(params) {
        const who = params.get('assignee');
        const kind = params.get('kind');
        let rows = teamFamilies().sort((a, b) => b.members.length - a.members.length || a.id.localeCompare(b.id))
            .flatMap(f => f.members.map(n => ({ number: n, family: { id: f.id, size: f.members.length }, assigneeId: assignee.get(n) || null })));
        if (who === 'none') rows = rows.filter(r => !r.assigneeId);
        else if (who) rows = rows.filter(r => r.assigneeId === Number(who));
        if (kind) rows = rows.filter(r => kindOf(r.number) === kind);
        const withS = rows.map(r => ({ ...r, s: summaryOf(r.number) }));
        const flagged = withS.filter(r => flagsOf(r.s).length);
        let list = params.get('attention') === '1' ? flagged : withS;
        const before = list.length;
        list = list.filter(lookupFilter(params, r => ({ Ticket: r.number, Type: r.s.type, Summary: r.s.summary, State: r.s.state, Family: r.family.size > 1 ? `${r.family.size} linked tickets` : 'On its own', 'Assigned to': memberName(r.assigneeId) || 'Not assigned' })));
        const sort = params.get('sort');
        if (sort) {
            const v = { number: r => r.number, type: r => r.s.type, summary: r => r.s.summary, state: r => r.s.state, family: r => r.family.size, assignee: r => memberName(r.assigneeId) }[sort];
            if (v) list = sortBy(list, v, params.get('dir'));
        }
        const offset = Math.max(Number(params.get('offset')) || 0, 0);
        const limit = Math.min(Math.max(Number(params.get('limit')) || 50, 1), 200);
        return {
            total: list.length, before, attention: flagged.length,
            tickets: list.slice(offset, offset + limit).map(r => ({
                ...r.s, number: r.number, family: r.family,
                assignee: r.assigneeId ? { id: r.assigneeId, name: memberName(r.assigneeId) } : null,
                report: store.reports[r.number] || null, flags: flagsOf(r.s),
            })),
        };
    }
    function familyKpis(f) {
        const ss = f.members.map(summaryOf);
        const open = ss.filter(isOpenTicket);
        const kinds = {};
        for (const s of ss) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
        const names = { INC: ['incident', 'incidents'], CHG: ['change', 'changes'], RITM: ['request', 'requests'], SCTASK: ['catalog task', 'catalog tasks'] };
        const mix = Object.entries(kinds).map(([k, n]) => `${n} ${names[k][n === 1 ? 0 : 1]}`).join(', ');
        const list = [kpi('tickets', 'Tickets', ss.length, 'info', mix)];
        const closed = ss.length - open.length;
        list.push(kpi('progress', 'Closed', `${closed} of ${ss.length}`, open.length ? 'warn' : 'good', `${Math.round((closed / ss.length) * 100)}% of its tickets are closed.`));
        if (open.length) {
            const oldest = Math.min(...open.map(s => parseTime(s.opened)));
            const age = NOW - oldest;
            list.push(kpi('oldest', 'Oldest open', duration(age), age < 3 * DAY ? 'good' : age < 7 * DAY ? 'warn' : 'bad', 'How long its oldest open ticket has been open.'));
        }
        return { kpis: list, kinds, open: open.length, rank: Math.min(5, ...open.map(rankOf)), oldest: open.length ? Math.min(...open.map(s => parseTime(s.opened))) : Infinity };
    }
    function teamFamilyPage(params) {
        const status = params.get('status') === 'all' ? 'all' : 'open';
        const linked = params.get('linked') !== '0';
        let rows = teamFamilies().filter(f => !linked || f.members.length > 1).map(f => ({ f, k: familyKpis(f) }));
        const counts = { open: rows.filter(r => r.k.open).length, all: rows.length };
        if (status === 'open') rows = rows.filter(r => r.k.open);
        const before = rows.length;
        rows.sort((a, b) => (b.k.open ? 1 : 0) - (a.k.open ? 1 : 0) || a.k.rank - b.k.rank || a.k.oldest - b.k.oldest || b.f.members.length - a.f.members.length);
        rows = rows.filter(lookupFilter(params, r => ({ Family: `${r.f.id} ${summaryOf(r.f.id).summary}`, Tickets: `${r.f.members.length} tickets`, KPIs: r.k.kpis.map(k => `${k.label} ${k.value}`).join(' · ') })));
        const sort = params.get('sort');
        if (sort) {
            const v = { family: r => r.f.id, size: r => r.f.members.length, kpis: r => attention(r.k.kpis) }[sort];
            if (v) rows = sortBy(rows, v, params.get('dir'));
        }
        const offset = Math.max(Number(params.get('offset')) || 0, 0);
        const limit = Math.min(Math.max(Number(params.get('limit')) || 25, 1), 100);
        return {
            asOf: new Date(NOW).toISOString(), counts, total: rows.length, before, teamId: TEAM.id,
            families: rows.slice(offset, offset + limit).map(({ f, k }) => ({ id: f.id, size: f.members.length, kinds: k.kinds, open: k.open, kpis: k.kpis, ticket: summaryOf(f.id) })),
        };
    }
    function oneFamily(id) {
        const f = families.get(id);
        if (!f || f.teamId !== TEAM.id) return null;
        const tickets = f.members.map(n => {
            const s = summaryOf(n);
            const who = assignee.get(n) || null;
            return { ...s, number: n, assignee: who ? memberName(who) : null, kpis: ticketKpis(n), flags: flagsOf(s), open: isOpenTicket(s), rank: rankOf(s) };
        }).sort((a, b) => (b.open - a.open) || a.rank - b.rank || String(a.opened).localeCompare(String(b.opened)));
        return { id: f.id, size: f.members.length, team: { id: TEAM.id, name: TEAM.name }, asOf: new Date(NOW).toISOString(), kpis: familyKpis(f).kpis, tickets };
    }
    function myTickets() {
        const mine = [...assignee].filter(([, id]) => id === ME.id).map(([n]) => summaryOf(n));
        mine.sort((a, b) => rankOf(a) - rankOf(b) || String(a.opened).localeCompare(String(b.opened)));
        return mine.map(s => {
            const list = ticketKpis(s.number);
            return { ...s, open: isOpenTicket(s), rank: rankOf(s), flags: flagsOf(s), attention: attention(list), kpiText: list.map(k => `${k.label} ${k.value}`).join(' · ') };
        });
    }

    // ---------------------------------------------------------------
    // The architecture page (loaded from a file made at build time)
    // ---------------------------------------------------------------
    let architecture = null;
    const here = (document.currentScript && document.currentScript.src) || location.href;
    async function architectureMap() {
        if (!architecture) architecture = await (await realFetch(new URL('architecture.json', here))).json();
        return architecture;
    }
    function health() {
        const checks = [
            ['accounts', 'onetouch_auth', 'Sign-in and teams', 'Demo: answered in the browser.'],
            ['tickets', 'cube', 'Ticket data (Cube and analytics_db)', `Demo: ${byNumber.size.toLocaleString()} generated tickets.`],
            ['dashboards', 'metabase', 'Dashboards (Metabase)', { off: 'The demo has no Metabase; its dashboards are built in OneTouch.' }],
            ['claude', 'claude', 'AI assistant (Claude API)', { off: 'The demo answers with a scripted stand-in, not the Claude API.' }],
            ['email', 'brevo', 'Notification emails (Brevo)', { off: 'Email is off in the demo.' }],
            ['public', 'tunnel', 'Public address (Cloudflare Tunnel)', { off: 'The demo is a static page.' }],
            ['changes', 'express', 'Listening for new tickets', 'Demo: no live ServiceNow feed.'],
            ['errors', 'express', 'Errors people are getting', 'No errors.'],
        ];
        const at = new Date().toISOString();
        return {
            checkedAt: at,
            checks: checks.map(([id, node, name, r]) => ({ id, node, name, ...(typeof r === 'string' ? { state: 'ok', text: r } : { state: 'off', text: r.off }), checkedAt: at, since: null })),
        };
    }

    // ---------------------------------------------------------------
    // The routes
    // ---------------------------------------------------------------
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const fail = (message, status = 400) => json({ error: message }, status);
    const ACCESS = { admin: false, demo: true, role: 'project_manager', roleName: ROLES.project_manager, team: TEAM, tickets: null, note: null };
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // The answer streams its steps like the real server does
    function streamAnswer(question) {
        const encoder = new TextEncoder();
        const started = performance.now();
        return new Response(new ReadableStream({
            async start(controller) {
                const send = (event, data) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
                send('progress', { stage: 'sending' });
                await sleep(250);
                send('progress', { stage: 'understanding' });
                await sleep(700 + Math.random() * 500);
                send('progress', { stage: 'querying' });
                let result;
                try { result = answer(question); } catch (e) { console.error(e); result = { error: 'The demo could not answer that one. Try one of the example questions.' }; }
                await sleep(300 + Math.random() * 300);
                if (result.allEmpty) { send('progress', { stage: 'explaining' }); await sleep(300); }
                result.elapsedMs = Math.round(performance.now() - started);
                send('result', result);
                controller.close();
            },
        }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }

    async function route(method, path, params, body) {
        let m;
        // Signing in: any name and password open the demo
        if (path === '/api/login' && method === 'POST') return json({ token: 'demo-session', username: ME.username, displayName: ME.displayName });
        if (path === '/api/logout') return json({ ok: true });
        if (path === '/api/me' && method === 'GET') return json({ username: ME.username, displayName: ME.displayName, access: ACCESS, email: { address: null, on: false, enabled: false } });
        if (path === '/api/me/email') return json({ email: { address: null, on: false, enabled: false } });

        // The AI assistant and its chats
        if (path === '/api/query') {
            if (!body?.userPrompt) return fail('userPrompt parameter is required.');
            return streamAnswer(String(body.userPrompt));
        }
        if (path === '/api/conversation/reset') return json({ ok: true });
        if (path === '/api/chats' && method === 'GET') return json({ chats: [] });
        if ((m = path.match(/^\/api\/chats\/([^/]+)(\/open)?$/))) return method === 'DELETE' ? json({ ok: true }) : fail('That chat is not in this demo.', 404);

        // Dashboards: no Metabase here; the boards come from the preferences
        if (path === '/api/dashboards') return json({ dashboards: [], details: [] });
        if (path === '/api/charts/catalog') return json(catalog());
        if (path === '/api/charts/data') return json(chartData(body.chart, body.scope));
        if (path === '/api/charts/tickets') return json(chartTickets(body.chart, body.value ?? null, body.scope));
        if (path === '/api/charts/values') return json({ values: chartValues(String(body.source), String(body.field)) });
        if (path === '/api/charts/teams') return json({ values: teamValues() });
        if (path === '/api/shares' && method === 'GET') return json({ shares: [] });
        if (path === '/api/shares' && method === 'PUT') return fail('Sharing dashboards is turned off in this demo.', 403);
        if (path.startsWith('/api/shares/')) return method === 'DELETE' ? json({ ok: true }) : fail('That shared dashboard is not in this demo.', 404);

        // Preferences
        if (path === '/api/preferences' && method === 'GET') return json({ preferences: store.preferences });
        if ((m = path.match(/^\/api\/preferences\/(\w+)$/))) {
            if (method === 'DELETE') delete store.preferences[m[1]];
            else store.preferences[m[1]] = body?.value;
            save();
            return json(method === 'DELETE' ? { ok: true } : { value: body?.value });
        }

        // Tickets
        if (path === '/api/tickets/search') {
            const text = body?.text;
            if (typeof text !== 'string' || !text.trim()) return fail('Type a ticket number to search for.');
            const result = findTickets(text);
            if (body.record && result.found.length === 1) result.record = recordOf(result.found[0].number);
            return json({ ...result, found: withFlags(result.found) });
        }
        if (path === '/api/tickets/related') return json({ families: related((body?.numbers || []).map(String)) });
        if (path === '/api/my-tickets') return json({ tickets: myTickets() });
        if (path === '/api/kpis/tickets') {
            const kpis = {};
            for (const n of (body?.numbers || []).slice(0, 200)) { const k = ticketKpis(String(n).toUpperCase()); if (k) kpis[String(n).toUpperCase()] = k; }
            return json({ asOf: new Date(NOW).toISOString(), kpis });
        }
        if (path === '/api/kpis/families') return json(teamFamilyPage(params));
        if ((m = path.match(/^\/api\/kpis\/families\/([^/]+)$/))) {
            const f = oneFamily(decodeURIComponent(m[1]).toUpperCase());
            return f ? json(f) : fail('Only an admin or this family\'s project manager can see it.', 403);
        }
        if (path === '/api/tickets/report') {
            store.reports[body.number] = { status: body.status, note: body.note || null, at: new Date().toISOString(), by: ME.displayName, mine: true };
            save();
            return json({ told: 1 });
        }

        // Families of linked tickets
        if (path === '/api/families') {
            const kinds = {};
            for (const [k, list] of Object.entries(familyKinds())) kinds[k] = { families: list.length, tickets: list.reduce((s, f) => s + f.size, 0) };
            return json({ kinds });
        }
        if (path === '/api/families/find') {
            const n = String(params.get('number') || '').toUpperCase();
            const known = byNumber.has(n);
            const list = familiesTouching(n).map(([kind, anchor]) => {
                const f = familyKinds()[kind].find(x => x.anchor === anchor);
                return { kind, anchor, children: f.size - 1, size: f.size, row: familyRow(anchor) };
            });
            return json({ number: n, known, noAccess: [], families: list });
        }
        if ((m = path.match(/^\/api\/families\/([a-z-]+)\/([^/]+)$/))) return json({ family: relatedFamily(m[1], decodeURIComponent(m[2]).toUpperCase()) });
        if ((m = path.match(/^\/api\/families\/([a-z-]+)$/))) {
            let list = (familyKinds()[m[1]] || []).sort((a, b) => b.size - a.size);
            const all = list.length;
            const q = lower(params.get('q') || '');
            if (q) list = list.filter(f => lower(`${f.anchor} ${summaryOf(f.anchor).summary}`).includes(q));
            const offset = Number(params.get('offset')) || 0, limit = Number(params.get('limit')) || 25;
            return json({ kind: m[1], total: list.length, before: all, families: list.slice(offset, offset + limit).map(f => ({ anchor: f.anchor, children: f.size - 1, size: f.size, row: familyRow(f.anchor) })) });
        }

        // Ticket results (the tickets answers showed) and stars
        if (path === '/api/seen-tickets') {
            if (method === 'GET') {
                const tickets = store.seen.filter(s => byNumber.has(s.number)).map(s => ({ ...summaryOf(s.number), families: [], shownAt: s.shownAt, question: s.question }));
                return json({ tickets: withFlags(tickets) });
            }
            if (method === 'DELETE') { const deleted = store.seen.length; store.seen = []; save(); return json({ ok: true, deleted }); }
            const at = new Date().toISOString();
            const add = (body?.numbers || []).map(String).filter(n => byNumber.has(n));
            store.seen = [...add.map(n => ({ number: n, shownAt: at, question: body.question || null })), ...store.seen.filter(s => !add.includes(s.number))].slice(0, 2000);
            save();
            return json({ ok: true });
        }
        if (path === '/api/seen-tickets/remove') {
            const drop = new Set((body?.numbers || []).map(String));
            const before = store.seen.length;
            store.seen = store.seen.filter(s => !drop.has(s.number)); save();
            return json({ ok: true, removed: before - store.seen.length });
        }
        if (path === '/api/stars' && method === 'GET') {
            if (!params.get('details')) return json({ stars: store.stars });
            const tickets = store.stars.filter(s => byNumber.has(s.number)).map(s => ({ ...summaryOf(s.number), families: [], starredAt: s.starredAt }));
            return json({ stars: store.stars, tickets: withFlags(tickets), notFound: store.stars.filter(s => !byNumber.has(s.number)).map(s => s.number), noAccess: [] });
        }
        if (path === '/api/stars' && method === 'PUT') {
            const at = new Date().toISOString();
            const add = (body?.numbers || []).map(String).filter(n => !store.stars.some(s => s.number === n));
            store.stars = [...add.map(n => ({ number: n, starredAt: at })), ...store.stars].slice(0, 500); save();
            return json({ starred: (body?.numbers || []).map(String), full: false });
        }
        if (path === '/api/stars/remove') {
            const drop = new Set((body?.numbers || []).map(String));
            const before = store.stars.length;
            store.stars = store.stars.filter(s => !drop.has(s.number)); save();
            return json({ ok: true, removed: before - store.stars.length });
        }
        if ((m = path.match(/^\/api\/stars\/([A-Z0-9]+)$/i))) {
            const n = m[1].toUpperCase();
            store.stars = store.stars.filter(s => s.number !== n);
            if (method === 'PUT') store.stars.unshift({ number: n, starredAt: new Date().toISOString() });
            save();
            return json({ ok: true, number: n });
        }

        // The Team tab
        if (path === '/api/teams') return json(listTeams());
        if ((m = path.match(/^\/api\/teams\/(\d+)\/tickets$/))) return json(teamTickets(params));
        if (path === '/api/teams/unassigned/tickets' || path === '/api/ticket-families' || path.startsWith('/api/teams/members/') || /^\/api\/ticket-families\/[^/]+\/team$/.test(path)) return fail('Only an admin can do that.', 403);
        if (path === '/api/assignments') {
            const who = body?.assigneeId ? Number(body.assigneeId) : null;
            const numbers = (body?.numbers || []).map(String).filter(n => teamNumbers().includes(n));
            for (const n of numbers) { if (who) assignee.set(n, who); else assignee.delete(n); store.assignments[n] = who; }
            save();
            return json({ changed: numbers.length });
        }
        if ((m = path.match(/^\/api\/ticket-families\/([^/]+)\/assignee$/))) {
            const f = families.get(decodeURIComponent(m[1]).toUpperCase());
            if (!f || f.teamId !== TEAM.id) return fail('That family is not on your team.', 403);
            const who = body?.assigneeId ? Number(body.assigneeId) : null;
            for (const n of f.members) { if (who) assignee.set(n, who); else assignee.delete(n); store.assignments[n] = who; }
            save();
            return json({ changed: f.members.length });
        }
        if (path === '/api/ticket-statuses') {
            const tickets = Object.entries(store.reports).filter(([, r]) => ['resolved', 'closed'].includes(r.status)).map(([n, r]) => {
                const s = summaryOf(n);
                return { number: n, status: r.status, note: r.note, at: r.at, by: r.by, family: { id: familyOf.get(n), size: families.get(familyOf.get(n)).members.length }, team: { id: TEAM.id, name: TEAM.name }, assignee: assignee.get(n) ? { id: assignee.get(n), name: memberName(assignee.get(n)) } : null, type: s.type, summary: s.summary, state: s.state };
            });
            return json({ tickets });
        }
        if ((m = path.match(/^\/api\/ticket-statuses\/([^/]+)$/))) {
            const n = decodeURIComponent(m[1]);
            if (body?.status === 'open') delete store.reports[n];
            else store.reports[n] = { status: body?.status, note: null, at: new Date().toISOString(), by: ME.displayName, mine: true };
            save();
            return json({ number: n, status: body?.status });
        }

        // Notifications
        if (path === '/api/notifications') return json({ unread: store.notifications.filter(n => !n.read).length, notifications: store.notifications });
        if (path === '/api/notifications/read') {
            let read = 0;
            for (const n of store.notifications) if (!n.read && (!body?.ids || body.ids.includes(n.id))) { n.read = true; read++; }
            save();
            return json({ read });
        }
        if (path === '/api/notifications/clear') {
            const before = store.notifications.length;
            store.notifications = body?.ids ? store.notifications.filter(n => !body.ids.includes(n.id)) : [];
            save();
            return json({ cleared: before - store.notifications.length });
        }

        // Architecture (shown to the demo account) and problem reports
        if (path === '/api/architecture') return json(await architectureMap());
        if (path === '/api/architecture/health') return json(health());
        if (path === '/api/architecture/push') return json({ state: 'needs-auth', listening: false, heard: 0, lastAt: null, last: null, since: new Date(NOW).toISOString() });
        if (path === '/api/architecture/issues') return json({ openCount: 0, open: [], resolved: [] });
        if (path === '/api/issues') return json({ id: 1, told: 0 });

        // Downloads are made by the server's export service
        if (path === '/api/export') return fail('Downloads (PDF, Word, Excel) are made by the OneTouch server, so they are turned off in this static demo.', 501);

        return fail(`This demo doesn't answer ${method} ${path}.`, 404);
    }

    // ---------------------------------------------------------------
    // Answering the page's fetch() calls
    // ---------------------------------------------------------------
    const realFetch = window.fetch.bind(window);
    window.fetch = async function (input, init = {}) {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        const at = url.pathname.indexOf('/api/');
        if (at < 0) return realFetch(input, init);
        const path = url.pathname.slice(at);
        const method = (init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
        let body = null;
        if (init.body && typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = null; } }
        await sleep(40 + Math.random() * 120);
        try {
            return await route(method, path, url.searchParams, body || {});
        } catch (error) {
            console.error('Demo API error on', method, path, error);
            return fail('Something went wrong in the demo. Please try again.', 500);
        }
    };

    window.ONETOUCH_DEMO = { tickets: byNumber.size, firstDay: FIRST_DAY, lastDay: LAST_DAY, examples: { incident: T.incident[T.incident.length - 40].number, parent: parents[parents.length - 1].number, request: T.sc_req_item.find(r => (tasksOf.get(r.number) || []).length > 1 && r.opened > fmt(NOW - 10 * DAY))?.number, change: T.change_request[T.change_request.length - 10].number } };
})();
