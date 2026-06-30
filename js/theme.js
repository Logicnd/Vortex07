/**
 * theme.js — Vortex07 website dark/light mode toggle.
 *
 * Strategy:
 *  1. On load, check localStorage("v07-theme").
 *  2. If set, apply that value as data-theme on <html>.
 *  3. If not set, honour prefers-color-scheme (CSS handles this automatically).
 *  4. The toggle button cycles light → dark → system and updates both the
 *     attribute and localStorage.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'v07-theme';
  const MODES = ['system', 'light', 'dark'];

  /** Apply the stored or detected theme to <html>. */
  function applyTheme(mode) {
    if (mode === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', mode);
    }
  }

  /** Return the current effective appearance ('light' | 'dark'). */
  function effectiveMode(mode) {
    if (mode !== 'system') return mode;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /** Update button label to reflect current mode. */
  function updateButton(btn, mode) {
    const effective = effectiveMode(mode);
    const labels = { light: 'Light', dark: 'Dark', system: 'Auto' };
    btn.textContent = labels[mode] || labels.system;
    btn.title = `Theme: ${mode} (click to cycle)`;
    btn.setAttribute('aria-label', `Current theme: ${mode}. Click to change.`);
  }

  function init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    let current = MODES.includes(saved) ? saved : 'system';

    // Apply immediately (before paint where possible).
    applyTheme(current);

    // Wire up every .theme-toggle button on the page.
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      updateButton(btn, current);

      btn.addEventListener('click', function () {
        const idx = MODES.indexOf(current);
        current = MODES[(idx + 1) % MODES.length];
        localStorage.setItem(STORAGE_KEY, current);
        applyTheme(current);
        document.querySelectorAll('.theme-toggle').forEach(function (b) {
          updateButton(b, current);
        });
      });
    });

    // Keep in sync when the OS preference changes (only matters in "system" mode).
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (current === 'system') {
        document.querySelectorAll('.theme-toggle').forEach(function (b) {
          updateButton(b, current);
        });
      }
    });
  }

  // Run as early as possible — DOMContentLoaded is fine for button wiring,
  // but the applyTheme call needs to happen synchronously (inline <script>
  // in <head> would be ideal; this module is deferred so we just call init).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
