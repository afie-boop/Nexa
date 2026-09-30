const VALID_MODES = ["fast", "balance", "thinking"];

function normalizeResponseMode(mode) {
  return VALID_MODES.includes(mode) ? mode : "balance";
}

function classifyFastTask(question = "") {
  const q = String(question).toLowerCase();
  const codeSignals = [
    /\b(code|coding|javascript|typescript|python|java|kotlin|swift|html|css|sql|bash|shell|react|node|npm|api|json|regex|function|class|bug|error|debug|stack trace|syntax)\b/,
    /[{};]{2,}/,
    /```/
  ];
  return codeSignals.some((pattern) => pattern.test(q)) ? "code" : "general";
}

const MODE_POLICIES = {
  fast: { maxRetries: 0, maxTokens: 900, reasoningEffort: "none" },
  balance: { maxRetries: 2, maxTokens: 2200, reasoningEffort: "medium" },
  thinking: { maxRetries: 2, maxTokens: 5000, reasoningEffort: "high" }
};

function getModePolicy(mode) {
  return MODE_POLICIES[normalizeResponseMode(mode)];
}

module.exports = { VALID_MODES, normalizeResponseMode, classifyFastTask, getModePolicy };