# Parte 3 — Instalação e uso

## 3.1 Instalar

1. Crie uma planilha nova em <https://sheets.new> e dê um nome
   (ex.: *Finanças Pessoais*).
2. Menu **Extensões → Apps Script**. O editor abre em outra aba.
3. Apague o `Código.gs` padrão.
4. Crie um arquivo para cada `.gs` de `src/` (ícone **+ → Script**) usando
   exatamente estes nomes, sem a extensão:

   `Repositorio`, `Setup`, `Financeiro`, `Recorrentes`, `Metas`, `Previsoes`,
   `Indicadores`, `Dashboard`, `IA`, `UI`, `Testes`, `ImportacaoFutura`

   Cole o conteúdo do arquivo correspondente em cada um.
5. Crie **+ → HTML** com o nome `Sidebar` e cole o conteúdo de
   `src/Sidebar.html`.
6. Opcional, mas recomendado: **⚙ Configurações do projeto → Mostrar
   `appsscript.json`**, e substitua pelo conteúdo de `src/appsscript.json`
   (garante runtime V8 e fuso `America/Sao_Paulo`).
7. Salve (Ctrl+S).

> A ordem dos arquivos não importa: no Apps Script todas as funções são globais.

## 3.2 Executar o setup e autorizar

1. No editor, selecione a função **`setupFinanceiro`** na lista superior e
   clique em **Executar**.
2. O Google pedirá autorização:
   - **Revisar permissões** → escolha sua conta;
   - a tela "O Google não verificou este app" aparece porque o script é seu, não
     publicado. Clique em **Avançado → Acessar (nome do projeto)**;
   - **Permitir**.
3. Volte para a planilha e **recarregue a página**. O menu **Financeiro** aparece.

O que o setup faz (é idempotente — pode rodar quantas vezes quiser):
cria as 12 abas com cabeçalhos, 27 configurações padrão, 17 categorias,
formatos de data/moeda/percentual, listas suspensas nas colunas de domínio
fechado, a meta **Reserva de Emergência**, o layout do painel e a aba README.

**Permissões pedidas e por quê**

| Permissão | Usada em |
|---|---|
| Ver e gerenciar esta planilha | tudo — a planilha é o banco de dados |
| Exibir e executar conteúdo em interfaces | menu e sidebar |
| Conectar-se a serviço externo | apenas a IA opcional (`UrlFetchApp`) |
| Executar quando você não estiver presente | apenas se você instalar o gatilho diário |
| Ver e gerenciar arquivos do Drive | apenas `Backup / exportar` (cria uma cópia da planilha) |

Se você nunca usar IA, backup ou gatilho, essas partes simplesmente não são
exercitadas.

## 3.3 Configurar as API keys (opcional)

**As chaves nunca vão na planilha nem no código.**

1. No editor do Apps Script: **⚙ Configurações do projeto**.
2. Role até **Propriedades do script → Adicionar propriedade de script**.
3. Adicione uma das duas (ou ambas):

   | Propriedade | Onde obter |
   |---|---|
   | `GEMINI_API_KEY` | <https://aistudio.google.com/app/apikey> |
   | `GROQ_API_KEY` | <https://console.groq.com/keys> |

4. **Salvar propriedades do script**.
5. Na planilha: **Financeiro → Configuração → Configurar IA**. Escolha o
   provedor (`gemini` ou `groq`), o modelo, e responda se quer ativar a IA e se
   aceita enviar a lista resumida de lançamentos.
6. **Financeiro → Configuração → Testar conexão com a IA** para confirmar.

Alternativa sem diálogos: edite direto a aba `Config` —
`usar_ia = SIM`, `provedor_ia = gemini`, `modelo_ia = gemini-2.0-flash`.

Modelos padrão: `gemini-2.0-flash` (Gemini) e `llama-3.3-70b-versatile` (Groq).
Ambos têm free tier generoso. Se o provedor aposentar o modelo, basta trocar o
valor de `modelo_ia` — nada no código precisa mudar.

