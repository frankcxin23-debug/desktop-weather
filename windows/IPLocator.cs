using System.Net.Http;
using System.Text.Json;

/// <summary>
/// IP 定位：绕过系统代理直连，拿真实运营商出口的位置。
/// 页面内的 IP 定位会走系统代理，代理出口节点会把城市带偏（例如台湾节点 → 台中）。
/// </summary>
static class IPLocator
{
    public record LocationInfo(double Lat, double Lon, string City, string Country);

    /// <summary>依次尝试多个服务商，任一成功即返回；全部失败返回 null。</summary>
    public static async Task<LocationInfo?> FetchAsync()
    {
        // UseProxy=false 关键：不走系统代理
        using var handler = new HttpClientHandler { UseProxy = false, Proxy = null };
        using var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(4) };

        return await TryJson(http, "https://ipwho.is/")
            ?? await TryJson(http, "http://ip-api.com/json/?lang=zh-CN&fields=status,lat,lon,city,countryCode")
            ?? await TryJson(http, "https://ipapi.co/json/");
    }

    static async Task<LocationInfo?> TryJson(HttpClient http, string url)
    {
        try
        {
            var raw = await http.GetStringAsync(url);
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;

            // ipwho.is 失败时带 success:false
            if (root.TryGetProperty("success", out var ok) && ok.ValueKind == JsonValueKind.False)
                return null;
            if (root.TryGetProperty("status", out var st) && st.ValueKind == JsonValueKind.String &&
                st.GetString() != "success")
                return null;

            double? lat = null, lon = null;
            string? city = null, country = null;

            if (root.TryGetProperty("latitude", out var la) && la.ValueKind == JsonValueKind.Number)
                lat = la.GetDouble();
            else if (root.TryGetProperty("lat", out var lat2) && lat2.ValueKind == JsonValueKind.Number)
                lat = lat2.GetDouble();

            if (root.TryGetProperty("longitude", out var lo) && lo.ValueKind == JsonValueKind.Number)
                lon = lo.GetDouble();
            else if (root.TryGetProperty("lon", out var lon2) && lon2.ValueKind == JsonValueKind.Number)
                lon = lon2.GetDouble();

            if (root.TryGetProperty("city", out var ci) && ci.ValueKind == JsonValueKind.String)
                city = ci.GetString();
            if (root.TryGetProperty("country_code", out var cc) && cc.ValueKind == JsonValueKind.String)
                country = cc.GetString();
            else if (root.TryGetProperty("countryCode", out var cc2) && cc2.ValueKind == JsonValueKind.String)
                country = cc2.GetString();

            if (lat is double laV && lon is double loV && Math.Abs(laV) <= 90 && Math.Abs(loV) <= 180)
                return new LocationInfo(laV, loV, city ?? "", country ?? "");
        }
        catch { /* 换下一个服务商 */ }
        return null;
    }
}
