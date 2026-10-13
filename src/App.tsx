import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Globe2,
  Link2,
  Plus,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import {
  connectWallet,
  createWatch,
  evaluateWatch,
  getWallet,
  getWatch,
  hasDeployment,
  switchToStudioNet,
  webStateAddress,
  type WatchRecord,
} from "./lib/webstate";

const explorer = "https://explorer-studio.genlayer.com";
const LAST_WATCH_KEY = "webstate:last-watch";

type WatchDraft = {
  watchId: string;
  url: string;
  condition: string;
};

type WatchTemplate = WatchDraft & {
  label: string;
  description: string;
};

const WATCH_TEMPLATES: WatchTemplate[] = [
  {
    label: "Service health",
    description: "Gate an agent action on a status page.",
    watchId: "service-health",
    url: "https://status.example.org",
    condition: "The page clearly says the service is operational.",
  },
  {
    label: "Governance approval",
    description: "Read an approval before execution.",
    watchId: "governance-approval",
    url: "https://governance.example.org/proposal/123",
    condition: "The proposal page clearly shows that the proposal is approved.",
  },
  {
    label: "Bridge readiness",
    description: "Check a public readiness signal.",
    watchId: "bridge-readiness",
    url: "https://status.example.org/bridge",
    condition: "The page clearly states that deposits are enabled.",
  },
];

function readLastWatch(): WatchDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LAST_WATCH_KEY) || "null") as Partial<WatchDraft> | null;
    if (!parsed || typeof parsed.watchId !== "string" || typeof parsed.url !== "string" || typeof parsed.condition !== "string") return null;
    if (!parsed.watchId.trim() || !parsed.url.trim() || !parsed.condition.trim()) return null;
    return { watchId: parsed.watchId, url: parsed.url, condition: parsed.condition };
  } catch {
    return null;
  }
}

function rememberWatch(draft: WatchDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_WATCH_KEY, JSON.stringify(draft));
  } catch {
    // Storage is optional; the contract remains the source of truth.
  }
}

function shorten(value: string, size = 5) {
  return value.length > size * 2 + 2 ? `${value.slice(0, size + 2)}…${value.slice(-size)}` : value;
}

function displayStatus(status: string) {
  if (status === "true") return { label: "Condition met", tone: "positive" };
  if (status === "false") return { label: "Condition not met", tone: "negative" };
  if (status === "source_failure") return { label: "Source unavailable", tone: "negative" };
  if (status === "unclear") return { label: "Needs review", tone: "warning" };
  return { label: "Awaiting evaluation", tone: "neutral" };
}

function StepNumber({ children }: { children: string }) {
  return <span className="step-number">{children}</span>;
}

