'use strict';
/*
 * PowerPoint e PDF → uma imagem PNG por slide/página.
 *
 * A TV não toca .pptx nem .pdf (o visualizador da Microsoft não alcança a
 * mídia e o WebView do Android não desenha PDF), e o servidor recusa os dois.
 * Mas o PC do cliente tem o Office: aqui o próprio Windows faz a conversão.
 *
 *  - .pptx/.ppt: automação do PowerPoint (PowerPoint.Application, Slide.Export).
 *  - .pdf: a API do Windows Windows.Data.Pdf (WinRT), sem programa extra.
 *
 * Os dois rodam num powershell.exe (o 5.1, que todo Windows 10/11/Server tem
 * e que fala WinRT), com o script passado por -EncodedCommand: assim a
 * política de execução de scripts .ps1 não bloqueia, e nada é gravado em disco.
 *
 * Tudo atrás de `converter(tipo, entrada, saida)`, para os testes trocarem
 * por um conversor falso. A conversão em si só roda no Windows — A VALIDAR NO
 * WINDOWS: não há como exercitar PowerPoint nem WinRT no CI (Linux).
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const LARGURA = 1920;
const MAX_PAGINAS = 200;

class ConversorIndisponivel extends Error {
  constructor(msg) { super(msg); this.name = 'ConversorIndisponivel'; }
}
class ErroDeConversao extends Error {
  constructor(msg) { super(msg); this.name = 'ErroDeConversao'; }
}

// Texto entre aspas simples no PowerShell: só a aspa simples precisa dobrar.
const aspas = (s) => "'" + String(s).replace(/'/g, "''") + "'";

function cabecalho(entrada, saida) {
  return [
    '$ErrorActionPreference = \'Stop\'',
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    '$Entrada = ' + aspas(entrada),
    '$Saida = ' + aspas(saida),
    '$Largura = ' + LARGURA,
    '$Maximo = ' + MAX_PAGINAS,
  ].join('\n');
}

// Código de saída: 0 ok · 3 conversor indisponível nesta máquina · 4 este arquivo não converte.
const SCRIPT_PPTX = String.raw`
$codigo = 0
try {
  $app = New-Object -ComObject PowerPoint.Application
} catch {
  [Console]::Error.WriteLine('PowerPoint indisponivel: ' + $_.Exception.Message)
  exit 3
}
$pres = $null
try {
  $app.DisplayAlerts = 1
  # Somente leitura, sem título, sem janela.
  $pres = $app.Presentations.Open($Entrada, -1, 0, 0)
  $altura = [int][Math]::Round($Largura * $pres.PageSetup.SlideHeight / $pres.PageSetup.SlideWidth)
  $total = $pres.Slides.Count
  $digitos = 2
  if ($total -gt 99) { $digitos = 3 }
  $n = 0
  for ($i = 1; $i -le $total; $i++) {
    $slide = $pres.Slides.Item($i)
    # Slide oculto na apresentação também fica fora da TV.
    if ($slide.SlideShowTransition.Hidden -eq -1) { continue }
    $n++
    if ($n -gt $Maximo) { break }
    $slide.Export((Join-Path $Saida ($n.ToString('D' + $digitos) + '.png')), 'PNG', $Largura, $altura)
  }
  [Console]::Out.WriteLine('{"paginas":' + $n + '}')
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  $codigo = 4
} finally {
  if ($pres) { try { $pres.Close() } catch {} ; try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($pres) } catch {} }
  # Só fecha o PowerPoint se nada mais estiver aberto nele (pode ser o de quem está logado).
  try { if ($app.Presentations.Count -eq 0) { $app.Quit() } } catch {}
  try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app) } catch {}
}
exit $codigo
`;

const SCRIPT_PDF = String.raw`
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  $null = [Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
  $null = [Windows.Data.Pdf.PdfPageRenderOptions, Windows.Data.Pdf, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapEncoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
} catch {
  [Console]::Error.WriteLine('Windows.Data.Pdf indisponivel: ' + $_.Exception.Message)
  exit 3
}
$metodos = [System.WindowsRuntimeSystemExtensions].GetMethods()
$comoTarefa = $metodos | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1' } | Select-Object -First 1
$comoTarefaAcao = $metodos | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
function Esperar($operacao, [Type]$tipo) { $t = $comoTarefa.MakeGenericMethod($tipo).Invoke($null, @($operacao)); [void]$t.Wait(-1); $t.Result }
function EsperarAcao($acao) { $t = $comoTarefaAcao.Invoke($null, @($acao)); [void]$t.Wait(-1) }
$codigo = 0
try {
  $arquivo = Esperar ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Entrada)) ([Windows.Storage.StorageFile])
  $pdf = Esperar ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($arquivo)) ([Windows.Data.Pdf.PdfDocument])
  $pasta = Esperar ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($Saida)) ([Windows.Storage.StorageFolder])
  $total = [Math]::Min([int]$pdf.PageCount, $Maximo)
  $digitos = 2
  if ($total -gt 99) { $digitos = 3 }
  for ($i = 0; $i -lt $total; $i++) {
    $pagina = $pdf.GetPage([uint32]$i)
    try {
      $opcoes = New-Object Windows.Data.Pdf.PdfPageRenderOptions
      $opcoes.DestinationWidth = [uint32]$Largura
      $opcoes.DestinationHeight = [uint32][Math]::Round($Largura * $pagina.Size.Height / $pagina.Size.Width)
      $opcoes.BitmapEncoderId = [Windows.Graphics.Imaging.BitmapEncoder]::PngEncoderId
      $nome = ($i + 1).ToString('D' + $digitos) + '.png'
      $destino = Esperar ($pasta.CreateFileAsync($nome, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
      $fluxo = Esperar ($destino.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
      try { EsperarAcao ($pagina.RenderToStreamAsync($fluxo, $opcoes)) } finally { $fluxo.Dispose() }
    } finally { $pagina.Dispose() }
  }
  [Console]::Out.WriteLine('{"paginas":' + $total + '}')
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  $codigo = 4
}
exit $codigo
`;

function scriptDe(tipo, entrada, saida) {
  return cabecalho(entrada, saida) + '\n' + (tipo === 'pdf' ? SCRIPT_PDF : SCRIPT_PPTX);
}

// -EncodedCommand pede UTF-16LE em base64.
function comandoCodificado(script) { return Buffer.from(script, 'utf16le').toString('base64'); }

function caminhoDoPowershell(env = process.env) {
  // Caminho completo: não depende do PATH (nem cai num powershell.exe plantado na pasta).
  return path.join(env.SystemRoot || env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function executarPowershell(arquivo, args, op) {
  return new Promise((resolve) => {
    execFile(arquivo, args, { timeout: op.timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (erro, stdout, stderr) => {
      let codigo = 0;
      if (erro) codigo = typeof erro.code === 'number' ? erro.code : (erro.killed ? 'tempo' : erro.code || 'erro');
      resolve({ codigo, stdout: String(stdout || ''), stderr: String(stderr || ''), erro });
    });
  });
}

const ehPng = (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

function paginasGeradas(saida) {
  const nomes = fs.readdirSync(saida).filter((n) => /^\d{2,3}\.png$/i.test(n)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const paginas = [];
  for (const n of nomes) {
    const p = path.join(saida, n);
    const fd = fs.openSync(p, 'r');
    const b = Buffer.alloc(8);
    try { fs.readSync(fd, b, 0, 8, 0); } finally { fs.closeSync(fd); }
    if (!ehPng(b)) throw new ErroDeConversao('a página ' + n + ' não saiu como PNG');
    paginas.push(p);
  }
  return paginas;
}

/*
 * O conversor de verdade. `plataforma` e `executar` existem para o teste
 * conferir o comando montado e o significado de cada código de saída.
 */
