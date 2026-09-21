# Parte 3 — Instalação e uso

## 3.1 Instalar

1. Crie uma planilha nova em <https://sheets.new> e dê um nome
   (ex.: *Finanças Pessoais*).
2. Menu **Extensões → Apps Script**. O editor abre em outra aba.
3. Apague o `Código.gs` padrão.
4. Crie um arquivo para cada `.gs` de `src/` (ícone **+ → Script**) usando
   exatamente estes nomes, sem a extensão:

   `Repositorio`, `Setup`, `Financeiro`, `Metas`, `Previsoes`,
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
cria as 11 abas com cabeçalhos, 24 configurações padrão, 17 categorias,
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
│   ├── Status da IA / Configurar IA / Testar conexao
│   └── Instalar / Remover atualizacao diaria
└── Dados ▸
    ├── Validar dados / Recalcular tudo
    ├── Criar / Remover dados de exemplo
    ├── Backup / exportar
    └── Executar testes
```

## 3.5 A sidebar

**Financeiro → Abrir painel**. Cinco abas, sem nenhuma dependência externa:

- **Painel** — KPIs do mês, barra de progresso da reserva, maiores gastos,
  alertas; botões para recarregar e para atualizar a aba Dashboard.
- **Lançar** — formulário rápido de receita/despesa, com autocompletar de
  categoria conforme o tipo.
- **Metas** — lista com barras de progresso, formulário de aporte/resgate e
  formulário de nova meta.
- **Simular** — escolhe a meta, informa um aporte alternativo e um horizonte;
  mostra prazo atual, cenário simulado, comparativo e aporte necessário para o
  prazo declarado.
- **Sugestões** — status da IA, resumo, sugestões priorizadas e o aviso legal.

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
6. `Metas → Recalcular alvo da reserva` depois de alguns meses de histórico.
7. Opcional: `Configuração → Instalar atualização diária` para o painel se
   atualizar sozinho por volta das 7h.

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
