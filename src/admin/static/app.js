/**
 * Bright Admin — SPA Frontend
 *
 * Hash-based router with four pages:
 *   #/       — Dashboard
 *   #/config — Configuration
 *   #/logs   — Chat Logs
 *   #/mcp    — MCP Servers
 */

// ---- State ----
let apiKey = sessionStorage.getItem("bright_admin_key") || "";
let restartRequired = false;

// ---- Helpers ----
async function api(path, options = {}) {
  const res = await fetch(`/admin/api${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (res.status === 401) {
    sessionStorage.removeItem("bright_admin_key");
    apiKey = "";
    showLogin();
    throw new Error("Unauthorized");
  }
  return res.json();
}

function $(id) { return document.getElementById(id); }
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === "className") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  });
  children.flat().forEach(c => {
    if (c == null) return;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return el;
}

function formatTime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

function badge(status) {
  const cls = `badge badge-${status.replace(/\s/g, "-")}`;
  return h("span", { className: cls }, status);
}

function showBanner() {
  if (restartRequired) $("restart-banner").hidden = false;
}

// ---- Auth ----
function showLogin() {
  $("login-dialog").open = true;
  $("shell").hidden = true;
}

function showApp() {
  $("login-dialog").open = false;
  $("shell").hidden = false;
  showBanner();
  route();
}

$("login-btn").addEventListener("click", async () => {
  const key = $("login-key").value.trim();
  if (!key) return;
  apiKey = key;
  try {
    await api("/status");
    sessionStorage.setItem("bright_admin_key", key);
    showApp();
  } catch {
    $("login-key").value = "";
    $("login-key").setAttribute("aria-invalid", "true");
  }
});

$("login-key").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("login-btn").click();
});

$("logout-btn").addEventListener("click", (e) => {
  e.preventDefault();
  sessionStorage.removeItem("bright_admin_key");
  apiKey = "";
  showLogin();
});

// ---- Router ----
function route() {
  const hash = location.hash || "#/";
  const path = hash.slice(1);

  // Update nav active state
  document.querySelectorAll(".nav-link").forEach(a => {
    const href = a.getAttribute("href")?.slice(1) || "/";
    a.removeAttribute("aria-current");
    if (href === path) a.setAttribute("aria-current", "page");
  });

  const app = $("app");
  app.innerHTML = "";
  app.append(h("p", { "aria-busy": "true" }, "Loading..."));

  if (path === "/" || path === "") renderDashboard(app);
  else if (path === "/config") renderConfig(app);
  else if (path === "/logs") renderLogs(app);
  else if (path === "/mcp") renderMcp(app);
  else { app.innerHTML = ""; app.append(h("p", null, "Page not found.")); }
}

window.addEventListener("hashchange", route);

// ---- Dashboard ----
async function renderDashboard(app) {
  try {
    const [status, tasksData] = await Promise.all([
      api("/status"),
      api("/tasks?limit=10"),
    ]);

    app.innerHTML = "";
    app.append(h("h2", null, "Dashboard"));

    // Status cards
    const grid = h("div", { className: "status-grid" });
    grid.append(
      h("article", { className: "status-card" },
        h("h3", null, formatTime(status.uptime)),
        h("p", null, "Uptime")
      )
    );
    grid.append(
      h("article", { className: "status-card" },
        h("h3", null, badge(status.bot)),
        h("p", null, "Bot Status")
      )
    );
    grid.append(
      h("article", { className: "status-card" },
        h("h3", null, badge(status.memory.replace(/\s/g, "-"))),
        h("p", null, "Memory")
      )
    );
    if (status.taskQueue) {
      grid.append(
        h("article", { className: "status-card" },
          h("h3", null, String(status.taskQueue.active)),
          h("p", null, "Active Tasks")
        )
      );
      grid.append(
        h("article", { className: "status-card" },
          h("h3", null, String(status.taskQueue.queued)),
          h("p", null, "Queued")
        )
      );
    }
    app.append(grid);

    // Recent tasks
    if (tasksData.tasks?.length) {
      app.append(h("h3", null, "Recent Tasks"));
      const table = h("table", { role: "grid" });
      table.append(
        h("thead", null,
          h("tr", null,
            h("th", null, "Status"),
            h("th", null, "Description"),
            h("th", null, "Iterations"),
            h("th", null, "Created"),
          )
        )
      );
      const tbody = h("tbody");
      for (const t of tasksData.tasks) {
        tbody.append(
          h("tr", null,
            h("td", null, badge(t.status)),
            h("td", null, t.description?.substring(0, 80) || "—"),
            h("td", null, `${t.iteration_count || 0}/${t.max_iterations || 25}`),
            h("td", null, formatDate(t.created_at)),
          )
        );
      }
      table.append(tbody);
      app.append(table);
    }
  } catch (err) {
    app.innerHTML = "";
    app.append(h("p", null, `Error: ${err.message}`));
  }
}

// ---- Configuration ----
async function renderConfig(app) {
  try {
    const data = await api("/config");
    app.innerHTML = "";
    app.append(h("h2", null, "Configuration"));

    const form = h("form", { onSubmit: (e) => e.preventDefault() });

    // Track edited values
    const edits = {};

    for (const section of data.sections) {
      const div = h("div", { className: "config-section" });
      div.append(h("h3", null, section.section));

      for (const v of section.vars) {
        const row = h("div", { className: "config-row" });
        row.append(h("label", null, v.key));

        const input = h("input", {
          type: v.masked ? "password" : "text",
          value: v.active ? v.value : "",
          placeholder: v.active ? "" : "(not set)",
        });
        input.addEventListener("input", () => {
          edits[v.key] = input.value;
        });
        row.append(input);

        if (v.masked) {
          const toggleBtn = h("button", {
            type: "button",
            className: "toggle-vis outline secondary",
            onClick: () => {
              if (input.type === "password") {
                input.type = "text";
                toggleBtn.textContent = "Hide";
              } else {
                input.type = "password";
                toggleBtn.textContent = "Show";
              }
            },
          }, "Show");
          row.append(toggleBtn);
        }

        div.append(row);
      }
      form.append(div);
    }

    const saveBtn = h("button", {
      type: "button",
      onClick: async () => {
        const updates = Object.entries(edits).map(([key, value]) => ({ key, value }));
        if (updates.length === 0) return;
        saveBtn.setAttribute("aria-busy", "true");
        try {
          const result = await api("/config", {
            method: "PUT",
            body: JSON.stringify({ updates }),
          });
          if (result.restartRequired) {
            restartRequired = true;
            showBanner();
          }
          saveBtn.textContent = "Saved!";
          setTimeout(() => { saveBtn.textContent = "Save Changes"; }, 2000);
        } catch (err) {
          saveBtn.textContent = `Error: ${err.message}`;
        } finally {
          saveBtn.removeAttribute("aria-busy");
        }
      },
    }, "Save Changes");

    form.append(saveBtn);
    app.append(form);
  } catch (err) {
    app.innerHTML = "";
    app.append(h("p", null, `Error: ${err.message}`));
  }
}

// ---- Chat Logs ----
async function renderLogs(app, offset = 0) {
  const limit = 50;
  try {
    const data = await api(`/messages?limit=${limit}&offset=${offset}`);
    app.innerHTML = "";
    app.append(h("h2", null, "Chat Logs"));
    app.append(h("p", { className: "muted" }, `${data.total} total messages`));

    if (!data.messages?.length) {
      app.append(h("p", null, "No messages yet."));
      return;
    }

    const list = h("div");
    for (const m of data.messages) {
      const item = h("div", { className: "message-item" });
      const meta = h("div", { className: "message-meta" },
        h("span", { className: "message-role" }, m.role),
        ` · ${m.channel || "telegram"} · ${formatDate(m.created_at)}`
      );
      item.append(meta);

      const content = h("div", {
        className: `message-content${(m.content?.length || 0) > 300 ? " truncated" : ""}`,
        onClick: (e) => e.currentTarget.classList.remove("truncated"),
      }, m.content || "");
      item.append(content);
      list.append(item);
    }
    app.append(list);

    // Pagination
    const pag = h("div", { className: "pagination" });
    if (offset > 0) {
      pag.append(h("button", {
        className: "outline",
        onClick: () => renderLogs(app, Math.max(0, offset - limit)),
      }, "Previous"));
    } else {
      pag.append(h("span"));
    }
    pag.append(h("small", null, `Showing ${offset + 1}–${Math.min(offset + limit, data.total)} of ${data.total}`));
    if (offset + limit < data.total) {
      pag.append(h("button", {
        className: "outline",
        onClick: () => renderLogs(app, offset + limit),
      }, "Next"));
    } else {
      pag.append(h("span"));
    }
    app.append(pag);
  } catch (err) {
    app.innerHTML = "";
    app.append(h("p", null, `Error: ${err.message}`));
  }
}

// ---- MCP Servers ----
async function renderMcp(app) {
  try {
    const [data, catalogData] = await Promise.all([
      api("/mcp"),
      api("/mcp/catalog").catch(() => ({ catalog: [] })),
    ]);

    app.innerHTML = "";
    app.append(h("h2", null, "MCP Servers"));

    if (data.configPath) {
      app.append(h("p", { className: "muted" }, `Config: ${data.configPath}`));
    } else {
      app.append(h("p", null,
        "MCP not configured. Set MCP_CONFIG_PATH in ",
        h("a", { href: "#/config" }, "Configuration"),
        " first."
      ));
      return;
    }

    const servers = data.servers || [];
    const catalog = catalogData.catalog || [];

    // Summary bar
    const connected = servers.filter(s => s.connected).length;
    const totalTools = servers.reduce((sum, s) => sum + (s.toolCount || 0), 0);
    app.append(h("p", null,
      `${servers.length} server(s) configured · ${connected} connected · ${totalTools} tools available`
    ));

    // Server cards
    for (let i = 0; i < servers.length; i++) {
      const s = servers[i];
      const card = h("article", { className: "mcp-card" });

      // Header with status dot
      const statusDot = h("span", {
        className: `status-dot ${s.connected ? "connected" : "disconnected"}`,
        title: s.connected ? "Connected" : "Disconnected",
      });
      const headerContent = h("div", { className: "mcp-header" },
        statusDot,
        h("strong", null, s.name),
        s.connected
          ? h("small", { className: "muted" }, ` · ${s.toolCount || 0} tools`)
          : h("small", { className: "muted" }, " · not connected"),
      );
      card.append(h("header", null, headerContent));

      const details = h("div", { className: "mcp-details" });

      // Command
      details.append(h("p", null,
        h("small", { className: "muted" }, "Command: "),
        h("code", null, s.command + " " + (s.args || []).join(" ")),
      ));

      // Approval policy
      if (s.approvalPolicy) {
        details.append(h("p", null,
          h("small", { className: "muted" }, "Approval: "),
          h("code", null, s.approvalPolicy),
        ));
      }

      // Env vars (keys only, not values)
      if (s.env && Object.keys(s.env).length) {
        details.append(h("p", null,
          h("small", { className: "muted" }, "Env vars: "),
          h("code", null, Object.keys(s.env).join(", ")),
        ));
      }

      // Expandable tool list
      if (s.tools && s.tools.length > 0) {
        const toolsToggle = h("details");
        toolsToggle.append(h("summary", null, `${s.tools.length} tools`));
        const toolList = h("ul", { className: "tool-list" });
        for (const t of s.tools) {
          toolList.append(h("li", null,
            h("code", null, t.name),
            t.description ? ` — ${t.description.substring(0, 80)}` : "",
          ));
        }
        toolsToggle.append(toolList);
        details.append(toolsToggle);
      }

      card.append(details);

      const removeBtn = h("button", {
        className: "outline secondary",
        onClick: async () => {
          if (!confirm(`Remove "${s.name}"?`)) return;
          const updated = servers
            .filter((_, idx) => idx !== i)
            .map(({ connected, toolCount, tools, ...rest }) => rest);
          await api("/mcp", {
            method: "PUT",
            body: JSON.stringify({ servers: updated }),
          });
          restartRequired = true;
          showBanner();
          renderMcp(app);
        },
      }, "Remove");
      card.append(h("footer", null, removeBtn));
      app.append(card);
    }

    // Add from catalog
    app.append(h("h3", null, "Add Server"));

    // Filter catalog to exclude already-configured servers
    const existingNames = new Set(servers.map(s => s.name));
    const available = catalog.filter(c => !existingNames.has(c.name));

    if (available.length > 0) {
      const catalogGrid = h("div", { className: "catalog-grid" });
      for (const entry of available) {
        const btn = h("button", {
          className: "outline catalog-btn",
          onClick: async () => {
            // Build server config from catalog entry
            const newServer = {
              name: entry.name,
              command: entry.command,
              args: [...entry.args],
              approvalPolicy: entry.approvalPolicy,
            };
            // Add placeholder env vars if any
            if (entry.envVars.length > 0) {
              newServer.env = {};
              for (const ev of entry.envVars) {
                newServer.env[ev.key] = `your-${ev.key.toLowerCase().replace(/_/g, "-")}`;
              }
            }
            const updated = servers
              .map(({ connected, toolCount, tools, ...rest }) => rest)
              .concat(newServer);
            await api("/mcp", {
              method: "PUT",
              body: JSON.stringify({ servers: updated }),
            });
            restartRequired = true;
            showBanner();
            renderMcp(app);
          },
        },
          h("strong", null, entry.name),
          h("br"),
          h("small", null, entry.description),
          entry.envVars.length > 0
            ? h("small", { className: "muted" },
                h("br"),
                `Requires: ${entry.envVars.filter(v => v.required).map(v => v.key).join(", ")}`,
              )
            : null,
        );
        catalogGrid.append(btn);
      }
      app.append(catalogGrid);
    } else {
      app.append(h("p", { className: "muted" }, "All catalog servers are already configured."));
    }

    // Manual add form (collapsed)
    const manualDetails = h("details");
    manualDetails.append(h("summary", null, "Add custom server manually"));

    const form = h("form", { onSubmit: (e) => e.preventDefault() });
    const nameInput = h("input", { type: "text", placeholder: "Server name (e.g. my-server)" });
    const cmdInput = h("input", { type: "text", placeholder: "Command (e.g. npx)" });
    const argsInput = h("input", { type: "text", placeholder: "Args (space-separated)" });
    const policySelect = h("select");
    ["destructive", "never", "always"].forEach(p => {
      policySelect.append(h("option", { value: p }, p));
    });

    form.append(
      h("label", null, "Name"), nameInput,
      h("label", null, "Command"), cmdInput,
      h("label", null, "Arguments"), argsInput,
      h("label", null, "Approval Policy"), policySelect,
    );

    const addBtn = h("button", {
      type: "button",
      onClick: async () => {
        const name = nameInput.value.trim();
        const command = cmdInput.value.trim();
        if (!name || !command) return;

        const args = argsInput.value.trim()
          ? argsInput.value.trim().split(/\s+/)
          : undefined;

        const newServer = { name, command, args, approvalPolicy: policySelect.value };
        const updated = servers
          .map(({ connected, toolCount, tools, ...rest }) => rest)
          .concat(newServer);
        await api("/mcp", {
          method: "PUT",
          body: JSON.stringify({ servers: updated }),
        });
        restartRequired = true;
        showBanner();
        renderMcp(app);
      },
    }, "Add Server");
    form.append(addBtn);
    manualDetails.append(form);
    app.append(manualDetails);
  } catch (err) {
    app.innerHTML = "";
    app.append(h("p", null, `Error: ${err.message}`));
  }
}

// ---- Init ----
if (apiKey) {
  api("/status").then(() => showApp()).catch(() => showLogin());
} else {
  showLogin();
}
