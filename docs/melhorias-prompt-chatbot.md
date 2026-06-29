Vou produzir o relatório diretamente, sem precisar inspecionar arquivos — os achados já trazem tudo o que preciso (evidências, prompt atual e mudanças propostas). Agrupo as ideias duplicadas das 5 lentes e priorizo por impacto.

# Relatório de melhorias — Chatbot Inove (n8n + Ollama qwen3:8b)

Consolidação de 5 lentes sobre a conversa real. As lentes convergiram fortemente em 4 falhas reais: (a) ignorou campos da 1ª mensagem, (b) despejou relatório técnico em vez de 3 imóveis, (c) reiniciou o funil no follow-up, (d) narrou o raciocínio. A causa-raiz transversal é `options.think=true` somada a um prompt longo e redundante.

---

## 1. Top correções por impacto

### ALTA

**A1 — Extrair múltiplos campos da 1ª mensagem (apareceu em 4 lentes)**
Problema: usuário disse tipo+comodidade+cidade e o bot perguntou "comprar ou alugar?", ignorando os 3 campos.

```
ANTES de perguntar qualquer coisa, releia a mensagem inteira e EXTRAIA TODOS os campos já presentes:
finalidade, tipo, quartos, orçamento, cidade, bairro, comodidades. Marque-os como preenchidos.
NUNCA pergunte algo que a pessoa já disse. Pergunte só o PRIMEIRO item que ainda falta.
Ex.: "casas com piscina em Araçatuba" → tipoImovel=casa, cidade=Araçatuba, comodidades=piscina.
Só falta a finalidade: pergunte SÓ isso.
```

**A2 — `options.think=false` (CONFIG, maior alavanca — fazer primeiro)**
Problema: o tom de "relatório de assistente" e o vazamento de raciocínio são o artefato clássico do thinking-mode do qwen3. Um 8B com `think=true` não cumpre de forma confiável "não mostre seu raciocínio".

```
CONFIG (não-prompt): no node Ollama do n8n, setar options.think=false.
Se o node não expõe "think", anexar "/no_think" ao FINAL do system prompt (qwen3 respeita a flag).
```

**A3 — Ancorar o papel da saída da tool (2 lentes)**
Problema: o 8B tratou o JSON da tool como mensagem do usuário ("você forneceu um array JSON") e ofereceu "ajudar a formatar".

```
O JSON que aparece depois de você chamar buscar_imoveis é o RESULTADO DA FERRAMENTA, NÃO uma
mensagem do cliente. O cliente NUNCA te envia JSON. NUNCA diga "você forneceu", "você me enviou
um array" nem "posso ajudar a formatar". Esse JSON é a lista de imóveis que VOCÊ encontrou — vá
direto apresentá-los em português.
ERRADO: "Você forneceu um array JSON com 2 imóveis..."
CERTO:  "Achei 2 casas que combinam! 💙 R$ 990.000 — 3 quartos no Chácaras Arco Íris..."
```

**A4 — Formato de apresentação como whitelist + molde (3 lentes convergiram)**
Problema: o bot entregou relatório técnico com `###`, IPTU, CRECI, área, permuta — exatamente os campos que a regra negativa em prosa não bloqueou.

```
# AO RECEBER O RESULTADO DA BUSCA — formato OBRIGATÓRIO
- USE SOMENTE 3 campos por imóvel: preço, número de quartos, bairro.
- PROIBIDO citar qualquer outro campo (área, m², IPTU, condomínio, ano, banheiros, vagas, CRECI,
  permuta, financiamento, código, endereço, telefone).
- PROIBIDO: títulos (#, ###), **negrito** de rótulo, tabelas, seções, listas de comodidades do
  condomínio, a palavra "relatório".
- Máximo 4 linhas no total. Emojis: só 💙 🚀 😃.

MOLDE (preencha só os [colchetes], não acrescente linhas):
[frase curta e calorosa com o que ela pediu] 😃

1. R$ [preço] — [N] quartos no [bairro]
2. R$ [preço] — [N] quartos no [bairro]
3. R$ [preço] — [N] quartos no [bairro]

[pergunta: agendar visita ou falar com corretor?] 💙

ERRADO: "### 🏠 Casa de Alto Padrão... Área Total: 225 m²... IPTU: R$ 250... CRECI: 36223-J"
CERTO:  "Achei boas opções! 😃\n1. R$ 990.000 — 3 quartos no Chácaras Arco Íris\nQuer agendar uma visita? 💙"
```

