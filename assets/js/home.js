/* Home page interactions: pixel workbench, example runs, app tour, Coin calculator, pricing. */
(function () {
  "use strict";

  var DATA = window.MCA_PLANS || { plans: [], features: {} };
  var cfg = window.MCA_CONFIG || {};
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function fmt(n) { return window.MCA.formatTokens(n); }

  /* ================================================== pixel workbench */
  /* Workbench sprites (16 x 16, "." = transparent). The active theme from the
     admin panel picks one; Classic shows the MyCraftingAI app icon. */
  var SEASON_ART = {
    classic: {
      file: "mycraftingai.png",
      colors: { B: "#4f63f5", L: "#6376ff", H: "#8aa0ff", D: "#3342c2", k: "#1a1f5c", W: "#ffffff", e: "#dfe4ff", c: "#a9b6ff" },
      art: [
        "..kkkkkkkkkkkk..",
        ".kHHHHHHHHHHHHk.",
        "kLBBBBBBBBBBBBDk",
        "kLBBBBBWWBBBBBDk",
        "kLBBBBBWeBBBBBDk",
        "kLBBBBBWWBBBBBDk",
        "kLBBBBBWeBBBBBDk",
        "kLBWWWWccWWWWBDk",
        "kLBWeWeccWeWeBDk",
        "kLBBBBBWWBBBBBDk",
        "kLBBBBBWeBBBBBDk",
        "kLBBBBBWWBBBBBDk",
        "kLBBBBBWeBBBBBDk",
        "kLBBBBBBBBBBBBDk",
        ".kDDDDDDDDDDDDk.",
        "..kkkkkkkkkkkk.."
      ]
    },
    halloween: {
      file: "jack_o_lantern.png",
      colors: { s: "#3e7a2a", S: "#2a5a1c", o: "#ff8a1a", O: "#e0650a", d: "#a8440a", D: "#6e2a06", y: "#ffd23f", Y: "#fff1a8", k: "#1a0d05" },
      art: [
        "................",
        ".......SS.......",
        "........sS......",
        "....DOOssOOD....",
        "..DOOooOOooOOD..",
        ".DOooooOOoooooD.",
        ".OooyooOOooyooO.",
        "DOoyyyoOOoyyyooD",
        "DOyYYYyOOyYYYyoD",
        "DOoooooOOoooooOD",
        "DOoyoyyyyyyoyooD",
        "DOoyyyYYYYyyyooD",
        ".DOooyykkyyooOD.",
        ".DdOoooOOooooOd.",
        "..DdOOOOOOOOdD..",
        "....DDDDDDDD...."
      ]
    },
    black_friday: {
      file: "sale_tag.png",
      colors: { k: "#2a2008", g: "#e8b92f", G: "#b8891a", l: "#ffe27a", w: "#ffffff", d: "#111111", s: "#8a8a8a" },
      art: [
        "................",
        "................",
        "................",
        "...ss...........",
        "..s.kkkkkkkkkkk.",
        ".s.kglllllllllk.",
        ".skggggddggdggk.",
        ".ksggggddgdgggk.",
        "kggkgggggdggggk.",
        ".ksgggggdgddggk.",
        "..kggggdggddggk.",
        "...kgGGGGGGGGGk.",
        "....kkkkkkkkkkk.",
        "................",
        "................",
        "................"
      ]
    },
    cyber_monday: {
      file: "power_bolt.png",
      colors: { c: "#14c8e0", C: "#0b8ea1", l: "#a6f3fb", w: "#ffffff", p: "#ec4899", P: "#9d174d", k: "#06222a" },
      art: [
        ".........kkkkk..",
        "........kclwck..",
        ".......kcllck...",
        "......kcllck....",
        ".....kcllck.....",
        "....kcllcCkkkk..",
        "...kcllllllwck..",
        "..kclllllllck...",
        "..kkkkCcllck....",
        "......kcllk..p..",
        ".....kcllk..ppp.",
        "....kclck....p..",
        "...kclck..p.....",
        "..kcCk...ppp....",
        "..kkk.....p.....",
        "................"
      ]
    },
    autumn: {
      file: "maple_leaf.png",
      colors: { r: "#d9622b", R: "#a8401a", o: "#f0a23a", y: "#ffd27a", b: "#6e3a14", k: "#3a1a08" },
      art: [
        ".......k........",
        "......kok.......",
        "..k...kok...k...",
        "..kok.krok.kok..",
        "...kokrrrokok...",
        ".kkkorrbrrook...",
        "kooorrrbrrrrok..",
        ".korrrrbrrrrook.",
        "..korRrbrRrrk...",
        "...kRRrbrRRk....",
        "..kRRRrbrRRRk...",
        ".kkkkkRbRkkkk...",
        "......kbk.......",
        ".......bk.......",
        ".......b........",
        "................"
      ]
    },
    christmas: {
      file: "snowy_tree.png",
      colors: { y: "#ffd23f", Y: "#fff1a8", g: "#2fae66", G: "#1f6b34", w: "#f4f8ff", W: "#cfe3ff", r: "#d93a3a", b: "#4da3e8", t: "#7a4a24", T: "#5a3418" },
      art: [
        ".......Yy.......",
        "......yYYy......",
        ".......yy.......",
        ".......Gg.......",
        "......wwwg......",
        ".....GggrgG.....",
        "....wwwwwwgG....",
        "....GgbgggggG...",
        "...wwwwwwwwgG...",
        "...GggggrggbgG..",
        "..wwwwwwwwwwwgG.",
        "..GgrggbgggrgggG",
        ".......tT.......",
        ".W.....tT....W..",
        "wwwWwwwwwwwwWwww",
        "WWWWWWWWWWWWWWWW"
      ]
    },
    winter: {
      file: "snowman.png",
      colors: { w: "#f4f8ff", W: "#b8cfe8", k: "#1c2433", o: "#f08a24", r: "#d93a3a", R: "#9e2626", h: "#2a2f3a", b: "#7a4a24", f: "#9ccbf3" },
      art: [
        "..f.....hhh...f.",
        "......hhhhh.....",
        ".....hhhhhhh....",
        "......wwwww...f.",
        ".f...wkwwkW.....",
        ".....wwoowW.....",
        "......wwwW......",
        ".....RrrrrrR....",
        "....wwwRwwwWb...",
        "..b.wwwrkwwWb.f.",
        "...bwwwwwwwWb...",
        ".f..wwwwkwwW....",
        "...wwwwwwwwwW...",
        "...wwwwwkwwwW...",
        "....WwwwwwwW....",
        "..WWWWWWWWWWWW.."
      ]
    },
    new_year: {
      file: "firework.png",
      colors: { p: "#9b5cf6", P: "#c9a9ff", y: "#e8b92f", Y: "#fff1a8", w: "#ffffff", c: "#14c8e0", r: "#e64a86" },
      art: [
        ".......y........",
        "..p....y....c...",
        "...p...Y...c....",
        "....P..y..c.....",
        ".y...P.Y.c...r..",
        "..y...PwPc..r...",
        "...yYYwwwYYrr...",
        "yyyYYwwYwwYYyyy.",
        "...rrYwwwYYyy...",
        "..r...cwPP..y...",
        ".r...c.Y.P...y..",
        "....c..y..P.....",
        "...c...Y...p....",
        "..c....y....p...",
        ".......y........",
        "................"
      ]
    },
    valentines: {
      file: "heart.png",
      colors: { k: "#4a0e24", r: "#e64a86", R: "#b8305e", p: "#f59bbe", w: "#ffffff" },
      art: [
        "................",
        "................",
        "..kkkk....kkkk..",
        ".krrrrk..krrrrk.",
        "krwprrrkkrrrrrRk",
        "krpprrrrrrrrrrRk",
        "krprrrrrrrrrrrRk",
        "krrrrrrrrrrrrrRk",
        ".krrrrrrrrrrrRk.",
        "..krrrrrrrrrRk..",
        "...krrrrrrrRk...",
        "....krrrrrRk....",
        ".....krrrRk.....",
        "......krRk......",
        ".......kk.......",
        "................"
      ]
    },
    spring: {
      file: "tulip.png",
      colors: { p: "#f48fb1", P: "#d6457c", l: "#ffd0e0", g: "#3fbf7f", G: "#2a8a5a", y: "#ffd23f", k: "#4a1a2c" },
      art: [
        "................",
        ".....k.kk.k.....",
        "....kpkllkpk....",
        "....kplplppk....",
        "....kppplppk....",
        "....kPpppppk....",
        ".....kPPPPk.....",
        "......kGgk......",
        "..kk...gG...kk..",
        "..kgk..gG..kgk..",
        "...kgk.gG.kgk...",
        "....kgkgGkgk....",
        ".....kgggGk.....",
        "......kgGk......",
        ".......gG.......",
        "................"
      ]
    },
    easter: {
      file: "easter_egg.png",
      colors: { k: "#3a2a5a", v: "#a78bfa", V: "#7458d6", y: "#fde047", Y: "#e0b800", w: "#ffffff", p: "#f59bbe", g: "#8fe0b5" },
      art: [
        "................",
        "......kkkk......",
        ".....kwvvvk.....",
        "....kwvvvvVk....",
        "....kvvvvvVk....",
        "...kyyyyyyyYk...",
        "...kpypypypYk...",
        "...kvvvvvvvVk...",
        "...kggggggggk...",
        "...kvgvvgvvVk...",
        "...kvvvvvvvVk...",
        "...kyyyyyyyYk...",
        "....kvvvvvVk....",
        "....kVvvvVVk....",
        ".....kkkkkk.....",
        "................"
      ]
    },
    summer: {
      file: "watermelon.png",
      colors: { r: "#f25c6b", R: "#c93a4a", k: "#2a1418", g: "#3fbf7f", G: "#2a8a5a", w: "#e8f8e0", d: "#1a0a0e", y: "#ffd27a" },
      art: [
        "................",
        "................",
        "................",
        "kkkkkkkkkkkkkkkk",
        "krrrrrrrrrrrrrRk",
        ".krrdrrrrrdrrRk.",
        ".krrrrrrdrrrrRk.",
        "..krrdrrrrrdRk..",
        "..krrrrrrrrrRk..",
        "...krrrdrrrRk...",
        "...kwwwwwwwwk...",
        "....kgggggGk....",
        ".....kGGGGk.....",
        "......kkkk......",
        "................",
        "................"
      ]
    }
  };

  function workbench() {
    var grid = $("#pixel-grid");
    if (!grid) return;
    var SIZE = 16;
    // Extra swatches when a sprite uses fewer than ten colours.
    var EXTRA_COLOURS = ["#ffffff", "#1a1a22", "#5e5e5e", "#9c6b3c", "#3dd68c", "#8aa0ff", "#f2555a", "#f5b74a", "#4f63f5", "#b79cff"];
    var PALETTE = EXTRA_COLOURS;
    var pixels = [];
    var colour = PALETTE[0];
    var season = "";      // theme whose sprite is on the canvas
    var dirty = false;    // the visitor painted: don't swap their drawing away
    var tool = "pencil";
    var mirror = false;
    var painting = false;
    var erasing = false;

    function activeTheme() {
      var theme = document.documentElement.getAttribute("data-theme") || "classic";
      return SEASON_ART[theme] ? theme : "classic";
    }

    /** The sprite for the active theme (the MyCraftingAI icon for Classic). */
    function sprite() {
      var spec = SEASON_ART[activeTheme()];
      var used = [], art = [];
      spec.art.forEach(function (row) {
        for (var x = 0; x < SIZE; x++) {
          var c = row.charAt(x) === "." ? null : spec.colors[row.charAt(x)];
          art.push(c || null);
          if (c && used.indexOf(c) < 0) used.push(c);
        }
      });
      // Swatches: the sprite's own colours, most-used first, topped up to ten.
      used.sort(function (a, b) {
        return art.filter(function (c) { return c === b; }).length - art.filter(function (c) { return c === a; }).length;
      });
      PALETTE = used.concat(EXTRA_COLOURS.filter(function (c) { return used.indexOf(c) < 0; })).slice(0, 10);
      return art;
    }

    function fileName() {
      var spec = SEASON_ART[activeTheme()];
      return spec.file;
    }

    for (var i = 0; i < SIZE * SIZE; i++) {
      var cell = document.createElement("div");
      cell.className = "px";
      cell.dataset.i = i;
      grid.appendChild(cell);
    }
    var cells = $$(".px", grid);

    function render() {
      cells.forEach(function (cell, index) { cell.style.background = pixels[index] || ""; });
      ["#preview-hand", "#preview-1x", "#preview-2x", "#preview-4x"].forEach(function (id) {
        var canvas = $(id);
        if (!canvas) return;
        var ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, SIZE, SIZE);
        pixels.forEach(function (c, index) {
          if (!c) return;
          ctx.fillStyle = c;
          ctx.fillRect(index % SIZE, Math.floor(index / SIZE), 1, 1);
        });
      });
    }

    function put(index, value) {
      pixels[index] = value;
      if (mirror) {
        var x = index % SIZE, y = Math.floor(index / SIZE);
        pixels[y * SIZE + (SIZE - 1 - x)] = value;
      }
    }

    function flood(index, value) {
      var target = pixels[index] || null;
      if (target === value) return;
      var stack = [index];
      while (stack.length) {
        var at = stack.pop();
        if ((pixels[at] || null) !== target) continue;
        pixels[at] = value;
        var x = at % SIZE, y = Math.floor(at / SIZE);
        if (x > 0) stack.push(at - 1);
        if (x < SIZE - 1) stack.push(at + 1);
        if (y > 0) stack.push(at - SIZE);
        if (y < SIZE - 1) stack.push(at + SIZE);
      }
    }

    function apply(target) {
      if (!target || !target.classList.contains("px")) return;
      var index = Number(target.dataset.i);
      var value = erasing || tool === "eraser" ? null : colour;
      if (tool === "fill" && !erasing) flood(index, value);
      else put(index, value);
      dirty = true;
      render();
    }

    grid.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    grid.addEventListener("pointerdown", function (e) {
      painting = true;
      erasing = e.button === 2;
      grid.setPointerCapture(e.pointerId);
      apply(document.elementFromPoint(e.clientX, e.clientY));
    });
    grid.addEventListener("pointermove", function (e) {
      if (!painting || tool === "fill") return;
      apply(document.elementFromPoint(e.clientX, e.clientY));
    });
    ["pointerup", "pointercancel"].forEach(function (ev) {
      grid.addEventListener(ev, function () { painting = false; erasing = false; });
    });

    function setTool(name) {
      if (name === "mirror") {
        mirror = !mirror;
        $('[data-tool="mirror"]').setAttribute("aria-pressed", String(mirror));
        return;
      }
      tool = name;
      $$("[data-tool]").forEach(function (b) {
        if (b.dataset.tool !== "mirror") b.setAttribute("aria-pressed", String(b.dataset.tool === name));
      });
    }
    $$("[data-tool]").forEach(function (b) { b.addEventListener("click", function () { setTool(b.dataset.tool); }); });
    $('[data-action="reset"]').addEventListener("click", function () { load(); });

    var palette = $("#palette");
    function buildPalette() {
      $$(".swatch", palette).forEach(function (s) { s.remove(); });
      PALETTE.slice().reverse().forEach(function (c) {
        var sw = document.createElement("button");
        sw.type = "button";
        sw.className = "swatch";
        sw.style.background = c;
        sw.title = c;
        sw.setAttribute("aria-label", "Colour " + c);
        sw.setAttribute("aria-pressed", String(c === colour));
        sw.addEventListener("click", function () {
          colour = c;
          if (tool === "eraser") setTool("pencil");
          $$(".swatch", palette).forEach(function (s) { s.setAttribute("aria-pressed", String(s === sw)); });
        });
        palette.insertBefore(sw, palette.firstChild);
      });
    }

    /** Put the active theme's sprite on the canvas (file name and swatches too). */
    function load() {
      season = activeTheme();
      pixels = sprite();
      colour = PALETTE[0];
      dirty = false;
      var title = $(".bench-title b");
      if (title) title.textContent = fileName();
      grid.setAttribute("aria-label", "16 by 16 pixel canvas: " + fileName().replace(/\.png$/, "").replace(/_/g, " "));
      buildPalette();
      render();
    }

    // The admin switched the theme (or the fresh answer differs from the cache).
    document.addEventListener("mca:look", function () {
      if (activeTheme() !== season && !dirty) load();
    });

    document.addEventListener("keydown", function (e) {
      if (/input|textarea|select/i.test(e.target.tagName) || e.ctrlKey || e.metaKey) return;
      var map = { p: "pencil", e: "eraser", f: "fill", m: "mirror" };
      var name = map[e.key.toLowerCase()];
      if (name && grid.getBoundingClientRect().top < innerHeight) setTool(name);
    });

    load();
  }

  /* ===================================================== example runs */
  var RUNS = [
    {
      title: "Add a ruby sword with 9 attack damage",
      note: "item + texture",
      steps: [
        "Read 6 project files",
        "Read the NeoForge 1.21.1 guides for items and tools",
        "Planned a sword tier repaired with rubies",
        "Wrote item/RubySword.java",
        "Registered it in ModItems.java",
        "Painted textures/item/ruby_sword.png (16 x 16)",
        "Compiled with Gradle",
        "Launched the game - mod loaded"
      ],
      files: [["J", "item/RubySword.java", "new", "+31"], ["J", "ModItems.java", "edited", "+4"], ["png", "item/ruby_sword.png", "new", "16 x 16"], ["{}", "models/item/ruby_sword.json", "new", "+6"]],
      usage: ["12,480 in", "3,912 out", "68% cached", "8.4s"]
    },
    {
      title: "Copper lamps that glow brighter when powered",
      note: "block + blockstate",
      steps: [
        "Read 9 project files",
        "Planned a POWER property (0-15) mapped to light level",
        "Wrote block/CopperLampBlock.java",
        "Wrote blockstates/copper_lamp.json",
        "Painted lamp textures: off and lit",
        "Auto-Healer added a missing import - no Coins used",
        "Compiled with Gradle",
        "Launched the game - mod loaded"
      ],
      files: [["J", "block/CopperLampBlock.java", "new", "+58"], ["J", "ModBlocks.java", "edited", "+6"], ["{}", "blockstates/copper_lamp.json", "new", "+18"], ["png", "block/copper_lamp_on.png", "new", "16 x 16"]],
      usage: ["21,904 in", "6,210 out", "71% cached", "14.2s"]
    },
    {
      title: "A swamp frog that drops slime balls",
      note: "entity + loot table",
      steps: [
        "Read 7 project files",
        "Looked up the NeoForge 1.21.1 entity classes",
        "Planned a frog variant with its own loot table",
        "Wrote entity/SwampFrog.java",
        "Wrote loot_table/entities/swamp_frog.json",
        "Painted a 64 x 64 entity skin",
        "Compiled with Gradle",
        "Launched the game - mod loaded"
      ],
      files: [["J", "entity/SwampFrog.java", "new", "+74"], ["J", "ModEntities.java", "edited", "+9"], ["{}", "loot_table/entities/swamp_frog.json", "new", "+22"], ["png", "entity/swamp_frog.png", "new", "64 x 64"]],
      usage: ["18,377 in", "5,044 out", "64% cached", "12.9s"]
    }
  ];

  function exampleRuns() {
    var list = $("#prompt-list"), body = $("#demo-body"), state = $("#demo-state");
    if (!list) return;
    var timer = null;
    var started = false;

    function play(index) {
      var run = RUNS[index];
      clearTimeout(timer);
      $$(".prompt-btn", list).forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === index)); });
      body.innerHTML =
        '<div class="msg-user"></div>' +
        '<div class="msg-ai"><div class="av"><svg width="15" height="15" viewBox="0 0 24 24"><path fill="#fff" d="M12 2.6l2.1 7.3 7.3 2.1-7.3 2.1L12 21.4l-2.1-7.3L2.6 12l7.3-2.1z"/></svg></div>' +
        '<ol class="steps"></ol></div>' +
        '<div class="files"><div class="files-head"><span>' + run.files.length + ' files changed</span><span class="plus">' +
        run.files.filter(function (f) { return f[3].charAt(0) === "+"; }).reduce(function (sum, f) { return sum + Number(f[3].slice(1)); }, 0) +
        " lines</span></div>" +
        run.files.map(function (f) {
          var cls = f[0] === "png" ? "png" : (f[0] === "{}" ? "json" : "");
          return '<div class="file-row"><span class="badge ' + cls + '">' + (f[0] === "png" ? "" : f[0]) + "</span>" + f[1] +
            '<span class="n">' + (f[3].charAt(0) === "+" ? f[3] : "") + '</span><span class="s">' + (f[3].charAt(0) === "+" ? f[2] : f[2] + " &middot; " + f[3]) + "</span></div>";
        }).join("") + "</div>" +
        '<div class="usage-row" style="opacity:0;transition:opacity .3s">Usage &nbsp; ' + run.usage[0] + " &middot; " + run.usage[1] +
        ' &middot; <span class="ok">' + run.usage[2] + "</span> &middot; " + run.usage[3] + "</div>";
      $(".msg-user", body).textContent = run.title + ".";
      var steps = $(".steps", body);
      run.steps.forEach(function (text) {
        var li = document.createElement("li");
        li.innerHTML = '<span class="st">&#9680;</span><span></span>';
        li.lastChild.textContent = text;
        steps.appendChild(li);
      });
      var items = $$("li", steps);
      var at = 0;
      state.textContent = "Working...";
      function next() {
        if (at > 0) { items[at - 1].classList.add("done"); items[at - 1].firstChild.innerHTML = "&#10003;"; }
        if (at < items.length) {
          items[at].classList.add("shown");
          at += 1;
          timer = setTimeout(next, at === items.length ? 700 : 520);
        } else {
          $(".files", body).classList.add("shown");
          $(".usage-row", body).style.opacity = "1";
          state.textContent = "Done - example run";
        }
      }
      timer = setTimeout(next, 350);
    }

    RUNS.forEach(function (run, index) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "prompt-btn";
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = "<span></span><small>" + run.note + "</small>";
      b.firstChild.textContent = "“" + run.title + "”";
      b.addEventListener("click", function () { play(index); });
      list.appendChild(b);
    });

    // Start the first run when the section scrolls into view (once).
    var section = $("#demo");
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries, obs) {
        if (entries[0].isIntersecting && !started) { started = true; play(0); obs.disconnect(); }
      }, { threshold: 0.35 }).observe(section);
    } else { play(0); }
  }

  /* ============================================================ tour */
  function tour() {
    var img = $("#tour-img");
    if (!img) return;
    var tabs = $$(".tour-tab");
    function select(tab) {
      tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t === tab)); });
      img.style.opacity = "0";
      setTimeout(function () {
        img.src = tab.dataset.shot;
        img.alt = tab.dataset.alt;
        img.onload = function () { img.style.opacity = "1"; };
      }, 150);
    }
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () { select(tab); });
      tab.addEventListener("keydown", function (e) {
        var i = tabs.indexOf(tab);
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); tabs[(i + 1) % tabs.length].focus(); select(tabs[(i + 1) % tabs.length]); }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); tabs[(i + tabs.length - 1) % tabs.length].focus(); select(tabs[(i + tabs.length - 1) % tabs.length]); }
      });
    });
    tabs.slice(1).forEach(function (t) { var pre = new Image(); pre.src = t.dataset.shot; });
  }

  /* ================================================= live catalogue */
  /* plans.js is the built-in copy; the live catalogue (admin panel "Plans &
     pricing") replaces it as soon as /v1/public/pricing answers. */
  function normalise(data) {
    var features = data.features || {};
    if (!Array.isArray(features)) {
      features = Object.keys(features).map(function (id) { return { id: id, label: features[id] }; });
    }
    return { plans: data.plans || [], features: features, topup: data.topup || {}, yearly: data.yearly || null,
             coins: data.coins || null };
  }
  DATA = normalise(DATA);
  function planById(id) { return DATA.plans.filter(function (p) { return p.id === id; })[0]; }
  function money(cents) { return "$" + (Math.round(cents) / 100).toFixed(2); }
  function esc(text) { return window.MCA.escapeHtml(String(text == null ? "" : text)); }
  function monthlyOf(plan) { return plan.period === "month" ? plan.monthlyCoins : null; }
  function dollars(value) { return "$" + Number(value).toFixed(2); }
  /** ``2,000`` / ``26,400`` / ``12.5`` - an amount of Coins. */
  function coinsFmt(n) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 }); }

  /* ================================================== yearly billing */
  /* Yearly = monthly price x 12, minus the yearly discount (10%), with the 12
     months of Coins plus a bonus (10%). The live catalogue sends the server's
     own terms per plan (``plan.yearly``, null when it's off); the built-in
     plans.js copy is priced here with the same rule. */
  var BILLING = "month";
  try {
    if (/[?&]billing=year/.test(location.search) || localStorage.getItem("mca.billing") === "year") BILLING = "year";
  } catch (e) { /* storage blocked: monthly */ }

  function yearlyConfig() {
    var y = DATA.yearly || {};
    return { enabled: y.enabled !== false,
             discountPercent: y.discountPercent != null ? Number(y.discountPercent) : 10,
             bonusCoinsPercent: y.bonusCoinsPercent != null ? Number(y.bonusCoinsPercent) : 10 };
  }
  function yearlyOf(plan) {
    if (!plan || plan.period !== "month" || !plan.price) return null;
    if (plan.yearly !== undefined) return plan.yearly;
    var y = yearlyConfig();
    if (!y.enabled) return null;
    var fullCents = Math.round(plan.price * 100) * 12;
    var priceCents = Math.round(fullCents * (100 - y.discountPercent) / 100);
    var baseCoins = plan.monthlyCoins * 12;
    var coins = Math.round(baseCoins * (100 + y.bonusCoinsPercent) / 100);
    return { price: priceCents / 100, priceCents: priceCents, fullPriceCents: fullCents,
             savingsCents: fullCents - priceCents, discountPercent: y.discountPercent,
             perMonthCents: Math.round(priceCents / 12), coins: coins, baseCoins: baseCoins,
             bonusCoins: coins - baseCoins, bonusCoinsPercent: y.bonusCoinsPercent };
  }
  function yearlyAvailable() { return DATA.plans.some(function (p) { return !!yearlyOf(p); }); }
  /** The billing period the visitor is looking at: "month" or "year". */
  function billing() { return BILLING === "year" && yearlyAvailable() ? "year" : "month"; }
  /** The plan's yearly terms while yearly billing is shown, else null. */
  function shownYearly(plan) { return billing() === "year" ? yearlyOf(plan) : null; }
  function pct(n) { return String(Math.round(Number(n) * 10) / 10); }

  function syncBillingToggle() {
    var box = $("#billing-toggle");
    var current = billing();
    if (box) {
      box.hidden = !yearlyAvailable();
      $$("[data-billing]", box).forEach(function (b) {
        var on = b.dataset.billing === current;
        b.setAttribute("aria-checked", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
      var first = DATA.plans.map(yearlyOf).filter(Boolean)[0];
      var save = $("#billing-save");
      if (save && first) save.textContent = "Save " + pct(first.discountPercent) + "%";
    }
    $$("#billing-facts [data-for]").forEach(function (el) { el.hidden = el.dataset.for !== current; });
  }
  function setBilling(value) {
    BILLING = value === "year" ? "year" : "month";
    try { localStorage.setItem("mca.billing", BILLING); } catch (e) { /* not remembered */ }
    renderPlans();
    renderCompare();
    applyPromo();
    if (calcUpdate) calcUpdate();
  }
  function billingToggle() {
    var box = $("#billing-toggle");
    if (!box) return;
    box.addEventListener("click", function (e) {
      var button = e.target.closest("[data-billing]");
      if (button) setBilling(button.dataset.billing);
    });
    box.addEventListener("keydown", function (e) {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) < 0) return;
      e.preventDefault();
      setBilling(billing() === "year" ? "month" : "year");
      var on = $('[aria-checked="true"]', box);
      if (on) on.focus();
    });
  }

  /** Customer price that leaves ``priceCents`` after Dodo's fee: (base + fixed) / (1 - percent), half-up. */
  function grossCents(priceCents, t) {
    if (priceCents <= 0) return 0;
    var keep = 1 - Number(t.feePercent) / 100;
    // Work in hundredths of a cent first so 562.5 rounds up like the server's Decimal maths.
    var exact = (priceCents + Math.round(Number(t.feeFixed) * 100)) / keep;
    return Math.floor(Math.round(exact * 100) / 100 + 0.5);
  }

  /** Same formula as the server (app/core/plans.py quote): pack price if it matches, else the base rate. */
  function quote(coins) {
    var t = DATA.topup;
    var baseCents = Math.round(coins / 1000 * Math.round(t.pricePer1000Coins * 100));
    var pack = (t.packs || []).filter(function (p) { return Number(p.coins) === coins; })[0];
    if (pack && pack.totalCents != null) {  // the live catalogue sends the server's own quote
      return { coins: coins, baseCents: pack.baseCents, priceCents: pack.priceCents, feeCents: pack.feeCents,
               totalCents: pack.totalCents, discount: pack.discountPercent || 0 };
    }
    var priceCents = pack ? (pack.priceCents != null ? pack.priceCents : Math.round(pack.price * 100)) : baseCents;
    var feeCents = grossCents(priceCents, t) - priceCents;
    var saved = Math.max(0, baseCents - priceCents);
    return { coins: coins, baseCents: baseCents, priceCents: priceCents, feeCents: feeCents,
             totalCents: priceCents + feeCents, discount: baseCents && saved ? Math.round(saved * 100 / baseCents) : 0 };
  }

  /* ====================================================== calculator */
  /* Coins a request costs: its real AI cost (server rates, off-peak) for a typical
     request of each size - most of the project context is cached (cheap); the
     answer is what costs. */
  var calcUpdate = null;
  function requestCoins(inputTokens, outputTokens) {
    var rates = (DATA.coins && DATA.coins.coinsPerMillionTokens && DATA.coins.coinsPerMillionTokens.offPeak) ||
      { cacheHit: 10, cacheMiss: 500, output: 2000 };
    var cached = inputTokens * 0.65;
    return ((inputTokens - cached) * rates.cacheMiss + cached * rates.cacheHit + outputTokens * rates.output) / 1e6;
  }
  function calculator() {
    var req = $("#c-requests");
    if (!req) return;
    var tex = $("#c-textures"), size = $("#c-size"), days = $("#c-days");
    // Typical requests in our test projects: [input tokens, output tokens].
    var PER_REQUEST = { 1: [7000, 2000], 2: [12000, 4000], 3: [20000, 8000] };
    var SIZE_NAMES = { 1: "Small", 2: "Medium", 3: "Large" };
    var PER_TEXTURE = [2000, 5000];

    function update() {
      req.nextElementSibling.textContent = req.value;
      tex.nextElementSibling.textContent = tex.value;
      size.nextElementSibling.textContent = SIZE_NAMES[size.value];
      if (days) days.nextElementSibling.textContent = days.value;
      var r = PER_REQUEST[size.value];
      var perDay = Number(req.value) * requestCoins(r[0], r[1]) + Number(tex.value) * requestCoins(PER_TEXTURE[0], PER_TEXTURE[1]);
      perDay = Math.round(perDay * 1.15 * 10) / 10; // + room for automatic build fixes
      var month = Math.round(perDay * Number(days ? days.value : 10));
      $("#c-total").textContent = coinsFmt(month);
      var needsTextures = Number(tex.value) > 0;
      var free = planById("free");
      var paid = DATA.plans.filter(function (p) { return p.period === "month" && p.price; })
        .sort(function (a, b) { return a.price - b.price; });
      var meter = $("#c-meter"), fit = null, share = 0, label = "";
      if (free && free.dailyCoins && !needsTextures && perDay <= free.dailyCoins) {
        fit = free;
        share = perDay / free.dailyCoins * 100;
        label = "~" + coinsFmt(perDay) + " Coins a modding day - " + Math.round(share) +
          "% of Free's " + coinsFmt(free.dailyCoins) + " Coins a day";
      } else {
        fit = paid.filter(function (p) {
          return monthlyOf(p) >= month && (!needsTextures || p.features.indexOf("textures") !== -1);
        })[0] || null;
        if (fit) {
          share = month / monthlyOf(fit) * 100;
          label = Math.round(share) + "% of " + fit.name + "'s " + coinsFmt(monthlyOf(fit)) + " monthly Coins" +
            (fit.firstMonthCoins ? " (" + coinsFmt(fit.firstMonthCoins) + " in your first month)" : "");
        }
      }
      if (fit) {
        share = Math.max(2, Math.min(100, share));
        meter.style.width = share + "%";
        meter.style.background = share > 85 ? "var(--amber)" : "var(--accent)";
        $("#c-meter-label").textContent = label;
        var fitYear = shownYearly(fit);
        $("#c-plan").textContent = fit.name + (fitYear ? " · " + dollars(fitYear.price) + "/yr"
          : fit.price ? " · " + dollars(fit.price) : "");
        $("#c-cta").textContent = fit.price ? "See " + fit.name : "Start free";
        $("#c-cta").href = fit.price ? "#plan-" + fit.id : "signup.html";
      } else {
        meter.style.width = "100%";
        meter.style.background = "var(--ruby)";
        $("#c-meter-label").textContent = "More than our biggest standard plan - add Coins, or talk to us";
        $("#c-plan").textContent = "Enterprise";
        $("#c-cta").textContent = "Talk to us";
        $("#c-cta").href = "#plan-enterprise";
      }
    }
    [req, tex, size, days].forEach(function (input) { if (input) input.addEventListener("input", update); });
    calcUpdate = update;
    update();
  }

  /* ===================================================== promotions */
  /** The admin's running promotion for ``planId`` (Live settings), or null. */
  function activePromo(planId, yearly) {
    var promo = window.MCA && window.MCA.look && window.MCA.look.promotion;
    if (!promo || !promo.plans) return null;
    if (yearly && promo.yearly === false) return null;  // this sale is for monthly billing only
    var spec = Array.isArray(promo.plans)  // older one-discount shape
      ? (promo.plans.indexOf(planId) >= 0 && promo.code ? { percent: promo.percent, code: promo.code } : null)
      : promo.plans[planId];
    if (!spec || !spec.percent) return null;
    return { percent: spec.percent, code: spec.code || "", label: promo.label || "Sale", terms: promo.terms || "",
             months: promo.months || null };
  }
  function salePrice(price, promo) { return Math.round(price * (100 - promo.percent)) / 100; }

  /** Show sale prices on the cards and in the table (or restore normal prices) for the shown billing period. */
  function applyPromo() {
    syncBillingToggle();
    DATA.plans.forEach(function (plan) {
      var card = document.getElementById("plan-" + plan.id);
      if (!card || !plan.price) return;
      var year = shownYearly(plan);
      var price = year ? year.price : plan.price, unit = year ? "/ year" : "/ month";
      var promo = activePromo(plan.id, !!year);
      var priceBox = card.querySelector(".price");
      var badge = card.querySelector(".sale"), note = card.querySelector(".promo-note");
      if (badge) badge.remove();
      if (note) note.remove();
      if (!promo) {
        priceBox.innerHTML = "<b>" + dollars(price) + "</b><span>" + unit + "</span>";
        return;
      }
      priceBox.innerHTML = "<s>" + dollars(price) + "</s><b>" + dollars(salePrice(price, promo)) + "</b><span>" + unit + "</span>";
      badge = document.createElement("span");
      badge.className = "sale";
      badge.textContent = promo.percent + "% off";
      card.appendChild(badge);
      note = document.createElement("p");
      note.className = "promo-note";
      var span = year ? (promo.months ? " on your first year" : "")
        : promo.months ? (promo.months === 1 ? " for your first month" : " for your first " + promo.months + " months") : "";
      note.innerHTML = esc(promo.label) + " &middot; " + promo.percent + "% off" + esc(span) +
        ", applied automatically at checkout" + (promo.terms ? " &middot; " + esc(promo.terms) : "");
      card.querySelector(".tokens").insertAdjacentElement("afterend", note);
    });
    $$("[data-compare-price]").forEach(function (td) {
      var plan = planById(td.dataset.comparePrice);
      if (!plan || !plan.price) return;
      var year = shownYearly(plan);
      var price = year ? year.price : plan.price, unit = year ? "/yr" : "/mo";
      var promo = activePromo(plan.id, !!year);
      td.innerHTML = promo ? "<s>" + dollars(price) + "</s> " + dollars(salePrice(price, promo)) + unit
        : dollars(price) + unit;
    });
  }
  document.addEventListener("mca:look", applyPromo);

  /* ========================================================= pricing */
  function tokenLine(plan) {
    var year = shownYearly(plan);
    if (year) {
      return "<b>" + coinsFmt(year.coins) + "</b> Coins for 12 months<br><span class=\"bonus\">incl. +" +
        pct(year.bonusCoinsPercent) + "% yearly bonus (" + coinsFmt(year.bonusCoins) + " extra)</span>";
    }
    if (plan.period === "month") {
      return "<b>" + coinsFmt(plan.firstMonthCoins) + "</b> Coins first month<br><b>" + coinsFmt(plan.monthlyCoins) +
        "</b> / month after";
    }
    if (plan.period === "day" && plan.dailyCoins) return "<b>" + coinsFmt(plan.dailyCoins) + "</b> Coins / day";
    return "Coin allowances set with you";
  }

  function renderPlans() {
    var host = $("#pricing-cards");
    if (!host) return;
    host.innerHTML = DATA.plans.map(function (plan) {
      var year = shownYearly(plan);
      var price = plan.price === null || plan.price === undefined ? "<b>Custom</b>"
        : year ? "<b>" + dollars(year.price) + "</b><span>/ year</span>"
        : "<b>$" + (plan.price ? plan.price.toFixed(2) : "0") + "</b><span>/ month</span>";
      var billed = year ? '<div class="billed">' + money(year.perMonthCents) + " / month, billed " + dollars(year.price) +
        ' every 12 months<br><span class="saving">Save ' + money(year.savingsCents) + " (" + pct(year.discountPercent) +
        "%) vs monthly</span></div>" : "";
      var cta;
      if (plan.id === "free") cta = '<a class="btn btn-block" href="signup.html">Start free</a>';
      else if (plan.contact || plan.price === null) cta = '<a class="btn btn-block" href="#" data-contact>Contact sales</a>';
      else cta = '<button class="btn btn-block ' + (plan.popular ? "btn-primary" : "") + '" type="button" data-checkout="' +
        esc(plan.id) + '" data-interval="' + (year ? "year" : "month") + '">Choose ' + esc(plan.name) +
        (year ? " yearly" : "") + "</button>";
      var highlights = plan.highlights || [];
      if (year) {  // the monthly allowance lines don't apply: one allowance for the whole year
        highlights = [coinsFmt(year.coins) + " Coins for the year, ready from day one"]
          .concat(highlights.filter(function (h) { return !/\b(first month|every month|per month|a month)\b/i.test(h); }));
      }
      var items = highlights.map(function (h) {
        var no = /\b(locked|not included)\b/i.test(h);
        return "<li" + (no ? ' class="no"' : "") + ">" + esc(h) + "</li>";
      }).join("");
      return '<article class="plan reveal' + (plan.popular ? " popular" : "") + '" id="plan-' + esc(plan.id) + '">' +
        (plan.popular ? '<span class="tag">MOST PICKED</span>' : "") +
        "<h3>" + esc(plan.name) + '</h3><p class="tagline">' + esc(plan.tagline) + "</p>" +
        '<div class="price">' + price + "</div>" + billed + '<div class="tokens">' + tokenLine(plan) + "</div>" +
        "<ul>" + items + "</ul>" + cta + "</article>";
    }).join("");
    $$(".plan.reveal", host).forEach(function (el, i) { setTimeout(function () { el.classList.add("in"); }, 80 * i); });
    markCurrentPlan();
  }

  /** Signed in: the visitor's own plan says so, and Free never offers "Start free" again. */
  function markCurrentPlan() {
    var me = window.MCA && window.MCA.session;
    var host = $("#pricing-cards");
    if (!me || !host) return;
    var current = me.plan && me.plan.id;
    $$(".plan", host).forEach(function (card) {
      var id = card.id.replace(/^plan-/, "");
      var cta = card.querySelector(".btn");
      if (!cta) return;
      if (id === current) {
        card.classList.add("current");
        cta.outerHTML = '<a class="btn btn-block" href="account.html">Your current plan</a>';
      } else if (id === "free") {
        cta.outerHTML = '<a class="btn btn-block" href="account.html">Go to your account</a>';
      }
    });
  }
  document.addEventListener("mca:session", markCurrentPlan);

  var YES = '<td class="yes"><span aria-hidden="true">&#10003;</span><span class="sr">Included</span></td>';
  var NO = '<td class="nope"><span aria-hidden="true">&mdash;</span><span class="sr">Not included</span></td>';

  function renderCompare() {
    var compare = $("#compare");
    if (!compare) return;
    var plans = DATA.plans;
    var THINK = { none: "None", low: "Low", normal: "Normal", high: "High" };
    function row(label, cells, hint) {
      return "<tr><th scope=\"row\">" + esc(label) + (hint ? '<small>' + esc(hint) + "</small>" : "") + "</th>" +
        cells.join("") + "</tr>";
    }
    function group(title) { return '<tr class="grp"><th colspan="' + (plans.length + 1) + '" scope="colgroup">' + esc(title) + "</th></tr>"; }
    var yearly = billing() === "year";
    var head = "<thead><tr><th scope=\"col\"><span class=\"sr\">Feature</span></th>" + plans.map(function (p) {
      var year = shownYearly(p);
      var price = p.price === null || p.price === undefined ? "Custom"
        : year ? dollars(year.price) + "/yr" : (p.price ? "$" + p.price.toFixed(2) + "/mo" : "Free");
      return '<th scope="col"' + (p.popular ? ' class="pop"' : "") + "><b>" + esc(p.name) + "</b><span" +
        (p.price ? ' data-compare-price="' + esc(p.id) + '"' : "") + ">" + price + "</span></th>";
    }).join("") + "</tr></thead>";

    var body = group("Coins");
    if (yearly) {
      var bonus = (DATA.plans.map(yearlyOf).filter(Boolean)[0] || {}).bonusCoinsPercent;
      body += row("Coins for 12 months", plans.map(function (p) {
        var year = yearlyOf(p);
        if (year) return '<td class="mono">' + coinsFmt(year.coins) + "</td>";
        if (p.period === "day") return '<td class="mono">' + coinsFmt(p.dailyCoins) + " / day</td>";
        return "<td>Custom</td>";
      }), "Ready from day one");
      body += row("Yearly bonus", plans.map(function (p) {
        var year = yearlyOf(p);
        return year ? '<td class="mono">+' + coinsFmt(year.bonusCoins) + "</td>" : NO;
      }), bonus != null ? "+" + pct(bonus) + "% on top of 12 months" : "");
    } else {
      body += row("Coins in your first month", plans.map(function (p) {
        if (p.period === "month") return '<td class="mono">' + coinsFmt(p.firstMonthCoins) + "</td>";
        if (p.period === "day") return '<td class="mono">' + coinsFmt(p.dailyCoins) + " / day</td>";
        return "<td>Custom</td>";
      }), "Once per account");
      body += row("Coins every month after", plans.map(function (p) {
        if (p.period === "month") return '<td class="mono">' + coinsFmt(p.monthlyCoins) + "</td>";
        if (p.period === "day") return '<td class="mono">' + coinsFmt(p.dailyCoins) + " / day</td>";
        return "<td>Custom</td>";
      }));
    }
    body += row("Allowance renews", plans.map(function (p) {
      var monthly = yearly && yearlyOf(p) ? "Yearly, on your billing date" : "Monthly, on your billing date";
      return "<td>" + (p.period === "month" ? monthly : p.period === "day" ? "Daily, 00:00 UTC" : "As agreed") + "</td>";
    }));
    body += row("Pay only for what the AI uses", plans.map(function () { return YES; }),
      "Cached project context costs a fraction of new input");
    body += row("Unused Coins roll over", plans.map(function () { return NO; }));
    body += row("Coin top-ups", plans.map(function () { return DATA.topup.enabled === false ? NO : YES; }), "Never expire with the month");

    body += group("AI");
    body += row("Thinking modes", plans.map(function (p) {
      var levels = p.thinking || ["none", "low", "normal", "high"];
      return "<td>" + (levels.length === 4 ? "All four" : levels.map(function (l) { return THINK[l]; }).join(", ")) + "</td>";
    }));
    body += row("High thinking", plans.map(function (p) { return (p.thinking || []).indexOf("high") !== -1 ? YES : NO; }),
      "For big systems and stubborn bugs");

    body += group("Tools");
    DATA.features.forEach(function (f) {
      body += row(f.label, plans.map(function (p) {
        if (p.features.indexOf(f.id) !== -1) return YES;
        if ((p.rewarded || []).indexOf(f.id) !== -1) return '<td title="Unlock with a short ad on our website">With a short ad</td>';
        return NO;
      }));
    });
    body += row("Ads", plans.map(function (p) { return "<td>" + ((p.rewarded || []).length ? "Optional, for unlocks" : "None") + "</td>"; }));
    compare.innerHTML = "<table>" + head + "<tbody>" + body + "</tbody></table>";
  }

  function pricing() {
    var host = $("#pricing-cards");
    if (!host) return;
    renderPlans();
    renderCompare();
    // Dodo Payments checkout, opened in an overlay on this page (assets/js/checkout.js).
    // The server makes the session (price, any running promotion code) - never the browser.
    host.addEventListener("click", function (e) {
      var button = e.target.closest("[data-checkout]");
      if (!button) return;
      var id = button.dataset.checkout;
      var plan = planById(id);
      var interval = button.dataset.interval === "year" ? "year" : "month";
      if (!window.MCA.checkout) return;
      window.MCA.checkout.plan(id, { label: plan ? plan.name + (interval === "year" ? " (yearly)" : "") : "",
                                     back: "index.html#plan-" + id, interval: interval });
    });
    billingToggle();
    applyPromo();  // a promotion that was already known before the cards existed
  }

  /* ======================================================== top-ups */
  var topupRender = null;
  function topups() {
    var packsHost = $("#topup-packs");
    if (!packsHost) return;
    var amount = $("#topup-amount"), range = $("#topup-range"), buyButton = $("#topup-buy");

    function limits() {
      var t = DATA.topup;
      return { min: t.minCoins || 500, max: t.maxCoins || 100000, step: t.stepCoins || 100 };
    }
    function coinsFromInput() {
      var l = limits();
      var value = Number(String(amount.value).replace(/[,\s]/g, ""));
      if (!isFinite(value) || value <= 0) value = l.min;
      value = Math.min(l.max, Math.max(l.min, Math.round(value / l.step) * l.step));
      return Math.round(value);
    }
    function renderBill() {
      var coins = coinsFromInput();
      var q = quote(coins);
      var t = DATA.topup;
      $("#topup-tokens").textContent = coinsFmt(coins);
      $("#topup-rate").textContent = q.discount ? "Package price (" + q.discount + "% off)" : "Price (" + money(t.pricePer1000Coins * 100) + " per 1,000 Coins)";
      $("#topup-price").textContent = money(q.priceCents);
      $("#topup-fee").textContent = money(q.feeCents);
      $("#topup-total").textContent = money(q.totalCents);
      buyButton.textContent = "Buy " + coinsFmt(coins) + " Coins";
      buyButton.dataset.coins = String(coins);
      $("#topup-note").textContent = "Valid for " + (t.validityDays % 365 === 0 ? (t.validityDays / 365 === 1 ? "12 months" : t.validityDays / 365 + " years") : t.validityDays + " days") +
        ". Added to your account as soon as the payment goes through.";
    }
    function render() {
      var t = DATA.topup;
      var section = $("#topup");
      if (section) section.hidden = t.enabled === false;
      var l = limits();
      amount.min = range.min = l.min; amount.max = range.max = l.max; amount.step = range.step = l.step;
      $("#topup-hint").textContent = "Any amount from " + coinsFmt(l.min) + " to " + coinsFmt(l.max) +
        " Coins, in steps of " + coinsFmt(l.step) + ".";
      if (Number(amount.value) < l.min || Number(amount.value) > l.max) { amount.value = range.value = String(Math.max(l.min, 1000)); }
      packsHost.innerHTML = (t.packs || []).map(function (p) {
        var q = quote(Number(p.coins));
        return '<article class="pack reveal in">' + (q.discount ? '<span class="save">Save ' + q.discount + "%</span>" : "") +
          '<div class="pack-tokens">' + coinsFmt(q.coins) + "<span>Coins</span></div>" +
          '<div class="pack-price">' + (q.discount ? "<s>" + money(q.baseCents) + "</s>" : "") + money(q.priceCents) + "</div>" +
          '<div class="pack-fee">+ ' + money(q.feeCents) + " processing fee &middot; <b>" + money(q.totalCents) + " total</b></div>" +
          '<button class="btn btn-block" type="button" data-topup="' + q.coins + '">Buy</button></article>';
      }).join("");
      renderBill();
    }

    amount.addEventListener("input", function () { range.value = amount.value; renderBill(); });
    amount.addEventListener("change", function () { amount.value = String(coinsFromInput()); range.value = amount.value; renderBill(); });
    range.addEventListener("input", function () { amount.value = range.value; renderBill(); });

    function buy(coins) {
      // Checkout opens in an overlay on this page; the server prices the Coins.
      if (window.MCA.checkout) window.MCA.checkout.coins(coins, { back: "index.html#topup" });
    }
    buyButton.addEventListener("click", function () { buy(Number(buyButton.dataset.coins)); });
    packsHost.addEventListener("click", function (e) {
      var button = e.target.closest("[data-topup]");
      if (button) buy(Number(button.dataset.topup));
    });
    topupRender = render;
    render();
  }

  /** Swap the built-in plans.js for the live catalogue the admin manages. */
  function loadLivePricing() {
    var api = window.MCA && window.MCA.api;
    if (!api || !api.pricing) return;
    api.pricing().then(function (data) {
      if (!data || !data.plans || !data.plans.length) return;
      DATA = normalise(data);
      renderPlans();
      renderCompare();
      applyPromo();
      if (topupRender) topupRender();
      if (calcUpdate) calcUpdate();
    }, function () { /* offline or preview: keep the built-in table */ });
  }

  document.addEventListener("DOMContentLoaded", function () {
    workbench();
    exampleRuns();
    tour();
    calculator();
    pricing();
    topups();
    loadLivePricing();
  });
})();
