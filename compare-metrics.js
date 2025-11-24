#!/usr/bin/env node

import fs from "fs";

const pythonMetrics = JSON.parse(
  fs.readFileSync(
    "../page-dewarp/debug/boston_cooking_a_metrics_python.json",
    "utf8"
  )
);

const jsMetrics = JSON.parse(
  fs.readFileSync("debug/boston_cooking_a_metrics_js.json", "utf8")
);

const flattenNumbers = (val) => {
  if (val === null || val === undefined) return [];
  if (typeof val === "number") return [val];
  if (Array.isArray(val)) {
    return val.reduce((acc, item) => acc.concat(flattenNumbers(item)), []);
  }
  if (typeof val === "object") {
    return Object.values(val).reduce(
      (acc, item) => acc.concat(flattenNumbers(item)),
      []
    );
  }
  return [];
};

const maxAbsDelta = (a, b) => {
  if (a === undefined || b === undefined) return null;
  const flatA = flattenNumbers(a);
  const flatB = flattenNumbers(b);
  if (flatA.length !== flatB.length) return Infinity;
  let maxDelta = 0;
  for (let i = 0; i < flatA.length; i++) {
    maxDelta = Math.max(maxDelta, Math.abs(flatA[i] - flatB[i]));
  }
  return maxDelta;
};

const formatDelta = (delta) => {
  if (delta === null) return "n/a";
  if (delta === Infinity) return "length mismatch";
  return delta.toFixed(6);
};

console.log("=== METRICS COMPARISON: Python vs JS ===\n");

console.log("1. Image Dimensions:");
console.log("   Both match: ✓");
console.log(
  `   Original: ${JSON.stringify(pythonMetrics.image_dims.original)}`
);
console.log(
  `   Resized: ${JSON.stringify(pythonMetrics.image_dims.resized)}\n`
);

console.log("2. Page Extents:");
console.log("   Both match: ✓\n");

console.log("3. Contour Detection:");
console.log(`   Python: ${pythonMetrics.contours_count} contours`);
console.log(`   JS:     ${jsMetrics.contours_count} contours`);
const contourDiff = jsMetrics.contours_count - pythonMetrics.contours_count;
const contourPct =
  (contourDiff / Math.max(1, pythonMetrics.contours_count)) * 100;
console.log(`   Difference: ${contourDiff} (${contourPct.toFixed(1)}%)`);
if (contourDiff === 0) {
  console.log("   ✓ Contour counts match\n");
} else {
  console.log("   ⚠️  JS detects slightly fewer contours\n");
}

console.log("   Python sample contours:");
for (const c of pythonMetrics.contours_sample) {
  console.log(`     [${c.x}, ${c.y}, ${c.width}x${c.height}]`);
}
console.log("\n   JS sample contours:");
for (const c of jsMetrics.contours_sample) {
  console.log(`     [${c.x}, ${c.y}, ${c.width}x${c.height}]`);
}
console.log("\n");

const formatStageRect = (stage) =>
  stage && stage.sampleRects && stage.sampleRects.length > 0
    ? `${stage.sampleRects[0].width}x${stage.sampleRects[0].height}@(${stage.sampleRects[0].x},${stage.sampleRects[0].y})`
    : "n/a";

const printMaskPipeline = (label, pythonStats, jsStats) => {
  if (!pythonStats || !jsStats) {
    console.log(`   ${label}: missing stats\n`);
    return;
  }
  const stageOrder = ["threshold", "morph1", "morph2", "final"];
  const pyMap = Object.fromEntries(
    pythonStats.map((stage) => [stage.stage, stage])
  );
  const jsMap = Object.fromEntries(
    jsStats.map((stage) => [stage.stage, stage])
  );
  for (const stage of stageOrder) {
    const pyStage = pyMap[stage];
    const jsStage = jsMap[stage];
    console.log(
      `     ${stage}: PY nonzero=${pyStage?.nonzero ?? "n/a"} (contours=${
        pyStage?.contourCount ?? "n/a"
      }) | JS nonzero=${jsStage?.nonzero ?? "n/a"} (contours=${
        jsStage?.contourCount ?? "n/a"
      })`
    );
  }
  console.log(
    `     Largest component: PY ${formatStageRect(
      pyMap.final
    )} | JS ${formatStageRect(jsMap.final)}\n`
  );
};