**A5 — Caminho correto para ler comodidades (causa do bug "não tem elevador")**
Problema: o prompt manda "ler o campo itens" mas o caminho real é `caracteristicas.itens` / `caracteristicas.comodidades`. O 8B procura no topo, não acha e diz "não menciona". A palavra `caracteristicas` nem está no prompt.

```
Cada imóvel tem imovel.caracteristicas.comodidades (lista de slugs) e
imovel.caracteristicas.itens (lista de {rotulo, valorNum, origem}).
Para QUALQUER pergunta sobre comodidade, procure SEMPRE dentro de caracteristicas.itens E
caracteristicas.comodidades — nunca no topo do objeto.
"tem piscina?" → existe slug "piscina" em comodidades OU rotulo com "Piscina" em itens → responda SIM.
"tem elevador?" / "quantos elevadores?" → some os valorNum dos itens cujo rotulo contém "Elevador".
```

**A6 — Continuidade de estado / não reiniciar o funil (3 lentes)**
Problema: após mostrar um imóvel, o pedido "me envie o link das casas" fez o bot voltar a "comprar ou alugar?".

```
DEPOIS de já ter mostrado imóveis nesta conversa: NUNCA reinicie a qualificação.
Pedidos como "manda o link", "tem fotos?", "e o terceiro?", "esse tem piscina?" se referem aos
imóveis JÁ mostrados — responda usando o resultado que já está no histórico.
Só pergunte finalidade/tipo de novo se a pessoa pedir um imóvel claramente DIFERENTE.
Não temos link nem fotos por aqui: ofereça passar o contato do corretor, que envia as fotos pelo
WhatsApp.
```

**A7 — Gatilho de busca permissivo + "tanto faz" = decidido (3 lentes; resolve contradição interna)**
Problema: a regra "finalidade + tipo + (quartos OU orçamento)" contradiz a exceção "pode buscar sem eles"; e "tanto faz" repetido não virava busca, gastando 3 turnos.

```
BUSQUE assim que tiver: tipoImovel + (cidade OU bairro OU comodidade citada).
Finalidade é desejável; se a pessoa disse "tanto faz" na finalidade, use VENDA por padrão e busque.
Quartos e orçamento são OPCIONAIS: nunca segure a busca esperando por eles.
"tanto faz" / "qualquer" / "sem preferência" / "me mostra o que tiver" = item DECIDIDO: marque como
sem preferência, NÃO pergunte de novo e envie esse param vazio para a tool.
Faça no máximo 2 perguntas de qualificação no total; depois disso, BUSQUE com o que tiver.
```

**A8 — Total=0: afrouxar antes de desistir**
Problema: só existe "diga que não achou". Se `comodidades=piscina` zerar, o bot diz "não temos" mesmo havendo opções próximas.

```
# QUANDO A TOOL VOLTA VAZIA (total = 0)
NÃO diga "não temos" na primeira tentativa vazia. Busque DE NOVO afrouxando, UMA coisa por vez,
nesta ordem: 1) remova comodidades (comodidades=""); 2) remova precoMax; 3) remova bairro.
Pare assim que vier ≥1 imóvel e avise: "Com piscina exata não achei agora, mas separei estas que
combinam 💙". Só após afrouxar tudo e ainda vir 0 é que diga que não há nada nesse perfil e ofereça
avisar quando surgir.
```

**A9 — Eliminar o fluxo de qualificação duplicado (regra conflitante)**
Problema: a ordem da coleta está definida 2x com numerações diferentes (uma com passo "Nome", outra sem). Duas verdades destroem a aderência do 8B.

