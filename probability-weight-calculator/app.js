/**
 * 目标成功率评估器 —— 前端逻辑
 * 纯客户端计算，不依赖任何后端 / API。
 */

(function () {
  "use strict";

  // ---------- 状态 ----------
  let state = {
    goal: null,
    selectedItems: new Set(), // 预设项 id
    customItems: [], // { id, name, weight }
    scores: {}, // itemId -> 0~100
    difficulty: 3,
  };

  let chartInstance = null;

  // ---------- DOM ----------
  const goalGrid = document.getElementById("goal-grid");
  const goalTagline = document.getElementById("goal-tagline");
  const stepItems = document.getElementById("step-items");
  const itemList = document.getElementById("item-list");
  const customNameInput = document.getElementById("custom-name");
  const customImportanceSelect = document.getElementById("custom-importance");
  const addCustomBtn = document.getElementById("add-custom-btn");
  const customItemTags = document.getElementById("custom-item-tags");
  const stepDifficulty = document.getElementById("step-difficulty");
  const difficultySlider = document.getElementById("difficulty-slider");
  const difficultyLabels = document.getElementById("difficulty-labels");
  const difficultyDesc = document.getElementById("difficulty-desc");
  const generateRow = document.getElementById("generate-row");
  const generateBtn = document.getElementById("generate-btn");
  const validationMsg = document.getElementById("validation-msg");
  const resultsSection = document.getElementById("results");
  const probNumber = document.getElementById("prob-number");
  const probTag = document.getElementById("prob-tag");
  const analysisStrength = document.querySelector("#analysis-strength ul");
  const analysisGap = document.querySelector("#analysis-gap ul");
  const warningsBox = document.getElementById("warnings");

  // ---------- 工具函数 ----------
  function scoreLabel(v) {
    if (v <= 20) return "较弱";
    if (v <= 40) return "一般";
    if (v <= 60) return "中等";
    if (v <= 80) return "良好";
    return "优秀";
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // ---------- Step 1: 目标选择 ----------
  function renderGoalCards() {
    goalGrid.innerHTML = "";
    Object.values(GOALS).forEach((g) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "goal-option";
      el.dataset.goal = g.id;
      el.innerHTML = `<span class="goal-name">${g.name}</span><span class="goal-desc">${g.tagline}</span>`;
      el.addEventListener("click", () => selectGoal(g.id));
      goalGrid.appendChild(el);
    });
  }

  function selectGoal(goalId) {
    state.goal = goalId;
    state.selectedItems.clear();
    state.scores = {};
    resultsSection.hidden = true;

    [...goalGrid.children].forEach((el) => {
      el.classList.toggle("active", el.dataset.goal === goalId);
    });
    goalTagline.textContent = "该目标下的默认权重会按你的选择自动重新分配，权重仅代表相对重要程度，并非绝对分值。";

    stepItems.hidden = false;
    stepDifficulty.hidden = false;
    generateRow.hidden = false;
    renderItemList();
  }

  // ---------- Step 2: 评估项 + 打分 ----------
  function currentGoalWeights() {
    return GOALS[state.goal].weights;
  }

  function renderItemList() {
    itemList.innerHTML = "";
    const weights = currentGoalWeights();

    Object.entries(ITEMS).forEach(([id, item]) => {
      const w = weights[id] || 0;
      if (w <= 0) return; // 该目标下不相关，不展示
      itemList.appendChild(buildItemRow(id, item.name, item.hint, false));
    });

    state.customItems.forEach((ci) => {
      itemList.appendChild(buildItemRow(ci.id, ci.name, `自定义评估项 · 重要程度对应权重 ${ci.weight} 分`, true));
    });

    renderCustomTags();
  }

  function buildItemRow(id, name, hint, isCustom) {
    const row = document.createElement("div");
    row.className = "item-row" + (isCustom ? " custom" : "");
    row.dataset.item = id;

    const checked = state.selectedItems.has(id);

    row.innerHTML = `
      <label class="item-check">
        <input type="checkbox" ${checked ? "checked" : ""} />
        <span>${name}</span>
        ${isCustom ? `<button type="button" class="item-remove" title="删除">删除</button>` : ""}
      </label>
      <p class="item-hint">${hint}</p>
      <div class="item-score" ${checked ? "" : "hidden"}>
        <input type="range" min="0" max="100" value="${state.scores[id] ?? 50}" />
        <span class="score-value">${state.scores[id] ?? 50}</span>
        <span class="score-label">${scoreLabel(state.scores[id] ?? 50)}</span>
      </div>
    `;

    const checkbox = row.querySelector('input[type="checkbox"]');
    const scoreBox = row.querySelector(".item-score");
    const range = row.querySelector('input[type="range"]');
    const scoreValueEl = row.querySelector(".score-value");
    const scoreLabelEl = row.querySelector(".score-label");

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedItems.add(id);
        if (!(id in state.scores)) state.scores[id] = 50;
        scoreBox.hidden = false;
      } else {
        state.selectedItems.delete(id);
        scoreBox.hidden = true;
      }
      resultsSection.hidden = true;
    });

    range.addEventListener("input", () => {
      const v = Number(range.value);
      state.scores[id] = v;
      scoreValueEl.textContent = v;
      scoreLabelEl.textContent = scoreLabel(v);
    });

    if (isCustom) {
      row.querySelector(".item-remove").addEventListener("click", () => {
        state.customItems = state.customItems.filter((c) => c.id !== id);
        state.selectedItems.delete(id);
        delete state.scores[id];
        renderItemList();
        resultsSection.hidden = true;
      });
    }

    return row;
  }

  function renderCustomTags() {
    customItemTags.innerHTML = "";
    state.customItems.forEach((ci) => {
      const li = document.createElement("li");
      li.textContent = `${ci.name}（权重 ${ci.weight}）`;
      li.style.cssText =
        "background:#e6f6f2;border:1px solid #bfe9de;color:#0d6b5d;border-radius:999px;padding:4px 12px;font-size:0.78rem;";
      customItemTags.appendChild(li);
    });
  }

  addCustomBtn.addEventListener("click", () => {
    const name = customNameInput.value.trim();
    if (!name) {
      customNameInput.focus();
      return;
    }
    const importance = customImportanceSelect.value;
    const id = "custom_" + Date.now();
    const weight = IMPORTANCE_WEIGHTS[importance];
    state.customItems.push({ id, name, weight });
    state.selectedItems.add(id);
    state.scores[id] = 50;
    customNameInput.value = "";
    renderItemList();
    resultsSection.hidden = true;
  });

  // ---------- Step 3: 难度 ----------
  function renderDifficulty() {
    difficultyLabels.innerHTML = DIFFICULTY_LABELS.map((d) => `<span>${d.label}</span>`).join("");
    updateDifficultyDesc();
  }

  function updateDifficultyDesc() {
    const d = DIFFICULTY_LABELS.find((x) => x.value === state.difficulty);
    difficultyDesc.textContent = `当前档位：${d.label} — ${d.desc}`;
  }

  difficultySlider.addEventListener("input", () => {
    state.difficulty = Number(difficultySlider.value);
    updateDifficultyDesc();
    resultsSection.hidden = true;
  });

  // ---------- 计算 ----------
  function computeWeights() {
    const weights = currentGoalWeights();
    const raw = {}; // id -> base weight points
    state.selectedItems.forEach((id) => {
      if (id.startsWith("custom_")) {
        const ci = state.customItems.find((c) => c.id === id);
        if (ci) raw[id] = ci.weight;
      } else {
        raw[id] = weights[id] || 0;
      }
    });
    const total = Object.values(raw).reduce((a, b) => a + b, 0);
    const normalized = {};
    Object.entries(raw).forEach(([id, w]) => {
      normalized[id] = total > 0 ? (w / total) * 100 : 0;
    });
    return normalized;
  }

  function itemDisplayName(id) {
    if (id.startsWith("custom_")) {
      const ci = state.customItems.find((c) => c.id === id);
      return ci ? ci.name : id;
    }
    return ITEMS[id].name;
  }

  function computeResults() {
    const normalized = computeWeights();
    let weightedScore = 0;
    const rows = [];

    Object.entries(normalized).forEach(([id, w]) => {
      const score = state.scores[id] ?? 50;
      const contribution = (w * score) / 100;
      weightedScore += contribution;
      rows.push({ id, name: itemDisplayName(id), weight: w, score, contribution, gap: w - contribution });
    });

    // 难度 -> 需要达到 50% 成功率所需的加权分（midpoint）
    const midpoint = 30 + state.difficulty * 10; // 难度1:40 ... 难度5:80
    const k = 0.09;
    const raw = 1 / (1 + Math.exp(-k * (weightedScore - midpoint)));
    const probability = clamp(Math.round(3 + raw * 94), 1, 99);

    return { rows, weightedScore, probability };
  }

  // ---------- 渲染结果 ----------
  function probTagText(p) {
    if (p < 30) return "偏低 — 当前条件下竞争压力较大，建议尽早针对短板发力";
    if (p < 55) return "中等偏弱 — 有希望，但需要重点补强关键短板";
    if (p < 75) return "中等偏强 — 具备一定竞争力，保持节奏并巩固优势";
    return "较高 — 综合条件不错，注意保持状态、防止临场失误";
  }

  function renderResults() {
    const { rows, probability } = computeResults();

    probNumber.textContent = probability;
    probTag.textContent = probTagText(probability);

    // 排序：优势项 = 贡献分高；短板 = gap 大（且权重不算太小）
    const byContribution = [...rows].sort((a, b) => b.contribution - a.contribution);
    const byGap = [...rows]
      .filter((r) => r.weight >= 4) // 权重太小的项即便有 gap 也不值得优先关注
      .sort((a, b) => b.gap - a.gap);

    analysisStrength.innerHTML = byContribution
      .slice(0, 3)
      .filter((r) => r.score >= 50)
      .map(
        (r) =>
          `<li><strong>${r.name}</strong>：权重 ${r.weight.toFixed(1)}%，自评 ${r.score} 分（${scoreLabel(
            r.score
          )}），是你当前的重要支撑点。</li>`
      )
      .join("") || "<li>暂无明显突出项，建议先巩固权重较高的几项。</li>";

    analysisGap.innerHTML = byGap
      .slice(0, 3)
      .map(
        (r) =>
          `<li><strong>${r.name}</strong>：权重 ${r.weight.toFixed(1)}%，自评仅 ${r.score} 分，提升空间大，建议优先投入精力。</li>`
      )
      .join("") || "<li>各项发展较均衡，暂无明显短板。</li>";

    // 警示：考研目标未选 examprep
    warningsBox.innerHTML = "";
    if (state.goal === "kaoyan" && !state.selectedItems.has("examprep")) {
      addWarning("你的目标是「考研」，但未勾选「目标考试复习 / 模拟成绩」——这是考研成功与否最核心的因素，建议勾选后重新评估，结果会更贴近实际情况。");
    }
    if (rows.length <= 1) {
      addWarning("你只选择了 1 项进行评估，样本较少，建议多勾选几项以获得更全面的分析。");
    }

    renderChart(rows);
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addWarning(text) {
    const div = document.createElement("div");
    div.className = "warning-item";
    div.textContent = "⚠ " + text;
    warningsBox.appendChild(div);
  }

  function renderChart(rows) {
    const sorted = [...rows].sort((a, b) => b.weight - a.weight);
    const labels = sorted.map((r) => r.name);
    const weightData = sorted.map((r) => Number(r.weight.toFixed(1)));
    const scoreData = sorted.map((r) => r.score);

    const ctx = document.getElementById("weight-chart").getContext("2d");
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "权重 (%)",
            data: weightData,
            backgroundColor: "#4f46e5",
            borderRadius: 4,
          },
          {
            label: "自评分 (0-100)",
            data: scoreData,
            backgroundColor: "#0d9488",
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
        },
        scales: {
          x: { beginAtZero: true },
        },
      },
    });
  }

  // ---------- 生成按钮 ----------
  generateBtn.addEventListener("click", () => {
    if (state.selectedItems.size === 0) {
      validationMsg.textContent = "请至少勾选一项要评估的内容。";
      return;
    }
    validationMsg.textContent = "";
    renderResults();
  });

  // ---------- 初始化 ----------
  renderGoalCards();
  renderDifficulty();
})();
