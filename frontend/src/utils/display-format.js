export function formatMoney(amount, currency = "PHP") {
  return `${currency} ${Number(amount || 0).toFixed(2)}`;
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

export function formatRoundedMinutes(minutes) {
  return `${Math.round(minutes || 0)} minutes`;
}

export function formatDecimalUnit(value, unit) {
  return `${Number(value || 0).toFixed(2)} ${unit}`;
}
