/**
 * Vincular.gs
 * ---------------------------------------------------------------------------
 * UTILITARIO DE USO UNICO. Nao faz parte do sistema financeiro.
 *
 * PARA QUE SERVE
 * Pela interface do Google nao existe como transformar um projeto avulso
 * (criado em script.google.com) em um projeto vinculado a uma planilha. Mas a
 * API do Apps Script existe e resolve: o endpoint projects.create aceita um
 * parentId, que e o ID do arquivo do Drive ao qual o novo projeto nasce
 * vinculado.
 *
 * Este arquivo usa essa API para:
 *   1. criar um projeto Apps Script JA VINCULADO a uma planilha;
 *   2. copiar para ele todo o codigo deste projeto, arquivo por arquivo.
 *
 * Resultado: a planilha passa a ter o sistema completo, com menu e sidebar
 * funcionando, sem voce colar nada a mao.
 *
 * ---------------------------------------------------------------------------
 * ANTES DE RODAR - TRES PASSOS OBRIGATORIOS
 *
 * 1. ATIVE A API DO APPS SCRIPT (uma vez por conta Google)
 *    Abra https://script.google.com/home/usersettings
 *    Ligue "API do Google Apps Script".
 *    ATENCAO: confira, pelo avatar no canto superior direito, que voce esta
 *    na MESMA conta em que este projeto avulso vive.
 *
 * 2. DECLARE OS ESCOPOS
 *    No editor: Configuracoes do projeto > marque "Mostrar arquivo de
 *    manifesto appsscript.json". Abra o appsscript.json e deixe assim:
 *
 *    {
 *      "timeZone": "America/Sao_Paulo",
 *      "dependencies": {},
 *      "exceptionLogging": "STACKDRIVER",
 *      "runtimeVersion": "V8",
 *      "oauthScopes": [
 *        "https://www.googleapis.com/auth/script.projects",
 *        "https://www.googleapis.com/auth/script.external_request",
 *        "https://www.googleapis.com/auth/spreadsheets",
 *        "https://www.googleapis.com/auth/drive"
 *      ]
 *    }
 *
 *    Esses escopos largos sao so para a migracao. O projeto vinculado que
 *    sera criado nao os herda: este arquivo remove a lista de escopos do
 *    manifesto copiado, deixando o Apps Script detectar o minimo necessario.
 *
 * 3. ESCOLHA A FUNCAO
 *    - Ja tem a planilha: preencha ID_PLANILHA_DESTINO abaixo e rode
 *      vincularProjetoAPlanilha().
 *    - Quer que o script crie a planilha do zero: rode
 *      criarPlanilhaJaVinculada(). Nao precisa preencher nada.
 * ---------------------------------------------------------------------------
 */

/**
 * ID da planilha de destino.
 * Pode colar o ID puro ou a URL inteira - a URL e reconhecida automaticamente.
 * Na URL https://docs.google.com/spreadsheets/d/1AbC...XyZ/edit
 * o ID e o trecho entre /d/ e /edit.
 */
var ID_PLANILHA_DESTINO = '';

/** Nome dado ao projeto vinculado que sera criado. */
var NOME_PROJETO_VINCULADO = 'Financas Pessoais - Sistema';

/** Endereco base da API do Apps Script. */
var API_SCRIPT = 'https://script.googleapis.com/v1/projects';

/**
 * Permissoes que o SISTEMA FINANCEIRO precisa em tempo de execucao.
 * Sao gravadas no manifesto do projeto vinculado, substituindo as permissoes
 * amplas que a migracao exige.
 *
 * Nao confie na deteccao automatica de escopos do Apps Script aqui: ela nem
 * sempre identifica script.container.ui, e sem esse escopo o menu abre mas a
 * sidebar falha com "As permissoes especificadas nao sao suficientes para
 * chamar Ui.showSidebar".
 */
var ESCOPOS_SISTEMA = [
  // Ler e escrever nas abas da planilha.
  'https://www.googleapis.com/auth/spreadsheets',
  // Menu personalizado, sidebar e caixas de dialogo.
  'https://www.googleapis.com/auth/script.container.ui',
  // Gatilho diario (Financeiro > Configuracao > Instalar atualizacao diaria).
  'https://www.googleapis.com/auth/script.scriptapp',
  // Chamadas as APIs de IA (opcional, so se voce ativar a IA).
  'https://www.googleapis.com/auth/script.external_request',
  // Backup: Financeiro > Dados > Backup/exportar copia a planilha no Drive.
  'https://www.googleapis.com/auth/drive'
];

