// ----- Year in footer -----
document.getElementById("year").textContent = new Date().getFullYear();

// ----- Form -----
const form = document.getElementById("applyForm");
const successPanel = document.getElementById("formSuccess");
const telegramBtn = document.getElementById("telegramBtn");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector("button[type=submit]");
    const label = submitBtn.querySelector("span");
    const original = label.textContent;
    submitBtn.disabled = true;
    label.textContent = "Sending...";

    const fd = new FormData(form);
    const data = {
      name: fd.get("name"),
      email: fd.get("email"),
      handle_type: fd.get("handle_type"),
      handle_value: fd.get("handle_value"),
      revenue: fd.get("revenue"),
      message: [
        fd.get("of_handle") ? `OF: ${fd.get("of_handle")}` : "",
        fd.get("message") || "",
      ].filter(Boolean).join("\n\n"),
    };

    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Submission failed");
      }
      const j = await res.json();

      // Show success panel
      if (telegramBtn && j.telegram_url) {
        telegramBtn.href = j.telegram_url;
      }
      form.hidden = true;
      successPanel.hidden = false;
      successPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      label.textContent = err.message || "Failed — try again";
      setTimeout(() => { label.textContent = original; submitBtn.disabled = false; }, 2500);
      return;
    }

    setTimeout(() => { label.textContent = original; submitBtn.disabled = false; }, 2500);
  });
}

// ----- Reveal on scroll -----
const revealEls = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add("is-visible"));
}

// ----- Animated counters -----
const counters = document.querySelectorAll("[data-counter]");
function animateCounter(el) {
  const target = parseFloat(el.dataset.counter);
  const suffix = el.dataset.suffix || "";
  const prefix = el.dataset.prefix || "";
  const decimals = (el.dataset.counter.split(".")[1] || "").length;
  const duration = 1600;
  const start = performance.now();

  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = (target * eased).toFixed(decimals);
    el.textContent = `${prefix}${value}${suffix}`;
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = `${prefix}${target}${suffix}`;
  }
  requestAnimationFrame(tick);
}
if ("IntersectionObserver" in window) {
  const io2 = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          io2.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 },
  );
  counters.forEach((el) => io2.observe(el));
}

// ----- 3D tilt on cards -----
const tiltCards = document.querySelectorAll(".tilt");
tiltCards.forEach((card) => {
  let rect;
  function onMove(e) {
    if (!rect) rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rx = ((y - cy) / cy) * -5;
    const ry = ((x - cx) / cx) * 5;
    card.style.transform = `translateY(-6px) perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  }
  function onLeave() { rect = null; card.style.transform = ""; }
  card.addEventListener("mousemove", onMove);
  card.addEventListener("mouseleave", onLeave);
});

// ----- Magnetic buttons -----
const magnets = document.querySelectorAll("[data-magnet]");
magnets.forEach((el) => {
  el.addEventListener("mousemove", (e) => {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    el.style.transform = `translate(${x * 0.15}px, ${y * 0.25}px)`;
  });
  el.addEventListener("mouseleave", () => { el.style.transform = ""; });
});

// ----- Cursor halo -----
const halo = document.getElementById("cursorHalo");
if (halo && window.matchMedia("(hover: hover)").matches) {
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let x = targetX, y = targetY;
  window.addEventListener("mousemove", (e) => { targetX = e.clientX; targetY = e.clientY; });
  function loop() {
    x += (targetX - x) * 0.08;
    y += (targetY - y) * 0.08;
    halo.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  }
  loop();
}

// ----- Smooth scroll for anchor links -----
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    if (id.length > 1) {
      const el = document.querySelector(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });
});

// ----- Load reach stats + featured X embeds -----
function tweetIdFromUrl(u) {
  const m = String(u || "").match(/status\/(\d+)/);
  return m ? m[1] : null;
}

async function loadReachSection() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) return;
    const s = await res.json();

    if (s.reach_followers) document.getElementById("reachFollowers").textContent = s.reach_followers;
    if (s.reach_impressions) document.getElementById("reachImpressions").textContent = s.reach_impressions;
    if (s.reach_engagement) document.getElementById("reachEngagement").textContent = s.reach_engagement;
    if (s.reach_audience) document.getElementById("reachAudience").textContent = s.reach_audience;

    const urls = [s.featured_post_1, s.featured_post_2, s.featured_post_3]
      .filter((u) => u && tweetIdFromUrl(u));

    if (urls.length === 0) return;

    const grid = document.getElementById("embedsGrid");
    const wrap = document.getElementById("reachEmbeds");
    wrap.hidden = false;

    urls.forEach((url) => {
      const wrapper = document.createElement("div");
      wrapper.className = "embed-wrap";
      wrapper.innerHTML = `
        <blockquote class="twitter-tweet" data-theme="dark" data-dnt="true">
          <a href="${url}"></a>
        </blockquote>`;
      grid.appendChild(wrapper);
    });

    // Load Twitter widgets script once
    if (!document.getElementById("twitter-wjs")) {
      const s = document.createElement("script");
      s.id = "twitter-wjs";
      s.async = true;
      s.src = "https://platform.twitter.com/widgets.js";
      document.body.appendChild(s);
    } else if (window.twttr && window.twttr.widgets) {
      window.twttr.widgets.load(grid);
    }
  } catch (e) {
    console.warn("Failed to load reach data:", e);
  }
}
loadReachSection();
