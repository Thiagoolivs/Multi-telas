# Prontidão para lançar

Este documento existia desde antes de o produto ter landing page, CI ou
cabeçalho de segurança, e continuou dizendo que faltavam os três muito depois
de existirem. Documento de lançamento que mente é pior que documento nenhum:
quem lê fica gastando a semana no que já está feito.

Atualizado em **20/08/2026** · 547 testes · `server.js` com 2418 linhas ·
`main` em `f2c4ae1` (PR #98 mesclado).

Legenda: 🔴 impede vender · 🟡 resolver logo depois · 🟢 maturidade.

---

## O que decide a semana

Nada do que falta para publicar é código. É configuração e é jurídico — e a
maior parte só pode ser feita por quem tem acesso ao Railway e ao contador.

| | O que | Por que trava | Quem faz |
|---|---|---|---|
| 🔴 | **Revisão jurídica dos textos** | `server/legal.js` descreve com precisão o que o sistema faz, mas é rascunho técnico. Enquanto `LEGAL_REVISADO` não for `true`, todas as páginas legais exibem aviso de rascunho — e vender com Termos marcados como rascunho é vender sem Termos. | advogado, depois você |
| 🔴 | **`STORAGE=s3` + as 4 chaves do R2** | Sem bucket nem volume, a mídia grava em disco efêmero: **toda imagem, vídeo e áudio somem no próximo deploy**, sem aviso. A tela simplesmente fica vazia depois de uma atualização. | você |
| 🔴 | **`STRIPE_PRICE_ESSENCIAL`, `STRIPE_PRICE_PRO`, `STRIPE_WEBHOOK_SECRET`** | Os preços de tabela saem do ambiente (`server/plans.js`). Sem eles não há checkout, e cadastrar a primeira tela exige pagamento. | você |
| 🔴 | **`ADMIN_EMAILS`** | Sem ela o painel da plataforma **não aparece e não responde** — é de propósito: "sem configuração, o dono da primeira conta vira operador" transformaria instalação nova em porta aberta. Você fica sem enxergar telas vivas, contas, reclamações e erros. | você |
| 🟡 | **Domínio próprio, `APP_URL` e `SUPPORT_EMAIL` do domínio** | O contato hoje é e-mail pessoal, e ele aparece nas páginas legais. | você |
| 🟡 | **Backup do Postgres confirmado, e uma restauração testada** | Backup que nunca foi restaurado é backup que talvez não exista. | você |

**A tela `/sistema` já confere seis desses sozinha** (`server/diagnostico.js`):
armazenamento, banco, IA, e-mail, endereço e jurídico, cada um dizendo o que
está acontecendo, o que isso causa e o que fazer.

### Uma coisa nunca foi testada de verdade

**Ler o site de um cliente** (`server/site.js`) só foi exercitado contra
servidores locais — o proxy do ambiente de desenvolvimento bloqueia HTTP
externo (403). Precisa ser conferido no primeiro dia em produção: colar o
endereço de um cliente real e ver se as cores e as fontes saem certas.

---

## O que está pronto

**Conta e acesso.** Senha com scrypt+salt, sessão em cookie HttpOnly/SameSite
(Secure sob HTTPS), rate limit em cadastro, login, pareamento e IA,
recuperação de senha por e-mail, login com Google. Multi-tenant com Postgres,
isolamento por `tenant_id`.

**Cobrança.** Stripe com checkout e webhook assinado, simulador em
desenvolvimento. Preço **por tela** (Essencial R$ 79, Pro R$ 149, Enterprise
sob consulta), com franquia de crédito de IA e cota de armazenamento também
por tela — é o que segura a margem em qualquer tamanho de conta. Teste de 14
dias. A conta aberta está em `docs/BILLING.md`.

**A tela nunca para.** Crédito acabado ou fatura vencida não apagam a parede de
uma recepção: a cobrança controla a criação assistida por IA e só ela. O
editor, o upload e o publicar continuam inteiros.

**Motor de IA.** Briefing → plano → imagens → composição → crítica dirigida,
com design system próprio e validador de contraste, área segura, sobreposição e
texto que não cabe. Identidade da marca (até 3 por conta), acervo de fotos do
cliente e o site do cliente como referência de estilo. Roda em segundo plano
com progresso.

**Editor.** Redimensionamento, pincel de formatação, Alt+arrastar para
duplicar, réguas, modelos de partida, IA guiada, e elementos que entram
animados — 8 entradas, 4 movimentos contínuos, só `transform` e `opacity`.

**Player.** Offline-first (service worker), pareamento na nuvem, tempo real
(SSE), formatos 16:9/9:16/1:1/21:9, tema saído da marca, pré-carga da próxima
mídia, música de fundo com controle ao vivo, mural de fotos por QR com botão de
pânico. Painel e player são instaláveis (PWA).

**Segurança.** Auditada em três rodadas (PRs #95, #97, #98): passe de 1 minuto
no lugar do token na URL do SSE, SVG servido isolado, SSRF fechado por
construção em `server/site.js`, CSP/HSTS/nosniff/Referrer-Policy em toda
resposta, painel da plataforma respondendo **404** a quem não pode.

**LGPD.** Termos e Política versionados, aceite com versão, data e IP, exportar
meus dados e excluir minha conta de verdade — inclusive as fotos do mural, que
são dado pessoal de terceiros.

**Tipografia servida por nós.** As 14 famílias (todas OFL) vivem em `fonts/`.
Enquanto vinham da Google, TV em rede que bloqueasse o domínio caía na fonte de
sistema — mais larga — e estourava o texto que o compositor tinha medido, sem
erro e sem aviso.

**Observabilidade.** Log estruturado (JSON na nuvem), sem dado pessoal nem
segredo, e os erros agrupados no painel da plataforma, em "O que quebrou". Com
`ALERTA_WEBHOOK_URL`, o primeiro de cada defeito vira mensagem no Slack ou
Discord.

**CI.** `.github/workflows/ci.yml` roda os 547 testes e o build do painel a
cada push, em todo branch.

---

## Depois de publicar

- 🟡 **Verificação de e-mail no cadastro.** O envio já existe (`server/mail.js`);
  falta o fluxo. Hoje dá para criar conta com e-mail de outra pessoa.
- 🟡 **Trocar o Stripe pelo Asaas.** Decidido, e adiado de propósito para não
  segurar a publicação. `server/billing.js` é o único lugar que fala com o
  provedor; `server/plans.js` já guarda o catálogo separado dele.
- 🟡 **Quebrar `server.js` por domínio** (2418 linhas de roteamento manual).
  Não muda nada para quem usa, mas cada passo futuro fica mais barato.
- 🟢 **Erros persistidos**, se a memória do processo deixar de bastar.
- 🟢 **Proof-of-play / relatórios** — o que tocou, quando. Forte na venda
  corporativa.
- 🟢 **Grupos de telas**, **rate limit distribuído**, **trabalhos de IA
  persistidos** (hoje vivem em memória e um reinício perde o que está em voo).

## Qualidade da geração

Em ordem de impacto — é aqui que o produto melhora de verdade:

1. **Editor: máscara, texto em curva e biblioteca de gráficos.** É o bloco que
   fecha a promessa de paridade com o Canva, e o maior dos três em esforço.
2. **A IA olhar a peça pronta.** A crítica de hoje lê o relatório do validador;
   renderizar em PNG e devolver pela visão pegaria colisão, respiro torto e
   logo sobre rosto — coisas que validador nenhum expressa.
3. **Prompt de imagem ciente do layout** ("deixe o terço inferior limpo"), em
   vez de remendar com véu depois.
4. **Medir o texto com as métricas reais da fonte** em vez da largura média por
   caractere. Agora que a fonte é nossa, dá para carregá-la no servidor e medir
   de verdade — antes a métrica dependia de um arquivo que podia não chegar.
5. **Recorte inteligente** da foto do acervo (hoje corta pelo centro).
6. **Coerência entre peças** — cada uma é composta isolada da anterior.

## Ordem sugerida para esta semana

1. Mandar os textos legais para revisão — é o único bloqueador que não depende
   de você e o que tem o prazo mais longo.
2. Criar o bucket R2 e definir `STORAGE=s3` com as quatro chaves.
3. Definir `ADMIN_EMAILS`, `STRIPE_PRICE_*`, `STRIPE_WEBHOOK_SECRET`,
   `APP_URL`, `SUPPORT_EMAIL`.
4. Abrir `/sistema` e conferir se os seis diagnósticos estão verdes.
5. Colar o site de um cliente real e olhar as cores e as fontes que saem.
6. Publicar. Voltar em "O que quebrou" no dia seguinte.
