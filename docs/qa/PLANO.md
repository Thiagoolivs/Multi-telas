# QA de lançamento — plano

Objetivo: testar o MultiTelas inteiro como se fosse lançar amanhã, com 20
usuários de níveis, aparelhos e frentes diferentes, e dar **nota a tudo**.
Pedido do dono em 03/11/2026.

## Como é feito

- Cada usuário é uma **jornada real num navegador** (Chromium via Playwright),
  num servidor local da versão da `main`, com conta e dados próprios.
- Cada passo registra **o que aconteceu, quanto tempo levou, quantos toques,
  erros de console e um print**.
- Cada jornada termina com **notas de 0 a 10** pelos critérios abaixo e a
  lista de problemas com gravidade.
- Relatório por usuário em `docs/qa/NN-nome.md`; consolidação em
  `docs/qa/RESULTADO.md`.

## Os 20 usuários

| # | Quem | Frente | Jornada | Precisa da IA real |
|---|---|---|---|---|
| 1 | Dona de padaria, leiga, Android barato em 4G | Comércio | Cadastro → marca → primeira peça na TV | Sim |
| 2 | Gerente de ótica, desktop | Comércio | Campanha com IA, telas prontas, várias TVs | Sim |
| 3 | Dono de restaurante | Comércio | Cardápio e preço do dia, trocar todo dia, redes | Sim |
| 4 | Recepcionista de clínica, leiga | Saúde | Avisos, horário, convênios | Sim |
| 5 | Dentista dono da clínica | Saúde | Marca, logo, tela pronta da recepção | Sim |
| 6 | Farmácia | Saúde | A IA respeita as regras (sem promessa de cura, sem desconto agressivo) | Sim |
| 7 | RH de metalúrgica | Empresas | Aniversariantes, comunicado, mural | Parte |
| 8 | Gestor de indústria | Empresas | Indicadores (endpoint), segurança do trabalho | Parte |
| 9 | TI de rede, 20 TVs | Empresas | Grupos, lote, desfazer, backup, cópia, equipe | Parte |
| 10 | Funcionário (membro da equipe) | qualquer | O que pode e o que não pode | Não |
| 11 | Instalador de TV | — | QR, código, TV box/APK, TV em pé, reconectar, sem internet | Não |
| 12 | A própria TV na parede | — | Horas ligada: CPU, memória, relógio, trocas ao vivo, queda de rede | Não |
| 13 | Visitante cético da landing, em 4G | as 3 | Entende o produto e o preço em 30 s? Google, velocidade | Não |
| 14 | Financeiro | — | Teste grátis, assinatura, Pix/boleto, atraso, cancelamento | Sandbox do Asaas |
| 15 | Pessoa com deficiência visual | — | Leitor de tela, só teclado, contraste, zoom 200% | Não |
| 16 | Idoso, pouca intimidade com tecnologia | — | Linguagem, tamanho, voltar de um erro | Não |
| 17 | Hacker curioso | — | Outra conta, peça maliciosa, upload, limites, sessão | Não |
| 18 | Operador da plataforma | — | Suporte, entrar como cliente, trocar frente, métricas, erros | Não |
| 19 | iPhone/Safari e navegador de Smart TV | — | Compatibilidade (simulada) | Não |
| 20 | Advogado e contador | — | Termos, privacidade, LGPD, cookies, cobrança | Não |

Mais duas leituras transversais: **designer** (o quanto parece produto
profissional, consistência) e **redator** (ortografia, tom de cada frente,
microtextos).

## Critérios e notas (0 a 10)

| Área | O que se mede |
|---|---|
| Criações | Legibilidade a 3 m, marca, ortografia, adequação à frente e ao público, variedade, tempo de geração |
| Fluxo | Tempo e toques até a TV mudar, passos sem saída, erro que a pessoa consegue resolver sozinha |
| Profissionalismo | Consistência visual, textos, estados vazios e de erro, e-mails, nada "de programador" na tela |
| Desempenho | Primeira pintura em 4G, peso, CPU da TV |
| Confiabilidade da TV | Não apaga, não trava, volta sozinha, funciona sem internet |
| Acessibilidade | Teclado, leitor de tela, contraste, alvo de toque, zoom |
| Segurança | Isolamento entre contas, entrada maliciosa, limites |
| Jurídico | Termos, privacidade, LGPD, cookies, textos de cobrança |
| Comercial | A landing explica e vende; preço claro; teste grátis sem atrito |

Escala: 10 excelente · 8 bom, pequenos ajustes · 6 aceitável com problemas
visíveis · 4 atrapalha o uso · 2 quebrado · 0 não existe.

## Gravidade dos problemas

- **Bloqueador** — impede lançar (perda de dado, conta de outro visível, TV
  apagada, cobrança errada, fluxo principal sem saída).
- **Grave** — o cliente percebe e se frustra; tem contorno.
- **Médio** — atrapalha, mas não impede.
- **Polimento** — acabamento.

**Veredito "pode lançar":** zero bloqueador e nenhum grave nas jornadas 1, 4,
7, 11 e 12 (a primeira experiência de cada frente e a TV).

## Ordem

1. Usuários 7 a 20 (sem IA real) — já.
2. Usuários 1 a 6 e o Criar dos 7 a 9 — na sessão com `GEMINI_API_KEY`.
3. Consolidação, correção dos bloqueadores e graves, reteste.

## Limites

- Aparelho físico (TV Samsung/LG, TV box): simulado. Roteiro de 15 minutos
  para o dono em [`ROTEIRO-APARELHO.md`](ROTEIRO-APARELHO.md).
- Produção (`app.multitelas.net.br`) não é acessível deste ambiente: o
  teste é na mesma versão, rodando local.
- Safari de verdade não roda aqui: compatibilidade por emulação e leitura
  do código (recursos de navegador usados).
