Add-Type -AssemblyName System.Drawing

$sourcePath = "C:/Users/Dell/.gemini/antigravity/brain/5c8ac541-a393-4c72-8416-d63f3dd9a103/.user_uploaded/media_1787151876836.jpg"
$baseDir = "C:/Users/Dell/Documents/orbia"

# 1. Load Source Image
$srcImg = [System.Drawing.Image]::FromFile($sourcePath)

# 2. Save PNG destinations
$pngDests = @(
    "$baseDir/resources/icon.png",
    "$baseDir/build/icon.png",
    "$baseDir/src/renderer/src/assets/icon.png"
)

foreach ($dest in $pngDests) {
    $dir = [System.IO.Path]::GetDirectoryName($dest)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    
    # Save high quality PNG
    $bitmap = New-Object System.Drawing.Bitmap($srcImg.Width, $srcImg.Height)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($srcImg, 0, 0, $srcImg.Width, $srcImg.Height)
    $g.Dispose()
    
    $bitmap.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    Write-Host "Saved PNG: $dest"
}

# 3. Create Multi-Resolution ICO File
$sizes = @(256, 128, 64, 48, 32, 16)
$pngFrames = @()

foreach ($sz in $sizes) {
    $resized = New-Object System.Drawing.Bitmap($sz, $sz)
    $g = [System.Drawing.Graphics]::FromImage($resized)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($srcImg, 0, 0, $sz, $sz)
    $g.Dispose()
    
    $ms = New-Object System.IO.MemoryStream
    $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $resized.Dispose()
    
    $bytes = $ms.ToArray()
    $ms.Dispose()
    
    $pngFrames += [PSCustomObject]@{
        Size = $sz
        Bytes = $bytes
    }
}

# Write ICO binary format with PNG frames
function Write-IcoFile($targetPath, $frames) {
    $fs = [System.IO.File]::Create($targetPath)
    $bw = New-Object System.IO.BinaryWriter($fs)
    
    # ICO Header
    $bw.Write([UInt16]0) # Reserved
    $bw.Write([UInt16]1) # Type (1 = ICO)
    $bw.Write([UInt16]$frames.Count) # Number of images
    
    $offset = 6 + (16 * $frames.Count)
    
    # Directory entries
    foreach ($f in $frames) {
        $w = if ($f.Size -ge 256) { 0 } else { [byte]$f.Size }
        $h = if ($f.Size -ge 256) { 0 } else { [byte]$f.Size }
        $bw.Write([byte]$w)
        $bw.Write([byte]$h)
        $bw.Write([byte]0) # Palette
        $bw.Write([byte]0) # Reserved
        $bw.Write([UInt16]1) # Color planes
        $bw.Write([UInt16]32) # Bits per pixel
        $bw.Write([UInt32]$f.Bytes.Length) # Image size
        $bw.Write([UInt32]$offset) # Image offset
        $offset += $f.Bytes.Length
    }
    
    # Image data
    foreach ($f in $frames) {
        $bw.Write($f.Bytes)
    }
    
    $bw.Flush()
    $bw.Close()
    $fs.Close()
    Write-Host "Saved ICO: $targetPath"
}

$icoDests = @(
    "$baseDir/build/icon.ico",
    "$baseDir/resources/icon.ico"
)

foreach ($icoPath in $icoDests) {
    $dir = [System.IO.Path]::GetDirectoryName($icoPath)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    Write-IcoFile $icoPath $pngFrames
}

$srcImg.Dispose()
Write-Host "Icon generation completed successfully!"
