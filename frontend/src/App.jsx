import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowUpRight, BookOpenText, CalendarClock, Check, CheckCircle2, Clock3,
  FileImage, LoaderCircle, Plus, Send, Settings2, Trash2, UploadCloud
} from 'lucide-react';
import { api, formatBytes, formatDate, localizeError } from './api.js';

const platformNames = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  tiktok: 'TikTok'
};

const deliveryLabels = {
  scheduled: 'مجدول',
  publishing: 'جارٍ النشر',
  processing: 'قيد المعالجة',
  published: 'تم النشر',
  failed: 'فشل'
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
          reject(new Error('تعذرت قراءة أبعاد الفيديو. جرّب ملفًا آخر.'));
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
      setError(localizeError(loadError.message));
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
          <span>OSLO<span className="brand-light">النشر التلقائي</span></span>
        </a>
        <div className="sidebar-label">مساحة العمل</div>
        <nav className="nav-menu">
          <button className={section === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('dashboard')}>
            <CalendarClock size={18} /> نظرة عامة
          </button>
          <button className={section === 'compose' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('compose')}>
            <Plus size={18} /> إنشاء منشور
          </button>
          <button className={section === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('settings')}>
            <Settings2 size={18} /> ربط الحسابات
          </button>
          <button className={section === 'guide' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('guide')}>
            <BookOpenText size={18} /> دليل ربط المنصات
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          <span>مساحة خاصة</span>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="eyebrow">إدارة النشر على المنصات</div>
            <h1>{section === 'settings' ? 'ربط الحسابات' : section === 'compose' ? 'إنشاء منشور' : section === 'guide' ? 'دليل ربط المنصات' : 'نظرة عامة على النشر'}</h1>
          </div>
          <div className="topbar-right">
            <span className="connected-count"><span className="status-dot" /> {connected.size} حسابات مرتبطة</span>
            {section !== 'guide' && <button className="button button-primary button-small" onClick={() => setSection('compose')}>
              <Plus size={16} /> منشور جديد
            </button>}
          </div>
        </header>

        {error && <div className="alert alert-error"><AlertCircle size={18} /> {error}</div>}
        {notice && <div className="toast"><CheckCircle2 size={17} /> {notice}</div>}
        {loading ? (
          <div className="loading"><LoaderCircle className="spin" /> جارٍ تحميل مساحة العمل…</div>
        ) : section === 'settings' ? (
          <Connections accounts={accounts} onChange={loadData} onNotice={showNotice} onOpenGuide={() => setSection('guide')} />
        ) : section === 'compose' ? (
          <Compose accounts={accounts} limits={limits} onOpenSettings={() => setSection('settings')} onCreated={async () => {
            await loadData();
            setSection('dashboard');
            showNotice('تمت إضافة المنشور إلى الجدول.');
          }} />
        ) : section === 'guide' ? (
          <PlatformGuide onOpenSettings={() => setSection('settings')} />
        ) : (
          <Dashboard posts={posts} accounts={accounts} onCreate={() => setSection('compose')} onDelete={async (id) => {
            if (!window.confirm('هل تريد حذف هذا المنشور المجدول؟')) return;
            try {
              await api(`/api/posts/${id}`, { method: 'DELETE' });
              await loadData();
              showNotice('تم حذف المنشور.');
            } catch (deleteError) {
              setError(localizeError(deleteError.message));
            }
          }} />
        )}
        <footer className="page-footer">
          <span>OSLO AUTO POST <span className="footer-muted">· مساحة شخصية لإدارة النشر</span></span>
          <a href="https://developers.facebook.com/docs/" target="_blank" rel="noreferrer">متطلبات واجهات المنصات <ArrowUpRight size={13} /></a>
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
          <span className="welcome-kicker">مساحة إدارة حساباتك</span>
          <h2>جهّز منشورك وجدول نشره بسهولة</h2>
          <p>اكتب المحتوى، واختر الحسابات المرتبطة، وحدد موعد النشر. يتولى النظام إرسال المنشور ويتابع نتيجة كل منصة.</p>
          <button className="button button-dark" onClick={onCreate}><Plus size={17} /> ابدأ بإنشاء منشور</button>
        </div>
        <div className="welcome-art"><Send size={45} strokeWidth={1.4} /></div>
      </section>

      <section className="stats-grid">
        <StatCard label="الحسابات المرتبطة" value={accounts.length} detail="جاهزة لاختيارها للنشر" icon={<CheckCircle2 />} />
        <StatCard label="منشورات مجدولة" value={pending} detail="بانتظار موعد الإرسال" icon={<Clock3 />} />
        <StatCard label="منشورات ناجحة" value={published} detail="اكتمل نشرها" icon={<Check />} />
        <StatCard label="تحتاج إلى مراجعة" value={failed} detail="تعذر نشرها" icon={<AlertCircle />} />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div><span className="eyebrow">قائمة المحتوى</span><h2>المنشورات الأخيرة</h2></div>
          <button className="button button-secondary button-small" onClick={onCreate}><Plus size={15} /> إنشاء منشور</button>
        </div>
        {posts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><FileImage size={23} /></div>
            <h3>لا توجد منشورات في الجدول</h3>
            <p>أنشئ منشورك الأول، ثم اختر الحسابات وموعد النشر.</p>
            <button className="button button-primary" onClick={onCreate}>إنشاء أول منشور</button>
          </div>
        ) : (
          <div className="post-list">
            {posts.map((post) => (
              <article className="post-row" key={post.id}>
                <div className="post-date">
                  <span>{new Date(post.scheduled_at).toLocaleDateString('ar', { month: 'short' })}</span>
                  <strong>{new Date(post.scheduled_at).toLocaleDateString('ar', { day: 'numeric' })}</strong>
                </div>
                <div className="post-main">
                  <p>{post.caption || <span className="muted">من دون نص</span>}</p>
                  <span className="post-subtitle">{formatDate(post.scheduled_at)}{post.media_mime_type ? ` · ${post.media_mime_type.startsWith('video/') ? 'فيديو' : 'صورة'}` : ''}</span>
                  <div className="delivery-tags">
                    {(post.post_deliveries || []).map((delivery) => (
                      <span className={`platform-tag ${delivery.status}`} key={delivery.id}>
                        {platformNames[delivery.platform]} · {deliveryLabels[delivery.status] || delivery.status}
                      </span>
                    ))}
                  </div>
                  {(post.post_deliveries || []).some((delivery) => delivery.error_message) &&
                    <div className="delivery-error">{localizeError(post.post_deliveries.find((delivery) => delivery.error_message)?.error_message)}</div>}
                </div>
                <div className={`status-pill ${post.status}`}>{deliveryLabels[post.status] || post.status}</div>
                {['scheduled', 'failed'].includes(post.status) &&
                  !(post.post_deliveries || []).some((delivery) => ['published', 'publishing'].includes(delivery.status)) &&
                  <button className="icon-button danger" aria-label="حذف المنشور" title="حذف المنشور" onClick={() => onDelete(post.id)}><Trash2 size={16} /></button>}
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
    if (draft.caption.length > item.caption) violations.push(`${item.label}: الحد الأقصى للنص هو ${item.caption} حرفًا.`);
    if (item.needsMedia && !file) violations.push(`تتطلب منصة ${item.label} إرفاق صورة أو فيديو.`);
    if (!file) continue;
    if (file.size > item.maxUploadBytes) violations.push(`يتجاوز حجم الملف الحد الأعلى للرفع في هذا الخادم (${formatBytes(item.maxUploadBytes)}).`);
    const types = [...item.imageMimeTypes, ...item.videoMimeTypes];
    if (!types.includes(file.type)) violations.push(`${item.label}: نوع الملف ${file.type || 'المحدد'} غير مدعوم.`);
    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? item.maxVideoBytes : item.maxImageBytes;
    if (maxSize && file.size > maxSize) violations.push(`${item.label}: الحد الأقصى لحجم الملف هو ${formatBytes(maxSize)}.`);
    if (item.id === 'instagram' && !isVideo && mediaInfo) {
      if (mediaInfo.width < item.imageMinWidth || mediaInfo.width > item.imageMaxWidth) {
        violations.push('يجب أن يتراوح عرض صورة Instagram بين 320 و1440 بكسل.');
      }
      const ratio = mediaInfo.width / mediaInfo.height;
      if (ratio < item.imageMinRatio || ratio > item.imageMaxRatio) {
        violations.push('يجب أن تكون نسبة أبعاد صورة Instagram بين 4:5 و1.91:1.');
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
      setError(localizeError(dimensionError.message));
      setFile(null);
    } finally {
      setValidating(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!draft.selected.length) return setError('اختر منصة واحدة مرتبطة على الأقل.');
    if (violations.length) return setError(violations[0]);
    if (validating) return setError('انتظر حتى ينتهي التحقق من الملف.');
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
      setError(localizeError(submitError.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="page-content compose-layout" onSubmit={submit}>
      <section className="panel compose-panel">
        <div className="section-heading"><div><span className="eyebrow">محتوى جديد</span><h2>اكتب منشورك</h2></div></div>
        {error && <div className="inline-error"><AlertCircle size={16} />{error}</div>}
        <label className="field-label" htmlFor="caption">نص المنشور</label>
        <textarea id="caption" className="text-area" rows="6" maxLength={Math.max(0, ...limits.map((item) => item.caption))} placeholder="اكتب النص الذي تريد نشره..." value={draft.caption} onChange={(event) => setDraft({ ...draft, caption: event.target.value })} />
        <div className="char-count">{draft.caption.length} حرف{selectedLimits.length ? ` · الحد الأقصى للحسابات المختارة ${Math.min(...selectedLimits.map((item) => item.caption))} حرفًا` : ''}</div>

        <label className="field-label field-spaced">الصورة أو الفيديو</label>
        <label className={`upload-box ${file ? 'has-file' : ''}`}>
          <input type="file" accept="image/*,video/*" onChange={(event) => {
            const selectedFile = event.target.files?.[0];
            event.target.value = '';
            void onFile(selectedFile);
          }} />
          {validating ? <LoaderCircle className="spin upload-icon" /> : file ? <FileImage className="upload-icon" /> : <UploadCloud className="upload-icon" />}
          {file ? <><strong>{file.name}</strong><span>{formatBytes(file.size)}{mediaInfo?.width ? ` · ${mediaInfo.width} × ${mediaInfo.height}px` : ''}</span></> :
            <><strong>اختر صورة أو فيديو من جهازك</strong><span>انقر للتصفح · سيتحقق النظام من قيود المنصات المختارة</span></>}
        </label>
        {file && <button type="button" className="text-button" onClick={() => void onFile(null)}>إزالة الملف</button>}
        {selectedLimits.length > 0 && <div className="validation-list">
          {selectedLimits.map((item) => <div className="validation-platform" key={item.id}>
            <strong>{item.label}</strong><span>حتى {item.caption} حرفًا</span>
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
          <span className="eyebrow">جهات النشر</span><h2 className="side-title">اختر المنصات</h2>
          <div className="platform-choice-list">
            {limits.map((item) => (
              <label className={`platform-choice ${draft.selected.includes(item.id) ? 'selected' : ''} ${!accountPlatforms.has(item.id) ? 'disabled' : ''}`} key={item.id}>
                <input type="checkbox" disabled={!accountPlatforms.has(item.id)} checked={draft.selected.includes(item.id)} onChange={() => togglePlatform(item.id)} />
                <span className={`platform-logo ${item.id}`}>{item.id === 'x' ? '𝕏' : item.label[0]}</span>
                <span className="choice-name">{item.label}<small>{accountPlatforms.has(item.id) ? 'مرتبط' : 'اربط الحساب من الإعدادات'}</small></span>
                {draft.selected.includes(item.id) && <Check size={17} className="choice-check" />}
              </label>
            ))}
          </div>
          <button type="button" className="text-button" onClick={onOpenSettings}>إدارة الحسابات المرتبطة</button>
        </section>
        <section className="panel">
          <span className="eyebrow">موعد النشر</span><h2 className="side-title">اختر التاريخ والوقت</h2>
          <label className="field-label" htmlFor="schedule">التوقيت المحلي لجهازك</label>
          <input id="schedule" className="text-input" type="datetime-local" min={localDateTimeValue(new Date(Date.now() + 60_000))} value={draft.schedule} onChange={(event) => setDraft({ ...draft, schedule: event.target.value })} required />
          <p className="helper-text">يتحقق المجدول كل دقيقة؛ قد يتأخر النشر الفعلي قليلًا بحسب معالجة المنصة واستجابتها.</p>
        </section>
        <button className="button button-primary publish-button" type="submit" disabled={submitting || validating || violations.length > 0}>
          {submitting ? <LoaderCircle className="spin" size={17} /> : <CalendarClock size={17} />}
          {submitting ? 'جارٍ الجدولة…' : 'جدولة المنشور'}
        </button>
      </aside>
    </form>
  );
}

function Connections({ accounts, onChange, onNotice, onOpenGuide }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ accountId: '', displayName: '', accessToken: '', privacy: 'SELF_ONLY' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const accountMap = new Map(accounts.map((account) => [account.platform, account]));
  const platforms = [
    { id: 'instagram', name: 'Instagram', hint: 'حساب احترافي مرتبط بصفحة Facebook، مع معرّف الحساب ورمز صفحة يملك صلاحية نشر محتوى Instagram.' },
    { id: 'facebook', name: 'Facebook', hint: 'صفحة Facebook تملك صلاحية إنشاء المحتوى، ومعرّف الصفحة ورمز وصول خاص بها.' },
    { id: 'x', name: 'X', hint: 'رمز OAuth 2.0 لمستخدم X مع صلاحية كتابة المنشورات. النشر النصي فقط مدعوم حاليًا.' },
    { id: 'tiktok', name: 'TikTok', hint: 'رمز وصول المستخدم ومعرّف Open ID، مع موافقة TikTok على Content Posting API.' }
  ];

  const startEdit = (platform) => {
    const account = accountMap.get(platform);
    setEditing(platform);
    setError('');
    setForm({
      accountId: account?.account_id || '',
      displayName: account?.display_name || '',
      accessToken: '',
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
          metadata: editing === 'tiktok' ? { privacy_level: form.privacy } : {}
        })
      });
      setEditing(null);
      setForm({ accountId: '', displayName: '', accessToken: '', privacy: 'SELF_ONLY' });
      await onChange();
      onNotice('تم حفظ ربط المنصة بأمان.');
    } catch (saveError) {
      setError(localizeError(saveError.message));
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async (account) => {
    if (!window.confirm(`هل تريد إلغاء ربط ${platformNames[account.platform]}؟`)) return;
    try {
      await api(`/api/accounts/${account.id}`, { method: 'DELETE' });
      await onChange();
      onNotice('تم إلغاء ربط المنصة.');
    } catch (disconnectError) {
      setError(localizeError(disconnectError.message));
    }
  };

  return <div className="page-content settings-layout">
    <div className="settings-intro"><div className="intro-icon"><Settings2 size={21} /></div><div className="settings-intro-copy"><h2>أدر حساباتك الاجتماعية</h2><p>احفظ بيانات الربط في مكان خاص. تُشفّر الرموز قبل تخزينها ولا تظهر مجددًا بعد الحفظ.</p></div><button className="button button-secondary button-small guide-shortcut" onClick={onOpenGuide}><BookOpenText size={15} /> شرح الربط بالتفصيل</button></div>
    {error && <div className="inline-error"><AlertCircle size={16} />{error}</div>}
    <div className="connections-grid">
      {platforms.map((platform) => {
        const account = accountMap.get(platform.id);
        return <article className="panel connection-card" key={platform.id}>
          <div className="connection-top">
            <span className={`platform-logo large ${platform.id}`}>{platform.id === 'x' ? '𝕏' : platform.name[0]}</span>
            <div><h3>{platform.name}</h3><span className={account ? 'connected-label' : 'not-connected'}>{account ? 'مرتبط' : 'غير مرتبط'}</span></div>
          </div>
          <p className="connection-hint">{platform.hint}</p>
          {account && <div className="account-summary"><span className="status-dot" />{account.display_name}<span className="account-id">{account.account_id}</span></div>}
          <div className="connection-actions">
            <button className="button button-secondary button-small" onClick={() => startEdit(platform.id)}>{account ? 'تحديث بيانات الربط' : 'ربط الحساب'}</button>
            {account && <button className="text-button danger-text" onClick={() => void disconnect(account)}>إلغاء الربط</button>}
          </div>
        </article>;
      })}
    </div>
    <div className="notice-card"><AlertCircle size={18} /><p><strong>قبل الربط:</strong> يلزم إنشاء تطبيق مطوّر للمنصة، ومنح صلاحيات النشر المطلوبة، وإكمال المراجعة أو التحقق التجاري عند الحاجة. حفظ الرمز وحده لا يمنح التطبيق صلاحية النشر. افتح «دليل ربط المنصات» لشرح الخطوات وبيان ما يوضع في كل خانة.</p></div>
    {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setEditing(null);
    }}>
      <form className="modal-card" onSubmit={save}>
        <button type="button" className="modal-close" aria-label="إغلاق" onClick={() => setEditing(null)}>×</button>
        <span className="eyebrow">ربط آمن</span><h2>{accountMap.has(editing) ? 'تحديث بيانات' : 'ربط'} {platformNames[editing]}</h2>
        {error && <div className="inline-error"><AlertCircle size={16} />{error}</div>}
        <label className="field-label" htmlFor="displayName">اسم الحساب للعرض</label>
        <input id="displayName" className="text-input" dir="auto" placeholder="مثال: حساب المتجر الرسمي" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required />
        <label className="field-label field-spaced" htmlFor="accountId">{editing === 'instagram' ? 'معرّف حساب Instagram الاحترافي (IG User ID)' : editing === 'facebook' ? 'معرّف صفحة Facebook (Page ID)' : editing === 'tiktok' ? 'معرّف TikTok Open ID' : 'معرّف حساب X الرقمي (للتعريف به)'}</label>
        <input id="accountId" className="text-input" dir="ltr" placeholder={editing === 'tiktok' ? 'الصق Open ID كما هو' : editing === 'x' ? 'مثال: 123456789012345678' : 'أدخل المعرّف الرقمي من المنصة'} value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })} required />
        <label className="field-label field-spaced" htmlFor="accessToken">رمز الوصول (Access Token) {accountMap.has(editing) && <span className="muted">(اتركه فارغًا للإبقاء على الرمز الحالي)</span>}</label>
        <input id="accessToken" dir="ltr" className="text-input secret-input" type="password" autoComplete="new-password" value={form.accessToken} onChange={(event) => setForm({ ...form, accessToken: event.target.value })} required={!accountMap.has(editing)} />
        {editing === 'tiktok' && <>
          <label className="field-label field-spaced" htmlFor="privacy">خصوصية TikTok الافتراضية</label>
          <select id="privacy" className="text-input" value={form.privacy} onChange={(event) => setForm({ ...form, privacy: event.target.value })}>
            <option value="SELF_ONLY">أنا فقط</option><option value="MUTUAL_FOLLOW_FRIENDS">الأصدقاء</option><option value="FOLLOWER_OF_CREATOR">المتابعون</option><option value="PUBLIC_TO_EVERYONE">عام للجميع</option>
          </select>
        </>}
        <p className="helper-text">أدخل رمز وصول المستخدم أو الصفحة المطلوب للنشر، وليس مفتاح التطبيق (App Secret). يُشفّر الرمز على الخادم. راجع «دليل ربط المنصات» لمعرفة طريقة استخراجه.</p>
        <button className="button button-primary modal-submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{saving ? 'جارٍ الحفظ بأمان…' : 'حفظ الربط'}</button>
      </form>
    </div>}
  </div>;
}

function PlatformGuide({ onOpenSettings }) {
  return (
    <div className="page-content guide-layout">
      <section className="guide-hero">
        <span className="welcome-kicker">دليل خطوة بخطوة</span>
        <h2>اربط حساباتك بنفسك وبأمان</h2>
        <p>اتبع الخطوات الخاصة بالمنصة، ثم أدخل ثلاثة أشياء في صفحة الربط: اسمًا تختاره، ومعرّف الحساب، ورمز وصول صالحًا للنشر.</p>
        <button className="button button-dark" onClick={onOpenSettings}><Settings2 size={17} /> الانتقال إلى ربط الحسابات</button>
      </section>

      <section className="guide-warning">
        <AlertCircle size={21} />
        <div><strong>معلومة مهمة قبل البدء</strong>
          <p>هذا المشروع لا يسجّل الدخول إلى المنصات نيابةً عنك ولا ينشئ رموزًا تلقائيًا. أنشئ تطبيق مطوّر في المنصة، واستخرج رمز المستخدم/الصفحة من أدواتها الرسمية، ثم الصقه في خانة «رمز الوصول». لا تضع App Secret أو كلمة مرور حسابك مكان الرمز.</p>
          <p>التطبيق مخصص للاستخدام الشخصي وليس تطبيق OAuth عامًا متعدد المستخدمين. قد تطلب المنصة مراجعة تطبيقك أو منح صلاحية متقدمة، وقد ترفض الرمز أو تحدّ من النشر قبل الموافقة.</p>
        </div>
      </section>

      <section className="guide-card">
        <div className="guide-title"><span className="platform-logo instagram">I</span><div><span className="eyebrow">صور ومقاطع Reels</span><h2>Instagram</h2></div></div>
        <div className="guide-callout"><strong>قبل إنشاء التطبيق</strong><p>استخدم حساب Instagram احترافيًا (Business أو Creator) واربطه بصفحة Facebook تديرها. النشر هنا عبر Instagram Graph API باستخدام معرّف حساب Instagram ورمز صفحة Meta؛ لا يكفي رمز Instagram عادي.</p></div>
        <ol className="guide-steps">
          <li>افتح <GuideLink href="https://developers.facebook.com/">Meta for Developers</GuideLink>، سجّل الدخول، وأنشئ تطبيقًا في Meta Developers. اختر حالة الاستخدام/المنتج المناسب لإدارة Instagram وFacebook Pages، وأضف حسابك وأدوار الاختبار.</li>
          <li>تأكد أن حساب Instagram من نوع احترافي ومربوط بصفحة Facebook. من إعدادات الصفحة/مركز الحسابات أكمل ربط Instagram، وتأكد أن المستخدم الذي سيمنح الرمز لديه صلاحية إدارة الصفحة والحساب الاحترافي.</li>
          <li>في <GuideLink href="https://developers.facebook.com/tools/explorer/">Graph API Explorer</GuideLink> اختر تطبيقك، وأنشئ User Access Token، واطلب الصلاحيات اللازمة. لمسار Facebook Login المستخدم في هذا المشروع: <code>instagram_basic</code> و<code>instagram_content_publish</code> و<code>pages_show_list</code> و<code>pages_read_engagement</code>. قد تتطلب بعض إعدادات الأعمال أيضًا صلاحيات إضافية أو مراجعة Meta.</li>
          <li>استخدم أداة Graph Explorer للحصول على الصفحات المرتبطة ومعرّف Instagram الاحترافي. استعلم عن صفحاتك باستخدام <code>/me/accounts</code>، ومع الحقول <code>id,name,access_token,instagram_business_account</code>. خذ معرّف الحساب الموجود داخل <code>instagram_business_account.id</code>، وخذ رمز الوصول الخاص بالصفحة المرتبطة نفسها.</li>
          <li>في صفحة «ربط الحسابات» أدخل اسمًا وصفيًا، وضع <strong>Instagram Professional Account ID</strong> في خانة المعرّف، والصق <strong>Page Access Token</strong> في خانة رمز الوصول. لا تضع App ID أو App Secret في خانة الرمز.</li>
          <li>جرّب أولًا صورة JPEG صغيرة أو Reel متوافقًا. الحسابات/التطبيقات التي لم تحصل على مستوى الوصول أو مراجعة Meta المناسب قد تعمل مع أدوار الاختبار فقط أو تفشل عند النشر.</li>
        </ol>
        <div className="guide-links"><GuideLink href="https://developers.facebook.com/documentation/instagram-platform/content-publishing">وثائق نشر Instagram الرسمية</GuideLink><GuideLink href="https://developers.facebook.com/tools/explorer/">فتح Graph API Explorer</GuideLink></div>
        <p className="guide-footnote">يدعم التطبيق صورة JPEG وReel فيديو. يجب أن تكون الوسائط متاحة للمنصة عبر رابط مؤقت وقت النشر؛ قد يرفض Instagram الملف بسبب قيود إضافية على المدة أو الترميز أو الحساب.</p>
      </section>

      <section className="guide-card">
        <div className="guide-title"><span className="platform-logo facebook">f</span><div><span className="eyebrow">منشورات صفحة</span><h2>Facebook</h2></div></div>
        <div className="guide-callout"><strong>مطلوب: صفحة Facebook</strong><p>الربط والنشر يتمان على صفحة (Page) وليس ملفًا شخصيًا. يجب أن يكون لديك دور أو مهمة تسمح بإنشاء محتوى على الصفحة.</p></div>
        <ol className="guide-steps">
          <li>أنشئ تطبيقًا في <GuideLink href="https://developers.facebook.com/">Meta for Developers</GuideLink> وأضف واجهة Pages/API المناسبة، ثم أضف حسابك كمسؤول أو مختبِر أثناء التطوير.</li>
          <li>من <GuideLink href="https://developers.facebook.com/tools/explorer/">Graph API Explorer</GuideLink> اختر التطبيق واطلب الصلاحيات <code>pages_show_list</code> و<code>pages_read_engagement</code> و<code>pages_manage_posts</code> و<code>pages_manage_metadata</code>. قد تختلف الصلاحيات المطلوبة حسب نوع التطبيق وحالته؛ النشر لمستخدمين خارج أدوار التطبيق قد يتطلب Advanced Access ومراجعة.</li>
          <li>استخدم رمز المستخدم المصرّح للاستعلام عن <code>/me/accounts</code>. من نتيجة صفحتك انسخ <code>id</code> كـ Page ID و<code>access_token</code> كـ Page Access Token. لا تستخدم User Access Token مكان Page Token في الربط.</li>
          <li>في صفحة الربط أدخل اسم الصفحة، وضع رقم الصفحة في خانة <strong>Page ID</strong>، والصق رمز الصفحة في خانة <strong>Access Token</strong>. الرمز سري؛ لا ترسله لأحد ولا تضعه في محادثة أو مستودع عام.</li>
          <li>أنشئ اختبارًا نصيًا أولًا، ثم جرّب صورة أو فيديو بعد نجاحه. إذا ظهر خطأ صلاحيات، أعد إصدار Page Token بعد منح التطبيق الصلاحيات المطلوبة وتحقق أن الرمز يخص الصفحة الصحيحة.</li>
        </ol>
        <div className="guide-links"><GuideLink href="https://developers.facebook.com/documentation/pages-api/getting-started">خطوات Pages API الرسمية</GuideLink><GuideLink href="https://developers.facebook.com/tools/explorer/">فتح Graph API Explorer</GuideLink></div>
      </section>

      <section className="guide-card">
        <div className="guide-title"><span className="platform-logo x">𝕏</span><div><span className="eyebrow">نص فقط في هذا المشروع</span><h2>X</h2></div></div>
        <div className="guide-callout"><strong>تنبيه: لا يدعم هذا التكامل رفع صور أو فيديو إلى X حاليًا.</strong><p>يلزم رمز مستخدم OAuth 2.0؛ Bearer Token الخاص بالتطبيق وحده ليس بديلًا عن تفويض المستخدم وقد لا يسمح بكتابة منشورات.</p></div>
        <ol className="guide-steps">
          <li>أنشئ مشروعًا وتطبيقًا في <GuideLink href="https://developer.x.com/">بوابة مطوري X</GuideLink>، وتأكد من تفعيل مستوى الوصول/الخطة التي تسمح بإنشاء المنشورات، ومن إعداد صلاحية التطبيق للقراءة والكتابة.</li>
          <li>اضبط OAuth 2.0 مع صلاحيات المستخدم اللازمة للكتابة، خصوصًا <code>tweet.write</code> و<code>users.read</code>. أضف <code>offline.access</code> إذا كنت تحتاج رمز تحديث وفق إعداد تطبيقك.</li>
          <li>أكمل تفويض حسابك من خلال OAuth 2.0 Authorization Code Flow with PKCE واحصل على <strong>User Access Token</strong> بصلاحيات المستخدم. هذا المشروع لا يوفر صفحة OAuth أو Callback لإتمام التفويض تلقائيًا، لذا يجب إعداد التفويض واستخراج الرمز خارج الموقع.</li>
          <li>في صفحة الربط أدخل اسم حساب X. في خانة المعرّف ضع المعرّف الرقمي للحساب إن توفر؛ هذه الخانة للتعريف بالسجل داخل اللوحة ولا تستخدم في طلب النشر الحالي. الصق User Access Token في خانة رمز الوصول.</li>
          <li>ابدأ برسالة قصيرة خالية من الوسائط. رمز المستخدم قابل للانتهاء أو الإلغاء؛ إذا تعذر النشر، أعد التفويض والصق رمزًا صالحًا. راجع أيضًا حدود الاستخدام والفوترة لمشروع X.</li>
        </ol>
        <div className="guide-links"><GuideLink href="https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code">دليل OAuth 2.0 الرسمي</GuideLink><GuideLink href="https://docs.x.com/x-api/posts/create-post">مرجع إنشاء منشور</GuideLink></div>
      </section>

      <section className="guide-card">
        <div className="guide-title"><span className="platform-logo tiktok">♪</span><div><span className="eyebrow">فيديو عبر Content Posting API</span><h2>TikTok</h2></div></div>
        <div className="guide-callout"><strong>موافقة TikTok مطلوبة للنشر المباشر</strong><p>تحتاج تطبيق مطوّر مع Content Posting API وتفويض المستخدم لصلاحية <code>video.publish</code>. قبل مراجعة التطبيق، قد تقيّد TikTok المنشورات بوضع «أنا فقط».</p></div>
        <ol className="guide-steps">
          <li>سجّل تطبيقًا في <GuideLink href="https://developers.tiktok.com/">TikTok for Developers</GuideLink>، وأضف منتج <strong>Content Posting API</strong>، وفعّل إعداد <strong>Direct Post</strong>.</li>
          <li>اضبط تسجيل الدخول/Redirect URI في تطبيق TikTok واطلب صلاحية <code>video.publish</code> (وربما <code>user.info.basic</code> للحصول على معلومات المستخدم). اطلب مراجعة الصلاحية وأكمل التدقيق المطلوب للنشر العام. المستخدم المستهدف يجب أن يوافق على الصلاحية بنفسه.</li>
          <li>أكمل OAuth الخاص بـTikTok خارج هذه اللوحة، ثم استخرج <strong>user access token</strong> و<code>open_id</code> الخاصين بالمستخدم الذي فوّض التطبيق. هذا الموقع لا ينفذ مسار OAuth أو تجديد الرموز تلقائيًا.</li>
          <li>في صفحة الربط أدخل اسم حساب TikTok، وضع <code>open_id</code> في خانة معرّف TikTok، والصق User Access Token في خانة رمز الوصول. اختر مستوى الخصوصية. يجب أن يسمح خيار الخصوصية المختار به التطبيق والحساب؛ القيمة المتاحة فعليًا قد تختلف.</li>
          <li>ارفع ملف فيديو MP4 أو WebM وجدوله. يرسل هذا النظام رابطًا مؤقتًا من Supabase إلى TikTok بطريقة <code>PULL_FROM_URL</code>. تتطلب TikTok نطاقًا/بادئة URL موثّقة في إعداد تطبيقك؛ تحقق أن نطاق رابط التخزين لديك مقبول وموثّق، وإلا سيفشل جلب الفيديو. رابط التوقيع المؤقت صالح لمدة ساعة فقط.</li>
          <li>بعد قبول الطلب، يتابع الموقع حالة TikTok؛ ظهور «قيد المعالجة» يعني أن النشر لم يكتمل بعد. قد يستغرق التدقيق وقتًا، وتظهر النتيجة النهائية في قائمة المنشورات.</li>
        </ol>
        <p className="guide-footnote">ملاحظة عن هذه النسخة: لا تستعلم اللوحة تلقائيًا عن خيارات الخصوصية المتاحة لكل منشئ قبل النشر. اختر فقط خيارًا يظهر ضمن خيارات حسابك في TikTok؛ إذا رفضت المنصة القيمة، راجع إعدادات منشئ المحتوى ومتطلبات المنتج أو اطلب تطوير جلب الخيارات تلقائيًا.</p>
        <div className="guide-links"><GuideLink href="https://developers.tiktok.com/doc/content-posting-api-get-started">البدء الرسمي بـContent Posting API</GuideLink><GuideLink href="https://developers.tiktok.com/doc/login-kit-manage-user-access-tokens">دليل رموز المستخدم</GuideLink><GuideLink href="https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status">شرح حالة النشر</GuideLink></div>
      </section>

      <section className="guide-card guide-fields">
        <h2>ماذا أكتب في خانات الموقع؟</h2>
        <dl>
          <div><dt>اسم الحساب للعرض</dt><dd>أي اسم يساعدك على تمييز الحساب، مثل «صفحة المتجر» أو «حسابي على Instagram». هذا الاسم للوحة فقط.</dd></div>
          <div><dt>معرّف الحساب</dt><dd>المعرّف المحدد في خطوات المنصة أعلاه، وليس رابط الحساب أو كلمة المرور. قد يكون رقمًا مثل IG User ID أو Facebook Page ID أو معرّف X الرقمي، أو نصًا مثل TikTok Open ID.</dd></div>
          <div><dt>رمز الوصول (Access Token)</dt><dd>رمز سري يصدر بعد تفويض تطبيق المطوّر بصلاحيات النشر المطلوبة. الصق الرمز كاملًا دون علامات اقتباس أو مسافات إضافية. لا تستخدم App Secret أو API Key أو كلمة مرور الحساب بديلًا عنه.</dd></div>
        </dl>
        <p className="guide-footnote">تُحفظ الرموز مشفّرة في الخادم. لن تظهر بعد الحفظ؛ عند تحديث الاتصال اترك خانة الرمز فارغة للاحتفاظ بالرمز الحالي، أو أدخل رمزًا جديدًا لاستبداله. إذا غيّرت ENCRYPTION_KEY في Render فلن يمكن فك رموز الحسابات المحفوظة بالمفتاح السابق.</p>
        <button className="button button-primary" onClick={onOpenSettings}><Settings2 size={17} /> فتح صفحة ربط الحسابات</button>
      </section>
    </div>
  );
}

function GuideLink({ href, children }) {
  return <a className="guide-link" href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={13} /></a>;
}

export default App;
