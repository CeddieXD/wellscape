// Vanilla port of the original api.ts auth client.
// Same-origin by default; the frontend is served by the Node backend.

const apiBaseUrl = "";

async function authenticate(path, credentials) {
  const response = await fetch(`${apiBaseUrl}/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(credentials),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof result?.error === "string"
        ? result.error
        : "We couldn't sign you in. Please try again."
    );
  }

  return result; // { user: { id, name, email } }
}

export const api = {
  login(email, password) {
    return authenticate("auth/login", { email, password });
  },
  register(name, email, password) {
    return authenticate("auth/register", { name, email, password });
  },
  async session() {
    // The endpoint always responds 200 with { user } or { user: null },
    // so a logged-out visitor never triggers a red console error.
    const response = await fetch(`${apiBaseUrl}/api/auth/session`, {
      credentials: "include",
    });
    if (!response.ok) return null;
    const result = await response.json().catch(() => null);
    return result?.user ? result : null;
  },
  async logout() {
    await fetch(`${apiBaseUrl}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  },

  // ---- Wellness monitoring ----
  async getWellness() {
    const response = await fetch(`${apiBaseUrl}/api/wellness`, {
      credentials: "include",
    });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  },
  async completeTask(taskId, label) {
    const response = await fetch(`${apiBaseUrl}/api/wellness/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ taskId, label }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        typeof result?.error === "string" ? result.error : "Could not save your progress."
      );
    }
    return result; // wellness summary
  },
};
