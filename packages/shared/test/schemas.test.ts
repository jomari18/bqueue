import { describe, expect, it } from "vitest";
import {
  CounterInput,
  DocumentTypePatch,
  KeyInput,
  LoginInput,
  PinSchema,
  ReleaseInput,
  ReportsQuery,
  SubmitRequestInput,
  TakeTicketInput,
} from "../src/index.js";

const req = { id: crypto.randomUUID(), documentTypeId: crypto.randomUUID(), purpose: "Employment" };

describe("schemas", () => {
  it("refuses easy PINs", () => {
    for (const pin of ["000000", "111111", "123456", "654321", "12345", "abcdef"]) expect(PinSchema.safeParse(pin).success).toBe(false);
    expect(PinSchema.safeParse("482915").success).toBe(true);
  });

  it("normalizes usernames and purposes", () => {
    expect(LoginInput.parse({ username: " Kapitan.7K2F ", secret: "x" }).username).toBe("kapitan.7k2f");
    expect(SubmitRequestInput.parse({ ...req, purpose: "  Para sa   trabaho " }).purpose).toBe("Para sa trabaho");
    expect(SubmitRequestInput.safeParse({ ...req, purpose: "ab" }).success).toBe(false);
    expect(SubmitRequestInput.safeParse({ ...req, purpose: "x".repeat(121) }).success).toBe(false);
  });

  it("checks releases", () => {
    expect(ReleaseInput.safeParse({ idChecked: false }).success).toBe(false);
    expect(ReleaseInput.parse({ idChecked: true, orNumber: "or-1234" }).orNumber).toBe("OR-1234");
    for (const bad of ["OR-123", "OR-12345678901", "1234", "OR 1234"])
      expect(ReleaseInput.safeParse({ idChecked: true, orNumber: bad }).success).toBe(false);
  });

  it("checks queue and settings input", () => {
    expect(TakeTicketInput.safeParse({ id: crypto.randomUUID(), lane: "VIP" }).success).toBe(false);
    expect(CounterInput.safeParse({ name: "Counter 4", lanes: [] }).success).toBe(false);
    expect(CounterInput.safeParse({ name: "Counter 4", lanes: ["GENERAL", "GENERAL"] }).success).toBe(false);
    expect(DocumentTypePatch.safeParse({}).success).toBe(false);
    expect(DocumentTypePatch.safeParse({ feeCentavos: 1_000_001 }).success).toBe(false);
    expect(KeyInput.safeParse({ key: "a".repeat(42) }).success).toBe(false);
    expect(ReportsQuery.parse({})).toEqual({ range: "today" });
  });
});
