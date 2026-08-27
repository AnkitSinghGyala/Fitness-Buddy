(function () {
  const messagesEl = () => document.getElementById("messages");
  const statusEl = () => document.getElementById("chat-status");

  function setStatus(text, isOffline) {
    const el = statusEl();
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("is-offline", !!isOffline);
  }

  function appendBubble(role, text) {
    const box = messagesEl();
    if (!box) return;

    const wrap = document.createElement("div");
    if (role === "user") {
      wrap.className = "msg msg--user";
      wrap.textContent = text;
    } else {
      wrap.className = "msg msg--bot";
      const label = document.createElement("span");
      label.className = "msg-label";
      label.textContent = "Coach";
      const body = document.createElement("p");
      body.className = "msg-body";
      body.style.margin = "0";
      body.style.whiteSpace = "pre-wrap";
      body.textContent = text;
      wrap.appendChild(label);
      wrap.appendChild(body);
    }
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
  }

  window.appendCoachMessage = function (text) {
    appendBubble("assistant", text);
  };

  function localCoachReply(message) {
    const m = message.toLowerCase().trim();
    
    // Retrieve the active tracker state
    let state = {};
    if (typeof window.getTrackerState === "function") {
      state = window.getTrackerState();
    }
    
    const food = state.foodTotal || 0;
    const burned = state.exerciseTotal || 0;
    const target = state.calorieGoal || 2000;
    const water = state.waterIntake || 0;
    const steps = state.stepsCount || 0;
    const mins = state.activeMinutes || 0;
    const protein = state.totalProtein || 0;
    const carbs = state.totalCarbs || 0;
    const fat = state.totalFat || 0;
    const pGoal = (state.macroGoals?.protein) || 100;
    const cGoal = (state.macroGoals?.carbs) || 250;
    const fGoal = (state.macroGoals?.fat) || 70;

    // 1. Greetings & Identity
    if (/^(hi|hello|hey|greetings|hola|who are you|what is your name)/.test(m)) {
      let greet = "Hello! I am your Fitness Buddy Coach. 🦾\n\n";
      greet += "I can help you track your progress, suggest recipes, calculate your BMR, or give workout tips. ";
      greet += "What is your main goal today (e.g., lose fat, gain muscle, or review your current stats)?";
      return greet;
    }

    // 2. Status or progress summary
    if (/status|progress|today|how am i|my day|log|summary|review|stats/.test(m)) {
      let reply = `Here is your real-time fitness summary for today:\n\n`;
      reply += `• 🍎 **Calorie Intake:** ${Math.round(food)} kcal consumed / ${target} kcal target.\n`;
      reply += `• 🏃 **Workout Burn:** ${Math.round(burned)} kcal burned / active for ${mins} mins.\n`;
      reply += `• 💧 **Hydration:** ${water} ml logged (Goal: 2000 ml).\n`;
      reply += `• 👣 **Activity:** ${steps} steps logged (Goal: 10000 steps).\n\n`;
      
      const exceeded = [];
      if (food > target) exceeded.push("Calories");
      if (protein > pGoal) exceeded.push("Protein");
      if (carbs > cGoal) exceeded.push("Carbs");
      if (fat > fGoal) exceeded.push("Fat");

      if (exceeded.length > 0) {
        reply += `⚠️ **Notice:** You have exceeded your daily limit for **${exceeded.join(", ")}** today. Adjust your next meals accordingly!`;
      } else if (food > 0) {
        reply += `💪 You are on track with your goals! Keep up the good work.`;
      } else {
        reply += `⚡ Your logs are currently empty. Try adding some water, steps, or meals to get started!`;
      }
      return reply;
    }

    // 3. Protein questions & recommendations
    if (/protein/.test(m)) {
      let rep = `Your daily protein goal is **${pGoal}g** (logged: **${Math.round(protein)}g**).\n\n`;
      rep += `• **High-Protein Options:**\n`;
      rep += `  - *Vegetarian:* Paneer (18g/100g), Soya chunks (52g/100g), Greek Yogurt (10g/100g), Lentils/Dals.\n`;
      rep += `  - *Non-Vegetarian:* Chicken breast (31g/100g), Eggs (6g per egg), Salmon, Tuna.\n\n`;
      if (protein < pGoal * 0.5) {
        rep += `💡 *Tip:* You are currently below 50% of your protein goal. Try adding a protein shake or Paneer/Chicken to your next meal.`;
      } else {
        rep += `👏 Excellent protein intake so far!`;
      }
      return rep;
    }

    // 4. Carb questions
    if (/carb/.test(m)) {
      return `Your daily carbohydrate goal is **${cGoal}g** (logged: **${Math.round(carbs)}g**).\n\n` +
             `• **Complex Carbs:** Brown rice, oats, sweet potatoes, and whole wheat bread/roti provide sustained energy.\n` +
             `• **Simple Carbs:** Fruits and vegetables provide quick energy along with vitamins/minerals.\n` +
             `Avoid refined sugar and processed snacks to keep energy levels stable!`;
    }

    // 5. Fat questions
    if (/fat/.test(m)) {
      return `Your daily fat goal is **${fGoal}g** (logged: **${Math.round(fat)}g**).\n\n` +
             `Healthy fats are crucial for hormone health and vitamin absorption. Good sources include:\n` +
             `• Almonds, walnuts, chia seeds, and flax seeds\n` +
             `• Avocados and olive oil\n` +
             `• Egg yolks and fatty fish`;
    }

    // 6. Water & Hydration
    if (/hydrat|water|drink/.test(m)) {
      let rep = `Your hydration level is at **${water} ml** / 2000 ml.\n\n`;
      if (water < 1000) {
        rep += `💧 *Action Required:* You need to drink more water! Proper hydration boosts metabolism, improves digestion, and helps recovery. Drink a glass right now!`;
      } else if (water < 2000) {
        rep += `👍 Good progress. Drink another 2-3 glasses of water to hit your daily target.`;
      } else {
        rep += `🎉 Great job! You've met your daily hydration target.`;
      }
      return rep;
    }

    // 7. Steps & activity
    if (/steps|walk|move|neat/.test(m)) {
      let rep = `You have logged **${steps} steps** today (Goal: 10,000 steps).\n\n`;
      if (steps < 5000) {
        rep += `👣 *Active Tip:* You are quite sedentary today. A quick 15-minute walk can add 2,000 steps and boost your mood and cardiovascular health!`;
      } else if (steps < 10000) {
        rep += `🏃 Keep going! You're more than halfway to your step goal.`;
      } else {
        rep += `🏆 Amazing! You hit your step target. Walking keeps your metabolism active (NEAT).`;
      }
      return rep;
    }

    // 8. Workouts & Exercise
    if (/workout|exercise|active|stopwatch|timer|burn/.test(m)) {
      return `You have completed **${mins} active minutes** of exercise today, burning **${Math.round(burned)} kcal**.\n\n` +
             `• **Looking for a workout plan?**\n` +
             `  - *Strength (30m):* 3 sets of squats, push-ups, lunges, and planks (10-15 reps each).\n` +
             `  - *Cardio (20m):* HIIT with jumping jacks, high knees, mountain climbers, and burpees (40s work, 20s rest).`;
    }

    // 9. Recipes / Diet suggestions
    if (/suggest|recipe|diet|meal|eat|food|breakfast|lunch|dinner|snack/.test(m)) {
      let rec = `Here is a custom meal recommendation based on your active state:\n\n`;
      if (protein < pGoal * 0.5) {
        rec += `🍳 **High-Protein Option:**\n` +
               `- *Meal:* Scrambled eggs/tofu with spinach and whole wheat toast, or paneer tikka salad.\n` +
               `- *Macros:* ~30g Protein, ~25g Carbs, ~15g Fat.\n\n`;
      } else {
        rec += `🥗 **Balanced Meal Option:**\n` +
               `- *Meal:* Quinoa/Brown rice with mixed beans/chickpeas, sautéed vegetables, and a side of curd.\n` +
               `- *Macros:* ~15g Protein, ~60g Carbs, ~10g Fat.\n\n`;
      }
      rec += `💡 *Tip:* Use the 'Food Log' section of the dashboard to search the database of 1000+ Indian dishes and log your calories by grams!`;
      return rec;
    }

    // 10. BMR & TDEE explanation
    if (/bmr|tdee|calculate|calories goal/.test(m)) {
      return `BMR (Basal Metabolic Rate) is the energy your body needs at rest. TDEE (Total Daily Energy Expenditure) is BMR plus activity calories.\n\n` +
             `To calculate BMR (Mifflin-St Jeor Formula):\n` +
             `• *Men:* 10 × weight (kg) + 6.25 × height (cm) - 5 × age (y) + 5\n` +
             `• *Women:* 10 × weight (kg) + 6.25 × height (cm) - 5 × age (y) - 161\n\n` +
             `Your current target is set to **${target} kcal** based on your goals.`;
    }

    // 11. Weight loss tips
    if (/lose|fat|deficit|weight loss/.test(m)) {
      return `To lose weight sustainably:\n\n` +
             `1. **Consistent Deficit:** Aim for 300-500 calories below your TDEE (maintenance).\n` +
             `2. **High Protein:** Keep protein high (**${pGoal}g** target) to preserve lean muscle tissue.\n` +
             `3. **Hydration & Sleep:** Drink 2L+ water and sleep 7-8 hours to support fat loss.\n` +
             `Current logged weight trend can be viewed in the 'Weight Tracker' line graph on your dashboard!`;
    }

    // 12. Muscle building tips
    if (/gain|muscle|bulk|surplus/.test(m)) {
      return `To build muscle:\n\n` +
             `1. **Calorie Surplus:** Aim for 200-300 calories above maintenance to support muscle synthesis.\n` +
             `2. **Progressive Overload:** Increase weights or reps during resistance workouts.\n` +
             `3. **Protein Target:** Meet your daily protein goal of **${pGoal}g** for optimal muscle recovery.`;
    }

    return "I am in smart local coach mode. Ask me about your 'status', 'protein', 'carbs', 'fats', 'water', 'steps', 'workouts', 'suggest a recipe', or how to 'lose weight' to get personalized advice based on your tracker data!";
  }

  function chatUrls() {
    const list = [];
    if (location.protocol !== "file:" && location.origin) {
      list.push(location.origin + "/api/chat");
    }
    const localUrl = "http://localhost:3000/api/chat";
    if (location.origin !== "http://localhost:3000" && location.protocol !== "https:") {
      list.push(localUrl);
    }
    return list;
  }

  async function tryFetchReply(message) {
    let trackerState = {};
    if (typeof window.getTrackerState === "function") {
      trackerState = window.getTrackerState();
    }

    const config = JSON.parse(localStorage.getItem("fitness_buddy_chat_config") || "{}");

    for (const url of chatUrls()) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            message,
            trackerState,
            customProvider: config.provider || "",
            customApiKey: config.apiKey || "",
            customModel: config.model || ""
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const reply = data.reply ?? data.message ?? data.text;
        if (reply && String(reply).trim()) return String(reply).trim();
      } catch (_) {
        /* try next */
      }
    }
    return null;
  }

  function removeTyping() {
    document.getElementById("chat-typing")?.remove();
  }

  async function loadChatHistory() {
    try {
      const res = await fetch("/api/chat/history", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const box = messagesEl();
        if (box && data.history && data.history.length > 0) {
          box.innerHTML = '';
          data.history.forEach(msg => {
            appendBubble(msg.role, msg.content);
          });
        }
      }
    } catch (e) {
      console.error("Error loading chat history:", e);
    }
  }

  async function sendMessage() {
    const input = document.getElementById("user-input");
    const btn = document.getElementById("send-btn");
    const message = input.value.trim();
    if (!message || !btn) return;

    appendBubble("user", message);
    input.value = "";
    btn.disabled = true;
    setStatus("Thinking…", false);

    const box = messagesEl();
    const typing = document.createElement("div");
    typing.id = "chat-typing";
    typing.className = "msg msg--bot msg--typing";
    typing.textContent = "Coach is typing…";
    box.appendChild(typing);
    box.scrollTop = box.scrollHeight;

    let reply = await tryFetchReply(message);
    const fromApi = !!reply;
    if (!reply) {
      reply = localCoachReply(message);
      // Offline fallback: manually push user & local assistant message to chat history
      try {
        await fetch("/api/chat/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ role: "user", content: message })
        });
        await fetch("/api/chat/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ role: "assistant", content: reply })
        });
      } catch (e) {
        console.error("Error saving offline chat message to history:", e);
      }
    }

    removeTyping();
    btn.disabled = false;

    appendBubble("assistant", reply);
    setStatus(fromApi ? "Ready" : "Offline tips", !fromApi);
    box.scrollTop = box.scrollHeight;
  }

  function bind() {
    loadChatHistory();

    document.getElementById("send-btn")?.addEventListener("click", sendMessage);
    document.getElementById("user-input")?.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });

    document.querySelectorAll(".prompt-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        const prompt = chip.getAttribute("data-prompt");
        if (!prompt) return;
        const input = document.getElementById("user-input");
        if (input) input.value = prompt;
        sendMessage();
      });
    });

    // Custom API Configuration bindings
    const toggleBtn = document.getElementById("chat-settings-toggle");
    const panel = document.getElementById("chat-settings-panel");
    const closeBtn = document.getElementById("close-chat-settings");
    const providerSelect = document.getElementById("chat-provider");
    const modelWrapper = document.getElementById("chat-model-wrapper");
    const modelInput = document.getElementById("chat-model");
    const apiKeyInput = document.getElementById("chat-apikey");
    const saveBtn = document.getElementById("save-chat-settings");
    const clearBtn = document.getElementById("clear-chat-settings");

    function loadConfig() {
      const config = JSON.parse(localStorage.getItem("fitness_buddy_chat_config") || "{}");
      if (providerSelect) providerSelect.value = config.provider || "gemini";
      if (modelInput) modelInput.value = config.model || "";
      if (apiKeyInput) apiKeyInput.value = config.apiKey || "";
      updateModelVisibility();
    }

    function updateModelVisibility() {
      if (!providerSelect || !modelWrapper) return;
      const prov = providerSelect.value;
      if (prov === "openrouter" || prov === "openai") {
        modelWrapper.style.display = "block";
        if (prov === "openai") {
          modelInput.placeholder = "e.g. gpt-4o-mini";
        } else {
          modelInput.placeholder = "e.g. liquid/lfm-2.5-1.2b-instruct:free";
        }
      } else {
        modelWrapper.style.display = "none";
      }
    }

    if (toggleBtn && panel) {
      toggleBtn.addEventListener("click", () => {
        const isOpen = panel.style.display === "block";
        panel.style.display = isOpen ? "none" : "block";
        if (!isOpen) loadConfig();
      });
    }
    if (closeBtn && panel) {
      closeBtn.addEventListener("click", () => {
        panel.style.display = "none";
      });
    }
    if (providerSelect) {
      providerSelect.addEventListener("change", updateModelVisibility);
    }
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const provider = providerSelect.value;
        const apiKey = apiKeyInput.value.trim();
        const model = modelInput.value.trim();
        localStorage.setItem("fitness_buddy_chat_config", JSON.stringify({ provider, apiKey, model }));
        if (panel) panel.style.display = "none";
        appendBubble("assistant", `AI Coach configured with ${provider}!`);
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        localStorage.removeItem("fitness_buddy_chat_config");
        if (apiKeyInput) apiKeyInput.value = "";
        if (modelInput) modelInput.value = "";
        if (providerSelect) providerSelect.value = "gemini";
        updateModelVisibility();
        if (panel) panel.style.display = "none";
        appendBubble("assistant", "Configuration cleared. Reverting to local fallback.");
      });
    }

    loadConfig();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
