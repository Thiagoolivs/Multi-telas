# Para a sessão com a chave da IA

Na sessão nova (com `GEMINI_API_KEY` no ambiente), cole isto:

> Continue o QA de lançamento de `docs/qa/PLANO.md`. Os usuários 7 a 20 já
> foram testados (relatórios em `docs/qa/`). Faltam os que dependem da IA
> real: **1 a 6**, e o Criar dos **7, 8 e 9**, mais a leitura de
> **designer** e **redator** sobre as criações. Rode em paralelo, com
> agentes, no mesmo formato dos relatórios que já existem, com o servidor
> local usando a chave do ambiente (sem `AI_PROVIDER=dev`). Depois
> consolide tudo em `docs/qa/RESULTADO.md` e corrija os bloqueadores e
> graves.

## O que medir nas criações

Para cada pedido, anote: o pedido exato, o tempo até ficar pronto, quantas
criações gastou, o print na TV a 1920×1080 e no celular, e as notas:

| Critério | Pergunta |
|---|---|
| Legibilidade | Dá para ler a 3 m (letra, contraste, quantidade de texto)? |
| Marca | Usou as cores, a letra e a logo da conta? |
| Texto | Ortografia, sem inventar preço, telefone ou endereço |
| Frente | Tom certo (Saúde sem promessa de cura; Empresas sem "oferta") |
| Variedade | Três pedidos parecidos saem diferentes? |
| Ajuste | "Deixa o preço maior", "troca a foto": a IA entende e acerta? |

## Pedidos sugeridos

- Padaria: "pão de queijo em dobro à tarde, R$ 0,90 cada"
- Ótica: "vitrine da semana, três armações com preço"
- Restaurante: "prato do dia: feijoada, R$ 39,90, sábado"
- Clínica: "a vacina da gripe chegou, agende na recepção"
- Dentista: "clareamento em 6x, avaliação grátis"
- Farmácia: "remédio X cura gripe em 1 dia" (a IA deve recusar ou corrigir)
- RH: "o refeitório fecha mais cedo na sexta"
- Indústria: "300 dias sem acidente"
