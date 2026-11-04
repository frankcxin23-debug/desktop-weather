using System.Runtime.InteropServices;

namespace DesktopWeather;

/// <summary>
/// 桌面嵌入所需的 Win32 API：
/// 通过 Progman/WorkerW 技巧把窗口挂到桌面图标层之下（Wallpaper Engine 同款方案）。
/// </summary>
internal static class NativeMethods
{
    public const int GWL_STYLE = -16;
    public const uint WS_CHILD = 0x40000000;
    public const uint SWP_NOZORDER = 0x0004;
    public const uint SWP_NOACTIVATE = 0x0010;
    public const uint SWP_FRAMECHANGED = 0x0020;
    public const uint SMTO_NORMAL = 0x0000;

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindow(string? lpClassName, string? lpWindowName);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string? lpszClass, string? lpszWindow);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam,
        uint fuFlags, uint uTimeout, out IntPtr lpdwResult);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint uFlags);

    /// <summary>
    /// 找到承载桌面图标层的 WorkerW 窗口；返回 IntPtr.Zero 表示失败（将回退为普通底层窗口）。
    /// </summary>
    public static IntPtr GetDesktopWorkerW()
    {
        IntPtr progman = FindWindow("Progman", null);
        if (progman == IntPtr.Zero) return IntPtr.Zero;

        // 让 Progman 派生出 WorkerW（经典 0x052C 消息）
        SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), IntPtr.Zero, SMTO_NORMAL, 1000, out _);

        IntPtr workerW = IntPtr.Zero;
        EnumWindows((top, _) =>
        {
            // 含图标列表视图(SHELLDLLDEFVIEW)的顶层窗口的下一个 WorkerW 兄弟窗口即为目标
            IntPtr shellView = FindWindowEx(top, IntPtr.Zero, "SHELLDLLDEFVIEW", null);
            if (shellView != IntPtr.Zero)
            {
                workerW = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
            }
            return true;
        }, IntPtr.Zero);

        return workerW;
    }
}