**Status sem revelar chave:** `Financeiro → Configuração → Status da IA` diz
apenas se cada chave *existe*, nunca o valor.

## 3.4 O menu

```
Financeiro
├── Abrir painel                      abre a sidebar HTML
├── Atualizar painel                  recalcula a aba Dashboard
├── Registrar receita
├── Registrar despesa
├── Lancamentos ▸
│   ├── Registrar receita / Registrar despesa
│   ├── Ver ultimos lancamentos
│   ├── Editar lancamento / Excluir lancamento
│   └── Recorrentes ▸
│       ├── Nova recorrencia / Ver recorrencias
│       ├── Gerar agora
│       └── Ativar-desativar / Excluir recorrencia
├── Metas ▸
│   ├── Nova meta / Ver metas / Editar meta
│   ├── Aportar em meta / Resgatar de meta
│   ├── Ativar / Desativar / Excluir meta
│   └── Recalcular alvo da reserva
├── Simulacoes ▸
│   ├── Simular uma meta
│   ├── Simular todas as metas        (grava na aba Simulacoes)
│   └── Quanto terei em N meses?      calculadora avulsa
├── Gerar indicadores
├── Gerar insights (IA ou regras)
├── Configuracao ▸
│   ├── Executar setup
│   ├── Reaplicar formatos e validacoes
│   ├── Mostrar/ocultar graficos
│   ├── Status da IA / Configurar IA / Testar conexao
│   └── Instalar / Remover atualizacao diaria
└── Dados ▸
    ├── Validar dados / Recalcular tudo
    ├── Criar / Remover dados de exemplo
    ├── Backup / exportar
    └── Executar testes
```

## 3.5 A sidebar

**Financeiro → Abrir painel**. Seis abas, sem nenhuma dependência externa:

- **Painel** — KPIs do mês, barra de progresso da reserva, maiores gastos,
  alertas; botões para recarregar e para atualizar a aba Dashboard.
- **Lançar** — formulário rápido de receita/despesa, com autocompletar de
  categoria conforme o tipo, caixa **"Repetir automaticamente"** (cria a
  recorrência a partir do que acabou de ser lançado), lista das recorrências
  ativas com o comprometimento mensal, e botão para gerar as ocorrências
  vencidas na hora.
- **Extrato** — últimos lançamentos com filtro por tipo e quantidade. Cada
  linha traz **Editar** (formulário inline de valor, data, categoria e
  descrição) e **Cancelar**; lançamentos cancelados mostram **Reativar** e
  **Apagar de vez**. Movimentos de meta aparecem marcados como somente leitura.
- **Metas** — lista com barras de progresso, formulário de aporte/resgate e
  formulário de nova meta.
- **Simular** — escolhe a meta, informa um aporte alternativo e um horizonte;
  mostra prazo atual, cenário simulado, comparativo e aporte necessário para o
  prazo declarado.
- **Dicas** — status da IA, resumo, sugestões priorizadas e o aviso legal.

Toda validação acontece **duas vezes**: no cliente (retorno imediato) e no
servidor (fonte da verdade). O indicador de carregamento aparece em qualquer
chamada e os erros voltam em texto legível.

## 3.6 Primeiros passos sugeridos

1. `Dados → Criar dados de exemplo` para ver o sistema cheio.
2. Abra o painel e navegue.
3. `Dados → Remover dados de exemplo` quando quiser começar de verdade.
4. Ajuste a aba `Config`:
   - `meta_meses_reserva` (padrão 6);
   - `meses_base_despesa_media` (3, 6 ou 12);
   - `taxa_mensal_padrao` — decimal, `0.008` = 0,8% ao mês; deixe `0` se não
     quiser considerar rendimento.
5. Crie suas metas e registre os lançamentos do mês.
6. Cadastre o que se repete todo mês (aluguel, salário, assinaturas) em
   `Lançamentos → Recorrentes → Nova recorrência`, ou marque **"Repetir
   automaticamente"** ao lançar pela sidebar.
