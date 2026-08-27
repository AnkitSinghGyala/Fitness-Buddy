let activities = [];
let totalCalories = 0;
let totalProtein = 0;
let totalCarbs = 0;
let totalFat = 0;
let pieChart;
let foodTotal = 0, exerciseTotal = 0;

// Get current date string in local format YYYY-MM-DD
const getTodayLocalDate = () => new Date().toLocaleDateString('en-CA');
let currentDate = getTodayLocalDate();


// Macro goals (dynamic)
const macroGoals = {
  protein: 100,
  carbs: 250,
  fat: 70
};

// Core Preset Data (Preserved from original index.html)
const defaultFoods = [
  { name: "Banana", calories: 105, protein: 1.3, carbs: 27, fat: 0.3 },
  { name: "Grilled Chicken", calories: 220, protein: 42, carbs: 0, fat: 5 },
  { name: "Rice Bowl", calories: 300, protein: 6, carbs: 65, fat: 0.5 },
  { name: "Oatmeal", calories: 150, protein: 5, carbs: 27, fat: 2.5 },
  { name: "Apple", calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
  { name: "Avocado Toast", calories: 250, protein: 6, carbs: 28, fat: 12 },
  { name: "Salad", calories: 180, protein: 4, carbs: 15, fat: 12 },
  { name: "Protein Shake", calories: 240, protein: 30, carbs: 5, fat: 3 },
  { name: "Boiled Egg", calories: 78, protein: 6.3, carbs: 0.6, fat: 5.3 },
  { name: "Salmon Fillet", calories: 280, protein: 34, carbs: 0, fat: 15 },
  { name: "Greek Yogurt", calories: 130, protein: 15, carbs: 6, fat: 4 },
  { name: "Almonds (1oz)", calories: 164, protein: 6, carbs: 6, fat: 14 },
  { name: "Paneer Tikka", calories: 290, protein: 18, carbs: 6, fat: 20 },
  { name: "Lentil Soup", calories: 180, protein: 12, carbs: 28, fat: 2 },
  { name: "Sweet Potato", calories: 112, protein: 2, carbs: 26, fat: 0.2 },
  { name: "Broccoli (1 cup)", calories: 31, protein: 2.5, carbs: 6, fat: 0.3 },
  { name: "Tofu (100g)", calories: 94, protein: 10, carbs: 2, fat: 5 },
  { name: "Brown Rice", calories: 216, protein: 5, carbs: 44, fat: 1.8 },
  { name: "Peanut Butter", calories: 94, protein: 4, carbs: 3, fat: 8 }
];

const defaultExercises = [
  { name: "Jogging", calories: 120 },
  { name: "Cycling", calories: 150 },
  { name: "Push-ups", calories: 100 },
  { name: "Running (Fast)", calories: 150 },
  { name: "Swimming", calories: 130 },
  { name: "Jump Rope", calories: 160 },
  { name: "Weightlifting", calories: 80 },
  { name: "HIIT Workout", calories: 140 },
  { name: "Yoga", calories: 45 },
  { name: "Walking (Brisk)", calories: 50 },
  { name: "Stair Climber", calories: 120 },
  { name: "Rowing Machine", calories: 110 },
  { name: "Abs Circuit", calories: 70 },
  { name: "Zumba Dancing", calories: 90 },
  { name: "Boxing", calories: 130 }
];

async function loadPresetFoodsOptions() {
  const foodSelect = document.getElementById("food-options");
  if (!foodSelect) return;
  foodSelect.innerHTML = '<option value="">Choose food…</option>';
  defaultFoods.forEach(f => {
    const opt = document.createElement("option");
    opt.value = `${f.name}|${f.calories}|${f.protein}|${f.carbs}|${f.fat}`;
    opt.textContent = `${f.name} (${f.calories} kcal)`;
    foodSelect.appendChild(opt);
  });
}

async function loadPresetExercisesOptions() {
  const exerciseSelect = document.getElementById("exercise-options");
  if (!exerciseSelect) return;
  exerciseSelect.innerHTML = '<option value="">Choose exercise…</option>';
  defaultExercises.forEach(ex => {
    const opt = document.createElement("option");
    opt.value = `${ex.name}|${ex.calories}`;
    opt.textContent = `${ex.name} (${ex.calories} kcal / 10 min)`;
    exerciseSelect.appendChild(opt);
  });
}

// REST API persistence helper functions
async function loadUserProfile() {
  try {
    const res = await fetch("/api/profile", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data.profile) {
        document.getElementById('weight').value = data.profile.weight || '';
        document.getElementById('height').value = data.profile.height || '';
        document.getElementById('age').value = data.profile.age || '';
        document.getElementById('gender').value = data.profile.gender || '';
        document.getElementById('goal').value = data.profile.goal || '';

        document.getElementById('goal-protein').value = data.profile.goal_protein || 100;
        document.getElementById('goal-carbs').value = data.profile.goal_carbs || 250;
        document.getElementById('goal-fat').value = data.profile.goal_fat || 70;

        macroGoals.protein = data.profile.goal_protein || 100;
        macroGoals.carbs = data.profile.goal_carbs || 250;
        macroGoals.fat = data.profile.goal_fat || 70;

        if (data.profile.name) {
          const welcomeEl = document.getElementById("dashboard-welcome");
          if (welcomeEl) welcomeEl.textContent = `Welcome back, ${data.profile.name}! 👋`;
        }

        // Run calculations to generate dynamic plans/tables
        calculateSmartNutrition();
        if (typeof generateWorkoutPlan === 'function') generateWorkoutPlan();
        if (typeof generateDynamicDietChart === 'function') generateDynamicDietChart();
      }
    }
  } catch (e) {
    console.error("Error loading profile:", e);
  }
}

async function saveProfile(weight, height, age, gender, goal, goal_protein, goal_carbs, goal_fat) {
  try {
    let name = "";
    const existingProfileRes = await fetch("/api/profile", { credentials: "include" });
    if (existingProfileRes.ok) {
      const data = await existingProfileRes.json();
      name = data.profile?.name || "";
    }
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, weight, height, age, gender, goal, goal_protein, goal_carbs, goal_fat }),
      credentials: "include"
    });
    await saveDailyMetrics();
  } catch (e) {
    console.error("Error saving profile:", e);
  }
}

let currentDailyWeight = null;

async function loadDailyMetrics() {
  try {
    const res = await fetch(`/api/metrics/${currentDate}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data.metrics) {
        waterIntake = data.metrics.water_intake || 0;
        stepsCount = data.metrics.steps_count || 0;
        activeMinutes = data.metrics.active_minutes || 0;
        currentDailyWeight = data.metrics.weight || null;
        
        const weightInput = document.getElementById("weight-input");
        const weightValEl = document.getElementById("logged-weight-value");
        if (weightInput) weightInput.value = currentDailyWeight || "";
        if (weightValEl) {
          weightValEl.textContent = currentDailyWeight ? `${currentDailyWeight} kg` : "not logged";
        }
        
        updateProgressUI();
      }
    }
  } catch (e) {
    console.error("Error loading metrics:", e);
  }
}

async function saveDailyMetrics() {
  try {
    await fetch(`/api/metrics/${currentDate}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        water_intake: waterIntake,
        steps_count: stepsCount,
        active_minutes: activeMinutes,
        weight: currentDailyWeight
      }),
      credentials: "include"
    });
    await loadAnalytics();
    await loadStreak();
  } catch (e) {
    console.error("Error saving daily metrics:", e);
  }
}

