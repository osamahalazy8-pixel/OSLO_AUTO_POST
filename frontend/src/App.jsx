import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowUpRight, CalendarClock, Check, CheckCircle2, Clock3,
  FileImage, LoaderCircle, Plus, Send, Settings2, Trash2, UploadCloud
} from 'lucide-react';
import { api, formatBytes, formatDate } from './api.js';

const platformNames = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  tiktok: 'TikTok'
};

const emptyDraft = { caption: '', selected: [], schedule: '' };

function localDateTimeValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

async function readDimensions(file) {
  if (file.type.startsWith('image/')) {
    const image = await createImageBitmap(file);
    const dimensions = { width: image.width, height: image.height };
    image.close();
    return dimensions;
  }
  if (file.type.startsWith('video/')) {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          URL.revokeObjectURL(url);
          resolve({ width: video.videoWidth, height: video.videoHeight });
        };
        video.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Could not read video dimensions.'));
        };
        video.src = url;
      });
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
  return { width: null, height: null };
}

function App() {
  const [section, setSection] = useState('dashboard');
  const [accounts, setAccounts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [limits, setLimits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setError('');
    try {
      const [accountData, postData, platformData] = await Promise.all([
        api('/api/accounts'),
        api('/api/posts'),
        api('/api/platforms')
      ]);
      setAccounts(accountData);
      setPosts(postData);
      setLimits(platformData);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const connected = useMemo(() => new Set(accounts.map((account) => account.platform)), [accounts]);
  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4500);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => setSection('dashboard')}>
          <span className="brand-mark">O</span>
          <span>OSLO<span className="brand-light">AUTO POST</span></span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="nav-menu">
          <button className={section === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('dashboard')}>
            <CalendarClock size={18} /> Overview
          </button>
          <button className={section === 'compose' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('compose')}>
            <Plus size={18} /> Create post
          </button>
          <button className={section === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('settings')}>
            <Settings2 size={18} /> Connections
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          <span>Private workspace</span>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="eyebrow">SOCIAL PUBLISHING</div>
            <h1>{section === 'settings' ? 'Platform connections' : section === 'compose' ? 'Create a post' : 'Publishing overview'}</h1>
          </div>
          <div className="topbar-right">
            <span className="connected-count"><span className="status-dot" /> {connected.size} connected</span>
            <button className="button button-primary button-small" onClick={() => setSection('compose')}>
              <Plus size={16} /> New post
            </button>
          </div>
        </header>

        {error && <div className="alert alert-error"><AlertCircle size={18} /> {error}</div>}
        {notice && <div className="toast"><CheckCircle2 size={17} /> {notice}</div>}
        {loading ? (
          <div className="loading"><LoaderCircle className="spin" /> Loading workspace…</div>
        ) : section === 'settings' ? (
          <Connections accounts={accounts} onChange={loadData} onNotice={showNotice} />
        ) : section === 'compose' ? (
          <Compose accounts={accounts} limits={limits} onOpenSettings={() => setSection('settings')} onCreated={async () => {
            await loadData();
            setSection('dashboard');
            showNotice('Your post was added to the schedule.');
          }} />
        ) : (
          <Dashboard posts={posts} accounts={accounts} onCreate={() => setSection('compose')} onDelete={async (id) => {
            if (!window.confirm('Delete this scheduled post?')) return;
            try {
              await api(`/api/posts/${id}`, { method: 'DELETE' });
              await loadData();
              showNotice('Post deleted.');
            } catch (deleteError) {
              setError(deleteError.message);
            }
          }} />
        )}
        <footer className="page-footer">
          <span>OSLO AUTO POST <span className="footer-muted">· Personal publishing workspace</span></span>
          <a href="https://developers.facebook.com/docs/" target="_blank" rel="noreferrer">Platform API requirements <ArrowUpRight size={13} /></a>
        </footer>
      </main>
    </div>
  );
}

