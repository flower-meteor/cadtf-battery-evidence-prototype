window.addEventListener("error", (event) => {
  const target = document.getElementById("page-content");
  if (target) {
    target.innerHTML = `<div class="advisory error"><strong>Browser runtime error</strong><p>${escapeHtml(event.message)}</p></div>`;
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const target = document.getElementById("page-content");
  if (target) {
    target.innerHTML = `<div class="advisory error"><strong>Browser runtime error</strong><p>${escapeHtml(String(event.reason))}</p></div>`;
  }
});

const APP = {
  models: {
    "BATT-NMC-M1": {
      id: "BATT-NMC-M1",
      name: "NMC equivalent-circuit baseline",
      chemistry: "NMC",
      ratedCapacity: 20,
      baselineResistance: 20,
      tempMin: -10,
      tempMax: 45,
      maxCharge: 1.0,
      maxDischarge: 2.0,
      maxCycles: 1200,
      minSoh: 80,
      configs: ["CONF-A", "CONF-B"],
      software: ["2"],
    },
    "BATT-LFP-M1": {
      id: "BATT-LFP-M1",
      name: "LFP equivalent-circuit baseline",
      chemistry: "LFP",
      ratedCapacity: 22,
      baselineResistance: 18,
      tempMin: -15,
      tempMax: 50,
      maxCharge: 1.0,
      maxDischarge: 2.0,
      maxCycles: 2500,
      minSoh: 80,
      configs: ["CONF-L1"],
      software: ["2", "3"],
    },
  },
  packs: [
    {
      id: "BAT-001",
      manufacturer: "Demo Cell Systems",
      chemistry: "NMC",
      ratedCapacity: 20,
      baselineResistance: 20,
      aircraft: "TRAIN-01",
      config: "CONF-A",
      software: "2.1.0",
      calibration: true,
      modelId: "BATT-NMC-M1",
      measurement: {
        batch: "LAB-001",
        capacity: 18.72,
        resistance: 21.2,
        minTemp: -5,
        maxTemp: 38,
        charge: 0.8,
        discharge: 1.45,
        cycles: 410,
        provenance: "Synthetic laboratory summary",
      },
    },
    {
      id: "BAT-002",
      manufacturer: "Demo Cell Systems",
      chemistry: "NMC",
      ratedCapacity: 20,
      baselineResistance: 20,
      aircraft: "TRAIN-02",
      config: "CONF-B",
      software: "2.0.1",
      calibration: true,
      modelId: "BATT-NMC-M1",
      measurement: {
        batch: "LAB-002",
        capacity: 15.9,
        resistance: 29.4,
        minTemp: 1,
        maxTemp: 51.5,
        charge: 1.1,
        discharge: 2.2,
        cycles: 1180,
        provenance: "Synthetic high-stress case",
      },
    },
    {
      id: "BAT-003",
      manufacturer: "Demo Cell Systems",
      chemistry: "LFP",
      ratedCapacity: 22,
      baselineResistance: 18,
      aircraft: "TRAIN-01",
      config: "CONF-L1",
      software: "3.0.0",
      calibration: true,
      modelId: "BATT-LFP-M1",
      measurement: {
        batch: "LAB-003",
        capacity: 20.9,
        resistance: 18.6,
        minTemp: -8,
        maxTemp: 36,
        charge: 0.75,
        discharge: 1.35,
        cycles: 260,
        provenance: "Synthetic LFP laboratory summary",
      },
    },
  ],
  dictionary: [
    ["pack_id", "电池包编号", "text", "Links an estimate to the physical installation."],
    ["aircraft_id", "飞机编号", "text", "Identifies the aircraft carrying the pack."],
    ["configuration_revision", "构型修订", "text", "Detects installation changes."],
    ["software_version", "软件版本", "semantic version", "Records the software baseline."],
    ["measured_at", "测量时间", "ISO 8601 UTC", "Places records on a shared time basis."],
    ["capacity_ah", "容量", "Ah", "Constrains the capacity-health component."],
    ["resistance_mohm", "内阻", "mOhm", "Constrains resistance and power estimates."],
    ["temperature_range_c", "温度范围", "degrees C", "Checks the validated thermal envelope."],
    ["charge_c_rate", "充电倍率", "C", "Checks charge-operation validity."],
    ["discharge_c_rate", "放电倍率", "C", "Checks discharge-operation validity."],
    ["cycles", "循环次数", "count", "Checks cycle-life validity."],
    ["provenance", "数据来源", "text", "States where the measurement came from."],
    ["source_hash", "源数据哈希", "SHA-256", "Detects changes to source data."],
    ["model_id", "模型编号", "text", "Identifies model and validation domain."],
    ["validation_status", "验证状态", "valid/review/blocked", "Controls advisories."],
    ["uncertainty_pct", "不确定度", "%", "States estimate confidence."],
    ["evidence_hash", "证据包哈希", "SHA-256", "Detects evidence changes."],
    ["reviewer", "审查人员", "text", "Records accountable review."],
    ["disposition", "审查处置", "text", "Records the authorised outcome."],
    ["signature", "签署依据", "text", "Links to authorisation reference."],
  ],
  initialReviews: {},
  selectedPack: "BAT-001",
};

const PAGE_TITLES = {
  overview: "System overview",
  guided: "Guided Demo",
  fleet: "Fleet & Configuration",
  measurement: "Measurement & Estimate",
  "data-lab": "Data Lab",
  evidence: "Evidence & Review",
  pilot: "Pilot Evaluation",
  dictionary: "Dictionary & Export",
  methods: "Model & Methods",
};

const CONTENT = window.CADTF_CONTENT;

const state = {
  page: "overview",
  estimates: {},
  reviews: loadReviews(),
  lang: loadValue("cadtfLang", "en"),
  role: loadValue("cadtfRole", "maintenance"),
  demoStep: Number(loadValue("cadtfDemoStep", "0")),
  importedRows: null,
  evidenceHistory: loadValue("cadtfEvidenceHistory", {}),
  audit: loadValue("cadtfAudit", []),
};

function loadValue(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveValue(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function t(text) {
  if (state.lang !== "zh") return text;
  return CONTENT.translations.zh[text] || text;
}

function translateDom() {
  if (state.lang !== "zh") return;
  const root = document.getElementById("page-content");
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const original = node.nodeValue;
    const trimmed = original.trim();
    if (!trimmed) return;
    const translated = t(trimmed);
    if (translated !== trimmed) {
      node.nodeValue = original.replace(trimmed, translated);
    }
  });
}

function currentRole() {
  return (
    CONTENT.roles.find((role) => role.id === state.role) || CONTENT.roles[0]
  );
}

function recordAudit(eventType, packId, details) {
  state.audit.unshift({
    id: `AUD-${Date.now().toString(36).toUpperCase()}`,
    eventType,
    packId,
    details,
    role: state.role,
    createdAt: new Date().toISOString(),
  });
  state.audit = state.audit.slice(0, 100);
  saveValue("cadtfAudit", state.audit);
}

function loadReviews() {
  try {
    return JSON.parse(localStorage.getItem("cadtfReviews") || "{}");
  } catch {
    return {};
  }
}

function saveReviews() {
  localStorage.setItem("cadtfReviews", JSON.stringify(state.reviews));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, lower, upper) {
  return Math.max(lower, Math.min(upper, value));
}

function statusBadge(status) {
  const labels = {
    valid: "Valid",
    review_required: "Review required",
    blocked: "Blocked",
  };
  return `<span class="status ${status}">${escapeHtml(t(labels[status] || status))}</span>`;
}

function formatPercent(value) {
  return `${Number(value).toFixed(1)}%`;
}

function getPack(packId = APP.selectedPack) {
  return APP.packs.find((pack) => pack.id === packId) || APP.packs[0];
}

function getModel(pack) {
  return APP.models[pack.modelId];
}

function validateMeasurement(pack, measurement) {
  const model = getModel(pack);
  const issues = [];
  const checks = {};

  const chemistryPass = model.chemistry === pack.chemistry;
  checks.chemistry = chemistryPass ? "pass" : "blocked";
  if (!chemistryPass) {
    issues.push({
      code: "CHEMISTRY_MISMATCH",
      severity: "blocked",
      message: `${pack.chemistry} does not match ${model.chemistry}.`,
    });
  }

  const tempPass =
    measurement.minTemp >= model.tempMin &&
    measurement.maxTemp <= model.tempMax;
  checks.temperature = tempPass ? "pass" : "blocked";
  if (!tempPass) {
    issues.push({
      code: "TEMPERATURE_OUT_OF_DOMAIN",
      severity: "blocked",
      message: `${measurement.minTemp} to ${measurement.maxTemp} C is outside ${model.tempMin} to ${model.tempMax} C.`,
    });
  } else if (
    measurement.maxTemp >= model.tempMax - 2 ||
    measurement.minTemp <= model.tempMin + 2
  ) {
    checks.temperature = "review";
    issues.push({
      code: "TEMPERATURE_NEAR_LIMIT",
      severity: "review",
      message: "Temperature is close to the validated boundary.",
    });
  }

  const chargePass = measurement.charge <= model.maxCharge;
  checks.charge_rate = chargePass ? "pass" : "blocked";
  if (!chargePass) {
    issues.push({
      code: "CHARGE_RATE_OUT_OF_DOMAIN",
      severity: "blocked",
      message: `${measurement.charge} C exceeds ${model.maxCharge} C.`,
    });
  }

  const dischargePass = measurement.discharge <= model.maxDischarge;
  checks.discharge_rate = dischargePass ? "pass" : "blocked";
  if (!dischargePass) {
    issues.push({
      code: "DISCHARGE_RATE_OUT_OF_DOMAIN",
      severity: "blocked",
      message: `${measurement.discharge} C exceeds ${model.maxDischarge} C.`,
    });
  }

  const cyclePass = measurement.cycles <= model.maxCycles;
  checks.cycle_life = cyclePass ? "pass" : "blocked";
  if (!cyclePass) {
    issues.push({
      code: "CYCLES_OUT_OF_DOMAIN",
      severity: "blocked",
      message: `${measurement.cycles} cycles exceed ${model.maxCycles}.`,
    });
  } else if (measurement.cycles >= model.maxCycles * 0.95) {
    checks.cycle_life = "review";
    issues.push({
      code: "CYCLES_NEAR_LIMIT",
      severity: "review",
      message: "Cycle count is close to the validated boundary.",
    });
  }

  const configPass = model.configs.includes(pack.config);
  checks.configuration = configPass ? "pass" : "review";
  if (!configPass) {
    issues.push({
      code: "CONFIGURATION_CHANGED",
      severity: "review",
      message: `${pack.config} is not included in the model validation evidence.`,
    });
  }

  const softwareMajor = String(pack.software).split(".")[0];
  const softwarePass = model.software.includes(softwareMajor);
  checks.software = softwarePass ? "pass" : "review";
  if (!softwarePass) {
    issues.push({
      code: "SOFTWARE_CHANGED",
      severity: "review",
      message: `Software major version ${softwareMajor} has not been validated.`,
    });
  }

  checks.calibration = pack.calibration ? "pass" : "review";
  if (!pack.calibration) {
    issues.push({
      code: "CALIBRATION_INVALID",
      severity: "review",
      message: "Sensor calibration is invalid or expired.",
    });
  }

  const status = issues.some((issue) => issue.severity === "blocked")
    ? "blocked"
    : issues.some((issue) => issue.severity === "review")
      ? "review_required"
      : "valid";
  return { status, issues, checks };
}

function calculateEstimate(pack, measurement) {
  const model = getModel(pack);
  const validation = validateMeasurement(pack, measurement);
  const capacityHealth = clamp(measurement.capacity / model.ratedCapacity, 0, 1.1);
  const resistanceHealth = clamp(
    model.baselineResistance / measurement.resistance,
    0,
    1.1,
  );
  const soh = clamp(
    0.75 * capacityHealth + 0.25 * resistanceHealth,
    0,
    1.1,
  );
  const tempPosition =
    (measurement.maxTemp - model.tempMin) / (model.tempMax - model.tempMin);
  const cycleFraction = Math.min(measurement.cycles / model.maxCycles, 1.5);
  let uncertainty = 0.02 + 0.03 * cycleFraction;
  uncertainty += Math.max(0, tempPosition - 0.8) * 0.1;
  if (!pack.calibration) uncertainty += 0.04;
  if (validation.status !== "valid") uncertainty += 0.05;
  uncertainty = clamp(uncertainty, 0.015, 0.25);
  const tempFactor = clamp(1 - Math.max(0, tempPosition - 0.85) * 0.35, 0.9, 1);
  const usablePower = clamp(
    tempFactor * (0.55 + 0.45 * resistanceHealth),
    0.45,
    1.05,
  );

  let remainingCycles = 0;
  if (soh > model.minSoh / 100) {
    const degradation = Math.max(
      (1 - soh) / Math.max(measurement.cycles, 1),
      0.000001,
    );
    remainingCycles = Math.min(
      Math.round((soh - model.minSoh / 100) / degradation),
      5000,
    );
  }

  let advisory;
  if (validation.status === "blocked") {
    advisory =
      "Advisory suppressed: the input is outside the validated model domain.";
  } else if (validation.status === "review_required") {
    advisory =
      "Do not release the estimate until the open review items are closed.";
  } else if (soh >= 0.9 && usablePower >= 0.85) {
    advisory =
      "Within the validated domain. Continue normal monitoring and approved maintenance intervals.";
  } else {
    advisory =
      "Within the validated domain. Schedule a diagnostic capacity and resistance check.";
  }

  return {
    soh: soh * 100,
    capacityHealth: capacityHealth * 100,
    resistanceHealth: resistanceHealth * 100,
    usablePower: usablePower * 100,
    uncertainty: uncertainty * 100,
    remainingCycles,
    advisory,
    validation,
  };
}

function ensureEstimates() {
  APP.packs.forEach((pack) => {
    state.estimates[pack.id] = calculateEstimate(pack, pack.measurement);
  });
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function buildEvidencePackage(pack, measurement = pack.measurement) {
  const estimate = calculateEstimate(pack, measurement);
  const model = getModel(pack);
  const createdAt =
    measurement.measuredAt || "2026-09-16T00:00:00.000Z";
  const payload = {
    package_version: "1.0",
    physical_asset: {
      pack_id: pack.id,
      chemistry: pack.chemistry,
      aircraft_id: pack.aircraft,
      configuration_revision: pack.config,
      software_version: pack.software,
      calibration_valid: pack.calibration,
    },
    input_record: { ...measurement },
    model_record: {
      model_id: model.id,
      algorithm: "browser capacity-resistance estimator v1",
      validation_domain: {
        temperature_c: [model.tempMin, model.tempMax],
        charge_c_rate: model.maxCharge,
        discharge_c_rate: model.maxDischarge,
        max_cycles: model.maxCycles,
      },
    },
    validation_record: estimate.validation,
    estimate_record: estimate,
    review_record: {
      required: estimate.validation.status !== "valid",
      state:
        estimate.validation.status === "valid"
          ? "optional"
          : "pending",
    },
    created_at: createdAt,
  };
  payload.package_id = `EVP-${(await sha256(stableStringify(payload))).slice(0, 16).toUpperCase()}`;
  payload.package_hash = await sha256(stableStringify(payload));
  return payload;
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function table(headers, rows) {
  return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table></div>`;
}

function renderOverview() {
  const estimates = APP.packs.map((pack) => ({
    pack,
    result: state.estimates[pack.id],
  }));
  const pending = estimates.filter(
    ({ result }) => result.validation.status !== "valid",
  );
  const rowData = estimates.map(({ pack, result }) => [
    `<strong>${escapeHtml(pack.id)}</strong>`,
    formatPercent(result.soh),
    `±${formatPercent(result.uncertainty)}`,
    statusBadge(result.validation.status),
    "100.0%",
  ]);
  return `
    <section class="panel soft" style="margin-bottom:18px">
      <div class="section-heading"><h2>${t("Guided demonstration")}</h2><p>${t("Run complete workflow")}</p></div>
      <p class="muted">Follow a six-step case from a valid estimate through configuration change, blocked advice, evidence review and export.</p>
      <div class="button-row"><button class="button primary" id="start-guided-demo"><i data-lucide="route"></i>${t("Start guided demo")}</button></div>
    </section>
    <div class="metric-grid">
      ${metric("Aircraft", "2")}
      ${metric("Battery packs", String(APP.packs.length))}
      ${metric("Estimates", String(estimates.length))}
      ${metric("Pending reviews", String(pending.length))}
      ${metric("Evidence completeness", "100.0%")}
    </div>
    <div class="two-column">
      <section class="panel">
        <div class="section-heading">
          <h2>Latest estimates</h2>
          <p>Current synthetic records</p>
        </div>
        ${table(["Pack", "SOH", "Uncertainty", "Validation", "Evidence"], rowData)}
      </section>
      <section class="panel soft">
        <div class="section-heading">
          <h2>Review queue</h2>
          <p>${pending.length} ${t("open")}</p>
        </div>
        ${
          pending.length
            ? pending
                .map(
                  ({ pack, result }) => `
                    <div class="chain-item">
                      <span class="chain-index">!</span>
                      <div><strong>${escapeHtml(pack.id)}</strong><br><span class="muted small">${escapeHtml(t(result.advisory))}</span></div>
                      ${statusBadge(result.validation.status)}
                    </div>`,
                )
                .join("")
            : '<div class="empty-state">No open reviews.</div>'
        }
      </section>
    </div>
    <section class="section">
      <div class="section-heading">
        <h2>Evidence workflow</h2>
        <p>Estimate to authorised disposition</p>
      </div>
      <div class="three-column">
        <div class="panel"><h3>1. Input validity</h3><p class="muted">Check identity, configuration, calibration, temperature, rates and cycles.</p></div>
        <div class="panel"><h3>2. Traceable estimate</h3><p class="muted">Bind the result to a model domain, source data and uncertainty.</p></div>
        <div class="panel"><h3>3. Accountable review</h3><p class="muted">Block unsupported advice and record an authorised disposition.</p></div>
      </div>
    </section>`;
}

function packTabs() {
  return `<div class="pack-tabs">${APP.packs
    .map(
      (pack) =>
        `<button class="pack-tab ${pack.id === APP.selectedPack ? "active" : ""}" data-pack="${pack.id}">${pack.id}</button>`,
    )
    .join("")}</div>`;
}

function renderFleet() {
  const pack = getPack();
  const model = getModel(pack);
  const result = state.estimates[pack.id];
  return `
    ${packTabs()}
    <div class="two-column">
      <section class="panel">
        <div class="section-heading"><h2>Current asset record</h2><p>${escapeHtml(pack.aircraft)}</p></div>
        ${table(
          ["Field", "Value"],
          [
            ["Pack", escapeHtml(pack.id)],
            ["Manufacturer", escapeHtml(pack.manufacturer)],
            ["Chemistry", escapeHtml(pack.chemistry)],
            ["Rated capacity", `${pack.ratedCapacity.toFixed(1)} Ah`],
            ["Configuration", escapeHtml(pack.config)],
            ["Software", escapeHtml(pack.software)],
            ["Calibration", pack.calibration ? "Valid" : "Invalid"],
          ],
        )}
        <div class="section-heading" style="margin-top:24px"><h3>Selected model domain</h3></div>
        ${table(
          ["Item", "Value"],
          [
            ["Model", escapeHtml(model.id)],
            ["Temperature", `${model.tempMin} to ${model.tempMax} C`],
            ["Charge limit", `${model.maxCharge.toFixed(2)} C`],
            ["Discharge limit", `${model.maxDischarge.toFixed(2)} C`],
            ["Cycle limit", String(model.maxCycles)],
            ["Allowed configurations", escapeHtml(model.configs.join(", "))],
          ],
        )}
      </section>
      <section class="panel soft">
        <div class="section-heading"><h2>Configuration change</h2><p>Preview then apply</p></div>
        <form id="fleet-form" class="form-grid">
          <div class="field">
            <label for="fleet-config">Configuration revision</label>
            <input id="fleet-config" name="config" value="${escapeHtml(pack.config)}" />
          </div>
          <div class="field">
            <label for="fleet-software">Software version</label>
            <input id="fleet-software" name="software" value="${escapeHtml(pack.software)}" />
          </div>
          <div class="field full">
            <label for="fleet-calibration">Sensor calibration</label>
            <select id="fleet-calibration" name="calibration">
              <option value="true" ${pack.calibration ? "selected" : ""}>Valid</option>
              <option value="false" ${!pack.calibration ? "selected" : ""}>Invalid</option>
            </select>
          </div>
          <div class="button-row field full">
            <button type="submit" class="button primary" id="preview-fleet"><i data-lucide="scan-search"></i>Check compatibility</button>
            <button type="button" class="button" id="apply-fleet"><i data-lucide="save"></i>Apply change</button>
          </div>
        </form>
        <div id="fleet-result" class="advisory ${result.validation.status === "valid" ? "" : result.validation.status === "blocked" ? "error" : "warning"}" style="margin-top:14px">
          ${statusBadge(result.validation.status)}
          <p>${escapeHtml(t(result.advisory))}</p>
        </div>
      </section>
    </div>`;
}

function renderMeasurement() {
  const pack = getPack();
  const result = state.estimates[pack.id];
  const m = pack.measurement;
  return `
    ${packTabs()}
    <div class="two-column">
      <section class="panel">
        <div class="section-heading"><h2>Measurement input</h2><p>All values are synthetic</p></div>
        <form id="measurement-form" class="form-grid">
          <div class="field"><label for="m-capacity">Capacity (Ah)</label><input id="m-capacity" name="capacity" type="number" step="0.01" value="${m.capacity}" /></div>
          <div class="field"><label for="m-resistance">Resistance (mOhm)</label><input id="m-resistance" name="resistance" type="number" step="0.01" value="${m.resistance}" /></div>
          <div class="field"><label for="m-min-temp">Minimum temperature (C)</label><input id="m-min-temp" name="minTemp" type="number" step="0.1" value="${m.minTemp}" /></div>
          <div class="field"><label for="m-max-temp">Maximum temperature (C)</label><input id="m-max-temp" name="maxTemp" type="number" step="0.1" value="${m.maxTemp}" /></div>
          <div class="field"><label for="m-charge">Charge rate (C)</label><input id="m-charge" name="charge" type="number" step="0.01" value="${m.charge}" /></div>
          <div class="field"><label for="m-discharge">Discharge rate (C)</label><input id="m-discharge" name="discharge" type="number" step="0.01" value="${m.discharge}" /></div>
          <div class="field"><label for="m-cycles">Cycles</label><input id="m-cycles" name="cycles" type="number" step="1" value="${m.cycles}" /></div>
          <div class="field"><label for="m-batch">Batch ID</label><input id="m-batch" name="batch" value="${escapeHtml(m.batch)}" /></div>
          <div class="field full"><label for="m-provenance">Provenance</label><input id="m-provenance" name="provenance" value="${escapeHtml(m.provenance)}" /></div>
          <div class="button-row field full">
            <button type="submit" class="button primary"><i data-lucide="play"></i>Run estimate</button>
            <button type="button" class="button" id="preset-valid"><i data-lucide="circle-check"></i>Load valid preset</button>
            <button type="button" class="button" id="preset-blocked"><i data-lucide="triangle-alert"></i>Load stress preset</button>
          </div>
        </form>
      </section>
      <section class="panel soft" id="estimate-result">
        ${estimateResultHtml(pack, result)}
      </section>
    </div>
    ${measurementVisuals(pack)}`;
}

function estimateResultHtml(pack, result) {
  return `
    <div class="section-heading"><h2>Estimate result</h2><p>${escapeHtml(pack.id)}</p></div>
    <div class="metric-strip">
      ${metric("State of health", formatPercent(result.soh))}
      ${metric("Uncertainty", `±${formatPercent(result.uncertainty)}`)}
      ${metric("Usable power", formatPercent(result.usablePower))}
      ${metric("Remaining cycles", String(result.remainingCycles))}
    </div>
    <div class="bar-list">
      ${barRow("State of health", result.soh, "#2a6f97")}
      ${barRow("Capacity health", result.capacityHealth, "#277d6b")}
      ${barRow("Resistance health", result.resistanceHealth, "#b27616")}
      ${barRow("Usable power", result.usablePower, "#6e617f")}
    </div>
    <div class="advisory ${result.validation.status === "valid" ? "" : result.validation.status === "blocked" ? "error" : "warning"}" style="margin-top:14px">
      ${statusBadge(result.validation.status)}
      <p>${escapeHtml(t(result.advisory))}</p>
    </div>
    ${
      result.validation.issues.length
        ? `<ul class="issue-list">${result.validation.issues
            .map(
              (issue) =>
                `<li class="issue ${issue.severity === "blocked" ? "blocked" : ""}"><strong>${escapeHtml(issue.code)}</strong><br>${escapeHtml(issue.message)}</li>`,
            )
            .join("")}</ul>`
        : ""
    }`;
}

function barRow(label, value, color) {
  return `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${clamp(value, 0, 100)}%;background:${color}"></div></div><strong>${formatPercent(value)}</strong></div>`;
}

function lineChartSvg(series, key, color, boundary, yLabel) {
  const width = 760;
  const height = 260;
  const margin = { left: 52, right: 20, top: 22, bottom: 38 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = series.map((item) => item[key]);
  const rawMin = Math.min(...values, boundary ?? Math.min(...values));
  const rawMax = Math.max(...values, boundary ?? Math.max(...values));
  const span = Math.max(rawMax - rawMin, 1);
  const min = rawMin - span * 0.08;
  const max = rawMax + span * 0.08;
  const x = (index) =>
    margin.left + (index / Math.max(series.length - 1, 1)) * plotWidth;
  const y = (value) =>
    margin.top + ((max - value) / Math.max(max - min, 1)) * plotHeight;
  const path = series
    .map(
      (item, index) =>
        `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(item[key]).toFixed(2)}`,
    )
    .join(" ");
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = min + ((max - min) * index) / 4;
    const py = y(value);
    return `<line x1="${margin.left}" y1="${py}" x2="${width - margin.right}" y2="${py}" stroke="#dce3e6" stroke-width="1"/><text x="${margin.left - 8}" y="${py + 4}" text-anchor="end" fill="#65767f" font-size="11">${value.toFixed(1)}</text>`;
  }).join("");
  const boundaryLine =
    boundary === undefined
      ? ""
      : `<line x1="${margin.left}" y1="${y(boundary)}" x2="${width - margin.right}" y2="${y(boundary)}" stroke="#a63c3c" stroke-width="2" stroke-dasharray="7 5"/><text x="${width - margin.right}" y="${y(boundary) - 7}" text-anchor="end" fill="#8b2929" font-size="11" font-weight="700">validation limit</text>`;
  return `
    <svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(yLabel)}">
      ${grid}
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#81929a" stroke-width="1.2"/>
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#81929a" stroke-width="1.2"/>
      ${boundaryLine}
      <path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      <text x="${width / 2}" y="${height - 8}" text-anchor="middle" fill="#65767f" font-size="11">elapsed time (min)</text>
      <text x="14" y="${height / 2}" transform="rotate(-90 14 ${height / 2})" text-anchor="middle" fill="#65767f" font-size="11">${escapeHtml(yLabel)}</text>
    </svg>`;
}

function domainMapSvg(pack) {
  const model = getModel(pack);
  const width = 760;
  const height = 300;
  const margin = { left: 62, right: 24, top: 24, bottom: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const tempMin = model.tempMin - 6;
  const tempMax = model.tempMax + 8;
  const rateMax = model.maxDischarge + 0.7;
  const x = (temp) =>
    margin.left + ((temp - tempMin) / (tempMax - tempMin)) * plotWidth;
  const y = (rate) =>
    margin.top + ((rateMax - rate) / rateMax) * plotHeight;
  const points = [];
  for (let index = 0; index < 52; index += 1) {
    const temp =
      tempMin +
      0.5 +
      ((index * 19) % 100) / 100 * (tempMax - tempMin - 1);
    const rate =
      0.15 + ((index * 31) % 100) / 100 * (rateMax - 0.15);
    const inside =
      temp >= model.tempMin &&
      temp <= model.tempMax &&
      rate <= model.maxDischarge;
    const near =
      !inside ||
      temp >= model.tempMax - 2 ||
      temp <= model.tempMin + 2 ||
      rate >= model.maxDischarge * 0.95;
    points.push({
      temp,
      rate,
      state: inside ? (near ? "review" : "valid") : "blocked",
    });
  }
  const circles = points
    .map((point) => {
      const color =
        point.state === "valid"
          ? "#277d6b"
          : point.state === "review"
            ? "#b27616"
            : "#a63c3c";
      return `<circle cx="${x(point.temp).toFixed(1)}" cy="${y(point.rate).toFixed(1)}" r="5" fill="${color}" opacity="0.82"><title>${point.temp.toFixed(1)} C, ${point.rate.toFixed(2)} C, ${point.state}</title></circle>`;
    })
    .join("");
  const validWidth = x(model.tempMax) - x(model.tempMin);
  const validHeight = y(0) - y(model.maxDischarge);
  return `
    <svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Model applicability map">
      <rect x="${x(model.tempMin)}" y="${y(model.maxDischarge)}" width="${validWidth}" height="${validHeight}" fill="#e3f1eb" stroke="#75aa92" stroke-width="1.5"/>
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#81929a"/>
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#81929a"/>
      ${circles}
      <text x="${width / 2}" y="${height - 14}" text-anchor="middle" fill="#65767f" font-size="12">temperature (C)</text>
      <text x="16" y="${height / 2}" transform="rotate(-90 16 ${height / 2})" text-anchor="middle" fill="#65767f" font-size="12">discharge rate (C)</text>
      <text x="${x(model.tempMin) + 8}" y="${y(model.maxDischarge) + 18}" fill="#215f49" font-size="11" font-weight="700">validated domain</text>
    </svg>`;
}

function measurementVisuals(pack) {
  const telemetry = CONTENT.telemetryFor(pack.id);
  const model = getModel(pack);
  return `
    <section class="section">
      <div class="section-heading"><h2>${t("Measurement time series")}</h2><p>${escapeHtml(pack.measurement.batch)} · 8-hour synthetic profile</p></div>
      <div class="two-column">
        <div class="panel">
          ${lineChartSvg(telemetry, "temperature", "#b27616", model.tempMax, "temperature (C)")}
          <div class="chart-legend"><span class="legend-item"><span class="legend-line alt"></span>temperature</span><span class="legend-item"><span class="legend-line boundary"></span>validated limit</span></div>
        </div>
        <div class="panel">
          ${lineChartSvg(telemetry, "soh", "#2a6f97", undefined, "estimated SOH (%)")}
          <div class="chart-legend"><span class="legend-item"><span class="legend-line"></span>estimated state of health</span></div>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="section-heading"><h2>${t("Model applicability map")}</h2><p>Temperature and discharge-rate boundary</p></div>
      <div class="panel">
        ${domainMapSvg(pack)}
        <div class="chart-legend">
          <span class="legend-item"><span class="tag" style="background:#dff2e7;color:#1b6749">valid</span></span>
          <span class="legend-item"><span class="tag" style="background:#fff0c4;color:#765100">near limit</span></span>
          <span class="legend-item"><span class="tag" style="background:#f7dddd;color:#8b2929">blocked</span></span>
        </div>
      </div>
    </section>`;
}

function renderEvidence() {
  const pack = getPack();
  const result = state.estimates[pack.id];
  const review = state.reviews[pack.id];
  return `
    ${packTabs()}
    <div class="two-column">
      <section class="panel">
        <div class="section-heading"><h2>Evidence chain</h2><p>${escapeHtml(pack.id)}</p></div>
        <div class="evidence-chain">
          ${[
            ["Physical asset", `${pack.id} on ${pack.aircraft}`],
            ["Configuration", pack.config],
            ["Software", pack.software],
            ["Measurement", pack.measurement.batch],
            ["Model", getModel(pack).id],
            ["Validation", pack.id === "BAT-002" ? "blocked" : "valid"],
            ["Estimate", `SOH ${formatPercent(result.soh)}`],
            ["Authorised review", review ? review.disposition : "Not recorded"],
          ]
            .map(
              ([label, value], index) =>
                `<div class="chain-item"><span class="chain-index">${index + 1}</span><div><strong>${escapeHtml(label)}</strong><br><span class="muted small">${escapeHtml(value)}</span></div><i data-lucide="circle-check"></i></div>`,
            )
            .join("")}
        </div>
        <div style="margin-top:14px">
          <label class="small muted">Evidence package hash</label>
          <p class="hash" id="evidence-hash">Calculating...</p>
        </div>
        <div class="button-row">
          <button class="button primary" id="download-evidence"><i data-lucide="download"></i>Download evidence JSON</button>
          <button class="button" id="copy-case-link"><i data-lucide="share-2"></i>${t("Copy share link")}</button>
        </div>
      </section>
      <section class="panel soft">
        <div class="section-heading"><h2>Review disposition</h2><p>${result.validation.status}</p></div>
        ${
          currentRole().canReview
            ? ""
            : `<div class="role-warning">${t("Protected actions")}: ${escapeHtml(t("Current role"))} = ${escapeHtml(t(currentRole().label))}. Review recording is disabled.</div>`
        }
        <form id="review-form" class="form-grid">
          <div class="field full"><label for="reviewer">Reviewer role or identifier</label><input id="reviewer" name="reviewer" value="Authorised reviewer" /></div>
          <div class="field full"><label for="disposition">Disposition</label><select id="disposition" name="disposition">
            ${result.validation.status === "valid" ? '<option value="accepted">Accepted</option>' : ""}
            <option value="rejected">Rejected</option>
            <option value="needs_data">Needs data</option>
            <option value="escalated">Escalated</option>
          </select></div>
          <div class="field full"><label for="rationale">Rationale</label><textarea id="rationale" name="rationale" placeholder="State the evidence considered and any follow-up action."></textarea></div>
          <div class="field full"><label for="signature">Authorisation reference</label><input id="signature" name="signature" value="AUTH-DEMO" /></div>
          <div class="button-row field full"><button type="submit" class="button primary" ${currentRole().canReview ? "" : "disabled"}><i data-lucide="pen-line"></i>${t("Record review")}</button></div>
        </form>
        ${
          review
            ? `<div class="advisory" style="margin-top:14px"><strong>${escapeHtml(review.disposition)}</strong><p>${escapeHtml(review.rationale)}</p><span class="small">${escapeHtml(review.reviewer)} · ${escapeHtml(review.createdAt)}</span></div>`
            : ""
        }
      </section>
    </div>
    <section class="section">
      <div class="section-heading"><h2>${t("Evidence comparison")}</h2><p>${t("Changed fields")}</p></div>
      <div class="package-compare">
        <div class="package-box">
          <h3>${t("Previous package")}</h3>
          <p id="previous-package-hash" class="hash">${escapeHtml(state.evidenceHistory[pack.id] || t("No previous package"))}</p>
        </div>
        <div class="package-box">
          <h3>${t("Current package")}</h3>
          <p id="current-package-hash" class="hash">Calculating...</p>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="section-heading"><h2>${t("Audit trail")}</h2><p>${state.audit.length} events</p></div>
      <div class="panel">
        ${
          state.audit.length
            ? state.audit
                .filter(
                  (event) =>
                    event.packId === pack.id || event.packId === "MULTI",
                )
                .slice(0, 15)
                .map(
                  (event) => `
                    <div class="audit-entry">
                      <time>${escapeHtml(event.createdAt)}</time>
                      <div><strong>${escapeHtml(event.eventType)}</strong><br><span class="muted small">${escapeHtml(event.packId)} · ${escapeHtml(event.role)}</span></div>
                      <span class="tag">${escapeHtml(event.id)}</span>
                    </div>`,
                )
                .join("") || `<div class="empty-state">${t("No review records")}</div>`
            : `<div class="empty-state">${t("No review records")}</div>`
        }
      </div>
    </section>`;
}

function renderGuided() {
  const steps = [
    {
      title: "Normal battery case",
      text: "Start with BAT-001. Its measurement is inside the validated temperature, rate and cycle domain.",
      page: "measurement",
      pack: "BAT-001",
      checks: ["Configuration CONF-A is validated", "Temperature remains below 45 C", "Evidence package is complete"],
    },
    {
      title: "Configuration change",
      text: "Change the configuration to CONF-C. The system should stop treating the old validation evidence as automatically applicable.",
      page: "fleet",
      pack: "BAT-001",
      checks: ["Configuration revision changes", "Review finding is created", "Advice is withheld until review"],
    },
    {
      title: "Blocked high-stress case",
      text: "Open BAT-002 and observe a battery that exceeds temperature, discharge-rate and cycle limits.",
      page: "measurement",
      pack: "BAT-002",
      checks: ["Temperature exceeds the model domain", "Discharge rate and cycles exceed limits", "Unsupported advisory is suppressed"],
    },
    {
      title: "Evidence trace",
      text: "Inspect how the estimate links to the pack, aircraft, configuration, software, model, measurement source and validation status.",
      page: "evidence",
      pack: "BAT-002",
      checks: ["Physical asset is linked", "Source hash and model version are present", "Blocked result cannot be accepted"],
    },
    {
      title: "Authorised disposition",
      text: "Choose a role and record how a reviewer would reject, request data or escalate the blocked estimate.",
      page: "evidence",
      pack: "BAT-002",
      checks: ["Review decision is captured", "Role and time are recorded locally", "Audit trail remains exportable"],
    },
    {
      title: "Verification and export",
      text: "Review the synthetic pilot evaluation, evidence dictionary and downloadable case record.",
      page: "pilot",
      pack: "BAT-002",
      checks: ["Evaluation metrics are visible", "Dictionary is bilingual", "Case data can be exported"],
    },
  ];
  const step = steps[clamp(state.demoStep, 0, steps.length - 1)];
  return `
    <div class="stepper">
      ${steps
        .map(
          (_, index) =>
            `<div class="step ${index === state.demoStep ? "active" : index < state.demoStep ? "done" : ""}">${t("Step")} ${index + 1}</div>`,
        )
        .join("")}
    </div>
    <div class="demo-stage">
      <section class="panel">
        <div class="demo-hero">
          <span class="demo-number">${state.demoStep + 1}</span>
          <div><h2>${escapeHtml(step.title)}</h2><p class="muted">${escapeHtml(step.text)}</p></div>
        </div>
        <div class="notice">${statusBadge(
          step.pack === "BAT-002" ? "blocked" : "valid",
        )} Selected case: <strong>${escapeHtml(step.pack)}</strong></div>
        <div class="button-row">
          <button class="button primary" id="demo-open"><i data-lucide="external-link"></i>${t("Open workflow")}</button>
          <button class="button" id="demo-prev" ${state.demoStep === 0 ? "disabled" : ""}><i data-lucide="arrow-left"></i>${t("Previous")}</button>
          <button class="button" id="demo-next" ${state.demoStep === steps.length - 1 ? "disabled" : ""}>${t("Next step")}<i data-lucide="arrow-right"></i></button>
          <button class="button" id="demo-restart"><i data-lucide="rotate-ccw"></i>${t("Restart")}</button>
        </div>
      </section>
      <section class="panel soft">
        <div class="section-heading"><h3>${t("Protected actions")}</h3><p>${escapeHtml(currentRole().label)}</p></div>
        <ul class="checklist">
          ${step.checks
            .map(
              (item) =>
                `<li><i data-lucide="check-circle-2"></i><span>${escapeHtml(item)}</span></li>`,
            )
            .join("")}
        </ul>
      </section>
    </div>`;
}

function validateImportedRows(rows) {
  const required = CONTENT.dataSchema;
  const findings = [];
  const validRows = [];
  rows.forEach((row, index) => {
    const rowFindings = [];
    required.forEach((field) => {
      if (
        field !== "notes" &&
        (row[field] === undefined || row[field] === null || row[field] === "")
      ) {
        rowFindings.push(`missing ${field}`);
      }
    });
    const pack = getPack(String(row.pack_id || ""));
    if (!pack || pack.id !== row.pack_id) {
      rowFindings.push("unknown pack_id");
    }
    [
      "capacity_ah",
      "resistance_mohm",
      "min_temp_c",
      "max_temp_c",
      "charge_c_rate",
      "discharge_c_rate",
      "cycles",
    ].forEach((field) => {
      if (row[field] !== undefined && Number.isNaN(Number(row[field]))) {
        rowFindings.push(`${field} is not numeric`);
      }
    });
    if (
      row.min_temp_c !== undefined &&
      row.max_temp_c !== undefined &&
      Number(row.min_temp_c) > Number(row.max_temp_c)
    ) {
      rowFindings.push("minimum temperature exceeds maximum");
    }
    const output = {
      row_number: index + 2,
      pack_id: row.pack_id || "",
      status: rowFindings.length ? "findings" : "valid",
      findings: rowFindings.join("; "),
    };
    findings.push(output);
    if (!rowFindings.length) validRows.push(row);
  });
  return { findings, validRows };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, ""));
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]])),
  );
}

