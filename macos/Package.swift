// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "DesktopWeather",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "DesktopWeather",
            path: "Sources/DesktopWeather"
        )
    ]
)
