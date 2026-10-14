import { useEffect, useState } from 'react';
import { AlertCircle, LoaderCircle, LockKeyhole } from 'lucide-react';
import { api, localizeError } from './api.js';

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [ownerExists, setOwnerExists] = useState(true);
  const [form, setForm] = useState({ displayName: '', email: '', password: '', ownerSetupKey: '' });
  const [loading, setLoading] = useState(true);
  const [ownerSetupEnabled, setOwnerSetupEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api('/api/auth/bootstrap')
      .then((result) => {
        setOwnerExists(result.ownerExists);
        setOwnerSetupEnabled(result.ownerSetupEnabled);
      })
      .catch((bootstrapError) => setError(localizeError(bootstrapError.message)))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      if (mode === 'register') {
        const result = await api('/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(form)
        });
        if (!result.needsEmailConfirmation && result.user.status === 'active') {
          onAuthenticated(result.user);
          return;
        }
        setNotice(localizeError(result.message));
        if (result.user.role === 'owner') {
          setNotice(localizeError('An owner account was created. Verify your email, then sign in if email confirmation is enabled.'));
        }
        setForm({ displayName: '', email: form.email, password: '', ownerSetupKey: '' });
        setMode('login');
      } else {
        const result = await api('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: form.email, password: form.password })
        });
        onAuthenticated(result.user);
      }
    } catch (submitError) {
      setError(localizeError(submitError.message));
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="auth-screen">
    <section className="auth-card">
      <div className="auth-brand"><span className="brand-mark">O</span><div><strong>OSLO AUTO POST</strong><small>مساحة النشر الآمن</small></div></div>
      <span className="eyebrow">{mode === 'login' ? 'مرحبًا بعودتك' : ownerExists ? 'طلب انضمام لمساحة العمل' : 'إعداد مساحة العمل'}</span>
      <h1>{mode === 'login' ? 'تسجيل الدخول' : ownerExists ? 'إنشاء حساب موظف' : 'إنشاء حساب المالك'}</h1>
      <p className="auth-description">{mode === 'login'
        ? 'سجّل الدخول للوصول إلى مساحة النشر وحساباتك.'
        : ownerExists
          ? 'سيبقى الحساب معلّقًا حتى يوافق مالك مساحة العمل ويحدد دورك.'
          : 'سيصبح الحساب الأول مالك مساحة العمل بصلاحيات كاملة.'}</p>
      {error && <div className="inline-error"><AlertCircle size={16} />{error}</div>}
      {notice && <div className="auth-notice">{notice}</div>}
      {loading ? <div className="loading auth-loading"><LoaderCircle className="spin" /> جارٍ التحقق…</div> :
        <form onSubmit={submit}>
          {mode === 'register' && <>
            <label className="field-label" htmlFor="auth-name">الاسم</label>
            <input id="auth-name" className="text-input" autoComplete="name" maxLength={100} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required />
          </>}
          <label className="field-label" htmlFor="auth-email">البريد الإلكتروني</label>
          <input id="auth-email" className="text-input" type="email" autoComplete="email" dir="ltr" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          <label className="field-label field-spaced" htmlFor="auth-password">كلمة المرور</label>
          <input id="auth-password" className="text-input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={12} maxLength={128} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          {mode === 'register' && !ownerExists && <>
            {ownerSetupEnabled ? <>
              <label className="field-label field-spaced" htmlFor="owner-setup-key">رمز إعداد المالك الأول</label>
              <input id="owner-setup-key" className="text-input" type="password" autoComplete="off" value={form.ownerSetupKey} onChange={(event) => setForm({ ...form, ownerSetupKey: event.target.value })} required />
              <p className="helper-text">أدخل الرمز الذي أعددته في متغير OWNER_SETUP_KEY على الخادم.</p>
            </> : <div className="inline-error"><AlertCircle size={16} />يجب على مسؤول النشر إعداد OWNER_SETUP_KEY قبل إنشاء حساب المالك.</div>}
          </>}
          {mode === 'register' && <p className="helper-text">استخدم 12 حرفًا على الأقل. لا تعِد استخدام كلمة مرور حساب آخر.</p>}
          <button className="button button-primary auth-submit" disabled={submitting || (mode === 'register' && !ownerExists && !ownerSetupEnabled)}>
            {submitting ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={16} />}
            {submitting ? 'جارٍ التحقق…' : mode === 'login' ? 'دخول آمن' : 'إنشاء الحساب'}
          </button>
        </form>}
      <button className="text-button auth-switch" disabled={loading || submitting} onClick={() => {
        setMode(mode === 'login' ? 'register' : 'login');
        setForm((current) => ({ ...current, password: '', ownerSetupKey: '' }));
        setError('');
        setNotice('');
      }}>{mode === 'login' ? 'ليس لديك حساب؟ إنشاء حساب' : 'لديك حساب بالفعل؟ تسجيل الدخول'}</button>
      <p className="auth-security">الجلسة محمية بملفات ارتباط آمنة، ولا تُعرض رموز تسجيل الدخول في الصفحة.</p>
    </section>
  </main>;
}