window.logDailyWeight = async function () {
  const weightInput = document.getElementById("weight-input");
  if (!weightInput) return;
  const weightVal = parseFloat(weightInput.value);
  if (isNaN(weightVal) || weightVal <= 0) {
    alert("Please enter a valid positive weight.");
    return;
  }
  currentDailyWeight = weightVal;
  const weightValEl = document.getElementById("logged-weight-value");
  if (weightValEl) {
    weightValEl.textContent = `${weightVal} kg`;
  }
  
  await saveDailyMetrics();
  alert("Weight logged successfully!");
};

async function loadActivities() {
  try {
    const res = await fetch(`/api/activities/${currentDate}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      activities = [];
      totalCalories = 0;
      totalProtein = 0;
      totalCarbs = 0;
      totalFat = 0;
      foodTotal = 0;
      exerciseTotal = 0;

      data.activities.forEach(act => {
        activities.push(act);
        totalCalories += act.calories;
        if (act.type === 'food') {
          foodTotal += act.calories;
          totalProtein += act.protein || 0;
          totalCarbs += act.carbs || 0;
          totalFat += act.fat || 0;
        } else {
          exerciseTotal += Math.abs(act.calories);
        }
      });
      updateUI();
    }
  } catch (e) {
    console.error("Error loading activities:", e);
  }
}

function getMealTypeByTime() {
  const hr = new Date().getHours();
  if (hr < 11) return 'breakfast';
  if (hr < 16) return 'lunch';
  if (hr < 20) return 'dinner';
  return 'snacks';
}

async function loadStreak() {
  try {
    const res = await fetch("/api/streak", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      const streakBadge = document.getElementById("streak-badge");
      const streakCount = document.getElementById("streak-count");
      if (streakBadge && streakCount) {
        if (data.streak > 0) {
          streakCount.textContent = data.streak;
          streakBadge.style.display = "flex";
        } else {
          streakBadge.style.display = "none";
        }
      }
    }
  } catch (e) {
    console.error("Error loading streak:", e);
  }
}

async function addActivityToServer(type, description, calories, protein, carbs, fat, mealType) {
  try {
    const res = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        description,
        calories: type === 'food' ? calories : -calories,
        protein: protein || 0,
        carbs: carbs || 0,
        fat: fat || 0,
        date: currentDate,
        meal_type: mealType || (type === 'food' ? getMealTypeByTime() : null)
      }),
      credentials: "include"
    });
    if (res.ok) {
      await loadActivities();
      await loadAnalytics();
      await loadStreak();
    }
  } catch (e) {
    console.error("Error adding activity:", e);
  }
}

function addActivity(type, description, calories, protein, carbs, fat, mealType) {
  addActivityToServer(type, description, calories, protein, carbs, fat, mealType);
}

window.deleteActivity = async function (id) {
  try {
    const res = await fetch(`/api/activities/${id}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (res.ok) {
      await loadActivities();
      await loadAnalytics();
      await loadStreak();
    }
  } catch (e) {
    console.error("Error deleting activity:", e);
  }
};

async function loadCatalog() {
  try {
    const res = await fetch("/api/catalog", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      window.loadedCatalog = data.catalog || [];
      
      const foodSelect = document.getElementById("food-options");
      const exerciseSelect = document.getElementById("exercise-options");
      
      if (foodSelect) {
        foodSelect.innerHTML = '<option value="">Choose food…</option>';
        await loadPresetFoodsOptions();
      }
      if (exerciseSelect) {
        exerciseSelect.innerHTML = '<option value="">Choose exercise…</option>';
        await loadPresetExercisesOptions();
      }
      
      window.loadedCatalog.forEach(item => {
        const opt = document.createElement("option");
        if (item.type === 'food') {
          if (foodSelect) {
            opt.value = `${item.name}|${item.calories}|${item.protein}|${item.carbs}|${item.fat}`;
            opt.textContent = `${item.name} (${item.calories} kcal) [custom]`;
            foodSelect.appendChild(opt);
          }
        } else {
          if (exerciseSelect) {
            opt.value = `${item.name}|${item.calories}`;
            opt.textContent = `${item.name} (${item.calories} kcal / 10 min) [custom]`;
            exerciseSelect.appendChild(opt);
          }
        }
      });
    }
  } catch (e) {
    console.error("Error loading catalog:", e);
  }
}

// BMR and Calories recommendation logic
function calculateSmartNutrition() {
  const weight = parseFloat(document.getElementById('weight').value);
  const height = parseFloat(document.getElementById('height').value);
  const age = parseInt(document.getElementById('age').value);
  const gender = document.getElementById('gender').value;
  const goal = document.getElementById('goal').value;
  const output = document.getElementById('calorie-recommendation');

  if (isNaN(weight) || isNaN(height) || isNaN(age) || weight <= 0 || height <= 0 || age <= 0) {
    output.textContent = "Please enter valid weight, height, and age.";
    return;
  }

  let bmr;
  if (gender === 'male') {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else if (gender === 'female') {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  } else {
    output.textContent = "Please select a valid gender.";
    return;
  }

  const activityMultiplier = 1.55;
  let tdee = bmr * activityMultiplier;

  let calorieTarget = tdee;
  if (goal === 'maintain') {
    calorieTarget = tdee;
  } else if (goal === 'lose') {
    calorieTarget = tdee - 500;
  } else if (goal === 'gain') {
    calorieTarget = tdee + 300;
  }

  const proteinGrams = Math.round(weight * 1.8);
  const proteinCals = proteinGrams * 4;
  const fatCals = calorieTarget * 0.25;
  const fatGrams = Math.round(fatCals / 9);
  const remainingCals = calorieTarget - (proteinCals + fatCals);
  const carbsGrams = Math.round(remainingCals / 4);

  calorieGoal = Math.round(calorieTarget);
  output.textContent = `Recommended daily intake: ${calorieGoal} kcal`;

  const proteinInput = document.getElementById('goal-protein');
  const carbsInput = document.getElementById('goal-carbs');
  const fatInput = document.getElementById('goal-fat');
  if (proteinInput) proteinInput.value = proteinGrams;
  if (carbsInput) carbsInput.value = carbsGrams;
  if (fatInput) fatInput.value = fatGrams;

  macroGoals.protein = proteinGrams;
  macroGoals.carbs = carbsGrams;
  macroGoals.fat = fatGrams;
  displayMacroTotals();
  checkGoalsExceeded();

  // Save updated configurations to the server profile
  saveProfile(weight, height, age, gender, goal, proteinGrams, carbsGrams, fatGrams);
}

function addPresetActivity(type) {
  const select = document.getElementById(type === 'food' ? 'food-options' : 'exercise-options');
  const value = select.value;
  if (!value) return;

  if (type === 'food') {
    const parts = value.split('|');
    const desc = parts[0];
    const cal = parseInt(parts[1]);
    const protein = parts.length > 2 ? parseFloat(parts[2]) : 0;
    const carbs = parts.length > 3 ? parseFloat(parts[3]) : 0;
    const fat = parts.length > 4 ? parseFloat(parts[4]) : 0;
    addActivity(type, desc, cal, protein, carbs, fat);
  } else {
    const [desc, cal] = value.split('|');
    addActivity(type, desc, parseInt(cal));
  }
}

function createActivityRow(act) {
  const div = document.createElement('div');
  div.className = 'activity-entry-row';
  div.style.display = 'flex';
  div.style.justifyContent = 'space-between';
  div.style.alignItems = 'center';
  div.style.padding = '0.5rem 0';
  div.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
  div.style.fontSize = '0.875rem';

  let macroString = '';
  if (act.type === 'food') {
    const p = typeof act.protein === 'number' ? act.protein : 0;
    const c = typeof act.carbs === 'number' ? act.carbs : 0;
    const f = typeof act.fat === 'number' ? act.fat : 0;
    if (p || c || f) {
      macroString = `<span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 0.15rem;">Protein: ${p}g, Carbs: ${c}g, Fat: ${f}g</span>`;
    }
  }

  div.innerHTML = `
    <div style="flex: 1;">
      <span style="font-weight: 600; color: var(--text);">${act.description}</span>
      <span style="margin-left: 0.25rem; font-weight: 600; color: ${act.type === 'food' ? 'var(--accent)' : 'var(--danger)'};">
        (${act.calories > 0 ? '+' : ''}${act.calories} kcal)
      </span>
      ${macroString}
    </div>
    ${act.id ? `<button type="button" class="btn-quick-log" style="color: var(--danger); border-color: transparent; padding: 0.25rem; background: transparent; cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center;" onclick="deleteActivity(${act.id})" aria-label="Delete entry">🗑️</button>` : ''}
  `;
  return div;
}

function displayActivities() {
  const log = document.getElementById('activity-log');
  if (!log) return;
  log.innerHTML = '';

  const filter = document.getElementById('filter-type').value;

  const categories = [
    { key: 'breakfast', name: '🍳 Breakfast', items: [], color: 'var(--accent)' },
    { key: 'lunch', name: '🍲 Lunch', items: [], color: '#3b82f6' },
    { key: 'dinner', name: '🍽️ Dinner', items: [], color: '#8b5cf6' },
    { key: 'snacks', name: '🍏 Snacks', items: [], color: '#f59e0b' }
  ];
  
  const exercises = [];

  activities.forEach(act => {
    if (act.type === 'food') {
      const meal = (act.meal_type || 'lunch').toLowerCase();
      const cat = categories.find(c => c.key === meal) || categories[1];
      cat.items.push(act);
    } else if (act.type === 'exercise') {
      exercises.push(act);
    }
  });

  if (filter === 'all' || filter === 'food') {
    categories.forEach(cat => {
      const catDiv = document.createElement('div');
      catDiv.className = 'meal-category-block';
      catDiv.style.marginBottom = '1.25rem';
      catDiv.style.padding = '1rem';
      catDiv.style.borderRadius = 'var(--radius)';
      catDiv.style.background = 'var(--bg-card)';
      catDiv.style.border = '1px solid var(--border)';

      const totalCals = cat.items.reduce((acc, item) => acc + item.calories, 0);

      catDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
          <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: ${cat.color};">${cat.name}</h4>
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">${Math.round(totalCals)} kcal</span>
        </div>
        <div class="meal-items-list"></div>
      `;

      const listDiv = catDiv.querySelector('.meal-items-list');

      if (cat.items.length === 0) {
        listDiv.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted); padding: 0.25rem 0; font-style: italic;">No meals logged</div>`;
      } else {
        cat.items.forEach(act => {
          const itemDiv = createActivityRow(act);
          listDiv.appendChild(itemDiv);
        });
      }
      log.appendChild(catDiv);
    });
  }

  if (filter === 'all' || filter === 'exercise') {
    const exDiv = document.createElement('div');
    exDiv.className = 'meal-category-block';
    exDiv.style.marginBottom = '1.25rem';
    exDiv.style.padding = '1rem';
    exDiv.style.borderRadius = 'var(--radius)';
    exDiv.style.background = 'var(--bg-card)';
    exDiv.style.border = '1px solid var(--border)';

    const totalBurned = exercises.reduce((acc, item) => acc + Math.abs(item.calories), 0);

    exDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
        <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--danger);">🏃 Workouts</h4>
        <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">${Math.round(totalBurned)} kcal burned</span>
      </div>
      <div class="exercise-items-list"></div>
    `;

    const listDiv = exDiv.querySelector('.exercise-items-list');

    if (exercises.length === 0) {
      listDiv.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted); padding: 0.25rem 0; font-style: italic;">No workouts logged</div>`;
    } else {
      exercises.forEach(act => {
        const itemDiv = createActivityRow(act);
        listDiv.appendChild(itemDiv);
      });
    }
    log.appendChild(exDiv);
  }
}

