# Sistema de Finanças Pessoais — Google Apps Script + Google Sheets

Sistema completo de finanças pessoais que roda **dentro do Google Sheets**, com
persistência total em planilha. Metas no estilo "caixinhas", reserva de
emergência, lançamentos, indicadores, previsões e sugestões — com IA opcional.

O sistema **funciona 100% sem IA**. Quando a IA não está configurada ou falha,
ele gera sugestões por regras internas.

---

## Índice da documentação

| Parte | Documento |
|---|---|
| 1. Arquitetura, abas, fluxo de dados, premissas e decisões | [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) |
| 2. Código completo | [`src/`](src/) |
| 3. Instalação, autorização, API keys e uso | [`docs/INSTALACAO.md`](docs/INSTALACAO.md) |
| 4. Plano de testes, exemplos e casos de borda | [`docs/TESTES.md`](docs/TESTES.md) |
| 5. Roadmap de importação de holerites e melhorias | [`docs/ROADMAP.md`](docs/ROADMAP.md) |

## Arquivos do projeto

| Arquivo | Responsabilidade |
|---|---|
| `src/appsscript.json` | Manifesto (runtime V8, fuso `America/Sao_Paulo`). |
| `src/Repositorio.gs` | Acesso ao Sheets: abas, cabeçalhos, leitura/escrita em lote, IDs, cache, lock, formatação, log. |
| `src/Setup.gs` | Instalação, abas, categorias e configurações padrão, formatos, validações, dados de exemplo, integridade, triggers, backup. |
| `src/Financeiro.gs` | Lançamentos (receita, despesa, aporte, resgate, transferência), edição, exclusão e categorias. |
| `src/Recorrentes.gs` | Lançamentos recorrentes: regras, geração idempotente e comprometimento mensal. |
| `src/Metas.gs` | CRUD de metas, aportes, resgates, ajustes, saldos e campos calculados. |
| `src/Previsoes.gs` | Matemática financeira pura: valor futuro, prazo, aporte necessário, taxas, simulações. |
| `src/Indicadores.gs` | KPIs, médias, orçamentos, alertas e sugestões por regras. |
| `src/Dashboard.gs` | Montagem e atualização da aba Dashboard (fórmulas nativas + valores calculados + gráficos). |
| `src/IA.gs` | Integração opcional com Gemini/Groq, cache, retry, parsing tolerante e fallback. |
| `src/UI.gs` | Menu personalizado, diálogos nativos e funções expostas à sidebar. |
| `src/Sidebar.html` | Interface HTML embutida (CSS + JS inline, sem dependências externas). |
| `src/Testes.gs` | 14 funções de teste + execução em bateria, com limpeza automática. |
| `src/ImportacaoFutura.gs` | Estrutura e stubs para importação de holerites/comprovantes. |
| `src/Vincular.gs` | **Uso único.** Cria um projeto Apps Script já vinculado a uma planilha e copia o código para ele, via API do Apps Script. Resolve o caso de quem criou um projeto avulso por engano. |
| `src/appsscript.migracao.json` | Manifesto temporário com os escopos que `Vincular.gs` precisa. |

## Início rápido

1. Crie uma planilha no Google Sheets.
2. **Extensões → Apps Script**.
3. Copie cada arquivo de `src/` para o editor, mantendo os nomes
   (`Sidebar.html` como arquivo HTML; os `.gs` como arquivos de script).
4. Rode `setupFinanceiro()` uma vez e autorize.
5. Recarregue a planilha e use o menu **Financeiro**.

> **Várias contas Google no navegador, ou já colou o código num projeto avulso
> e o menu não aparece?** O caminho mais tranquilo é o `clasp` — ele vincula o
> projeto à sua planilha existente e sobe todos os arquivos de uma vez:
> [`docs/INSTALACAO.md` § 3.10](docs/INSTALACAO.md#310-instalar-com-clasp-caminho-recomendado-quando-a-ui-atrapalha).
> Há também o `Vincular.gs` (§ 3.9), que faz o mesmo de dentro do Apps Script,
> mas depende de uma configuração do Google Cloud que nem sempre está
> disponível.

Instruções detalhadas em [`docs/INSTALACAO.md`](docs/INSTALACAO.md).

## Aviso

Ferramenta de organização pessoal. As sugestões, geradas por regras ou por IA,
**não constituem aconselhamento financeiro profissional**.
