/**
 * CPF e CNPJ no front, a gentileza antes da garantia.
 *
 * Este arquivo é gêmeo de `supabase/functions/_shared/documento.ts`. A
 * duplicação é deliberada e vale a pena explicar, porque "não se repita" diria
 * o contrário: são dois ambientes de execução distintos (browser e Deno) sem
 * pacote compartilhado entre eles, e a alternativa, publicar um pacote npm
 * interno na fase bootstrap, custaria mais do que resolve.
 *
 * A divisão de responsabilidade é clara: aqui o objetivo é **desabilitar o
 * botão** enquanto o CPF não fecha, para o usuário não descobrir o erro depois
 * de esperar uma chamada de rede. Lá é a validação que vale. Se as duas
 * divergirem, quem manda é a de lá.
 *
 * Os testes vivem em `documento.test.ts` e cobrem os dois.
 */

export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

function digitoVerificador(base: string, pesoInicial: number): number {
  let soma = 0;
  let peso = pesoInicial;
  for (const caractere of base) {
    soma += Number(caractere) * peso;
    peso--;
    if (peso < 2) peso = 9;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(entrada: string): boolean {
  const cpf = apenasDigitos(entrada);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i);
  let resto = soma % 11;
  if ((resto < 2 ? 0 : 11 - resto) !== Number(cpf[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i);
  resto = soma % 11;
  return (resto < 2 ? 0 : 11 - resto) === Number(cpf[10]);
}

export function cnpjValido(entrada: string): boolean {
  const cnpj = apenasDigitos(entrada);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  if (digitoVerificador(cnpj.slice(0, 12), 5) !== Number(cnpj[12])) return false;
  return digitoVerificador(cnpj.slice(0, 13), 6) === Number(cnpj[13]);
}

export function documentoValido(entrada: string): boolean {
  const digitos = apenasDigitos(entrada);
  if (digitos.length === 11) return cpfValido(digitos);
  if (digitos.length === 14) return cnpjValido(digitos);
  return false;
}

/** Máscara progressiva, aplicada enquanto a pessoa digita. */
export function mascararDocumento(entrada: string): string {
  const d = apenasDigitos(entrada).slice(0, 14);

  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function mascararTelefone(entrada: string): string {
  const d = apenasDigitos(entrada).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

export function telefoneValido(entrada: string): boolean {
  const d = apenasDigitos(entrada);
  if (d.length === 10) return true;
  return d.length === 11 && d[2] === '9';
}
