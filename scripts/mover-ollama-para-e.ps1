# Migra modelos Ollama de C: para E:\ollama\models
$ErrorActionPreference = 'Continue'
$env:TEMP = 'E:\TEMP'
$env:TMP = 'E:\TEMP'
New-Item -ItemType Directory -Force -Path 'E:\TEMP', 'E:\ollama\models' | Out-Null

Write-Host '=== Espaco em disco ===' -ForegroundColor Cyan
Get-PSDrive C, E | Format-Table Name, @{N='LivreGB';E={[math]::Round($_.Free/1GB,1)}} -AutoSize

Write-Host '=== Parar Ollama ===' -ForegroundColor Cyan
Get-Process ollama* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Service ollama -ErrorAction SilentlyContinue | Stop-Service -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$origem = Join-Path $env:USERPROFILE '.ollama\models'
$destino = 'E:\ollama\models'

Write-Host '=== Apagar downloads parciais em C: ===' -ForegroundColor Cyan
if (Test-Path (Join-Path $origem 'blobs')) {
  Get-ChildItem (Join-Path $origem 'blobs') -Filter '*-partial' -ErrorAction SilentlyContinue |
    ForEach-Object {
      Write-Host "  remove $($_.Name)"
      Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "=== Mover modelos: $origem -> $destino ===" -ForegroundColor Cyan
if (Test-Path $origem) {
  & robocopy $origem $destino /E /MOVE /R:2 /W:2
  $code = $LASTEXITCODE
  Write-Host "robocopy exit=$code (0-7 = OK)"
  New-Item -ItemType Directory -Force -Path $origem | Out-Null
} else {
  Write-Host 'Pasta de origem inexistente — so configura destino.'
}

Write-Host '=== Variavel de utilizador OLLAMA_MODELS ===' -ForegroundColor Cyan
[Environment]::SetEnvironmentVariable('OLLAMA_MODELS', $destino, 'User')
$env:OLLAMA_MODELS = $destino
Write-Host "OLLAMA_MODELS=$([Environment]::GetEnvironmentVariable('OLLAMA_MODELS','User'))"

Write-Host '=== Reiniciar Ollama ===' -ForegroundColor Cyan
$ollamaExe = @(
  "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
  "$env:ProgramFiles\Ollama\ollama.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($ollamaExe) {
  Start-Process -FilePath $ollamaExe -WindowStyle Hidden
} else {
  Start-Process 'ollama' -WindowStyle Hidden -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 3

Write-Host '=== Modelos (ollama list) ===' -ForegroundColor Cyan
& ollama list

Write-Host '=== Espaco apos ===' -ForegroundColor Cyan
Get-PSDrive C, E | Format-Table Name, @{N='LivreGB';E={[math]::Round($_.Free/1GB,1)}} -AutoSize

Write-Host ''
Write-Host 'Feito. Abre um NOVO terminal e corre: ollama pull qwen3.5:9b' -ForegroundColor Green
Write-Host 'Prima Enter para fechar...'
Read-Host