// ===========================================================================
// FUNCOES PRINCIPAIS
// ===========================================================================

/**
 * Cria um projeto vinculado a uma planilha JA EXISTENTE e copia o codigo.
 * Preencha ID_PLANILHA_DESTINO antes de rodar.
 *
 * @return {{sucesso: boolean, mensagem: string, urlProjeto: (string|undefined),
 *           urlPlanilha: (string|undefined)}}
 */
function vincularProjetoAPlanilha() {
  try {
    var idPlanilha = _extrairIdPlanilha(ID_PLANILHA_DESTINO);
    if (!idPlanilha) {
      throw new Error(
        'Preencha ID_PLANILHA_DESTINO no topo deste arquivo com o ID (ou a URL) ' +
        'da planilha de destino.');
    }
    return _vincular(idPlanilha);

  } catch (e) {
    return _relatarFalha(e);
  }
}

/**
 * Cria uma planilha NOVA e, em seguida, um projeto ja vinculado a ela,
 * com todo o codigo copiado. Nao exige nenhuma configuracao previa alem
 * dos escopos e da API ativada.
 *
 * @return {{sucesso: boolean, mensagem: string, urlProjeto: (string|undefined),
 *           urlPlanilha: (string|undefined)}}
 */
function criarPlanilhaJaVinculada() {
  try {
    var nome = 'Financas Pessoais';
    var planilha = SpreadsheetApp.create(nome);
    Logger.log('Planilha criada: ' + planilha.getUrl());
    return _vincular(planilha.getId());

  } catch (e) {
    return _relatarFalha(e);
  }
}

/**
 * Nucleo da operacao: cria o projeto vinculado e copia o conteudo.
 * @param {string} idPlanilha
 * @return {Object}
 * @private
 */
function _vincular(idPlanilha) {
  // 1. Confere o acesso a planilha antes de qualquer coisa. Se a conta atual
  //    nao enxerga o arquivo, e melhor falhar aqui, com mensagem clara.
  var planilha;
  try {
    planilha = SpreadsheetApp.openById(idPlanilha);
  } catch (e) {
    throw new Error(
      'Nao consegui abrir a planilha com o ID "' + idPlanilha + '". ' +
      'Verifique se o ID esta certo e se a conta logada neste projeto tem ' +
      'acesso de edicao a ela. (Detalhe: ' + e.message + ')');
  }
  Logger.log('Planilha encontrada: "' + planilha.getName() + '"');

  // 2. Le o conteudo DESTE projeto (todos os arquivos .gs, .html e o manifesto).
  var idOrigem = ScriptApp.getScriptId();
  Logger.log('Lendo o codigo do projeto atual (' + idOrigem + ')...');
  var conteudoOrigem = _chamarApi('get', API_SCRIPT + '/' + idOrigem + '/content');

  var arquivos = _prepararArquivos(conteudoOrigem.files || []);
  if (!arquivos.length) {
    throw new Error('Nenhum arquivo encontrado neste projeto para copiar.');
  }
  Logger.log(arquivos.length + ' arquivo(s) serao copiados.');

  // 3. Cria o projeto JA VINCULADO. O parentId e o que faz o vinculo.
  Logger.log('Criando o projeto vinculado...');
  var novoProjeto = _chamarApi('post', API_SCRIPT, {
    title: NOME_PROJETO_VINCULADO,
    parentId: idPlanilha
  });

  var idNovo = novoProjeto.scriptId;
  if (!idNovo) throw new Error('A API nao devolveu o ID do projeto criado.');
  Logger.log('Projeto vinculado criado: ' + idNovo);

  // 4. Envia o codigo para o projeto novo.
  Logger.log('Enviando o codigo...');
  _chamarApi('put', API_SCRIPT + '/' + idNovo + '/content', { files: arquivos });

  var urlProjeto = 'https://script.google.com/home/projects/' + idNovo + '/edit';
  var urlPlanilha = planilha.getUrl();

  var mensagem = [
    'PRONTO. O projeto foi criado e vinculado a planilha.',
    '',
    'Planilha: ' + planilha.getName(),
    '  ' + urlPlanilha,
    'Projeto vinculado: ' + urlProjeto,
    'Arquivos copiados: ' + arquivos.length,
    '',
    'PROXIMOS PASSOS',
    '1. Abra a planilha pelo link acima e RECARREGUE a pagina (F5).',
    '2. O menu "Financeiro" deve aparecer na barra superior.',
    '3. Use Financeiro > Configuracao > Executar setup e autorize quando pedir.',
    '',
    'Voce NAO precisa abrir o editor de script: o codigo ja esta la. So volte',
    'ao editor se for cadastrar chaves de IA em Propriedades do script.',
    '',
    'Pode apagar este projeto avulso depois que confirmar que o menu apareceu.'
  ].join('\n');

  Logger.log(mensagem);
  return {
    sucesso: true,
    mensagem: mensagem,
    urlProjeto: urlProjeto,
    urlPlanilha: urlPlanilha
  };
}

