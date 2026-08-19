$wsh = New-Object -ComObject WScript.Shell

Write-Host "=== RUNNING PROCESSES ==="
Get-Process -Name orbia -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path

Write-Host "`n=== DESKTOP SHORTCUTS ==="
$desktop = [Environment]::GetFolderPath('Desktop')
Get-ChildItem -Path $desktop -Filter "*orbia*.lnk" -ErrorAction SilentlyContinue | ForEach-Object {
    $sh = $wsh.CreateShortcut($_.FullName)
    Write-Host "File: $($_.FullName)"
    Write-Host "Target: $($sh.TargetPath)"
    Write-Host "IconLocation: $($sh.IconLocation)"
}

$commonDesktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
Get-ChildItem -Path $commonDesktop -Filter "*orbia*.lnk" -ErrorAction SilentlyContinue | ForEach-Object {
    $sh = $wsh.CreateShortcut($_.FullName)
    Write-Host "CommonDesktop File: $($_.FullName)"
    Write-Host "Target: $($sh.TargetPath)"
    Write-Host "IconLocation: $($sh.IconLocation)"
}

Write-Host "`n=== START MENU SHORTCUTS ==="
$startMenu = [Environment]::GetFolderPath('StartMenu')
Get-ChildItem -Path $startMenu -Recurse -Filter "*orbia*.lnk" -ErrorAction SilentlyContinue | ForEach-Object {
    $sh = $wsh.CreateShortcut($_.FullName)
    Write-Host "StartMenu: $($_.FullName)"
    Write-Host "Target: $($sh.TargetPath)"
    Write-Host "IconLocation: $($sh.IconLocation)"
}

$appDataProg = "$env:LOCALAPPDATA\Programs\orbia"
Write-Host "`n=== INSTALLED DIRECTORY: $appDataProg ==="
if (Test-Path $appDataProg) {
    Get-ChildItem -Path $appDataProg | Select-Object Name, Length, LastWriteTime
} else {
    Write-Host "Path does not exist!"
}

Write-Host "`n=== DIST UNPACKED EXE ==="
if (Test-Path "dist\win-unpacked\orbia.exe") {
    Get-Item "dist\win-unpacked\orbia.exe" | Select-Object FullName, Length, LastWriteTime
}
