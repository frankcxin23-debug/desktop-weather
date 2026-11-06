using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text;

namespace DesktopWeather;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new AppContext());
    }
}

/// <summary>应用主体：桌面特效窗口 + 托盘菜单 + 设置窗口</summary>
public sealed class AppContext : ApplicationContext
{
    private readonly Settings _settings = Settings.Load();
    private readonly Form _desktopForm;
    private readonly WebView2 _desktopWeb = new();
    private Form? _settingsForm;
    private WebView2? _settingsWeb;
    private readonly NotifyIcon _tray;
    private bool _desktopReady;
    private readonly ToolStripMenuItem _npItem = new("背景音乐") { Enabled = false };
    private readonly ToolStripMenuItem _ppItem = new("暂停背景音乐");
    private string _musicNow = "";
    private bool _musicPaused;

    public AppContext()
    {
        // ---- 桌面特效窗口：覆盖全部显示器，嵌入桌面图标层之下 ----
        _desktopForm = new Form
        {
            FormBorderStyle = FormBorderStyle.None,
            ShowInTaskbar = false,
            StartPosition = FormStartPosition.Manual,
            Bounds = SystemInformation.VirtualScreen,
            BackColor = Color.Black
        };
        _desktopWeb.Dock = DockStyle.Fill;
        _desktopForm.Controls.Add(_desktopWeb);
        _desktopForm.Show();

        AttachToDesktop();
        _ = InitDesktopWebAsync();

        // ---- 托盘 ----
        _ppItem.Click += (_, _) => _ = CallPage(_desktopWeb, "musicToggle", null);
        var nextItem = new ToolStripMenuItem("下一首");
        nextItem.Click += (_, _) => _ = CallPage(_desktopWeb, "musicNext", null);

        var menu = new ContextMenuStrip();
        menu.Items.Add(_npItem);
        menu.Items.Add(_ppItem);
        menu.Items.Add(nextItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("设置…", null, (_, _) => OpenSettings());
        menu.Items.Add("立即刷新", null, (_, _) => _ = CallPage(_desktopWeb, "DW.refresh", null));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出桌面天气", null, (_, _) => ExitApp());

        _tray = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "桌面天气",
            Visible = true,
            ContextMenuStrip = menu
        };
        _tray.DoubleClick += (_, _) => OpenSettings();
    }

    /// <summary>把窗口挂进桌面 WorkerW 层；失败则回退为普通最底层窗口</summary>
    private void AttachToDesktop()
    {
        try
        {
            IntPtr workerW = NativeMethods.GetDesktopWorkerW();
            if (workerW == IntPtr.Zero) return;

            IntPtr hwnd = _desktopForm.Handle;
            NativeMethods.SetParent(hwnd, workerW);
            int style = NativeMethods.GetWindowLong(hwnd, NativeMethods.GWL_STYLE);
            NativeMethods.SetWindowLong(hwnd, NativeMethods.GWL_STYLE, style | unchecked((int)NativeMethods.WS_CHILD));
            NativeMethods.SetWindowPos(hwnd, IntPtr.Zero, 0, 0,
                _desktopForm.Width, _desktopForm.Height,
                NativeMethods.SWP_NOZORDER | NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_FRAMECHANGED);
        }
        catch { /* 回退：保持普通窗口 */ }
    }

    private static string AppDir => System.AppContext.BaseDirectory;
    private static string PageUri(string page) =>
        new Uri(Path.Combine(AppDir, "app", page)).AbsoluteUri;

