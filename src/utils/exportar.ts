/**
 * Exportação de pautas para CSV.
 *
 * Função pura: entra dado de domínio, sai uma string. Quem transforma isso em
 * download (Blob, `URL.createObjectURL`, âncora clicada) é o componente — assim
 * o formato do arquivo pode ser testado sem DOM, e é onde mora a parte que
 * realmente pode dar errado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OS TRÊS PROBLEMAS QUE ESTE ARQUIVO RESOLVE
 *
 * 1. **Injeção de fórmula (CSV injection).** Um título de pauta que começa com
 *    `=`, `+`, `-` ou `@` deixa de ser texto quando o arquivo abre no Excel ou
 *    no Sheets: vira fórmula executável. `=HYPERLINK("http://…"&A1)` exfiltra a
 *    planilha inteira com um clique do usuário; `=cmd|'/c calc'!A1` chega a
 *    executar comando no Windows via DDE. É vetor de ataque real e catalogado
 *    (OWASP "CSV Injection"), e o Pautaria é multi-tenant: o título vem de uma
 *    pessoa e o arquivo é aberto por outra. A defesa é prefixar com aspa
 *    simples — a planilha passa a tratar a célula como texto e não mostra a
 *    aspa. Aspas em volta do campo **não** resolvem: elas são sintaxe de CSV,
 *    consumida no parse, e a fórmula chega intacta na célula.
 *
 * 2. **Escape.** Aspas, vírgulas e quebras de linha dentro de um campo quebram
 *    o arquivo se saírem cruas. Aqui todo campo sai entre aspas, sempre (ver
 *    `celula`).
 *
 * 3. **Acentuação.** Sem BOM, o Excel no Windows lê o arquivo como Latin-1 e
 *    "Revisão" vira "RevisÃ£o". Três bytes no começo do arquivo resolvem.
 *
 * Os cabeçalhos vêm do **ofício** (`campo1Label`, `campo2Label`) — "Canal",
 * "Sprint", "Contexto". Nenhum rótulo fixo aqui dentro: um ofício novo é uma
 * linha em `oficios`, e a exportação acompanha sem tocar neste arquivo.
 */

import { formatarDataCurta } from './formato';

/** O que a exportação precisa saber de uma pauta. `Pauta` satisfaz isto. */
export interface PautaExportavel {
  titulo: string;
  campo1: string | null;
  campo2: string | null;
  prazo: string | null;
  etapaId: string;
  responsavelId: string | null;
}

/** O que a exportação precisa saber do ofício. `Oficio` satisfaz isto. */
export interface OficioExportavel {
  campo1Label: string;
  campo2Label: string;
  solo: boolean;
  etapas: ReadonlyArray<{ id: string; nome: string }>;
}

/** O que a exportação precisa saber de uma pessoa. `Membro` satisfaz isto. */
export interface PessoaExportavel {
  userId: string;
  nome: string;
}

export interface EntradaCsv {
  pautas: ReadonlyArray<PautaExportavel>;
  oficio: OficioExportavel;
  /** Sem membros (ou em ofício solo) a coluna de responsável nem existe. */
  membros?: ReadonlyArray<PessoaExportavel>;
  /**
   * Separador de campo. O padrão é a vírgula do RFC 4180, que é o que Sheets,
   * LibreOffice e Numbers abrem direto. O Excel em pt-BR usa ponto e vírgula
   * como separador de lista e joga tudo numa coluna só — por isso o parâmetro
   * existe, para quando a UI quiser oferecer a escolha.
   */
  separador?: string;
}

/** Byte order mark — o que faz o Excel entender que o arquivo é UTF-8. */
const BOM = '\uFEFF';

/** RFC 4180 pede CRLF entre registros, e é o que o Excel espera. */
const FIM_DE_LINHA = '\r\n';

/**
 * Caracteres que abrem fórmula numa planilha. TAB e CR entram na lista porque
 * o Excel os descarta antes de avaliar a célula — `\t=1+1` é fórmula.
 */
const ABRE_FORMULA = /^[=+\-@\t\r]/;

/**
 * Desarma a célula como fórmula sem alterar o que a pessoa lê.
 *
 * A aspa simples é a convenção que Excel, Sheets e LibreOffice compartilham
 * para "isto é texto literal": ela é consumida na exibição, então "-3" continua
 * aparecendo como -3 na planilha. O preço é que a aspa **aparece** se o arquivo
 * for lido como texto puro. Trocamos essa estranheza por não executar código de
 * terceiro na máquina de quem abre o arquivo — não é um empate difícil.
 */
