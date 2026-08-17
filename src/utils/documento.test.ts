import { describe, expect, it } from 'vitest';
import {
  apenasDigitos,
  cnpjValido,
  cpfValido,
  documentoValido,
  mascararDocumento,
  mascararTelefone,
  telefoneValido,
} from './documento';

/**
 * Os CPFs e CNPJs abaixo são numericamente válidos (fecham o dígito
 * verificador) e não pertencem a ninguém — são os números de teste que a
 * própria Receita e os geradores públicos usam como exemplo.
 */
const CPF_VALIDO = '52998224725';
const CPF_VALIDO_2 = '11144477735';
const CNPJ_VALIDO = '11222333000181';

describe('cpfValido', () => {
  it('aceita CPF com dígito verificador correto', () => {
    expect(cpfValido(CPF_VALIDO)).toBe(true);
    expect(cpfValido(CPF_VALIDO_2)).toBe(true);
  });

  it('aceita com máscara', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(cpfValido('52998224726')).toBe(false);
    expect(cpfValido('11144477736')).toBe(false);
  });

  it('recusa comprimento errado', () => {
    expect(cpfValido('5299822472')).toBe(false);
    expect(cpfValido('529982247250')).toBe(false);
    expect(cpfValido('')).toBe(false);
  });

  it('recusa sequências repetidas, que passariam na conta', () => {
    // 111.111.111-11 fecha o cálculo dos dígitos mas não é CPF de ninguém.
    for (let d = 0; d <= 9; d++) {
      expect(cpfValido(String(d).repeat(11))).toBe(false);
    }
  });
});

describe('cnpjValido', () => {
  it('aceita CNPJ correto', () => {
    expect(cnpjValido(CNPJ_VALIDO)).toBe(true);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
  });

  it('recusa dígito errado', () => {
    expect(cnpjValido('11222333000182')).toBe(false);
  });

  it('recusa repetição e comprimento inválido', () => {
    expect(cnpjValido('11111111111111')).toBe(false);
    expect(cnpjValido('112223330001')).toBe(false);
  });
});

describe('documentoValido', () => {
  it('aceita os dois formatos', () => {
    expect(documentoValido(CPF_VALIDO)).toBe(true);
    expect(documentoValido(CNPJ_VALIDO)).toBe(true);
  });

  it('recusa qualquer outro comprimento', () => {
    expect(documentoValido('123')).toBe(false);
    expect(documentoValido('1234567890123')).toBe(false);
  });
});

describe('apenasDigitos', () => {
  it('remove tudo que não é número', () => {
    expect(apenasDigitos('529.982.247-25')).toBe('52998224725');
    expect(apenasDigitos('abc')).toBe('');
  });
});

describe('mascararDocumento', () => {
  it('formata CPF progressivamente', () => {
    expect(mascararDocumento('529')).toBe('529');
    expect(mascararDocumento('529982')).toBe('529.982');
    expect(mascararDocumento('52998224725')).toBe('529.982.247-25');
  });

  it('formata CNPJ quando passa de 11 dígitos', () => {
    expect(mascararDocumento('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('nunca ultrapassa 14 dígitos', () => {
    expect(apenasDigitos(mascararDocumento('1122233300018199999'))).toHaveLength(14);
  });
});

describe('telefone', () => {
  it('aceita fixo e celular', () => {
    expect(telefoneValido('1133334444')).toBe(true);
    expect(telefoneValido('11933334444')).toBe(true);
  });

  it('recusa celular de 11 dígitos sem o 9', () => {
    expect(telefoneValido('11833334444')).toBe(false);
  });

  it('mascara os dois formatos', () => {
    expect(mascararTelefone('1133334444')).toBe('(11) 3333-4444');
    expect(mascararTelefone('11933334444')).toBe('(11) 93333-4444');
  });
});
