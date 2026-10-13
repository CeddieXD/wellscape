// Daily wellness check-in form — ported from WellscapeUI checkin.html + checkin.js.
// Self-contained JS module. Renders the two-column check-in screen and POST/PUTs
// to /api/checkins. Calls onSaved(record) on success, onBack() for nav-back.

/**
 * @param {object} opts
 * @param {number|null} [opts.editId]       if set, load this check-in for editing
 * @param {() => void}  opts.onBack         called when user cancels / returns
 * @param {(record: object) => void} opts.onSaved  called after a successful save
 */
export function CheckinView({ editId = null, onBack, onSaved }) {
  let editingId = editId;

  const root = document.createElement("div");
  root.className = "ws-checkin-body view-enter";

  root.innerHTML = `
    <main class="ws-checkin-screen" aria-labelledby="ws-checkin-title">

      <!-- Left: welcome panel -->
      <section class="ws-checkin-welcome">
        <button type="button" class="ws-brand ws-welcome-brand ws-checkin-back" aria-label="Go back to dashboard">
          <span class="ws-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
              <path d="M16 25V12m0 8c-6 0-9-4-9-10 6 0 9 3 9 8m0-3c0-6 4-9 10-9 0 6-3 10-10 10"/>
              <path d="M9 25h14"/>
            </svg>
          </span>
          <span>wellscape</span>
        </button>
        <div class="ws-welcome-copy">
          <span class="ws-welcome-flower" aria-hidden="true">✳</span>
          <p class="ws-eyebrow">A MOMENT FOR YOURSELF</p>
          <h1 id="ws-checkin-title">How are you<br><em>feeling today?</em></h1>
          <p>There's no right way to feel. Take a breath, check in with yourself, and make a little space for the things that matter to you.</p>
        </div>
        <p class="ws-welcome-footnote"><span aria-hidden="true">☼</span> Your wellbeing matters. Always.</p>
      </section>

      <!-- Right: form -->
      <section class="ws-checkin-form-side" aria-label="Daily wellness entry">
        <div class="ws-form-heading">
          <span class="ws-form-step" id="ws-form-step">TODAY'S CHECK-IN</span>
          <p>Track your mood, sleep, hydration and movement. It only takes a minute.</p>
        </div>

        <form class="ws-entry-form" id="ws-checkin-form" novalidate>

          <!-- Date -->
          <div class="ws-form-date-row">
            <label for="ws-entry-date">Date</label>
            <input id="ws-entry-date" name="date" type="date" required />
          </div>

          <!-- Mood -->
          <fieldset class="ws-mood-fieldset">
            <legend>How's your mood?</legend>
            <div class="ws-mood-options">
              ${[
                [1, "😢", "Very low"],
                [2, "😕", "Low"],
                [3, "😐", "Okay"],
                [4, "🙂", "Good"],
                [5, "😄", "Great"],
              ].map(([v, emoji, label]) => `
                <label class="ws-mood-option">
                  <input type="radio" name="mood" value="${v}" ${v === 3 ? "checked" : ""} required />
                  <span class="ws-mood-choice">
                    <span>${emoji}</span>
                    <small>${label}</small>
                  </span>
                </label>`).join("")}
            </div>
          </fieldset>

          <!-- Habits -->
          <fieldset class="ws-habit-fields">
            <legend>Your day, in little things</legend>
            <div class="ws-number-field-grid">

              <!-- Sleep (range slider) -->
              <div class="ws-number-field ws-sleep-field">
                <label class="ws-field-title" for="ws-entry-sleep">
                  <i class="ws-input-icon ws-sleep-icon" aria-hidden="true">☾</i> Sleep
                </label>
                <div class="ws-sleep-value">
                  <output id="ws-sleep-output" for="ws-entry-sleep">7.5</output>
                  <small>hrs</small>
                </div>
                <input class="ws-sleep-range" id="ws-entry-sleep" name="sleep"
                  type="range" min="0" max="12" step="0.5" value="7.5"
                  aria-describedby="ws-sleep-scale" required />
                <div class="ws-range-scale" id="ws-sleep-scale"><span>0</span><span>12 hrs</span></div>
              </div>

              <!-- Water (stepper) -->
              <div class="ws-number-field ws-water-field">
                <label class="ws-field-title" for="ws-entry-water">
                  <i class="ws-input-icon ws-water-icon" aria-hidden="true">◒</i> Water
                </label>
                <div class="ws-water-stepper">
                  <button id="ws-water-decrease" type="button" aria-label="Decrease by one glass">−</button>
                  <input id="ws-entry-water" name="water"
                    type="number" min="0" max="16" step="1" value="0"
                    aria-describedby="ws-water-cups-desc" required />
                  <button id="ws-water-increase" type="button" aria-label="Increase by one glass">+</button>
                </div>
                <div class="ws-water-cups" id="ws-water-cups" aria-hidden="true"></div>
                <span class="ws-sr-only" id="ws-water-cups-desc" aria-live="polite">0 glasses selected</span>
              </div>

              <!-- Activity (number) -->
              <label class="ws-number-field" for="ws-entry-activity">
                <span class="ws-field-title">
                  <i class="ws-input-icon ws-activity-icon" aria-hidden="true">↗</i> Activity
                </span>
                <span class="ws-number-input-wrap">
                  <input id="ws-entry-activity" name="activity"
                    type="number" min="0" max="1440" step="1" placeholder="0" required />
                  <small>mins</small>
                </span>
              </label>

            </div>
          </fieldset>

          <!-- Note -->
          <label class="ws-note-label" for="ws-entry-note">
            A note to yourself <span>optional</span>
          </label>
          <textarea id="ws-entry-note" name="note" maxlength="240" rows="2"
            placeholder="Anything you'd like to remember about today?"></textarea>

          <!-- Actions -->
          <button class="ws-submit-entry" id="ws-submit-entry" type="submit">
            Save my check-in <span aria-hidden="true">→</span>
          </button>
          <p class="ws-form-error" id="ws-form-error" role="alert" hidden></p>
          <p class="ws-privacy-note"><span aria-hidden="true">♧</span> Stored on this device. Nothing leaves.</p>
        </form>
      </section>

    </main>
  `;

  // ── Helpers ─────────────────────────────────────────────────────────────
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function toDateInput(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  const today = startOfDay(new Date());

  const form          = root.querySelector("#ws-checkin-form");
  const dateInput     = root.querySelector("#ws-entry-date");
  const sleepInput    = root.querySelector("#ws-entry-sleep");
  const sleepOutput   = root.querySelector("#ws-sleep-output");
  const waterInput    = root.querySelector("#ws-entry-water");
  const waterCups     = root.querySelector("#ws-water-cups");
  const waterDesc     = root.querySelector("#ws-water-cups-desc");
  const waterDec      = root.querySelector("#ws-water-decrease");
  const waterInc      = root.querySelector("#ws-water-increase");
  const activityInput = root.querySelector("#ws-entry-activity");
  const noteInput     = root.querySelector("#ws-entry-note");
  const submitBtn     = root.querySelector("#ws-submit-entry");
  const errorEl       = root.querySelector("#ws-form-error");
  const stepLabel     = root.querySelector("#ws-form-step");

  // Date bounds
  dateInput.max = toDateInput(today);
  dateInput.min = toDateInput(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29));
  dateInput.value = toDateInput(today);

  // Sleep slider
  function updateSleep() { sleepOutput.value = sleepInput.value; }
  sleepInput.addEventListener("input", updateSleep);
  updateSleep();

  // Water stepper
  function updateWater() {
    const n = Math.max(0, Math.min(Number(waterInput.value) || 0, 16));
    waterInput.value = String(n);
    waterCups.replaceChildren();
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.className = "ws-water-cup"; s.textContent = "🥛";
      waterCups.append(s);
    }
    waterDesc.textContent = `${n} ${n === 1 ? "glass" : "glasses"} selected`;
    waterDec.disabled = n <= 0;
    waterInc.disabled = n >= 16;
  }
  waterInput.addEventListener("input", updateWater);
  waterDec.addEventListener("click", () => { waterInput.value = String(Math.max(0, (Number(waterInput.value)||0) - 1)); updateWater(); });
  waterInc.addEventListener("click", () => { waterInput.value = String(Math.min(16, (Number(waterInput.value)||0) + 1)); updateWater(); });
  updateWater();

  // Back button
  root.querySelector(".ws-checkin-back").addEventListener("click", () => onBack?.());

  // ── Form submission ──────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.firstChild.textContent = editingId ? "Updating… " : "Saving… ";

    const data = new FormData(form);
    const payload = {
      date:     String(data.get("date")),
      mood:     Number(data.get("mood")),
      sleep:    Number(data.get("sleep")),
      water:    Number(data.get("water")),
      activity: Number(data.get("activity") || 0),
      note:     String(data.get("note") || "").trim(),
    };

    try {
      const url    = editingId ? `/api/checkins/${editingId}` : "/api/checkins";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Could not save this check-in.");

      onSaved?.({ ...payload, id: result.id ?? editingId });
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.firstChild.textContent = editingId ? "Update my check-in " : "Save my check-in ";
    }
  }

  form.addEventListener("submit", handleSubmit);

  // ── Load existing entry for editing ─────────────────────────────────────
  async function loadForEdit(id) {
    submitBtn.disabled = true;
    submitBtn.firstChild.textContent = "Loading… ";
    try {
      const res = await fetch(`/api/checkins/${id}`, { credentials: "include" });
      const rec = await res.json();
      if (!res.ok) throw new Error(rec.error || "Could not load this check-in.");

      dateInput.value = rec.date;
      const radio = root.querySelector(`input[name="mood"][value="${rec.mood}"]`);
      if (radio) radio.checked = true;
      sleepInput.value = String(rec.sleep);
      waterInput.value = String(rec.water);
      activityInput.value = String(rec.activity);
      noteInput.value = rec.note;
      stepLabel.textContent = "EDIT YOUR CHECK-IN";
      submitBtn.firstChild.textContent = "Update my check-in ";
      submitBtn.disabled = false;
      updateSleep();
      updateWater();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      submitBtn.firstChild.textContent = "Save my check-in ";
    }
  }

  if (editingId) loadForEdit(editingId);

  function destroy() {}

  return { el: root, destroy };
}
