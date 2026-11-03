# O caminho até 10/10

No QA de 03/11 o produto estava em **6/10** ([RESULTADO.md](RESULTADO.md)); depois das
correções e do reteste, está em **7,5/10** ([RETESTE.md](RETESTE.md)). Os últimos pontos não são
de código: dependem de conteúdo, prova, operação e jurídico. Esta é a lista
completa, área por área, do que falta para cada nota chegar perto de 10.

## 1. O que o código resolve (em andamento)

| Área | Hoje | Depois das correções | O que entra |
|---|---|---|---|
| Fluxo | 6,5 | 8,5 | Cadastro direto do "Testar grátis", código com espaço, reconectar sem duplicar, TV em pé, limites de pareamento |
| Criações | 6 | 8 | Regras de Saúde nas peças e nas redes, "troca a foto" sem perder texto, ajuste que funciona, aviso de preço/data inventados |
| Acessibilidade | 5 | 8,5 | Subir foto pelo teclado, diálogos com foco, contraste, pular para o conteúdo |
| Regras de negócio | 5 | 8 | Preço por frente, cancelamento no fim do período, 1 TV no grátis, anual e multa corretos, atraso, exclusão cancela o Asaas |
| Jurídico | 4 | 7 | Cookies verdadeiros, arrependimento de 7 dias, suboperadores, fotos de pessoas, cancelamento, dados do fornecedor configuráveis |
| Compatibilidade | 4 | 7 | A TV abre em navegador antigo, peças com alternativa, aviso claro, mínimo documentado |
| Comercial (landing) | 6 | 7,5 | Cada frente com texto e preço próprios, preço na primeira tela, sem "Mais escolhido" |
| Visual / profissionalismo | 6 | 7 | Textos por frente, marca na TV de espera, estados de carregando, Suporte sem dado técnico |

## 2. O que só você pode fazer (e quanto vale)

| # | O quê | Por que pesa | Ganho |
|---|---|---|---|
| 1 | **Aprovar na bancada** (`/bancada.html`) as telas prontas de cada frente — há 19 por frente esperando — e dizer qual de cada frente serve de **estreia** da TV nova (sem data e boa para qualquer negócio da frente; vira `paraComecar: true` no manifesto) | A primeira impressão de toda TV nova e a vitrine do painel | Conteúdo pronto 3 → 8; Visual +1 |
| 2 | **Dados da empresa** (razão social, CNPJ, endereço, e-mail do encarregado de dados) nas variáveis de ambiente | Sem isso não se pode cobrar de ninguém com segurança | Jurídico +1,5 |
| 3 | **Advogado revisa** Termos e Privacidade; depois `LEGAL_REVISADO=true` | Tira o aviso de rascunho; protege a cobrança | Jurídico até 9 |
| 4 | **E-mail de suporte** do domínio (ex.: suporte@multitelas.net.br) e WhatsApp comercial | Gmail pessoal tira confiança | Profissionalismo +0,5 |
| 5 | **App Android publicado** (as 4 chaves no GitHub, `android/README.md`) e **um TV box homologado** para indicar | TV antiga é o maior risco de reclamação; o box certo resolve | Compatibilidade até 9 |
| 6 | **Chave da IA** no ambiente (`GEMINI_API_KEY`) para o reteste das criações reais | Só assim a nota das criações é a nota do produto | Criações confirmadas |
| 7 | **Homologação no Railway** + TV de teste ligada 24 h; **região US East** ([OPERACAO.md](../OPERACAO.md)) | Deploy sem susto; ~80 ms a menos em cada clique | Confiabilidade 9 → 10 |
| 8 | **Três clientes piloto** (um por frente), de graça por 30 dias em troca de depoimento, foto da TV instalada e autorização para usar o nome | Prova social é o que falta para a landing converter | Comercial 7,5 → 9 |
| 9 | **Foto real de TV instalada** em cada frente para o topo da landing (o HTML já marca o lugar) | Ilustração vende menos que foto real | Comercial +0,5 |
| 10 | **Roteiro no aparelho** ([ROTEIRO-APARELHO.md](ROTEIRO-APARELHO.md)) numa TV Samsung, numa LG e num TV box | O teste que nenhum robô faz | Confirma Compatibilidade |

## 3. O que leva de 8 a 10 (depois do lançamento)

- **Biblioteca de conteúdo por frente** maior e variada: dezenas de peças por
  frente, com cores e formatos diferentes, e não a mesma paleta em tudo.
- **Agenda única** (Programação + Calendário + datas comemorativas) e o
  **Criar único**, quando você decidir ([RESULTADO.md](RESULTADO.md)).
- **Integrações**: Google Drive/Planilhas, Instagram (publicar de verdade),
  sistemas de senha e chamada para Saúde, ERPs para Indicadores.
- **Gestão de redes**: muitas lojas, permissões por loja, relatório por loja.
- **Suporte** com tempo de resposta definido e base de ajuda (perguntas
  frequentes dentro do painel).
- **Postgres em todo lugar e migrações** (pré-requisito do Ads e de tudo que
  envolve dinheiro).
- **Escala**: o canal ao vivo das TVs fora da memória (duas réplicas, deploy
  sem derrubar as TVs).
- **Reteste trimestral** com os mesmos 20 usuários, para a nota ser medida e
  não opinião.

## 4. Ordem recomendada

1. Correções de código (em andamento) → reteste automático.
2. Você: itens 1, 2, 4 e 6 da seção 2 (uma tarde).
3. Reteste com a IA real e nos aparelhos (itens 6 e 10).
4. Advogado (item 3) e pilotos (item 8) em paralelo — lançar para os pilotos.
5. Lançamento aberto com depoimentos e fotos reais (itens 8 e 9).
