# 1. Kill any existing orbia processes
Stop-Process -Name orbia -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# 2. Check if any are still running
$procs = Get-Process -Name orbia -ErrorAction SilentlyContinue
if ($procs) {
    Write-Host "WARNING: Could not kill processes: $($procs.Id)"
} else {
    Write-Host "All orbia processes terminated successfully."
}

# 3. Check AppData logs
$appDataLog = "$env:APPDATA\orbia\logs"
if (Test-Path $appDataLog) {
    Write-Host "=== Log files in $appDataLog ==="
    Get-ChildItem -Path $appDataLog | ForEach-Object {
        Write-Host "--- $($_.FullName) ---"
        Get-Content $_.FullName -Tail 50
    }
}

# 4. Start installed orbia.exe and capture output
$installedExe = "$env:LOCALAPPDATA\Programs\orbia\orbia.exe"
Write-Host "`nStarting $installedExe ..."

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $installedExe
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $false

$p = [System.Diagnostics.Process]::Start($psi)
Start-Sleep -Seconds 3

Write-Host "Process ID: $($p.Id), HasExited: $($p.HasExited)"
if ($p.HasExited) {
    Write-Host "ExitCode: $($p.ExitCode)"
    Write-Host "StdOut: $($p.StandardOutput.ReadToEnd())"
    Write-Host "StdErr: $($p.StandardError.ReadToEnd())"
} else {
    Write-Host "Process is running normally! MainWindowHandle: $($p.MainWindowHandle)"
}
