# تشغيل PostgreSQL وNode.js محليًا

هذا الدليل خاص بمشروع **المتجر العالمي سوريا** الموجود في مجلد المشروع. لا تستخدم قاعدة بيانات أو ملف `.env` الخاصين بمشروع «سوقنا سوريا».

## 1. المتطلبات

تحتاج إلى تثبيت Node.js إصدار 20 أو أحدث، ومدير الحزم npm أو pnpm، وPostgreSQL إصدار 14 أو أحدث. للتحقق من Node.js وPostgreSQL:

```bash
node --version
npm --version
psql --version
```

إذا ظهر أن `psql` غير معروف، فهذا يعني أن PostgreSQL أو أدواته لم تُثبت أو أن مساره غير مضاف إلى PATH.

## 2. تثبيت PostgreSQL على Ubuntu

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo systemctl status postgresql
```

أنشئ مستخدمًا وقاعدة خاصة بالمشروع. غيّر كلمة المرور إلى قيمة قوية من اختيارك، ولا ترسلها داخل المحادثة أو تضعها في Git:

```bash
sudo -u postgres psql
```

ثم داخل موجه PostgreSQL:

```sql
CREATE USER almatjar_app WITH PASSWORD 'ضع_كلمة_مرور_قوية_هنا';
CREATE DATABASE almatjar_alalami_syria OWNER almatjar_app;
GRANT ALL PRIVILEGES ON DATABASE almatjar_alalami_syria TO almatjar_app;
\\q
```

اختبر الدخول:

```bash
psql "postgresql://almatjar_app:كلمة_المرور@localhost:5432/almatjar_alalami_syria"
```

## 3. تثبيت PostgreSQL على Windows

نزّل مثبت PostgreSQL من [الموقع الرسمي](https://www.postgresql.org/download/windows/)، واترك المنفذ الافتراضي `5432`، واحفظ كلمة مرور مستخدم `postgres`.

بعد التثبيت افتح **SQL Shell (psql)** أو pgAdmin، وأنشئ المستخدم والقاعدة بالأوامر التالية:

```sql
CREATE USER almatjar_app WITH PASSWORD 'ضع_كلمة_مرور_قوية_هنا';
CREATE DATABASE almatjar_alalami_syria OWNER almatjar_app;
GRANT ALL PRIVILEGES ON DATABASE almatjar_alalami_syria TO almatjar_app;
```

إذا استخدمت PowerShell وكان `psql` معروفًا:

```powershell
psql -U postgres -h localhost -p 5432
```

## 4. تجهيز الخلفية

افتح Terminal أو PowerShell داخل مجلد المشروع:

```bash
cd /path/to/almatjar-alalami-syria/backend
npm install
```

في Linux/macOS:

```bash
cp .env.example .env
```

في Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

افتح ملف `backend/.env` وضع بيانات قاعدة المشروع:

```env
DATABASE_URL=postgresql://almatjar_app:كلمة_المرور@localhost:5432/almatjar_alalami_syria
DATABASE_SSL=false
DB_POOL_MAX=10
PORT=4000
CORS_ORIGIN=http://localhost:3000
```

استبدل `كلمة_المرور` بكلمة المرور الفعلية. لا تضع علامات اقتباس حول السطر كاملًا، ولا ترفع `.env` إلى Git.

## 5. تنفيذ مخطط PostgreSQL

من مجلد `backend` شغّل:

```bash
npm run db:migrate
```

هذا الأمر يقرأ `postgresql-schema-draft.sql` من مجلد `docs/` ويطبّق الجداول والأنواع والفهارس على قاعدة `almatjar_alalami_syria`. لا تنفذه على قاعدة مشروع آخر.

للتحقق من الجداول:

```bash
psql "postgresql://almatjar_app:كلمة_المرور@localhost:5432/almatjar_alalami_syria" -c "\\dt"
```

يجب أن ترى جداول مثل `users` و`vendors` و`products` و`orders` و`promotion_requests` و`notifications`.

## 6. تشغيل خادم Node.js

من مجلد `backend`:

```bash
npm start
```

يعمل الخادم افتراضيًا على المنفذ `4000`. افتح Terminal آخر واختبر:

```bash
curl http://localhost:4000/health
```

النتيجة المتوقعة تقريبًا:

```json
{"ok":true,"service":"almatjar-alalami-syria-backend"}
```

للتطوير مع إعادة التشغيل عند تعديل الملفات:

```bash
npm run dev
```

## 7. اختبار مسار الكتالوج

```bash
curl http://localhost:4000/api/catalog
```

إذا كانت القاعدة فارغة، ستعود قائمة فارغة. لا تضف بيانات وهمية إلى قاعدة الإنتاج أو قاعدة المستخدمين. الاختبار الصحيح هنا هو نجاح الاتصال وعودة `items` دون خطأ.

## 8. اختبار طلب إعلان مروّج

المسار يحتاج `vendorId` حقيقيًا موجودًا في قاعدة البيانات. بعد إنشاء مستخدم ومتجر عبر مسار مصادقة فعلي، يكون الطلب بالشكل التالي:

```bash
curl -X POST http://localhost:4000/api/promotion-requests \
  -H "Content-Type: application/json" \
  -d '{"vendorId":"UUID_حقيقي","storeType":"SMALL_STORE","paymentProvider":"MANUAL"}'
