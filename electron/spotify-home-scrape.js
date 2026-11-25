// Read the shelves on Spotify's web player home page: each section's heading and its playlist cards.
// Used by the desktop app (electron/spotifyAccount.cjs); a copy lives in the phone app's assets.
(function () {
  var out = [];
  var leafText = function (root) {
    return Array.prototype.slice.call(root.querySelectorAll('*'))
      .filter(function (e) { return !e.children.length; })
      .map(function (e) { return (e.textContent || '').trim(); })
      .filter(Boolean);
  };
  Array.prototype.forEach.call(document.querySelectorAll('section'), function (sec) {
    var h = sec.querySelector('h2, h3');
    var title = h ? (h.textContent || '').trim() : '';
    if (!title) return;
    var seen = {};
    var items = [];
    Array.prototype.forEach.call(sec.querySelectorAll('a[href*="/playlist/"]'), function (a) {
      var m = (a.getAttribute('href') || '').match(/\/playlist\/([A-Za-z0-9]+)/);
      if (!m || seen[m[1]]) return;
      var card = a.closest('[data-encore-id="card"], [role="group"], [data-testid*="card"], div[draggable="true"]') || a.parentElement;
      var name = (a.textContent || '').trim() || (card && (card.getAttribute('aria-label') || '')) || '';
      var texts = card ? leafText(card) : [];
      if (!name) name = texts[0] || '';
      if (!name) return;
      seen[m[1]] = true;
      var img = card ? card.querySelector('img') : null;
      var sub = texts.filter(function (t) { return t !== name && t.length < 300; })[0] || '';
      items.push({ id: m[1], title: name, subtitle: sub, thumbnail: img ? (img.currentSrc || img.src || '') : '' });
    });
    if (items.length) out.push({ title: title, items: items });
  });
  return JSON.stringify(out);
})()
