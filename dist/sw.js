if (!self.define) {
  let e,
    i = {};
  const s = (s, n) => (
    (s = new URL(s + ".js", n).href),
    i[s] ||
      new Promise((i) => {
        if ("document" in self) {
          const e = document.createElement("script");
          ((e.src = s), (e.onload = i), document.head.appendChild(e));
        } else ((e = s), importScripts(s), i());
      }).then(() => {
        let e = i[s];
        if (!e) throw new Error(`Module ${s} didn’t register its module`);
        return e;
      })
  );
  self.define = (n, r) => {
    const o =
      e ||
      ("document" in self ? document.currentScript.src : "") ||
      location.href;
    if (i[o]) return;
    let c = {};
    const t = (e) => s(e, o),
      l = { module: { uri: o }, exports: c, require: t };
    i[o] = Promise.all(n.map((e) => l[e] || t(e))).then((e) => (r(...e), c));
  };
}
define(["./workbox-8c29f6e4"], function (e) {
  "use strict";
  (self.skipWaiting(),
    e.clientsClaim(),
    e.precacheAndRoute(
      [
        {
          url: "service-worker-push.js",
          revision: "45c6ef365ca5848c6415d681a1218949",
        },
        { url: "index.html", revision: "2cb1d4437bca7a64b0a225c5f49e2d55" },
        { url: "assets/workbox-window.prod.es5-BIl4cyR9.js", revision: null },
        { url: "assets/index-NUijvxDf.css", revision: null },
        { url: "assets/index-DGX9AoUR.js", revision: null },
        {
          url: "apple-touch-icon.png",
          revision: "c99affc6a0bd0fe88da82afc23e78884",
        },
        { url: "favicon.svg", revision: "6c9d2825d7f1e7f384560c47e5f32380" },
        { url: "pwa-192.png", revision: "c99affc6a0bd0fe88da82afc23e78884" },
        { url: "pwa-512.png", revision: "da00f786121a1e8c7c1412c5795a6f52" },
        {
          url: "manifest.webmanifest",
          revision: "d588b6c717a7afbc472cd0b89a1003bd",
        },
      ],
      {},
    ),
    e.cleanupOutdatedCaches(),
    e.registerRoute(
      new e.NavigationRoute(e.createHandlerBoundToURL("index.html")),
    ));
});
