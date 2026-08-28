import 'package:flutter/material.dart';

const cream = Color(0xFFFFF6C9);
const burgundy = Color(0xFF641C2C);
const ink = Color(0xFF29221F);
const muted = Color(0xFF827467);
const surface = Color(0xFFFFFDF4);

void main() => runApp(const AlmatjarApp());

class AlmatjarApp extends StatelessWidget {
  const AlmatjarApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'المتجر العالمي سوريا',
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'sans',
        scaffoldBackgroundColor: cream,
        colorScheme: ColorScheme.fromSeed(seedColor: burgundy, primary: burgundy, surface: surface),
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int tab = 0;
  String storeType = 'small';
  String payment = 'manual';

  double get promotionPrice => storeType == 'large' ? 10 : 1;

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: surface,
          foregroundColor: burgundy,
          title: const Text('المتجر العالمي سوريا', style: TextStyle(fontWeight: FontWeight.w800)),
          actions: [IconButton(onPressed: () {}, icon: const Icon(Icons.menu_rounded))],
        ),
        body: IndexedStack(index: tab, children: [
          _buyerPage(),
          _storePage(),
          _promotionPage(),
          _accountPage(),
        ]),
        bottomNavigationBar: NavigationBar(
          selectedIndex: tab,
          onDestinationSelected: (value) => setState(() => tab = value),
          backgroundColor: surface,
          indicatorColor: const Color(0xFFFFEA95),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'الرئيسية'),
            NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: 'المتجر'),
            NavigationDestination(icon: Icon(Icons.campaign_outlined), selectedIcon: Icon(Icons.campaign), label: 'الترويج'),
            NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'الحساب'),
          ],
        ),
      ),
    );
  }

  Widget _buyerPage() => ListView(padding: const EdgeInsets.all(18), children: [
    const Text('تسوق من سوريا، إلى سوريا', style: TextStyle(color: burgundy, fontWeight: FontWeight.w800)),
    const SizedBox(height: 8),
    const Text('كل ما تحتاجه في مكان واحد.', style: TextStyle(color: ink, fontSize: 31, fontWeight: FontWeight.w900)),
    const SizedBox(height: 18),
    TextField(decoration: InputDecoration(hintText: 'ماذا تبحث اليوم؟', prefixIcon: const Icon(Icons.search), filled: true, fillColor: surface, border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none))),
    const SizedBox(height: 18),
    _roundedCard(child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('تكلفة واضحة', style: TextStyle(color: burgundy, fontWeight: FontWeight.w800)), SizedBox(height: 6), Text('سعر المنتج والشحن والجمارك تظهر منفصلة قبل تأكيد الطلب.', style: TextStyle(color: muted, height: 1.7))])),
  ]);

  Widget _storePage() => ListView(padding: const EdgeInsets.all(18), children: [
    const Text('مساحة التاجر', style: TextStyle(color: burgundy, fontSize: 26, fontWeight: FontWeight.w900)),
    const SizedBox(height: 10),
    _roundedCard(child: const Text('أضف منتجًا مع الكود والسعر والكمية وسياسة الشحن.', style: TextStyle(color: muted, height: 1.7))),
    const SizedBox(height: 12),
    _actionButton('إضافة منتج', Icons.add_box_outlined, () {}),
  ]);

  Widget _promotionPage() => ListView(padding: const EdgeInsets.all(18), children: [
    const Text('إعلان مروّج', style: TextStyle(color: burgundy, fontSize: 28, fontWeight: FontWeight.w900)),
    const SizedBox(height: 8),
    const Text('مدة الإعلان ثابتة: أسبوع واحد (7 أيام).', style: TextStyle(color: muted)),
    const SizedBox(height: 16),
    _roundedCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('نوع المتجر', style: TextStyle(color: burgundy, fontWeight: FontWeight.w800)),
      RadioListTile(value: 'small', groupValue: storeType, onChanged: (value) => setState(() => storeType = value!), title: const Text('متجر صغير — 1 دولار'), contentPadding: EdgeInsets.zero),
      RadioListTile(value: 'large', groupValue: storeType, onChanged: (value) => setState(() => storeType = value!), title: const Text('متجر كبير — 10 دولارات'), contentPadding: EdgeInsets.zero),
      const Divider(),
      const Text('طريقة الدفع', style: TextStyle(color: burgundy, fontWeight: FontWeight.w800)),
      RadioListTile(value: 'manual', groupValue: payment, onChanged: (value) => setState(() => payment = value!), title: const Text('الدفع اليدوي — مفعّل'), contentPadding: EdgeInsets.zero),
      const ListTile(enabled: false, contentPadding: EdgeInsets.zero, leading: Icon(Icons.lock_outline), title: Text('Sham Cash — قريبًا'), subtitle: Text('غير مفعّل حاليًا')),
      const ListTile(enabled: false, contentPadding: EdgeInsets.zero, leading: Icon(Icons.lock_outline), title: Text('iCash — قريبًا'), subtitle: Text('غير مفعّل حاليًا')),
      Container(padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: const Color(0xFFFFEA95), borderRadius: BorderRadius.circular(16)), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('السعر المرجعي'), Text('${promotionPrice.toStringAsFixed(0)} دولار', style: TextStyle(color: burgundy, fontSize: 18, fontWeight: FontWeight.w900))])),
      const SizedBox(height: 14),
      _actionButton('إرسال طلب للمراجعة اليدوية', Icons.send_outlined, () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم إرسال الطلب للمراجعة اليدوية، دون تفعيل تلقائي.')))),
    ])),
  ]);

  Widget _accountPage() => ListView(padding: const EdgeInsets.all(18), children: [
    const Text('الحساب', style: TextStyle(color: burgundy, fontSize: 28, fontWeight: FontWeight.w900)),
    const SizedBox(height: 10),
    _roundedCard(child: const Text('تسجيل الدخول والمصادقة وحذف الحساب ستُربط بالخلفية المستقلة عبر الهاتف والرمز المؤقت.', style: TextStyle(color: muted, height: 1.7))),
  ]);

  Widget _roundedCard({required Widget child}) => Container(padding: const EdgeInsets.all(18), decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(24), boxShadow: const [BoxShadow(color: Color(0x1A5F3215), blurRadius: 18, offset: Offset(0, 8))]), child: child);
  Widget _actionButton(String label, IconData icon, VoidCallback onPressed) => SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: onPressed, icon: Icon(icon), label: Text(label), style: FilledButton.styleFrom(backgroundColor: burgundy, foregroundColor: cream, padding: const EdgeInsets.symmetric(vertical: 15), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)))));
}
