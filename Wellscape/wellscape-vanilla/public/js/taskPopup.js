// Forced wellness-task popup.
// Opened when the player interacts with an NPC. The user CANNOT dismiss it
// without completing the task — there is no close button and Esc is ignored.
// Completion depends on the task kind (action / hold / count). On success we
// call onComplete(task) so the caller can log it to the backend.

/**
 * @param {object} opts
 * @param {object} opts.npc   NPC from quests.js (has .name, .task)
 * @param {(task:object)=>Promise<void>|void} opts.onComplete
 * @returns {{ el: HTMLElement, destroy: () => void }}
 */
export function TaskPopup({ npc, onComplete }) {
  const task = npc.task;

  const overlay = document.createElement("div");
  overlay.className = "task-overlay";
  // Block Esc / outside interactions — the task is mandatory.
  overlay.tabIndex = -1;

  const kindHint =
    task.kind === "hold"
      ? `Hold the button for ${task.seconds} seconds.`
      : task.kind === "count"
      ? `Complete ${task.reps} time${task.reps > 1 ? "s" : ""}.`
      : "Do it for real, then confirm.";

  overlay.innerHTML = `
    <div class="task-card" role="dialog" aria-modal="true" aria-labelledby="task-title">
      <div class="task-emoji">${task.emoji || "🌿"}</div>
      <p class="task-npc">${npc.name} says:</p>
      <h2 id="task-title">${task.title}</h2>
      <p class="task-prompt">${task.prompt}</p>
      <p class="task-hint">${kindHint}</p>

      <div class="task-progress"><div class="task-progress-fill"></div></div>

      <button type="button" class="task-action">${task.action || "Complete"}</button>
      <p class="task-locked">🔒 Finish the task to continue</p>
    </div>
  `;

  const card = overlay.querySelector(".task-card");
  const actionBtn = overlay.querySelector(".task-action");
  const fill = overlay.querySelector(".task-progress-fill");
  const lockMsg = overlay.querySelector(".task-locked");

  let finished = false;

  function setProgress(pct) {
    fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  async function finish() {
    if (finished) return;
    finished = true;
    actionBtn.disabled = true;
    actionBtn.textContent = "Saving...";
    setProgress(100);
    try {
      await onComplete(task);
      // Success message, then auto-close.
      card.classList.add("task-done");
      lockMsg.textContent = "";
      actionBtn.textContent = "Done ✓";
      card.querySelector(".task-prompt").textContent = task.done || "Nicely done!";
      setTimeout(destroy, 1200);
    } catch (err) {
      // Let them retry if saving failed.
      finished = false;
      actionBtn.disabled = false;
      actionBtn.textContent = task.action || "Complete";
      lockMsg.textContent = "⚠️ " + (err?.message || "Could not save. Try again.");
    }
  }

  // ---- Wire up the task kind ----
  if (task.kind === "count") {
    let count = 0;
    const target = task.reps || 1;
    const base = task.action || "Do it";
    actionBtn.textContent = target > 1 ? `${base} (0/${target})` : base;
    actionBtn.addEventListener("click", () => {
      count += 1;
      setProgress((count / target) * 100);
      if (count >= target) finish();
      else actionBtn.textContent = `${base} (${count}/${target})`;
    });
  } else if (task.kind === "hold") {
    const ms = (task.seconds || 3) * 1000;
    let raf = null;
    let startedAt = 0;

    const tick = () => {
      const elapsed = performance.now() - startedAt;
      setProgress((elapsed / ms) * 100);
      if (elapsed >= ms) {
        cancelAnimationFrame(raf);
        raf = null;
        finish();
      } else {
        raf = requestAnimationFrame(tick);
      }
    };
    const startHold = (e) => {
      e.preventDefault();
      if (finished || raf) return;
      startedAt = performance.now();
      actionBtn.classList.add("holding");
      raf = requestAnimationFrame(tick);
    };
    const endHold = (e) => {
      if (e) e.preventDefault();
      if (finished) return;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      actionBtn.classList.remove("holding");
      setProgress(0); // must hold continuously — reset if released early
    };
    actionBtn.addEventListener("pointerdown", startHold);
    actionBtn.addEventListener("pointerup", endHold);
    actionBtn.addEventListener("pointercancel", endHold);
    actionBtn.addEventListener("pointerleave", endHold);
  } else {
    // "action": a single meaningful confirmation.
    actionBtn.addEventListener("click", finish);
  }

  // Keep focus trapped so Esc / tabbing away can't bypass the task.
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") e.stopPropagation();
  });
  setTimeout(() => actionBtn.focus(), 0);

  function destroy() {
    overlay.remove();
  }

  return { el: overlay, destroy };
}
