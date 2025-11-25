import { describe, it, expect, beforeEach } from "vitest";
import { Config, updateConfig } from "../src/config.js";

describe("updateConfig", () => {
  let originalConfig;

  beforeEach(() => {
    // Save original config values
    originalConfig = { ...Config };
  });

  it("should merge new values into existing config", () => {
    const newValues = {
      FOCAL_LENGTH: 1.5,
      DEBUG_LEVEL: 2,
    };

    updateConfig(newValues);

    expect(Config.FOCAL_LENGTH).toBe(1.5);
    expect(Config.DEBUG_LEVEL).toBe(2);
    
    // Restore original values
    Object.assign(Config, originalConfig);
  });

  it("should not lose existing values", () => {
    const textMinWidth = Config.TEXT_MIN_WIDTH;
    const edgeMaxLength = Config.EDGE_MAX_LENGTH;

    updateConfig({ FOCAL_LENGTH: 1.5 });

    expect(Config.TEXT_MIN_WIDTH).toBe(textMinWidth);
    expect(Config.EDGE_MAX_LENGTH).toBe(edgeMaxLength);
    
    // Restore original values
    Object.assign(Config, originalConfig);
  });

  it("should handle empty config update", () => {
    const configCopy = { ...Config };
    
    updateConfig({});
    
    expect(Config).toEqual(configCopy);
  });

  it("should allow partial updates", () => {
    const originalFocal = Config.FOCAL_LENGTH;
    const originalDebugLevel = Config.DEBUG_LEVEL;

    updateConfig({ FOCAL_LENGTH: 2.0 });

    expect(Config.FOCAL_LENGTH).toBe(2.0);
    expect(Config.DEBUG_LEVEL).toBe(originalDebugLevel);
    
    // Restore original values
    Object.assign(Config, originalConfig);
  });
});

describe("Config defaults", () => {
  it("should have expected camera parameters", () => {
    expect(Config.FOCAL_LENGTH).toBeDefined();
    expect(typeof Config.FOCAL_LENGTH).toBe("number");
  });

  it("should have contour detection thresholds", () => {
    expect(Config.TEXT_MIN_WIDTH).toBeDefined();
    expect(Config.TEXT_MIN_HEIGHT).toBeDefined();
    expect(Config.TEXT_MIN_ASPECT).toBeDefined();
    expect(Config.TEXT_MAX_THICKNESS).toBeDefined();
  });

  it("should have optimization parameters", () => {
    expect(Config.OPTIM_MAX_ITER).toBeDefined();
    expect(Config.OPTIM_TOL).toBeDefined();
    expect(typeof Config.OPTIM_MAX_ITER).toBe("number");
    expect(typeof Config.OPTIM_TOL).toBe("number");
  });

  it("should have projection parameter indices", () => {
    expect(Config.RVEC_IDX).toBeDefined();
    expect(Config.TVEC_IDX).toBeDefined();
    expect(Config.CUBIC_IDX).toBeDefined();
    expect(Array.isArray(Config.RVEC_IDX)).toBe(true);
    expect(Array.isArray(Config.TVEC_IDX)).toBe(true);
    expect(Array.isArray(Config.CUBIC_IDX)).toBe(true);
  });
});

