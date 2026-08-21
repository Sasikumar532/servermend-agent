import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Input, Label, Modal, TextField } from "@heroui/react";
import { ApiError } from "../api/client";
import { createServer } from "../api/servers";
import { CopyButton } from "./CopyButton";

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
    <Modal>
      <Modal.Backdrop isOpen onOpenChange={(open) => !open && onClose()}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-190">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{created ? "Server registered" : "Add a server"}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {created ? (
                <div className="flex flex-col gap-4">
                  <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                    This API key is shown once and cannot be retrieved again. Copy it now — the agent needs it to
                    authenticate.
                  </p>
                  <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted">Server ID</dt>
                    <dd className="flex items-center gap-2">
                      <code className="min-w-0 break-all rounded bg-background px-1.5 py-0.5">
                        {created.serverId}
                      </code>
                      <CopyButton text={created.serverId} label="Copy server ID" />
                    </dd>
                    <dt className="text-muted">API key</dt>
                    <dd className="flex items-center gap-2">
                      <code className="min-w-0 break-all rounded bg-background px-1.5 py-0.5">
                        {created.apiKey}
                      </code>
                      <CopyButton text={created.apiKey} label="Copy API key" />
                    </dd>
                  </dl>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 pr-28 text-[13px]">
                      {installCommand}
                    </pre>
                    <div className="absolute top-2 right-2">
                      <CopyButton text={installCommand} label="Copy install command" />
                    </div>
                  </div>
                </div>
              ) : (
                <form id="add-server-form" className="flex flex-col gap-4" onSubmit={handleSubmit}>
                  {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
                  <TextField value={hostname} onChange={setHostname} name="hostname">
                    <Label>
                      Hostname <span className="text-xs text-muted">(optional, for display only)</span>
                    </Label>
                    <Input placeholder="web-1.example.com" autoFocus />
                  </TextField>
                </form>
              )}
            </Modal.Body>
            <Modal.Footer className="justify-end">
              {created ? (
                <>
                  <Link
                    to={`/servers/${created.serverId}`}
                    onClick={onClose}
                    className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-default"
                  >
                    Go to server detail &rarr;
                  </Link>
                  <Button variant="ghost" onPress={onClose}>
                    Done
                  </Button>
                </>
              ) : (
                <Button type="submit" form="add-server-form" isDisabled={submitting}>
                  {submitting ? "Registering…" : "Register server"}
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
