import { exec } from "child_process";
import fs from "fs-extra";
import { glob } from "glob";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { compareImages } from "./compare.js";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCHMARK_ROOT = path.resolve(__dirname, "..");

export async function runBenchmark({ cmd, thresholdSsim, thresholdPixel }) {
  // Find inputs
  const inputDir = path.join(BENCHMARK_ROOT, "example_input");
  const outputDir = path.join(BENCHMARK_ROOT, "example_output");

  // Inputs are .jpg files
  const inputFiles = await glob("*.jpg", { cwd: inputDir, absolute: true });

  const results = [];

  console.log(`Found ${inputFiles.length} test cases.`);

  for (const inputFile of inputFiles) {
    const filename = path.basename(inputFile);
    const nameNoExt = path.basename(inputFile, path.extname(inputFile));

    // Expected output: name + "_thresh.png"
    // e.g. boston_cooking_a.jpg -> boston_cooking_a_thresh.png
    const expectedFilename = `${nameNoExt}_thresh.png`;
    const expectedPath = path.join(outputDir, expectedFilename);

    if (!(await fs.pathExists(expectedPath))) {
      console.warn(
        `Skipping ${filename}: No ground truth found at ${expectedFilename}`
      );
      continue;
    }

    // We execute in BENCHMARK_ROOT, so output should appear there
    const runOutputPath = path.join(BENCHMARK_ROOT, expectedFilename);

    // Clean previous output if it exists (to ensure we test fresh creation)
    await fs.remove(runOutputPath);

    const startTime = process.hrtime.bigint();

    try {
      const commandToRun = `${cmd} "${inputFile}"`;
      // console.log(`Running: ${commandToRun}`);

      await execAsync(commandToRun, { cwd: BENCHMARK_ROOT });

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;

      // Check if output exists
      if (!(await fs.pathExists(runOutputPath))) {
        throw new Error(`Output file not created: ${runOutputPath}`);
      }

      // Compare
      const metrics = await compareImages(runOutputPath, expectedPath);

      const passedSsim = metrics.ssim >= thresholdSsim;
      const passedPixel = metrics.diffPercentage <= thresholdPixel;
      const passed = passedSsim && passedPixel;

      results.push({
        file: filename,
        durationMs,
        metrics,
        passed,
        error: null,
      });
    } catch (err) {
      results.push({
        file: filename,
        durationMs: 0,
        metrics: null,
        passed: false,
        error: err.message,
      });
    } finally {
      // Cleanup output file
      await fs.remove(runOutputPath);
    }
  }

  return results;
}
