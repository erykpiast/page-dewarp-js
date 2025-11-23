import fs from "fs";
import path from "path";

/**
 * Static class for collecting debug metrics during processing.
 */
export class DebugMetrics {
  static _metrics = {};

  /**
   * Clear all collected metrics.
   */
  static reset() {
    this._metrics = {};
  }

  /**
   * Add a metric to the collection.
   * @param {string} key - Metric identifier
   * @param {*} value - Metric value (can be arrays, objects, numbers, etc.)
   */
  static add(key, value) {
    this._metrics[key] = this._serializeValue(value);
  }

  /**
   * Serialize values to JSON-compatible format.
   * Handles TypedArrays, OpenCV Mats, and nested structures.
   */
  static _serializeValue(value) {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((v) => this._serializeValue(v));
    }

    if (ArrayBuffer.isView(value)) {
      return Array.from(value);
    }

    if (typeof value === "object") {
      if (value.data && ArrayBuffer.isView(value.data)) {
        return Array.from(value.data);
      }

      const serialized = {};
      for (const [k, v] of Object.entries(value)) {
        serialized[k] = this._serializeValue(v);
      }
      return serialized;
    }

    return value;
  }

  /**
   * Save collected metrics to a JSON file.
   * @param {string} filepath - Path where the JSON file should be saved
   */
  static save(filepath) {
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const json = JSON.stringify(this._metrics, null, 2);
    fs.writeFileSync(filepath, json, "utf8");

    console.log(`Debug metrics saved to ${filepath}`);
  }

  /**
   * Return all collected metrics.
   */
  static getAll() {
    return { ...this._metrics };
  }
}
