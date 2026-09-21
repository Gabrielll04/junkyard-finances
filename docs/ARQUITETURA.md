# Parte 1 — Arquitetura

## 1.1 Resumo

O sistema é um projeto Apps Script (runtime V8) vinculado a uma planilha do
Google Sheets. **A planilha é a única base de dados.** Não há banco externo,
não há biblioteca de terceiros e nada de estado vive fora do Sheets — exceto
duas coisas, deliberadamente:

- **chaves de API**, que ficam em *Script Properties* (nunca na planilha, nunca
  no código);
- **cache de curta duração** e o último pacote de sugestões, em `CacheService` /
  `DocumentProperties`, sempre reconstrutíveis a partir da planilha.

As camadas são separadas por arquivo, de baixo para cima:

```
                     Sidebar.html        (interface HTML)
                          |
                       UI.gs             (menu, diálogos, ponte google.script.run)
                          |
    +---------------+-----+------+----------------+------------------+
    |               |            |                |                  |
 Metas.gs     Financeiro.gs  Dashboard.gs   Indicadores.gs        IA.gs
    |          Recorrentes.gs     |                |                  |
    +---------------+------------+----------------+------------------+
                          |                   Previsoes.gs (funções puras)
                     Repositorio.gs       (única camada que fala com o Sheets)
                          |
                    Google Sheets
```

`Setup.gs` cria e mantém a estrutura. `Testes.gs` exercita tudo.
`ImportacaoFutura.gs` guarda a estrutura do que ainda virá.

Regra que sustenta o desenho: **nenhum arquivo além de `Repositorio.gs`
(e `Dashboard.gs`, que cuida do layout visual) chama `getRange`/`getValues`
diretamente nas abas de dados.**

## 1.2 Abas criadas

| Aba | Papel | Quem escreve |
|---|---|---|
| `Dashboard` | Painel: KPIs, alertas, sugestões. | Fórmulas nativas + `Dashboard.gs` |
| `Metas` | Cadastro das caixinhas (metas comuns e RESERVA). | `Metas.gs` |
| `Lancamentos` | Extrato único: receitas, despesas, aportes, resgates, transferências. | `Financeiro.gs` |
| `Recorrentes` | Regras de lançamento automático (aluguel, salário, aporte mensal). | `Recorrentes.gs` |
| `Metas_Movimentos` | Histórico auditável do saldo de cada meta. | `Metas.gs` |
| `Categorias` | Categorias, grupo (Fixo/Variável) e orçamento padrão. | `Setup.gs` / `Financeiro.gs` |
| `Orcamentos` | Limites mensais por categoria; realizado e status calculados. | `Indicadores.gs` |
| `Simulacoes` | Histórico das simulações de metas. | `Previsoes.gs` |
| `Config` | Parâmetros do sistema. **Sem chaves de API.** | `Setup.gs` / `UI.gs` |
| `Importacao_Futura` | Fila de documentos para importação futura. | `ImportacaoFutura.gs` |
| `Logs` | Operações e erros, com segredos mascarados. | `Repositorio.gs` |
| `README` | Instruções curtas dentro da própria planilha. | `Setup.gs` |

As colunas de cada aba estão em `CABECALHOS`, no topo de `Repositorio.gs`.
`garantirCabecalhos()` adiciona colunas novas ao final sem destruir dados
existentes, o que torna o setup seguro para rodar de novo após uma atualização.

## 1.3 Fluxo de dados

**Registro de despesa (menu ou sidebar)**

```
UI.gs → registrarLancamento(payload)
      → comLock
      → _inserirLancamento: valida tipo, data, valor, categoria, duplicidade
      → adicionarLinha(Lancamentos)
      → logInfo(Logs)
      → atualizarDashboard()
          → gerarIndicadores() lê Lancamentos + Metas + Metas_Movimentos
          → escreve KPIs, alertas e sugestões no Dashboard
```

**Aporte em meta**

```
aportarEmMeta → comLock → _movimentarMeta
   1. valida meta existente e ativa, valor > 0, data plausível
   2. (resgate) confere saldo suficiente
   3. grava em Metas_Movimentos           ← fonte de verdade do saldo
   4. grava espelho em Lancamentos (APORTE_META)  ← extrato cronológico
   5. marca a meta como CONCLUIDA se atingiu o alvo
   6. atualizarCamposCalculadosMetas()
```

**Geração de lançamentos recorrentes**

