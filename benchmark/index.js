#!/usr/bin/env node
import chalk from "chalk";
import Table from "cli-table3";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { runBenchmark } from "./lib/runner.js";

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option("cmd", {
      type: "string",
      description: "Command to run the JS implementation",
      default: "node ../src/cli.js",
    })
    .option("threshold-ssim", {
      type: "number",
      description: "Minimum SSIM score required to pass (0-1)",
      default: 0.95,
    })
    .option("threshold-pixel", {
      type: "number",
      description: "Maximum pixel difference percentage allowed (0-1)",
      default: 0.05,
    })
    .help().argv;

  console.log(chalk.bold("Page Dewarp JS Benchmark"));
  console.log(`Command: ${chalk.cyan(argv.cmd)}`);
  console.log(
    `Thresholds: SSIM >= ${argv.thresholdSsim}, Pixel Diff <= ${
      argv.thresholdPixel * 100
    }%\n`
  );

  const results = await runBenchmark({
    cmd: argv.cmd,
    thresholdSsim: argv.thresholdSsim,
    thresholdPixel: argv.thresholdPixel,
  });

  const table = new Table({
    head: ["File", "Time (ms)", "SSIM", "Diff %", "Status", "Details"],
    style: { head: ["cyan"] },
  });

  let failures = 0;

  results.forEach((res) => {
    if (res.error) {
      failures++;
      table.push([
        res.file,
        "-",
        "-",
        "-",
        chalk.red("ERROR"),
        chalk.red(res.error),
      ]);
    } else {
      const ssimStr = res.metrics.ssim.toFixed(4);
      const diffStr = (res.metrics.diffPercentage * 100).toFixed(2) + "%";

      const ssimColor =
        res.metrics.ssim >= argv.thresholdSsim ? chalk.green : chalk.red;
      const diffColor =
        res.metrics.diffPercentage <= argv.thresholdPixel
          ? chalk.green
          : chalk.red;
      const status = res.passed ? chalk.green("PASS") : chalk.red("FAIL");

      if (!res.passed) failures++;

      table.push([
        res.file,
        res.durationMs.toFixed(0),
        ssimColor(ssimStr),
        diffColor(diffStr),
        status,
        res.passed ? "" : "Thresholds not met",
      ]);
    }
  });

  console.log(table.toString());

  if (failures > 0) {
    console.log(chalk.red(`\n${failures} test(s) failed.`));
    process.exit(1);
  } else {
    console.log(chalk.green("\nAll tests passed!"));
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
