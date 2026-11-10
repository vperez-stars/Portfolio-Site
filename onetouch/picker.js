// =====================================================================
// PERSON PICKER: a box where a project manager or an admin types the name
// of someone on the team to give them tickets or a whole family. Everyone
// on the team drops down at a click; as they type, only the names that match
// (any part of the name, or the username), best match first, each with
// their role and how many tickets they have. "Not assigned" takes tickets
// back. Arrow keys and Enter, or a click, pick someone; a full name typed and
// left also counts; Escape (or anything else left typed) puts back who had it.
// A pick fires a "personpick" event on the box ({ id, previous, name }; id
// null for nobody) for its list to act on. It follows the ARIA combobox pattern.
// Loaded before app.js, whose helpers these functions use when they run.
// =====================================================================

// Each team's people, by team id: [{ id, name, username, roleName, load }]
const pickerPeople = new Map();
let pickerCount = 0;
let openPickerBox = null; // the box whose list is showing
const NOBODY_LABEL = 'Not assigned';

// members: as /api/teams lists them; roles: its role names
function setPickerPeople(teamId, members, roles = {}) {
    pickerPeople.set(String(teamId), members.map(m => ({ ...m, roleName: roles[m.role] || '' })));
}

// What a box shows for a person (id), nobody (null) or no one picked yet (undefined)
function pickerLabel(teamId, id) {
    if (id === undefined) return '';
    if (id === null) return NOBODY_LABEL;
    return pickerPeople.get(String(teamId))?.find(p => p.id === id)?.name || '';
}

// current: who has it now (an id, null for nobody, undefined when there's
// nothing to show yet). nobody: "Not assigned" is a choice. attrs: the box's
// other attributes (data-number, data-family, …)
function personPickerHtml(teamId, current, label, { nobody = true, placeholder = 'Type a name…', attrs = '' } = {}) {
    const list = `person-options-${++pickerCount}`;
    return `<div class="person-picker" data-team="${escapeHtml(String(teamId))}"${current === undefined ? '' : ` data-current="${current ?? ''}"`}` +
        `${nobody ? ' data-nobody' : ''}${attrs ? ` ${attrs}` : ''}>` +
        `<input type="text" class="person-input" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${list}"` +
        ` autocomplete="off" spellcheck="false" aria-label="${escapeHtml(label)}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(pickerLabel(teamId, current))}">` +
        `<ul class="person-options" id="${list}" role="listbox" aria-label="${escapeHtml(label)}" hidden></ul></div>`;
}

// Who the box says has it: an id, null (nobody) or undefined (no one picked yet)
function pickerCurrent(picker) {
    const v = picker.dataset.current;
    return v === undefined ? undefined : v === '' ? null : Number(v);
}

function setPickerValue(picker, id) {
    if (id === undefined) delete picker.dataset.current;
    else picker.dataset.current = id ?? '';
    picker.querySelector('.person-input').value = pickerLabel(picker.dataset.team, id);
}

// The choices for what's typed, best match first: names starting with it, then
// a word of the name, then the username, then anywhere. Nothing typed: everyone,
// in the team's order (project manager first).
function pickerChoices(picker, text) {
    const q = text.trim().toLowerCase();
    const rank = p => {
        if (!q) return 0;
        const name = p.name.toLowerCase(), user = p.username.toLowerCase();
        if (name.startsWith(q)) return 1;
        if (name.split(/\s+/).some(w => w.startsWith(q))) return 2;
        if (user.startsWith(q)) return 3;
        return name.includes(q) || user.includes(q) ? 4 : -1;
    };
    const people = (pickerPeople.get(picker.dataset.team) || [])
        .map((p, i) => ({ p, i, r: rank(p) }))
        .filter(x => x.r >= 0)
        .sort((a, b) => a.r - b.r || a.i - b.i)
        .map(x => ({ id: x.p.id, name: x.p.name, person: x.p }));
    const nobody = picker.dataset.nobody !== undefined && (!q || [NOBODY_LABEL, 'nobody', 'none', 'unassign'].some(w => w.toLowerCase().startsWith(q)));
    return [...(nobody ? [{ id: null, name: NOBODY_LABEL }] : []), ...people];
}

// The name with the typed part marked
function markedName(name, text) {
    const q = text.trim().toLowerCase();
    const at = q ? name.toLowerCase().indexOf(q) : -1;
    if (at < 0) return escapeHtml(name);
    return escapeHtml(name.slice(0, at)) + `<mark>${escapeHtml(name.slice(at, at + q.length))}</mark>` + escapeHtml(name.slice(at + q.length));
}

// Shows the choices for what's typed ('' for everyone) and opens the list
function paintPicker(picker, text) {
    const list = picker.querySelector('.person-options');
    const choices = pickerChoices(picker, text);
    picker._choices = choices;
    list.innerHTML = choices.length
        ? choices.map((c, i) => `<li role="option" id="${list.id}-${i}" class="person-option" data-choice="${i}" aria-selected="false">` +
            `<span class="person-name">${markedName(c.name, text)}</span><span class="person-meta">${escapeHtml(c.person
                ? [c.person.roleName, c.person.load ? `${c.person.load.total.toLocaleString()} ${c.person.load.total === 1 ? 'ticket' : 'tickets'}` : ''].filter(Boolean).join(' · ')
                : 'Nobody has it')}</span></li>`).join('')
        : `<li class="person-empty" role="option" aria-disabled="true">No one on this team matches “${escapeHtml(text.trim())}”</li>`;
    list.hidden = false;
    picker.querySelector('.person-input').setAttribute('aria-expanded', 'true');
    openPickerBox = picker;
    placePickerList(picker);
    // Typed: the best match is ready for Enter. Just opened: whoever has it now.
    const current = choices.findIndex(c => c.id === pickerCurrent(picker));
    highlightChoice(picker, picker._typed ? (choices.length ? 0 : -1) : current);
}

