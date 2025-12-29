export interface UsageData {
  tokensUsed: number;
  tokensLimit: number;
  messagesCount: number;
  costEstimate: number;
  raw: string;
  error?: string;
}

/**
 * ccusage JSON output structure (from ccusage daily --json)
 */
interface CcusageOutput {
  daily?: Array<{
    date: string;
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    totalTokens?: number;
    totalCost?: number;
    costUSD?: number;
    modelsUsed?: string[];
  }>;
  totals?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    totalTokens?: number;
    totalCost?: number;
  };
}

/**
 * Parse the output of 'ccusage daily --json' command
 *
 * Expected format (ccusage JSON output):
 * ```json
 * {
 *   "daily": [
 *     {
 *       "date": "2025-05-30",
 *       "totalTokens": 33269,
 *       "totalCost": 17.58,
 *       ...
 *     }
 *   ],
 *   "totals": {
 *     "totalTokens": 734740,
 *     "totalCost": 336.47
 *   }
 * }
 * ```
 *
 * Also supports legacy text format:
 * ```
 * Usage for current billing period:
 *   Tokens used: 50,234 / 100,000
 *   Messages: 123
 *   Cost estimate: $2.45
 * ```
 */
export function parseUsageOutput(output: string): UsageData {
  const result: UsageData = {
    tokensUsed: 0,
    tokensLimit: 0,
    messagesCount: 0,
    costEstimate: 0,
    raw: output,
  };

  if (!output || typeof output !== "string") {
    result.error = "Empty or invalid output";
    return result;
  }

  const trimmed = output.trim();

  // Try to parse as JSON first (ccusage output)
  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as CcusageOutput;
      return parseCcusageJson(data, output);
    } catch {
      // Not valid JSON, fall through to text parsing
    }
  }

  // Legacy text format parsing
  return parseTextFormat(output);
}

/**
 * Parse ccusage JSON output format
 */
function parseCcusageJson(data: CcusageOutput, raw: string): UsageData {
  const result: UsageData = {
    tokensUsed: 0,
    tokensLimit: 0,
    messagesCount: 0,
    costEstimate: 0,
    raw,
  };

  // Get totals from the totals object
  if (data.totals) {
    result.tokensUsed = data.totals.totalTokens ?? 0;
    result.costEstimate = data.totals.totalCost ?? 0;
  }

  // If no totals, sum up from daily entries
  if (!data.totals && data.daily && data.daily.length > 0) {
    result.tokensUsed = data.daily.reduce(
      (sum, day) => sum + (day.totalTokens ?? 0),
      0
    );
    result.costEstimate = data.daily.reduce(
      (sum, day) => sum + (day.totalCost ?? day.costUSD ?? 0),
      0
    );
  }

  // Count messages as the number of daily entries (sessions)
  // Note: ccusage doesn't track individual messages, just sessions/days
  if (data.daily) {
    result.messagesCount = data.daily.length;
  }

  // ccusage doesn't have a limit concept, so we'll set a reasonable default
  // or leave it at 0 to indicate "unlimited"
  result.tokensLimit = 0;

  // Check if we got any meaningful data
  if (result.tokensUsed === 0 && result.costEstimate === 0 && !data.daily?.length) {
    result.error = "No usage data found in ccusage output";
  }

  return result;
}

/**
 * Parse legacy text format
 *
 * Expected format:
 * ```
 * Usage for current billing period:
 *   Tokens used: 50,234 / 100,000
 *   Messages: 123
 *   Cost estimate: $2.45
 * ```
 */
function parseTextFormat(output: string): UsageData {
  const result: UsageData = {
    tokensUsed: 0,
    tokensLimit: 0,
    messagesCount: 0,
    costEstimate: 0,
    raw: output,
  };

  try {
    // Parse "Tokens used: 50,234 / 100,000"
    const tokensMatch = output.match(/Tokens\s+used:\s*([\d,]+)\s*\/\s*([\d,]+)/i);
    if (tokensMatch) {
      result.tokensUsed = parseNumber(tokensMatch[1]);
      result.tokensLimit = parseNumber(tokensMatch[2]);
    }

    // Parse "Messages: 123"
    const messagesMatch = output.match(/Messages:\s*([\d,]+)/i);
    if (messagesMatch) {
      result.messagesCount = parseNumber(messagesMatch[1]);
    }

    // Parse "Cost estimate: $2.45"
    const costMatch = output.match(/Cost\s+estimate:\s*\$?([\d,.]+)/i);
    if (costMatch) {
      result.costEstimate = parseFloat(costMatch[1].replace(/,/g, "")) || 0;
    }

    // Check if we parsed at least something
    if (!tokensMatch && !messagesMatch && !costMatch) {
      result.error = "Could not parse usage data from output";
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Unknown parsing error";
  }

  return result;
}

/**
 * Parse a number string with commas (e.g., "50,234" -> 50234)
 */
function parseNumber(value: string): number {
  if (!value) return 0;
  return parseInt(value.replace(/,/g, ""), 10) || 0;
}
