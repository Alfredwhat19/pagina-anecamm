param(
  [int]$Port = 5500,
  [string]$Root = (Get-Location).Path
)

Add-Type -AssemblyName System.Web

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Error "No se pudo iniciar en $prefix. El puerto ya esta en uso. Prueba otro, por ejemplo: -Port 8080"
  return
}
Write-Host "Servidor local activo en $prefix"
Write-Host "Sirviendo carpeta: $Root"

$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8';
  '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.txt'='text/plain; charset=utf-8';
  '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.png'='image/png'; '.gif'='image/gif';
  '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.webp'='image/webp'
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    $path = [System.Web.HttpUtility]::UrlDecode($req.Url.AbsolutePath)
    if ([string]::IsNullOrWhiteSpace($path) -or $path -eq '/') { $path = '/index.html' }

    $local = Join-Path $Root ($path.TrimStart('/').Replace('/', '\\'))

    if ((Test-Path $local) -and (Get-Item $local).PSIsContainer) {
      $local = Join-Path $local 'index.html'
    }

    if (Test-Path $local) {
      $ext = [IO.Path]::GetExtension($local).ToLowerInvariant()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [IO.File]::ReadAllBytes($local)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.StatusCode = 200
    } else {
      $msg = [Text.Encoding]::UTF8.GetBytes('404 Not Found')
      $res.ContentType = 'text/plain; charset=utf-8'
      $res.StatusCode = 404
      $res.ContentLength64 = $msg.Length
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }

    $res.OutputStream.Close()
  }
}
finally {
  if ($listener -and $listener.IsListening) {
    $listener.Stop()
  }
  if ($listener) {
    $listener.Close()
  }
}