function displayTotalCalories() {
  const el = document.getElementById('total-calories');
  if (el) el.textContent = `Net calories: ${totalCalories} kcal`;
}

function updatePieChart() {
  const canvas = document.getElementById('pieChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Food (consumed)', 'Exercise (burned)'],
      datasets: [{
        data: [foodTotal, exerciseTotal],
        backgroundColor: ['#2dd4bf', '#f472b6'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8b98a8', padding: 16 } }
      }
    }
  });
}

function updateUI() {
  displayActivities();
  displayTotalCalories();
  displayMacroTotals();
  updatePieChart();
  checkGoalsExceeded();
}

// Stopwatch Logic
let timer = null;
let seconds = 0;
let currentExercise = null;
let calPer10Min = 0;

function startExercise() {
  const select = document.getElementById('exercise-options');
  if (!select) return;
  const value = select.value;
  if (!value) return;

  [currentExercise, calPer10Min] = value.split('|');
  calPer10Min = parseInt(calPer10Min);

  if (timer) clearInterval(timer);
  seconds = 0;

  // Persist stopwatch state in localStorage
  localStorage.setItem("activeExerciseName", currentExercise);
  localStorage.setItem("activeExerciseStart", String(Date.now()));
  localStorage.setItem("activeExerciseCalPer10Min", String(calPer10Min));

  // Visual character movement speed activation
  const runner = document.querySelector(".running-character");
  if (runner) runner.classList.add("is-active");

  timer = setInterval(() => {
    seconds++;
    const disp1 = document.getElementById('timer-display');
    const disp2 = document.getElementById('watch-time');
    if (disp1) disp1.textContent = formatTime(seconds);
    if (disp2) disp2.textContent = formatTime(seconds);
  }, 1000);
}

async function stopExercise() {
  if (!currentExercise || seconds === 0) return;
  clearInterval(timer);

  // Stop character animation
  const runner = document.querySelector(".running-character");
  if (runner) runner.classList.remove("is-active");

  const minutes = seconds / 60;
  const burned = Math.round((calPer10Min / 10) * minutes);
  addActivity('exercise', `${currentExercise} (${formatTime(seconds)})`, burned);

  // Stopwatch integration: increment active exercise time and steps
  const minutesRounded = Math.round(minutes) || 1;
  activeMinutes += minutesRounded;
  
  if (currentExercise.toLowerCase().includes("jog") || currentExercise.toLowerCase().includes("run") || currentExercise.toLowerCase().includes("cycl")) {
    if (!currentExercise.toLowerCase().includes("cycl")) {
      stepsCount += minutesRounded * 130;
    }
  }
  
  await saveDailyMetrics();

  const disp1 = document.getElementById('timer-display');
  const disp2 = document.getElementById('watch-time');
  if (disp1) disp1.textContent = '00:00';
  if (disp2) disp2.textContent = '00:00';

  // Clear localStorage
  localStorage.removeItem("activeExerciseName");
  localStorage.removeItem("activeExerciseStart");
  localStorage.removeItem("activeExerciseCalPer10Min");

  seconds = 0;
  currentExercise = null;
}

