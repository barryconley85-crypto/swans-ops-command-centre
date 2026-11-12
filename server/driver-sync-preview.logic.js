export const DATE_FIELDS = [
  { key: "licence", label: "Driving licence", ops: "licenceValidTo", gate: "licenceExpiry" },
  { key: "cpc", label: "Driver CPC", ops: "cpcExpiry", gate: "cpcExpiry" },
  { key: "tacho", label: "Tachograph card", ops: "tachoCardExpiry", gate: "tachoExpiry" },
];

export function normaliseName(value) {
  return String(value || "").normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function validDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).slice(0, 10);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(text)) return { invalid: true, value: String(value) };
  const date = new Date(text + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return { invalid: true, value: String(value) };
  return { value: text };
}

function latestDate(a, b) {
  const left = validDate(a), right = validDate(b);
  if (left?.invalid || right?.invalid) return { action: "review", opsDate: a || null, gateDate: b || null, reason: "Invalid date format" };
  if (!left && !right) return { action: "none", opsDate: null, gateDate: null };
  const latest = !left ? right.value : !right ? left.value : left.value >= right.value ? left.value : right.value;
  if (left?.value === right?.value) return { action: "matched", opsDate: latest, gateDate: latest, latest };
  return { action: "update-preview", opsDate: left?.value || null, gateDate: right?.value || null, latest, updateOps: !left || latest > left.value, updateGate: !right || latest > right.value };
}

export function buildDriverSyncPreview(opsDrivers, opsCompliance, gateDrivers) {
  const opsByName = new Map();
  for (const driver of opsDrivers) {
    const key = normaliseName(driver.name);
    if (!key) continue;
    if (!opsByName.has(key)) opsByName.set(key, []);
    opsByName.get(key).push(driver);
  }
  const complianceById = new Map(opsCompliance.map(record => [String(record.driverId || ""), record]));
  const rows = gateDrivers.map(gate => {
    const matches = opsByName.get(normaliseName(gate.name)) || [];
    if (matches.length !== 1) return { name: gate.name || "Unnamed driver", gateId: gate.id, status: matches.length ? "duplicate-match" : "unmatched", reason: matches.length ? "More than one Ops driver has this name" : "No exact name match", dates: [] };
    const ops = matches[0];
    const compliance = complianceById.get(String(ops._docId)) || opsCompliance.find(item => normaliseName(item.driverName) === normaliseName(ops.name)) || {};
    const dates = DATE_FIELDS.map(field => ({ key: field.key, label: field.label, ...latestDate(compliance[field.ops], gate[field.gate]) }));
    const review = dates.some(date => date.action === "review");
    const updates = dates.some(date => date.action === "update-preview");
    return { name: gate.name, gateId: gate.id, opsDriverId: ops._docId, opsComplianceId: compliance._docId || null, status: review ? "review" : updates ? "changes-preview" : "matched", dates };
  });
  return { generatedAt: new Date().toISOString(), mode: "read-only-preview", totals: { gateDrivers: gateDrivers.length, matched: rows.filter(row => ["matched","changes-preview","review"].includes(row.status)).length, unmatched: rows.filter(row => row.status === "unmatched").length, duplicates: rows.filter(row => row.status === "duplicate-match").length, needingChanges: rows.filter(row => row.status === "changes-preview").length, review: rows.filter(row => row.status === "review").length }, rows };
}
