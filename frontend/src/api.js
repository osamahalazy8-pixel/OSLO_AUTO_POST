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
    ['Unexpected server error.', 'حدث خطأ غير متوقع في الخادم. يرجى المحاولة لاحقًا.'],
    ['Authentication required.', 'سجّل الدخول للمتابعة.'],
    ['Your session has expired. Please sign in again.', 'انتهت جلسة الدخول. سجّل الدخول مجددًا.'],
    ['Your session is invalid. Please sign in again.', 'جلسة الدخول غير صالحة. سجّل الدخول مجددًا.'],
    ['Your account is awaiting owner approval.', 'حسابك بانتظار موافقة مالك مساحة العمل.'],
    ['You do not have permission to perform this action.', 'ليست لديك صلاحية لتنفيذ هذا الإجراء.'],
    ['Email or password is incorrect.', 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'],
    ['An account with this email already exists.', 'يوجد حساب مسجل بهذا البريد الإلكتروني.'],
    ['The owner must approve your account before you can access the workspace.', 'يجب أن يوافق مالك مساحة العمل على حسابك قبل الدخول.'],
    ['An owner account was created. Verify your email, then sign in if email confirmation is enabled.', 'أُنشئ حساب المالك. تحقق من بريدك الإلكتروني ثم سجّل الدخول إذا طُلب تأكيد البريد.'],
    ['Your account is suspended. Contact the workspace owner.', 'حسابك موقوف. تواصل مع مالك مساحة العمل.'],
    ['Enter a valid email address.', 'أدخل بريدًا إلكترونيًا صالحًا.'],
    ['Password must be between 12 and 128 characters.', 'يجب أن يتراوح طول كلمة المرور بين 12 و128 حرفًا.'],
    ['Enter a display name of at most 100 characters.', 'أدخل اسمًا لا يتجاوز 100 حرف.'],
    ['Email and password are required.', 'البريد الإلكتروني وكلمة المرور مطلوبان.'],
    ['User profile is not available. Contact the workspace owner.', 'تعذر العثور على ملف حسابك. تواصل مع مالك مساحة العمل.'],
    ['The account profile was not created.', 'تعذر إنشاء ملف الحساب. يرجى المحاولة مجددًا.'],
    ['Choose a valid non-owner role.', 'اختر دورًا صالحًا غير دور المالك.'],
    ['Choose active or suspended status.', 'اختر حالة مفعّلة أو موقوفة.'],
    ['You cannot change your own role or account status.', 'لا يمكنك تغيير دور حسابك أو حالته بنفسك.'],
    ['The owner account cannot be changed here.', 'لا يمكن تغيير حساب المالك من هذه الصفحة.'],
    ['Only the owner can appoint an administrator.', 'يمكن للمالك وحده تعيين مدير.'],
    ['Only the owner can manage an administrator account.', 'يمكن للمالك وحده إدارة حساب المدير.'],
    ['Choose a role or account status to update.', 'اختر دورًا أو حالة لتحديث الحساب.'],
    ['User not found.', 'لم يتم العثور على المستخدم.'],
    ['The owner setup key is missing or incorrect.', 'رمز إعداد المالك مفقود أو غير صحيح. تحقق من الرمز الذي أعده مسؤول النشر.'],
    ['Select one or more images or videos first.', 'اختر صورة أو فيديو واحدًا على الأقل.'],
    ['Selected platforms are invalid.', 'المنصات المحددة غير صالحة.'],
    ['Choose crop or blur for media that needs a new frame.', 'اختر القص أو الخلفية المموهة لملاءمة الوسائط.'],
    ['Uploaded media variants are required.', 'تعذر العثور على النسخ المجهزة للمنصات. أعد رفع الملفات.'],
    ['Uploaded media metadata is invalid.', 'بيانات الملف المرفوع غير صالحة. أعد رفعه.'],
    ['Media must be a list of uploaded files.', 'يجب رفع الملفات قبل جدولة المنشور.'],
    ['Only supported image and video formats are accepted.', 'تُقبل الصور والفيديوهات فقط. اختر صيغة شائعة مدعومة.'],
    ['Image format is unsupported or the image file is damaged. Use JPEG, PNG, WebP, AVIF, TIFF, or GIF.', 'تعذرت قراءة الصورة. استخدم JPEG أو PNG أو WebP أو AVIF أو TIFF أو GIF وتأكد أن الملف سليم.'],
    ['Video conversion is unavailable on this server.', 'تحويل الفيديو غير متاح حاليًا على الخادم.'],
    ['The total upload must be no larger than 250 MB.', 'يجب ألا يتجاوز مجموع الملفات 250 ميغابايت.'],
    ['The converted video exceeds the 100 MB per-file limit. Try a shorter video.', 'تجاوز الفيديو بعد التحويل الحد الأقصى (100 ميغابايت). جرّب فيديو أقصر.'],
    ['The converted media exceeds the 100 MB per-file limit.', 'تجاوز الملف بعد التحويل الحد الأقصى (100 ميغابايت).'],
    ['Video conversion failed. Use a valid MP4, MOV, WebM, or MKV video.', 'تعذر تحويل الفيديو. استخدم MP4 أو MOV أو WebM أو MKV وتأكد أن الملف سليم.'],
    ['Video conversion timed out. Try a shorter or smaller video.', 'استغرق تحويل الفيديو وقتًا طويلًا. جرّب فيديو أقصر أو أصغر حجمًا.'],
    ['Choose no more than 10 media files.', 'اختر 10 ملفات كحد أقصى للمنشور الواحد.'],
    ['Instagram carousels support up to 10 media items.', 'تدعم منشورات Instagram حتى 10 عناصر.'],
    ['Facebook posts support one video or up to 10 images at a time.', 'يدعم Facebook فيديو واحدًا أو حتى 10 صور في المنشور.'],
    ['Facebook photo albums support up to 10 images.', 'تدعم ألبومات Facebook حتى 10 صور.'],
    ['TikTok publishing requires exactly one video and does not support image posts.', 'يتطلب TikTok فيديو واحدًا فقط ولا يدعم الصور.'],
    ['X media publishing is not enabled; this integration currently supports text posts only.', 'النشر على X يدعم النص فقط حاليًا؛ أزل الوسائط أو أزل المنصة.'],
    ['Instagram publishing requires an image or video.', 'يتطلب النشر على Instagram صورة أو فيديو.'],
    ['Facebook did not return an ID for an album photo.', 'لم يُرجع Facebook معرّف إحدى صور الألبوم. تحقق من الربط وأعد المحاولة.'],
    ['Instagram did not return a media container ID.', 'لم يُرجع Instagram معرّف حاوية الوسائط. تحقق من الربط وأعد المحاولة.'],
    ['Instagram did not return a publishable media container.', 'تعذر تجهيز المنشور لدى Instagram. تحقق من الربط وأعد المحاولة.'],
    ['TikTok integration currently supports video posts only.', 'يدعم TikTok نشر الفيديو فقط حاليًا.']
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
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messages = Array.isArray(body.details) && body.details.length
      ? body.details.map(localizeError).join(' ')
      : localizeError(body.error || `Request failed (${response.status}).`);
    const error = new Error(messages);
    error.status = response.status;
    throw error;
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