function Dashboard({ posts, accounts, onCreate, onDelete }) {
  const pending = posts.filter((post) => post.status === 'scheduled').length;
  const published = posts.filter((post) => post.status === 'published').length;
  const failed = posts.filter((post) => post.status === 'failed').length;

  return (
    <div className="page-content">
      <section className="welcome-card">
        <div className="welcome-copy">
          <span className="welcome-kicker">YOUR SOCIAL WORKSPACE</span>
          <h2>Plan once. Publish everywhere.</h2>
          <p>Compose content, choose your connected platforms, and let the scheduler handle the rest.</p>
          <button className="button button-dark" onClick={onCreate}><Plus size={17} /> Compose a post</button>
        </div>
        <div className="welcome-art"><Send size={45} strokeWidth={1.4} /></div>
      </section>

      <section className="stats-grid">
        <StatCard label="Connected platforms" value={accounts.length} detail="Ready for publishing" icon={<CheckCircle2 />} />
        <StatCard label="Scheduled" value={pending} detail="Waiting to publish" icon={<Clock3 />} />
        <StatCard label="Published" value={published} detail="Successfully delivered" icon={<Check />} />
        <StatCard label="Needs attention" value={failed} detail="Failed deliveries" icon={<AlertCircle />} />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div><span className="eyebrow">CONTENT QUEUE</span><h2>Recent posts</h2></div>
          <button className="button button-secondary button-small" onClick={onCreate}><Plus size={15} /> Create post</button>
        </div>
        {posts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><FileImage size={23} /></div>
            <h3>Your queue is clear</h3>
            <p>Create your first post and choose when it should go live.</p>
            <button className="button button-primary" onClick={onCreate}>Create your first post</button>
          </div>
        ) : (
          <div className="post-list">
            {posts.map((post) => (
              <article className="post-row" key={post.id}>
                <div className="post-date">
                  <span>{new Date(post.scheduled_at).toLocaleDateString(undefined, { month: 'short' })}</span>
                  <strong>{new Date(post.scheduled_at).getDate()}</strong>
                </div>
                <div className="post-main">
                  <p>{post.caption || <span className="muted">No caption</span>}</p>
                  <span className="post-subtitle">{formatDate(post.scheduled_at)}{post.media_mime_type ? ` · ${post.media_mime_type.startsWith('video/') ? 'Video' : 'Image'}` : ''}</span>
                  <div className="delivery-tags">
                    {(post.post_deliveries || []).map((delivery) => (
                      <span className={`platform-tag ${delivery.status}`} key={delivery.id}>
                        {platformNames[delivery.platform]} · {delivery.status}
                      </span>
                    ))}
                  </div>
                  {(post.post_deliveries || []).some((delivery) => delivery.error_message) &&
                    <div className="delivery-error">{post.post_deliveries.find((delivery) => delivery.error_message)?.error_message}</div>}
                </div>
                <div className={`status-pill ${post.status}`}>{post.status}</div>
                {['scheduled', 'failed'].includes(post.status) &&
                  !(post.post_deliveries || []).some((delivery) => ['published', 'publishing'].includes(delivery.status)) &&
                  <button className="icon-button danger" aria-label="Delete post" title="Delete post" onClick={() => onDelete(post.id)}><Trash2 size={16} /></button>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, detail, icon }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><small>{detail}</small></article>;
}

function Compose({ accounts, limits, onOpenSettings, onCreated }) {
  const [draft, setDraft] = useState({ ...emptyDraft, schedule: localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)) });
  const [file, setFile] = useState(null);
  const [mediaInfo, setMediaInfo] = useState(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const accountPlatforms = new Set(accounts.map((account) => account.platform));
  const selectedLimits = limits.filter((item) => draft.selected.includes(item.id));
  const violations = [];

  for (const item of selectedLimits) {
    if (draft.caption.length > item.caption) violations.push(`${item.label}: caption limit is ${item.caption} characters.`);
    if (item.needsMedia && !file) violations.push(`${item.label} requires a media file.`);
    if (!file) continue;
    if (file.size > item.maxUploadBytes) violations.push(`Media exceeds this deployment's ${formatBytes(item.maxUploadBytes)} upload limit.`);
    const types = [...item.imageMimeTypes, ...item.videoMimeTypes];
    if (!types.includes(file.type)) violations.push(`${item.label} does not support ${file.type || 'this file type'}.`);
    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? item.maxVideoBytes : item.maxImageBytes;
    if (maxSize && file.size > maxSize) violations.push(`${item.label}: maximum file size is ${formatBytes(maxSize)}.`);
    if (item.id === 'instagram' && !isVideo && mediaInfo) {
      if (mediaInfo.width < item.imageMinWidth || mediaInfo.width > item.imageMaxWidth) {
        violations.push('Instagram image width must be between 320 and 1440 pixels.');
      }
      const ratio = mediaInfo.width / mediaInfo.height;
      if (ratio < item.imageMinRatio || ratio > item.imageMaxRatio) {
        violations.push('Instagram image aspect ratio must be between 4:5 and 1.91:1.');
      }
    }
  }

  const togglePlatform = (platform) => setDraft((current) => ({
    ...current,
    selected: current.selected.includes(platform)
      ? current.selected.filter((item) => item !== platform)
      : [...current.selected, platform]
  }));

  const onFile = async (nextFile) => {
    setError('');
    setFile(nextFile || null);
    setMediaInfo(null);
    if (!nextFile) return;
    setValidating(true);
    try {
      const dimensions = await readDimensions(nextFile);
      setMediaInfo({ ...dimensions, mimeType: nextFile.type, size: nextFile.size });
    } catch (dimensionError) {
      setError(dimensionError.message);
      setFile(null);
    } finally {
      setValidating(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!draft.selected.length) return setError('Select at least one connected platform.');
    if (violations.length) return setError(violations[0]);
    if (validating) return setError('Wait for media validation to finish.');
    setSubmitting(true);
    try {
      let media = null;
      if (file) {
        const form = new FormData();
        form.append('media', file);
        const uploaded = await api('/api/media', { method: 'POST', body: form });
        media = { ...uploaded, ...mediaInfo };
      }
      await api('/api/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          caption: draft.caption,
          platforms: draft.selected,
          scheduledAt: new Date(draft.schedule).toISOString(),
          media
        })
      });
      await onCreated();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="page-content compose-layout" onSubmit={submit}>
      <section className="panel compose-panel">
        <div className="section-heading"><div><span className="eyebrow">NEW CONTENT</span><h2>Compose your post</h2></div></div>
        {error && <div className="inline-error"><AlertCircle size={16} />{error}</div>}
        <label className="field-label" htmlFor="caption">Post text</label>
        <textarea id="caption" className="text-area" rows="6" maxLength={Math.max(0, ...limits.map((item) => item.caption))} placeholder="What would you like to share?" value={draft.caption} onChange={(event) => setDraft({ ...draft, caption: event.target.value })} />
        <div className="char-count">{draft.caption.length} characters{selectedLimits.length ? ` · Limit ${Math.min(...selectedLimits.map((item) => item.caption))} for selected platforms` : ''}</div>

        <label className="field-label field-spaced">Media</label>
        <label className={`upload-box ${file ? 'has-file' : ''}`}>
          <input type="file" accept="image/*,video/*" onChange={(event) => {
            const selectedFile = event.target.files?.[0];
            event.target.value = '';
            void onFile(selectedFile);
          }} />
          {validating ? <LoaderCircle className="spin upload-icon" /> : file ? <FileImage className="upload-icon" /> : <UploadCloud className="upload-icon" />}
          {file ? <><strong>{file.name}</strong><span>{formatBytes(file.size)}{mediaInfo?.width ? ` · ${mediaInfo.width} × ${mediaInfo.height}px` : ''}</span></> :
            <><strong>Drop a photo or video here</strong><span>Or click to browse · Platform-specific limits are checked</span></>}
        </label>
        {file && <button type="button" className="text-button" onClick={() => void onFile(null)}>Remove media</button>}
        {selectedLimits.length > 0 && <div className="validation-list">
          {selectedLimits.map((item) => <div className="validation-platform" key={item.id}>
            <strong>{item.label}</strong><span>{item.caption} text characters</span>
            {violations.some((message) => message.startsWith(`${item.label}:`) || message.startsWith(`${item.label} `)) ?
              <AlertCircle className="validation-bad" size={16} /> : <CheckCircle2 className="validation-good" size={16} />}
          </div>)}
        </div>}
        {violations.length > 0 && <div className="validation-messages" role="alert">
          {violations.map((message) => <p key={message}><AlertCircle size={14} />{message}</p>)}
        </div>}
      </section>

      <aside className="compose-side">
        <section className="panel">
          <span className="eyebrow">PUBLISH TO</span><h2 className="side-title">Choose platforms</h2>
          <div className="platform-choice-list">
            {limits.map((item) => (
              <label className={`platform-choice ${draft.selected.includes(item.id) ? 'selected' : ''} ${!accountPlatforms.has(item.id) ? 'disabled' : ''}`} key={item.id}>
                <input type="checkbox" disabled={!accountPlatforms.has(item.id)} checked={draft.selected.includes(item.id)} onChange={() => togglePlatform(item.id)} />
                <span className={`platform-logo ${item.id}`}>{item.id === 'x' ? '𝕏' : item.label[0]}</span>
                <span className="choice-name">{item.label}<small>{accountPlatforms.has(item.id) ? 'Connected' : 'Connect in settings'}</small></span>
                {draft.selected.includes(item.id) && <Check size={17} className="choice-check" />}
              </label>
            ))}
          </div>
          <button type="button" className="text-button" onClick={onOpenSettings}>Manage connections</button>
        </section>
        <section className="panel">
          <span className="eyebrow">SCHEDULE</span><h2 className="side-title">Choose date & time</h2>
          <label className="field-label" htmlFor="schedule">Local time</label>
          <input id="schedule" className="text-input" type="datetime-local" min={localDateTimeValue(new Date(Date.now() + 60_000))} value={draft.schedule} onChange={(event) => setDraft({ ...draft, schedule: event.target.value })} required />
          <p className="helper-text">Posts are checked every minute. Actual publication time depends on each platform's processing and API response.</p>
        </section>
        <button className="button button-primary publish-button" type="submit" disabled={submitting || validating || violations.length > 0}>
          {submitting ? <LoaderCircle className="spin" size={17} /> : <CalendarClock size={17} />}
          {submitting ? 'Scheduling…' : 'Schedule post'}
        </button>
      </aside>
    </form>
  );
}

function Connections({ accounts, onChange, onNotice }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ accountId: '', displayName: '', accessToken: '', secret: '', privacy: 'SELF_ONLY' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const accountMap = new Map(accounts.map((account) => [account.platform, account]));
  const platforms = [
    { id: 'instagram', name: 'Instagram', hint: 'Professional account ID and Meta Graph API access token.' },
    { id: 'facebook', name: 'Facebook', hint: 'Facebook Page ID and a Page access token.' },
    { id: 'x', name: 'X', hint: 'X user-context OAuth 2.0 access token. Text publishing only.' },
    { id: 'tiktok', name: 'TikTok', hint: 'TikTok user access token with approved Content Posting API scopes.' }
  ];

  const startEdit = (platform) => {
    const account = accountMap.get(platform);
    setEditing(platform);
    setError('');
    setForm({
      accountId: account?.account_id || '',
      displayName: account?.display_name || '',
      accessToken: '',
      secret: '',
      privacy: account?.metadata?.privacy_level || 'SELF_ONLY'
    });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api(`/api/accounts/${editing}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: form.accountId,
          displayName: form.displayName,
          accessToken: form.accessToken || undefined,
          secret: form.secret || undefined,
          metadata: editing === 'tiktok' ? { privacy_level: form.privacy } : {}
        })
      });
      setEditing(null);
      setForm({ accountId: '', displayName: '', accessToken: '', secret: '', privacy: 'SELF_ONLY' });
      await onChange();
      onNotice('Platform connection saved securely.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async (account) => {
    if (!window.confirm(`Disconnect ${platformNames[account.platform]}?`)) return;
    try {
      await api(`/api/accounts/${account.id}`, { method: 'DELETE' });
      await onChange();
      onNotice('Platform disconnected.');
    } catch (disconnectError) {
      setError(disconnectError.message);
    }
  };

  return <div className="page-content settings-layout">
    <div className="settings-intro"><div className="intro-icon"><Settings2 size={21} /></div><div><h2>Manage your channels</h2><p>Credentials are encrypted before being stored. Tokens are never shown again after saving.</p></div></div>
    {error && <div className="inline-error"><AlertCircle size={16} />{error}</div>}
    <div className="connections-grid">
      {platforms.map((platform) => {
        const account = accountMap.get(platform.id);
        return <article className="panel connection-card" key={platform.id}>
          <div className="connection-top">
            <span className={`platform-logo large ${platform.id}`}>{platform.id === 'x' ? '𝕏' : platform.name[0]}</span>
            <div><h3>{platform.name}</h3><span className={account ? 'connected-label' : 'not-connected'}>{account ? 'Connected' : 'Not connected'}</span></div>
          </div>
          <p className="connection-hint">{platform.hint}</p>
          {account && <div className="account-summary"><span className="status-dot" />{account.display_name}<span className="account-id">{account.account_id}</span></div>}
          <div className="connection-actions">
            <button className="button button-secondary button-small" onClick={() => startEdit(platform.id)}>{account ? 'Update credentials' : 'Connect account'}</button>
            {account && <button className="text-button danger-text" onClick={() => void disconnect(account)}>Disconnect</button>}
          </div>
        </article>;
      })}
    </div>
    <div className="notice-card"><AlertCircle size={18} /><p><strong>Before connecting:</strong> Create the correct developer app, enable the platform publishing scopes, and complete any required business verification or app review. A saved token alone does not grant publishing permission.</p></div>
    {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setEditing(null);
    }}>
      <form className="modal-card" onSubmit={save}>
        <button type="button" className="modal-close" aria-label="Close" onClick={() => setEditing(null)}>×</button>
        <span className="eyebrow">SECURE CONNECTION</span><h2>{accountMap.has(editing) ? 'Update' : 'Connect'} {platformNames[editing]}</h2>
        {error && <div className="inline-error"><AlertCircle size={16} />{error}</div>}
        <label className="field-label" htmlFor="displayName">Account display name</label>
        <input id="displayName" className="text-input" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required />
        <label className="field-label field-spaced" htmlFor="accountId">{editing === 'x' ? 'X user ID or handle' : editing === 'tiktok' ? 'TikTok creator ID' : 'Page / professional account ID'}</label>
        <input id="accountId" className="text-input" value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })} required />
        <label className="field-label field-spaced" htmlFor="accessToken">Access token {accountMap.has(editing) && <span className="muted">(leave blank to keep current)</span>}</label>
        <input id="accessToken" className="text-input" type="password" autoComplete="new-password" value={form.accessToken} onChange={(event) => setForm({ ...form, accessToken: event.target.value })} required={!accountMap.has(editing)} />
        {editing === 'tiktok' && <>
          <label className="field-label field-spaced" htmlFor="privacy">Default TikTok visibility</label>
          <select id="privacy" className="text-input" value={form.privacy} onChange={(event) => setForm({ ...form, privacy: event.target.value })}>
            <option value="SELF_ONLY">Only me</option><option value="MUTUAL_FOLLOW_FRIENDS">Friends</option><option value="FOLLOWER_OF_CREATOR">Followers</option><option value="PUBLIC_TO_EVERYONE">Public</option>
          </select>
        </>}
        <p className="helper-text">The token is encrypted on the server using ENCRYPTION_KEY. Never paste an app secret into a public repository.</p>
        <button className="button button-primary modal-submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{saving ? 'Saving securely…' : 'Save connection'}</button>
      </form>
    </div>}
  </div>;
}

export default App;
