import type { CSSProperties } from "react";

export const C = {
  bg:      "#f5f5f7",
  surface: "#ffffff",
  border:  "#e5e5ea",
  border2: "#d1d1d6",
  blue:    "#0071e3",
  blueBg:  "#e8f0fe",
  blueMid: "#cce4ff",
  green:   "#34c759",
  greenBg: "#f0faf4",
  red:     "#ff3b30",
  redBg:   "#fff2f2",
  amber:   "#ff9f0a",
  purple:  "#af52de",
  text:    "#1d1d1f",
  text2:   "#515154",
  text3:   "#86868b",
};

export const radius = { sm:"10px", md:"14px", lg:"18px", xl:"24px", full:"980px" };
export const shadow = {
  sm: "0 1px 4px rgba(0,0,0,0.08)",
  md: "0 4px 16px rgba(0,0,0,0.10)",
  lg: "0 8px 32px rgba(0,0,0,0.12)",
};

export const card: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: radius.lg,
  boxShadow: shadow.sm,
};

export const input: CSSProperties = {
  width: "100%",
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: radius.sm,
  padding: "11px 14px",
  fontSize: 14,
  color: C.text,
  outline: "none",
};

export const label: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: C.text2,
  marginBottom: 6,
};

export const btnPrimary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  background: C.blue,
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
  padding: "11px 24px",
  borderRadius: radius.full,
  border: "none",
  cursor: "pointer",
};

export const btnSecondary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  background: C.surface,
  color: C.text,
  fontWeight: 500,
  fontSize: 14,
  padding: "11px 24px",
  borderRadius: radius.full,
  border: `1px solid ${C.border}`,
  cursor: "pointer",
};
