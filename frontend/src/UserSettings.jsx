import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle, LogOut, ShieldCheck, Users } from 'lucide-react';
import { api, localizeError } from './api.js';

const roleNames = { owner: 'مالك', admin: 'مدير', editor: 'محرر', viewer: 'قارئ' };
const statusNames = { active: 'مفعّل', pending: 'بانتظار الموافقة', suspended: 'موقوف' };

export default function UserSettings({ user, onLogout, onNotice }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(user.role === 'owner' || user.role === 'admin');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    if (user.role !== 'owner' && user.role !== 'admin') return;
    setLoading(true);
    try {
      setUsers(await api('/api/users'));
      setError('');
    } catch (loadError) {
      setError(localizeError(loadError.message));
    } finally {
      setLoading(false);
    }
  }, [user.role]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const updateUser = async (target, changes) => {
    setBusyId(target.id);
    setError('');
    try {
      await api(`/api/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(changes)
      });
      await loadUsers();
      onNotice('تم تحديث صلاحيات الحساب.');
    } catch (updateError) {
      setError(localizeError(updateError.message));
    } finally {
      setBusyId('');
    }
  };

  return <div className="page-content settings-layout">
    <div className="settings-intro">
      <div className="intro-icon"><ShieldCheck size={21} /></div>
      <div className="settings-intro-copy"><h2>إعدادات مساحة العمل</h2><p>إدارة أمان الحسابات والأدوار والوصول إلى مساحة النشر.</p></div>
      <button className="button button-secondary button-small" onClick={onLogout}><LogOut size={15} /> تسجيل الخروج</button>
    </div>
    <section className="panel profile-summary">
      <div className="user-avatar">{(user.display_name || user.email)[0].toUpperCase()}</div>
      <div><strong>{user.display_name}</strong><span>{user.email}</span></div>
      <span className="role-badge">{roleNames[user.role]}</span>
      <span className="connected-label">حسابك {statusNames[user.status]}</span>
    </section>
    {error && <div className="inline-error"><AlertCircle size={16} />{error}</div>}
    {user.role === 'owner' || user.role === 'admin' ? <section className="panel user-management">
      <div className="section-heading"><div><span className="eyebrow">الوصول والأمان</span><h2><Users size={17} /> إدارة المستخدمين والموظفين</h2></div>
        <button className="button button-secondary button-small" onClick={() => void loadUsers()} disabled={loading}>تحديث القائمة</button>
      </div>
      <p className="helper-text">تسجيلات الموظفين الجديدة معلّقة افتراضيًا. فعّل الحساب واختر دوره لمنحه الوصول. المالك محمي ولا يمكن تغييره من هذه الصفحة.</p>
      {loading ? <div className="loading settings-loading"><LoaderCircle className="spin" /> جارٍ تحميل المستخدمين…</div> :
        users.length === 0 ? <p className="empty-users">لا يوجد مستخدمون حتى الآن.</p> :
          <div className="user-list">{users.map((target) => <article className="user-row" key={target.id}>
            <div className="user-avatar">{(target.display_name || target.email)[0].toUpperCase()}</div>
            <div className="user-main"><strong>{target.display_name}</strong><span>{target.email}</span><small>انضم {new Date(target.created_at).toLocaleDateString('ar')}</small></div>
            <span className={`user-status ${target.status}`}>{statusNames[target.status]}</span>
            {target.role === 'owner' ? <span className="role-badge">مالك المساحة</span> : <>
              <select aria-label={`دور ${target.display_name}`} className="text-input user-role" value={target.role} disabled={busyId === target.id || target.id === user.id || (user.role !== 'owner' && target.role === 'admin')} onChange={(event) => void updateUser(target, { role: event.target.value })}>
                {user.role === 'owner' && <option value="admin">مدير</option>}
                <option value="editor">محرر</option><option value="viewer">قارئ</option>
              </select>
              <button className={`button button-small ${target.status === 'active' ? 'button-secondary' : 'button-primary'}`} disabled={busyId === target.id || target.id === user.id} onClick={() => void updateUser(target, { status: target.status === 'active' ? 'suspended' : 'active' })}>
                {busyId === target.id ? <LoaderCircle className="spin" size={14} /> : target.status === 'active' ? 'إيقاف' : <><CheckCircle2 size={14} /> تفعيل</>}
              </button>
            </>}
          </article>)}</div>}
    </section> : <section className="notice-card"><ShieldCheck size={18} /><p>يمكنك الاطلاع على مساحة العمل بحسب دورك ({roleNames[user.role]}). إدارة حسابات الموظفين متاحة للمالك والمدير فقط.</p></section>}
  </div>;
}
