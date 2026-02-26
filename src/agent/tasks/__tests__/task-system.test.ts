/**
 * Task System Tests
 *
 * Tests for the Plan-and-Execute architecture improvements:
 * - Phase 1: Enhanced system prompt (plan-first, budget, deliverables, MCP guidance)
 * - Phase 2: Plan persistence in runner
 * - Phase 3: Task chains (TASKCHAIN intent parser, chain continuation)
 * - Phase 4: Sub-task spawning (tools, concurrency)
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { parseTaskIntents } from "../intents.ts";

// ============================================================
// Phase 1: System Prompt Tests
// ============================================================

describe("Phase 1: buildSystemPrompt", () => {
  // Import dynamically to avoid needing real deps at module level
  let createTaskManager: typeof import("../manager.ts").createTaskManager;

  beforeEach(async () => {
    const mod = await import("../manager.ts");
    createTaskManager = mod.createTaskManager;
  });

  function makeManager(opts: { registry?: any } = {}) {
    return createTaskManager({
      supabaseClient: null, // null is fine — buildSystemPrompt doesn't query DB
      sendMessage: async () => {},
      anthropicConfig: { apiKey: "test", model: "claude-sonnet-4-20250514", maxTokens: 4096 },
      profile: "Test user profile",
      userName: "TestUser",
      timezone: "America/New_York",
      registry: opts.registry,
    });
  }

  test("includes APPROACH section with plan-first instructions", () => {
    const mgr = makeManager();
    const prompt = mgr.buildSystemPrompt("Research quantum computing");
    expect(prompt).toContain("## APPROACH");
    expect(prompt).toContain("execution plan");
    expect(prompt).toContain("PLAN:");
    expect(prompt).toContain("BUDGET:");
  });

  test("includes iteration budget guidance", () => {
    const mgr = makeManager();
    const prompt = mgr.buildSystemPrompt("Research quantum computing");
    expect(prompt).toContain("50 tool-use iterations");
    expect(prompt).toContain("Research: 8-12 iterations");
    expect(prompt).toContain("Creation: 5-10 iterations");
    expect(prompt).toContain("Refinement: 2-3 iterations");
  });

  test("includes DELIVERABLES section", () => {
    const mgr = makeManager();
    const prompt = mgr.buildSystemPrompt("Create a presentation");
    expect(prompt).toContain("## DELIVERABLES");
    expect(prompt).toContain("CREATE the requested artifact");
    expect(prompt).toContain("not just describe");
  });

  test("includes CORE TOOLS section", () => {
    const mgr = makeManager();
    const prompt = mgr.buildSystemPrompt("Research something");
    expect(prompt).toContain("## CORE TOOLS");
    expect(prompt).toContain("web_search");
    expect(prompt).toContain("fetch_url");
    expect(prompt).toContain("send_progress");
    expect(prompt).toContain("ask_user");
  });

  test("includes OUTPUT section", () => {
    const mgr = makeManager();
    const prompt = mgr.buildSystemPrompt("Research something");
    expect(prompt).toContain("## OUTPUT");
    expect(prompt).toContain("Telegram");
  });

  test("includes user name and time", () => {
    const mgr = makeManager();
    const prompt = mgr.buildSystemPrompt("Research something");
    expect(prompt).toContain("TestUser");
    expect(prompt).toContain("Current time:");
  });

  test("includes profile when provided", () => {
    const mgr = makeManager();
    const prompt = mgr.buildSystemPrompt("Research something");
    expect(prompt).toContain("Test user profile");
  });

  test("includes dynamic MCP guidance for google tools", () => {
    const fakeRegistry = {
      getBackgroundTools: () => [
        { definition: { name: "google__slides_create" }, category: "mcp:google" },
        { definition: { name: "google__docs_create" }, category: "mcp:google" },
      ],
      getChatTools: () => [],
    };
    const mgr = makeManager({ registry: fakeRegistry });
    const prompt = mgr.buildSystemPrompt("Create slides");
    expect(prompt).toContain("## EXTERNAL SERVICE TOOLS");
    expect(prompt).toContain("Google Workspace");
    expect(prompt).toContain("google__");
  });

  test("includes dynamic MCP guidance for nanobanana tools", () => {
    const fakeRegistry = {
      getBackgroundTools: () => [
        { definition: { name: "nanobanana__generate_image" }, category: "mcp:nanobanana" },
      ],
      getChatTools: () => [],
    };
    const mgr = makeManager({ registry: fakeRegistry });
    const prompt = mgr.buildSystemPrompt("Generate images");
    expect(prompt).toContain("Image Generation");
    expect(prompt).toContain("nanobanana__");
  });

  test("omits EXTERNAL SERVICE TOOLS when no MCP tools registered", () => {
    const fakeRegistry = {
      getBackgroundTools: () => [],
      getChatTools: () => [],
    };
    const mgr = makeManager({ registry: fakeRegistry });
    const prompt = mgr.buildSystemPrompt("Research something");
    expect(prompt).not.toContain("## EXTERNAL SERVICE TOOLS");
  });

  test("omits SUB-TASKS section when no supabase/queue available", () => {
    const mgr = makeManager(); // supabaseClient is null
    const prompt = mgr.buildSystemPrompt("Research something");
    expect(prompt).not.toContain("## SUB-TASKS");
  });
});

// ============================================================
// Phase 3: TASKCHAIN Intent Parser Tests
// ============================================================

describe("Phase 3: parseTaskIntents — TASKCHAIN", () => {
  test("parses TASKCHAIN with numbered steps", () => {
    const response = `I'll handle this in two phases.
[TASKCHAIN:
1. Research quantum immortality theories
2. Create a Google Slides presentation based on the research
]
Let me get started.`;

    const { clean, intents } = parseTaskIntents(response);

    expect(intents).toHaveLength(1);
    expect(intents[0].type).toBe("chain");
    expect(intents[0].chainSteps).toEqual([
      "Research quantum immortality theories",
      "Create a Google Slides presentation based on the research",
    ]);
    expect(clean).toContain("I'll handle this in two phases.");
    expect(clean).toContain("Let me get started.");
    expect(clean).not.toContain("[TASKCHAIN:");
  });

  test("parses TASKCHAIN with 3+ steps", () => {
    const response = `[TASKCHAIN:
1. Research topic deeply
2. Create infographics based on findings
3. Build Google Slides presentation with the infographics
4. Generate a summary document
]`;

    const { intents } = parseTaskIntents(response);
    expect(intents).toHaveLength(1);
    expect(intents[0].chainSteps).toHaveLength(4);
    expect(intents[0].chainSteps![0]).toBe("Research topic deeply");
    expect(intents[0].chainSteps![3]).toBe("Generate a summary document");
  });

  test("parses TASKCHAIN case-insensitively", () => {
    const response = `[taskchain:
1. Step one
2. Step two
]`;

    const { intents } = parseTaskIntents(response);
    expect(intents).toHaveLength(1);
    expect(intents[0].type).toBe("chain");
    expect(intents[0].chainSteps).toHaveLength(2);
  });

  test("handles TASKCHAIN alongside regular TASK tags", () => {
    const response = `[TASKCHAIN:
1. Research topic
2. Create presentation
]
Also do this independently: [TASK: Check the weather in Boston]`;

    const { intents } = parseTaskIntents(response);
    expect(intents).toHaveLength(2);

    const chain = intents.find((i) => i.type === "chain");
    const task = intents.find((i) => i.type === "create");

    expect(chain).toBeDefined();
    expect(chain!.chainSteps).toHaveLength(2);
    expect(task).toBeDefined();
    expect(task!.description).toBe("Check the weather in Boston");
  });

  test("strips TASKCHAIN from clean output", () => {
    const response = `Sure, I'll do that. [TASKCHAIN:
1. Research
2. Create
] Working on it now.`;

    const { clean } = parseTaskIntents(response);
    expect(clean).not.toContain("TASKCHAIN");
    expect(clean).not.toContain("[");
    expect(clean).toContain("Sure, I'll do that.");
    expect(clean).toContain("Working on it now.");
  });
});

describe("Phase 3: parseTaskIntents — existing intents", () => {
  test("parses single TASK tag", () => {
    const response = "On it! [TASK: Research the history of quantum computing]";
    const { clean, intents } = parseTaskIntents(response);

    expect(intents).toHaveLength(1);
    expect(intents[0].type).toBe("create");
    expect(intents[0].description).toBe("Research the history of quantum computing");
    expect(clean).toBe("On it!");
  });

  test("parses TASKS: status", () => {
    const response = "Here are your tasks: [TASKS: status]";
    const { intents } = parseTaskIntents(response);
    expect(intents).toHaveLength(1);
    expect(intents[0].type).toBe("status");
  });

  test("parses TASKS: cancel", () => {
    const response = "Cancelling now. [TASKS: cancel abc123]";
    const { intents } = parseTaskIntents(response);
    expect(intents).toHaveLength(1);
    expect(intents[0].type).toBe("cancel");
    expect(intents[0].taskId).toBe("abc123");
  });

  test("returns empty intents for plain text", () => {
    const response = "Just a normal message with no tags.";
    const { clean, intents } = parseTaskIntents(response);
    expect(intents).toHaveLength(0);
    expect(clean).toBe(response);
  });
});

// ============================================================
// Phase 4: Sub-task Tool Definitions
// ============================================================

describe("Phase 4: spawn_subtask tool", () => {
  let createSpawnSubtaskTool: typeof import("../tools.ts").createSpawnSubtaskTool;

  beforeEach(async () => {
    const mod = await import("../tools.ts");
    createSpawnSubtaskTool = mod.createSpawnSubtaskTool;
  });

  test("tool has correct definition", () => {
    const mockSupabase = mockSupabaseClient();
    const tool = createSpawnSubtaskTool(
      mockSupabase as any,
      "parent-123",
      "user-456",
      () => "system prompt",
      async () => {}
    );

    expect(tool.definition.name).toBe("spawn_subtask");
    expect(tool.definition.description).toContain("child subtask");
    expect(tool.definition.description).toContain("parallel");
    expect(tool.definition.input_schema.required).toContain("description");
  });

  test("creates subtask with correct fields", async () => {
    const insertData: any[] = [];
    const mockSupabase = mockSupabaseClient({
      onInsert: (data: any) => {
        insertData.push(data);
        return { data: { id: "subtask-789" }, error: null };
      },
    });

    const enqueueCalls: string[] = [];
    const tool = createSpawnSubtaskTool(
      mockSupabase as any,
      "parent-123",
      "user-456",
      (desc: string) => `prompt for: ${desc}`,
      async (id: string) => { enqueueCalls.push(id); }
    );

    const result = await tool.execute({ description: "Research AWS pricing" });

    expect(insertData).toHaveLength(1);
    expect(insertData[0].description).toBe("Research AWS pricing");
    expect(insertData[0].status).toBe("queued");
    expect(insertData[0].user_id).toBe("user-456");
    expect(insertData[0].parent_task_id).toBe("parent-123");
    expect(insertData[0].max_iterations).toBe(15);
    expect(insertData[0].priority).toBe(2);
    expect(insertData[0].system_prompt).toBe("prompt for: Research AWS pricing");

    expect(enqueueCalls).toEqual(["subtask-789"]);
    expect(result).toContain("subtask-789");
  });

  test("handles insert error gracefully", async () => {
    const mockSupabase = mockSupabaseClient({
      onInsert: () => ({ data: null, error: { message: "DB error" } }),
    });

    const tool = createSpawnSubtaskTool(
      mockSupabase as any,
      "parent-123",
      "user-456",
      () => "prompt",
      async () => {}
    );

    const result = await tool.execute({ description: "Failing task" });
    expect(result).toContain("Failed to create subtask");
    expect(result).toContain("DB error");
  });
});

describe("Phase 4: get_subtask_results tool", () => {
  let createGetSubtaskResultsTool: typeof import("../tools.ts").createGetSubtaskResultsTool;

  beforeEach(async () => {
    const mod = await import("../tools.ts");
    createGetSubtaskResultsTool = mod.createGetSubtaskResultsTool;
  });

  test("tool has correct definition", () => {
    const mockSupabase = mockSupabaseClient();
    const tool = createGetSubtaskResultsTool(mockSupabase as any, "parent-123");

    expect(tool.definition.name).toBe("get_subtask_results");
    expect(tool.definition.description).toContain("subtasks");
    expect(tool.definition.description).toContain("wait");
  });

  test("returns formatted results for completed subtasks", async () => {
    const mockSupabase = mockSupabaseClient({
      onSelect: () => ({
        data: [
          {
            id: "sub-aaa-bbb",
            status: "completed",
            description: "Research AWS pricing and features",
            result: "AWS offers EC2, S3, Lambda...",
            error: null,
            iteration_count: 5,
            created_at: "2026-02-21T10:00:00Z",
            completed_at: "2026-02-21T10:05:00Z",
          },
          {
            id: "sub-ccc-ddd",
            status: "completed",
            description: "Research GCP pricing and features",
            result: "GCP offers Compute Engine, Cloud Storage...",
            error: null,
            iteration_count: 4,
            created_at: "2026-02-21T10:00:00Z",
            completed_at: "2026-02-21T10:04:00Z",
          },
        ],
        error: null,
      }),
    });

    const tool = createGetSubtaskResultsTool(mockSupabase as any, "parent-123");
    const result = await tool.execute({ wait: false });

    expect(result).toContain("2 total");
    expect(result).toContain("COMPLETED");
    expect(result).toContain("AWS offers EC2");
    expect(result).toContain("GCP offers Compute Engine");
  });

  test("returns no subtasks message when empty", async () => {
    const mockSupabase = mockSupabaseClient({
      onSelect: () => ({ data: [], error: null }),
    });

    const tool = createGetSubtaskResultsTool(mockSupabase as any, "parent-123");
    const result = await tool.execute({ wait: false });

    expect(result).toContain("No subtasks found");
  });

  test("shows running status for in-progress subtasks", async () => {
    const mockSupabase = mockSupabaseClient({
      onSelect: () => ({
        data: [
          {
            id: "sub-eee-fff",
            status: "running",
            description: "Still working on Azure research",
            result: null,
            error: null,
            iteration_count: 3,
            created_at: "2026-02-21T10:00:00Z",
            completed_at: null,
          },
        ],
        error: null,
      }),
    });

    const tool = createGetSubtaskResultsTool(mockSupabase as any, "parent-123");
    const result = await tool.execute({ wait: false });

    expect(result).toContain("RUNNING");
    expect(result).toContain("iteration 3");
  });

  test("shows error for failed subtasks", async () => {
    const mockSupabase = mockSupabaseClient({
      onSelect: () => ({
        data: [
          {
            id: "sub-ggg-hhh",
            status: "failed",
            description: "Research something",
            result: null,
            error: "API rate limit exceeded",
            iteration_count: 2,
            created_at: "2026-02-21T10:00:00Z",
            completed_at: "2026-02-21T10:01:00Z",
          },
        ],
        error: null,
      }),
    });

    const tool = createGetSubtaskResultsTool(mockSupabase as any, "parent-123");
    const result = await tool.execute({ wait: false });

    expect(result).toContain("FAILED");
    expect(result).toContain("API rate limit exceeded");
  });

  test("truncates long results", async () => {
    const longResult = "x".repeat(5000);
    const mockSupabase = mockSupabaseClient({
      onSelect: () => ({
        data: [
          {
            id: "sub-iii-jjj",
            status: "completed",
            description: "Research with long results",
            result: longResult,
            error: null,
            iteration_count: 10,
            created_at: "2026-02-21T10:00:00Z",
            completed_at: "2026-02-21T10:10:00Z",
          },
        ],
        error: null,
      }),
    });

    const tool = createGetSubtaskResultsTool(mockSupabase as any, "parent-123");
    const result = await tool.execute({ wait: false });

    expect(result).toContain("[...truncated]");
    // Should have at most 3000 chars of the result
    expect(result.indexOf("x".repeat(3001))).toBe(-1);
  });
});

// ============================================================
// Phase 2: Plan Persistence (structural test)
// ============================================================

describe("Phase 2: Plan persistence in runner", () => {
  test("runner module exports runTask function", async () => {
    const mod = await import("../runner.ts");
    expect(typeof mod.runTask).toBe("function");
  });

  // The plan persistence logic is deeply intertwined with the Anthropic API
  // call loop, so we validate it structurally by checking the source code
  // contains the expected patterns
  test("runner source contains plan extraction logic", async () => {
    const source = await Bun.file(
      new URL("../runner.ts", import.meta.url).pathname
    ).text();

    // Plan extraction after iteration 1
    expect(source).toContain("extractedPlan");
    expect(source).toContain("iteration === 1");

    // Plan re-injection into system prompt
    expect(source).toContain("effectiveSystemPrompt");
    expect(source).toContain("YOUR EXECUTION PLAN");
    expect(source).toContain("Follow this plan phase by phase");
  });
});

// ============================================================
// Phase 3: Chain Continuation Logic (structural test)
// ============================================================

describe("Phase 3: Chain continuation in queue", () => {
  test("queue source contains chain continuation logic", async () => {
    const source = await Bun.file(
      new URL("../queue.ts", import.meta.url).pathname
    ).text();

    expect(source).toContain("continueChain");
    expect(source).toContain("chain_steps");
    expect(source).toContain("chain_step_index");
    expect(source).toContain("chain_total");
    expect(source).toContain("chain_parent_id");
  });

  test("queue source contains subtask-aware concurrency", async () => {
    const source = await Bun.file(
      new URL("../queue.ts", import.meta.url).pathname
    ).text();

    expect(source).toContain("parent_task_id");
    expect(source).toContain("effectiveMax");
    expect(source).toContain("Subtask-aware concurrency");
  });
});

// ============================================================
// Phase 3: createTaskChain in manager
// ============================================================

describe("Phase 3: createTaskChain", () => {
  test("manager interface includes createTaskChain", async () => {
    const mod = await import("../manager.ts");
    const mgr = mod.createTaskManager({
      supabaseClient: null,
      sendMessage: async () => {},
      anthropicConfig: { apiKey: "test", model: "test", maxTokens: 4096 },
      profile: "",
      userName: "Test",
      timezone: "UTC",
    });

    expect(typeof mgr.createTaskChain).toBe("function");
  });

  test("createTaskChain returns null when supabase not configured", async () => {
    const mod = await import("../manager.ts");
    const mgr = mod.createTaskManager({
      supabaseClient: null,
      sendMessage: async () => {},
      anthropicConfig: { apiKey: "test", model: "test", maxTokens: 4096 },
      profile: "",
      userName: "Test",
      timezone: "UTC",
    });

    const result = await mgr.createTaskChain(["step 1", "step 2"], "user-1");
    expect(result).toBeNull();
  });

  test("createTaskChain returns null for empty steps", async () => {
    const mod = await import("../manager.ts");
    const mgr = mod.createTaskManager({
      supabaseClient: null,
      sendMessage: async () => {},
      anthropicConfig: { apiKey: "test", model: "test", maxTokens: 4096 },
      profile: "",
      userName: "Test",
      timezone: "UTC",
    });

    const result = await mgr.createTaskChain([], "user-1");
    expect(result).toBeNull();
  });
});

// ============================================================
// Phase 4: buildTools includes subtask tools
// ============================================================

describe("Phase 4: buildTools with subtask tools", () => {
  test("buildTools includes subtask tools when supabase and queue are available", async () => {
    const mod = await import("../manager.ts");
    const { TaskQueue } = await import("../queue.ts");

    const mockSupabase = mockSupabaseClient();

    const mgr = mod.createTaskManager({
      supabaseClient: mockSupabase as any,
      sendMessage: async () => {},
      anthropicConfig: { apiKey: "test", model: "test", maxTokens: 4096 },
      profile: "",
      userName: "Test",
      timezone: "UTC",
    });

    // Create a minimal mock queue and set it
    const mockQueue = {
      enqueue: async () => {},
      cancel: async () => true,
      start: async () => {},
      stop: () => {},
      activeCount: 0,
      queuedCount: async () => 0,
      waitingUserCount: async () => 0,
    };
    mgr.setQueue(mockQueue as any);

    const tools = mgr.buildTools("task-123", "user-456");
    const toolNames = tools.map((t) => t.definition.name);

    expect(toolNames).toContain("spawn_subtask");
    expect(toolNames).toContain("get_subtask_results");
  });

  test("buildTools excludes subtask tools when no queue", async () => {
    const mod = await import("../manager.ts");

    const mgr = mod.createTaskManager({
      supabaseClient: null,
      sendMessage: async () => {},
      anthropicConfig: { apiKey: "test", model: "test", maxTokens: 4096 },
      profile: "",
      userName: "Test",
      timezone: "UTC",
    });

    // No queue set
    const tools = mgr.buildTools("task-123", "user-456");
    const toolNames = tools.map((t) => t.definition.name);

    expect(toolNames).not.toContain("spawn_subtask");
    expect(toolNames).not.toContain("get_subtask_results");
  });

  test("buildTools always includes core tools", async () => {
    const mod = await import("../manager.ts");

    const mgr = mod.createTaskManager({
      supabaseClient: null,
      sendMessage: async () => {},
      anthropicConfig: { apiKey: "test", model: "test", maxTokens: 4096 },
      profile: "",
      userName: "Test",
      timezone: "UTC",
    });

    const tools = mgr.buildTools("task-123");
    const toolNames = tools.map((t) => t.definition.name);

    expect(toolNames).toContain("fetch_url");
    expect(toolNames).toContain("send_progress");
  });
});

// ============================================================
// Phase 5: upload_file tool (any file → public URL)
// ============================================================

describe("Phase 5: upload_file tool", () => {
  let createUploadFileTool: typeof import("../tools.ts").createUploadFileTool;

  beforeEach(async () => {
    const mod = await import("../tools.ts");
    createUploadFileTool = mod.createUploadFileTool;
  });

  test("tool has correct definition", () => {
    const mockSupabase = mockSupabaseClient();
    const tool = createUploadFileTool(mockSupabase as any, "https://example.supabase.co");

    expect(tool.definition.name).toBe("upload_file");
    expect(tool.definition.description).toContain("public URL");
    expect(tool.definition.description).toContain("images, audio, video, PDFs");
    expect(tool.definition.input_schema.required).toContain("file_path");
  });

  test("throws when file does not exist", async () => {
    const mockSupabase = mockSupabaseClient();
    const tool = createUploadFileTool(mockSupabase as any, "https://example.supabase.co");

    try {
      await tool.execute({ file_path: "/tmp/nonexistent-image-abc123.png" });
      expect(true).toBe(false); // Should not reach here
    } catch (err: any) {
      expect(err.message).toContain("File not found");
    }
  });

  test("returns public URL on successful upload", async () => {
    // Create a real temp file for the test
    const { mkdirSync, writeFileSync, unlinkSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");

    const testDir = join(tmpdir(), "bright-test-images");
    mkdirSync(testDir, { recursive: true });
    const testFile = join(testDir, "test-upload.png");
    writeFileSync(testFile, Buffer.from("fake-png-data"));

    try {
      const mockSupabase = mockSupabaseWithStorage({
        uploadResult: { error: null },
      });
      const tool = createUploadFileTool(
        mockSupabase as any,
        "https://example.supabase.co"
      );

      const result = await tool.execute({ file_path: testFile });

      expect(result).toContain("File uploaded successfully");
      expect(result).toContain("https://example.supabase.co/storage/v1/object/public/agent-files/");
      expect(result).toContain("test-upload.png");
    } finally {
      unlinkSync(testFile);
    }
  });

  test("throws on upload error", async () => {
    const { mkdirSync, writeFileSync, unlinkSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");

    const testDir = join(tmpdir(), "bright-test-images");
    mkdirSync(testDir, { recursive: true });
    const testFile = join(testDir, "test-fail.png");
    writeFileSync(testFile, Buffer.from("fake-png-data"));

    try {
      const mockSupabase = mockSupabaseWithStorage({
        uploadResult: { error: { message: "Bucket not found" } },
      });
      const tool = createUploadFileTool(
        mockSupabase as any,
        "https://example.supabase.co"
      );

      await expect(
        tool.execute({ file_path: testFile })
      ).rejects.toThrow("Upload failed: Bucket not found");
    } finally {
      unlinkSync(testFile);
    }
  });
});

describe("Phase 5: System prompt includes file upload guidance", () => {
  test("includes upload_file in CORE TOOLS when supabase URL is set", async () => {
    const mod = await import("../manager.ts");
    const mockSupabase = mockSupabaseClient();
    const mgr = mod.createTaskManager({
      supabaseClient: mockSupabase as any,
      supabaseUrl: "https://example.supabase.co",
      sendMessage: async () => {},
      anthropicConfig: { apiKey: "test", model: "test", maxTokens: 4096 },
      profile: "",
      userName: "Test",
      timezone: "UTC",
    });

    const prompt = mgr.buildSystemPrompt("Generate images");
    expect(prompt).toContain("upload_file");
    expect(prompt).toContain("public URL");
  });

  test("includes auto-upload guidance for nanobanana + google", async () => {
    const mod = await import("../manager.ts");
    const mockSupabase = mockSupabaseClient();
    const fakeRegistry = {
      getBackgroundTools: () => [
        { definition: { name: "nanobanana__generate_image" }, category: "mcp:nanobanana" },
        { definition: { name: "google__slides_create" }, category: "mcp:google" },
      ],
      getChatTools: () => [],
    };
    const mgr = mod.createTaskManager({
      supabaseClient: mockSupabase as any,
      supabaseUrl: "https://example.supabase.co",
      sendMessage: async () => {},
      anthropicConfig: { apiKey: "test", model: "test", maxTokens: 4096 },
      profile: "",
      userName: "Test",
      timezone: "UTC",
      registry: fakeRegistry as any,
    });

    const prompt = mgr.buildSystemPrompt("Create slides with images");
    expect(prompt).toContain("auto-upload");
    expect(prompt).toContain("[URL: ...]");
    expect(prompt).toContain("public URL");
  });

  test("nanobanana guidance mentions auto-upload even without supabaseUrl", async () => {
    const mod = await import("../manager.ts");
    const fakeRegistry = {
      getBackgroundTools: () => [
        { definition: { name: "nanobanana__generate_image" }, category: "mcp:nanobanana" },
      ],
      getChatTools: () => [],
    };
    const mgr = mod.createTaskManager({
      supabaseClient: null,
      sendMessage: async () => {},
      anthropicConfig: { apiKey: "test", model: "test", maxTokens: 4096 },
      profile: "",
      userName: "Test",
      timezone: "UTC",
      registry: fakeRegistry as any,
    });

    const prompt = mgr.buildSystemPrompt("Generate images");
    expect(prompt).toContain("nanobanana");
    expect(prompt).toContain("auto-uploaded");
  });
});

describe("Phase 5: buildTools includes upload_file", () => {
  test("includes upload_file when supabase client and URL available", async () => {
    const mod = await import("../manager.ts");
    const mockSupabase = mockSupabaseClient();
    const mgr = mod.createTaskManager({
      supabaseClient: mockSupabase as any,
      supabaseUrl: "https://example.supabase.co",
      sendMessage: async () => {},
      anthropicConfig: { apiKey: "test", model: "test", maxTokens: 4096 },
      profile: "",
      userName: "Test",
      timezone: "UTC",
    });

    const tools = mgr.buildTools("task-123");
    const toolNames = tools.map((t) => t.definition.name);
    expect(toolNames).toContain("upload_file");
  });

  test("excludes upload_file when no supabaseUrl", async () => {
    const mod = await import("../manager.ts");
    const mockSupabase = mockSupabaseClient();
    const mgr = mod.createTaskManager({
      supabaseClient: mockSupabase as any,
      // no supabaseUrl
      sendMessage: async () => {},
      anthropicConfig: { apiKey: "test", model: "test", maxTokens: 4096 },
      profile: "",
      userName: "Test",
      timezone: "UTC",
    });

    const tools = mgr.buildTools("task-123");
    const toolNames = tools.map((t) => t.definition.name);
    expect(toolNames).not.toContain("upload_file");
  });

  test("excludes upload_file when no supabaseClient", async () => {
    const mod = await import("../manager.ts");
    const mgr = mod.createTaskManager({
      supabaseClient: null,
      supabaseUrl: "https://example.supabase.co",
      sendMessage: async () => {},
      anthropicConfig: { apiKey: "test", model: "test", maxTokens: 4096 },
      profile: "",
      userName: "Test",
      timezone: "UTC",
    });

    const tools = mgr.buildTools("task-123");
    const toolNames = tools.map((t) => t.definition.name);
    expect(toolNames).not.toContain("upload_file");
  });
});

// ============================================================
// Helper: Mock Supabase Client
// ============================================================

function mockSupabaseClient(opts: {
  onInsert?: (data: any) => { data: any; error: any };
  onSelect?: () => { data: any[]; error: any };
  onUpdate?: (data: any) => { data: any; error: any };
} = {}) {
  const chainable = (terminal?: () => any): any => {
    const chain: any = {};
    const methods = [
      "select", "insert", "update", "delete",
      "eq", "in", "gte", "lte", "order", "limit",
      "single", "maybeSingle",
    ];
    for (const m of methods) {
      chain[m] = (...args: any[]) => {
        if (m === "insert" && opts.onInsert) {
          // Store the inserted data for assertions
          const result = opts.onInsert(args[0]);
          return chainable(() => result);
        }
        if (m === "select" && opts.onSelect) {
          return chainable(() => opts.onSelect!());
        }
        if (m === "single" && terminal) {
          return terminal();
        }
        if (m === "order") return chain;
        if (m === "limit") return terminal ? terminal() : chain;
        return chain;
      };
    }
    if (terminal) {
      // Make chain thenable for await
      chain.then = (resolve: any, reject: any) => {
        try {
          resolve(terminal());
        } catch (e) {
          reject?.(e);
        }
      };
    }
    return chain;
  };

  return {
    from: (table: string) => chainable(opts.onSelect ? opts.onSelect : undefined),
  };
}

/**
 * Mock Supabase client with storage support for upload_file tests.
 */
function mockSupabaseWithStorage(opts: {
  uploadResult: { error: any };
}) {
  return {
    from: (table: string) => mockSupabaseClient().from(table),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, data: any, options: any) => opts.uploadResult,
      }),
    },
  };
}
