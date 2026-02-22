import { useState, useMemo } from "react";
import { isAuthenticated } from "./lib/auth";
import { Login } from "./components/Login";
import { Desktop } from "./components/Desktop";
import { createAppRegistry } from "./core/app-registry";
import { registerApps } from "./apps";

export function App() {
  const [authed, setAuthed] = useState(isAuthenticated());

  const registry = useMemo(() => {
    const reg = createAppRegistry();
    registerApps(reg);
    return reg;
  }, []);

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return <Desktop registry={registry} />;
}
