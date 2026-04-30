import 'dotenv/config';
import { GoogleGenAI } from "@google/genai";
async function run() {
  console.log("Key exists?", !!process.env.GEMINI_API_KEY);
  const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: "hello"
    });
    console.log(res.text);
  } catch (err) {
    console.error(err);
  }
}
run();
