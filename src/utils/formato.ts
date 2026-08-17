/**
 * Formatação — dinheiro, datas e prazos, em português do Brasil.
 *
 * O prazo é o campo com mais decisão de produto por linha de código. O
 * protótipo mostra "20 ago", "hoje", "sex" — não "2026-08-20". A diferença
 * importa: alguém olhando um quadro quer saber se está atrasado, não qual é a
 * data. `formatarPrazo` responde a pergunta certa.
 */

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatarDinheiro(centavos: number): string {
  return MOEDA.format(centavos / 100);
}

/** "R$ 29" quando redondo, "R$ 29,90" quando não. Preço com ",00" polui. */
export function formatarPreco(centavos: number): string {
  if (centavos % 100 === 0) {
    return `R$ ${Math.round(centavos / 100)}`;
  }
  return MOEDA.format(centavos / 100);
}

const DIA_MS = 86_400_000;
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES_CURTOS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/**
 * Interpreta 'YYYY-MM-DD' como data local.
 *
 * `new Date('2026-08-20')` é lida como UTC e, no Brasil (UTC-3), volta como 19
 * de agosto às 21h. É o bug de fuso mais comum que existe em app brasileiro, e
 * num campo chamado "prazo" ele significa mostrar a data errada em todo card.
 */
export function dataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return new Date(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1);
}

function meiaNoite(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

export interface PrazoFormatado {
  texto: string;
  /** Venceu e não foi concluída. */
  atrasado: boolean;
  /** Vence hoje ou amanhã — merece destaque na UI. */
  urgente: boolean;
}

/**
 * Prazo em linguagem de quadro: "hoje", "amanhã", "sex", "20 ago", "há 3 dias".
 * Sem prazo devolve string vazia — e o card simplesmente não renderiza a linha,
 * como no protótipo.
 */
export function formatarPrazo(iso: string | null, referencia = new Date()): PrazoFormatado {
  if (!iso) return { texto: '', atrasado: false, urgente: false };

  const alvo = meiaNoite(dataLocal(iso));
  const hoje = meiaNoite(referencia);
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / DIA_MS);

  if (dias === 0) return { texto: 'hoje', atrasado: false, urgente: true };
  if (dias === 1) return { texto: 'amanhã', atrasado: false, urgente: true };
  if (dias === -1) return { texto: 'ontem', atrasado: true, urgente: false };

  if (dias < -1) {
    const texto = dias >= -30
      ? `há ${Math.abs(dias)} dias`
      : `${alvo.getDate()} ${MESES_CURTOS[alvo.getMonth()]}`;
    return { texto, atrasado: true, urgente: false };
  }

  // Dentro da semana, o dia da semana diz mais que a data.
  if (dias <= 6) {
    return { texto: DIAS_CURTOS[alvo.getDay()] ?? '', atrasado: false, urgente: false };
  }

  const mesmoAno = alvo.getFullYear() === hoje.getFullYear();
  const texto = mesmoAno
    ? `${alvo.getDate()} ${MESES_CURTOS[alvo.getMonth()]}`
    : `${alvo.getDate()} ${MESES_CURTOS[alvo.getMonth()]} ${alvo.getFullYear()}`;

  return { texto, atrasado: false, urgente: false };
}

/** Data por extenso curta: "20 de agosto de 2026". Usada em cobrança. */
const DATA_LONGA = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatarDataLonga(iso: string | null): string {
  if (!iso) return '—';
  const data = iso.length <= 10 ? dataLocal(iso) : new Date(iso);
  return DATA_LONGA.format(data);
}

/** "17/08/2026" — para tabelas de cobrança, onde a coluna é estreita. */
export function formatarDataCurta(iso: string | null): string {
  if (!iso) return '—';
  const data = iso.length <= 10 ? dataLocal(iso) : new Date(iso);
  return data.toLocaleDateString('pt-BR');
}

/** Quantos dias faltam (negativo = já passou). */
export function diasAte(iso: string | null, referencia = new Date()): number | null {
  if (!iso) return null;
  const alvo = meiaNoite(iso.length <= 10 ? dataLocal(iso) : new Date(iso));
  const hoje = meiaNoite(referencia);
  return Math.round((alvo.getTime() - hoje.getTime()) / DIA_MS);
}

/** Iniciais de exibição a partir de um nome. Espelha o trigger do banco (0002). */
export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeiro = partes[0];
  if (!primeiro) return '??';
  if (partes.length === 1) return primeiro.slice(0, 2).toUpperCase();

  const ultimo = partes[partes.length - 1] ?? primeiro;
  return (primeiro.slice(0, 1) + ultimo.slice(0, 1)).toUpperCase();
}

/** Plural sem gambiarra de template: `pluralizar(1, 'pauta')` → "1 pauta". */
export function pluralizar(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
