// Vanilla port of AuthScreen.tsx.
// Renders the login / register screen and calls back with the session on success.
import { api } from "./api.js";

const ICONS = {
  lock: '<rect x="3" y="10" width="18" height="11" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/><path d="M12 14v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  waves:
    '<path d="M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 13c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 18c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>',
};

function icon(kind) {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind]}</svg>`;
}

/**
 * @param {object} opts
 * @param {(session:{user:{id:string,name:string,email:string}})=>void} opts.onAuthenticated
 * @param {string} [opts.notice]
 * @returns {HTMLElement}
 */
export function AuthScreen({ onAuthenticated, notice }) {
  let mode = "login"; // "login" | "register"
  let submitting = false;
  let error = "";

  const root = document.createElement("main");
  root.className = "auth-screen view-enter";

  function render() {
    const isLogin = mode === "login";
    root.innerHTML = `
      <a class="auth-brand" href="#welcome"><span class="brand-mark">${icon("waves")}</span>wellscape</a>
      <div class="auth-illustration" aria-hidden="true"><span>☼</span><i></i><b></b></div>
      <section class="auth-card">
        <span class="eyebrow">A LITTLE SPACE FOR YOU</span>
        <h1>${isLogin ? "Welcome back." : "Join us!"}</h1>
        <p>${
          isLogin
            ? "Pick up where your wellness journey and little world left off."
            : "Create an account and start your wellness journey with the Wellscape community."
        }</p>
        ${notice ? `<p class="auth-notice" role="status">${notice}</p>` : ""}
        <form class="auth-form" novalidate>
          ${
            isLogin
              ? ""
              : `<label>Your name<input name="name" autocomplete="name" required maxlength="40" placeholder="What should we call you?" /></label>`
          }
          <label>Email address<span class="auth-input">${icon("mail")}<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com" /></span></label>
          <label>Password<span class="auth-input">${icon("lock")}<input name="password" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}" minlength="8" maxlength="128" required placeholder="At least 8 characters" /></span></label>
          ${
            isLogin
              ? ""
              : `<label>Confirm password<span class="auth-input">${icon("lock")}<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required placeholder="Type your password again" /></span></label>`
          }
          ${error ? `<p class="auth-error" role="alert">${error}</p>` : ""}
          <button class="primary-button auth-submit" ${submitting ? "disabled" : ""}>${
            submitting ? "One moment..." : isLogin ? "Log in" : "Create my account"
          } <span>→</span></button>
        </form>
        <p class="auth-switch">${isLogin ? "New to Wellscape?" : "Already have an account?"} <button type="button" class="switch-mode"> ${
          isLogin ? "Sign up" : "Log in"
        }</button></p>
      </section>
      <p class="auth-whisper">Small steps. Big changes.</p>
    `;

    root.querySelector(".switch-mode").addEventListener("click", () => {
      mode = isLogin ? "register" : "login";
      error = "";
      render();
    });

    root.querySelector(".auth-form").addEventListener("submit", submit);
  }

  async function submit(event) {
    event.preventDefault();
    error = "";
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const name = (data.name || "").trim();
    const email = (data.email || "").trim();
    const password = data.password || "";
    const confirmPassword = data.confirmPassword || "";

    if (mode === "register" && password !== confirmPassword) {
      error = "Those passwords do not match yet.";
      render();
      return;
    }

    submitting = true;
    render();

    try {
      const session =
        mode === "register"
          ? await api.register(name, email, password)
          : await api.login(email, password);
      onAuthenticated(session);
    } catch (reason) {
      error =
        reason instanceof Error
          ? reason.message
          : "We couldn't sign you in. Please try again.";
      submitting = false;
      render();
    }
  }

  render();
  return root;
}
