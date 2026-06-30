/**
 * forum.js — Vortex07 website community forum renderer.
 *
 * Fetches thread list from GET https://vortex07.vercel.app/api/forum
 * and renders them into #forum-list as retro-styled post cards.
 * Read-only — posting is done via the Forum tab inside the extension.
 */
(function () {
  'use strict';

  const API_URL = 'https://vortex07.vercel.app/api/forum';
  const LIST_ID = 'forum-list';
  const STATUS_ID = 'forum-status';

  /** Format an ISO date string as a human-readable relative or absolute date. */
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 7)   return days + 'd ago';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  /** Sanitise a string for safe insertion as text content. */
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str ?? '');
    return d.innerHTML;
  }

  /** Show a status message in the status container. */
  function setStatus(msg) {
    const el = document.getElementById(STATUS_ID);
    if (el) el.textContent = msg;
  }

  /** Render an array of thread objects into the list container. */
  function renderThreads(threads) {
    const list = document.getElementById(LIST_ID);
    if (!list) return;

    setStatus('');

    if (!threads || threads.length === 0) {
      list.innerHTML = '<div class="forum-status">No threads yet. Be the first to post from the extension!</div>';
      return;
    }

    list.innerHTML = threads.map(function (thread) {
      const title    = esc(thread.title   || thread.subject || '(untitled)');
      const author   = esc(thread.author  || thread.userId  || thread.user || 'Anonymous');
      const replies  = Number(thread.replyCount ?? thread.replies ?? 0);
      const views    = thread.views != null ? Number(thread.views) : null;
      const date     = formatDate(thread.createdAt || thread.date || thread.timestamp);
      const id       = thread.id || thread._id || '';

      const viewMeta = views != null
        ? `<span>${views.toLocaleString()} view${views !== 1 ? 's' : ''}</span>`
        : '';

      return (
        '<div class="forum-thread" role="article">' +
          '<span class="forum-thread__title">' + title + '</span>' +
          '<div class="forum-thread__meta">' +
            '<span>by <strong>' + author + '</strong></span>' +
            '<span>' + replies.toLocaleString() + ' repl' + (replies !== 1 ? 'ies' : 'y') + '</span>' +
            viewMeta +
            (date ? '<span>' + date + '</span>' : '') +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  /** Fetch threads from the API and render them. */
  function loadForum() {
    setStatus('Loading forum\u2026');

    fetch(API_URL, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
        return res.json();
      })
      .then(function (data) {
        // The API may return an array directly or wrap it in { threads: [...] }
        const threads = Array.isArray(data) ? data : (data.threads || data.posts || []);
        renderThreads(threads);
      })
      .catch(function (err) {
        const list = document.getElementById(LIST_ID);
        if (list) {
          list.innerHTML =
            '<div class="forum-status">' +
              '⚠ Could not load forum threads. The API may be temporarily unavailable.' +
            '</div>';
        }
        setStatus('');
        console.error('[Vortex07 forum]', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadForum);
  } else {
    loadForum();
  }
})();
