/**
 * Capital Crew — ROLE PICKER (game start sub-role selection)
 *
 * 3 sub-role cards + 1 PRACTICE MODE card. Practice mode returns
 * `__PRACTICE__` as the "role id" — main.ts checks for it and bypasses
 * AI + assassin + emergencies + sabotage in the GameScene.
 */
import { ROLES, type RoleId } from '../systems/PlayerRoles';

export const PRACTICE_MODE_ID = '__PRACTICE__' as const;

export async function showRolePicker(): Promise<RoleId | typeof PRACTICE_MODE_ID> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'cc-role-root';
    overlay.innerHTML = `
      <div class="cc-role-card">
        <div class="cc-role-title">🎭 SELECT YOUR SUB-ROLE</div>
        <div class="cc-role-subtitle">Choose a specialization. Each gives you a unique advantage.</div>
        <div class="cc-role-grid"></div>
        <div class="cc-practice-row">
          <div class="cc-practice-cell" id="cc-practice-cell">
            <div class="cc-practice-icon">🎓</div>
            <div class="cc-practice-name">PRACTICE MODE</div>
            <div class="cc-practice-short">Solo sandbox. No AI, no assassin, no sabotage, no end condition.</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const grid = overlay.querySelector<HTMLDivElement>('.cc-role-grid')!;

    for (const role of ROLES) {
      const c = document.createElement('div');
      c.className = 'cc-role-cell';
      c.style.setProperty('--role-color', `#${role.color.toString(16).padStart(6, '0')}`);
      c.innerHTML = `
        <div class="cc-role-icon">${role.icon}</div>
        <div class="cc-role-name">${role.name}</div>
        <div class="cc-role-short">${role.shortDesc}</div>
        <div class="cc-role-desc">${role.desc}</div>
      `;
      c.addEventListener('click', () => {
        overlay.remove();
        resolve(role.id);
      });
      grid.appendChild(c);
    }

    const practice = overlay.querySelector<HTMLDivElement>('#cc-practice-cell')!;
    practice.addEventListener('click', () => {
      overlay.remove();
      resolve(PRACTICE_MODE_ID);
    });
  });
}
