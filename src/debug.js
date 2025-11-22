import fs from "fs";
import path from "path";
import { Config } from "./config.js";
import { saveMat } from "./utils.js";

export const cCOLOURS = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
  [0, 255, 255],
  [255, 0, 255],
  [255, 255, 255],
  [128, 0, 0],
  [0, 128, 0],
  [0, 0, 128],
  [128, 128, 0],
  [0, 128, 128],
  [128, 0, 128],
  [128, 128, 128],
];

export async function debugShow(name, step, text, display) {
  if (Config.DEBUG_LEVEL === 0) return;

  // Determine if we should show based on step/level
  // Python logic:
  // if config.DEBUG_LEVEL >= 1: ...
  // Here we just assume the caller checks DEBUG_LEVEL usually,
  // or we implement the logic here.

  if (Config.DEBUG_OUTPUT === "file" || Config.DEBUG_OUTPUT === "both") {
    const debugDir = path.join(process.cwd(), "debug");
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir);
    }

    // step can be float like 0.1
    const stepStr = String(step).replace(".", "-");
    const filename = `${name}_${stepStr}_${text.replace(/\s+/g, "_")}.png`;
    const filepath = path.join(debugDir, filename);

    console.log(`[DEBUG] Saving ${filepath}`);
    await saveMat(display, filepath);
  }
}
