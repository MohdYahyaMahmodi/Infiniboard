document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  // --- State ---
  const state = {
    isDrawing: false,
    isPanning: false,
    isSpacePressed: false,
    tool: "pen",
    inkColor: "#000000",
    cursorColor: "#1a73e8",
    size: 5,
    username: "",
    scale: 1,
    panX: 0,
    panY: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastTouchDist: 0,
  };

  const mouse = { rawX: 0, rawY: 0 };
  let history = [];
  let otherCursors = {};
  let imageCache = {};

  window.addEventListener("contextmenu", (e) => e.preventDefault());

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    render();
  }
  window.addEventListener("resize", resize);
  resize();

  const toWorld = (x, y) => ({
    x: (x - state.panX) / state.scale,
    y: (y - state.panY) / state.scale,
  });

  const lerp = (start, end, amt) => (1 - amt) * start + amt * end;

  // Throttling
  let lastDrawEmit = 0;
  function canEmitDraw() {
    const now = Date.now();
    if (now - lastDrawEmit > 16) {
      lastDrawEmit = now;
      return true;
    }
    return false;
  }

  // --- Rendering ---
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#f0f2f5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(state.scale, 0, 0, state.scale, state.panX, state.panY);

    drawGrid();

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    history.forEach((item) => {
      if (item.type === "image") drawImageItem(item);
      else if (item.type === "line") drawLineItem(item);
      else drawShapeItem(item);
    });

    if (state.isDrawing && ["rect", "circle", "line"].includes(state.tool)) {
      const wPos = toWorld(mouse.rawX, mouse.rawY);
      drawShapeItem(
        {
          type: state.tool === "line" ? "line_shape" : state.tool,
          x: state.startX,
          y: state.startY,
          w: wPos.x - state.startX,
          h: wPos.y - state.startY,
          color: state.inkColor,
          size: state.size,
        },
        true
      );
    }

    drawCursors();
    requestAnimationFrame(render);
  }

  function drawGrid() {
    const gridSize = 50;
    const left = -state.panX / state.scale;
    const top = -state.panY / state.scale;
    const right = (canvas.width - state.panX) / state.scale;
    const bottom = (canvas.height - state.panY) / state.scale;

    ctx.lineWidth = 1 / state.scale;
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.beginPath();

    const startX = Math.floor(left / gridSize) * gridSize;
    const startY = Math.floor(top / gridSize) * gridSize;

    for (let x = startX; x < right; x += gridSize) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = startY; y < bottom; y += gridSize) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
  }

  function drawLineItem(item) {
    ctx.beginPath();
    ctx.strokeStyle = item.tool === "eraser" ? "#f0f2f5" : item.color;
    ctx.lineWidth = item.size;
    if (item.x0 === item.x1 && item.y0 === item.y1) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.arc(item.x0, item.y0, item.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(item.x0, item.y0);
      ctx.lineTo(item.x1, item.y1);
      ctx.stroke();
    }
  }

  function drawShapeItem(item, isGhost = false) {
    ctx.beginPath();
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.size;
    if (isGhost) {
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = item.color + "99";
    } else ctx.setLineDash([]);

    if (item.type === "rect") ctx.strokeRect(item.x, item.y, item.w, item.h);
    else if (item.type === "circle") {
      const r = Math.sqrt(item.w * item.w + item.h * item.h);
      ctx.beginPath();
      ctx.arc(item.x, item.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (item.type === "line_shape") {
      ctx.beginPath();
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(item.x + item.w, item.y + item.h);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawImageItem(item) {
    if (!imageCache[item.id]) {
      const img = new Image();
      img.src = item.src;
      imageCache[item.id] = img;
    } else if (imageCache[item.id].complete)
      ctx.drawImage(
        imageCache[item.id],
        item.x,
        item.y,
        item.width,
        item.height
      );
  }

  function drawCursors() {
    const now = Date.now();
    const scale = 1 / state.scale;

    for (let id in otherCursors) {
      const c = otherCursors[id];
      if (now - c.timestamp > 60000) continue;
      c.x = lerp(c.x, c.tx, 0.2);
      c.y = lerp(c.y, c.ty, 0.2);

      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + 8 * scale, c.y + 24 * scale);
      ctx.lineTo(c.x + 12 * scale, c.y + 14 * scale);
      ctx.lineTo(c.x + 22 * scale, c.y + 12 * scale);
      ctx.closePath();

      ctx.fillStyle = c.color || "#000000";
      ctx.fill();
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = "white";
      ctx.stroke();

      if (c.username) {
        ctx.font = `bold ${12 * scale}px Inter, sans-serif`;
        const width = ctx.measureText(c.username).width;
        ctx.fillStyle = c.color || "#000000";
        ctx.fillRect(
          c.x + 16 * scale,
          c.y + 16 * scale,
          width + 10 * scale,
          20 * scale
        );
        ctx.fillStyle = "white";
        ctx.fillText(c.username, c.x + 21 * scale, c.y + 30 * scale);
      }
    }
  }

  // --- Interaction ---
  function handleStart(x, y, isRight) {
    const w = toWorld(x, y);
    mouse.rawX = x;
    mouse.rawY = y;
    if (state.isSpacePressed || state.tool === "pan" || isRight) {
      state.isPanning = true;
      canvas.style.cursor = "grabbing";
    } else {
      state.isDrawing = true;
      state.startX = w.x;
      state.startY = w.y;
      state.lastX = w.x;
      state.lastY = w.y;
    }
  }

  function handleMove(x, y) {
    const w = toWorld(x, y);

    // Update Coords Display
    document.getElementById("coordsDisplay").innerText = `${Math.round(
      w.x
    )}, ${Math.round(w.y)}`;

    if (state.isPanning) {
      state.panX += x - mouse.rawX;
      state.panY += y - mouse.rawY;
    } else if (state.isDrawing && canEmitDraw()) {
      if (["pen", "eraser"].includes(state.tool)) {
        const d = {
          type: "line",
          x0: state.lastX,
          y0: state.lastY,
          x1: w.x,
          y1: w.y,
          color: state.inkColor,
          size: state.size,
          tool: state.tool,
        };
        history.push(d);
        socket.emit("draw_line", d);
        state.lastX = w.x;
        state.lastY = w.y;
      }
    }
    mouse.rawX = x;
    mouse.rawY = y;
    throttleCursor(w.x, w.y);
  }

  function handleEnd() {
    if (state.isDrawing && ["rect", "circle", "line"].includes(state.tool)) {
      const w = toWorld(mouse.rawX, mouse.rawY);
      const d = {
        type: state.tool === "line" ? "line_shape" : state.tool,
        x: state.startX,
        y: state.startY,
        w: w.x - state.startX,
        h: w.y - state.startY,
        color: state.inkColor,
        size: state.size,
      };
      if (Math.abs(d.w) > 2 || Math.abs(d.h) > 2) {
        history.push(d);
        socket.emit("draw_shape", d);
      }
    }
    state.isDrawing = false;
    state.isPanning = false;
    canvas.style.cursor = state.tool === "pan" ? "grab" : "crosshair";
  }

  // Listeners
  canvas.addEventListener("mousedown", (e) =>
    handleStart(e.clientX, e.clientY, e.button === 2)
  );
  window.addEventListener("mousemove", (e) => {
    // Always handle move to update coords
    handleMove(e.clientX, e.clientY);
  });
  window.addEventListener("mouseup", handleEnd);

  // Touch
  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      if (e.touches.length === 1)
        handleStart(e.touches[0].clientX, e.touches[0].clientY, false);
      else if (e.touches.length === 2) {
        state.isPanning = true;
        state.isDrawing = false;
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        state.lastTouchDist = dist;
        mouse.rawX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        mouse.rawY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (e.touches.length === 1)
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      else if (e.touches.length === 2 && state.isPanning) {
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        state.panX += cx - mouse.rawX;
        state.panY += cy - mouse.rawY;
        const zoom = dist / state.lastTouchDist;
        const wPos = toWorld(cx, cy);
        state.scale = Math.min(Math.max(0.1, state.scale * zoom), 10);
        state.panX = cx - wPos.x * state.scale;
        state.panY = cy - wPos.y * state.scale;
        mouse.rawX = cx;
        mouse.rawY = cy;
        state.lastTouchDist = dist;
        updateStats();
      }
    },
    { passive: false }
  );
  canvas.addEventListener("touchend", (e) => {
    if (e.touches.length === 0) handleEnd();
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const zoom = Math.exp(e.deltaY * -0.001);
      const wPos = toWorld(e.clientX, e.clientY);
      state.scale = Math.min(Math.max(0.1, state.scale * zoom), 10);
      state.panX = e.clientX - wPos.x * state.scale;
      state.panY = e.clientY - wPos.y * state.scale;
      updateStats();
      handleMove(e.clientX, e.clientY); // Update coords instantly
    },
    { passive: false }
  );

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !state.isSpacePressed) {
      state.isSpacePressed = true;
      canvas.style.cursor = "grab";
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      state.isSpacePressed = false;
      canvas.style.cursor = state.tool === "pan" ? "grab" : "crosshair";
      state.isPanning = false;
    }
  });

  // UI Logic
  const presets = [
    "#ea4335",
    "#fbbc04",
    "#34a853",
    "#4285f4",
    "#9334e6",
    "#000000",
  ];
  const settingsModal = document.getElementById("settingsModal");

  document.getElementById("joinBtn").addEventListener("click", () => {
    const name =
      document.getElementById("usernameInput").value.trim() || "Artist";
    state.username = name;
    state.cursorColor = presets[Math.floor(Math.random() * 4)];
    socket.emit("join_user", { username: name, color: state.cursorColor });

    gsap.to("#loginModal", {
      opacity: 0,
      duration: 0.3,
      onComplete: () => {
        document.getElementById("loginModal").remove();
        document.getElementById("uiLayer").classList.remove("hidden");
        gsap.from(".ui-panel", {
          y: 20,
          opacity: 0,
          stagger: 0.1,
          ease: "power2.out",
        });
      },
    });
  });

  document.querySelectorAll(".tool-btn").forEach((btn) => {
    if (!btn.dataset.tool) return;
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tool-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.tool = btn.dataset.tool;
      canvas.style.cursor = state.tool === "pan" ? "grab" : "crosshair";
    });
  });

  document
    .getElementById("inkColor")
    .addEventListener("input", (e) => (state.inkColor = e.target.value));
  document
    .getElementById("sizeSlider")
    .addEventListener("input", (e) => (state.size = parseInt(e.target.value)));

  document.getElementById("openSettingsBtn").addEventListener("click", () => {
    document.getElementById("settingsName").value = state.username;
    renderPresets();
    settingsModal.classList.remove("hidden");
    gsap.to(settingsModal, { opacity: 1 });
    gsap.fromTo(
      settingsModal.children[0],
      { scale: 0.95 },
      { scale: 1, duration: 0.2, ease: "back.out" }
    );
  });

  document.getElementById("closeSettings").addEventListener("click", () => {
    gsap.to(settingsModal, {
      opacity: 0,
      duration: 0.2,
      onComplete: () => settingsModal.classList.add("hidden"),
    });
  });

  function renderPresets() {
    const container = document.getElementById("colorPresets");
    container.innerHTML = "";
    presets.forEach((color) => {
      const div = document.createElement("div");
      div.className = `color-swatch ${
        state.cursorColor === color ? "selected" : ""
      }`;
      div.style.backgroundColor = color;
      div.addEventListener("click", () => {
        state.cursorColor = color;
        renderPresets();
      });
      container.appendChild(div);
    });
  }

  document.getElementById("saveSettings").addEventListener("click", () => {
    const newName = document.getElementById("settingsName").value.trim();
    if (newName) state.username = newName;
    socket.emit("update_profile", {
      username: state.username,
      color: state.cursorColor,
    });
    gsap.to(settingsModal, {
      opacity: 0,
      duration: 0.2,
      onComplete: () => settingsModal.classList.add("hidden"),
    });
  });

  // Chat & Users
  let unreadCount = 0;
  let isChatOpen = false;
  const chatWin = document.getElementById("chatWindow");
  const badge = document.getElementById("unreadBadge");

  function toggleChat() {
    isChatOpen = !isChatOpen;
    if (isChatOpen) {
      unreadCount = 0;
      updateBadge();
      chatWin.classList.remove("hidden");
      document.getElementById("chatToggle").classList.add("scale-0");
      gsap.fromTo(
        chatWin,
        { opacity: 0, scale: 0.9, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: "back.out(1.2)" }
      );
    } else {
      gsap.to(chatWin, {
        opacity: 0,
        scale: 0.9,
        y: 10,
        duration: 0.2,
        onComplete: () => chatWin.classList.add("hidden"),
      });
      document.getElementById("chatToggle").classList.remove("scale-0");
    }
  }

  function updateBadge() {
    badge.innerText = unreadCount;
    if (unreadCount > 0) {
      badge.classList.remove("hidden");
      gsap.fromTo(badge, { scale: 1.5 }, { scale: 1, duration: 0.2 });
    } else badge.classList.add("hidden");
  }

  document.getElementById("chatToggle").addEventListener("click", toggleChat);
  document.getElementById("minimizeChat").addEventListener("click", toggleChat);

  document.getElementById("usersToggle").addEventListener("click", () => {
    const p = document.getElementById("userPanel");
    if (p.classList.contains("hidden")) {
      p.classList.remove("hidden");
      gsap.fromTo(
        p,
        { opacity: 0, y: -10, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.2 }
      );
    } else {
      gsap.to(p, {
        opacity: 0,
        y: -10,
        scale: 0.95,
        duration: 0.15,
        onComplete: () => p.classList.add("hidden"),
      });
    }
  });

  document.getElementById("chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const i = document.getElementById("chatInput");
    if (i.value.trim()) {
      socket.emit("chat_message", i.value);
      i.value = "";
    }
  });

  // Socket
  socket.on("init_history", (h) => (history = h));
  socket.on("draw_line", (d) => history.push(d));
  socket.on("draw_shape", (d) => history.push(d));
  socket.on("draw_image", (d) => history.push(d));

  socket.on("update_users", (u) => {
    document.getElementById("userCount").innerText = u.length;
    const list = document.getElementById("userList");
    list.innerHTML = "";
    u.forEach((user) => {
      list.innerHTML += `<li class="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition"><div class="w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-sm" style="background:${user.color}"></div><span class="text-sm text-gray-700 font-medium">${user.username}</span></li>`;
    });
  });

  socket.on("chat_message", (d) => {
    const div = document.createElement("div");
    div.className = "mb-3 text-xs";
    div.innerHTML = `<div class="flex items-center gap-2 mb-1"><span class="font-bold text-gray-800">${d.user}</span><span class="text-gray-400 text-[10px]">${d.time}</span></div><div class="bg-gray-50 p-2 rounded-lg rounded-tl-none text-gray-700 inline-block border border-gray-100">${d.text}</div>`;
    const box = document.getElementById("chatMessages");
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    if (!isChatOpen) {
      unreadCount++;
      updateBadge();
    }
  });

  socket.on("cursor_update", (d) => {
    if (!otherCursors[d.id])
      otherCursors[d.id] = {
        x: d.x,
        y: d.y,
        tx: d.x,
        ty: d.y,
        timestamp: Date.now(),
      };
    const c = otherCursors[d.id];
    c.tx = d.x;
    c.ty = d.y;
    c.timestamp = Date.now();
    if (d.color) c.color = d.color;
    if (d.username) c.username = d.username;
  });

  let lastThrottle = 0;
  function throttleCursor(x, y) {
    const now = Date.now();
    if (now - lastThrottle > 40) {
      socket.emit("cursor_move", { x, y });
      lastThrottle = now;
    }
  }

  function updateStats() {
    document.getElementById("scaleDisplay").innerText =
      Math.round(state.scale * 100) + "%";
  }
  requestAnimationFrame(render);
});
