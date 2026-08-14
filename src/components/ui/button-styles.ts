import type { CSSProperties } from "react";

/** "スタート"/"ウェーブ開始" style button — warm yellow, pill-rounded.
 * Shared across the title, game, and ranking screens for a consistent
 * look (matches the reference "モンスターサバイバル" pill-button style). */
export function startButtonStyle(enabled: boolean): CSSProperties {
  return {
    padding: "10px 24px",
    borderRadius: 999,
    border: enabled ? "2px solid #a97b1f" : "2px solid #3a3a2a",
    background: enabled ? "#f0c94e" : "#4a4536",
    color: enabled ? "#3d2a0b" : "#7a8a7a",
    fontWeight: 700,
    cursor: enabled ? "pointer" : "not-allowed",
    boxShadow: enabled ? "0 2px 0 #a97b1f" : "none",
    textDecoration: "none",
    display: "inline-block",
    textAlign: "center",
  };
}

/** "更新" (reroll) style button — green, pill-rounded, to match the start button family. */
export function rerollButtonStyle(enabled: boolean): CSSProperties {
  return {
    padding: "10px 20px",
    borderRadius: 999,
    border: enabled ? "2px solid #2f8a4d" : "2px solid #2a3d2a",
    background: enabled ? "#4ecb71" : "#2f3f31",
    color: enabled ? "#0b2f16" : "#5a6a5a",
    fontWeight: 700,
    cursor: enabled ? "pointer" : "not-allowed",
    boxShadow: enabled ? "0 2px 0 #2f8a4d" : "none",
    textDecoration: "none",
    display: "inline-block",
    textAlign: "center",
  };
}

export function secondaryButtonStyle(enabled: boolean): CSSProperties {
  return {
    padding: "10px 20px",
    borderRadius: 999,
    border: "2px solid #2a3d52",
    background: "var(--panel)",
    color: enabled ? "var(--foreground)" : "#5a6a7a",
    fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed",
    textDecoration: "none",
    display: "inline-block",
    textAlign: "center",
  };
}
