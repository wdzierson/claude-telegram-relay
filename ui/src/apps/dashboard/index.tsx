import type { BrightApp, AppProps } from "../../core/app-registry";

function DashboardContent(_props: AppProps) {
  return (
    <div className="p-4">
      <h2 className="font-mono text-sm font-medium text-accent-amber mb-4">
        DASHBOARD
      </h2>
      <p className="text-sm text-text-secondary">Loading...</p>
    </div>
  );
}

export const DashboardApp: BrightApp = {
  id: "dashboard",
  name: "Dashboard",
  icon: "layout-dashboard",
  defaultSize: { w: 800, h: 600 },
  minSize: { w: 400, h: 300 },
  component: DashboardContent,
  category: "core",
};
