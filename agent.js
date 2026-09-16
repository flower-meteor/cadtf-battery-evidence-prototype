(() => {
  const messages = [];
  let busy = false;
  let pendingAction = null;

  const agentTranslations = {
    "CADTF Copilot": "CADTF 智能助手",
    "Local tools active": "本地工具已启用",
    "Explain current estimate": "解释当前估计",
    "Check evidence gaps": "检查证据缺口",
    "What should I do next?": "下一步应该做什么？",
    "Draft a review rationale": "起草审查理由",
    "Simulate a high-temperature case": "模拟高温案例",
    "Explain model limitations": "解释模型限制",
    "Ask about the current battery, evidence or model":
      "询问当前电池、证据或模型",
    "I can explain estimates, inspect evidence, simulate operating changes and draft review text. I cannot approve maintenance or certify batteries.":
      "我可以解释估计、检查证据、模拟运行变化并起草审查文本。我不能批准维修或认证电池。",
    "Send": "发送",
    "Open evidence": "打开证据",
    "Apply simulation": "应用模拟",
    "Copy review draft": "复制审查草稿",
    "Select a pack": "选择电池包",
    "Open workflow": "打开工作流",
    "Download JSON": "下载 JSON",
    "Current pack": "当前电池包",
    "Secure AI gateway": "安全 AI 网关",
    "Gateway URL": "网关地址",
    "Save gateway": "保存网关",
    "Gateway saved. The local agent remains available if it fails.":
      "网关已保存。网关不可用时仍会使用本地助手。",
    "About the current estimate": "当前估计说明",
    "Evidence gaps": "证据缺口",
    "Next recommended action": "下一步建议",
    "Review rationale draft": "审查理由草稿",
    "Model limitations": "模型限制",
    "Simulation result": "模拟结果",
    "Evidence package": "证据包",
  };

  function tr(text) {
    return state.lang === "zh" ? agentTranslations[text] || text : text;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatText(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  function detectPack(question) {
    const match = question.match(/BAT-\d+/i);
    if (match) {
      const pack = APP.packs.find(
        (item) => item.id.toLowerCase() === match[0].toLowerCase(),
      );
      if (pack) {
        APP.selectedPack = pack.id;
        return pack;
      }
    }
    return getPack();
  }

  function currentContext(pack) {
    const estimate = state.estimates[pack.id] || calculateEstimate(pack, pack.measurement);
    const model = getModel(pack);
    return {
      page: state.page,
      language: state.lang,
      role: currentRole().id,
      pack: {
        id: pack.id,
        chemistry: pack.chemistry,
        aircraft: pack.aircraft,
        configuration: pack.config,
        software: pack.software,
        calibration: pack.calibration,
        measurement: pack.measurement,
      },
      model: {
        id: model.id,
        temperature: [model.tempMin, model.tempMax],
        rates: [model.maxCharge, model.maxDischarge],
        max_cycles: model.maxCycles,
      },
      estimate,
    };
  }

  function issueLines(validation, language) {
    if (!validation.issues.length) {
      return language === "zh"
        ? "- 当前没有开放验证问题。"
        : "- No open validation findings.";
    }
    return validation.issues
      .map(
        (issue) =>
          `- **${escapeHtml(issue.code)}**: ${escapeHtml(t(issue.message))}`,
      )
      .join("\n");
  }

  function reviewDraft(pack, estimate, language) {
    const disposition =
      estimate.validation.status === "valid" ? "accepted" : "needs_data";
    if (language === "zh") {
      return [
        `审查对象：${pack.id}，批次 ${pack.measurement.batch}。`,
        `验证状态：${t(estimate.validation.status === "valid" ? "Valid" : estimate.validation.status === "blocked" ? "Blocked" : "Review required")}；SOH ${estimate.soh.toFixed(1)}%，不确定度 ±${estimate.uncertainty.toFixed(1)}%。`,
        estimate.validation.status === "valid"
          ? "证据链、构型、软件和输入来源均已关联，建议接受当前在验证域内的辅助结论。"
          : "当前证据存在未关闭的验证问题，建议补充数据或升级工程审查。",
        `建议处置：${disposition}。`,
      ].join("\n");
    }
    return [
      `Review object: ${pack.id}, batch ${pack.measurement.batch}.`,
      `Validation: ${estimate.validation.status}; SOH ${estimate.soh.toFixed(1)}%, uncertainty ±${estimate.uncertainty.toFixed(1)}%.`,
      estimate.validation.status === "valid"
        ? "The evidence links, configuration, software and input provenance are present. Accept the bounded advisory within its validated domain."
        : "Open validation findings remain. Request additional data or escalate for engineering review.",
      `Proposed disposition: ${disposition}.`,
    ].join("\n");
  }

  function parseSimulation(question, pack) {
    const measurement = { ...pack.measurement };
    const patterns = {
      maxTemp: /(?:max(?:imum)?\s*temp(?:erature)?|最高温度|最大温度)[^\d-]*(-?\d+(?:\.\d+)?)/i,
      minTemp: /(?:min(?:imum)?\s*temp(?:erature)?|最低温度|最小温度)[^\d-]*(-?\d+(?:\.\d+)?)/i,
      charge: /(?:charge\s*(?:rate|c-rate)?|充电倍率)[^\d-]*(\d+(?:\.\d+)?)/i,
      discharge: /(?:discharge\s*(?:rate|c-rate)?|放电倍率)[^\d-]*(\d+(?:\.\d+)?)/i,
      cycles: /(?:cycles?|循环(?:次数)?)[^\d-]*(\d+(?:\.\d+)?)/i,
      capacity: /(?:capacity|容量)[^\d-]*(\d+(?:\.\d+)?)/i,
      resistance: /(?:resistance|内阻)[^\d-]*(\d+(?:\.\d+)?)/i,
    };
    let changed = false;
    Object.entries(patterns).forEach(([key, pattern]) => {
      const match = question.match(pattern);
      if (match) {
        measurement[key] = Number(match[1]);
        changed = true;
      }
    });
    return changed ? measurement : null;
  }

  async function localAnswer(question) {
    const pack = detectPack(question);
    const estimate =
      state.estimates[pack.id] || calculateEstimate(pack, pack.measurement);
    const model = getModel(pack);
    const q = question.toLowerCase();
    const zh =
      state.lang === "zh" ||
      /为什么|解释|证据|缺什么|下一步|审查|模拟|模型|打开|下载|对比/.test(
        question,
      );
    const citations = [
      `EST-${pack.id}`,
      `MODEL-${model.id}`,
      `CFG-${pack.config}`,
    ];

    if (/help|help me|can you|能做什么|帮助|怎么用/.test(q)) {
      return {
        text: zh
          ? "我可以：\n- 解释当前估计和验证结果\n- 检查证据包缺口\n- 对比历史证据哈希\n- 模拟温度、倍率或循环变化\n- 起草审查理由\n- 打开页面或下载证据\n\n写操作不会自动执行，必须由你确认。"
          : "I can:\n- explain the current estimate and validation\n- inspect evidence-package gaps\n- compare evidence hashes\n- simulate temperature, rate or cycle changes\n- draft a review rationale\n- open workflows and export evidence\n\nWrite actions require your confirmation.",
        citations: [],
        actions: [],
      };
    }

    const navigation = [
      [/overview|总览|首页/, "overview"],
      [/guided|引导/, "guided"],
      [/fleet|机队|构型/, "fleet"],
      [/measurement|测量|估计/, "measurement"],
      [/data lab|数据实验室|导入/, "data-lab"],
      [/evidence|证据|审查/, "evidence"],
      [/pilot|试点|评价/, "pilot"],
      [/dictionary|字典|导出/, "dictionary"],
      [/method|模型|方法/, "methods"],
    ];
    if (/(open|go to|navigate|打开|进入|转到)/i.test(question)) {
      const target = navigation.find(([pattern]) => pattern.test(q));
      if (target) {
        return {
          text: zh
            ? `可以打开 **${PAGE_TITLES[target[1]]}**。`
            : `Opening **${PAGE_TITLES[target[1]]}**.`,
          navigate: target[1],
          citations: [],
          actions: [{ type: "navigate", page: target[1], label: tr("Open workflow") }],
        };
      }
    }

    if (/compare|对比|上一版|previous/.test(q)) {
      const previous = state.evidenceHistory[pack.id];
      const current = await buildEvidencePackage(pack);
      return {
        text: zh
          ? `当前证据包哈希为 **${current.package_hash.slice(0, 16)}…**。\n${previous ? `上一版哈希为 **${previous.slice(0, 16)}…**，${previous === current.package_hash ? "没有检测到变化。" : "证据内容已发生变化。"}` : "暂无上一版证据包。"}`
          : `Current package hash: **${current.package_hash.slice(0, 16)}…**.\n${previous ? `Previous hash: **${previous.slice(0, 16)}…**; ${previous === current.package_hash ? "no change detected." : "the evidence content changed."}` : "No previous package is stored."}`,
        citations: [`EVIDENCE-${current.package_id}`],
        actions: [],
      };
    }

    if (/draft|review rationale|审查理由|审查意见|起草/.test(q)) {
      const draft = reviewDraft(pack, estimate, zh ? "zh" : "en");
      return {
        text: `${tr("Review rationale draft")}:\n${draft}`,
        citations,
        actions: [{ type: "copy", text: draft, label: tr("Copy review draft") }],
      };
    }

    if (/gap|missing|缺什么|缺口|证据.*不足|missing evidence/.test(q)) {
      const reviewChecks = Object.entries(estimate.validation.checks).filter(
        ([, value]) => value !== "pass",
      );
      return {
        text: zh
          ? `证据检查结果：\n${reviewChecks.length ? reviewChecks.map(([key, value]) => `- **${key}**：${value}`).join("\n") : "- 所有证据字段均已通过。"}\n\n开放问题：\n${issueLines(estimate.validation, "zh")}`
          : `Evidence checks:\n${reviewChecks.length ? reviewChecks.map(([key, value]) => `- **${key}**: ${value}`).join("\n") : "- All evidence fields pass."}\n\nOpen findings:\n${issueLines(estimate.validation, "en")}`,
        citations,
        actions: [
          { type: "navigate", page: "evidence", label: tr("Open evidence") },
        ],
      };
    }

    if (/simulate|what if|如果|模拟|改成|change.*temperature|change.*cycle/.test(q)) {
      const simulated = parseSimulation(question, pack);
      if (!simulated) {
        return {
          text: zh
            ? "请给出要模拟的数值，例如：“把 BAT-001 最高温度改成 50°C，循环改成 1300”。"
            : "Provide values to simulate, for example: “change BAT-001 maximum temperature to 50 C and cycles to 1300”.",
          citations: [],
          actions: [],
        };
      }
      const simulatedResult = calculateEstimate(pack, simulated);
      return {
        text: zh
          ? `${tr("Simulation result")}：状态由 **${t(estimate.validation.status === "valid" ? "Valid" : estimate.validation.status === "blocked" ? "Blocked" : "Review required")}** 变为 **${t(simulatedResult.validation.status === "valid" ? "Valid" : simulatedResult.validation.status === "blocked" ? "Blocked" : "Review required")}**；SOH ${simulatedResult.soh.toFixed(1)}%，不确定度 ±${simulatedResult.uncertainty.toFixed(1)}%。\n${t(simulatedResult.advisory)}`
          : `${tr("Simulation result")}: validation changes from **${estimate.validation.status}** to **${simulatedResult.validation.status}**; SOH ${simulatedResult.soh.toFixed(1)}%, uncertainty ±${simulatedResult.uncertainty.toFixed(1)}%.\n${simulatedResult.advisory}`,
        citations,
        actions: currentRole().canEdit
          ? [
              {
                type: "apply-simulation",
                packId: pack.id,
                measurement: simulated,
                label: tr("Apply simulation"),
              },
            ]
          : [],
      };
    }

    if (/model|limitation|模型|限制|适用域/.test(q)) {
      return {
        text: zh
          ? `模型 **${model.id}** 的验证范围为 ${model.tempMin} 至 ${model.tempMax}°C，充电 ${model.maxCharge.toFixed(2)}C，放电 ${model.maxDischarge.toFixed(2)}C，最多 ${model.maxCycles} 次循环。\n\n限制：该模型是合成教学基线，未使用真实飞机电池包训练或验证；不能用于放行、适航批准、热失控防护或飞行控制。`
          : `Model **${model.id}** is validated from ${model.tempMin} to ${model.tempMax} C, charge ${model.maxCharge.toFixed(2)}C, discharge ${model.maxDischarge.toFixed(2)}C and up to ${model.maxCycles} cycles.\n\nLimitations: this is a synthetic educational baseline, not trained or validated on a real aircraft pack. It cannot be used for dispatch, airworthiness approval, thermal-runaway prevention or flight control.`,
        citations: CONTENT.references
          .filter((item) =>
            ["NASA-STD-7009B", "NIST-AMS-400-2", "BILLS-2023"].includes(
              item.id,
            ),
          )
          .map((item) => item.id),
        actions: [
          { type: "navigate", page: "methods", label: `Open ${PAGE_TITLES.methods}` },
        ],
      };
    }

    if (/why|blocked|review required|为什么|阻断|需审查|原因/.test(q)) {
      return {
        text: zh
          ? `${pack.id} 当前状态为 **${t(estimate.validation.status === "valid" ? "Valid" : estimate.validation.status === "blocked" ? "Blocked" : "Review required")}**。\n\n原因：\n${issueLines(estimate.validation, "zh")}\n\n建议：${t(estimate.advisory)}`
          : `${pack.id} is currently **${estimate.validation.status}**.\n\nFindings:\n${issueLines(estimate.validation, "en")}\n\nAdvisory: ${estimate.advisory}`,
        citations,
        actions: [
          { type: "navigate", page: "evidence", label: tr("Open evidence") },
        ],
      };
    }

    if (/evidence|hash|证据|哈希|追溯/.test(q)) {
      const evidence = await buildEvidencePackage(pack);
      return {
        text: zh
          ? `${tr("Evidence package")} **${evidence.package_id}** 包含资产、构型、软件、测量、模型、验证和估计记录。\n\nSHA-256：\`${evidence.package_hash}\`\n追踪完整度：${evidence.traceability_score_pct}%`
          : `${tr("Evidence package")} **${evidence.package_id}** links the asset, configuration, software, measurement, model, validation and estimate.\n\nSHA-256: \`${evidence.package_hash}\`\nTraceability score: ${evidence.traceability_score_pct}%`,
        citations: [`EVIDENCE-${evidence.package_id}`],
        actions: [
          { type: "navigate", page: "evidence", label: tr("Open evidence") },
          { type: "download-evidence", packId: pack.id, label: "Download JSON" },
        ],
      };
    }

    if (/next|recommend|下一步|建议/.test(q)) {
      const next =
        estimate.validation.status === "valid"
          ? zh
            ? "记录审查处置，并导出证据包。"
            : "Record the review disposition and export the evidence package."
          : zh
            ? "打开证据页，关闭验证问题；在问题关闭前不要接受该估计。"
            : "Open Evidence & Review and close the validation findings before accepting the estimate.";
      return {
        text: `${tr("Next recommended action")}: ${next}`,
        citations,
        actions: [
          {
            type: "navigate",
            page: estimate.validation.status === "valid" ? "evidence" : "evidence",
            label: tr("Open evidence"),
          },
        ],
      };
    }

    return {
      text: zh
        ? `${pack.id} 当前状态为 **${t(estimate.validation.status === "valid" ? "Valid" : estimate.validation.status === "blocked" ? "Blocked" : "Review required")}**，SOH ${estimate.soh.toFixed(1)}%，不确定度 ±${estimate.uncertainty.toFixed(1)}%。你可以让我解释原因、检查证据、模拟变化、起草审查理由或打开某个工作流。`
        : `${pack.id} is **${estimate.validation.status}**, SOH ${estimate.soh.toFixed(1)}%, uncertainty ±${estimate.uncertainty.toFixed(1)}%. Ask me why, to inspect evidence, simulate a change, draft a review rationale or open a workflow.`,
      citations,
      actions: [],
    };
  }

  async function remoteAnswer(question) {
    const gateway = localStorage.getItem("cadtfAgentGateway");
    if (!gateway) return null;
    const pack = detectPack(question);
    const response = await fetch(gateway, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        language: state.lang,
        context: currentContext(pack),
        tools: [
          "get_estimate",
          "get_validation",
          "get_evidence",
          "compare_evidence",
          "simulate_measurement",
        ],
        safety: {
          read_only: true,
          no_maintenance_approval: true,
          cite_evidence: true,
        },
      }),
    });
    if (!response.ok) throw new Error(`Gateway ${response.status}`);
    const payload = await response.json();
    if (!payload.answer) throw new Error("Gateway response missing answer");
    return {
      text: payload.answer,
      citations: payload.citations || [],
      actions: payload.actions || [],
    };
  }

  function addMessage(role, text, citations = [], actions = []) {
    messages.push({ role, text, citations, actions });
    renderMessages();
  }

  function renderMessages() {
    const container = document.getElementById("agent-messages");
    if (!container) return;
    container.innerHTML = messages
      .map(
        (message) => `
          <div class="agent-message ${message.role}">
            <div class="agent-bubble">${formatText(message.text)}</div>
            ${
              message.citations?.length
                ? `<div class="agent-citations">${message.citations
                    .map(
                      (citation) =>
                        `<span class="agent-citation">[${escapeHtml(citation)}]</span>`,
                    )
                    .join("")}</div>`
                : ""
            }
            ${
              message.actions?.length
                ? `<div class="agent-actions">${message.actions
                    .map(
                      (action, index) =>
                        `<button class="agent-action" data-agent-action="${index}" data-message-index="${messages.indexOf(message)}">${escapeHtml(action.label)}</button>`,
                    )
                    .join("")}</div>`
                : ""
            }
          </div>`,
      )
      .join("");
    container.scrollTop = container.scrollHeight;
  }

  function quickPrompts() {
    const zh = state.lang === "zh";
    const prompts = [
      zh ? "解释当前估计" : "Explain current estimate",
      zh ? "检查证据缺口" : "Check evidence gaps",
      zh ? "下一步应该做什么？" : "What should I do next?",
      zh ? "起草审查理由" : "Draft a review rationale",
      zh ? "模拟高温案例" : "Simulate a high-temperature case",
      zh ? "解释模型限制" : "Explain model limitations",
    ];
    return prompts
      .map(
        (prompt) =>
          `<button class="agent-prompt" data-agent-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`,
      )
      .join("");
  }

  function updatePromptLabels() {
    const promptContainer = document.getElementById("agent-prompts");
    if (promptContainer) promptContainer.innerHTML = quickPrompts();
    const input = document.getElementById("agent-input");
    if (input) input.placeholder = tr("Ask about the current battery, evidence or model");
    const context = document.getElementById("agent-context");
    if (context) {
      const pack = getPack();
      context.textContent = `${tr("Current pack")}: ${pack.id} · ${pack.aircraft} · ${pack.config} · ${pack.software}`;
    }
    const send = document.getElementById("agent-send");
    if (send) send.setAttribute("aria-label", tr("Send"));
  }

  async function sendQuestion(question) {
    if (!question.trim() || busy) return;
    busy = true;
    const input = document.getElementById("agent-input");
    const send = document.getElementById("agent-send");
    input.value = "";
    input.disabled = true;
    send.disabled = true;
    addMessage("user", question);
    const typing = document.createElement("div");
    typing.className = "agent-typing";
    typing.textContent = state.lang === "zh" ? "正在调用 CADTF 工具..." : "Calling CADTF tools...";
    document.getElementById("agent-messages").appendChild(typing);
    try {
      let answer = null;
      try {
        answer = await remoteAnswer(question);
      } catch {
        answer = null;
      }
      if (!answer) answer = await localAnswer(question);
      pendingAction = answer.actions?.length
        ? {
            packId: detectPack(question).id,
            actions: answer.actions,
          }
        : null;
      recordAudit("AGENT_RESPONSE", detectPack(question).id, {
        question,
        local_tools: !localStorage.getItem("cadtfAgentGateway"),
        action_count: answer.actions?.length || 0,
      });
      addMessage("assistant", answer.text, answer.citations || [], answer.actions || []);
    } finally {
      typing.remove();
      busy = false;
      input.disabled = false;
      send.disabled = false;
      input.focus();
    }
  }

  async function executeAgentAction(messageIndex, actionIndex) {
    const message = messages[messageIndex];
    const action = message?.actions?.[actionIndex];
    if (!action) return;
    if (action.type === "navigate") {
      navigate(action.page);
      closeDrawer();
      return;
    }
    if (action.type === "copy") {
      try {
        await navigator.clipboard.writeText(action.text);
        showToast("Review draft copied.");
      } catch {
        downloadText("cadtf_review_draft.txt", action.text, "text/plain");
      }
      return;
    }
    if (action.type === "download-evidence") {
      const pack = getPack(action.packId);
      const evidence = await buildEvidencePackage(pack);
      downloadText(
        `${evidence.package_id}.json`,
        JSON.stringify(evidence, null, 2),
        "application/json",
      );
      return;
    }
    if (action.type === "apply-simulation") {
      if (!currentRole().canEdit) {
        showToast("The current role cannot apply a simulated measurement.");
        return;
      }
      const pack = getPack(action.packId);
      pack.measurement = action.measurement;
      state.estimates[pack.id] = calculateEstimate(pack, pack.measurement);
      recordAudit("AGENT_SIMULATION_APPLIED", pack.id, {
        measurement: action.measurement,
      });
      showToast("Simulation applied to the browser case.");
      renderPage();
      updatePromptLabels();
    }
  }

  function openDrawer() {
    document.getElementById("agent-drawer").classList.add("open");
    document.getElementById("agent-launcher").setAttribute("aria-expanded", "true");
    updatePromptLabels();
    document.getElementById("agent-input").focus();
  }

  function closeDrawer() {
    document.getElementById("agent-drawer").classList.remove("open");
    document.getElementById("agent-launcher").setAttribute("aria-expanded", "false");
  }

  function toggleDrawer() {
    const drawer = document.getElementById("agent-drawer");
    if (drawer.classList.contains("open")) closeDrawer();
    else openDrawer();
  }

  function injectUi() {
    const root = document.createElement("div");
    root.innerHTML = `
      <button class="agent-launcher" id="agent-launcher" type="button" aria-expanded="false">
        <i data-lucide="bot"></i><span>${tr("CADTF Copilot")}</span>
      </button>
      <section class="agent-drawer" id="agent-drawer" aria-label="CADTF Copilot">
        <header class="agent-header">
          <span class="agent-avatar"><i data-lucide="bot"></i></span>
          <div class="agent-header-copy">
            <strong>${tr("CADTF Copilot")}</strong>
            <span>${tr("Local tools active")}</span>
          </div>
          <button class="agent-icon-button" id="agent-settings" type="button" title="${tr("Secure AI gateway")}"><i data-lucide="settings"></i></button>
          <button class="agent-icon-button" id="agent-close" type="button" title="Close"><i data-lucide="x"></i></button>
        </header>
        <div class="agent-context" id="agent-context"></div>
        <div class="agent-messages" id="agent-messages"></div>
        <div class="agent-prompts" id="agent-prompts"></div>
        <form class="agent-composer" id="agent-form">
          <textarea id="agent-input" rows="1" placeholder="${tr("Ask about the current battery, evidence or model")}"></textarea>
          <button class="agent-send" id="agent-send" type="submit" aria-label="${tr("Send")}"><i data-lucide="send"></i></button>
        </form>
        <div class="agent-settings-panel" id="agent-settings-panel">
          <label>${tr("Gateway URL")}<input id="agent-gateway-input" type="url" placeholder="https://..." /></label>
          <button class="button primary" id="agent-gateway-save" type="button">${tr("Save gateway")}</button>
        </div>
      </section>`;
    document.body.appendChild(root);
  }

  function bindUi() {
    document.getElementById("agent-launcher").addEventListener("click", toggleDrawer);
    document.getElementById("agent-close").addEventListener("click", closeDrawer);
    document.getElementById("agent-form").addEventListener("submit", (event) => {
      event.preventDefault();
      sendQuestion(document.getElementById("agent-input").value);
    });
    document.getElementById("agent-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendQuestion(event.target.value);
      }
    });
    document.getElementById("agent-prompts").addEventListener("click", (event) => {
      const button = event.target.closest("[data-agent-prompt]");
      if (button) sendQuestion(button.dataset.agentPrompt);
    });
    document.getElementById("agent-messages").addEventListener("click", (event) => {
      const button = event.target.closest("[data-agent-action]");
      if (button) {
        executeAgentAction(
          Number(button.dataset.messageIndex),
          Number(button.dataset.agentAction),
        );
      }
    });
    document.getElementById("agent-settings").addEventListener("click", () => {
      const panel = document.getElementById("agent-settings-panel");
      panel.classList.toggle("open");
      document.getElementById("agent-gateway-input").value =
        localStorage.getItem("cadtfAgentGateway") || "";
    });
    document.getElementById("agent-gateway-save").addEventListener("click", () => {
      const value = document.getElementById("agent-gateway-input").value.trim();
      if (value) localStorage.setItem("cadtfAgentGateway", value);
      else localStorage.removeItem("cadtfAgentGateway");
      document.getElementById("agent-settings-panel").classList.remove("open");
      showToast(tr("Gateway saved. The local agent remains available if it fails."));
    });
  }

  function init() {
    injectUi();
    bindUi();
    addMessage("assistant", tr("I can explain estimates, inspect evidence, simulate operating changes and draft review text. I cannot approve maintenance or certify batteries."));
    updatePromptLabels();
    if (window.lucide) window.lucide.createIcons();
    if (new URLSearchParams(location.search).get("agent") === "open") {
      openDrawer();
    }
  }

  window.CADTF_AGENT = {
    ask: sendQuestion,
    open: openDrawer,
    close: closeDrawer,
    refresh: updatePromptLabels,
    localAnswer,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