```

الخادم يحدد السعر بنفسه: `1` للمتجر الصغير و`10` للمتجر الكبير، ويثبت المدة على `7` أيام. إرسال `SHAM_CASH` أو `ICASH` يُرفض حاليًا لأنهما غير مفعّلين.

## 9. أخطاء شائعة

| الخطأ | السبب والحل |
|---|---|
| `DATABASE_URL is required` | ملف `.env` غير موجود داخل `backend` أو لم تُملأ قيمة `DATABASE_URL`. |
| `password authentication failed` | اسم المستخدم أو كلمة المرور لا يطابقان مستخدم PostgreSQL. |
| `database does not exist` | لم تُنشأ قاعدة `almatjar_alalami_syria` أو كُتب اسمها خطأ. |
| `ECONNREFUSED 127.0.0.1:5432` | خدمة PostgreSQL متوقفة أو تعمل على منفذ مختلف. |
| `EADDRINUSE 4000` | المنفذ مستخدم؛ أوقف الخدمة الأخرى أو غيّر `PORT` في `.env`. |
| فشل `npm run db:migrate` بسبب نوع موجود | نفّذ الهجرة مرة واحدة على قاعدة جديدة. لا تحذف قاعدة تحتوي بيانات مهمة؛ راجع الهجرة يدويًا أولًا. |

## 10. تشغيل واجهة Flutter لاحقًا

ثبّت Flutter من [flutter.dev](https://docs.flutter.dev/get-started/install)، ثم تحقق:

```bash
flutter doctor
```

من مجلد `mobile`:

```bash
flutter pub get
flutter run
```

الواجهة الحالية مستقلة وتعرض المشتري والمتجر والترويج والحساب. تحتاج لاحقًا إلى ربط عميل HTTP بعنوان الخلفية، مثل `http://10.0.2.2:4000` لمحاكي Android، أو عنوان الجهاز المحلي عند الاختبار من هاتف حقيقي. لا تستخدم `localhost` من الهاتف الحقيقي لأنه يشير إلى الهاتف نفسه.

## ملاحظة أمان واستقلال

قاعدة البيانات والمستخدم وملف البيئة في هذا الدليل خاصون بالمتجر العالمي سوريا. لا تستخدم `DATABASE_URL` أو `JWT_SECRET` أو جلسات مشروع «سوقنا سوريا». لا تفعّل Sham Cash أو iCash قبل توفير حسابات تاجر مستقلة، ومواصفات API، وبيئة اختبار، وآلية تحقق، ومراجعة قانونية.
