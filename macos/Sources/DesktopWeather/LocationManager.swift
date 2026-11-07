import CoreLocation

/// 系统定位：请求位置权限 → 获取坐标 → 反地理编码出城市名
final class LocationManager: NSObject, CLLocationManagerDelegate {

    enum Result {
        case success(lat: Double, lon: Double, city: String?)
        case unavailable
    }

    private let mgr = CLLocationManager()
    private let geocoder = CLGeocoder()
    private var completion: ((Result) -> Void)?
    private var timeoutItem: DispatchWorkItem?

    override init() {
        super.init()
        mgr.delegate = self
        mgr.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func request(_ completion: @escaping (Result) -> Void) {
        guard self.completion == nil else { return }
        self.completion = completion

        let item = DispatchWorkItem { [weak self] in
            self?.finish(.unavailable)
        }
        timeoutItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: item)

        switch mgr.authorizationStatus {
        case .notDetermined:
            mgr.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            mgr.requestLocation()
        default:
            finish(.unavailable)
        }
    }

    private func finish(_ result: Result) {
        timeoutItem?.cancel()
        timeoutItem = nil
        guard let completion else { return }
        self.completion = nil
        DispatchQueue.main.async { completion(result) }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard completion != nil else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        case .denied, .restricted:
            finish(.unavailable)
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager,
                         didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else {
            finish(.unavailable)
            return
        }
        let lat = loc.coordinate.latitude
        let lon = loc.coordinate.longitude
        geocoder.reverseGeocodeLocation(loc) { [weak self] placemarks, _ in
            let pm = placemarks?.first
            let city = pm.flatMap { $0.locality ?? $0.administrativeArea ?? $0.name }
            self?.finish(.success(lat: lat, lon: lon, city: city))
        }
    }

    func locationManager(_ manager: CLLocationManager,
                         didFailWithError error: Error) {
        finish(.unavailable)
    }
}

/// IP 定位：绕过系统代理直连，拿真实运营商出口的位置。
/// WebView 内的 IP 定位会走系统代理，代理出口节点会把城市带偏（例如台湾节点 → 台中）。
enum IPLocator {

    static func fetch(_ completion: @escaping (Double?, Double?, String?, String?) -> Void) {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.connectionProxyDictionary = [:]  // 关键：不走系统代理
        cfg.timeoutIntervalForRequest = 8
        let session = URLSession(configuration: cfg)
        tryProvider(0, ["https://ipapi.co/json/", "https://ipwho.is/", "baidu"], session, completion)
    }

    private static func done(_ completion: @escaping (Double?, Double?, String?, String?) -> Void,
                             _ lat: Double?, _ lon: Double?, _ city: String?, _ cc: String?) {
        DispatchQueue.main.async { completion(lat, lon, city, cc) }
    }

    private static func tryProvider(_ idx: Int, _ list: [String], _ session: URLSession,
                                    _ completion: @escaping (Double?, Double?, String?, String?) -> Void) {
        guard idx < list.count else { done(completion, nil, nil, nil, nil); return }
        let name = list[idx]

        if name == "baidu" {
            // 国内直连可达：百度千帆只给省市名，再用 Open-Meteo 地理编码换坐标
            let url = URL(string: "https://qifu-api.baidubce.com/ip/local/geo/v1/district")!
            session.dataTask(with: url) { d, _, _ in
                guard let d,
                      let j = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any],
                      (j["code"] as? String) == "Success",
                      let data = j["data"] as? [String: Any],
                      let city = (data["city"] as? String)?.trimmingCharacters(in: .whitespaces),
                      !city.isEmpty else {
                    tryProvider(idx + 1, list, session, completion); return
                }
                geocode(city, session) { lat, lon, cc in
                    if let lat, let lon {
                        done(completion, lat, lon, city, cc)
                    } else {
                        tryProvider(idx + 1, list, session, completion)
                    }
                }
            }.resume()
            return
        }

        guard let url = URL(string: name) else { tryProvider(idx + 1, list, session, completion); return }
        session.dataTask(with: url) { d, _, _ in
            var lat: Double?, lon: Double?, city: String?, cc: String?
            if let d, let j = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] {
                lat = (j["latitude"] as? NSNumber)?.doubleValue ?? (j["lat"] as? NSNumber)?.doubleValue
                lon = (j["longitude"] as? NSNumber)?.doubleValue ?? (j["lon"] as? NSNumber)?.doubleValue
                city = j["city"] as? String
                cc = (j["country_code"] ?? j["countryCode"]) as? String
            }
            if let lat, let lon, abs(lat) <= 90, abs(lon) <= 180 {
                done(completion, lat, lon, city, cc)
            } else {
                tryProvider(idx + 1, list, session, completion)
            }
        }.resume()
    }

    private static func geocode(_ city: String, _ session: URLSession,
                                _ completion: @escaping (Double?, Double?, String?) -> Void) {
        let q = city.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? city
        let url = URL(string: "https://geocoding-api.open-meteo.com/v1/search?name=\(q)&count=1&language=zh&format=json")!
        session.dataTask(with: url) { d, _, _ in
            guard let d,
                  let j = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any],
                  let results = j["results"] as? [[String: Any]],
                  let first = results.first,
                  let lat = (first["latitude"] as? NSNumber)?.doubleValue,
                  let lon = (first["longitude"] as? NSNumber)?.doubleValue else {
                DispatchQueue.main.async { completion(nil, nil, nil) }
                return
            }
            DispatchQueue.main.async { completion(lat, lon, first["country_code"] as? String) }
        }.resume()
    }
}
