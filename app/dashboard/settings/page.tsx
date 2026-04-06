'use client';

import { useState, useEffect, useRef } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-near-black text-off-white
                    text-sm font-display font-bold rounded-lg shadow-xl animate-fade-in">
      {message}
    </div>
  );
}

export default function SettingsPage() {
  const configKeys = [
    { key: 'ALLOWED_DOMAIN',    label: 'Allowed Email Domain',       description: 'Google accounts from this domain can log in' },
    { key: 'NEXTAUTH_URL',      label: 'Application URL',             description: 'Public URL of the deployed application' },
    { key: 'GOOGLE_CLIENT_ID',  label: 'Google OAuth Client ID',      description: 'From Google Cloud Console OAuth credentials' },
    { key: 'FIREBASE_PROJECT_ID', label: 'Firebase Project ID',       description: 'GCP project hosting Firestore' },
    { key: 'GMAIL_USER',        label: 'Gmail Sender Account',        description: 'Gmail account used for notification emails' },
    { key: 'MANAGER_EMAILS',    label: 'Manager Emails (env fallback)', description: 'Used when no emails are saved in Firestore' },
  ];

  // ── Notification email state ─────────────────────────────────────────────
  const [emails, setEmails] = useState<string[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/settings/notifications')
      .then(r => r.json())
      .then(d => {
        setEmails(d.managerEmails ?? []);
        setLoadingEmails(false);
      });
  }, []);

  function addEmail() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (emails.includes(trimmed)) {
      setEmailError('This email is already in the list.');
      return;
    }
    setEmails(prev => [...prev, trimmed]);
    setNewEmail('');
    setEmailError('');
    inputRef.current?.focus();
  }

  function removeEmail(email: string) {
    setEmails(prev => prev.filter(e => e !== email));
  }

  async function saveEmails() {
    setSaving(true);
    const res = await fetch('/api/settings/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerEmails: emails }),
    });
    setSaving(false);
    if (res.ok) {
      setToast('Notification emails saved.');
    } else {
      setToast('Save failed — please try again.');
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-display font-black text-near-black">Settings</h1>

      {/* ── Notification Emails ─────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-tan/40">
          <h2 className="font-display font-bold text-near-black">Notification emails</h2>
          <p className="text-xs text-sage font-body mt-0.5">
            Recipients for remote check-in approvals and long-shift alerts.
            Overrides the <code className="font-mono text-warm-brown">MANAGER_EMAILS</code> env var.
          </p>
        </div>

        <div className="px-4 py-4 space-y-3">
          {loadingEmails ? (
            <div className="flex items-center gap-2 py-2">
              <div className="w-4 h-4 border-2 border-warm-brown border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-sage font-body">Loading…</span>
            </div>
          ) : (
            <>
              {/* Current email list */}
              {emails.length === 0 ? (
                <p className="text-sm text-sage font-body py-1">
                  No emails saved — falling back to <code className="font-mono text-warm-brown">MANAGER_EMAILS</code>.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {emails.map(email => (
                    <li key={email}
                      className="flex items-center justify-between bg-off-white border border-tan
                                 rounded-lg px-3 py-2"
                    >
                      <span className="text-sm font-mono text-near-black">{email}</span>
                      <button
                        onClick={() => removeEmail(email)}
                        className="text-sage hover:text-red-600 transition-colors ml-3 flex-shrink-0"
                        aria-label={`Remove ${email}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Add email */}
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="email"
                    placeholder="name@example.com"
                    value={newEmail}
                    onChange={e => { setNewEmail(e.target.value); setEmailError(''); }}
                    onKeyDown={e => e.key === 'Enter' && addEmail()}
                    className="flex-1 bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                               focus:outline-none focus:ring-2 focus:ring-warm-brown"
                  />
                  <button
                    onClick={addEmail}
                    className="px-4 py-2 bg-near-black text-off-white text-sm font-display font-bold
                               rounded-lg hover:opacity-90 transition-opacity flex-shrink-0"
                  >
                    Add
                  </button>
                </div>
                {emailError && (
                  <p className="text-xs text-red-600 font-body">{emailError}</p>
                )}
              </div>

              {/* Save */}
              <div className="pt-1">
                <button
                  onClick={saveEmails}
                  disabled={saving}
                  className="bg-warm-brown text-off-white px-5 py-2 rounded-lg text-sm font-display
                             font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Environment variables reference ─────────────────────────────── */}
      <div className="bg-tan/10 border border-tan rounded-lg p-4 text-sm font-body text-near-black">
        <p className="font-display font-bold text-near-black mb-1">Other settings use environment variables</p>
        <p className="text-sage">
          Update values in Google Cloud Secret Manager and redeploy to apply changes.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-tan/40">
          <h2 className="font-display font-bold text-near-black">Configuration keys</h2>
        </div>
        <div className="divide-y divide-tan/30">
          {configKeys.map(setting => (
            <div key={setting.key} className="px-4 py-3 flex justify-between items-start gap-4">
              <div>
                <p className="font-display font-bold text-near-black text-sm">{setting.label}</p>
                <p className="text-xs text-sage font-body mt-0.5">{setting.description}</p>
              </div>
              <code className="text-xs bg-off-white text-warm-brown border border-tan px-2 py-1 rounded font-mono flex-shrink-0">
                {setting.key}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-tan shadow-card p-5">
        <h2 className="font-display font-bold text-near-black mb-3">How to update</h2>
        <ol className="text-sm font-body text-near-black space-y-2 list-decimal list-inside">
          <li>Update secrets in Google Cloud Secret Manager</li>
          <li>
            Update{' '}
            <code className="bg-off-white border border-tan px-1.5 py-0.5 rounded text-xs font-mono text-warm-brown">
              .env.local
            </code>{' '}
            for local development
          </li>
          <li>Trigger a new Cloud Build deployment to apply changes</li>
        </ol>
      </div>

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}