```
gerarLancamentosRecorrentes (menu, sidebar ou rotina diária)
  1. lê TODAS as chaves já materializadas, em Lancamentos E Metas_Movimentos
  2. para cada regra ativa, calcula as ocorrências vencidas até hoje
  3. pula as que já existem (chave RECORRENTE:<id>:<aaaa-MM>)
  4. materializa as que faltam:
        RECEITA/DESPESA -> _inserirLancamento
        APORTE_META     -> _movimentarMeta  (Metas_Movimentos + espelho)
  5. atualiza ultima_geracao, total_gerado e proxima_geracao da regra
```

**Geração de sugestões**

```
gerarInsightsIA
  ├─ usar_ia = NAO ........................→ gerarInsightsAutomaticosSemIA()
  ├─ cache válido .........................→ devolve o último pacote
  ├─ intervalo mínimo não decorrido .......→ devolve o último pacote
  └─ chama Gemini/Groq
       ├─ sucesso → parseRespostaIA → alertas do SISTEMA + aviso legal
       └─ erro    → gerarInsightsAutomaticosSemIA() com o motivo anexado
```

## 1.4 Premissas assumidas

1. **Uso pessoal, um usuário.** O `LockService` cobre concorrência entre
   sidebar, menu e trigger; não há multiusuário real.
2. **Todo valor é positivo.** O sinal vem do tipo do lançamento. Isso evita a
   classe inteira de bugs de "menos com menos".
3. **Aportes e resgates não são receita nem despesa.** Dinheiro que muda de
   bolso dentro do mesmo patrimônio. Contá-los duplicaria o resultado do mês.
4. **A IA nunca calcula.** Ela recebe números prontos e apenas interpreta.
5. **Nada é apagado por padrão.** Excluir meta é desativar; cancelar lançamento
   é marcar `CANCELADO`. Exclusão física exige confirmação explícita e, mesmo
   assim, preserva os movimentos históricos.
6. **Moeda BRL e fuso America/Sao_Paulo por padrão**, ambos configuráveis na
   aba `Config`.
7. **Datas exibidas em dd/mm/aaaa**, valores com 2 casas decimais.

## 1.5 Decisões técnicas relevantes

**Idempotência das recorrências por chave de origem.**
Cada ocorrência gerada carrega `RECORRENTE:<id_recorrente>:<aaaa-MM>` no campo
`origem`. Antes de gerar qualquer coisa, o sistema monta o conjunto das chaves
já existentes e pula as repetidas. Rodar a geração dez vezes no mesmo dia
produz o mesmo resultado que rodar uma vez — o que importa, já que ela roda no
gatilho diário, no menu e na sidebar. Como uma recorrência de aporte grava em
`Metas_Movimentos` (e não diretamente em `Lancamentos`), a varredura de chaves
olha as **duas** abas; olhar só uma delas duplicaria todo aporte recorrente.

**Aporte recorrente passa pelo caminho oficial da meta.**
Seria mais simples inserir um `APORTE_META` direto em `Lancamentos`, mas isso
quebraria a invariante de que o saldo da meta vem de `Metas_Movimentos`. Por
isso `_gerarUmaOcorrencia` chama `_movimentarMeta`, que grava o movimento e
deixa o espelho ser criado como em qualquer aporte manual.

**Dia 31 é encaixado no último dia do mês.**
`_dataDaOcorrencia` limita o dia ao último dia do mês de destino: dia 31 vira
29 em fevereiro bissexto, 28 no comum e 30 em abril. Sem isso, `new Date(2026,
1, 31)` viraria 3 de março e a recorrência escorregaria de mês em mês.

**Gráficos apontam para intervalos fixos numa área oculta.**
As colunas `I:N` do Dashboard guardam as séries que alimentam os gráficos e
ficam escondidas. Os gráficos são criados uma única vez e apontam para
intervalos de tamanho constante; atualizar o painel só reescreve os dados, e o
Sheets redesenha sozinho. Recriar os gráficos a cada atualização piscaria o
painel e gastaria tempo de execução à toa. Linhas sem dado ficam em branco e o
Sheets as ignora ao desenhar. `mostrar_graficos = NAO` remove os gráficos sem
mexer em código.

**Editar o espelho de meta é proibido, não silenciosamente ignorado.**
`_recusarSeForEspelhoDeMeta` bloqueia edição, cancelamento e exclusão de
lançamentos com origem `META:`. Deixar editar daria a impressão de ter mudado o
saldo da meta — que não mudaria, porque vem de outra aba. A mensagem de erro
diz o caminho certo: registrar um aporte ou resgate compensatório.

