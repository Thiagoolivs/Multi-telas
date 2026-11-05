# O que falta, o que dá para implementar e o que sai

Três listas, tiradas dos 8 blocos do QA e das referências de mercado. O
que já está no [plano de ação](PLANO-DE-ACAO.md) traz o número da fase.

## A. O que falta para valer o preço

São as coisas que os melhores do mercado têm e nós não temos, ou temos pela metade.

| # | O quê | Por que pesa | Fase |
|---|---|---|---|
| 1 | Letra de TV e zonas que se adaptam ao formato | Sem isso nada se lê a 4 m | 2 e 3 |
| 2 | A marca entrando sozinha em tudo | O cliente paga para ver a marca dele | 4 |
| 3 | Importância automática, teto e fim do urgente | Hoje o urgente engole a tela | 5 |
| 4 | Agenda semanal visual, com os buracos à vista | Quem não vê o buraco não o preenche | 5 e 8 |
| 5 | A página da TV com a tela ao vivo e Desfazer | O produto é a tela; hoje ela se esconde | 7 |
| 6 | Um só Criar e uma só Biblioteca | Hoje são mais de 15 portas e 3 IAs | 7 |
| 7 | 12 modelos com função por frente e pacotes por negócio | Conteúdo pronto está em 3 de 10 | 9 |
| 8 | **Preço e cardápio vindos de uma planilha** (Google Planilhas ou CSV) | Preço digitado à mão erra. É o que McDonald's e Raydiant fazem com o caixa | nova |
| 9 | **Indicador vindo de planilha** (Empresas), com "atualizado às" | Hoje o número é digitado | nova |
| 10 | **Chamada de senha** (Saúde): a recepção chama pelo celular e a TV mostra a senha e o consultório | É o motivo número 1 de uma TV em sala de espera | nova |
| 11 | **Aprovação antes de ir ao ar** (Empresas: o RH aprova o comunicado; o dono aprova o que a equipe criou) | É o que empresa maior pede | nova |
| 12 | **Permissão por loja ou grupo,** e um relatório por loja | Rede com várias lojas não cabe numa conta só | nova |
| 13 | **Modo ambiente:** arte calma da marca entre os avisos | Para sala de espera e recepção (Zoom London, hospital infantil) | 9 |
| 14 | **Calendário de pautas pronto por frente:** Ministério da Saúde para Saúde, as datas do varejo para Comércio, SIPAT e afins para Empresas | O cliente não precisa lembrar | 5 e 9 |
| 15 | **Fuso por loja** | Rede em mais de um estado | 0 |
| 16 | **App Android publicado e um box homologado** para indicar | TV antiga é a maior fonte de reclamação | sua |

## B. O que dá para implementar depois (diferenciais)

Depois que o básico estiver em 9 ou mais:
- **Multi Telas Ads:** a mídia paga nas TVs dos clientes, já planejada em [docs/ads/](../ads/README.md).
- **Pedir pelo WhatsApp:** o cliente manda "acabou o pão de queijo" no WhatsApp e a TV muda.
- **Vídeo curto da IA:** movimento de verdade na peça (5 a 8 s), não só a entrada.
- **QR com contagem:** quantas pessoas leram o QR de cada TV. É a prova de que a TV vende.
- **A programação muda com o clima ou o movimento:** chuva puxa o café, calor puxa o sorvete.
- **Várias TVs juntas** formando uma tela só (videowall), e menu dividido em 3 TVs.
- **Integrações:** Instagram (publicar de verdade), Google Drive, sistema de senha e ERP para os indicadores.
- **Relatório mensal automático para o dono:** o que passou, o que mais foi lido e as sugestões.

## C. O que sai ou se junta (proposta; a decisão é sua)

**Tipos de conteúdo** (hoje 22):

| Hoje | Proposta | Por quê |
|---|---|---|
| Texto / Comunicado, Aviso Premium, Arte / Poster | **Juntar em "Aviso"**, com 3 variações | Três tipos que fazem a mesma coisa |
| Peça da campanha (IA) | Fica (é o principal) | — |
| Promoção, Tabela de preços | Ficam, só no Comércio e na Saúde | Não servem para Empresas |
| Indicador, Aniversariantes, Quiz | Ficam, o Quiz só na Empresas | É onde fazem sentido |
| Frase do Dia | Vira variação do "Aviso" | Passa na régua, mas não precisa ser um tipo |
| Imagem, Vídeo, QR, Redes, Mural, Clima | Ficam | Base de todo cliente |
| YouTube, Apresentação, Entrada HDMI/USB | Vão para "Avançado" | Uso raro; quebram a régua |
| Página Web, Captura de janela | **Saem** | Ficam em branco na TV e não servem para quem não é técnico |
| Editor livre (composição) | Vai para "Avançado" | É o caminho mais curto para ficar feio |

**Layouts** (hoje 14): **ficam 8**:
- Tela cheia
- Tela cheia + rodapé
- Dois quadrados (novo, o da Starbucks)
- Cabeçalho + principal + rodapé
- Corporativo (Empresas)
- Principal + lateral
- Em pé · destaque
- Em pé · duas zonas
- Quadrada · destaque

**Saem 5** (as TVs que usam continuam rodando até ser trocadas):
- Mosaico 2×2
- Vídeo + painel dinâmico
- Quadrada · destaque + dupla
- Quadrada com cabeçalho
- Em pé · cabeçalho + 2 zonas

**O motor antigo da IA** (o de coordenadas, `MT_MOTOR_CAMPANHA=coordenadas`): **sai**.

**Páginas do painel** (hoje 29; o detalhe está no [bloco 8](BLOCO-8-INTERFACE.md)):
- **Juntam na página da TV:** Programação, editor, Ver agora e Relatório.
- **Juntam no Criar único:** Criar, Criação rápida, Pedir à IA, Mudar a tela e Aviso rápido.
- **Juntam na Biblioteca:** Criados, Peças prontas, Meus Designs e Telas prontas.
- **Viram outra coisa:**
  - Criando vira um aviso no topo.
  - Alertas vira uma faixa no Início.
  - O Banco de imagens vira um botão "Buscar fotos grátis".
  - O Calendário vai para a Agenda.
  - Plano, Equipe e Ajustes vão para o avatar.
  - O Suporte aparece uma vez só.
