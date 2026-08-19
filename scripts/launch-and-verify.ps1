# 1. Stop any existing processes
Stop-Process -Name orbia -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# 2. Invoke desktop shortcut
$desktopLnk = "C:\Users\Dell\Desktop\Orbia.lnk"
Write-Host "Opening shortcut: $desktopLnk"
Invoke-Item $desktopLnk

Start-Sleep -Seconds 5

# 3. Check processes and window title
$procs = Get-Process -Name orbia -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, MainWindowTitle, Responding, MainWindowHandle
Write-Host "Running Orbia processes:"
$procs | Format-Table -AutoSize

# 4. Check top-level windows
powershell -ExecutionPolicy Bypass -File "scripts/find-orbia-windows.ps1"
