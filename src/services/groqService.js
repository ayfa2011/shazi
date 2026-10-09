/**
 * Centralized Groq AI Service with Automatic Retry & Fallback Mechanism
 *
 * Handles rate limits, high demand spikes ("This model is currently experiencing high demand"),
 * and service errors by automatically falling back from the primary model to the backup model.
 */

export const GROQ_CONFIG = {
  primaryModel: "llama-3.3-70b-versatile",
  fallbackModel: "llama-3.1-8b-instant",
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
  maxRetries: 3,
  retryDelayMs: 1200
};

/**
 * Checks whether an error is transient or related to rate limit / model high demand.
 */
function isRateLimitOrHighDemandError(status, errorMsg = "") {
  const text = String(errorMsg).toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    status === 500 ||
    status === 502 ||
    status === 504 ||
    text.includes("high demand") ||
    text.includes("rate limit") ||
    text.includes("rate_limit_exceeded") ||
    text.includes("spikes in demand") ||
    text.includes("overloaded") ||
    text.includes("try again later") ||
    text.includes("capacity")
  );
}

/**
 * Helper to pause execution
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolves the Groq API key from environment, global, or storage
 */
export function getGroqApiKey() {
  if (typeof window !== "undefined" && window.GROQ_API_KEY) {
    return window.GROQ_API_KEY;
  }
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("GROQ_API_KEY");
    if (stored) return stored;
  }
  if (typeof process !== "undefined" && process.env && process.env.GROQ_API_KEY) {
    return process.env.GROQ_API_KEY;
  }
  return "";
}

/**
 * Call Groq Chat Completions API with automatic fallback and retry
 *
 * @param {Array|string} messages Array of message objects [{role, content}] or string prompt
 * @param {Object} options Configuration overrides
 * @returns {Promise<Object>} { content: string, modelUsed: string, raw: Object }
 */
export async function createGroqChatCompletion(messages, options = {}) {
  const apiKey = options.apiKey || getGroqApiKey();
  if (!apiKey) {
    throw new Error("Groq API key is missing. Please set GROQ_API_KEY.");
  }

  const formattedMessages = Array.isArray(messages)
    ? messages
    : [{ role: "user", content: String(messages) }];

  const modelsToAttempt = [
    options.primaryModel || GROQ_CONFIG.primaryModel,
    options.fallbackModel || GROQ_CONFIG.fallbackModel
  ];

  let lastError = null;

  for (let modelIndex = 0; modelIndex < modelsToAttempt.length; modelIndex++) {
    const currentModel = modelsToAttempt[modelIndex];
    const isFallback = modelIndex > 0;

    if (isFallback) {
      console.warn(`[Groq AI] Falling back to high-speed model: ${currentModel}`);
    }

    const retriesForThisModel = isFallback ? 2 : GROQ_CONFIG.maxRetries;

    for (let attempt = 1; attempt <= retriesForThisModel; attempt++) {
      try {
        const payload = {
          model: currentModel,
          messages: formattedMessages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1024,
          ...(options.extraPayload || {})
        };

        const response = await fetch(options.endpoint || GROQ_CONFIG.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey.trim()}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          let errorDetail = "";
          try {
            const errJson = await response.json();
            errorDetail = errJson?.error?.message || JSON.stringify(errJson);
          } catch {
            errorDetail = await response.text();
          }

          const isDemandIssue = isRateLimitOrHighDemandError(response.status, errorDetail);

          console.warn(
            `[Groq AI] Attempt ${attempt} on model ${currentModel} failed (Status ${response.status}): ${errorDetail}`
          );

          if (isDemandIssue) {
            // If primary model hit high demand, immediately break to fallback model without endless waiting
            if (!isFallback && modelIndex < modelsToAttempt.length - 1) {
              console.info(`[Groq AI] Model '${currentModel}' is experiencing high demand. Switching to fallback '${modelsToAttempt[modelIndex + 1]}' immediately...`);
              lastError = new Error(errorDetail);
              break; // Switch model immediately
            }

            // If already on fallback, retry with brief backoff
            if (attempt < retriesForThisModel) {
              const backoff = GROQ_CONFIG.retryDelayMs * Math.pow(1.5, attempt - 1);
              await sleep(backoff);
              continue;
            }
          }

          throw new Error(`Groq API Error (${response.status}): ${errorDetail}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";

        return {
          content,
          modelUsed: currentModel,
          isFallback,
          raw: data
        };
      } catch (err) {
        lastError = err;
        const errMsg = err?.message || "";
        const isDemandIssue = isRateLimitOrHighDemandError(0, errMsg);

        if (isDemandIssue && !isFallback && modelIndex < modelsToAttempt.length - 1) {
          console.info(`[Groq AI] High demand exception on ${currentModel}. Switching to fallback model...`);
          break; // Switch to fallback model
        }

        if (attempt < retriesForThisModel) {
          const backoff = GROQ_CONFIG.retryDelayMs * Math.pow(1.5, attempt - 1);
          await sleep(backoff);
        }
      }
    }
  }

  throw lastError || new Error("Failed to generate response from Groq AI after fallbacks and retries.");
}
