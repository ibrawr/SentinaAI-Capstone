/**
 * Displays the Digital Twin page by embedding the external digital twin
 * application inside an iframe, using the configured VITE_DIGITAL_TWIN_URL
 * environment value or a local fallback URL.
 */

import React from "react";

const DIGITAL_TWIN_URL =
  import.meta.env.VITE_DIGITAL_TWIN_URL || "http://localhost:3000";

export default function DigitalTwinPage() {
  return (
    <div
      style={{
        height: "100%",
        minHeight: "calc(100vh - 120px)",
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
      }}
    >
      <iframe
        src={DIGITAL_TWIN_URL}
        title="SentinaAI Digital Twin"
        style={{
          width: "100%",
          height: "100%",
          minHeight: "calc(100vh - 120px)",
          border: "0",
          display: "block",
          background: "#ffffff",
        }}
      />
    </div>
  );
}