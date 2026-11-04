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