function formatTime(secs) {
  const min = String(Math.floor(secs / 60)).padStart(2, '0');
  const sec = String(secs % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

function resumeStopwatch() {
  const name = localStorage.getItem("activeExerciseName");
  const startStr = localStorage.getItem("activeExerciseStart");
  const calStr = localStorage.getItem("activeExerciseCalPer10Min");
  
  if (name && startStr && calStr) {
    currentExercise = name;
    calPer10Min = parseInt(calStr, 10);
    const startTime = parseInt(startStr, 10);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    
    if (elapsed >= 0) {
      seconds = elapsed;
      
      const disp1 = document.getElementById('timer-display');
      const disp2 = document.getElementById('watch-time');
      if (disp1) disp1.textContent = formatTime(seconds);
      if (disp2) disp2.textContent = formatTime(seconds);
      
      const runner = document.querySelector(".running-character");
      if (runner) runner.classList.add("is-active");
      
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        seconds++;
        if (disp1) disp1.textContent = formatTime(seconds);
        if (disp2) disp2.textContent = formatTime(seconds);
      }, 1000);
    }
  }
}

const filterTypeSelect = document.getElementById('filter-type');
if (filterTypeSelect) filterTypeSelect.addEventListener('change', displayActivities);

function updateMacroGoals() {
  macroGoals.protein = parseFloat(document.getElementById('goal-protein').value) || 0;
  macroGoals.carbs = parseFloat(document.getElementById('goal-carbs').value) || 0;
  macroGoals.fat = parseFloat(document.getElementById('goal-fat').value) || 0;
  displayMacroTotals();
  checkGoalsExceeded();

  // Persist new macro limits to profile configuration
  const weight = parseFloat(document.getElementById('weight').value) || 0;
  const height = parseFloat(document.getElementById('height').value) || 0;
  const age = parseInt(document.getElementById('age').value) || 0;
  const gender = document.getElementById('gender').value || '';
  const goal = document.getElementById('goal').value || '';
  saveProfile(weight, height, age, gender, goal, macroGoals.protein, macroGoals.carbs, macroGoals.fat);
}

let calorieGoal = 2000;

function checkGoalsExceeded() {
  const warningEl = document.getElementById("goal-exceeded-warning");
  if (!warningEl) return;

  const exceeded = [];
  if (foodTotal > calorieGoal) {
    exceeded.push(`Calories (${Math.round(foodTotal)} kcal / ${calorieGoal} kcal)`);
  }
  if (totalProtein > macroGoals.protein) {
    exceeded.push(`Protein (${Math.round(totalProtein)}g / ${macroGoals.protein}g)`);
  }
  if (totalCarbs > macroGoals.carbs) {
    exceeded.push(`Carbs (${Math.round(totalCarbs)}g / ${macroGoals.carbs}g)`);
  }
  if (totalFat > macroGoals.fat) {
    exceeded.push(`Fat (${Math.round(totalFat)}g / ${macroGoals.fat}g)`);
  }

  if (exceeded.length > 0) {
    warningEl.style.display = "flex";
    warningEl.innerHTML = `⚠️ <strong>Target Exceeded:</strong> Exceeded ${exceeded.join(", ")}!`;
  } else {
    warningEl.style.display = "none";
  }
}

function displayMacroTotals() {
  const el = document.getElementById('macro-totals');
  if (!el) return;
  el.innerHTML = `
    <strong>Macros Consumed:</strong>
    Protein: ${totalProtein.toFixed(2)}g / ${macroGoals.protein}g &nbsp;|&nbsp;
    Carbs: ${totalCarbs.toFixed(2)}g / ${macroGoals.carbs}g &nbsp;|&nbsp;
    Fat: ${totalFat.toFixed(2)}g / ${macroGoals.fat}g
  `;
  updateMacroPieChart && updateMacroPieChart();
}

// Recommendation hooks
const recBtn = document.getElementById('recommendation-btn');
if (recBtn) {
  recBtn.addEventListener('click', function() {
    calculateSmartNutrition();
  });
}

// Progress Tracking Dashboard Controllers
let waterIntake = 0;
let stepsCount = 0;
let activeMinutes = 0;

function updateProgressUI() {
  const waterFill = document.getElementById("water-progress-fill");
  const waterText = document.getElementById("water-progress-text");
  const waterPercent = document.getElementById("water-percentage");
  const glassFill = document.getElementById("water-glass-fill");
  if (waterFill && waterText && waterPercent) {
    const pct = Math.min(100, Math.round((waterIntake / 2000) * 100));
    waterFill.style.width = pct + "%";
    waterText.textContent = `${waterIntake} ml / 2000 ml`;
    waterPercent.textContent = pct + "%";
  }
  if (glassFill) {
    const glassPct = Math.min(100, Math.round((waterIntake / 2000) * 100));
    glassFill.style.height = glassPct + "%";
  }

  const stepsFill = document.getElementById("steps-progress-fill");
  const stepsText = document.getElementById("steps-progress-text");
  const stepsPercent = document.getElementById("steps-percentage");
  if (stepsFill && stepsText && stepsPercent) {
    const pct = Math.min(100, Math.round((stepsCount / 10000) * 100));
    stepsFill.style.width = pct + "%";
    stepsText.textContent = `${stepsCount} / 10000 steps`;
    stepsPercent.textContent = pct + "%";
  }

  const activeFill = document.getElementById("active-progress-fill");
  const activeText = document.getElementById("active-progress-text");
  const activePercent = document.getElementById("active-percentage");
  if (activeFill && activeText && activePercent) {
    const pct = Math.min(100, Math.round((activeMinutes / 60) * 100));
    activeFill.style.width = pct + "%";
    activeText.textContent = `${activeMinutes} / 60 mins`;
    activePercent.textContent = pct + "%";
  }

  const characterStatus = document.getElementById("character-status-text");
  if (characterStatus) {
    if (stepsCount >= 10000 && activeMinutes >= 60) {
      characterStatus.textContent = "Goal Achieved! 🏆";
      characterStatus.style.color = "#a855f7";
    } else if (activeMinutes > 0 || stepsCount > 0) {
      characterStatus.textContent = "Active Workout Mode 🏃";
      characterStatus.style.color = "var(--accent)";
    } else {
      characterStatus.textContent = "Ready to Train ⚡";
      characterStatus.style.color = "var(--text-muted)";
    }
  }
}

window.addWater = async function (amount) {
  waterIntake += amount;
  updateProgressUI();
  await saveDailyMetrics();
};

window.resetWater = async function () {
  waterIntake = 0;
  updateProgressUI();
  await saveDailyMetrics();
};