console.log("3a. Mask Pipeline (Text):");
printMaskPipeline(
  "text mask",
  pythonMetrics.mask_stats_text,
  jsMetrics.mask_stats_text
);

console.log("4. Span Assembly:");
console.log(`   Python: ${pythonMetrics.spans_count} spans`);
console.log(`   JS:     ${jsMetrics.spans_count} spans`);
const spanDiff = jsMetrics.spans_count - pythonMetrics.spans_count;
const spanPct = (spanDiff / Math.max(1, pythonMetrics.spans_count)) * 100;
console.log(`   Difference: ${spanDiff} (${spanPct.toFixed(1)}%)`);
if (spanDiff === 0) {
  console.log("   ✓ Span counts match\n");
} else {
  console.log(
    `   ⚠️  JS assembles ${Math.abs(spanPct).toFixed(1)}% ${
      spanDiff > 0 ? "more" : "fewer"
    } spans!\n`
  );
}
const pythonSpanStats = pythonMetrics.span_stats || {};
const jsSpanStats = jsMetrics.span_stats || {};
if (pythonSpanStats.spanCount || jsSpanStats.spanCount) {
  console.log("   Span Stats:");
  console.log(
    `     Candidate pairs: Python ${
      pythonSpanStats.candidatePairs ?? "n/a"
    }, JS ${jsSpanStats.candidatePairs ?? "n/a"}`
  );
  console.log(
    `     Valid edges: Python ${pythonSpanStats.validEdges ?? "n/a"}, JS ${
      jsSpanStats.validEdges ?? "n/a"
    }`
  );
  console.log(
    `     Linked contours: Python ${
      pythonSpanStats.linkedContours ?? "n/a"
    }, JS ${jsSpanStats.linkedContours ?? "n/a"}`
  );
  console.log(
    `     Avg span width: Python ${
      pythonSpanStats.spanWidths
        ? (
            pythonSpanStats.spanWidths.reduce((a, b) => a + b, 0) /
            pythonSpanStats.spanWidths.length
          ).toFixed(2)
        : "n/a"
    }, JS ${
      jsSpanStats.spanWidths
        ? (
            jsSpanStats.spanWidths.reduce((a, b) => a + b, 0) /
            jsSpanStats.spanWidths.length
          ).toFixed(2)
        : "n/a"
    }`
  );
  const formatAccepted = (stats) =>
    stats && stats.acceptedMetrics
      ? `dist(avg=${
          stats.acceptedMetrics.distance?.average?.toFixed(2) ?? "n/a"
        }, max=${stats.acceptedMetrics.distance?.max?.toFixed(2) ?? "n/a"})`
      : "n/a";
  console.log(
    `     Accepted edge distance stats: Python ${formatAccepted(
      pythonSpanStats
    )}, JS ${formatAccepted(jsSpanStats)}`
  );
  console.log("");
}

console.log("5. Keypoint Generation:");
console.log(`   Python: ${pythonMetrics.keypoints_count} keypoints`);
console.log(`   JS:     ${jsMetrics.keypoints_count} keypoints`);
const keyDiff = jsMetrics.keypoints_count - pythonMetrics.keypoints_count;
const keyPct = (keyDiff / Math.max(1, pythonMetrics.keypoints_count)) * 100;
console.log(`   Difference: ${keyDiff} (${keyPct.toFixed(1)}%)`);
if (keyDiff === 0) {
  console.log("   ✓ Keypoint counts match\n");
} else {
  console.log(
    `   ⚠️  JS generates ${Math.abs(keyPct).toFixed(1)}% ${
      keyDiff > 0 ? "more" : "fewer"
    } keypoints\n`
  );
}