// ===========================================================================
// APOIO
// ===========================================================================

/**
 * Prepara a lista de arquivos para o projeto de destino.
 *  - remove este proprio utilitario (o projeto vinculado nao precisa dele);
 *  - troca os oauthScopes do manifesto pelos do sistema, de modo que o projeto
 *    novo nao herde as permissoes amplas da migracao nem fique sem as que
 *    realmente precisa.
 *
 * @param {Array<Object>} arquivos Lista devolvida por projects.getContent.
 * @return {Array<Object>}
 * @private
 */
function _prepararArquivos(arquivos) {
  return arquivos
    .filter(function (arquivo) {
      return arquivo.name !== 'Vincular';
    })
    .map(function (arquivo) {
      var copia = {
        name: arquivo.name,
        type: arquivo.type,
        source: arquivo.source
      };

      if (arquivo.name === 'appsscript' || arquivo.type === 'JSON') {
        var manifesto;
        try {
          manifesto = JSON.parse(arquivo.source);
        } catch (e) {
          Logger.log('Aviso: manifesto ilegivel, usando o padrao.');
          manifesto = {
            timeZone: 'America/Sao_Paulo',
            dependencies: {},
            exceptionLogging: 'STACKDRIVER',
            runtimeVersion: 'V8'
          };
        }
        // Lista explicita: nao deixa passar nem as permissoes amplas da
        // migracao, nem a falta de script.container.ui.
        manifesto.oauthScopes = ESCOPOS_SISTEMA;
        manifesto.runtimeVersion = manifesto.runtimeVersion || 'V8';
        copia.source = JSON.stringify(manifesto, null, 2);
      }
      return copia;
    });
}

/**
 * Aceita tanto o ID puro quanto a URL completa da planilha.
 * @param {string} entrada
 * @return {string} ID, ou string vazia.
 * @private
 */
function _extrairIdPlanilha(entrada) {
  var texto = String(entrada || '').trim();
  if (!texto) return '';

  var naUrl = texto.match(/\/d\/([a-zA-Z0-9\-_]+)/);
  if (naUrl) return naUrl[1];

  // ID solto: letras, numeros, hifen e sublinhado, tipicamente 40+ caracteres.
  var solto = texto.match(/^[a-zA-Z0-9\-_]{20,}$/);
  return solto ? texto : '';
}

/**
 * Chama a API do Apps Script com o token do usuario logado.
 * @param {string} metodo 'get' | 'post' | 'put'
 * @param {string} url
 * @param {Object=} corpo
 * @return {Object} Resposta em JSON.
 * @private
 */
