import { describe, expect, it } from "bun:test";
import { parseUsageOutput } from "./usage";

describe("parseUsageOutput", () => {
  describe("ccusage JSON format parsing", () => {
    it("parses complete ccusage JSON output with totals", () => {
      const output = JSON.stringify({
        daily: [
          {
            date: "2025-05-30",
            inputTokens: 277,
            outputTokens: 31456,
            totalTokens: 33269,
            totalCost: 17.58,
            modelsUsed: ["claude-sonnet-4-20250514"],
          },
        ],
        totals: {
          inputTokens: 11174,
          outputTokens: 720366,
          totalTokens: 734740,
          totalCost: 336.47,
        },
      });

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(734740);
      expect(result.tokensLimit).toBe(0); // ccusage doesn't have limits
      expect(result.messagesCount).toBe(1); // Number of daily entries
      expect(result.costEstimate).toBe(336.47);
      expect(result.error).toBeUndefined();
      expect(result.raw).toBe(output);
    });

    it("parses ccusage output without totals (sums from daily)", () => {
      const output = JSON.stringify({
        daily: [
          {
            date: "2025-05-29",
            totalTokens: 10000,
            totalCost: 5.0,
          },
          {
            date: "2025-05-30",
            totalTokens: 20000,
            totalCost: 10.0,
          },
        ],
      });

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(30000);
      expect(result.costEstimate).toBe(15.0);
      expect(result.messagesCount).toBe(2);
      expect(result.error).toBeUndefined();
    });

    it("parses ccusage output with costUSD instead of totalCost", () => {
      const output = JSON.stringify({
        daily: [
          {
            date: "2025-05-30",
            totalTokens: 50000,
            costUSD: 25.0,
          },
        ],
      });

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(50000);
      expect(result.costEstimate).toBe(25.0);
      expect(result.error).toBeUndefined();
    });

    it("handles empty daily array", () => {
      const output = JSON.stringify({
        daily: [],
        totals: {
          totalTokens: 0,
          totalCost: 0,
        },
      });

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(0);
      expect(result.costEstimate).toBe(0);
      expect(result.messagesCount).toBe(0);
      expect(result.error).toBe("No usage data found in ccusage output");
    });

    it("handles ccusage output with only totals", () => {
      const output = JSON.stringify({
        totals: {
          totalTokens: 100000,
          totalCost: 50.0,
        },
      });

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(100000);
      expect(result.costEstimate).toBe(50.0);
      expect(result.messagesCount).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it("handles malformed JSON gracefully", () => {
      const output = '{ "daily": [}'; // Invalid JSON

      const result = parseUsageOutput(output);

      // Falls back to text parsing, which will return error
      expect(result.error).toBe("Could not parse usage data from output");
    });

    it("prioritizes totals over daily sum when both exist", () => {
      const output = JSON.stringify({
        daily: [
          {
            date: "2025-05-30",
            totalTokens: 10000,
            totalCost: 5.0,
          },
        ],
        totals: {
          totalTokens: 999999,
          totalCost: 500.0,
        },
      });

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(999999);
      expect(result.costEstimate).toBe(500.0);
    });
  });

  describe("legacy text format parsing", () => {
    it("parses complete usage output correctly", () => {
      const output = `Usage for current billing period:
  Tokens used: 50,234 / 100,000
  Messages: 123
  Cost estimate: $2.45`;

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(50234);
      expect(result.tokensLimit).toBe(100000);
      expect(result.messagesCount).toBe(123);
      expect(result.costEstimate).toBe(2.45);
      expect(result.error).toBeUndefined();
      expect(result.raw).toBe(output);
    });

    it("parses tokens without commas", () => {
      const output = `Usage for current billing period:
  Tokens used: 500 / 1000
  Messages: 10
  Cost estimate: $0.05`;

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(500);
      expect(result.tokensLimit).toBe(1000);
      expect(result.messagesCount).toBe(10);
      expect(result.costEstimate).toBe(0.05);
      expect(result.error).toBeUndefined();
    });

    it("parses large numbers with commas", () => {
      const output = `Tokens used: 1,234,567 / 10,000,000
  Messages: 9,999
  Cost estimate: $1,234.56`;

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(1234567);
      expect(result.tokensLimit).toBe(10000000);
      expect(result.messagesCount).toBe(9999);
      expect(result.costEstimate).toBe(1234.56);
    });

    it("parses cost without dollar sign", () => {
      const output = `Tokens used: 100 / 200
  Cost estimate: 5.99`;

      const result = parseUsageOutput(output);

      expect(result.costEstimate).toBe(5.99);
    });
  });

  describe("empty output handling", () => {
    it("returns error for empty string", () => {
      const result = parseUsageOutput("");

      expect(result.tokensUsed).toBe(0);
      expect(result.tokensLimit).toBe(0);
      expect(result.messagesCount).toBe(0);
      expect(result.costEstimate).toBe(0);
      expect(result.error).toBe("Empty or invalid output");
      expect(result.raw).toBe("");
    });

    it("returns error for null input", () => {
      const result = parseUsageOutput(null as unknown as string);

      expect(result.error).toBe("Empty or invalid output");
    });

    it("returns error for undefined input", () => {
      const result = parseUsageOutput(undefined as unknown as string);

      expect(result.error).toBe("Empty or invalid output");
    });
  });

  describe("invalid format handling", () => {
    it("returns error for completely unrelated output", () => {
      const output = "Hello, this is not usage data at all!";

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(0);
      expect(result.tokensLimit).toBe(0);
      expect(result.messagesCount).toBe(0);
      expect(result.costEstimate).toBe(0);
      expect(result.error).toBe("Could not parse usage data from output");
      expect(result.raw).toBe(output);
    });

    it("returns error for numeric-only input", () => {
      const output = "12345";

      const result = parseUsageOutput(output);

      expect(result.error).toBe("Could not parse usage data from output");
    });

    it("handles malformed token format", () => {
      const output = "Tokens used: abc / def";

      const result = parseUsageOutput(output);

      // Regex won't match non-numeric, so returns 0
      expect(result.tokensUsed).toBe(0);
      expect(result.tokensLimit).toBe(0);
    });
  });

  describe("partial data parsing", () => {
    it("parses tokens only", () => {
      const output = "Tokens used: 5,000 / 10,000";

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(5000);
      expect(result.tokensLimit).toBe(10000);
      expect(result.messagesCount).toBe(0);
      expect(result.costEstimate).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it("parses messages only", () => {
      const output = "Messages: 42";

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(0);
      expect(result.tokensLimit).toBe(0);
      expect(result.messagesCount).toBe(42);
      expect(result.costEstimate).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it("parses cost only", () => {
      const output = "Cost estimate: $99.99";

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(0);
      expect(result.tokensLimit).toBe(0);
      expect(result.messagesCount).toBe(0);
      expect(result.costEstimate).toBe(99.99);
      expect(result.error).toBeUndefined();
    });

    it("parses tokens and messages without cost", () => {
      const output = `Tokens used: 1,000 / 5,000
  Messages: 50`;

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(1000);
      expect(result.tokensLimit).toBe(5000);
      expect(result.messagesCount).toBe(50);
      expect(result.costEstimate).toBe(0);
      expect(result.error).toBeUndefined();
    });
  });

  describe("number formatting with commas", () => {
    it("handles single comma in number", () => {
      const output = "Tokens used: 1,234 / 5,678";

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(1234);
      expect(result.tokensLimit).toBe(5678);
    });

    it("handles multiple commas in large numbers", () => {
      const output = "Tokens used: 1,234,567,890 / 9,999,999,999";

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(1234567890);
      expect(result.tokensLimit).toBe(9999999999);
    });

    it("handles zero values", () => {
      const output = `Tokens used: 0 / 100,000
  Messages: 0
  Cost estimate: $0.00`;

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(0);
      expect(result.tokensLimit).toBe(100000);
      expect(result.messagesCount).toBe(0);
      expect(result.costEstimate).toBe(0);
      expect(result.error).toBeUndefined();
    });
  });

  describe("case insensitivity", () => {
    it("parses uppercase labels", () => {
      const output = `TOKENS USED: 100 / 200
  MESSAGES: 5
  COST ESTIMATE: $1.00`;

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(100);
      expect(result.tokensLimit).toBe(200);
      expect(result.messagesCount).toBe(5);
      expect(result.costEstimate).toBe(1.0);
    });

    it("parses mixed case labels", () => {
      const output = `tokens Used: 300 / 600
  messages: 15
  cost Estimate: $3.50`;

      const result = parseUsageOutput(output);

      expect(result.tokensUsed).toBe(300);
      expect(result.tokensLimit).toBe(600);
      expect(result.messagesCount).toBe(15);
      expect(result.costEstimate).toBe(3.5);
    });
  });

  describe("raw output preservation", () => {
    it("always preserves raw output", () => {
      const output = "Some random text";

      const result = parseUsageOutput(output);

      expect(result.raw).toBe(output);
    });

    it("preserves multiline raw output", () => {
      const output = `Line 1
Line 2
Line 3`;

      const result = parseUsageOutput(output);

      expect(result.raw).toBe(output);
    });
  });
});
