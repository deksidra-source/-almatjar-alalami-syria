class AppConfig {
  const AppConfig._();

  static const appName = 'المتجر العالمي سوريا';
  static const promotionDurationDays = 7;
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000',
  );
}
