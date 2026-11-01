# 7. Riscos e viabilidade

Em ordem do que pode matar o negócio.

## Riscos que podem inviabilizar

1. **Não ter estabelecimentos (oferta).** Hoje não há nenhum pagante. Sem 30
   a 50 locais concentrados numa região, não há pacote para vender. *Sinal de
   alerta:* depois de 60 dias de oferta ativa, menos de 10 locais topam ceder
   tempo.
2. **Anunciante local não pagar o preço que fecha a conta.** Se a cota não
   passar de ~R$ 40/TV/mês, o modelo só se paga com centenas de locais.
   *Validar antes de construir:* 5 conversas, 3 propostas, quantos pagam.
3. **Operação comercial depender de uma pessoa.** No modelo intermediado,
   sem vendedor não há receita — e o dono também precisa vender o SaaS. *O
   conflito real:* cada hora vendendo anúncio é uma hora a menos vendendo
   assinatura, que é o que traz telas.
4. **Ocupação baixa.** Rede nova vende 20–40% do inventário; os custos fixos
   (vendedor) chegam antes.

## Riscos sérios, administráveis

5. **Concorrência.** Redes de mídia indoor já existem nas capitais
   (elevador, academia, farmácia), com equipe comercial e contratos. A
   diferença possível do Multi Telas: **a rede nasce de telas que o cliente
   já usa para si** (custo de tela zero), com peça feita pela IA em minutos
   e comprovação por TV. Não competir em grandes contas; competir no
   comércio de bairro, que as grandes redes não atendem.
6. **Diferenciação vs. o próprio cliente.** O estabelecimento pode vender o
   espaço direto ao vizinho, sem a plataforma. Resposta: o pacote de rede,
   a comprovação e a cobrança — e, no futuro, a ferramenta para ele mesmo
   vender os seus espaços (o "Ads para o seu negócio").
7. **Dependência de TV ligada e conectada.** Anúncio pago em TV desligada
   vira compensação e desgaste. O alerta de queda e o horário de
   funcionamento já existem; a entrega mínima de 90% e o repasse
   proporcional à entrega alinham o incentivo.
8. **Fraude e comprovação.** A contagem vem da TV do próprio local, que ganha
   por exibição. Sem assinatura do lote, cruzamento com sinal de vida e
   amostragem, um local pode inflar números ([05](05-arquitetura.md)).
   Enquanto o volume for pequeno, a checagem é manual (o "ver a tela agora").
9. **Qualidade do conteúdo do dono.** Intervalo comercial demais faz o dono
   desligar a TV ou tirar da rede. Teto de 30% e intervalo mínimo de 5 min
   são regra da plataforma, não do local.

## Contratuais, fiscais e regulatórios (validar com advogado e contador)

- **Contrato de cessão de tempo de tela** com cada local; **contrato de
  inserção** com cada anunciante; responsabilidade pelo conteúdo do anúncio
  com o anunciante.
- **ISS** sobre inserção de publicidade (item 17.25 da LC 116/2003). Nota do
  Multi Telas ao anunciante; nota do local ao Multi Telas no repasse.
- **Publicidade restrita:** bebida alcoólica (Lei 9.294/96 e CONAR),
  medicamentos (RDC 96/2008 da Anvisa), produtos para crianças (CONAR).
  Categorias bloqueadas por padrão até a regra estar clara.
- **Propaganda eleitoral:** a lei eleitoral (Lei 9.504/97, art. 37) trata
  estabelecimentos comerciais como bens de uso comum e proíbe propaganda
  neles. Bloquear a categoria "política" sempre.
- **LGPD:** o modelo proposto não coleta dado pessoal de quem assiste. Medir
  audiência por câmera mudaria isso por completo — fora do escopo.
- **Termos de uso e privacidade** do produto precisam citar a atividade de
  intermediação de publicidade.

## Veredito

Viável **como segunda camada do SaaS**, não como produto separado e não
agora. A ordem que reduz o risco:

1. vender o SaaS até ter 30–50 locais numa região;
2. validar preço e demanda de anúncio vendendo à mão (sem código);
3. só então construir o intervalo comercial e a operação no painel.