export default function App() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [watchId, setWatchId] = useState("");
  const [url, setUrl] = useState("");
  const [condition, setCondition] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">("idle");
  const [notice, setNotice] = useState("");
  const [lastHash, setLastHash] = useState("");
  const [loadedWatch, setLoadedWatch] = useState<WatchRecord | null>(null);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getWallet().then((account) => {
      if (!cancelled) setWallet(account);
    }).catch(() => {
      if (!cancelled) setWallet(null);
    });

    const requestedWatchId = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("watch")?.trim()
      : null;
    const draft = readLastWatch();
    const watchToLoad = requestedWatchId || draft?.watchId;
    if (!watchToLoad) {
      setHydrating(false);
      return () => { cancelled = true; };
    }

    setWatchId(watchToLoad);
    if (draft && !requestedWatchId) {
      setUrl(draft.url);
      setCondition(draft.condition);
    }
    getWatch(watchToLoad).then((record) => {
      if (cancelled) return;
      setUrl(record.url);
      setCondition(record.condition);
      rememberWatch({ watchId: record.watch_id, url: record.url, condition: record.condition });
      setLoadedWatch(record);
      setStatus("success");
      setNotice("Loaded the committed watch from StudioNet.");
    }).catch(() => {
      if (cancelled) return;
      setStatus("error");
      setNotice("The saved watch could not be read from StudioNet. Retry when the network is available.");
    }).finally(() => {
      if (!cancelled) setHydrating(false);
    });

    return () => { cancelled = true; };
  }, []);

  const deploymentLabel = hasDeployment() ? `StudioNet · ${shorten(webStateAddress)}` : "StudioNet · deployment pending";
  const canSubmit = Boolean(wallet && hasDeployment() && watchId.trim() && url.trim() && condition.trim());
  const result = useMemo(() => loadedWatch ? displayStatus(loadedWatch.status) : null, [loadedWatch]);
  const isEvaluated = Boolean(loadedWatch && Number(loadedWatch.evaluation_count) > 0);

  function publicWatchUrl(id: string) {
    if (typeof window === "undefined") return `/?watch=${encodeURIComponent(id)}#ledger`;
    return `${window.location.origin}/?watch=${encodeURIComponent(id)}#ledger`;
  }

  function applyTemplate(template: WatchTemplate) {
    setWatchId(template.watchId);
    setUrl(template.url);
    setCondition(template.condition);
    setLoadedWatch(null);
    setNotice(`${template.label} template loaded. Replace the example URL before committing.`);
    setStatus("idle");
    document.getElementById("watch-url")?.focus();
  }

  async function handleCopyLink() {
    if (!loadedWatch) return;
    try {
      await navigator.clipboard.writeText(publicWatchUrl(loadedWatch.watch_id));
      setStatus("success");
      setNotice("Public watch link copied to the clipboard.");
    } catch {
      setStatus("error");
      setNotice("The link could not be copied. Use the browser address bar to share this watch.");
    }
  }

  async function handleConnect() {
    try {
      setNotice("");
      const account = await connectWallet();
      await switchToStudioNet();
      setWallet(account);
      setStatus("success");
      setNotice("Wallet connected to StudioNet.");
    } catch (error) {
      setStatus("error");
      setNotice(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  }

  async function handleCreate() {
    if (!wallet || !canSubmit) return;
    setStatus("working");
    setNotice("Waiting for wallet signature and StudioNet finality…");
    try {
      await switchToStudioNet();
      const hash = await createWatch(wallet, watchId.trim(), url.trim(), condition.trim());
      setLastHash(hash);
      const draft = { watchId: watchId.trim(), url: url.trim(), condition: condition.trim() };
      rememberWatch(draft);
      try {
        const next = await getWatch(draft.watchId);
        setLoadedWatch(next);
        setStatus("success");
        setNotice("Watch committed and read back from StudioNet. Evaluate it when you are ready.");
      } catch {
        setStatus("error");
        setNotice("Watch committed, but StudioNet readback failed. Refresh or retry the read.");
      }
    } catch (error) {
      setStatus("error");
      setNotice(error instanceof Error ? error.message : "The watch could not be committed.");
    }
  }

  async function handleEvaluate() {
    if (!wallet || !watchId.trim() || !hasDeployment()) return;
    setStatus("working");
    setNotice("Validators are independently rendering the source and comparing the committed result…");
    try {
      await switchToStudioNet();
      const hash = await evaluateWatch(wallet, watchId.trim());
      setLastHash(hash);
      const next = await getWatch(watchId.trim());
      rememberWatch({ watchId: watchId.trim(), url: url.trim(), condition: condition.trim() });
      setLoadedWatch(next);
      setStatus("success");
      setNotice("Evaluation finalized and read back from the contract.");
    } catch (error) {
      setStatus("error");
      setNotice(error instanceof Error ? error.message : "Evaluation failed.");
    }
  }

  function clearLoadedIfChanged(next: string, field: "id" | "details") {
    if (!loadedWatch) return;
    if (field === "id" && next.trim() !== loadedWatch.watch_id) setLoadedWatch(null);
    if (field === "details") setLoadedWatch(null);
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#top" aria-label="WebState home"><span className="brand-mark"><Radar size={17} /></span><span>webstate</span></a>
          <nav className="nav-links" aria-label="Primary navigation"><a href="#new-watch">Create watch</a><a href="#how-it-works">How it works</a><a href="#ledger">Ledger</a></nav>
          <div className="header-actions"><span className="network-status"><span className="status-dot" />{deploymentLabel}</span><button className="wallet-button" type="button" onClick={handleConnect}><WalletCards size={15} />{wallet ? shorten(wallet) : "Connect wallet"}</button></div>
        </div>
      </header>

      <main id="top">
        <section className="hero section-frame">
          <div className="hero-copy"><div className="eyebrow"><span /> CONSENSUS FOR CHANGING WEB STATE</div><h1>Turn public web changes into state you can act on.</h1><p className="hero-lede">WebState lets operators define a precise condition on a public page, then gives agents and protocols a finalized observation they can safely read.</p><div className="hero-actions"><a className="primary-button" href="#new-watch">Create a watch <ArrowUpRight size={16} /></a><a className="text-link" href="#how-it-works">Understand the model <span>↓</span></a></div><div className="hero-proof"><span className="proof-rule" /><span>Public source</span><span>Independent validators</span><span>Finalized state</span></div></div>
          <div className="hero-panel" aria-label="WebState trust model"><div className="panel-header"><span>THE TRUST MODEL</span><span className="panel-index">01 — 03</span></div><div className="trust-flow"><div className="flow-line" /><div className="flow-step"><span className="flow-icon"><Globe2 size={17} /></span><div><strong>Source</strong><span>Public page or endpoint</span></div></div><div className="flow-step"><span className="flow-icon"><Sparkles size={17} /></span><div><strong>Consensus</strong><span>Validators compare evidence</span></div></div><div className="flow-step"><span className="flow-icon active"><Check size={17} /></span><div><strong>State</strong><span>One inspectable result</span></div></div></div><div className="panel-footer"><span>Read-only until a result is finalized.</span><Link2 size={15} /></div></div>
        </section>

        <section className="proof-strip section-frame" aria-label="Product principles"><div><span className="strip-number">01</span><strong>Define</strong><span>one observable condition</span></div><div><span className="strip-number">02</span><strong>Evaluate</strong><span>with GenLayer consensus</span></div><div><span className="strip-number">03</span><strong>Read</strong><span>the committed outcome</span></div></section>

        <section className="workspace section-frame" id="new-watch">
          <div className="section-heading"><div><div className="eyebrow"><span /> OPERATOR WORKSPACE</div><h2>Start with a condition worth checking.</h2><p>Make the claim narrow enough that independent validators can reach the same conclusion.</p></div><span className="section-tag">01 / CREATE</span></div>
          <div className="workspace-grid">
            <div className="form-card"><div className="card-kicker"><Plus size={15} /> REGISTER A WATCH</div><div className="template-picker"><div><span className="template-label">START FROM A TEMPLATE</span><p>Use a proven shape, then replace the example source.</p></div><div className="template-list">{WATCH_TEMPLATES.map((template) => <button className="template-button" type="button" key={template.label} onClick={() => applyTemplate(template)}><span>{template.label}</span><small>{template.description}</small></button>)}</div></div><label htmlFor="watch-id"><span>Watch ID</span><input id="watch-id" value={watchId} onChange={(event) => { setWatchId(event.target.value); clearLoadedIfChanged(event.target.value, "id"); }} placeholder="service-status" maxLength={100} /></label><label htmlFor="watch-url"><span>Public source URL</span><input id="watch-url" value={url} onChange={(event) => { setUrl(event.target.value); clearLoadedIfChanged(event.target.value, "details"); }} placeholder="https://status.example.org" type="url" /></label><label htmlFor="watch-condition"><span>What should be true?</span><textarea id="watch-condition" value={condition} onChange={(event) => { setCondition(event.target.value); clearLoadedIfChanged(event.target.value, "details"); }} placeholder="The page clearly says the service is operational." rows={4} maxLength={1200} /><small>Write one observable condition. Page content is treated as untrusted evidence.</small></label><button className="primary-button full" type="button" disabled={!canSubmit || status === "working" || hydrating} onClick={handleCreate}>{status === "working" ? <><RefreshCw size={16} className="spin" /> Waiting for finality…</> : hydrating ? <><RefreshCw size={16} className="spin" /> Loading committed state…</> : <><ShieldCheck size={16} /> Commit watch to GenLayer</>}</button>{!hasDeployment() && <div className="inline-warning"><CircleAlert size={15} /><span>Contract deployment is not configured. The console is read-only until a StudioNet address is supplied.</span></div>}</div>
            <div className="mechanism-card" id="how-it-works"><div className="card-kicker"><Radar size={15} /> WHAT GETS COMMITTED</div><div className="mechanism-intro">A watch is not a notification. It is a durable claim about a source, with the evidence trail needed to inspect the decision later.</div><ol className="mechanism-list"><li><StepNumber>01</StepNumber><div><strong>Render the source</strong><p>Validators retrieve the same public page independently.</p></div></li><li><StepNumber>02</StepNumber><div><strong>Interpret the condition</strong><p>Each validator classifies the evidence as true, false, unclear, or unavailable.</p></div></li><li><StepNumber>03</StepNumber><div><strong>Commit the observation</strong><p>Consensus stores the result, fingerprint, rationale, and revision onchain.</p></div></li></ol><div className="trust-note"><ShieldCheck size={18} /><div><strong>Fail closed by design</strong><p>A missing or changing source never becomes a successful observation.</p></div></div></div>
          </div>
        </section>

        <section className="ledger section-frame" id="ledger"><div className="section-heading ledger-heading"><div><div className="eyebrow"><span /> PUBLIC LEDGER</div><h2>Read the state that made it through.</h2><p>Every value below comes from the deployed contract after finalization.</p></div><div className="ledger-actions">{loadedWatch && <><span className="read-only-tag"><span className="status-dot" /> CONTRACT READBACK</span><button className="secondary-button" type="button" onClick={handleCopyLink}><Copy size={15} /> Share watch</button></>}{watchId && hasDeployment() && <button className="secondary-button" type="button" onClick={handleEvaluate} disabled={!wallet || status === "working"}>{status === "working" ? <RefreshCw size={15} className="spin" /> : <Radar size={15} />} Evaluate watch</button>}</div></div><div className={`result-panel ${result ? `result-${result.tone}` : "result-empty"}`}>{loadedWatch && result ? <><div className="result-status"><span className="status-icon">{result.tone === "positive" ? <Check size={20} /> : result.tone === "negative" ? <X size={20} /> : <CircleAlert size={20} />}</span><div><span className="signal-label">WATCH / {loadedWatch.watch_id}</span><strong>{result.label}</strong></div><span className="revision">REV {String(loadedWatch.revision)}</span></div><div className="result-body"><div><span className="result-label">SUMMARY</span><p>{loadedWatch.summary || "The watch is registered and waiting for its first evaluation."}</p></div><div><span className="result-label">VALIDATOR NOTE</span><p className="muted-copy">{loadedWatch.rationale || "No validator rationale has been committed yet."}</p></div></div><div className="result-meta"><span>Fingerprint <b>{shorten(loadedWatch.page_fingerprint, 10)}</b></span><span>{String(loadedWatch.evaluation_count)} evaluation{Number(loadedWatch.evaluation_count) === 1 ? "" : "s"}</span><span>{isEvaluated ? "Finalized observation" : "Registered watch"}</span></div></> : <div className="empty-result"><div className="empty-orbit"><Radar size={22} /></div><div><span className="result-label">NO WATCH LOADED</span><strong>Your committed state will appear here.</strong><p>Create a watch, then evaluate it. After refresh, WebState reads the last committed watch back from StudioNet.</p></div></div>}</div>{notice && <div className={`notice notice-${status}`} role="status" aria-live="polite"><span>{status === "error" ? <CircleAlert size={15} /> : <Check size={15} />}</span><span>{notice}</span>{lastHash && <a href={`${explorer}/tx/${lastHash}`} target="_blank" rel="noreferrer">View transaction <ExternalLink size={13} /></a>}</div>}</section>
      </main>

      <footer className="footer section-frame"><span><span className="brand-mark small"><Radar size={13} /></span> webstate / inspectable state for a changing web</span><span><Copy size={12} /> GenLayer StudioNet · {shorten(webStateAddress, 7)}</span></footer>
    </div>
  );
}
