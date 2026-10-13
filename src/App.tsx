import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, CircleAlert, Clock3, Copy, ExternalLink, Globe2, Layers3, Plus, Radar, RefreshCw, ShieldCheck, Sparkles, WalletCards, X } from "lucide-react";
import { connectWallet, createWatch, evaluateWatch, getWallet, getWatch, hasDeployment, webStateAddress, type WatchRecord } from "./lib/webstate";

const explorer = "https://explorer-studio.genlayer.com";

function shorten(value: string, size = 5) {
  return value.length > size * 2 + 2 ? `${value.slice(0, size + 2)}…${value.slice(-size)}` : value;
}

function displayStatus(status: string) {
  if (status === "true") return { label: "Condition true", tone: "positive" };
  if (status === "false") return { label: "Condition false", tone: "negative" };
  if (status === "source_failure") return { label: "Source unavailable", tone: "negative" };
  if (status === "unclear") return { label: "Needs review", tone: "warning" };
  return { label: "Not evaluated", tone: "neutral" };
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

  useEffect(() => {
    getWallet().then(setWallet).catch(() => setWallet(null));
  }, []);

  const deploymentLabel = hasDeployment() ? `StudioNet · ${shorten(webStateAddress)}` : "StudioNet · deployment pending";
  const canSubmit = Boolean(wallet && hasDeployment() && watchId.trim() && url.trim() && condition.trim());
  const result = useMemo(() => loadedWatch ? displayStatus(loadedWatch.status) : null, [loadedWatch]);

  async function handleConnect() {
    try {
      setNotice("");
      setWallet(await connectWallet());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  }

  async function handleCreate() {
    if (!wallet || !canSubmit) return;
    setStatus("working");
    setNotice("Waiting for wallet signature and StudioNet finality…");
    try {
      const hash = await createWatch(wallet, watchId.trim(), url.trim(), condition.trim());
      setLastHash(hash);
      setStatus("success");
      setNotice("Watch committed. Evaluate it when you are ready to ask GenLayer for a consensus-backed observation.");
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
      const hash = await evaluateWatch(wallet, watchId.trim());
      setLastHash(hash);
      const next = await getWatch(watchId.trim());
      setLoadedWatch(next);
      setStatus("success");
      setNotice("Evaluation finalized and read back from the contract.");
    } catch (error) {
      setStatus("error");
      setNotice(error instanceof Error ? error.message : "Evaluation failed.");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="WebState home"><span className="brand-mark"><Radar size={18} /></span><span>webstate</span></a>
        <nav className="nav-links" aria-label="Primary navigation"><a href="#new-watch">New watch</a><a href="#how-it-works">How it works</a><a href="#ledger">Public ledger</a></nav>
        <div className="top-actions"><span className="network-pill"><span className="pulse-dot" />{deploymentLabel}</span><button className="wallet-button" onClick={handleConnect}><WalletCards size={15} />{wallet ? shorten(wallet) : "Connect wallet"}</button></div>
      </header>

      <main id="top">
        <section className="hero section-frame">
          <div className="hero-copy"><div className="eyebrow"><span /> CONSENSUS FOR LIVE WEB STATE</div><h1>Know when the web changed enough to matter.</h1><p className="hero-lede">WebState turns a changing public page into an inspectable, consensus-backed observation your agent or protocol can safely read.</p><div className="hero-actions"><a className="primary-button" href="#new-watch">Create a watch <ArrowUpRight size={16} /></a><a className="text-link" href="#how-it-works">See the mechanism <span>↓</span></a></div></div>
          <div className="hero-signal" aria-label="WebState observation lifecycle"><div className="signal-top"><span className="signal-label">FLOW PREVIEW</span><span className="signal-live"><span className="pulse-dot" /> NOT LIVE</span></div><div className="signal-url"><Globe2 size={18} /><span>status.example.org</span><span className="signal-chip">EXAMPLE</span></div><div className="signal-condition">“The service is operational.”</div><div className="signal-divider" /><div className="signal-result"><div><span className="signal-label">CONSENSUS RESULT</span><strong>Awaiting source</strong></div><Clock3 size={21} /></div><div className="signal-foot"><span>Render → interpret → compare</span><span>Example only</span></div></div>
        </section>

        <section className="workspace section-frame" id="new-watch">
          <div className="section-heading"><div><div className="eyebrow"><span /> OPERATOR WORKSPACE</div><h2>Register a condition to watch.</h2><p>Be precise. The condition is the rule validators will apply to the public source.</p></div><div className="step-marker"><span>01</span><span>02</span><span>03</span></div></div>
          <div className="workspace-grid">
            <div className="form-card"><div className="card-kicker"><Plus size={15} /> NEW WATCH</div><label>Watch ID<input value={watchId} onChange={(event) => setWatchId(event.target.value)} placeholder="service-status" maxLength={100} /></label><label>Public source URL<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://status.example.org" type="url" /></label><label>What should be true?<textarea value={condition} onChange={(event) => setCondition(event.target.value)} placeholder="The page clearly says the service is operational." rows={4} maxLength={1200} /><span className="field-note">Write one observable condition. Page content is treated as untrusted evidence.</span></label><button className="primary-button full" disabled={!canSubmit || status === "working"} onClick={handleCreate}>{status === "working" ? <><RefreshCw size={16} className="spin" /> Waiting for finality…</> : <><ShieldCheck size={16} /> Commit watch to GenLayer</>}</button>{!hasDeployment() && <div className="inline-warning"><CircleAlert size={15} /><span>Contract deployment is not configured yet. The console is read-only until a StudioNet address is supplied.</span></div>}</div>
            <div className="mechanism-card" id="how-it-works"><div className="card-kicker"><Layers3 size={15} /> THE MECHANISM</div><div className="mechanism-list"><div className="mechanism-item"><span className="mechanism-number">01</span><div><strong>Render the source</strong><p>Each validator retrieves the public page independently.</p></div><Globe2 size={17} /></div><div className="mechanism-item"><span className="mechanism-number">02</span><div><strong>Interpret the condition</strong><p>Validators classify the evidence as true, false, unclear, or unavailable.</p></div><Sparkles size={17} /></div><div className="mechanism-item"><span className="mechanism-number">03</span><div><strong>Commit the observation</strong><p>Only the consensus result and page fingerprint become shared state.</p></div><Check size={17} /></div></div><div className="trust-note"><ShieldCheck size={18} /><div><strong>Fail closed by design</strong><p>A missing or changing source never becomes a successful observation.</p></div></div></div>
          </div>
        </section>

        <section className="result-section section-frame" id="ledger"><div className="section-heading compact"><div><div className="eyebrow"><span /> PUBLIC LEDGER</div><h2>Read the committed state.</h2><p>Nothing here is presented as live until the contract says so.</p></div>{watchId && hasDeployment() && <button className="secondary-button" onClick={handleEvaluate} disabled={!wallet || status === "working"}>{status === "working" ? <RefreshCw size={15} className="spin" /> : <Radar size={15} />} Evaluate watch</button>}</div><div className={`result-panel ${result ? `result-${result.tone}` : "result-empty"}`}>{loadedWatch && result ? <><div className="result-status"><span className="status-icon">{result.tone === "positive" ? <Check size={20} /> : result.tone === "negative" ? <X size={20} /> : <CircleAlert size={20} />}</span><div><span className="signal-label">WATCH {loadedWatch.watch_id}</span><strong>{result.label}</strong></div><span className="revision">REV {String(loadedWatch.revision)}</span></div><div className="result-body"><p>{loadedWatch.summary}</p><span>{loadedWatch.rationale}</span></div><div className="result-meta"><span>Fingerprint <b>{shorten(loadedWatch.page_fingerprint, 10)}</b></span><span>{String(loadedWatch.evaluation_count)} evaluation{Number(loadedWatch.evaluation_count) === 1 ? "" : "s"}</span></div></> : <div className="empty-result"><div className="empty-orbit"><Radar size={22} /></div><strong>No committed observation yet.</strong><p>Create a watch, then evaluate it. The result will appear here only after the finalized contract readback.</p></div>}</div>{notice && <div className={`notice notice-${status}`}><span>{status === "error" ? <CircleAlert size={15} /> : <Check size={15} />}</span><span>{notice}</span>{lastHash && <a href={`${explorer}/tx/${lastHash}`} target="_blank" rel="noreferrer">View transaction <ExternalLink size={13} /></a>}</div>}</section>
      </main>

      <footer className="footer section-frame"><span><span className="brand-mark small"><Radar size={13} /></span> webstate / built for public truth that moves</span><span>GenLayer StudioNet · source-first · inspectable</span></footer>
    </div>
  );
}
