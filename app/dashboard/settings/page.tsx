'use client';

export default function SettingsPage() {
  const settings = [
    { key: 'ALLOWED_DOMAIN', label: 'Allowed Email Domain', description: 'Google accounts from this domain can log in' },
    { key: 'MANAGER_EMAILS', label: 'Manager Notification Emails', description: 'Comma-separated emails for remote check-in alerts' },
    { key: 'NEXTAUTH_URL', label: 'Application URL', description: 'Public URL of the deployed application' },
    { key: 'GOOGLE_CLIENT_ID', label: 'Google OAuth Client ID', description: 'From Google Cloud Console OAuth credentials' },
    { key: 'FIREBASE_PROJECT_ID', label: 'Firebase Project ID', description: 'GCP project hosting Firestore' },
    { key: 'GMAIL_USER', label: 'Gmail Sender Account', description: 'Gmail account used for notification emails' },
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-2xl font-display font-black text-near-black">Settings</h1>

      {/* Info banner */}
      <div className="bg-tan/10 border border-tan rounded-lg p-4 text-sm font-body text-near-black">
        <p className="font-display font-bold text-near-black mb-1">Configured via environment variables</p>
        <p className="text-sage">
          Settings are managed through Google Cloud Secret Manager. Update values there and redeploy to apply changes.
        </p>
      </div>

      {/* Current config */}
      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-tan/40">
          <h2 className="font-display font-bold text-near-black">Configuration keys</h2>
        </div>
        <div className="divide-y divide-tan/30">
          {settings.map(setting => (
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

      {/* Instructions */}
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
          <li>
            For{' '}
            <code className="bg-off-white border border-tan px-1.5 py-0.5 rounded text-xs font-mono text-warm-brown">
              MANAGER_EMAILS
            </code>
            , separate multiple addresses with commas
          </li>
        </ol>
      </div>
    </div>
  );
}
