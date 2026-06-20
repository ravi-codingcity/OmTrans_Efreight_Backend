/**
 * Central registry of selectable Gemini models — single source of truth shared
 * by validation, the Gemini service, and the API exposed to the client.
 */
const AI_MODELS = [
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", description: "Lowest cost, fastest processing.", speed: "Very Fast", accuracy: "Good", cost: "Lowest", isDefault: false },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Balanced speed & accuracy (Default).", speed: "Fast", accuracy: "High", cost: "Medium", isDefault: true },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Highest accuracy & advanced reasoning.", speed: "Slower", accuracy: "Highest", cost: "High", isDefault: false },
];

const DEFAULT_MODEL = (AI_MODELS.find((m) => m.isDefault) || AI_MODELS[0]).id;
const MODEL_IDS = AI_MODELS.map((m) => m.id);
const isValidModel = (id) => MODEL_IDS.includes(id);
const resolveModel = (id) => (isValidModel(id) ? id : DEFAULT_MODEL);

// Approximate Gemini list pricing in USD per 1,000,000 tokens (input / output).
const MODEL_PRICING = {
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
};

function estimateCost(modelId, inputTokens = 0, outputTokens = 0) {
  const p = MODEL_PRICING[modelId] || MODEL_PRICING[DEFAULT_MODEL] || { input: 0.3, output: 2.5 };
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
}

module.exports = { AI_MODELS, DEFAULT_MODEL, MODEL_IDS, isValidModel, resolveModel, MODEL_PRICING, estimateCost };
