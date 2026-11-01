import { describe, expect, it } from "vitest";
import { formatINR, paiseToRupeesString, rupeesToPaise } from "@/lib/utilities/money";
import { normaliseIndianMobile } from "@/lib/utilities/phone";
import { slugify } from "@/lib/utilities/slug";

describe("money", () => {
  it("converts rupees to integer paise without floating point error", () => {
    expect(rupeesToPaise("155")).toBe(15500);
    expect(rupeesToPaise("0.1")).toBe(10);
    expect(rupeesToPaise("19.99")).toBe(1999);
    expect(() => rupeesToPaise("1.234")).toThrow();
    expect(() => rupeesToPaise("-5")).toThrow();
  });
  it("formats paise", () => {
    expect(paiseToRupeesString(15550)).toBe("155.50");
    expect(formatINR(15500)).toBe("₹155");
    // Amounts with paise always show two decimals (₹19.10, not ₹19.1).
    expect(formatINR(1910)).toBe("₹19.10");
    expect(formatINR(20190)).toBe("₹201.90");
    expect(formatINR(1999)).toBe("₹19.99");
    expect(formatINR(12345600)).toBe("₹1,23,456");
  });
});

describe("phone + slug", () => {
  it("normalises Indian mobiles", () => {
    expect(normaliseIndianMobile("+91 98765 43210")).toBe("9876543210");
    expect(normaliseIndianMobile("09876543210")).toBe("9876543210");
    expect(normaliseIndianMobile("12345")).toBeNull();
    expect(normaliseIndianMobile("5876543210")).toBeNull();
  });
  it("slugifies names", () => {
    expect(slugify("Chicken 65 (8 pcs)")).toBe("chicken-65-8-pcs");
    expect(slugify("Mac & Cheese")).toBe("mac-and-cheese");
  });
});
