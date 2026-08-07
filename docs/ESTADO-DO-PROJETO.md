# Estado do projeto

Retrato honesto do MultiTelas hoje, escrito para quem vai continuar o trabalho.
A intenção declarada do produto é **qualidade com facilidade**: arte de agência
para quem não tem agência. Este documento avalia o sistema contra essa régua,
não contra uma lista de recursos.

## Como o sistema está montado

```
TV (player)                    Painel (React)              Servidor (Node)
─────────────                  ──────────────              ───────────────
player.html                    web/src/pages/*             server.js  (rotas)
 js/player.js  playlist        MyDesignsPage   campanhas   server/ai-director.js
 js/render.js  desenha item    ContentEditor   telas       server/composer.js
 js/theme.js   cores           BrandPage       identidade  server/design-system.js
 js/storage.js config          SettingsPage    conta       server/db-*.js
 offline-first (SW)            build → /app                server/storage.js (R2)
```

O player é vanilla e funciona sem rede: guarda a última configuração e continua
exibindo. Isso não é detalhe — é o que separa signage de site.

## A tese do motor de IA

**O modelo dirige; o código garante que dê para ler.**

A IA decide quantas peças, o que cada uma diz, qual direção de arte e se precisa
de foto. Nada disso chega à tela sem passar por `server/composer.js`, que corrige
contraste, área segura, sobreposição e texto que não cabe. Uma peça bonita e
ilegível é uma peça errada, e modelo nenhum garante legibilidade sozinho.

O pipeline hoje: **briefing → plano → imagens → composição → crítica**. A crítica
devolve ao modelo o que o validador precisou consertar e refaz a peça, mas só
onde houve problema, e só substitui se a nova versão tiver *menos* conserto.

Roda como trabalho em segundo plano (`server/jobs.js`) porque leva minutos.

## O que já funciona bem

- **Identidade que atravessa o sistema.** Cores, fontes, logo e fotos cadastradas
  em Marca valem na geração de peça **e** no tema da TV. Precedência clara:
  pedido > marca salva > escolha do modelo.
- **O acervo do cliente vence a foto inventada.** O diretor escolhe entre as
  fotos da empresa antes de gerar — mais barato e mais verdadeiro.
- **Legibilidade medida, não estimada.** Contraste calculado em todo lugar: peça,
  tema derivado da marca, rodapé colorido.
- **Publicar campanha inteira** em várias telas, filtrando por formato.
- **LGPD** com aceite versionado, exportar e excluir de verdade — inclusive as
  fotos do mural, que são dado pessoal de terceiros.
- **Música de fundo por tela**, com controle remoto ao vivo (SSE) e vídeo que
  abaixa a trilha em vez de brigar com ela.
- **Mural de fotos por QR**: o público manda foto pelo celular e ela entra na TV
  em segundos, com botão de pânico que limpa a tela e fecha o mural num clique.
  O QR é desenhado pelo próprio servidor (`server/qr.js`), sem serviço externo.
- **Player robusto**: offline, pré-carga da próxima mídia, fallback quando a IA
  ou o feed caem.

## Onde a facilidade ainda escapa

Avaliação franca, com números do próprio código:

1. **Ajustes da tela tem 16 controles.** Layout, tema, fonte, cor da marca,
   destaque, transição, decoração, refresh, 4 caixas de comportamento… Um dono de
   padaria não sabe o que é "layout inteligente" nem "cores adaptativas". Faltam
   **padrões que já estejam certos** e um modo avançado que esconda o resto.

2. **99 tipos de conteúdo no catálogo.** É força na venda e peso no uso. A tela
   de adicionar precisa de um caminho curto ("o que você quer mostrar?") antes da
   grade completa.

3. **Não existe onboarding.** Quem cria conta cai num painel vazio. O primeiro
   sucesso — parear uma TV e ver algo na tela — depende de o usuário adivinhar a
   ordem. É a maior perda de conversão possível e a mais barata de resolver.

4. **A matemática de cor está duplicada.** `server/design-system.js` e
   `js/theme.js` implementam cada um seu `mix`, `luminance`, `contraste`,
   `girarMatiz`. Foi decisão consciente (o servidor é CommonJS, o player é IIFE
   de navegador, e nenhum tem build compartilhado), mas é dívida real: um ajuste
   de contraste feito num lado não chega ao outro. Já aconteceu — o bug de
   "clarear laranja não passa de 2.4:1" foi corrigido no compositor meses antes
   de reaparecer no tema.

5. **Fontes vêm da Google.** `js/theme.js` busca de `fonts.googleapis.com`. TV com
   rede ruim ou bloqueada cai na fonte de sistema, que é mais larga — e todo o
   cálculo de "cabe na caixa" vira estimativa errada. As fontes são OFL: dá para
   servir do próprio domínio. **É a melhor relação qualidade/esforço aberta.**

6. **`server.js` tem 1348 linhas** de roteamento manual. Ainda navegável, mas
   perto do ponto em que separar por domínio deixa de ser luxo.

## Próximos passos de qualidade da geração

Em ordem de impacto:

1. **Auto-hospedar as fontes** — conserta a causa raiz do texto estourado.
2. **A IA olhar a peça pronta.** A crítica de hoje lê o relatório do validador;
   renderizar em PNG e devolver pela visão pegaria colisão, respiro torto e logo
   sobre rosto — coisas que nenhum validador expressa.
3. **Prompt de imagem ciente do layout** ("deixe o terço inferior limpo"), em vez
   de remendar com véu depois.
4. **Medir texto com as métricas reais da fonte** em vez da largura média por
   caractere.
5. **Recorte inteligente** da foto do acervo (hoje corta pelo centro).
6. **Coerência entre peças** — cada uma é composta isolada da anterior.

## Convenções

- Comentários explicam **por quê**, não o quê. Preferência por registrar a
  decisão e o erro que ela evita.
- Sem framework no servidor e sem dependência pesada; `node:sqlite` em dev,
  Postgres em produção, mesma API assíncrona nos dois.
- Testes em `npm test` (54 hoje). O padrão que funcionou: **renderizar e olhar**
  pegou bugs que os testes não pegaram, e vários testes existem porque um
  screenshot mostrou o problema primeiro.
