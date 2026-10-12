const platformLabels = {
  Instagram: 'Instagram',
  Facebook: 'Facebook',
  X: 'منصة X',
  TikTok: 'TikTok'
};

export function localizeError(message = '') {
  const exactMessages = new Map([
    ['Unsupported platform.', 'هذه المنصة غير مدعومة.'],
    ['Account or Page ID is required.', 'معرّف الحساب أو الصفحة مطلوب.'],
    ['Display name is required.', 'اسم الحساب مطلوب.'],
    ['Access token is invalid.', 'صيغة رمز الوصول غير صحيحة.'],
    ['An access token is required for a new connection.', 'رمز الوصول مطلوب لربط حساب جديد.'],
    ['Select an image or video first.', 'اختر صورة أو فيديو أولًا.'],
    ['Only image and video files are accepted.', 'يسمح برفع الصور والفيديو فقط.'],
    ['Choose at least one platform.', 'اختر منصة واحدة على الأقل.'],
    ['Choose at least one connected platform.', 'اختر منصة واحدة مرتبطة على الأقل.'],
    ['Duplicate platforms are not allowed.', 'لا يمكن اختيار المنصة نفسها أكثر من مرة.'],
    ['Media path is invalid.', 'مسار الملف غير صالح.'],
    ['Uploaded media path is required.', 'يجب رفع الملف قبل إنشاء المنشور.'],
    ['Post not found.', 'لم يتم العثور على المنشور.'],
    ['Only scheduled or failed posts can be deleted.', 'يمكن حذف المنشورات المجدولة أو الفاشلة فقط.'],
    ['This account has scheduled or publishing posts. Cancel them before disconnecting.', 'لدى هذا الحساب منشورات مجدولة أو قيد النشر. احذفها أو انتظر اكتمالها قبل إلغاء الربط.'],
    ['This post has a published or active delivery and cannot be deleted from the history.', 'لا يمكن حذف هذا المنشور من السجل لوجود عملية نشر ناجحة أو نشطة.'],
    ['Unexpected server error.', 'حدث خطأ غير متوقع في الخادم. يرجى المحاولة لاحقًا.']
  ]);
  if (exactMessages.has(message)) return exactMessages.get(message);

  let match = message.match(/^(.+) caption must be at most (\d+) characters\.$/);
  if (match) return `${platformLabels[match[1]] || match[1]}: الحد الأقصى للنص هو ${match[2]} حرفًا.`;
  match = message.match(/^(.+) requires media\.$/);
  if (match) return `تتطلب منصة ${platformLabels[match[1]] || match[1]} إرفاق صورة أو فيديو.`;
  match = message.match(/^(.+) does not support (.+)\.$/);
  if (match) return `${platformLabels[match[1]] || match[1]} لا تدعم نوع الملف ${match[2]}.`;
  match = message.match(/^Media must be no larger than (\d+) MB in this deployment\.$/);
  if (match) return `يجب ألا يتجاوز حجم الملف ${match[1]} ميغابايت على هذا الخادم.`;
  match = message.match(/^(.+) media must be no larger than (\d+) MB\.$/);
  if (match) return `${platformLabels[match[1]] || match[1]}: الحد الأقصى لحجم الملف ${match[2]} ميغابايت.`;
  match = message.match(/^Connect these platforms first: (.+)\.$/);
  if (match) return `اربط هذه المنصات أولًا: ${match[1].split(', ').map((name) => platformLabels[name] || name).join('، ')}.`;
  match = message.match(/^Schedule time must be at least (\d+) seconds in the future\.$/);
  if (match) return `اختر موعدًا يبعد ${match[1]} ثانية على الأقل عن الوقت الحالي.`;
  match = message.match(/^File exceeds the (\d+) MB server upload limit\.$/);
  if (match) return `يتجاوز الملف الحد الأقصى للرفع إلى الخادم (${match[1]} ميغابايت).`;
  match = message.match(/^Instagram image width must be between (\d+) and (\d+) pixels\.$/);
  if (match) return `يجب أن يتراوح عرض صورة Instagram بين ${match[1]} و${match[2]} بكسل.`;
  match = message.match(/^Instagram image aspect ratio must be between (.+)\.$/);
  if (match) return `يجب أن تكون نسبة أبعاد صورة Instagram بين ${match[1]}.`;
  match = message.match(/^Request failed \((\d+)\)\.$/);
  if (match) return `تعذر إكمال الطلب (رمز ${match[1]}).`;
  if (message === 'Failed to fetch') return 'تعذر الاتصال بالخادم. تحقق من الاتصال وحالة الخدمة ثم أعد المحاولة.';
  if (/[A-Za-z]{3,}/.test(message)) {
    return `تعذر إكمال العملية. تفاصيل الخطأ من الخادم أو المنصة: ${message}`;
  }
  return message;
}

export async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messages = Array.isArray(body.details) && body.details.length
      ? body.details.map(localizeError).join(' ')
      : localizeError(body.error || `Request failed (${response.status}).`);
    throw new Error(messages);
  }
  return body;
}

export function formatDate(value) {
  return new Intl.DateTimeFormat('ar', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatBytes(bytes = 0) {
  const number = new Intl.NumberFormat('ar', { maximumFractionDigits: 1 });
  if (bytes < 1024 * 1024) return `${number.format(bytes / 1024)} كيلوبايت`;
  return `${number.format(bytes / (1024 * 1024))} ميغابايت`;
}
