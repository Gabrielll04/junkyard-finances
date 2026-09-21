# Parte 4 — Plano de testes

## 4.1 Como rodar

- **Pelo menu:** `Financeiro → Dados → Executar testes`.
- **Pelo editor:** execute `executarTodosOsTestes()` e veja o retorno nos logs.
- **Só os testes puros (rápidos, não tocam na planilha):** `executarTestesRapidos()`.

Os testes rodam na sua planilha real, mas:

- tudo o que criam é marcado com origem `TESTE` e nome prefixado `[TESTE]`;
- as ocorrências geradas por recorrências de teste são varridas pela chave
  `RECORRENTE:<id>` nas duas abas onde podem cair;
- cada teste registra o que criou e remove ao final;
- a limpeza roda dentro de um bloco `finally`, então **acontece mesmo quando o
  teste falha**;
- os lançamentos-espelho gerados por aportes de teste também são varridos.

Ainda assim, rode os testes antes de acumular meses de dados reais, ou faça um
backup por `Dados → Backup / exportar`.

## 4.2 As 14 funções de teste

| Função | O que valida |
|---|---|
| `testSetup` | As 11 abas existem; todas as colunas de `CABECALHOS` existem; configurações essenciais definidas; categorias padrão criadas; existe meta do tipo `RESERVA`. |
| `testPrevisaoValorFuturo` | `calcularValorFuturo` com e sem taxa, `n=0`, entrada em texto pt-BR, taxas equivalentes (ida e volta), `projetarSerieMensal`. |
| `testTempoParaMeta` | Prazo com e sem taxa, arredondamento para cima, meta já atingida, meta inatingível, só-juros, meta sem alvo, coerência com o valor futuro. |
| `testAporteNecessario` | Aporte com e sem taxa, com saldo inicial, meta atingida, prazo zero, coerência (aportar o valor calculado alcança a meta), progresso e cobertura. |
| `testCriarMeta` | Criação, campos calculados iniciais, rejeição de nome vazio / alvo zero / nome duplicado, edição, desativar→listagem→reativar, `excluirMeta` padrão = soft delete. |
| `testRegistrarDespesa` | Conversão `"123,45"`, status padrão, soma do mês, bloqueio de duplicado, rejeição de data/tipo/valor inválidos, `APORTE_META` sem meta, cancelamento sai dos totais mas a linha fica. |
| `testRegistrarReceita` | Soma do mês, normalização de categoria (`salario` → `Salario`), atalho `registrarReceita`. |
| `testEditarExcluirLancamento` | Edição de valor/categoria/descrição com ID preservado e total do mês recalculado; rejeição de data inválida, valor negativo, conversão para `APORTE_META` e ID inexistente; cancelar → reativar; espelho de meta recusa edição **e** exclusão, com saldo intacto; `HARD` sem confirmação é recusado, com confirmação apaga a linha. |
| `testRecorrentes` | Criação; geração de exatamente 4 ocorrências vencidas; **idempotência** (segunda execução cria 0 e pula 4); total do mês não dobra; chaves de origem únicas; contador e próxima ocorrência; desativar/reativar; validações (descrição, tipo, valor, frequência, aporte sem meta, data final < início); dia 31 em fevereiro/abril; data final corta a geração; frequência trimestral; aporte recorrente grava em `Metas_Movimentos` e entra no saldo; comprometimento mensal normalizado; exclusão da regra preserva os lançamentos gerados. |
| `testAporteMeta` | Saldo e progresso após aporte, espelho `APORTE_META` criado, **aporte não vira receita nem despesa**, acúmulo de aportes, rejeições, meta vira `CONCLUIDA` ao atingir o alvo. |
| `testResgateMeta` | Saldo após resgate, espelho `RESGATE_META`, bloqueio por saldo insuficiente, saldo intacto após rejeição. |
| `testIndicadores` | Mês de referência, receitas/despesas incluem o lançado, `saldo = receitas - despesas`, fórmula da taxa de poupança, top-5 categorias, série de 12 meses, blocos de reserva e fixos/variáveis, soma das categorias ≤ despesas, orçamentos. |
| `testFallbackIA` | Sugestões por regras sempre produzem resultado com aviso legal; parsing de JSON puro, JSON em markdown, texto livre, string vazia, JSON quebrado, prioridade inválida; status não vaza chave; resumo não leva descrições; com `usar_ia=NAO` a fonte é `REGRAS`; mascaramento de segredos. |
| `testIntegridadeDados` | `validarDados()` sem problemas críticos; conversão numérica pt-BR/en-US; datas `dd/mm/aaaa` e ISO, `31/02` rejeitada; normalização de texto; formatação de moeda; validação monetária; virada de ano em `deslocarMes`; **saldo de cada meta bate com seus movimentos**. |

## 4.3 Casos de borda verificados

**Matemática financeira**
- taxa zero (fórmula linear em vez da exponencial);
- aporte zero com saldo (só juros: possível, mas lento);
- aporte zero e taxa zero (inatingível, com mensagem clara);
- saldo já maior que a meta (progresso travado em 100%, prazo 0);
- meta sem valor alvo;
- prazo zero ou negativo;
- prazo acima de 100 anos → tratado como inatingível, sem laço infinito;
- meses sempre arredondados para cima (10,1 meses vira 11).

