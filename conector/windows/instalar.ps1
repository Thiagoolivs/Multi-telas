<#
.SYNOPSIS
  Instala o MultiTelas Conector: copia os arquivos, configura e registra uma
  tarefa agendada que liga junto com o Windows.

.DESCRIPTION
  Por que tarefa agendada e nao "servico do Windows": um servico precisa
  conversar com o Gerenciador de Servicos (SCM), e o MultiTelasConector.exe e
  um programa comum. Embrulhar com NSSM/WinSW seria mais um programa de
  terceiro para o TI auditar. A tarefa agendada faz o mesmo papel: liga com o
  Windows, antes de qualquer login, com a conta que voce escolher, e e
  religada se cair (gatilho de 5 em 5 minutos que nao abre uma segunda copia).

  A CONTA IMPORTA: a pasta de rede (\\servidor\...) so abre para quem tem
  permissao nela. A conta SYSTEM acessa a rede como o computador
  (DOMINIO\NOMEDOPC$) e quase nunca tem acesso ao compartilhamento.

.PARAMETER Conta
  DOMINIO\usuario que vai rodar o conector. Precisa LER a pasta de rede e a planilha.
.PARAMETER ContaGerenciada
  A conta e uma gMSA (DOMINIO\conta$): nao pede senha.
.PARAMETER UsarSistema
  Roda como SYSTEM. So funciona com pasta de rede se o compartilhamento der
  leitura ao computador (DOMINIO\NOMEDOPC$). Nao converte PowerPoint.
.PARAMETER Destino
  Pasta da instalacao. Padrao: C:\Program Files\MultiTelas Conector
.PARAMETER SemConfigurar
  Nao roda o "configurar" (use quando o conector.json ja esta pronto).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Conta EMPRESA\svc-multitelas
#>
[CmdletBinding()]
param(
  [string]$Conta,
  [switch]$ContaGerenciada,
  [switch]$UsarSistema,
  [string]$Destino = (Join-Path $env:ProgramFiles 'MultiTelas Conector'),
  [switch]$SemConfigurar
)

$ErrorActionPreference = 'Stop'
$NomeTarefa = 'MultiTelas Conector'
$Exe = 'MultiTelasConector.exe'

function Passo([string]$texto) { Write-Host ''; Write-Host "==> $texto" -ForegroundColor Cyan }
function Falhar([string]$texto) { Write-Host ''; Write-Host "ERRO: $texto" -ForegroundColor Red; exit 1 }

# 1. Precisa de administrador: grava em Program Files e registra a tarefa.
$eu = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $eu.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Falhar 'Abra o PowerShell como Administrador (botão direito › Executar como administrador) e rode de novo.'
}

$origem = $PSScriptRoot
if (-not (Test-Path (Join-Path $origem $Exe))) {
  Falhar "Não achei $Exe ao lado deste script ($origem). Extraia o MultiTelasConector.zip inteiro antes."
}

# 2. A conta que vai rodar o conector.
if ($UsarSistema) {
  $Conta = 'NT AUTHORITY\SYSTEM'
} elseif (-not $Conta) {
  $Conta = Read-Host 'Conta do Windows que vai rodar o conector (ex.: EMPRESA\svc-multitelas)'
}
if (-not $Conta) { Falhar 'Informe a conta com -Conta DOMINIO\usuario (ou -UsarSistema).' }
if (-not $UsarSistema -and $Conta -notmatch '\\') { $Conta = "$env:COMPUTERNAME\$Conta" }

