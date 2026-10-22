import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { Decimal, DomainError, Money, RoundingMode, parseDecimal, roundDecimal } from "../src/index.js";

const centsArb = fc.bigInt({ min: -10_000_000_000n, max: 10_000_000_000n });
const moneyFromCents = (cents: bigint): Money => {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const text = `${negative ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
  return Money.of(text);
};

describe("Money construction", () => {
  it.each(["0", "0.1", "0.10", "27.81", "-5.00", "999999999999.99"])("accepts %s", (value) => {
    expect(() => Money.of(value)).not.toThrow();
  });

  it.each(["", "1.234", "1e3", "NaN", "Infinity", "12,50", " 1.00", "1.", ".5", "1000000000000.00", "+1"])(
    "rejects %j",
    (value) => {
      expect(() => Money.of(value)).toThrow(DomainError);
    },
  );

  it("rejects JavaScript numbers at runtime even when the type system is bypassed", () => {
    expect(() => Money.of(0.1 as unknown as string)).toThrow(/decimal string/);
  });

  it("rejects non-AUD currencies", () => {
    expect(() => Money.of("1.00", "USD" as unknown as "AUD")).toThrow(/Unsupported currency/);
  });

  it("serialises to a fixed two-decimal string", () => {
    expect(Money.of("12.3").toString()).toBe("12.30");
    expect(JSON.stringify({ pay: Money.of("7") })).toBe('{"pay":"7.00"}');
  });

  it("normalises negative zero", () => {
    expect(Money.of("-0.00").toString()).toBe("0.00");
    expect(Money.of("1.00").subtract(Money.of("1.00")).toString()).toBe("0.00");
    expect(Money.zero().negate().toString()).toBe("0.00");
  });
});

describe("Money arithmetic", () => {
  it("is exact where binary floating point is not", () => {
    expect(Money.of("0.10").add(Money.of("0.20")).toString()).toBe("0.30");
    expect(Money.sum([Money.of("0.10"), Money.of("0.10"), Money.of("0.10")]).toString()).toBe("0.30");
  });

  it("returns an unrounded Decimal from multiplication so rounding is always explicit", () => {
    const product = Money.of("27.81").multiplyExact(new Decimal("1.25"));
    expect(product.toString()).toBe("34.7625");
    expect(Money.fromDecimal(product, RoundingMode.HALF_UP).toString()).toBe("34.76");
  });

  it("compares, negates and classifies sign", () => {
    expect(Money.of("1.00").compare(Money.of("2.00"))).toBe(-1);
    expect(Money.of("2.00").compare(Money.of("1.00"))).toBe(1);
    expect(Money.of("2.00").compare(Money.of("2"))).toBe(0);
    expect(Money.of("-3.50").abs().toString()).toBe("3.50");
    expect(Money.of("-3.50").isNegative()).toBe(true);
    expect(Money.of("3.50").isPositive()).toBe(true);
    expect(Money.zero().isZero()).toBe(true);
    expect(Money.zero().isPositive()).toBe(false);
    expect(Money.zero().isNegative()).toBe(false);
    expect(Money.of("1.10").equals(Money.of("1.1"))).toBe(true);
    expect(Money.of("1.10").toDecimal().toString()).toBe("1.1");
  });

  it("rejects non-finite values in fromDecimal", () => {
    expect(() => Money.fromDecimal(new Decimal(Infinity), RoundingMode.HALF_UP)).toThrow(DomainError);
  });

  it("property: addition is associative and commutative (exact arithmetic)", () => {
    fc.assert(
      fc.property(centsArb, centsArb, centsArb, (a, b, c) => {
        const [x, y, z] = [moneyFromCents(a), moneyFromCents(b), moneyFromCents(c)];
        expect(x.add(y).equals(y.add(x))).toBe(true);
        expect(
          x
            .add(y)
            .add(z)
            .equals(x.add(y.add(z))),
        ).toBe(true);
      }),
    );
  });

  it("property: subtract is the inverse of add", () => {
    fc.assert(
      fc.property(centsArb, centsArb, (a, b) => {
        const [x, y] = [moneyFromCents(a), moneyFromCents(b)];
        expect(x.add(y).subtract(y).equals(x)).toBe(true);
      }),
    );
  });

  it("property: JSON serialisation round-trips without precision loss", () => {
    fc.assert(
      fc.property(centsArb, (a) => {
        const money = moneyFromCents(a);
        expect(Money.of(JSON.parse(JSON.stringify(money)) as string).equals(money)).toBe(true);
      }),
    );
  });
});

describe("rounding modes", () => {
  it.each([
    ["0.005", RoundingMode.HALF_UP, "0.01"],
    ["-0.005", RoundingMode.HALF_UP, "-0.01"],
    ["0.015", RoundingMode.HALF_EVEN, "0.02"],
    ["0.025", RoundingMode.HALF_EVEN, "0.02"],
    ["0.019", RoundingMode.DOWN, "0.01"],
    ["0.011", RoundingMode.UP, "0.02"],
  ] as const)("rounds %s with %s to %s", (input, mode, expected) => {
    expect(roundDecimal(new Decimal(input), 2, mode).toFixed(2)).toBe(expected);
  });

  it("reproduces the published MA000004 Schedule B Level 1 rates from the base rate (half-up to cents)", () => {
    // Base $27.81 (cl. 17.1 Table 4). Published Schedule B values, consolidated award as at 1 July 2026.
    const base = Money.of("27.81");
    const published: [string, string][] = [
      ["1.25", "34.76"],
      ["1.5", "41.72"],
      ["1.75", "48.67"],
      ["2.25", "62.57"],
      ["2.5", "69.53"],
    ];
    for (const [multiplier, expected] of published) {
      expect(
        Money.fromDecimal(base.multiplyExact(new Decimal(multiplier)), RoundingMode.HALF_UP).toString(),
      ).toBe(expected);
    }
  });
});

describe("parseDecimal", () => {
  it("accepts plain decimals and rejects everything else", () => {
    expect(parseDecimal("125").toString()).toBe("125");
    expect(parseDecimal("-0.5").toString()).toBe("-0.5");
    for (const bad of ["1e2", "abc", "", "1.", "Infinity"]) {
      expect(() => parseDecimal(bad, "x")).toThrow(DomainError);
    }
  });
});
