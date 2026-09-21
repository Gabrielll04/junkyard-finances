# Parte 5 — Roadmap

## 5.1 Importação de holerites e comprovantes

**O que já está pronto e funciona**

- a aba `Importacao_Futura` com todos os campos de metadados;
- `prepararImportacaoDocumentos()` — verifica a estrutura e a pasta do Drive;
- `registrarDocumentoParaImportacao(payload)` — coloca um documento na fila com
  status `PENDENTE`;
- `listarFilaImportacao(status)`;
- `validarDadosExtraidosStub(payload)` — **valida de verdade** a forma dos dados
  (data, valor, tipo), o que permite testar o fluxo inteiro sem OCR;
- `criarLancamentoAPartirImportacao(payload)` — **funciona hoje**: cria o
  lançamento e fecha o item da fila como `PROCESSADO`, ou marca `ERRO` com o
  motivo.

Ou seja: o começo (fila) e o fim (virar lançamento) do fluxo já existem. Falta
o miolo — extrair os dados do arquivo.

**O que é stub, e por quê**

| Stub | O que fará |
|---|---|
| `importarHoleriteStub(fileId)` | Bruto, descontos, líquido e competência → lançamentos propostos. |
| `importarComprovanteStub(fileId)` | Data, valor, estabelecimento → despesa proposta. |
| `extrairDadosDocumentoStub(fileId)` | OCR + interpretação → JSON estruturado. |
| `varrerPastaDriveStub()` | Varre a pasta do Drive e enfileira o que for novo. |

Todos devolvem `{implementado: false, mensagem: ...}` e nunca lançam exceção.

### Fases de implementação

**Fase 1 — OCR (Drive API)**
O Apps Script não tem OCR nativo, mas a Drive API avançada resolve: converter um
PDF ou imagem para Google Doc aplica OCR automaticamente. Habilitar o serviço
avançado *Drive*, converter, ler o texto com `DocumentApp`, apagar o Doc
temporário. Guardar o texto bruto em `dados_extraidos_json`.

**Fase 2 — Interpretação**
Duas camadas, nessa ordem:
1. **Regex/heurística** para o que é estável — `R$ 1.234,56`, `dd/mm/aaaa`,
   rótulos como "salário líquido", "total a pagar", "CNPJ".
2. **IA** (o `IA.gs` já está pronto) para o resto, pedindo JSON estrito com o
   mesmo tratamento tolerante de resposta que já existe.
A heurística primeiro reduz custo e mantém o sistema útil sem IA.

**Fase 3 — Confirmação humana**
Nada entra no extrato sozinho. Uma tela na sidebar lista os itens `PENDENTE`
com os valores extraídos, o usuário corrige o que estiver errado e confirma;
aí sim `criarLancamentoAPartirImportacao` é chamado. Documentos duplicados são
detectados por hash do arquivo.

**Fase 4 — Automação**
Gatilho diário chamando `varrerPastaDriveStub()` (já implementado), que enfileira
os arquivos novos de `pasta_importacao_drive`. O usuário só confirma.

### Campos esperados de um holerite

```
competencia, salario_bruto, salario_liquido, empregador,
descontos: [{ nome, valor }]        ex.: INSS, IRRF, vale-transporte, plano de saúde
```

Proposta de lançamento: uma `RECEITA` com o líquido (categoria `Salario`).
Os descontos entram como informação em `dados_extraidos_json` — registrar bruto
como receita **e** descontos como despesa inflaria artificialmente as duas
pontas do mês.

### Campos esperados de um comprovante

```
data, valor, estabelecimento, forma_pagamento, categoria_sugerida
```

A categoria sugerida vem de um mapa de palavras-chave sobre as categorias já
cadastradas, com a IA como desempate.

## 5.2 Melhorias futuras possíveis

### Já implementado

Os três primeiros itens desta lista saíram do roadmap e estão no sistema:

- **Gráficos nativos no Dashboard** (`Dashboard.gs`) — um gráfico de colunas
  com receitas x despesas dos 12 meses e uma pizza de despesas por categoria do
  mês. Os dados ficam nas colunas ocultas `I:N`; os gráficos apontam para
  intervalos fixos e são criados uma vez só, então atualizar o painel apenas
  reescreve os números. Liga e desliga em
  `Configuração → Mostrar/ocultar gráficos`.
