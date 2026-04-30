"use client";

import { useMemo, useState } from "react";

const encodedMailbox = ["aW5mbw==", "a3liZXJu", "ZGV2"];

function mailbox(): string {
  const [user, domain, tld] = encodedMailbox.map((part) => window.atob(part));
  return `${user}@${domain}.${tld}`;
}

function encodeMailto(value: string): string {
  return encodeURIComponent(value.trim());
}

export default function ContactBox(): React.ReactNode {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("Synesis / Open Lagrange");
  const [message, setMessage] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const draftPreview = useMemo(() => {
    const intro = name.trim() ? `Hi, I am ${name.trim()}.` : "Hi,";
    return `${intro}\n\n${message.trim() || "I would like to talk with Kybern about..."}`;
  }, [message, name]);

  function openDraft(): void {
    const address = mailbox();
    const subject = encodeMailto(`Kybern inquiry: ${topic || "Hello"}`);
    const body = encodeMailto(draftPreview);
    window.location.href = `mailto:${address}?subject=${subject}&body=${body}`;
  }

  async function copyAddress(): Promise<void> {
    const address = mailbox();
    setRevealed(true);
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const address = revealed ? mailbox() : "info [at] kybern [dot] dev";

  return (
    <div className="contactBox">
      <div>
        <p className="eyebrow">Contact</p>
        <h2>Start a conversation</h2>
        <p>
          Share a little context about what you are exploring with Kybern. When you open the draft, your email
          app will launch with the note prepared so you can review and send it.
        </p>
      </div>

      <div className="contactForm" aria-label="Contact Kybern">
        <label>
          <span>Your name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional" />
        </label>
        <label>
          <span>Topic</span>
          <input value={topic} onChange={(event) => setTopic(event.target.value)} />
        </label>
        <label>
          <span>Message</span>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} placeholder="What would you like to discuss?" />
        </label>
        <div className="contactActions">
          <button className="button primary" type="button" onClick={openDraft}>Open email draft</button>
          <button className="button secondary" type="button" onClick={copyAddress}>{copied ? "Copied" : "Copy address"}</button>
        </div>
        <p className="contactAddress">{address}</p>
      </div>
    </div>
  );
}
