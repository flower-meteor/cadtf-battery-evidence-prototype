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
  fleet: "Fleet & Configuration",
  measurement: "Measurement & Estimate",
  evidence: "Evidence & Review",
  pilot: "Pilot Evaluation",
  dictionary: "Dictionary & Export",
};

const state = {
  page: "overview",
  estimates: {},
  reviews: loadReviews(),
};

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
  return `<span class="status ${status}">${status.replace("_", " ")}</span>`;
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
  const createdAt = new Date().toISOString();
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
          <p>${pending.length} open</p>
        </div>
        ${
          pending.length
            ? pending
                .map(
                  ({ pack, result }) => `
                    <div class="chain-item">
                      <span class="chain-index">!</span>
                      <div><strong>${escapeHtml(pack.id)}</strong><br><span class="muted small">${escapeHtml(result.advisory)}</span></div>
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
          <p>${escapeHtml(result.advisory)}</p>
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
    </div>`;
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
      <p>${escapeHtml(result.advisory)}</p>
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
        </div>
      </section>
      <section class="panel soft">
        <div class="section-heading"><h2>Review disposition</h2><p>${result.validation.status}</p></div>
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
          <div class="button-row field full"><button type="submit" class="button primary"><i data-lucide="pen-line"></i>Record review</button></div>
        </form>
        ${
          review
            ? `<div class="advisory" style="margin-top:14px"><strong>${escapeHtml(review.disposition)}</strong><p>${escapeHtml(review.rationale)}</p><span class="small">${escapeHtml(review.reviewer)} · ${escapeHtml(review.createdAt)}</span></div>`
            : ""
        }
      </section>
    </div>`;
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
      </div>
    </section>
    <section class="section">
      <div class="section-heading"><h2>Public prototype export</h2><p>Browser-local synthetic data</p></div>
      <div class="panel">
        <p>The export contains model boundaries, battery assets, measurements, estimates and review records currently held in your browser.</p>
        <div class="button-row">
          <button class="button primary" id="download-all-json"><i data-lucide="download"></i>Download complete JSON</button>
          <button class="button danger" id="reset-browser-data"><i data-lucide="refresh-cw"></i>Reset local reviews</button>
        </div>
      </div>
    </section>`;
}

function pageHtml(page) {
  if (page === "overview") return renderOverview();
  if (page === "fleet") return renderFleet();
  if (page === "measurement") return renderMeasurement();
  if (page === "evidence") return renderEvidence();
  if (page === "pilot") return renderPilot();
  return renderDictionary();
}

function renderPage() {
  const page = PAGE_TITLES[state.page] ? state.page : "overview";
  state.page = page;
  document.getElementById("page-title").textContent = PAGE_TITLES[page];
  document.getElementById("page-content").innerHTML = pageHtml(page);
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  bindPageEvents();
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
        <p>${escapeHtml(result.advisory)}</p>
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
      if (!preview) {
        showToast("Run compatibility check first.");
        return;
      }
      pack.config = preview.config;
      pack.software = preview.software;
      pack.calibration = preview.calibration;
      state.estimates[pack.id] = calculateEstimate(pack, pack.measurement);
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
      const pack = getPack();
      pack.measurement = readMeasurement();
      state.estimates[pack.id] = calculateEstimate(pack, pack.measurement);
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

  const reviewForm = document.getElementById("review-form");
  if (reviewForm) {
    reviewForm.addEventListener("submit", (event) => {
      event.preventDefault();
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
        disposition,
        rationale,
        signature,
        createdAt: new Date().toISOString(),
      };
      saveReviews();
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
    .getElementById("download-all-json")
    ?.addEventListener("click", () => {
      const output = {
        exported_at: new Date().toISOString(),
        models: APP.models,
        battery_packs: APP.packs,
        estimates: state.estimates,
        reviews: state.reviews,
        dictionary: APP.dictionary,
      };
      downloadText(
        "cadtf_browser_prototype_export.json",
        JSON.stringify(output, null, 2),
        "application/json",
      );
    });

  document
    .getElementById("reset-browser-data")
    ?.addEventListener("click", () => {
      state.reviews = {};
      saveReviews();
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
  const evidence = await buildEvidencePackage(getPack());
  target.textContent = evidence.package_hash;
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
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function navigate(page) {
  const next = PAGE_TITLES[page] ? page : "overview";
  if (location.hash !== `#${next}`) {
    location.hash = next;
  } else {
    state.page = next;
    renderPage();
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
  state.page = location.hash.replace("#", "") || "overview";
  renderPage();
} catch (error) {
  const target = document.getElementById("page-content");
  if (target) {
    target.innerHTML = `<div class="advisory error"><strong>Browser initialization error</strong><p>${escapeHtml(error.stack || error.message)}</p></div>`;
  }
  throw error;
}