async function parseDataFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "json") {
    const parsed = JSON.parse(await file.text());
    return Array.isArray(parsed) ? parsed : parsed.records || [];
  }
  if (extension === "csv") {
    return parseCsv(await file.text());
  }
  if (["xlsx", "xls"].includes(extension)) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }
  throw new Error("Unsupported file type");
}

function renderDataLab() {
  const validation = state.importedRows
    ? validateImportedRows(state.importedRows)
    : null;
  return `
    <section class="section">
      <div class="section-heading"><h2>${t("Data import and validation")}</h2><p>CSV · JSON · Excel</p></div>
      <div class="two-column">
        <div class="panel">
          <div class="drop-zone" id="data-drop-zone">
            <div>
              <i data-lucide="upload-cloud" style="width:30px;height:30px"></i>
              <p><strong>${t("Choose measurement file")}</strong></p>
              <p class="small">CSV, JSON, XLSX or XLS. Files stay in this browser.</p>
              <input id="data-file" type="file" accept=".csv,.json,.xlsx,.xls" hidden />
            </div>
          </div>
          <div class="button-row">
            <button class="button primary" id="choose-data-file"><i data-lucide="folder-open"></i>${t("Choose measurement file")}</button>
            <button class="button" id="download-data-template"><i data-lucide="download"></i>${t("Download template")}</button>
          </div>
          <p class="small muted" style="margin-top:12px"><strong>${t("Expected columns")}</strong>: ${CONTENT.dataSchema.join(", ")}</p>
        </div>
        <div class="panel soft">
          <div class="section-heading"><h3>${t("Data quality summary")}</h3></div>
          ${
            validation
              ? `<div class="quality-grid">
                  ${metric(t("Loaded rows"), String(state.importedRows.length))}
                  ${metric(t("Valid rows"), String(validation.validRows.length))}
                  ${metric(t("Rows with findings"), String(validation.findings.filter((row) => row.status === "findings").length))}
                </div>`
              : '<div class="empty-state">Load a file to run local validation.</div>'
          }
        </div>
      </div>
    </section>
    ${
      validation
        ? `<section class="section">
            <div class="section-heading"><h2>Validation findings</h2><p>No data leaves the browser</p></div>
            ${table(
              ["Row", "Pack", "Status", "Findings"],
              validation.findings.map((row) => [
                String(row.row_number),
                escapeHtml(row.pack_id),
                `<span class="status ${row.status === "valid" ? "valid" : "review_required"}">${escapeHtml(row.status)}</span>`,
                escapeHtml(row.findings || "No findings"),
              ]),
            )}
            <div class="button-row">
              ${
                validation.validRows.length
                  ? `<label class="compact-control"><span>${t("Apply selected row")}</span><select id="import-row-select">${validation.validRows
                      .map((row, index) => `<option value="${row.row_number}">Row ${row.row_number} · ${escapeHtml(row.pack_id)}</option>`)
                      .join("")}</select></label>`
                  : ""
              }
              <button class="button primary" id="apply-import-row" ${validation.validRows.length ? "" : "disabled"}><i data-lucide="check"></i>${t("Apply selected row")}</button>
              <button class="button" id="download-validated-data"><i data-lucide="download"></i>Download validated JSON</button>
            </div>
          </section>`
        : ""
    }`;
}