window.logSteps = async function () {
  const input = document.getElementById("steps-to-add");
  if (!input) return;
  const val = parseInt(input.value, 10);
  if (isNaN(val) || val <= 0) return;
  stepsCount += val;
  updateProgressUI();
  input.value = "";
  await saveDailyMetrics();
};

window.resetSteps = async function () {
  stepsCount = 0;
  updateProgressUI();
  await saveDailyMetrics();
};

window.logActiveMinutes = async function () {
  const input = document.getElementById("active-to-add");
  if (!input) return;
  const val = parseInt(input.value, 10);
  if (isNaN(val) || val <= 0) return;
  activeMinutes += val;
  updateProgressUI();
  input.value = "";
  await saveDailyMetrics();
};

window.resetActiveMinutes = async function () {
  activeMinutes = 0;
  updateProgressUI();
  await saveDailyMetrics();
};

// Quick Logging templates bindings
window.quickLogMeal = function (food, calories, protein, carbs, fat) {
  addActivity('food', food, calories, protein, carbs, fat);
};

window.quickLogWorkout = function (workout) {
  // Logs exercise with estimated 100 calories burned & active mins added
  addActivity('exercise', workout, 100);
  activeMinutes += 15;
  saveDailyMetrics();
};

// Custom food creator logic
window.addCustomFood = async function () {
  const nameInput = document.getElementById("custom-food-name");
  const caloriesInput = document.getElementById("custom-food-calories-per-100g");
  const weightInput = document.getElementById("custom-food-weight");
  const proteinInput = document.getElementById("custom-food-protein");
  const carbsInput = document.getElementById("custom-food-carbs");
  const fatInput = document.getElementById("custom-food-fat");

  const name = nameInput.value.trim();
  const caloriesPer100g = parseFloat(caloriesInput.value);
  const weight = parseFloat(weightInput.value);
  const proteinPer100g = parseFloat(proteinInput.value);
  const carbsPer100g = parseFloat(carbsInput.value);
  const fatPer100g = parseFloat(fatInput.value);

  if (!name) {
    alert("Please enter a food name.");
    return;
  }
  if (isNaN(caloriesPer100g) || caloriesPer100g < 0) {
    alert("Please enter valid positive calories per 100g.");
    return;
  }
  if (isNaN(weight) || weight <= 0) {
    alert("Please enter a valid positive weight in grams.");
    return;
  }
  if (isNaN(proteinPer100g) || proteinPer100g < 0) {
    alert("Please enter valid positive protein per 100g.");
    return;
  }
  if (isNaN(carbsPer100g) || carbsPer100g < 0) {
    alert("Please enter valid positive carbs per 100g.");
    return;
  }
  if (isNaN(fatPer100g) || fatPer100g < 0) {
    alert("Please enter valid positive fat per 100g.");
    return;
  }

  const proteinVal = proteinPer100g;
  const carbsVal = carbsPer100g;
  const fatVal = fatPer100g;

  const totalCalories = (caloriesPer100g * weight) / 100;
  const totalProtein = (proteinVal * weight) / 100;
  const totalCarbs = (carbsVal * weight) / 100;
  const totalFat = (fatVal * weight) / 100;

  try {
    const catalogRes = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "food",
        name: `${name} (${weight}g)`,
        calories: parseFloat(totalCalories.toFixed(2)),
        protein: parseFloat(totalProtein.toFixed(2)),
        carbs: parseFloat(totalCarbs.toFixed(2)),
        fat: parseFloat(totalFat.toFixed(2))
      }),
      credentials: "include"
    });
    
    if (catalogRes.ok) {
      const foodSelect = document.getElementById("food-options");
      foodSelect.innerHTML = '<option value="">Choose food…</option>';
      await loadPresetFoodsOptions();
      await loadCatalog();
    }
  } catch (e) {
    console.error("Error saving food to catalog:", e);
  }

  const mealTypeSelect = document.getElementById("custom-food-meal-type");
  const mealType = mealTypeSelect ? mealTypeSelect.value : getMealTypeByTime();
  addActivity(
    "food",
    name,
    parseFloat(totalCalories.toFixed(2)),
    parseFloat(totalProtein.toFixed(2)),
    parseFloat(totalCarbs.toFixed(2)),
    parseFloat(totalFat.toFixed(2)),
    mealType
  );

  nameInput.value = "";
  caloriesInput.value = "";
  weightInput.value = "";
  proteinInput.value = "";
  carbsInput.value = "";
  fatInput.value = "";
};

// Weekly Trend Charts Implementation
let stepsChart, caloriesChart, weightChart;

async function loadAnalytics() {
  try {
    const res = await fetch(`/api/analytics?date=${currentDate}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      updateAnalyticsCharts(data);
    }
  } catch (e) {
    console.error("Error loading analytics:", e);
  }
}

function updateAnalyticsCharts(data) {
  const stepsCanvas = document.getElementById("weeklyStepsChart");
  const caloriesCanvas = document.getElementById("weeklyCaloriesChart");
  if (!stepsCanvas || !caloriesCanvas || typeof Chart === "undefined") return;

  const labels = data.dates.map(d => {
    const parts = d.split('-');
    if (parts.length === 3) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${monthNames[parseInt(parts[1], 10) - 1]} ${parts[2]}`;
    }
    return d;
  });

  if (stepsChart) {
    stepsChart.data.labels = labels;
    stepsChart.data.datasets[0].data = data.steps;
    stepsChart.update();
  } else {
    stepsChart = new Chart(stepsCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Steps",
          data: data.steps,
          backgroundColor: "#2dd4bf",
          borderRadius: 6,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#8b98a8" }
          },
          x: {
            grid: { display: false },
            ticks: { color: "#8b98a8" }
          }
        }
      }
    });
  }

  if (caloriesChart) {
    caloriesChart.data.labels = labels;
    caloriesChart.data.datasets[0].data = data.caloriesEaten;
    caloriesChart.data.datasets[1].data = data.caloriesBurned;
    caloriesChart.update();
  } else {
    caloriesChart = new Chart(caloriesCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Consumed (kcal)",
            data: data.caloriesEaten,
            borderColor: "#2dd4bf",
            backgroundColor: "rgba(45, 212, 191, 0.1)",
            fill: true,
            tension: 0.3,
            borderWidth: 2
          },
          {
            label: "Burned (kcal)",
            data: data.caloriesBurned,
            borderColor: "#f472b6",
            backgroundColor: "rgba(244, 114, 182, 0.1)",
            fill: true,
            tension: 0.3,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#8b98a8" } }
        },
        scales: {
          y: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#8b98a8" }
          },
          x: {
            grid: { display: false },
            ticks: { color: "#8b98a8" }
          }
        }
      }
    });
  }

  const weightCanvas = document.getElementById("weeklyWeightChart");
  if (weightCanvas) {
    if (weightChart) {
      weightChart.data.labels = labels;
      weightChart.data.datasets[0].data = data.weight;
      weightChart.update();
    } else {
      weightChart = new Chart(weightCanvas.getContext("2d"), {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Weight (kg)",
              data: data.weight,
              borderColor: "#a855f7",
              backgroundColor: "rgba(168, 85, 247, 0.1)",
              fill: true,
              tension: 0.3,
              borderWidth: 2,
              spanGaps: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { color: "#8b98a8" } }
          },
          scales: {
            y: {
              grid: { color: "rgba(255, 255, 255, 0.05)" },
              ticks: { color: "#8b98a8" }
            },
            x: {
              grid: { display: false },
              ticks: { color: "#8b98a8" }
            }
          }
        }
      });
    }
  }
}

