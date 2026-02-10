import React from "react";

export default function RoundPicker({ round, onRound, maxRounds = 10 }) {
  // Rounds: -1 (Sighting 1), 0 (Sighting 2), 1..maxRounds (Competition)
  const rounds = [
    { val: -1, label: "Sighting 1" },
    { val: 0, label: "Sighting 2" },
    ...Array.from({ length: maxRounds }, (_, i) => ({ val: i + 1, label: `Round ${i + 1}` }))
  ];

  return (
    <div className="row">
      <span className="pill">Round</span>
      <select
        className="select"
        value={round}
        onChange={(e) => onRound(Number(e.target.value))}
        style={{ maxWidth: 180 }}
      >
        {rounds.map(r => (
          <option key={r.val} value={r.val}>{r.label}</option>
        ))}
      </select>
    </div>
  );
}
