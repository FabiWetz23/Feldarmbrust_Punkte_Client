import React from "react";

export default function RoundPicker({ round, onRound, maxRounds = 10 }) {
  return (
    <div className="row">
      <span className="pill">Durchgang</span>
      <select
        className="select"
        value={round}
        onChange={(e) => onRound(Number(e.target.value))}
        style={{ maxWidth: 180 }}
      >
        {Array.from({ length: maxRounds }, (_, i) => i + 1).map(r => (
          <option key={r} value={r}>#{r}</option>
        ))}
      </select>
    </div>
  );
}
