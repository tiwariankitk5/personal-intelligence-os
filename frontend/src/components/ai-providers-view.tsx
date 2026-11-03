"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "@/components/icon";
import {
  ApiProvider, ApiChatGptConnection, ApiChatGptModel, activateChatGptModel, createProvider,
  confirmChatGptConnect, disconnectChatGpt, getChatGptConnection, getChatGptModels, getProviders, removeProvider,
  setDefaultProvider, startChatGptConnect, testProvider
} from "@/lib/api";

type Mode = "byok" | "local";
type ProviderChoice = { label: string; type: "OPENAI_COMPATIBLE" | "ANTHROPIC" | "GEMINI"; baseUrl?: string; defaultModel: string; needsKey: boolean };

const cloudChoices: ProviderChoice[] = [
  { label: "OpenAI", type: "OPENAI_COMPATIBLE", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4.1-mini", needsKey: true },
  { label: "Anthropic", type: "ANTHROPIC", defaultModel: "claude-sonnet-4-5", needsKey: true },
  { label: "Google Gemini", type: "GEMINI", defaultModel: "gemini-2.5-flash", needsKey: true },
  { label: "OpenRouter", type: "OPENAI_COMPATIBLE", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4.1-mini", needsKey: true },
  { label: "Groq", type: "OPENAI_COMPATIBLE", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile", needsKey: true },
  { label: "DeepSeek", type: "OPENAI_COMPATIBLE", baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat", needsKey: true },
  { label: "Mistral", type: "OPENAI_COMPATIBLE", baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-small-latest", needsKey: true },
  { label: "Custom OpenAI-compatible", type: "OPENAI_COMPATIBLE", defaultModel: "", needsKey: false },
];
const localChoices: ProviderChoice[] = [
  { label: "Ollama (Docker host bridge)", type: "OPENAI_COMPATIBLE", baseUrl: "http://host.docker.internal:11434/v1", defaultModel: "qwen2.5:7b", needsKey: false },
  { label: "LM Studio (Docker host bridge)", type: "OPENAI_COMPATIBLE", baseUrl: "http://host.docker.internal:1234/v1", defaultModel: "local-model", needsKey: false },
  { label: "Custom local OpenAI-compatible", type: "OPENAI_COMPATIBLE", baseUrl: "http://host.docker.internal:8000/v1", defaultModel: "local-model", needsKey: false },
];

export default function AiProvidersView({ onToast }: { onToast: (message: string) => void }) {
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("byok");
  const [choiceLabel, setChoiceLabel] = useState("OpenAI");
  const [displayName, setDisplayName] = useState("OpenAI");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [managedOpen, setManagedOpen] = useState(false);
  const [chatGptConnection, setChatGptConnection] = useState<ApiChatGptConnection | null>(null);
  const [chatGptModels, setChatGptModels] = useState<ApiChatGptModel[]>([]);
  const [chatGptModel, setChatGptModel] = useState("");
  const [chatGptLoading, setChatGptLoading] = useState(true);
  const [chatGptConnecting, setChatGptConnecting] = useState(false);
  const [chatGptActivating, setChatGptActivating] = useState(false);

  const choices = mode === "local" ? localChoices : cloudChoices;
  const selectedChoice = choices.find((choice) => choice.label === choiceLabel) ?? choices[0];
  const defaultProvider = useMemo(() => providers.find((provider) => provider.isDefault), [providers]);

  async function refreshChatGpt() {
    setChatGptLoading(true);
    try {
      const connection = await getChatGptConnection();
      setChatGptConnection(connection);
      if (connection.connected && connection.planUsageEnabled) {
        const models = await getChatGptModels();
        setChatGptModels(models);
        const existing = providers.find((provider) => provider.providerType === "CHATGPT_PLAN");
        setChatGptModel(existing?.modelName ?? connection.selectedModel ?? models[0]?.slug ?? "");
      } else {
        setChatGptModels([]);
        setChatGptModel("");
      }
    } catch (error) {
      setChatGptConnection(null);
      setChatGptModels([]);
      if (error instanceof Error && !error.message.includes("401")) onToast(error.message);
    } finally { setChatGptLoading(false); }
  }

  async function refresh() {
    try {
      const result = await getProviders();
      setProviders(result);
      let connection: ApiChatGptConnection;
      try {
        connection = await getChatGptConnection();
        setChatGptConnection(connection);
      } catch {
        setChatGptConnection(null);
        setChatGptModels([]);
        setChatGptModel("");
        return;
      }
      if (connection.connected && connection.planUsageEnabled) {
        try {
          const models = await getChatGptModels();
          setChatGptModels(models);
          const existing = result.find((provider) => provider.providerType === "CHATGPT_PLAN");
          setChatGptModel(existing?.modelName ?? connection.selectedModel ?? models[0]?.slug ?? "");
        } catch (error) {
          setChatGptModels([]);
          setChatGptModel("");
          onToast(error instanceof Error ? error.message : "ChatGPT is connected, but its models could not be loaded.");
        }
      } else {
        setChatGptModels([]);
        setChatGptModel("");
      }
    } catch (error) { onToast(error instanceof Error ? error.message : "Could not load AI provider connections."); }
    finally { setLoading(false); setChatGptLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  function openForm(nextMode: Mode, label?: string) {
    const nextChoices = nextMode === "local" ? localChoices : cloudChoices;
    const choice = nextChoices.find((item) => item.label === label) ?? nextChoices[0];
    setMode(nextMode); setChoiceLabel(choice.label); setDisplayName(choice.label); setModel(choice.defaultModel);
    setBaseUrl(choice.baseUrl ?? ""); setApiKey(""); setMakeDefault(providers.length === 0); setShowDialog(true);
  }

  async function connectChatGpt() {
    // Open synchronously in the click handler so browsers do not block the local OAuth launch.
    const popup = window.open("about:blank", "pios-chatgpt-connect", "popup,width=620,height=760");
    if (!popup) { onToast("Allow pop-ups for the local PIOS page, then try Continue with ChatGPT again."); return; }

    setChatGptConnecting(true);
    let callbackOrigin = "";
    let timeoutId: number | undefined;
    let settled = false;

    const cleanup = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      if (!popup.closed) popup.close();
      setChatGptConnecting(false);
    };

    const onMessage = async (event: MessageEvent) => {
      if (event.source !== popup || event.origin !== callbackOrigin
          || event.data?.type !== "pios-chatgpt-oauth" || settled) return;
      settled = true;
      try {
        if (!event.data.success) {
          onToast(typeof event.data.message === "string" ? event.data.message : "ChatGPT sign-in was not completed.");
          return;
        }
        if (typeof event.data.state !== "string") {
          throw new Error("The ChatGPT callback did not return a confirmation state. Start again.");
        }
        const connection = await confirmChatGptConnect(event.data.state);
        await refresh();
        onToast(connection.planUsageEnabled
          ? "ChatGPT plan usage is authorised. Choose a model below to enable it for Ask PIOS."
          : "ChatGPT identity is connected, but plan usage was not authorised. Reconnect and approve the separate plan-usage permission.");
      } catch (error) {
        onToast(error instanceof Error ? error.message : "Could not confirm the ChatGPT connection.");
      } finally {
        cleanup();
      }
    };

    window.addEventListener("message", onMessage);
    timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      onToast("ChatGPT sign-in timed out. You can try again.");
    }, 180000);

    try {
      const start = await startChatGptConnect();
      callbackOrigin = new URL(start.redirectUri).origin;
      popup.location.href = start.launchUrl;
    } catch (error) {
      settled = true;
      cleanup();
      onToast(error instanceof Error ? error.message : "Could not start ChatGPT sign-in.");
    }
  }

  async function enableChatGptModel() {
    if (!chatGptModel) { onToast("Choose a model from the ChatGPT account's available model list."); return; }
    setChatGptActivating(true);
    try {
      await activateChatGptModel(chatGptModel, true);
      await refresh();
      onToast("ChatGPT plan is now the default model for Ask PIOS.");
    } catch (error) { onToast(error instanceof Error ? error.message : "Could not activate the ChatGPT model."); }
    finally { setChatGptActivating(false); }
  }

  async function disconnectChatGptAccount() {
    if (!window.confirm("Disconnect ChatGPT from this local PIOS installation? Saved ChatGPT tokens will be deleted from the local database.")) return;
    try {
      const result = await disconnectChatGpt();
      await refresh();
      onToast(result.remoteRevocationConfirmed
        ? "ChatGPT disconnected and the remote refresh grant was revoked."
        : "Local ChatGPT credentials were deleted, but remote revocation could not be confirmed. Revoke PIOS in ChatGPT Settings → Security and login.");
    } catch (error) { onToast(error instanceof Error ? error.message : "Could not disconnect ChatGPT."); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!model.trim()) { onToast("Enter the exact model identifier supported by this provider."); return; }
    if (selectedChoice.needsKey && !apiKey.trim()) { onToast("Enter the provider API key."); return; }
    if (selectedChoice.type === "OPENAI_COMPATIBLE" && !baseUrl.trim()) { onToast("Enter the OpenAI-compatible base URL."); return; }
    setSaving(true);
    try {
      const saved = await createProvider({
        displayName: displayName.trim() || selectedChoice.label,
        providerType: selectedChoice.type,
        modelName: model.trim(),
        baseUrl: selectedChoice.type === "OPENAI_COMPATIBLE" ? baseUrl.trim() : undefined,
        apiKey: apiKey.trim() || undefined,
        makeDefault,
      });
      setApiKey(""); setShowDialog(false);
      await refresh();
      onToast(`${saved.displayName} saved. Run Test connection to verify the model and credentials.`);
    } catch (error) { onToast(error instanceof Error ? error.message : "Could not save this provider."); }
    finally { setSaving(false); }
  }

  async function chooseDefault(id: string) {
    try { await setDefaultProvider(id); await refresh(); onToast("Default AI model updated."); }
    catch (error) { onToast(error instanceof Error ? error.message : "Could not change the default model."); }
  }
  async function runTest(id: string) {
    setTestingId(id);
    try { const result = await testProvider(id); onToast(`${result.message} Test response: ${result.output}`); }
    catch (error) { onToast(error instanceof Error ? error.message : "Provider test failed."); }
    finally { setTestingId(null); }
  }
  async function remove(id: string) {
    if (!window.confirm("Remove this AI connection? Its encrypted API key will be deleted.")) return;
    try { await removeProvider(id); await refresh(); onToast("AI provider removed."); }
    catch (error) { onToast(error instanceof Error ? error.message : "Could not remove provider."); }
  }

  return <div className="view-stack ai-providers-page">
    <div className="page-heading-row"><div><div className="eyebrow">YOUR MODELS, YOUR CHOICE</div><h1>AI providers</h1><p>Connect an API provider or a local OpenAI-compatible model server.</p></div><span className="secure-label"><Icon name="shield-check" size={14}/> Encrypted credentials</span></div>
    <div className="ai-provider-callout"><div className="ai-callout-icon"><Icon name="brain" size={20}/></div><div><strong>Bring your own AI provider.</strong><p>PIOS stores provider credentials encrypted on the backend. Calls are made server-side, and your provider bills your API account directly.</p></div><span className="ai-callout-badge">AI GATEWAY</span></div>

    <section className="siwc-card">
      <div className="siwc-card-heading">
        <div className="siwc-brand-mark"><Icon name="brain" size={22}/></div>
        <div><span className="panel-overline">CHATGPT ACCOUNT CONNECTION</span><h2>Use your ChatGPT plan in PIOS</h2><p>Sign in with ChatGPT and separately approve plan usage. No API key is shared with PIOS.</p></div>
        <span className={chatGptConnection?.planUsageEnabled ? "siwc-status connected" : "siwc-status"}>{chatGptLoading ? "Checking…" : chatGptConnection?.planUsageEnabled ? "Plan access enabled" : chatGptConnection?.connected ? "Sign-in only" : "Not connected"}</span>
      </div>
      {chatGptConnection?.connected ? <div className="siwc-connected">
        <div className="siwc-account"><div className="siwc-avatar"><Icon name="user-round" size={18}/></div><div><strong>{chatGptConnection.displayName || "ChatGPT account"}</strong><span>{chatGptConnection.email || "Connected ChatGPT identity"}</span></div></div>
        {chatGptConnection.planUsageEnabled ? <>
          <div className="siwc-model-row"><div className="form-field"><label htmlFor="siwc-model">Available ChatGPT model</label><select id="siwc-model" className="ai-select" value={chatGptModel} onChange={(event) => setChatGptModel(event.target.value)}>{chatGptModels.map((model) => <option key={model.slug} value={model.slug}>{model.displayName} · {model.slug}</option>)}</select><small>Model choices are loaded from this connected ChatGPT account.</small></div><button className="button button-primary" disabled={chatGptActivating || !chatGptModel} onClick={() => void enableChatGptModel()}>{chatGptActivating ? "Activating…" : "Use for Ask PIOS"}</button></div>
          <div className="siwc-usage-note"><Icon name="shield-check" size={15}/><span>Requests count toward your ChatGPT plan usage and limits. Manage your app limit in ChatGPT Settings → Usage.</span><a href={chatGptConnection.manageUsageUrl || "https://chatgpt.com/settings/usage"} target="_blank" rel="noreferrer">Manage usage <Icon name="external-link" size={12}/></a></div>
        </> : <div className="siwc-usage-note"><Icon name="info" size={15}/><span>You are signed in, but the separate ChatGPT plan-usage permission was not granted. Reconnect and review the permission.</span></div>}
        <div className="siwc-actions"><button className="button button-secondary button-small" onClick={() => void connectChatGpt()} disabled={chatGptConnecting}>{chatGptConnecting ? "Connecting…" : "Reconnect / review permissions"}</button><button className="button button-danger button-small" onClick={() => void disconnectChatGptAccount()}>Disconnect</button></div>
      </div> : <div className="siwc-connect-row"><div><strong>Keep your existing AI API keys and local models too.</strong><span>ChatGPT sign-in and plan usage are separate permissions. PIOS receives no ChatGPT conversations, memories or API key.</span></div><button className="button button-primary" data-oai-siwc-button onClick={() => void connectChatGpt()} disabled={chatGptConnecting}>{chatGptConnecting ? "Opening ChatGPT…" : "Continue with ChatGPT"}</button></div>}
      <div className="siwc-footnote">For this self-hosted local PIOS runtime only. OpenAI currently documents this flow for open-source apps and selected private clients; PIOS is in private development, so ChatGPT plan use may remain unavailable until the app meets OpenAI's eligibility requirements. Access is user-authorised and subject to account eligibility and ChatGPT limits. PIOS does not resell this access.</div>
    </section>

    <div className="ai-mode-grid">
      <button className={`ai-mode-card ${mode === "byok" ? "selected" : ""}`} onClick={() => openForm("byok", "OpenAI")}><span className="ai-mode-icon cloud"><Icon name="key" size={20}/></span><span className="ai-mode-kicker">BRING YOUR OWN KEY</span><strong>Connect a cloud API</strong><p>OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek, Mistral and compatible APIs.</p><span className="ai-mode-link">Add provider <Icon name="arrow-right" size={14}/></span></button>
      <button className={`ai-mode-card ${mode === "local" ? "selected" : ""}`} onClick={() => openForm("local")}><span className="ai-mode-icon local"><Icon name="monitor" size={20}/></span><span className="ai-mode-kicker">RUN ON YOUR MACHINE</span><strong>Connect local AI</strong><p>Use Ollama, LM Studio or any compatible local server reachable by the backend.</p><span className="ai-mode-link">Connect local model <Icon name="arrow-right" size={14}/></span></button>
      <button className="ai-mode-card" onClick={() => setManagedOpen((value) => !value)}><span className="ai-mode-icon managed"><Icon name="sparkles" size={20}/></span><span className="ai-mode-kicker">PIOS-MANAGED INFERENCE</span><strong>Use PIOS AI</strong><p>Managed models, credit balance and metered billing require a deployed PIOS billing service.</p><span className="ai-mode-link">View status <Icon name="arrow-right" size={14}/></span></button>
    </div>
    {managedOpen && <div className="ai-privacy-panel"><Icon name="info" size={18}/><div><strong>PIOS-managed AI is not enabled in this self-hosted build.</strong><p>No subscription or charge can be created from this screen. You can use BYOK or a local model now. Managed billing requires payment integration, metering and provider contracts.</p></div></div>}

    <div className="ai-section-header"><div><span className="panel-overline">CONNECTED PROVIDERS</span><h2>Your AI connections</h2><p>Only the encrypted-key status is returned to the browser. The secret itself is never displayed again.</p></div><button className="button button-primary" onClick={() => openForm("byok", "OpenAI")}><Icon name="plus" size={15}/> Add connection</button></div>
    {loading ? <div className="panel ai-empty-connections">Loading connections…</div> : providers.length === 0 ? <div className="panel ai-empty-connections"><div className="ai-empty-icon"><Icon name="plug" size={22}/></div><strong>No AI providers connected</strong><p>Connect a cloud API key or a local model endpoint. Then set it as the default to use Ask PIOS.</p><button className="button button-secondary button-small" onClick={() => openForm("byok", "OpenAI")}>Connect your first provider</button></div> : <div className="panel ai-connections-list">{providers.map((provider) => <div className="ai-connection-row" key={provider.id}><div className={`ai-provider-avatar ${provider.providerType === "OPENAI_COMPATIBLE" || provider.providerType === "CHATGPT_PLAN" ? "cloud" : "local"}`}><Icon name="brain" size={19}/></div><div className="ai-connection-main"><strong>{provider.displayName} {provider.isDefault && <span className="ai-callout-badge">DEFAULT</span>}</strong><span>{provider.providerType === "CHATGPT_PLAN" ? "CHATGPT PLAN" : provider.providerType.replaceAll("_", " ")} · {provider.modelName}</span>{provider.baseUrl && <small>{provider.baseUrl}</small>}<small>{provider.providerType === "CHATGPT_PLAN" ? "Authorised ChatGPT plan connection" : provider.hasApiKey ? "API key encrypted at rest" : "No API key · local endpoint"}</small></div><span className="ai-demo-status"><i/>{provider.isDefault ? "Default model" : "Saved connection"}</span><div className="provider-row-actions">{!provider.isDefault && <button className="button button-secondary button-small" onClick={() => void chooseDefault(provider.id)}>Set default</button>}<button className="button button-secondary button-small" disabled={testingId === provider.id} onClick={() => void runTest(provider.id)}>{testingId === provider.id ? "Testing…" : "Test"}</button>{provider.providerType !== "CHATGPT_PLAN" && <button className="button button-danger button-small" onClick={() => void remove(provider.id)}>Remove</button>}</div></div>)}</div>}

    <div className="panel ai-routing-panel"><div className="ai-section-title"><div><span className="panel-overline">MODEL CONFIGURATION</span><h2>Default chat model</h2><p>V1 uses one configured default for Ask PIOS. Task-specific routing will be added separately.</p></div><span className="ai-routing-tag"><Icon name="sliders" size={13}/> DEFAULT ROUTE</span></div><div className="ai-default-row"><div><strong>Currently selected</strong><span>{defaultProvider ? `${defaultProvider.displayName} · ${defaultProvider.modelName}` : "No default provider configured"}</span></div>{defaultProvider ? <span className="secure-label"><Icon name="check-circle" size={14}/> Ready to test</span> : <button className="button button-primary button-small" onClick={() => openForm("byok", "OpenAI")}>Connect AI</button>}</div></div>
    <div className="ai-privacy-panel"><div className="ai-privacy-icon"><Icon name="lock" size={18}/></div><div><strong>Provider choice is also a data-sharing choice.</strong><p>When Ask PIOS uses workspace context, relevant note and source excerpts are sent to the selected provider. Choose providers whose data policies fit your needs. For local inference in Docker, use the host bridge endpoint shown in the setup guide.</p></div></div>

    {showDialog && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowDialog(false); }}><div className="modal ai-connect-modal"><div className="modal-header"><div><div className="eyebrow">PIOS AI CONNECT</div><h2>{mode === "local" ? "Connect a local model" : "Connect a cloud provider"}</h2><p>{mode === "local" ? "The PIOS backend must be able to reach this endpoint." : "Your API key will be encrypted by the backend before it is stored."}</p></div><button className="icon-button" onClick={() => setShowDialog(false)} aria-label="Close"><Icon name="x"/></button></div>
      <form onSubmit={save}>
        <div className="form-field"><label>Provider</label><select className="ai-select" value={choiceLabel} onChange={(event) => { const choice = choices.find((item) => item.label === event.target.value); if (!choice) return; setChoiceLabel(choice.label); setDisplayName(choice.label); setModel(choice.defaultModel); setBaseUrl(choice.baseUrl ?? ""); }}>{choices.map((choice) => <option key={choice.label} value={choice.label}>{choice.label}</option>)}</select></div>
        <div className="form-field"><label htmlFor="provider-display-name">Connection name</label><input id="provider-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={120}/></div>
        <div className="form-field"><label htmlFor="provider-model">Model identifier</label><input id="provider-model" value={model} onChange={(event) => setModel(event.target.value)} placeholder="e.g. gpt-4.1-mini or llama3.1:8b" required/><small>Use the exact model ID exposed by your provider or local model server.</small></div>
        {selectedChoice.type === "OPENAI_COMPATIBLE" && <div className="form-field"><label htmlFor="provider-base-url">Base URL</label><input id="provider-base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required placeholder="https://api.openai.com/v1"/><small>For Docker Desktop local models, use <code>http://host.docker.internal:11434/v1</code> for Ollama.</small></div>}
        {selectedChoice.needsKey && <div className="form-field"><label htmlFor="provider-api-key">API key</label><div className="ai-secret-field"><input id="provider-api-key" type={showKey ? "text" : "password"} autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required placeholder="Paste provider API key"/><button type="button" onClick={() => setShowKey((value) => !value)} aria-label="Toggle key visibility"><Icon name={showKey ? "eye-off" : "eye"} size={16}/></button></div><small>The key is sent over the local API connection and encrypted at rest with AES-256-GCM. Do not share screenshots of this field.</small></div>}
        <label className="new-page-toggle"><input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)}/> Set as default AI model</label>
        <div className="modal-note"><Icon name="info" size={14}/><span>Consumer ChatGPT/Claude subscriptions are not automatically API access. Local models work only if the PIOS backend can reach the configured endpoint.</span></div>
        <div className="modal-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={() => setShowDialog(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}><Icon name="shield-check" size={14}/>{saving ? "Saving…" : "Save encrypted connection"}</button></div>
      </form>
    </div></div>}
  </div>;
}
