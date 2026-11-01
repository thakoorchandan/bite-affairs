/**
 * Money is always stored and computed as integer paise (₹1 = 100 paise).
 * Never use floating point for financial values.
 */
export type Paise = number;

export function rupeesToPaise(rupees: number | string): Paise {
  const value = typeof rupees === "string" ? rupees.trim() : rupees.toString();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error(`Invalid rupee amount: ${rupees}`);
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function paiseToRupeesString(paise: Paise): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  return `${sign}${whole}${fraction ? `.${fraction.toString().padStart(2, "0")}` : ""}`;
}

const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹191 for whole rupees, ₹19.10 (never ₹19.1) when there are paise. */
export function formatINR(paise: Paise): string {
  return (paise % 100 === 0 ? inrWhole : inrPaise).format(paise / 100);
}

export function assertPaise(value: number, label = "amount"): Paise {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer (paise)`);
  return value;
}

/** Percentage of an amount using basis points (1% = 100 bps) with integer rounding. */
export function percentOf(amount: Paise, basisPoints: number): Paise {
  return Math.floor((amount * basisPoints) / 10000);
}
