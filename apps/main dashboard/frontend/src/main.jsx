import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import "./api/setupAxios.js";

import { initIdleLogout } from "./security/idleLogout.js";
initIdleLogout();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);