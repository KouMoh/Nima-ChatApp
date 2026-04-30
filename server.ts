import express from "express";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import * as pdfParseModule from "pdf-parse";
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import * as XLSX from "xlsx";
import { parse as parseCsv } from "csv-parse/sync";
import { GoogleGenAI } from "@google/genai";

const upload = multer({ 
  dest: "uploads/",
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure uploads directory exists
  if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
  }

  app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
  });

  // API Route for file extraction
  app.post("/api/extract", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const filePath = req.file.path;
      const originalName = req.file.originalname;
      const extension = path.extname(originalName).toLowerCase();
      let extractedText = "";

      if ([".pdf", ".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
        try {
          if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY is not set. Please configure it in Settings.");
          }
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const base64Data = fs.readFileSync(filePath).toString("base64");
          
          let mimeType = "application/pdf";
          if (extension === ".jpg" || extension === ".jpeg") mimeType = "image/jpeg";
          else if (extension === ".png") mimeType = "image/png";
          else if (extension === ".webp") mimeType = "image/webp";

          const response = await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data
                }
              },
              "Please carefully extract all text from this document. If there are tables or forms, format them as markdown tables. If there are meaningful images or charts, provide a detailed description of them. Extract every single word."
            ]
          });
          extractedText = response.text || "";
        } catch (ocrError) {
          console.error("Gemini OCR failed, falling back to basic extraction:", ocrError);
          // Fallback to pdf-parse if applicable
          if (extension === ".pdf") {
            const dataBuffer = new Uint8Array(fs.readFileSync(filePath));
            const parser = new (pdfParseModule as any).PDFParse(dataBuffer);
            await parser.load();
            const data = await parser.getText();
            extractedText = data.text;
          } else {
            extractedText = "[Image uploaded: " + originalName + "]";
          }
        }
      } else if (extension === ".docx") {
        const result = await mammoth.extractRawText({ path: filePath });
        extractedText = result.value;
      } else if (extension === ".doc") {
        const extractor = new WordExtractor();
        const extracted = await extractor.extract(filePath);
        extractedText = extracted.getBody();
      } else if (extension === ".xlsx" || extension === ".xls") {
        const fileData = fs.readFileSync(filePath);
        // @ts-ignore
        const xlsxModule = XLSX.default || XLSX;
        const workbook = xlsxModule.read(fileData, { type: "buffer" });
        const sheetNames = workbook.SheetNames;
        sheetNames.forEach((sheetName: string) => {
          const sheet = workbook.Sheets[sheetName];
          extractedText += `\n--- Sheet: ${sheetName} ---\n`;
          extractedText += xlsxModule.utils.sheet_to_csv(sheet);
        });
      } else if (extension === ".csv") {
        const csvRaw = fs.readFileSync(filePath, "utf-8");
        const records = parseCsv(csvRaw, { relaxColumnCount: true }) as string[][];
        extractedText = records
          .map((row) =>
            row
              .map((cell) => {
                const text = String(cell ?? "").replace(/"/g, '""');
                return /[",\n]/.test(text) ? `"${text}"` : text;
              })
              .join(",")
          )
          .join("\n");
      } else {
        // Fallback or text-based files
         extractedText = fs.readFileSync(filePath, "utf-8");
      }

      // Clean up the uploaded file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Truncate to limit size for the Live API
      const MAX_CHARS = 30000;
      if (extractedText.length > MAX_CHARS) {
        extractedText = extractedText.substring(0, MAX_CHARS) + "\n\n...[TRUNCATED FOR LENGTH]";
      }

      res.json({ text: extractedText, name: originalName });
    } catch (error: any) {
      console.error("Extraction error:", error);
      res.status(500).json({ error: "Failed to extract text from file", details: error?.message || String(error) });
    }
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Server Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