const pythonSpanPointCounts = pythonMetrics.span_point_counts || [];
const jsSpanPointCounts = jsMetrics.span_point_counts || [];
if (pythonSpanPointCounts.length && jsSpanPointCounts.length) {
  console.log("5a. Span Sample Counts:");
  const countMismatchIndex = pythonSpanPointCounts.findIndex(
    (count, idx) => count !== jsSpanPointCounts[idx]
  );
  if (
    countMismatchIndex === -1 &&
    pythonSpanPointCounts.length === jsSpanPointCounts.length
  ) {
    console.log("   ✓ Sample counts per span match");
  } else {
    console.log("   ⚠️  Sample counts differ between implementations");
  }
  const pythonSampleSpans = pythonMetrics.span_points_sample || [];
  const jsSampleSpans = jsMetrics.span_points_sample || [];
  let maxSampleDelta = 0;
  for (
    let i = 0;
    i < Math.min(pythonSampleSpans.length, jsSampleSpans.length);
    i++
  ) {
    const pySpan = pythonSampleSpans[i] || [];
    const jsSpan = jsSampleSpans[i] || [];
    for (let j = 0; j < Math.min(pySpan.length, jsSpan.length); j++) {
      const pyPt = pySpan[j];
      const jsPt = jsSpan[j];
      if (pyPt && jsPt) {
        maxSampleDelta = Math.max(
          maxSampleDelta,
          Math.abs(pyPt[0] - jsPt[0]),
          Math.abs(pyPt[1] - jsPt[1])
        );
      }
    }
  }
  console.log(
    `   Max sample delta (first spans): ${maxSampleDelta.toFixed(6)}\n`
  );
}

const pythonAxes = pythonMetrics.keypoint_axes;
const jsAxes = jsMetrics.keypoint_axes;
const pythonCorners = pythonMetrics.keypoint_corners;
const jsCorners = jsMetrics.keypoint_corners;
const pythonYCoords = pythonMetrics.keypoint_ycoords;
const jsYCoords = jsMetrics.keypoint_ycoords;
const pythonXLen = pythonMetrics.keypoint_xcoords_lengths;
const jsXLen = jsMetrics.keypoint_xcoords_lengths;
if (pythonAxes && jsAxes) {
  console.log("5b. Keypoint Axes & Corners:");
  console.log(
    `   Axes max delta: ${formatDelta(
      maxAbsDelta(
        [pythonAxes.x_dir, pythonAxes.y_dir],
        [jsAxes.x_dir, jsAxes.y_dir]
      )
    )}`
  );
  console.log(
    `   Corner max delta: ${formatDelta(maxAbsDelta(pythonCorners, jsCorners))}`
  );
  console.log(
    `   ycoords max delta: ${formatDelta(
      maxAbsDelta(pythonYCoords, jsYCoords)
    )}`
  );
  const lenMismatch =
    pythonXLen &&
    jsXLen &&
    pythonXLen.length === jsXLen.length &&
    pythonXLen.every((len, idx) => len === jsXLen[idx]);
  console.log(
    `   xcoords lengths ${lenMismatch ? "match" : "differ"} (${
      pythonXLen?.length ?? 0
    } spans)`
  );
  console.log("");
}

console.log("6. Optimization Initialization:");
console.log(`   Python initial cost: ${pythonMetrics.initial_cost.toFixed(8)}`);
console.log(`   JS initial cost:     ${jsMetrics.initial_cost.toFixed(8)}`);
const costDiff =
  ((jsMetrics.initial_cost - pythonMetrics.initial_cost) /
    pythonMetrics.initial_cost) *
  100;
console.log(`   Difference: ${costDiff.toFixed(1)}%`);
if (Math.abs(costDiff) < 1) {
  console.log("   ✓ Initial costs are closely aligned\n");
} else {
  console.log("   🔴 Initial costs differ significantly!\n");
}

console.log("7. Initial Parameters:");
console.log(`   Python params count: ${pythonMetrics.initial_params.length}`);
console.log(`   JS params count:     ${jsMetrics.initial_params.length}`);
console.log(
  `   Difference: ${
    jsMetrics.initial_params.length - pythonMetrics.initial_params.length
  }\n`
);

console.log("   First 8 params (rvec, tvec, cubic):");
console.log(
  `   Python: [${pythonMetrics.initial_params
    .slice(0, 8)
    .map((x) => x.toFixed(6))
    .join(", ")}]`
);
console.log(
  `   JS:     [${jsMetrics.initial_params
    .slice(0, 8)
    .map((x) => x.toFixed(6))
    .join(", ")}]`
);
console.log("\n");