    private async Task InitDesktopWebAsync()
    {
        try
        {
            _desktopWeb.CreationProperties = new CoreWebView2CreationProperties
            {
                UserDataFolder = Path.Combine(AppDir, ".webview2data")
            };
            await _desktopWeb.EnsureCoreWebView2Async();
            _desktopWeb.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _desktopWeb.CoreWebView2.Settings.IsStatusBarEnabled = false;
            // 页面 → 壳：音乐播放状态（不落盘，只更新托盘菜单）
            _desktopWeb.CoreWebView2.WebMessageReceived += (_, e) =>
            {
                try { HandleMusicMessage(e.WebMessageAsJson); } catch { /* 忽略 */ }
            };
            _desktopWeb.CoreWebView2.NavigationCompleted += (_, _) =>
            {
                _desktopReady = true;
                _ = CallPage(_desktopWeb, "DW.initB64", _settings.ToPageJson());
                // Windows 壳不做系统级定位，让页面直接走 IP 定位
                _ = CallPage(_desktopWeb, "DW.noShellLocation", null);
            };
            _desktopWeb.CoreWebView2.Navigate(PageUri("index.html"));
        }
        catch (Exception ex)
        {
            MessageBox.Show("初始化 WebView2 失败，请确认已安装 Microsoft Edge WebView2 运行时。\n" + ex.Message,
                "桌面天气", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // ---- 设置窗口 ----
    private void OpenSettings()
    {
        if (_settingsForm != null)
        {
            _settingsForm.Activate();
            return;
        }
        var form = new Form
        {
            Text = "桌面天气设置",
            StartPosition = FormStartPosition.CenterScreen,
            Size = new Size(480, 640),
            MinimumSize = new Size(420, 520),
            BackColor = Color.FromArgb(22, 22, 24)
        };
        var web = new WebView2 { Dock = DockStyle.Fill };
        form.Controls.Add(web);
        _settingsForm = form;
        _settingsWeb = web;
        form.FormClosed += (_, _) => { _settingsForm = null; _settingsWeb = null; };
        form.Show();
        _ = InitSettingsWebAsync(web);
    }

    private async Task InitSettingsWebAsync(WebView2 web)
    {
        try
        {
            web.CreationProperties = new CoreWebView2CreationProperties
            {
                UserDataFolder = Path.Combine(AppDir, ".webview2data")
            };
            await web.EnsureCoreWebView2Async();
            web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            // 设置页 → 壳：保存设置
            web.CoreWebView2.WebMessageReceived += (_, e) =>
            {
                try { ApplySettingsFromPage(e.WebMessageAsJson); }
                catch { /* 忽略非法消息 */ }
            };
            web.CoreWebView2.NavigationCompleted += (_, _) =>
                _ = CallPage(web, "DW.initB64", _settings.ToPageJson());
            web.CoreWebView2.Navigate(PageUri("settings.html"));
        }
        catch { /* 忽略 */ }
    }

    private void HandleMusicMessage(string json)
    {
        using var doc = System.Text.Json.JsonDocument.Parse(json);
        var root = doc.RootElement;
        if (!root.TryGetProperty("type", out var t) || t.GetString() != "music") return;
        _musicPaused = root.TryGetProperty("paused", out var p) && p.GetBoolean();
        string title = root.TryGetProperty("title", out var ti) ? ti.GetString() ?? "" : "";
        string artist = root.TryGetProperty("artist", out var ar) ? ar.GetString() ?? "" : "";
        _musicNow = title.Length == 0 ? "" : title + (artist.Length == 0 ? "" : $" - {artist}");

        _npItem.Text = _musicNow.Length == 0
            ? (_musicPaused ? "背景音乐已暂停" : "背景音乐")
            : $"正在播放：{_musicNow}";
        _ppItem.Text = _musicPaused ? "播放背景音乐" : "暂停背景音乐";
    }

    private void ApplySettingsFromPage(string json)
    {
        using var doc = System.Text.Json.JsonDocument.Parse(json);
        var root = doc.RootElement;
        if (root.TryGetProperty("intensity", out var i)) _settings.Intensity = i.GetDouble();
        if (root.TryGetProperty("useManualCity", out var m)) _settings.UseManualCity = m.GetBoolean();
        if (root.TryGetProperty("cityName", out var c)) _settings.CityName = c.GetString() ?? "";
        _settings.Lat = root.TryGetProperty("lat", out var la) && la.ValueKind != System.Text.Json.JsonValueKind.Null
            ? la.GetDouble() : null;
        _settings.Lon = root.TryGetProperty("lon", out var lo) && lo.ValueKind != System.Text.Json.JsonValueKind.Null
            ? lo.GetDouble() : null;
        if (root.TryGetProperty("country", out var co) && co.ValueKind == System.Text.Json.JsonValueKind.String)
            _settings.Country = co.GetString() ?? "";
        if (root.TryGetProperty("music", out var mu) && mu.ValueKind == System.Text.Json.JsonValueKind.Object)
            _settings.Music = mu.GetRawText();
        _settings.Save();

        if (_desktopReady)
            _ = CallPage(_desktopWeb, "DW.applySettingsB64", _settings.ToPageJson());
    }

    /// <summary>以 base64(JSON) 调用页面函数，与 macOS 壳协议一致</summary>
    private static async Task CallPage(WebView2 web, string fn, string? jsonPayload)
    {
        try
        {
            if (web.CoreWebView2 == null) return;
            if (jsonPayload == null)
            {
                await web.CoreWebView2.ExecuteScriptAsync($"{fn}()");
            }
            else
            {
                string b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(jsonPayload));
                await web.CoreWebView2.ExecuteScriptAsync($"{fn}('{b64}')");
            }
        }
        catch { /* 页面尚未就绪时忽略 */ }
    }

    private void ExitApp()
    {
        _tray.Visible = false;
        _settingsForm?.Close();
        _desktopForm.Close();
        Application.Exit();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _tray.Dispose();
            _desktopWeb.Dispose();
            _settingsWeb?.Dispose();
        }
        base.Dispose(disposing);
    }
}
