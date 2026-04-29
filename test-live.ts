import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function listModels() {
  try {
    const models = await ai.models.list({ pageSize: 100 });
    for (const model of models.items) {
      if (model.supportedServerActions?.includes('bidiGenerateContent') || model.supportedGenerationMethods?.includes('bidiGenerateContent') || model.supportedServerActions?.includes('BidiGenerateContent') || model.supportedGenerationMethods?.includes('BidiGenerateContent')) {
         console.log("Supports live:", model.name);
      } else {
         console.log(model.name, "methods:", model.supportedGenerationMethods);
      }
    }
  } catch(e) {
    console.error(e);
  }
}

listModels();