// Shift date offset (+1 or -1)
window.shiftDate = function (offset) {
  const parts = currentDate.split('-');
  const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  dateObj.setDate(dateObj.getDate() + offset);
  
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  currentDate = `${y}-${m}-${d}`;
  
  updateDateDisplay();
  
  // Reload date-dependent info
  loadDailyMetrics();
  loadActivities();
  loadAnalytics();
};

// Update Date Selector display on UI
window.updateDateDisplay = function () {
  const display = document.getElementById("current-date-display");
  const sub = document.getElementById("date-label-sub");
  if (!display) return;
  
  const todayStr = getTodayLocalDate();
  
  const parts = currentDate.split('-');
  const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  display.textContent = dateObj.toLocaleDateString(undefined, options);
  
  if (sub) {
    if (currentDate === todayStr) {
      sub.textContent = "Today";
      sub.style.color = "var(--accent)";
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toLocaleDateString('en-CA');
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toLocaleDateString('en-CA');
      
      if (currentDate === yesterdayStr) {
        sub.textContent = "Yesterday";
        sub.style.color = "#fb923c";
      } else if (currentDate === tomorrowStr) {
        sub.textContent = "Tomorrow";
        sub.style.color = "#60a5fa";
      } else {
        sub.textContent = "Historical";
        sub.style.color = "var(--text-muted)";
      }
    }
  }
};

// Custom Exercise submission logic
window.addCustomExercise = async function () {
  const nameInput = document.getElementById("custom-exercise-name");
  const caloriesInput = document.getElementById("custom-exercise-calories");

  if (!nameInput || !caloriesInput) return;
  const name = nameInput.value.trim();
  const calories = parseFloat(caloriesInput.value);

  if (!name) {
    alert("Please enter an exercise name.");
    return;
  }
  if (isNaN(calories) || calories <= 0) {
    alert("Please enter valid positive calories per 10 minutes.");
    return;
  }

  try {
    const catalogRes = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "exercise",
        name: name,
        calories: calories,
        protein: 0,
        carbs: 0,
        fat: 0
      }),
      credentials: "include"
    });
    
    if (catalogRes.ok) {
      nameInput.value = "";
      caloriesInput.value = "";
      await loadCatalog();
    }
  } catch (e) {
    console.error("Error saving exercise to catalog:", e);
  }
};

// Catalog manager modal logic
window.openCatalogModal = function (type) {
  const modal = document.getElementById("catalog-modal");
  const title = document.getElementById("catalog-modal-title");
  const list = document.getElementById("catalog-modal-list");
  
  if (!modal || !list || !title) return;
  
  title.textContent = type === 'food' ? "Manage Custom Foods" : "Manage Custom Exercises";
  list.innerHTML = "";
  
  const items = (window.loadedCatalog || []).filter(item => item.type === type);
  
  if (items.length === 0) {
    list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1rem;">No custom ${type}s added yet.</div>`;
  } else {
    items.forEach(item => {
      const itemEl = document.createElement("div");
      itemEl.className = "catalog-item";
      
      let detailsText = "";
      if (item.type === 'food') {
        detailsText = `${item.calories} kcal · P: ${item.protein}g · C: ${item.carbs}g · F: ${item.fat}g`;
      } else {
        detailsText = `${item.calories} kcal per 10 min`;
      }
      
      itemEl.innerHTML = `
        <div class="catalog-item-info">
          <span class="catalog-item-name">${item.name}</span>
          <span class="catalog-item-desc">${detailsText}</span>
        </div>
        <button type="button" class="btn-quick-log" style="color: var(--danger); border-color: transparent; padding: 0.25rem;" onclick="deleteCatalogItem(${item.id})" aria-label="Delete custom item">🗑️</button>
      `;
      list.appendChild(itemEl);
    });
  }
  
  modal.dataset.currentType = type;
  modal.classList.add("is-open");
};

window.closeCatalogModal = function () {
  const modal = document.getElementById("catalog-modal");
  if (modal) modal.classList.remove("is-open");
};

window.closeCatalogModalOutside = function (event) {
  if (event.target === document.getElementById("catalog-modal")) {
    closeCatalogModal();
  }
};

