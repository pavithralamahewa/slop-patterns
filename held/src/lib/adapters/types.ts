/**
 * Swappable adapters — NOT core IP.
 * Map research, LLM inference, codegen, and recruit panels plug in here.
 * Held's moat is the sprint graph / diversity / preference / evidence / eval / façade.
 */

export type MapResearchInput = {
  brief: string;
  hypothesis: string;
};

export type MapResearchHit = {
  title: string;
  url: string;
  excerpt: string;
  actorRunId?: string;
};

export type MapResearchAdapter = {
  id: string;
  label: string;
  search(input: MapResearchInput): Promise<MapResearchHit[]>;
};

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmAdapter = {
  id: string;
  label: string;
  complete(messages: LlmMessage[]): Promise<string>;
};

export type CodegenAdapter = {
  id: string;
  label: string;
  /** Render façade states to a preview URL or HTML stub. */
  renderFacade(states: { id: string; name: string; copy: string; cta: string }[]): Promise<{
    previewUrl: string | null;
    htmlStub: string;
  }>;
};

export type PanelScreener = {
  role: string;
  criteria: string[];
  count: number;
};

export type PanelAdapter = {
  id: string;
  label: string;
  draftScreener(screener: PanelScreener): Promise<{
    title: string;
    body: string;
    providerHint: string;
  }>;
};

export type AdapterRegistry = {
  mapResearch: MapResearchAdapter;
  llm: LlmAdapter;
  codegen: CodegenAdapter;
  panel: PanelAdapter;
};
