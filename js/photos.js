/* 写真の差し込み：assets/photos/ に写真を入れると、data-src の場所に自動で表示される。
   無い写真は、イラストなどの代わりの表示のまま。アドレスの最後に ?photos を付けると、点線の枠で場所が分かる。 */
(function () {
  "use strict";
  var edit = /[?&]photos(\b|=)/.test(location.search);
  if (edit) document.documentElement.classList.add("photo-edit");

  var slots = Array.prototype.slice.call(document.querySelectorAll("[data-src]"));
  var pending = slots.length;

  function done() {
    if (--pending > 0) return;
    document.querySelectorAll("[data-gallery]").forEach(function (g) {
      var any = g.querySelector(".ph.has-photo");
      g.dataset.count = g.querySelectorAll(".ph.has-photo").length;
      var box = g.closest(".dev");
      if (!any && !edit && box) box.hidden = true;
    });
  }

  slots.forEach(function (el) {
    var src = el.dataset.src, vid = el.dataset.video;
    var ok = function (kind) {
      el.classList.add("has-photo");
      if (el.tagName === "FIGURE") {
        var node;
        if (kind === "video") {
          node = document.createElement("video");
          node.src = vid; node.muted = true; node.loop = true; node.autoplay = true; node.playsInline = true; node.setAttribute("aria-label", el.dataset.alt || "");
          node.play && node.play().catch(function () {});
        } else {
          node = document.createElement("img");
          node.src = src; node.alt = el.dataset.alt || ""; node.loading = "lazy"; node.decoding = "async";
        }
        el.insertBefore(node, el.firstChild);
      } else {
        el.style.setProperty("--ph", 'url("' + src + '")');
      }
    };
    var bad = function () { el.classList.add("no-photo"); if (el.classList.contains("ph") && !edit && el.closest("[data-gallery]")) el.hidden = true; };
    var tryImage = function () {
      var im = new Image();
      im.onload = function () { ok("image"); done(); };
      im.onerror = function () { bad(); done(); };
      im.src = src;
    };
    if (vid) {
      var v = document.createElement("video");
      v.muted = true; v.preload = "metadata";
      v.onloadedmetadata = function () { ok("video"); done(); };
      v.onerror = function () { tryImage(); };
      v.src = vid;
    } else tryImage();
  });
  if (!slots.length) done = function () {};
})();