function _chamarApi(metodo, url, corpo) {
  var opcoes = {
    method: metodo,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  if (corpo) opcoes.payload = JSON.stringify(corpo);

  var resposta = UrlFetchApp.fetch(url, opcoes);
  var codigo = resposta.getResponseCode();
  var texto = resposta.getContentText();

  if (codigo >= 200 && codigo < 300) {
    return JSON.parse(texto);
  }
  throw new Error(_traduzirErroApi(codigo, texto));
}

/**
 * Converte o erro cru da API em algo acionavel.
 * @param {number} codigo
 * @param {string} texto
 * @return {string}
 * @private
 */
function _traduzirErroApi(codigo, texto) {
  var detalhe = String(texto || '').slice(0, 400);

  if (codigo === 403) {
    if (detalhe.indexOf('Apps Script API') !== -1 ||
        detalhe.indexOf('has not been used') !== -1 ||
        detalhe.indexOf('SERVICE_DISABLED') !== -1) {

      // Existem DOIS interruptores diferentes, e este erro e sempre sobre o
      // segundo. Ligar so o primeiro nao resolve.
      var projeto = (detalhe.match(/project (\d+)/) || [])[1] || '';

      return [
        'A API do Apps Script esta desativada NO PROJETO DO GOOGLE CLOUD que',
        'fica por tras deste script' + (projeto ? ' (numero ' + projeto + ')' : '') + '.',
        '',
        'ATENCAO: nao e o mesmo interruptor de script.google.com/home/usersettings.',
        'Aquele e a permissao da sua CONTA. Este e do PROJETO CLOUD, e quando um',
        'script chama a API, o Google cobra a chamada do projeto Cloud dele.',
        '',
        'TENTATIVA RAPIDA',
        projeto
          ? 'Abra e clique em ATIVAR:\nhttps://console.cloud.google.com/apis/api/script.googleapis.com/overview?project=' + projeto
          : 'Abra o link que aparece na resposta da API abaixo e clique em ATIVAR.',
        'Espere um minuto e rode de novo.',
        '',
        'SE O LINK NAO ABRIR OU DISSER QUE VOCE NAO TEM PERMISSAO',
        'O projeto Cloud deste script e um projeto oculto, criado automaticamente',
        'pelo Apps Script, e nao da para habilitar API nele. Nesse caso use o',
        'clasp, que nao depende disso: veja a secao 3.10 de docs/INSTALACAO.md.',
        '',
        'Resposta da API: ' + detalhe
      ].join('\n');
    }
    return 'Permissao negada (403). Normalmente falta um escopo no ' +
      'appsscript.json (veja o cabecalho deste arquivo) ou a conta nao tem ' +
      'acesso de edicao a planilha.\n\nResposta da API: ' + detalhe;
  }

  if (codigo === 401) {
    return 'Nao autorizado (401). Rode a funcao de novo e aceite a tela de ' +
      'permissoes. Se ja aceitou, confira os escopos no appsscript.json.\n\n' +
      'Resposta da API: ' + detalhe;
  }

  if (codigo === 404) {
    return 'Nao encontrado (404). O ID da planilha provavelmente esta errado, ' +
      'ou a conta logada nao enxerga esse arquivo.\n\nResposta da API: ' + detalhe;
  }

  if (codigo === 429 || codigo >= 500) {
    return 'A API respondeu ' + codigo + ' (instabilidade ou limite). ' +
      'Espere um minuto e tente de novo.\n\nResposta da API: ' + detalhe;
  }

  return 'A API do Apps Script respondeu ' + codigo + '.\n\nResposta: ' + detalhe;
}

/**
 * Registra e devolve a falha em formato uniforme.
 * @param {Error} erro
 * @return {{sucesso: boolean, mensagem: string}}
 * @private
 */
function _relatarFalha(erro) {
  var mensagem = 'NAO DEU CERTO.\n\n' + erro.message;
  Logger.log(mensagem);
  return { sucesso: false, mensagem: mensagem };
}

/**
 * Diagnostico: diz em qual conta este projeto esta rodando e se a API
 * do Apps Script responde. Rode isto primeiro se algo der errado.
 *
 * @return {Object}
 */
function diagnosticarAmbiente() {
  var relatorio = [];

  relatorio.push('Conta em uso: ' + (Session.getEffectiveUser().getEmail() || '(desconhecida)'));
  relatorio.push('ID deste projeto: ' + ScriptApp.getScriptId());

  var planilhaAtiva = SpreadsheetApp.getActiveSpreadsheet();
  relatorio.push('Projeto vinculado a uma planilha? ' +
    (planilhaAtiva ? 'SIM - "' + planilhaAtiva.getName() + '"' : 'NAO (projeto avulso)'));

  try {
    _chamarApi('get', API_SCRIPT + '/' + ScriptApp.getScriptId() + '/content');
    relatorio.push('API do Apps Script: OK, respondendo e com acesso a este projeto.');
  } catch (e) {
    relatorio.push('API do Apps Script: FALHOU.\n' + e.message);
  }

  var texto = relatorio.join('\n\n');
  Logger.log(texto);
  return { relatorio: texto };
}