7. `Metas → Recalcular alvo da reserva` depois de alguns meses de histórico.
8. Opcional: `Configuração → Instalar atualização diária` — o painel se atualiza
   sozinho por volta das 7h **e as recorrências vencidas são geradas
   automaticamente**. Sem o gatilho, use `Recorrentes → Gerar agora` quando
   quiser.

## 3.6.1 Gastos recorrentes vs. pontuais

Há duas leituras diferentes, e vale saber qual usar:

- **Por categoria** (já existia): a coluna `grupo` da aba `Categorias`
  classifica cada categoria como `Fixo` ou `Variavel`, e o painel mostra
  *"X% fixos"*. É um retrato do perfil de gasto, mas erra no caso isolado —
  um conserto lançado em Moradia conta como fixo.
- **Por recorrência** (novo): a aba `Recorrentes` diz exatamente o que se
  repete, com valor e frequência. `Ver recorrências` mostra o
  **comprometimento mensal** — quanto da sua renda já está reservado antes de
  qualquer gasto novo —, normalizando frequências diferentes para o
  equivalente mensal (uma anual de R$ 1.200 conta como R$ 100/mês).

## 3.7 Configurações da aba `Config`

| Chave | Padrão | O que faz |
|---|---|---|
| `moeda` | `BRL` | Símbolo e formato monetário. |
| `fuso_horario` | `America/Sao_Paulo` | Base de todas as datas. |
| `meta_meses_reserva` | `6` | Meses de despesa que a reserva deve cobrir. |
| `meses_base_despesa_media` | `6` | Janela da despesa média (3, 6 ou 12). |
| `categoria_reserva_padrao` | `Reserva` | Categoria dos aportes da reserva. |
| `categoria_metas_padrao` | `Investimentos` | Categoria dos aportes das demais metas. |
| `taxa_mensal_padrao` | `0` | Rendimento mensal em decimal. |
| `meses_projecao_padrao` | `12` | Horizonte padrão das simulações. |
| `permitir_saldo_negativo_meta` | `NAO` | `SIM` libera resgate acima do saldo. |
| `bloquear_duplicados` | `SIM` | Barra lançamentos idênticos no mesmo dia. |
| `criar_categoria_automaticamente` | `SIM` | Cria a categoria ao lançar. |
| `dias_futuro_permitidos` | `370` | Limite de data futura. |
| `dias_alerta_prazo_meta` | `60` | Antecedência do alerta de prazo. |
| `mostrar_graficos` | `SIM` | Desenha os gráficos nativos no painel. |
| `gerar_recorrentes_automaticamente` | `SIM` | Gera as recorrências vencidas na rotina diária. |
| `max_ocorrencias_por_execucao` | `60` | Teto de lançamentos recorrentes por execução. |
| `provedor_ia` | `gemini` | `gemini` ou `groq`. |
| `modelo_ia` | `gemini-2.0-flash` | Modelo do provedor. |
| `usar_ia` | `NAO` | Liga as sugestões por IA. |
| `enviar_resumo_para_ia` | `NAO` | `SIM` envia também lançamentos resumidos. |
| `minutos_cache_ia` | `60` | Reaproveitamento da última resposta. |
| `minutos_minimos_entre_chamadas_ia` | `5` | Protege o free tier. |
| `tentativas_ia` | `3` | Tentativas antes do fallback. |
| `pasta_importacao_drive` | vazio | Pasta do Drive para a importação futura. |