function highlightChoice(picker, i) {
    picker._active = i;
    const input = picker.querySelector('.person-input');
    picker.querySelectorAll('.person-option').forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
    const li = picker.querySelector(`.person-option[data-choice="${i}"]`);
    if (li) {
        input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
    } else {
        input.removeAttribute('aria-activedescendant');
    }
}

// The list floats over the page, so a table's scroll box can't cut it off:
// under the box, or above it when there's more room there
function placePickerList(picker) {
    const list = picker.querySelector('.person-options');
    const r = picker.querySelector('.person-input').getBoundingClientRect();
    const width = Math.max(r.width, 240);
    list.style.left = `${Math.max(8, Math.min(r.left, innerWidth - width - 8))}px`;
    list.style.width = `${width}px`;
    const below = innerHeight - r.bottom;
    if (below < Math.min(list.scrollHeight, 280) + 8 && r.top > below) {
        list.style.top = '';
        list.style.bottom = `${innerHeight - r.top + 4}px`;
    } else {
        list.style.bottom = '';
        list.style.top = `${r.bottom + 4}px`;
    }
}

function closePicker(picker) {
    picker.querySelector('.person-options').hidden = true;
    const input = picker.querySelector('.person-input');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    if (openPickerBox === picker) openPickerBox = null;
}

// Back to who has it, as if nothing was typed
function restorePicker(picker) {
    picker._typed = false;
    setPickerValue(picker, pickerCurrent(picker));
    closePicker(picker);
}

function choosePerson(picker, choice) {
    const previous = pickerCurrent(picker);
    picker._typed = false;
    setPickerValue(picker, choice.id);
    closePicker(picker);
    // Still in the box: the name is selected, so typing another replaces it
    const input = picker.querySelector('.person-input');
    if (document.activeElement === input) input.select();
    if (choice.id !== previous) picker.dispatchEvent(new CustomEvent('personpick', { bubbles: true, detail: { id: choice.id, previous, name: choice.name } }));
}

// A whole name (or username) typed, matching one choice exactly
function exactChoice(picker, text) {
    const q = text.trim().toLowerCase();
    if (!q) return null;
    return pickerChoices(picker, text).find(c => c.name.toLowerCase() === q || c.person?.username.toLowerCase() === q) || null;
}

document.addEventListener('focusin', e => {
    if (!e.target.matches?.('.person-input')) return;
    const picker = e.target.closest('.person-picker');
    picker._typed = false;
    e.target.select(); // typing replaces the name showing
    paintPicker(picker, '');
});

// A click on the box while it's already in use (after a pick) opens the list again
document.addEventListener('click', e => {
    if (!e.target.matches?.('.person-input')) return;
    const picker = e.target.closest('.person-picker');
    if (!picker.querySelector('.person-options').hidden) return;
    picker._typed = false;
    e.target.select();
    paintPicker(picker, '');
});

document.addEventListener('input', e => {
    if (!e.target.matches?.('.person-input')) return;
    const picker = e.target.closest('.person-picker');
    picker._typed = true;
    paintPicker(picker, e.target.value);
});

document.addEventListener('keydown', e => {
    if (!e.target.matches?.('.person-input')) return;
    const picker = e.target.closest('.person-picker');
    const open = !picker.querySelector('.person-options').hidden;
    const count = picker._choices?.length || 0;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open) paintPicker(picker, picker._typed ? e.target.value : '');
        else if (count) highlightChoice(picker, (picker._active + (e.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const active = open ? picker._choices?.[picker._active] : null;
        const choice = active || exactChoice(picker, e.target.value);
        if (choice) choosePerson(picker, choice);
    } else if (e.key === 'Escape' && (open || picker._typed)) {
        e.preventDefault();
        restorePicker(picker);
    }
});

// Leaving the box: a whole name typed counts; anything else goes back
document.addEventListener('focusout', e => {
    if (!e.target.matches?.('.person-input')) return;
    const picker = e.target.closest('.person-picker');
    const exact = picker._typed ? exactChoice(picker, e.target.value) : null;
    if (exact) choosePerson(picker, exact);
    else restorePicker(picker);
});

// A click on a name (mousedown, so the box keeps the focus until it's picked)
document.addEventListener('mousedown', e => {
    const option = e.target.closest?.('.person-option');
    if (!option) return;
    e.preventDefault();
    const picker = option.closest('.person-picker');
    choosePerson(picker, picker._choices[Number(option.dataset.choice)]);
});

window.addEventListener('scroll', () => { if (openPickerBox) placePickerList(openPickerBox); }, true);
window.addEventListener('resize', () => { if (openPickerBox) placePickerList(openPickerBox); });
