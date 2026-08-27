(function () {
  const savedTheme = localStorage.getItem("theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = savedTheme || (systemPrefersDark ? "dark" : "light");

  document.documentElement.setAttribute("data-theme", initialTheme);

  function updateImages(theme) {
    const heroImg = document.getElementById("hero-img");
    if (heroImg) {
      heroImg.src = theme === "dark" ? "/images/fitness_hero_dark.png" : "/images/fitness_hero_light.png";
    }
    const coachImg = document.getElementById("coach-img");
    if (coachImg) {
      coachImg.src = theme === "dark" ? "/images/ai_coach_dark.png" : "/images/ai_coach_light.png";
    }
  }

  function updateToggleIcon(btn, theme) {
    if (!btn) return;
    btn.textContent = theme === "dark" ? "☀️" : "🌙";
  }

  function initTheme() {
    const btn = document.getElementById("theme-toggle");
    let currentTheme = document.documentElement.getAttribute("data-theme") || "dark";

    updateToggleIcon(btn, currentTheme);
    updateImages(currentTheme);

    if (btn) {
      btn.addEventListener("click", function () {
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", nextTheme);
        localStorage.setItem("theme", nextTheme);
        currentTheme = nextTheme;

        updateToggleIcon(btn, nextTheme);
        updateImages(nextTheme);

        btn.style.transition = "transform 0.4s ease";
        btn.style.transform = "rotate(360deg)";
        setTimeout(() => {
          btn.style.transform = "none";
        }, 400);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
  } else {
    initTheme();
  }
})();
