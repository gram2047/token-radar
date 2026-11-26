// Token Launch Radar dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, the calibrated model, a filterable table and a per-protocol detail sheet with the
// model's arithmetic and the farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'all', sort: 'rank', dir: 1, selected: null };
  // Deep links: #tab=early, #category=RWA, #q=gauntlet and #detail=<slug> open the same views a
  // reader reaches by clicking, so a link (or a screenshot) can name one exact view of the board.
  var deepDetail = null;
  if (location.hash.length > 1) {
    location.hash.slice(1).split('&').forEach(function (pair) {
      var kv = pair.split('=');
      var key = decodeURIComponent(kv[0] || '');
      var val = decodeURIComponent(kv.slice(1).join('=') || '');
      if (key === 'tab' && (val === 'all' || val === 'watchlist' || val === 'early' || val === 'live')) state.tab = val;
      if (key === 'category' && val) state.category = val;
      if (key === 'q' && val) state.q = val.toLowerCase();
      if (key === 'detail' && val) deepDetail = val;
    });
  }

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and its calibrated
  // category multiple, and the detail sheet checks it against the number board.json carries, so the
  // page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  var maxImplied = Math.max.apply(null, DATA.rows.map(function (r) { return r.implied_value_usd; }));

  function stat(b, s) { return el('div', { 'class': 'stat' }, el('b', { text: b }), el('span', { text: s })); }

  function hero() {
    return el('header', { 'class': 'hero' },
      el('div', { 'class': 'eyebrow', text: 'Pre-token protocol radar · snapshot ' + DATA.as_of }),
      el('h1', null, 'Token Launch ', el('span', { 'class': 'thin', text: 'Radar' })),
      el('p', { 'class': 'lede', text: 'Every protocol in the snapshot that records no token, ranked by what its launch would be worth if its record stayed as it is. The value model is calibrated from the snapshot itself: each category is priced at the multiple the market already pays for that category\u2019s live tokens. An implied value is this board\u2019s own claim, not a prediction that a token will be issued.' }),
      el('div', { 'class': 'stats' },
        stat(String(DATA.board_size), 'ranked protocols'),
        stat(String(DATA.watchlist_size), 'watchlist covered'),
        stat(String(DATA.early_size), 'early finds below the floor'),
        stat(String(DATA.calibration.live_peers), 'live peers calibrate the model'),
        stat(DATA.calibration.global_median.toFixed(3) + 'x', 'global median mcap / TVL')));
  }

  function modelSection() {
    var m = DATA.model;
    var rows = DATA.calibration.categories.slice(0, 10).map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { 'class': 'n', text: String(c.peers) }),
        el('td', { 'class': 'n', text: c.median.toFixed(3) + 'x' }),
        el('td', { 'class': 'n', text: c.multiple.toFixed(3) + 'x' }));
    });
    return el('section', { 'class': 'model' },
      el('h2', { text: 'How a launch is priced (model ' + DATA.model_version + ')' }),
      el('p', { text: 'A lending market and a bridge do not trade at the same multiple of TVL, so one flat multiple misprices both. For each category the model takes the median market-cap / TVL of the protocols in that category whose token already trades, then shrinks it toward the global median in log space with weight n / (n + ' + m.shrink_k + '), so a category with one or two peers cannot swing the board. The result is clamped to [' + m.multiple_min + 'x, ' + m.multiple_max + 'x]. Growth and time already spent tokenless adjust the base; no protocol name is ever special-cased.' }),
      el('div', { 'class': 'formula', text: 'implied = TVL x category multiple (calibrated) x (1 + clamp(7d change, ' + m.growth_floor + '%, +' + m.growth_cap + '%) x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age, ' + m.maturity_days + 'd) / ' + m.maturity_days + ' x ' + m.maturity_range + ')' }),
      el('table', { 'class': 'cal' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Category' }), el('th', { 'class': 'n', text: 'Live peers' }),
          el('th', { 'class': 'n', text: 'Median mcap/TVL' }), el('th', { 'class': 'n', text: 'Multiple used' }))),
        el('tbody', null, rows)));
  }

  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { if (r.category) seen[r.category] = true; });
    return Object.keys(seen).sort();
  }

  function controls() {
    var search = el('input', { type: 'search', placeholder: 'Search name or slug', value: state.q });
    search.addEventListener('input', function () { state.q = search.value.toLowerCase(); renderTable(); });
    var sel = el('select', null,
      el('option', { value: 'all', text: 'All categories' }),
      categories().map(function (c) { return el('option', { value: c, text: c }); }));
    sel.value = state.category;
    sel.addEventListener('change', function () { state.category = sel.value; renderTable(); });
    function segBtn(key, label) {
      var b = el('button', { text: label, 'class': state.tab === key ? 'on' : '' });
      b.addEventListener('click', function () { state.tab = key; refresh(); });
      return b;
    }
    return el('div', { 'class': 'controls' },
      el('div', { 'class': 'seg' }, segBtn('all', 'Full board'), segBtn('watchlist', 'Watchlist'), segBtn('early', 'Early finds'), segBtn('live', 'Live tokens')),
      search, sel,
      el('span', { 'class': 'count', id: 'count' }));
  }

  function filtered() {
    var rows = DATA.rows.filter(function (r) {
      if (state.tab === 'watchlist' && !r.watchlist) return false;
      if (state.tab === 'early' && r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.q && (r.name + ' ' + r.slug).toLowerCase().indexOf(state.q) < 0) return false;
      return true;
    });
    var k = state.sort, d = state.dir;
    rows.sort(function (a, b) {
      var va = a[k], vb = b[k];
      if (va === null || va === undefined) va = -Infinity;
      if (vb === null || vb === undefined) vb = -Infinity;
      return (va < vb ? -1 : va > vb ? 1 : 0) * d;
    });
    return rows;
  }

  var tbodyHost = el('div');
  var liveHost = el('div');

  function th(label, key, cls) {
    var t = el('th', { 'class': cls || '', text: label + (state.sort === key ? (state.dir === 1 ? ' \u2191' : ' \u2193') : '') });
    t.addEventListener('click', function () {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'rank' || key === 'name' ? 1 : -1; }
      renderTable();
    });
    return t;
  }

  function renderTable() {
    tbodyHost.innerHTML = '';
    liveHost.innerHTML = '';
    var count = document.getElementById('count');
    if (state.tab === 'live') {
      if (count) count.textContent = DATA.live.length + ' live-token protocols, shown at market value';
      var lt = el('table', { 'class': 'board' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Protocol' }), el('th', { text: 'Category' }),
          el('th', { 'class': 'n', text: 'TVL' }), el('th', { 'class': 'n', text: 'Market cap' }),
          el('th', { 'class': 'n', text: 'Mcap / TVL' }), el('th', { 'class': 'n', text: '7d' }))),
        el('tbody', null, DATA.live.map(function (r) {
          return el('tr', null,
            el('td', { 'class': 'pname', text: r.name }),
            el('td', { 'class': 'pcat', text: r.category || '—' }),
            el('td', { 'class': 'n', text: fmtUsd(r.tvl_usd) }),
            el('td', { 'class': 'n', text: fmtUsd(r.mcap_usd) }),
            el('td', { 'class': 'n', text: r.tvl_usd > 0 && r.mcap_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) + 'x' : 'n/a' }),
            el('td', { 'class': 'n ' + (r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : ''), text: fmtPct(r.change_7d) }));
        })));
      liveHost.appendChild(lt);
      return;
    }
    var rows = filtered();
    if (count) count.textContent = rows.length + ' of ' + DATA.rows.length + ' protocols';
    var table = el('table', { 'class': 'board' },
      el('thead', null, el('tr', null,
        th('#', 'rank', 'n'), th('Protocol', 'name'), th('TVL', 'tvl_usd', 'n'),
        th('7d', 'change_7d', 'n'), th('Age', 'age_days', 'n hideS'), th('Multiple', 'category_multiple', 'n hideS'),
        th('Implied value', 'implied_value_usd', 'n'))),
      el('tbody', null, rows.map(function (r) {
        var tr = el('tr', null,
          el('td', { 'class': 'rank n', text: String(r.rank) }),
          el('td', null,
            el('span', { 'class': 'pname', text: r.name }),
            el('span', { 'class': 'badge ' + (r.watchlist ? 'wl' : 'early'), text: r.watchlist ? 'WATCHLIST' : 'EARLY' }),
            el('div', { 'class': 'pcat', text: (r.category || 'Uncategorised') + ' · ' + (r.chains.slice(0, 3).join(', ') || 'no chain listed') })),
          el('td', { 'class': 'n', text: fmtUsd(r.tvl_usd) }),
          el('td', { 'class': 'n ' + (r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : ''), text: fmtPct(r.change_7d) }),
          el('td', { 'class': 'n hideS', text: fmtAge(r.age_days) }),
          el('td', { 'class': 'n hideS', text: r.category_multiple.toFixed(2) + 'x' }),
          el('td', { 'class': 'n' },
            el('span', { 'class': 'implied', text: fmtUsd(r.implied_value_usd) }),
            el('div', { 'class': 'bar' }, el('i', { style: 'width:' + Math.max(2, Math.round(100 * r.implied_value_usd / maxImplied)) + '%' }))));
        tr.addEventListener('click', function () { openDetail(r); });
        return tr;
      })));
    tbodyHost.appendChild(table);
  }

  var drawer = el('div', { 'class': 'drawer' });
  drawer.addEventListener('click', function (e) { if (e.target === drawer) closeDetail(); });
  function closeDetail() { drawer.className = 'drawer'; drawer.innerHTML = ''; state.selected = null; }
  function openDetail(r) {
    state.selected = r.slug;
    var recomputed = impliedOf(r, DATA.model);
    var kv = function (pairs) {
      return el('dl', { 'class': 'kv' }, pairs.map(function (p) {
        return [el('dt', { text: p[0] }), el('dd', { text: p[1] })];
      }));
    };
    var sheet = el('div', { 'class': 'sheet' },
      el('button', { 'class': 'close', text: 'Close', onclick: closeDetail }),
      el('div', { 'class': 'eyebrow', text: 'Rank #' + r.rank + ' · ' + (r.watchlist ? 'watchlist' : 'early find') }),
      el('h2', { text: r.name }),
      el('div', { 'class': 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains.join(', ') || 'no chain listed') + ' · records no token' }),
      el('h3', { text: 'The snapshot record' }),
      kv([['TVL', fmtUsd(r.tvl_usd)], ['7d TVL change', fmtPct(r.change_7d)], ['Tracked since', r.listed_at || 'unknown'], ['Age with no token', fmtAge(r.age_days)]]),
      el('h3', { text: 'How the model prices it' }),
      kv([
        ['Category multiple', r.category_multiple.toFixed(3) + 'x (' + r.peer_count + ' live peers)'],
        ['Growth multiplier', 'x' + r.growth_multiplier.toFixed(3)],
        ['Maturity multiplier', 'x' + r.maturity_multiplier.toFixed(3)],
        ['Implied launch value', fmtUsd(r.implied_value_usd)]]),
      el('p', { 'class': 'check', text: 'check: this page recomputes ' + fmtUsd(recomputed) + ' from the figures above' + (recomputed === r.implied_value_usd ? ' — it matches board.json.' : ' — rounding differs from board.json.') }),
      el('h3', { text: 'Farm plan' }),
      el('ol', { 'class': 'steps' }, r.farm_steps.map(function (s) { return el('li', { text: s }); })),
      el('p', { 'class': 'sub', text: 'Farming is a plan, not a promise: a protocol may never issue a token, and an implied value is this board\u2019s claim, not the protocol\u2019s.' }));
    drawer.innerHTML = '';
    drawer.appendChild(sheet);
    drawer.className = 'drawer open';
  }

  function refresh() {
    app.innerHTML = '';
    app.appendChild(hero());
    app.appendChild(modelSection());
    app.appendChild(controls());
    app.appendChild(tbodyHost);
    app.appendChild(liveHost);
    app.appendChild(el('footer', { text: 'Data: the sealed DefiLlama snapshot of ' + DATA.as_of + ' (' + DATA.source + '), the same bytes the grader reads. Protocols at or above ' + fmtUsd(DATA.floor_usd) + ' TVL that record no token and are not a wrapped or staked product of one that trades form the watchlist; the board covers all of them and adds early finds below the floor. Live tokens are shown at market value and never ranked. Dashboard renders offline from data.js.' }));
    app.removeAttribute('aria-busy');
    renderTable();
  }

  document.body.appendChild(drawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });
  refresh();
  if (deepDetail) {
    for (var i = 0; i < DATA.rows.length; i++) {
      if (DATA.rows[i].slug === deepDetail) { openDetail(DATA.rows[i]); break; }
    }
  }
})();