```
# COLETA (uma pergunta por mensagem, nesta ordem)
1) comprar ou alugar  2) tipo de imóvel  3) quartos  4) orçamento  5) cidade/bairro
Nome: pergunte só se a conversa pedir; não bloqueia a busca.
Pule qualquer item que a pessoa JÁ disse. Pergunte só o próximo que falta, não o passo 1 fixo.
```
(A seção "Outros perfis" fica só com lead/cliente/proprietário, sem repetir a ordem.)

### MÉDIA

**M1 — Proibir narração do fluxo (2 lentes)**
Problema: "Okay, agora que você disse tanto faz, vamos ao próximo passo: quantos quartos…" é raciocínio verbalizado.

```
NUNCA narre seu processo. PROIBIDO começar com "Okay, agora que você disse...", "vamos ao próximo
passo", "o próximo passo é". Faça SÓ a pergunta seguinte, curta.
ERRADO: "Okay, agora que você disse tanto faz, próximo passo: quantos quartos?"
CERTO:  "E quantos quartos você procura? 😃"
```

**M2 — "Uma pergunta por vez" com exemplo negativo (e remover redundâncias)**
Problema: a regra aparece 3x espalhada e mesmo assim foi violada (pergunta + dica entre parênteses).

```
Faça SÓ uma pergunta por mensagem — no máximo um "?". Nada de pergunta + dica entre parênteses.
ERRADO: "Quantos quartos? E qual seu orçamento?"
ERRADO: "Qual seu orçamento? (se não tiver, diz tanto faz)"
CERTO:  "Quantos quartos você procura?"
```
Manter UMA só ocorrência (no bloco COLETA) e remover as outras duas — corta ~600–800 chars.

**M3 — Comodidade é filtro, não conversa**
Problema: comodidade citada nunca virava param `comodidades`.

```
SEMPRE que a pessoa citar uma comodidade (piscina, elevador, churrasqueira...) em QUALQUER mensagem,
traduza para o slug e ENVIE no param comodidades da próxima busca. Comodidade é FILTRO, não só assunto.
```

**M4 — Origem (condomínio vs imóvel) só sob pergunta direta**
Problema: o bot despejou bloco "Comodidades do Condomínio" com 10 itens.

```
Só mencione origem ao responder uma pergunta direta sobre aquela comodidade. Se for do condomínio,
diga "é uma comodidade do condomínio". NUNCA liste as comodidades do condomínio em bloco.
```

**M5 — Fecho fixo (CTA travado)**
Problema: o bot encerrou com "posso ajudar a formatar a informação em um site/anúncio/relatório".

```
A ÚLTIMA linha é SEMPRE só esta pergunta: "Quer agendar uma visita ou falar com um corretor? 💙".
Nunca ofereça outra coisa (formatar, criar anúncio, montar site, fazer relatório).
```

---

## 2. Exemplo few-shot recomendado (colar dentro de "COMO APRESENTAR OS IMÓVEIS")

```
## EXEMPLO de conversa boa (copie ESTE comportamento)

Cliente: boa tarde, quero ver casas com piscina em Araçatuba.
Bot: Boa tarde! 😃 Você quer comprar ou alugar?

Cliente: tanto faz.
Bot: [busca agora: tipoImovel=casa, cidade=Araçatuba, comodidades=piscina, finalidade=VENDA por padrão]
Achei ótimas opções de casa com piscina em Araçatuba! 💙

1. R$ 990.000 — 3 quartos no Chácaras Arco Íris
2. R$ 750.000 — 4 quartos no Jardim Sumaré
3. R$ 620.000 — 3 quartos na Vila Mendonça

Quer agendar uma visita ou falar com um corretor? 💙

Cliente: a primeira tem elevador?
Bot: [lê caracteristicas.itens da casa 1] Essa não tem elevador, mas tem a piscina que você queria 😃
Quer que eu chame um corretor pra te passar as fotos?

FIM do exemplo. Note: nada de área, IPTU, condomínio, CRECI, código, ###, tabelas. Só preço, quartos
e bairro — uma linha cada. E nunca recomeçar perguntando "comprar ou alugar" depois de já ter mostrado.
```

---

## 3. Config / não-prompt