**Excluir lançamento é cancelar, por padrão.**
`excluirLancamento` em modo `SOFT` marca `CANCELADO`: sai dos totais, a linha
fica, e dá para reativar. O modo `HARD` apaga a linha, exige confirmação
explícita e grava um retrato do lançamento em `Logs` antes.

**`Metas_Movimentos` como fonte de verdade do saldo.**
A alternativa seria derivar o saldo só de `Lancamentos`. Optei pela aba
dedicada porque ela isola o saldo da meta de qualquer alteração manual no
extrato, permite `AJUSTE_POSITIVO`/`AJUSTE_NEGATIVO` (rendimento creditado,
correção de erro) sem poluir o resultado do mês e dá uma trilha de auditoria
por meta. O espelho em `Lancamentos` existe só para o usuário ver tudo em ordem
cronológica; `Indicadores.gs` e as fórmulas do painel sabem ignorá-lo.
`validarDados()` verifica a consistência entre os dois lados.

**Dashboard híbrido: fórmulas nativas + script.**
Receitas, despesas, saldo, taxa de poupança, aportes e resgates do mês são
`SUMIFS` nativos. Assim o painel continua correto mesmo se o usuário editar a
aba `Lancamentos` na mão e nunca mais rodar o script. O que depende de regra do
sistema (cobertura da reserva, previsões, alertas, sugestões) é escrito pelo
script. Da linha `34` para baixo o script **nunca** escreve: é a área livre do
usuário.

**Taxa de poupança = `(receitas - despesas) / receitas`.**
Mede a folga real do mês e não depende de o usuário ter lembrado de registrar o
aporte. O indicador complementar `percentual_guardado = aportes / receitas`
mede quanto foi efetivamente para as caixinhas. Ambos aparecem no painel.

**Escrita em lote, sempre.**
`lerTabela()` faz um `getValues()` da tabela inteira e devolve objetos com
`_linha`. `adicionarLinhas()` e `atualizarCamposCalculadosMetas()` escrevem
blocos contíguos. Nenhum `getRange` dentro de laço.

**Lock com funções internas sem lock.**
`LockService.getDocumentLock()` não é reentrante. Por isso cada operação
pública (`registrarLancamento`, `aportarEmMeta`, ...) adquire o lock uma vez e
delega para um núcleo privado sem lock (`_inserirLancamento`,
`_movimentarMeta`), que pode ser composto livremente.

**Chaves só em Script Properties.**
`IA.gs` lê `GEMINI_API_KEY` / `GROQ_API_KEY` via `PropertiesService`. A chave
vai em *header* HTTP, nunca em querystring. Todo texto que entra em `Logs`
passa por `_mascararSegredos()`, que corta padrões `AIza...`, `gsk_...` e pares
`key=`/`token:`. Há teste automatizado para isso (`testFallbackIA`).

**Escopo mínimo de dados enviados à IA.**
Por padrão vão apenas agregados: totais do mês, taxa de poupança, top
categorias, cobertura da reserva, progresso das metas e alertas. Descrições de
transação **nunca** são enviadas. Ligando `enviar_resumo_para_ia = SIM`, vai
também uma lista reduzida (data, tipo, valor, categoria) — sem descrição,
sem estabelecimento.

**Fórmulas do painel em notação en-US.**
`setFormula()` no Apps Script usa sempre vírgula como separador de argumentos,
independentemente do locale da planilha; o Sheets exibe conforme o locale do
usuário.

**Limitações conhecidas do Apps Script, e o que foi feito.**

| Limitação | Contorno adotado |
|---|---|
| Sem OCR nativo | Documentado o caminho via Drive API (converter PDF → Google Doc aplica OCR). Deixado como stub. |
| `UrlFetchApp` tem timeout e cota diária | Retry com backoff exponencial, teto de tentativas configurável, intervalo mínimo entre chamadas e cache do último resultado. |
| Execução limitada a ~6 min | Todas as operações são em lote; `podarLogs()` mantém `Logs` enxuta. |
| `LockService` não reentrante | Núcleos privados sem lock (acima). |
| Cache não guarda objetos `Date` | Só `Config` e o pacote de insights (JSON) usam cache; tabelas são sempre lidas do Sheets. |