function renderMethods() {
  const pack = getPack();
  const model = getModel(pack);
  return `
    <section class="section">
      <div class="section-heading"><h2>${t("Model card")}</h2><p>${escapeHtml(pack.id)}</p></div>
      <div class="two-column">
        <div class="panel">
          <div class="metric-strip">
            ${metric(t("Model version"), escapeHtml(model.id))}
            ${metric(t("Validated temperature"), `${model.tempMin} to ${model.tempMax} C`)}
            ${metric(t("Validated rates"), `${model.maxCharge.toFixed(1)} / ${model.maxDischarge.toFixed(1)} C`)}
            ${metric(t("Cycle limit"), String(model.maxCycles))}
          </div>
          <p><strong>${t("Algorithm")}:</strong> capacity-resistance weighted estimator with model-domain gating.</p>
          <p><strong>${t("Known limitations")}:</strong> synthetic and educational; not trained or validated on a real aircraft battery pack.</p>
          <p><strong>${t("Not permitted")}:</strong> dispatch, airworthiness approval, maintenance release, thermal-runaway prevention or flight-control use.</p>
        </div>
        <div class="panel soft">
          <div class="section-heading"><h3>${t("Validation boundary")}</h3></div>
          <ul class="checklist">
            <li><i data-lucide="check-circle-2"></i><span>Chemistry must match the model domain.</span></li>
            <li><i data-lucide="check-circle-2"></i><span>Temperature and rates must remain inside validated limits.</span></li>
            <li><i data-lucide="check-circle-2"></i><span>Configuration and software changes create review findings.</span></li>
            <li><i data-lucide="check-circle-2"></i><span>Invalid calibration blocks release of unsupported advice.</span></li>
          </ul>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="section-heading"><h2>Methods</h2><p>Transparent equations</p></div>
      <div class="three-column">
        <div class="panel"><h3>State of health</h3><div class="method-equation">SOH = 0.75 × C<sub>health</sub> + 0.25 × R<sub>health</sub></div><p class="muted small">Capacity and resistance health are normalised by rated capacity and baseline resistance.</p></div>
        <div class="panel"><h3>Uncertainty</h3><div class="method-equation">u = u<sub>base</sub> + u<sub>cycles</sub> + u<sub>temperature</sub> + u<sub>records</sub></div><p class="muted small">Uncertainty increases with ageing, boundary proximity, calibration and unresolved review findings.</p></div>
        <div class="panel"><h3>Evidence integrity</h3><div class="method-equation">H = SHA-256(canonical JSON)</div><p class="muted small">The package hash covers physical asset, input, model, validation and estimate records.</p></div>
      </div>
    </section>
    <section class="section">
      <div class="section-heading"><h2>${t("Methods and references")}</h2><p>Primary public sources</p></div>
      <ol class="reference-list">
        ${CONTENT.references
          .map(
            (reference) =>
              `<li><strong>${escapeHtml(reference.id)}</strong> (${reference.year}). <a href="${reference.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.label)}</a></li>`,
          )
          .join("")}
      </ol>
    </section>`;
}

function renderPilot() {
  const manualTrace = 68.5;
  const cadtfTrace = 89;
  const manualTime = 17.4;
  const cadtfTime = 4.2;
  const maxTime = Math.max(manualTime, cadtfTime);
  return `
    <div class="metric-grid">
      ${metric("Traceability improvement", `+${(cadtfTrace - manualTrace).toFixed(1)} pp`)}
      ${metric("Reconstruction time reduction", `${(manualTime - cadtfTime).toFixed(1)} min`)}
      ${metric("Mean model error", "8.0%")}
      ${metric("Alerts per case", "1.5")}
      ${metric("Mean cost units", "7.63")}
    </div>
    <section class="section">
      <div class="section-heading"><h2>Traceability comparison</h2><p>12 synthetic matched cases</p></div>
      <div class="panel">
        <div class="bar-list">
          ${barRow("Manual baseline", manualTrace, "#77878f")}
          ${barRow("CADTF browser demo", cadtfTrace, "#2a6f97")}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="section-heading"><h2>Decision reconstruction time</h2><p>Lower is better</p></div>
      <div class="panel">
        <div class="bar-list">
          ${barRow("Manual baseline", (manualTime / maxTime) * 100, "#77878f")}
          ${barRow("CADTF browser demo", (cadtfTime / maxTime) * 100, "#277d6b")}
        </div>
        <p class="muted small">Displayed bar: manual 17.4 minutes, CADTF 4.2 minutes per case.</p>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-heading"><h2>Evaluation boundary</h2><p>Synthetic harness only</p></div>
        <p>The public browser edition exercises the evaluation interface with deterministic synthetic values. It does not report achieved pilot performance.</p>
      </div>
    </section>`;
}

function renderDictionary() {
  return `
    <section class="section">
      <div class="section-heading"><h2>Bilingual evidence dictionary</h2><p>20 shared fields</p></div>
      ${table(
        ["Field", "Chinese", "Unit", "Purpose"],
        APP.dictionary.map((row) => row.map(escapeHtml)),
      )}
      <div class="button-row">
        <button class="button" id="download-dictionary-json"><i data-lucide="download"></i>Download JSON</button>
        <button class="button" id="download-dictionary-csv"><i data-lucide="download"></i>Download CSV</button>
        <button class="button" id="download-dictionary-xlsx"><i data-lucide="file-spreadsheet"></i>${t("Download Excel workbook")}</button>
      </div>
    </section>
    <section class="section">
      <div class="section-heading"><h2>Public prototype export</h2><p>Browser-local synthetic data</p></div>
      <div class="panel">
        <p>The export contains model boundaries, battery assets, measurements, estimates and review records currently held in your browser.</p>
        <div class="button-row">
          <button class="button primary" id="download-all-json"><i data-lucide="download"></i>Download complete JSON</button>
          <button class="button" id="download-all-xlsx"><i data-lucide="file-spreadsheet"></i>${t("Download Excel workbook")}</button>
          <button class="button danger" id="reset-browser-data"><i data-lucide="refresh-cw"></i>Reset local reviews</button>
        </div>
      </div>
    </section>`;
}

function pageHtml(page) {
  if (page === "overview") return renderOverview();
  if (page === "guided") return renderGuided();
  if (page === "fleet") return renderFleet();
  if (page === "measurement") return renderMeasurement();
  if (page === "data-lab") return renderDataLab();
  if (page === "evidence") return renderEvidence();
  if (page === "pilot") return renderPilot();
  if (page === "dictionary") return renderDictionary();
  return renderMethods();
}

function syncTopbarControls() {
  const roleSelect = document.getElementById("role-select");
  if (roleSelect) {
    roleSelect.innerHTML = CONTENT.roles
      .map(
        (role) =>
          `<option value="${role.id}" ${role.id === state.role ? "selected" : ""}>${escapeHtml(t(role.label))}</option>`,
      )
      .join("");
  }
  document.getElementById("language-toggle").textContent =
    state.lang === "zh" ? "中文 / EN" : "EN / 中文";
  document.getElementById("install-app").innerHTML =
    `<i data-lucide="download"></i> ${escapeHtml(t("Install App"))}`;
  document.querySelectorAll(".nav-button").forEach((button) => {
    const label = button.querySelector("span");
    if (label && PAGE_TITLES[button.dataset.page]) {
      label.textContent = t(PAGE_TITLES[button.dataset.page]);
    }
  });
  document.querySelector(".brand div span").textContent = t(
    "Battery evidence prototype",
  );
  const sidebarNote = document.querySelector(".sidebar-note");
  if (sidebarNote) {
    sidebarNote.querySelector("strong").textContent = t("Synthetic data only");
    document.querySelector(".sidebar-note > div > span").textContent = t(
      "No personal or aircraft operating data",
    );
  }
  const status = document.getElementById("service-status");
  status.innerHTML = `<i data-lucide="circle-check"></i> ${escapeHtml(t("Browser prototype ready"))}`;
  document.querySelector(".notice").textContent = t(
    "Synthetic engineering prototype. Measurements and pilot metrics are generated for workflow demonstration and are not aircraft operating data.",
  );
  const roleLabel = document.querySelector(".compact-control span");
  if (roleLabel) roleLabel.textContent = t("Current role");
}

function renderPage() {
  const page = PAGE_TITLES[state.page] ? state.page : "overview";
  state.page = page;
  document.getElementById("page-title").textContent = t(PAGE_TITLES[page]);
  document.getElementById("page-content").innerHTML = pageHtml(page);
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  bindPageEvents();
  syncTopbarControls();
  translateDom();
  if (window.lucide) window.lucide.createIcons();
  if (page === "evidence") updateEvidenceHash();
}

function bindPackTabs() {
  document.querySelectorAll(".pack-tab").forEach((button) => {
    button.addEventListener("click", () => {
      APP.selectedPack = button.dataset.pack;
      renderPage();
    });
  });
}

function bindPageEvents() {
  bindPackTabs();

  document.getElementById("start-guided-demo")?.addEventListener("click", () => {
    state.demoStep = 0;
    saveValue("cadtfDemoStep", state.demoStep);
    navigate("guided");
  });

  document.getElementById("demo-open")?.addEventListener("click", () => {
    const targets = [
      { pack: "BAT-001", page: "measurement" },
      { pack: "BAT-001", page: "fleet" },
      { pack: "BAT-002", page: "measurement" },
      { pack: "BAT-002", page: "evidence" },
      { pack: "BAT-002", page: "evidence" },
      { pack: "BAT-002", page: "pilot" },
    ];
    const target = targets[clamp(state.demoStep, 0, targets.length - 1)];
    APP.selectedPack = target.pack;
    if (state.demoStep === 1) {
      const pack = getPack("BAT-001");
      pack.config = "CONF-C";
      state.estimates[pack.id] = calculateEstimate(pack, pack.measurement);
      recordAudit("DEMO_CONFIGURATION_CHANGED", pack.id, {
        configuration_revision: "CONF-C",
      });
    }
    navigate(target.page);
  });

  document.getElementById("demo-prev")?.addEventListener("click", () => {
    state.demoStep = Math.max(0, state.demoStep - 1);
    saveValue("cadtfDemoStep", state.demoStep);
    renderPage();
  });

  document.getElementById("demo-next")?.addEventListener("click", () => {
    state.demoStep = Math.min(5, state.demoStep + 1);
    saveValue("cadtfDemoStep", state.demoStep);
    renderPage();
  });

  document.getElementById("demo-restart")?.addEventListener("click", () => {
    state.demoStep = 0;
    saveValue("cadtfDemoStep", state.demoStep);
    renderPage();
  });

  const fleetForm = document.getElementById("fleet-form");
  if (fleetForm) {
    let preview = null;
    fleetForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const pack = getPack();
      const config = document.getElementById("fleet-config").value.trim();
      const software = document.getElementById("fleet-software").value.trim();
      const calibration =
        document.getElementById("fleet-calibration").value === "true";
      const previewPack = { ...pack, config, software, calibration };
      const result = calculateEstimate(previewPack, pack.measurement);
      preview = { config, software, calibration, result };
      document.getElementById("fleet-result").innerHTML = `
        ${statusBadge(result.validation.status)}
        <p>${escapeHtml(t(result.advisory))}</p>
        ${
          result.validation.issues.length
            ? `<ul class="issue-list">${result.validation.issues
                .map(
                  (issue) =>
                    `<li class="issue ${issue.severity === "blocked" ? "blocked" : ""}"><strong>${escapeHtml(issue.code)}</strong><br>${escapeHtml(issue.message)}</li>`,
                )
                .join("")}</ul>`
            : ""
        }`;
      if (window.lucide) window.lucide.createIcons();
    });

    document.getElementById("apply-fleet").addEventListener("click", () => {
      const pack = getPack();
      if (!currentRole().canEdit) {
        showToast("The current role cannot change configuration records.");
        return;
      }
      if (!preview) {
        showToast("Run compatibility check first.");
        return;
      }
      pack.config = preview.config;
      pack.software = preview.software;
      pack.calibration = preview.calibration;
      state.estimates[pack.id] = calculateEstimate(pack, pack.measurement);
      recordAudit("CONFIGURATION_CHANGED", pack.id, {
        configuration_revision: preview.config,
        software_version: preview.software,
        calibration_valid: preview.calibration,
      });
      showToast("Configuration change applied in this browser.");
      renderPage();
    });
  }

  const measurementForm = document.getElementById("measurement-form");
  if (measurementForm) {
    const readMeasurement = () => ({
      batch: document.getElementById("m-batch").value.trim(),
      capacity: Number(document.getElementById("m-capacity").value),
      resistance: Number(document.getElementById("m-resistance").value),
      minTemp: Number(document.getElementById("m-min-temp").value),
      maxTemp: Number(document.getElementById("m-max-temp").value),
      charge: Number(document.getElementById("m-charge").value),
      discharge: Number(document.getElementById("m-discharge").value),
      cycles: Number(document.getElementById("m-cycles").value),
      provenance: document.getElementById("m-provenance").value.trim(),
    });
    measurementForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!currentRole().canEdit) {
        showToast("The current role cannot add measurement records.");
        return;
      }
      const pack = getPack();
      pack.measurement = readMeasurement();
      state.estimates[pack.id] = calculateEstimate(pack, pack.measurement);
      recordAudit("ESTIMATE_CREATED", pack.id, {
        batch: pack.measurement.batch,
        status: state.estimates[pack.id].validation.status,
      });
      document.getElementById("estimate-result").innerHTML =
        estimateResultHtml(pack, state.estimates[pack.id]);
      if (window.lucide) window.lucide.createIcons();
      showToast("Estimate generated.");
    });
    document.getElementById("preset-valid").addEventListener("click", () => {
      setMeasurementForm({
        capacity: 18.72,
        resistance: 21.2,
        minTemp: -5,
        maxTemp: 38,
        charge: 0.8,
        discharge: 1.45,
        cycles: 410,
      });
    });
    document.getElementById("preset-blocked").addEventListener("click", () => {
      setMeasurementForm({
        capacity: 15.9,
        resistance: 29.4,
        minTemp: 1,
        maxTemp: 51.5,
        charge: 1.1,
        discharge: 2.2,
        cycles: 1180,
      });
    });
  }

  const dataFile = document.getElementById("data-file");
  const dropZone = document.getElementById("data-drop-zone");
  document.getElementById("choose-data-file")?.addEventListener("click", () => {
    dataFile?.click();
  });
  dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone?.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });
  dropZone?.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
    const file = event.dataTransfer.files[0];
    if (!file) return;
    try {
      state.importedRows = await parseDataFile(file);
      recordAudit("DATA_FILE_LOADED", "MULTI", {
        file: file.name,
        rows: state.importedRows.length,
      });
      renderPage();
      showToast(`${state.importedRows.length} rows loaded.`);
    } catch (error) {
      showToast(error.message);
    }
  });
  dataFile?.addEventListener("change", async () => {
    const file = dataFile.files[0];
    if (!file) return;
    try {
      state.importedRows = await parseDataFile(file);
      recordAudit("DATA_FILE_LOADED", "MULTI", {
        file: file.name,
        rows: state.importedRows.length,
      });
      renderPage();
      showToast(`${state.importedRows.length} rows loaded.`);
    } catch (error) {
      showToast(error.message);
    }
  });
  document
    .getElementById("download-data-template")
    ?.addEventListener("click", () => {
      const template = [
        {
          pack_id: "BAT-001",
          batch_id: "LAB-CSV-001",
          measured_at: "2026-09-16T00:00:00+00:00",
          capacity_ah: 18.6,
          resistance_mohm: 21.4,
          min_temp_c: -5,
          max_temp_c: 38,
          charge_c_rate: 0.8,
          discharge_c_rate: 1.4,
          cycles: 420,
          provenance: "Synthetic user import",
          notes: "",
        },
      ];
      if (window.XLSX) {
        const sheet = XLSX.utils.json_to_sheet(template);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, "measurements");
        XLSX.writeFile(workbook, "cadtf_measurement_template.xlsx");
      } else {
        downloadText(
          "cadtf_measurement_template.csv",
          Object.keys(template[0]).join(",") +
            "\n" +
            Object.values(template[0])
              .map((value) => `"${value}"`)
              .join(","),
          "text/csv",
        );
      }
    });
  document
    .getElementById("apply-import-row")
    ?.addEventListener("click", () => {
      if (!state.importedRows) return;
      if (!currentRole().canEdit) {
        showToast("The current role cannot apply imported measurements.");
        return;
      }
      const validation = validateImportedRows(state.importedRows);
      const selectedRow = Number(
        document.getElementById("import-row-select")?.value || 0,
      );
      const first =
        validation.validRows.find(
          (row, index) => index + 2 === selectedRow,
        ) || validation.validRows[0];
      if (!first) {
        showToast("No valid row is available.");
        return;
      }
      const pack = getPack(String(first.pack_id));
      pack.measurement = {
        batch: first.batch_id,
        capacity: Number(first.capacity_ah),
        resistance: Number(first.resistance_mohm),
        minTemp: Number(first.min_temp_c),
        maxTemp: Number(first.max_temp_c),
        charge: Number(first.charge_c_rate),
        discharge: Number(first.discharge_c_rate),
        cycles: Number(first.cycles),
        measuredAt: first.measured_at,
        provenance: first.provenance,
        notes: first.notes || "",
      };
      state.estimates[pack.id] = calculateEstimate(pack, pack.measurement);
      recordAudit("MEASUREMENT_IMPORTED", pack.id, {
        batch: first.batch_id,
        source: first.provenance,
      });
      APP.selectedPack = pack.id;
      navigate("measurement");
      showToast("Validated measurement applied.");
    });
  document
    .getElementById("download-validated-data")
    ?.addEventListener("click", () => {
      if (!state.importedRows) return;
      const validation = validateImportedRows(state.importedRows);
      downloadText(
        "cadtf_validated_measurements.json",
        JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            valid_rows: validation.validRows,
            findings: validation.findings,
          },
          null,
          2,
        ),
        "application/json",
      );
    });

  const reviewForm = document.getElementById("review-form");
  if (reviewForm) {
    reviewForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!currentRole().canReview) {
        showToast("The current role cannot record review dispositions.");
        return;
      }
      const pack = getPack();
      const disposition = document.getElementById("disposition").value;
      const rationale = document.getElementById("rationale").value.trim();
      const reviewer = document.getElementById("reviewer").value.trim();
      const signature = document.getElementById("signature").value.trim();
      if (rationale.length < 10) {
        showToast("Rationale must contain at least 10 characters.");
        return;
      }
      if (!reviewer || !signature) {
        showToast("Reviewer and authorisation reference are required.");
        return;
      }
      state.reviews[pack.id] = {
        reviewer,
        role: currentRole().label,
        disposition,
        rationale,
        signature,
        createdAt: new Date().toISOString(),
      };
      saveReviews();
      recordAudit("REVIEW_RECORDED", pack.id, {
        disposition,
        reviewer,
        signature,
      });
      showToast("Review disposition recorded in this browser.");
      renderPage();
    });
  }

  document
    .getElementById("download-evidence")
    ?.addEventListener("click", async () => {
      const pack = getPack();
      const evidence = await buildEvidencePackage(pack);
      downloadText(
        `${evidence.package_id}.json`,
        JSON.stringify(evidence, null, 2),
        "application/json",
      );
    });

  document.getElementById("copy-case-link")?.addEventListener("click", async () => {
    const pack = getPack();
    const payload = {
      packId: pack.id,
      configuration: pack.config,
      software: pack.software,
      calibration: pack.calibration,
      measurement: pack.measurement,
      role: state.role,
    };
    const encoded = btoa(
      unescape(encodeURIComponent(JSON.stringify(payload))),
    );
    const url = `${location.origin}${location.pathname}?case=${encodeURIComponent(encoded)}#evidence`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied.");
    } catch {
      downloadText("cadtf_share_link.txt", url, "text/plain");
      showToast("Clipboard unavailable; share link downloaded.");
    }
  });

  document
    .getElementById("download-dictionary-json")
    ?.addEventListener("click", () => {
      const rows = APP.dictionary.map(([field, chinese, unit, purpose]) => ({
        field,
        chinese,
        unit,
        purpose,
      }));
      downloadText(
        "cadtf_evidence_dictionary.json",
        JSON.stringify(rows, null, 2),
        "application/json",
      );
    });

  document
    .getElementById("download-dictionary-csv")
    ?.addEventListener("click", () => {
      const csv = [
        ["field", "chinese", "unit", "purpose"],
        ...APP.dictionary,
      ]
        .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
        .join("\n");
      downloadText(
        "cadtf_evidence_dictionary.csv",
        `\uFEFF${csv}`,
        "text/csv",
      );
    });

  document
    .getElementById("download-dictionary-xlsx")
    ?.addEventListener("click", () => {
      const rows = APP.dictionary.map(([field, chinese, unit, purpose]) => ({
        field,
        chinese,
        unit,
        purpose,
      }));
      const sheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "dictionary");
      XLSX.writeFile(workbook, "cadtf_evidence_dictionary.xlsx");
    });

  document
    .getElementById("download-all-json")
    ?.addEventListener("click", () => {
      const output = {
        exported_at: new Date().toISOString(),
        models: APP.models,
        battery_packs: APP.packs,
        estimates: state.estimates,
        reviews: state.reviews,
        audit: state.audit,
        dictionary: APP.dictionary,
      };
      downloadText(
        "cadtf_browser_prototype_export.json",
        JSON.stringify(output, null, 2),
        "application/json",
      );
    });

  document.getElementById("download-all-xlsx")?.addEventListener("click", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        APP.packs.map((pack) => ({
          pack_id: pack.id,
          chemistry: pack.chemistry,
          aircraft: pack.aircraft,
          configuration: pack.config,
          software: pack.software,
          calibration_valid: pack.calibration,
          ...pack.measurement,
        })),
      ),
      "assets",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        Object.entries(state.estimates).map(([packId, estimate]) => ({
          pack_id: packId,
          soh_pct: estimate.soh,
          uncertainty_pct: estimate.uncertainty,
          usable_power_pct: estimate.usablePower,
          remaining_cycles: estimate.remainingCycles,
          validation_status: estimate.validation.status,
        })),
      ),
      "estimates",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        Object.entries(state.reviews).map(([packId, review]) => ({
          pack_id: packId,
          ...review,
        })),
      ),
      "reviews",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(state.audit),
      "audit",
    );
    XLSX.writeFile(workbook, "cadtf_browser_prototype_export.xlsx");
  });

  document
    .getElementById("reset-browser-data")
    ?.addEventListener("click", () => {
      state.reviews = {};
      state.audit = [];
      state.evidenceHistory = {};
      saveReviews();
      saveValue("cadtfAudit", state.audit);
      saveValue("cadtfEvidenceHistory", state.evidenceHistory);
      showToast("Browser review records reset.");
      renderPage();
    });
}

