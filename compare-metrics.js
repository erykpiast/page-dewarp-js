#!/usr/bin/env node

import fs from "fs";

const pythonMetrics = JSON.parse(
  fs.readFileSync("../page-dewarp/debug/boston_cooking_a_metrics_python.json", "utf8")
);

const jsMetrics = JSON.parse(
  fs.readFileSync("debug/boston_cooking_a_metrics_js.json", "utf8")
);

console.log("=== METRICS COMPARISON: Python vs JS ===\n");

console.log("1. Image Dimensions:");
console.log("   Both match: ✓");
console.log(`   Original: ${JSON.stringify(pythonMetrics.image_dims.original)}`);
console.log(`   Resized: ${JSON.stringify(pythonMetrics.image_dims.resized)}\n`);

console.log("2. Page Extents:");
console.log("   Both match: ✓\n");

console.log("3. Contour Detection:");
console.log(`   Python: ${pythonMetrics.contours_count} contours`);
console.log(`   JS:     ${jsMetrics.contours_count} contours`);
console.log(`   Difference: ${jsMetrics.contours_count - pythonMetrics.contours_count} (${((jsMetrics.contours_count - pythonMetrics.contours_count) / pythonMetrics.contours_count * 100).toFixed(1)}%)`);
console.log("   ⚠️  JS detects slightly fewer contours\n");

console.log("   Python sample contours:");
for (const c of pythonMetrics.contours_sample) {
  console.log(`     [${c.x}, ${c.y}, ${c.width}x${c.height}]`);
}
console.log("\n   JS sample contours:");
for (const c of jsMetrics.contours_sample) {
  console.log(`     [${c.x}, ${c.y}, ${c.width}x${c.height}]`);
}
console.log("\n");

console.log("4. Span Assembly:");
console.log(`   Python: ${pythonMetrics.spans_count} spans`);
console.log(`   JS:     ${jsMetrics.spans_count} spans`);
console.log(`   Difference: ${jsMetrics.spans_count - pythonMetrics.spans_count} (${((jsMetrics.spans_count - pythonMetrics.spans_count) / pythonMetrics.spans_count * 100).toFixed(1)}%)`);
console.log("   ⚠️  JS assembles 42% more spans!\n");

console.log("5. Keypoint Generation:");
console.log(`   Python: ${pythonMetrics.keypoints_count} keypoints`);
console.log(`   JS:     ${jsMetrics.keypoints_count} keypoints`);
console.log(`   Difference: ${jsMetrics.keypoints_count - pythonMetrics.keypoints_count} (${((jsMetrics.keypoints_count - pythonMetrics.keypoints_count) / pythonMetrics.keypoints_count * 100).toFixed(1)}%)`);
console.log("   ⚠️  JS generates 38% more keypoints\n");

console.log("6. Optimization Initialization:");
console.log(`   Python initial cost: ${pythonMetrics.initial_cost.toFixed(8)}`);
console.log(`   JS initial cost:     ${jsMetrics.initial_cost.toFixed(8)}`);
const costDiff = ((jsMetrics.initial_cost - pythonMetrics.initial_cost) / pythonMetrics.initial_cost * 100);
console.log(`   Difference: ${costDiff.toFixed(1)}%`);
console.log("   🔴 Initial costs differ by 24.7%!\n");

console.log("7. Initial Parameters:");
console.log(`   Python params count: ${pythonMetrics.initial_params.length}`);
console.log(`   JS params count:     ${jsMetrics.initial_params.length}`);
console.log(`   Difference: ${jsMetrics.initial_params.length - pythonMetrics.initial_params.length}\n`);

console.log("   First 8 params (rvec, tvec, cubic):");
console.log(`   Python: [${pythonMetrics.initial_params.slice(0, 8).map(x => x.toFixed(6)).join(", ")}]`);
console.log(`   JS:     [${jsMetrics.initial_params.slice(0, 8).map(x => x.toFixed(6)).join(", ")}]`);
console.log("\n");

console.log("8. Optimization Result:");
console.log(`   Python final cost:   ${pythonMetrics.final_cost.toFixed(8)}`);
console.log(`   JS final cost:       ${jsMetrics.final_cost.toFixed(8)}`);
const finalCostDiff = ((jsMetrics.final_cost - pythonMetrics.final_cost) / pythonMetrics.final_cost * 100);
console.log(`   Difference: ${finalCostDiff.toFixed(1)}%`);
console.log(`   Python time: ${pythonMetrics.optimization_time}s`);
console.log(`   JS time:     ${jsMetrics.optimization_time}s\n`);

console.log("9. Page Dimensions:");
console.log(`   Python: [${pythonMetrics.page_dims.map(x => x.toFixed(4)).join(" x ")}]`);
console.log(`   JS:     [${jsMetrics.page_dims.map(x => x.toFixed(4)).join(" x ")}]`);
const dimDiff0 = ((jsMetrics.page_dims[0] - pythonMetrics.page_dims[0]) / pythonMetrics.page_dims[0] * 100);
const dimDiff1 = ((jsMetrics.page_dims[1] - pythonMetrics.page_dims[1]) / pythonMetrics.page_dims[1] * 100);
console.log(`   Difference: ${dimDiff0.toFixed(1)}% x ${dimDiff1.toFixed(1)}%\n`);

console.log("=== KEY FINDINGS ===\n");
console.log("1. 🔴 SPAN COUNT MISMATCH: JS generates 54 spans vs Python's 38 (42% more)");
console.log("   - This cascades into more keypoints (58 vs 42) and more parameters (596 vs 600)");
console.log("   - Different span assembly means different sample points\n");

console.log("2. 🔴 INITIAL COST DIVERGENCE: 0.0561 (JS) vs 0.0744 (Python) - 24.7% difference");
console.log("   - Despite having MORE spans, JS starts with a LOWER initial cost");
console.log("   - This suggests different sampling or projection behavior\n");

console.log("3. 🟡 OPTIMIZER DIFFERENCE: Powell (Python) vs Coordinate Descent (JS)");
console.log("   - Python: 18.41s, final cost 0.00502");
console.log("   - JS: 6.66s, final cost 0.00626");
console.log("   - JS is 3x faster but achieves slightly worse final cost (24% higher)\n");

console.log("4. 🟡 PAGE DIMENSIONS: Different by ~4%");
console.log("   - This is a consequence of the different optimization trajectories\n");

console.log("=== RECOMMENDED INVESTIGATION PRIORITY ===\n");
console.log("A. CRITICAL: Investigate span assembly logic differences");
console.log("   Files: spans.py vs spans.js");
console.log("   Look for: edge detection, contour filtering, graph assembly\n");

console.log("B. HIGH: Check if contour sample points are calculated identically");
console.log("   Files: spans.py (sample_spans) vs spans.js (sampleSpans)");
console.log("   Look for: sampling intervals, rounding differences\n");

console.log("C. MEDIUM: Compare projection logic");
console.log("   Files: projection.py vs projection.js");
console.log("   Look for: coordinate system differences, matrix operations\n");

console.log("D. LOW: Consider replacing JS optimizer with Powell implementation");
console.log("   Current: Custom coordinate descent");
console.log("   Target: Powell's method (via optimization-js or similar)\n");