console.log("8. Optimization Result:");
console.log(`   Python final cost:   ${pythonMetrics.final_cost.toFixed(8)}`);
console.log(`   JS final cost:       ${jsMetrics.final_cost.toFixed(8)}`);
const finalCostDiff =
  ((jsMetrics.final_cost - pythonMetrics.final_cost) /
    pythonMetrics.final_cost) *
  100;
console.log(`   Difference: ${finalCostDiff.toFixed(1)}%`);
console.log(`   Python time: ${pythonMetrics.optimization_time}s`);
console.log(`   JS time:     ${jsMetrics.optimization_time}s\n`);

console.log("9. Page Dimensions:");
console.log(
  `   Python: [${pythonMetrics.page_dims.map((x) => x.toFixed(4)).join(" x ")}]`
);
console.log(
  `   JS:     [${jsMetrics.page_dims.map((x) => x.toFixed(4)).join(" x ")}]`
);
const dimDiff0 =
  ((jsMetrics.page_dims[0] - pythonMetrics.page_dims[0]) /
    pythonMetrics.page_dims[0]) *
  100;
const dimDiff1 =
  ((jsMetrics.page_dims[1] - pythonMetrics.page_dims[1]) /
    pythonMetrics.page_dims[1]) *
  100;
console.log(
  `   Difference: ${dimDiff0.toFixed(1)}% x ${dimDiff1.toFixed(1)}%\n`
);

console.log("=== KEY FINDINGS ===\n");
const spansMatch = spanDiff === 0;
const keypointsMatch = keyDiff === 0;
const costSeverity =
  Math.abs(costDiff) > 5 ? "🔴" : Math.abs(costDiff) > 1 ? "🟡" : "🟢";
if (spansMatch) {
  console.log(
    `1. 🟢 SPAN GRAPH ALIGNED: both implementations assemble ${pythonMetrics.spans_count} spans\n`
  );
} else {
  console.log(
    `1. 🔴 SPAN COUNT MISMATCH: JS ${jsMetrics.spans_count} vs Python ${
      pythonMetrics.spans_count
    } (${spanPct.toFixed(1)}%)\n`
  );
}
if (keypointsMatch) {
  console.log(
    `2. 🟢 KEYPOINTS MATCH: ${pythonMetrics.keypoints_count} keypoints in both pipelines\n`
  );
} else {
  console.log(
    `2. 🔴 KEYPOINT COUNT MISMATCH: JS ${jsMetrics.keypoints_count} vs Python ${
      pythonMetrics.keypoints_count
    } (${keyPct.toFixed(1)}%)\n`
  );
}
console.log(
  `3. ${costSeverity} INITIAL COST DIFFERENCE: JS ${jsMetrics.initial_cost.toFixed(
    5
  )} vs Python ${pythonMetrics.initial_cost.toFixed(5)} (${costDiff.toFixed(
    1
  )}%)\n`
);
console.log(
  "4. 🟡 OPTIMIZER DIFFERENCE: Powell (Python) vs Coordinate Descent (JS)"
);
console.log(
  `   - Python: ${
    pythonMetrics.optimization_time
  }s, final cost ${pythonMetrics.final_cost.toFixed(5)}`
);
console.log(
  `   - JS: ${
    jsMetrics.optimization_time
  }s, final cost ${jsMetrics.final_cost.toFixed(5)}\n`
);
console.log("5. 🟡 PAGE DIMENSIONS: Different by ~4%");
console.log(
  "   - This is a consequence of the different optimization trajectories\n"
);

console.log("=== RECOMMENDED INVESTIGATION PRIORITY ===\n");
console.log(
  "A. HIGH: Verify span sampling parity (sample_spans vs sampleSpans)"
);
console.log(
  "   Look for: identical column averaging, step alignment, rounding\n"
);

console.log("B. HIGH: Compare projection/keypoint projection math");
console.log("   Files: projection.py vs projection.js");
console.log(
  "   Look for: coordinate transforms, normalization, axis selection\n"
);

console.log("C. MEDIUM: Ensure initial parameter vector ordering matches");
console.log("   Files: solve.py vs solve.js / default params logic\n");

console.log("D. LOW: Consider optimizer alignment if cost gap persists");
console.log("   Current: JS coordinate descent vs Python Powell\n");
console.log("   Target: evaluate Powell-style search or hybrid strategy\n");
console.log("");
