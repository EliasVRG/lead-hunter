export interface AIConfig {
  provider: "gemini" | "openrouter" | "ollama";
  gemini: {
    apiKey: string;
    model: string;
  };
  openrouter: {
    apiKey: string;
    model: string;
    baseUrl?: string;
  };
  ollama: {
    baseUrl: string;
    model: string;
  };
}

export const aiConfig: AIConfig = {
  provider: (process.env.AI_PROVIDER || "gemini") as "gemini" | "openrouter" | "ollama",
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    model: process.env.OPENROUTER_MODEL || "google/gemini-flash-1.5",
    baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    model: process.env.OLLAMA_MODEL || "llama3",
  },
};
