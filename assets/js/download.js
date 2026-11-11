/* Download page: read latest.json and wire the button to the current build. */
(function () {
  "use strict";
  var btn = document.querySelector("[data-download]");
  var ver = document.querySelector("[data-version]");
  var avail = document.querySelector("[data-availability]");
  if (!btn) return;

  function mb(bytes) { return bytes ? " · " + (bytes / 1048576).toFixed(0) + " MB" : ""; }

  fetch("latest.json?" + Date.now(), { cache: "no-store" }).then(function (r) {
    if (!r.ok) throw 0; return r.json();
  }).then(function (m) {
    if (m.available && m.url) {
      btn.href = m.url;
      btn.textContent = "Download for Windows";
      btn.setAttribute("download", "");
      ver.textContent = "Version " + m.version + " · Windows 10 & 11 · 64-bit" + mb(m.size);
      avail.textContent = "";
    } else {
      // No public build yet: send people to sign up so they're ready on day one.
      btn.href = "signup.html";
      btn.textContent = "Create a free account";
      ver.textContent = "Windows 10 & 11 · 64-bit";
      avail.textContent = (m.notes || "The Windows download opens shortly.") +
        " Create your account now and you're ready the moment it's live.";
      var ss = document.querySelector("[data-smartscreen]");
      if (ss) ss.hidden = true;
    }
  }).catch(function () {
    btn.href = "signup.html";
    btn.textContent = "Create a free account";
    if (avail) avail.textContent = "The Windows download opens shortly.";
  });
})();
