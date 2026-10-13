// Character selection screen.
// Shows a grid of all available characters (down-facing idle frame) and lets
// the user pick one. The choice is persisted to localStorage and handed back
// via onConfirm(characterId).

const CHARACTER_COUNT = 40;
const STORAGE_KEY = "wellscape.characterId";

export function getSavedCharacter() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === null) return null;
  const id = Number(saved);
  return Number.isInteger(id) && id >= 0 && id < CHARACTER_COUNT ? id : null;
}

function pad(n) {
  return String(n).padStart(3, "0");
}

/**
 * @param {object} opts
 * @param {(characterId:number)=>void} opts.onConfirm
 * @param {number|null} [opts.initial]  pre-selected character id
 * @param {string} [opts.greeting]      optional personalized line
 * @returns {HTMLElement}
 */
export function CharacterSelect({ onConfirm, initial = null, greeting }) {
  let selected = initial ?? getSavedCharacter();

  const root = document.createElement("main");
  root.className = "select-screen view-enter";

  const cards = [];

  function renderFooter() {
    const label = root.querySelector(".chosen-label");
    const confirm = root.querySelector(".select-confirm");
    if (selected === null) {
      label.textContent = "Pick a character to begin";
      confirm.disabled = true;
    } else {
      label.textContent = `Character #${pad(selected)} selected`;
      confirm.disabled = false;
    }
  }

  function select(id) {
    selected = id;
    cards.forEach((card, i) => card.classList.toggle("selected", i === id));
    renderFooter();
  }

  root.innerHTML = `
    <div class="select-header">
      <h1>Choose your character</h1>
      <p>${greeting ? greeting + " " : ""}Pick who you'll be in the Wellscape plaza. You can change this later.</p>
    </div>
    <div class="select-grid"></div>
    <div class="select-footer">
      <span class="chosen-label">Pick a character to begin</span>
      <button type="button" class="select-confirm" disabled>Enter Plaza →</button>
    </div>
  `;

  const grid = root.querySelector(".select-grid");
  for (let i = 0; i < CHARACTER_COUNT; i++) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "char-card";
    card.innerHTML = `
      <span class="char-preview" style="background-image:url('/characters/${pad(i)}.png')"></span>
      <span class="char-label">#${pad(i)}</span>
    `;
    card.addEventListener("click", () => select(i));
    grid.appendChild(card);
    cards.push(card);
  }

  root.querySelector(".select-confirm").addEventListener("click", () => {
    if (selected === null) return;
    localStorage.setItem(STORAGE_KEY, String(selected));
    onConfirm(selected);
  });

  // Reflect any initial selection.
  if (selected !== null) select(selected);
  renderFooter();

  return root;
}
