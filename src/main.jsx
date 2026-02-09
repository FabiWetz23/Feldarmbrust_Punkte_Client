import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Basic Service Worker (optional): wenn du später einen SW ergänzt, hier registrieren.
// In dieser Version nutzen wir eine "App-Shell" ohne SW (funktioniert trotzdem super).