**Entrada de dados**
- `"1.234,56"`, `"1234.56"`, `"R$ 99,90"` e números;
- `"31/02/2024"` rejeitada (validação de overflow, não só regex);
- `"2024-03-05"` sem deslocamento de fuso;
- ano fora de `[1990, atual+50]` rejeitado;
- data além de `dias_futuro_permitidos` rejeitada;
- valor zero e negativo rejeitados;
- tipo inválido rejeitado;
- categoria com acento/caixa diferente casa com a cadastrada.

**Metas**
- resgate acima do saldo (bloqueado, salvo configuração);
- aporte em meta inativa (bloqueado);
- meta duplicada por nome entre as ativas;
- data limite anterior ao início;
- exclusão definitiva com movimentos exige confirmação explícita;
- movimentos órfãos após exclusão definitiva aparecem como **aviso**, não erro —
  a preservação é intencional.

**IA**
- IA desligada;
- chave ausente;
- HTTP 429 e 5xx (retry com backoff); 4xx (falha imediata);
- resposta em texto livre, com cercas markdown, vazia ou com JSON quebrado;
- prioridade fora de `alta|media|baixa`;
- conteúdo bloqueado pelo provedor.

**Recorrências**
- geração rodada duas vezes seguidas (idempotência via chave de origem);
- dia 31 em fevereiro bissexto (29), fevereiro comum (28) e abril (30);
- virada de ano com frequência mensal, trimestral e anual;
- data final no meio do período (corta a geração e zera a próxima ocorrência);
- data de início posterior ao dia da recorrência (a ocorrência anterior ao
  início é ignorada);
- regra inativa não gera nada;
- regra com erro não impede as demais de rodar;
- aporte recorrente cai em `Metas_Movimentos`, não só no extrato;
- exclusão da regra preserva os lançamentos já gerados.

> A aritmética de datas das recorrências foi verificada fora do Apps Script
> com 50 datas simuladas de "hoje" (todos os meses, dias 1/15/28/31, ano
> bissexto e viradas de ano): 308 verificações, 0 falhas. Por isso os números
> esperados em `testRecorrentes` (4, 2, 2, 2 ocorrências) valem em qualquer dia
> do ano em que você rodar a bateria.

**Edição e exclusão**
- editar lançamento inexistente;
- converter lançamento comum em `APORTE_META`/`RESGATE_META` (recusado);
- editar/excluir espelho de meta (recusado, com saldo intacto);
- exclusão definitiva sem confirmação explícita (recusada);
- cancelar e reativar, conferindo os totais do mês nos dois sentidos.

**Planilha**
- aba ausente (mensagem pedindo o setup);
- coluna nova adicionada ao final sem destruir dados;
- linhas totalmente vazias ignoradas na leitura;
- colunas calculadas não contíguas (cai para atualização linha a linha);
- área livre do Dashboard (linha 34+) nunca sobrescrita.

## 4.4 Exemplos de dados

`Dados → Criar dados de exemplo` cria, sem duplicar se já existirem:

- **3 meses** de histórico: salário de R$ 5.200 e sete despesas por mês
  (moradia, contas fixas, mercado, transporte, lazer, assinaturas), com variação
  crescente para produzir uma série de despesa média realista;
- a meta **Viagem (exemplo)**: alvo R$ 8.000, aporte R$ 500/mês, prazo em 1 ano;
- **aportes**: dois de R$ 600 na reserva e um de R$ 500 na meta de exemplo;
- **orçamentos**: Mercado R$ 800 e Lazer R$ 300 — o de Lazer costuma estourar,
  o que exercita o alerta de orçamento;
- uma **recorrência**: *Aluguel (exemplo)*, R$ 1.500, todo dia 10, começando no
  **próximo mês** — assim ela demonstra a geração automática sem mexer no
  histórico já criado. `Remover dados de exemplo` apaga a regra e tudo o que
  ela tiver gerado.

Tudo marcado com origem `EXEMPLO` e removível por
`Dados → Remover dados de exemplo`.

## 4.5 Verificação manual sugerida

1. Rode o setup e confira as 11 abas.
2. Crie dados de exemplo e abra o painel — os KPIs devem estar preenchidos.
3. Registre uma despesa pela sidebar; o saldo do mês deve cair na hora.
4. Aporte R$ 100 numa meta: o progresso sobe, **e receitas/despesas do mês não mudam**.
5. Tente resgatar mais do que o saldo: deve ser recusado com mensagem clara.
6. Simule a meta com um aporte maior: o comparativo deve dizer quantos meses você ganha.
7. `Dados → Validar dados`: nenhum problema crítico.
8. No Extrato, edite o valor de um lançamento: o saldo do mês acompanha.
   Cancele-o e veja sair dos totais; reative e veja voltar.
9. Marque **"Repetir automaticamente"** num lançamento e confira a regra
   aparecendo na lista de recorrências, com a próxima ocorrência no mês seguinte.
10. `Recorrentes → Gerar agora` duas vezes seguidas: a segunda deve dizer que
    não havia nada a gerar.
11. `Dados → Executar testes`: 14/14.
12. Sem configurar IA, gere insights: a fonte deve ser `REGRAS` e as sugestões
   devem fazer sentido para os dados de exemplo.
