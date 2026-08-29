$wsh = New-Object -ComObject WScript.Shell
$installDir = Join-Path ($env:LOCALAPPDATA) "Programs\orbia"
$exePath = Join-Path $installDir "orbia.exe"
$iconPath = Join-Path $installDir "app_icon.ico"
$srcIcon = Join-Path (Split-Path -Parent $PSScriptRoot) "build\icon.ico"

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

$processedShortcuts = @{}

foreach ($dir in $shortcutDirs) {
    if (Test-Path $dir) {
        Get-ChildItem -Path $dir -Recurse -Filter "*orbia*.lnk" -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                if ($processedShortcuts.ContainsKey($_.FullName)) {
                    return
                }
                $processedShortcuts[$_.FullName] = $true

                $sh = $wsh.CreateShortcut($_.FullName)
                Write-Host "Found shortcut: $($_.FullName)"
                Write-Host "  Current Target: $($sh.TargetPath)"

                # Some old shell-created links keep only an ID list and ignore
                # TargetPath updates. Recreate those links so the current app
                # executable is persisted as the actual target.
                if ($sh.TargetPath -ne $exePath) {
                    Remove-Item -LiteralPath $_.FullName -Force
                    $sh = $wsh.CreateShortcut($_.FullName)
                }

                $sh.TargetPath = $exePath
                $sh.WorkingDirectory = $installDir
                $sh.IconLocation = "$iconPath,0"
                $sh.Save()
                Write-Host "  Updated Target: $exePath"
                Write-Host "  Updated Icon: $iconPath,0"
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
