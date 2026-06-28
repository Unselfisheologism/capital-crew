/**
 * Capital Crew — Auth UI
 *
 * Renders a fullscreen login/signup form as a DOM overlay above the Phaser canvas.
 * Returns a promise that resolves to the logged-in AuthUser on success.
 * Aborts (resolves null) if the user closes the form.
 */
import {
  signIn,
  signUp,
  signOut,
  currentUser,
  validateUsername,
  validatePassword,
  type AuthUser,
} from './AuthClient';

export async function ensureAuth(): Promise<AuthUser | null> {
  const existing = currentUser();
  if (existing) return existing;
  return showLoginUI();
}

export async function logoutAndReauth(): Promise<AuthUser | null> {
  signOut();
  return showLoginUI();
}

export async function showLoginUI(): Promise<AuthUser | null> {
  // Remove any prior overlay
  document.getElementById('cc-auth-overlay')?.remove();

  return new Promise<AuthUser | null>((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'cc-auth-overlay';
    overlay.className = 'cc-auth-root';
    overlay.innerHTML = `
      <div class="cc-auth-card">
        <div class="cc-auth-logo">
          <div class="cc-auth-title">CAPITAL CREW</div>
          <div class="cc-auth-subtitle">Economic Strategy Game</div>
        </div>

        <div class="cc-auth-tabs">
          <button class="cc-auth-tab cc-auth-tab-active" data-tab="signin">Sign In</button>
          <button class="cc-auth-tab" data-tab="signup">Create Account</button>
        </div>

        <form class="cc-auth-form" id="cc-auth-form" autocomplete="off">
          <label class="cc-auth-label">
            Username
            <input class="cc-auth-input" type="text" name="username" id="cc-auth-username"
                   minlength="3" maxlength="20"
                   placeholder="3-20 chars, letters/numbers/_" required>
          </label>
          <label class="cc-auth-label">
            Password
            <input class="cc-auth-input" type="password" name="password" id="cc-auth-password"
                   minlength="6" maxlength="72" placeholder="At least 6 characters" required>
          </label>
          <div class="cc-auth-error" id="cc-auth-error"></div>
          <button class="cc-auth-submit" type="submit" id="cc-auth-submit">Sign In</button>
        </form>

        <div class="cc-auth-footer">
          Built on Supabase · bcrypt-hashed · No email required<br>
          <a href="/privacy.html" target="_blank" rel="noopener" class="cc-auth-link">Privacy Policy</a>
          · <a href="/terms.html" target="_blank" rel="noopener" class="cc-auth-link">Terms of Service</a>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector<HTMLFormElement>('#cc-auth-form')!;
    const usernameInput = overlay.querySelector<HTMLInputElement>('#cc-auth-username')!;
    const passwordInput = overlay.querySelector<HTMLInputElement>('#cc-auth-password')!;
    const errBox = overlay.querySelector<HTMLDivElement>('#cc-auth-error')!;
    const submitBtn = overlay.querySelector<HTMLButtonElement>('#cc-auth-submit')!;
    const tabs = overlay.querySelectorAll<HTMLButtonElement>('.cc-auth-tab');

    let mode: 'signin' | 'signup' = 'signin';

    tabs.forEach((t) => {
      t.addEventListener('click', () => {
        tabs.forEach((x) => x.classList.remove('cc-auth-tab-active'));
        t.classList.add('cc-auth-tab-active');
        mode = t.dataset.tab as 'signin' | 'signup';
        submitBtn.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
        errBox.textContent = '';
      });
    });

    const showError = (m: string) => {
      errBox.textContent = m;
      errBox.classList.add('cc-auth-error-show');
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.classList.remove('cc-auth-error-show');

      const u = usernameInput.value.trim();
      const p = passwordInput.value;

      const uErr = validateUsername(u);
      if (uErr) {
        showError(uErr);
        return;
      }
      const pErr = validatePassword(p);
      if (pErr) {
        showError(pErr);
        return;
      }

      submitBtn.disabled = true;
      const origText = submitBtn.textContent;
      submitBtn.textContent = mode === 'signin' ? 'Signing in...' : 'Creating account...';

      try {
        const res =
          mode === 'signin' ? await signIn(u, p) : await signUp(u, p);
        if (!res.ok) {
          showError(res.error ?? 'Authentication failed');
          submitBtn.disabled = false;
          submitBtn.textContent = origText;
          return;
        }
        overlay.remove();
        resolve(res.user!);
      } catch (e2) {
        showError((e2 as Error).message ?? 'Unknown error');
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
      }
    });

    // Focus username on render
    setTimeout(() => usernameInput.focus(), 50);
  });
}
