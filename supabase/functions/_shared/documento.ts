/**
 * CPF e CNPJ, validação de dígito verificador.
 *
 * A Asaas exige documento válido para emitir cobrança e responde com erro
 * genérico quando ele não bate. Validar aqui transforma "erro inesperado no
 * provedor" (que o usuário não sabe corrigir) em "confira o CPF" (que ele sabe)
 *, e evita uma ida à API para descobrir algo que dá para saber na hora.
 *
 * É a aplicação do princípio nº 1 do CLAUDE.md na camada de cobrança:
 * prevenção de erro vale mais que mensagem de erro.
 *
 * O mesmo algoritmo roda no front (`src/utils/documento.ts`) para desabilitar o
 * botão antes do clique. O front é a gentileza; este aqui é a garantia.
 */

/** Remove tudo que não for dígito. */
export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

function digitoVerificador(base: string, pesoInicial: number): number {
  let soma = 0;
  let peso = pesoInicial;
  for (const caractere of base) {
    soma += Number(caractere) * peso;
    peso--;
    if (peso < 2) peso = 9; // usado só pelo CNPJ, onde o peso cicla 9→2
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(entrada: string): boolean {
  const cpf = apenasDigitos(entrada);
  if (cpf.length !== 11) return false;

  // 111.111.111-11 e companhia passam na conta dos dígitos, mas não são CPFs.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i);
  let resto = soma % 11;
  const d1 = resto < 2 ? 0 : 11 - resto;
  if (d1 !== Number(cpf[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i);
  resto = soma % 11;
  const d2 = resto < 2 ? 0 : 11 - resto;
  return d2 === Number(cpf[10]);
}

export function cnpjValido(entrada: string): boolean {
  const cnpj = apenasDigitos(entrada);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const d1 = digitoVerificador(cnpj.slice(0, 12), 5);
  if (d1 !== Number(cnpj[12])) return false;

  const d2 = digitoVerificador(cnpj.slice(0, 13), 6);
  return d2 === Number(cnpj[13]);
}

/** Aceita CPF ou CNPJ, com ou sem máscara. */
export function documentoValido(entrada: string): boolean {
  const digitos = apenasDigitos(entrada);
  if (digitos.length === 11) return cpfValido(digitos);
  if (digitos.length === 14) return cnpjValido(digitos);
  return false;
}

/**
 * Telefone brasileiro: 10 dígitos (fixo) ou 11 (celular, começando com 9).
 * Opcional na nossa API, a Asaas aceita cliente sem telefone.
 */
export function telefoneValido(entrada: string): boolean {
  const digitos = apenasDigitos(entrada);
  if (digitos.length === 10) return true;
  return digitos.length === 11 && digitos[2] === '9';
}
