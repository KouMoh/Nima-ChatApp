import { GoogleGenAI } from "@google/genai";

// Always use process.env.GEMINI_API_KEY as per instructions
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not defined. AI features will not work.");
}

export const ai = new GoogleGenAI({ apiKey: apiKey || '' });
