import type {
  AdapterRegistry,
  CodegenAdapter,
  LlmAdapter,
  MapResearchAdapter,
  PanelAdapter,
} from "./types";

/**
 * Local/demo adapters — deterministic, no API keys.
 * Swap for Apify / OpenRouter / v0 / Respondent without touching core.
 */

export const localMapResearch: MapResearchAdapter = {
  id: "map.local",
  label: "Local Map Research (demo)",
  async search({ hypothesis }) {
    return [
      {
        title: "Character Foundation Sprint",
        url: "https://www.character.vc/guide/foundation-sprint",
        excerpt:
          "As AI makes building free, deciding what to build matters more.",
        actorRunId: "local_demo_1",
      },
      {
        title: "GV Design Sprint",
        url: "https://www.gv.com/sprint",
        excerpt:
          "Shortcut to learning via realistic prototype and five real customers.",
        actorRunId: "local_demo_2",
      },
      {
        title: "Hypothesis echo",
        url: "https://held.local/evidence/hypothesis",
        excerpt: hypothesis.slice(0, 160),
        actorRunId: "local_demo_3",
      },
    ];
  },
};

/** Placeholder for future Apify Actor adapter — same interface. */
export const apifyMapResearchStub: MapResearchAdapter = {
  id: "map.apify",
  label: "Apify Map Research (swap-in)",
  async search() {
    throw new Error(
      "Apify adapter not configured — set APIFY_TOKEN and wire Actor runs. Core does not depend on Apify.",
    );
  },
};

export const localLlm: LlmAdapter = {
  id: "llm.local",
  label: "Local LLM (deterministic draft)",
  async complete(messages) {
    const last = messages[messages.length - 1]?.content ?? "";
    return `[local-draft] ${last.slice(0, 280)}`;
  },
};

/** Placeholder for OpenRouter — swappable, not the company. */
export const openRouterLlmStub: LlmAdapter = {
  id: "llm.openrouter",
  label: "OpenRouter LLM (swap-in)",
  async complete() {
    throw new Error(
      "OpenRouter adapter not configured — set OPENROUTER_API_KEY. Core does not depend on OpenRouter.",
    );
  },
};

export const localCodegen: CodegenAdapter = {
  id: "codegen.local",
  label: "Local Façade HTML stub",
  async renderFacade(states) {
    const htmlStub = `<!doctype html><html><body>
<h1>Held façade</h1>
${states
  .map(
    (s) =>
      `<section id="${s.id}"><h2>${escapeHtml(s.name)}</h2><p>${escapeHtml(s.copy)}</p><button>${escapeHtml(s.cta)}</button></section>`,
  )
  .join("\n")}
</body></html>`;
    return { previewUrl: null, htmlStub };
  },
};

export const localPanel: PanelAdapter = {
  id: "panel.local",
  label: "Local screener draft",
  async draftScreener({ role, criteria, count }) {
    return {
      title: `Held Sprint Zero — ${count}× ${role}`,
      body: [
        `Looking for ${count} people who are ${role}.`,
        "",
        "Must:",
        ...criteria.map((c) => `- ${c}`),
        "",
        "60-minute remote interview. Incentive TBD.",
      ].join("\n"),
      providerHint: "Paste into Respondent / User Interviews / manual network",
    };
  },
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function createLocalRegistry(): AdapterRegistry {
  return {
    mapResearch: localMapResearch,
    llm: localLlm,
    codegen: localCodegen,
    panel: localPanel,
  };
}

export function describeAdapters(registry: AdapterRegistry): string[] {
  return [
    `Map: ${registry.mapResearch.label} (${registry.mapResearch.id})`,
    `LLM: ${registry.llm.label} (${registry.llm.id})`,
    `Codegen: ${registry.codegen.label} (${registry.codegen.id})`,
    `Panel: ${registry.panel.label} (${registry.panel.id})`,
  ];
}
