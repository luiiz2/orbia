Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public class WindowFinder {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder strText, int maxCount);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    public static List<string> FindOrbiaWindows() {
        var list = new List<string>();
        EnumWindows((hWnd, lParam) => {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            int size = GetWindowTextLength(hWnd);
            if (size > 0) {
                var sb = new StringBuilder(size + 1);
                GetWindowText(hWnd, sb, size + 1);
                string title = sb.ToString();
                if (title.IndexOf("Orbia", StringComparison.OrdinalIgnoreCase) >= 0) {
                    bool visible = IsWindowVisible(hWnd);
                    list.Add(string.Format("HWND: 0x{0:X}, PID: {1}, Visible: {2}, Title: '{3}'", hWnd.ToInt64(), pid, visible, title));
                    // Force show and focus
                    ShowWindow(hWnd, 9); // SW_RESTORE
                    ShowWindow(hWnd, 5); // SW_SHOW
                    SetForegroundWindow(hWnd);
                }
            }
            return true;
        }, IntPtr.Zero);
        return list;
    }
}
"@

$res = [WindowFinder]::FindOrbiaWindows()
Write-Host "Found $($res.Count) Orbia windows:"
$res | ForEach-Object { Write-Host "  $_" }
