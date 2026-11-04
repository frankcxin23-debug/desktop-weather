import AppKit
import WebKit

/// macOS 壳：把共享 Web 核心（app/）挂在桌面层级渲染
/// - 特效页：每块屏幕一个桌面级 WKWebView（壁纸之上、普通窗口之下，不拦截鼠标）
/// - 设置页：独立窗口，保存后经壳持久化并同步到特效页
final class AppDelegate: NSObject, NSApplicationDelegate,
                         WKScriptMessageHandler, WKNavigationDelegate {

    private struct ScreenView {
        let window: NSWindow
        let web: WKWebView
    }

    private var screens: [ScreenView] = []
    private var statusItem: NSStatusItem!
    private var settingsWindow: NSWindow?
    private var settingsWeb: WKWebView?
    private let location = LocationManager()

    private enum K {
        static let intensity = "dw.intensity"
        static let useManual = "dw.useManualCity"
        static let cityName = "dw.cityName"
        static let lat = "dw.lat"
        static let lon = "dw.lon"
    }
    private let d = UserDefaults.standard

    // MARK: - 生命周期

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupScreens()
        setupStatusItem()
        if !settings().useManual {
            locate()
        }
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.callAll("DW.refresh")
        }
    }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool { true }

    // MARK: - 设置读写

    private func settings() -> (intensity: Double, useManual: Bool, name: String, lat: Double?, lon: Double?) {
        let i = d.double(forKey: K.intensity)
        return (
            i == 0 ? 1.0 : i,
            d.bool(forKey: K.useManual),
            d.string(forKey: K.cityName) ?? "",
            d.object(forKey: K.lat) as? Double,
            d.object(forKey: K.lon) as? Double
        )
    }

    private func settingsJSON() -> [String: Any] {
        let s = settings()
        var j: [String: Any] = ["intensity": s.intensity, "useManualCity": s.useManual, "cityName": s.name]
        if let lat = s.lat { j["lat"] = lat }
        if let lon = s.lon { j["lon"] = lon }
        return j
    }

    // MARK: - 桌面特效窗口

    private func makeWebView(_ page: String) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(LeakSafeHandler(self), name: "dwBridge")
        let web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        web.underPageBackgroundColor = .clear
        if let res = Bundle.main.resourceURL?.appendingPathComponent("app") {
            web.loadFileURL(res.appendingPathComponent(page), allowingReadAccessTo: res)
        }
        return web
    }

    private func setupScreens() {
        for screen in NSScreen.screens {
            let win = NSWindow(
                contentRect: screen.frame,
                styleMask: [.borderless],
                backing: .buffered,
                defer: false
            )
            win.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)))
            win.isOpaque = false
            win.backgroundColor = .clear
            win.ignoresMouseEvents = true
            win.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]

            let web = makeWebView("index.html")
            web.frame = NSRect(origin: .zero, size: screen.frame.size)
            web.autoresizingMask = [.width, .height]
            win.contentView = web
            win.orderFrontRegardless()
            screens.append(ScreenView(window: win, web: web))
        }
    }

    // MARK: - 菜单栏

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let b = statusItem.button {
            b.image = NSImage(systemSymbolName: "cloud.sun.fill", accessibilityDescription: "桌面天气")
        }
        let menu = NSMenu()

        let set = NSMenuItem(title: "设置…", action: #selector(openSettings), keyEquivalent: ",")
        set.target = self
        menu.addItem(set)
        menu.addItem(.separator())

        let refresh = NSMenuItem(title: "立即刷新", action: #selector(refreshNow), keyEquivalent: "r")
        refresh.target = self
        menu.addItem(refresh)

        let rel = NSMenuItem(title: "重新定位", action: #selector(relocate), keyEquivalent: "")
        rel.target = self
        menu.addItem(rel)

        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "退出桌面天气",
                                action: #selector(NSApplication.terminate(_:)),
                                keyEquivalent: "q"))
        statusItem.menu = menu
    }

    @objc private func refreshNow() { callAll("DW.refresh") }
    @objc private func relocate() { locate() }

    // MARK: - 设置窗口

    @objc private func openSettings() {
        if let win = settingsWindow {
            win.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        let win = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 460, height: 560),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        win.title = "桌面天气设置"
        win.isReleasedWhenClosed = false
        win.appearance = NSAppearance(named: .vibrantDark)
        win.titlebarAppearsTransparent = true

        let web = makeWebView("settings.html")
        web.frame = NSRect(x: 0, y: 0, width: 460, height: 560)
        web.autoresizingMask = [.width, .height]
        win.contentView = web
        settingsWindow = win
        settingsWeb = web

        win.center()
        win.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: - JS 桥

    /// 以 base64(JSON) 调用页面函数，避免转义问题
    private func call(_ web: WKWebView, _ fn: String, _ payload: [String: Any]) {
        let data = (try? JSONSerialization.data(withJSONObject: payload)) ?? Data()
        web.evaluateJavaScript("\(fn)('\(data.base64EncodedString())')") { _, _ in }
    }

    private func callAll(_ fn: String) {
        for s in screens {
            s.web.evaluateJavaScript("\(fn)()") { _, _ in }
        }
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "dwBridge",
              let s = message.body as? String,
              let data = s.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        // 持久化
        if let v = obj["intensity"] as? Double { d.set(v, forKey: K.intensity) }
        if let v = obj["useManualCity"] as? Bool { d.set(v, forKey: K.useManual) }
        if let v = obj["cityName"] as? String { d.set(v, forKey: K.cityName) }
        d.set(obj["lat"] as? Double, forKey: K.lat)
        d.set(obj["lon"] as? Double, forKey: K.lon)

        // 同步到所有特效页
        let json = settingsJSON()
        for scr in screens { call(scr.web, "DW.applySettingsB64", json) }

        // 手动城市已给出坐标则无需定位；切回自动则重新定位
        if obj["useManualCity"] as? Bool == false {
            locate()
        }
    }

    // MARK: - WKNavigationDelegate：页面加载完成后注入配置

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let json = settingsJSON()
        if screens.contains(where: { $0.web === webView }) {
            call(webView, "DW.initB64", json)
            if !settings().useManual {
                // 特效页等待壳推送定位；若已有缓存定位直接推送
            }
        } else if webView === settingsWeb {
            call(webView, "DW.initB64", json)
        }
    }

    // MARK: - 定位

    private func locate() {
        location.request { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let lat, let lon, let city):
                for s in self.screens {
                    self.call(s.web, "DW.setCoordsB64",
                              ["lat": lat, "lon": lon, "city": city ?? ""])
                }
            case .unavailable:
                // 让页面自己走 IP 定位兜底
                for s in self.screens {
                    s.web.evaluateJavaScript("DW.noShellLocation()") { _, _ in }
                }
            }
        }
    }
}

/// 避免 WKUserContentController 强引用 delegate 造成泄漏
private final class LeakSafeHandler: NSObject, WKScriptMessageHandler {
    weak var target: AppDelegate?
    init(_ t: AppDelegate) { self.target = t }
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
