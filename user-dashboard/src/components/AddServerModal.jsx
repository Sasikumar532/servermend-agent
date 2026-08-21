import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { createServer } from "../api/servers";
import { CopyButton } from "./CopyButton";
import { Modal } from "./Modal";

export function AddServerModal({ onClose, onCreated }) {
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // { serverId, apiKey } once created — the backend returns apiKey exactly
  // once (it's stored as a hash server-side, see routes/servers.js), so
  // this is the only chance to show it. Never re-fetchable.
  const [created, setCreated] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await createServer(hostname.trim() || undefined);
      setCreated(result);
      onCreated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to register server.");
    } finally {
      setSubmitting(false);
    }
  }

  const installCommand = created
    ? `servermend-agent \\\n  --server-id ${created.serverId} \\\n  --backend-url <your-backend-url> \\\n  --api-key ${created.apiKey}`
    : "";

  return (
    <Modal title={created ? "Server registered" : "Add a server"} onClose={onClose}>
      {created ? (
        <div className="key-reveal">
          <p className="key-reveal-warning">
            This API key is shown once and cannot be retrieved again. Copy it now — the agent needs it to
            authenticate.
          </p>
          <dl className="key-reveal-fields">
            <dt>Server ID</dt>
            <dd>
              <code>{created.serverId}</code>
              <CopyButton text={created.serverId} label="Copy server ID" />
            </dd>
            <dt>API key</dt>
            <dd>
              <code>{created.apiKey}</code>
              <CopyButton text={created.apiKey} label="Copy API key" />
            </dd>
          </dl>
          <div className="key-reveal-install-wrap">
            <pre className="key-reveal-install">{installCommand}</pre>
            <CopyButton text={installCommand} label="Copy install command" />
          </div>
          <div className="modal-actions">
            <Link to={`/servers/${created.serverId}`} className="button-link" onClick={onClose}>
              Go to server detail &rarr;
            </Link>
            <button type="button" className="button-ghost" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form className="inline-form" onSubmit={handleSubmit}>
          {error && <p className="form-error">{error}</p>}
          <label>
            Hostname <span className="optional-label">(optional, for display only)</span>
            <input
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="web-1.example.com"
              autoFocus
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? "Registering…" : "Register server"}
          </button>
        </form>
      )}
    </Modal>
  );
}
