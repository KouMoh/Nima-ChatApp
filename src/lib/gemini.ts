import { GoogleGenAI } from "@google/genai";

// Always use process.env.GEMINI_API_KEY as per instructions
const apiKey = process.env.GEMINI_API_KEY;

export const isApiKeyValid = !!apiKey;

if (!isApiKeyValid) {
  console.warn("A valid GEMINI_API_KEY is not defined. AI features will not work until you provide one in the AI Studio settings.");
}

export const ai = new GoogleGenAI({ apiKey: apiKey || '' });
