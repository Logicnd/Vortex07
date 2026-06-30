(function () {
  "use strict";

  var API = "https://vortex07.vercel.app/api/forum";
  var VOTER_KEY = "v07-forum-voter-id";

  function getVoterId() {
    var id = localStorage.getItem(VOTER_KEY);
    if (!id || id.length < 8) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "v" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(VOTER_KEY, id);
    }
    return id;
  }

  function esc(str) {
    var d = document.createElement("div");
    d.textContent = String(str == null ? "" : str);
    return d.innerHTML;
  }

  function formatDate(ms) {
    if (!ms) return "";
    var d = new Date(Number(ms) || ms);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function setStatus(msg, isError) {
    var el = document.getElementById("forum-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("forum-status--error", Boolean(isError));
  }

  function renderThreads(threads) {
    var list = document.getElementById("forum-list");
    if (!list) return;

    if (!threads || !threads.length) {
      list.innerHTML =
        '<p class="forum-empty">No posts yet. You can be the first one below.</p>';
      return;
    }

    list.innerHTML = threads
      .map(function (thread) {
        var title = esc(thread.title || "(no title)");
        var author = esc(thread.authorName || "Guest");
        var replies = Number(thread.replyCount) || 0;
        var date = formatDate(thread.createdAt || thread.lastReplyAt);
        var replyNote =
          replies > 0
            ? replies + " repl" + (replies === 1 ? "y" : "ies")
            : "no replies yet";

        return (
          '<article class="forum-post">' +
          '<h3 class="forum-post__title">' +
          title +
          "</h3>" +
          '<p class="forum-post__meta">' +
          author +
          " · " +
          date +
          " · " +
          replyNote +
          "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  function loadThreads() {
    setStatus("Loading posts…");

    var url =
      API +
      "?action=threads&category=general&voterId=" +
      encodeURIComponent(getVoterId());

    fetch(url, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        setStatus("");
        renderThreads(data.threads || []);
      })
      .catch(function () {
        setStatus(
          "Could not load posts right now. You can still try submitting — it may work.",
          true,
        );
        var list = document.getElementById("forum-list");
        if (list) list.innerHTML = "";
      });
  }

  function handleSubmit(event) {
    event.preventDefault();

    var form = event.target;
    var titleEl = form.querySelector('[name="title"]');
    var nameEl = form.querySelector('[name="name"]');
    var bodyEl = form.querySelector('[name="message"]');
    var submitBtn = form.querySelector('[type="submit"]');

    var title = (titleEl && titleEl.value.trim()) || "";
    var authorName = (nameEl && nameEl.value.trim()) || "";
    var body = (bodyEl && bodyEl.value.trim()) || "";

    if (!title || !body) {
      setStatus("Title and message are required.", true);
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Posting…";
    }
    setStatus("");

    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        action: "create-thread",
        voterId: getVoterId(),
        categoryId: "general",
        title: title,
        body: body,
        authorName: authorName || "Guest",
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.data.ok) {
          var err = (result.data && result.data.error) || "post failed";
          throw new Error(err);
        }

        if (titleEl) titleEl.value = "";
        if (bodyEl) bodyEl.value = "";
        setStatus("Posted. It should show up in the list below.");
        loadThreads();
      })
      .catch(function (err) {
        setStatus("Could not post: " + (err.message || "unknown error"), true);
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Post";
        }
      });
  }

  function init() {
    var form = document.getElementById("forum-form");
    if (form) form.addEventListener("submit", handleSubmit);
    loadThreads();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
