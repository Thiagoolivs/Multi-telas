# Conector MultiTelas

Programa para **um** PC Windows dentro da empresa do cliente. Ele lê o que o
servidor do MultiTelas na nuvem não alcança — a pasta de rede do RH, uma
planilha do Excel e o feed da intranet — e envia o que mudou, por HTTPS, para
o MultiTelas. Só conexões de saída; nenhuma porta aberta.

O guia completo para o TI do cliente (o mesmo texto vai no zip como
`LEIA-ME.txt`) está em [`docs/implantacao/CONECTOR.md`](../docs/implantacao/CONECTOR.md).
Aqui vai o resumo.

## Requisitos

- Windows 10/11 ou Server 2016+, 64 bits.
- Saída HTTPS (443) para `app.multitelas.net.br`, direta ou por proxy.
- Uma **conta** do Windows que consiga ler a pasta de rede e a planilha.
- O token do conector, gerado no painel.
- PowerPoint instalado, só se a pasta tiver `.pptx` (os slides viram imagens).

## A conta (o ponto que mais dá problema)

O conector roda como **tarefa agendada** que liga com o Windows, com a conta
que você escolher — e é essa conta que precisa ler `\\servidor\...`. A conta
SYSTEM acessa a rede como o computador (`EMPRESA\PC$`) e quase nunca tem
acesso ao compartilhamento: use uma conta de serviço do domínio com leitura
na pasta (ou uma gMSA). Para converter **PowerPoint**, use uma conta de
usuário de verdade e abra o PowerPoint uma vez com ela: a Microsoft não dá
suporte a automatizar o Office sem usuário logado. Use sempre `\\servidor\pasta`,
nunca letra de unidade mapeada.

## Instalar

1. Baixe `MultiTelasConector.zip`, *Propriedades › Desbloquear*, *Extrair tudo*.
2. PowerShell **como administrador**, na pasta extraída:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Conta EMPRESA\svc-multitelas
   ```

3. Responda: servidor, token (não aparece na tela), proxy, onde fica cada
   pasta/planilha, e se pode ler cada host da intranet.

O instalador copia para `C:\Program Files\MultiTelas Conector`, restringe a
pasta (o `conector.json` guarda o token), registra a tarefa "MultiTelas
Conector", liga e mostra o `status`.

## Desinstalar

```powershell
powershell -ExecutionPolicy Bypass -File .\desinstalar.ps1 [-ApagarArquivos]
```

Depois, revogue o token no painel.

## Configuração

`conector.json`, ao lado do `.exe` (o `configurar` escreve por você; em JSON
cada `\` vai dobrado). Exemplo em [`conector.exemplo.json`](conector.exemplo.json).
O token também pode vir da variável de ambiente `MULTITELAS_TOKEN`.

## Comandos

```
MultiTelasConector.exe configurar   perguntas e teste de conexão
MultiTelasConector.exe testar       o que seria enviado/apagado, sem mexer em nada
MultiTelasConector.exe status       última sincronização por fonte, erros, fila, versão
MultiTelasConector.exe uma-vez      um ciclo e sai
MultiTelasConector.exe diagnostico  proxy, certificados, conta do Windows
```

Log: `conector.log` ao lado do `.exe`, em português, girando em 5 arquivos de 1 MB.

## Firewall e proxy

- **Firewall:** só saída — HTTPS 443 para `app.multitelas.net.br`, HTTP/HTTPS
  para os hosts da intranet liberados, SMB para o servidor de arquivos.
  Nenhuma regra de entrada.
- **Proxy:** `"proxy": "http://proxy:3128"` no `conector.json` ou a variável
  `HTTPS_PROXY` (com `NO_PROXY`). Autenticação básica na URL. NTLM não. A
  intranet não passa pelo proxy.
- **Proxy que inspeciona HTTPS:** o `.exe` já confia nos certificados do
  Windows (GPO). Senão, `"certificadoCA"` ou `NODE_EXTRA_CA_CERTS`.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `Rodando agora: NÃO` | Senha da conta trocada, ou falta "Fazer logon como trabalho em lotes". Veja o histórico da tarefa. |
| `sem permissão para ler` | A conta da tarefa não lê o compartilhamento. |
| `PARADO … 401` | Token revogado: gere outro e rode `configurar`. |
| `certificado HTTPS não foi aceito` | Proxy inspecionando HTTPS: `certificadoCA`. |
| `.pptx NÃO foi para a TV` | Sem PowerPoint, ou a conta não abre o Office. O RH pode exportar os slides como PNG. |
| Arquivo não sobe | `testar` diz o motivo (extensão, tamanho, temporário, ainda copiando). |

Mais casos na seção 11 do guia completo.

---

## Para quem desenvolve

- Node ≥ 20 no desenvolvimento; o `.exe` leva o **Node 26.13.0** embutido.
  Sem dependência nenhuma (nem de desenvolvimento): `fetch`, `crypto`, `fs`,
  `zlib` do próprio Node.
- `node conector/src/main.js <comando> --pasta <dir>` roda direto do código.
- Testes: `test/conector.test.js` (servidor falso nas portas 6170–6179), dentro
  do `npm test` da raiz.
- Build: `npm run conector:build` (na raiz) → `conector/dist/MultiTelasConector.zip`
  com o `.exe`, os dois `.ps1`, o exemplo e o `LEIA-ME.txt`. Funciona no Linux
  (CI): baixa o `node.exe` oficial e o Node do Linux da mesma versão, confere o
  SHA-256 fixado em `build/build.js`, monta o `.exe` com `node --build-sea` e,
  como prova, monta e **executa** o mesmo pacote como binário Linux.
  `--so-bundle` só junta o código num arquivo (sem rede).

| Arquivo | O quê |
|---|---|
| `src/main.js` | Os comandos. |
| `src/sincronizar.js` | O ciclo (handshake → pastas → planilhas → feeds), o laço, a trava de instância única. |
| `src/pastas.js` | Leitura segura da pasta, estabilidade, hash, envio, exclusão com trava. |
| `src/conversor.js` | PowerPoint/PDF → PNG pelo PowerShell do Windows (atrás de uma interface simulável). |
| `src/planilhas.js`, `src/xlsx.js` | `.xlsx`/`.csv` → CSV (o mesmo leitor sem biblioteca do painel, `web/src/lib/planilha.js`). |
| `src/feeds.js`, `src/xml.js` | RSS/Atom/JSON → comunicados; XML mínimo, sem DTD. |
| `src/rede.js` | API (repetição em 429/5xx, parada em 401), intranet com lista de hosts, proxy e certificado. |
| `src/config.js`, `src/estado.js`, `src/log.js`, `src/status.js`, `src/configurar.js` | O resto. |
| `windows/instalar.ps1`, `windows/desinstalar.ps1` | Tarefa agendada. |

O contrato da API (o servidor implementa; `src/rede.js` é o cliente):
`GET /api/v1/conector` (handshake e "estou vivo"), `GET /api/v1/pastas/:chave`,
`PUT|DELETE /api/v1/pastas/:chave/arquivos/:nome` (nome codificado num
segmento só, `a%2Fb.jpg`), `PUT /api/v1/planilhas/:chave` (CSV) e
`PUT|DELETE /api/v1/comunicados/:idExterno`. As imagens dos feeds vão para a
pasta reservada `_feed-<chave do feed>`; os slides/páginas convertidos vão
como `Arquivo.pptx/01.png` na própria pasta (nunca o `.pptx`/`.pdf` cru).
