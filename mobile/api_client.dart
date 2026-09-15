import 'dart:convert';
import 'package:http/http.dart' as http;

class AlmatjarApiClient {
  AlmatjarApiClient({String? baseUrl}) : baseUrl = baseUrl ?? const String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:4000');

  final String baseUrl;

  Future<List<dynamic>> catalog() async {
    final response = await http.get(Uri.parse('$baseUrl/api/catalog'));
    _ensureOk(response);
    return jsonDecode(response.body)['items'] as List<dynamic>;
  }

  Future<Map<String, dynamic>> requestPromotion({required String vendorId, required String storeType}) async {
    final response = await http.post(Uri.parse('$baseUrl/api/promotion-requests'), headers: {'content-type': 'application/json'}, body: jsonEncode({
      'vendorId': vendorId,
      'storeType': storeType,
      'paymentProvider': 'MANUAL',
    }));
    _ensureOk(response);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createOrder({required String customerId, required String vendorId, required num products, required num shipping, num technicalFee = 0}) async {
    final response = await http.post(Uri.parse('$baseUrl/api/orders'), headers: {'content-type': 'application/json'}, body: jsonEncode({
      'customerId': customerId,
      'vendorId': vendorId,
      'totalProductAmount': products,
      'totalShippingCustoms': shipping,
      'techServiceFee': technicalFee,
    }));
    _ensureOk(response);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  void _ensureOk(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('API request failed (${response.statusCode}): ${response.body}');
    }
  }
}
