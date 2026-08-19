$wsh = New-Object -ComObject WScript.Shell
$iconPath = "C:\Users\Dell\AppData\Local\Programs\orbia\app_icon.ico"
$srcIcon = "C:\Users\Dell\Documents\orbia\build\icon.ico"

# Ensure icon file exists in install directory
if (-not (Test-Path $iconPath) -or ((Get-Item $iconPath).Length -ne (Get-Item $srcIcon).Length)) {
    Copy-Item $srcIcon -Destination $iconPath -Force
    Write-Host "Updated $iconPath from build/icon.ico"
}

# Directories where Windows stores shortcuts
$shortcutDirs = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('CommonDesktopDirectory'),
    [Environment]::GetFolderPath('StartMenu'),
    [Environment]::GetFolderPath('CommonStartMenu'),
    [Environment]::GetFolderPath('Programs'),
    [Environment]::GetFolderPath('CommonPrograms'),
    "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
)

foreach ($dir in $shortcutDirs) {
    if (Test-Path $dir) {
        Get-ChildItem -Path $dir -Recurse -Filter "*orbia*.lnk" -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                $sh = $wsh.CreateShortcut($_.FullName)
                Write-Host "Found shortcut: $($_.FullName)"
                Write-Host "  Current Icon: $($sh.IconLocation)"
                $sh.IconLocation = "$iconPath,0"
                $sh.Save()
                Write-Host "  Updated to: $iconPath,0"
            } catch {
                Write-Host "  Error updating $($_.FullName): $_"
            }
        }
    }
}

# Refresh Windows Shell Icon Cache via SHChangeNotify
$code = @'
using System;
using System.Runtime.InteropServices;

public class ShellNotify {
    [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

    public static void Refresh() {
        // SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0x0000
        SHChangeNotify(0x08000000, 0x0000, IntPtr.Zero, IntPtr.Zero);
    }
}
'@

Add-Type -TypeDefinition $code -Language CSharp
[ShellNotify]::Refresh()

Write-Host "All shortcuts updated and Windows icon cache refresh signal sent!"
