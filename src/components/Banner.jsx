import React from "react";

export default function Banner({ kind = "ok", title, children }) {
  return (
    <div className={`banner ${kind}`}>
      <div style={{ fontWeight: 900, marginBottom: 4 }}>{title}</div>
      <div style={{ color: "var(--muted)" }}>{children}</div>
    </div>
  );
}
