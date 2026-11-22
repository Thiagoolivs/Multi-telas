<#
.SYNOPSIS
  Remove o MultiTelas Conector: para e apaga a tarefa agendada e, com
  -ApagarArquivos, a pasta da instalação (com o conector.json, o log e o estado).

.PARAMETER Destino
  Pasta da instalação. Padrão: C:\Program Files\MultiTelas Conector
.PARAMETER ApagarArquivos
  Apaga também a pasta. Sem isto, os arquivos ficam (para reinstalar sem configurar de novo).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\desinstalar.ps1 -ApagarArquivos
#>
[CmdletBinding()]
param(
  [string]$Destino = (Join-Path $env:ProgramFiles 'MultiTelas Conector'),
  [switch]$ApagarArquivos
)

$ErrorActionPreference = 'Stop'
$NomeTarefa = 'MultiTelas Conector'

$eu = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $eu.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'ERRO: abra o PowerShell como Administrador e rode de novo.' -ForegroundColor Red
  exit 1
}

Write-Host '==> Parando e removendo a tarefa agendada' -ForegroundColor Cyan
if (Get-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $NomeTarefa -Confirm:$false
  Write-Host "Tarefa ""$NomeTarefa"" removida."
} else {
  Write-Host "A tarefa ""$NomeTarefa"" não estava registrada."
}

# Alguém pode ter aberto o .exe à mão: fecha os que rodam desta pasta.
$exe = Join-Path $Destino 'MultiTelasConector.exe'
Get-Process -Name 'MultiTelasConector' -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -and ($_.Path -ieq $exe) } |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

if ($ApagarArquivos) {
  Write-Host "==> Apagando $Destino" -ForegroundColor Cyan
  # Sai da pasta antes (o PowerShell pode estar dentro dela, rodando este script).
  Set-Location $env:TEMP
  if (Test-Path $Destino) { Remove-Item -Recurse -Force -Path $Destino }
  Write-Host 'Pasta apagada.'
} else {
  Write-Host "Os arquivos ficaram em $Destino (conector.json com o token, log e estado)."
  Write-Host 'Para apagar também: rode de novo com -ApagarArquivos.'
}

Write-Host ''
Write-Host 'Feito. Lembre de REVOGAR o token no painel do MultiTelas: ele continua válido até alguém revogar.' -ForegroundColor Yellow
Write-Host 'O que já foi enviado continua nas TVs; tire pelo painel, se for o caso.'
