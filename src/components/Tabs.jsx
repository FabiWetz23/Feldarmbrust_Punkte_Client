import React from "react";

export default function Tabs({ value, onChange, items }) {
  return (
    <div className="tabs">
      {items.map(it => (
        <div
          key={it.value}
          className={`tab ${value === it.value ? "active" : ""}`}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </div>
      ))}
    </div>
  );
}