- **Lançamentos recorrentes** (`Recorrentes.gs`, aba `Recorrentes`) — regras
  com valor, categoria, dia do mês e frequência (mensal a anual), geradas
  automaticamente na rotina diária ou sob demanda. A geração é idempotente por
  chave de origem, o dia 31 se encaixa no último dia do mês, e aportes
  recorrentes passam pelo caminho oficial da meta. Também dá para marcar
  **"Repetir automaticamente"** direto no formulário da sidebar. Junto veio o
  indicador de **comprometimento mensal**: quanto da renda já está reservado
  antes de qualquer gasto novo.
- **Editar e excluir lançamentos pela sidebar** (aba **Extrato**) — edição
  inline de valor, data, categoria e descrição; cancelar (reversível, padrão) e
  apagar de vez (com confirmação). Espelhos de movimento de meta são recusados
  com uma mensagem que aponta o caminho certo.

**Curto prazo**
- Filtro de período no painel (trimestre, ano, intervalo livre).
- Exportar CSV de um período.
- Marcar **por lançamento** se ele é recorrente ou pontual. Hoje a distinção
  vem de dois lugares — o `grupo` da categoria (Fixo/Variável), que é um
  retrato de perfil e erra no caso isolado, e a aba `Recorrentes`, que é
  precisa mas só cobre o que foi cadastrado como regra. Uma coluna
  `recorrente` na aba `Lancamentos` fecharia a lacuna dos gastos que se
  repetem sem regra formal.
- Detecção automática de recorrência: varrer o histórico procurando valor
  semelhante, mesma categoria e mesma descrição repetindo-se mês a mês, e
  sugerir a criação da regra. Só funciona bem com 3+ meses de dados.

**Médio prazo**
- Contas/carteiras de verdade: saldo por conta, usando a `TRANSFERENCIA` que já
  existe e hoje é só neutra.
- Rendimento automático das metas: gatilho mensal aplicando a taxa como
  `AJUSTE_POSITIVO`, mantendo tudo auditável.
- Metas com aportes escalonados (aumentar o aporte a cada N meses).
- Recorrências com valor variável (reajuste anual do aluguel, por exemplo) e
  com parcelamento (12x de R$ 300, encerrando sozinha ao fim das parcelas).
- Orçamento por grupo, não só por categoria.
- Comparativo ano a ano.
- Alertas por e-mail com `MailApp` quando um orçamento estourar ou uma meta
  ficar em risco.

**Longo prazo**
- Importação de extrato bancário em OFX/CSV com conciliação semiautomática.
- Simulação de cenários múltiplos lado a lado (otimista/realista/pessimista).
- Projeção de aposentadoria a partir do padrão de aportes.
- Painel como Web App (`doGet`) para acesso móvel confortável.
- Integração com Open Finance — exige backend próprio e certificação, então
  está fora do escopo de um projeto só de Apps Script; fica registrado como o
  limite natural desta arquitetura.

## 5.3 Dívidas técnicas conhecidas

- **Uma única meta `RESERVA` é assumida.** Havendo mais de uma ativa, o sistema
  usa a primeira e `validarDados()` emite aviso. Suportar várias exigiria
  decidir como somar a cobertura.
- **Sem histórico de alterações.** `Logs` registra a operação, mas não guarda o
  valor anterior de cada campo editado.
- **`Simulacoes` cresce indefinidamente.** Falta uma poda como a de `Logs`.
- **Editar uma recorrência não afeta o que já foi gerado.** É intencional —
  o histórico é real —, mas quem aumenta o valor do aluguel pode esperar que as
  ocorrências passadas mudem junto. Elas não mudam.
- **Os gráficos são recriados se alguém os apagar à mão**, mas não se o usuário
  apenas movê-los ou redimensioná-los: nesse caso o layout personalizado é
  respeitado e o sistema não interfere.
- **Conversão de moeda não existe.** Mudar `moeda` troca o símbolo e o formato,
  não converte valores já lançados.
- **O cache de insights não é por mês.** Trocar o mês de referência pode exibir
  brevemente o resumo do mês anterior até o próximo `Gerar insights`.