function setMeasurementForm(values) {
  const mapping = {
    capacity: "m-capacity",
    resistance: "m-resistance",
    minTemp: "m-min-temp",
    maxTemp: "m-max-temp",
    charge: "m-charge",
    discharge: "m-discharge",
    cycles: "m-cycles",
  };
  Object.entries(values).forEach(([key, value]) => {
    const element = document.getElementById(mapping[key]);
    if (element) element.value = value;
  });
}

async function updateEvidenceHash() {
  const target = document.getElementById("evidence-hash");
  if (!target) return;
  const pack = getPack();
  const evidence = await buildEvidencePackage(pack);
  state.currentEvidence = evidence;
  target.textContent = evidence.package_hash;
  const currentTarget = document.getElementById("current-package-hash");
  if (currentTarget) currentTarget.textContent = evidence.package_hash;
  const previous = state.evidenceHistory[pack.id];
  if (!previous) {
    state.evidenceHistory[pack.id] = evidence.package_hash;
    saveValue("cadtfEvidenceHistory", state.evidenceHistory);
  } else if (previous !== evidence.package_hash) {
    recordAudit("EVIDENCE_CHANGED", pack.id, {
      previous_hash: previous,
      current_hash: evidence.package_hash,
    });
    state.evidenceHistory[pack.id] = evidence.package_hash;
    saveValue("cadtfEvidenceHistory", state.evidenceHistory);
  }
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

let toastTimer;
let deferredInstallPrompt = null;

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.getElementById("install-app").hidden = false;
  if (window.lucide) window.lucide.createIcons();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  document.getElementById("install-app").hidden = true;
  showToast("CADTF was installed.");
});

