/* DatMavis.com — one script for every page.
   Each page sets DM_BASE (its path up to web/datmavis/) and loads this file.
   Change something here and every page picks it up on the next push. */
(function () {
  var BASE = window.DM_BASE || '';
  var body = document.body, stage = document.getElementById('stage');

  // The way out: "<- Web Design", in the clear strip above the art.
  var exit = document.createElement('a');
  exit.className = 'exit';
  exit.href = BASE + '../../web.html';
  exit.textContent = '\u2190 Web Design';
  body.insertBefore(exit, body.firstChild);

  // Rollovers: every slice with a drawn hover state swaps on mouse-over,
  // and on keyboard focus of its link. Hover states are preloaded.
  var imgs = document.querySelectorAll('img[data-hover]');
  for (var i = 0; i < imgs.length; i++) {
    (function (img) {
      var off = img.getAttribute('src'), on = img.getAttribute('data-hover');
      new Image().src = on;
      var a = img.parentNode.tagName === 'A' ? img.parentNode : img;
      a.addEventListener('mouseover', function () { img.src = on; });
      a.addEventListener('mouseout',  function () { img.src = off; });
      a.addEventListener('focus',     function () { img.src = on; });
      a.addEventListener('blur',      function () { img.src = off; });
    })(imgs[i]);
  }

  // Phones and small windows: shrink the whole screen to fit, never reflow it.
  // clientWidth/Height = the layout viewport (a phone's innerWidth reports the
  // zoomed-out screen and would never shrink). Screens up to 800px tall fit the
  // window both ways; taller pages fit the width and scroll. The 40px strip is
  // left out of the height. Pages marked dm-pan never shrink: they're explored.
  var W = +stage.getAttribute('data-w'), H = +stage.getAttribute('data-h'), STRIP = 40;
  function fit() {
    if (body.classList.contains('dm-pan')) { stage.style.zoom = 1; return; }
    var root = document.documentElement;
    var s = Math.min(1, root.clientWidth / W);
    if (H <= 800) s = Math.min(s, (root.clientHeight - STRIP) / H);
    if (s > 0.97) s = 1;   // a few pixels of scroll beats resampling the pixel art
    stage.style.zoom = s;
  }
  fit();
  window.addEventListener('resize', fit);
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
      neighborhoods: 'lagrangian-point/century-city/neighborhoods/' };
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
