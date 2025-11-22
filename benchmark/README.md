# Page Dewarp Node.js vs. Python benchmark

A tool to verify that the Node.js implementation produces results comparable to the original Python one. It uses **SSIM (Structural Similarity Index)** and **Pixel Difference** metrics to ensure visual fidelity.

## Overview

The benchmark runner iterates through sample input images, runs your Node.js CLI, and compares the generated output against "ground truth" images (produced by the Python reference implementation).

## Installation

1. Navigate to the benchmark directory:

   ```bash
   cd page-dewarp-js/benchmark
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

Run the benchmark with the default settings (tests against `../src/cli.js`):

```bash
node index.js
```

### Options

You can customize the command and failure thresholds via arguments:

- `--cmd`: The command to execute the JS implementation. Defaults to `node ../src/cli.js`.
- `--threshold-ssim`: Minimum SSIM score required to pass (0.0 to 1.0). Default: `0.95`.
- `--threshold-pixel`: Maximum allowed pixel difference percentage (0.0 to 1.0). Default: `0.05` (5%).

### Examples

Test a built/compiled version of the CLI:

```bash
node index.js --cmd "node ../dist/cli.js"
```

Run with stricter thresholds:

```bash
node index.js --threshold-ssim 0.99 --threshold-pixel 0.01
```

## Directory Structure

- `example_input/`: Source `.jpg` images for testing.
- `example_output/`: Expected `.png` (thresholded) images from the Python implementation.
- `lib/`: Benchmark logic (image comparison, runner orchestration).
- `index.js`: CLI entry point.