document.getElementById("install-app").addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    showToast(
      /iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? t("On iPhone or iPad: Share, then Add to Home Screen.")
        : t("App installation is available from the browser menu."),
    );
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById("install-app").hidden = true;
});

function navigate(page) {
  const next = PAGE_TITLES[page] ? page : "overview";
  if (location.hash !== `#${next}`) {
    location.hash = next;
  } else {
    state.page = next;
    renderPage();
  }
}

document.getElementById("language-toggle").addEventListener("click", () => {
  state.lang = state.lang === "zh" ? "en" : "zh";
  saveValue("cadtfLang", state.lang);
  renderPage();
});

document.getElementById("role-select").addEventListener("change", (event) => {
  state.role = event.target.value;
  saveValue("cadtfRole", state.role);
  recordAudit("ROLE_CHANGED", "SYSTEM", { role: state.role });
  renderPage();
});

function applySharedCase() {
  const params = new URLSearchParams(location.search);
  const requestedLanguage = params.get("lang");
  if (requestedLanguage === "zh" || requestedLanguage === "en") {
    state.lang = requestedLanguage;
    saveValue("cadtfLang", state.lang);
  }
  const encoded = params.get("case");
  if (!encoded) return;
  try {
    const payload = JSON.parse(
      decodeURIComponent(escape(atob(decodeURIComponent(encoded)))),
    );
    const pack = getPack(payload.packId);
    if (!pack || pack.id !== payload.packId) return;
    pack.config = payload.configuration;
    pack.software = payload.software;
    pack.calibration = Boolean(payload.calibration);
    pack.measurement = { ...pack.measurement, ...payload.measurement };
    state.estimates[pack.id] = calculateEstimate(pack, pack.measurement);
    APP.selectedPack = pack.id;
    showToast("Shared case loaded.");
  } catch {
    showToast("Shared case link could not be read.");
  }
}

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.page));
});

window.addEventListener("hashchange", () => {
  state.page = location.hash.replace("#", "") || "overview";
  renderPage();
});

try {
  ensureEstimates();
  applySharedCase();
  state.page = location.hash.replace("#", "") || "overview";
  renderPage();
} catch (error) {
  const target = document.getElementById("page-content");
  if (target) {
    target.innerHTML = `<div class="advisory error"><strong>Browser initialization error</strong><p>${escapeHtml(error.stack || error.message)}</p></div>`;
  }
  throw error;
}