function criarConversor(op = {}) {
  const plataforma = op.plataforma || process.platform;
  const executar = op.executar || executarPowershell;
  const env = op.env || process.env;
  return {
    async converter(tipo, entrada, saida) {
      const nome = tipo === 'pdf' ? 'PDF' : 'PowerPoint';
      if (plataforma !== 'win32') throw new ConversorIndisponivel('a conversão de ' + nome + ' em imagens só funciona no Windows');
      fs.mkdirSync(saida, { recursive: true });
      const script = scriptDe(tipo, entrada, saida);
      const r = await executar(caminhoDoPowershell(env), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', comandoCodificado(script)], { timeoutMs: op.timeoutMs || (tipo === 'pdf' ? 5 : 10) * 60 * 1000 });
      const motivo = (r.stderr || (r.erro && r.erro.message) || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (r.codigo === 0) {
        const paginas = paginasGeradas(saida);
        if (!paginas.length) throw new ErroDeConversao('o ' + nome + ' não gerou nenhuma página');
        return { paginas };
      }
      if (r.codigo === 3) throw new ConversorIndisponivel((tipo === 'pdf' ? 'o Windows desta máquina não converte PDF (Windows.Data.Pdf)' : 'o PowerPoint não está instalado ou não abre com a conta do conector') + (motivo ? ' — ' + motivo : ''));
      if (r.codigo === 'ENOENT' || /PSSecurityException|ConstrainedLanguage|AppLocker|bloquead|blocked by group policy/i.test(motivo)) {
        throw new ConversorIndisponivel('o PowerShell está bloqueado nesta máquina' + (motivo ? ' — ' + motivo : ''));
      }
      if (r.codigo === 'tempo') throw new ErroDeConversao('a conversão passou do tempo (o ' + nome + ' travou numa janela?)');
      throw new ErroDeConversao(motivo || ('o ' + nome + ' terminou com erro ' + r.codigo));
    },
  };
}

module.exports = { criarConversor, ConversorIndisponivel, ErroDeConversao, scriptDe, comandoCodificado, caminhoDoPowershell, paginasGeradas, LARGURA, MAX_PAGINAS };
