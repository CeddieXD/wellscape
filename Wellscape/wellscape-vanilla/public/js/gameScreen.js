// Game screen: builds the UI shell and drives the KAPLAY game.
// The chosen character is passed through to the game. The camera follows
// the player (handled inside phase1Game.js). NPCs offer forced wellness tasks.
import { initPhase1Game } from "./phase1Game.js";
import { NPCS } from "./quests.js";
import { TaskPopup } from "./taskPopup.js";
import { api } from "./api.js";

// When true, the editor/debug header bar (title + action buttons) is shown.
// Set to false to hide all controls for a clean player-facing build.
export const EDITOR_MODE = true;

/**
 * @param {object} opts
 * @param {number|null} [opts.characterId]
 * @param {string} [opts.playerName]
 * @param {string[]} [opts.completedTaskIds]      wellness tasks already done today
 * @param {() => void} [opts.onBack]              shows an "Exit Game" button
 * @param {() => void} [opts.onChangeCharacter]   shows a "Change Character" button
 * @returns {{ el: HTMLElement, start: () => void, destroy: () => void }}
 */
export function GameScreen({
  characterId = null,
  playerName = "You",
  completedTaskIds = [],
  onBack,
  onChangeCharacter,
} = {}) {
  let controller = null;

  // Shared movement vector written by the on-screen D-pad and read by the game.
  const touchInput = { x: 0, y: 0 };

  const root = document.createElement("div");
  root.className = "game-screen view-enter";
  if (!EDITOR_MODE) root.classList.add("player-mode");

  const charSuffix =
    characterId !== null ? ` · Character #${String(characterId).padStart(3, "0")}` : "";

  // Dev-only: a floating ⚙️ Settings button plus the settings panel it opens.
  // Both are absolutely positioned over the game and hidden by default.
  const settingsHtml = EDITOR_MODE
    ? `
      <button type="button" class="settings-toggle" title="Settings" aria-label="Settings" aria-expanded="false">⚙️</button>
      <div class="settings-panel" hidden>
        <div class="settings-head">
          <div class="brand">
            <span class="flag">🇵🇭</span>
            <div>
              <h2>Wellscape Barangay Plaza</h2>
              <p class="subtitle">Explore the plaza — ${playerName}${charSuffix}</p>
            </div>
          </div>
          <button type="button" class="settings-close" aria-label="Close settings">✕</button>
        </div>
        <div class="game-actions">
          <button type="button" class="btn-reset">↺ Reset Spawn</button>
          ${onChangeCharacter ? '<button type="button" class="btn-change">🧑 Change Character</button>' : ""}
          ${onBack ? '<button type="button" class="btn-exit">Exit Game</button>' : ""}
        </div>
      </div>`
    : "";

  root.innerHTML = `
    <div class="canvas-wrap">
      <canvas width="800" height="600"></canvas>
      <div class="hud">
        <span>📍 <b class="hud-pos">(400, 320)</b></span>
        <span>🧭 <b class="facing hud-facing">DOWN</b></span>
        <span class="hud-status status-idle">🧍 IDLE</span>
      </div>

      ${settingsHtml}

      <!-- Circular interact button — shown only when near an NPC -->
      <button type="button" class="interact-btn" hidden aria-label="Interact">
        <span class="interact-icon">💬</span>
        <span class="interact-label">Talk</span>
      </button>

      <!-- On-screen controls (shown on touch / small screens via CSS) -->
      <div class="touch-controls" aria-hidden="true">
        <div class="dpad">
          <button type="button" class="dpad-btn dpad-up" data-dir="up">▲</button>
          <button type="button" class="dpad-btn dpad-left" data-dir="left">◀</button>
          <button type="button" class="dpad-btn dpad-right" data-dir="right">▶</button>
          <button type="button" class="dpad-btn dpad-down" data-dir="down">▼</button>
        </div>
      </div>
    </div>
  `;

  const canvas = root.querySelector("canvas");
  const hudPos = root.querySelector(".hud-pos");
  const hudFacing = root.querySelector(".hud-facing");
  const hudStatus = root.querySelector(".hud-status");

  function renderStatus(status) {
    hudPos.textContent = `(${status.x}, ${status.y})`;
    hudFacing.textContent = status.direction.toUpperCase();
    if (status.isColliding) {
      hudStatus.className = "hud-status status-collide";
      hudStatus.textContent = "💥 WALL";
    } else if (status.isMoving) {
      hudStatus.className = "hud-status status-walking";
      hudStatus.textContent = "🏃 WALKING";
    } else {
      hudStatus.className = "hud-status status-idle";
      hudStatus.textContent = "🧍 IDLE";
    }
  }

  // Dev-only settings panel + its controls.
  if (EDITOR_MODE) {
    const toggle = root.querySelector(".settings-toggle");
    const panel = root.querySelector(".settings-panel");
    const closeBtn = root.querySelector(".settings-close");
    const btnReset = root.querySelector(".btn-reset");
    const btnChange = root.querySelector(".btn-change");
    const btnExit = root.querySelector(".btn-exit");

    const openPanel = () => {
      panel.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      toggle.classList.add("active");
    };
    const closePanel = () => {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.classList.remove("active");
    };
    toggle.addEventListener("click", () => {
      panel.hidden ? openPanel() : closePanel();
    });
    closeBtn.addEventListener("click", closePanel);
    // Esc closes the panel.
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) closePanel();
    });

    btnReset.addEventListener("click", () => controller?.resetPosition());
    if (btnChange) btnChange.addEventListener("click", () => onChangeCharacter?.());
    if (btnExit) btnExit.addEventListener("click", () => onBack?.());
  }

  // ---- Touch D-pad wiring ----
  const dpadButtons = root.querySelectorAll(".dpad-btn");
  const AXIS = {
    up: ["y", -1],
    down: ["y", 1],
    left: ["x", -1],
    right: ["x", 1],
  };

  function press(dir) {
    const [axis, val] = AXIS[dir];
    touchInput[axis] = val;
  }
  function release(dir) {
    const [axis, val] = AXIS[dir];
    if (touchInput[axis] === val) touchInput[axis] = 0;
  }

  dpadButtons.forEach((btn) => {
    const dir = btn.dataset.dir;
    const down = (e) => {
      e.preventDefault();
      btn.classList.add("pressed");
      press(dir);
    };
    const up = (e) => {
      e.preventDefault();
      btn.classList.remove("pressed");
      release(dir);
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
    btn.addEventListener("lostpointercapture", up);
  });

  const resetInput = () => {
    touchInput.x = 0;
    touchInput.y = 0;
    dpadButtons.forEach((b) => b.classList.remove("pressed"));
  };
  window.addEventListener("blur", resetInput);

  // ---- NPC interaction + forced wellness task popup ----
  const canvasWrap = root.querySelector(".canvas-wrap");
  const interactBtn = root.querySelector(".interact-btn");
  const done = new Set(completedTaskIds);
  let nearbyNpc = null;
  let popup = null;

  // Show/hide the circular interact button as the player nears an NPC.
  function handleProximity(npc) {
    nearbyNpc = npc;
    if (npc && !popup) {
      const isDone = done.has(npc.task.id);
      interactBtn.hidden = false;
      interactBtn.querySelector(".interact-icon").textContent = isDone ? "✓" : "💬";
      interactBtn.querySelector(".interact-label").textContent = isDone
        ? "Done"
        : npc.name;
      interactBtn.classList.toggle("is-done", isDone);
    } else {
      interactBtn.hidden = true;
    }
  }

  function openTask(npc) {
    if (!npc || popup) return;
    // Freeze movement, hide the interact button and D-pad while the task is up.
    controller?.setPaused(true);
    resetInput();
    interactBtn.hidden = true;

    popup = TaskPopup({
      npc,
      onComplete: async (task) => {
        // Record to the backend wellness monitor (persisted per user).
        await api.completeTask(task.id, task.title);
        done.add(task.id);
        controller?.markQuestDone(task.id);
      },
    });
    // When the popup element is removed, resume the game.
    const observer = new MutationObserver(() => {
      if (!canvasWrap.contains(popup.el)) {
        observer.disconnect();
        popup = null;
        controller?.setPaused(false);
        // Re-evaluate proximity so the button reappears if still near.
        handleProximity(controller?.getActiveNpc?.() || null);
      }
    });
    observer.observe(canvasWrap, { childList: true });
    canvasWrap.appendChild(popup.el);
    popup.el.focus();
  }

  interactBtn.addEventListener("click", () => openTask(nearbyNpc));

  function start() {
    controller = initPhase1Game(
      canvas,
      {
        characterId,
        playerName,
        touchInput,
        npcs: NPCS,
        completedTaskIds,
        onNpcProximity: handleProximity,
        onInteract: openTask,
      },
      renderStatus
    );
  }

  function destroy() {
    window.removeEventListener("blur", resetInput);
    popup?.destroy();
    controller?.destroy();
    controller = null;
  }

  return { el: root, start, destroy };
}
