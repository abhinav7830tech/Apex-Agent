import "server-only";

import OpenAI from "openai";

let client: OpenAI | null = null;

export const isOpenAIConfigured = () => Boolean(process.env.OPENAI_API_KEY);

export const getOpenAIClient = (): OpenAI => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Add it to .env.local to enable AI features.",
    );
  }

  if (!client) {
    client = new OpenAI({ apiKey });
  }

  return client;
};

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