## 3.8 Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| Menu **Financeiro** não aparece | Recarregue a planilha. Se persistir, rode `onOpen` manualmente no editor. |
| "Sistema ocupado com outra operação" | Duas operações simultâneas. Aguarde alguns segundos. |
| "Chave de API ausente" | A propriedade do script não foi salva, ou o nome está diferente de `GEMINI_API_KEY`/`GROQ_API_KEY`. |
| "Limite de requisições (429)" | Free tier atingido. O sistema já caiu no fallback por regras; tente mais tarde. |
| "Lançamento parece duplicado" | Proteção contra clique duplo. Mude a descrição, ou desligue `bloquear_duplicados`. |
| Backup falha | Falta a permissão de Drive. Rode `exportarBackup` uma vez pelo editor e autorize. |
| Valores do painel zerados | O mês em `F2` do Dashboard está diferente do mês dos lançamentos. |
| Gráficos não aparecem | `mostrar_graficos` está `NAO`, ou o painel ainda não foi atualizado. Use `Configuração → Mostrar/ocultar gráficos`. |
| "Este lançamento é o espelho de um movimento de meta" | Aportes e resgates se editam pela meta, não pelo extrato. Registre um movimento compensatório. |
| Recorrência não gerou nada | Ela está inativa, a data de início é futura, a data final já passou, ou as ocorrências já foram geradas antes. |

## 3.9 Vincular um projeto avulso a uma planilha

Se você criou o projeto em `script.google.com` (projeto **avulso**) e colou o
código lá, o menu **Financeiro** nunca vai aparecer: `onOpen()` não dispara e
`SpreadsheetApp.getActiveSpreadsheet()` devolve `null`.

**Pela interface do Google não existe como vincular depois.** Mas pela **API do
Apps Script** existe: o endpoint `projects.create` aceita um `parentId`, que é o
ID do arquivo do Drive ao qual o projeto nasce vinculado. O `src/Vincular.gs`
usa isso para criar o projeto vinculado **e copiar todo o seu código para ele**,
sem você colar nada de novo.

### Passo 1 — Ative a API do Apps Script

Abra <https://script.google.com/home/usersettings> e ligue
**"API do Google Apps Script"**.

É uma configuração **por conta**. Confira pelo avatar, no canto superior
direito, que você está na mesma conta em que o projeto avulso vive.

### Passo 2 — Declare os escopos no projeto avulso

No editor: **⚙ Configurações do projeto** → marque **"Mostrar arquivo de
manifesto `appsscript.json`"**. Abra o `appsscript.json` e substitua o conteúdo
pelo de `src/appsscript.migracao.json` (sem a linha `_comentario`):

```json
{
  "timeZone": "America/Sao_Paulo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/script.projects",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
  ]
}
```

Esses escopos largos servem **só para a migração**. O projeto vinculado que
será criado não os herda: o `Vincular.gs` remove a lista de escopos do
manifesto copiado, deixando o Apps Script detectar o mínimo necessário.

### Passo 3 — Adicione o `Vincular.gs`

Crie um arquivo de script chamado **`Vincular`** no projeto avulso e cole o
conteúdo de `src/Vincular.gs`.

### Passo 4 — Rode

Escolha uma das duas funções na lista suspensa do editor e clique em
**Executar**. Autorize quando a tela de permissões aparecer.

| Situação | Função | O que fazer antes |
|---|---|---|
| A planilha já existe | `vincularProjetoAPlanilha` | Preencher `ID_PLANILHA_DESTINO` no topo do arquivo — aceita o ID puro **ou** a URL inteira |
| Quer que o script crie a planilha | `criarPlanilhaJaVinculada` | Nada |

Acompanhe pelo **Registro de execução** (`Ctrl+Enter`). No fim, ele imprime o
link da planilha e o do projeto vinculado.

### Passo 5 — Use

1. Abra a planilha pelo link que apareceu no log.
2. **Recarregue a página (F5).**
3. O menu **Financeiro** aparece.
4. `Financeiro → Configuração → Executar setup` e autorize.

Você **não precisa abrir o editor do projeto novo** — o código já está lá. Só
volte ao editor se for cadastrar chaves de IA em Propriedades do script.

Depois de confirmar que o menu apareceu, pode apagar o projeto avulso.

### Se der errado

Rode **`diagnosticarAmbiente()`** no projeto avulso. Ele imprime em qual conta
está rodando, o ID do projeto, se está vinculado a alguma planilha e se a API
responde.

