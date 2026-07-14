import { aiConfig } from "@lead-hunter/config/ai.js";
import { AIProvider } from "./provider.js";
import { GeminiProvider } from "./providers/gemini.provider.js";
import { OpenRouterProvider } from "./providers/openrouter.provider.js";
import { OllamaProvider } from "./providers/ollama.provider.js";

export function getAIProvider(): AIProvider {
  switch (aiConfig.provider) {
    case "gemini":
      return new GeminiProvider(aiConfig.gemini.apiKey, aiConfig.gemini.model);
    case "openrouter":
      return new OpenRouterProvider(
        aiConfig.openrouter.apiKey,
        aiConfig.openrouter.model,
        aiConfig.openrouter.baseUrl,
      );
    case "ollama":
      return new OllamaProvider(aiConfig.ollama.baseUrl, aiConfig.ollama.model);
    default:
      throw new Error(`Unsupported AI provider: ${aiConfig.provider}`);
  }
}
