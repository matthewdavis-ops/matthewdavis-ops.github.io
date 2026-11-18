/* DatMavis.com — one script for every page.
   Each page sets DM_BASE (its path up to web/datmavis/) and loads this file.
   Change something here and every page picks it up on the next push. */
(function () {
  var BASE = window.DM_BASE || '';
  var body = document.body, stage = document.getElementById('stage');

  // The clear strip above the art: the way out ("<- Web Design") and the fine
  // print beside it, centred as one row so they sit over the art on every page.
  var bar = document.createElement('div');
  bar.className = 'dm-bar';
  var exit = document.createElement('a');
  exit.className = 'exit';
  exit.href = BASE + '../../web.html';
  exit.textContent = '\u2190 Web Design';
  var note = document.createElement('p');
  note.className = 'dm-note';
  note.textContent = 'NOTE: This is a work of fan fiction. Any resemblance to actual timelines is purely coincidental. Free admission since 2010.';
  // The buttons travel as one group (the way out, and Show doors where it applies),
  // so on a narrow window they share a row and only the note drops beneath them.
  var btns = document.createElement('div');
  btns.className = 'dm-btns';
  btns.appendChild(exit);
  bar.appendChild(btns);
  bar.appendChild(note);
  body.insertBefore(bar, body.firstChild);

  // Rollovers: every slice with a drawn hover state swaps when a mouse or pen
  // passes over it, and on keyboard focus of its link. Hover states are preloaded.
  // A finger has no hover, so on touch:
  //   - a slice with no link (a name, a speech bubble) toggles on each tap;
  //   - a link marked data-tap="reveal" (its hover carries a line of the story)
  //     shows it on the first tap and follows the link on the second;
  //   - every other link follows on the first tap, as it always has.
  // `last` remembers what the visitor last used, so a tap that focuses a link
  // doesn't count as hovering it, and the keyboard still lights what it reaches.
  //
  // Show doors: with no hover, a touch screen can't find the doors by feel, so
  // any page with at least one door gets a second button beside the way out.
  // It lights every linked slice at once (most hover states are lettered labels,
  // so the scene becomes its own map); a lit story link then goes on one tap,
  // since its line is already showing. Turned on, it stays on from room to room
  // for the visit (sessionStorage) until it's turned off or the tab is closed.
  // Pages with no door, and screens with a mouse, never see it.
  var last = 'mouse';
  document.addEventListener('pointerdown', function (e) { last = e.pointerType || 'mouse'; }, true);
  document.addEventListener('keydown', function () { last = 'keyboard'; }, true);
  var touch = !!(window.matchMedia && matchMedia('(hover: none)').matches);
  var doors = [], lit = false;
  var imgs = document.querySelectorAll('img[data-hover]');
  for (var i = 0; i < imgs.length; i++) {
    (function (img) {
      var off = img.getAttribute('src'), on = img.getAttribute('data-hover'), shown = false;
      new Image().src = on;
      var a = img.parentNode.tagName === 'A' ? img.parentNode : img;
      var linked = a !== img;
      function paint() { img.src = (shown || (lit && linked)) ? on : off; }
      function show(v) { shown = v; paint(); }
      if (linked) doors.push(paint);
      a.addEventListener('pointerover', function (e) { if (e.pointerType !== 'touch') show(true); });
      a.addEventListener('pointerout',  function (e) { if (e.pointerType !== 'touch') show(false); });
      a.addEventListener('focus', function () { if (last !== 'touch') show(true); });
      a.addEventListener('blur',  function () { show(false); });
      if (!linked) {
        img.addEventListener('click', function () { if (last === 'touch') show(!shown); });
      } else if (img.getAttribute('data-tap') === 'reveal') {
        a.addEventListener('click', function (e) {
          if (last === 'touch' && !shown && !lit) { e.preventDefault(); show(true); }
        });
      }
    })(imgs[i]);
  }
  if (touch && doors.length) {
    var KEY = 'dm-doors', doorBtn = document.createElement('button');
    doorBtn.type = 'button';
    doorBtn.className = 'dm-doors';
    var setLit = function (v, save) {
      lit = v;
      doorBtn.textContent = v ? 'Hide doors' : 'Show doors';
      doorBtn.setAttribute('aria-pressed', v ? 'true' : 'false');
      for (var j = 0; j < doors.length; j++) doors[j]();
      if (save) { try { if (v) sessionStorage.setItem(KEY, '1'); else sessionStorage.removeItem(KEY); } catch (e) {} }
    };
    doorBtn.addEventListener('click', function () { setLit(!lit, true); });
    btns.appendChild(doorBtn);
    var saved = false;
    try { saved = sessionStorage.getItem(KEY) === '1'; } catch (e) {}
    setLit(saved, false);
  }

  // Phones and small windows: shrink the whole screen to fit, never reflow it.
  // clientWidth/Height = the layout viewport (a phone's innerWidth reports the
  // zoomed-out screen and would never shrink). Screens up to 800px tall fit the
  // window both ways; taller pages fit the width and scroll. The 40px strip is
  // left out of the height. Pages marked dm-pan never shrink: they're explored.
  var W = +stage.getAttribute('data-w'), H = +stage.getAttribute('data-h'), STRIP = 40;
  // The row takes the first fit that keeps the note on ONE line beside the button
  // (12.5px, then 11px); failing both, the note drops under the button, centred,
  // and wraps, and the strip grows to hold it. Only narrow windows pay that height.
  function strip() {
    var tiers = ['', 'dm-bar-small', 'dm-bar-stack'], i;
    for (i = 0; i < tiers.length; i++) {
      bar.className = 'dm-bar' + (tiers[i] ? ' ' + tiers[i] : '');
      if (i === tiers.length - 1 || note.offsetHeight <= parseFloat(getComputedStyle(note).lineHeight) * 1.5) break;
    }
    STRIP = Math.max(40, Math.ceil(bar.offsetTop + bar.offsetHeight + 8));
    body.style.paddingTop = STRIP + 'px';
  }
  function fit() {
    strip();
    if (body.classList.contains('dm-pan')) { stage.style.zoom = 1; return; }
    var root = document.documentElement;
    var s = Math.min(1, root.clientWidth / W);
    if (H <= 800) s = Math.min(s, (root.clientHeight - STRIP) / H);
    if (s > 0.97) s = 1;   // a few pixels of scroll beats resampling the pixel art
    stage.style.zoom = s;
  }
  fit();
  window.addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);   // the note's height settles once Roboto Mono loads
})();

  // Where the visitor came from travels in the address, so one page can have
  // many ways in and its back arrow still returns to the right place.
  //   from = home|1-4        which Home page they started on
  //   via  = 1-3             which Instructions page (Superhero Shoes only)
  //   ret  = a page id from RET  which page sent them to a many-ways-in page (Frank, Discovery,
  //          Full of Stars, the Lagrangian Point, later Goliath + the Void)
  // Every value is checked against a fixed list; anything else is ignored and the
  // arrow falls back to its default. DM_BASE = this page's path up to web/datmavis/.
  (function () {
    var BASE = window.DM_BASE || '';
    var RET = { jupiter: 'planets/jupiter/', europa: 'planets/europa/', io: 'planets/io/',
      earth: 'planets/earth/', moon: 'planets/moon/', 'moon-dark': 'planets/moon/dark/',
      'clavius-1': 'planets/moon/clavius-base/1/', airlock: 'planets/moon/clavius-base/18/airlock/',
      flats: 'planets/moon/clavius-base/19/', 'star-child': 'planets/moon/tycho/7/',
      lagrangian: 'lagrangian-point/', 'century-city': 'lagrangian-point/century-city/',
      neighborhoods: 'lagrangian-point/century-city/neighborhoods/',
      frank: 'frank/' };
    var q = new URLSearchParams(location.search);
    var from = q.get('from'), via = q.get('via'), ret = q.get('ret');
    if (!/^(home|[1-4])$/.test(from || '')) from = null;
    if (!/^[1-3]$/.test(via || '')) via = null;
    if (!RET.hasOwnProperty(ret || '')) ret = null;
    function home() { return BASE + 'home/' + (from && from !== 'home' ? from + '/' : '') + 'index.html'; }
    function query(r) {
      var p = [];
      if (from) p.push('from=' + from);
      if (r) p.push('ret=' + r);
      return p;
    }
    var links = document.querySelectorAll('a[data-carry], a[data-back]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i], back = a.getAttribute('data-back'), href = a.getAttribute('href'), p;
      if (back === 'home') {
        if (from) href = home();
        a.setAttribute('href', href); continue;
      }
      if (back === 'ret') {
        if (ret) href = BASE + RET[ret] + 'index.html';
        else if (a.getAttribute('data-fallback') === 'home') { if (from) href = home(); a.setAttribute('href', href); continue; }
        p = query(null);
      } else if (back === 'instructions') {
        href = '../' + (via || '1') + '/index.html';
        p = query(null);
      } else {
        // a door: pass the notes along; data-ret names this page as the way back
        p = query(a.getAttribute('data-ret') || ret);
        if (a.getAttribute('data-via')) p.push('via=' + a.getAttribute('data-via'));
      }
      if (p.length) href += '?' + p.join('&');
      a.setAttribute('href', href);
    }
  })();
