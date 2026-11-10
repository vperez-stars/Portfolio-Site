// =====================================================================
// ♿ ACCESSIBILITY: settings that make OneTouch easier to see, read, hear
// and use, from the ♿ button in the header (and on the sign-in page):
//   - see: text size, high contrast, easier-to-read text, bold word
//     beginnings (like Bionic Reading), underlined links, a strong focus
//     outline, a big pointer, a reading guide, less motion
//   - 🔍 the magnifier: the text under the pointer (or the focused box), large
//   - 🔊 read aloud: selected text, Claude's answers, or what's pointed at
//   - 🎤 dictation: speak into the Ask bar, the chat, or any text box
// Kept in this browser (so the sign-in page uses them too) and saved to the
// account (prefs.mjs, part "access"), so they follow the person anywhere.
//
// Everything here is inside one function, so its names can't clash with the
// other page scripts (they share one global scope); the page calls only the
// few put on window at the end.
// =====================================================================

(() => {
    const DEFAULTS = {
        textSize: 100, magnify: 2, voice: '', rate: 1, bionicLevel: 2,
        contrast: false, readable: false, bionic: false, underline: false, focus: false, cursor: false, guide: false, motion: false,
        magnifier: false, selectRead: false, speakHover: false, speakAnswers: false, autoSend: false,
    };
    const TEXT_SIZES = [100, 115, 130, 150, 175];
    const MAGNIFY = [2, 3, 4];
    // How much of each word is bold: 1 light, 2 medium, 3 strong
    const BIONIC_LEVELS = [[1, 'Light'], [2, 'Medium'], [3, 'Strong']];
    // On/off settings that are only a class on <html> (style.css)
    const LOOKS = ['contrast', 'readable', 'underline', 'focus', 'cursor', 'motion'];
    const STORE_KEY = 'onetouch-access';

    const synth = window.speechSynthesis || null;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;

    let settings = { ...DEFAULTS, ...readStored() };

    function readStored() {
        try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; }
    }
    function store() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* this browser forgets them; the account doesn't */ }
    }
    const isDefault = s => Object.keys(DEFAULTS).every(k => s[k] === DEFAULTS[k]);
    const signedIn = () => !document.body.classList.contains('signed-out') && typeof sessionTokenValue !== 'undefined' && sessionTokenValue;

    // -----------------------------------------------------------------
    // Applying the settings
    // -----------------------------------------------------------------

    function apply() {
        const root = document.documentElement;
        for (const key of LOOKS) root.classList.toggle(`a11y-${key}`, settings[key]);
        // style.css sizes text in rem, so the root's size scales all of it
        root.style.fontSize = settings.textSize === 100 ? '' : `${settings.textSize}%`;
        guide.hidden = !settings.guide;
        bionicSet(settings.bionic ? settings.bionicLevel : 0);
        if (!settings.magnifier) hideLens();
        if (!settings.selectRead) readBubble.hidden = true;
        document.querySelectorAll('.mic-btn').forEach(b => { b.hidden = !Recognition; });
        paintPanel();
    }

    function change(update, { quiet = false } = {}) {
        settings = { ...settings, ...update };
        store();
        apply();
        if (signedIn() && typeof savePreference === 'function') {
            prefs.access = { ...settings };
            if (quiet) savePreferenceSoon('access'); else savePreference('access');
        }
    }

    // At sign-in (customize.js): the account's settings win. An account with
    // none saved keeps what this browser has, and saves it.
    function accountLoaded(saved) {
        if (saved && typeof saved === 'object') {
            settings = { ...DEFAULTS, ...saved };
            store();
            apply();
        } else if (!isDefault(settings)) {
            change({});
        }
    }

    function signedOut() {
        stopSpeaking();
        stopDictation();
        hideLens();
        readBubble.hidden = true;
        toggleAccessPanel(false);
    }

    function resetAccess() {
        stopSpeaking();
        change({ ...DEFAULTS });
        say('Accessibility settings are back to the default');
    }

    // A message: the page's toast when it's there (signed in), else the panel's status line
    function say(message) {
        if (signedIn() && typeof showToast === 'function') showToast(message);
        else {
            const line = document.getElementById('access-status');
            if (line) line.textContent = message;
        }
    }

    // -----------------------------------------------------------------
    // The ♿ panel
    // -----------------------------------------------------------------

    function buildPanel() {
        const panel = document.getElementById('access-panel');
        document.getElementById('access-sizes').innerHTML = TEXT_SIZES.map(size =>
            `<label class="choice-pill"><input type="radio" name="a11y-size" value="${size}"><span>${size}%</span></label>`).join('');
        document.getElementById('access-magnify').innerHTML = MAGNIFY.map(n =>
            `<label class="choice-pill"><input type="radio" name="a11y-magnify" value="${n}"><span>${n}×</span></label>`).join('');
        document.getElementById('access-bionic-levels').innerHTML = BIONIC_LEVELS.map(([n, label]) =>
            `<label class="choice-pill"><input type="radio" name="a11y-bionic-level" value="${n}"><span>${label}</span></label>`).join('');
        panel.addEventListener('change', e => {
            const t = e.target;
            if (t.name === 'a11y-size') change({ textSize: Number(t.value) });
            else if (t.name === 'a11y-magnify') change({ magnify: Number(t.value) });
            else if (t.name === 'a11y-bionic-level') change({ bionicLevel: Number(t.value) });
            else if (t.id === 'access-voice') change({ voice: t.value });
            else if (t.dataset.key) change({ [t.dataset.key]: t.checked });
        });
        document.getElementById('access-rate').addEventListener('input', e => change({ rate: Number(e.target.value) }, { quiet: true }));
        document.getElementById('access-try').addEventListener('click', () =>
            speak('This is how OneTouch reads to you. Select any text and press Alt R to hear it.'));
        if (!synth) document.getElementById('access-speech-none').hidden = false;
        if (!Recognition) document.getElementById('access-dictation-none').hidden = false;
        panel.querySelectorAll('[data-needs="speech"]').forEach(el => { el.disabled = !synth; });
        panel.querySelectorAll('[data-needs="dictation"]').forEach(el => { el.disabled = !Recognition; });
        fillVoices();
        synth?.addEventListener?.('voiceschanged', fillVoices);
        paintPanel();
    }

    function fillVoices() {
        const select = document.getElementById('access-voice');
        if (!select || !synth) return;
        const voices = synth.getVoices();
        // The page's language first, then the rest
        const lang = (navigator.language || 'en').slice(0, 2);
        const sorted = [...voices].sort((a, b) => (b.lang.startsWith(lang) - a.lang.startsWith(lang)) || a.name.localeCompare(b.name));
        select.innerHTML = '<option value="">The browser\'s usual voice</option>' + sorted.map(v =>
            `<option value="${escapeAttr(v.name)}">${escapeAttr(v.name)} (${escapeAttr(v.lang)})</option>`).join('');
        select.value = voices.some(v => v.name === settings.voice) ? settings.voice : '';
    }

    function paintPanel() {
        const panel = document.getElementById('access-panel');
        if (!panel) return;
        panel.querySelectorAll('input[name="a11y-size"]').forEach(r => { r.checked = Number(r.value) === settings.textSize; });
        panel.querySelectorAll('input[name="a11y-magnify"]').forEach(r => { r.checked = Number(r.value) === settings.magnify; });
        panel.querySelectorAll('input[name="a11y-bionic-level"]').forEach(r => { r.checked = Number(r.value) === settings.bionicLevel; });
        panel.querySelectorAll('input[data-key]').forEach(c => { c.checked = settings[c.dataset.key] === true; });
        const rate = document.getElementById('access-rate');
        rate.value = settings.rate;
        document.getElementById('access-rate-value').textContent = `${settings.rate.toFixed(1)}×`;
        const voice = document.getElementById('access-voice');
        if (voice && [...voice.options].some(o => o.value === settings.voice)) voice.value = settings.voice;
    }

    function toggleAccessPanel(open) {
        const panel = document.getElementById('access-panel');
        if (!panel) return;
        const willOpen = typeof open === 'boolean' ? open : panel.hidden;
        panel.hidden = !willOpen;
        document.querySelectorAll('.access-btn').forEach(b => b.setAttribute('aria-expanded', String(willOpen)));
        if (willOpen) {
            document.getElementById('access-status').textContent = '';
            panel.querySelector('input:checked, input')?.focus();
        } else if (panel.contains(document.activeElement)) {
            // The header's ♿ signed in, the sign-in page's otherwise (the other isn't shown)
            [...document.querySelectorAll('.access-btn')].find(b => b.getClientRects().length > 0)?.focus();
        }
    }

    // A click outside the panel closes it
    document.addEventListener('pointerdown', e => {
        const panel = document.getElementById('access-panel');
        if (panel && !panel.hidden && !panel.contains(e.target) && !e.target.closest('.access-btn')) toggleAccessPanel(false);
    });

    const escapeAttr = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // -----------------------------------------------------------------
    // What a place on the page says: the text under the pointer, a box's
    // label and value (never a password), a picture's description
    // -----------------------------------------------------------------

    const MAX_TEXT = 400;

    function fieldText(el) {
        const label = el.labels?.[0]?.innerText.trim() || el.getAttribute('aria-label') || el.placeholder || el.title || '';
        if (el.type === 'password') return label ? `${label} (password box)` : 'Password box';
        if (el.tagName === 'SELECT') return [label, el.selectedOptions[0]?.text].filter(Boolean).join(': ');
        if (['checkbox', 'radio'].includes(el.type)) {
            const name = el.closest('label')?.innerText.trim() || label;
            return `${name}: ${el.checked ? 'on' : 'off'}`;
        }
        if (['button', 'submit'].includes(el.type)) return el.value || label;
        const value = el.value.trim();
        return value ? (label && label !== value ? `${label}: ${value}` : value) : label;
    }

    function elementText(el) {
        if (!el || el.closest('.a11y-lens, iframe')) return null;
        if (el.matches('input, textarea, select')) return fieldText(el);
        if (el.matches('img')) return el.alt || null;
        const named = el.closest('[aria-label], [title]');
        const own = el.innerText?.trim();
        if (own && own.length <= MAX_TEXT) return own;
        return named?.getAttribute('aria-label') || named?.title || null;
    }

    // -> { text, el } for the point (x, y), or null
    function textAt(x, y) {
        const el = document.elementFromPoint(x, y);
        if (!el || el.closest('.a11y-ui, iframe')) return null;
        if (el.matches('input, textarea, select, img')) return { text: elementText(el), el };
        const node = caretNode(x, y);
        if (node?.nodeType === Node.TEXT_NODE && node.textContent.trim() && el.contains(node) && pointOnText(node, x, y)) {
            const host = node.parentElement;
            // The whole label, cell, line or button the words belong to, when it's short
            const block = host.closest('button, a, label, th, td, li, p, h1, h2, h3, h4, legend, summary, option, .msg, div, section') || host;
            // textContent first: it's cheap, and innerText of a big table on every move isn't
            const blockText = block.textContent.length <= MAX_TEXT * 2 ? block.innerText?.trim() : '';
            const text = blockText && blockText.length <= MAX_TEXT ? blockText : node.textContent.trim().slice(0, MAX_TEXT);
            return { text, el: block };
        }
        // A button with only an icon still has a name
        const named = el.closest('button, a, [role="button"], [aria-label]');
        const name = named && (named.getAttribute('aria-label') || named.title || named.innerText?.trim());
        return name ? { text: name.slice(0, MAX_TEXT), el: named } : null;
    }

    function caretNode(x, y) {
        if (document.caretPositionFromPoint) return document.caretPositionFromPoint(x, y)?.offsetNode || null;
        if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y)?.startContainer || null;
        return null;
    }

    // The caret functions find the nearest text; only text actually under the pointer counts
    function pointOnText(node, x, y) {
        const range = document.createRange();
        range.selectNodeContents(node);
        return [...range.getClientRects()].some(r => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2);
    }

    // -----------------------------------------------------------------
    // 🔍 The magnifier: a box beside the pointer with that text, large.
    // With the keyboard, the focused box or button's text.
    // -----------------------------------------------------------------

    const lens = document.createElement('div');
    lens.className = 'a11y-lens a11y-ui';
    lens.setAttribute('aria-hidden', 'true'); // screen readers already read the page itself
    lens.hidden = true;

    function showLens(text, x, y) {
        if (!text) return hideLens();
        lens.textContent = text;
        lens.style.fontSize = `${settings.magnify}rem`;
        lens.hidden = false;
        const gap = 18;
        const { width, height } = lens.getBoundingClientRect();
        let left = x + gap;
        let top = y + gap + 6;
        if (left + width > innerWidth - 8) left = Math.max(8, x - gap - width);
        if (top + height > innerHeight - 8) top = Math.max(8, y - gap - height);
        lens.style.left = `${left}px`;
        lens.style.top = `${top}px`;
    }
    function hideLens() { lens.hidden = true; }

    // -----------------------------------------------------------------
    // Bold word beginnings (like Bionic Reading): the first part of each
    // word in bold, so the eye moves from word to word. Each text node is
    // wrapped where it is (<span class="a11y-bionic"> with <b>s inside), so
    // the page's text (textContent) stays the same for the code that reads
    // it, copying and read-aloud. Text that arrives later is wrapped as it
    // comes, a little at a time; switching off puts the plain text back.
    // -----------------------------------------------------------------

    // The share of each word in bold, per level
    const BIONIC_SHARE = { 1: 0.3, 2: 0.45, 3: 0.6 };
    // Not inside these: boxes and menus can't hold bold, charts are drawn as
    // pictures (svg), and the rest isn't text for reading
    const BIONIC_SKIP = 'script, style, noscript, textarea, input, select, option, svg, iframe, canvas, code, pre, kbd, ' +
        '.a11y-ui, .a11y-bionic, .picture-host, [contenteditable="true"]';
    // A word: letters only, so ticket numbers (INC2400123) and codes (P1) stay as they are
    const BIONIC_WORD = /(?<![\p{L}\p{N}])\p{L}[\p{L}\p{M}'’]*(?![\p{L}\p{N}])/gu;
    let bionicLevel = 0; // what the page is wrapped at now; 0 when off
    let bionicQueue = [];
    let bionicNext = 0;
    let bionicTimer = null;
    let bionicObserver = null;

    function bionicFragment(text, share) {
        const frag = document.createDocumentFragment();
        let at = 0;
        for (const m of text.matchAll(BIONIC_WORD)) {
            const word = m[0];
            if (word.length < 2) continue;
            const bold = Math.max(1, Math.round(word.length * share));
            if (m.index > at) frag.append(text.slice(at, m.index));
            const b = document.createElement('b');
            b.textContent = word.slice(0, bold);
            frag.append(b, word.slice(bold));
            at = m.index + word.length;
        }
        if (!at) return null;
        if (at < text.length) frag.append(text.slice(at));
        return frag;
    }

    function bionicWrap(node, share) {
        const parent = node.parentElement;
        if (!node.isConnected || !parent || parent.closest(BIONIC_SKIP)) return;
        const frag = bionicFragment(node.data, share);
        if (!frag) return;
        const span = document.createElement('span');
        span.className = 'a11y-bionic';
        span.append(frag);
        node.replaceWith(span);
    }

    // Every text node in root, leaving out whole BIONIC_SKIP parts
    function bionicCollect(root) {
        if (root.nodeType === Node.TEXT_NODE) {
            if (/\p{L}{2}/u.test(root.data)) bionicQueue.push(root);
            return;
        }
        if (root.nodeType !== Node.ELEMENT_NODE || root.closest(BIONIC_SKIP)) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode: n => n.nodeType === Node.ELEMENT_NODE
                ? (n.matches(BIONIC_SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP)
                : (/\p{L}{2}/u.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
        });
        for (let n = walker.nextNode(); n; n = walker.nextNode()) bionicQueue.push(n);
    }

    // A few milliseconds at a time, so a long table never freezes the page
    function bionicRun() {
        bionicTimer = null;
        const share = BIONIC_SHARE[bionicLevel];
        if (!share) { bionicQueue = []; bionicNext = 0; return; }
        const until = performance.now() + 8;
        while (bionicNext < bionicQueue.length && performance.now() < until) bionicWrap(bionicQueue[bionicNext++], share);
        if (bionicNext < bionicQueue.length) bionicTimer = setTimeout(bionicRun, 0);
        else { bionicQueue = []; bionicNext = 0; }
    }
    const bionicSchedule = () => { if (!bionicTimer && bionicQueue.length) bionicTimer = setTimeout(bionicRun, 0); };

    function bionicSet(level) {
        if (level === bionicLevel) return;
        // Putting the plain text back mustn't be seen as new text to wrap
        bionicObserver?.disconnect();
        clearTimeout(bionicTimer);
        bionicTimer = null;
        bionicQueue = [];
        bionicNext = 0;
        document.querySelectorAll('span.a11y-bionic').forEach(span => span.replaceWith(span.textContent));
        bionicLevel = level;
        if (!level) return;
        bionicCollect(document.body);
        bionicSchedule();
        bionicObserver ||= new MutationObserver(changes => {
            for (const c of changes) {
                if (c.type === 'characterData') bionicCollect(c.target);
                else c.addedNodes.forEach(n => { if (!n.classList?.contains('a11y-bionic')) bionicCollect(n); });
            }
            bionicSchedule();
        });
        bionicObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    // -----------------------------------------------------------------
    // The reading guide: a band across the page that follows the pointer
    // -----------------------------------------------------------------

    const guide = document.createElement('div');
    guide.className = 'a11y-guide a11y-ui';
    guide.setAttribute('aria-hidden', 'true');
    guide.hidden = true;

    // -----------------------------------------------------------------
    // Following the pointer: the magnifier, the guide and reading what's
    // pointed at all look at the same spot, once per frame
    // -----------------------------------------------------------------

    let pointer = null;
    let framePending = false;
    let hover = { text: null, since: 0, spoken: null };
    const HOVER_READ_MS = 700;

    document.addEventListener('pointermove', e => {
        if (e.pointerType === 'touch') return;
        pointer = { x: e.clientX, y: e.clientY };
        if (!framePending) { framePending = true; requestAnimationFrame(followPointer); }
    }, { passive: true });
    document.addEventListener('pointerleave', () => { hideLens(); pointer = null; });
    document.addEventListener('scroll', () => { if (settings.magnifier && pointer) requestAnimationFrame(followPointer); }, { passive: true, capture: true });

    function followPointer() {
        framePending = false;
        if (!pointer) return;
        if (settings.guide) guide.style.top = `${pointer.y}px`;
        if (!settings.magnifier && !settings.speakHover) return;
        const found = textAt(pointer.x, pointer.y);
        if (settings.magnifier) {
            if (found?.text) showLens(found.text, pointer.x, pointer.y);
            else hideLens();
        }
        if (settings.speakHover) {
            const text = found?.text || null;
            if (text !== hover.text) hover = { text, since: Date.now(), spoken: hover.spoken };
            clearTimeout(hoverTimer);
            if (text && text !== hover.spoken) hoverTimer = setTimeout(() => {
                if (hover.text === text) { hover.spoken = text; speak(text); }
            }, HOVER_READ_MS);
        }
    }
    let hoverTimer = null;

    // The magnifier for keyboard users: the focused element's text, by it
    document.addEventListener('focusin', e => {
        if (!settings.magnifier || e.target.closest?.('.a11y-ui') || !e.target.getBoundingClientRect) return;
        const text = elementText(e.target);
        const r = e.target.getBoundingClientRect();
        if (text) showLens(text, r.left, r.bottom);
    });

    // -----------------------------------------------------------------
    // 🔊 Reading aloud (the browser's own voices, speechSynthesis)
    // -----------------------------------------------------------------

    // Ticket numbers read as what they are, digit by digit, not as millions
    const TICKET_WORDS = { INC: 'incident', CHG: 'change', RITM: 'request item', SCTASK: 'catalog task', REQ: 'request', PRB: 'problem' };
    function speakable(text) {
        return String(text)
            .replace(/\b(INC|CHG|RITM|SCTASK|REQ|PRB)(\d{7})\b/gi, (m, p, d) => `${TICKET_WORDS[p.toUpperCase()]} ${d.split('').join(' ')}`)
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ') // emoji are read out by name otherwise
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Long text in sentence-sized pieces: some browsers stop a single long one partway
    function pieces(text, size = 220) {
        const out = [];
        let rest = text;
        while (rest.length > size) {
            const cut = Math.max(rest.lastIndexOf('. ', size), rest.lastIndexOf(', ', size), rest.lastIndexOf(' ', size));
            const at = cut > 40 ? cut + 1 : size;
            out.push(rest.slice(0, at));
            rest = rest.slice(at).trim();
        }
        if (rest) out.push(rest);
        return out;
    }

    let speakingId = 0;
    function speak(text) {
        if (!synth) { say('This browser can\'t read aloud. Edge, Chrome and Safari can.'); return; }
        const words = speakable(text);
        if (!words) return;
        stopSpeaking();
        const id = ++speakingId;
        const voice = synth.getVoices().find(v => v.name === settings.voice);
        const parts = pieces(words);
        // Starting straight after cancel() is sometimes dropped, so give it a moment
        setTimeout(() => {
            if (id !== speakingId) return;
            parts.forEach((part, i) => {
                const u = new SpeechSynthesisUtterance(part);
                if (voice) u.voice = voice;
                u.lang = voice?.lang || navigator.language || 'en-US';
                u.rate = settings.rate;
                if (i === parts.length - 1) u.onend = u.onerror = () => { if (id === speakingId) speakingPill.hidden = true; };
                synth.speak(u);
            });
            speakingPill.hidden = false;
        }, 60);
    }

    function stopSpeaking() {
        speakingId++;
        if (synth && (synth.speaking || synth.pending)) synth.cancel();
        speakingPill.hidden = true;
    }

    // "Reading… ⏹ Stop", while it reads
    const speakingPill = document.createElement('div');
    speakingPill.className = 'a11y-pill a11y-ui';
    speakingPill.setAttribute('role', 'status');
    speakingPill.hidden = true;
    speakingPill.innerHTML = '<span>Reading aloud…</span><button type="button" class="a11y-pill-btn">⏹ Stop</button>';
    speakingPill.querySelector('button').addEventListener('click', stopSpeaking);

    // An answer in the chat, as it's best heard: its words, and each table
    // as how many rows and which columns (a whole table read cell by cell is
    // too long to follow; selecting cells reads them)
    function answerSpeech(msg) {
        const copy = msg.cloneNode(true);
        copy.querySelectorAll('.msg-read-btn, .download-bar, [hidden], script, style').forEach(n => n.remove());
        copy.querySelectorAll('table').forEach(table => {
            const rows = table.tBodies[0]?.rows.length ?? Math.max(0, table.rows.length - 1);
            const columns = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim()).filter(Boolean);
            table.replaceWith(document.createTextNode(
                ` A table with ${rows.toLocaleString()} ${rows === 1 ? 'row' : 'rows'}${columns.length ? `. Its columns are ${columns.join(', ')}` : ''}. `));
        });
        // Blocks end in a pause, so words from two lines don't run together
        copy.querySelectorAll('div, p, li, summary, h1, h2, h3, h4').forEach(n => n.append('. '));
        return copy.textContent.replace(/(\.\s*){2,}/g, '. ');
    }

    // 🔊 Read on each of Claude's answers
    function addReadButtons(root) {
        if (!synth) return;
        const messages = root.matches?.('.msg.ai-msg') ? [root] : [...(root.querySelectorAll?.('.msg.ai-msg') || [])];
        for (const msg of messages) {
            if (msg.classList.contains('query-progress') || msg.querySelector(':scope > .msg-read-btn')) continue;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'msg-read-btn a11y-ui';
            button.textContent = '🔊 Read';
            button.setAttribute('aria-label', 'Read this answer aloud');
            button.addEventListener('click', () => speak(answerSpeech(msg)));
            msg.prepend(button);
        }
    }

    // A new answer read by itself, when asked for
    document.addEventListener('onetouch:answer', () => {
        if (!settings.speakAnswers) return;
        const last = [...document.querySelectorAll('#chat-log .msg.ai-msg:not(.query-progress)')].pop();
        if (last) speak(answerSpeech(last));
    });

    // Selected text gets a "🔊 Read" button by it
    const readBubble = document.createElement('button');
    readBubble.type = 'button';
    readBubble.className = 'a11y-read-bubble a11y-ui';
    readBubble.textContent = '🔊 Read';
    readBubble.setAttribute('aria-label', 'Read the selected text aloud');
    readBubble.hidden = true;
    readBubble.addEventListener('pointerdown', e => e.preventDefault()); // keeps the selection
    readBubble.addEventListener('click', () => { speak(selectedText()); readBubble.hidden = true; });

    function selectedText() {
        const field = document.activeElement;
        if (field?.matches?.('textarea, input:not([type="password"])') && field.selectionStart !== field.selectionEnd) {
            return field.value.slice(field.selectionStart, field.selectionEnd);
        }
        return String(window.getSelection() || '');
    }

    let bubbleTimer = null;
    document.addEventListener('selectionchange', () => {
        clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(placeBubble, 250);
    });
    function placeBubble() {
        const sel = window.getSelection();
        if (!settings.selectRead || !synth || !sel || sel.isCollapsed || sel.toString().trim().length < 2) { readBubble.hidden = true; return; }
        const rects = sel.getRangeAt(0).getClientRects();
        const last = rects[rects.length - 1];
        if (!last) { readBubble.hidden = true; return; }
        readBubble.hidden = false;
        const { width } = readBubble.getBoundingClientRect();
        readBubble.style.left = `${Math.min(innerWidth - width - 8, Math.max(8, last.right - width / 2))}px`;
        readBubble.style.top = `${Math.min(innerHeight - 40, last.bottom + 8)}px`;
    }

    // -----------------------------------------------------------------
    // 🎤 Dictation (the browser's speech recognition): into the Ask bar,
    // the chat's box, or whichever text box has the cursor
    // -----------------------------------------------------------------

    // Boxes that ask Claude when dictation ends, with "Ask as soon as I stop talking"
    const SENDERS = {
        'nav-ask-input': () => typeof askFromHeader === 'function' && askFromHeader(),
        'user-prompt': () => typeof sendPrompt === 'function' && sendPrompt(),
    };
    const isTextBox = el => el?.matches?.('textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"]') && !el.disabled && !el.readOnly;

    let dictation = null; // { rec, field, button }

    function startDictation(target, button = null) {
        if (!Recognition) { say('This browser can\'t take dictation. Use Edge or Chrome.'); return; }
        if (dictation) { stopDictation(); return; }
        let field = typeof target === 'string' ? document.getElementById(target) : target;
        if (!isTextBox(field)) field = isTextBox(document.activeElement) ? document.activeElement : document.getElementById(signedIn() ? 'nav-ask-input' : 'login-email');
        if (!isTextBox(field)) { say('Click in a text box first, then press Alt M.'); return; }
        stopSpeaking();
        field.focus();

        const start = field.selectionStart ?? field.value.length;
        const end = field.selectionEnd ?? field.value.length;
        const before = field.value.slice(0, start);
        const after = field.value.slice(end);
        const joiner = before && !/\s$/.test(before) ? ' ' : '';
        const max = field.maxLength > 0 ? field.maxLength : Infinity;
        const send = settings.autoSend ? SENDERS[field.id] : null;

        const rec = new Recognition();
        rec.lang = navigator.language || 'en-US';
        rec.interimResults = true;
        // Asking when they stop: one phrase. Otherwise it listens until stopped.
        rec.continuous = !send;
        let heard = '';
        rec.onresult = e => {
            let text = '';
            for (const result of e.results) text += result[0].transcript;
            heard = text.trim();
            field.value = (before + joiner + heard + after).slice(0, max);
            const caret = Math.min(max, (before + joiner + heard).length);
            field.setSelectionRange?.(caret, caret);
            field.dispatchEvent(new Event('input', { bubbles: true }));
        };
        rec.onerror = e => {
            const why = {
                'not-allowed': 'The microphone isn\'t allowed. Allow it for this site (the 🔒 or 🎤 by the address), then try again.',
                'service-not-allowed': 'The microphone isn\'t allowed. Allow it for this site (the 🔒 or 🎤 by the address), then try again.',
                'no-speech': 'Nothing was heard. Press 🎤 and speak.',
                'audio-capture': 'No microphone was found.',
                'network': 'Dictation needs the internet: the browser turns speech into text online.',
            }[e.error];
            if (why) say(why);
        };
        rec.onend = () => {
            const wasThis = dictation?.rec === rec;
            if (wasThis) endDictationUi();
            if (wasThis && send && heard) send();
        };
        dictation = { rec, field, button: button || document.querySelector(`.mic-btn[data-mic-for="${field.id}"]`) };
        dictation.button?.classList.add('listening');
        dictation.button?.setAttribute('aria-pressed', 'true');
        listeningPill.hidden = false;
        try { rec.start(); } catch { endDictationUi(); }
    }

    function stopDictation() {
        if (!dictation) return;
        try { dictation.rec.stop(); } catch { /* already stopped */ }
        endDictationUi();
    }

    function endDictationUi() {
        dictation?.button?.classList.remove('listening');
        dictation?.button?.setAttribute('aria-pressed', 'false');
        dictation = null;
        listeningPill.hidden = true;
    }

    const listeningPill = document.createElement('div');
    listeningPill.className = 'a11y-pill a11y-pill-listening a11y-ui';
    listeningPill.setAttribute('role', 'status');
    listeningPill.hidden = true;
    listeningPill.innerHTML = '<span>Listening… speak now</span><button type="button" class="a11y-pill-btn">⏹ Stop</button>';
    listeningPill.querySelector('button').addEventListener('click', stopDictation);

    // 🎤 buttons: <button class="mic-btn" data-mic-for="the box's id">
    document.addEventListener('click', e => {
        const mic = e.target.closest?.('.mic-btn');
        if (!mic) return;
        e.preventDefault();
        startDictation(mic.dataset.micFor, mic);
    });
    // Pressing 🎤 mustn't take the cursor out of the box being dictated into
    document.addEventListener('pointerdown', e => { if (e.target.closest?.('.mic-btn')) e.preventDefault(); });

    // -----------------------------------------------------------------
    // Keyboard: Alt+A the panel, Alt+R read, Alt+M dictate, Esc stops
    // -----------------------------------------------------------------

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (dictation) stopDictation();
            if (synth?.speaking) stopSpeaking();
            hideLens();
            const panel = document.getElementById('access-panel');
            if (panel && !panel.hidden) toggleAccessPanel(false);
            return;
        }
        if (!e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.code === 'KeyA') { e.preventDefault(); toggleAccessPanel(); }
        else if (e.code === 'KeyR') {
            e.preventDefault();
            if (synth?.speaking) return stopSpeaking();
            const text = selectedText().trim()
                || (pointer && textAt(pointer.x, pointer.y)?.text)
                || elementText(document.activeElement);
            if (text) speak(text); else say('Select some text (or point at it), then press Alt R.');
        } else if (e.code === 'KeyM') { e.preventDefault(); startDictation(document.activeElement); }
    });

    // -----------------------------------------------------------------
    // Start
    // -----------------------------------------------------------------

    function start() {
        document.body.append(lens, guide, speakingPill, listeningPill, readBubble);
        buildPanel();
        apply();
        const log = document.getElementById('chat-log');
        if (log) {
            addReadButtons(log);
            new MutationObserver(changes => changes.forEach(c => c.addedNodes.forEach(n => n.nodeType === 1 && addReadButtons(n))))
                .observe(log, { childList: true });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    Object.assign(window, {
        toggleAccessPanel, resetAccess,
        a11yAccountLoaded: accountLoaded, a11ySignedOut: signedOut,
    });
})();