- **`options.think=false`** — maior alavanca, fazer antes de qualquer mudança de prompt. Elimina a maior parte do vazamento de raciocínio e do tom de relatório. Alternativa se o node não expõe o campo: `/no_think` no fim do system prompt.
- **`num_ctx ≥ 8192`** — o default do qwen3:8b (2048/4096) somado ao prompt longo + buffer de 10 mensagens trunca o histórico e faz o bot "esquecer" que já buscou. Aumentar reduz a perda de contexto no follow-up.
- **Reduzir o `limit` da tool** — pedir poucos resultados (ex.: 3–5) à API em vez de muitos diminui a tentação de o 8B "listar tudo" e encurta o payload que ele precisa resumir.
- **Mover a extração do `<JSON>` estrutural para uma 2ª chamada/parse** — pedir texto natural curto E JSON no mesmo turno é carga dupla que degrada ambos. O design já tem pós-processamento (Code→If); uma coisa por chamada é mais robusto.
- **Trocar o modelo do AGENTE, se o hardware permitir** — honestamente, mesmo com tudo acima, um 8B é frágil para seguir simultaneamente qualificação + tradução de slugs + formato curto + papel-da-tool + JSON. Foram 4 regras violadas em ~4 turnos, sinal de saturação de instruções, não bug pontual. `qwen2.5:14b-instruct` ou `qwen3:14b` (instruct, sem thinking) seguem formato curto e papel-de-tool muito melhor. O design doc já prevê subir de modelo "se o hardware permitir" — aplicar isso ao agente, não só ao analisador.

Limite honesto: nenhum ajuste de prompt transforma um 8B num seguidor confiável de 5 regras concorrentes. As mudanças acima elevam a taxa de acerto, mas a aposta de maior retorno é `think=false` + modelo instruct maior. Trate o prompt como redução de variância, não garantia.

---

## 4. Risco de backfire no 8B (e mitigação)

- **Inflar ainda mais o prompt** — somar todos os blocos acima sem cortar nada satura a atenção e PIORA a aderência. Mitigação: as adições vêm acompanhadas de cortes equivalentes — fundir as 2 listas de qualificação (A9), manter "uma pergunta por vez" em um só lugar (M2), encurtar a regra de IDIOMA quando `think=false` (não há mais bloco `<think>` para vazar). Saldo deve ser neutro ou menor em tamanho.
- **Exemplos negativos viram molde** — um 8B copia o que vê. Listar campos proibidos (IPTU, CRECI, m²) ou texto errado pode fazê-lo reproduzi-los. Mitigação: todo exemplo ERRADO vem imediatamente seguido do CERTO, e o CERTO é sempre a última coisa antes do fim do bloco (recência). O molde positivo com `[colchetes]` é o que ele deve imitar — exemplos negativos ficam curtos e em minoria.
- **Listas numeradas viram "siga sempre o passo 1"** — qualquer lista ordenada faz o 8B reexecutar do início. Mitigação: deixar explícito "a ordem é só do que AINDA FALTA; pergunte o próximo que falta, não o passo 1 fixo" (A1/A9) e cap de "no máximo 2 perguntas".
- **Regra de afrouxar (A8) pode gerar loop de buscas** — o 8B pode reabrir a busca indefinidamente. Mitigação: a ordem é fixa, "uma coisa por vez", e "pare assim que vier ≥1 imóvel" — sequência determinística com condição de parada clara.
- **Reordenar/reescrever tudo de uma vez impede medir o que funcionou** — se algo regredir, você não saberá a causa. Mitigação: aplicar em ondas e testar entre elas. Onda 1 só config (`think=false`, `num_ctx`). Onda 2: A4 (formato) + A3 (papel da tool) + A5 (caminho). Onda 3: fluxo/estado (A1, A6, A7, A9). Cada onda contra a mesma conversa de regressão antes da seguinte.
- **Reforço final pode contradizer o corpo** — repetir as 3 regras mais quebradas no fim ajuda o 8B (recência), mas só se forem idênticas às do corpo. Mitigação: usar texto literalmente igual, sem reformular:

```
LEMBRE: (1) nunca pergunte o que já foi dito; (2) ao mostrar imóveis, 1 linha por imóvel, sem
markdown/relatório, só preço/quartos/bairro; (3) nunca narre seu raciocínio.
```