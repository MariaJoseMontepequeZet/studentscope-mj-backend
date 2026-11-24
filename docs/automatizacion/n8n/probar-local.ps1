# Levanta un n8n de prueba, separado del tuyo, apuntando a la API local (puerto 3100).
# Lee la cuenta de administrador local desde el .env del backend; no escribe nada fuera de la carpeta de prueba.
$raiz = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$valores = @{}
Get-Content (Join-Path $raiz '.env') | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)=(.*)$') { $valores[$Matches[1]] = $Matches[2] }
}

$env:N8N_USER_FOLDER = Join-Path $env:USERPROFILE 'n8n-prueba'
$env:N8N_PORT = '5679'
$env:N8N_BLOCK_ENV_ACCESS_IN_NODE = 'false'
$env:GENERIC_TIMEZONE = 'America/Guatemala'
$env:STUDENTSCOPE_URL = 'http://127.0.0.1:3100'
$env:STUDENTSCOPE_EMAIL = $valores['ADMIN_EMAIL']
$env:STUDENTSCOPE_PASSWORD = $valores['ADMIN_PASSWORD']
if (-not $env:AVISOS_REMITENTE) { $env:AVISOS_REMITENTE = 'avisos@ejemplo.com' }
if (-not $env:AVISOS_DESTINO) { $env:AVISOS_DESTINO = 'tu-correo@ejemplo.com' }

Write-Host 'n8n de prueba en http://localhost:5679 (Ctrl+C para detenerlo)'
npx n8n
