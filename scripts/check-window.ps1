Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinUtil {
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@

$procs = Get-Process -Name orbia -ErrorAction SilentlyContinue
foreach ($p in $procs) {
    Write-Host "Process Id: $($p.Id), MainWindowHandle: $($p.MainWindowHandle), MainWindowTitle: '$($p.MainWindowTitle)'"
    if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
        $visible = [WinUtil]::IsWindowVisible($p.MainWindowHandle)
        Write-Host "  IsWindowVisible: $visible"
        # Force show normal (1) and foreground
        [WinUtil]::ShowWindow($p.MainWindowHandle, 1) | Out-Null
        [WinUtil]::ShowWindow($p.MainWindowHandle, 9) | Out-Null # SW_RESTORE
        [WinUtil]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
        Write-Host "  Sent ShowWindow SW_RESTORE and SetForegroundWindow!"
    }
}