$senha = $null
if (-not $UsarSistema -and -not $ContaGerenciada) {
  # A senha vai para o Agendador de Tarefas do Windows (guardada por ele), não para arquivo.
  $seguro = Read-Host "Senha de $Conta" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
  try { $senha = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# 3. Atualização: para o que estiver rodando, senão o .exe fica preso.
Passo 'Parando o conector, se já estiver instalado'
if (Get-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue
}
$exeFinal = Join-Path $Destino $Exe
Get-Process -Name 'MultiTelasConector' -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -and ($_.Path -ieq $exeFinal) } |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 4. Os arquivos.
Passo "Copiando os arquivos para $Destino"
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
foreach ($f in @($Exe, 'desinstalar.ps1', 'conector.exemplo.json', 'LEIA-ME.txt', 'SHA256.txt')) {
  $p = Join-Path $origem $f
  if (Test-Path $p) { Copy-Item -Path $p -Destination $Destino -Force }
}
# Tira a marca de "baixado da internet", senão o Windows pergunta antes de rodar.
Unblock-File -Path $exeFinal -ErrorAction SilentlyContinue
$shaArquivo = Join-Path $origem 'SHA256.txt'
if (Test-Path $shaArquivo) {
  $esperado = ((Get-Content $shaArquivo -TotalCount 1) -split '\s+')[0]
  $obtido = (Get-FileHash -Algorithm SHA256 -Path $exeFinal).Hash
  if ($esperado -and ($obtido -ne $esperado)) { Falhar "O $Exe não confere com o SHA256.txt (arquivo corrompido?). Baixe o pacote de novo." }
}

# 5. Permissões: o conector.json guarda o token. Administradores e SYSTEM com
#    controle total; a conta do conector pode modificar (grava log e estado);
#    usuários comuns, nada.
Passo 'Restringindo o acesso à pasta (o conector.json guarda o token)'
$regras = @('*S-1-5-32-544:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F')
if (-not $UsarSistema) { $regras += "${Conta}:(OI)(CI)M" }
& icacls.exe $Destino /inheritance:r /grant:r $regras | Out-Null
if ($LASTEXITCODE -ne 0) { Falhar "Não consegui ajustar as permissões de $Destino (icacls). A conta $Conta existe?" }

# 6. A configuração (servidor, token, caminhos). Roda com a SUA conta: o teste
#    de pasta aqui mostra o que você enxerga, não o que a conta do conector enxerga.
$config = Join-Path $Destino 'conector.json'
if (-not $SemConfigurar) {
  $configurar = 's'
  if (Test-Path $config) { $configurar = Read-Host 'Já existe um conector.json. Rodar o "configurar" de novo? (s/N)' }
  if ($configurar -match '^[sSyY]') {
    Passo 'Configurando (servidor, token e caminhos)'
    & $exeFinal configurar
    if ($LASTEXITCODE -ne 0) { Falhar "A configuração não foi salva. Rode de novo quando tiver o token do painel: & '$exeFinal' configurar" }
  }
}
if (-not (Test-Path $config)) {
  Write-Host "Atenção: ainda não há $config. O conector fica esperando até alguém rodar: & '$exeFinal' configurar" -ForegroundColor Yellow
}

# 7. A tarefa agendada.
Passo "Registrando a tarefa agendada ""$NomeTarefa"" (conta $Conta)"
$acao = New-ScheduledTaskAction -Execute $exeFinal -Argument 'rodar' -WorkingDirectory $Destino
$aoLigar = New-ScheduledTaskTrigger -AtStartup
$aoLigar.Delay = 'PT1M'   # dá tempo da rede e do DNS subirem
# Vigia: a cada 5 minutos tenta ligar; se já está rodando, não abre outra (IgnoreNew).
$vigia = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$descricao = 'Leva a pasta de rede, a planilha e o feed da intranet para o MultiTelas. Só faz conexões de saída (HTTPS). Status: MultiTelasConector.exe status'
try {
  if ($UsarSistema) {
    $quem = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Limited
    Register-ScheduledTask -TaskName $NomeTarefa -Description $descricao -Action $acao -Trigger @($aoLigar, $vigia) -Settings $ajustes -Principal $quem -Force | Out-Null
  } elseif ($ContaGerenciada) {
    $quem = New-ScheduledTaskPrincipal -UserId $Conta -LogonType Password -RunLevel Limited
    Register-ScheduledTask -TaskName $NomeTarefa -Description $descricao -Action $acao -Trigger @($aoLigar, $vigia) -Settings $ajustes -Principal $quem -Force | Out-Null
  } else {
    Register-ScheduledTask -TaskName $NomeTarefa -Description $descricao -Action $acao -Trigger @($aoLigar, $vigia) -Settings $ajustes -User $Conta -Password $senha -RunLevel Limited -Force | Out-Null
  }
} catch {
  Falhar ("Não consegui registrar a tarefa: " + $_.Exception.Message + " (senha errada? a conta precisa do direito 'Fazer logon como trabalho em lotes')")
} finally {
  $senha = $null
}

# 8. Liga agora e mostra o status.
Passo 'Ligando o conector'
Start-ScheduledTask -TaskName $NomeTarefa
Start-Sleep -Seconds 20
& $exeFinal status

Write-Host ''
Write-Host 'Instalado. O conector liga sozinho com o Windows (1 minuto depois do boot) e é religado se parar.' -ForegroundColor Green
Write-Host "Status a qualquer hora:  & '$exeFinal' status"
Write-Host "Log:                     $(Join-Path $Destino 'conector.log')"
if ($UsarSistema -or $ContaGerenciada) {
  Write-Host 'Lembrete: com SYSTEM ou gMSA, PowerPoint não é convertido em imagens. Para slides, use uma conta de usuário (veja o LEIA-ME).' -ForegroundColor Yellow
}