| Erro | Causa | Solução |
|---|---|---|
| `Apps Script API has not been used in project <número>` | **Não é o interruptor da conta.** É o `script.googleapis.com` desligado no projeto do Google Cloud que fica por trás do script — quando um script chama a API, o Google cobra a chamada do projeto Cloud dele | Tente o link do erro e clique em **ATIVAR**. Se o projeto for oculto (criado automaticamente pelo Apps Script), não dá para habilitar nada nele: **use o `clasp`**, seção 3.10 |
| `403` sem citar a API | Falta escopo no manifesto | Refaça o passo 2 e rode de novo, aceitando as permissões |
| `404` | ID da planilha errado, ou a conta não enxerga o arquivo | Confira o ID; cole a URL inteira que o script extrai sozinho |
| "Não consegui abrir a planilha" | A conta do projeto avulso não tem acesso de edição à planilha | Compartilhe a planilha com essa conta como **Editor** |

> Este caminho usa a API pública do Apps Script e eu **não consegui testá-lo
> daqui** — não há ambiente Google nesta sessão. O código está com tratamento de
> erro detalhado justamente por isso: se falhar, a mensagem diz o que corrigir.
> Me mande o que aparecer no log que eu ajusto.

## 3.10 Instalar com `clasp` (caminho recomendado quando a UI atrapalha)

O `clasp` é a CLI oficial do Apps Script. Ele resolve de uma vez os dois
problemas mais chatos da instalação manual:

- **Múltiplas contas** — o `clasp login` mostra o seletor de contas
  explicitamente. Nada de `/u/N/` na URL.
- **Vincular à planilha** — o `clasp create` aceita `--parentId`, o mesmo
  parâmetro que o `Vincular.gs` usa. O projeto nasce vinculado.

E, ao contrário do `Vincular.gs`, ele **não esbarra no projeto do Google
Cloud**: o `clasp` usa o cliente OAuth do próprio Google, então a única coisa
que precisa estar ligada é a permissão da sua conta em
<https://script.google.com/home/usersettings> — aquele interruptor sozinho
basta aqui.

### Pré-requisito

Node.js 18 ou superior. Confira com `node --version`.

```bash
npm install -g @google/clasp
```

### Passo 1 — Login

```bash
clasp login
```

Abre o navegador com o seletor de contas. **Escolha a conta dona da planilha.**

### Passo 2 — Criar o projeto vinculado

Vá até a pasta do repositório e rode **uma** das duas opções:

**A) Você já tem a planilha** (pegue o ID da URL, entre `/d/` e `/edit`):

```bash
clasp create --title "Financas Pessoais" --parentId COLE_O_ID_DA_PLANILHA --rootDir ./src
```

**B) Deixe o clasp criar planilha e script juntos:**

```bash
clasp create --type sheets --title "Financas Pessoais" --rootDir ./src
```

### Passo 3 — Enviar o código

```bash
clasp push
```

Sobe os `.gs`, o `Sidebar.html` e o `appsscript.json` de uma vez. O
`.claspignore` do repositório já exclui o `Vincular.gs` e o
`appsscript.migracao.json`, que não fazem parte do sistema.

### Passo 4 — Usar

```bash
clasp open --addon     # ou abra a planilha direto no navegador
```

1. Abra a planilha e **recarregue a página (F5)**.
2. O menu **Financeiro** aparece.
3. `Financeiro → Configuração → Executar setup` e autorize.

### Depois

Alterou algo no repositório? `clasp push` de novo e pronto — não precisa
copiar nada a mão nunca mais.

| Problema | Solução |
|---|---|
| `User has not enabled the Apps Script API` | Ligue em <https://script.google.com/home/usersettings> (é o interruptor da conta, e para o clasp ele basta) |
| `clasp: command not found` | O npm global não está no PATH. Use `npx @google/clasp <comando>` |
| Entrou com a conta errada | `clasp logout` e depois `clasp login` de novo |
| `Invalid parentId` | O ID está errado. Pegue só o trecho entre `/d/` e `/edit` da URL da planilha |
