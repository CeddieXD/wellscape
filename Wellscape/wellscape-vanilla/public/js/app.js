// App flow:
//   auth
//     → dashboard       (main hub: analytics, habits, check-ins)
//         → Enter Plaza → character select → game
//         → Add Check-in → check-in form → back to dashboard
//         → Exit Game (from inside game) → back to dashboard

import { api } from "./api.js";
import { AuthScreen } from "./authScreen.js";
import { CharacterSelect, getSavedCharacter } from "./characterSelect.js";
import { DashboardView } from "./dashboardView.js";
import { CheckinView } from "./checkinView.js";
import { GameScreen } from "./gameScreen.js";

const root = document.getElementById("root");
let current = null;
let currentUser = null;

function mount(node, controller) {
  if (current?.destroy) current.destroy();
  root.replaceChildren(node);
  current = controller ?? null;
}

function firstName(user) {
  if (!user?.name) return "You";
  return user.name.trim().split(/\s+/)[0] || "You";
}

// ── Views ─────────────────────────────────────────────────────────────────

function showDashboard() {
  const view = DashboardView({
    user: currentUser,
    onEnterPlaza: () => showCharacterSelect(),
    onCheckin: () => showCheckin(),
    onLogout: async () => {
      await api.logout();
      currentUser = null;
      showAuth("You've been signed out. See you soon.");
    },
    onNav: (section) => {
      if (section === "analytics") showDashboard();
    },
  });
  mount(view.el, view);
}

function showCheckin(editId = null) {
  const view = CheckinView({
    editId,
    onBack: () => showDashboard(),
    onSaved: () => showDashboard(),  // return to dashboard after saving
  });
  mount(view.el, view);
}

function showCharacterSelect() {
  const screen = CharacterSelect({
    initial: getSavedCharacter(),
    greeting: currentUser ? `Hi ${firstName(currentUser)}!` : "",
    onConfirm: (characterId) => showGame(characterId),
  });
  mount(screen, null);
}

async function showGame(characterId) {
  const wellness = await api.getWellness().catch(() => null);
  const completedTaskIds = wellness?.todayTasks ?? [];

  const game = GameScreen({
    characterId,
    playerName: firstName(currentUser),
    completedTaskIds,
    onChangeCharacter: () => showCharacterSelect(),
    onBack: () => showDashboard(),   // Exit Game → back to dashboard, not logout
  });
  mount(game.el, game);
  game.start();
}

function showAuth(notice) {
  const screen = AuthScreen({
    notice,
    onAuthenticated: (session) => {
      currentUser = session.user;
      console.log("✅ Signed in as", session.user.name);
      showDashboard();               // always go to dashboard first after login
    },
  });
  mount(screen, null);
}

// ── Boot ──────────────────────────────────────────────────────────────────

async function boot() {
  const session = await api.session();
  if (session?.user) {
    currentUser = session.user;
    showDashboard();
  } else {
    showAuth();
  }
}

boot();