window.deleteCatalogItem = async function (id) {
  if (!confirm("Are you sure you want to delete this custom item?")) return;
  try {
    const res = await fetch(`/api/catalog/${id}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (res.ok) {
      await loadCatalog();
      // Refresh the modal content
      const modal = document.getElementById("catalog-modal");
      if (modal && modal.dataset.currentType) {
        openCatalogModal(modal.dataset.currentType);
      }
    }
  } catch (e) {
    console.error("Error deleting catalog item:", e);
  }
};

// Food Nutrition Database for AI scan matches (values per 100g)
const foodNutritionDb = {
  "banana": { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
  "apple": { calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2 },
  "orange": { calories: 47, protein: 0.9, carbs: 11.8, fat: 0.1 },
  "strawberry": { calories: 32, protein: 0.7, carbs: 7.7, fat: 0.3 },
  "broccoli": { calories: 34, protein: 2.8, carbs: 6.6, fat: 0.4 },
  "pizza": { calories: 266, protein: 11.4, carbs: 33.0, fat: 9.8 },
  "hotdog": { calories: 290, protein: 10.4, carbs: 4.2, fat: 26.2 },
  "cheeseburger": { calories: 263, protein: 13.0, carbs: 24.0, fat: 12.0 },
  "hamburger": { calories: 250, protein: 12.0, carbs: 23.0, fat: 10.0 },
  "sandwich": { calories: 220, protein: 8.5, carbs: 25.0, fat: 8.0 },
  "salad": { calories: 45, protein: 1.5, carbs: 4.0, fat: 2.5 },
  "egg": { calories: 155, protein: 12.6, carbs: 1.1, fat: 10.6 },
  "chicken": { calories: 165, protein: 31.0, carbs: 0.0, fat: 3.6 },
  "beef": { calories: 250, protein: 26.0, carbs: 0.0, fat: 17.0 },
  "fish": { calories: 200, protein: 22.0, carbs: 0.0, fat: 12.0 },
  "potato": { calories: 77, protein: 2.0, carbs: 17.0, fat: 0.1 },
  "corn": { calories: 86, protein: 3.2, carbs: 19.0, fat: 1.2 },
  "soup": { calories: 60, protein: 2.5, carbs: 8.0, fat: 1.5 },
  "pasta": { calories: 131, protein: 5.0, carbs: 25.0, fat: 1.1 },
  "bread": { calories: 265, protein: 9.0, carbs: 49.0, fat: 3.2 },
  "rice": { calories: 130, protein: 2.7, carbs: 28.0, fat: 0.3 },
  "cheese": { calories: 402, protein: 25.0, carbs: 1.3, fat: 33.0 },
  "milk": { calories: 42, protein: 3.4, carbs: 5.0, fat: 1.0 },
  "yogurt": { calories: 59, protein: 10.0, carbs: 3.6, fat: 0.4 },
  "mushroom": { calories: 22, protein: 3.1, carbs: 3.3, fat: 0.3 },
  "carrot": { calories: 41, protein: 0.9, carbs: 9.6, fat: 0.2 }
};

let visionModel = null;
let currentScanData = null;

window.triggerImageInput = function () {
  const input = document.getElementById("scan-image-input");
  if (input) input.click();
};

window.handleImageUpload = async function (event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const preview = document.getElementById("scan-preview");
  const container = document.getElementById("scan-preview-container");
  const status = document.getElementById("scan-status");
  const resultsDiv = document.getElementById("scan-results");
  
  if (!preview || !container || !status || !resultsDiv) return;
  
  // Show preview
  const reader = new FileReader();
  reader.onload = function (e) {
    preview.src = e.target.result;
    container.style.display = "block";
    resultsDiv.style.display = "none";
    status.textContent = "Loading image...";
    status.style.color = "var(--text)";
    
    // Once image is loaded, start scanning
    preview.onload = async function () {
      try {
        status.textContent = "Analyzing food composition via Cloud Vision...";
        
        let customApiKey = localStorage.getItem("fb_ai_key") || "";
        let customProvider = localStorage.getItem("fb_ai_provider") || "openrouter";
        let customModel = localStorage.getItem("fb_ai_model") || "";
        
        const response = await fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: e.target.result,
            customApiKey,
            customProvider,
            customModel
          })
        });
        
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || "Vision analysis failed. Please check your AI key settings.");
        }
        
        const data = await response.json();
        console.log("Vision AI Data:", data);
        
        if (data.foodKey) {
          let matchedLabel = data.foodKey;
          let highestConfidence = data.confidence || 0.9;
          
          currentScanData = {
            name: matchedLabel.charAt(0).toUpperCase() + matchedLabel.slice(1),
            calories: data.calories || 0,
            protein: data.protein || 0,
            carbs: data.carbs || 0,
            fat: data.fat || 0
          };
            
          status.textContent = "Scan complete!";
          status.style.color = "var(--accent)";
          
          document.getElementById("result-food-name").textContent = currentScanData.name;
          document.getElementById("result-confidence").textContent = `${Math.round(highestConfidence * 100)}% Match`;
          document.getElementById("result-kcal-100g").textContent = currentScanData.calories;
          
          document.getElementById("result-weight").value = 100;
          recalculateScanNutrition();
          resultsDiv.style.display = "block";
        } else {
          status.textContent = "No food identified. Try a clearer photo!";
          status.style.color = "var(--danger)";
        }
      } catch (err) {
        console.error("AI scanning error:", err);
        status.textContent = err.message || "Failed to run AI model locally.";
        status.style.color = "var(--danger)";
      }
    };
  };
  reader.readAsDataURL(file);
};

window.recalculateScanNutrition = function () {
  if (!currentScanData) return;
  const weight = parseFloat(document.getElementById("result-weight").value) || 100;
  
  const cal = (currentScanData.calories * weight) / 100;
  const p = (currentScanData.protein * weight) / 100;
  const c = (currentScanData.carbs * weight) / 100;
  const f = (currentScanData.fat * weight) / 100;
  
  document.getElementById("sum-kcal").textContent = Math.round(cal);
  document.getElementById("sum-p").textContent = p.toFixed(1) + "g";
  document.getElementById("sum-c").textContent = c.toFixed(1) + "g";
  document.getElementById("sum-f").textContent = f.toFixed(1) + "g";
};

window.logScanResult = function () {
  if (!currentScanData) return;
  const weight = parseFloat(document.getElementById("result-weight").value) || 100;
  
  const cal = parseFloat(((currentScanData.calories * weight) / 100).toFixed(2));
  const p = parseFloat(((currentScanData.protein * weight) / 100).toFixed(2));
  const c = parseFloat(((currentScanData.carbs * weight) / 100).toFixed(2));
  const f = parseFloat(((currentScanData.fat * weight) / 100).toFixed(2));
  
  const mealTypeSelect = document.getElementById("scan-meal-type");
  const mealType = mealTypeSelect ? mealTypeSelect.value : getMealTypeByTime();
  addActivity("food", `${currentScanData.name} (${weight}g)`, cal, p, c, f, mealType);
  
  // Reset scanner UI
  document.getElementById("scan-preview-container").style.display = "none";
  document.getElementById("scan-image-input").value = "";
  currentScanData = null;
  alert("Food logged successfully!");
};

let selectedSearchFoodItem = null;
let searchDebounceTimer = null;

function displaySearchResults(results) {
  const container = document.getElementById("food-search-results");
  if (!container) return;
  container.innerHTML = "";
  
  if (results.length === 0) {
    const noResultsDiv = document.createElement("div");
    noResultsDiv.className = "search-result-item";
    noResultsDiv.style.color = "var(--text-muted)";
    noResultsDiv.style.cursor = "default";
    noResultsDiv.textContent = "No matches found.";
    container.appendChild(noResultsDiv);
    container.style.display = "block";
    return;
  }

  results.forEach(item => {
    const div = document.createElement("div");
    div.className = "search-result-item";
    
    const infoSpan = document.createElement("span");
    infoSpan.innerHTML = `<strong>${item.name}</strong> <span style="color: var(--text-muted); font-size: 0.8rem; margin-left: 0.25rem;">(${Math.round(item.calories)} kcal/100g)</span>`;
    div.appendChild(infoSpan);

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = item.origin === "custom" ? "Custom" : "Dataset";
    div.appendChild(badge);

    div.addEventListener("click", () => {
      selectSearchFood(item);
    });

    container.appendChild(div);
  });
  container.style.display = "block";
}

function selectSearchFood(item) {
  selectedSearchFoodItem = item;
  
  const searchInput = document.getElementById("food-search-input");
  if (searchInput) searchInput.value = item.name;
  
  const resultsContainer = document.getElementById("food-search-results");
  if (resultsContainer) resultsContainer.style.display = "none";

  const calcContainer = document.getElementById("selected-food-calculator");
  const calcName = document.getElementById("calc-food-name");
  
  if (calcName) calcName.textContent = `Selected: ${item.name}`;
  if (calcContainer) calcContainer.style.display = "block";

  const weightInput = document.getElementById("calc-food-weight");
  if (weightInput) {
    weightInput.value = 100;
  }
  recalculateSearchFoodCalories();
}

window.recalculateSearchFoodCalories = function () {
  if (!selectedSearchFoodItem) return;
  const weightInput = document.getElementById("calc-food-weight");
  const weight = parseFloat(weightInput ? weightInput.value : 100) || 0;

  const rawCalories = selectedSearchFoodItem.calories;
  const rawProtein = selectedSearchFoodItem.protein || 0;
  const rawCarbs = selectedSearchFoodItem.carbs || 0;
  const rawFat = selectedSearchFoodItem.fat || 0;

  const computedCalories = parseFloat(((rawCalories * weight) / 100).toFixed(2));
  const computedProtein = parseFloat(((rawProtein * weight) / 100).toFixed(2));
  const computedCarbs = parseFloat(((rawCarbs * weight) / 100).toFixed(2));
  const computedFat = parseFloat(((rawFat * weight) / 100).toFixed(2));

  const caloriesEl = document.getElementById("calc-food-calories");
  const proteinEl = document.getElementById("calc-food-protein");
  const carbsEl = document.getElementById("calc-food-carbs");
  const fatEl = document.getElementById("calc-food-fat");

  if (caloriesEl) caloriesEl.textContent = computedCalories;
  if (proteinEl) proteinEl.textContent = computedProtein;
  if (carbsEl) carbsEl.textContent = computedCarbs;
  if (fatEl) fatEl.textContent = computedFat;
};

window.logSearchFood = function () {
  if (!selectedSearchFoodItem) return;
  
  const weightInput = document.getElementById("calc-food-weight");
  const weight = parseFloat(weightInput ? weightInput.value : 100);
  if (isNaN(weight) || weight <= 0) {
    alert("Please enter a valid positive weight in grams.");
    return;
  }

  const rawCalories = selectedSearchFoodItem.calories;
  const rawProtein = selectedSearchFoodItem.protein || 0;
  const rawCarbs = selectedSearchFoodItem.carbs || 0;
  const rawFat = selectedSearchFoodItem.fat || 0;

  const computedCalories = parseFloat(((rawCalories * weight) / 100).toFixed(2));
  const computedProtein = parseFloat(((rawProtein * weight) / 100).toFixed(2));
  const computedCarbs = parseFloat(((rawCarbs * weight) / 100).toFixed(2));
  const computedFat = parseFloat(((rawFat * weight) / 100).toFixed(2));

  const mealTypeSelect = document.getElementById("calc-food-meal-type");
  const mealType = mealTypeSelect ? mealTypeSelect.value : getMealTypeByTime();
  addActivity("food", `${selectedSearchFoodItem.name} (${weight}g)`, computedCalories, computedProtein, computedCarbs, computedFat, mealType);
  
  cancelSearchFoodSelection();
  alert("Food logged successfully!");
};

window.cancelSearchFoodSelection = function () {
  selectedSearchFoodItem = null;
  const searchInput = document.getElementById("food-search-input");
  if (searchInput) searchInput.value = "";

  const calcContainer = document.getElementById("selected-food-calculator");
  if (calcContainer) calcContainer.style.display = "none";
};

// Wire event listeners on search input
function wireSearchAutocomplete() {
  const searchInput = document.getElementById("food-search-input");
  const searchResults = document.getElementById("food-search-results");
  const calcWeightInput = document.getElementById("calc-food-weight");

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      clearTimeout(searchDebounceTimer);
      const query = searchInput.value.trim();
      if (!query) {
        if (searchResults) searchResults.style.display = "none";
        return;
      }

      searchDebounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/food/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            displaySearchResults(data.results || []);
          }
        } catch (err) {
          console.error("Autocomplete search error:", err);
        }
      }, 250);
    });

    searchInput.addEventListener("focus", function () {
      const query = searchInput.value.trim();
      if (query && searchResults) {
        searchResults.style.display = "block";
      }
    });
  }

  if (calcWeightInput) {
    calcWeightInput.addEventListener("input", recalculateSearchFoodCalories);
  }

  document.addEventListener("click", function (e) {
    const container = document.querySelector(".search-food-container");
    if (container && !container.contains(e.target) && searchResults) {
      searchResults.style.display = "none";
    }
  });
}

window.scrollToAndHighlight = function (elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  
  element.classList.remove("highlight-flash");
  void element.offsetWidth; // force reflow
  element.classList.add("highlight-flash");
  
  setTimeout(() => {
    element.classList.remove("highlight-flash");
  }, 1600);
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}


window.analyzeMyDay = function() {
  const calsRecText = document.getElementById("calorie-recommendation")?.textContent || "";
  
  const breakfast = [];
  const lunch = [];
  const dinner = [];
  const snacks = [];
  const workouts = [];
  
  activities.forEach(act => {
    if (act.type === 'food') {
      const mt = (act.meal_type || 'lunch').toLowerCase();
      if (mt === 'breakfast') breakfast.push(act);
      else if (mt === 'lunch') lunch.push(act);
      else if (mt === 'dinner') dinner.push(act);
      else snacks.push(act);
    } else if (act.type === 'exercise') {
      workouts.push(act);
    }
  });

  const formatActivityList = (list) => {
    if (list.length === 0) return "None";
    return list.map(item => `- ${item.description} (${Math.round(item.calories)} kcal)`).join("\n");
  };

  const prompt = `Please analyze my fitness and nutrition log for today, ${currentDate}, and give me a brief, constructive review of my progress and some quick recommendations:

**My Daily Targets:**
- Calorie Goal: ${calsRecText || "Not set"}
- Protein Target: ${macroGoals.protein}g
- Carbs Target: ${macroGoals.carbs}g
- Fat Target: ${macroGoals.fat}g
- Water Target: 2000 ml
- Steps Target: 10000 steps
- Active Minutes Target: 60 mins

**My Actual Intake & Progress:**
- Calories Consumed: ${foodTotal} kcal
- Calories Burned (Exercises): ${exerciseTotal} kcal
- Net Calories: ${totalCalories} kcal
- Protein Logged: ${Math.round(totalProtein)}g
- Carbs Logged: ${Math.round(totalCarbs)}g
- Fat Logged: ${Math.round(totalFat)}g
- Water Logged: ${waterIntake} ml
- Steps Walked: ${stepsCount}
- Active Minutes Logged: ${activeMinutes} mins

**Meal Logs:**
- Breakfast:
${formatActivityList(breakfast)}
- Lunch:
${formatActivityList(lunch)}
- Dinner:
${formatActivityList(dinner)}
- Snacks:
${formatActivityList(snacks)}

**Workouts Logged:**
${workouts.length === 0 ? "None" : workouts.map(item => `- ${item.description} (${Math.abs(Math.round(item.calories))} kcal burned)`).join("\n")}
`;

  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  if (userInput && sendBtn) {
    userInput.value = prompt;
    sendBtn.click();
    
    const chatbot = document.getElementById("chatbot");
    if (chatbot) {
      chatbot.scrollIntoView({ behavior: "smooth" });
      chatbot.classList.add("highlight-flash");
      setTimeout(() => {
        chatbot.classList.remove("highlight-flash");
      }, 2000);
    }
  }
};

window.getTrackerState = function() {
  return {
    activities,
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
    foodTotal,
    exerciseTotal,
    currentDate,
    macroGoals,
    waterIntake,
    stepsCount,
    activeMinutes,
    calorieGoal
  };
};

// Unified client dashboard initialization routine
async function initializeApp() {
  updateDateDisplay();
  
  const prevBtn = document.getElementById("prev-date-btn");
  const nextBtn = document.getElementById("next-date-btn");
  if (prevBtn && !prevBtn.dataset.wired) {
    prevBtn.addEventListener("click", () => shiftDate(-1));
    prevBtn.dataset.wired = "true";
  }
  if (nextBtn && !nextBtn.dataset.wired) {
    nextBtn.addEventListener("click", () => shiftDate(1));
    nextBtn.dataset.wired = "true";
  }

  updateProgressUI();
  await loadPresetFoodsOptions();
  await loadPresetExercisesOptions();
  await loadUserProfile();
  await loadDailyMetrics();
  await loadActivities();
  await loadCatalog();
  await loadAnalytics();
  await loadStreak();
  
  resumeStopwatch();
  wireSearchAutocomplete();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}