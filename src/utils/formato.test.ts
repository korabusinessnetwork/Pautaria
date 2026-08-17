import { describe, expect, it } from 'vitest';
import {
  dataLocal,
  diasAte,
  formatarDataCurta,
  formatarPrazo,
  formatarPreco,
  iniciaisDe,
  pluralizar,
} from './formato';

const HOJE = new Date(2026, 7, 17); // 17 de agosto de 2026, meia-noite local

describe('dataLocal', () => {
  it('lê YYYY-MM-DD como data local, não UTC', () => {
    // O bug clássico: new Date('2026-08-20') volta 19/08 às 21h no Brasil.
    const data = dataLocal('2026-08-20');
    expect(data.getFullYear()).toBe(2026);
    expect(data.getMonth()).toBe(7);
    expect(data.getDate()).toBe(20);
  });

  it('ignora a parte de hora quando ela vem junto', () => {
    expect(dataLocal('2026-08-20T23:59:59Z').getDate()).toBe(20);
  });
});

describe('formatarPrazo', () => {
  it('não inventa texto quando não há prazo', () => {
    expect(formatarPrazo(null, HOJE)).toEqual({ texto: '', atrasado: false, urgente: false });
  });

  it('usa linguagem de quadro para hoje e amanhã', () => {
    expect(formatarPrazo('2026-08-17', HOJE).texto).toBe('hoje');
    expect(formatarPrazo('2026-08-17', HOJE).urgente).toBe(true);
    expect(formatarPrazo('2026-08-18', HOJE).texto).toBe('amanhã');
  });

  it('marca atraso', () => {
    const ontem = formatarPrazo('2026-08-16', HOJE);
    expect(ontem.texto).toBe('ontem');
    expect(ontem.atrasado).toBe(true);

    const semanaPassada = formatarPrazo('2026-08-10', HOJE);
    expect(semanaPassada.texto).toBe('há 7 dias');
    expect(semanaPassada.atrasado).toBe(true);
  });

  it('usa o dia da semana dentro da semana', () => {
    // 21/08/2026 é uma sexta-feira.
    expect(formatarPrazo('2026-08-21', HOJE).texto).toBe('sex');
  });

  it('usa dia e mês além da semana', () => {
    expect(formatarPrazo('2026-09-01', HOJE).texto).toBe('1 set');
  });

  it('acrescenta o ano quando não é o corrente', () => {
    expect(formatarPrazo('2027-03-04', HOJE).texto).toBe('4 mar 2027');
  });
});

describe('diasAte', () => {
  it('conta dias para frente e para trás', () => {
    expect(diasAte('2026-08-20', HOJE)).toBe(3);
    expect(diasAte('2026-08-14', HOJE)).toBe(-3);
    expect(diasAte('2026-08-17', HOJE)).toBe(0);
  });

  it('devolve nulo sem data', () => {
    expect(diasAte(null, HOJE)).toBeNull();
  });
});

describe('formatarPreco', () => {
  it('omite os centavos quando são zero', () => {
    expect(formatarPreco(2900)).toBe('R$ 29');
    expect(formatarPreco(79000)).toBe('R$ 790');
  });

  it('mostra os centavos quando existem', () => {
    expect(formatarPreco(2990)).toContain('29,90');
  });

  it('trata o gratuito', () => {
    expect(formatarPreco(0)).toBe('R$ 0');
  });
});

describe('formatarDataCurta', () => {
  it('usa o formato brasileiro', () => {
    expect(formatarDataCurta('2026-08-17')).toBe('17/08/2026');
  });

  it('devolve travessão sem data', () => {
    expect(formatarDataCurta(null)).toBe('—');
  });
});

describe('iniciaisDe', () => {
  it('usa primeiro e último nome', () => {
    expect(iniciaisDe('Matheus Bonato')).toBe('MB');
    expect(iniciaisDe('Ana Clara de Souza')).toBe('AS');
  });

  it('usa as duas primeiras letras de um nome único', () => {
    expect(iniciaisDe('Rebeca')).toBe('RE');
  });

  it('não quebra com entrada vazia', () => {
    expect(iniciaisDe('   ')).toBe('??');
  });
});

describe('pluralizar', () => {
  it('concorda em número', () => {
    expect(pluralizar(1, 'pauta')).toBe('1 pauta');
    expect(pluralizar(0, 'pauta')).toBe('0 pautas');
    expect(pluralizar(7, 'pauta')).toBe('7 pautas');
  });

  it('aceita plural irregular', () => {
    expect(pluralizar(2, 'mês', 'meses')).toBe('2 meses');
  });
});
