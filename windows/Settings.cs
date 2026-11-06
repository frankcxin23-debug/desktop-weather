using System.Text;
using System.Text.Json;

namespace DesktopWeather;

/// <summary>设置模型与持久化（%APPDATA%\DesktopWeather\settings.json）</summary>
public sealed class Settings
{
    public double Intensity { get; set; } = 1.0;
    public bool UseManualCity { get; set; } = false;
    public string CityName { get; set; } = "";
    public double? Lat { get; set; }
    public double? Lon { get; set; }
    public string Country { get; set; } = "";
    public string? Music { get; set; }

    private static string Dir =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DesktopWeather");
    private static string FilePath => Path.Combine(Dir, "settings.json");

    public static Settings Load()
    {
        try
        {
            if (File.Exists(FilePath))
                return JsonSerializer.Deserialize<Settings>(File.ReadAllText(FilePath)) ?? new Settings();
        }
        catch { /* 损坏则重建 */ }
        return new Settings();
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Dir);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this));
        }
        catch { /* 忽略写入失败 */ }
    }

    /// <summary>页面接收的 JSON（与 macOS 壳保持一致）</summary>
    public string ToPageJson()
    {
        var sb = new StringBuilder();
        sb.Append('{');
        sb.Append($"\"intensity\":{Intensity.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)},");
        sb.Append($"\"useManualCity\":{(UseManualCity ? "true" : "false")},");
        sb.Append($"\"cityName\":{JsonSerializer.Serialize(CityName)}");
        if (Lat.HasValue) sb.Append($",\"lat\":{Lat.Value.ToString("0.######", System.Globalization.CultureInfo.InvariantCulture)}");
        if (Lon.HasValue) sb.Append($",\"lon\":{Lon.Value.ToString("0.######", System.Globalization.CultureInfo.InvariantCulture)}");
        if (!string.IsNullOrEmpty(Country)) sb.Append($",\"country\":{JsonSerializer.Serialize(Country)}");
        if (!string.IsNullOrEmpty(Music)) sb.Append($",\"music\":{Music}");
        sb.Append('}');
        return sb.ToString();
    }
}
