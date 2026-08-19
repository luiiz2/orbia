Add-Type -AssemblyName System.Drawing

$exePath = "C:\Users\Dell\AppData\Local\Programs\orbia\orbia.exe"
$desktopLnk = "C:\Users\Dell\Desktop\Orbia.lnk"
$startLnk = "C:\Users\Dell\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Orbia.lnk"

# 1. Copy icon.ico directly into the install folder
$installIco = "C:\Users\Dell\AppData\Local\Programs\orbia\app_icon.ico"
Copy-Item "C:\Users\Dell\Documents\orbia\build\icon.ico" -Destination $installIco -Force
Write-Host "Copied icon to: $installIco"

# 2. Update shortcut icon location explicitly to the .ico file
$wsh = New-Object -ComObject WScript.Shell

if (Test-Path $desktopLnk) {
    $sh = $wsh.CreateShortcut($desktopLnk)
    $sh.IconLocation = "$installIco,0"
    $sh.Save()
    Write-Host "Updated Desktop shortcut IconLocation to: $installIco"
}

if (Test-Path $startLnk) {
    $sh = $wsh.CreateShortcut($startLnk)
    $sh.IconLocation = "$installIco,0"
    $sh.Save()
    Write-Host "Updated StartMenu shortcut IconLocation to: $installIco"
}

# 3. Check icon extraction from exe
try {
    $extracted = [System.Drawing.Icon]::ExtractAssociatedIcon($exePath)
    Write-Host "Extracted Icon from EXE: Width=$($extracted.Width), Height=$($extracted.Height)"
    $extracted.Dispose()
} catch {
    Write-Host "Could not extract icon from exe: $_"
}

# 4. Refresh Windows Shell Icon Cache
$code = @'
using System;
using System.Runtime.InteropServices;

public class ShellIconCache {
    [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

    public static void Refresh() {
        // SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0x0000
        SHChangeNotify(0x08000000, 0x0000, IntPtr.Zero, IntPtr.Zero);
    }
}
'@

Add-Type -TypeDefinition $code -Language CSharp
[ShellIconCache]::Refresh()
Write-Host "Triggered Windows SHChangeNotify icon cache refresh!"
