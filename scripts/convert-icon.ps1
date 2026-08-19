Add-Type -AssemblyName System.Drawing

$sourcePath = "C:/Users/Dell/.gemini/antigravity/brain/5c8ac541-a393-4c72-8416-d63f3dd9a103/.user_uploaded/media_1787151876836.jpg"
$baseDir = "C:/Users/Dell/Documents/orbia"

# Load source image
$srcImg = [System.Drawing.Image]::FromFile($sourcePath)

# 1. High-Res PNGs (1024x1024)
$pngDests = @(
    "$baseDir/resources/icon.png",
    "$baseDir/build/icon.png",
    "$baseDir/src/renderer/src/assets/icon.png"
)

foreach ($dest in $pngDests) {
    $bitmap = New-Object System.Drawing.Bitmap(1024, 1024)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($srcImg, 0, 0, 1024, 1024)
    $g.Dispose()
    
    $bitmap.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    Write-Host "Saved PNG: $dest"
}

# 2. Native Multi-Resolution ICO using System.Drawing.Icon
$ico256Bmp = New-Object System.Drawing.Bitmap(256, 256)
$g256 = [System.Drawing.Graphics]::FromImage($ico256Bmp)
$g256.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g256.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g256.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g256.DrawImage($srcImg, 0, 0, 256, 256)
$g256.Dispose()

$hIcon = $ico256Bmp.GetHicon()
$nativeIcon = [System.Drawing.Icon]::FromHandle($hIcon)

$icoDests = @(
    "$baseDir/build/icon.ico",
    "$baseDir/resources/icon.ico"
)

foreach ($icoPath in $icoDests) {
    $fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
    $nativeIcon.Save($fs)
    $fs.Close()
    Write-Host "Saved Native GDI ICO: $icoPath"
}

$nativeIcon.Dispose()
$ico256Bmp.Dispose()
$srcImg.Dispose()
Write-Host "All icons regenerated with native Windows GDI support!"