function neutralizarFormula(valor: string): string {
  return ABRE_FORMULA.test(valor) ? `'${valor}` : valor;
}

/**
 * Um campo pronto para o arquivo.
 *
 * Todo campo sai entre aspas, mesmo quando não precisaria. Citar
 * condicionalmente é uma otimização de bytes que troca correção por estética:
 * basta alguém mudar o separador, ou um título ganhar uma vírgula, para o
 * arquivo quebrar num caso e não no outro. Citando sempre, o resultado não
 * depende do conteúdo.
 */
function celula(valor: string | null | undefined): string {
  // Quebras de linha viram \n dentro do campo citado: CRLF cru aqui é legal
  // pelo RFC, mas alguns parsers tratam o \r como parte do texto e ele
  // reaparece como caractere invisível na célula.
  const texto = (valor ?? '').replace(/\r\n?/g, '\n');
  const seguro = neutralizarFormula(texto);
  return `"${seguro.replace(/"/g, '""')}"`;
}

/**
 * Gera o CSV das pautas.
 *
 * As linhas saem na ordem das etapas do ofício (a mesma ordem das colunas do
 * quadro), preservando a ordem recebida dentro de cada etapa — quem exporta
 * espera reencontrar o quadro na planilha, não uma lista embaralhada.
 */
export function gerarCsvPautas({
  pautas,
  oficio,
  membros = [],
  separador = ',',
}: EntradaCsv): string {
  const nomeDaEtapa = new Map(oficio.etapas.map((e) => [e.id, e.nome]));
  const nomeDaPessoa = new Map(membros.map((m) => [m.userId, m.nome]));

  // Ofício solo esconde responsável por definição — a coluna não fica vazia,
  // ela não existe. Mesma regra que a Topbar aplica aos avatares.
  const comResponsavel = !oficio.solo && membros.length > 0;

  const cabecalho = [
    'Etapa',
    'Título',
    oficio.campo1Label,
    oficio.campo2Label,
    'Prazo',
    ...(comResponsavel ? ['Responsável'] : []),
  ];

  const ordemDaEtapa = new Map(oficio.etapas.map((e, i) => [e.id, i]));
  const ordenadas = [...pautas].sort(
    (a, b) =>
      (ordemDaEtapa.get(a.etapaId) ?? Number.MAX_SAFE_INTEGER) -
      (ordemDaEtapa.get(b.etapaId) ?? Number.MAX_SAFE_INTEGER),
  );

  const linhas = ordenadas.map((pauta) =>
    [
      nomeDaEtapa.get(pauta.etapaId) ?? '',
      pauta.titulo,
      pauta.campo1,
      pauta.campo2,
      // Campo sem prazo sai vazio, não com o travessão que a UI usa: numa
      // planilha "—" é conteúdo e atrapalha filtro e ordenação.
      pauta.prazo ? formatarDataCurta(pauta.prazo) : '',
      ...(comResponsavel ? [nomeDaPessoa.get(pauta.responsavelId ?? '') ?? ''] : []),
    ]
      .map(celula)
      .join(separador),
  );

  // Quadro vazio ainda gera o cabeçalho: um arquivo com as colunas certas e
  // nenhuma linha diz "não há pautas"; um arquivo de zero byte parece defeito.
  return BOM + [cabecalho.map(celula).join(separador), ...linhas].join(FIM_DE_LINHA);
}

/**
 * Nome de arquivo previsível: `pauta-de-conteudo-2026-08-24.csv`.
 *
 * Sem acento e sem espaço porque o arquivo vai parar em Windows, em anexo de
 * e-mail e em linha de comando, e cada um estropia esses caracteres do seu
 * jeito. A data no nome é o que permite guardar duas exportações do mesmo
 * quadro na mesma pasta sem uma sobrescrever a outra.
 */
export function nomeArquivoCsv(titulo: string, referencia = new Date()): string {
  const base = titulo
    .normalize('NFD')
    // Remove os diacríticos separados pelo NFD: "ção" → "cao".
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const ano = referencia.getFullYear();
  const mes = String(referencia.getMonth() + 1).padStart(2, '0');
  const dia = String(referencia.getDate()).padStart(2, '0');

  return `${base || 'pautas'}-${ano}-${mes}-${dia}.csv`;
}
