import path from "path";
import { createWorker, type Worker } from "tesseract.js";
import sharp from "sharp";

let workerPromise: Promise<Worker> | null = null;

// Prevent concurrent recognize() calls on the same worker
let isBusy = false;
const queue: Array<() => void> = [];

async function acquireWorker(): Promise<void> {
  if (!isBusy) {
    isBusy = true;
    return;
  }

  await new Promise<void>((resolve) => queue.push(resolve));
}

function releaseWorker(): void {
  const next = queue.shift();
  if (next) next();
  else isBusy = false;
}

/**
 * Singleton Tesseract worker
 */
async function getWorker(): Promise<Worker> {
  if (workerPromise) return workerPromise;

  workerPromise = (async () => {
    const workerPath = path.join(
      process.cwd(),
      "node_modules",
      "tesseract.js",
      "src",
      "worker-script",
      "node",
      "index.js"
    );

    const worker = await createWorker("eng", 1, {
      workerPath,
      cachePath: undefined,
      logger: (m) => {
        if (m.status !== "recognizing text") {
          console.log("[Tesseract]", m);
        }
      },
    });

    return worker;
  })();

  workerPromise.catch(() => {
    workerPromise = null;
  });

  return workerPromise;
}

async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .grayscale()
    .normalize()
    .sharpen()
    .resize({
      width: 1800,
      withoutEnlargement: true,
      fit: "inside",
    })
    .png()
    .toBuffer();
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "Operation"
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s`));
    }, ms);

    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function cleanOcrText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export async function extractTextFromImageBuffer(
  buffer: Buffer
): Promise<string> {
  await acquireWorker();

  try {
    const processedBuffer = await preprocessImage(buffer);
    const worker = await getWorker();

    const result = await withTimeout(
      worker.recognize(processedBuffer),
      30000,
      "OCR recognition"
    );

    return cleanOcrText(result.data.text || "");
  } catch (error) {
    console.error("OCR extraction failed:", error);
    throw error;
  } finally {
    releaseWorker();
  }
}